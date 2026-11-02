import { Workflow, Plus, Upload, LayoutGrid } from 'lucide-react';
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
// Use backend endpoints instead of Firestore
import Swal from "sweetalert2";
import BoardList from "../components/board/BoardList";
import BoardModals from "../components/board/BoardModals";
import { prepararImportacionXmi } from "../utils/xmlImporter.js";
import { prepararImportacionEAP } from "../utils/eapImporter.js";
import { leerArchivosJava, modeloDesdeJava, diagramaDesdeModelo } from "../utils/importarCodigo.js";
import Tour from "../components/tutorial/Tour.jsx";
import BotonAyuda from "../components/tutorial/BotonAyuda.jsx";
import { TOUR_TABLEROS, tourVisto, marcarTourVisto, marcarTarea } from "../components/tutorial/guiones.js";
import { borrarUsuarioLocal, esErrorDeRed, guardarListaLocal, guardarUsuarioLocal, leerListaLocal, leerUsuarioLocal } from "../offline/almacenTableros.js";
import { errorDeRespuesta, mensajeDeError } from '../utils/mensajesError';

const useBoardState = () => {
  const [description, setDescription] = useState("");
  const [boardList, setBoardList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentBoardId, setCurrentBoardId] = useState(null);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [editModalIsOpen, setEditModalIsOpen] = useState(false);
  const [inviteModalIsOpen, setInviteModalIsOpen] = useState(false);
  // Enlace de invitación firmado por el servidor (el número de la sala solo no da acceso)
  const [enlaceInvitacion, setEnlaceInvitacion] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [xmlContent, setXmlContent] = useState(""); // Nuevo estado para XML

  return {
    description,
    setDescription,
    boardList,
    setBoardList,
    loading,
    setLoading,
    currentBoardId,
    setCurrentBoardId,
    modalIsOpen,
    setModalIsOpen,
    editModalIsOpen,
    setEditModalIsOpen,
    inviteModalIsOpen,
    setInviteModalIsOpen,
    enlaceInvitacion,
    setEnlaceInvitacion,
    inviteEmail,
    setInviteEmail,
    xmlContent,      // Añadir estas
    setXmlContent    // dos líneas
  };
};

