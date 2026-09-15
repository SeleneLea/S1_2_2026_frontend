/**
 * Qué IA local puede usar este equipo.
 *
 * La herramienta está desplegada en un servidor y no sabemos qué PC tendrá el
 * usuario. Sin internet el navegador no llega al servidor, así que la IA offline
 * corre en el propio navegador. Según el hardware se elige un nivel:
 *
 *   gpu    WebGPU con shader-f16: modelo de 1.5B + Whisper base en la tarjeta gráfica
 *   cpu    sin WebGPU pero con memoria suficiente: intérprete de órdenes + Whisper base (WASM)
 *   basico equipos modestos: solo el intérprete de órdenes + Whisper tiny
 *
 * Los modelos se descargan una vez (con internet) y quedan en la caché del navegador.
 */

// ONNX Runtime Web 1.26 falla al crear sesiones de modelos cuantizados con la
// optimización completa del grafo (TransposeDQWeightsForMatMulNBits): "basic" lo evita.
const SESION = { graphOptimizationLevel: 'basic' };

// Whisper probado con un audio en español: en WebGPU el encoder fp16 devuelve basura,
// fp32 transcribe bien en ~2 s; en WASM, q8 transcribe bien en ~6 s.
const VOZ_WASM = { id: 'onnx-community/whisper-base', device: 'wasm', dtype: 'q8', sesion: SESION, mb: 75 };

export const MODELOS = {
  gpu: {
    voz: { id: 'onnx-community/whisper-base', device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'fp32' }, sesion: SESION, mb: 280 },
    // Probado con pedidos libres: Qwen 0.5B/1.5B inventan o se repiten; Llama 3.2 3B arma
    // clases, atributos y relaciones correctas. q4f16 y con la optimización por defecto:
    // q4 (3,2 GB) desborda la memoria WASM y "basic" hace que fp16 devuelva "!!!!".
    texto: { id: 'onnx-community/Llama-3.2-3B-Instruct-ONNX', device: 'webgpu', dtype: 'q4f16', mb: 2300 },
  },
  cpu: {
    voz: VOZ_WASM,
    // Probado: en procesador, Qwen 0.5B y 1.5B (int8) inventan y repiten, y tardan hasta
    // un minuto. En este nivel el texto lo resuelve el intérprete de órdenes.
    texto: null,
  },
  basico: {
    // whisper-tiny confunde palabras ("de simal" por "decimal"); base pesa solo 75 MB
    voz: VOZ_WASM,
    texto: null,
  },
};

export const NOMBRE_NIVEL = {
  gpu: 'Tarjeta gráfica (WebGPU)',
  cpu: 'Procesador',
  basico: 'Básico (intérprete de órdenes)',
};

const PREFERENCIAS = 'ia.preferencias';

const leer = () => {
  try { return JSON.parse(localStorage.getItem(PREFERENCIAS)) || {}; } catch { return {}; }
};

/** { siempreLocal: boolean, nivel?: 'gpu'|'cpu'|'basico' } */
export const preferenciasIA = () => ({ siempreLocal: false, ...leer() });

export const guardarPreferenciasIA = (cambios) => {
  const nuevas = { ...preferenciasIA(), ...cambios };
  try { localStorage.setItem(PREFERENCIAS, JSON.stringify(nuevas)); } catch { /* sin almacenamiento */ }
  return nuevas;
};

let capacidadesEnCache = null;

/** Detecta WebGPU, memoria, núcleos y espacio libre; elige el nivel recomendado. */
export const detectarCapacidades = async () => {
  if (capacidadesEnCache) return capacidadesEnCache;
  const memoriaGB = navigator.deviceMemory ?? null; // Chrome/Edge; tope de 8
  const nucleos = navigator.hardwareConcurrency ?? null;
  let webgpu = false;
  let f16 = false;
  let adaptador = '';
  try {
    if (navigator.gpu) {
      const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (a) {
        webgpu = true;
        f16 = a.features.has('shader-f16');
        adaptador = [a.info?.vendor, a.info?.architecture, a.info?.description].filter(Boolean).join(' ');
      }
    }
  } catch { /* WebGPU no disponible */ }
  let libreMB = null;
  try {
    const e = await navigator.storage?.estimate?.();
    if (e?.quota) libreMB = Math.round((e.quota - (e.usage || 0)) / 1048576);
  } catch { /* sin estimación */ }

  // El nivel depende solo del hardware: el espacio libre baja justamente cuando los
  // modelos ya están descargados (y si falta al descargar, prepararModelo lo informa)
  let recomendado = 'basico';
  if (webgpu && f16 && (memoriaGB === null || memoriaGB >= 4)) recomendado = 'gpu';
  else if ((memoriaGB === null || memoriaGB >= 4) && (nucleos === null || nucleos >= 4)) recomendado = 'cpu';

  capacidadesEnCache = { recomendado, webgpu, f16, memoriaGB, nucleos, libreMB, adaptador };
  return capacidadesEnCache;
};

/** Nivel en uso: el que eligió el usuario o el recomendado para su equipo. */
export const nivelActual = async () => {
  const { nivel } = preferenciasIA();
  if (nivel && MODELOS[nivel]) return nivel;
  return (await detectarCapacidades()).recomendado;
};
