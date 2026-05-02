import React, { useRef, useEffect } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { gsap } from 'gsap';
import { Tooltip, UnstyledButton } from '@mantine/core';
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
} from '../icons/SidebarIcons';

interface SidebarProps {
  activePanel: string | null;
  onOpenPanel: (id: string) => void;
  activeSessionId?: string | null;
  selectedPage?: string | null;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

const items = [
  { id: 'landing', label: 'Inicio', icon: HomeIcon },
  { id: 'practices', label: 'Prácticas', icon: LabIcon },
  { id: 'connect', label: 'Connect', icon: MonitorIcon },
  { id: 'hosts', label: 'Hosts', icon: CompassIcon },
  { id: 'logs', label: 'Logs', icon: FileTextIcon },
  { id: 'themes', label: 'Temas', icon: PaletteIcon },
  { id: 'sftp', label: 'SFTP', icon: FolderIcon },
  { id: 'snippets', label: 'Snippets', icon: CodeIcon },
];

const SIDEBAR_OPEN = 160;
const SIDEBAR_CLOSED = 50;

export function animateSidebar(
  sidebarEl: HTMLElement,
  labelsEl: NodeListOf<HTMLElement>,
  isOpen: boolean
) {
  labelsEl.forEach(el => el.style.removeProperty('display'));
  const w = isOpen ? SIDEBAR_OPEN : SIDEBAR_CLOSED;
  const duration = isOpen ? 0.38 : 0.42;
  const ease = isOpen ? 'power2.out' : 'power1.inOut';
  gsap.to(sidebarEl, { width: w, duration, ease });
  gsap.to(['.main-content', '.pins-panel'], { marginLeft: w, duration, ease });
}

const Sidebar: React.FC<SidebarProps> = ({ 
  activePanel, 
  onOpenPanel, 
  isExpanded = false,
  onToggleExpand
}) => {
  const [appVersion, setAppVersion] = React.useState<string>('');
  const sidebarRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => { getVersion().then(setAppVersion).catch(() => setAppVersion('')); }, []);

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
  }, [isExpanded]);

  return (
    <aside 
      ref={sidebarRef} 
      aria-label="Main navigation"
      className="fixed left-0 top-[34px] h-[calc(100vh-34px)] bg-secondary flex flex-col items-start py-2 gap-0.5 shrink-0 border-r border-subtle z-[2100] overflow-visible"
    >
      {/* Gradient overlay mimicking the old ::before */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-accent/5 via-transparent to-black/5" />

      {/* Header with hamburger */}
      <div className="px-1.5 pt-3 pb-2 flex justify-start w-full relative z-10">
        <UnstyledButton 
          onClick={onToggleExpand}
          title={isExpanded ? "Colapsar Menu" : "Expandir Menu"}
          aria-expanded={isExpanded}
          className="w-10 h-10 rounded-md flex items-center justify-center text-secondary hover:text-primary hover:bg-accent/10 transition-colors shrink-0"
        >
          <svg 
            viewBox="0 0 24 24" 
            width="24" 
            height="24" 
            stroke="currentColor" 
            strokeWidth="3" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            fill="none"
          >
            <path d="M4 6L20 6" className={`origin-center transition-all duration-300 ${isExpanded ? 'translate-y-[6px] rotate-45' : ''}`} />
            <path d="M4 12L20 12" className={`origin-center transition-all duration-200 ${isExpanded ? 'opacity-0 scale-x-0' : ''}`} />
            <path d="M4 18L20 18" className={`origin-center transition-all duration-300 ${isExpanded ? '-translate-y-[6px] -rotate-45' : ''}`} />
          </svg>
        </UnstyledButton>
      </div>

      {/* Navigation Links */}
      <nav className="flex flex-col gap-0.5 items-start relative w-full px-1.5 z-10" data-tour="sidebar-navigation">
        {items.map(it => {
          const IconComponent = it.icon;
          const isActive = activePanel === it.id;
          
          const buttonContent = (
            <UnstyledButton
              key={it.id}
              data-page={it.id}
              onClick={() => onOpenPanel(it.id)}
              className={`
                relative w-full h-10 rounded-md flex items-center px-2.5 shrink-0 transition-all duration-150 group
                ${isActive ? 'text-accent bg-transparent' : 'text-secondary hover:text-primary hover:bg-accent/10'}
                ${isExpanded ? 'justify-start gap-3' : 'justify-start w-10'}
              `}
            >
              <div 
                className={`transition-all duration-300 ${isActive ? 'drop-shadow-[0_0_6px_var(--accent-primary)]' : ''}`}
                style={{ color: isActive ? 'var(--accent-primary)' : 'inherit' }}
              >
                <IconComponent size={20} />
              </div>
              
              <span className={`sb-label text-[13px] font-medium whitespace-nowrap ${isExpanded ? 'inline-block' : 'hidden'}`}>
                {it.label}
              </span>

              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-r-[3px] bg-accent" />
              )}
            </UnstyledButton>
          );

          return isExpanded ? (
            buttonContent
          ) : (
            <Tooltip 
              key={it.id}
              label={it.label} 
              position="right" 
              withArrow 
              offset={10}
              color="dark.6"
              fz="xs"
              openDelay={300}
            >
              {buttonContent}
            </Tooltip>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="mt-auto flex justify-start items-center py-2 px-1.5 w-full relative z-10">
        {appVersion && (
          <span className="text-[10px] px-1.5 py-0.5 text-tertiary whitespace-nowrap">v{appVersion}</span>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
