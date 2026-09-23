import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, UserRound, UserPlus, Pencil, Trash2, Workflow } from 'lucide-react';

function ProjectThumbnail() {
  return <svg viewBox="0 0 240 125" fill="none" aria-hidden="true"><path d="M99 39H132V79H158M99 94H132V79" stroke="currentColor" strokeWidth="1.2" /><g fill="var(--color-surface)" stroke="currentColor" strokeWidth="1"><rect x="25" y="15" width="75" height="47" rx="4" /><rect x="25" y="77" width="75" height="35" rx="4" /><rect x="158" y="54" width="66" height="49" rx="4" /></g><g fill="currentColor" opacity=".17"><path d="M26 19a3 3 0 0 1 3-3h67a3 3 0 0 1 3 3v10H26ZM26 81a3 3 0 0 1 3-3h67a3 3 0 0 1 3 3v9H26ZM159 58a3 3 0 0 1 3-3h58a3 3 0 0 1 3 3v10h-64Z" /></g><g stroke="currentColor" strokeLinecap="round" opacity=".4"><path d="M35 39h40m-40 9h26m10-26H47m-12 77h43m91-20h34m-34 9h23m-10-27h22" /></g><circle cx="131" cy="79" r="3" fill="currentColor" /></svg>;
}

const BoardList = ({ boards = [], user, onInvite, onEdit, onDelete }) => {
  const navigate = useNavigate();
  if (!Array.isArray(boards) || boards.length === 0) return <div className="empty-boards"><Workflow strokeWidth={1.5} /><h3>Un lienzo lleno de posibilidades.</h3><p>Crea tu primer tablero con «Nuevo tablero» o importa un diagrama para empezar.</p></div>;
  return <div className="board-grid">{boards.map((board) => {
        // Normalize single board for display safety
        const b = board || {};
  // Determine owner id/email from possible backend shapes (userId, userid, host)
  const rawHost = b.host ?? null;
  // If rawHost is numeric (stored userId), treat as ownerId; otherwise as ownerEmail
  const ownerId = b.userId ?? b.userid ?? (rawHost !== null && !isNaN(Number(rawHost)) ? rawHost : null);
  const ownerEmail = (rawHost !== null && isNaN(Number(rawHost))) ? rawHost : null;
        const isHost = Boolean(
          user && (
            (ownerId !== null && String(ownerId) === String(user.id)) ||
            (ownerEmail !== null && String(ownerEmail) === String(user.email))
          )
        );

    return <article key={b.id ?? b.title} className="project-card">
      <button onClick={() => navigate(`/board/${b.id}`)} className="project-thumbnail" aria-label={`Abrir ${b.title || b.description || 'tablero'}`} data-tour="ver-tablero"><span className="project-badge">DIAGRAMA UML</span><ProjectThumbnail /><span className="project-open"><ArrowUpRight size={16} /></span></button>
      <div className="project-info"><h3><button onClick={() => navigate(`/board/${b.id}`)}>{b.title || b.description || `Tablero #${b.id ?? ''}`}</button></h3><p><UserRound size={12} />{isHost ? 'Creado por ti' : (ownerEmail || 'Compartido contigo')}</p>
        <div className="project-actions"><button onClick={() => onInvite(board.id)} className="btn-secondary" data-tour="invitar"><UserPlus size={14} /> Invitar</button>
          {isHost && <><button onClick={() => onEdit(board)} className="icon-button" title="Editar tablero" aria-label={`Editar ${b.title || 'tablero'}`}><Pencil size={15} /></button><button onClick={() => onDelete(board.id)} className="icon-button project-delete" title="Eliminar tablero" aria-label={`Eliminar ${b.title || 'tablero'}`}><Trash2 size={15} /></button></>}
        </div>
      </div>
    </article>;
  })}</div>;
};
export default BoardList;
