import React, { useCallback, useEffect, useRef, useState } from 'react'

/**
 * usePointerDrag
 *
 * Drag & drop interno por puntero entre los paneles local/remoto del
 * explorador SFTP. Reemplaza el drag & drop HTML5 nativo del navegador
 * (roto en este proyecto porque Tauri necesita `dragDropEnabled` para el
 * drop nativo de archivos de Windows — ver onDragDropEvent en SftpPage).
 *
 * Uso: cada fila ya seleccionada llama a `startPress(side, count, event)` en
 * su `onMouseDown`. A partir de ahí este hook escucha mousemove/mouseup a
 * nivel de window:
 *  - Si el puntero se mueve más de PRESS_THRESHOLD_PX antes del mouseup,
 *    se considera un arrastre: se activa `dragging`, se actualiza la
 *    posición del "ghost" visual y se resalta el panel opuesto si el
 *    puntero está sobre él.
 *  - Si el mouseup ocurre sobre el panel opuesto válido, se invoca el
 *    callback de drop correspondiente (upload o download).
 *  - Si nunca se supera el umbral, no se hace nada: el click nativo de la
 *    fila sigue disparando la selección normal.
 *  - Escape cancela el arrastre en curso.
 */

const PRESS_THRESHOLD_PX = 4

export type DragSide = 'local' | 'remote'

export interface PointerDragState {
  side: DragSide
  count: number
}

export interface UsePointerDragOptions {
  localPanelRef: React.RefObject<HTMLElement | null>
  remotePanelRef: React.RefObject<HTMLElement | null>
  onDropOnLocal: () => void
  onDropOnRemote: () => void
}

export interface UsePointerDragResult {
  /** Información del arrastre en curso (o null si no hay ninguno). */
  dragging: PointerDragState | null
  /** Posición actual del puntero en coordenadas de viewport (para el ghost). */
  ghostPos: { x: number; y: number }
  /** Lado (local/remote) sobre el que se está pasando el arrastre, si es válido. */
  hoverSide: DragSide | null
  /** Debe llamarse desde el onMouseDown de una fila ya seleccionada. */
  startPress: (side: DragSide, count: number, e: React.MouseEvent) => void
  /**
   * Consume (y resetea) el flag de "se acaba de soltar un arrastre". Debe
   * llamarse al inicio del onClick de una fila para evitar que el click
   * nativo posterior a un arrastre altere la selección.
   */
  consumeSuppressedClick: () => boolean
}

function isInsideRect(x: number, y: number, el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

export function usePointerDrag(options: UsePointerDragOptions): UsePointerDragResult {
  const { localPanelRef, remotePanelRef, onDropOnLocal, onDropOnRemote } = options

  const [dragging, setDragging] = useState<PointerDragState | null>(null)
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 })
  const [hoverSide, setHoverSide] = useState<DragSide | null>(null)

  const pressRef = useRef<{
    side: DragSide
    count: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)

  const startPress = useCallback((side: DragSide, count: number, e: React.MouseEvent) => {
    if (e.button !== 0) return
    pressRef.current = { side, count, startX: e.clientX, startY: e.clientY, moved: false }
  }, [])

  const consumeSuppressedClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return true
    }
    return false
  }, [])

  useEffect(() => {
    const targetRefFor = (side: DragSide) => (side === 'local' ? remotePanelRef : localPanelRef)

    const cancel = () => {
      pressRef.current = null
      setDragging(null)
      setHoverSide(null)
    }

    const onMove = (e: MouseEvent) => {
      const st = pressRef.current
      if (!st) return
      const dx = e.clientX - st.startX
      const dy = e.clientY - st.startY
      if (!st.moved) {
        if (Math.hypot(dx, dy) < PRESS_THRESHOLD_PX) return
        st.moved = true
        setDragging({ side: st.side, count: st.count })
      }
      setGhostPos({ x: e.clientX, y: e.clientY })
      const el = targetRefFor(st.side).current
      if (el && isInsideRect(e.clientX, e.clientY, el)) {
        setHoverSide(st.side === 'local' ? 'remote' : 'local')
      } else {
        setHoverSide(null)
      }
    }

    const onUp = (e: MouseEvent) => {
      const st = pressRef.current
      if (st && st.moved) {
        suppressClickRef.current = true
        const el = targetRefFor(st.side).current
        if (el && isInsideRect(e.clientX, e.clientY, el)) {
          if (st.side === 'local') onDropOnRemote()
          else onDropOnLocal()
        }
      }
      pressRef.current = null
      setDragging(null)
      setHoverSide(null)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pressRef.current) cancel()
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [localPanelRef, remotePanelRef, onDropOnLocal, onDropOnRemote])

  return { dragging, ghostPos, hoverSide, startPress, consumeSuppressedClick }
}
