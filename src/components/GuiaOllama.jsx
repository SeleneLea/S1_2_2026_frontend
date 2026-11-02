import { useEffect, useState } from 'react';
import {
  comandoPermitirPagina, descargarGuion as descargar, guionConfigurar, guionModelos, guionPermitirPagina, modeloSugeridoOllama, modelosConVista, modeloVistaSugerido,
} from '../ia-local/ollama.js';
import { estadoDeLosPasos } from './estadoGuiaOllama.js';

/**
 * Guía para dejar Ollama listo en ESTA PC, paso a paso, con lo que se pudo comprobar desde la
 * página. Una página de internet no puede instalar programas ni dar permisos: entrega archivos que
 * el usuario abre con doble clic (el configurador hace solo lo que falta) y explica el único paso
 * que es del navegador.
 */

const windows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
const enEsteEquipo = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

const ICONO = { si: '✅', no: '❌', duda: '❔', espera: '⏳', no_hace_falta: '➖' };

export default function GuiaOllama({ ollama, capacidades, onComprobar }) {
  const [conVista, setConVista] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const origen = window.location.origin;
  const modelo = modeloSugeridoOllama(capacidades);
  const modeloVista = modeloVistaSugerido(capacidades);

  useEffect(() => {
    let vivo = true;
    setConVista(null);
    if (ollama?.disponible) modelosConVista(ollama.modelos).then((l) => { if (vivo) setConVista(l); }).catch(() => vivo && setConVista([]));
    return () => { vivo = false; };
  }, [ollama]);

  const pasos = estadoDeLosPasos(ollama, { conVista, enEquipo: enEsteEquipo });
  const todoListo = pasos && pasos.instalado === 'si' && pasos.pagina === 'si' && pasos.texto === 'si';
  const [abierta, setAbierta] = useState(null);
  const mostrar = abierta ?? !todoListo;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(comandoPermitirPagina(origen));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 4000);
    } catch { setCopiado(false); }
  };

  const fila = (clave, titulo, detalle) => (
    <li key={clave} className="flex gap-2">
      <span className="w-5 shrink-0 text-center">{ICONO[pasos?.[clave] || 'espera']}</span>
      <span>
        <span className="font-semibold text-gray-800">{titulo}</span>
        {detalle && <span className="block text-gray-600">{detalle}</span>}
      </span>
    </li>
  );

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-2 text-xs text-gray-700 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-indigo-900">
          {todoListo ? '✅ Ollama está listo en esta PC' : '🧭 Dejar Ollama listo en esta PC'}
        </div>
        <button type="button" onClick={() => setAbierta(!mostrar)} className="text-indigo-700 underline">
          {mostrar ? 'Ocultar guía' : 'Ver guía'}
        </button>
      </div>

      {mostrar && (
        <>
          {!pasos ? <div className="text-gray-500">Comprobando esta PC…</div> : (
            <ol className="space-y-1.5">
              {fila('instalado', '1. Ollama instalado y abierto',
                pasos.instalado === 'no' ? 'No responde: no está instalado o está cerrado (búscalo en el menú Inicio).'
                  : pasos.instalado === 'duda' ? 'No se puede saber todavía: el navegador no deja comprobarlo (paso 3).' : null)}
              {fila('pagina', '2. Esta página permitida en Ollama',
                pasos.pagina === 'no' ? `Ollama está abierto pero no tiene permitida ${origen}.`
                  : pasos.pagina === 'duda' ? 'Se sabrá cuando Ollama responda.' : null)}
              {fila('navegador', '3. El navegador deja hablar con Ollama',
                pasos.navegador === 'no_hace_falta' ? 'No hace falta: la página está en este mismo equipo.'
                  : pasos.navegador === 'si' ? null
                    : 'Candado de la barra de direcciones → Configuración del sitio → Acceso a la red local → Permitir. Después recarga la página.')}
              {fila('texto', pasos.texto === 'si' ? '4. Modelo de texto' : `4. Modelo de texto (recomendado: ${modelo})`,
                pasos.texto === 'no' ? 'Ollama no tiene ningún modelo descargado.'
                  : pasos.texto === 'si' ? `Instalados: ${ollama.modelos.map((m) => m.nombre).slice(0, 4).join(', ')}` : null)}
              {fila('vista', pasos.vista === 'si' ? '5. Modelo para leer fotos' : `5. Modelo para leer fotos (recomendado: ${modeloVista})`,
                pasos.vista === 'no' ? 'Opcional: sin él no se leen fotos del diagrama sin internet.'
                  : pasos.vista === 'si' ? `Instalado: ${conVista.map((m) => m.nombre).slice(0, 2).join(', ')}` : null)}
            </ol>
          )}

          {!todoListo && (
            <div className="rounded bg-white border border-indigo-200 p-2 space-y-1.5">
              <button
                type="button"
                onClick={() => descargar(guionConfigurar({ origen, modelo, modeloVista, windows }))}
                className="w-full px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
              >
                ⬇️ Descargar el configurador de esta PC
              </button>
              <div>
                Se descarga <span className="font-mono">{windows ? 'configurar-ollama.bat' : 'configurar-ollama.sh'}</span>.
                Ábrelo con doble clic: hace <strong>solo lo que falta</strong> (instala Ollama si no está, permite esta
                página sin quitar las que ya estaban, lo reinicia y, si no hay modelos, descarga {modelo}{modeloVista ? ` y ${modeloVista}` : ''}).
                Se puede abrir las veces que haga falta.
              </div>
              {pasos?.navegador !== 'no_hace_falta' && pasos?.navegador !== 'si' && (
                <div className="text-amber-800">El paso 3 es del navegador y ningún archivo puede hacerlo: hazlo a mano.</div>
              )}
              <div>Al terminar, pulsa «Volver a comprobar».</div>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => descargar(guionPermitirPagina({ origen, windows }))} className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100">
              Solo permisos ({windows ? 'permitir-ollama.bat' : '.sh'})
            </button>
            <button type="button" onClick={() => descargar(guionModelos({ modelo, modeloVista, windows }))} className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100">
              Solo modelos ({windows ? 'modelos-ollama.bat' : '.sh'})
            </button>
            {windows && (
              <button type="button" onClick={copiar} className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100">
                {copiado ? 'Copiado: pégalo en PowerShell y reinicia Ollama' : 'Copiar comando del permiso'}
              </button>
            )}
            <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100">
              Instalador oficial
            </a>
            {onComprobar && (
              <button type="button" onClick={onComprobar} className="px-2 py-1 rounded bg-indigo-100 text-indigo-800 hover:bg-indigo-200 font-semibold">
                Volver a comprobar
              </button>
            )}
          </div>
          <div className="text-gray-500">
            Los modelos quedan en la PC: no se descargan de nuevo en cada navegador y usan la tarjeta gráfica.
            Descárgalos con internet, antes de necesitarlos.
          </div>
        </>
      )}
    </div>
  );
}
