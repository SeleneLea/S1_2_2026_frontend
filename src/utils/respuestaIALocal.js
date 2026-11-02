import { EJEMPLOS_ORDENES } from '../ia-local/interpreteOrdenes.js';

/**
 * Lo que la IA local responde en el chat, a partir del resultado de resolverConIALocal o de
 * leerImagenConIALocal. `abrirPanel`: falta un modelo y conviene ofrecer el panel de la IA local;
 * `falta` dice cuál ('texto' | 'vista') para que el panel lo destaque junto a lo sugerido para el equipo.
 */
const comoLoHizo = (r) => {
  if (r.motor === 'ollama' || r.motor === 'ollama-vista') return `Ollama en tu equipo · ${r.modeloUsado}`;
  if (r.motor === 'modelo') return 'modelo de lenguaje del navegador';
  return 'intérprete de órdenes';
};

export const respuestaDeIALocal = (r) => {
  const lineas = [];
  if (r.cambios > 0) {
    lineas.push(`💻 Hecho con la IA local (${comoLoHizo(r)}):`);
    (r.resumen || []).forEach((x) => lineas.push(`- ${x}`));
  }
  (r.avisos || []).forEach((a) => lineas.push(`⚠️ ${a}`));
  const noEntendidas = r.noEntendidas || [];
  const faltaModelo = noEntendidas.length > 0 && !r.modeloDisponible;
  if (noEntendidas.length) {
    lineas.push(`No entendí: ${noEntendidas.map((f) => `"${f}"`).join(', ')}.`);
    if (faltaModelo) {
      lineas.push(`Para pedidos libres hace falta un modelo: en **💻 IA local** te sugiero el que mejor anda en tu equipo. Sin modelo entiendo órdenes como: ${EJEMPLOS_ORDENES.slice(0, 3).map((e) => `"${e}"`).join(', ')}.`);
    }
  }
  if (r.errorModelo) lineas.push(`(El modelo local falló: ${r.errorModelo})`);
  if (r.errorModelo && noEntendidas.length && !faltaModelo) {
    lineas.push(`Sin internet entiendo mejor órdenes directas, por ejemplo: "renombra la clase chofer a Chofer" o ${EJEMPLOS_ORDENES.slice(4, 6).map((e) => `"${e}"`).join(' o ')}.`);
  }
  if (!lineas.length) lineas.push('No hubo cambios en el diagrama.');
  return {
    texto: lineas.join('\n'),
    datos: { motor: r.motor || 'interprete', ...(r.modeloUsado ? { modeloUsado: r.modeloUsado } : {}), cambios: r.cambios || 0 },
    abrirPanel: faltaModelo,
    ...(faltaModelo ? { falta: 'texto' } : {}),
  };
};

export const respuestaDeImagenLocal = (r) => {
  if (!r.disponible) return { texto: r.motivo || 'No se pudo leer la imagen sin conexión.', datos: { motor: 'ollama-vista', cambios: 0 }, abrirPanel: true, falta: 'vista' };
  const lineas = [];
  if (r.cambios > 0) {
    lineas.push(`💻 Leído sin internet con Ollama · ${r.modeloUsado}:`);
    (r.resumen || []).forEach((x) => lineas.push(`- ${x}`));
    lineas.push('Revisa las relaciones y las cardinalidades: un modelo local las falla más que los nombres.');
  } else if (r.motivo) {
    lineas.push(r.motivo);
  }
  (r.avisos || []).forEach((a) => lineas.push(`⚠️ ${a}`));
  if (r.noEntendidas?.length) lineas.push(`No entendí: ${r.noEntendidas.map((f) => `"${f}"`).join(', ')}.`);
  return {
    texto: lineas.join('\n') || 'No hubo cambios en el diagrama.',
    datos: { motor: 'ollama-vista', ...(r.modeloUsado ? { modeloUsado: r.modeloUsado } : {}), cambios: r.cambios || 0 },
    abrirPanel: false,
  };
};

/** Sugerencias para el chat de la IA cuando se trabaja sin conexión (lo que entiende la IA local). */
export const SUGERENCIAS_SIN_CONEXION = EJEMPLOS_ORDENES.slice(0, 3);

/** ¿El texto pide revisar el diagrama? ("revisa", "verifica", "qué corregir", "errores", "depura"...) */
export const pideRevision = (texto) => /\b(revis|verific|corrig|correcci|errore?s?\b|depur|qu[eé] (est[aá] mal|falta)|problemas?\b)/i.test(String(texto || ''));

/** Respuesta de la revisión local: resumen, cuántos hallazgos y la lista (las marcas van en datos). */
export const respuestaDeRevisionLocal = (r) => {
  const { error = 0, aviso = 0, sugerencia = 0 } = r.total || {};
  const como = r.motor === 'reglas+ollama' ? `reglas del diagrama + Ollama · ${r.modeloUsado}` : 'reglas del diagrama';
  const lineas = [];
  if (!r.clases) {
    lineas.push('🔎 El diagrama está vacío: no hay nada que revisar.');
  } else if (!r.observaciones.length) {
    lineas.push(`🔎 Revisión sin internet (${como}): no encontré problemas.`);
  } else {
    lineas.push(`🔎 Revisión sin internet (${como}): ${error} error${error === 1 ? '' : 'es'}, ${aviso} aviso${aviso === 1 ? '' : 's'}, ${sugerencia} sugerencia${sugerencia === 1 ? '' : 's'}.`);
    if (r.resumenIA) lineas.push(r.resumenIA);
    lineas.push('Las clases quedan marcadas en la pizarra; toca una observación para ir a su clase.');
  }
  if (r.clases && r.motor === 'reglas') {
    lineas.push(r.errorModelo
      ? `(Esta vez Ollama no completó su parte: ${r.errorModelo}. Arriba van las observaciones de las reglas.)`
      : 'Para una revisión más profunda sin internet (diseño, conceptos que faltan), deja Ollama listo en 💻.');
  }
  return {
    texto: lineas.join('\n'),
    datos: {
      motor: r.motor, ...(r.modeloUsado ? { modeloUsado: r.modeloUsado } : {}), cambios: 0,
      tipoRespuesta: 'revision', observaciones: r.observaciones,
    },
    abrirPanel: false,
  };
};
