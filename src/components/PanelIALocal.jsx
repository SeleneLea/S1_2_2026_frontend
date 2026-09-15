import { useCallback, useEffect, useState } from 'react';
import {
  MODELOS, NOMBRE_NIVEL, detectarCapacidades, guardarPreferenciasIA, nivelActual, preferenciasIA,
} from '../ia-local/configuracionIA.js';
import { modeloDescargado, prepararModelo } from '../ia-local/motorIA.js';
import { iaNubeDisponible, olvidarEstadoNube } from '../ia-local/asistenteLocal.js';
import { EJEMPLOS_ORDENES } from '../ia-local/interpreteOrdenes.js';

const mb = (bytes) => `${Math.round((bytes || 0) / 1048576)} MB`;

/**
 * Panel "IA sin internet": muestra qué puede usar este equipo, descarga los modelos
 * locales y permite forzar la IA local (por ejemplo, para la defensa).
 */
export default function PanelIALocal({ onCerrar, onCambio }) {
  const [capacidades, setCapacidades] = useState(null);
  const [nivel, setNivel] = useState(null);
  const [siempreLocal, setSiempreLocal] = useState(preferenciasIA().siempreLocal);
  const [nube, setNube] = useState(null);
  const [estado, setEstado] = useState({ voz: {}, texto: {} });

  const revisar = useCallback(async (n) => {
    const m = MODELOS[n];
    const [voz, texto] = await Promise.all([modeloDescargado(m.voz), modeloDescargado(m.texto)]);
    setEstado({ voz: { listo: voz }, texto: { listo: texto } });
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const c = await detectarCapacidades();
      const n = await nivelActual();
      const hayNube = await iaNubeDisponible();
      if (!vivo) return;
      setCapacidades(c);
      setNivel(n);
      setNube(hayNube);
      await revisar(n);
    })();
    return () => { vivo = false; };
  }, [revisar]);

  const cambiarNivel = async (n) => {
    guardarPreferenciasIA({ nivel: n === capacidades?.recomendado ? undefined : n });
    setNivel(n);
    await revisar(n);
    onCambio?.();
  };

  const cambiarSiempreLocal = (valor) => {
    guardarPreferenciasIA({ siempreLocal: valor });
    olvidarEstadoNube();
    setSiempreLocal(valor);
    onCambio?.();
  };

  const preparar = async (tipo) => {
    const config = MODELOS[nivel]?.[tipo];
    if (!config) return;
    setEstado((e) => ({ ...e, [tipo]: { cargando: true, progreso: 0 } }));
    try {
      await prepararModelo(tipo, config, (p) => setEstado((e) => ({
        ...e,
        [tipo]: { cargando: true, progreso: p.progreso, cargado: p.cargado, total: p.total },
      })));
      setEstado((e) => ({ ...e, [tipo]: { listo: true } }));
      onCambio?.();
    } catch (error) {
      setEstado((e) => ({ ...e, [tipo]: { error: error.message } }));
    }
  };

  const filaModelo = (tipo, titulo, descripcion) => {
    const config = nivel ? MODELOS[nivel][tipo] : null;
    const e = estado[tipo] || {};
    if (!config) {
      return (
        <div className="p-3 border rounded-lg bg-gray-50 text-xs text-gray-600">
          <div className="font-semibold text-gray-800">{titulo}</div>
          En este nivel no se usa modelo: el intérprete de órdenes resuelve el texto al instante.
        </div>
      );
    }
    return (
      <div className="p-3 border rounded-lg bg-white">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-gray-800">{titulo}</div>
            <div className="text-xs text-gray-500">{descripcion} · {config.id.split('/')[1]} · ~{config.mb} MB</div>
          </div>
          {e.listo ? (
            <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">✓ Listo</span>
          ) : (
            <button
              type="button"
              onClick={() => preparar(tipo)}
              disabled={e.cargando || nube === false && !navigator.onLine}
              className="text-xs px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
            >
              {e.cargando ? 'Descargando…' : 'Descargar'}
            </button>
          )}
        </div>
        {e.cargando && (
          <div className="mt-2">
            <div className="h-1.5 bg-gray-200 rounded">
              <div className="h-1.5 bg-indigo-500 rounded transition-all" style={{ width: `${Math.round((e.progreso || 0) * 100)}%` }} />
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              {e.total ? `${mb(e.cargado)} de ${mb(e.total)}` : 'Preparando…'}
            </div>
          </div>
        )}
        {e.error && <div className="mt-2 text-xs text-red-700">No se pudo preparar: {e.error}</div>}
      </div>
    );
  };

  return (
    <div className="p-3 space-y-3 text-sm" data-tour="panel-ia-local">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-gray-800">💻 IA sin internet</div>
        <button type="button" onClick={onCerrar} className="text-xs text-gray-500 hover:text-gray-800">Volver ✕</button>
      </div>

      <div className="p-3 rounded-lg border bg-gray-50 text-xs text-gray-700 space-y-1">
        <div>
          IA en la nube:{' '}
          {nube === null ? 'comprobando…' : nube ? <span className="text-green-700 font-semibold">disponible</span> : <span className="text-amber-700 font-semibold">no disponible (se usa la IA local)</span>}
        </div>
        {capacidades && (
          <>
            <div>
              Tu equipo: WebGPU {capacidades.webgpu ? `sí${capacidades.f16 ? ' (f16)' : ''}` : 'no'}
              {capacidades.memoriaGB ? ` · memoria ≥ ${capacidades.memoriaGB} GB` : ''}
              {capacidades.nucleos ? ` · ${capacidades.nucleos} núcleos` : ''}
              {capacidades.libreMB ? ` · ${Math.round(capacidades.libreMB / 1024)} GB libres para la app` : ''}
            </div>
            {capacidades.adaptador && <div className="text-gray-500">Gráfica: {capacidades.adaptador}</div>}
          </>
        )}
      </div>

      <label className="block text-xs font-semibold text-gray-700">
        Nivel de IA local
        <select
          className="mt-1 w-full border rounded p-2 text-sm text-gray-900 bg-white"
          value={nivel || ''}
          onChange={(e) => cambiarNivel(e.target.value)}
        >
          {Object.keys(MODELOS).map((n) => (
            <option key={n} value={n} disabled={n === 'gpu' && capacidades && !(capacidades.webgpu && capacidades.f16)}>
              {NOMBRE_NIVEL[n]}{capacidades?.recomendado === n ? ' — recomendado' : ''}
            </option>
          ))}
        </select>
      </label>

      {filaModelo('voz', '🎙️ Voz a texto (Whisper)', 'Transcribe lo que dictas')}
      {filaModelo('texto', '🧠 Modelo de lenguaje', 'Entiende pedidos libres')}

      <label className="flex items-start gap-2 text-xs text-gray-700">
        <input type="checkbox" className="mt-0.5" checked={siempreLocal} onChange={(e) => cambiarSiempreLocal(e.target.checked)} />
        <span>Usar siempre la IA local, aunque haya internet (útil para probar o para la defensa).</span>
      </label>

      <details className="text-xs text-gray-600">
        <summary className="cursor-pointer font-semibold text-gray-700">Órdenes que se entienden sin ningún modelo</summary>
        <ul className="mt-1 space-y-1 list-disc pl-4">
          {EJEMPLOS_ORDENES.map((e) => <li key={e}>{e}</li>)}
        </ul>
      </details>
      <div className="text-[11px] text-gray-500">
        Los modelos se descargan una sola vez y quedan guardados en este navegador. Sin internet también funciona el modo Texto,
        Voz y Editar; el modo Imagen necesita la IA en la nube.
      </div>
    </div>
  );
}
