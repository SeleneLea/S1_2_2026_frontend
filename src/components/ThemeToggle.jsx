import { Sun, Moon } from 'lucide-react';
const ThemeToggle = ({ isDark, onToggle }) => (
  <button onClick={onToggle} className="theme-toggle-button" title={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} aria-pressed={isDark}>
    {isDark ? <Sun size={17} /> : <Moon size={17} />}<span>{isDark ? 'Claro' : 'Oscuro'}</span>
  </button>
);
export default ThemeToggle;
