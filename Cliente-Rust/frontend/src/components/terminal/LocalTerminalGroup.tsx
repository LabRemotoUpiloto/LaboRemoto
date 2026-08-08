import React, { useCallback, useEffect, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { SplitSquareHorizontal, SplitSquareVertical, X } from 'lucide-react';
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

/**
 * Layout de splits estilo Herdr/tmux para la terminal local: un árbol
 * recursivo de paneles (`SplitNode`) renderizado con `react-resizable-panels`.
 * Cada leaf es un panel PTY independiente en el backend — el árbol es
 * puramente un concern de layout de este componente.
 */
const LocalTerminalGroup: React.FC<Props> = ({ tabId, onEmptyGroup }) => {
  const [tree, setTree] = useState<SplitNode>(() => ({ type: 'leaf', id: crypto.randomUUID() }));
  const setLocalTerminalPanes = useAppStore(s => s.setLocalTerminalPanes);
  const clearLocalTerminalPanes = useAppStore(s => s.clearLocalTerminalPanes);

  useEffect(() => {
    setLocalTerminalPanes(tabId, collectLeafIds(tree));
  }, [tree, tabId, setLocalTerminalPanes]);

  useEffect(() => () => { clearLocalTerminalPanes(tabId); }, [tabId, clearLocalTerminalPanes]);

  const splitPane = useCallback((leafId: string, direction: 'horizontal' | 'vertical') => {
    setTree(prev => replaceLeaf(prev, leafId, {
      type: 'split',
      id: crypto.randomUUID(),
      direction,
      children: [{ type: 'leaf', id: leafId }, { type: 'leaf', id: crypto.randomUUID() }],
    }));
  }, []);

  const closePane = useCallback((leafId: string) => {
    localTermClose(leafId).catch(() => {});
    setTree(prev => {
      const next = removeLeaf(prev, leafId);
      if (next === null) {
        onEmptyGroup();
        return prev;
      }
      return next;
    });
  }, [onEmptyGroup]);

  const renderNode = (node: SplitNode): React.ReactNode => {
    if (node.type === 'leaf') {
      return (
        <div className="local-terminal-leaf">
          <div className="local-terminal-leaf-toolbar">
            <button type="button" title="Dividir a la derecha" onClick={() => splitPane(node.id, 'horizontal')}>
              <SplitSquareHorizontal size={14} />
            </button>
            <button type="button" title="Dividir abajo" onClick={() => splitPane(node.id, 'vertical')}>
              <SplitSquareVertical size={14} />
            </button>
            <button type="button" title="Cerrar panel" onClick={() => closePane(node.id)}>
              <X size={14} />
            </button>
          </div>
          <div className="local-terminal-leaf-body">
            <LocalTerminalPane paneId={node.id} />
          </div>
        </div>
      );
    }

    return (
      <Group orientation={node.direction} className="local-terminal-split-group">
        {node.children.map((child, idx) => (
          <React.Fragment key={child.id}>
            {idx > 0 && <Separator className="local-terminal-separator" />}
            <Panel id={child.id} minSize={10} className="local-terminal-panel">
              {renderNode(child)}
            </Panel>
          </React.Fragment>
        ))}
      </Group>
    );
  };

  return <div className="local-terminal-group">{renderNode(tree)}</div>;
};

export default LocalTerminalGroup;
