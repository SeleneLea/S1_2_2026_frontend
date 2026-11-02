/**
 * Revisión del diagrama con la IA local (sin internet): reglas fijas + Ollama si está.
 *
 *  1. Las reglas (utils/revisionLocal.js) encuentran al instante lo que se puede comprobar con
 *     certeza: nombres repetidos, relaciones sin cardinalidad, herencias en ciclo, etc.
 *  2. Si hay Ollama en la PC, el modelo revisa el diseño (lo que una regla no ve: conceptos que
 *     faltan, relaciones dudosas, atributos que deberían ser clases) y dice cómo corregirlo.
 *  3. Se juntan sin repetir y se devuelven con el formato de la revisión del equipo, para marcar
 *     las clases en la pizarra y compartirlo al volver la conexión.
 */
import { diagramaEnTexto, revisarDiagrama } from '../utils/revisionLocal.js';
import { extraerJSON } from '../utils/jsonIA.js';
import { preferenciasIA } from './configuracionIA.js';
import { estadoOllama, generarConOllama, modeloOllamaPorDefecto } from './ollama.js';

const GRAVEDADES = ['error', 'aviso', 'sugerencia'];
const MAX_DEL_MODELO = 10;

const SISTEMA = `Eres un experto en diagramas de clases UML 2.5 y en su paso a un modelo relacional y a Spring Boot.
Revisa el diagrama y di qué corregir. Responde SOLO con JSON válido, sin texto antes ni después:
{"texto": "resumen breve en español", "observaciones": [{"clase": "NombreExacto", "gravedad": "error|aviso|sugerencia", "texto": "qué está mal. Cómo corregir: qué hacer"}]}
Reglas: usa los nombres de clase tal como aparecen; como mucho ${MAX_DEL_MODELO} observaciones; no repitas lo que ya detectaron las reglas; si el diseño está bien, devuelve "observaciones": [].`;

/** Mensajes para Ollama: el diagrama en texto y lo que ya encontraron las reglas. */
export const mensajesRevision = (nodes, edges, deReglas = []) => [
  { role: 'system', content: SISTEMA },
  {
    role: 'user',
    content: `${diagramaEnTexto(nodes, edges)}\n\nYa detectado por las reglas (no lo repitas):\n${
      deReglas.length ? deReglas.map((o) => `- ${o.clase}: ${o.texto}`).join('\n') : '- nada'}`,
  },
];

const clave = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

/**
 * Tema de una observación. Un modelo chico repite con otras palabras lo que ya dijeron las reglas
 * ("el atributo nombre se repite" = "«Cliente» repite el atributo «nombre»"): se compara por tema.
 */
const TEMAS = [
  ['cardinalidad', /cardinalidad|multiplicidad/],
  ['mayusculas', /minuscula|mayuscula|pascalcase|camelcase/],
  ['repetido', /repite|repetid|duplicad/],
  ['sin-atributos', /no tiene atributos|sin atributos|ni atributos/],
  ['suelta', /no esta relacionada|aislada|ninguna relacion|sin relacion/],
  ['tipo', /tipo desconocido|no tiene tipo|sin tipo/],
  ['tildes', /tilde|ene\b/],
  ['reservada', /reservada/],
  ['herencia', /ciclo|herencia multiple|hereda de \d/],
];
export const temaDe = (texto) => (TEMAS.find(([, patron]) => patron.test(clave(texto))) || [null])[0];

/** Quita del modelo lo que ya dijeron las reglas (mismo tema en la misma clase o en la misma relación). */
export const sinRepetirReglas = (delModelo, deReglas) => delModelo.filter((o) => {
  const tema = temaDe(o.texto);
  if (!tema) return true;
  return !deReglas.some((r) => temaDe(r.texto) === tema
    && (r.nodoId === o.nodoId || (tema === 'cardinalidad' && clave(r.texto).includes(clave(o.clase)))));
});

/** Observaciones del modelo con el nodo de su clase; descarta las de clases que no existen. */
export const observacionesDelModelo = (respuesta, nodes = []) => {
  const lista = Array.isArray(respuesta?.observaciones) ? respuesta.observaciones : [];
  const clases = nodes.filter((n) => n.type === 'classNode');
  return lista.slice(0, MAX_DEL_MODELO).map((o) => {
    const nodo = clases.find((n) => clave(n.data?.className) === clave(o?.clase));
    if (!nodo || !o?.texto) return null;
    return {
      clase: nodo.data.className,
      nodoId: nodo.id,
      gravedad: GRAVEDADES.includes(o.gravedad) ? o.gravedad : 'sugerencia',
      texto: String(o.texto).slice(0, 400),
      deIA: true,
    };
  }).filter(Boolean);
};

/**
 * @returns {{ observaciones, total, clases, motor: 'reglas'|'reglas+ollama', modeloUsado?, resumenIA?, errorModelo?, ollamaDisponible }}
 */
export const revisarConIALocal = async ({ nodes = [], edges = [] }) => {
  const reglas = revisarDiagrama(nodes, edges);
  let modeloUsado = null;
  let errorModelo = null;
  let resumenIA = null;
  let delModelo = [];
  let ollamaDisponible = false;
  const { motorTexto = 'auto', modeloOllama } = preferenciasIA();
  if (reglas.clases > 0 && motorTexto !== 'navegador') {
    const ollama = await estadoOllama();
    ollamaDisponible = ollama.disponible;
    const modelo = modeloOllama && ollama.modelos.some((m) => m.nombre === modeloOllama) ? modeloOllama : modeloOllamaPorDefecto(ollama.modelos);
    if (ollama.disponible && modelo) {
      try {
        const respuesta = extraerJSON(await generarConOllama(mensajesRevision(nodes, edges, reglas.observaciones), modelo, { maxTokens: 900 }));
        delModelo = observacionesDelModelo(respuesta, nodes);
        // Un resumen de relleno ("Diagrama revisado") no aporta: solo si dice algo
        const resumen = typeof respuesta?.texto === 'string' ? respuesta.texto.trim() : '';
        resumenIA = resumen.length >= 40 ? resumen.slice(0, 600) : null;
        modeloUsado = modelo;
      } catch (error) {
        errorModelo = error.message;
      }
    }
  }
  // Sin repetir lo que ya dijeron las reglas ni repetirse a sí mismo
  const vistas = new Set();
  const nuevas = sinRepetirReglas(delModelo, reglas.observaciones).filter((o) => {
    const k = `${o.nodoId}|${temaDe(o.texto) || clave(o.texto).slice(0, 40)}`;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
  const total = { ...reglas.total };
  for (const o of nuevas) total[o.gravedad] += 1;
  return {
    observaciones: [...reglas.observaciones, ...nuevas].sort((a, b) => GRAVEDADES.indexOf(a.gravedad) - GRAVEDADES.indexOf(b.gravedad)),
    total,
    clases: reglas.clases,
    motor: modeloUsado ? 'reglas+ollama' : 'reglas',
    modeloUsado,
    resumenIA,
    errorModelo,
    ollamaDisponible,
  };
};

export default revisarConIALocal;
