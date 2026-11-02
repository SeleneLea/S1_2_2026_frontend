import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cursorParaReanudar, fusionarPorId } from '../utils/fusionHistorial.js';
import { anterioresPorCanal, canalDe } from '../utils/canalesChat.js';
import {
  comoMensaje, guardarCopiaChat, guardarPendientes, leerCopiaChat, leerPendientes, nuevoIdLocal, paraSubir, quitarAceptados,
} from '../utils/chatSinConexion.js';

const SUBIR_POR_VEZ = 100;

/**
 * Chats de la sala (el del equipo y el de la IA compartida): mensajes de todos, propuestas de cambios de la IA,
 * estado de la IA ("atendiendo a…"), historial de quién hizo cada cambio y el resumen de lo
 * que pasó desde la última visita. Todo llega por el mismo socket del tablero.
 * Los mensajes de los dos chats van en una sola lista (cada uno con su `canal`); lo que se pagina
 * y lo que se cuenta como "sin leer" va por canal.
 *
 * Sin conexión: se lee la copia guardada del chat y lo que se escribe (y lo que responde la IA
 * local) queda pendiente; al volver la conexión se comparte con la sala (ver chatSinConexion.js).
 *
 * @param {{id, nombre}|null} usuario  quien usa el tablero (sus pendientes se guardan aparte)
 */
