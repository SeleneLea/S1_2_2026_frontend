import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import PublicRoute from './routes/PublicRoute.jsx';
import { StrictMode } from 'react';
import '@xyflow/react/dist/style.css';
import './index.css';
import './studio.css';

// Service worker: la app queda guardada y abre sin internet. Antes solo buscaba una versión nueva
// al cargar la página, y una pestaña abierta antes de un despliegue seguía con la vieja. Ahora
// también la busca cada 10 minutos y al volver a la pestaña; si hay una, se instala y la página
// se recarga sola (lo que no se envió queda guardado en el navegador).
const BUSCAR_VERSION_MS = 10 * 60 * 1000;
registerSW({
  immediate: true,
  onRegisteredSW(_url, registro) {
    if (!registro) return;
    const buscar = () => { if (navigator.onLine) registro.update().catch(() => {}); };
    setInterval(buscar, BUSCAR_VERSION_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') buscar(); });
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PublicRoute>

    </PublicRoute>
  </StrictMode>
);
