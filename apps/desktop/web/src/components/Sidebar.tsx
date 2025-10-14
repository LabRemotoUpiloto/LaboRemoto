import React from 'react'
import './Sidebar.css'
import { getVersion } from '@tauri-apps/api/app'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { useToasts } from '../contexts/ToastContext'

interface SidebarProps {
  isOpen: boolean
  toggleSidebar: () => void
  selectedPage: string
  onSelectPage: (page: string) => void
  activeSessionId?: string | null
  isCameraOpen?: boolean
  isPinsPanelOpen?: boolean
  onToggleCamera?: () => void
  onTogglePins?: () => void
}

const items = [
  { id: 'connect', label: 'Connect', icon: '🖥️' },
  // simple emoji icons for now; consider replacing with SVG react components later
  { id: 'hosts', label: 'Hosts', icon: '🧭' },
  { id: 'themes', label: 'Temas', icon: '🎨' },
  { id: 'sftp', label: 'SFTP', icon: '📂' },
  { id: 'snippets', label: 'Snippets', icon: '📎' },
]

// Items especiales que se controlan por separado (no cambian de página)
const specialItems = [
  { id: 'pins', label: 'Pines', icon: '📌' },
  { id: 'camera', label: 'Cámara', icon: '🎥' },
]

const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, 
  toggleSidebar, 
  selectedPage, 
  onSelectPage, 
  activeSessionId,
  isCameraOpen = false,
  isPinsPanelOpen = false,
  onToggleCamera,
  onTogglePins
}) => {
  const [appVersion, setAppVersion] = React.useState<string>('')
  const [checking, setChecking] = React.useState(false)
  const { push } = useToasts()

  // Filtrar items especiales basado en la sesión activa
  const getFilteredSpecialItems = () => {
    // Mostrar pines y cámara solo si hay una sesión activa que contenga la IP específica
    const shouldShowRaspberryFeatures = activeSessionId && activeSessionId.includes('200.115.181.211')
    
    return shouldShowRaspberryFeatures ? specialItems : []
  }
  React.useEffect(() => { getVersion().then(setAppVersion).catch(() => setAppVersion('')) }, [])

  const onCheckUpdate = async () => {
    try {
      setChecking(true)
      push({ type: 'info', message: 'Buscando actualización…' }, 2500)
      const update = await check()
      if (update) {
        push({ type: 'info', message: `Actualización ${update.version} disponible. Descargando…` }, 4000)
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              console.log(`Update download started: ${event.data.contentLength} bytes`)
              break
            case 'Progress':
              console.log(`Downloaded ${event.data.chunkLength} bytes chunk`)
              break
            case 'Finished':
              console.log('Update download finished')
              break
          }
        })
        push({ type: 'success', message: 'Actualización instalada. Reiniciando…' }, 3000)
        await relaunch()
      } else {
        console.log('No updates available')
        push({ type: 'info', message: 'No hay actualizaciones disponibles' }, 3500)
      }
    } catch (e) {
      console.error('Updater error', e)
      let detail = ''
      if (typeof e === 'string') detail = e
      else if (e && typeof (e as any).message === 'string') detail = (e as any).message
      else { try { detail = JSON.stringify(e) } catch { detail = String(e) } }
      const msg = detail ? `Error al buscar/instalar actualización: ${detail}` : 'Error al buscar/instalar actualización. Revisa tu conexión o inténtalo más tarde.'
      push({ type: 'error', message: msg }, 7000)
    } finally { setChecking(false) }
  }
  const handleSpecialItemClick = (itemId: string) => {
    if (itemId === 'pins' && onTogglePins) {
      onTogglePins()
    } else if (itemId === 'camera' && onToggleCamera) {
      onToggleCamera()
    }
  }

  const isSpecialItemActive = (itemId: string) => {
    if (itemId === 'pins') return isPinsPanelOpen
    if (itemId === 'camera') return isCameraOpen
    return false
  }

  return (
    <aside className={`sidebar ${isOpen ? 'open' : 'collapsed'}`} aria-label="Main navigation">
      <nav className="sidebar-nav">
        {items.map(it => (
          <button
            key={it.id}
            className={`nav-item ${selectedPage === it.id ? 'active' : ''}`}
            aria-current={selectedPage === it.id ? 'page' : undefined}
            onClick={() => onSelectPage(it.id)}
            title={it.label}
          >
            <span className="nav-pill">
              <span className="icon">{it.icon}</span>
              <span className="label">{it.label}</span>
            </span>
          </button>
        ))}
        {getFilteredSpecialItems().map(it => (
          <button
            key={it.id}
            className={`nav-item ${isSpecialItemActive(it.id) ? 'active' : ''}`}
            aria-current={isSpecialItemActive(it.id) ? 'page' : undefined}
            onClick={() => handleSpecialItemClick(it.id)}
            title={it.label}
          >
            <span className="nav-pill">
              <span className="icon">{it.icon}</span>
              <span className="label">{it.label}</span>
            </span>
          </button>
        ))}
        <button
          className="nav-item"
          onClick={onCheckUpdate}
          title="Buscar actualización"
          disabled={checking}
        >
          <span className="nav-pill">
            <span className="icon" aria-hidden>⟳</span>
            <span className="label">{checking ? 'Buscando…' : 'Buscar actualización'}</span>
          </span>
        </button>
      </nav>
      <div className="sidebar-footer">
        {isOpen && appVersion && <span className="version-badge">v{appVersion}</span>}
      </div>
    </aside>
  )
}

export default Sidebar
