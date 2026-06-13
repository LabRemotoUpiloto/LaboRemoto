import React from 'react';
import { isMacOS } from '../../utils/platform';
import { WindowDragZone } from './WindowDragZone';

type MacWindowDragStripProps = {
  /** fixed = franja global sobre el área de contenido; absolute = dentro de un panel (chat, etc.) */
  variant?: 'fixed' | 'absolute';
  className?: string;
};

/**
 * Franja superior invisible para arrastrar la ventana en macOS (titleBar overlay).
 * No muestra UI; los clics en botones debajo siguen funcionando (arrastre con umbral).
 */
export const MacWindowDragStrip: React.FC<MacWindowDragStripProps> = ({
  variant = 'fixed',
  className = '',
}) => {
  if (!isMacOS()) return null;

  const baseClass = variant === 'fixed' ? 'mac-window-drag-strip' : 'mac-window-drag-strip--local';

  return (
    <WindowDragZone
      className={`${baseClass} ${className}`.trim()}
      aria-hidden
    />
  );
};
