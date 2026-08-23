// components/raspberry/PtzControls.tsx
// Panel de control PTZ superpuesto sobre la vista expandida de una cámara.
// Arranca colapsado en un solo botón flotante (el pad completo tapaba buena
// parte del video permanentemente) -- clic para desplegar/ocultar.
//
// El comando en sí llega a la cámara casi instantáneo (~100ms), pero el
// video HLS tiene varios segundos de rezago en reflejarlo -- sin una señal
// inmediata el usuario no sabe si el clic "pegó". Por eso cada botón se
// resalta al presionarlo y hay un indicador de estado (Moviendo.../Enviado)
// que confirma que la orden salió, independiente de cuándo se vea en video.
import React, { useCallback, useRef, useState } from 'react'
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ArrowUpLeft, ArrowUpRight, ArrowDownLeft, ArrowDownRight, Plus, Minus, Move, X, Check } from 'lucide-react'
import type { PtzOp } from '../../hooks/usePtzControl'

interface Props {
  onCommand: (op: PtzOp) => void
}

const DIR_BUTTONS: { op: PtzOp; icon: React.ComponentType<{ size?: number }>; row: number; col: number }[] = [
  { op: 'LeftUp', icon: ArrowUpLeft, row: 1, col: 1 },
  { op: 'Up', icon: ArrowUp, row: 1, col: 2 },
  { op: 'RightUp', icon: ArrowUpRight, row: 1, col: 3 },
  { op: 'Left', icon: ArrowLeft, row: 2, col: 1 },
  { op: 'Right', icon: ArrowRight, row: 2, col: 3 },
  { op: 'LeftDown', icon: ArrowDownLeft, row: 3, col: 1 },
  { op: 'Down', icon: ArrowDown, row: 3, col: 2 },
  { op: 'RightDown', icon: ArrowDownRight, row: 3, col: 3 },
]

const toggleClass = 'flex items-center justify-center w-9 h-9 rounded-full bg-black/55 border border-white/10 text-white/80 hover:bg-black/75 hover:text-white active:scale-95 transition-all cursor-pointer select-none backdrop-blur-sm shadow-lg'

type Status = 'idle' | 'moving' | 'sent'

const PtzControls: React.FC<Props> = ({ onCommand }) => {
  const [expanded, setExpanded] = useState(false)
  const [pressedOp, setPressedOp] = useState<PtzOp | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const pressedRef = useRef(false)
  const sentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = useCallback((op: PtzOp) => (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    if (sentTimeoutRef.current) { clearTimeout(sentTimeoutRef.current); sentTimeoutRef.current = null }
    pressedRef.current = true
    setPressedOp(op)
    setStatus('moving')
    onCommand(op)
  }, [onCommand])

  const stop = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    if (!pressedRef.current) return
    pressedRef.current = false
    setPressedOp(null)
    onCommand('Stop')
    setStatus('sent')
    sentTimeoutRef.current = setTimeout(() => setStatus('idle'), 900)
  }, [onCommand])

  const dirButtonClass = (op: PtzOp) =>
    `flex items-center justify-center w-9 h-9 rounded-lg border transition-all cursor-pointer select-none ${
      pressedOp === op
        ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-black scale-95'
        : 'bg-white/10 border-white/10 text-white/85 hover:bg-white/20 hover:text-white active:scale-95'
    }`

  if (!expanded) {
    return (
      <div className="absolute bottom-3 left-3 z-[6]" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <button className={toggleClass} onClick={() => setExpanded(true)} title="Mostrar controles PTZ">
          <Move size={16} />
        </button>
      </div>
    )
  }

  return (
    <div
      className="absolute bottom-3 left-3 z-[6] rounded-xl bg-black/55 backdrop-blur-md border border-white/10 shadow-xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* Header: título + estado (confirma que la orden salió, sin esperar al video) */}
      <div className="flex items-center justify-between gap-3 px-2.5 py-1.5 border-b border-white/10">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
          <Move size={11} />
          PTZ
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          {status === 'moving' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse" />
              <span className="text-[var(--accent-primary)] font-medium">Moviendo…</span>
            </>
          )}
          {status === 'sent' && (
            <>
              <Check size={11} className="text-[#4ade80]" />
              <span className="text-[#4ade80] font-medium">Enviado</span>
            </>
          )}
          {status === 'idle' && (
            <span className="text-white/40">Mantén para mover</span>
          )}
        </div>
        <button
          className="flex items-center justify-center w-5 h-5 rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          onClick={() => setExpanded(false)}
          title="Ocultar controles"
        >
          <X size={12} />
        </button>
      </div>

      <div className="flex items-stretch gap-2.5 p-2.5">
        <div className="grid grid-cols-3 grid-rows-3 gap-1">
          {DIR_BUTTONS.map(({ op, icon: Icon, row, col }) => (
            <button
              key={op}
              className={dirButtonClass(op)}
              style={{ gridRow: row, gridColumn: col }}
              onMouseDown={start(op)}
              onMouseUp={stop}
              onMouseLeave={stop}
              onTouchStart={start(op)}
              onTouchEnd={stop}
              title={op}
            >
              <Icon size={15} />
            </button>
          ))}
          <div
            className="flex items-center justify-center"
            style={{ gridRow: 2, gridColumn: 2 }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white/15" />
          </div>
        </div>

        <div className="w-px bg-white/10" />

        <div className="flex flex-col gap-1 justify-center">
          <button
            className={dirButtonClass('ZoomInc')}
            onMouseDown={start('ZoomInc')}
            onMouseUp={stop}
            onMouseLeave={stop}
            onTouchStart={start('ZoomInc')}
            onTouchEnd={stop}
            title="Zoom +"
          >
            <Plus size={15} />
          </button>
          <span className="text-center text-[8px] uppercase tracking-wide text-white/35">Zoom</span>
          <button
            className={dirButtonClass('ZoomDec')}
            onMouseDown={start('ZoomDec')}
            onMouseUp={stop}
            onMouseLeave={stop}
            onTouchStart={start('ZoomDec')}
            onTouchEnd={stop}
            title="Zoom -"
          >
            <Minus size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default PtzControls
