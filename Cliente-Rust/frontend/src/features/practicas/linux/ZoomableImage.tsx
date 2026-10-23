// components/practicas/linux/ZoomableImage.tsx
//
// Imagen con zoom real (no solo "ajustar a pantalla") -- rueda del mouse para
// acercar/alejar, arrastrar para desplazarse una vez con zoom, doble click
// para alternar entre 1x y 2.2x. Pensado para imágenes densas donde "ajustar
// a pantalla" no alcanza para leer el detalle (ej. la chuleta de comandos).
import React, { useCallback, useRef, useState } from 'react';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.4;

interface ZoomableImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}

export const ZoomableImage: React.FC<ZoomableImageProps> = ({ src, alt, className, style }) => {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const clamp = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setScale((prev) => {
      const next = clamp(prev + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
      if (next <= MIN_SCALE) setPos({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((prev) => {
      const next = prev > MIN_SCALE ? MIN_SCALE : 2.2;
      if (next <= MIN_SCALE) setPos({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= MIN_SCALE) return;
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    setDragging(true);
  }, [scale, pos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    setPos({ x: d.origX + (e.clientX - d.startX), y: d.origY + (e.clientY - d.startY) });
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  return (
    <div
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      className={className}
      style={{
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: scale > MIN_SCALE ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
        ...style,
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
          transition: dragging ? 'none' : 'transform 0.08s ease-out',
          userSelect: 'none',
        }}
      />
    </div>
  );
};
