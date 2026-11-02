// IA local unificada en el chat: lo hecho sin conexión se comparte al volver.
import test from 'node:test';
import assert from 'node:assert/strict';

// localStorage de mentira (en Node no existe)
const almacen = new Map();
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => { almacen.set(k, String(v)); },
  removeItem: (k) => { almacen.delete(k); },
};

const { Sincronia } = await import('../src/utils/sincronia.js');
const {
  comoMensaje, guardarCopiaChat, guardarPendientes, leerCopiaChat, leerPendientes, nuevoIdLocal, paraSubir, quitarAceptados,
} = await import('../src/utils/chatSinConexion.js');
const { respuestaDeIALocal, respuestaDeImagenLocal } = await import('../src/utils/respuestaIALocal.js');

const clase = (id, nombre = id) => ({ id, type: 'classNode', position: { x: 0, y: 0 }, data: { className: nombre, attributes: [], methods: [] } });

test('los cambios de la IA local van en una tanda propia, marcada y sellada', () => {
  const s = new Sincronia();
  s.local([{ op: 'ponerNodo', nodo: clase('A') }]); // a mano
  s.local([{ op: 'ponerNodo', nodo: clase('B') }], { origen: 'ia-local' }); // la IA local
  s.local([{ op: 'ponerNodo', nodo: clase('C') }]); // a mano otra vez: no se mezcla con la de la IA
  assert.deepEqual(s.pendientes.map((l) => [l.ops.map((o) => o.nodo.id).join(), l.origen || 'mano']), [['A', 'mano'], ['B', 'ia-local'], ['C', 'mano']]);
  const primera = s.siguiente();
  assert.equal(primera.origen, undefined);
  s.confirmar(primera.id);
  assert.equal(s.siguiente().origen, 'ia-local', 'el servidor recibe el origen');
  // Recargar sin conexión no pierde el origen
  const recargada = new Sincronia(s.serializar());
  assert.equal(recargada.pendientes.find((l) => l.ops[0].nodo.id === 'B').origen, 'ia-local');
});

test('lo escrito sin conexión queda pendiente, se muestra como propio y se quita al confirmarse', () => {
  const e1 = { idLocal: nuevoIdLocal(), canal: 'ia', tipo: 'usuario', texto: 'agrega Producto', escritoEn: '2026-10-25T10:00:00.000Z', datos: { paraIA: true } };
  const e2 = { idLocal: nuevoIdLocal(), canal: 'ia', tipo: 'ia', texto: '💻 Hecho con la IA local', escritoEn: '2026-10-25T10:00:01.000Z', datos: { motor: 'interprete', cambios: 1 } };
  assert.notEqual(e1.idLocal, e2.idLocal);
  guardarPendientes(7, 3, [e1, e2]);
  assert.equal(leerPendientes(7, 3).length, 2);
  assert.equal(leerPendientes(7, 4).length, 0, 'cada usuario tiene los suyos');
  const m1 = comoMensaje(e1, { id: 3, nombre: 'Ana' });
  assert.equal(m1.autorId, 3);
  assert.equal(m1.datos.pendiente, true);
  assert.equal(m1.canal, 'ia');
  const m2 = comoMensaje(e2, { id: 3, nombre: 'Ana' });
  assert.equal(m2.autorNombre, 'IA local');
  assert.equal(m2.datos.proveedor, 'IA local');
  assert.deepEqual(Object.keys(paraSubir(e1)).sort(), ['canal', 'datos', 'escritoEn', 'idLocal', 'texto', 'tipo']);
  assert.deepEqual(quitarAceptados([e1, e2], [e1.idLocal]).map((e) => e.idLocal), [e2.idLocal]);
});

test('la copia del chat guarda los últimos de cada canal (uno muy activo no borra al otro)', () => {
  const mensajes = [
    { id: 1, tipo: 'usuario', canal: 'equipo', texto: 'hola equipo' },
    ...Array.from({ length: 300 }, (_, i) => ({ id: 2 + i, tipo: 'ia', canal: 'ia', texto: `ia ${i}` })),
  ];
  guardarCopiaChat(9, { mensajes, propuestas: [], cambios: [], hayAnteriores: { equipo: false, ia: true } });
  const copia = leerCopiaChat(9);
  assert.ok(copia.mensajes.some((m) => m.texto === 'hola equipo'));
  assert.equal(copia.mensajes.filter((m) => m.canal === 'ia').length, 120);
  assert.equal(copia.recortado, true);
  assert.equal(leerCopiaChat(10), null);
});

test('la respuesta de la IA local dice qué hizo y con qué; si falta el modelo ofrece el panel', () => {
  const hecho = respuestaDeIALocal({ cambios: 2, resumen: ['Agregó la clase Producto', 'Relacionó Producto con Venta'], avisos: [], noEntendidas: [], motor: 'ollama', modeloUsado: 'qwen2.5:7b', modeloDisponible: true });
  assert.match(hecho.texto, /Ollama en tu equipo · qwen2\.5:7b/);
  assert.match(hecho.texto, /- Agregó la clase Producto/);
  assert.deepEqual(hecho.datos, { motor: 'ollama', modeloUsado: 'qwen2.5:7b', cambios: 2 });
  assert.equal(hecho.abrirPanel, false);
  const sinModelo = respuestaDeIALocal({ cambios: 0, resumen: [], avisos: [], noEntendidas: ['hazme un sistema de ventas'], motor: 'interprete', modeloDisponible: false });
  assert.match(sinModelo.texto, /No entendí/);
  assert.equal(sinModelo.abrirPanel, true);
  assert.equal(sinModelo.falta, 'texto', 'el panel destaca qué falta junto a lo sugerido');
  const imagen = respuestaDeImagenLocal({ disponible: false, motivo: 'Para leer imágenes sin conexión hace falta Ollama en este equipo.' });
  assert.equal(imagen.abrirPanel, true);
  assert.equal(imagen.falta, 'vista');
  assert.match(imagen.texto, /Ollama/);
});
