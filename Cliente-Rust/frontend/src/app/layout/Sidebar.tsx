import React, { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { isMacOS } from '@/lib/platform';
import { WindowDragZone } from '../window/WindowDragZone';
import SidebarSessions from './SidebarSessions';
import SidebarSessionActions from './SidebarSessionActions';
import SidebarHerramientasSesion from './SidebarHerramientasSesion';
import { UnstyledButton, Box, Stack, Text, Menu, Tooltip } from '@mantine/core';
import { User, Shield, Activity, BookOpen, Gauge } from 'lucide-react';
import type { Tab, ActiveView } from '../hooks/useAppTabs';
import { useAuth } from '@/features/cuenta/AuthContext';
import { useEffectiveRole, canAccessPage, ROLE_LABELS, ROLE_ORDER, rolVerComo, setRolVerComo, puedeVerComo } from '@/features/cuenta/usePermissions';
import {
  MonitorIcon,
  LabIcon,
  HomeIcon,
  CalendarIcon,
  CameraIcon,
} from './SidebarIcons';

interface SidebarProps {
  activePanel: string | null;
  onOpenPanel: (id: string) => void;
  tabs?: Tab[];
  activeTabId?: string;
  onTabClick?: (id: string) => void;
  onCloseTab?: (id: string) => void;
  onRenameTab?: (id: string, label: string) => void;
  hasSessions?: boolean;
  showSessionActions?: boolean;
  /** Sesión de uso normal que se está viendo: «Esta sesión» maneja su mosaico. Si es null y hay acciones, es una práctica. */
  sesionMosaico?: string | null;
  /** La sesión del mosaico es una terminal local (solo Terminal y Comandos). */
  sesionMosaicoLocal?: boolean;
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

// Secciones por lo que la persona viene a hacer. Cada rol ve solo los ítems de canAccessPage
// (una sección sin ítems no se muestra). «Temas» es una preferencia: vive en el menú del usuario.
// Lo que es herramienta de una conexión (Archivos, Mis comandos) está en «Esta sesión» (SidebarSessionActions);
// conectarse es una sola página (Conexiones: equipos, nueva conexión, terminal local y registros) y Encuestas es
// una pestaña de Prácticas.
const sections = [
  {
    label: 'Aprender',
    items: [
      { id: 'landing',    label: 'Inicio',     icon: HomeIcon },
      { id: 'practices',  label: 'Prácticas',  icon: LabIcon },
      { id: 'mis-cursos', label: 'Mis cursos', icon: BookOpen },
      { id: 'reservas',   label: 'Reservas',   icon: CalendarIcon },
    ],
  },
  {
    label: 'Conectar',
    items: [
      { id: 'connect', label: 'Conexiones', icon: MonitorIcon },
    ],
  },
  {
    label: 'Laboratorio',
    items: [
      { id: 'rendimiento', label: 'Monitoreo',  icon: Gauge },
      { id: 'vigilancia',  label: 'Vigilancia', icon: CameraIcon },
    ],
  },
  {
    label: 'Personas',
    items: [
      { id: 'dashboard',   label: 'Actividad', icon: Activity },
      { id: 'admin-users', label: 'Usuarios',  icon: Shield },
    ],
  },
];

// Páginas que viven dentro de otra entrada: al abrirlas se marca esa entrada.
const ENTRADA_DE: Record<string, string> = { hosts: 'connect', logs: 'connect', encuestas: 'practices' };


const Sidebar: React.FC<SidebarProps> = ({
  activePanel,
  onOpenPanel,
  tabs = [],
  activeTabId = '',
  onTabClick,
  onCloseTab,
  onRenameTab,
  hasSessions = false,
  showSessionActions = false,
  sesionMosaico = null,
  sesionMosaicoLocal = false,
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
  const role = useEffectiveRole();

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion(''));
  }, []);

  return (
    <>
    {/* Primer elemento al tabular: salta la navegación y va directo al contenido (main#contenido en App). */}
    <a href="#contenido" onClick={(e) => { e.preventDefault(); document.getElementById('contenido')?.focus(); }}
      className="fixed left-4 top-4 z-[2200] -translate-y-20 rounded-ui bg-ui-acento px-4 py-2 text-[13px] font-semibold !text-[var(--accent-contrast,var(--text-inverse,#fff))] !no-underline focus-visible:translate-y-0">
      Saltar al contenido
    </a>
    <Box
      component="aside"
      aria-label="Navegación principal"
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
        style={{ height: '52px', borderColor: 'var(--border-subtle)' }}
        data-tour="sidebar-header"
      >
        <Tooltip label={collapsed ? 'Expandir' : 'Colapsar'} position="right" withArrow openDelay={300}>
          <UnstyledButton
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expandir la barra lateral' : 'Contraer la barra lateral'}
            className="flex items-center transition-opacity duration-150 hover:opacity-80"
            style={{ height: '100%', width: '100%', paddingLeft: '11px', gap: '10px' }}
          >
            <img
              src="/Abeja Computador.png"
              alt="LaboRemoto"
              className="shrink-0 rounded-full object-cover select-none"
              style={{ width: '40px', height: '40px', border: '1px solid var(--border-subtle)' }}
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
          solo botón con menú desplegable — misma estrategia que sesiones.
          El estudiante no la ve: en la práctica el chat y la terminal ya
          vienen armados, y cámara/escritorio/pines son del laboratorio. */}
      {/* Sesión de uso normal: cada herramienta es un panel del mosaico de esa sesión */}
      {sesionMosaico && role !== 'estudiante' && <SidebarHerramientasSesion sesion={sesionMosaico} local={sesionMosaicoLocal} collapsed={collapsed} />}

      {!sesionMosaico && showSessionActions && role !== 'estudiante' && onViewChange && onToggleChat && (
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
        aria-label="Secciones"
      >
        {sections
          .map(section => ({ ...section, items: section.items.filter(item => canAccessPage(item.id, role)) }))
          .filter(section => section.items.length > 0)
          .map((section, si, arr) => (
          <Box key={section.label} mb={si < arr.length - 1 ? 16 : 0}>
            {/* Section label — se desvanece y colapsa su altura (sin pop). */}
            <Text
              size="xs"
              fw={500}
              px={19}
              style={{
                // Rótulo discreto (sin mayúsculas ni espaciado ancho, que se leían como ruido). --text-muted daba
                // 1,9–2,8:1 en 8 temas; el secundario pasa AA en los 13
                color: 'var(--text-secondary)',
                fontSize: '11px',
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
              const isActive = activePanel === item.id || (!!activePanel && ENTRADA_DE[activePanel] === item.id);
              return (
                <Tooltip key={item.id} label={item.label} position="right" withArrow openDelay={200} disabled={!collapsed}>
                  <UnstyledButton
                    data-page={item.id}
                    onClick={() => onOpenPanel(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={item.label}
                    className="relative flex items-center transition-colors duration-150"
                    style={{
                      height: '34px',
                      paddingLeft: '19px',
                      gap: '12px',
                      // --accent-text: el acento oscurecido donde el puro no pasa AA sobre su fondo (Polar Mint, Sepia…)
                      color: isActive ? 'var(--accent-text, var(--accent-primary))' : 'var(--text-secondary)',
                      // Mezcla del acento al 8 %: varios temas no definen --accent-primary-subtle y heredaban
                      // un verde que no es el suyo; con 8 % el texto activo pasa AA en los 13 temas.
                      backgroundColor: isActive ? 'color-mix(in srgb, var(--accent-primary) 8%, transparent)' : 'transparent',
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
              data-tour="sidebar-usuario"
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
                  {ROLE_LABELS[role]}{rolVerComo() ? ' (vista)' : ''}
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
            <Menu.Item c="var(--mantine-color-text)" onClick={() => onOpenPanel('perfil')}>Perfil</Menu.Item>
            <Menu.Item c="var(--mantine-color-text)" onClick={() => onOpenPanel('ajustes')}>Ajustes</Menu.Item>
            {canAccessPage('themes', role) && <Menu.Item c="var(--mantine-color-text)" onClick={() => onOpenPanel('themes')}>Temas</Menu.Item>}
            {puedeVerComo(user?.roles) && (
              <>
                <Menu.Divider />
                <Menu.Label>Ver como (solo cambia la vista)</Menu.Label>
                {ROLE_ORDER.map((r) => (
                  <Menu.Item key={r} c="var(--mantine-color-text)" fw={rolVerComo() === r ? 700 : undefined} onClick={() => setRolVerComo(r)}>
                    {ROLE_LABELS[r]}{rolVerComo() === r ? ' ✓' : ''}
                  </Menu.Item>
                ))}
                <Menu.Item c="dimmed" fw={rolVerComo() === null ? 700 : undefined} onClick={() => setRolVerComo(null)}>Mi rol real{rolVerComo() === null ? ' ✓' : ''}</Menu.Item>
              </>
            )}
            <Menu.Divider />
            <Menu.Item color="red" onClick={() => { setRolVerComo(null); logout(); }}>Cerrar sesión</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Box>
    </Box>
    </>
  );
};

export default Sidebar;
