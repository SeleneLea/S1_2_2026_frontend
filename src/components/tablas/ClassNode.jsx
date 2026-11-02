// ClassNode.jsx
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { mostrarAtributo, mostrarMetodo, etiquetaEstereotipo } from '../../utils/umlParser.js';

// Vista previa de la IA: cómo se ve la clase según la propuesta o la revisión
const ESTILO_PROPUESTA = {
  nueva: { outline: '3px dashed var(--color-success)', outlineOffset: 3, opacity: 0.8 },
  modificada: { outline: '3px dashed var(--color-warning)', outlineOffset: 3 },
  eliminada: { outline: '3px dashed var(--color-error)', outlineOffset: 3, opacity: 0.55 },
};
const ETIQUETA_PROPUESTA = {
  nueva: ['🤖 Clase nueva propuesta', 'var(--color-success)'],
  modificada: ['🤖 Cambios propuestos', 'var(--color-warning)'],
  eliminada: ['🤖 Se eliminaría', 'var(--color-error)'],
};
const COLOR_OBSERVACION = { error: 'var(--color-error)', aviso: 'var(--color-warning)', sugerencia: 'var(--sage-ink)' };

function Insignia({ texto, color, titulo }) {
  return (
    <div
      title={titulo}
      style={{
        position: 'absolute', top: -22, left: 0, background: color, color: 'var(--color-surface)', fontSize: 10, fontWeight: 600,
        padding: '2px 6px', borderRadius: 6, whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden',
        textOverflow: 'ellipsis', boxShadow: '0 1px 3px var(--color-shadow-elevated)', zIndex: 5,
      }}
    >
      {texto}
    </div>
  );
}

