// BoardPage.jsx
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Link, useNavigate } from 'react-router-dom';
import { Workflow, ArrowLeft, ChevronRight, Plus, StickyNote, Undo2, Redo2, Sparkles, SlidersHorizontal, Download, Wrench, Braces, Code2, Database, FileCode2, ArrowUpRight, Check, Save, Layers, Maximize2, Minus, Sun, Moon, PanelRightClose, PanelRightOpen, Grid2X2, X, ShieldCheck, Users, LockKeyhole, UnlockKeyhole, CloudOff, MessagesSquare, Spline, FileUp, TriangleAlert } from 'lucide-react';
import useTheme from '../hooks/useTheme';
import {
  Background,
  useReactFlow,
  useViewport,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  getSmoothStepPath,
  Position
} from "@xyflow/react";
import { useParams } from "react-router-dom";
// db removed - switching to Socket.IO based flow for realtime sync
import {
  nodeTypes,
  edgeTypes,
  defaultEdgeOptions,
} from '../config/flowConfig';
import useSocketFlow from '../config/useSocketFlow';
import LeftSidebar from "../components/control/Sidebar"; 
import Tour from "../components/tutorial/Tour.jsx";
import BotonAyuda from "../components/tutorial/BotonAyuda.jsx";
import { TOUR_EDITOR, tourVisto, marcarTourVisto, marcarTarea } from "../components/tutorial/guiones.js";
import Swal from 'sweetalert2';
import { buildExportXML, VERSIONES_XMI } from '../utils/myCustomXmlFunctions';
import { generateCode } from '../utils/codeGenerator';
import { generateCompleteProject } from '../utils/completeProjectGenerator';
import { verifyUMLDiagramWithAI, validateAICredentials } from '../utils/aiUMLValidator';
import BurbujaHerramientasDiagrama from '../components/BurbujaHerramientasDiagrama';
import ChatSala from '../components/ChatSala';
import useColaboracion from '../hooks/useColaboracion';
import useIALocal from '../hooks/useIALocal';
import { compararConDiagrama, leerArchivosJava, modeloDesdeJava } from '../utils/importarCodigo.js';
import { esFantasma, superponerPropuesta } from '../utils/vistaPropuesta';
import { deshacerSelectivo } from '../utils/deshacerSelectivo';
import { borrarUsuarioLocal, guardarUsuarioLocal, leerUsuarioLocal } from '../offline/almacenTableros.js';
import JSZip from 'jszip'
import { saveAs } from 'file-saver';
import { leerJSON, errorDeRespuesta, mensajeDeError, motivoDelServidor } from '../utils/mensajesError';
import {
  admiteClaseAsociacion, claseAsociacionDe, crearClaseAsociacion, describirRelacion,
  desvincularClaseAsociacion, puedeSerClaseAsociacion, relacionesParaClase, vincularClaseAsociacion,
} from '../utils/claseAsociacion';


