import React from 'react'
import './Sidebar.css'
import { getVersion } from '@tauri-apps/api/app'
import HamburgerIcon from '../icons/HamburgerIcon'
import { 
  MonitorIcon, 
  CompassIcon, 
  PaletteIcon, 
  FolderIcon, 
  CodeIcon, 
  PinIcon, 
  CameraIcon,
  HomeIcon
} from '../icons/SidebarIcons'

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
  { id: 'landing', label: 'Inicio', icon: HomeIcon },
  { id: 'connect', label: 'Connect', icon: MonitorIcon },
  { id: 'hosts', label: 'Hosts', icon: CompassIcon },
  { id: 'themes', label: 'Temas', icon: PaletteIcon },
  { id: 'sftp', label: 'SFTP', icon: FolderIcon },
  { id: 'snippets', label: 'Snippets', icon: CodeIcon },
]

// Items especiales que se controlan por separado (no cambian de página)
const specialItems = [
  { id: 'pins', label: 'Pines', icon: PinIcon },
  { id: 'camera', label: 'Cámara', icon: CameraIcon },
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

  // Filtrar items especiales basado en la sesión activa
  const getFilteredSpecialItems = () => {
    // Mostrar pines y cámara solo si hay una sesión activa que contenga la IP específica
    const shouldShowRaspberryFeatures = activeSessionId && activeSessionId.includes('200.115.181.211')
    
    return shouldShowRaspberryFeatures ? specialItems : []
  }
  
  React.useEffect(() => { getVersion().then(setAppVersion).catch(() => setAppVersion('')) }, [])

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
      {/* Botón toggle hamburguesa */}
      <div className="sidebar-toggle-wrapper">
        <HamburgerIcon 
          isOpen={isOpen} 
          onClick={toggleSidebar}
        />
      </div>
      
      <nav className="sidebar-nav">
        {items.map(it => {
          const IconComponent = it.icon
          return (
            <button
              key={it.id}
              data-page={it.id}
              className={`nav-item ${selectedPage === it.id ? 'active' : ''}`}
              aria-current={selectedPage === it.id ? 'page' : undefined}
              onClick={() => onSelectPage(it.id)}
              title={it.label}
            >
              <span className="nav-pill">
                <span className="icon"><IconComponent size={17} /></span>
                <span className="label">{it.label}</span>
              </span>
            </button>
          )
        })}
        {getFilteredSpecialItems().map(it => {
          const IconComponent = it.icon
          return (
            <button
              key={it.id}
              data-page={it.id}
              className={`nav-item ${isSpecialItemActive(it.id) ? 'active' : ''}`}
              aria-current={isSpecialItemActive(it.id) ? 'page' : undefined}
              onClick={() => handleSpecialItemClick(it.id)}
              title={it.label}
            >
              <span className="nav-pill">
                <span className="icon"><IconComponent size={17} /></span>
                <span className="label">{it.label}</span>
              </span>
            </button>
          )
        })}
      </nav>
      <div className="sidebar-footer">
        <span className={`version-badge ${isOpen ? '' : 'compact'}`}>
          {appVersion && (isOpen ? `v${appVersion}` : appVersion.split('.')[0])}
        </span>
      </div>
    </aside>
  )
}

export default Sidebar