function ClassNode({ data, isConnectable }) {
  const propuesta = data?._propuesta;
  const cambios = data?._propuestaCambios;
  const observaciones = Array.isArray(data?._observaciones) ? data._observaciones : [];
  const peorObservacion = ['error', 'aviso', 'sugerencia'].find((g) => observaciones.some((o) => o.gravedad === g));
  const estiloVista = propuesta
    ? ESTILO_PROPUESTA[propuesta]
    : peorObservacion ? { outline: `3px solid ${COLOR_OBSERVACION[peorObservacion]}`, outlineOffset: 3 } : {};
  const marca = (texto, nuevo) => (nuevo
    ? <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>+ {texto}</span>
    : texto);
  const tachado = (texto, key) => (
    <li key={key} style={{ color: 'var(--color-error)', textDecoration: 'line-through' }}>{texto}</li>
  );
  // Opcional: parsear cada atributo si viene con un separador. 
  // Por ejemplo, si guardas "private edad: int", no hace falta transformarlo.
  // Pero si guardas "edad,int,private" tendrías que formatearlo aquí.

  // Si es un punto de conexión, renderizar un punto visible para debug
  if (data?.isConnectionPoint) {
    return (
      <div style={{ 
        width: 12, 
        height: 12, 
        background: 'var(--sage-ink)', // Azul más visible
        borderRadius: '50%',
        border: '2px solid #ffffff',
        position: 'relative',
        zIndex: 1001,
        boxShadow: '0 0 6px var(--color-shadow-elevated)'
      }}>
        <Handle
          type="target"
          position={Position.Top}
          id="connection-point"
          isConnectable={isConnectable}
          style={{ 
            opacity: 1, // Hacerlo visible
            top: '50%', 
            left: '50%', 
            transform: 'translate(-50%, -50%)',
            width: 12,
            height: 12,
            background: 'var(--sage-ink)',
            border: '2px solid #fff'
          }}
        />
      </div>
    );
  }

  return (
    <div className="class-node" style={{ minWidth: 160, position: 'relative', ...estiloVista }}>
      {propuesta && <Insignia texto={ETIQUETA_PROPUESTA[propuesta][0]} color={ETIQUETA_PROPUESTA[propuesta][1]} />}
      {!propuesta && peorObservacion && (
        <Insignia
          texto={`🤖 ${observaciones[0].texto}`}
          color={COLOR_OBSERVACION[peorObservacion]}
          titulo={observaciones.map((o) => `• ${o.texto}`).join('\n')}
        />
      )}
      {/* Puntos de conexión (también en una clase de asociación: puede tener sus propias relaciones) */}
      <>
          {/* HANDLES BIDIRECCIONALES - Lado Derecho (VERDE) */}
          <Handle
            type="source"
            position={Position.Right}
            id="right-top"
            isConnectable={isConnectable}
            className="handle"
            style={{ 
              top: '25%',
              width: '18px',
              height: '18px',
              border: '3px solid #10b981',
              background: '#ffffff',
              borderRadius: '50%',
              cursor: 'crosshair'
            }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="right-center"
            isConnectable={isConnectable}
            className="handle"
            style={{ 
              top: '50%',
              width: '18px',
              height: '18px',
              border: '3px solid #10b981',
              background: '#ffffff',
              borderRadius: '50%',
              cursor: 'crosshair'
            }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="right-bottom"
            isConnectable={isConnectable}
            className="handle"
            style={{ 
              top: '75%',
              width: '18px',
              height: '18px',
              border: '3px solid #10b981',
              background: '#ffffff',
              borderRadius: '50%',
              cursor: 'crosshair'
            }}
          />
          
          {/* HANDLES BIDIRECCIONALES - Lado Izquierdo (AZUL) */}
          <Handle
            type="source"
            position={Position.Left}
            id="left-top"
            isConnectable={isConnectable}
            className="handle"
            style={{ 
              top: '25%',
              width: '18px',
              height: '18px',
              border: '3px solid var(--sage-ink)',
              background: '#ffffff',
              borderRadius: '50%',
              cursor: 'crosshair'
            }}
          />
          <Handle
            type="source"
            position={Position.Left}
            id="left-center"
            isConnectable={isConnectable}
            className="handle"
            style={{ 
              top: '50%',
              width: '18px',
              height: '18px',
              border: '3px solid var(--sage-ink)',
              background: '#ffffff',
              borderRadius: '50%',
              cursor: 'crosshair'
            }}
          />
          <Handle
            type="source"
            position={Position.Left}
            id="left-bottom"
            isConnectable={isConnectable}
            className="handle"
            style={{ 
              top: '75%',
              width: '18px',
              height: '18px',
              border: '3px solid var(--sage-ink)',
              background: '#ffffff',
              borderRadius: '50%',
              cursor: 'crosshair'
            }}
          />

          {/* HANDLES BIDIRECCIONALES - Superior e Inferior */}
          <Handle
            type="source"
            position={Position.Top}
            id="top-center"
            isConnectable={isConnectable}
            className="handle"
            style={{ 
              left: '50%',
              width: '18px',
              height: '18px',
              border: '3px solid #f59e0b',
              background: '#ffffff',
              borderRadius: '50%',
              cursor: 'crosshair'
            }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="bottom-center"
            isConnectable={isConnectable}
            className="handle"
            style={{ 
              left: '50%',
              width: '18px',
              height: '18px',
              border: '3px solid #ef4444',
              background: '#ffffff',
              borderRadius: '50%',
              cursor: 'crosshair'
            }}
          />


      </>

      {/* Punto invisible donde se enganchaba la línea punteada en los tableros anteriores
          (ahora la dibuja la relación); se conserva para que esas aristas sigan siendo válidas */}
      {data?.isAssociationClass && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="bottom"
          isConnectable={false}
          style={{ opacity: 0, pointerEvents: 'none' }}
        />
      )}

      {/* Nombre de la clase (con estereotipo UML 2.5 si lo tiene) */}
      <div className="class-name">
        {etiquetaEstereotipo(data.stereotype) && (
          <div style={{ fontSize: '0.85em', opacity: 0.75, fontWeight: 500 }}>
            {etiquetaEstereotipo(data.stereotype)}
          </div>
        )}
        <strong style={{ ...(data.stereotype === 'abstract' ? { fontStyle: 'italic' } : {}), ...(propuesta === 'eliminada' ? { textDecoration: 'line-through' } : {}) }}>
          {cambios?.nombreNuevo
            ? <><span style={{ textDecoration: 'line-through', color: 'var(--color-error)' }}>{data.className}</span> <span style={{ color: 'var(--color-success)' }}>{cambios.nombreNuevo}</span></>
            : (data.className || "ClaseSinNombre")}
        </strong>
      </div>

      {/* Atributos */}
      {(() => {
        // Normalizar attributes a array de strings
        const normalizeToStringArray = (maybeArray) => {
          if (!maybeArray) return [];
          if (!Array.isArray(maybeArray)) return [String(maybeArray)];
          return maybeArray.map(item => {
            if (item === null || item === undefined) return '';
            if (typeof item === 'string') return item;
            if (typeof item === 'object') {
              try {
                // Si es un objeto con propiedades específicas, formatear
                if (item.name && item.type) return `${item.name}: ${item.type}`;
                if (item.name) return item.name;
                return JSON.stringify(item);
              } catch (e) {
                return String(item);
              }
            }
            return String(item);
          }).filter(item => item !== '');
        };

        const normalizedAttributes = cambios ? cambios.atributos : normalizeToStringArray(data.attributes);
        const quitados = cambios ? cambios.atributosQuitados : [];
        
        return (normalizedAttributes.length > 0 || quitados.length > 0) && (
          <div className="class-attributes">
            <h4>{data.stereotype === 'enumeration' ? 'Literales:' : 'Atributos:'}</h4>
            <ul>
              {normalizedAttributes.map((attr, idx) => (
                <li key={idx}>
                  {marca(data.stereotype === 'enumeration' ? attr : mostrarAtributo(attr), cambios?.atributosNuevos.includes(attr))}
                </li>
              ))}
              {quitados.map((attr, idx) => tachado(mostrarAtributo(attr), `q${idx}`))}
            </ul>
          </div>
        );
      })()}

      {/* Métodos */}
      {(() => {
        // Normalizar methods a array de strings
        const normalizeToStringArray = (maybeArray) => {
          if (!maybeArray) return [];
          if (!Array.isArray(maybeArray)) return [String(maybeArray)];
          return maybeArray.map(item => {
            if (item === null || item === undefined) return '';
            if (typeof item === 'string') return item;
            if (typeof item === 'object') {
              try {
                // Si es un objeto con propiedades específicas, formatear
                if (item.name && item.returnType) return `${item.name}(): ${item.returnType}`;
                if (item.name) return `${item.name}()`;
                return JSON.stringify(item);
              } catch (e) {
                return String(item);
              }
            }
            return String(item);
          }).filter(item => item !== '');
        };

        const normalizedMethods = cambios ? cambios.metodos : normalizeToStringArray(data.methods);
        const metodosQuitados = cambios ? cambios.metodosQuitados : [];
        
        return (normalizedMethods.length > 0 || metodosQuitados.length > 0) && (
          <div className="class-methods">
            <h4>Métodos:</h4>
            <ul>
              {normalizedMethods.map((method, idx) => (
                <li key={idx}>{marca(mostrarMetodo(method), cambios?.metodosNuevos.includes(method))}</li>
              ))}
              {metodosQuitados.map((method, idx) => tachado(mostrarMetodo(method), `qm${idx}`))}
            </ul>
          </div>
        );
      })()}
    </div>
  );
}

export default ClassNode;
