import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type MenuItem = {
  label: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  children?: MenuItem[]
}

type Props = {
  x: number
  y: number
  open: boolean
  items: MenuItem[]
  onClose: () => void
}

/**
 * Ítem de menú, con soporte opcional de submenú lateral (children).
 *
 * El submenú se renderiza vía portal a `document.body` con posición `fixed`
 * calculada a partir del `getBoundingClientRect()` del ítem: el contenedor
 * `.ctx-menu` tiene `overflow: hidden` (ver globals.css), por lo que un panel
 * hijo posicionado con `position: absolute` quedaría recortado/invisible.
 */
const ContextMenuItem: React.FC<{
  item: MenuItem
  showSeparator: boolean
  onRequestClose: () => void
}> = ({ item, showSeparator, onRequestClose }) => {
  const [submenuOpen, setSubmenuOpen] = useState(false)
  const [submenuPos, setSubmenuPos] = useState<{ top: number; left: number } | null>(null)
  const itemRef = useRef<HTMLLIElement | null>(null)
  const hasChildren = !!item.children && item.children.length > 0

  const openSubmenu = () => {
    if (!hasChildren || item.disabled) return
    const rect = itemRef.current?.getBoundingClientRect()
    if (rect) {
      setSubmenuPos({ top: rect.top - 4, left: rect.right + 2 })
    }
    setSubmenuOpen(true)
  }

  const closeSubmenu = () => setSubmenuOpen(false)

  // Calcula (y reajusta si se saldría de la ventana) la posición del submenú
  // cada vez que se abre, a partir del rect real del ítem.
  useLayoutEffect(() => {
    if (!submenuOpen) return
    const rect = itemRef.current?.getBoundingClientRect()
    if (!rect) return
    const approxMenuWidth = 220
    const wouldOverflowRight = rect.right + 2 + approxMenuWidth > window.innerWidth
    setSubmenuPos({
      top: rect.top - 4,
      left: wouldOverflowRight ? Math.max(4, rect.left - approxMenuWidth - 2) : rect.right + 2,
    })
  }, [submenuOpen])

  const handleActivate = () => {
    if (item.disabled) return
    if (hasChildren) {
      if (submenuOpen) closeSubmenu()
      else openSubmenu()
      return
    }
    item.onClick?.()
    onRequestClose()
  }

  return (
    <React.Fragment>
      {showSeparator && <li className="ctx-separator" role="separator" />}
      <li
        ref={itemRef}
        className={
          'ctx-item' +
          (item.danger ? ' danger' : '') +
          (item.disabled ? ' disabled' : '') +
          (hasChildren ? ' has-submenu' : '')
        }
        role="menuitem"
        aria-disabled={item.disabled || undefined}
        aria-haspopup={hasChildren || undefined}
        aria-expanded={hasChildren ? submenuOpen : undefined}
        onMouseEnter={openSubmenu}
        onMouseLeave={closeSubmenu}
        onClick={handleActivate}
        onKeyDown={(e) => {
          if (item.disabled) return
          if (hasChildren && e.key === 'ArrowRight') {
            e.preventDefault()
            openSubmenu()
          } else if (hasChildren && e.key === 'ArrowLeft') {
            e.preventDefault()
            closeSubmenu()
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleActivate()
          }
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {item.label}
          {hasChildren && <span aria-hidden="true" style={{ opacity: 0.6, fontSize: 11 }}>▶</span>}
        </span>
      </li>
      {hasChildren &&
        submenuOpen &&
        submenuPos &&
        createPortal(
          <div
            className="ctx-menu ctx-submenu"
            role="menu"
            style={{
              position: 'fixed',
              top: submenuPos.top,
              left: submenuPos.left,
              zIndex: 10001,
            }}
            onMouseEnter={openSubmenu}
            onMouseLeave={closeSubmenu}
            onClick={(e) => e.stopPropagation()}
          >
            <ul className="ctx-list">
              {item.children!.map((child, i) => {
                const prevChild = item.children![i - 1]
                const childSeparator = i > 0 && !!prevChild && prevChild.danger !== child.danger
                return (
                  <ContextMenuItem
                    key={i}
                    item={child}
                    showSeparator={childSeparator}
                    onRequestClose={onRequestClose}
                  />
                )
              })}
            </ul>
          </div>,
          document.body
        )}
    </React.Fragment>
  )
}

const ContextMenu: React.FC<Props> = ({ x, y, open, items, onClose }) => {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      // Los submenús se renderizan vía portal fuera de `ref` (hijos directos
      // de document.body), así que la detección de "click afuera" debe
      // reconocer cualquier elemento con clase `ctx-menu` (menú raíz o
      // submenús), no solo el contenedor principal.
      if (target?.closest?.('.ctx-menu')) return
      onClose()
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
            <ContextMenuItem key={i} item={it} showSeparator={showSeparator} onRequestClose={onClose} />
          )
        })}
      </ul>
    </div>
  )
}

ContextMenu.displayName = 'ContextMenu'

export default React.memo(ContextMenu)
