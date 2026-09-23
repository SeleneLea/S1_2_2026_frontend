import Brand from '../Brand';
import { Menu, X, LogOut, ArrowUpRight } from 'lucide-react';
import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
// Use backend session endpoints instead of Firebase Auth
import ThemeToggle from "../ThemeToggle";
import BotonInstalar from "../BotonInstalar";
import useTheme from "../../hooks/useTheme";

const NavBar = () => {
  const [user, setUser] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();

  // Consulta quién tiene la sesión abierta. Se repite al cambiar de página y cuando alguien
  // inicia o cierra sesión (evento "sesion-cambiada"), para que la barra no quede desactualizada.
  useEffect(() => {
    let vigente = true;
    const consultarSesion = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_WS_URL || window.location.origin}/apis`, { credentials: 'include' });
        if (!vigente) return;
        if (!res.ok) return setUser(null);
        const cuerpo = await res.json();
        // El servidor responde { error, data: { id, name, email } }
        const perfil = cuerpo?.data || cuerpo;
        setUser(perfil?.id ? { id: perfil.id, name: perfil.name, email: perfil.email } : null);
      } catch (err) {
        if (vigente) setUser(null);
      }
    };
    consultarSesion();
    window.addEventListener('sesion-cambiada', consultarSesion);
    return () => {
      vigente = false;
      window.removeEventListener('sesion-cambiada', consultarSesion);
    };
  }, [location.pathname]);

  const iniciales = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();

  const handleLogout = async () => {
    try {
      await fetch(`${import.meta.env.VITE_WS_URL || window.location.origin}/apis/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      localStorage.removeItem('token');
      setUser(null);
      window.dispatchEvent(new Event('sesion-cambiada'));
      navigate("/login");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="site-header">
      <nav className="navigation page-width" aria-label="Navegación principal">
        <Brand />
        <div className="desktop-nav">
          <Link to="/" className={`nav-link-modern ${location.pathname === '/' ? 'is-active' : ''}`} aria-current={location.pathname === '/' ? 'page' : undefined}>Inicio</Link>
          <Link to="/board" className={`nav-link-modern ${location.pathname.startsWith('/board') ? 'is-active' : ''}`} aria-current={location.pathname.startsWith('/board') ? 'page' : undefined}>Mis diagramas</Link>
        </div>
        <div className="nav-actions desktop-nav"><BotonInstalar /><span className="nav-divider" /><ThemeToggle isDark={isDark} onToggle={toggleTheme} />
          {user ? <><div className="nav-account" title={user.email || ''}><span className="avatar">{iniciales}</span><span>{user.name || 'Mi cuenta'}</span></div><button onClick={handleLogout} className="icon-button" aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={18} /></button></> : <Link to="/login" className="btn-primary nav-login">Iniciar sesión <ArrowUpRight size={16} /></Link>}
        </div>
        <button onClick={toggleMenu} className="icon-button mobile-menu-toggle" aria-label={isMenuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={isMenuOpen} aria-controls="mobile-menu">{isMenuOpen ? <X size={22} /> : <Menu size={22} />}</button>
      </nav>
      {isMenuOpen && <nav id="mobile-menu" className="mobile-menu" aria-label="Navegación móvil"><Link to="/" className="nav-link-modern" onClick={() => setIsMenuOpen(false)}>Inicio</Link><Link to="/board" className="nav-link-modern" onClick={() => setIsMenuOpen(false)}>Mis diagramas</Link><BotonInstalar compacto /><ThemeToggle isDark={isDark} onToggle={toggleTheme} />{user ? <button onClick={() => { handleLogout(); setIsMenuOpen(false); }} className="btn-secondary">Cerrar sesión</button> : <Link to="/login" className="btn-primary" onClick={() => setIsMenuOpen(false)}>Iniciar sesión <ArrowUpRight size={16} /></Link>}</nav>}
    </header>
  );
};
export default NavBar;
