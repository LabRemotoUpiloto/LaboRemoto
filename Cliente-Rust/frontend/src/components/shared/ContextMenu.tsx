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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: x, top: y, zIndex: 10000 }}
      className="ctx-menu"
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      <ul className="ctx-list">
        {items.map((it, i) => {
          // Separador entre grupos de acciones: cuando cambia el carácter
          // "peligroso" respecto al ítem anterior.
          const prev = items[i - 1]
          const showSeparator = i > 0 && !!prev && prev.danger !== it.danger

          return (
            <React.Fragment key={i}>
              {showSeparator && <li className="ctx-separator" role="separator" />}
              <li
                className={
                  'ctx-item' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : '')
                }
                role="menuitem"
                aria-disabled={it.disabled || undefined}
                onClick={() => {
                  if (!it.disabled) {
                    it.onClick()
                    onClose()
                  }
                }}
              >
                {it.label}
              </li>
            </React.Fragment>
          )
        })}
      </ul>
    </div>
  )
}

ContextMenu.displayName = 'ContextMenu'

export default React.memo(ContextMenu)
