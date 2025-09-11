// Panel del terminal: instancia xterm, ajusta tamaño y suscribe a eventos Tauri.
import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import 'xterm/css/xterm.css';
import './TerminalPane.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

type Props = { sessionId: string | null };

const sanitize = (id: string) => (id || '').replace(/[^a-zA-Z0-9_:\-\/]/g, '_');

const TerminalPane: React.FC<Props> = ({ sessionId }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  // Montaje del terminal (una sola vez)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({ cursorBlink: true, convertEol: true, allowProposedApi: true });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(container);
    try { fit.fit(); } catch {}

    termRef.current = term;
    fitRef.current = fit;

  // Ajustar tamaño al cambiar ventana y notificar al backend
  const onResize = () => {
      try { fit.fit(); } catch {}
      if (sessionId) invoke('ssh_resize', { id: sessionId, cols: term.cols, rows: term.rows }).catch(() => {});
    };

    window.addEventListener('resize', onResize);
    const disposeOnResize = term.onResize(({ cols, rows }) => {
      if (sessionId) invoke('ssh_resize', { id: sessionId, cols, rows }).catch(() => {});
    });

    return () => {
      try { disposeOnResize.dispose(); } catch {}
      window.removeEventListener('resize', onResize);
      try { term.dispose(); } catch {}
      if (unlistenRef.current) { try { unlistenRef.current(); } catch {} }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suscribirse a la sesión SSH específica (cambio de sessionId)
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    // remove previous listeners
    if (unlistenRef.current) { try { unlistenRef.current(); } catch {} unlistenRef.current = null; }

    const disposers: Array<{ dispose: () => void }> = [];

    if (sessionId) {
      const safe = sanitize(sessionId);

      disposers.push(term.onData((data) => {
        invoke('ssh_stdin', { id: sessionId, data }).catch(() => {});
      }));

      listen<string>(`ssh_out_${safe}`, (event) => {
        if (event.payload) term.write(event.payload);
      }).then(un => { unlistenRef.current = un }).catch(() => {});

  // Redimensionado inicial
      invoke('ssh_resize', { id: sessionId, cols: term.cols, rows: term.rows }).catch(() => {});
    }

    return () => {
      disposers.forEach(d => d.dispose());
      if (unlistenRef.current) { try { unlistenRef.current(); } catch {} unlistenRef.current = null; }
    };
  }, [sessionId]);

  return <div className="terminal-pane" ref={containerRef} />;
};

export default TerminalPane;
