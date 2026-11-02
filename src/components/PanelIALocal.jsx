import { useCallback, useEffect, useMemo, useState } from 'react';
import GuiaOllama from './GuiaOllama';
import {
  CATALOGO_TEXTO, CATALOGO_VOZ, NOMBRE_NIVEL, configuracionDeTexto, configuracionDeVoz,
  detectarCapacidades, guardarPreferenciasIA, nivelActual, preferenciasIA, textoRecomendado,
  usaGraficaIntegrada, vozRecomendada,
} from '../ia-local/configuracionIA.js';
import { modeloDescargado, prepararModelo } from '../ia-local/motorIA.js';
import { iaNubeDisponible, olvidarEstadoNube } from '../ia-local/asistenteLocal.js';
import { EJEMPLOS_ORDENES } from '../ia-local/interpreteOrdenes.js';
import {
  descargarGuion, estadoOllama, guionConfigurar, modeloOllamaPorDefecto, modelosConVista, olvidarEstadoOllama,
} from '../ia-local/ollama.js';
import { sugerenciaParaEquipo } from '../ia-local/sugerenciaEquipo.js';

const mb = (bytes) => `${Math.round((bytes || 0) / 1048576)} MB`;
const windows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

/** Navegador basado en Chromium: prefijo de sus páginas internas y dónde suele estar su .exe en Windows. */
const NAVEGADOR = (() => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/Edg\//.test(ua)) return { prefijo: 'edge', exe: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' };
  if (/OPR\//.test(ua)) return { prefijo: 'opera', exe: '%LOCALAPPDATA%\\Programs\\Opera\\opera.exe' };
  if (/Chrome\//.test(ua)) return { prefijo: 'chrome', exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' };
  return null;
})();

/**
 * Cómo pasar el navegador a la gráfica dedicada. En Windows, Chrome, Edge y Opera ignoran el
 * pedido de "alto rendimiento" de la página: hay que activarlo en el navegador o en Windows.
 */
const AvisoGraficaIntegrada = () => {
  const [copiado, setCopiado] = useState(false);
  const bandera = NAVEGADOR && `${NAVEGADOR.prefijo}://flags/#force-high-performance-gpu`;
  const copiar = () => navigator.clipboard?.writeText(bandera).then(() => setCopiado(true)).catch(() => {});
  const codigo = 'px-1 rounded bg-amber-100 break-all font-mono text-[11px]';
  return (
    <div className="text-amber-800 space-y-1">
      <div>
        El navegador está usando la gráfica integrada. Si tu equipo tiene una dedicada (NVIDIA o AMD),
        actívala y la IA local irá mucho más rápida:
      </div>
      <ol className="list-decimal pl-4 space-y-1">
        {bandera && (
          <li>
            Lo más rápido: pega en la barra de direcciones <code className={codigo}>{bandera}</code>{' '}
            <button type="button" onClick={copiar} className="underline font-semibold">{copiado ? '✓ copiado' : 'copiar'}</button>,
            cambia «Default» por <b>Enabled</b> y pulsa <b>Reiniciar</b> (Relaunch).
          </li>
        )}
        {windows && NAVEGADOR && (
          <li>
            O en Windows: Configuración → Sistema → Pantalla → Configuración de gráficos. Deja «Aplicación de
            escritorio» (la de Microsoft Store no sirve), pulsa <b>Examinar</b>, elige{' '}
            <code className={codigo}>{NAVEGADOR.exe}</code> y luego <b>Agregar</b> → <b>Opciones</b> → <b>Alto rendimiento</b> → <b>Guardar</b>.
          </li>
        )}
        {!bandera && <li>Elige tu navegador en la configuración de gráficos del sistema y ponlo en alto rendimiento.</li>}
      </ol>
      <div>Después cierra todas las ventanas del navegador y ábrelo de nuevo: este aviso desaparece cuando ya usa la dedicada.</div>
    </div>
  );
};

/** Por qué se abrió el panel, cuando fue porque a un pedido le faltó un modelo. */
const AVISO_FALTA = {
  voz: 'Falta el modelo de voz para usar audio sin conexión.',
  texto: 'Para pedidos libres sin conexión hace falta un modelo de lenguaje.',
  vista: 'Para leer fotos sin conexión hace falta Ollama con un modelo que vea imágenes.',
};

/** Una línea de la sugerencia: qué se usa, si ya está y por qué conviene en este equipo. */
const ItemSugerido = ({ icono, titulo, nombre, listo, porque }) => (
  <li className="flex gap-2">
    <span className="w-5 shrink-0 text-center">{icono}</span>
    <span className="min-w-0">
      <span className="font-semibold text-gray-800">{titulo}:</span> {nombre}{' '}
      {listo
        ? <span className="whitespace-nowrap font-semibold text-green-700">✓ listo</span>
        : <span className="whitespace-nowrap text-amber-700">falta</span>}
      <span className="block text-gray-600">{porque}</span>
    </span>
  </li>
);

/**
 * Panel "IA sin internet": muestra qué puede usar este equipo, deja elegir el modelo según
 * la gráfica y la memoria, los descarga y permite forzar la IA local (por ejemplo, para la defensa).
 */
export default function PanelIALocal({ onCerrar, onCambio, falta = null }) {
  const [capacidades, setCapacidades] = useState(null);
  const [nivel, setNivel] = useState(null);
  const [claveTexto, setClaveTexto] = useState(null);
  const [claveVoz, setClaveVoz] = useState(null);
  const [siempreLocal, setSiempreLocal] = useState(preferenciasIA().siempreLocal);
  const [nube, setNube] = useState(null);
  const [estado, setEstado] = useState({ voz: {}, texto: {} });
  const [ollama, setOllama] = useState(null);
  const [motorTexto, setMotorTexto] = useState(preferenciasIA().motorTexto || 'auto');
  const [modeloOllama, setModeloOllama] = useState(preferenciasIA().modeloOllama || '');
  const [conVista, setConVista] = useState(null);
  const sugerencia = useMemo(() => sugerenciaParaEquipo(capacidades, ollama), [capacidades, ollama]);
  // ¿Ya están descargados los modelos SUGERIDOS? (pueden no ser los elegidos a mano)
  const [sugeridoListo, setSugeridoListo] = useState({});

  const opcionTexto = CATALOGO_TEXTO.find((o) => o.clave === claveTexto) || null;
  const opcionVoz = CATALOGO_VOZ.find((o) => o.clave === claveVoz) || null;
  const usaModeloDeTexto = nivel === 'gpu';
  const configDe = useCallback((tipo, cTexto, cVoz, n) => (tipo === 'texto'
    ? (n === 'gpu' ? configuracionDeTexto(CATALOGO_TEXTO.find((o) => o.clave === cTexto)) : null)
    : configuracionDeVoz(CATALOGO_VOZ.find((o) => o.clave === cVoz), n)), []);

  const revisar = useCallback(async (n, cTexto, cVoz) => {
    const [voz, texto] = await Promise.all([
      modeloDescargado(configDe('voz', cTexto, cVoz, n)),
      modeloDescargado(configDe('texto', cTexto, cVoz, n)),
    ]);
    setEstado({ voz: { listo: voz }, texto: { listo: texto } });
  }, [configDe]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const c = await detectarCapacidades();
      const n = await nivelActual();
      const hayNube = await iaNubeDisponible();
      if (!vivo) return;
      const prefs = preferenciasIA();
      const cTexto = prefs.modeloTexto || textoRecomendado(c, n);
      const cVoz = prefs.modeloVoz || vozRecomendada(c, n);
      setCapacidades(c);
      setNivel(n);
      setClaveTexto(cTexto);
      setClaveVoz(cVoz);
      setNube(hayNube);
      await revisar(n, cTexto, cVoz);
      const enEquipo = await estadoOllama();
      if (vivo) setOllama(enEquipo);
    })();
    return () => { vivo = false; };
  }, [revisar]);

  useEffect(() => {
    if (!sugerencia) return undefined;
    let vivo = true;
    Promise.all([
      modeloDescargado(configuracionDeVoz(sugerencia.voz.opcion, sugerencia.nivel)),
      sugerencia.texto.motor === 'navegador' ? modeloDescargado(configuracionDeTexto(sugerencia.texto.opcion)) : false,
    ]).then(([voz, texto]) => { if (vivo) setSugeridoListo({ voz, texto }); });
    return () => { vivo = false; };
  }, [sugerencia, estado]);

  // ¿Ollama ya tiene un modelo que lea fotos? (para marcar ese paso de la sugerencia)
  useEffect(() => {
    let vivo = true;
    setConVista(null);
    if (ollama?.disponible) modelosConVista(ollama.modelos).then((l) => { if (vivo) setConVista(l); }).catch(() => vivo && setConVista([]));
    return () => { vivo = false; };
  }, [ollama]);

  const cambiarNivel = async (n) => {
    guardarPreferenciasIA({ nivel: n === capacidades?.recomendado ? undefined : n });
    setNivel(n);
    await revisar(n, claveTexto, claveVoz);
    onCambio?.();
  };

  const cambiarModelo = async (tipo, clave) => {
    if (tipo === 'texto') {
      guardarPreferenciasIA({ modeloTexto: clave === textoRecomendado(capacidades, nivel) ? undefined : clave });
      setClaveTexto(clave);
      await revisar(nivel, clave, claveVoz);
    } else {
      guardarPreferenciasIA({ modeloVoz: clave === vozRecomendada(capacidades, nivel) ? undefined : clave });
      setClaveVoz(clave);
      await revisar(nivel, claveTexto, clave);
    }
    onCambio?.();
  };

  const revisarOllama = async () => {
    setOllama(null);
    olvidarEstadoOllama();
    setOllama(await estadoOllama({ forzar: true }));
  };

  const cambiarMotorTexto = (valor) => {
    guardarPreferenciasIA({ motorTexto: valor === 'auto' ? undefined : valor });
    setMotorTexto(valor);
    onCambio?.();
  };

  const cambiarModeloOllama = (valor) => {
    guardarPreferenciasIA({ modeloOllama: valor || undefined });
    setModeloOllama(valor);
    onCambio?.();
  };

  const cambiarSiempreLocal = (valor) => {
    guardarPreferenciasIA({ siempreLocal: valor });
    olvidarEstadoNube();
    setSiempreLocal(valor);
    onCambio?.();
  };

  const preparar = async (tipo, config = configDe(tipo, claveTexto, claveVoz, nivel)) => {
    if (!config) return false;
    setEstado((e) => ({ ...e, [tipo]: { cargando: true, progreso: 0 } }));
    try {
      await prepararModelo(tipo, config, (p) => setEstado((e) => ({
        ...e,
        [tipo]: { cargando: true, progreso: p.progreso, cargado: p.cargado, total: p.total },
      })));
      setEstado((e) => ({ ...e, [tipo]: { listo: true } }));
      onCambio?.();
      return true;
    } catch (error) {
      setEstado((e) => ({ ...e, [tipo]: { error: error.message } }));
      return false;
    }
  };

  /**
   * "Usar lo sugerido": vuelve a lo recomendado para este equipo (nivel, modelos y motor) y
   * descarga lo que falte en el navegador, primero la voz (pesa poco) y después el de lenguaje.
   */
  const usarSugerido = async () => {
    if (!sugerencia) return;
    const n = sugerencia.nivel;
    const cVoz = sugerencia.voz.opcion.clave;
    const cTexto = textoRecomendado(capacidades, n);
    guardarPreferenciasIA({ nivel: undefined, modeloVoz: undefined, modeloTexto: undefined, motorTexto: undefined });
    setNivel(n);
    setClaveVoz(cVoz);
    setClaveTexto(cTexto);
    setMotorTexto('auto');
    onCambio?.();
    const vozConfig = configDe('voz', cTexto, cVoz, n);
    const textoConfig = sugerencia.texto.motor === 'navegador' ? configDe('texto', cTexto, cVoz, n) : null;
    const [vozLista, textoListo] = await Promise.all([modeloDescargado(vozConfig), modeloDescargado(textoConfig)]);
    setEstado({ voz: { listo: vozLista }, texto: { listo: textoListo } });
    if (!vozLista && !(await preparar('voz', vozConfig))) return;
    if (textoConfig && !textoListo) await preparar('texto', textoConfig);
  };

  /** Bloque de un modelo: selector de opciones, tamaño, estado y descarga. */
  const filaModelo = (tipo, titulo, opciones, opcion, recomendada, pesoDe) => {
    const e = estado[tipo] || {};
    const deshabilitado = tipo === 'texto' && !usaModeloDeTexto;
    return (
      <div className="p-3 border rounded-lg bg-white space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-semibold text-gray-800">{titulo}</div>
          {!deshabilitado && (e.listo
            ? <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full whitespace-nowrap">✓ Descargado</span>
            : (
              <button
                type="button"
                onClick={() => preparar(tipo)}
                disabled={e.cargando || (nube === false && !navigator.onLine)}
                className="text-xs px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 whitespace-nowrap"
              >
                {e.cargando ? 'Descargando…' : `Descargar ${pesoDe(opcion)} MB`}
              </button>
            ))}
        </div>

        {deshabilitado ? (
          <div className="text-xs text-gray-600">
            En el nivel «{NOMBRE_NIVEL[nivel]}» no se usa modelo de lenguaje: en procesador tardaría más de un
            minuto por respuesta. El intérprete de órdenes resuelve el texto al instante.
          </div>
        ) : (
          <>
            <select
              className="w-full border rounded p-2 text-sm text-gray-900 bg-white"
              value={opcion?.clave || ''}
              onChange={(ev) => cambiarModelo(tipo, ev.target.value)}
              disabled={e.cargando}
            >
              {opciones.map((o) => (
                <option key={o.clave} value={o.clave}>
                  {o.nombre} · {pesoDe(o)} MB{o.clave === recomendada ? ' — recomendado para tu equipo' : ''}
                </option>
              ))}
            </select>
            {opcion && <div className="text-xs text-gray-500">{opcion.detalle}</div>}
            {opcion?.memoriaMinimaGB && capacidades?.memoriaGB && capacidades.memoriaGB < opcion.memoriaMinimaGB && (
              <div className="text-xs text-amber-700">
                Este modelo suele pedir {opcion.memoriaMinimaGB} GB de memoria y tu equipo reporta {capacidades.memoriaGB} GB:
                si falla al cargar, elige uno más pequeño.
              </div>
            )}
          </>
        )}

        {e.cargando && (
          <div>
            <div className="h-1.5 bg-gray-200 rounded">
              <div className="h-1.5 bg-indigo-500 rounded transition-all" style={{ width: `${Math.round((e.progreso || 0) * 100)}%` }} />
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              {e.total ? `${mb(e.cargado)} de ${mb(e.total)}` : 'Preparando…'}
            </div>
          </div>
        )}
        {e.error && <div className="text-xs text-red-700">No se pudo preparar: {e.error}</div>}
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
        {/* Los componentes del equipo se muestran en la sugerencia, junto a lo que conviene usar */}
        {usaGraficaIntegrada(capacidades) && <AvisoGraficaIntegrada />}
      </div>

      {sugerencia && (() => {
        const { voz, texto, vista } = sugerencia;
        const textoListo = texto.motor === 'ollama' ? texto.listo : sugeridoListo.texto;
        const pendienteMB = (sugeridoListo.voz ? 0 : voz.mb) + (texto.motor === 'navegador' && !sugeridoListo.texto ? texto.mb : 0);
        const enCurso = estado.voz.cargando ? estado.voz : estado.texto.cargando ? estado.texto : null;
        // Algo elegido a mano que no es lo sugerido (otro nivel, otro modelo, "solo el navegador"...)
        const difiere = nivel !== sugerencia.nivel || motorTexto !== 'auto' || claveVoz !== voz.opcion.clave
          || (texto.motor === 'navegador' && claveTexto !== texto.opcion.clave);
        const faltaOllama = texto.motor === 'ollama' && !texto.listo;
        const sinInternet = nube === false && !navigator.onLine;
        return (
          <div className={`p-3 rounded-lg border space-y-2 ${falta ? 'border-amber-300 bg-amber-50' : 'border-violet-200 bg-violet-50/60'}`} data-tour="sugerencia-ia-local">
            {falta && AVISO_FALTA[falta] && <div className="text-xs font-semibold text-amber-900">{AVISO_FALTA[falta]}</div>}
            <div className="text-sm font-semibold text-violet-900">✨ Sugerido para tu equipo</div>
            <div className="text-[11px] text-gray-600">
              {sugerencia.equipo.join(' · ')}. {sugerencia.porqueNivel}
            </div>
            <ul className="space-y-1.5 text-xs">
              <ItemSugerido icono="🎙️" titulo="Voz a texto" nombre={`${voz.opcion.nombre} · ${voz.mb} MB`} listo={sugeridoListo.voz} porque={voz.porque} />
              <ItemSugerido
                icono="🧠"
                titulo="Pedidos libres"
                nombre={texto.motor === 'ollama'
                  ? `Ollama · ${texto.modelo}${texto.gb ? ` · ≈ ${texto.gb} GB` : ''}`
                  : `${texto.opcion.nombre} en el navegador · ${texto.mb} MB`}
                listo={textoListo}
                porque={`${texto.porque}${texto.alternativa ? ` Con Ollama (${texto.alternativa.modelo}) responde aún mejor.` : ''}`}
              />
              <ItemSugerido
                icono="📷"
                titulo="Leer fotos"
                nombre={conVista?.length
                  ? `Ollama · ${conVista[0].nombre}`
                  : `Ollama · ${vista.modelo}${vista.gb ? ` · ≈ ${vista.gb} GB` : ''}`}
                listo={Boolean(conVista?.length)}
                porque={vista.porque}
              />
            </ul>
            {pendienteMB > 0 || enCurso || difiere ? (
              <button
                type="button"
                onClick={usarSugerido}
                disabled={Boolean(enCurso) || (pendienteMB > 0 && sinInternet)}
                className="w-full px-3 py-2 rounded bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold disabled:opacity-60"
              >
                {enCurso ? `Descargando… ${Math.round((enCurso.progreso || 0) * 100)} %`
                  : pendienteMB > 0 ? `⬇️ Usar lo sugerido y descargar (${pendienteMB} MB)`
                    : '✨ Usar lo sugerido (ya está descargado)'}
              </button>
            ) : (
              <div className="text-xs font-semibold text-green-700">✓ Ya usas lo sugerido y lo del navegador está descargado.</div>
            )}
            {faltaOllama && (
              <button
                type="button"
                onClick={() => descargarGuion(guionConfigurar({ origen: window.location.origin, modelo: texto.modelo, modeloVista: vista.modelo, windows }))}
                className="w-full px-3 py-2 rounded border border-violet-300 bg-white hover:bg-violet-50 text-violet-800 text-xs font-semibold"
              >
                ⬇️ Configurador de Ollama con {texto.modelo} ({windows ? 'configurar-ollama.bat' : 'configurar-ollama.sh'})
              </button>
            )}
            {sinInternet && <div className="text-[11px] text-amber-800">Las descargas necesitan internet (una sola vez).</div>}
            {pendienteMB > 0 && (
              <div className="text-[11px] text-gray-600">
                Lo descargado queda guardado en este navegador y para esta dirección: en otro navegador (Opera, Chrome…)
                se descarga de nuevo. Ollama, en cambio, se instala una vez y sirve para todos.
              </div>
            )}
          </div>
        );
      })()}

      <label className="block text-xs font-semibold text-gray-700">
        Dónde corre la IA local
        <select
          className="mt-1 w-full border rounded p-2 text-sm text-gray-900 bg-white"
          value={nivel || ''}
          onChange={(e) => cambiarNivel(e.target.value)}
        >
          {Object.keys(NOMBRE_NIVEL).map((n) => (
            <option key={n} value={n} disabled={n === 'gpu' && capacidades && !(capacidades.webgpu && capacidades.f16)}>
              {NOMBRE_NIVEL[n]}{capacidades?.recomendado === n ? ' — recomendado' : ''}
            </option>
          ))}
        </select>
      </label>

      {/* Ollama: modelos instalados en el equipo, no en el navegador */}
      <div className="p-3 border rounded-lg bg-white space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-gray-800">🖥️ Ollama en tu equipo</div>
          <button type="button" onClick={revisarOllama} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-100">
            Volver a comprobar
          </button>
        </div>

        {ollama === null && <div className="text-xs text-gray-500">Comprobando…</div>}
        <GuiaOllama ollama={ollama} capacidades={capacidades} onComprobar={revisarOllama} />

        {ollama?.disponible && (
          <>
            <div className="text-xs text-green-700 font-semibold">
              Detectado con {ollama.modelos.length} {ollama.modelos.length === 1 ? 'modelo instalado' : 'modelos instalados'}
            </div>
            {ollama.modelos.length > 0 ? (
              <>
                <select
                  className="w-full border rounded p-2 text-sm text-gray-900 bg-white"
                  value={modeloOllama || modeloOllamaPorDefecto(ollama.modelos) || ''}
                  onChange={(ev) => cambiarModeloOllama(ev.target.value)}
                >
                  {ollama.modelos.map((m) => (
                    <option key={m.nombre} value={m.nombre}>{m.nombre} · {m.mb} MB</option>
                  ))}
                </select>
                <label className="block text-xs text-gray-700">
                  Qué usar para los pedidos libres
                  <select
                    className="mt-1 w-full border rounded p-2 text-sm text-gray-900 bg-white"
                    value={motorTexto}
                    onChange={(ev) => cambiarMotorTexto(ev.target.value)}
                  >
                    <option value="auto">Ollama si está disponible, si no el del navegador (recomendado)</option>
                    <option value="ollama">Solo Ollama</option>
                    <option value="navegador">Solo el modelo del navegador</option>
                  </select>
                </label>
                <div className="text-xs text-gray-500">
                  Los modelos de Ollama viven en tu equipo: no se descargan de nuevo en cada navegador y usan tu
                  tarjeta gráfica con sus propios controladores.
                </div>
              </>
            ) : (
              <div className="text-xs text-amber-700">
                Ollama está corriendo pero no tiene modelos: usa «Solo modelos» en la guía de arriba.
              </div>
            )}
          </>
        )}

      </div>

      {filaModelo('texto', '🧠 Modelo de lenguaje del navegador (si no usas Ollama)', CATALOGO_TEXTO, opcionTexto,
        textoRecomendado(capacidades, nivel), (o) => o?.mb ?? 0)}

      {filaModelo('voz', '🎙️ Voz a texto (Whisper)', CATALOGO_VOZ, opcionVoz,
        vozRecomendada(capacidades, nivel), (o) => (nivel === 'gpu' ? o?.mbGpu : o?.mbCpu) ?? 0)}

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
        Cada modelo se descarga una sola vez y queda guardado en este navegador; si cambias de modelo, el anterior
        sigue guardado. Sin internet también funciona el modo Texto, Voz y Editar; el modo Imagen necesita la IA en la nube.
      </div>
    </div>
  );
}
