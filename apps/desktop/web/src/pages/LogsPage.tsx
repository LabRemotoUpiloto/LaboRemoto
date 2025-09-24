import React, { useEffect, useMemo, useRef, useState } from 'react';
import './LogsPage.css';
import { listen } from '@tauri-apps/api/event';

interface LogEntry {
  id: string;
  ts: number;          // epoch ms
  sessionId?: string;
  type: 'stdout' | 'stderr' | 'exit';
  exitCode?: number;
  text?: string;       // for stdout/stderr tail
}

interface LogsPageProps {
  sessionIds: string[];
  activeSessionId?: string;
}

const MAX_ENTRIES = 1000;

const LogsPage: React.FC<LogsPageProps> = ({ sessionIds, activeSessionId }) => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [filterSession, setFilterSession] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Subscribe to terminal result events coming from backend (already used by memory elsewhere)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        unlisten = await listen<any>('copilot/terminal-result', e => {
          const p = e.payload || {};
          const sid = p.session_id;
          const now = Date.now();
          const list: LogEntry[] = [];
          if (p.stdout_tail) {
            list.push({ id: 'o'+now+Math.random(), ts: now, sessionId: sid, type: 'stdout', text: p.stdout_tail });
          }
          if (p.stderr_tail) {
            list.push({ id: 'e'+now+Math.random(), ts: now, sessionId: sid, type: 'stderr', text: p.stderr_tail });
          }
          if (typeof p.exit_code === 'number') {
            list.push({ id: 'x'+now+Math.random(), ts: now, sessionId: sid, type: 'exit', exitCode: p.exit_code });
          }
          if (!list.length) return;
          setEntries(prev => {
            const next = [...prev, ...list].slice(-MAX_ENTRIES);
            return next;
          });
        });
      } catch {}
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Auto-scroll logic
  useEffect(() => {
    if (!autoScroll) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [entries, autoScroll]);

  const filtered = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return entries.filter(e => {
      if (filterSession !== 'all' && e.sessionId !== filterSession) return false;
      if (filterType !== 'all' && e.type !== filterType) return false;
      if (lower) {
        const hay = (e.text || '') + (e.exitCode !== undefined ? String(e.exitCode) : '') + (e.sessionId||'');
        if (!hay.toLowerCase().includes(lower)) return false;
      }
      return true;
    });
  }, [entries, filterSession, filterType, search]);

  const copy = (txt: string) => { try { navigator.clipboard.writeText(txt); } catch {} };

  const clear = () => setEntries([]);

  const sessionOptions = ['all', ...sessionIds];

  return (
    <div className="logs-page">
      <header className="logs-header">
        <h1>Logs</h1>
        <div className="filters">
          <select value={filterSession} onChange={e => setFilterSession(e.target.value)}>
            {sessionOptions.map(s => <option key={s} value={s}>{s === 'all' ? 'Todas las sesiones' : s}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">Todos</option>
            <option value="stdout">STDOUT</option>
            <option value="stderr">STDERR</option>
            <option value="exit">EXIT</option>
          </select>
          <input
            placeholder="Buscar…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="btn xs" onClick={() => setAutoScroll(a => !a)}>{autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}</button>
          <button className="btn xs danger" onClick={clear}>Limpiar</button>
        </div>
      </header>
      <div className="log-feed" onScroll={e => {
        const el = e.currentTarget;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        setAutoScroll(nearBottom);
      }}>
        {filtered.map(en => (
          <div key={en.id} className={`log-entry type-${en.type} ${en.sessionId === activeSessionId ? 'active-session' : ''}`}>
            <div className="meta">
              <span className="time">{new Date(en.ts).toLocaleTimeString()}</span>
              {en.sessionId && <span className="sid" title="ID de sesión">{en.sessionId}</span>}
              <span className="kind">{en.type === 'exit' ? `EXIT ${en.exitCode}` : en.type.toUpperCase()}</span>
              {en.type !== 'exit' && en.text && (
                <button className="copy-btn" onClick={() => copy(en.text!)} title="Copiar">📋</button>
              )}
            </div>
            {en.type !== 'exit' && en.text && (
              <pre className="payload"><code>{en.text}</code></pre>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default LogsPage;
