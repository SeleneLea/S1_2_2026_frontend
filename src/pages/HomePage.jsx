import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Workflow, Users, Sparkles, Code2, Check, MoveUpRight } from 'lucide-react';
import DiagramPreview from '../components/DiagramPreview';
import Brand from '../components/Brand';

const HomePage = () => (
  <main className="home-page">
    <section className="hero page-width">
      <div className="hero-copy">
        <span className="eyebrow"><span className="status-dot" /> TU ESPACIO DE DISEÑO UML</span>
        <h1>Las grandes ideas<br />merecen una<br /><span className="hero-highlight">buena estructura.<svg viewBox="0 0 440 15" preserveAspectRatio="none" aria-hidden="true"><path d="M3 10Q220 -3 437 7" /></svg></span></h1>
        <p className="hero-description">Conecta ideas, diseña diagramas y construye en equipo. Todo lo que necesitas para transformar tu próximo proyecto, en un solo lugar.</p>
        <div className="hero-actions"><Link to="/board" className="btn-primary btn-large">Empezar a crear <ArrowUpRight size={19} /></Link><a href="#posibilidades" className="text-action">Explorar posibilidades <ArrowRight size={17} /></a></div>
        <div className="hero-note"><span><Check size={14} /> Colaboración en tiempo real</span><span><Check size={14} /> A tu ritmo, incluso sin conexión</span></div>
      </div>
      <div className="hero-visual"><span className="visual-orbit" aria-hidden="true" /><span className="visual-spark" aria-hidden="true">✳</span><div className="visual-tag"><Sparkles size={15} /> Menos límites. Más ideas.</div><DiagramPreview /><div className="visual-footnote"><span className="footnote-line" /> PENSADO PARA CONSTRUIR JUNTOS <MoveUpRight size={16} /></div></div>
    </section>
    <section className="capability-strip" aria-label="Herramientas compatibles"><div className="page-width"><span>DE TU DIAGRAMA<br /><strong>al siguiente paso.</strong></span><span><Code2 /> Spring Boot</span><span><Code2 /> Flutter</span><span><Workflow /> UML 2.5</span><span className="strip-format">SQL <i /> XMI <i /> EAP</span></div></section>
    <section id="posibilidades" className="possibilities page-width">
      <div className="section-heading"><div><span className="eyebrow">UN LIENZO. MUCHAS POSIBILIDADES.</span><h2>El espacio donde todo conecta.</h2></div><p>De ese primer boceto a algo mucho más grande.</p></div>
      <div className="feature-grid">
        <article className="feature-card feature-sage"><div className="feature-top"><Workflow size={27} strokeWidth={1.5} /><span>01 / DISEÑA</span></div><h3>Haz visible tu idea.</h3><p>Crea clases, define relaciones y encuentra la estructura que tu proyecto necesita.</p><span className="feature-bottom">Tu arquitectura, con claridad <ArrowUpRight size={19} /></span></article>
        <article className="feature-card feature-peach"><div className="feature-top"><Users size={27} strokeWidth={1.5} /><span>02 / COLABORA</span></div><h3>Mejor, en equipo.</h3><p>Comparte tu tablero e invita a otros a construir contigo, en tiempo real.</p><span className="feature-bottom">Ideas que crecen juntas <ArrowUpRight size={19} /></span></article>
        <article className="feature-card feature-paper"><div className="feature-top"><Sparkles size={27} strokeWidth={1.5} /><span>03 / DA EL SIGUIENTE PASO</span></div><h3>Del diagrama al código.</h3><p>Apóyate en la IA y exporta tu modelo a Spring Boot, Flutter o SQL.</p><span className="feature-bottom">Menos tareas. Más creación.</span></article>
      </div>
    </section>
    <footer className="site-footer page-width"><Brand /><span>Ideas claras. Proyectos con forma.</span><Link to="/board">Abrir mi espacio <ArrowUpRight size={15} /></Link></footer>
  </main>
);
export default HomePage;
