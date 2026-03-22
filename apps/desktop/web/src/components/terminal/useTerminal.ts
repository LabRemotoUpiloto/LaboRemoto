import { useEffect, useRef, useState, RefObject } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SerializeAddon } from '@xterm/addon-serialize';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { captureAndSaveSession } from '../../api/sessionCapture';

const sanitize = (id: string) => (id || '').replace(/[^a-zA-Z0-9_:\-\/]/g, '_');

export function useTerminal(sessionId: string | null, containerRef: RefObject<HTMLDivElement>, theme: string) {
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const serializeRef = useRef<SerializeAddon | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const hasFocusedOnceRef = useRef<boolean>(false);
  const resizeTimeoutsRef = useRef<number[]>([]);
  const isResizingRef = useRef<boolean>(false);
  const lastResizeTimeRef = useRef<number>(0);
  const resizeThrottleRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const isResizingRef2 = useRef<boolean>(false);
  const lastColsRef = useRef<number>(80);
  const lastContainerSizeRef = useRef<{ width: number; height: number } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
  const [waitingForPrompt, setWaitingForPrompt] = useState<boolean>(false);

  const sessionMetadataRef = useRef<{
    sessionId: string;
    user: string;
    host: string;
    port: number;
    startTime: string;
  } | null>(null);

  const snapshotsHistoryRef = useRef<string[]>([]);
  const lastSnapshotRef = useRef<string>('');

  const hasBeenSavedRef = useRef<boolean>(false);
  const savingPromiseRef = useRef<Promise<void> | null>(null);

  const canRefocusTerminal = () => {
    const active = (document.activeElement as HTMLElement | null);
    if (!active) return true;
    if (containerRef.current && active && containerRef.current.contains(active)) return true;
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
      // Selector más amplio para capturar cursor del DOM renderer 
      const nodes = root.querySelectorAll( 
        '.xterm-cursor, .xterm-cursor-block, [class*="xterm-cursor"]' 
      ); 
      nodes.forEach(n => { 
        const el = n as HTMLElement; 
        el.classList.add('blink'); 
        // Solo quitamos animation: none si existiera inline 
        if (el.style.animation === 'none') {
          el.style.animation = '';
        }
      }); 
    } catch {}
  };

  const isPaneVisible = () => {
    const el = containerRef.current;
    if (!el) return false;
    try {
      if (el.getClientRects && el.getClientRects().length === 0) return false;
      const cs = window.getComputedStyle(el);
      if (!cs || cs.display === 'none' || cs.visibility === 'hidden') return false;
      if ((el as any).offsetParent === null) return false;
      if (el.clientWidth <= 0 || el.clientHeight <= 0) return false;
    } catch {}
    return true;
  };

  const applyXtermTheme = () => {
    const term = termRef.current;
    if (!term) return;
    const styles = getComputedStyle(document.documentElement);
    const resolveVar = (varName: string): string | undefined => {
      let value = styles.getPropertyValue(varName).trim();
      const seen = new Set<string>();
      while (value.startsWith('var(')) {
        const m = value.match(/var\((--[a-z0-9\-]+)(?:,\s*([^\)]+))?\)/i);
        if (!m) break;
        const ref = m[1];
        if (seen.has(ref)) break;
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

    const themeObj = {
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

    try { term.setOption('theme', themeObj); } catch { (term as any).options.theme = themeObj; }
    
    // Forzamos el parpadeo y estilo del cursor en cada cambio de tema
    try { term.setOption('cursorBlink', true); } catch {}
    try { term.setOption('cursorStyle', 'block'); } catch {}
    
    try { term.write('\x1b[?25h'); } catch {}
    try { term.refresh(0, term.rows - 1); } catch {}
    try { ensureBlinkClasses(); } catch {}
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      convertEol: true,
      allowProposedApi: true,
      cols: 80,
      rows: 24,
      scrollback: 5000, // Permitir scroll de hasta 5000 líneas hacia arriba
      scrollOnUserInput: true,
      windowsMode: false,
      overviewRulerWidth: 0,
      screenReaderMode: false,
    });
    const fit = new FitAddon();
    const serialize = new SerializeAddon();
    term.loadAddon(fit);
    term.loadAddon(serialize);
    term.loadAddon(new WebLinksAddon());

    try { container.setAttribute('tabindex', '0'); container.setAttribute('role', 'textbox'); } catch {}

    const initializeTerminal = () => {
      // Fuerza DOM renderer ANTES de open() para que xterm lo use desde el inicio
      try { (term as any).options.rendererType = 'dom'; } catch {}

      term.open(container);
      
      // Blink JS directo - más confiable que CSS con xterm DOM renderer 
      let blinkVisible = true; 
      const blinkInterval = window.setInterval(() => { 
        const root = containerRef.current; 
        if (!root) return; 
        const cursor = root.querySelector<HTMLElement>('.xterm-cursor-outline, .xterm-cursor-block, .xterm-cursor-bar'); 
        if (cursor) { 
          cursor.style.setProperty('opacity', blinkVisible ? '1' : '0', 'important'); 
        } 
        blinkVisible = !blinkVisible; 
      }, 600); 
      (term as any)._blinkInterval = blinkInterval; 

      term.write('\x1b[?25h');
      
      requestAnimationFrame(() => {
        try {
          termRef.current?.focus();
          hasFocusedOnceRef.current = true;
          ensureBlinkClasses();
        } catch {}
      });

      termRef.current = term;
      fitRef.current = fit;
      serializeRef.current = serialize;
      try { applyXtermTheme(); } catch {}
      try { requestAnimationFrame(() => applyXtermTheme()); } catch {}

      // Suscribirse al renderizado para asegurar que el cursor siempre tenga la clase blink
      if ((term as any).onRender) {
        (term as any).onRender(() => ensureBlinkClasses());
      }

      try {
        container.addEventListener('mousedown', () => {
          if (termRef.current && canRefocusTerminal()) {
            try {
              termRef.current.focus();
              hasFocusedOnceRef.current = true;
            } catch {}
          }
        });
      } catch {}
    };

    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      initializeTerminal();
    } else {
      requestAnimationFrame(() => {
        const r = container.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          initializeTerminal();
        }
      });
    }

    const mo = new MutationObserver((recs) => {
      if (recs.some(r => r.type === 'attributes' && r.attributeName === 'data-theme')) {
        try { applyXtermTheme(); } catch {}
      }
    });
    try { mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch {}

    const onResize = () => {
      if (!isPaneVisible()) return;
      try { fit.fit(); } catch {}
      try { if (termRef.current && hasFocusedOnceRef.current && canRefocusTerminal()) termRef.current.focus(); } catch {}
    };

    window.addEventListener('resize', onResize);

    const smartResize = () => {
      if (!termRef.current || !fitRef.current || !containerRef.current) return;
      if (!isPaneVisible()) return;
      const cont = containerRef.current;
      if (cont.clientWidth < 50 || cont.clientHeight < 30) return;

      try {
        const proposed = fitRef.current.proposeDimensions();
        if (!proposed || proposed.cols <= 0 || proposed.rows <= 0) return;

        // Lógica Asimétrica: Solo permitimos que las columnas CREZCAN visualmente de forma inmediata.
        // Esto evita que xterm intente hacer wrap del prompt cuando achicas el panel.
        const currentCols = termRef.current.cols;
        const newCols = proposed.cols > currentCols ? proposed.cols : currentCols;
        const newRows = proposed.rows;

        if (newCols !== termRef.current.cols || newRows !== termRef.current.rows) {
          termRef.current.resize(newCols, newRows);
          lastColsRef.current = newCols;
        }
      } catch (e) {
        try { fitRef.current.fit(); } catch {}
      }
    };

    const debouncedResize = () => {
      if (resizeThrottleRef.current) {
        window.clearTimeout(resizeThrottleRef.current);
      }

      // Ajuste visual instantáneo (crecimiento asimétrico) para fluidez
      smartResize();

      // Notificación al servidor con un delay mayor (fin del drag)
      resizeThrottleRef.current = window.setTimeout(() => {
        const term = termRef.current;
        const fit = fitRef.current;
        if (!term || !fit || !sessionId) return;

        try {
          const proposed = fit.proposeDimensions();
          if (proposed) {
            // Bloqueamos la salida del servidor durante el proceso de resize real
            isResizingRef2.current = true;
            
            // Aquí sí aplicamos el tamaño real (incluso si es menor) al servidor
            term.resize(proposed.cols, proposed.rows);
            invoke('ssh_resize', { 
              id: sessionId, 
              cols: proposed.cols, 
              rows: proposed.rows 
            }).catch(() => {});

            // Desbloqueamos después de 600ms para ignorar el "eco" del prompt del servidor
            setTimeout(() => {
              isResizingRef2.current = false;
            }, 600);
          }
        } catch {}
      }, 500);
    };

    const onSidebarToggled = () => { debouncedResize(); };
    const onBottomBarToggled = () => { debouncedResize(); };
    const onPinsToggled = () => { debouncedResize(); };
    window.addEventListener('app:sidebar-toggled', onSidebarToggled as any);
    window.addEventListener('app:bottombar-toggled', onBottomBarToggled as any);
    window.addEventListener('app:pins-toggled', onPinsToggled as any);

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

    const mainContentEl = document.querySelector('.main-content');
    const onTransitionEnd = (ev: Event) => {
      const te = ev as TransitionEvent;
      if (!te.propertyName || te.propertyName === 'margin-left') {
        debouncedResize();
      }
    };
    try { mainContentEl?.addEventListener('transitionend', onTransitionEnd); } catch {}

    const bottomBarContent = (() => {
      const el = containerRef.current;
      const stack = el?.closest?.('.terminal-stack') as HTMLElement | null;
      return stack ? (stack.querySelector('.bottom-bar .bb-content') as HTMLElement | null) : null;
    })();
    const onBottomBarTransitionEnd = (ev: Event) => {
      const te = ev as TransitionEvent;
      if (te.propertyName === 'height') {
        debouncedResize();
      }
    };
    try { bottomBarContent?.addEventListener('transitionend', onBottomBarTransitionEnd); } catch {}

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('app:sidebar-toggled', onSidebarToggled as any);
      window.removeEventListener('app:bottombar-toggled', onBottomBarToggled as any);
      window.removeEventListener('app:pins-toggled', onPinsToggled as any);
      try { mainContentEl?.removeEventListener('transitionend', onTransitionEnd); } catch {}
      try {
        const bottomBarContent2 = document.querySelector('.bottom-bar .bb-content');
        bottomBarContent2?.removeEventListener('transitionend', onBottomBarTransitionEnd);
      } catch {}
      resizeTimeoutsRef.current.forEach(timeoutId => {
        try { window.clearTimeout(timeoutId); } catch {}
      });
      resizeTimeoutsRef.current = [];
      if (resizeThrottleRef.current) {
        try { window.clearTimeout(resizeThrottleRef.current); } catch {}
        resizeThrottleRef.current = null;
      }
      if (resizeObserverRef.current) {
        try { resizeObserverRef.current.disconnect(); } catch {}
        resizeObserverRef.current = null;
      }
      isResizingRef.current = false;

      const captureBeforeDestroy = async () => {
        if (savingPromiseRef.current) {
          await savingPromiseRef.current;
          return;
        }
        if (hasBeenSavedRef.current) {
          return;
        }
        const metadata = sessionMetadataRef.current;
        const serialize = serializeRef.current;
        if (metadata && serialize) {
          savingPromiseRef.current = (async () => {
            try {
              hasBeenSavedRef.current = true;
              const finalSnapshot = serialize.serialize();
              const allSnapshots = [...snapshotsHistoryRef.current];
              if (finalSnapshot && finalSnapshot.length > 10) {
                allSnapshots.push(finalSnapshot);
              }
              const fullHistory = allSnapshots.join('\n');
              if (fullHistory && fullHistory.length > 10) {
                const endTime = new Date().toISOString();
                let finalMetadata = { ...metadata };
                if (metadata.sessionId.includes('@') && metadata.sessionId.includes(':')) {
                  const parts = metadata.sessionId.split('@');
                  const user = parts[0] || metadata.user;
                  const hostPort = parts[1]?.split(':') || [];
                  const host = hostPort[0] || metadata.host;
                  const port = parseInt(hostPort[1]) || metadata.port;
                  finalMetadata = {
                    ...metadata,
                    user,
                    host,
                    port,
                    endTime
                  };
                } else {
                  finalMetadata = {
                    ...metadata,
                    endTime
                  };
                }
                await captureAndSaveSession(fullHistory, finalMetadata);
              }
            } catch (error) {
              hasBeenSavedRef.current = false;
              throw error;
            } finally {
              savingPromiseRef.current = null;
            }
          })();
          await savingPromiseRef.current;
        }
      };

      captureBeforeDestroy();

      try { 
        const bi = (term as any)._blinkInterval; 
        if (bi) window.clearInterval(bi); 
      } catch {} 

      try { term.dispose(); } catch {}
      if (unlistenRef.current) { try { unlistenRef.current(); } catch {} }
    };
  }, [containerRef, sessionId]);

  useEffect(() => {
    applyXtermTheme();
    try { requestAnimationFrame(() => applyXtermTheme()); } catch {}
  }, [theme]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const captureCurrentSession = async () => {
      if (savingPromiseRef.current) {
        return savingPromiseRef.current;
      }
      if (hasBeenSavedRef.current) {
        return;
      }
      const metadata = sessionMetadataRef.current;
      const serialize = serializeRef.current;
      if (!metadata || !serialize) return;
      savingPromiseRef.current = (async () => {
        try {
          hasBeenSavedRef.current = true;
          const finalSnapshot = serialize.serialize();
          const allSnapshots = [...snapshotsHistoryRef.current];
          if (finalSnapshot && finalSnapshot.length > 10) {
            allSnapshots.push(finalSnapshot);
          }
          const fullHistory = allSnapshots.join('\n');
          if (fullHistory && fullHistory.length > 10) {
            const endTime = new Date().toISOString();
            let finalMetadata = { ...metadata };
            if (metadata.sessionId.includes('@') && metadata.sessionId.includes(':')) {
              const parts = metadata.sessionId.split('@');
              const user = parts[0] || metadata.user;
              const hostPort = parts[1]?.split(':') || [];
              const host = hostPort[0] || metadata.host;
              const port = parseInt(hostPort[1]) || metadata.port;
              finalMetadata = {
                ...metadata,
                user,
                host,
                port,
                endTime
              };
            } else {
              finalMetadata = {
                ...metadata,
                endTime
              };
            }
            await captureAndSaveSession(fullHistory, finalMetadata);
          }
        } catch (error) {
          hasBeenSavedRef.current = false;
          throw error;
        } finally {
          savingPromiseRef.current = null;
        }
      })();
      return savingPromiseRef.current;
    };

    if (unlistenRef.current) { try { unlistenRef.current(); } catch {} unlistenRef.current = null; }

    const previousMetadata = sessionMetadataRef.current;
    if (previousMetadata && previousMetadata.sessionId !== sessionId) {
      captureCurrentSession();
      snapshotsHistoryRef.current = [];
      lastSnapshotRef.current = '';
      hasBeenSavedRef.current = false;
      savingPromiseRef.current = null;
    }

    const handleSaveBeforeClose = async (event: CustomEvent) => {
      const { sessionId: requestedSessionId } = event.detail;
      if (requestedSessionId === sessionId) {
        try {
          await captureCurrentSession();
          window.dispatchEvent(new CustomEvent('app:session-saved', { detail: { sessionId } }));
        } catch (error) {
          window.dispatchEvent(new CustomEvent('app:session-save-failed', { detail: { sessionId, error } }));
        }
      }
    };

    window.addEventListener('app:save-session-before-close', handleSaveBeforeClose as EventListener);

    const captureSnapshot = () => {
      const serialize = serializeRef.current;
      if (serialize) {
        try {
          const snapshot = serialize.serialize();
          if (snapshot && snapshot !== lastSnapshotRef.current) {
            if (snapshot.length < lastSnapshotRef.current.length / 2 && lastSnapshotRef.current.length > 50) {
              snapshotsHistoryRef.current.push(lastSnapshotRef.current);
            }
            lastSnapshotRef.current = snapshot;
          }
        } catch (err) {
          console.warn('Error capturing snapshot:', err);
        }
      }
    };

    const disposers: Array<{ dispose: () => void }> = [];

    if (sessionId) {
      const safe = sanitize(sessionId);

      (async () => {
        try {
          const info = await invoke<{ host: string; port: number; user: string }>('ssh_session_info', { id: sessionId });
          sessionMetadataRef.current = {
            sessionId,
            user: info.user || 'unknown',
            host: info.host || 'unknown',
            port: info.port || 22,
            startTime: new Date().toISOString()
          };
        } catch (error) {
          sessionMetadataRef.current = {
            sessionId,
            user: 'student',
            host: sessionId.split('@')[1]?.split(':')[0] || 'server',
            port: 22,
            startTime: new Date().toISOString()
          };
        }
      })();

      setIsLoading(true);
      setWaitingForPrompt(false);

      let bytesReceived = 0;
      let contentCheckInterval: number | null = null;
      let contentCheckTimeout: number | null = null;
      let nudgeTimeout: number | null = null;
      let hasHiddenLoading = false;
      let nudgeSent = false;

      const fadeOutAndHide = () => {
        if (hasHiddenLoading) return;
        hasHiddenLoading = true;
        setIsFadingOut(true);
        setTimeout(() => {
          setIsLoading(false);
          setWaitingForPrompt(false);
          setIsFadingOut(false);
        }, 400);
        if (contentCheckInterval) {
          window.clearInterval(contentCheckInterval);
          contentCheckInterval = null;
        }
        if (contentCheckTimeout) {
          window.clearTimeout(contentCheckTimeout);
          contentCheckTimeout = null;
        }
        if (nudgeTimeout) {
          window.clearTimeout(nudgeTimeout);
          nudgeTimeout = null;
        }
      };

      const checkAndHideLoading = () => {
        if (hasHiddenLoading) return;
        try {
          const buffer = term.buffer.active;
          let hasVisibleText = false;
          const linesToCheck = Math.min(buffer.length, 30);
          for (let i = 0; i < linesToCheck; i++) {
            const line = buffer.getLine(i);
            if (line) {
              const text = line.translateToString(true).trim();
              if (text.length > 0) {
                hasVisibleText = true;
                break;
              }
            }
          }
          if (hasVisibleText) {
            fadeOutAndHide();
          }
        } catch (e) {
          console.warn('Error checking terminal content:', e);
        }
      };

      contentCheckInterval = window.setInterval(checkAndHideLoading, 150);

      // Después de 6 segundos sin prompt, enviar un \n como "nudge" para forzar al shell
      nudgeTimeout = window.setTimeout(() => {
        if (!hasHiddenLoading && !nudgeSent) {
          nudgeSent = true;
          setWaitingForPrompt(true);
          invoke('ssh_stdin', { id: sessionId, data: '\n' }).catch(() => {});
        }
      }, 6000);

      // Safety timeout: después de 15 segundos, forzar ocultar el loading
      contentCheckTimeout = window.setTimeout(() => {
        if (!hasHiddenLoading) {
          fadeOutAndHide();
        }
      }, 15000);

      disposers.push(term.onData((data) => {
        invoke('ssh_stdin', { id: sessionId, data }).catch(() => {});
      }));

      listen<string>(`ssh_out_${safe}`, (event) => {
        if (event.payload) {
          // Descarta output del servidor durante resize para evitar duplicación del prompt
          if (isResizingRef2.current) return;

          bytesReceived += event.payload.length;
          term.write(event.payload, () => {
            setTimeout(checkAndHideLoading, 100);
            setTimeout(() => captureSnapshot(), 150);
          });
          setTimeout(checkAndHideLoading, 200);
          try { if (!hasFocusedOnceRef.current && canRefocusTerminal()) { term.focus(); hasFocusedOnceRef.current = true; } } catch {}
          try { ensureBlinkClasses(); } catch {}
        }
      }).then(un => { unlistenRef.current = un }).catch(() => {});

      invoke('ssh_resize', { id: sessionId, cols: term.cols, rows: term.rows }).catch(() => {});
      invoke('ssh_ui_ready', { id: sessionId }).catch(() => {});
      try { if (canRefocusTerminal()) { term.focus(); hasFocusedOnceRef.current = true; } } catch {}
      try { ensureBlinkClasses(); } catch {}

      return () => {
        disposers.forEach(d => d.dispose());
        if (unlistenRef.current) { try { unlistenRef.current(); } catch {} unlistenRef.current = null; }
        if (contentCheckInterval) {
          window.clearInterval(contentCheckInterval);
        }
        if (contentCheckTimeout) {
          window.clearTimeout(contentCheckTimeout);
        }
        if (nudgeTimeout) {
          window.clearTimeout(nudgeTimeout);
        }
        captureCurrentSession();
        window.removeEventListener('app:save-session-before-close', handleSaveBeforeClose as EventListener);
      };
    } else {
      setIsLoading(false);
      return () => {
        window.removeEventListener('app:save-session-before-close', handleSaveBeforeClose as EventListener);
      };
    }
  }, [sessionId]);

  return { isLoading, isFadingOut, waitingForPrompt };
}
