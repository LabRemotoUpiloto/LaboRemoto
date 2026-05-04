import React, { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { Tooltip, UnstyledButton, Box, Stack, Text, ThemeIcon, Transition } from '@mantine/core';
import { 
  MonitorIcon, 
  CompassIcon, 
  PaletteIcon, 
  FolderIcon, 
  CodeIcon, 
  FileTextIcon,
  LabIcon,
  HomeIcon
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

const Sidebar: React.FC<SidebarProps> = ({ 
  activePanel, 
  onOpenPanel, 
  isExpanded = false,
  onToggleExpand
}) => {
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => { 
    getVersion().then(setAppVersion).catch(() => setAppVersion('')); 
  }, []);

  return (
    <Box 
      component="aside"
      aria-label="Main navigation"
      className="fixed left-0 z-[2100] border-r overflow-hidden flex flex-col transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
      style={{
        top: 0,
        height: '100vh',
        width: 'var(--sidebar-width)',
        backgroundColor: 'var(--background-secondary)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Gradient overlay mimicking the old ::before */}
      <div className="absolute inset-0 pointer-events-none" />

      {/* Header with hamburger - Aligned with Header top row (44px) */}
      <Box className="relative z-10 shrink-0 flex items-center justify-center px-2 border-b border-subtle" style={{ height: '44px' }}>
        <UnstyledButton 
          onClick={onToggleExpand}
          title={isExpanded ? "Colapsar Menú" : "Expandir Menú"}
          aria-expanded={isExpanded}
          className="flex items-center justify-center rounded-md transition-colors w-10 h-10 mx-auto"
          style={{
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-primary)';
            e.currentTarget.style.backgroundColor = 'var(--accent-primary-subtle)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <svg 
            viewBox="0 0 24 24" 
            width="24" 
            height="24" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            fill="none"
            className="shrink-0"
          >
            <path 
              d="M4 6L20 6" 
              className={`origin-center transition-all duration-300 ${isExpanded ? 'translate-y-[6px] rotate-45' : ''}`}
              style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
            />
            <path 
              d="M4 12L20 12" 
              className={`origin-center transition-all duration-200 ${isExpanded ? 'opacity-0 scale-x-0' : ''}`}
              style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
            />
            <path 
              d="M4 18L20 18" 
              className={`origin-center transition-all duration-300 ${isExpanded ? '-translate-y-[6px] -rotate-45' : ''}`}
              style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
            />
          </svg>
        </UnstyledButton>
      </Box>

      {/* Navigation Links */}
      <Stack 
        component="nav" 
        gap={4} 
        px={8}
        className="relative z-10 flex-1 mt-2" 
        data-tour="sidebar-navigation"
        role="navigation"
        aria-label="Sidebar navigation"
      >
        {items.map(it => {
          const IconComponent = it.icon;
          const isActive = activePanel === it.id;
          
          const buttonContent = (
            <UnstyledButton
              key={it.id}
              data-page={it.id}
              onClick={() => onOpenPanel(it.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`
                relative w-full h-10 rounded-md flex items-center shrink-0 transition-all duration-200 group overflow-hidden
              `}
              style={{
                justifyContent: isExpanded ? 'flex-start' : 'center',
                paddingLeft: isExpanded ? '12px' : '0',
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'var(--accent-primary-subtle)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--text-primary)';
                  e.currentTarget.style.backgroundColor = 'var(--interactive-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <div 
                className={`transition-all duration-300 flex items-center justify-center shrink-0`}
                style={{ 
                  width: isExpanded ? 'auto' : '100%',
                  marginRight: isExpanded ? '12px' : '0',
                  color: isActive ? 'var(--accent-primary)' : 'inherit' 
                }}
              >
                <IconComponent size={20} />
              </div>
              
              <div 
                className="transition-all duration-300 flex-1 whitespace-nowrap overflow-hidden"
                style={{
                  opacity: isExpanded ? 1 : 0,
                  maxWidth: isExpanded ? '120px' : '0',
                  transform: `translateX(${isExpanded ? '0' : '-10px'})`
                }}
              >
                <Text size="sm" fw={isActive ? 600 : 500} style={{ color: 'inherit' }}>
                  {it.label}
                </Text>
              </div>

              {/* Active Indicator Line */}
              <div 
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-[3px] transition-all duration-300"
                style={{
                  height: isActive ? '18px' : '0px',
                  backgroundColor: 'var(--accent-primary)',
                  opacity: isActive ? 1 : 0
                }}
              />
            </UnstyledButton>
          );

          return (
            <Tooltip 
              key={it.id}
              label={it.label} 
              position="right" 
              withArrow 
              offset={10}
              color="dark.6"
              fz="xs"
              openDelay={isExpanded ? 999999 : 300} // Hide tooltip when expanded
              transitionProps={{ transition: 'slide-right', duration: 200 }}
              disabled={isExpanded} // Mantine 7 supports disabled prop
            >
              {buttonContent}
            </Tooltip>
          );
        })}
      </Stack>

      {/* Footer */}
      <Box className="relative z-10 shrink-0 py-3 flex items-center justify-center overflow-hidden h-[40px]">
        <div
          className="transition-all duration-300 whitespace-nowrap"
          style={{
            opacity: isExpanded ? 1 : 0,
            transform: `scale(${isExpanded ? 1 : 0.8})`,
            width: isExpanded ? 'auto' : '0',
          }}
        >
          {appVersion && (
            <Text size="xs" c="dimmed" className="px-2 py-1 rounded-md bg-black/5 dark:bg-white/5">
              v{appVersion}
            </Text>
          )}
        </div>
      </Box>
    </Box>
  );
};

export default Sidebar;
