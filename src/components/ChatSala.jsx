import { useEffect, useMemo, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import { MessagesSquare, Users, Sparkles, History, Laptop, WifiOff, Clock3, ImageIcon, Mic, Square, Paperclip, Lightbulb, Send, FileDown, ChevronDown, X } from 'lucide-react';
import { canalDe, mencionaALaIA } from '../utils/canalesChat.js';
import { SUGERENCIAS_SIN_CONEXION, pideRevision } from '../utils/respuestaIALocal.js';
import PanelIALocal from './PanelIALocal';

/**
 * Chats de la sala, en el panel "Chat" del estudio: el del equipo (entre personas) y el de la IA
 * compartida, un integrante más. En el de la IA todos ven todo: lo que se le pide, lo que
 * responde y lo que propone. Los cambios de la IA llegan como propuesta, que
 * cualquiera acepta o rechaza. También muestra el historial de quién hizo cada cambio.
 *
 * Sin conexión con el servidor es el MISMO panel: la pestaña de la IA usa la IA local de este
 * equipo (sus cambios se aplican enseguida) y lo que se escribe queda pendiente. Al volver la
 * conexión todo se comparte con la sala, así el equipo sabe qué se hizo sin conexión.
 */

const hora = (fecha) => new Date(fecha).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
const diaYHora = (fecha) => new Date(fecha).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Markdown mínimo y seguro (sin HTML): **negrita**, `código`, listas con "-" y saltos de línea. */
const Texto = ({ texto }) => {
  const enLinea = (linea, k) => linea.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((parte, i) => {
    if (/^\*\*[^*]+\*\*$/.test(parte)) return <strong key={`${k}-${i}`}>{parte.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(parte)) return <code key={`${k}-${i}`}>{parte.slice(1, -1)}</code>;
    return parte;
  });
  return (
    <div className="studio-chat-text">
      {String(texto || '').split('\n').map((linea, i) => {
        const item = linea.match(/^\s*[-*•]\s+(.*)/);
        if (item) return <div key={i} className="studio-chat-bullet">{enLinea(item[1], i)}</div>;
        return <div key={i} className={linea.trim() ? '' : 'studio-chat-gap'}>{enLinea(linea, i)}</div>;
      })}
    </div>
  );
};

const ESTADO_PROPUESTA = {
  pendiente: 'Pendiente: decide el equipo',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  desactualizada: 'Desactualizada',
  reemplazada: 'Reemplazada por un ajuste',
  aplicando: 'Aplicando…',
};

const TarjetaPropuesta = ({ propuesta, onDecidir, onAjustar }) => {
  const [enviando, setEnviando] = useState(false);
  if (!propuesta) return null;
  const estado = ESTADO_PROPUESTA[propuesta.estado] ? propuesta.estado : 'pendiente';
  const etiqueta = ESTADO_PROPUESTA[estado];
  const decidir = async (decision) => {
    setEnviando(true);
    const r = await onDecidir(propuesta.id, decision);
    setEnviando(false);
    if (!r?.ok && r?.mensaje) Swal.fire({ icon: 'info', title: 'No se aplicó', text: r.mensaje });
  };
  return (
    <div className="studio-chat-proposal">
      <div className="studio-chat-proposal-head">
        <strong>Propuesta: {propuesta.resumen?.length || 0} cambio{propuesta.resumen?.length === 1 ? '' : 's'}</strong>
        <span className={`studio-chat-status is-${estado}`}>{etiqueta}</span>
      </div>
      <ul>
        {(propuesta.resumen || []).map((r, i) => <li key={i}>{r}</li>)}
      </ul>
      {propuesta.estado === 'pendiente' ? (
        <>
          <p className="studio-chat-hint">Se ve en la pizarra con borde punteado. Cualquiera del equipo puede decidir.</p>
          <div className="studio-chat-decision">
            <button disabled={enviando} onClick={() => decidir('aceptar')} className="btn-success">Aceptar</button>
            <button disabled={enviando} onClick={() => decidir('rechazar')} className="btn-secondary">Rechazar</button>
            <button disabled={enviando} onClick={() => onAjustar(propuesta.id)} className="studio-chat-link">Pedir ajuste</button>
          </div>
        </>
      ) : (
        propuesta.decididoPorNombre && (
          <p className="studio-chat-hint">
            {etiqueta} por {propuesta.decididoPorNombre}{propuesta.motivo ? `: ${propuesta.motivo}` : ''}
          </p>
        )
      )}
    </div>
  );
};

const Mensaje = ({ m, propio, usuarioId, propuesta, onDecidir, onAjustar, onEnfocarClase, onQuitarMarcas, onAplicarIdea }) => {
  if (m.tipo === 'sistema') {
    return <div className="studio-chat-system"><Texto texto={m.texto} /></div>;
  }
  const esIA = m.tipo === 'ia';
  const d = m.datos || {};
  const deIALocal = esIA && (d.proveedor === 'IA local' && d.sinConexion);
  // De otra persona, hecho sin conexión: se aclara de quién era la IA local
  const ajeno = deIALocal && d.pedidoPor && !d.pendiente && String(d.pedidoPorId) !== String(usuarioId);
  const autor = d.origen === 'codigo' ? <><FileDown size={11} aria-hidden="true" /> Desde el código</>
    : deIALocal ? <><Laptop size={11} aria-hidden="true" /> IA local{ajeno ? ` de ${d.pedidoPor}` : ''}</>
      : esIA ? <><Sparkles size={11} aria-hidden="true" /> IA</>
        : propio ? 'Tú' : m.autorNombre;
  return (
    <div className={`studio-chat-row ${propio ? 'is-own' : ''}`}>
      <div className={`studio-chat-bubble ${esIA ? 'is-ia' : propio ? 'is-own' : ''}`}>
        <div className="studio-chat-meta">
          <span className="studio-chat-author">{autor}</span>
          <span>{hora(d.escritoEn || m.creadoEn)}</span>
          {esIA && d.proveedor && !deIALocal && <span className="studio-chat-tag">{d.proveedor}</span>}
          {d.pendiente && <span className="studio-chat-tag is-warm" title="Se compartirá con el equipo al volver la conexión"><Clock3 size={10} aria-hidden="true" /> al volver</span>}
          {d.sinConexion && !d.pendiente && <span className="studio-chat-tag" title="Escrito sin conexión"><WifiOff size={10} aria-hidden="true" /> sin conexión</span>}
          {!esIA && d.paraIA && <span className="studio-chat-tag">para la IA</span>}
          {!esIA && d.imagen && <span title={d.imagen.nombre}><ImageIcon size={11} aria-label="Con imagen" /></span>}
          {!esIA && d.deAudio && <span title="Transcrito de un audio"><Mic size={11} aria-label="Transcrito de un audio" /></span>}
          {!esIA && d.ajusta && <span className="studio-chat-tag">ajuste</span>}
        </div>
        <Texto texto={m.texto} />
        {esIA && d.observaciones?.length > 0 && (
          <ul className="studio-chat-notes">
            {d.observaciones.map((o, i) => (
              <li key={i}>
                <button
                  onClick={() => o.nodoId && onEnfocarClase(o.nodoId)}
                  className={`studio-chat-observation is-${['error', 'aviso', 'sugerencia'].includes(o.gravedad) ? o.gravedad : 'aviso'} ${o.nodoId ? '' : 'is-static'}`}
                  title={o.nodoId ? 'Ver la clase en la pizarra' : undefined}
                >
                  <strong>{o.clase || 'General'}</strong>: {o.texto}
                </button>
              </li>
            ))}
            <li><button onClick={onQuitarMarcas} className="studio-chat-link">Quitar las marcas de la pizarra</button></li>
          </ul>
        )}
        {esIA && d.ideas?.length > 0 && (
          <ul className="studio-chat-notes">
            {d.ideas.map((idea, i) => (
              <li key={i} className="studio-chat-idea">
                <Lightbulb size={12} aria-hidden="true" /> <span><strong>{idea.titulo}</strong> {idea.texto}{' '}
                <button onClick={() => onAplicarIdea(idea)} className="studio-chat-link" title="La IA arma una propuesta con esta idea">Aplicar idea</button></span>
              </li>
            ))}
            <li className="studio-chat-hint">Quedaron como notas verdes en la pizarra.</li>
          </ul>
        )}
        {esIA && d.propuesta && <TarjetaPropuesta propuesta={propuesta} onDecidir={onDecidir} onAjustar={onAjustar} />}
      </div>
    </div>
  );
};

const SUGERENCIAS = [
  ['Revisar el diagrama', 'Revisa el diagrama completo y dime qué corregir'],
  ['¿Qué hicieron?', '¿Qué hizo cada uno hoy en el diagrama?'],
  ['Ideas', 'Dame ideas para mejorar este diseño'],
];

// Las sugerencias de pedidos ocupan espacio y se pueden esconder; la elección queda guardada en este navegador
const SUGERENCIAS_OCULTAS = 'chat.sugerenciasOcultas';
const sugerenciasOcultas = () => {
  try { return localStorage.getItem(SUGERENCIAS_OCULTAS) === '1'; } catch { return false; }
};

const Historial = ({ cambios }) => {
  const [autor, setAutor] = useState('');
  const autores = useMemo(() => [...new Set(cambios.map((c) => (c.esIA ? 'IA' : c.autorNombre)).filter(Boolean))], [cambios]);
  const lista = [...cambios].reverse().filter((c) => !autor || (autor === 'IA' ? c.esIA : c.autorNombre === autor && !c.esIA));
  return (
    <div className="studio-chat-history">
      <select value={autor} onChange={(e) => setAutor(e.target.value)} className="select-modern" aria-label="Filtrar por integrante">
        <option value="">Todos los integrantes</option>
        {autores.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      {!lista.length && <p className="studio-chat-hint">Todavía no hay cambios registrados.</p>}
      {lista.map((c) => (
        <div key={c.id} className={`studio-chat-change ${c.esIA ? 'is-ia' : ''}`}>
          <span>{diaYHora(c.creadoEn)}</span>
          <p>
            <strong>{c.esIA ? (c.autorNombre === 'IA local' ? 'IA local' : 'IA') : c.autorNombre}</strong>
            {c.esIA && <em> (pedido por {c.pedidoPor}{c.aprobadoPor ? `, aprobado por ${c.aprobadoPor}` : ''})</em>}
            {' '}{c.resumen}
          </p>
        </div>
      ))}
    </div>
  );
};

/**
 * Grabar audio con el micrófono: con conexión lo transcribe la IA del servidor y sin conexión
 * Whisper en este equipo. Es el único micrófono del chat: el dictado del navegador
 * (SpeechRecognition) depende de un servicio en línea y en muchos navegadores no hacía nada.
 */
const useGrabadora = (alTerminar) => {
  const [grabando, setGrabando] = useState(false);
  const grabadoraRef = useRef(null);
  const alternar = async () => {
    if (grabando) { grabadoraRef.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      Swal.fire({ icon: 'info', title: 'Grabación no disponible', text: 'Este navegador no permite grabar audio. Sube un archivo de audio con el botón Adjuntar.' });
      return;
    }
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const grabadora = new MediaRecorder(flujo);
      const partes = [];
      grabadora.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
      grabadora.onstop = () => {
        flujo.getTracks().forEach((pista) => pista.stop());
        setGrabando(false);
        const tipo = grabadora.mimeType || 'audio/webm';
        alTerminar(new File(partes, `audio-${Date.now()}.webm`, { type: tipo }));
      };
      grabadoraRef.current = grabadora;
      grabadora.start();
      setGrabando(true);
    } catch {
      Swal.fire({ icon: 'error', title: 'Sin micrófono', text: 'No se pudo usar el micrófono. Revisa el permiso del navegador.' });
    }
  };
  return { grabando, alternar };
};

/** Pestañas del panel: los dos chats de la sala y el historial de cambios. */
const PESTANAS = [
  ['equipo', 'Equipo', Users],
  ['ia', 'IA del equipo', Sparkles],
  ['historial', 'Quién hizo qué', History],
];

/**
 * @param {boolean} abierto  el panel del chat se ve (lo visto queda leído)
 * @param {boolean} enLinea  hay conexión con el servidor (si no, trabaja la IA local)
 * @param {{pedir, leerImagen, transcribir}} iaLocal  la IA local de este equipo (hooks/useIALocal)
 */
export default function ChatSala({ colaboracion, currentUser, onEnfocarClase, onQuitarMarcas, abierto, setAbierto, enLinea = true, iaLocal = null, pedidoExterno = null }) {
  const {
    mensajes, propuestas, estadoIA, cambios, bienvenida, sinLeer, hayAnteriores,
    enviar, enviarAdjunto, cargarAnteriores, decidir, cerrarBienvenida, marcarLeidos, agregarSinConexion, pendientes = 0,
  } = colaboracion;
  // Panel de la IA local (modelos, Ollama) y la IA local trabajando en un pedido. El panel puede
  // abrirse por un modelo que faltó: 'voz' | 'texto' | 'vista' (lo destaca arriba con la sugerencia)
  const [panelLocal, setPanelLocal] = useState(false);
  const [trabajandoLocal, setTrabajandoLocal] = useState(false);
  const sinConexion = !enLinea;
  const [pestana, setPestana] = useState('equipo');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Propuesta que se está ajustando y archivo adjunto (foto o audio) del próximo mensaje
  const [ajustando, setAjustando] = useState(null);
  const [adjunto, setAdjunto] = useState(null);
  const [sinSugerencias, setSinSugerencias] = useState(sugerenciasOcultas);
  const ocultarSugerencias = (ocultar) => {
    setSinSugerencias(ocultar);
    try {
      if (ocultar) localStorage.setItem(SUGERENCIAS_OCULTAS, '1');
      else localStorage.removeItem(SUGERENCIAS_OCULTAS);
    } catch { /* sin almacenamiento: vale para esta sesión */ }
  };
  const archivoRef = useRef(null);
  const grabadora = useGrabadora((archivo) => setAdjunto({ tipo: 'audio', archivo }));
  const finRef = useRef(null);
  const entradaRef = useRef(null);
  const propuestaPorId = useMemo(() => new Map(propuestas.map((p) => [p.id, p])), [propuestas]);
  const enChat = pestana === 'equipo' || pestana === 'ia';
  const deIA = pestana === 'ia';
  const visibles = useMemo(() => (enChat ? mensajes.filter((m) => canalDe(m) === pestana) : []), [mensajes, pestana, enChat]);

  // Lo que se ve queda leído; lo del otro chat sigue contando en su pestaña
  useEffect(() => { if (abierto && enChat) marcarLeidos(pestana); }, [abierto, pestana, visibles.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (abierto && enChat) finRef.current?.scrollIntoView({ block: 'end' }); }, [abierto, pestana, visibles.length, estadoIA.ocupada]); // eslint-disable-line react-hooks/exhaustive-deps
  // El resumen de bienvenida abre el panel del chat
  useEffect(() => { if (bienvenida) setAbierto(true); }, [bienvenida]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pedido desde fuera del chat (por ejemplo "Verificar Diagrama" sin conexión): va al chat de la IA
  const ultimoPedidoRef = useRef(null);
  useEffect(() => {
    if (!pedidoExterno || ultimoPedidoRef.current === pedidoExterno.n) return;
    ultimoPedidoRef.current = pedidoExterno.n;
    setPestana(pedidoExterno.pestana || 'ia');
    if (sinConexion && pedidoExterno.texto) mandarSinConexion(true, pedidoExterno.texto);
  }, [pedidoExterno]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiarPestana = (p) => {
    setPestana(p);
    // Una foto o un ajuste son solo para la IA: no se arrastran al chat del equipo
    if (p !== 'ia') { setAjustando(null); if (adjunto?.tipo === 'imagen') setAdjunto(null); }
  };

  /**
   * Sin conexión: el mensaje queda pendiente; si es para la IA, la IA local lo resuelve aquí mismo
   * (sus cambios se aplican enseguida) y su respuesta también queda para compartir al volver.
   */
  const mandarSinConexion = async (paraIA, limpio) => {
    if (!agregarSinConexion) return;
    let pedido = limpio;
    let deAudio = false;
    setEnviando(true);
    try {
      if (adjunto?.tipo === 'audio') {
        const transcripcion = iaLocal ? await iaLocal.transcribir(adjunto.archivo) : null;
        if (transcripcion === null) {
          setPanelLocal('voz');
          return;
        }
        if (!transcripcion.trim()) {
          Swal.fire({ icon: 'info', title: 'No se entendió el audio', text: 'Graba de nuevo hablando cerca del micrófono.' });
          return;
        }
        pedido = [limpio, transcripcion.trim()].filter(Boolean).join(' ');
        deAudio = true;
      }
      const imagen = adjunto?.tipo === 'imagen' ? adjunto.archivo : null;
      const canal = paraIA ? 'ia' : 'equipo';
      agregarSinConexion({
        canal, tipo: 'usuario',
        texto: pedido || (imagen ? 'Pásale esta imagen al diagrama.' : ''),
        datos: { ...(paraIA ? { paraIA: true } : {}), ...(deAudio ? { deAudio: true } : {}), ...(imagen ? { imagen: { nombre: imagen.name } } : {}) },
      });
      setTexto('');
      setAdjunto(null);
      if (!paraIA) return;
      if (!deIA) setPestana('ia');
      if (!iaLocal) return;
      setTrabajandoLocal(true);
      try {
        // "Revisa el diagrama", "¿qué corregir?": revisión sin internet (reglas + Ollama), no cambia nada
        const r = imagen ? await iaLocal.leerImagen(imagen, pedido)
          : pideRevision(pedido) && iaLocal.revisar ? await iaLocal.revisar()
            : await iaLocal.pedir(pedido);
        agregarSinConexion({ canal: 'ia', tipo: 'ia', texto: r.texto, datos: r.datos });
        if (r.abrirPanel) setPanelLocal(r.falta || true);
      } catch (error) {
        agregarSinConexion({ canal: 'ia', tipo: 'ia', texto: `La IA local no pudo responder: ${error?.message || 'error desconocido'}.`, datos: { motor: 'error', cambios: 0 } });
      } finally {
        setTrabajandoLocal(false);
      }
    } finally {
      setEnviando(false);
    }
  };

  const mandar = async () => {
    const limpio = texto.trim();
    if ((!limpio && !adjunto) || enviando || trabajandoLocal) return;
    // En el chat del equipo, mencionar a @IA también le pide algo (el mensaje va al chat de la IA)
    const paraIA = deIA || mencionaALaIA(limpio);
    if (sinConexion) { await mandarSinConexion(paraIA, limpio); return; }
    setEnviando(true);
    const r = adjunto
      ? await enviarAdjunto({ texto: limpio, paraIA, [adjunto.tipo === 'imagen' ? 'imagen' : 'audio']: adjunto.archivo })
      : await enviar(limpio, paraIA || !!ajustando, { ajusta: ajustando });
    setEnviando(false);
    if (r?.ok) {
      setTexto('');
      setAdjunto(null);
      setAjustando(null);
      if (paraIA && !deIA) setPestana('ia');
    } else Swal.fire({ icon: 'error', title: 'No se envió', text: r?.mensaje || 'Revisa tu conexión.' });
  };

  // "Pedir ajuste": el próximo mensaje rehace esa propuesta (la anterior queda reemplazada)
  const ajustar = (propuestaId) => {
    setAjustando(propuestaId);
    setPestana('ia');
    setTimeout(() => entradaRef.current?.focus(), 50);
  };

  const aplicarIdea = async (idea) => {
    const r = await enviar(`Aplica esta idea en el diagrama: ${idea.titulo ? `${idea.titulo}: ` : ''}${idea.texto}`, true);
    if (!r?.ok) Swal.fire({ icon: 'error', title: 'No se envió', text: r?.mensaje || 'Revisa tu conexión.' });
  };

  const elegirArchivo = (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (archivo.size > 10 * 1024 * 1024) {
      Swal.fire({ icon: 'info', title: 'Archivo muy grande', text: 'El máximo es 10 MB.' });
      return;
    }
    setAdjunto({ tipo: archivo.type.startsWith('audio/') ? 'audio' : 'imagen', archivo });
  };

  return (
    <div className="studio-chat" data-tour="chat-sala">
      <div className="studio-ai-heading">
        <div>
          <span className="studio-ai-mark"><MessagesSquare size={18} aria-hidden="true" /></span>
          <div>
            <div className="studio-ai-title">Tu equipo y la IA</div>
            <div className="studio-ai-subtitle">{sinConexion ? 'Sin conexión: responde la IA local.' : 'Todos ven lo que se pide y se propone.'}</div>
          </div>
        </div>
        <div className="studio-ai-heading-actions">
          {/* Con conexión solo se PREPARA (descargas, Ollama): la IA local responde sin conexión */}
          <button
            onClick={() => setPanelLocal((v) => !v)}
            className={`studio-ai-local ${panelLocal ? 'is-active' : ''}`}
            aria-expanded={!!panelLocal}
            title={sinConexion ? 'Modelos de la IA local de este equipo' : 'Preparar la IA local para trabajar sin internet (Ollama y modelos)'}
          ><Laptop size={14} aria-hidden="true" /> {sinConexion ? 'IA local' : 'Sin internet'}</button>
        </div>
      </div>

      <div className="studio-chat-tabs" role="tablist" aria-label="Chats de la sala">
        {PESTANAS.map(([id, etiqueta, Icono]) => (
          <button
            key={id}
            role="tab"
            aria-selected={pestana === id}
            onClick={() => cambiarPestana(id)}
          >
            <Icono size={15} aria-hidden="true" />
            <span>{etiqueta}</span>
            {id === 'ia' && (estadoIA.ocupada || trabajandoLocal) && <i className="studio-chat-pulse" title="La IA está trabajando" />}
            {sinLeer[id] > 0 && pestana !== id && <b className="studio-chat-badge">{sinLeer[id]}</b>}
          </button>
        ))}
      </div>

      {sinConexion && (
        <div className="studio-chat-banner is-warm">
          <WifiOff size={13} aria-hidden="true" />
          <span>Sin conexión con el servidor. La IA local trabaja en este equipo y sus cambios se aplican enseguida.
          Lo que escribas y lo que haga se compartirá con el equipo al volver{pendientes ? ` (${pendientes} pendiente${pendientes === 1 ? '' : 's'})` : ''}.</span>
        </div>
      )}
      {!sinConexion && pendientes > 0 && (
        <div className="studio-chat-banner">Compartiendo con el equipo lo escrito sin conexión…</div>
      )}

      {panelLocal ? (
        <div className="studio-ai-local-panel">
          <PanelIALocal onCerrar={() => setPanelLocal(false)} onCambio={() => {}} falta={typeof panelLocal === 'string' ? panelLocal : null} />
        </div>
      ) : pestana === 'historial' ? <Historial cambios={cambios} /> : (
        <>
          {bienvenida && (
            <div className="studio-chat-welcome">
              <Texto texto={bienvenida.texto} />
              <button onClick={cerrarBienvenida} className="icon-button" aria-label="Cerrar resumen"><X size={14} /></button>
            </div>
          )}
          <div className="studio-chat-messages">
            {hayAnteriores[pestana] && (
              <button onClick={() => cargarAnteriores(pestana)} className="studio-chat-link studio-chat-older">Cargar mensajes anteriores</button>
            )}
            {!visibles.length && (deIA && sinConexion ? (
              <div className="studio-chat-empty">
                <span><Laptop size={20} aria-hidden="true" /></span>
                <p>Sin conexión trabaja la IA local de este equipo: entiende órdenes como "agrega la clase Producto con nombre y precio".</p>
                <p>Con un modelo descargado (IA local) entiende pedidos libres y lee fotos con Ollama.</p>
              </div>
            ) : deIA ? (
              <div className="studio-chat-empty">
                <span><Sparkles size={20} aria-hidden="true" /></span>
                <p>La IA es un integrante más del equipo: todos ven lo que le piden y lo que responde.</p>
                <p>Sus cambios llegan como propuesta que el equipo acepta o rechaza.</p>
              </div>
            ) : (
              <div className="studio-chat-empty">
                <span><Users size={20} aria-hidden="true" /></span>
                <p>Chat entre los integrantes de la sala. La IA no interviene aquí.</p>
                <p>Para pedirle algo, usa la pestaña <strong>IA del equipo</strong> o escribe <strong>@IA</strong>.</p>
              </div>
            ))}
            {visibles.map((m) => (
              <Mensaje
                key={m.id}
                m={m}
                propio={m.tipo === 'usuario' && currentUser && String(m.autorId) === String(currentUser.id)}
                usuarioId={currentUser?.id}
                propuesta={m.datos?.propuesta?.id ? propuestaPorId.get(m.datos.propuesta.id) : null}
                onDecidir={decidir}
                onAjustar={ajustar}
                onEnfocarClase={onEnfocarClase}
                onQuitarMarcas={onQuitarMarcas}
                onAplicarIdea={aplicarIdea}
              />
            ))}
            {deIA && trabajandoLocal && (
              <div className="studio-chat-typing"><i className="studio-chat-pulse" /> La IA local está trabajando en este equipo…</div>
            )}
            {deIA && !sinConexion && estadoIA.ocupada && (
              <div className="studio-chat-typing">
                <i className="studio-chat-pulse" /> La IA está atendiendo a {estadoIA.atendiendoA}…{estadoIA.enCola > 0 ? ` (${estadoIA.enCola} en cola)` : ''}
              </div>
            )}
            <div ref={finRef} />
          </div>
          <div className="studio-chat-composer">
            {deIA && !sinSugerencias && (
              <div className="studio-chat-suggestions">
                {(sinConexion ? [SUGERENCIAS[0], ...SUGERENCIAS_SIN_CONEXION.map((s) => [s, s])] : SUGERENCIAS).map(([etiqueta, pedido]) => (
                  <button key={etiqueta} onClick={() => setTexto(pedido)} className="studio-chat-chip">{etiqueta}</button>
                ))}
                <button onClick={() => ocultarSugerencias(true)} className="studio-chat-link studio-chat-hide" title="Esconder las sugerencias para dejar más espacio al chat (vuelven con el botón de la bombilla)"><ChevronDown size={12} aria-hidden="true" /> Esconder</button>
              </div>
            )}
            {(ajustando || adjunto) && (
              <div className="studio-chat-suggestions">
                {ajustando && (
                  <span className="studio-chat-chip is-static">
                    Ajustando la propuesta: escribe qué cambiar <button onClick={() => setAjustando(null)} aria-label="Cancelar ajuste"><X size={11} /></button>
                  </span>
                )}
                {adjunto && (
                  <span className="studio-chat-chip is-static">
                    {adjunto.tipo === 'imagen' ? <ImageIcon size={12} aria-hidden="true" /> : <Mic size={12} aria-hidden="true" />} {adjunto.archivo.name} <button onClick={() => setAdjunto(null)} aria-label="Quitar adjunto"><X size={11} /></button>
                  </span>
                )}
              </div>
            )}
            <textarea
              ref={entradaRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mandar(); }
              }}
              rows={2}
              maxLength={4000}
              aria-label={deIA ? 'Pedido para la IA del equipo' : 'Mensaje para el equipo'}
              placeholder={ajustando ? 'Qué cambiar de la propuesta…'
                : deIA ? (sinConexion ? 'Pídele algo a la IA local (se compartirá al volver)…' : 'Pídele algo a la IA (todo el equipo lo ve)…')
                  : (sinConexion ? 'Escribe al equipo (se enviará al volver)…' : 'Escribe al equipo…')}
            />
            <div className="studio-chat-actions">
              <input ref={archivoRef} type="file" accept={deIA ? 'image/*,audio/*' : 'audio/*'} hidden onChange={elegirArchivo} />
              <button onClick={() => archivoRef.current?.click()} className="studio-chat-tool" aria-label="Adjuntar" title={deIA ? 'Adjuntar una foto (pizarra, captura) o un audio' : 'Adjuntar un audio (se transcribe)'}><Paperclip size={15} /></button>
              {deIA && sinSugerencias && (
                <button onClick={() => ocultarSugerencias(false)} className="studio-chat-tool" aria-label="Mostrar sugerencias" title="Mostrar las sugerencias de pedidos"><Lightbulb size={15} /></button>
              )}
              <button onClick={grabadora.alternar} className={`studio-chat-tool ${grabadora.grabando ? 'is-recording' : ''}`} aria-label={grabadora.grabando ? 'Terminar la grabación' : 'Grabar un audio'} title={grabadora.grabando ? 'Terminar la grabación' : 'Grabar un audio (se transcribe)'}>{grabadora.grabando ? <Square size={13} /> : <Mic size={15} />}</button>
              {deIA ? (
                <button onClick={mandar} disabled={(!texto.trim() && !adjunto) || enviando || trabajandoLocal} className="studio-ai-send"><Sparkles size={14} aria-hidden="true" /> {sinConexion ? 'Pedir a la IA local' : 'Pedir a la IA'}</button>
              ) : (
                <button onClick={mandar} disabled={(!texto.trim() && !adjunto) || enviando} className="studio-ai-send"><Send size={14} aria-hidden="true" /> {sinConexion ? 'Enviar al volver' : 'Enviar al equipo'}</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
