import AuthLayout from '../components/AuthLayout';
import { ArrowUpRight, Mail, LockKeyhole, UserRound, AlertCircle } from 'lucide-react';
import React, { useState } from 'react';
// Using backend auth instead of Firebase
import { Link, useNavigate } from 'react-router-dom';
import { leerJSON, errorDeRespuesta, mensajeDeError } from '../utils/mensajesError';

const LoginPage = () => {
  // State para usuario y contraseña
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState(null); // Para manejar errores
  const navigate = useNavigate(); // Para redirigir después del login exitoso
  // Función para manejar el login usando el backend
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${import.meta.env.VITE_WS_URL || window.location.origin}/apis/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: user, password: pass })
      });
      const data = await leerJSON(res);
      if (!res.ok) {
        throw errorDeRespuesta(res, data, 'No se pudo iniciar sesión.');
      }
      // Backend sets cookie; also store token in localStorage for socket handshake fallback
      const token = data?.token || data?.data?.token;
      if (token) localStorage.setItem('token', token);
      // La barra superior se actualiza con los datos del perfil
      window.dispatchEvent(new Event('sesion-cambiada'));
      navigate('/');
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo iniciar sesión. Intenta de nuevo.'));
    }
  };

  return (
    <AuthLayout register={false}>
      <form className="auth-form" onSubmit={handleLogin}>
        <div className="form-field"><label htmlFor="email">Correo electrónico</label><div className="field-with-icon"><Mail size={18} /><input id="email" name="email" autoComplete="email" type="email" placeholder="tu@correo.com" required value={user} onChange={(e) => setUser(e.target.value)} /></div></div>
        <div className="form-field"><label htmlFor="password">Contraseña</label><div className="field-with-icon"><LockKeyhole size={18} /><input id="password" name="password" autoComplete="current-password" type="password" placeholder="Tu contraseña" required value={pass} onChange={(e) => setPass(e.target.value)} /></div></div>
        {error && <p className="form-error" role="alert"><AlertCircle size={18} />{error}</p>}
        <button type="submit" className="btn-primary auth-submit">Iniciar sesión <ArrowUpRight size={18} /></button>
      </form>
      <p className="auth-switch">¿Es tu primera vez? <Link to="/register">Crea una cuenta <ArrowUpRight size={14} /></Link></p>
    </AuthLayout>
  );
};
export default LoginPage;
