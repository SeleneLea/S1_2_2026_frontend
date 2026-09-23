import AuthLayout from '../components/AuthLayout';
import { ArrowUpRight, Mail, LockKeyhole, UserRound, AlertCircle } from 'lucide-react';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { leerJSON, errorDeRespuesta, mensajeDeError } from '../utils/mensajesError';
// Use backend register endpoint instead of Firebase

const RegisterPage = () => {
  const [user, setUser] = useState('');
  const [correo, setCorreo] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${import.meta.env.VITE_WS_URL || window.location.origin}/apis/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: user, email: correo, password: pass })
      });
      const data = await leerJSON(res);
      if (!res.ok) {
        console.warn('Register failed response:', data);
        throw errorDeRespuesta(res, data, 'No se pudo crear la cuenta.');
      }
      const token = data?.token || data?.data?.token;
      if (token) localStorage.setItem('token', token);
      // La barra superior se actualiza con los datos del perfil
      window.dispatchEvent(new Event('sesion-cambiada'));
      navigate('/');
    } catch (error) {
      console.error("Registration error:", error);
      setError(mensajeDeError(error, 'No se pudo crear la cuenta. Intenta de nuevo.'));
    }
  };

  return (
    <AuthLayout register={true}>
      <form className="auth-form" onSubmit={handleRegister}>
        <div className="form-field"><label htmlFor="fullname">Nombre completo</label><div className="field-with-icon"><UserRound size={18} /><input id="fullname" name="fullname" autoComplete="name" type="text" placeholder="¿Cómo te llamas?" required value={user} onChange={(e) => setUser(e.target.value)} /></div></div>
        <div className="form-field"><label htmlFor="email">Correo electrónico</label><div className="field-with-icon"><Mail size={18} /><input id="email" name="email" autoComplete="email" type="email" placeholder="tu@correo.com" required value={correo} onChange={(e) => setCorreo(e.target.value)} /></div></div>
        <div className="form-field"><label htmlFor="password">Contraseña</label><div className="field-with-icon"><LockKeyhole size={18} /><input id="password" name="password" autoComplete="new-password" type="password" placeholder="Tu contraseña" required value={pass} onChange={(e) => setPass(e.target.value)} /></div></div>
        {error && <p className="form-error" role="alert"><AlertCircle size={18} />{error}</p>}
        <button type="submit" className="btn-primary auth-submit">Crear mi cuenta <ArrowUpRight size={18} /></button>
      </form>
      <p className="auth-switch">¿Ya tienes una cuenta? <Link to="/login">Inicia sesión <ArrowUpRight size={14} /></Link></p>
    </AuthLayout>
  );
};
export default RegisterPage;
