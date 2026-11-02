// IA local: qué conviene a cada equipo según sus componentes y uso de modelos ya descargados.
import test from 'node:test';
import assert from 'node:assert/strict';

// localStorage de mentira (en Node no existe)
const almacen = new Map();
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => { almacen.set(k, String(v)); },
  removeItem: (k) => { almacen.delete(k); },
};

const { sugerenciaParaEquipo, describirEquipo } = await import('../src/ia-local/sugerenciaEquipo.js');
const { alternativasDeVoz, alternativasDeTexto, modeloVozActual } = await import('../src/ia-local/configuracionIA.js');

const equipo = (cambios) => ({
  recomendado: 'gpu', webgpu: true, f16: true, memoriaGB: 8, nucleos: 12, adaptador: 'nvidia ampere', ...cambios,
});

test('gráfica dedicada: todo en la gráfica, el modelo grande del navegador y Ollama de 7B como mejora', () => {
  const s = sugerenciaParaEquipo(equipo());
  assert.equal(s.nivel, 'gpu');
  assert.equal(s.voz.opcion.clave, 'whisper-base');
  assert.equal(s.voz.mb, 278, 'en la gráfica Whisper va en fp32');
  assert.equal(s.texto.motor, 'navegador');
  assert.equal(s.texto.opcion.clave, 'llama-3b');
  assert.equal(s.texto.alternativa.modelo, 'qwen2.5-coder:7b');
  assert.match(s.texto.porque, /dedicada/);
  assert.ok(s.equipo.some((p) => /nvidia ampere \(dedicada\)/.test(p)));
});

test('gráfica integrada: el modelo liviano del navegador', () => {
  const s = sugerenciaParaEquipo(equipo({ adaptador: 'intel gen-12lp' }));
  assert.equal(s.texto.motor, 'navegador');
  assert.equal(s.texto.opcion.clave, 'llama-1b');
  assert.match(s.texto.porque, /integrada/);
  assert.equal(s.texto.alternativa.modelo, 'llama3.2:3b');
});

test('sin WebGPU: la voz en el procesador y los pedidos libres con Ollama (el navegador sería lento)', () => {
  const s = sugerenciaParaEquipo(equipo({ recomendado: 'cpu', webgpu: false, f16: false, adaptador: '', nucleos: 8 }));
  assert.equal(s.nivel, 'cpu');
  assert.equal(s.voz.opcion.clave, 'whisper-base');
  assert.equal(s.voz.mb, 73, 'en el procesador Whisper va en q8');
  assert.equal(s.texto.motor, 'ollama');
  assert.equal(s.texto.listo, false);
  assert.equal(s.texto.modelo, 'llama3.2:3b');
  assert.equal(s.texto.gb, 2);
  assert.match(s.texto.porque, /más de un minuto/);
  assert.ok(describirEquipo(equipo({ webgpu: false })).some((p) => /sin WebGPU/.test(p)));
});

test('equipo modesto: lo más liviano', () => {
  const s = sugerenciaParaEquipo({ recomendado: 'basico', webgpu: false, f16: false, memoriaGB: 2, nucleos: 2, adaptador: '' });
  assert.equal(s.voz.opcion.clave, 'whisper-tiny');
  assert.equal(s.voz.mb, 39);
  assert.equal(s.texto.modelo, 'llama3.2:1b');
  assert.equal(s.vista.modelo, 'moondream');
});

test('si Ollama ya tiene modelos, se sugiere usarlos en vez de descargar otro', () => {
  const ollama = { disponible: true, modelos: [{ nombre: 'nomic-embed-text', mb: 260 }, { nombre: 'qwen2.5:7b', mb: 4466 }] };
  const s = sugerenciaParaEquipo(equipo({ adaptador: 'intel gen-12lp' }), ollama);
  assert.equal(s.texto.motor, 'ollama');
  assert.equal(s.texto.listo, true);
  assert.equal(s.texto.modelo, 'qwen2.5:7b');
  assert.equal(sugerenciaParaEquipo(null), null);
  // Para las órdenes de texto no se elige uno que ve imágenes aunque Ollama lo liste primero
  const conVistaPrimero = { disponible: true, modelos: [{ nombre: 'qwen2.5vl:7b' }, { nombre: 'qwen2.5:7b' }, { nombre: 'llama3.2:3b' }] };
  assert.equal(sugerenciaParaEquipo(equipo(), conVistaPrimero).texto.modelo, 'qwen2.5:7b');
  assert.equal(sugerenciaParaEquipo(equipo(), { disponible: true, modelos: [{ nombre: 'qwen2.5vl:7b' }] }).texto.modelo, 'qwen2.5vl:7b');
});

test('antes de decir "falta el modelo" se prueban todos los de voz que sirven en este equipo', async () => {
  const lista = await alternativasDeVoz();
  assert.deepEqual(lista[0], await modeloVozActual(), 'primero el elegido');
  assert.equal(new Set(lista.map((c) => `${c.id}|${c.device}`)).size, lista.length, 'sin repetir');
  assert.ok(lista.length >= 3);
  // En Node no hay WebGPU: solo sirven los del procesador y no hay modelo de lenguaje en el navegador
  assert.ok(lista.every((c) => c.device === 'wasm'));
  assert.deepEqual(await alternativasDeTexto(), []);
});
