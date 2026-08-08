/**
 * terminalDomUtils.ts — utilidades DOM puras compartidas por los sub-hooks de terminal.
 *
 * Extraídas 1:1 desde el useTerminal.ts monolítico (sin cambios de comportamiento).
 * No son hooks: son funciones que reciben los refs relevantes como parámetro,
 * para poder reutilizarse desde useTerminalLifecycle, useTerminalResize y
 * useTerminalSshListener sin duplicar lógica ni depender de closures locales.
 */
import { MutableRefObject, RefObject } from 'react';
import { Terminal } from 'xterm';

/** Sanitiza un sessionId para usarlo como sufijo del canal de evento `ssh_out_<safe>`. */
export const sanitizeSessionId = (id: string) => (id || '').replace(/[^a-zA-Z0-9_:\-\/]/g, '_');

/**
 * Determina si es seguro re-enfocar el terminal sin robarle el foco a otro
 * control (ej. el input del chat) que el usuario esté usando activamente.
 */
export function canRefocusTerminal(containerRef: RefObject<HTMLDivElement | null>): boolean {
  const active = (document.activeElement as HTMLElement | null);
  if (!active) return true;
  if (containerRef.current && active && containerRef.current.contains(active)) return true;
  if (active.closest && (active.closest('.chat-pane') || active.closest('.chat-input'))) return false;
  const tag = active.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return false;
  if (active.getAttribute && active.getAttribute('contenteditable') === 'true') return false;
  return true;
}

/** Verifica que el panel del terminal esté realmente visible en el DOM (no oculto/colapsado). */
export function isPaneVisible(containerRef: RefObject<HTMLDivElement | null>): boolean {
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
}

/**
 * Aplica el tema actual (variables CSS del documento) al terminal xterm,
 * resolviendo referencias `var(--x)` en cadena, y fuerza el parpadeo/estilo del cursor.
 */
export function applyXtermTheme(
  termRef: MutableRefObject<Terminal | null>,
  containerRef: RefObject<HTMLDivElement | null>,
): void {
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

  try { term.refresh(0, term.rows - 1); } catch {}
}
