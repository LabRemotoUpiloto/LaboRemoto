import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Group, Panel, Separator } from 'react-resizable-panels';
import {
  ClipboardPaste,
  Copy,
  Eraser,
  Plus,
  SplitSquareHorizontal,
  SplitSquareVertical,
  X,
} from 'lucide-react';
import LocalTerminalPane from './LocalTerminalPane';
import './LocalTerminalGroup.css';
import { localTermClose } from '../../services/localTerminal.service';
import { useAppStore } from '../../store/app';

type SplitNode =
  | { type: 'leaf'; id: string }
  | { type: 'split'; id: string; direction: 'horizontal' | 'vertical'; children: SplitNode[] };

function collectLeafIds(node: SplitNode): string[] {
  if (node.type === 'leaf') return [node.id];
  return node.children.flatMap(collectLeafIds);
}

function replaceLeaf(node: SplitNode, leafId: string, replacement: SplitNode): SplitNode {
  if (node.type === 'leaf') {
    return node.id === leafId ? replacement : node;
  }
  return { ...node, children: node.children.map(c => replaceLeaf(c, leafId, replacement)) };
}

/** Quita un leaf del árbol; colapsa splits que quedan con 1 solo hijo. `null` si el árbol queda vacío. */
function removeLeaf(node: SplitNode, leafId: string): SplitNode | null {
  if (node.type === 'leaf') {
    return node.id === leafId ? null : node;
  }
  const nextChildren = node.children
    .map(c => removeLeaf(c, leafId))
    .filter((c): c is SplitNode => c !== null);
  if (nextChildren.length === 0) return null;
  if (nextChildren.length === 1) return nextChildren[0];
  return { ...node, children: nextChildren };
}

type Props = {
  tabId: string;
  /** Se dispara cuando se cierra el último panel del grupo — el caller debe cerrar el tab completo. */
  onEmptyGroup: () => void;
};

type ContextMenuState = { x: number; y: number; paneId: string } | null;

/** Despacha una acción de terminal (copy/paste/clear) al pane correspondiente
 *  — el handler vive en useTerminalLocalListener, que tiene el termRef. */
function dispatchPaneAction(action: 'copy' | 'paste' | 'clear', paneId: string) {
  window.dispatchEvent(new CustomEvent(`local-term:${action}`, { detail: { paneId } }));
}

/**
 * Layout de splits estilo Herdr/tmux para la terminal local: un árbol
 * recursivo de paneles (`SplitNode`) renderizado con `react-resizable-panels`
 * (v4). Cada leaf es un panel PTY independiente en el backend — el árbol es
 * puramente un concern de layout de este componente.
 *
 * ## Montaje estable de los panes (hosts + portals)
 * Al dividir, el leaf existente cambia de posición estructural en el JSX
 * (leaf → Group>Panel>leaf): si los `LocalTerminalPane` se renderizaran
 * inline, React los desmontaría y remontaría, matando y reiniciando la shell
 * del usuario en cada split. Para evitarlo, cada pane vive en un `<div>`
 * host creado imperativamente UNA sola vez (nunca cambia de identidad) y se
 * renderiza vía `createPortal(pane, host)` desde una lista keyed estable al
 * nivel raíz. El árbol de splits solo APPENDEA el host dentro del leaf que
 * corresponda — al re-estructurar, el DOM del terminal se mueve, jamás se
 * recrea, y la shell sigue viva con todo su estado.
 *
 * Interacción: mouse (menú contextual con click derecho) y teclado
 * (Ctrl+Shift+D dividir derecha, Ctrl+Shift+S dividir abajo, Ctrl+Shift+W
 * cerrar panel, Ctrl+Shift+C/V copiar/pegar) — "keyboard and mouse
 * first-class", como Herdr.
 */
