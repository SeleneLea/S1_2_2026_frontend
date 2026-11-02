import { MousePointer2, StickyNote } from 'lucide-react';
import React, { useState, useEffect } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusCircleIcon,
} from "@heroicons/react/24/outline";
import { ESTEREOTIPOS } from '../../utils/umlParser.js';

const LeftSidebar = ({
  addNode,
  selectedNode,
  selectedEdge,
  editingData,
  editingEdge,
  handleInputChange,
  handleInputChangeEdge,
  handleArrayChange,
  updateNodeData,
  updateEdgeData,
  handleCreateAssociationClass,
  iniciarClaseAsociacion,
  eligiendoRelacionAC,
  claseAsociacionSeleccion = {},
  vincularClaseExistente,
  quitarClaseAsociacion,
  setSelectedEdge,
  setEditingEdge,
  embedded = false,
}) => {
  const { relacionDeClase, relacionesParaVincular = [], claseDeRelacion } = claseAsociacionSeleccion;
  const [activeTab, setActiveTab] = useState('node');
  const [isCollapsed, setIsCollapsed] = useState(() => window.matchMedia('(max-width: 600px)').matches);

  // Opciones de cardinalidad y tipos de relación
  const cardinalityOptions = ["0..1", "1", "0..*", "1..*", "*"];
  const relationshipTypes = [
    { value: "Association", label: "Asociación" },
    { value: "Aggregation", label: "Agregación" },
    { value: "Composition", label: "Composición" },
    { value: "Generalization", label: "Generalización" },
    { value: "Implementation", label: "Implementación" },
    { value: "Dependency", label: "Dependencia" },
  ];

  // Cuando se selecciona un nodo/edge, ajustamos la pestaña activa
  useEffect(() => {
    if (selectedNode) setActiveTab('node');
    if (selectedEdge) setActiveTab('edge');
  }, [selectedNode, selectedEdge]);

  // ==========================
  // LÓGICA DE VALIDACIONES EXTRA
  // ==========================
  const handleAddNode = () => {
    // Ejemplo: podrías evitar la creación si hay un "nodo fantasma" no guardado
    // o hacer otro tipo de validaciones. Aquí lo dejo simple:
    addNode();
  };

  // Función para crear una nota/anotación
  const handleAddNote = () => {
    addNode('noteNode', {
      text: 'Nueva nota...\nHaz clic para editar',
      isNote: true
    });
  };

  // Evita que se guarde la clase si no tiene nombre
  const handleSaveNode = () => {
    if (!editingData?.className?.trim()) {
      alert('El nombre de la clase no puede estar vacío.');
      return;
    }
    // Podrías meter aquí checks más avanzados
    updateNodeData();
  };

  // Evita que se guarde la relación si no tiene "type"
  const handleSaveEdge = () => {
    if (!editingEdge?.type) {
      alert('El tipo de relación no puede estar vacío.');
      return;
    }
    // Ejemplo: Evitar que sea la misma clase => require source != target
    // (este check usualmente se haría al crear el edge en onConnect, 
    //  pero podrías duplicarlo aquí)
    updateEdgeData();
  };

  // ==========================
  // EDITOR DE NOTAS
  // ==========================
  const renderNoteEditor = () => (
    <div className="card bg-yellow-50 border border-yellow-200 shadow-md p-4 rounded-lg animate-fadeIn">
      <h3 className="text-xl font-bold mb-4 text-yellow-800 text-center flex items-center justify-center gap-2">
        <span>📝</span>
        {editingData?.isNote ? 'Editar Nota' : 'Nueva Nota'}
      </h3>

      {/* Contenido de la nota */}
      <div className="mb-4">
        <label className="block text-sm font-semibold mb-1 text-yellow-700">
          Contenido de la Nota
        </label>
        <textarea
          name="text"
          value={editingData?.text || ''}
          onChange={handleInputChange}
          className="w-full px-3 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 bg-yellow-50"
          rows="6"
          placeholder="Escribe tu nota aquí..."
          style={{ resize: 'vertical' }}
        />
        <p className="text-xs text-yellow-600 mt-1">
          💡 Puedes usar saltos de línea para organizar mejor tu texto
        </p>
      </div>

      <button
        onClick={updateNodeData}
        className="w-full px-4 py-2 bg-yellow-500 text-white font-semibold rounded-lg hover:bg-yellow-600 transition-colors duration-200"
      >
        Guardar Nota
      </button>
    </div>
  );

  // ==========================
  // EDITOR DE NODOS (CLASES)
  // ==========================
  const renderNodeEditor = () => (
    <div data-tour="panel-lateral" className="card bg-white shadow-md p-4 rounded-lg animate-fadeIn">
      <h3 className="text-xl font-bold mb-4 text-gray-800 text-center">
        {editingData?.className || 'Nueva Clase'}
      </h3>

      {/* Nombre de la clase */}
      <div className="mb-4">
        <label className="block text-sm font-semibold mb-1 text-gray-700">
          Nombre de la clase
        </label>
        <input
          type="text"
          name="className"
          value={editingData?.className || ''}
          onChange={handleInputChange}
          className="input-modern"
          placeholder="Ej. Persona"
        />
      </div>

      {/* Estereotipo UML 2.5 */}
      <div className="mb-4">
        <label className="block text-sm font-semibold mb-1 text-gray-700">
          Tipo de clasificador
        </label>
        <select
          name="stereotype"
          value={editingData?.stereotype || ''}
          onChange={handleInputChange}
          className="input-modern"
        >
          {ESTEREOTIPOS.map(op => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </select>
      </div>

      {/* Atributos (o literales, si es una enumeración) */}
      <div className="mb-4">
        <label className="block text-sm font-semibold mb-1 text-gray-700">
          {editingData?.stereotype === 'enumeration' ? 'Literales' : 'Atributos'}
        </label>
        <textarea
          name="attributes"
          value={editingData?.attributes?.join("\n") || ''}
          onChange={(e) => handleArrayChange("attributes", e.target.value)}
          className="input-modern"
          rows="4"
          placeholder="+ nombre: string = ''"
        />
        <p className="text-xs text-gray-500 mt-1">
          {editingData?.stereotype === 'enumeration'
            ? <>Un literal por línea. Ej. <code>ACTIVO</code></>
            : <>Formato: <code>+ nombre: tipo = valor</code> &nbsp;(<code>+</code> público, <code>-</code> privado, <code>#</code> protegido)</>}
        </p>
      </div>

      {/* Métodos */}
      <div className="mb-4">
        <label className="block text-sm font-semibold mb-1 text-gray-700">
          Métodos
        </label>
        <textarea
          name="methods"
          value={editingData?.methods?.join("\n") || ''}
          onChange={(e) => handleArrayChange("methods", e.target.value)}
          className="input-modern"
          rows="4"
          placeholder="+ metodo(param): tipo"
        />
        <p className="text-xs text-gray-500 mt-1">
          Formato: <code>+ metodo(params): tipo</code>
        </p>
      </div>

      {/* Clase de asociación: la clase unida con línea punteada a una asociación */}
      {relacionDeClase ? (
        <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <p className="text-sm font-semibold text-indigo-900">🔗 Clase de asociación de</p>
          <p className="text-sm text-indigo-800 break-words">{relacionDeClase.etiqueta}</p>
          <button
            onClick={() => quitarClaseAsociacion(relacionDeClase.id)}
            className="btn-secondary w-full mt-2 text-sm"
          >
            Quitar de la relación
          </button>
        </div>
      ) : relacionesParaVincular.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1 text-gray-700">
            Usar como clase de asociación de
          </label>
          <select
            value=""
            onChange={(e) => e.target.value && vincularClaseExistente(selectedNode.id, e.target.value)}
            className="input-modern"
          >
            <option value="">Ninguna relación</option>
            {relacionesParaVincular.map((r) => (
              <option key={r.id} value={r.id}>{r.etiqueta}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            La clase queda unida con una línea punteada a la asociación elegida.
          </p>
        </div>
      )}

      <button
        onClick={handleSaveNode}
        className="btn-primary w-full mt-2"
      >
        Guardar Clase
      </button>
    </div>
  );

  // ==========================
  // EDITOR DE ARISTAS (RELACIONES) - Versión mejorada
  // ==========================
  const renderEdgeEditor = () => {
  // console.log('🎨 Renderizando editor de relaciones');
  // console.log('🎨 selectedEdge:', selectedEdge);
  // console.log('🎨 editingEdge:', editingEdge);

    if (!selectedEdge) {
      return (
        <div className="card bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
          <p className="text-yellow-800 text-center">
            ⚠️ No hay relación seleccionada
          </p>
          <p className="text-yellow-600 text-sm mt-2 text-center">
            Haz clic en una línea de conexión para editarla
          </p>
        </div>
      );
    }

    if (!editingEdge) {
      return (
        <div className="card bg-red-50 border border-red-200 p-4 rounded-lg">
          <p className="text-red-800 text-center">
            ❌ Error: No hay datos para editar
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="btn-secondary mt-2 text-sm"
          >
            Recargar página
          </button>
        </div>
      );
    }

    return (
      <div className="card bg-white shadow-md p-4 rounded-lg animate-fadeIn border-l-4 border-blue-500">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-800">
            ✏️ Editar Relación
          </h3>
          <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            ID: {selectedEdge.id?.substring(0, 8)}...
          </div>
        </div>

      <div className="mb-4">
        <label className="block text-sm font-semibold mb-1 text-gray-700">
          Tipo de Relación
        </label>
        <select
          name="type"
          value={editingEdge?.type || "Association"}
          onChange={handleInputChangeEdge}
          className="select-modern"
        >
          {relationshipTypes.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Cardinalidad (sólo si es Association) */}
      {editingEdge?.type === "Association" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1 text-gray-700">
              Cardinalidad Inicial
            </label>
            <select
              name="startLabel"
              value={editingEdge?.startLabel || ""}
              onChange={handleInputChangeEdge}
              className="select-modern"
            >
              <option value="">Ninguna</option>
              {cardinalityOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1 text-gray-700">
              Cardinalidad Final
            </label>
            <select
              name="endLabel"
              value={editingEdge?.endLabel || ""}
              onChange={handleInputChangeEdge}
              className="select-modern"
            >
              <option value="">Ninguna</option>
              {cardinalityOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
      )}

        {/* Clase de asociación de la relación: la que tiene, o el botón para crearla */}
        {claseDeRelacion ? (
          <div className="mt-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
            <p className="text-indigo-900 text-sm text-center font-medium">
              🔗 Clase de asociación: {claseDeRelacion.nombre}
            </p>
            <button
              onClick={() => quitarClaseAsociacion(selectedEdge.id)}
              className="btn-secondary w-full mt-2 text-sm"
            >
              Quitar clase de asociación
            </button>
          </div>
        ) : editingEdge?.type === "Association" && (
          <div className="mt-4">
            <button
              onClick={handleCreateAssociationClass}
              className="btn-accent w-full flex items-center justify-center gap-2"
            >
              🔗 Crear Clase de Asociación
            </button>
            <p className="text-xs text-gray-500 mt-1 text-center">
              Crea una clase unida con línea punteada a esta relación
            </p>
          </div>
        )}

        {/* Información adicional del edge */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-xs text-gray-600 space-y-1">
            <div><strong>Desde:</strong> {selectedEdge.source}</div>
            <div><strong>Hacia:</strong> {selectedEdge.target}</div>
            <div><strong>Tipo actual:</strong> {editingEdge.type}</div>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSaveEdge}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            💾 Guardar
          </button>
          <button
            onClick={() => {
              setSelectedEdge(null);
              setEditingEdge(null);
            }}
            className="btn-secondary px-3"
            title="Cancelar edición"
          >
            ❌
          </button>
        </div>
      </div>
    );
  };

  if (embedded) {
    return <div className="studio-properties" data-tour="panel-lateral">
      <div className="studio-properties-heading"><span className="eyebrow">PROPIEDADES</span><p>Cada detalle cuenta.</p></div>
      {(selectedNode || selectedEdge) ? <>
        <div className="studio-property-tabs">
          <button onClick={() => setActiveTab('node')} disabled={!selectedNode} aria-pressed={activeTab === 'node'}>{selectedNode?.data?.isNote ? 'Nota' : 'Clase'}</button>
          <button onClick={() => setActiveTab('edge')} disabled={!selectedEdge} aria-pressed={activeTab === 'edge'}>Relación</button>
        </div>
        {activeTab === 'node' && selectedNode && (selectedNode.data?.isNote ? renderNoteEditor() : renderNodeEditor())}
        {activeTab === 'edge' && selectedEdge && renderEdgeEditor()}
      </> : <div className="studio-property-empty"><MousePointer2 size={25} /><h3>Elige una pieza.</h3><p>Selecciona una clase, una nota o una relación para darle tu toque.</p></div>}
    </div>;
  }

  // ==========================
  // RENDER PRINCIPAL DEL SIDEBAR
  // ==========================
  return (
    <div
      className={`editor-sidebar ${isCollapsed ? 'is-collapsed' : ''}`}

    >
      {/* Botón para colapsar/expandir */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-label={isCollapsed ? "Expandir panel de herramientas" : "Contraer panel de herramientas"}
        aria-expanded={!isCollapsed}
        className={`
          absolute -right-4 top-5 z-10 p-1
          rounded-full shadow bg-white border border-gray-300
          flex items-center justify-center
          transition-transform hover:scale-105
        `}
      >
        {isCollapsed ? (
          <ChevronRightIcon className="w-5 h-5 text-gray-600" />
        ) : (
          <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
        )}
      </button>

      {/* Contenido visible si NO está colapsado (con scroll propio: el editor puede ser más alto que la pantalla) */}
      {!isCollapsed && (
        <div className="sidebar-content space-y-6">
          <h2 className="sidebar-title">TU CAJA DE HERRAMIENTAS</h2>
          {/* Botones de creación */}
          <div className="space-y-2">
            {/* Botón "Nueva Clase" */}
            <button
              onClick={handleAddNode}
              data-tour="nueva-clase"
              className="btn-primary flex items-center gap-2 w-full"
            >
              <PlusCircleIcon className="w-5 h-5" />
              Nueva Clase
            </button>
            
            {/* Botón "Nueva Nota" */}
            <button
              onClick={handleAddNote}
              className="btn-secondary flex items-center gap-2 w-full bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200"
            >
              <StickyNote size={18} />
              Nueva Nota
            </button>

            {/* Botón "Clase de asociación": se elige la relación con un clic en su línea */}
            <button
              onClick={iniciarClaseAsociacion}
              data-tour="clase-asociacion"
              aria-pressed={!!eligiendoRelacionAC}
              title="Clase unida con una línea punteada a una asociación entre dos clases (clase intermedia)"
              className={`btn-secondary flex items-center gap-2 w-full ${eligiendoRelacionAC ? 'bg-indigo-100 text-indigo-900 border-indigo-300' : ''}`}
            >
              <span className="w-5 h-5 flex items-center justify-center">🔗</span>
              {eligiendoRelacionAC ? 'Elige la relación…' : 'Clase de asociación'}
            </button>
            {eligiendoRelacionAC && (
              <p className="text-xs text-indigo-800">
                Haz clic en la línea de la asociación entre las dos clases. Esc para cancelar.
              </p>
            )}
          </div>

          {!selectedNode && !selectedEdge && <div className="sidebar-hint"><MousePointer2 size={24} strokeWidth={1.5} /><strong>Cada idea empieza con una clase.</strong>Añade una clase o selecciona un elemento del lienzo para editar sus propiedades.</div>}
          {/* Si hay un nodo o arista seleccionado, mostramos el editor */}
          {(selectedNode || selectedEdge) && (
            <div>
              {/* Tabs "Clase/Nota" / "Relación" */}
              <div className="flex justify-center space-x-2 mb-4">
                <button
                  onClick={() => setActiveTab('node')}
                  className={`
                    flex-1 py-2 rounded-md font-semibold text-sm transition-colors
                    ${activeTab === 'node'
                      ? (selectedNode?.data?.isNote ? 'bg-yellow-500 text-white' : 'bg-indigo-600 text-white')
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                    }
                  `}
                  disabled={!selectedNode}
                >
                  {selectedNode?.data?.isNote ? '📝 Nota' : '🏛️ Clase'}
                </button>
                <button
                  onClick={() => setActiveTab('edge')}
                  className={`
                    flex-1 py-2 rounded-md font-semibold text-sm transition-colors
                    ${activeTab === 'edge'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                    }
                  `}
                  disabled={!selectedEdge}
                >
                  Relación
                </button>
              </div>

              {/* Renderizado condicional según la pestaña activa */}
              {activeTab === 'node' && selectedNode && (
                selectedNode.data?.isNote ? renderNoteEditor() : renderNodeEditor()
              )}
              {activeTab === 'edge' && selectedEdge && renderEdgeEditor()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(LeftSidebar);
