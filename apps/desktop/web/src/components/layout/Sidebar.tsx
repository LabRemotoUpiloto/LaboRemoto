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
  FileTextIcon
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
  { id: 'connect', label: 'Connect', icon: MonitorIcon },
  { id: 'hosts', label: 'Hosts', icon: CompassIcon },
  { id: 'logs', label: 'Logs', icon: FileTextIcon },
  { id: 'themes', label: 'Temas', icon: PaletteIcon },
  { id: 'sftp', label: 'SFTP', icon: FolderIcon },
  { id: 'snippets', label: 'Snippets', icon: CodeIcon },
]



const SIDEBAR_OPEN = 220
const SIDEBAR_CLOSED = 50

export function animateSidebar(
  sidebarEl: HTMLElement,
  labelsEl: NodeListOf<HTMLElement>,
  isOpen: boolean
) {
  if (isOpen) {
    const tl = gsap.timeline()

    // 1. Sidebar expands
    tl.to(sidebarEl, {
      width: SIDEBAR_OPEN,
      duration: 0.35,
      ease: 'power3.out',
    })

    // 2. Labels appear with stagger
    tl.to(labelsEl, {
      display: 'inline-block',
      opacity: 1,
      x: 0,
      duration: 0.2,
      ease: 'power2.out',
      stagger: 0.04,
    }, '-=0.15')

  } else {
    const tl = gsap.timeline()

    // 1. Labels disappear fast
    tl.to(labelsEl, {
      opacity: 0,
      x: -6,
      duration: 0.1,
      ease: 'power2.in',
      stagger: { each: 0.025, from: 'end' },
      onComplete: () => {
        gsap.set(labelsEl, { display: 'none' })
      }
    })

    // 2. Width shrinks
    tl.to(sidebarEl, {
      width: SIDEBAR_CLOSED,
      duration: 0.28,
      ease: 'power3.inOut',
    }, '-=0.05')
  }

  // Sincroniza containers externos que dependían del ancho
  const duration = isOpen ? 0.35 : 0.28;
  const ease = isOpen ? 'power3.out' : 'power3.inOut';
  gsap.to(['.main-content', '.pins-panel'], {
    marginLeft: isOpen ? SIDEBAR_OPEN : SIDEBAR_CLOSED,
    duration,
    ease,
  })
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
      gsap.set(labelsEl, { 
        display: isExpanded ? 'inline-block' : 'none',
        opacity: isExpanded ? 1 : 0, 
        x: isExpanded ? 0 : -6 
      });
      return;
    }

    animateSidebar(sidebarEl, labelsEl, isExpanded);
  }, [isExpanded])

  return (
    <aside ref={sidebarRef} className={`sidebar ${isExpanded ? 'expanded' : ''}`} aria-label="Main navigation">
      <div className="sidebar-header" style={{ padding: '12px 12px 8px', display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
        <button 
          className="sb-btn toggle-btn" 
          onClick={onToggleExpand} 
          title={isExpanded ? "Colapsar Menu" : "Expandir Menu"}
        >
          <svg 
            viewBox="0 0 24 24" 
            fill="none" 
            width="22" 
            height="22" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            style={{
              transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: isExpanded ? 'rotate(135deg)' : 'rotate(0deg)'
            }}
          >
            <path d="M12 5v14M5 12h14" />
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
          <span className="version-badge">
            {isExpanded ? `v${appVersion}` : appVersion.split('.')[0]}
          </span>
        )}
      </div>
    </aside>
  )
}

export default Sidebar