const LocalTerminalGroup: React.FC<Props> = ({ tabId, onEmptyGroup }) => {
  const [tree, setTree] = useState<SplitNode>(() => ({ type: 'leaf', id: crypto.randomUUID() }));
  const [activePaneId, setActivePaneId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const setLocalTerminalPanes = useAppStore(s => s.setLocalTerminalPanes);
  const clearLocalTerminalPanes = useAppStore(s => s.clearLocalTerminalPanes);

  // Hosts DOM estables por pane (ver doc-comment del componente).
  //
  // OJO: los eventos dentro de un portal burbujean por el árbol de REACT
  // (los panes son hijos del root del grupo, no del leaf), así que los
  // onMouseDown/onContextMenu del leaf NUNCA ven clicks hechos dentro del
  // terminal. Por eso el click derecho (menú contextual) y la activación
  // del panel se cablean como listeners NATIVOS del host, una sola vez al
  // crearlo — viven exactamente lo que vive el pane.
  const paneHostsRef = useRef(new Map<string, HTMLDivElement>());
  const getPaneHost = useCallback((id: string): HTMLDivElement => {
    let el = paneHostsRef.current.get(id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'local-terminal-pane-host';
      paneHostsRef.current.set(id, el);
    }
    // Cableado idempotente (flag en el propio nodo): cubre también hosts que
    // hayan quedado vivos de un render anterior (ej. HMR de Vite preserva el
    // ref con hosts creados por código viejo sin listeners).
    if (!el.dataset.wired) {
      el.dataset.wired = '1';
      el.addEventListener('mousedown', () => setActivePaneId(id));
      // Captura: se intercepta antes de que el textarea de xterm pueda
      // disparar el menú de edición nativo del webview (Emoji/Pegar/etc.).
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setActivePaneId(id);
        setContextMenu({ x: e.clientX, y: e.clientY, paneId: id });
      }, true);
    }
    return el;
  }, []);

  useEffect(() => {
    const leaves = collectLeafIds(tree);
    setLocalTerminalPanes(tabId, leaves);
    if (leaves.length > 0 && (!activePaneId || !leaves.includes(activePaneId))) {
      setActivePaneId(leaves[0]);
    }
  }, [tree, tabId, setLocalTerminalPanes, activePaneId]);

  useEffect(() => () => { clearLocalTerminalPanes(tabId); }, [tabId, clearLocalTerminalPanes]);

  const splitPane = useCallback((leafId: string, direction: 'horizontal' | 'vertical') => {
    const newId = crypto.randomUUID();
    setTree(prev => replaceLeaf(prev, leafId, {
      type: 'split',
      id: crypto.randomUUID(),
      direction,
      children: [{ type: 'leaf', id: leafId }, { type: 'leaf', id: newId }],
    }));
    setActivePaneId(newId);
  }, []);

  const closePane = useCallback((leafId: string) => {
    localTermClose(leafId).catch(() => {});
    paneHostsRef.current.delete(leafId);
    setTree(prev => {
      const next = removeLeaf(prev, leafId);
      if (next === null) {
        onEmptyGroup();
        return prev;
      }
      return next;
    });
  }, [onEmptyGroup]);

  const openNewTerminalTab = useCallback(() => {
    window.dispatchEvent(new CustomEvent('app:open-local-terminal'));
  }, []);

  // ── Menú contextual ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [contextMenu]);

  const menuAction = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setContextMenu(null);
    fn();
  };

  // ── Atajos de teclado (capture: se interceptan antes de que xterm los vea) ─
  const onKeyDownCapture = useCallback((e: React.KeyboardEvent) => {
    if (!(e.ctrlKey && e.shiftKey) || !activePaneId) return;
    const key = e.key.toLowerCase();
    const handled = () => { e.preventDefault(); e.stopPropagation(); };
    switch (key) {
      case 'd': handled(); splitPane(activePaneId, 'horizontal'); break;
      case 's': handled(); splitPane(activePaneId, 'vertical'); break;
      case 'w': handled(); closePane(activePaneId); break;
      case 'c': handled(); dispatchPaneAction('copy', activePaneId); break;
      case 'v': handled(); dispatchPaneAction('paste', activePaneId); break;
      default: break;
    }
  }, [activePaneId, splitPane, closePane]);

  const renderNode = (node: SplitNode): React.ReactNode => {
    if (node.type === 'leaf') {
      const isActive = node.id === activePaneId;
      return (
        <div
          className={`local-terminal-leaf ${isActive ? 'is-active' : ''}`}
          onMouseDown={() => setActivePaneId(node.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setActivePaneId(node.id);
            setContextMenu({ x: e.clientX, y: e.clientY, paneId: node.id });
          }}
        >
          <div
            className="local-terminal-leaf-body"
            ref={(el) => {
              // Adopta el host estable de este pane. `appendChild` MUEVE el
              // subtree (misma identidad de nodos): xterm y sus observers
              // sobreviven intactos a cualquier re-estructuración del árbol.
              if (el) {
                const host = getPaneHost(node.id);
                if (host.parentElement !== el) el.appendChild(host);
              }
            }}
          />
        </div>
      );
    }

    return (
      <Group orientation={node.direction} className="local-terminal-split-group">
        {node.children.map((child, idx) => (
          <React.Fragment key={child.id}>
            {idx > 0 && <Separator className="local-terminal-separator" />}
            <Panel id={child.id} minSize={140} className="local-terminal-panel">
              {renderNode(child)}
            </Panel>
          </React.Fragment>
        ))}
      </Group>
    );
  };

  const leafIds = collectLeafIds(tree);
  const hasSplits = tree.type === 'split';

  return (
    <div
      className={`local-terminal-group${hasSplits ? ' has-splits' : ''}`}
      onKeyDownCapture={onKeyDownCapture}
    >
      {renderNode(tree)}
      {/* Panes reales: lista keyed estable → nunca se desmontan al re-
          estructurar el árbol de splits (solo su host se mueve de leaf). */}
      {leafIds.map(id =>
        createPortal(
          <LocalTerminalPane paneId={id} isActive={id === activePaneId} />,
          getPaneHost(id),
          id,
        ),
      )}
      {contextMenu && (
        <div
          className="local-terminal-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          role="menu"
        >
          <button type="button" role="menuitem" onClick={menuAction(() => splitPane(contextMenu.paneId, 'horizontal'))}>
            <SplitSquareHorizontal size={14} /> Dividir a la derecha
            <span className="ltcm-shortcut">Ctrl+Shift+D</span>
          </button>
          <button type="button" role="menuitem" onClick={menuAction(() => splitPane(contextMenu.paneId, 'vertical'))}>
            <SplitSquareVertical size={14} /> Dividir abajo
            <span className="ltcm-shortcut">Ctrl+Shift+S</span>
          </button>
          <button type="button" role="menuitem" onClick={menuAction(openNewTerminalTab)}>
            <Plus size={14} /> Nueva pestaña de terminal
          </button>
          <div className="ltcm-separator" />
          <button type="button" role="menuitem" onClick={menuAction(() => dispatchPaneAction('copy', contextMenu.paneId))}>
            <Copy size={14} /> Copiar
            <span className="ltcm-shortcut">Ctrl+Shift+C</span>
          </button>
          <button type="button" role="menuitem" onClick={menuAction(() => dispatchPaneAction('paste', contextMenu.paneId))}>
            <ClipboardPaste size={14} /> Pegar
            <span className="ltcm-shortcut">Ctrl+Shift+V</span>
          </button>
          <div className="ltcm-separator" />
          <button type="button" role="menuitem" onClick={menuAction(() => dispatchPaneAction('clear', contextMenu.paneId))}>
            <Eraser size={14} /> Limpiar pantalla
          </button>
          <button type="button" role="menuitem" className="ltcm-danger" onClick={menuAction(() => closePane(contextMenu.paneId))}>
            <X size={14} /> Cerrar panel
            <span className="ltcm-shortcut">Ctrl+Shift+W</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default LocalTerminalGroup;
