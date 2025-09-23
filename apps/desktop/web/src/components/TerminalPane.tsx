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
  const hasFocusedOnceRef = useRef<boolean>(false);
  const focusLoopRef = useRef<number | null>(null);

  const ensureBlinkClasses = () => {
    const root = containerRef.current;
    if (!root) return;
    try {
      const nodes = root.querySelectorAll('.xterm .xterm-cursor, .xterm .xterm-cursor-block, .xterm .xterm-cursor-bar, .xterm .xterm-cursor-underline');
      nodes.forEach(n => { try { (n as HTMLElement).classList.add('blink'); } catch {} });
    } catch {}
  };

  // Reintenta enfocar el terminal por un corto periodo, útil si el SO/ventana roba el foco
  const startFocusLoop = (ms: number = 2000) => {
    if (focusLoopRef.current) { try { window.clearInterval(focusLoopRef.current); } catch {} focusLoopRef.current = null; }
    const start = Date.now();
    focusLoopRef.current = window.setInterval(() => {
      if (!termRef.current) return;
      const elapsed = Date.now() - start;
      if (elapsed > ms) {
        if (focusLoopRef.current) { try { window.clearInterval(focusLoopRef.current); } catch {} focusLoopRef.current = null; }
        return;
      }
      try {
        const active = document.activeElement as HTMLElement | null;
        const ta = containerRef.current?.querySelector('.xterm textarea') as HTMLTextAreaElement | null;
        if (ta && active !== ta) {
          termRef.current.focus();
          hasFocusedOnceRef.current = true;
        }
      } catch {}
    }, 250);
  };

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

    // Aplica el tema y refuerza opciones del cursor; evita cambiar renderer para no romper el parpadeo
    try { term.setOption('theme', theme); } catch { (term as any).options.theme = theme; }
  try { term.setOption('cursorBlink', false); term.setOption('cursorStyle', 'block'); } catch {}
    try { term.refresh(0, term.rows - 1); } catch {}
  };

  // Montaje del terminal (una sola vez)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

  const term = new Terminal({ cursorBlink: true, cursorStyle: 'block', convertEol: true, allowProposedApi: true });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
  // Asegura que el contenedor pueda recibir foco a nivel del navegador
  try { container.setAttribute('tabindex', '0'); container.setAttribute('role', 'textbox'); } catch {}
  term.open(container);
  try { fit.fit(); } catch {}
  // Enfocar inmediatamente tras abrir para permitir escribir sin click
  try { term.focus(); hasFocusedOnceRef.current = true; } catch {}
  startFocusLoop();
  // Fijar renderer DOM vía opción interna si está disponible y reforzar opciones del cursor de forma segura
  try { (term as any).setOption?.('rendererType', 'dom'); } catch {}
  try { (term as any).options.cursorBlink = false; (term as any).options.cursorStyle = 'block'; } catch {}
  try { ensureBlinkClasses(); requestAnimationFrame(() => ensureBlinkClasses()); } catch {}
  try { ensureBlinkClasses(); requestAnimationFrame(() => ensureBlinkClasses()); } catch {}

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
      // Reenfocar después de ajuste si ya enfocamos una vez
      try { if (termRef.current && hasFocusedOnceRef.current) termRef.current.focus(); } catch {}
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
      if (focusLoopRef.current) { try { window.clearInterval(focusLoopRef.current); } catch {} focusLoopRef.current = null; }
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
        if (event.payload) {
          term.write(event.payload);
          // Enfocar cuando llega la primera salida (primer conexión) si aún no se enfocó
          try {
            if (!hasFocusedOnceRef.current) { term.focus(); hasFocusedOnceRef.current = true; }
          } catch {}
          startFocusLoop();
          try { ensureBlinkClasses(); } catch {}
        }
      }).then(un => { unlistenRef.current = un }).catch(() => {});

      // Redimensionado inicial y señal de "UI lista" para volcar el buffer efímero
      invoke('ssh_resize', { id: sessionId, cols: term.cols, rows: term.rows }).catch(() => {});
      // Señal de readiness: después de montar y ajustar tamaño
      invoke('ssh_ui_ready', { id: sessionId }).catch(() => {});
      // Enfocar tras handshake inicial
      try { term.focus(); hasFocusedOnceRef.current = true; } catch {}
      startFocusLoop();
      try { ensureBlinkClasses(); } catch {}
    }

    return () => {
      disposers.forEach(d => d.dispose());
      if (unlistenRef.current) { try { unlistenRef.current(); } catch {} unlistenRef.current = null; }
    };
  }, [sessionId]);

  return <div className="terminal-pane" ref={containerRef} />;
};

export default TerminalPane;
