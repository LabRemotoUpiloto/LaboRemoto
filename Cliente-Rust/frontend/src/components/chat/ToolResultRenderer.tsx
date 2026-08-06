import React from 'react';
import { sshStdin } from '../../services/ssh.service';
import { ChevronDown, ChevronRight, File, Folder, Search, FileText } from 'lucide-react';

interface ToolResultRendererProps { action: any; sessionId?: string | null; }

export const ToolResultRenderer: React.FC<ToolResultRendererProps> = ({ action, sessionId }) => {
  const [collapsed, setCollapsed] = React.useState(false);
  if (!action) return null;
  const tool = action.tool;
  const remote = action.remote;

  const runSshCommand = async (cmd: string) => {
    try { if (!sessionId) return; await sshStdin(sessionId, cmd + '\n'); } catch {}
  };

  const Header = ({ title, count, onClick, icon: Icon }: any) => (
    <header 
      onClick={onClick} 
      className="flex items-center justify-between px-3 py-2 bg-[var(--background-tertiary)] hover:bg-[var(--interactive-hover)] border-b border-[var(--border-subtle)] cursor-pointer select-none transition-colors"
    >
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-accent" />
        <h4 className="m-0 text-[12.5px] font-medium text-[var(--text-primary)]">{title}</h4>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-mono text-[var(--text-muted)] px-2 py-0.5 bg-[var(--background-primary)] rounded-full border border-[var(--border-subtle)]">{count}</span>
        {collapsed ? <ChevronRight size={14} className="text-[var(--text-muted)]" /> : <ChevronDown size={14} className="text-[var(--text-muted)]" />}
      </div>
    </header>
  );

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
        if (idx < arr.length - 1) acc.push(<mark className="bg-accent/40 text-accent-light px-0.5 rounded font-medium" key={idx}>{termForHi}</mark>);
        return acc;
      }, []);
    };
    return (
      <div className="mt-2 border border-[var(--border-subtle)] rounded-lg bg-[var(--background-secondary)] overflow-hidden flex flex-col w-full">
        <Header 
          title={`Resultados ${remote ? 'remotos' : 'locales'}`} 
          count={matches.length} 
          onClick={() => setCollapsed(c => !c)} 
          icon={Search} 
        />
        {!collapsed && (
          <div className="overflow-auto max-h-[300px] custom-scrollbar">
            <ul className="m-0 p-0 list-none">
              {matches.slice(0, 200).map((m,i) => {
                const isDir = m.is_dir;
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
                  <li 
                    key={i} 
                    className="flex flex-col py-2 px-3 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--interactive-hover)] cursor-pointer transition-colors" 
                    title={m.path + (remote ? ' (doble click para ' + (isDir ? 'entrar' : 'abrir') + ')' : '')} 
                    onDoubleClick={handleDoubleClick}
                  >
                    <div className="flex items-center gap-2 overflow-hidden text-[12.5px]">
                      {isDir ? <Folder size={14} className="text-blue-400 shrink-0" /> : <File size={14} className="text-gray-400 shrink-0" />}
                      <span className={`font-mono truncate ${isDir ? 'text-[var(--accent-secondary)] font-medium' : 'text-[var(--text-primary)]'}`}>
                        {highlight(m.file_name)}{isDir ? '/' : ''}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)] truncate ml-auto">{m.path}</span>
                    </div>
                    {m.snippet && <div className="mt-1 pl-6 text-[11px] text-[var(--text-secondary)] font-mono overflow-hidden text-ellipsis whitespace-nowrap opacity-85" title={m.snippet}>{highlight(m.snippet)}</div>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  }
  if (tool === 'fs_read') {
    const path = action.path as string;
    const content = action.content as string;
    return (
      <div className="mt-2 border border-[var(--border-subtle)] rounded-lg bg-[var(--background-secondary)] overflow-hidden flex flex-col w-full">
        <Header 
          title={`Lectura ${remote ? 'remota' : 'local'}: ${path.split(/[/\\]/).pop()}`} 
          count={`${content.length} bytes`} 
          onClick={() => setCollapsed(c => !c)} 
          icon={FileText} 
        />
        {!collapsed && (
          <div className="overflow-auto max-h-[300px] custom-scrollbar bg-[var(--background-tertiary)] p-3 text-[12px] font-mono text-[var(--text-primary)] border-t border-[var(--border-subtle)] whitespace-pre">
            {content}
          </div>
        )}
      </div>
    );
  }
  if (tool === 'fs_grep') {
    const matches = action.matches as any[];
    if (!matches || matches.length === 0) return null;
    return (
      <div className="mt-2 border border-[var(--border-subtle)] rounded-lg bg-[var(--background-secondary)] overflow-hidden flex flex-col w-full">
        <Header 
          title={`Grep ${remote ? 'remoto' : 'local'}`} 
          count={`${matches.length} coincidencias`} 
          onClick={() => setCollapsed(c => !c)} 
          icon={Search} 
        />
        {!collapsed && (
          <div className="overflow-auto max-h-[300px] custom-scrollbar">
            <table className="w-full text-[12px] text-left border-collapse m-0">
              <thead className="bg-[var(--background-tertiary)] sticky top-0 backdrop-blur-md">
                <tr>
                  <th className="px-3 py-2 font-medium text-[var(--text-secondary)] border-b border-[var(--border-subtle)] whitespace-nowrap">Archivo</th>
                  <th className="px-3 py-2 font-medium text-[var(--text-secondary)] border-b border-[var(--border-subtle)] w-16 text-right">Línea</th>
                  <th className="px-3 py-2 font-medium text-[var(--text-secondary)] border-b border-[var(--border-subtle)] w-full">Fragmento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {matches.slice(0, 300).map((m,i) => (
                  <tr key={i} className="hover:bg-[var(--interactive-hover)]">
                    <td className="px-3 py-1.5 font-mono text-[var(--text-secondary)] truncate max-w-[150px]" title={m.path}>{m.path.split(/[/\\]/).pop()}</td>
                    <td className="px-3 py-1.5 font-mono text-accent text-right">{m.line}</td>
                    <td className="px-3 py-1.5 font-mono text-[var(--text-primary)] break-all">{m.snippet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }
  return null;
};

export default ToolResultRenderer;
