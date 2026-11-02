// IA local: pedidos que modifican el diagrama (sin inventar clases).
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  aplicarOperaciones, descartarInventos, interpretar, interpretarSobreElDiagrama,
} = await import('../src/ia-local/interpreteOrdenes.js');
const { copiaUnEjemplo, limpiarRespuesta } = await import('../src/ia-local/promptOrdenes.js');

const clase = (nombre, attributes = []) => ({ id: nombre, type: 'classNode', position: { x: 0, y: 0 }, data: { className: nombre, attributes, methods: [] } });
const diagrama = () => [clase('paradas', ['- id: int', '- nombre: string']), clase('chofer'), clase('Lineas'), clase('detalle venta', ['- Subtotal: double'])];
const PEDIDO = 'puedes modificar el diagrama para que los títulos de cada clase tengan la primera letra en mayúscula';

test('«primera letra en mayúscula» renombra las clases sin modelo', () => {
  const ops = interpretarSobreElDiagrama(PEDIDO, diagrama());
  assert.ok(ops, 'el pedido se reconoce');
  const { nodes, cambios } = aplicarOperaciones(ops, { nodes: diagrama(), edges: [] });
  assert.equal(cambios, 3);
  assert.deepEqual(nodes.map((n) => n.data.className), ['Paradas', 'Chofer', 'Lineas', 'DetalleVenta']);
  assert.deepEqual(nodes[0].data.attributes, ['- id: int', '- nombre: string'], 'los atributos no se tocan');
});

test('si ya estaban en mayúscula no hay nada que cambiar; otros pedidos no se toman', () => {
  assert.deepEqual(interpretarSobreElDiagrama('pon en mayúscula los nombres de las clases', [clase('Cliente'), clase('Pedido')]), []);
  assert.equal(interpretarSobreElDiagrama('agrega la clase Proveedor', diagrama()), null);
  assert.equal(interpretarSobreElDiagrama('explícame la herencia', diagrama()), null);
});

test('«atributos en minúscula» corrige los que empiezan con mayúscula', () => {
  const ops = interpretarSobreElDiagrama('deja los atributos en minúscula', diagrama());
  const { nodes } = aplicarOperaciones(ops, { nodes: diagrama(), edges: [] });
  assert.match(nodes[3].data.attributes[0], /subtotal/);
});

test('lo que un modelo chico copia del ejemplo del prompt no llega al diagrama', () => {
  // Lo que respondió llama3.2:3b al pedido de las mayúsculas: la tienda del ejemplo
  const respuesta = `clase Cliente: nombre texto, email texto
clase ClientePremium: descuento decimal
clase Pedido: fecha fecha y hora, total decimal
clase LineaPedido: cantidad entero, precio decimal
herencia ClientePremium de Cliente
relacion Cliente 1 a muchos Pedido "realiza"
composicion Pedido de LineaPedido`;
  const { operaciones } = interpretar(limpiarRespuesta(respuesta));
  const r = descartarInventos(operaciones, PEDIDO, diagrama());
  assert.equal(r.operaciones.length, 0);
  assert.equal(r.descartadas, operaciones.length);
});

test('se reconoce cuando el modelo repite un ejemplo del prompt, aunque el diagrama tenga Cliente y Pedido', () => {
  const copia = limpiarRespuesta('clase Cliente: Nombre Texto, Email Texto\nclase Pedido: fecha fecha y hora, total decimal\nrelacion Cliente 1 a muchos Pedido "realiza"\nrelacion Pedido de LineaPedido "forma parte de"');
  assert.equal(copiaUnEjemplo(copia), true);
  assert.equal(copiaUnEjemplo('renombra la clase chofer a Chofer\nrenombra la clase paradas a Paradas'), false);
  assert.equal(copiaUnEjemplo('clase Cliente: nombre texto, email texto'), false, 'una sola línea igual no alcanza');
});

test('el modelo no borra si no se pidió ni toca clases que el pedido no nombra', () => {
  // Dos respuestas reales de llama3.2:3b a «cambia el nombre de chofer a conductor»
  const pedido = 'cambia el nombre de chofer a conductor';
  const mala = interpretar('elimina la clase chofer\nrenombra la clase paradas a Estaciones\nrenombra la clase lineas a Rutas\nrenombra la clase Pedido a Traslado').operaciones;
  assert.deepEqual(descartarInventos(mala, pedido, diagrama()).operaciones, []);
  const buena = interpretar('elimina el atributo nombre de Chofer\nrenombra la clase Chofer a Conductor').operaciones;
  assert.deepEqual(descartarInventos(buena, pedido, diagrama()).operaciones.map((o) => o.op), ['renombrarClase']);
  const borrar = interpretar('elimina la clase chofer').operaciones;
  assert.equal(descartarInventos(borrar, 'quita la clase chofer', diagrama()).operaciones.length, 1, 'si se pide borrar, se borra');
});

test('sí quedan los cambios sobre clases existentes o nombradas, y todo si el pedido pide crear', () => {
  const { operaciones } = interpretar('renombra la clase chofer a Conductor\nrelacion Conductor 1 a muchos Viaje\nclase Inventada: x texto');
  const r = descartarInventos(operaciones, 'cambia chofer por Conductor; cada conductor hace muchos viajes', diagrama());
  assert.deepEqual(r.operaciones.map((o) => o.op), ['renombrarClase', 'relacion']);
  assert.equal(r.descartadas, 1);
  const tienda = interpretar('clase Cliente: nombre texto\nclase Pedido: total decimal').operaciones;
  assert.equal(descartarInventos(tienda, 'crea un diagrama de una tienda online', []).operaciones.length, 2);
});
