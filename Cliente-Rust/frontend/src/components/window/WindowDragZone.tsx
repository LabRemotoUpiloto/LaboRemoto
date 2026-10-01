import React from 'react';
import { useSmartWindowDrag } from '../../hooks/useSmartWindowDrag';

// `React.ElementType` a secas (sin parámetro de props) colapsa a `never`
// para cualquier prop extra al usarse como tag de JSX (quirk conocido de
// React 19: el default `P = any` en la definición de ElementType hace que
// TS resuelva la rama mapeada como la unión de los NOMBRES de tag en vez de
// sus tipos) -- parametrizarlo con HTMLAttributes evita ese colapso.
type WindowDragZoneProps = {
  as?: React.ElementType<React.HTMLAttributes<HTMLElement>>;
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
