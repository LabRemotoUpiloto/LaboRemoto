/**
 * useTerminalLifecycle.ts — init/dispose de la instancia xterm + addons.
 *
 * Responsable de:
 * - Crear la instancia de `Terminal` (xterm) y sus addons (fit, serialize, web-links)
 *   cuando cambia `sessionId` (una instancia nueva por sesión), esperando a que el
 *   contenedor tenga tamaño real antes de hacer `term.open()`.
 * - El "blink" JS del cursor (más confiable que el CSS puro con el DOM renderer de xterm).
 * - Aplicar el tema xterm al montar y cuando cambia `theme` o el atributo `data-theme`
 *   del documento (vía MutationObserver).
 * - Enfocar el terminal al hacer click dentro del contenedor (si es seguro re-enfocar).
 * - Limpieza: cancela el blink interval, llama a `onDispose` (para permitir que la
 *   sesión se guarde ANTES de destruir el terminal — ver useTerminalSessionCapture)
 *   y finalmente hace `term.dispose()`.
 *
 * Nota de orden: este hook debe montarse DESPUÉS de useTerminalResize en el hook
 * orquestador (useTerminal.ts) para que, en cleanup, los listeners de resize se
 * remuevan antes de que el terminal se destruya — igual que en el efecto único
 * original.
 */
import { useEffect, MutableRefObject, RefObject } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SerializeAddon } from '@xterm/addon-serialize';
import { applyXtermTheme, canRefocusTerminal, ensureBlinkClasses } from './terminalDomUtils';

interface UseTerminalLifecycleParams {
  containerRef: RefObject<HTMLDivElement | null>;
  sessionId: string | null;
  theme: string;
  termRef: MutableRefObject<Terminal | null>;
  fitRef: MutableRefObject<FitAddon | null>;
  serializeRef: MutableRefObject<SerializeAddon | null>;
  hasFocusedOnceRef: MutableRefObject<boolean>;
  unlistenRef: MutableRefObject<(() => void) | null>;
  /**
   * Invocado en el cleanup, ANTES de destruir el terminal, para intentar
   * capturar/guardar la sesión actual (ver useTerminalSessionCapture.captureCurrentSession).
   */
  onDispose: () => void | Promise<void>;
}

export function useTerminalLifecycle({
  containerRef,
  sessionId,
  theme,
  termRef,
  fitRef,
  serializeRef,
  hasFocusedOnceRef,
  unlistenRef,
  onDispose,
}: UseTerminalLifecycleParams): void {
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

      term.onWriteParsed(() => {
        try { term.scrollToBottom(); } catch {}
      });

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
          ensureBlinkClasses(containerRef);
        } catch {}
      });

      termRef.current = term;
      fitRef.current = fit;
      serializeRef.current = serialize;
      try { applyXtermTheme(termRef, containerRef); } catch {}
      try { requestAnimationFrame(() => applyXtermTheme(termRef, containerRef)); } catch {}

      // Suscribirse al renderizado para asegurar que el cursor siempre tenga la clase blink
      if ((term as any).onRender) {
        (term as any).onRender(() => ensureBlinkClasses(containerRef));
      }

      try {
        container.addEventListener('mousedown', () => {
          if (termRef.current && canRefocusTerminal(containerRef)) {
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
        try { applyXtermTheme(termRef, containerRef); } catch {}
      }
    });
    try { mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch {}

    return () => {
      // Fire-and-forget, igual que en el hook monolítico original: no se espera
      // (`await`) ni se captura el error acá — `onDispose` (captureCurrentSession)
      // maneja su propio estado de error internamente.
      onDispose();

      try {
        const bi = (term as any)._blinkInterval;
        if (bi) window.clearInterval(bi);
      } catch {}

      try { term.dispose(); } catch {}
      if (unlistenRef.current) { try { unlistenRef.current(); } catch {} }
    };
  }, [containerRef, sessionId]);

  useEffect(() => {
    applyXtermTheme(termRef, containerRef);
    try { requestAnimationFrame(() => applyXtermTheme(termRef, containerRef)); } catch {}
  }, [theme]);
}
