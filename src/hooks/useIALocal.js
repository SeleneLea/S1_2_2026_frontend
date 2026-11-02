import { useCallback, useRef } from 'react';
import { leerImagenConIALocal, resolverConIALocal, transcribirConIALocal } from '../ia-local/asistenteLocal.js';
import { respuestaDeIALocal, respuestaDeImagenLocal, respuestaDeRevisionLocal } from '../utils/respuestaIALocal.js';
import { revisarConIALocal } from '../ia-local/revisionLocal.js';

const comoBase64 = (archivo) => new Promise((resolve, reject) => {
  const lector = new FileReader();
  lector.onerror = () => reject(new Error('No se pudo leer el archivo de imagen.'));
  lector.onload = () => resolve(String(lector.result || ''));
  lector.readAsDataURL(archivo);
});

/**
 * La IA local (en este equipo) para el chat de la sala cuando no hay conexión con el servidor.
 * Trabaja sobre el diagrama que se ve y aplica sus cambios con `aplicar`, que los marca como de la
 * IA local: al volver la conexión llegan a todos y quedan en el historial como de la IA.
 */
export const useIALocal = ({ nodes, edges, aplicar }) => {
  const diagramaRef = useRef({ nodes: [], edges: [] });
  diagramaRef.current = { nodes: nodes || [], edges: edges || [] };
  const aplicarRef = useRef(aplicar);
  aplicarRef.current = aplicar;

  /** Pedido en texto: intérprete de órdenes, Ollama del equipo o modelo del navegador. */
  const pedir = useCallback(async (texto) => {
    const r = await resolverConIALocal({ texto, ...diagramaRef.current });
    if (r.cambios > 0) aplicarRef.current?.(r.nodes, r.edges);
    return respuestaDeIALocal(r);
  }, []);

  /** Foto de un diagrama: la lee un modelo con vista de Ollama en este equipo. */
  const leerImagen = useCallback(async (archivo, texto = '') => {
    const r = await leerImagenConIALocal({ imagen: await comoBase64(archivo), texto, ...diagramaRef.current });
    if (r.disponible && r.cambios > 0) aplicarRef.current?.(r.nodes, r.edges);
    return respuestaDeImagenLocal(r);
  }, []);

  /** Revisión del diagrama sin internet: reglas fijas y, si hay Ollama, su revisión. No cambia nada. */
  const revisar = useCallback(async () => respuestaDeRevisionLocal(await revisarConIALocal(diagramaRef.current)), []);

  /** Audio a texto con Whisper local; null si el modelo de voz todavía no se descargó. */
  const transcribir = useCallback((audio) => transcribirConIALocal(audio), []);

  return { pedir, leerImagen, transcribir, revisar };
};

export default useIALocal;
