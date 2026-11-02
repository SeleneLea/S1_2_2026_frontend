// Código Spring Boot -> diagrama (utils/importarCodigo.js): sincronización en los dos sentidos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compararConDiagrama, diagramaDesdeModelo, modeloDesdeJava, rutaApiDe, tipoDelDiagrama } from '../src/utils/importarCodigo.js';

const java = (ruta, contenido) => ({ ruta, contenido });
const CLIENTE = java('entities/Cliente.java', `
package com.example.demo.entities;
import jakarta.persistence.*;
/** Un cliente de la tienda. */
@Entity
@Table(name = "cliente")
public class Cliente {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "nombre", nullable = false)
    private String nombre;
    @Column(name = "correo", nullable = false, unique = true)
    private String correo; // nuevo en el código
    @OneToMany(mappedBy = "cliente", fetch = FetchType.LAZY)
    @JsonIgnoreProperties(value = {"cliente", "hibernateLazyInitializer"}, allowSetters = true)
    private List<Pedido> pedidos = new ArrayList<>();
    public static final String TABLA = "cliente";
    public Long getId() { return id; }
    public void setNombre(String nombre) { if (nombre != null) { this.nombre = nombre.trim(); } }
}`);
const PEDIDO = java('entities/Pedido.java', `
@Entity
public class Pedido {
    @Id @GeneratedValue private Long id;
    @Column(nullable = false) private LocalDate fecha;
    private BigDecimal total;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cliente_id", nullable = false)
    private Cliente cliente;
    @ManyToMany
    @JoinTable(name = "pedido_producto")
    private Set<Producto> productos = new HashSet<>();
    @Transient private int calculado;
}`);
const PRODUCTO = java('entities/Producto.java', `
@Entity public class Producto extends Articulo {
    @Column(nullable = false) private String nombre;
    @ManyToMany(mappedBy = "productos") private Set<Pedido> pedidos;
}`);
const ARTICULO = java('entities/Articulo.java', `
@Entity @Inheritance(strategy = InheritanceType.JOINED)
public abstract class Articulo { @Id @GeneratedValue private Long id; private Double precio; }`);
const USUARIO_GENERADO = java('entities/Usuario.java', `
/**
 * Cuenta para entrar al sistema. El rol sale de las clases de personas del diagrama.
 */
@Entity public class Usuario { @Id private Long id; private String correo; private String clave; private String rol; }`);
const NO_ENTIDAD = java('dto/ClienteDTO.java', 'public class ClienteDTO { private Long id; private String nombre; }');

const clase = (id, className, attributes = [], extra = {}) => ({ id, type: 'classNode', position: { x: 0, y: 0 }, data: { className, attributes, methods: ['registrar(): void'], ...extra } });
const DIAGRAMA = {
  nodes: [
    clase('cli', 'Cliente', ['id: Long', 'nombre: string', 'telefono: string']),
    clase('ped', 'Pedido', ['id', 'fecha: Date', 'total: decimal']),
    clase('vieja', 'Factura', ['id: Long', 'numero: String']),
    { id: 'nota', type: 'noteNode', data: { text: 'hola' } },
  ],
  edges: [{ id: 'r1', source: 'cli', target: 'ped', type: 'umlEdge', data: { type: 'Composition', startLabel: '1', endLabel: '1..*' } }],
};

test('lee solo las entidades: atributos con tipo, relaciones JPA y herencia; ignora DTO, cuenta de acceso y lo transitorio', () => {
  const m = modeloDesdeJava([CLIENTE, PEDIDO, PRODUCTO, ARTICULO, USUARIO_GENERADO, NO_ENTIDAD]);
  assert.deepEqual(m.clases.map((c) => c.nombre).sort(), ['Articulo', 'Cliente', 'Pedido', 'Producto']);
  const pedido = m.clases.find((c) => c.nombre === 'Pedido');
  assert.deepEqual(pedido.atributos.map((a) => `${a.nombre}:${a.tipo}`), ['id:Long', 'fecha:Date', 'total:BigDecimal']);
  assert.equal(m.clases.find((c) => c.nombre === 'Articulo').abstracta, true);
  const rels = m.relaciones.map((r) => `${r.tipo} ${r.origen}[${r.inicio || ''}]-[${r.fin || ''}]${r.destino}`).sort();
  assert.deepEqual(rels, [
    'Association Cliente[1]-[*]Pedido',
    'Association Pedido[*]-[*]Producto',
    'Generalization Producto[]-[]Articulo',
  ]);
  assert.equal(tipoDelDiagrama('java.time.LocalDateTime'), 'DateTime');
});

test('con el diagrama: solo las diferencias reales, conservando cómo está dibujado lo que es igual', () => {
  const m = modeloDesdeJava([CLIENTE, PEDIDO, PRODUCTO, ARTICULO]);
  const r = compararConDiagrama(DIAGRAMA, m);
  const cliente = r.nodos.find((n) => n.id === 'cli');
  // "nombre: string" se deja como estaba (mismo tipo Java); "telefono" ya no está; "correo" es nuevo
  assert.deepEqual(cliente.data.attributes, ['id: Long', 'nombre: string', 'correo: String {unico}']);
  assert.deepEqual(cliente.data.methods, ['registrar(): void'], 'los métodos del diagrama se conservan');
  assert.ok(!r.nodos.some((n) => n.id === 'ped'), 'Pedido no cambió ("id" sin tipo = Long, "decimal" = BigDecimal)');
  assert.ok(!r.aristas.some((e) => e.id === 'r1'), 'la composición 1..* coincide con el @ManyToOne obligatorio');
  const nuevas = r.nodos.filter((n) => n.id.startsWith('codigo-')).map((n) => n.data.className).sort();
  assert.deepEqual(nuevas, ['Articulo', 'Producto']);
  assert.equal(r.nodos.find((n) => n.data.className === 'Articulo').data.stereotype, 'abstract');
  assert.equal(r.aristas.filter((e) => e.data.type === 'Generalization').length, 1);
  assert.ok(r.aristas.some((e) => e.data.startLabel === '*' && e.data.endLabel === '*'), 'muchos a muchos Pedido—Producto');
  assert.deepEqual(r.quitarNodos, [], 'sin pedirlo no se quita nada');
  assert.ok(r.estado.nodes.some((n) => n.id === 'vieja'));
  assert.equal(r.cantidad, r.resumen.length);
});

