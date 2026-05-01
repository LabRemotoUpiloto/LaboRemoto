import React from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ToolResultRendererProps { action: any; sessionId?: string | null; }

export const ToolResultRenderer: React.FC<ToolResultRendererProps> = ({ action, sessionId }) => {
  const [collapsed, setCollapsed] = React.useState(false);
  if (!action) return null;
  const tool = action.tool;
  const remote = action.remote;

  const runSshCommand = async (cmd: string) => {
    try { if (!sessionId) return; await invoke('ssh_stdin', { id: sessionId, data: cmd + '\n' }); } catch {}
  };

  if (tool === 'fs_search') {
    const matches = action.matches as any[];
    if (!matches || matches.length === 0) return null;
    const firstQuery = action.query ? String(action.query).trim() : '';
    const termForHi = firstQuery.split(/\s+/).filter(Boolean)[0] || '';
    const hiRegex = termForHi ? new RegExp(termForHi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig') : null;
    const highlight = (text: string) => {
      if (!hiRegex || !text) return text;
      return text.split(hiRegex).reduce<React.ReactNode[]>((acc, part, idx, arr) => {
        acc.push(part);
        if (idx < arr.length - 1) acc.push(<mark className="sr-hi" key={idx}>{termForHi}</mark>);
        return acc;
      }, []);
    };
    return (
      <div className={`tool-result-block search-card ${collapsed ? 'collapsed' : ''}`}>
        <header onClick={() => setCollapsed(c => !c)} className="sr-header">
          <div className="sr-header-left"><h4 className="sr-title">Resultados {remote ? 'remotos' : 'locales'}</h4></div>
          <div className="sr-meta">
            <span className="sr-count">{matches.length}</span>
            <button className="sr-collapse-btn" aria-label={collapsed ? 'Expandir resultados' : 'Colapsar resultados'}>{collapsed ? '▸' : '▾'}</button>
          </div>
        </header>
        <div className="body sr-body">
          <ul className="sr-list">
            {matches.slice(0, 200).map((m,i) => {
              const isDir = m.is_dir;
              const icon = isDir ? '📁' : '📄';
              const handleDoubleClick = () => {
                if (remote) {
                  const path = m.path as string;
                  const multimediaBlocked = /\.(png|jpe?g|gif|bmp|svgz|mp3|wav|flac|ogg|mp4|avi|mkv|mov)$/i;
                  if (isDir) {
                    document.dispatchEvent(new CustomEvent('chat:system-msg', { detail: { text: `Yendo al directorio: ${path}` } }));
                    runSshCommand(`cd "${path}" && pwd`);
                  } else {
                    if (multimediaBlocked.test(path)) {
                      document.dispatchEvent(new CustomEvent('chat:system-msg', { detail: { text: `No se puede abrir con nano (multimedia): ${path}` } }));
                      return;
                    }
                    document.dispatchEvent(new CustomEvent('chat:system-msg', { detail: { text: `Abriendo archivo en nano: ${path}` } }));
                    const isLikelyText = /\.(txt|md|log|sh|bash|zsh|json|ya?ml|toml|js|ts|tsx|rs|py|go|rb|php|c|cpp|h|java|css|scss|html?)$/i.test(path);
                    const editorCmd = isLikelyText ? `nano "${path}"` : `nano -c "${path}"`;
                    runSshCommand(editorCmd);
                  }
                }
              };
              return (
                <li key={i} className="sr-item sr-interactive" title={m.path + (remote ? ' (doble click para ' + (isDir ? 'entrar' : 'abrir') + ')' : '')} onDoubleClick={handleDoubleClick}>
                  <div className="sr-row-main">
                    <span className="sr-icon" aria-hidden>{icon}</span>
                    <span className="sr-name" data-dir={isDir || undefined}>{highlight(m.file_name)}{isDir ? '/' : ''}</span>
                    <span className="sr-path">{m.path}</span>
                  </div>
                  {m.snippet && <div className="sr-snippet" title={m.snippet}>{highlight(m.snippet)}</div>}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }
  if (tool === 'fs_read') {
    const path = action.path as string;
    const content = action.content as string;
    return (
      <div className={`tool-result-block ${collapsed ? 'collapsed' : ''}`}>
        <header onClick={() => setCollapsed(c => !c)}>
          <h4>Lectura {remote ? 'remota' : 'local'}: {path.split(/[/\\]/).pop()}</h4>
          <span className="count">{content.length} bytes</span>
        </header>
        <div className="body"><pre style={{ margin:0, padding: '8px 10px' }}>{content}</pre></div>
      </div>
    );
  }
  if (tool === 'fs_grep') {
    const matches = action.matches as any[];
    if (!matches || matches.length === 0) return null;
    return (
      <div className={`tool-result-block ${collapsed ? 'collapsed' : ''}`}>
        <header onClick={() => setCollapsed(c => !c)}>
          <h4>Grep {remote ? 'remoto' : 'local'}</h4>
          <span className="count">{matches.length} coincidencia(s)</span>
        </header>
        <div className="body">
          <table className="tool-table">
            <thead><tr><th>Archivo</th><th>Línea</th><th>Fragmento</th></tr></thead>
            <tbody>
              {matches.slice(0, 300).map((m,i) => (
                <tr key={i}>
                  <td className="truncate" title={m.path}>{m.path}</td>
                  <td className="grep-line">{m.line}</td>
                  <td className="truncate" title={m.snippet}>{m.snippet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  return null;
};

export default ToolResultRenderer;
