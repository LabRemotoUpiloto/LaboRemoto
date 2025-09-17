// Panel del terminal: instancia xterm, ajusta tamaño y suscribe a eventos Tauri.
import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import 'xterm/css/xterm.css';
import './TerminalPane.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useTheme } from '../contexts/ThemeContext';

type Props = { sessionId: string | null };

const sanitize = (id: string) => (id || '').replace(/[^a-zA-Z0-9_:\-\/]/g, '_');

const TerminalPane: React.FC<Props> = ({ sessionId }) => {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  // Apply xterm theme from CSS variables
  const applyXtermTheme = () => {
    const term = termRef.current;
    if (!term) return;
    const styles = getComputedStyle(document.documentElement);
    // Resuelve una variable CSS, siguiendo referencias var(--x) hasta obtener un valor final (hex/rgb/rgba)
    const resolveVar = (varName: string): string | undefined => {
      let value = styles.getPropertyValue(varName).trim();
      const seen = new Set<string>();
      // Sigue cadenas var(--foo[, fallback])
      while (value.startsWith('var(')) {
        const m = value.match(/var\((--[a-z0-9\-]+)(?:,\s*([^\)]+))?\)/i);
        if (!m) break;
        const ref = m[1];
        if (seen.has(ref)) break; // evita ciclos
        seen.add(ref);
        const next = styles.getPropertyValue(ref).trim();
        if (next) {
          value = next;
        } else if (m[2]) {
          value = m[2].trim();
        } else {
          break;
        }
      }
      return value || undefined;
    };

    const theme = {
      // Asegura que foreground siempre sea un color real (no una cadena var(...))
      foreground: resolveVar('--terminal-foreground') || resolveVar('--text-primary'),
      background: 'transparent',
      cursor: resolveVar('--accent-primary'),
      cursorAccent: resolveVar('--background-primary'),
      selectionBackground: resolveVar('--selection-bg'),
      selectionForeground: resolveVar('--selection-fg'),
      black: resolveVar('--ansi-black'),
      red: resolveVar('--ansi-red'),
      green: resolveVar('--ansi-green'),
      yellow: resolveVar('--ansi-yellow'),
      blue: resolveVar('--ansi-blue'),
      magenta: resolveVar('--ansi-magenta'),
      cyan: resolveVar('--ansi-cyan'),
      white: resolveVar('--ansi-white'),
      brightBlack: resolveVar('--ansi-bright-black'),
      brightRed: resolveVar('--ansi-bright-red'),
      brightGreen: resolveVar('--ansi-bright-green'),
      brightYellow: resolveVar('--ansi-bright-yellow'),
      brightBlue: resolveVar('--ansi-bright-blue'),
      brightMagenta: resolveVar('--ansi-bright-magenta'),
      brightCyan: resolveVar('--ansi-bright-cyan'),
      brightWhite: resolveVar('--ansi-bright-white'),
    } as any;

    // Usa la API oficial para aplicar el tema y refresca la pantalla
    try { term.setOption('theme', theme); } catch { (term as any).options.theme = theme; }
    // Fuerza re-render del renderer para evitar atlas/estilos stale
    try {
      const currentRenderer = (term.getOption as any)?.('rendererType');
      term.setOption('rendererType', 'dom');
      // Regresa al renderer por defecto en el siguiente tick
      setTimeout(() => {
        try { term.setOption('rendererType', currentRenderer || 'canvas'); } catch {}
      }, 0);
    } catch {}
    try { term.refresh(0, term.rows - 1); } catch {}
  };

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
  // Initial theme
  try { applyXtermTheme(); } catch {}
  // Reaplicar tras el frame por si el atributo data-theme cambia después del efecto del provider
  try { requestAnimationFrame(() => applyXtermTheme()); } catch {}

  // Observar cambios en html[data-theme] para re-aplicar el tema con estilos ya computados
  const mo = new MutationObserver((recs) => {
      if (recs.some(r => r.type === 'attributes' && r.attributeName === 'data-theme')) {
        try { applyXtermTheme(); } catch {}
      }
    });
  try { mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch {}

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
      try { mo.disconnect(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-apply theme when app theme changes
  useEffect(() => {
    applyXtermTheme();
    // Reintenta en el siguiente frame para capturar variables ya recalculadas
    try { requestAnimationFrame(() => applyXtermTheme()); } catch {}
  }, [theme]);

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

      // Redimensionado inicial y señal de "UI lista" para volcar el buffer efímero
      invoke('ssh_resize', { id: sessionId, cols: term.cols, rows: term.rows }).catch(() => {});
      // Señal de readiness: después de montar y ajustar tamaño
      invoke('ssh_ui_ready', { id: sessionId }).catch(() => {});
    }

    return () => {
      disposers.forEach(d => d.dispose());
      if (unlistenRef.current) { try { unlistenRef.current(); } catch {} unlistenRef.current = null; }
    };
  }, [sessionId]);

  return <div className="terminal-pane" ref={containerRef} />;
};

export default TerminalPane;
