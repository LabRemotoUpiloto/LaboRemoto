import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './SnippetsPage.css';
// Eliminado: integración con archivos recientes de sesiones

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */
export interface UserSnippet {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  sessionId?: string; // optional association to a session
  lastFileRef?: string; // path of file it came from (if any)
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */
const STORAGE_KEY = 'user-snippets-v1';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */
function loadStored(): UserSnippet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(s => s && typeof s.id === 'string' && typeof s.content === 'string');
  } catch { return []; }
}

function saveStored(list: UserSnippet[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */
// Props vacíos: ya no dependemos de sesiones ni archivos
interface SnippetsPageProps {}

const SnippetsPage: React.FC<SnippetsPageProps> = ({}) => {
  const [snippets, setSnippets] = useState<UserSnippet[]>(() => loadStored());
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('');

  const addSnippet = useCallback(() => {
    const t = title.trim();
    const c = text.trim();
    if (!c) return;
    const sn: UserSnippet = {
      id: String(Date.now()) + Math.random().toString(36).slice(2,8),
      title: t || 'Sin título',
      content: c,
      createdAt: Date.now(),
      // solo comandos manuales; no asociar a sesión/archivo
    };
    setSnippets(prev => {
      const next = [sn, ...prev].slice(0, 500); // cap to 500
      saveStored(next);
      return next;
    });
    setTitle('');
    setText('');
  }, [title, text]);

  const deleteSnippet = (id: string) => {
    setSnippets(prev => {
      const next = prev.filter(s => s.id !== id);
      saveStored(next);
      return next;
    });
  };

  const copySnippet = (content: string) => {
    try { navigator.clipboard.writeText(content); } catch {}
  };

  const filteredSnippets = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return snippets;
    return snippets.filter(s => (s.title.toLowerCase().includes(f) || s.content.toLowerCase().includes(f)));
  }, [snippets, filter]);

  // Eliminado: quick add desde archivo de sesión

  // Persist whenever list changes (already saved on add/delete but safe)
  useEffect(() => { saveStored(snippets); }, [snippets]);

  return (
    <div className="snippets-page">
      <header className="snippets-header">
        <h1>Snippets</h1>
        <div className="header-actions">
          <input
            className="filter-input"
            placeholder="Filtrar…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
      </header>

      <section className="new-snippet" aria-label="Nuevo snippet">
        <div className="fields">
          <input
            className="title-input"
            placeholder="Título (opcional)"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          <textarea
            className="content-input"
            placeholder="Contenido del snippet…"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={6}
          />
        </div>
        <div className="actions">
          <button type="button" className="btn primary" onClick={addSnippet} disabled={!text.trim()}>Guardar</button>
          <button type="button" className="btn" onClick={() => { setTitle(''); setText(''); }}>Limpiar</button>
        </div>
      </section>

      <div className="layout">
        <main className="user-snippets" aria-label="Snippets guardados">
          <h2>Guardados ({filteredSnippets.length})</h2>
          {filteredSnippets.length === 0 && (
            <p className="empty">{snippets.length ? 'No coincide con el filtro.' : 'Aún no tienes snippets guardados.'}</p>
          )}
          <ul className="snippet-list">
            {filteredSnippets.map(sn => (
              <li key={sn.id} className="snippet-item">
                <div className="meta">
                  <h3>{sn.title}</h3>
                  <span className="age" title={new Date(sn.createdAt).toLocaleString()}>
                    {new Date(sn.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <pre className="body"><code>{sn.content}</code></pre>
                <div className="item-actions">
                  <button className="btn xs outline" onClick={() => copySnippet(sn.content)}>Copiar</button>
                  <button className="btn xs" onClick={() => { setTitle(sn.title); setText(sn.content); }}>Editar</button>
                  <button className="btn xs danger" onClick={() => deleteSnippet(sn.id)}>Borrar</button>
                </div>
              </li>
            ))}
          </ul>
        </main>
      </div>
    </div>
  );
};

export default SnippetsPage;
