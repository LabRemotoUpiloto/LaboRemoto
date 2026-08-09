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
import { useAccessTier, canAccessPage, useCanAccessVigilancia } from '../../hooks/usePermissions';
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
  CameraIcon,
} from '../icons/SidebarIcons';

interface SidebarProps {
  activePanel: string | null;
  onOpenPanel: (id: string) => void;
  tabs?: Tab[];
  activeTabId?: string;
  onTabClick?: (id: string) => void;
  onCloseTab?: (id: string) => void;
  onRenameTab?: (id: string, label: string) => void;
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
  /** true = solo iconos (sidebar colapsada). */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
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
  onRenameTab,
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
  collapsed = false,
  onToggleCollapse,
}) => {
  const [appVersion, setAppVersion] = useState<string>('');
  const showMacTitleBarZone = isMacOS();
  const { user, logout } = useAuth();
  const tier = useAccessTier();
  const canSeeVigilancia = useCanAccessVigilancia();

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
      // Ancho SIN transición CSS: lo anima GSAP en App.tsx vía --sidebar-width,
      // en un solo sistema (evita el "doble motor" de animación). overflow-x
      // hidden recorta los textos que se desvanecen mientras el rail se angosta
      // (así la transición se ve como "esconderse", no como un corte brusco).
      className="fixed z-[2100] flex flex-col"
      style={{
        left: '12px',
        top: '12px',
        bottom: '12px',
        height: 'calc(100vh - 24px)',
        width: 'var(--sidebar-width)',
        overflowX: 'hidden',
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

      {/* App identity — la abeja ES el toggle: click en ella colapsa/expande
          (sin botón dedicado). El ícono queda fijo a la izquierda alineado con
          los íconos de nav; el wordmark "LaboRemoto" se desvanece en el rail. */}
      <Box
        className="shrink-0 flex items-center border-b"
        style={{ height: '40px', borderColor: 'var(--border-subtle)' }}
      >
        <Tooltip label={collapsed ? 'Expandir' : 'Colapsar'} position="right" withArrow openDelay={300}>
          <UnstyledButton
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
            className="flex items-center transition-opacity duration-150 hover:opacity-80"
            style={{ height: '100%', width: '100%', paddingLeft: '17px', gap: '10px' }}
          >
            <img
              src="/abeja1.jpeg"
              alt="LaboRemoto"
              className="shrink-0 rounded-full object-cover select-none"
              style={{ width: '26px', height: '26px', border: '1px solid var(--border-subtle)' }}
              draggable={false}
            />
            <Text
              component="div"
              size="sm"
              fw={700}
              style={{
                color: 'var(--accent-primary)',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                maxWidth: collapsed ? 0 : '140px',
                opacity: collapsed ? 0 : 1,
                transition: 'opacity 0.18s ease, max-width 0.3s ease',
              }}
            >
              LaboRemoto
            </Text>
          </UnstyledButton>
        </Tooltip>
      </Box>

      {hasSessions && onTabClick && onCloseTab && onRenameTab && (
        <SidebarSessions
          tabs={tabs}
          activeTabId={activeTabId}
          onTabClick={onTabClick}
          onCloseTab={onCloseTab}
          onRenameTab={onRenameTab}
          collapsed={collapsed}
        />
      )}

      {/* "Vista" (chat/cámara/escritorio/pines). En el rail se colapsa a un
          solo botón con menú desplegable — misma estrategia que sesiones. */}
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
          collapsed={collapsed}
        />
      )}

      {/* Navigation sections. overscrollBehavior: contain evita el rebote
          elástico (se sentía como si toda la sidebar "se pudiera mover") —
          solo hace scroll de verdad si el contenido no entra. */}
      <Stack
        component="nav"
        gap={0}
        className="flex-1 overflow-y-auto py-3 sidebar-nav-scroll"
        style={{ overscrollBehavior: 'contain' }}
        data-tour="sidebar-navigation"
        role="navigation"
        aria-label="Sidebar navigation"
      >
        {[
          ...sections,
          {
            label: 'Administración',
            items: [
              { id: 'admin-users', label: 'Usuarios', icon: Shield },
              // Vigilancia se filtra por ROL directo (canSeeVigilancia), no
              // por tier: admin_lab y laboratorista sí, semillerista no — el
              // tier 'operativo' los agrupa a ambos, así que no alcanza con
              // canAccessPage/PAGE_ACCESS para expresar esta regla. Debajo
              // de "Usuarios" a propósito (mismo grupo de administración).
              ...(canSeeVigilancia ? [{ id: 'vigilancia', label: 'Vigilancia', icon: CameraIcon }] : []),
            ],
          },
        ]
          .map(section => ({ ...section, items: section.items.filter(item => canAccessPage(item.id, tier)) }))
          .filter(section => section.items.length > 0)
          .map((section, si, arr) => (
          <Box key={section.label} mb={si < arr.length - 1 ? 8 : 0}>
            {/* Section label — se desvanece y colapsa su altura (sin pop). */}
            <Text
              size="xs"
              fw={600}
              px={16}
              style={{
                color: 'var(--text-muted)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontSize: '10px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                opacity: collapsed ? 0 : 1,
                maxHeight: collapsed ? 0 : '18px',
                marginBottom: collapsed ? 0 : 2,
                transition: 'opacity 0.15s ease, max-height 0.3s ease, margin-bottom 0.3s ease',
              }}
            >
              {section.label}
            </Text>

            {/* Items — el ícono queda fijo (paddingLeft constante = sin salto)
                y el label se desvanece; overflow-x hidden del aside lo recorta
                a medida que el rail se angosta. */}
            {section.items.map(item => {
              const IconComponent = item.icon;
              const isActive = activePanel === item.id;
              return (
                <Tooltip key={item.id} label={item.label} position="right" withArrow openDelay={200} disabled={!collapsed}>
                  <UnstyledButton
                    data-page={item.id}
                    onClick={() => item.id === 'local-terminal-new' ? onNewLocalTerminal?.() : onOpenPanel(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={item.label}
                    className="relative flex items-center transition-colors duration-150"
                    style={{
                      height: '34px',
                      paddingLeft: '19px',
                      gap: '12px',
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
                    {/* Contenedor de tamaño fijo: los SidebarIcons custom no
                        aceptan `style`, así que sin este wrapper flex-shrink:0
                        el label (nowrap) los comprimía a 0 y desaparecían. */}
                    <span style={{ flex: '0 0 15px', width: 15, height: 15, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <IconComponent size={15} />
                    </span>
                    <Text
                      size="sm"
                      fw={isActive ? 600 : 400}
                      style={{
                        color: 'inherit',
                        fontSize: '13px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        // maxWidth → 0 al colapsar: el label deja de ocupar
                        // ancho (no comprime el ícono) y se cierra suave.
                        maxWidth: collapsed ? 0 : '160px',
                        opacity: collapsed ? 0 : 1,
                        transition: 'opacity 0.15s ease, max-width 0.3s ease',
                      }}
                    >
                      {item.label}
                    </Text>
                  </UnstyledButton>
                </Tooltip>
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
              className="w-full flex items-center transition-colors"
              style={{
                color: 'var(--mantine-color-text)',
                cursor: 'pointer',
                gap: '12px',
                padding: '10px 12px',
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--mantine-color-default-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <div className="sidebar-user-avatar w-7 h-7 rounded-full flex items-center justify-center shrink-0 select-none">
                <User size={14} strokeWidth={2.5} />
              </div>
              <div className="flex flex-col min-w-0" style={{ opacity: collapsed ? 0 : 1, transition: 'opacity 0.15s ease', whiteSpace: 'nowrap' }}>
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
