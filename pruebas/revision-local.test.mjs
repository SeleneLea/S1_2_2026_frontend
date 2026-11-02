// Depuración con IA local: revisar el diagrama sin internet (reglas fijas + Ollama si está).
import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramaEnTexto, leerAtributo, revisarDiagrama } from '../src/utils/revisionLocal.js';
import { observacionesDelModelo, mensajesRevision } from '../src/ia-local/revisionLocal.js';
import { pideRevision, respuestaDeRevisionLocal } from '../src/utils/respuestaIALocal.js';
import { extraerJSON } from '../src/utils/jsonIA.js';

const clase = (id, className, attributes = [], extra = {}) => ({ id, type: 'classNode', position: { x: 0, y: 0 }, data: { className, attributes, methods: [], ...extra } });
const rel = (id, source, target, type = 'Association', startLabel = '1', endLabel = '*', extra = {}) => ({ id, source, target, type: 'umlEdge', data: { type, startLabel, endLabel, ...extra } });
const textos = (r, clase) => r.observaciones.filter((o) => o.clase === clase).map((o) => o.texto).join(' | ');

test('un diagrama correcto no tiene observaciones', () => {
  const r = revisarDiagrama(
    [clase('c', 'Cliente', ['id: Long', 'nombre: String']), clase('v', 'Venta', ['id: Long', 'fecha: Date', 'total: decimal'])],
    [rel('r', 'c', 'v')],
  );
  assert.deepEqual(r.observaciones, []);
  assert.equal(r.clases, 2);
});

test('encuentra los errores típicos y dice cómo corregirlos, marcando la clase', () => {
  const nodes = [
    clase('a', 'Cliente', ['id: Long', 'nombre: String', 'nombre: String', 'edad: entero']),
    clase('b', 'Cliente', ['id: Long']),
    clase('c', 'pedido', ['id: Long', 'order: Date', 'Total: Double']),
    clase('d', 'Producto', []),
    clase('e', 'Día', ['id: Long', 'nombre']),
    clase('f', 'Padre', ['id: Long', 'nombre: String']),
    clase('g', 'Hijo', ['nombre: String']),
  ];
  const edges = [
    rel('r1', 'a', 'c', 'Association', '', '*'),
    rel('r2', 'c', 'd', 'Composition', '*', '*'),
    rel('r3', 'g', 'f', 'Generalization', '', ''),
    rel('r4', 'f', 'g', 'Generalization', '', ''),
  ];
  const r = revisarDiagrama(nodes, edges);
  assert.ok(r.total.error >= 3);
  assert.match(textos(r, 'Cliente'), /Hay 2 clases llamadas «Cliente»/);
  assert.match(textos(r, 'Cliente'), /repite el atributo «nombre»/);
  assert.match(textos(r, 'Cliente'), /tipo desconocido: «entero»/);
  assert.match(textos(r, 'Cliente'), /no tiene cardinalidad/);
  assert.match(textos(r, 'pedido'), /empieza con minúscula/);
  assert.match(textos(r, 'pedido'), /palabra reservada/);
  assert.match(textos(r, 'pedido'), /composición .* tiene cardinalidad «\*»/);
  assert.match(textos(r, 'Producto'), /no tiene atributos/);
  assert.match(textos(r, 'Día'), /tildes/);
  assert.match(textos(r, 'Día'), /«nombre» de «Día» no tiene tipo/);
  assert.match(textos(r, 'Hijo'), /forma un ciclo/);
  assert.match(textos(r, 'Hijo'), /repite el atributo «nombre», que ya hereda/);
  assert.ok(r.observaciones.every((o) => o.nodoId && /Cómo corregir:/.test(o.texto)));
  assert.equal(r.observaciones[0].gravedad, 'error', 'primero los errores');
});

