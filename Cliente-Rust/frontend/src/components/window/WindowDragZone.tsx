import React from 'react';
import { useSmartWindowDrag } from '../../hooks/useSmartWindowDrag';

type WindowDragZoneProps = {
  as?: React.ElementType;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
} & Record<string, unknown>;

/** Zona arrastrable de ventana (solo macOS con titleBar overlay). */
export const WindowDragZone: React.FC<WindowDragZoneProps> = ({
  as: Component = 'div',
  className,
  style,
  children,
  ...rest
}) => {
  const { dragRegionProps, isMacEnabled } = useSmartWindowDrag();

  return (
    <Component
      className={className}
      style={{
        ...style,
        ...(isMacEnabled ? { cursor: 'default', userSelect: 'none' } : undefined),
      }}
      {...rest}
      {...dragRegionProps}
    >
      {children}
    </Component>
  );
};
