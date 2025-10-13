import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './CodeBlock.css';

interface CodeBlockProps {
  code: string;
  language?: string;
  sessionId?: string | null;
  setLastCommand?: (cmd: string) => Promise<void> | void;
  hideActions?: boolean;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language, sessionId, setLastCommand, hideActions = false }) => {
  const [copied, setCopied] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const sanitizeForTerminal = (txt: string) => (txt || '')
    .split(/\r?\n/)
    .filter(l => !/^```/.test(l.trim()))
    .join('\n')
    .trimEnd();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Error al copiar:', err);
    }
  };

  const handleExecute = async () => {
    const toSendRaw = sanitizeForTerminal(code || '');
    if (!toSendRaw) return;
    
    if (!sessionId) {
      alert('No hay sesión SSH activa');
      return;
    }

    // Verificar comandos peligrosos
    const danger = /\brm\s+-rf\b/i.test(toSendRaw);
    if (danger) {
      const proceed = confirm('Este comando incluye "rm -rf". ¿Seguro que deseas ejecutarlo?');
      if (!proceed) return;
    }

    // Verificar editores interactivos
    const editorCmdRe = /\b(nano|vim|vi|nvim|emacs)\b/;
    if (editorCmdRe.test(toSendRaw)) {
      alert('Este bloque contiene un editor interactivo (nano/vim). Usa here-doc con cat/tee para crear archivos sin interacción.');
      return;
    }

    setExecuting(true);
    setExecutionStatus('idle');

    try {
      await invoke('ssh_stdin', { id: sessionId, data: toSendRaw + '\n' });
      try {
        await setLastCommand?.(toSendRaw);
      } catch {}
      setExecutionStatus('success');
      setTimeout(() => setExecutionStatus('idle'), 2000);
    } catch (err) {
      console.error('Error al ejecutar:', err);
      setExecutionStatus('error');
      setTimeout(() => setExecutionStatus('idle'), 2000);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="code-block-wrapper">
      {!hideActions && (
        <div className="code-block-header">
          {language && <span className="code-block-language">{language}</span>}
          <div className="code-block-actions">
            <button
              className={`code-action-btn copy-btn ${copied ? 'copied' : ''}`}
              onClick={handleCopy}
              aria-label="Copiar código"
              title="Copiar"
              type="button"
            >
              {copied ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              )}
              <span className="code-action-text">{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
            
            {sessionId && (
              <button
                className={`code-action-btn execute-btn ${executionStatus !== 'idle' ? executionStatus : ''}`}
                onClick={handleExecute}
                disabled={executing}
                aria-label="Ejecutar código"
                title="Ejecutar"
                type="button"
              >
                {executing ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spinning">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 6v6l4 2"></path>
                  </svg>
                ) : executionStatus === 'success' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : executionStatus === 'error' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                )}
                <span className="code-action-text">
                  {executing ? 'Ejecutando' : executionStatus === 'success' ? 'Ejecutado' : executionStatus === 'error' ? 'Error' : 'Ejecutar'}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
      {hideActions && language && (
        <div className="code-block-header-minimal">
          <span className="code-block-language">{language}</span>
        </div>
      )}
      <pre className="code-block-content"><code>{code}</code></pre>
    </div>
  );
};

export default CodeBlock;
