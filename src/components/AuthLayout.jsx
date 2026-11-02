import { ArrowUpRight, Workflow } from 'lucide-react';
import DiagramPreview from './DiagramPreview';

export default function AuthLayout({ children, register = false }) {
  return (
    <main className="auth-page page-width">
      <section className="auth-story"><span className="eyebrow"><Workflow size={17} /> IDEAS QUE TOMAN FORMA</span><h1>Todo gran proyecto <br />empieza con <br /><em>una conexión.</em></h1><p>Un lugar para pensar, diseñar y construir lo que viene.</p><DiagramPreview compact /><div className="auth-story-footer"><span>Tu próxima idea empieza aquí.</span><ArrowUpRight size={23} /></div></section>
      <section className="auth-form-section"><div className="auth-form-intro"><span className="eyebrow">{register ? 'UN NUEVO COMIENZO' : 'QUÉ BUENO VERTE DE NUEVO'}</span><h2>{register ? 'Crea tu espacio.' : 'Vuelve a tus ideas.'}</h2><p>{register ? 'Crea una cuenta y dale forma a tu primer diagrama.' : 'Inicia sesión para continuar con tus proyectos.'}</p></div>{children}<p className="auth-caption"><span className="status-dot" /> Un espacio para crear a tu manera.</p></section>
    </main>
  );
}
