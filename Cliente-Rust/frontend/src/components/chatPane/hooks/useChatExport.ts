import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Message } from '../../chatModes/types';

/**
 * El backend representa la cancelación intencional del diálogo de guardado
 * como un `CommandError` con `code: 'VALIDATION_FAILED'` y un mensaje que
 * contiene "cancelada" (ver `save_text_file` en el backend Rust). Cualquier
 * otro error debe mostrarse al usuario.
 */
function isCancelledError(e: any): boolean {
  const message: string | undefined = e?.message;
  if (typeof message !== 'string') return false;
  return e?.code === 'VALIDATION_FAILED' && message.includes('cancelada');
}

export function useChatExport(messages: Message[], setToast: (msg: string | null) => void) {
  const handleExportMd = useCallback(async () => {
    if (messages.length === 0) return;
    const lines: string[] = [`# Chat SSH — ${new Date().toLocaleString('es')}\n`];
    for (const m of messages) {
      if (m.sender === 'user') lines.push(`**Tú:**\n\n${m.text}`);
      else if (m.sender === 'ai') lines.push(`**Asistente:**\n\n${m.text}`);
    }
    const content = lines.join('\n\n---\n\n');
    const defaultName = `chat-ssh-${new Date().toISOString().slice(0, 10)}.md`;
    try {
      const savedPath = await invoke<string>('save_text_file', { content, defaultName });
      if (savedPath && savedPath !== 'cancelled') {
        setToast(`Guardado: ${savedPath.split(/[\\/]/).pop()}`);
        setTimeout(() => setToast(null), 2500);
      }
    } catch (e: any) {
      if (!isCancelledError(e)) setToast('Error al guardar el archivo');
      setTimeout(() => setToast(null), 2000);
    }
  }, [messages, setToast]);

  const handleExportHtml = useCallback(async () => {
    if (messages.length === 0) return;
    const date = new Date().toLocaleString('es');
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const renderBody = (text: string) =>
      esc(text)
        .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
          `<pre class="cb"${lang ? ` data-lang="${lang}"` : ''}><code>${code}</code></pre>`)
        .replace(/\n/g, '<br>');
    const msgsHtml = messages
      .filter(m => m.sender !== 'system')
      .map(m => {
        const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '';
        const lbl = m.sender === 'user' ? 'Tú' : 'Asistente';
        return `<div class="m ${m.sender === 'user' ? 'u' : 'a'}"><div class="ml">${lbl}<span class="mt">${time}</span></div><div class="mb">${renderBody(m.text)}</div></div>`;
      })
      .join('\n');
    const html = `<!DOCTYPE html>\n<html lang="es"><head>\n<meta charset="UTF-8"><title>Chat SSH — ${date}</title>\n<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;padding:24px;line-height:1.6}.chat{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:12px}h1{font-size:1.1rem;color:#a78bfa;margin-bottom:2px}.date{font-size:.75rem;color:#475569;margin-bottom:20px}.m{padding:12px 16px;border-radius:10px;font-size:.875rem}.u{background:#1e2130;border:1px solid rgba(255,255,255,.07);align-self:flex-end;max-width:80%}.a{background:#161924;border:1px solid rgba(167,139,250,.12);max-width:92%}.ml{font-size:.7rem;font-weight:600;margin-bottom:6px;display:flex;gap:8px}.u .ml{color:#60a5fa}.a .ml{color:#a78bfa}.mt{font-weight:400;color:#475569}.cb{background:#0c0e16;border:1px solid rgba(255,255,255,.07);border-radius:6px;padding:12px;margin:8px 0;font-family:'Fira Code','Courier New',monospace;font-size:.8rem;overflow-x:auto;white-space:pre}</style>\n</head><body><div class="chat"><h1>Chat SSH</h1><div class="date">${date}</div>\n${msgsHtml}\n</div></body></html>`;
    const defaultName = `chat-ssh-${new Date().toISOString().slice(0, 10)}.html`;
    try {
      const savedPath = await invoke<string>('save_text_file', { content: html, defaultName });
      if (savedPath && savedPath !== 'cancelled') { setToast(`HTML guardado: ${savedPath.split(/[\\/]/).pop()}`); setTimeout(() => setToast(null), 2500); }
    } catch (e: any) {
      if (!isCancelledError(e)) setToast('Error al exportar HTML');
      setTimeout(() => setToast(null), 2000);
    }
  }, [messages, setToast]);

  return { handleExportMd, handleExportHtml };
}