export const useColaboracion = (socket, salaId, usuario = null) => {
  const [mensajes, setMensajes] = useState([]);
  const [propuestas, setPropuestas] = useState([]);
  const [estadoIA, setEstadoIA] = useState({ ocupada: false, atendiendoA: null, enCola: 0 });
  const [cambios, setCambios] = useState([]);
  const [bienvenida, setBienvenida] = useState(null);
  const [cargado, setCargado] = useState(false);
  const [sinLeer, setSinLeer] = useState({ equipo: 0, ia: 0 });
  const [hayAnteriores, setHayAnteriores] = useState({ equipo: false, ia: false });
  const [pendientes, setPendientes] = useState([]);
  const usuarioId = usuario?.id ?? null;
  const usuarioNombre = usuario?.nombre || null;

  const ponerMensaje = useCallback((m) => {
    setMensajes((prev) => {
      const i = prev.findIndex((x) => x.id === m.id);
      if (i >= 0) { const copia = [...prev]; copia[i] = m; return copia; }
      return [...prev, m];
    });
  }, []);
  const ponerPropuesta = useCallback((p) => {
    setPropuestas((prev) => {
      const i = prev.findIndex((x) => x.id === p.id);
      if (i >= 0) { const copia = [...prev]; copia[i] = p; return copia; }
      return [...prev, p];
    });
  }, []);

  // Lo último que se tiene: al reconectar se pide solo lo posterior (sin dejar huecos)
  const mensajesRef = useRef(mensajes);
  mensajesRef.current = mensajes;
  const cambiosRef = useRef(cambios);
  cambiosRef.current = cambios;
  const salaCargadaRef = useRef(null);
  // Hora del servidor de la última respuesta: al reconectar se piden también los mensajes que
  // cambiaron desde entonces (no solo los nuevos)
  const marcaRef = useRef(null);
  const pendientesRef = useRef(pendientes);
  const subirRef = useRef(null);

  /** Cambia los pendientes y los guarda en el navegador. */
  const cambiarPendientes = useCallback((cambio) => {
    const nuevos = cambio(pendientesRef.current);
    pendientesRef.current = nuevos;
    guardarPendientes(salaId, usuarioId, nuevos);
    setPendientes(nuevos);
  }, [salaId, usuarioId]);

  // Otro tablero (también sin conexión): se empieza con la copia guardada de ESE tablero
  useEffect(() => {
    if (!salaId || salaCargadaRef.current === salaId) return;
    salaCargadaRef.current = salaId;
    const copia = leerCopiaChat(salaId);
    mensajesRef.current = copia?.mensajes || [];
    cambiosRef.current = copia?.cambios || [];
    marcaRef.current = null;
    setMensajes(mensajesRef.current);
    setPropuestas(copia?.propuestas || []);
    setCambios(cambiosRef.current);
    setBienvenida(null);
    setHayAnteriores({
      equipo: !!(copia?.hayAnteriores?.equipo || copia?.recortado),
      ia: !!(copia?.hayAnteriores?.ia || copia?.recortado),
    });
    setSinLeer({ equipo: 0, ia: 0 });
  }, [salaId]);

  // Lo pendiente es de cada usuario en cada tablero
  useEffect(() => {
    if (!salaId) return;
    pendientesRef.current = leerPendientes(salaId, usuarioId);
    setPendientes(pendientesRef.current);
  }, [salaId, usuarioId]);

  // Copia del chat para leerlo sin conexión (también después de recargar)
  useEffect(() => {
    if (!salaId) return undefined;
    const reloj = setTimeout(() => guardarCopiaChat(salaId, { mensajes, propuestas, cambios, hayAnteriores }), 800);
    return () => clearTimeout(reloj);
  }, [salaId, mensajes, propuestas, cambios, hayAnteriores]);

  useEffect(() => {
    if (!socket || !salaId) return undefined;
    // Respuestas de una conexión o sala anterior se ignoran
    let vigente = true;
    let subiendo = false;
    // Lo que llega en vivo mientras se esperan las respuestas no lo pisa una respuesta tardía
    const vivos = { mensajes: new Set(), propuestas: new Set(), cambios: new Set() };

    /** Comparte con la sala lo escrito sin conexión, de a tandas, hasta que no quede nada. */
    const subir = () => {
      const lote = pendientesRef.current.slice(0, SUBIR_POR_VEZ);
      if (!vigente || subiendo || !lote.length) return;
      subiendo = true;
      socket.emit('chat:importar', { salaId, mensajes: lote.map(paraSubir) }, (r) => {
        subiendo = false;
        if (!vigente) return;
        // Lo que el servidor guardó (o ya tenía) deja de estar pendiente; el resto se reintenta
        if (r?.aceptados?.length) cambiarPendientes((prev) => quitarAceptados(prev, r.aceptados));
        if (r?.ok && pendientesRef.current.length && r.aceptados?.length) subir();
      });
    };
    subirRef.current = subir;

    const alNuevo = (m) => {
      vivos.mensajes.add(m.id);
      ponerMensaje(m);
      // Uno propio escrito sin conexión que ya llegó a la sala: deja de mostrarse como pendiente
      if (m.idLocal && pendientesRef.current.some((e) => e.idLocal === m.idLocal)) {
        cambiarPendientes((prev) => quitarAceptados(prev, [m.idLocal]));
        return;
      }
      const canal = canalDe(m);
      setSinLeer((n) => ({ ...n, [canal]: n[canal] + 1 }));
    };
    const alActualizado = (m) => { vivos.mensajes.add(m.id); ponerMensaje(m); };
    const alPropuesta = (p) => { vivos.propuestas.add(p.id); ponerPropuesta(p); };
    const alHistorial = (c) => {
      vivos.cambios.add(c.id);
      setCambios((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c].slice(-300)));
    };
    socket.on('chat:nuevo', alNuevo);
    socket.on('chat:actualizado', alActualizado);
    socket.on('propuesta:nueva', alPropuesta);
    socket.on('propuesta:actualizada', alPropuesta);
    socket.on('ia:estado', setEstadoIA);
    socket.on('historial:nuevo', alHistorial);
    socket.on('chat:bienvenida', setBienvenida);

    const pedirMensajes = (despuesDe) => {
      const actualizadosDesde = despuesDe !== undefined ? marcaRef.current : null;
      socket.emit('chat:historial', { salaId, despuesDe, actualizadosDesde }, (r) => {
        if (!vigente || !r?.ok) return;
        if (r.reanudacion && !r.completo) { pedirMensajes(undefined); return; } // faltan demasiados: desde los últimos
        if (r.marca) marcaRef.current = r.marca;
        setMensajes((prev) => fusionarPorId(prev, r.mensajes || [], vivos.mensajes, { descartarPrevios: !r.reanudacion }));
        if (!r.reanudacion) setHayAnteriores(anterioresPorCanal(r));
        setPropuestas((prev) => fusionarPorId(prev, r.propuestas || [], vivos.propuestas));
        if (r.ia) setEstadoIA(r.ia);
        setCargado(true);
        // Ya conectado y al día: lo que se hizo sin conexión se comparte con el equipo
        subir();
      });
    };
    const pedirCambios = (despuesDe) => {
      socket.emit('historial:listar', { salaId, despuesDe }, (r) => {
        if (!vigente || !r?.ok) return;
        if (r.reanudacion && !r.completo) { pedirCambios(undefined); return; }
        setCambios((prev) => fusionarPorId(prev, r.cambios || [], vivos.cambios, { descartarPrevios: !r.reanudacion }).slice(-300));
      });
    };
    pedirMensajes(cursorParaReanudar(mensajesRef.current));
    pedirCambios(cambiosRef.current.length ? cambiosRef.current[cambiosRef.current.length - 1].id : undefined);

    return () => {
      vigente = false;
      if (subirRef.current === subir) subirRef.current = null;
      socket.off('chat:nuevo', alNuevo);
      socket.off('chat:actualizado', alActualizado);
      socket.off('propuesta:nueva', alPropuesta);
      socket.off('propuesta:actualizada', alPropuesta);
      socket.off('ia:estado', setEstadoIA);
      socket.off('historial:nuevo', alHistorial);
      socket.off('chat:bienvenida', setBienvenida);
    };
  }, [socket, salaId, ponerMensaje, ponerPropuesta, cambiarPendientes]);

  /**
   * Algo escrito sin conexión (o lo que respondió la IA local): queda pendiente y se comparte al
   * volver. Si justo volvió la conexión, se comparte enseguida.
   * @param {{canal: 'equipo'|'ia', tipo: 'usuario'|'ia', texto: string, datos?: object}} entrada
   */
  const agregarSinConexion = useCallback((entrada) => {
    const e = { idLocal: nuevoIdLocal(), escritoEn: new Date().toISOString(), datos: {}, ...entrada };
    cambiarPendientes((prev) => [...prev, e]);
    setTimeout(() => subirRef.current?.(), 0);
    return e;
  }, [cambiarPendientes]);

  /** @param {{ajusta?: number}} extras  ajusta: id de la propuesta que se pide ajustar */
  const enviar = useCallback((texto, paraIA = false, extras = {}) => new Promise((resolve) => {
    if (!socket) { resolve({ ok: false, mensaje: 'Sin conexión con el servidor.' }); return; }
    socket.emit('chat:enviar', { salaId, texto, paraIA, ajusta: extras.ajusta || null }, (r) => resolve(r || { ok: false }));
  }), [socket, salaId]);

  /** Foto o audio para la IA: va por HTTP (el socket no está pensado para archivos grandes). */
  const enviarAdjunto = useCallback(async ({ texto = '', imagen = null, audio = null, paraIA = true }) => {
    const datos = new FormData();
    datos.append('texto', texto);
    datos.append('paraIA', String(paraIA));
    if (imagen) datos.append('imagen', imagen, imagen.name || 'imagen.jpg');
    if (audio) datos.append('audio', audio, audio.name || 'audio.webm');
    const base = import.meta.env.VITE_WS_URL || window.location.origin;
    const cabeceras = {};
    try { const token = localStorage.getItem('token'); if (token) cabeceras.Authorization = `Bearer ${token}`; } catch { /* noop */ }
    try {
      const res = await fetch(`${base}/apis/colaboracion/${salaId}/mensajes`, { method: 'POST', body: datos, credentials: 'include', headers: cabeceras });
      const cuerpo = await res.json().catch(() => null);
      return res.ok ? { ok: true, mensaje: cuerpo?.data } : { ok: false, mensaje: cuerpo?.message || 'No se pudo enviar el archivo.' };
    } catch {
      return { ok: false, mensaje: 'Sin conexión con el servidor.' };
    }
  }, [salaId]);

  /** Trae los mensajes de un chat ('equipo' | 'ia') anteriores al más viejo que se ve de ese chat. */
  const cargarAnteriores = useCallback((canal) => new Promise((resolve) => {
    const primero = mensajes.find((m) => canalDe(m) === canal);
    if (!socket || !primero) { resolve(false); return; }
    socket.emit('chat:anteriores', { salaId, canal, antesDe: primero.id }, (r) => {
      if (r?.ok) {
        // Se ordena por id: los anteriores de un chat pueden quedar entre mensajes del otro
        setMensajes((prev) => fusionarPorId(prev, (r.mensajes || []).filter((m) => !prev.some((x) => x.id === m.id))));
        setHayAnteriores((h) => ({ ...h, [canal]: !!r.hayMas }));
      }
      resolve(!!r?.ok);
    });
  }), [socket, salaId, mensajes]);

  /** Código -> diagrama: las diferencias con un proyecto importado quedan como propuesta en el chat de la IA. */
  const proponerDesdeCodigo = useCallback((cambios, origen) => new Promise((resolve) => {
    if (!socket) { resolve({ ok: false, mensaje: 'Sin conexión con el servidor.' }); return; }
    socket.emit('codigo:proponer', { salaId, cambios, origen }, (r) => resolve(r || { ok: false }));
  }), [socket, salaId]);

  const decidir = useCallback((propuestaId, decision) => new Promise((resolve) => {
    if (!socket) { resolve({ ok: false, mensaje: 'Sin conexión con el servidor: decide la propuesta cuando vuelva.' }); return; }
    socket.emit('propuesta:decidir', { salaId, propuestaId, decision }, (r) => resolve(r || { ok: false }));
  }), [socket, salaId]);

  /** La propuesta pendiente más reciente: es la que se muestra en la pizarra. */
  const propuestaPendiente = useMemo(
    () => [...propuestas].reverse().find((p) => p.estado === 'pendiente') || null,
    [propuestas],
  );

  // Lo del servidor y, al final, lo escrito sin conexión que todavía no se compartió
  const mensajesVisibles = useMemo(
    () => (pendientes.length ? [...mensajes, ...pendientes.map((e) => comoMensaje(e, { id: usuarioId, nombre: usuarioNombre }))] : mensajes),
    [mensajes, pendientes, usuarioId, usuarioNombre],
  );

  /**
   * La última revisión con observaciones sobre clases (para marcarlas en la pizarra). Incluye la
   * revisión de la IA local hecha sin conexión, aunque todavía no se haya compartido.
   */
  const ultimaRevision = useMemo(
    () => [...mensajesVisibles].reverse().find((m) => m.tipo === 'ia' && m.datos?.observaciones?.length) || null,
    [mensajesVisibles],
  );

  return {
    mensajes: mensajesVisibles, propuestas, propuestaPendiente, ultimaRevision, estadoIA, cambios, bienvenida, cargado, sinLeer,
    hayAnteriores, enviar, enviarAdjunto, cargarAnteriores, decidir, cerrarBienvenida: () => setBienvenida(null),
    agregarSinConexion, pendientes: pendientes.length, proponerDesdeCodigo,
    // Sin canal: los dos chats
    marcarLeidos: (canal) => setSinLeer((n) => (canal ? { ...n, [canal]: 0 } : { equipo: 0, ia: 0 })),
  };
};

export default useColaboracion;