const BoardPage = () => {
  // Declarado arriba: el useEffect de sesion lo usa en su array de dependencias,
  // que se evalua en el momento de invocar useEffect (no despues).
  const navigate = useNavigate();
  const [tourEditorAbierto, setTourEditorAbierto] = useState(false);
  const { id: boardId } = useParams();
  const [currentUser, setCurrentUser] = useState(null);
  const [boardTitle, setBoardTitle] = useState('Mi diagrama');
  const [studioPanel, setStudioPanel] = useState('design');
  const [panelOpen, setPanelOpen] = useState(() => !window.matchMedia('(max-width: 900px)').matches);
  const [showGrid, setShowGrid] = useState(true);
  const [canvasLocked, setCanvasLocked] = useState(false);
  const archivoCodigoRef = useRef(null);
  const { isDark, toggleTheme } = useTheme();
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const { zoom } = useViewport();
  const openStudioPanel = useCallback((panel) => { setStudioPanel(panel); setPanelOpen(true); }, []);
  const revealTourPanel = useCallback((step) => {
    if (/sql|springboot|postman|flutter|xmi/.test(step?.selector || '')) openStudioPanel('export');
    else if (step?.selector?.includes('panel-lateral')) openStudioPanel('design');
    else if (window.matchMedia('(max-width: 900px)').matches) setPanelOpen(false);
  }, [openStudioPanel]);

  // Try to fetch profile from backend; fallback to token in localStorage
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const apiBase = import.meta.env.VITE_WS_URL || window.location.origin;
        let res = await fetch(`${apiBase}/apis`, { credentials: 'include' });
        if (!mounted) return;
        if (res.ok) {
          const payload = await res.json();
          // backend responses are wrapped as { error: false, data: ... }
          const user = payload && payload.data ? payload.data : payload;
          if (user && (user.id || user.email)) {
            setCurrentUser({ id: user.id, name: user.name, email: user.email });
            guardarUsuarioLocal({ id: user.id, name: user.name, email: user.email });
            return;
          }
          // unexpected shape
        }

        // If cookie-based auth failed (no cookie sent), try fallback using token stored in localStorage
        const fallbackToken = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        if (fallbackToken) {
          try {
            res = await fetch(`${apiBase}/apis`, { headers: { Authorization: `Bearer ${fallbackToken}` }, credentials: 'include' });
            if (!mounted) return;
            if (res.ok) {
              const payload = await res.json();
              const user = payload && payload.data ? payload.data : payload;
              if (user && (user.id || user.email)) {
                setCurrentUser({ id: user.id, name: user.name, email: user.email });
                guardarUsuarioLocal({ id: user.id, name: user.name, email: user.email });
                return;
              }
              // unexpected shape on fallback
            }
          } catch (inner) {
            // ignore fallback error and continue to navigate to login
          }
        }
      } catch (err) {
        // Sin conexión con el servidor: se sigue con la última sesión conocida y la
        // copia local del tablero; los cambios se suben al reconectar
        const guardado = leerUsuarioLocal();
        if (guardado && mounted) {
          setCurrentUser(guardado);
          return;
        }
      }
      // Sin sesion valida no se puede colaborar (el socket exige JWT): en vez de
      // mostrar un tablero vacio que no guarda nada, mandamos al login.
      if (mounted) {
        try { localStorage.removeItem('token'); } catch (e) { /* noop */ }
        // Se recuerda el tablero (con su invitación) para volver después de iniciar sesión
        try { sessionStorage.setItem('volverTrasLogin', window.location.pathname + window.location.search); } catch (e) { /* noop */ }
        borrarUsuarioLocal();
        navigate('/login');
      }
    })();
    return () => { mounted = false; };
  }, [navigate]);

  // El tour del editor se muestra una sola vez
  useEffect(() => {
    if (currentUser && !tourVisto('editor')) {
      const t = setTimeout(() => setTourEditorAbierto(true), 900);
      return () => clearTimeout(t);
    }
  }, [currentUser]);

  const {
    nodes,
    edges,
    activeUsers,
    participantes,
    selectedNode,
    selectedEdge,
    editingData,
    editingEdge,
    onNodesChange,
    onEdgesChange,
    addNode,
    handleNodeSelection,
    handleEdgeSelection,
    updateNodeData,
    updateEdgeData,
    setEditingData,
    setEditingEdge,
    setSelectedEdge,
    updateBoardData,
    guardarEstado,
    consumirCambioRemoto,
    setNodes,
      setEdges,
    aplicarCambiosIA,
    aplicarDiagrama,
    conectado,
    socketUnido,
    errorAcceso,
    avisoSincronia,
    cerrarAvisoSincronia
  } = useSocketFlow(boardId, currentUser);

  // ----- La IA como integrante del equipo: chat de la sala, propuestas y revisiones -----
  const usuarioChat = useMemo(
    () => (currentUser ? { id: currentUser.id, nombre: currentUser.displayName || currentUser.name || currentUser.email || 'Tú' } : null),
    [currentUser],
  );
  const colaboracion = useColaboracion(socketUnido, boardId ? parseInt(boardId, 10) : null, usuarioChat);
  // Sin conexión, la IA del chat es la IA local de este equipo (sus cambios quedan como de la IA)
  const iaLocal = useIALocal({ nodes, edges, aplicar: aplicarCambiosIA });
  // El chat vive en el panel "Chat" del estudio: está abierto cuando ese panel se ve
  const chatAbierto = panelOpen && studioPanel === 'assistant';
  const setChatAbierto = useCallback((abrir) => {
    if (abrir) openStudioPanel('assistant');
    else setPanelOpen(false);
  }, [openStudioPanel]);
  const chatSinLeer = (colaboracion.sinLeer?.equipo || 0) + (colaboracion.sinLeer?.ia || 0);
  // Pedido al chat desde fuera (p. ej. "Verificar Diagrama" sin conexión)
  const [pedidoChat, setPedidoChat] = useState(null);
  const [revisionOcultaId, setRevisionOcultaId] = useState(null);
  const [medidasFantasma, setMedidasFantasma] = useState({});
  // Las marcas de una revisión se ven un par de horas o hasta que alguien las quita
  const revisionVisible = colaboracion.ultimaRevision
    && colaboracion.ultimaRevision.id !== revisionOcultaId
    && Date.now() - new Date(colaboracion.ultimaRevision.creadoEn).getTime() < 2 * 60 * 60 * 1000
    ? colaboracion.ultimaRevision : null;
  // Lo que se dibuja: el diagrama real más la vista previa de la propuesta (que no se guarda)
  const { nodos: nodosMostrados, aristas: aristasMostradas } = useMemo(
    () => superponerPropuesta(nodes, edges, colaboracion.propuestaPendiente, revisionVisible, medidasFantasma),
    [nodes, edges, colaboracion.propuestaPendiente, revisionVisible, medidasFantasma]
  );
  // Los cambios de React Flow sobre la vista previa no llegan al diagrama real
  const alCambiarNodos = useCallback((cambios) => {
    const reales = [];
    const medidas = {};
    for (const c of cambios) {
      if (!esFantasma(c.id)) { reales.push(c); continue; }
      if (c.type === 'dimensions' && c.dimensions) medidas[c.id] = c.dimensions;
    }
    if (Object.keys(medidas).length) setMedidasFantasma((prev) => ({ ...prev, ...medidas }));
    if (reales.length) onNodesChange(reales);
  }, [onNodesChange]);
  const alCambiarAristas = useCallback((cambios) => {
    const reales = cambios.filter((c) => !esFantasma(c.id));
    if (reales.length) onEdgesChange(reales);
  }, [onEdgesChange]);
  const enfocarClase = useCallback((nodoId) => {
    fitView({ nodes: [{ id: nodoId }], duration: 500, maxZoom: 1.3, padding: 0.6 });
  }, [fitView]);

  // ----- Historial para deshacer y rehacer (Ctrl+Z / Ctrl+Y y las flechas de la barra) -----
  // Se guarda una foto del diagrama por cada cambio; los cambios que llegan de otros
  // participantes no entran al historial, para no deshacer su trabajo.
  // La foto guarda solo el contenido del diagrama: se dejan fuera los datos que React Flow
  // recalcula solo (medidas, selección, arrastre), que si no se contarían como cambios del usuario.
  const fotografiar = useCallback((listaNodos, listaAristas) => JSON.stringify({
    nodes: (listaNodos || []).map(({ measured, selected, dragging, resizing, positionAbsolute, internals, ...resto }) => resto),
    edges: (listaAristas || []).map(({ selected, ...resto }) => resto)
  }), []);
  const historialRef = useRef([]);
  const futuroRef = useRef([]);
  const fotoActualRef = useRef(null);
  const aplicandoHistorialRef = useRef(false);
  const temporizadorHistorialRef = useRef(null);
  const [puedeDeshacer, setPuedeDeshacer] = useState(false);
  const [puedeRehacer, setPuedeRehacer] = useState(false);
  const LIMITE_HISTORIAL = 50;

  useEffect(() => {
    const foto = fotografiar(nodes, edges);
    if (fotoActualRef.current === null) {
      fotoActualRef.current = foto;
      if (consumirCambioRemoto) consumirCambioRemoto();
      return;
    }
    if (aplicandoHistorialRef.current) {
      aplicandoHistorialRef.current = false;
      fotoActualRef.current = foto;
      return;
    }
    // Cambio llegado de otro participante o de la carga inicial: es el nuevo punto de partida
    if (consumirCambioRemoto && consumirCambioRemoto()) {
      fotoActualRef.current = foto;
      return;
    }
    // Se espera a que termine la ráfaga de cambios (arrastrar, escribir) para guardar una sola foto
    clearTimeout(temporizadorHistorialRef.current);
    temporizadorHistorialRef.current = setTimeout(() => {
      if (foto === fotoActualRef.current) return;
      // Cada entrada es un cambio propio: la foto de antes y la de después
      historialRef.current = [...historialRef.current, { antes: fotoActualRef.current, despues: foto }].slice(-LIMITE_HISTORIAL);
      futuroRef.current = [];
      fotoActualRef.current = foto;
      setPuedeDeshacer(true);
      setPuedeRehacer(false);
    }, 400);
    return () => clearTimeout(temporizadorHistorialRef.current);
  }, [nodes, edges, consumirCambioRemoto, fotografiar]);

  // Estado actual para deshacer sobre lo que hay ahora (con los cambios de los demás)
  const estadoActualRef = useRef({ nodes, edges });
  estadoActualRef.current = { nodes, edges };

  /**
   * Revierte un cambio propio sobre el estado actual: lo que otra persona tocó después no se pisa.
   * Deshacer: de "después" a "antes"; rehacer: al revés.
   */
  const revertirCambio = useCallback((desde, hacia) => {
    let antes;
    let despues;
    try {
      antes = JSON.parse(hacia);
      despues = JSON.parse(desde);
    } catch {
      return;
    }
    const { estado, omitidos, revertidos } = deshacerSelectivo(estadoActualRef.current, antes, despues);
    aplicandoHistorialRef.current = true;
    clearTimeout(temporizadorHistorialRef.current);
    fotoActualRef.current = fotografiar(estado.nodes, estado.edges);
    setNodes(estado.nodes);
    setEdges(estado.edges);
    setSelectedEdge(null);
    setUnsaved(true);
    if (omitidos > 0) {
      Swal.fire({
        toast: true, position: 'bottom', timer: 3500, showConfirmButton: false, icon: 'info',
        title: revertidos > 0
          ? `Se deshizo tu cambio, salvo ${omitidos} elemento${omitidos === 1 ? '' : 's'} que otra persona modificó después.`
          : 'No se deshizo: otra persona modificó esos elementos después de tu cambio.'
      });
    }
  }, [fotografiar, setNodes, setEdges, setSelectedEdge]);

  const deshacer = useCallback(() => {
    const entrada = historialRef.current.pop();
    if (!entrada) { setPuedeDeshacer(false); return; }
    futuroRef.current.push(entrada);
    revertirCambio(entrada.despues, entrada.antes);
    setPuedeDeshacer(historialRef.current.length > 0);
    setPuedeRehacer(true);
  }, [revertirCambio]);

  const rehacer = useCallback(() => {
    const entrada = futuroRef.current.pop();
    if (!entrada) { setPuedeRehacer(false); return; }
    historialRef.current.push(entrada);
    revertirCambio(entrada.antes, entrada.despues);
    setPuedeRehacer(futuroRef.current.length > 0);
    setPuedeDeshacer(true);
  }, [revertirCambio]);

  useEffect(() => {
    const escribiendo = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const alPulsar = (evento) => {
      if (!evento.ctrlKey && !evento.metaKey) return;
      const tecla = (evento.key || '').toLowerCase();
      if (tecla !== 'z' && tecla !== 'y') return;
      // Dentro de un campo de texto, Ctrl+Z deshace lo escrito, no el diagrama
      if (escribiendo(document.activeElement)) return;
      evento.preventDefault();
      if (tecla === 'y' || evento.shiftKey) rehacer(); else deshacer();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [deshacer, rehacer]);

  
  // Estado para controlar modificaciones de IA

  // Owner metadata for this sala (to determine host/owner)
  const [ownerId, setOwnerId] = useState(null);
  const [ownerEmail, setOwnerEmail] = useState(null);

  // Fetch sala metadata (owner) so we can determine host reliably
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!boardId) return;
      try {
        const metadataUrl = `${import.meta.env.VITE_WS_URL || window.location.origin}/apis/sala/${boardId}`;
        let res = await fetch(metadataUrl, { credentials: 'include' });
        if (!mounted) return;
        if (res.status === 401 || res.status === 403) {
          const token = localStorage.getItem('token');
          if (token) res = await fetch(metadataUrl, { credentials: 'include', headers: { Authorization: `Bearer ${token}` } });
        }
        if (!mounted || !res.ok) return;
        const payload = await res.json().catch(() => null);
        const dataRows = payload && payload.data ? payload.data : payload;
        const row = Array.isArray(dataRows) && dataRows.length > 0 ? dataRows[0] : (dataRows || {});
        if (row) {
          setBoardTitle(row.title || row.description || row.name || row.titulo || 'Mi diagrama');
          // The DB uses userId as owner; try multiple casings
          if (row.userid !== undefined) setOwnerId(row.userid);
          else if (row.userId !== undefined) setOwnerId(row.userId);
          if (row.host !== undefined) setOwnerEmail(row.host);
        }
      } catch (err) {
        console.warn('Failed to fetch sala metadata', err);
      }
    })();
    return () => { mounted = false; };
  }, [boardId]);

  // Consider user the host if they match ownerId (preferred) or are present in participantes
  const isHost = (() => {
    try {
      if (!currentUser) return false;
      if (ownerId && String(ownerId) === String(currentUser.id)) return true;
      if (ownerEmail && currentUser.email && String(ownerEmail) === String(currentUser.email)) return true;
      if (participantes && Array.isArray(participantes) && currentUser.email && participantes.includes(currentUser.email)) return true;
      return false;
    } catch (e) {
      return false;
    }
  })();

  // Track unsaved changes locally (to warn on exit)
  const [unsaved, setUnsaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialLoadRef = useRef(false);
  const unsavedTimerRef = useRef(null);

  // Debounced marking of unsaved changes. Skip the initial load from server.
  useEffect(() => {
    // If we haven't received the initial state yet and nodes/edges now contain data, treat as initial load
    if (!initialLoadRef.current && ((nodes && nodes.length > 0) || (edges && edges.length > 0))) {
      initialLoadRef.current = true;
      setUnsaved(false);
      return;
    }

    // After initial load, mark unsaved (debounced)
    if (unsavedTimerRef.current) clearTimeout(unsavedTimerRef.current);
    unsavedTimerRef.current = setTimeout(() => {
      setUnsaved(true);
    }, 200);
    return () => {
      if (unsavedTimerRef.current) clearTimeout(unsavedTimerRef.current);
    };
  }, [nodes, edges]);

  // Warn user when trying to close tab/window if there are unsaved changes
  useEffect(() => {
    const handler = (e) => {
      if (unsaved) {
        e.preventDefault();
        e.returnValue = 'Hay cambios sin guardar en la pizarra. ¿Seguro que quieres salir?';
        return 'Hay cambios sin guardar en la pizarra. ¿Seguro que quieres salir?';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [unsaved]);

  // Función para verificar diagrama UML con IA
  const handleVerifyDiagramAI = async () => {
    // Con conexión, la revisión la hace la IA del equipo en el chat: todos la ven y marca las clases
    if (socketUnido) {
      if (!nodes.length) {
        Swal.fire({ icon: 'info', title: 'Diagrama vacío', text: 'No hay clases en el diagrama para verificar.' });
        return;
      }
      setChatAbierto(true);
      setPedidoChat({ pestana: 'ia', n: Date.now() });
      const r = await colaboracion.enviar('Revisa el diagrama completo y dime qué corregir', true);
      if (!r?.ok) Swal.fire({ icon: 'error', title: 'No se pudo pedir la revisión', text: r?.mensaje || 'Revisa tu conexión.' });
      return;
    }
    // Sin conexión: la revisa la IA local en el mismo chat (reglas + Ollama si está) y marca las clases.
    // Antes llamaba al servidor y fallaba.
    if (currentUser) {
      if (!nodes.length) {
        Swal.fire({ icon: 'info', title: 'Diagrama vacío', text: 'No hay clases en el diagrama para verificar.' });
        return;
      }
      setChatAbierto(true);
      setPedidoChat({ texto: 'Revisa el diagrama completo y dime qué corregir', n: Date.now() });
      return;
    }
    try {
      // Validar que hay un diagrama para verificar
      if (!nodes.length) {
        Swal.fire({
          icon: 'info',
          title: 'Diagrama vacío',
          text: 'No hay clases en el diagrama para verificar.'
        });
        return;
      }

      // Validar credenciales de IA
      const credentialsCheck = validateAICredentials();
      if (!credentialsCheck.valid) {
        Swal.fire({
          icon: 'warning',
          title: 'Sesión requerida',
          text: credentialsCheck.message,
          confirmButtonText: 'Entendido'
        });
        return;
      }

      // Mostrar indicador de carga
      Swal.fire({
        title: 'Verificando con IA...',
        html: `
          <div class="text-center">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p>Enviando diagrama a la IA para análisis experto</p>
            <p class="text-sm text-gray-500 mt-2">Esto puede tomar unos segundos...</p>
          </div>
        `,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        willOpen: () => {
          // Opcional: agregar más animaciones personalizadas
        }
      });

      // Llamar a la IA para verificación
      marcarTarea('clase');
      const resultado = await verifyUMLDiagramWithAI(nodes, edges, boardId, 'GEMINI', true);

      // Formatear y mostrar resultados
      const getScoreColor = (score) => {
        if (score >= 80) return 'text-green-600';
        if (score >= 60) return 'text-yellow-600';
        return 'text-red-600';
      };

      const getScoreIcon = (score) => {
        if (score >= 80) return '🎉';
        if (score >= 60) return '⚠️';
        return '❌';
      };

      let htmlContent = `
        <div class="text-left max-h-96 overflow-y-auto">
          <div class="text-center mb-4">
            <div class="text-4xl mb-2">${getScoreIcon(resultado.scoreDiseno)}</div>
            <div class="text-2xl font-bold mb-2">
              <span class="${getScoreColor(resultado.scoreDiseno)}">Score: ${resultado.scoreDiseno}/100</span>
            </div>
            <div class="text-sm ${resultado.okEstructural ? 'text-green-600' : 'text-red-600'}">
              ${resultado.okEstructural ? '✅ Estructura correcta' : '❌ Problemas estructurales'}
            </div>
          </div>`;

      // Problemas estructurales
      if (!resultado.okEstructural) {
        htmlContent += `<div class="mb-4 p-3 bg-red-50 rounded">
          <h4 class="font-semibold text-red-700 mb-2">Problemas Estructurales:</h4>`;
        
        if (resultado.islas?.length > 0) {
          htmlContent += `<p class="text-sm mb-1"><strong>Nodos aislados:</strong> ${resultado.islas.join(', ')}</p>`;
        }
        
        if (resultado.referenciasRotas?.length > 0) {
          htmlContent += `<p class="text-sm mb-1"><strong>Referencias rotas:</strong> ${resultado.referenciasRotas.length}</p>`;
        }
        
        if (resultado.ciclosHerencia?.length > 0) {
          htmlContent += `<p class="text-sm mb-1"><strong>Ciclos de herencia:</strong> ${resultado.ciclosHerencia.length}</p>`;
        }
        
        htmlContent += `</div>`;
      }

      // Acciones prioritarias
      if (resultado.accionesPrioritarias?.length > 0) {
        htmlContent += `
          <div class="mb-4">
            <h4 class="font-semibold text-orange-700 mb-2">🔥 Acciones Prioritarias:</h4>
            <ul class="text-sm space-y-1">
              ${resultado.accionesPrioritarias.map((accion, idx) => 
                `<li class="flex items-start gap-2">
                  <span class="text-orange-600 font-bold">${idx + 1}.</span>
                  <span>${accion}</span>
                </li>`
              ).join('')}
            </ul>
          </div>`;
      }

      // Sugerencias
      if (resultado.sugerencias?.length > 0) {
        htmlContent += `
          <div class="mb-4">
            <h4 class="font-semibold text-blue-700 mb-2">💡 Sugerencias:</h4>
            <ul class="text-sm space-y-1">
              ${resultado.sugerencias.map(sugerencia => 
                `<li class="flex items-start gap-2">
                  <span class="text-blue-600">•</span>
                  <span>${sugerencia}</span>
                </li>`
              ).join('')}
            </ul>
          </div>`;
      }

      // Tags
      if (resultado.tags?.length > 0) {
        htmlContent += `
          <div class="mb-4">
            <h4 class="font-semibold mb-2">🏷️ Aspectos Analizados:</h4>
            <div class="flex flex-wrap gap-1">
              ${resultado.tags.map(tag => 
                `<span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">${tag}</span>`
              ).join('')}
            </div>
          </div>`;
      }

      // Limitaciones
      if (resultado.limitaciones?.length > 0) {
        htmlContent += `
          <div class="mb-2">
            <h4 class="font-semibold text-gray-600 mb-2">ℹ️ Limitaciones:</h4>
            <ul class="text-xs text-gray-600 space-y-1">
              ${resultado.limitaciones.map(limitacion => 
                `<li>• ${limitacion}</li>`
              ).join('')}
            </ul>
          </div>`;
      }

      htmlContent += `
        <div class="mt-4 pt-3 border-t text-center">
          <p class="text-xs text-gray-500">Análisis realizado por IA • ${new Date().toLocaleString()}</p>
        </div>
      </div>`;

      // Mostrar resultado final
      Swal.fire({
        icon: resultado.okEstructural && resultado.scoreDiseno >= 80 ? 'success' : 
               resultado.scoreDiseno >= 60 ? 'warning' : 'error',
        title: 'Verificación IA Completada',
        html: htmlContent,
        width: '700px',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#3085d6',
        customClass: {
          htmlContainer: 'text-left'
        }
      });

      // Log para debugging
  // console.log('🤖 Resultado verificación IA:', resultado);

    } catch (error) {
      console.error('Error en verificación con IA:', error);
      Swal.fire({
        icon: 'error',
        title: 'No se pudo verificar el diagrama',
        html: `
          <div class="text-left">
            <p>${mensajeDeError(error, 'La IA no respondió a tiempo.')}</p>
            <br>
            <p class="text-sm text-gray-600">
              Revisa tu conexión a internet e intenta de nuevo en unos minutos.
            </p>
          </div>
        `,
        confirmButtonText: 'Reintentar'
      });
    }
  };

  // Generar proyecto Flutter server-side with payload fallback and client fallback
  const handleGenerateFlutterProject = async () => {
    try {
      if (!nodes.length) {
        Swal.fire({ icon: 'warning', title: 'Diagrama vacío', text: 'No hay clases en el diagrama para generar el proyecto.' });
        return;
      }

      Swal.fire({ title: 'Generando proyecto Flutter (server)...', text: 'Solicitando exportación al backend', allowOutsideClick: false, allowEscapeKey: false, showConfirmButton: false, willOpen: () => Swal.showLoading() });

      const exportUrl = `${import.meta.env.VITE_API_BASE || ''}/apis/crearPagina/exportarFlutter/${boardId}`;
      const resp = await fetch(exportUrl, { method: 'POST', credentials: 'include' });

      if (!resp.ok) {
        console.warn('Backend Flutter export by id failed, status:', resp.status);
        const motivoFlutter = motivoDelServidor(await leerJSON(resp));
        try {
          const altUrl = `${import.meta.env.VITE_API_BASE || ''}/apis/crearPagina/exportarFlutter`;
          const altResp = await fetch(altUrl, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ elements: nodes, connections: edges }) });
          if (altResp.ok) {
            const altBlob = await altResp.blob();
            const altFileName = `uml-${boardId}-flutter-from-server.zip`;
            const { saveAs } = await import('file-saver');
            saveAs(altBlob, altFileName);
            Swal.close();
            Swal.fire({ icon: 'success', title: '✅ Exportado Flutter desde servidor', html: `<p>Archivo: <strong>${altFileName}</strong></p>` });
            return;
          }
          console.warn('Server export with payload also failed, status:', altResp.status);
        } catch (altErr) {
          console.warn('Alt server export failed:', altErr);
        }

        // Backend failed — fall back to client-side generator (not implemented for Flutter)
        Swal.close();
        Swal.fire({ icon: 'warning', title: 'No se pudo generar la app Flutter', text: motivoFlutter || 'El servidor no pudo generar el proyecto Flutter. Intenta de nuevo en unos segundos.' });
        return;
      }

      const blob = await resp.blob();
      const contentDisposition = resp.headers.get('content-disposition') || '';
      let fileName = '';
      const fileNameMatch = /filename=?"?([^";]+)"?/.exec(contentDisposition);
      if (fileNameMatch) fileName = fileNameMatch[1];
      if (!fileName) fileName = `uml-${boardId}-flutter.zip`;

      const { saveAs } = await import('file-saver');
      saveAs(blob, fileName);
      Swal.close();
      Swal.fire({ icon: 'success', title: '✅ ¡Proyecto Flutter descargado!', html: `<div class="text-left"><p>Archivo descargado: <strong>${fileName}</strong></p></div>`, confirmButtonText: 'Perfecto' });
    } catch (error) {
      console.error('handleGenerateFlutterProject error:', error);
      Swal.close();
      Swal.fire({ icon: 'error', title: 'No se pudo generar la app Flutter', text: mensajeDeError(error, 'Intenta de nuevo en unos segundos.') });
    }
  };

  // Función para exportar a XMI (usando buildExportXML)
  const handleExportXMI = async () => {
    try {
      if (!nodes.length) {
        Swal.fire({
          icon: 'warning',
          title: 'Diagrama vacío',
          text: 'No hay clases en el diagrama para exportar.'
        });
        return;
      }

      // Elegir el formato: el de Enterprise Architect (primero, por defecto)
      // lleva el lienzo armado; el 2.5.1 es el estándar para otras CASE.
      const porDefecto = VERSIONES_XMI[0].valor;
      const opciones = VERSIONES_XMI
        .map(v => `<label style="display:block;text-align:left;margin:10px 4px;cursor:pointer">
             <input type="radio" name="versionXmi" value="${v.valor}" ${v.valor === porDefecto ? 'checked' : ''} style="margin-right:8px">
             <strong>${v.etiqueta}</strong>
             <div style="font-size:12px;color:#6b7280;margin-left:24px">${v.detalle}</div>
           </label>`)
        .join('');

      const eleccion = await Swal.fire({
        title: 'Formato de exportación',
        html: `<div>${opciones}</div>`,
        showCancelButton: true,
        confirmButtonText: 'Exportar',
        cancelButtonText: 'Cancelar',
        focusConfirm: false,
        preConfirm: () => {
          const sel = document.querySelector('input[name="versionXmi"]:checked');
          return sel ? sel.value : porDefecto;
        }
      });

      if (!eleccion.isConfirmed) return;
      const version = eleccion.value || porDefecto;

      Swal.fire({
        title: 'Generando XMI...',
        text: 'Por favor, espera',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        willOpen: () => Swal.showLoading()
      });

      // El título del tablero se usa como nombre del modelo/paquete en el XMI,
      // para que al importar en Enterprise Architect se identifique fácilmente.
      let tituloTablero = `Diagrama ${boardId}`;
      try {
        const base = import.meta.env.VITE_WS_URL || window.location.origin;
        const resSala = await fetch(`${base}/apis/sala/${boardId}`, { credentials: 'include' });
        if (resSala.ok) {
          const cuerpo = await resSala.json();
          const fila = cuerpo?.data?.[0];
          if (fila?.title) tituloTablero = fila.title;
        }
      } catch (e) { /* si falla, se usa el nombre por defecto */ }

      const xmlContent = buildExportXML(nodes, edges, version, tituloTablero);

      // "<título del tablero> - XMI 2.1 (Enterprise Architect).xmi"
      const esEA = version === '2.1';
      const sufijo = esEA ? 'XMI 2.1 (Enterprise Architect)' : `XMI ${version}`;
      const baseNombre = tituloTablero.replace(/[\\/:*?"<>|]+/g, '_').trim() || `diagrama-${boardId}`;
      const nombre = `${baseNombre} - ${sufijo}.xmi`;
      const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' });
      const { saveAs } = await import('file-saver');
      saveAs(blob, nombre);

      const ayuda = esEA
        ? 'En Enterprise Architect: clic derecho sobre el paquete destino → <strong>Import Model from XMI</strong> (Ctrl+Alt+I), con <strong>Import Diagrams</strong> marcado. El diagrama queda dentro del paquete importado: ábrelo con doble clic.'
        : 'Estándar UML 2.5: ábrelo en Papyrus, MagicDraw o StarUML, o vuelve a importarlo aquí. No incluye el lienzo.';

      Swal.close();
      Swal.fire({
        icon: 'success',
        title: '¡Exportación exitosa!',
        html: `<div class="text-left"><p>Archivo <strong>${nombre.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</strong></p><p class="text-sm text-gray-600 mt-2">${ayuda}</p></div>`,
        confirmButtonText: 'Perfecto'
      });
    } catch (error) {
      console.error('Error exportando el XMI:', error);
      Swal.fire({
        icon: 'error',
        title: 'No se pudo exportar',
        text: mensajeDeError(error, 'No se pudo exportar el diagrama. Intenta de nuevo.')
      });
    }
  };
  const handleGenerateCode = async (fullStack = false) => {
    try {
      const code = generateCode(nodes, edges, fullStack);
  
      if (!fullStack) {
        // Descarga solo los modelos en un único archivo .java
        const allModelsCode = code.models.map(m => m.code).join('\n\n');
        const blob = new Blob([allModelsCode], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'models.java';
        a.click();
        return;
      }
  
      // ================ FULL STACK: Generar carpeta con 4 capas en un ZIP ================
      const zip = new JSZip();
  
      // 1) Crear carpeta 'models' y agregar archivos
      const modelsFolder = zip.folder('models');
      code.models.forEach(({ className, code: fileCode }) => {
        const fileName = `${className}.java`;
        modelsFolder.file(fileName, fileCode);
      });
  
      // 2) Crear carpeta 'repositories' y agregar archivos
      const reposFolder = zip.folder('repositories');
      code.repositories.forEach(({ className, code: fileCode }) => {
        const fileName = `${className}Repository.java`;
        reposFolder.file(fileName, fileCode);
      });
  
      // 3) Crear carpeta 'services' y agregar archivos
      const servicesFolder = zip.folder('services');
      code.services.forEach(({ className, code: fileCode }) => {
        const fileName = `${className}Service.java`;
        servicesFolder.file(fileName, fileCode);
      });
  
      // 4) Crear carpeta 'controllers' y agregar archivos
      const controllersFolder = zip.folder('controllers');
      code.controllers.forEach(({ className, code: fileCode }) => {
        const fileName = `${className}Controller.java`;
        controllersFolder.file(fileName, fileCode);
      });
  
      // Finalmente, generamos el zip y lo descargamos
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, 'spring-boot-project.zip');
  
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo generar el código',
        text: mensajeDeError(error, 'Revisa que las clases tengan nombre y atributos válidos e intenta de nuevo.')
      });
    }
  };

  // Generar colección Postman (v2.1) con endpoints CRUD para cada entidad detectada
  // Descarga el modelo relacional (DDL de PostgreSQL) derivado del diagrama
  const handleExportSQL = async () => {
    try {
      marcarTarea('exportar');
      if (!nodes.length) {
        Swal.fire({ icon: 'warning', title: 'Diagrama vacío', text: 'No hay clases para generar el modelo relacional.' });
        return;
      }
      Swal.fire({ title: 'Generando modelo relacional...', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });

      const base = import.meta.env.VITE_API_BASE || import.meta.env.VITE_WS_URL || window.location.origin;
      const resp = await fetch(`${base}/apis/crearPagina/exportarSQL/${boardId}`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!resp.ok) {
        Swal.close();
        const mensaje = motivoDelServidor(await leerJSON(resp)) || mensajeDeError(errorDeRespuesta(resp, null), 'No se pudo generar el script SQL.');
        Swal.fire({ icon: 'error', title: 'No se pudo generar el script SQL', text: mensaje });
        return;
      }

      const blob = await resp.blob();
      const disp = resp.headers.get('content-disposition') || '';
      const m = /filename="?([^";]+)"?/.exec(disp);
      const nombre = m ? m[1] : `modelo-relacional-${boardId}.sql`;
      const { saveAs } = await import('file-saver');
      saveAs(blob, nombre);

      Swal.close();
      Swal.fire({
        icon: 'success',
        title: '✅ Modelo relacional exportado',
        html: `<div class="text-left"><p>Archivo: <strong>${nombre}</strong></p><p class="text-sm text-gray-600 mt-2">Ejecútalo en PostgreSQL para crear el esquema (tablas, claves foráneas y tablas intermedias).</p></div>`,
        confirmButtonText: 'Perfecto'
      });
    } catch (error) {
      console.error('handleExportSQL error:', error);
      Swal.close();
      Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo generar el script SQL.' });
    }
  };

  // Proyecto de Enterprise Architect (.EAP) con el diagrama de clases dibujado en el lienzo
  const handleExportEAP = async () => {
    try {
      marcarTarea('exportar');
      if (!nodes.length) {
        Swal.fire({ icon: 'warning', title: 'Diagrama vacío', text: 'No hay clases para exportar a Enterprise Architect.' });
        return;
      }
      Swal.fire({ title: 'Generando proyecto de Enterprise Architect...', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });

      const base = import.meta.env.VITE_API_BASE || import.meta.env.VITE_WS_URL || window.location.origin;
      const resp = await fetch(`${base}/apis/crearPagina/exportarEAP/${boardId}`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!resp.ok) {
        Swal.close();
        if (resp.status === 404) {
          // El servidor no conoce la ruta: corre una versión anterior a la exportación EAP
          Swal.fire({
            icon: 'error',
            title: 'El servidor no tiene la exportación a EAP',
            html: `<div class="text-left text-sm"><p>El backend al que está conectada la página es una versión anterior y no conoce esta función.</p>
              <ul class="list-disc ml-5 mt-2"><li>Si usas la app en tu PC: cierra el backend y vuelve a iniciarlo con <strong>npm start</strong> en la carpeta <strong>backend</strong>.</li>
              <li>La web publicada en Render no la tiene: esos cambios están solo en tu equipo.</li></ul></div>`
          });
          return;
        }
        const cuerpo = await leerJSON(resp);
        // Los mensajes de esta exportación los escribe el servidor para el usuario: se muestran
        // tal cual (el filtro general los descartaba por palabras como "Windows" o "XMI")
        const delServidor = typeof cuerpo?.message === 'string' && cuerpo.message.trim()
          ? cuerpo.message.trim().slice(0, 600)
          : null;
        if (resp.status === 501) {
          // Servidor sin Windows (p. ej. Render): se ofrece el XMI 2.1, que EA también importa
          const eleccion = await Swal.fire({
            icon: 'info',
            title: 'El .EAP se genera desde Windows',
            text: delServidor || 'Este servidor no puede generar archivos .EAP.',
            showCancelButton: true,
            confirmButtonText: 'Descargar XMI 2.1',
            cancelButtonText: 'Cerrar'
          });
          if (eleccion.isConfirmed) await handleExportXMI();
          return;
        }
        const mensaje = delServidor || motivoDelServidor(cuerpo) || mensajeDeError(errorDeRespuesta(resp, null), 'No se pudo generar el archivo .EAP.');
        Swal.fire({ icon: 'error', title: 'No se pudo exportar a EAP', text: mensaje });
        return;
      }

      const blob = await resp.blob();
      const disp = resp.headers.get('content-disposition') || '';
      const m = /filename="?([^";]+)"?/.exec(disp);
      const esKit = (resp.headers.get('content-type') || '').includes('zip');
      const nombre = m ? m[1] : (esKit ? `diagrama-${boardId}-generar-eap.zip` : `diagrama-${boardId}.eap`);
      const { saveAs } = await import('file-saver');
      saveAs(blob, nombre);

      Swal.close();
      if (esKit) {
        // Servidor sin Windows: llega el kit para generar el .EAP con doble clic
        Swal.fire({
          icon: 'success',
          title: '✅ Descargado: genera el .EAP con doble clic',
          html: `<div class="text-left text-sm"><p>Archivo: <strong>${nombre}</strong></p>
            <p class="mt-2">Este servidor no puede escribir archivos .EAP (usan el motor de Access de Windows), así que te llega listo para generarlo en tu PC:</p>
            <ol class="list-decimal ml-5 mt-2"><li>Descomprime el ZIP (clic derecho → Extraer todo).</li>
            <li>Doble clic en <strong>GENERAR_EAP.bat</strong>.</li>
            <li>Se crea el <strong>.eap</strong> en esa carpeta: ábrelo en Enterprise Architect con Open Project.</li></ol>
            <p class="mt-2 text-gray-600">Funciona en cualquier PC con Windows, sin instalar nada. Si aparece "Windows protegió tu PC": Más información → Ejecutar de todas formas.</p></div>`,
          confirmButtonText: 'Entendido'
        });
        return;
      }
      Swal.fire({
        icon: 'success',
        title: '✅ Proyecto de Enterprise Architect listo',
        html: `<div class="text-left"><p>Archivo: <strong>${nombre}</strong></p><p class="text-sm text-gray-600 mt-2">Ábrelo en Enterprise Architect con <strong>Open Project</strong>. En el Project Browser: Model → el paquete del tablero → Modelo de clases → el diagrama ya está dibujado.</p></div>`,
        confirmButtonText: 'Perfecto'
      });
    } catch (error) {
      console.error('handleExportEAP error:', error);
      Swal.close();
      Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo generar el archivo .EAP.' });
    }
  };

  /**
   * Código -> diagrama: un .zip de un proyecto Spring Boot (o archivos .java). Se leen sus
   * entidades en el navegador y se comparan con el diagrama: con conexión, las diferencias quedan
   * como propuesta en el chat de la IA (el equipo decide); sin conexión, se aplican y se avisa al volver.
   */
  const handleImportarCodigo = async (e) => {
    const input = e.target;
    const archivos = Array.from(input.files || []);
    input.value = '';
    if (!archivos.length) return;
    const escapar = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    try {
      Swal.fire({ title: 'Leyendo el código...', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
      const modelo = modeloDesdeJava(await leerArchivosJava(archivos));
      Swal.close();
      const origen = archivos.length === 1 ? archivos[0].name : `${archivos.length} archivos`;
      if (!modelo.clases.length) {
        Swal.fire({ icon: 'info', title: 'No hay entidades', text: 'No encontré clases @Entity. Elige el .zip del proyecto Spring Boot o sus archivos .java.' });
        return;
      }
      const actual = { nodes, edges };
      const sinQuitar = compararConDiagrama(actual, modelo);
      const conQuitar = compararConDiagrama(actual, modelo, { quitarAusentes: true });
      const extra = conQuitar.cantidad - sinQuitar.cantidad;
      if (!sinQuitar.cantidad && !extra) {
        Swal.fire({ icon: 'success', title: 'El diagrama ya coincide con el código', text: `${modelo.clases.length} entidades leídas de ${origen}.` });
        return;
      }
      const lista = (r) => r.resumen.map((x) => `<li>${escapar(x)}</li>`).join('');
      const { isConfirmed, value: quitar } = await Swal.fire({
        title: '📥 Código → diagrama',
        html: `<div style="text-align:left;font-size:14px">
          <p>${modelo.clases.length} entidades y ${modelo.relaciones.length} relaciones leídas de <b>${escapar(origen)}</b>.</p>
          ${sinQuitar.cantidad ? `<p style="margin-top:8px"><b>Diferencias con el diagrama:</b></p><ul style="max-height:200px;overflow:auto;padding-left:18px;list-style:disc">${lista(sinQuitar)}</ul>` : '<p style="margin-top:8px">Solo hay elementos del diagrama que ya no están en el código.</p>'}
          ${modelo.avisos.length ? `<p style="margin-top:8px;font-size:12px;color:#92400e">${modelo.avisos.slice(0, 3).map(escapar).join('<br>')}</p>` : ''}
          <p style="margin-top:8px;font-size:12px;color:#555">${socketUnido ? 'Quedará como propuesta en el chat de la IA, con vista previa en la pizarra: el equipo la acepta o la rechaza.' : 'Sin conexión: se aplica ahora y el equipo se entera al volver la conexión.'}</p>
        </div>`,
        ...(extra > 0 ? { input: 'checkbox', inputValue: 0, inputPlaceholder: `Quitar también ${extra} elemento${extra === 1 ? '' : 's'} que ya no está${extra === 1 ? '' : 'n'} en el código` } : {}),
        showCancelButton: true,
        confirmButtonText: socketUnido ? 'Proponer al equipo' : 'Aplicar',
        cancelButtonText: 'Cancelar',
      });
      if (!isConfirmed) return;
      const r = quitar ? conQuitar : sinQuitar;
      if (socketUnido) {
        const resp = await colaboracion.proponerDesdeCodigo(
          { nodos: r.nodos, aristas: r.aristas, quitarNodos: r.quitarNodos, quitarAristas: r.quitarAristas },
          { archivo: origen, entidades: modelo.clases.length },
        );
        if (!resp?.ok) {
          Swal.fire({ icon: 'error', title: 'No se pudo proponer', text: resp?.mensaje || 'Revisa tu conexión.' });
          return;
        }
        setChatAbierto(true);
        setPedidoChat({ pestana: 'ia', n: Date.now() });
        return;
      }
      aplicarDiagrama(r.estado.nodes, r.estado.edges);
      colaboracion.agregarSinConexion?.({
        canal: 'equipo', tipo: 'usuario',
        texto: `📥 Importé el código (${origen}) sin conexión y apliqué ${r.cantidad} cambio${r.cantidad === 1 ? '' : 's'}: ${r.resumen.join('; ')}.`,
        datos: {},
      });
    } catch (error) {
      console.error('Importar código', error);
      Swal.fire({ icon: 'error', title: 'No se pudo leer el código', text: mensajeDeError(error, 'Elige el .zip del proyecto Spring Boot o sus archivos .java.') });
    }
  };

  // Colección de Postman + guía COMO_LLAMAR_LA_API.txt. La arma el servidor leyendo el backend
  // que genera este tablero: rutas, campos, tipos y cuentas de prueba coinciden con el proyecto.
  const handleGeneratePostmanCollection = async () => {
    try {
      const validNodes = nodes.filter(node => node.data?.className && node.data.className.trim() !== '');
      if (!validNodes.length) {
        Swal.fire({ icon: 'warning', title: 'Diagrama vacío', text: 'No hay clases para generar la colección Postman.' });
        return;
      }
      Swal.fire({ title: 'Generando colección de Postman...', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });

      const base = import.meta.env.VITE_API_BASE || import.meta.env.VITE_WS_URL || window.location.origin;
      const resp = await fetch(`${base}/apis/crearPagina/exportarPostman/${boardId}`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!resp.ok) {
        Swal.close();
        const mensaje = motivoDelServidor(await leerJSON(resp)) || mensajeDeError(errorDeRespuesta(resp, null), 'No se pudo generar la colección de Postman.');
        Swal.fire({ icon: 'error', title: 'No se pudo generar la colección de Postman', text: mensaje });
        return;
      }

      const blob = await resp.blob();
      const disp = resp.headers.get('content-disposition') || '';
      const m = /filename="?([^";]+)"?/.exec(disp);
      const nombre = m ? m[1] : `postman-${boardId}.zip`;
      saveAs(blob, nombre);

      Swal.close();
      Swal.fire({
        icon: 'success',
        title: '✅ Colección de Postman lista',
        html: `<div class="text-left"><p>Archivo: <strong>${nombre}</strong></p>
          <p class="text-sm text-gray-600 mt-2">Trae la colección y <strong>COMO_LLAMAR_LA_API.txt</strong>, con los pasos, las cuentas de prueba y ejemplos con curl.</p>
          <p class="text-sm text-gray-600 mt-2">En Postman: <strong>Import</strong> → el archivo .json → ejecuta <em>"0. Sesión → Iniciar sesión"</em> y el token queda guardado para todo lo demás.</p></div>`,
        confirmButtonText: 'Perfecto'
      });
    } catch (err) {
      console.error('Error generando colección Postman:', err);
      Swal.close();
      Swal.fire({ icon: 'error', title: 'No se pudo generar la colección de Postman', text: mensajeDeError(err, 'Intenta de nuevo.') });
    }
  };

  // Función para generar proyecto completo Spring Boot
  const handleGenerateCompleteProject = async () => {
    marcarTarea('exportar');
    // Try server-side export first (uses saved sala on backend). If that fails, fall back to client-side generator.
    try {
      if (!nodes.length) {
        Swal.fire({
          icon: 'warning',
          title: 'Diagrama vacío',
          text: 'No hay clases en el diagrama para generar el proyecto.'
        });
        return;
      }

      Swal.fire({
        title: 'Generando proyecto completo (server)...',
        text: 'Solicitando exportación al backend',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        willOpen: () => Swal.showLoading()
      });

      // Ensure current board is saved on server before requesting export by id
      try {
        const saveAck = await guardarEstado({ nodes, edges });
        // guardarEstado resolves with ack from server when joined; if it returns an object
        // without success or with error, we treat as failure to persist and abort server export.
        if (!saveAck || (saveAck.success === false) || saveAck.error) {
          console.warn('No se confirmó guardado en servidor antes de export:', saveAck);
          Swal.close();
          Swal.fire({
            icon: 'warning',
            title: 'No se pudo guardar en servidor',
            text: 'El diagrama no pudo ser guardado en el servidor. Se intentará generar el proyecto en el cliente.'
          });
          const projectName = `UMLProject_${boardId}`;
          await generateCompleteProject(nodes, edges, projectName);
          return;
        }
      } catch (saveErr) {
        console.warn('guardarEstado error:', saveErr);
        Swal.close();
        Swal.fire({
          icon: 'warning',
          title: 'Error guardando diagrama',
          text: 'No se pudo guardar el diagrama en el servidor. Se intentará generar localmente.'
        });
        const projectName = `UMLProject_${boardId}`;
        await generateCompleteProject(nodes, edges, projectName);
        return;
      }

      // POST to backend endpoint that exports Spring Boot project from sala id
      const exportUrl = `${import.meta.env.VITE_API_BASE || ''}/apis/crearPagina/exportarSpringBoot/${boardId}`;
      const resp = await fetch(exportUrl, {
        method: 'POST',
        credentials: 'include'
      });

      if (!resp.ok) {
        // Server-side export by id failed. Payload-based server export is disabled.
        Swal.close();
        const motivoSpring = motivoDelServidor(await leerJSON(resp));
        Swal.fire({
          icon: 'warning',
          title: 'El servidor no pudo generar el proyecto',
          text: `${motivoSpring || 'El servidor no pudo generar el proyecto Spring Boot.'} Se generará una versión del proyecto directamente en tu navegador.`
        });
        const projectName = `UMLProject_${boardId}`;
        await generateCompleteProject(nodes, edges, projectName);
        return;
      }

      // Backend responded — expect a zip blob
      const blob = await resp.blob();
      const contentDisposition = resp.headers.get('content-disposition') || '';
      let fileName = '';
      const fileNameMatch = /filename="?([^";]+)"?/.exec(contentDisposition);
      if (fileNameMatch) fileName = fileNameMatch[1];
      if (!fileName) fileName = `uml-${boardId}-springboot.zip`;

      const { saveAs } = await import('file-saver');
      saveAs(blob, fileName);

      Swal.close();
      Swal.fire({
        icon: 'success',
        title: '✅ ¡Proyecto exportado desde servidor!',
        html: `<div class="text-left"><p>Archivo descargado: <strong>${fileName}</strong></p></div>`,
        confirmButtonText: 'Perfecto'
      });

    } catch (error) {
      console.error('handleGenerateCompleteProject error:', error);
      Swal.close();
      // Final fallback to client-side generation
      try {
        Swal.fire({
          icon: 'info',
          title: 'Intentando generación en cliente',
          text: 'La exportación en servidor falló. Se intentará generar el ZIP en el navegador.'
        });
        const projectName = `UMLProject_${boardId}`;
        await generateCompleteProject(nodes, edges, projectName);
      } catch (clientErr) {
        Swal.close();
        Swal.fire({
          icon: 'error',
          title: 'No se pudo generar el proyecto',
          text: mensajeDeError(clientErr, 'Revisa que las clases tengan nombre y atributos válidos e intenta de nuevo.')
        });
      }
    }
  };

  // onConnect para crear aristas por defecto - Versión mejorada
  const onConnect = useCallback(
    (params) => {
      
      // 🔍 DEBUG TEMPORAL: Log completo de onConnect para debug de asociación
      console.debug(`🔗 onConnect llamado con params:`, params);
      
      if (!params.source || !params.target) {
        console.warn('⚠️ Error: source o target faltante', params);
        return;
      }

      // Detectar si es una conexión de nota
      const sourceNode = nodes.find(n => n.id === params.source);
      const targetNode = nodes.find(n => n.id === params.target);
      
      // 🔍 DEBUG TEMPORAL: Información de nodos involucrados
      console.debug(`   Source node:`, sourceNode?.data);
      console.debug(`   Target node:`, targetNode?.data);
      console.debug(`   Source isConnectionPoint: ${sourceNode?.data?.isConnectionPoint}`);
      console.debug(`   Target isConnectionPoint: ${targetNode?.data?.isConnectionPoint}`);
      
      const isNoteConnection = sourceNode?.data?.isNote || targetNode?.data?.isNote;
      const isAssociationCenterConnection = sourceNode?.data?.isConnectionPoint || targetNode?.data?.isConnectionPoint;



      // Crear edge con datos específicos según si es una nota o relación normal
      const newEdge = {
        id: `edge-${Date.now()}-${params.source}-${params.target}`,
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle || 'right',
        targetHandle: params.targetHandle || 'left',
        type: 'umlEdge',
        animated: false,
        data: isNoteConnection ? {
          type: 'NoteConnection',
          isNoteConnection: true,
          selected: false
        } : isAssociationCenterConnection ? {
          type: 'AssociationFromCenter',
          startLabel: '',
          endLabel: '',
          label: '',
          sourceRole: '',
          targetRole: '',
          selected: false,
          isFromAssociationCenter: true, // Marcador especial
          _localCreated: true
        } : {
          type: 'Association',
          startLabel: '',
          endLabel: '',
          label: '',
          sourceRole: '',
          targetRole: '',
          selected: false,
          // mark as locally created until server confirms/persists state
          _localCreated: true
        }
      };
      
      // 🔍 DEBUG TEMPORAL: Log del edge recién creado
      console.debug(`📝 Creando nuevo edge:`, newEdge);
      console.debug(`   Tipo detectado: ${isNoteConnection ? 'Nota' : isAssociationCenterConnection ? 'Desde Centro Asociación' : 'Normal'}`);
      if (isAssociationCenterConnection) {
        console.debug(`   ⭐ EDGE CREADO DESDE/HACIA PUNTO DE ASOCIACIÓN - debería originarse visualmente del punto AC`);
      }

      // Debug log: edge being created locally
  // console.debug('BoardPage:onConnect - creating edge', { newEdge, timestamp: Date.now() });

      // Use functional setter to avoid stale-closure races when multiple updates
      setEdges((prevEdges) => {
        const updatedEdges = addEdge(newEdge, prevEdges);
  // console.debug('BoardPage:onConnect - setEdges applied', { prevCount: prevEdges.length, newCount: updatedEdges.length });
        // Emit the updated edges to the server so other clients receive it
        try {
          updateBoardData(updatedEdges, "edges");
        } catch (err) {
          console.warn('onConnect: updateBoardData failed', err);
        }
        return updatedEdges;
      });

      // Auto-seleccionar el edge recién creado para edición
      setTimeout(() => {
        handleEdgeSelection(newEdge);
      }, 100);
    },
    [edges, nodes, setEdges, updateBoardData, handleEdgeSelection]
  );

  // Manejadores de edición...
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditingData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleInputChangeEdge = useCallback((event) => {
    const { name, value } = event.target;
    setEditingEdge((prev) => ({
      ...prev,
      [name]: value
    }));
  }, [setEditingEdge]);



  const handleArrayChange = (name, value) => {
    setEditingData((prev) => ({
      ...prev,
      [name]: value.split("\n"),
    }));
  };

  // Efecto para actualizar posiciones de puntos de conexión cuando los nodos se mueven
  useEffect(() => {
    const updateConnectionPoints = async () => {
      let hasUpdates = false;
      const updatedNodes = [...nodes];

      // Buscar todos los edges que tienen clases de asociación
      const associationEdges = edges.filter(edge => edge.data?.hasAssociationClass);

      for (const edge of associationEdges) {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        const connectionPoint = nodes.find(n => 
          n.data?.isConnectionPoint && 
          edges.some(e => e.target === n.id && e.data?.parentRelationId === edge.id)
        );

        if (sourceNode && targetNode && connectionPoint) {
          // Calcular dimensiones basadas en CSS real
          const calculateRealNodeDimensions = (node) => {
            const nodeWidth = 340;
            const padding = 20;
            const lineHeight = 22.4;
            const titleHeight = 32;
            const sectionTitleHeight = 18;
            const basePadding = 8;
            
            let totalHeight = padding * 2;
            totalHeight += titleHeight;
            
            const attributeCount = node.data?.attributes?.length || 0;
            const methodCount = node.data?.methods?.length || 0;
            
            if (attributeCount > 0) {
              totalHeight += sectionTitleHeight + basePadding;
              totalHeight += attributeCount * lineHeight;
              totalHeight += basePadding;
            }
            
            if (methodCount > 0) {
              totalHeight += sectionTitleHeight + basePadding;
              totalHeight += methodCount * lineHeight;
              totalHeight += basePadding;
            }
            
            totalHeight = Math.max(totalHeight, 100);
            
            return { width: nodeWidth, height: totalHeight };
          };
          
          const sourceDimensions = calculateRealNodeDimensions(sourceNode);
          const targetDimensions = calculateRealNodeDimensions(targetNode);
          
          const sourceX = sourceNode.position.x + sourceDimensions.width;
          const sourceY = sourceNode.position.y + (sourceDimensions.height / 2);
          const targetX = targetNode.position.x;
          const targetY = targetNode.position.y + (targetDimensions.height / 2);
          
          // Usar getSmoothStepPath para obtener labelX y labelY exactos
          const [, labelX, labelY] = getSmoothStepPath({
            sourceX,
            sourceY,
            sourcePosition: Position.Right,
            targetX,
            targetY,
            targetPosition: Position.Left,
            borderRadius: 5
          });

          const newMidX = labelX;
          const newMidY = labelY;

          // Verificar si la posición ha cambiado significativamente (más de 1 píxel)
          const currentX = connectionPoint.position.x + 5; // +5 porque restamos 5 al crear
          const currentY = connectionPoint.position.y + 5; // +5 porque restamos 5 al crear

          if (Math.abs(currentX - newMidX) > 1 || Math.abs(currentY - newMidY) > 1) {
            // Actualizar posición del punto de conexión
            const nodeIndex = updatedNodes.findIndex(n => n.id === connectionPoint.id);
            if (nodeIndex !== -1) {
              updatedNodes[nodeIndex] = {
                ...connectionPoint,
                position: { x: newMidX - 5, y: newMidY - 5 }
              };
              hasUpdates = true;
            }
          }
        }
      }

      // Aplicar actualizaciones si hay cambios
      if (hasUpdates) {
        setNodes(updatedNodes);
        await updateBoardData(updatedNodes, edges);
      }
    };

    // Ejecutar actualización con un pequeño delay para evitar demasiadas actualizaciones
    const timeoutId = setTimeout(updateConnectionPoints, 100);
    return () => clearTimeout(timeoutId);
  }, [nodes, edges, setNodes, updateBoardData]);

  

  // ----- Clases de asociación (utils/claseAsociacion.js) -----
  // "Elegir relación": tras pulsar el botón del panel, el siguiente clic en una línea crea la clase
  const [eligiendoRelacionAC, setEligiendoRelacionAC] = useState(false);
  const avisoClaseAsociacion = (titulo) =>
    Swal.fire({ toast: true, position: 'bottom', timer: 4500, showConfirmButton: false, icon: 'warning', title: titulo });

  /** Aplica el tablero que devuelven las funciones de clase de asociación (las clases primero). */
  const aplicarTablero = useCallback((tablero) => {
    setNodes(tablero.nodes);
    setEdges(tablero.edges.map((e) => (e.data?.selected ? { ...e, data: { ...e.data, selected: false } } : e)));
  }, [setNodes, setEdges]);

  /** Crea la clase de asociación de una relación y la deja seleccionada para renombrarla. */
  const crearClaseAsociacionEn = useCallback((relacionId) => {
    let resultado;
    try {
      resultado = crearClaseAsociacion({ nodes, edges }, relacionId);
    } catch (error) {
      avisoClaseAsociacion(error.message);
      return;
    }
    aplicarTablero(resultado);
    setSelectedEdge(null);
    setEditingEdge(null);
    handleNodeSelection(resultado.nodo);
  }, [nodes, edges, aplicarTablero, setSelectedEdge, setEditingEdge, handleNodeSelection]);

  // Botón del panel "Relación"
  const handleCreateAssociationClass = useCallback(() => {
    if (selectedEdge) crearClaseAsociacionEn(selectedEdge.id);
  }, [selectedEdge, crearClaseAsociacionEn]);

  // Botón "Clase de asociación": con una asociación elegida la crea; si no, pide hacer clic en una
  const iniciarClaseAsociacion = useCallback(() => {
    const relacion = selectedEdge && edges.find((e) => e.id === selectedEdge.id);
    if (relacion && admiteClaseAsociacion(relacion) && !claseAsociacionDe(relacion)) {
      crearClaseAsociacionEn(relacion.id);
      return;
    }
    setEligiendoRelacionAC((activo) => !activo);
  }, [selectedEdge, edges, crearClaseAsociacionEn]);

  useEffect(() => {
    if (!eligiendoRelacionAC) return undefined;
    const alPulsar = (evento) => { if (evento.key === 'Escape') setEligiendoRelacionAC(false); };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [eligiendoRelacionAC]);

  /** Une una clase que ya existe a una relación, como su clase de asociación (panel de la clase). */
  const vincularClaseExistente = useCallback((claseId, relacionId) => {
    try {
      aplicarTablero(vincularClaseAsociacion({ nodes, edges }, claseId, relacionId));
    } catch (error) {
      avisoClaseAsociacion(error.message);
      return;
    }
    // "Guardar Clase" escribe lo que hay en el panel: tiene que llevar la marca nueva
    setEditingData((prev) => (prev ? { ...prev, isAssociationClass: true, associatedEdgeId: relacionId } : prev));
  }, [nodes, edges, aplicarTablero, setEditingData]);

  /** La relación deja de tener clase de asociación; la clase queda como una clase común. */
  const quitarClaseAsociacion = useCallback((relacionId) => {
    aplicarTablero(desvincularClaseAsociacion({ nodes, edges }, relacionId));
    setEditingData((prev) => {
      if (!prev?.isAssociationClass || prev.associatedEdgeId !== relacionId) return prev;
      const { isAssociationClass, associatedEdgeId, ...resto } = prev;
      return resto;
    });
    setEditingEdge((prev) => {
      if (!prev?.hasAssociationClass || selectedEdge?.id !== relacionId) return prev;
      const { hasAssociationClass, associationClassNodeId, associationClassId, ...resto } = prev;
      return resto;
    });
  }, [nodes, edges, aplicarTablero, setEditingData, setEditingEdge, selectedEdge]);

  // Lo que muestran los paneles de la clase y de la relación seleccionadas
  const claseAsociacionSeleccion = useMemo(() => {
    const info = { relacionDeClase: null, relacionesParaVincular: [], claseDeRelacion: null };
    const nodo = selectedNode && nodes.find((n) => n.id === selectedNode.id);
    if (nodo) {
      const relacion = nodo.data?.isAssociationClass && edges.find((e) => e.id === nodo.data.associatedEdgeId);
      if (relacion) info.relacionDeClase = { id: relacion.id, etiqueta: describirRelacion(nodes, relacion) };
      else if (puedeSerClaseAsociacion(nodo)) info.relacionesParaVincular = relacionesParaClase(nodes, edges, nodo.id);
    }
    const relacion = selectedEdge && edges.find((e) => e.id === selectedEdge.id);
    const clase = relacion && nodes.find((n) => n.id === claseAsociacionDe(relacion));
    if (clase) info.claseDeRelacion = { id: clase.id, nombre: clase.data?.className || 'Clase' };
    return info;
  }, [nodes, edges, selectedNode, selectedEdge]);

  // Editar/Eliminar tablero (usa endpoints backend: PUT /apis/sala/:id y DELETE /apis/sala/:id)
  

  const handleEditBoard = async () => {
    try {
      // Obtener datos actuales del tablero
      const res = await fetch(`${import.meta.env.VITE_WS_URL || window.location.origin}/apis/sala/${boardId}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      const current = Array.isArray(data) && data.length > 0 ? data[0] : (data || {});

      const currentTitle = current.title || current.description || '';
      const currentDescription = current.description || '';

      const { value: formValues } = await Swal.fire({
        title: 'Editar tablero',
        html:
          `<input id="swal-input1" class="swal2-input" placeholder="Nombre del tablero" value="${String(currentTitle).replace(/"/g, '&quot;')}">` +
          `<textarea id="swal-input2" class="swal2-textarea" placeholder="Descripción">${String(currentDescription)}</textarea>`,
        focusConfirm: false,
        showCancelButton: true,
        preConfirm: () => {
          const title = document.getElementById('swal-input1')?.value || '';
          const description = document.getElementById('swal-input2')?.value || '';
          if (!title.trim()) {
            Swal.showValidationMessage('El nombre del tablero es obligatorio');
            return null;
          }
          return { title, description };
        }
      });

      if (!formValues) return;

      Swal.fire({ title: 'Guardando cambios...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      const putRes = await fetch(`${import.meta.env.VITE_WS_URL || window.location.origin}/apis/sala/${boardId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: formValues.title, description: formValues.description, updatedAt: new Date() })
      });

      const putResult = await putRes.json().catch(() => ({}));
      Swal.close();
      if (!putRes.ok) {
        Swal.fire({ icon: 'error', title: 'No se pudo editar el tablero', text: motivoDelServidor(putResult) || mensajeDeError(errorDeRespuesta(putRes, null), 'Intenta de nuevo.') });
        return;
      }

      Swal.fire({ icon: 'success', title: '¡Tablero actualizado!', timer: 1200, showConfirmButton: false });
      // Opcional: actualizar lista de participantes/metadatos mostrando nuevo titulo
    } catch (err) {
      console.error('handleEditBoard error', err);
      Swal.fire({ icon: 'error', title: 'No se pudo editar el tablero', text: mensajeDeError(err, 'Intenta de nuevo.') });
    }
  };

  

  const saveStudio = async () => {
    try {
      setSaving(true);
      Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const resp = await guardarEstado({ nodes, edges });
      Swal.close();
      if (resp && resp.success) {
        setUnsaved(false);
        Swal.fire({ icon: 'success', title: 'Guardado', timer: 1200, showConfirmButton: false });
      } else {
        Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: mensajeDeError(new Error((resp && resp.error) || ''), 'El servidor no confirmó el guardado. Revisa tu conexión e intenta de nuevo.') });
      }
    } catch (err) {
      console.error('Guardar button error', err);
      Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: mensajeDeError(err, 'Revisa tu conexión e intenta de nuevo.') });
    } finally { setSaving(false); }
  };
  const selectStudioNode = (node) => { handleNodeSelection(node); openStudioPanel('design'); };
  const selectStudioEdge = (edge) => { handleEdgeSelection(edge); openStudioPanel('design'); };
  // Con el panel como capa (pantallas angostas) se cierra para que se vea la clase marcada por la IA
  const enfocarDesdeChat = (nodoId) => { enfocarClase(nodoId); if (window.matchMedia('(max-width: 900px)').matches) setPanelOpen(false); };
  const abrirChatIA = () => { openStudioPanel('assistant'); setPedidoChat({ pestana: 'ia', n: Date.now() }); };
  const panelTitles = { design: 'Diseño', assistant: 'Chat del equipo', tools: 'Herramientas', export: 'Exportar' };
  const exportOptions = [
    { id: 'springboot', name: 'Spring Boot', detail: 'Tu backend, listo para construir.', icon: Code2, action: handleGenerateCompleteProject, tag: 'JAVA' },
    { id: 'flutter', name: 'Flutter', detail: 'Lleva tu idea a una aplicación.', icon: Layers, action: handleGenerateFlutterProject, tag: 'DART' },
    { id: 'sql', name: 'Base de datos', detail: 'Tablas y relaciones en PostgreSQL.', icon: Database, action: handleExportSQL, tag: 'SQL' },
    { id: 'postman', name: 'Postman', detail: 'Una colección para probar tu API.', icon: Braces, action: handleGeneratePostmanCollection, tag: 'JSON' },
    { id: 'xmi', name: 'Diagrama XMI', detail: 'Continúa en otras herramientas UML.', icon: FileCode2, action: handleExportXMI, tag: 'XMI' },
    { id: 'eap', name: 'Enterprise Architect', detail: 'Tu proyecto con su distribución.', icon: Workflow, action: handleExportEAP, tag: 'EAP' },
  ];
  const iaOcupada = !!colaboracion.estadoIA?.ocupada;
  const relacionesVisibles = edges.filter(e => !e.data?.isAssociationConnection).length;

  return (
    <main className={`studio ${panelOpen ? 'studio-panel-open' : ''}`}>
      <aside className="studio-rail" aria-label="Navegación del estudio">
        <Link to="/board" className="studio-mark" aria-label="Volver a mis diagramas" title="Mis diagramas"><Workflow size={25} strokeWidth={1.6} /></Link>
        <div className="studio-rail-divider" />
        <nav className="studio-rail-nav" aria-label="Paneles del editor">
          {[['design', SlidersHorizontal, 'Diseño'], ['assistant', MessagesSquare, 'Chat'], ['tools', Wrench, 'Acciones'], ['export', Download, 'Exportar']].map(([id, Icon, label]) => <button key={id} className={`studio-rail-button ${panelOpen && studioPanel === id ? 'is-active' : ''}`} onClick={() => openStudioPanel(id)} aria-pressed={panelOpen && studioPanel === id} aria-label={panelTitles[id]} title={panelTitles[id]}><Icon size={21} strokeWidth={1.6} /><span>{label}</span>{id === 'assistant' && chatSinLeer > 0 && !chatAbierto && <b className="studio-rail-badge" aria-label={`${chatSinLeer} mensajes sin leer`}>{chatSinLeer}</b>}</button>)}
        </nav>
        <div className="studio-rail-bottom"><button className="studio-rail-button" onClick={toggleTheme} aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} title={isDark ? 'Tema claro' : 'Tema oscuro'}>{isDark ? <Sun size={20} /> : <Moon size={20} />}</button><BotonAyuda embedded onRelanzarTour={() => setTourEditorAbierto(true)} /><span className="studio-version">UML 2.5</span></div>
      </aside>

      <section className="studio-workspace">
        <header className="studio-header">
          <div className="studio-document"><div className="studio-breadcrumb"><Link to="/board"><ArrowLeft size={12} /> Mis diagramas</Link><ChevronRight size={11} /><span>Estudio UML</span></div><h1 title={boardTitle}>{boardTitle}<span className="studio-document-type">DIAGRAMA DE CLASES</span></h1></div>
          <div className="studio-header-actions"><button className={`studio-ia-state ${iaOcupada ? 'is-busy' : ''}`} onClick={abrirChatIA} title={iaOcupada ? `La IA está atendiendo a ${colaboracion.estadoIA.atendiendoA}` : 'La IA del equipo: escríbele en el chat o con @IA'}><span className="status-dot" />{iaOcupada ? 'IA pensando…' : socketUnido ? 'IA del equipo' : 'IA local'}</button><span className="studio-save-state">{conectado ? <Check size={13} /> : <CloudOff size={13} />}{saving ? 'Guardando…' : !conectado ? 'Copia local' : unsaved ? 'Cambios pendientes' : 'Al día'}</span><span className="studio-user avatar" title={currentUser?.name || currentUser?.email}>{(currentUser?.name || currentUser?.email || 'T').charAt(0).toUpperCase()}</span><button className="studio-export-trigger" onClick={() => openStudioPanel('export')}><Download size={16} /><span>Exportar</span></button><button className="btn-primary studio-save" disabled={!unsaved || saving} onClick={saveStudio}><Save size={15} /><span>{saving ? 'Guardando…' : 'Guardar'}</span></button></div>
        </header>

        <div className="studio-body">
          <section className="studio-stage" aria-label="Área de diseño">
            <div className="studio-stage-heading"><div><span className="eyebrow">ESPACIO PARA CREAR</span><h2>Conecta tus ideas.</h2></div><div className="studio-stage-actions"><button className="studio-verify" onClick={() => archivoCodigoRef.current?.click()} aria-label="Actualizar desde el código" title="Actualizar el diagrama desde el código: elige el .zip del proyecto Spring Boot o sus archivos .java" data-tour="desde-codigo"><FileUp size={16} /><span>Desde código</span></button><input ref={archivoCodigoRef} type="file" accept=".zip,.java" multiple onChange={handleImportarCodigo} hidden /><button className="studio-verify" aria-label="Revisar diagrama" onClick={handleVerifyDiagramAI} data-tour="verificar"><ShieldCheck size={16} /><span>Revisar diagrama</span></button><button className="icon-button" onClick={() => setPanelOpen(!panelOpen)} title={panelOpen ? 'Ampliar el lienzo' : 'Mostrar panel'} aria-label={panelOpen ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}>{panelOpen ? <PanelRightClose size={19} /> : <PanelRightOpen size={19} />}</button></div></div>
            {avisoSincronia && <div className="studio-notice is-warm" role="status"><TriangleAlert size={14} /><span>{avisoSincronia}</span><button onClick={cerrarAvisoSincronia} aria-label="Cerrar aviso"><X size={13} /></button></div>}
            {eligiendoRelacionAC && <div className="studio-notice" role="status"><Spline size={14} /><span>Haz clic en la línea de la asociación entre las dos clases: se le agrega una clase de asociación.</span><button onClick={() => setEligiendoRelacionAC(false)}>Cancelar (Esc)</button></div>}
            {currentUser && !conectado && !errorAcceso && <div className="studio-offline"><CloudOff size={14} /><span>Sin conexión con el servidor: los cambios se guardan en este equipo y se sincronizan al reconectar. La IA local sigue disponible.</span></div>}
            <div className="studio-canvas-shell">
              <div className="studio-canvas-label"><span className="status-dot" /> LIENZO PRINCIPAL <span>/ 01</span></div>
              <div className="studio-canvas">
                <ReactFlow
                  data-tour="lienzo"
                  className={eligiendoRelacionAC ? 'is-picking' : undefined}
                  nodes={nodosMostrados}
                  edges={aristasMostradas}
                  onNodesChange={alCambiarNodos}
                  onEdgesChange={alCambiarAristas}
                  onConnect={onConnect}
                  onNodeClick={(_, node) => { if (!esFantasma(node.id)) selectStudioNode(nodes.find((n) => n.id === node.id) || node); }}
                  onEdgeClick={(_, edge) => {
                    if (esFantasma(edge.id)) return;
                    if (eligiendoRelacionAC) {
                      setEligiendoRelacionAC(false);
                      crearClaseAsociacionEn(edge.id);
                      openStudioPanel('design');
                      return;
                    }
                    selectStudioEdge(edges.find((e) => e.id === edge.id) || edge);
                  }}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  defaultEdgeOptions={defaultEdgeOptions}
                  connectionMode="loose"
                  isValidConnection={(connection) => connection.source && connection.target}
                  nodesDraggable={!canvasLocked}
                  nodesConnectable={!canvasLocked}
                  elementsSelectable={!canvasLocked}
                  fitView
                  fitViewOptions={{ padding: .28 }}
                  minZoom={0.15}
                >
                  {showGrid && <Background color="var(--canvas-dot)" gap={24} size={1} />}
                </ReactFlow>
                {nodosMostrados.length === 0 && <div className="studio-empty-canvas"><div className="studio-empty-art" aria-hidden="true"><Braces size={35} strokeWidth={1.3} /><span /><Workflow size={32} strokeWidth={1.3} /></div><span className="eyebrow">EL COMIENZO DE ALGO GRANDE</span><h3>Tu próxima idea,<br /><em>en este lienzo.</em></h3><p>Añade tu primera clase o pídele una idea a la IA del equipo.<br />El resto empieza a conectar.</p><button onClick={abrirChatIA} className="studio-empty-ai"><Sparkles size={15} /> Crear con la IA del equipo <ArrowUpRight size={15} /></button></div>}
              </div>
              <div className="studio-canvas-footer"><span><Braces size={13} /> {nodes.filter(n => !n.data?.isNote).length} clases<span className="studio-stat-divider" />{relacionesVisibles} relaciones</span><span className="studio-canvas-tip">Arrastra desde un punto para conectar</span><div className="studio-zoom"><button aria-label="Alejar" title="Alejar" onClick={() => zoomOut({ duration: 200 })}><Minus size={14} /></button><span>{Math.round(zoom * 100)}%</span><button aria-label="Acercar" title="Acercar" onClick={() => zoomIn({ duration: 200 })}><Plus size={14} /></button><button aria-label="Ajustar diagrama a la vista" title="Ajustar a la vista" onClick={() => fitView({ padding: .2, duration: 250 })}><Maximize2 size={14} /></button><button aria-label="Mostrar cuadrícula" title="Mostrar cuadrícula" aria-pressed={showGrid} onClick={() => setShowGrid(!showGrid)}><Grid2X2 size={14} /></button><button aria-label={canvasLocked ? "Desbloquear edición del lienzo" : "Bloquear edición del lienzo"} title={canvasLocked ? "Desbloquear lienzo" : "Bloquear lienzo"} aria-pressed={canvasLocked} onClick={() => setCanvasLocked(!canvasLocked)}>{canvasLocked ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}</button></div></div>
            </div>

            <div className="studio-bottom"><span className="studio-bottom-note"><span className="status-dot" /> {activeUsers.length > 1 ? `${activeUsers.length} personas creando` : 'A tu ritmo. A tu manera.'}</span><div className="studio-creation-bar"><button className="studio-add-class" data-tour="nueva-clase" onClick={() => { addNode(); openStudioPanel('design'); }}><Plus size={18} /><span>Nueva clase</span></button><button className="studio-add-note" aria-label="Nueva nota" title="Nueva nota" onClick={() => addNode('noteNode', { text: 'Nueva nota...\nHaz clic para editar', isNote: true })}><StickyNote size={18} /><span>Nota</span></button><button className={`studio-add-association ${eligiendoRelacionAC ? 'is-active' : ''}`} data-tour="clase-asociacion" aria-pressed={!!eligiendoRelacionAC} aria-label="Clase de asociación" title="Clase unida con una línea punteada a una asociación entre dos clases (clase intermedia)" onClick={iniciarClaseAsociacion}><Spline size={18} /><span>{eligiendoRelacionAC ? 'Elige la relación…' : 'Asociación'}</span></button><span className="studio-tool-divider" /><div className="studio-history" data-tour="deshacer"><button onClick={deshacer} disabled={!puedeDeshacer} aria-label="Deshacer" title="Deshacer (Ctrl+Z)"><Undo2 size={17} /></button><button onClick={rehacer} disabled={!puedeRehacer} aria-label="Rehacer" title="Rehacer (Ctrl+Y)"><Redo2 size={17} /></button></div></div><span className="studio-shortcut"><kbd>Ctrl</kbd> + <kbd>Z</kbd> para deshacer</span></div>
          </section>

          {panelOpen && <button className="studio-panel-backdrop" onClick={() => setPanelOpen(false)} aria-label="Cerrar panel lateral" />}
          <aside className="studio-inspector" hidden={!panelOpen} aria-label="Panel del estudio">
            <div className="studio-inspector-header"><span>{panelTitles[studioPanel]}</span><button onClick={() => setPanelOpen(false)} className="icon-button" aria-label="Cerrar panel del estudio"><X size={17} /></button></div>
            <div className="studio-panel-tabs" role="tablist" aria-label="Contenido del panel"><button role="tab" id="studio-tab-design" aria-controls="studio-design" aria-selected={studioPanel === 'design'} onClick={() => setStudioPanel('design')}><SlidersHorizontal size={14} /> Diseño</button><button role="tab" id="studio-tab-assistant" aria-controls="studio-assistant" aria-selected={studioPanel === 'assistant'} onClick={() => setStudioPanel('assistant')}><MessagesSquare size={14} /> Chat{chatSinLeer > 0 && studioPanel !== 'assistant' && <b className="studio-chat-badge">{chatSinLeer}</b>}</button><button role="tab" id="studio-tab-tools" aria-controls="studio-tools" aria-selected={studioPanel === 'tools'} onClick={() => setStudioPanel('tools')}><Wrench size={14} /> Acciones</button></div>

            <section id="studio-design" role="tabpanel" aria-labelledby="studio-tab-design" className="studio-panel-content" hidden={studioPanel !== 'design'}>
              {!selectedNode && !selectedEdge && <div className="studio-design-intro"><span className="eyebrow">DALE FORMA A LO QUE VIENE</span><h3>De una idea<br />a mil conexiones.</h3><Workflow size={55} strokeWidth={1.1} /></div>}
              <LeftSidebar embedded addNode={addNode} selectedNode={selectedNode} selectedEdge={selectedEdge} editingData={editingData} editingEdge={editingEdge} handleInputChange={handleInputChange} handleArrayChange={handleArrayChange} handleInputChangeEdge={handleInputChangeEdge} updateNodeData={updateNodeData} updateEdgeData={updateEdgeData} handleCreateAssociationClass={handleCreateAssociationClass} iniciarClaseAsociacion={iniciarClaseAsociacion} eligiendoRelacionAC={eligiendoRelacionAC} claseAsociacionSeleccion={claseAsociacionSeleccion} vincularClaseExistente={vincularClaseExistente} quitarClaseAsociacion={quitarClaseAsociacion} setSelectedEdge={setSelectedEdge} setEditingEdge={setEditingEdge} />
              <div className="studio-outline"><div className="studio-outline-heading"><span>EN ESTE LIENZO</span><span>{nodes.length}</span></div>{nodes.length ? nodes.map(node => <button key={node.id} onClick={() => { selectStudioNode(node); fitView({ nodes: [{ id: node.id }], maxZoom: 1, duration: 250 }); }} className={selectedNode?.id === node.id ? 'is-selected' : ''}>{node.data?.isNote ? <StickyNote size={15} /> : <Braces size={15} />}<span>{node.data?.className || node.data?.text?.split('\n')[0] || 'Nota'}</span><ChevronRight size={13} /></button>) : <p>Las clases y notas que crees aparecerán aquí.</p>}</div>
              {(activeUsers.length > 0 || participantes.length > 0) && <div className="studio-participants"><span className="eyebrow"><Users size={13} /> EN LÍNEA</span>{(activeUsers.length ? activeUsers : participantes).map((p, idx) => <span key={idx}>{typeof p === 'string' ? p : p.name || p.email || 'Participante'}</span>)}</div>}
            </section>

            <section id="studio-assistant" role="tabpanel" aria-labelledby="studio-tab-assistant" className="studio-assistant-slot" hidden={studioPanel !== 'assistant'}>{currentUser && <ChatSala colaboracion={colaboracion} currentUser={currentUser} onEnfocarClase={enfocarDesdeChat} onQuitarMarcas={() => setRevisionOcultaId(colaboracion.ultimaRevision?.id ?? null)} abierto={chatAbierto} setAbierto={setChatAbierto} enLinea={!!socketUnido} iaLocal={iaLocal} pedidoExterno={pedidoChat} />}</section>
            <section id="studio-tools" role="tabpanel" aria-labelledby="studio-tab-tools" className="studio-panel-content" hidden={studioPanel !== 'tools'}><BurbujaHerramientasDiagrama embedded nodes={nodes} edges={edges} setNodes={setNodes} setEdges={setEdges} selectedNodeIds={selectedNode ? [selectedNode.id] : []} selectedEdgeIds={selectedEdge ? [selectedEdge.id] : []} boardId={boardId} updateBoardData={updateBoardData} userEmail={currentUser?.email} /></section>
            <section className="studio-panel-content studio-export-panel" hidden={studioPanel !== 'export'} aria-label="Formatos de exportación"><div className="studio-export-intro"><span><ArrowUpRight size={25} /></span><span className="eyebrow">EL SIGUIENTE PASO</span><h3>Tu idea, más allá<br />del lienzo.</h3><p>Elige cómo quieres continuar con tu proyecto.</p></div><div className="studio-export-options">{exportOptions.map(({ id, name, detail, icon: Icon, action, tag }) => <button key={id} onClick={action} data-tour={id}><span className="studio-export-icon"><Icon size={19} /></span><span><strong>{name}</strong><small>{detail}</small></span><span className="studio-export-format">{tag}</span></button>)}</div><button className="studio-export-more" onClick={() => setStudioPanel('tools')}>¿Buscas una imagen o un JSON?<ArrowUpRight size={15} /></button></section>
          </aside>
        </div>
      </section>
      {errorAcceso && (
        <div className="modal-overlay studio-lock-overlay" role="alertdialog" aria-modal="true" aria-labelledby="studio-lock-title">
          <div className="modal-shell studio-lock">
            <span className="studio-lock-icon"><LockKeyhole size={28} strokeWidth={1.6} /></span>
            <span className="eyebrow">ACCESO RESTRINGIDO</span>
            <h2 id="studio-lock-title">No puedes abrir este tablero.</h2>
            <p>{errorAcceso}</p>
            <button onClick={() => navigate('/board')} className="btn-primary"><ArrowLeft size={16} /> Ir a mis diagramas</button>
          </div>
        </div>
      )}
      <Tour pasos={TOUR_EDITOR} abierto={tourEditorAbierto} onStepChange={revealTourPanel} onCerrar={() => { setTourEditorAbierto(false); marcarTourVisto('editor'); }} />
    </main>
  );
};

export default function BoardPageWrapper() {
  return <ReactFlowProvider><BoardPage /></ReactFlowProvider>;
}
