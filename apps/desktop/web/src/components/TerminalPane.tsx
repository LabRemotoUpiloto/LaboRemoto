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
  const resizeTimeoutsRef = useRef<number[]>([]);
  const isResizingRef = useRef<boolean>(false);
  const lastResizeTimeRef = useRef<number>(0);
  const resizeThrottleRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const lastContainerSizeRef = useRef<{ width: number; height: number } | null>(null);

  // Only allow terminal to auto-focus when not interacting with other inputs (e.g., ChatPane textarea)
  const canRefocusTerminal = () => {
    const active = (document.activeElement as HTMLElement | null);
    if (!active) return true;
    if (containerRef.current && active && containerRef.current.contains(active)) return true; // already in terminal
    if (active.closest && (active.closest('.chat-pane') || active.closest('.chat-input'))) return false;
    const tag = active.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return false;
    if (active.getAttribute && active.getAttribute('contenteditable') === 'true') return false;
    return true;
  };

  const ensureBlinkClasses = () => {
    const root = containerRef.current;
    if (!root) return;
    try {
      const nodes = root.querySelectorAll('.xterm .xterm-cursor, .xterm .xterm-cursor-block, .xterm .xterm-cursor-bar, .xterm .xterm-cursor-underline');
      nodes.forEach(n => { try { (n as HTMLElement).classList.add('blink'); } catch {} });
    } catch {}
  };

  // Determina si el panel de terminal es visible (no está dentro de un contenedor display:none y tiene tamaño)
  const isPaneVisible = () => {
    const el = containerRef.current;
    if (!el) return false;
    try {
      if (el.getClientRects && el.getClientRects().length === 0) return false;
      const cs = window.getComputedStyle(el);
      if (!cs || cs.display === 'none' || cs.visibility === 'hidden') return false;
      // offsetParent suele ser null cuando algún ancestro tiene display:none
      if ((el as any).offsetParent === null) return false;
      if (el.clientWidth <= 0 || el.clientHeight <= 0) return false;
    } catch {}
    return true;
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
        if (ta && active !== ta && canRefocusTerminal()) {
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
  
  // Función para inicializar el terminal una vez que tenga dimensiones
  const initializeTerminal = () => {
    term.open(container);
    try { fit.fit(); } catch {}
    
    // Enfocar inmediatamente tras abrir para permitir escribir sin click
    try { if (canRefocusTerminal()) { term.focus(); hasFocusedOnceRef.current = true; } } catch {}
    startFocusLoop();
    // Fijar renderer DOM vía opción interna si está disponible y reforzar opciones del cursor de forma segura
    try { (term as any).setOption?.('rendererType', 'dom'); } catch {}
    try { (term as any).options.cursorBlink = false; (term as any).options.cursorStyle = 'block'; } catch {}
    try { ensureBlinkClasses(); requestAnimationFrame(() => ensureBlinkClasses()); } catch {}

    termRef.current = term;
    fitRef.current = fit;
    // Initial theme
    try { applyXtermTheme(); } catch {}
    // Reaplicar tras el frame por si el atributo data-theme cambia después del efecto del provider
    try { requestAnimationFrame(() => applyXtermTheme()); } catch {}
  };

  // Verificar que el contenedor tenga dimensiones antes de abrir el terminal
  const rect = container.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    initializeTerminal();
  } else {
    // Si no tiene dimensiones, esperar al siguiente frame
    requestAnimationFrame(() => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        initializeTerminal();
      }
    });
  }

  // Observar cambios en html[data-theme] para re-aplicar el tema con estilos ya computados
  const mo = new MutationObserver((recs) => {
      if (recs.some(r => r.type === 'attributes' && r.attributeName === 'data-theme')) {
        try { applyXtermTheme(); } catch {}
      }
    });
  try { mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch {}

  // Ajustar tamaño al cambiar ventana y notificar al backend
  const onResize = () => {
    if (!isPaneVisible()) return;
    try { fit.fit(); } catch {}
      // Reenfocar después de ajuste si ya enfocamos una vez
  try { if (termRef.current && hasFocusedOnceRef.current && canRefocusTerminal()) termRef.current.focus(); } catch {}
      if (sessionId) invoke('ssh_resize', { id: sessionId, cols: term.cols, rows: term.rows }).catch(() => {});
    };

    window.addEventListener('resize', onResize);
  // Función inteligente de resize que detecta cambios reales de tamaño
  const smartResize = () => {
    if (!termRef.current || !fitRef.current || !containerRef.current) return;
    
    const container = containerRef.current;
    const currentSize = { width: container.clientWidth, height: container.clientHeight };
    
    // Solo hacer resize si el tamaño realmente cambió
    if (lastContainerSizeRef.current && 
        lastContainerSizeRef.current.width === currentSize.width && 
        lastContainerSizeRef.current.height === currentSize.height) {
      return;
    }
    
    lastContainerSizeRef.current = currentSize;
    
    // Verificar que el panel sea visible
    if (!isPaneVisible()) return;
    
    try {
      fit.fit();
      
      // Reenfocar después de ajuste si ya enfocamos una vez
      if (termRef.current && hasFocusedOnceRef.current && canRefocusTerminal()) {
        termRef.current.focus();
      }
      
      // Notificar al backend si tenemos una sesión válida
      if (sessionId && termRef.current.cols > 0 && termRef.current.rows > 0) {
        invoke('ssh_resize', { id: sessionId, cols: termRef.current.cols, rows: termRef.current.rows }).catch(() => {});
      }
    } catch (e) {
      console.warn('Error during terminal fit:', e);
    }
  };

  // Función de resize con debounce para eventos de transición
  const debouncedResize = () => {
    const now = Date.now();
    
    // Debounce: cancelar resize anterior si fue hace menos de 100ms
    if (now - lastResizeTimeRef.current < 100) {
      if (resizeThrottleRef.current) {
        try { window.clearTimeout(resizeThrottleRef.current); } catch {}
        resizeThrottleRef.current = null;
      }
    }
    
    lastResizeTimeRef.current = now;
    
    // Ejecutar resize después de un pequeño delay para permitir que las transiciones CSS terminen
    resizeThrottleRef.current = window.setTimeout(() => {
      smartResize();
    }, 50);
  };

  // Escuchar el toggle explícito de la sidebar y bottom bar para ajustar (se emite en fases)
  const onSidebarToggled = () => { debouncedResize(); };
  const onBottomBarToggled = () => { debouncedResize(); };
  const onPinsToggled = () => { debouncedResize(); };
  window.addEventListener('app:sidebar-toggled', onSidebarToggled as any);
  window.addEventListener('app:bottombar-toggled', onBottomBarToggled as any);
  window.addEventListener('app:pins-toggled', onPinsToggled as any);

    // ResizeObserver para detectar cambios reales de tamaño del contenedor
    if (container && window.ResizeObserver) {
      resizeObserverRef.current = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === container) {
            debouncedResize();
          }
        }
      });
      resizeObserverRef.current.observe(container);
    }

    // Además, escuchar el final de la transición del contenedor principal para asegurar el ajuste
    const mainContentEl = document.querySelector('.main-content');
    const onTransitionEnd = (ev: Event) => {
      const te = ev as TransitionEvent;
      // Solo reaccionar a la transición relevante de margen que desplaza el layout
      if (!te.propertyName || te.propertyName === 'margin-left') {
        debouncedResize();
      }
    };
    try { mainContentEl?.addEventListener('transitionend', onTransitionEnd); } catch {}

    // Escuchar específicamente el fin de la transición de altura de la bottom bar
    // Restringir el listener de transitionend al bottom bar del mismo stack que este terminal
    const bottomBarContent = (() => {
      const el = containerRef.current;
      const stack = el?.closest?.('.terminal-stack') as HTMLElement | null;
      return stack ? (stack.querySelector('.bottom-bar .bb-content') as HTMLElement | null) : null;
    })();
    const onBottomBarTransitionEnd = (ev: Event) => {
      const te = ev as TransitionEvent;
      if (te.propertyName === 'height') {
        multiStageFitAndResize();
      }
    };
    try { bottomBarContent?.addEventListener('transitionend', onBottomBarTransitionEnd); } catch {}

    // (ResizeObserver removed as requested)
    const disposeOnResize = term.onResize(({ cols, rows }) => {
      if (sessionId) invoke('ssh_resize', { id: sessionId, cols, rows }).catch(() => {});
    });

    return () => {
      try { disposeOnResize.dispose(); } catch {}
      window.removeEventListener('resize', onResize);
      window.removeEventListener('app:sidebar-toggled', onSidebarToggled as any);
      window.removeEventListener('app:bottombar-toggled', onBottomBarToggled as any);
      window.removeEventListener('app:pins-toggled', onPinsToggled as any);
      try { mainContentEl?.removeEventListener('transitionend', onTransitionEnd); } catch {}
      try {
        const bottomBarContent2 = document.querySelector('.bottom-bar .bb-content');
        bottomBarContent2?.removeEventListener('transitionend', onBottomBarTransitionEnd);
      } catch {}
      // Limpiar timeouts pendientes
      resizeTimeoutsRef.current.forEach(timeoutId => {
        try { window.clearTimeout(timeoutId); } catch {}
      });
      resizeTimeoutsRef.current = [];
      
      // Limpiar throttle
      if (resizeThrottleRef.current) {
        try { window.clearTimeout(resizeThrottleRef.current); } catch {}
        resizeThrottleRef.current = null;
      }
      
      // Limpiar ResizeObserver
      if (resizeObserverRef.current) {
        try { resizeObserverRef.current.disconnect(); } catch {}
        resizeObserverRef.current = null;
      }
      
      isResizingRef.current = false;
      try { term.dispose(); } catch {}
      if (unlistenRef.current) { try { unlistenRef.current(); } catch {} }
      if (focusLoopRef.current) { try { window.clearInterval(focusLoopRef.current); } catch {} focusLoopRef.current = null; }
      // (ResizeObserver cleanup removed)
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
          try { if (!hasFocusedOnceRef.current && canRefocusTerminal()) { term.focus(); hasFocusedOnceRef.current = true; } } catch {}
          startFocusLoop();
          try { ensureBlinkClasses(); } catch {}
        }
      }).then(un => { unlistenRef.current = un }).catch(() => {});

      // Redimensionado inicial y señal de "UI lista" para volcar el buffer efímero
      invoke('ssh_resize', { id: sessionId, cols: term.cols, rows: term.rows }).catch(() => {});
      // Señal de readiness: después de montar y ajustar tamaño
      invoke('ssh_ui_ready', { id: sessionId }).catch(() => {});
      // Enfocar tras handshake inicial
  try { if (canRefocusTerminal()) { term.focus(); hasFocusedOnceRef.current = true; } } catch {}
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
