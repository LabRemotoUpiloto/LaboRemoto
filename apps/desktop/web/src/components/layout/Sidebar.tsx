import React, { useRef, useEffect } from 'react'
import './Sidebar.css'
import { getVersion } from '@tauri-apps/api/app'
import { gsap } from 'gsap'
import { 
  MonitorIcon, 
  CompassIcon, 
  PaletteIcon, 
  FolderIcon, 
  CodeIcon, 
  PinIcon, 
  CameraIcon,
  HomeIcon,
  FileTextIcon,
  LabIcon,
  MoodleIcon
} from '../icons/SidebarIcons'

interface SidebarProps {
  activePanel: string | null
  onOpenPanel: (id: string) => void
  activeSessionId?: string | null
  selectedPage?: string | null
  isExpanded?: boolean
  onToggleExpand?: () => void
}

// Main nav items — each click opens a tab in H1
const items = [
  { id: 'landing', label: 'Inicio', icon: HomeIcon },
  { id: 'practices', label: 'Prácticas', icon: LabIcon },
  { id: 'connect', label: 'Connect', icon: MonitorIcon },
  { id: 'hosts', label: 'Hosts', icon: CompassIcon },
  { id: 'logs', label: 'Logs', icon: FileTextIcon },
  { id: 'themes', label: 'Temas', icon: PaletteIcon },
  { id: 'sftp', label: 'SFTP', icon: FolderIcon },
  { id: 'snippets', label: 'Snippets', icon: CodeIcon },
  { id: 'moodle-test', label: 'Test Moodle', icon: MoodleIcon },
]



const SIDEBAR_OPEN = 160
const SIDEBAR_CLOSED = 50

export function animateSidebar(
  sidebarEl: HTMLElement,
  labelsEl: NodeListOf<HTMLElement>,
  isOpen: boolean
) {
  // Clear any GSAP inline styles so CSS .expanded class controls display
  labelsEl.forEach(el => el.style.removeProperty('display'))
  const w = isOpen ? SIDEBAR_OPEN : SIDEBAR_CLOSED
  const duration = isOpen ? 0.38 : 0.42
  const ease = isOpen ? 'power2.out' : 'power1.inOut'
  gsap.to(sidebarEl, { width: w, duration, ease })
  gsap.to(['.main-content', '.pins-panel'], { marginLeft: w, duration, ease })
}

const Sidebar: React.FC<SidebarProps> = ({ 
  activePanel, 
  onOpenPanel, 
  activeSessionId,
  selectedPage,
  isExpanded = false,
  onToggleExpand
}) => {
  const [appVersion, setAppVersion] = React.useState<string>('')
  const sidebarRef = useRef<HTMLElement>(null)
  const isFirstRender = useRef(true)

  React.useEffect(() => { getVersion().then(setAppVersion).catch(() => setAppVersion('')) }, [])

  useEffect(() => {
    const sidebarEl = sidebarRef.current;
    if (!sidebarEl) return;

    const labelsEl = sidebarEl.querySelectorAll<HTMLElement>('.sb-label');

    if (isFirstRender.current) {
      isFirstRender.current = false;
      gsap.set(sidebarEl, { width: isExpanded ? SIDEBAR_OPEN : SIDEBAR_CLOSED });
      gsap.set(['.main-content', '.pins-panel'], { marginLeft: isExpanded ? SIDEBAR_OPEN : SIDEBAR_CLOSED });
      return;
    }

    animateSidebar(sidebarEl, labelsEl, isExpanded);
  }, [isExpanded])

  return (
    <aside ref={sidebarRef} className={`sidebar ${isExpanded ? 'expanded' : ''}`} aria-label="Main navigation">
      <div className="sidebar-header" style={{ 
        padding: '12px 5px 8px', 
        display: 'flex', 
        justifyContent: 'flex-start', 
        width: '100%' 
      }}>
        <button 
          className={`sb-btn toggle-btn ${isExpanded ? 'active' : ''}`} 
          onClick={onToggleExpand} 
          title={isExpanded ? "Colapsar Menu" : "Expandir Menu"}
          aria-expanded={isExpanded}
        >
          <svg 
            viewBox="0 0 24 24" 
            width="24" 
            height="24" 
            stroke="currentColor" 
            strokeWidth="3" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className="hamburger-icon"
            fill="none"
          >
            <path d="M4 6L20 6" className="line-top" />
            <path d="M4 12L20 12" className="line-middle" />
            <path d="M4 18L20 18" className="line-bottom" />
          </svg>
        </button>
      </div>

      <nav className="sidebar-nav" data-tour="sidebar-navigation">
        {items.map(it => {
          const IconComponent = it.icon
          return (
            <button
              key={it.id}
              data-page={it.id}
              className={`sb-btn ${activePanel === it.id ? 'active' : ''}`}
              onClick={() => onOpenPanel(it.id)}
              title={it.label}
            >
              <IconComponent size={20} className="sb-icon" />
              <span className="sb-label">{it.label}</span>
              {!isExpanded && <div className="sb-tip">{it.label}</div>}
            </button>
          )
        })}
      </nav>
      <div className="sidebar-footer">
        {appVersion && (
          <span className="version-badge">v{appVersion}</span>
        )}
      </div>
    </aside>
  )
}

export default Sidebar
