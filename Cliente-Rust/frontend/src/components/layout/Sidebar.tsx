import React, { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { isMacOS } from '../../utils/platform';
import { WindowDragZone } from '../window/WindowDragZone';
import SidebarSessions from './SidebarSessions';
import SidebarSessionActions from './SidebarSessionActions';
import { UnstyledButton, Box, Stack, Text, Menu, Tooltip } from '@mantine/core';
import { User, Shield, SquareTerminal } from 'lucide-react';
import type { Tab, ActiveView } from '../../hooks/useAppTabs';
import { useAuth } from '../../contexts/AuthContext';
import { useAccessTier, canAccessPage } from '../../hooks/usePermissions';
import {
  MonitorIcon,
  CompassIcon,
  PaletteIcon,
  FolderIcon,
  CodeIcon,
  FileTextIcon,
  LabIcon,
  HomeIcon,
  CalendarIcon,
} from '../icons/SidebarIcons';

interface SidebarProps {
  activePanel: string | null;
  onOpenPanel: (id: string) => void;
  tabs?: Tab[];
  activeTabId?: string;
  onTabClick?: (id: string) => void;
  onCloseTab?: (id: string) => void;
  onNewSession?: () => void;
  onNewLocalTerminal?: () => void;
  hasSessions?: boolean;
  showSessionActions?: boolean;
  activeView?: ActiveView;
  onViewChange?: (view: ActiveView) => void;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
  onToggleCamera?: () => void;
  onTogglePins?: () => void;
  isCameraActive?: boolean;
  isPinsActive?: boolean;
}

const sections = [
  {
    label: 'General',
    items: [
      { id: 'landing',   label: 'Inicio',    icon: HomeIcon },
      { id: 'practices', label: 'Prácticas', icon: LabIcon },
      { id: 'reservas',  label: 'Reservas',  icon: CalendarIcon },
    ],
  },
  {
    label: 'Conexión',
    items: [
      { id: 'connect', label: 'Connect', icon: MonitorIcon },
      { id: 'hosts',   label: 'Hosts',   icon: CompassIcon },
      { id: 'logs',    label: 'Logs',    icon: FileTextIcon },
      // No es una página de `onOpenPanel`: crea y abre directamente un tab
      // "Terminal local" nuevo — ver caso especial en el onClick del item.
      { id: 'local-terminal-new', label: 'Terminal local', icon: SquareTerminal },
    ],
  },
  {
    label: 'Herramientas',
    items: [
      { id: 'sftp',     label: 'SFTP',     icon: FolderIcon },
      { id: 'snippets', label: 'Snippets', icon: CodeIcon },
      { id: 'themes',   label: 'Temas',    icon: PaletteIcon },
    ],
  },
];

const Sidebar: React.FC<SidebarProps> = ({
  activePanel,
  onOpenPanel,
  tabs = [],
  activeTabId = '',
  onTabClick,
  onCloseTab,
  onNewSession,
  onNewLocalTerminal,
  hasSessions = false,
  showSessionActions = false,
  activeView = 'terminal',
  onViewChange,
  isChatOpen = false,
  onToggleChat,
  onToggleCamera,
  onTogglePins,
  isCameraActive = false,
  isPinsActive = false,
}) => {
  const [appVersion, setAppVersion] = useState<string>('');
  const showMacTitleBarZone = isMacOS();
  const { user, logout } = useAuth();
  const tier = useAccessTier();

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion(''));
  }, []);

  // Un solo rol efectivo visible (no la lista cruda de claims): el de mayor
  // privilegio gana — mismo orden de precedencia que usePermissions.
  const formatRoles = () => {
    const roles = user?.roles ?? [];
    if (roles.includes('admin_lab')) return 'Administrador ';
    if (roles.includes('laboratorista')) return 'Laboratorista ';
    if (roles.includes('semillerista')) return 'Semillerista ';
    return 'Estudiante ';
  };

  return (
    <Box
      component="aside"
      aria-label="Main navigation"
      className="fixed z-[2100] flex flex-col overflow-hidden transition-all duration-300"
      style={{
        left: '12px',
        top: '12px',
        bottom: '12px',
        height: 'calc(100vh - 24px)',
        width: 'var(--sidebar-width)',
        backgroundColor: 'var(--sidebar-bg, var(--background-secondary))',
        border: 'var(--sidebar-border, 1px solid var(--border-subtle))',
        borderRadius: 'var(--sidebar-radius, 16px)',
        boxShadow: 'var(--shadow-sm)',
        backdropFilter: 'var(--sidebar-blur, none)',
        WebkitBackdropFilter: 'var(--sidebar-blur, none)',
      }}
    >
      {/* macOS: espacio para traffic lights + arrastre; Win/Linux usan barra nativa */}
      {showMacTitleBarZone && (
        <WindowDragZone
          className="shrink-0"
          style={{ height: '48px' }}
        />
      )}

      {/* App identity */}
      <Box
        className="shrink-0 flex items-center px-4 border-b"
        style={{
          height: '36px',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <Text
          size="sm"
          fw={700}
          style={{ color: 'var(--accent-primary)', letterSpacing: '0.02em' }}
        >
          LaboRemoto
        </Text>
      </Box>

      {hasSessions && onTabClick && onCloseTab && onNewSession && onNewLocalTerminal && (
        <SidebarSessions
          tabs={tabs}
          activeTabId={activeTabId}
          onTabClick={onTabClick}
          onCloseTab={onCloseTab}
          onNewSession={onNewSession}
          onNewLocalTerminal={onNewLocalTerminal}
        />
      )}

      {showSessionActions && onViewChange && onToggleChat && (
        <SidebarSessionActions
          activeView={activeView}
          onViewChange={onViewChange}
          isChatOpen={isChatOpen}
          onToggleChat={onToggleChat}
          onToggleCamera={onToggleCamera}
          onTogglePins={onTogglePins}
          isCameraActive={isCameraActive}
          isPinsActive={isPinsActive}
        />
      )}

      {/* Navigation sections */}
      <Stack
        component="nav"
        gap={0}
        className="flex-1 overflow-y-auto py-3"
        data-tour="sidebar-navigation"
        role="navigation"
        aria-label="Sidebar navigation"
      >
        {[
          ...sections,
          { label: 'Administración', items: [{ id: 'admin-users', label: 'Usuarios', icon: Shield }] },
        ]
          .map(section => ({ ...section, items: section.items.filter(item => canAccessPage(item.id, tier)) }))
          .filter(section => section.items.length > 0)
          .map((section, si, arr) => (
          <Box key={section.label} mb={si < arr.length - 1 ? 8 : 0}>
            {/* Section label */}
            <Text
              size="xs"
              fw={600}
              px={16}
              mb={2}
              style={{
                color: 'var(--text-muted)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontSize: '10px',
              }}
            >
              {section.label}
            </Text>

            {/* Items */}
            {section.items.map(item => {
              const IconComponent = item.icon;
              const isActive = activePanel === item.id;
              return (
                <UnstyledButton
                  key={item.id}
                  data-page={item.id}
                  onClick={() => item.id === 'local-terminal-new' ? onNewLocalTerminal?.() : onOpenPanel(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className="relative w-full flex items-center gap-3 transition-colors duration-150"
                  style={{
                    height: '34px',
                    paddingLeft: '12px',
                    paddingRight: '12px',
                    color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    backgroundColor: isActive ? 'var(--accent-primary-subtle)' : 'transparent',
                    borderRadius: '6px',
                    margin: '1px 6px',
                    width: 'calc(100% - 12px)',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--interactive-hover)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <div
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-[3px]"
                      style={{
                        height: '16px',
                        backgroundColor: 'var(--accent-primary)',
                      }}
                    />
                  )}
                  <IconComponent size={15} />
                  <Text
                    size="sm"
                    fw={isActive ? 600 : 400}
                    style={{ color: 'inherit', fontSize: '13px' }}
                  >
                    {item.label}
                  </Text>
                </UnstyledButton>
              );
            })}
          </Box>
        ))}
      </Stack>

      <Box
        className="shrink-0 border-t"
        style={{ borderColor: 'var(--mantine-color-default-border)' }}
      >
        <Menu shadow="md" width={200} position="top-start" withinPortal zIndex={2200}>
          <Menu.Target>
            <div
              className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors"
              style={{ color: 'var(--mantine-color-text)', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--mantine-color-default-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <div className="sidebar-user-avatar w-7 h-7 rounded-full flex items-center justify-center shrink-0 select-none">
                <User size={14} strokeWidth={2.5} />
              </div>
              <div className="flex flex-col min-w-0">
                <Text size="xs" fw={600} c="var(--mantine-color-text)" style={{ lineHeight: 1.3 }}>
                  {user?.preferred_username || 'Usuario'}
                </Text>
                <Text size="xs" c="dimmed" style={{ lineHeight: 1.2, fontSize: 10 }}>
                  {formatRoles()}
                </Text>
                {appVersion && (
                  <Text size="xs" c="dimmed" style={{ lineHeight: 1.2, fontSize: 10 }}>
                    v{appVersion}
                  </Text>
                )}
              </div>
            </div>
          </Menu.Target>
          <Menu.Dropdown bg="var(--mantine-color-body)">
            <Menu.Label>Usuario</Menu.Label>
            <Menu.Item disabled c="var(--mantine-color-text)">Perfil (Próximamente)</Menu.Item>
            <Menu.Item disabled c="var(--mantine-color-text)">Ajustes (Próximamente)</Menu.Item>
            <Menu.Divider />
            <Menu.Item color="red" onClick={logout}>Cerrar Sesión</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Box>
    </Box>
  );
};

export default Sidebar;
