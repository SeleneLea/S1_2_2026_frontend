import { Braces, MousePointer2, Plus, Minus, Maximize2, Workflow } from 'lucide-react';

// Ilustración de producto, sin controles que simulen funciones del editor.
export default function DiagramPreview({ compact = false }) {
  return (
    <div className={`diagram-preview ${compact ? 'diagram-preview-compact' : ''}`} role="img" aria-label="Ejemplo de un diagrama UML con las clases Usuario, Proyecto y Tarea conectadas">
      <div className="preview-bar"><span><Workflow size={15} /> Mi próximo proyecto</span><span className="preview-saved"><i /> Todo conectado</span></div>
      <div className="preview-canvas">
        <div className="preview-label">DE LA IDEA A LA ESTRUCTURA</div>
        <svg className="preview-connections" viewBox="0 0 560 370" fill="none" aria-hidden="true">
          <path d="M218 130H280V217H319" /><path d="M218 278H270V252H319" />
          <circle cx="218" cy="130" r="4" /><circle cx="319" cy="217" r="4" />
          <circle cx="218" cy="278" r="4" /><circle cx="319" cy="252" r="4" />
          <text x="231" y="120">1</text><text x="295" y="207">*</text><text x="231" y="268">1</text><text x="295" y="274">*</text>
        </svg>
        <div className="preview-node preview-user"><div><Braces size={15} /><strong>Usuario</strong><span>01</span></div><p>+ nombre: String<br />+ email: String</p><p>+ crearProyecto()</p></div>
        <div className="preview-node preview-project"><div><Braces size={15} /><strong>Proyecto</strong><span>02</span></div><p>+ título: String<br />+ estado: Boolean</p><p>+ agregarTarea()</p></div>
        <div className="preview-node preview-task"><div><Braces size={15} /><strong>Tarea</strong><span>03</span></div><p>+ descripción: String<br />+ completada: Boolean</p><p>+ completar()</p></div>
        <div className="preview-cursor"><MousePointer2 size={23} fill="currentColor" /><span>Tú, creando</span></div>
        <div className="preview-zoom" aria-hidden="true"><Minus size={13} /><span>100%</span><Plus size={13} /><span className="preview-zoom-divider" /><Maximize2 size={13} /></div>
        <span className="preview-caption">Un espacio para darle forma a tus ideas.</span>
      </div>
    </div>
  );
}
