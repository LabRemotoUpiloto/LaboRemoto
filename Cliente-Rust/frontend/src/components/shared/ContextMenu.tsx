import React, { useEffect, useRef } from 'react'

export type MenuItem = {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}

type Props = {
  x: number
  y: number
  open: boolean
  items: MenuItem[]
  onClose: () => void
}

const ContextMenu: React.FC<Props> = ({ x, y, open, items, onClose }) => {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
  const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return onClose()
      if (!ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div ref={ref} style={{ position: 'fixed', left: x, top: y, zIndex: 10000 }} className="ctx-menu" onContextMenu={(e)=> e.preventDefault()}>
      <ul className="ctx-list">
        {items.map((it, i) => (
          <li key={i} className={"ctx-item" + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : '')}
            onClick={() => { if (!it.disabled) { it.onClick(); onClose() } }}>
            {it.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default ContextMenu
