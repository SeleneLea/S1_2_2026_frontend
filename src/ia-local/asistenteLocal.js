/**
 * Decide qué IA usar y resuelve los pedidos con la IA local.
 *
 * Con conexión al servidor se usa la IA en la nube (Gemini). Sin conexión, o si el
 * usuario lo elige, todo se resuelve en el navegador:
 *   1. el intérprete de órdenes, si entiende el pedido completo (instantáneo);
 *   2. si no, el modelo de lenguaje local traduce el pedido a órdenes;
 *   3. si no hay modelo descargado, se aplica lo que el intérprete sí entendió.
 */
import { interpretar, aplicarOperaciones, descartarInventos, interpretarSobreElDiagrama, pideCrear } from './interpreteOrdenes.js';
import { construirMensajes, construirMensajesImagen, copiaUnEjemplo, limpiarRespuesta } from './promptOrdenes.js';
import { alternativasDeTexto, alternativasDeVoz, nivelActual, preferenciasIA } from './configuracionIA.js';
import { estadoOllama, generarConOllama, modeloOllamaPorDefecto, modeloVistaPorDefecto } from './ollama.js';
import { generarTexto, modeloDescargado, transcribirAudio } from './motorIA.js';

// En desarrollo vienen de .env.development; en producción el backend sirve la app (mismo origen)
const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_WS_URL || window.location.origin;
let comprobacion = { cuando: 0, disponible: false };

/** ¿Se puede usar la IA del servidor? No si no hay red o si el usuario eligió "siempre local". */
export const iaNubeDisponible = async () => {
  if (preferenciasIA().siempreLocal) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (Date.now() - comprobacion.cuando < 15000) return comprobacion.disponible;
  let disponible = false;
  try {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), 2500);
    const respuesta = await fetch(`${API_BASE}/apis/ai/health`, { signal: control.signal, credentials: 'include' });
    clearTimeout(temporizador);
    disponible = respuesta.ok;
  } catch {
    disponible = false;
  }
  comprobacion = { cuando: Date.now(), disponible };
  return disponible;
};

export const olvidarEstadoNube = () => { comprobacion = { cuando: 0, disponible: false }; };

/** El primer modelo de la lista que ya está descargado en este navegador, o null. */
const primeroDescargado = async (configs) => {
  for (const config of configs) {
    if (await modeloDescargado(config)) return config;
  }
  return null;
};

/**
 * El modelo a veces describe la misma asociación dos veces, en sentido inverso
 * ("Habitacion 1 a muchos Reserva" y "Reserva 1 a 1 Habitacion"): se deja la primera.
 */
const sinAsociacionesRepetidas = (operaciones) => {
  const pares = new Set();
  return operaciones.filter((op) => {
    if (op.op !== 'relacion' || op.tipo !== 'Association') return true;
    const par = [op.origen.nombre, op.destino.nombre].map((n) => n.toLowerCase()).sort().join('|');
    if (pares.has(par)) return false;
    pares.add(par);
    return true;
  });
};

/**
 * Lo que el modelo escribió, ya como operaciones válidas para este diagrama. Sin lo que inventa
 * (ver descartarInventos); `descartadas` dice cuántas se quitaron.
 */
const operacionesDelModelo = (respuesta, texto, nodes) => {
  const ordenes = limpiarRespuesta(respuesta);
  const traducido = interpretar(ordenes);
  // Si repitió un ejemplo del prompt (y no se pidió crear nada), no se aplica ninguna de sus órdenes
  if (!pideCrear(texto) && copiaUnEjemplo(ordenes)) {
    return { ordenes, operaciones: [], descartadas: traducido.operaciones.length || 1, noEntendidas: [] };
  }
  const { operaciones, descartadas } = descartarInventos(sinAsociacionesRepetidas(traducido.operaciones), texto, nodes);
  return { ordenes, operaciones, descartadas, noEntendidas: traducido.noEntendidas };
};

const avisoInventos = (n) => `Se descartaron ${n} cambio${n === 1 ? '' : 's'} del modelo que no correspondían al pedido.`;

/**
 * @returns {{ nodes, edges, cambios, resumen, avisos, motor, noEntendidas, ordenes?, errorModelo?, modeloDisponible }}
 */
