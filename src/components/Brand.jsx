import { Link } from 'react-router-dom';
import { Workflow } from 'lucide-react';

export default function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Diagramador UML · Inicio">
      <span className="brand-symbol"><Workflow size={23} strokeWidth={1.8} /></span>
      <span>diagramador<span className="brand-suffix">UML</span></span>
    </Link>
  );
}
