import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './SnippetsPage.css';
import { invoke } from '@tauri-apps/api/core';
import { SessionMem } from '../hooks/useSessionMemory';

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
interface SnippetsPageProps {
  activeSessionId?: string;            // current active session (for quick add)
  sessionIds: string[];                // all open session ids
}

const SnippetsPage: React.FC<SnippetsPageProps> = ({ activeSessionId, sessionIds }) => {
  const [snippets, setSnippets] = useState<UserSnippet[]>(() => loadStored());
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('');
  const [sessionMems, setSessionMems] = useState<Record<string, SessionMem>>({});

  // Fetch session memories without violating hooks rules
  useEffect(() => {
    const fetchMems = async () => {
      const newMems: Record<string, SessionMem> = {};
      for (const id of sessionIds) {
        try {
          const data = await invoke<any>("mem_get", { sessionId: id });
          if (data) {
            newMems[id] = {
              lastFile: data.last_file ?? data.lastFile,
              lastFileHash: data.last_file_hash ?? data.lastFileHash,
              lastFileSnippet: data.last_file_snippet ?? data.lastFileSnippet,
              lastCommand: data.last_command ?? data.lastCommand,
              lastStdoutTail: data.last_stdout_tail ?? data.lastStdoutTail,
              lastStderrTail: data.last_stderr_tail ?? data.lastStderrTail,
              lastExitCode: data.last_exit_code ?? data.lastExitCode,
              lastPath: data.last_path ?? data.lastPath,
              lastPathKind: (data.last_path_kind ?? data.lastPathKind) as 'file' | 'dir' | undefined,
              env: { cwd: data.env_cwd ?? data.env?.cwd, shell: data.env_shell ?? data.env?.shell, os: data.env_os ?? data.env?.os }
            };
          }
        } catch {}
      }
      setSessionMems(newMems);
    };
    fetchMems();
  }, [sessionIds]);

  // Derived: map session -> last file snippet
  const sessionSnippets = useMemo(() => {
    return sessionIds.map(id => {
      const mem = sessionMems[id];
      if (mem && mem.lastFile && mem.lastFileSnippet) {
        return {
          id: `__session__${id}`,
            sessionId: id,
            file: mem.lastFile,
            snippet: mem.lastFileSnippet,
            hash: mem.lastFileHash
        };
      }
      return null;
    }).filter(Boolean) as Array<{ id: string; sessionId: string; file: string; snippet: string; hash?: string }>;
  }, [sessionIds, sessionMems]);

  const addSnippet = useCallback(() => {
    const t = title.trim();
    const c = text.trim();
    if (!c) return;
    const sn: UserSnippet = {
      id: String(Date.now()) + Math.random().toString(36).slice(2,8),
      title: t || 'Sin título',
      content: c,
      createdAt: Date.now(),
      sessionId: activeSessionId,
    };
    setSnippets(prev => {
      const next = [sn, ...prev].slice(0, 500); // cap to 500
      saveStored(next);
      return next;
    });
    setTitle('');
    setText('');
  }, [title, text, activeSessionId]);

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

  // Quick add from active session last file snippet
  const quickAddFromSession = useCallback(() => {
    if (!activeSessionId) return;
    const sessionEntry = sessionSnippets.find(s => s.sessionId === activeSessionId);
    if (!sessionEntry) return;
    setTitle(sessionEntry.file.split('/').pop() || sessionEntry.file);
    setText(sessionEntry.snippet);
  }, [activeSessionId, sessionSnippets]);

  // Persist whenever list changes (already saved on add/delete but safe)
  useEffect(() => { saveStored(snippets); }, [snippets]);

  return (
    <div className="snippets-page" data-has-active={!!activeSessionId}>
      <header className="snippets-header">
        <h1>Snippets</h1>
        <div className="header-actions">
          <input
            className="filter-input"
            placeholder="Filtrar…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <button type="button" className="btn outline" onClick={quickAddFromSession} disabled={!activeSessionId}>Tomar del archivo actual</button>
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
        <aside className="session-snippets" aria-label="Snippets de sesiones">
          <h2>Archivo reciente por sesión</h2>
          {sessionSnippets.length === 0 && <p className="empty">No hay archivos recientes.</p>}
          {sessionSnippets.map(s => (
            <div key={s.id} className="session-snippet-card" data-active={s.sessionId === activeSessionId}>
              <div className="top">
                <strong className="file" title={s.file}>{s.file}</strong>
                {s.hash && <code className="hash" title={s.hash}>{s.hash.slice(0,8)}</code>}
              </div>
              <pre className="snippet-preview"><code>{s.snippet}</code></pre>
              <div className="mini-actions">
                <button type="button" className="btn xs" onClick={() => { setTitle(s.file.split('/').pop() || s.file); setText(s.snippet); }}>Usar</button>
              </div>
            </div>
          ))}
        </aside>
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