const Board = () => {
  const navigate = useNavigate();
  const boardApiBase = `${import.meta.env.VITE_WS_URL || window.location.origin}/apis/sala`;

  const [user, setUser] = useState(null);
  const [tourAbierto, setTourAbierto] = useState(false);
  const boardState = useBoardState();
  const {
    description,
    setDescription,
    boardList,
    setBoardList,
    loading,
    setLoading,
    currentBoardId,
    setCurrentBoardId,
    modalIsOpen,
    setModalIsOpen,
    editModalIsOpen,
    setEditModalIsOpen,
    inviteModalIsOpen,
    setInviteModalIsOpen,
    enlaceInvitacion,
    setEnlaceInvitacion,
    inviteEmail,
    setInviteEmail,
    xmlContent,        // Añadir estas
    setXmlContent     // dos líneas
  } = boardState;


  useEffect(() => {
    // Check session via backend profile
    let mounted = true;
    (async () => {
      try {
        const base = import.meta.env.VITE_WS_URL || window.location.origin;
        const url = `${base}/apis`;

        // First attempt: cookie-based credentialed request
        let res = await fetch(url, { credentials: 'include' });
        if (!mounted) return;

        // Parse payload carefully: backend sometimes wraps { error, data }
        let payload = await res.json().catch(() => null);

        // If we got a wrapper like { error, data } use payload.data
        let profile = payload && payload.data ? payload.data : payload;

        // If unauthorized or profile looks empty, try Authorization fallback using localStorage token
        if ((!res.ok || !profile || Object.keys(profile).length === 0) && res.status !== 200) {
          // try fallback token
          const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('accessToken');
          if (token) {
            res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            payload = await res.json().catch(() => null);
            profile = payload && payload.data ? payload.data : payload;
          }
        }

        if (!mounted) return;

        if (res.ok && profile && profile.id) {
          setUser({ email: profile.email, id: profile.id, name: profile.name || profile.fullname || profile.username });
          guardarUsuarioLocal({ email: profile.email, id: profile.id, name: profile.name || profile.fullname || profile.username });
          setLoading(false);
        } else {
          // Not authenticated - go to login
          setUser(null);
          borrarUsuarioLocal();
          navigate('/login');
        }
      } catch (err) {
        // Sin conexión con el servidor: se muestran los tableros guardados en este equipo
        const guardado = leerUsuarioLocal();
        if (guardado && mounted) {
          setUser(guardado);
          setLoading(false);
          return;
        }
        console.error('Error fetching profile:', err);
        setUser(null);
        navigate('/login');
      }
    })();
    return () => { mounted = false; };
  }, [navigate]);

  const getBoardList = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const res = await fetch(`${boardApiBase}`, { credentials: 'include', cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      const status = res.status;
  const raw = await res.json().catch(() => null);
  // console.debug('getBoardList response status:', status, 'raw:', raw);
  if (!res.ok) {
        // If server returned 401/403, force logout or redirect
        if (status === 401 || status === 403) {
          navigate('/login');
          return;
        }
        throw errorDeRespuesta(res, raw, 'No se pudieron cargar tus tableros.');
      }

      // Normalize rows to expected shape (id, title, description)
      // Backend returns { error: boolean, data: [] } so accept either that wrapper or a direct array
      const unwrap = (payload) => Array.isArray(payload)
        ? payload
        : (payload && Array.isArray(payload.data) ? payload.data : (payload && Array.isArray(payload.rows) ? payload.rows : []));

      let rows = unwrap(raw);

      // Añadir tableros donde el usuario fue invitado (tabla Usersala)
      try {
        const invitedRes = await fetch(`${import.meta.env.VITE_WS_URL || window.location.origin}/apis/usersala`, { credentials: 'include', cache: 'no-store' });
        if (invitedRes.ok) {
          const invitedRaw = await invitedRes.json().catch(() => null);
          const invitedRows = unwrap(invitedRaw);
          const ownIds = new Set(rows.map(r => r.id));
          invitedRows.forEach(r => {
            if (!ownIds.has(r.id)) rows.push({ ...r, invited: true });
          });
        }
      } catch (invErr) {
        console.warn('No se pudieron cargar los tableros invitados:', invErr);
      }

      const normalized = rows.map(item => {
        // tolerate different casing and DB column names
        const id = item.id ?? item.pk ?? item.ID ?? item.Id ?? item.pk_id ?? item.PK;
        const title = item.title ?? item.description ?? item.name ?? item.titulo ?? item.Title;
        const descriptionField = item.description ?? item.title ?? item.descripcion ?? '';
        const host = item.host ?? item.userId ?? item.userid ?? item.user_id ?? item.userid ?? item.UserId;
        const participantes = item.participantes ?? item.participans ?? item.participants ?? [];
        return {
          id,
          title,
          description: descriptionField,
          host,
          participantes,
          invited: !!item.invited
        };
      });
  // console.debug('Normalized boards:', normalized);
      setBoardList(normalized || []);
      guardarListaLocal(normalized || []);
    } catch (error) {
      if (esErrorDeRed(error)) {
        // Sin conexión: la última lista conocida (cada tablero abre con su copia local)
        setBoardList(leerListaLocal());
        return;
      }
      console.error("Error al obtener tableros:", error);
      Swal.fire({ icon: "error", title: "Error", text: "No se pudieron cargar los tableros" });
      // ensure UI receives an array to avoid downstream crashes
      setBoardList([]);
    } finally {
      setLoading(false);
    }
  }, [user, setBoardList, boardApiBase]);

  useEffect(() => {
    if (user) {
      getBoardList();
    }
  }, [getBoardList, user]);

  // El tour de bienvenida se muestra una sola vez, ya con sesión iniciada
  useEffect(() => {
    if (user && !tourVisto('tableros')) {
      const t = setTimeout(() => setTourAbierto(true), 700);
      return () => clearTimeout(t);
    }
  }, [user]);

  useEffect(() => {
    if (xmlContent && user) {
      getBoardList();
    }
  }, [xmlContent, getBoardList, user]);




  // Modal actions
  const closeAllModals = useCallback(() => {
    setModalIsOpen(false);
    setEditModalIsOpen(false);
    setInviteModalIsOpen(false);
    setDescription("");
    setInviteEmail("");
  }, [setModalIsOpen, setEditModalIsOpen, setInviteModalIsOpen, setDescription, setInviteEmail]);

  // CRUD operations
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "El nombre del tablero es obligatorio",
      });
      return;
    }

    try {
      const res = await fetch(boardApiBase, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // Backend expects `title` (required) and optional `description` and `xml`.
        body: JSON.stringify({ title: description, description })
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('Create board failed:', res.status, result);
        const msg = result.message || (result.messages && result.messages.join(', ')) || 'No se pudo crear el tablero';
        Swal.fire({ icon: 'error', title: 'Error', text: msg });
        return;
      }

      // success
      marcarTarea('tablero');
      await getBoardList();
      closeAllModals();

      Swal.fire({
        icon: "success",
        title: "¡Tablero creado!",
        text: "Tu tablero ha sido agregado exitosamente",
      });
    } catch (error) {
      console.error("Error al crear tablero:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo crear el tablero",
      });
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "El nombre del tablero es obligatorio",
      });
      return;
    }

    try {
      const res = await fetch(`${boardApiBase}/${currentBoardId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // Send title/description fields expected by backend
        body: JSON.stringify({ title: description, description, updatedAt: new Date() })
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('Edit board failed:', res.status, result);
        const msg = result.message || (result.messages && result.messages.join(', ')) || 'No se pudo editar el tablero';
        Swal.fire({ icon: 'error', title: 'Error', text: msg });
        return;
      }

      await getBoardList();
      closeAllModals();

      Swal.fire({
        icon: "success",
        title: "¡Tablero actualizado!",
        text: "Tu tablero ha sido editado exitosamente",
      });
    } catch (error) {
      console.error("Error al editar tablero:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo editar el tablero",
      });
    }
  };

  const handleInviteUser = async (email) => {
    if (!email || !currentBoardId) return;

    try {
      const res = await fetch(`${import.meta.env.VITE_WS_URL || window.location.origin}/apis/usersala`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salas_id: Number(currentBoardId), email })
      });

      const result = await res.json().catch(() => ({}));
      // El backend envuelve las respuestas como { error, data }; el error real viene en data
      const payload = result && result.data ? result.data : result;

      if (!res.ok || (payload && payload.error)) {
        const msg = (payload && payload.message) || result.message || 'No se pudo invitar al usuario';
        Swal.fire({
          icon: res.status === 409 ? 'warning' : 'error',
          title: res.status === 409 ? 'Usuario ya invitado' : 'Error',
          text: msg,
        });
        return;
      }

      Swal.fire({
        icon: "success",
        title: "¡Usuario invitado!",
        text: "El usuario ha sido invitado exitosamente",
      });

      closeAllModals();
    } catch (error) {
      console.error("Error al invitar usuario:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo invitar al usuario",
      });
    }
  };

  const handleDeleteBoard = async (boardId) => {
    try {
      const result = await Swal.fire({
        title: "¿Estás seguro?",
        text: "No podrás revertir esta acción",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonColor: "#3085d6",
        confirmButtonText: "Sí, eliminar",
        cancelButtonText: "Cancelar"
      });

      if (result.isConfirmed) {
    await fetch(`${boardApiBase}/${boardId}`, { method: 'DELETE', credentials: 'include' });
        await getBoardList();

        Swal.fire(
          "¡Eliminado!",
          "El tablero ha sido eliminado.",
          "success"
        );
      }
    } catch (error) {
      console.error("Error al eliminar tablero:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo eliminar el tablero",
      });
    }
  };

  /** Pide al servidor una invitación firmada para la sala (solo la obtiene el dueño). */
  const pedirEnlaceInvitacion = async (boardId) => {
    const base = import.meta.env.VITE_WS_URL || window.location.origin;
    const res = await fetch(`${base}/apis/colaboracion/${boardId}/invitacion`, { credentials: 'include' });
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok || !cuerpo?.data?.token) throw new Error(cuerpo?.message || 'No se pudo crear la invitación.');
    return `${window.location.origin}/board/${boardId}?invitacion=${encodeURIComponent(cuerpo.data.token)}`;
  };

  const abrirInvitacion = async (boardId) => {
    setCurrentBoardId(boardId);
    setEnlaceInvitacion(null);
    setInviteModalIsOpen(true);
    try {
      setEnlaceInvitacion(await pedirEnlaceInvitacion(boardId));
    } catch (error) {
      setEnlaceInvitacion({ error: error.message });
    }
  };

  const handleCopyLink = async (boardId) => {
    let link = typeof enlaceInvitacion === 'string' ? enlaceInvitacion : null;
    try {
      if (!link) link = await pedirEnlaceInvitacion(boardId);
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'No se pudo invitar', text: error.message });
      return;
    }
    navigator.clipboard.writeText(link);
    Swal.fire({
      icon: "success",
      title: "¡Enlace copiado!",
      text: "El enlace ha sido copiado al portapapeles",
      timer: 2000,
      showConfirmButton: false
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }
  // Importar un diagrama: XMI (.xmi / .xml), proyecto de Enterprise Architect (.eap) o el código
  // de un backend (.zip del proyecto o archivos .java)
  const handleXmlUpload = async (e) => {
    const input = e.target;
    const elegidos = [...(input.files || [])];
    const file = elegidos[0];
    input.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;
    const nombreBase = file.name.replace(/\.[^.]+$/, '');
    const deCodigo = elegidos.filter(f => /\.(zip|java)$/i.test(f.name));
    if (deCodigo.length) {
      try {
        await importarBackend(deCodigo);
      } catch (error) {
        console.error("Error importando el código:", error);
        Swal.fire({
          icon: "error",
          title: "No se pudo importar el código",
          text: mensajeDeError(error, 'Revisa que sea el .zip de un proyecto Spring Boot o sus archivos .java.'),
        });
      }
      return;
    }

    try {
      let importacion;
      if (/\.eap$/i.test(file.name)) {
        // El .EAP es una base de datos Access: la lee el backend
        Swal.fire({
          title: 'Leyendo el proyecto de Enterprise Architect...',
          allowOutsideClick: false,
          showConfirmButton: false,
          willOpen: () => Swal.showLoading()
        });
        const datos = new FormData();
        datos.append('archivo', file);
        const res = await fetch(`${import.meta.env.VITE_WS_URL || window.location.origin}/apis/importar/eap`, {
          method: 'POST',
          credentials: 'include',
          body: datos
        });
        const cuerpo = await res.json().catch(() => ({}));
        Swal.close();
        if (!res.ok) throw errorDeRespuesta(res, cuerpo, 'No se pudo leer el proyecto de Enterprise Architect.');
        importacion = prepararImportacionEAP(cuerpo.data);
      } else {
        importacion = prepararImportacionXmi(await file.text());
      }

      const opcion = await elegirQueImportar(importacion.opciones);
      if (!opcion) return;
      const { nodes, edges, titulo } = importacion.construir(opcion);
      if (!nodes.length) throw new Error('El archivo no contiene clases UML.');
      await createBoardFromXml(titulo || nombreBase, nodes, edges);
    } catch (error) {
      console.error("Error importando el diagrama:", error);
      Swal.fire({
        icon: "error",
        title: "No se pudo importar el archivo",
        text: mensajeDeError(error, 'Revisa que sea un XMI o un proyecto .EAP de Enterprise Architect.'),
        showConfirmButton: true
      });
    }
  };

  // Si el archivo trae varios diagramas, se elige cuál convertir en tablero
  const elegirQueImportar = async (opciones) => {
    if (opciones.length === 1) return opciones[0].valor;
    const { isConfirmed, value } = await Swal.fire({
      title: '¿Qué quieres importar?',
      text: 'El archivo contiene varios diagramas.',
      input: 'select',
      inputOptions: Object.fromEntries(opciones.map(o => [o.valor, o.etiqueta.replace(/[<>]/g, '')])),
      inputValue: opciones[0].valor,
      showCancelButton: true,
      confirmButtonText: 'Importar',
      cancelButtonText: 'Cancelar'
    });
    return isConfirmed ? value : null;
  };

  const escapar = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Backend existente -> tablero nuevo con sus entidades y relaciones; cada clase guarda la ruta de
  // su controlador (rutaApi), así la app Flutter que se genere llama a los endpoints de ese backend
  const importarBackend = async (archivos) => {
    Swal.fire({ title: 'Leyendo el código...', allowOutsideClick: false, showConfirmButton: false, willOpen: () => Swal.showLoading() });
    const modelo = modeloDesdeJava(await leerArchivosJava(archivos));
    Swal.close();
    if (!modelo.clases.length) throw new Error('No se encontraron entidades JPA (@Entity) en el código.');
    const { nodes, edges } = diagramaDesdeModelo(modelo);
    const titulo = archivos.length === 1 ? archivos[0].name.replace(/\.[^.]+$/, '') : 'Backend importado';
    const conRuta = modelo.clases.filter(c => modelo.rutas[c.nombre]).length;
    const avisos = modelo.avisos.length
      ? `<ul class="text-xs text-amber-700 mt-2 list-disc pl-5">${modelo.avisos.slice(0, 6).map(a => `<li>${escapar(a)}</li>`).join('')}</ul>`
      : '';
    const { isConfirmed, isDenied } = await Swal.fire({
      icon: 'info',
      title: 'Backend leído',
      html: `<div class="text-left text-sm">` +
        `<p><strong>${modelo.clases.length}</strong> entidades y <strong>${modelo.relaciones.length}</strong> relaciones de ${modelo.archivos} archivos .java.</p>` +
        `<p class="mt-1">Rutas de la API encontradas para ${conRuta} de ${modelo.clases.length} entidades` +
        `${conRuta < modelo.clases.length ? ' (las demás usan la ruta que arma la herramienta)' : ''}.</p>` +
        `<p class="text-xs text-gray-500 mt-2">${escapar(modelo.clases.map(c => c.nombre).join(', '))}</p>${avisos}` +
        `<p class="mt-2">Se crea el tablero <strong>${escapar(titulo)}</strong>. La app Flutter generada desde él usa las rutas de ese backend.</p></div>`,
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: 'Crear y generar la app Flutter',
      denyButtonText: 'Solo crear el tablero',
      cancelButtonText: 'Cancelar',
    });
    if (!isConfirmed && !isDenied) return;
    const id = await createBoardFromXml(titulo, nodes, edges, { silencioso: true });
    if (!id) return;
    if (isConfirmed) await generarFlutterDe(id);
    const { isConfirmed: abrir } = await Swal.fire({
      icon: 'success',
      title: isConfirmed ? '¡Tablero creado y app descargada!' : '¡Tablero creado!',
      html: `<div class="text-left"><p>Tablero <strong>${escapar(titulo)}</strong> con ${nodes.length} clases.</p>` +
        (isConfirmed ? '<p class="text-sm text-gray-600 mt-2">En la app, apunta la URL de la API (lib/config/api_config.dart) al servidor de ese backend.</p>' : '') + '</div>',
      showCancelButton: true,
      confirmButtonText: 'Abrir el tablero',
      cancelButtonText: 'Quedarme en la lista',
    });
    if (abrir) navigate(`/board/${id}`);
  };

  // Descarga la app Flutter del tablero (el servidor la arma desde el diagrama guardado)
  const generarFlutterDe = async (id) => {
    Swal.fire({ title: 'Generando la app Flutter...', allowOutsideClick: false, showConfirmButton: false, willOpen: () => Swal.showLoading() });
    try {
      const res = await fetch(`${import.meta.env.VITE_WS_URL || window.location.origin}/apis/crearPagina/exportarFlutter/${id}`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!res.ok) throw errorDeRespuesta(res, await res.json().catch(() => ({})), 'No se pudo generar la app Flutter.');
      const blob = await res.blob();
      const nombre = (/filename=?"?([^";]+)"?/.exec(res.headers.get('content-disposition') || '') || [])[1] || `tablero-${id}-flutter.zip`;
      const { saveAs } = await import('file-saver');
      saveAs(blob, nombre);
      Swal.close();
    } catch (error) {
      console.error("Error generando la app Flutter:", error);
      await Swal.fire({ icon: 'warning', title: 'El tablero se creó, pero no la app', text: `${mensajeDeError(error, 'Intenta de nuevo en unos segundos.')} Puedes generarla desde el tablero con el botón Flutter.` });
    }
  };

  // Crea el tablero con el diagrama importado usando la API del backend; devuelve su id.
  // (Antes esta función llamaba a addDoc/boardCollection de Firestore, que ya no
  // existen en el proyecto: la importación fallaba siempre con ReferenceError.)
  const createBoardFromXml = async (title, nodes, edges, { silencioso = false } = {}) => {
    try {
      const res = await fetch(boardApiBase, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: title,
          xml: JSON.stringify({ nodes, edges })
        })
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw errorDeRespuesta(res, result, 'No se pudo crear el tablero importado.');
      }

      await getBoardList();
      if (silencioso) return result.data?.id ?? null;
      Swal.fire({
        icon: "success",
        title: "¡Diagrama importado!",
        html: `<div class="text-left"><p>Se creó el tablero <strong>${escapar(title)}</strong></p>` +
              `<p class="text-sm text-gray-600 mt-2">${nodes.length} clases y ${edges.filter(e => !e.data?.isAssociationConnection).length} relaciones.</p></div>`,
        confirmButtonText: 'Abrir la lista'
      });
      return result.data?.id ?? null;
    } catch (error) {
      console.error("Error creando tablero desde XMI:", error);
      await Swal.fire({ icon: "error", title: "No se pudo crear el tablero", text: mensajeDeError(error, "Intenta de nuevo en unos segundos.") });
      return null;
    }
  };

  return (
    <main className="workspace page-width">
      <div>
        <div className="workspace-heading">
          <div><span className="eyebrow"><span className="status-dot" /> MI ESPACIO DE TRABAJO</span><h1>Mis diagramas.</h1><p>Hola, {user?.name?.split(' ')[0] || 'de nuevo'}. Tus ideas tienen un lugar aquí.</p></div>
          <div className="workspace-actions">
            <button type="button" onClick={() => document.getElementById('fileInput').click()} data-tour="importar-xml" className="btn-success" title="XMI, proyecto .EAP o el código de un backend Spring Boot (.zip o archivos .java)"><Upload size={17} /> Importar XMI / EAP / código</button>
            <input type="file" id="fileInput" accept=".xmi,.xml,.eap,.zip,.java" multiple onChange={handleXmlUpload} className="hidden" />
            <button onClick={() => setModalIsOpen(true)} data-tour="nuevo-tablero" className="btn-primary"><Plus size={18} /> Nuevo tablero</button>
          </div>
        </div>
        <div className="workspace-banner"><div><h2>Un nuevo proyecto empieza con una idea.</h2><p>Dale forma en un tablero, conecta sus piezas e invita a tu equipo a construir contigo.</p></div><span className="workspace-banner-symbol" aria-hidden="true"><Workflow size={42} strokeWidth={1.3} /></span></div>
        <div className="board-section-heading"><h2><LayoutGrid size={17} /> Todos los tableros <span className="board-count">{boardList.length}</span></h2><span>Un espacio para cada proyecto</span></div>
        <div>
          <BoardList
            boards={boardList}
            user={user}
            onInvite={(id) => abrirInvitacion(id)}
            onEdit={(board) => {
              setDescription(board.description);
              setCurrentBoardId(board.id);
              setEditModalIsOpen(true);
            }}
            onDelete={handleDeleteBoard}
          />
        </div>

        {/* Modales */}
        <BoardModals
          modalStates={{ modalIsOpen, editModalIsOpen, inviteModalIsOpen }}
          modalActions={{
            closeModal: () => setModalIsOpen(false),
            closeEditModal: () => setEditModalIsOpen(false),
            closeInviteModal: () => setInviteModalIsOpen(false)
          }}
          description={description}
          setDescription={setDescription}
          inviteEmail={inviteEmail}
          setInviteEmail={setInviteEmail}
          handleSubmit={handleSubmit}
          handleEditSubmit={handleEditSubmit}
          handleInviteUser={handleInviteUser}
          handleCopyLink={handleCopyLink}
          currentBoardId={currentBoardId}
          enlaceInvitacion={enlaceInvitacion}
        />

        <Tour
          pasos={TOUR_TABLEROS}
          abierto={tourAbierto}
          onCerrar={() => { setTourAbierto(false); marcarTourVisto('tableros'); }}
        />
        <BotonAyuda onRelanzarTour={() => setTourAbierto(true)} />
      </div>
    </main>
  );
};

export default Board;