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
import { useEffect, useRef, MutableRefObject, RefObject } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SerializeAddon } from '@xterm/addon-serialize';
import { applyXtermTheme, canRefocusTerminal } from './terminalDomUtils';

interface UseTerminalLifecycleParams {
  containerRef: RefObject<HTMLDivElement | null>;
  sessionId: string | null;
  theme: string;
  termRef: MutableRefObject<Terminal | null>;
  fitRef: MutableRefObject<FitAddon | null>;
  serializeRef: MutableRefObject<SerializeAddon | null>;
  hasFocusedOnceRef: MutableRefObject<boolean>;
  unlistenRef: MutableRefObject<(() => void) | null>;
  isActive?: boolean;
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
  isActive = true,
  onDispose,
}: UseTerminalLifecycleParams): void {
  const isActiveRef = useRef<boolean>(isActive);
  isActiveRef.current = isActive;
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
      term.open(container);
      try { fit.fit(); } catch {}

      term.onWriteParsed(() => {
        try { term.scrollToBottom(); } catch {}
      });

      // Hacer visible el cursor con secuencia ANSI
      term.write('\x1b[?25h');

      termRef.current = term;
      fitRef.current = fit;
      serializeRef.current = serialize;
      try { applyXtermTheme(termRef, containerRef); } catch {}
      try { requestAnimationFrame(() => applyXtermTheme(termRef, containerRef)); } catch {}

      // Enfocar si es el panel activo
      requestAnimationFrame(() => {
        try {
          if (isActiveRef.current) {
            term.focus();
            hasFocusedOnceRef.current = true;
          }
        } catch {}
      });

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

    // Esperar a que el contenedor tenga tamaño real antes de open(): un panel
    // recién creado por un split puede medir 0×0 durante la animación de
    // layout. Con un solo reintento rAF la terminal podía no abrirse nunca
    // (panel en blanco); el ResizeObserver espera lo que haga falta.
    let sizeObserver: ResizeObserver | null = null;
    let initialized = false;
    const tryInitialize = (): boolean => {
      if (initialized) return true;
      const r = container.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        initialized = true;
        initializeTerminal();
        if (sizeObserver) { try { sizeObserver.disconnect(); } catch {} sizeObserver = null; }
        return true;
      }
      return false;
    };
    if (!tryInitialize() && window.ResizeObserver) {
      sizeObserver = new ResizeObserver(() => { tryInitialize(); });
      sizeObserver.observe(container);
    }

    const mo = new MutationObserver((recs) => {
      if (recs.some(r => r.type === 'attributes' && r.attributeName === 'data-theme')) {
        try { applyXtermTheme(termRef, containerRef); } catch {}
      }
    });
    try { mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch {}

    return () => {
      onDispose();

      if (sizeObserver) { try { sizeObserver.disconnect(); } catch {} }
      try { mo.disconnect(); } catch {}
      try { term.dispose(); } catch {}
      if (unlistenRef.current) { try { unlistenRef.current(); } catch {} }
    };
  }, [containerRef, sessionId]);

  useEffect(() => {
    applyXtermTheme(termRef, containerRef);
    try { requestAnimationFrame(() => applyXtermTheme(termRef, containerRef)); } catch {}
  }, [theme]);

  // Controlar foco entre paneles split — xterm maneja el cursor nativamente
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    if (isActive) {
      try { term.options.cursorBlink = true; } catch {}
      try { term.focus(); } catch {}
    } else {
      try { term.options.cursorBlink = false; } catch {}
      try { term.blur(); } catch {}
    }
  }, [isActive]);
}
