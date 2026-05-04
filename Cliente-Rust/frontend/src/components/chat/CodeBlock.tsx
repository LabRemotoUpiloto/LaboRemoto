import React, { useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import python from 'highlight.js/lib/languages/python';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import rust from 'highlight.js/lib/languages/rust';
import yaml from 'highlight.js/lib/languages/yaml';
import json from 'highlight.js/lib/languages/json';
import { Copy, Check, Play, Loader2, XCircle } from 'lucide-react';
import { ActionIcon, Button, Group } from '@mantine/core';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('python', python);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('json', json);

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

  // Syntax highlighting
  const highlighted = useMemo(() => {
    if (!code) return null;
    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(code, { language }).value;
      }
      return hljs.highlightAuto(code, ['bash', 'python', 'javascript', 'typescript', 'rust', 'yaml', 'json']).value;
    } catch {
      return null;
    }
  }, [code, language]);

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
    } catch {
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
    } catch {
      setExecutionStatus('error');
      setTimeout(() => setExecutionStatus('idle'), 2000);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="relative my-3 rounded-lg overflow-hidden bg-[#0d0e15] border border-white/10 group">
      {!hideActions && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#141622] border-b border-white/5 select-none">
          {language ? (
            <span className="text-[11px] font-mono font-medium text-white/50 uppercase tracking-wider">{language}</span>
          ) : <span />}
          <Group gap={6}>
            <Button
              size="compact-xs"
              variant="subtle"
              color={copied ? "green" : "gray"}
              onClick={handleCopy}
              leftSection={copied ? <Check size={12} /> : <Copy size={12} />}
              className={`font-medium h-6 px-2.5 ${copied ? 'text-green-400 bg-green-400/10' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
            >
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
            
            {sessionId && (
              <Button
                size="compact-xs"
                variant={executionStatus === 'idle' ? "light" : "filled"}
                color={executing ? "blue" : executionStatus === 'success' ? "green" : executionStatus === 'error' ? "red" : "accent"}
                onClick={handleExecute}
                disabled={executing}
                leftSection={
                  executing ? <Loader2 size={12} className="animate-spin" /> : 
                  executionStatus === 'success' ? <Check size={12} /> : 
                  executionStatus === 'error' ? <XCircle size={12} /> : 
                  <Play size={12} className="fill-current" />
                }
                className="font-medium h-6 px-2.5 transition-colors"
              >
                {executing ? 'Ejecutando' : executionStatus === 'success' ? 'Ejecutado' : executionStatus === 'error' ? 'Error' : 'Ejecutar'}
              </Button>
            )}
          </Group>
        </div>
      )}
      {hideActions && language && (
        <div className="absolute top-0 right-0 px-2 py-1 bg-black/40 text-[10px] font-mono text-white/30 rounded-bl-lg pointer-events-none z-10 select-none uppercase tracking-wider">
          {language}
        </div>
      )}
      <pre className="m-0 p-3.5 overflow-x-auto text-[13px] font-mono leading-relaxed text-white/90 custom-scrollbar">
        <code
          className={`block w-full ${language ? `language-${language}` : ''}`}
          {...(highlighted ? { dangerouslySetInnerHTML: { __html: highlighted } } : { children: code })}
        />
      </pre>
    </div>
  );
};

export default CodeBlock;