test('si se pide, quita las clases y relaciones que ya no están en el código (no las notas)', () => {
  const m = modeloDesdeJava([CLIENTE, PEDIDO]);
  const r = compararConDiagrama({ ...DIAGRAMA, edges: [...DIAGRAMA.edges, { id: 'r2', source: 'ped', target: 'cli', type: 'umlEdge', data: { type: 'Association', startLabel: '*', endLabel: '*' } }] }, m, { quitarAusentes: true });
  assert.deepEqual(r.quitarNodos, ['vieja']);
  assert.deepEqual(r.quitarAristas, ['r2']);
  assert.ok(r.estado.nodes.some((n) => n.id === 'nota'), 'la nota se queda');
  assert.ok(!r.estado.nodes.some((n) => n.id === 'vieja'));
});

test('clase de asociación del generador (dos claves con par único) y un 1 a 1 real', () => {
  const plan = java('Plan.java', `
@Entity
@Table(name = "plan", uniqueConstraints = {@UniqueConstraint(columnNames = {"ejercicio_id", "objetivo_id"})})
public class Plan {
  @Id @GeneratedValue private Long id;
  private Integer series;
  @ManyToOne(optional = false) @JoinColumn(name = "ejercicio_id", nullable = false) private Ejercicio ejercicio;
  @ManyToOne(optional = false) @JoinColumn(name = "objetivo_id", nullable = false) private Objetivo objetivo;
}`);
  const ejercicio = java('Ejercicio.java', '@Entity public class Ejercicio { @Id private Long id; private String nombre; }');
  const objetivo = java('Objetivo.java', `@Entity public class Objetivo { @Id private Long id;
    @ManyToOne @JoinColumn(name = "ficha_id", unique = true) private Ficha ficha; }`);
  const ficha = java('Ficha.java', '@Entity public class Ficha { @Id private Long id; }');
  const m = modeloDesdeJava([plan, ejercicio, objetivo, ficha]);
  const asociacion = m.relaciones.find((r) => r.claseAsociacion);
  assert.deepEqual([asociacion.origen, asociacion.destino, asociacion.claseAsociacion], ['Ejercicio', 'Objetivo', 'Plan']);
  assert.ok(m.relaciones.some((r) => r.origen === 'Ficha' && r.fin === '1'), 'unique = true es un 1 a 1');
  const tablero = diagramaDesdeModelo(m);
  const relacion = tablero.edges.find((e) => e.data.hasAssociationClass);
  const planNodo = tablero.nodes.find((n) => n.data.className === 'Plan');
  assert.equal(relacion.data.associationClassNodeId, planNodo.id);
  assert.equal(planNodo.data.isAssociationClass, true);
  assert.ok(tablero.edges.some((e) => e.data.isAssociationConnection && e.data.parentRelationId === relacion.id), 'con su línea punteada');
  assert.ok(new Set(tablero.nodes.map((n) => `${n.position.x},${n.position.y}`)).size === tablero.nodes.length, 'cada clase en su lugar');
});

test('sin entidades avisa', () => {
  const m = modeloDesdeJava([NO_ENTIDAD]);
  assert.equal(m.clases.length, 0);
  assert.match(m.avisos[0], /No se encontraron clases @Entity/);
});

test('rutas de la API: cada entidad toma la de su controlador, no la de los de infraestructura', () => {
  const controlador = (nombre, ruta, cuerpo = '') => java(`controllers/${nombre}.java`, `
package com.example.demo.controllers;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping(${ruta})
public class ${nombre} { ${cuerpo} }`);
  const archivos = [
    CLIENTE, PEDIDO,
    // De infraestructura: nombra a Cliente (la cuenta), pero no es su API
    controlador('AuthController', '"/api/auth"', 'private ClienteRepository clientes; private ClienteService a; private ClienteDTO b;'),
    controlador('ClienteController', 'value = "/api/v1/clientes"', 'private ClienteService servicio;'),
    // Sin el nombre exacto: se reconoce por el servicio que usa
    controlador('VentasController', 'path = "/pedidos"', 'private PedidoService servicio; private PedidoDTO dto;'),
  ];
  const m = modeloDesdeJava(archivos);
  assert.deepEqual(m.rutas, { Cliente: '/api/v1/clientes', Pedido: '/pedidos' });
  assert.equal(rutaApiDe(m.rutas.Cliente), 'v1/clientes');
  assert.equal(rutaApiDe('/pedidos/'), 'pedidos');
  assert.ok(m.avisos.some((a) => /Pedido \(\/pedidos\)/.test(a)), 'avisa de la ruta fuera de /api');
  const { nodes } = diagramaDesdeModelo(m);
  assert.deepEqual(Object.fromEntries(nodes.map((n) => [n.data.className, n.data.rutaApi])), { Cliente: 'v1/clientes', Pedido: 'pedidos' });
  // Sin controladores, las clases no llevan ruta propia (usan la de la herramienta)
  assert.ok(diagramaDesdeModelo(modeloDesdeJava([CLIENTE])).nodes.every((n) => n.data.rutaApi === undefined));
});
