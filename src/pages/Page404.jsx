import { Link } from 'react-router-dom';
import { ArrowLeft, Unplug } from 'lucide-react';
export default function Page404() {
  return <main className="not-found page-width"><span className="not-found-icon"><Unplug size={38} /></span><span className="eyebrow">ERROR 404 · CONEXIÓN PERDIDA</span><h1>Esta idea aún<br />no tiene página.</h1><p>La página que buscas no existe o cambió de dirección.</p><Link to="/" className="btn-primary"><ArrowLeft size={17} /> Volver al inicio</Link></main>;
}