export const resolverConIALocal = async ({ texto, nodes = [], edges = [], alProgresar }) => {
  // Pedidos sobre todas las clases a la vez (p. ej. "que empiecen con mayúscula"): sin modelo
  const sobreTodo = interpretarSobreElDiagrama(texto, nodes);
  if (sobreTodo) {
    if (!sobreTodo.length) return { nodes, edges, cambios: 0, resumen: [], avisos: ['Ya estaba así: no hubo nada que cambiar.'], motor: 'interprete', noEntendidas: [], modeloDisponible: true };
    return { ...aplicarOperaciones(sobreTodo, { nodes, edges }), motor: 'interprete', noEntendidas: [], modeloDisponible: true };
  }

  const directo = interpretar(texto);
  if (directo.operaciones.length && !directo.noEntendidas.length) {
    return { ...aplicarOperaciones(directo.operaciones, { nodes, edges }), motor: 'interprete', noEntendidas: [], modeloDisponible: true };
  }

  const nivel = await nivelActual();
  // El elegido o, si ese no está, otro que ya se haya descargado: no se pide uno nuevo sin necesidad
  const config = await primeroDescargado(await alternativasDeTexto());
  let errorModelo = null;
  let conOllama = false;

  // 1) Ollama instalado en el equipo: modelos más grandes, ya descargados y con la gráfica del sistema
  const { motorTexto = 'auto', modeloOllama } = preferenciasIA();
  if (motorTexto !== 'navegador') {
    const ollama = await estadoOllama();
    const modelo = modeloOllama && ollama.modelos.some((m) => m.nombre === modeloOllama)
      ? modeloOllama
      : modeloOllamaPorDefecto(ollama.modelos);
    if (ollama.disponible && modelo) {
      conOllama = true;
      try {
        const respuesta = await generarConOllama(construirMensajes(texto, nodes, edges), modelo);
        const { ordenes, operaciones, descartadas, noEntendidas } = operacionesDelModelo(respuesta, texto, nodes);
        if (operaciones.length) {
          const aplicado = aplicarOperaciones(operaciones, { nodes, edges });
          return {
            ...aplicado,
            avisos: descartadas ? [...aplicado.avisos, avisoInventos(descartadas)] : aplicado.avisos,
            motor: 'ollama',
            modeloUsado: modelo,
            ordenes,
            noEntendidas,
            modeloDisponible: true,
          };
        }
        if (descartadas) errorModelo = `${modelo} no entendió el pedido: lo que respondió no correspondía a tu diagrama y no se aplicó`;
      } catch (error) {
        errorModelo = error.message;
      }
    }
  }

  // 2) Modelo dentro del navegador
  if (config) {
    try {
      const respuesta = await generarTexto(construirMensajes(texto, nodes, edges), config, alProgresar);
      const { ordenes, operaciones, descartadas, noEntendidas } = operacionesDelModelo(respuesta, texto, nodes);
      if (operaciones.length) {
        const aplicado = aplicarOperaciones(operaciones, { nodes, edges });
        return {
          ...aplicado,
          avisos: descartadas ? [...aplicado.avisos, avisoInventos(descartadas)] : aplicado.avisos,
          motor: 'modelo', ordenes, noEntendidas, modeloDisponible: true,
        };
      }
      if (descartadas) errorModelo = 'el modelo del navegador no entendió el pedido: lo que respondió no correspondía a tu diagrama y no se aplicó';
    } catch (error) {
      errorModelo = error.message;
    }
  }

  const base = directo.operaciones.length
    ? aplicarOperaciones(directo.operaciones, { nodes, edges })
    : { nodes, edges, cambios: 0, resumen: [], avisos: [] };
  return {
    ...base,
    motor: 'interprete',
    noEntendidas: directo.noEntendidas,
    errorModelo,
    modeloDisponible: Boolean(config) || conOllama,
    nivel,
  };
};

/** Separa "data:image/png;base64,AAAA" en lo que Ollama espera recibir. */
const soloBase64 = (dato) => String(dato || '').replace(/^data:[^;]+;base64,/, '');

/**
 * Lee la foto de un diagrama con un modelo con vista de Ollama, sin internet.
 *
 * Devuelve `{ disponible: false, motivo }` cuando no hay Ollama o no hay ningún modelo que
 * acepte imágenes, para que quien llame pueda explicarlo en lugar de fallar.
 *
 * Aviso honesto: un modelo local de 4B o 7B lee bien los nombres de las clases y sus
 * atributos, pero se equivoca seguido con las relaciones y las cardinalidades. Sirve para
 * adelantar el trabajo sin conexión; con internet, la IA de la nube lee mucho mejor.
 */
export const leerImagenConIALocal = async ({ imagen, texto = '', nodes = [], edges = [] }) => {
  const { motorTexto = 'auto', modeloVistaOllama } = preferenciasIA();
  if (motorTexto === 'navegador') {
    return { disponible: false, motivo: 'La lectura de imágenes sin conexión usa Ollama, y está desactivado en las preferencias.' };
  }
  const ollama = await estadoOllama();
  if (!ollama.disponible) {
    return { disponible: false, motivo: 'Para leer imágenes sin conexión hace falta Ollama en este equipo.', bloqueoDelNavegador: ollama.bloqueoDelNavegador };
  }
  const elegido = modeloVistaOllama && ollama.modelos.some((m) => m.nombre === modeloVistaOllama)
    ? modeloVistaOllama
    : await modeloVistaPorDefecto(ollama.modelos);
  if (!elegido) {
    return { disponible: false, motivo: 'Ninguno de los modelos instalados en Ollama lee imágenes. Descarga uno con vista, por ejemplo: ollama pull qwen2.5vl:7b' };
  }
  const mensajes = construirMensajesImagen(soloBase64(imagen), nodes, edges, texto);
  const respuesta = await generarConOllama(mensajes, elegido, { maxTokens: 900 });
  const ordenes = limpiarRespuesta(respuesta);
  const traducido = interpretar(ordenes);
  if (!traducido.operaciones.length) {
    return { disponible: true, modeloUsado: elegido, ordenes, cambios: 0, nodes, edges, resumen: [], avisos: [],
      motivo: 'El modelo no reconoció clases en la imagen. Prueba con una foto más nítida o recorta el diagrama.' };
  }
  const operaciones = sinAsociacionesRepetidas(traducido.operaciones);
  return {
    ...aplicarOperaciones(operaciones, { nodes, edges }),
    disponible: true,
    motor: 'ollama-vista',
    modeloUsado: elegido,
    ordenes,
    noEntendidas: traducido.noEntendidas,
  };
};

/** Transcribe con Whisper local (el elegido o cualquier otro ya descargado); null si no hay ninguno. */
export const transcribirConIALocal = async (blob, alProgresar) => {
  const config = await primeroDescargado(await alternativasDeVoz());
  if (!config) return null;
  return transcribirAudio(blob, config, alProgresar);
};