test('las relaciones con clase de asociación, interfaces y notas no dan falsos avisos', () => {
  const nodes = [
    clase('a', 'Alumno', ['id: Long']), clase('c', 'Curso', ['id: Long']),
    clase('i', 'Inscripcion', ['nota: Double'], { isAssociationClass: true, associatedEdgeId: 'r' }),
    clase('x', 'Imprimible', [], { stereotype: 'interface' }),
    { id: 'n', type: 'noteNode', data: { text: 'nota' } },
  ];
  const r = revisarDiagrama(nodes, [rel('r', 'a', 'c', 'Association', '*', '*', { hasAssociationClass: true, associationClassNodeId: 'i' })]);
  assert.equal(textos(r, 'Inscripcion'), '', 'la clase de asociación no está suelta');
  assert.doesNotMatch(textos(r, 'Imprimible'), /no tiene atributos/);
  const sinRelacion = revisarDiagrama([nodes[0], nodes[1], nodes[2]], []);
  assert.match(textos(sinRelacion, 'Inscripcion'), /su relación ya no existe/);
});

test('el modelo local solo suma observaciones de clases que existen y el JSON con \\* se lee', () => {
  const nodes = [clase('c', 'Cliente', ['id: Long']), clase('v', 'Venta', ['id: Long'])];
  const respuesta = extraerJSON('```json\n{"texto":"ok","observaciones":[{"clase":"cliente","gravedad":"aviso","texto":"Falta el correo. Cómo corregir: agrega correo: String (1..\\*)"},{"clase":"Inventada","gravedad":"error","texto":"x"}]}\n```');
  const obs = observacionesDelModelo(respuesta, nodes);
  assert.equal(obs.length, 1);
  assert.equal(obs[0].nodoId, 'c');
  assert.match(obs[0].texto, /1\.\.\*/);
  const msgs = mensajesRevision(nodes, [], [{ clase: 'Venta', texto: 'sin atributos' }]);
  assert.match(msgs[1].content, /Ya detectado por las reglas/);
  assert.match(diagramaEnTexto(nodes, [rel('r', 'c', 'v')]), /Association Cliente \[1\] — \[\*\] Venta/);
});

test('cuándo un pedido es una revisión, y cómo responde', () => {
  for (const t of ['Revisa el diagrama completo y dime qué corregir', 'verifica el diagrama', '¿qué está mal?', 'busca errores', 'depura el modelo']) assert.equal(pideRevision(t), true, t);
  for (const t of ['agrega la clase Producto con nombre y precio', 'un cliente realiza muchas ventas']) assert.equal(pideRevision(t), false, t);
  const r = respuestaDeRevisionLocal({ clases: 2, observaciones: [{ clase: 'A', nodoId: 'a', gravedad: 'error', texto: 'x' }], total: { error: 1, aviso: 0, sugerencia: 0 }, motor: 'reglas' });
  assert.match(r.texto, /1 error, 0 avisos, 0 sugerencias/);
  assert.match(r.texto, /deja Ollama listo/);
  assert.equal(r.datos.tipoRespuesta, 'revision');
  assert.equal(r.datos.observaciones.length, 1);
  assert.deepEqual(leerAtributo('- precio: Double {min=0}'), { nombre: 'precio', tipo: 'Double' });
});

test('lo que el modelo repite con otras palabras no se duplica; lo nuevo sí se suma', async () => {
  const { sinRepetirReglas, temaDe } = await import('../src/ia-local/revisionLocal.js');
  const reglas = [
    { clase: 'Cliente', nodoId: 'cli', texto: '«Cliente» repite el atributo «nombre».' },
    { clase: 'producto', nodoId: 'prod', texto: '«producto» no tiene atributos.' },
    { clase: 'Cliente', nodoId: 'cli', texto: 'La relación «Cliente — Venta» no tiene cardinalidad en un extremo.' },
  ];
  // Respuestas reales de qwen2.5:7b en la prueba del navegador
  const delModelo = [
    { clase: 'producto', nodoId: 'prod', texto: "La clase 'producto' no tiene atributos ni comportamiento." },
    { clase: 'Cliente', nodoId: 'cli', texto: "El atributo 'nombre' se repite." },
    { clase: 'Venta', nodoId: 'ven', texto: "Falta especificar la cardinalidad en la relación 'Cliente — Venta'." },
    { clase: 'Venta', nodoId: 'ven', texto: 'Venta debería tener un total para facturar.' },
  ];
  assert.deepEqual(sinRepetirReglas(delModelo, reglas).map((o) => o.texto), ['Venta debería tener un total para facturar.']);
  assert.equal(temaDe('Se recomienda cambiar a PascalCase'), 'mayusculas');
});
