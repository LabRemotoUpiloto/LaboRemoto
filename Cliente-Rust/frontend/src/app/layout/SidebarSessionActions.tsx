import React from 'react';
import { Group, ActionIcon, Menu, Text, UnstyledButton } from '@mantine/core';
import { MessageSquare, FolderOpen, Code2 } from 'lucide-react';
import type { ActiveView } from '../hooks/useAppTabs';
import { PANEL_ICONS } from './HeaderConstants';
import { canAccessPage, useEffectiveRole } from '@/features/cuenta/usePermissions';

type Props = {
  /** Archivos y Mis comandos son herramientas de la conexión abierta: se abren dentro de la sesión. */
  activePanel: string | null;
  onOpenPanel: (id: string) => void;
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  isChatOpen: boolean;
  onToggleChat: () => void;
  onToggleCamera?: () => void;
  onTogglePins?: () => void;
  isCameraActive: boolean;
  isPinsActive: boolean;
  /** Rail de íconos: un solo botón que despliega las 4 opciones. */
  collapsed?: boolean;
};

const ChatSvg: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 10.5a1.5 1.5 0 0 1-1.5 1.5H5L2 15V3a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 14 3z" />
  </svg>
);

/** «Esta sesión»: acciones de la sesión SSH abierta en el sidebar (sustituye la barra superior). Orden:
 *  Chat, Cámara, Escritorio remoto, Pines, Archivos, Mis comandos — igual en expandido y colapsado. */
const SidebarSessionActions: React.FC<Props> = ({
  activePanel,
  onOpenPanel,
  activeView,
  onViewChange,
  isChatOpen,
  onToggleChat,
  onToggleCamera,
  onTogglePins,
  isCameraActive,
  isPinsActive,
  collapsed = false,
}) => {
  const iconStyle = (active: boolean): React.CSSProperties => ({
    backgroundColor: active ? 'var(--interactive-selected)' : 'transparent',
    color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
    border: active ? '1px solid var(--accent-primary)' : '1px solid transparent',
  });

  // Fondo + color + punto a la derecha para que un ítem activo del menú
  // desplegable se note de verdad (antes solo cambiaba el grosor de fuente,
  // que se perdía entre los estados de hover).
  const activeItemProps = (active: boolean) => ({
    fw: active ? 600 : 400,
    c: active ? 'var(--accent-primary)' : undefined,
    bg: active ? 'var(--accent-primary-subtle)' : undefined,
    rightSection: active ? (
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--accent-primary)', display: 'inline-block' }} />
    ) : undefined,
  });

  const isEscritorioActive = activeView === 'escritorio';
  const role = useEffectiveRole();
  const conArchivos = canAccessPage('sftp', role);
  const conComandos = canAccessPage('snippets', role);
  const isArchivos = activePanel === 'sftp';
  const isComandos = activePanel === 'snippets';
  const onToggleEscritorio = () => onViewChange(activeView === 'terminal' ? 'escritorio' : 'terminal');

  // ── Rail colapsado: un solo botón (ícono de chat) que despliega las
  //    opciones en menú — misma estrategia que el grupo de sesiones. ──
  if (collapsed) {
    const anyActive = isChatOpen || isCameraActive || isEscritorioActive || isPinsActive || isArchivos || isComandos;
    return (
      <div className="pb-2 mb-1 border-b flex flex-col" style={{ borderColor: 'var(--border-subtle)' }}>
        <Menu shadow="md" width={190} position="right-start" withinPortal offset={8}>
          <Menu.Target>
            <UnstyledButton
              data-no-window-drag
              aria-label="Esta sesión"
              className="relative flex items-center justify-center transition-colors"
              style={{
                height: '34px',
                width: 'calc(100% - 12px)',
                margin: '1px 6px',
                borderRadius: '6px',
                color: anyActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                backgroundColor: anyActive ? 'var(--accent-primary-subtle)' : 'transparent',
              }}
              onMouseEnter={e => { if (!anyActive) { e.currentTarget.style.backgroundColor = 'var(--interactive-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
              onMouseLeave={e => { if (!anyActive) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
            >
              {anyActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-[3px]" style={{ height: '16px', backgroundColor: 'var(--accent-primary)' }} />
              )}
              <MessageSquare size={15} />
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item {...activeItemProps(isChatOpen)} leftSection={<ChatSvg />} onClick={onToggleChat}>
              Chat
            </Menu.Item>
            <Menu.Item {...activeItemProps(isCameraActive)} leftSection={<div className="w-4 h-4">{PANEL_ICONS['camara']}</div>} onClick={onToggleCamera}>
              Cámara
            </Menu.Item>
            <Menu.Item {...activeItemProps(isEscritorioActive)} leftSection={<div className="w-4 h-4">{isEscritorioActive ? PANEL_ICONS['terminal'] : PANEL_ICONS['escritorio']}</div>} onClick={onToggleEscritorio}>
              {isEscritorioActive ? 'Volver a terminal' : 'Escritorio remoto'}
            </Menu.Item>
            <Menu.Item {...activeItemProps(isPinsActive)} leftSection={<div className="w-4 h-4">{PANEL_ICONS['pines']}</div>} onClick={onTogglePins}>
              GPIO / Pines
            </Menu.Item>
            {(conArchivos || conComandos) && <Menu.Divider />}
            {conArchivos && (
              <Menu.Item data-page="sftp" {...activeItemProps(isArchivos)} leftSection={<FolderOpen size={15} />} onClick={() => onOpenPanel('sftp')}>
                Archivos
              </Menu.Item>
            )}
            {conComandos && (
              <Menu.Item data-page="snippets" {...activeItemProps(isComandos)} leftSection={<Code2 size={15} />} onClick={() => onOpenPanel('snippets')}>
                Mis comandos
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </div>
    );
  }

  return (
    <div className="px-2 pb-2 mb-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
      <Text
        size="xs"
        fw={500}
        px={11}
        mb={4}
        style={{ color: 'var(--text-secondary)', fontSize: '11px' }}
      >
        Esta sesión
      </Text>
      {/* Seis botones en el ancho del sidebar: repartidos, sin espacio fijo entre ellos */}
      <Group gap={0} px={4} wrap="nowrap" justify="space-between">
        <ActionIcon
          data-no-window-drag
          size="md"
          onClick={onToggleChat}
          title="Chat"
          style={iconStyle(isChatOpen)}
          className="hover:bg-[var(--interactive-hover)] hover:text-[var(--text-primary)] transition-colors duration-150"
        >
          <ChatSvg size={16} />
        </ActionIcon>
        <ActionIcon
          data-no-window-drag
          size="md"
          onClick={onToggleCamera}
          title="Cámara"
          style={iconStyle(isCameraActive)}
          className="hover:bg-[var(--interactive-hover)] hover:text-[var(--text-primary)] transition-colors duration-150"
        >
          <div className="w-4 h-4">{PANEL_ICONS['camara']}</div>
        </ActionIcon>
        <ActionIcon
          data-no-window-drag
          size="md"
          onClick={onToggleEscritorio}
          title={isEscritorioActive ? 'Volver a terminal' : 'Escritorio remoto'}
          style={iconStyle(isEscritorioActive)}
          className="hover:bg-[var(--interactive-hover)] hover:text-[var(--text-primary)] transition-colors duration-150"
        >
          <div className="w-4 h-4">{isEscritorioActive ? PANEL_ICONS['terminal'] : PANEL_ICONS['escritorio']}</div>
        </ActionIcon>
        <ActionIcon
          data-no-window-drag
          size="md"
          onClick={onTogglePins}
          title="GPIO / Pines"
          style={iconStyle(isPinsActive)}
          className="hover:bg-[var(--interactive-hover)] hover:text-[var(--text-primary)] transition-colors duration-150"
        >
          <div className="w-4 h-4">{PANEL_ICONS['pines']}</div>
        </ActionIcon>
        {/* data-page: el recorrido guiado (chat/tour) los encuentra igual que cuando eran entradas del menú */}
        {conArchivos && (
          <ActionIcon
            data-no-window-drag
            data-page="sftp"
            size="md"
            onClick={() => onOpenPanel('sftp')}
            title="Archivos"
            aria-label="Archivos"
            style={iconStyle(isArchivos)}
            className="hover:bg-[var(--interactive-hover)] hover:text-[var(--text-primary)] transition-colors duration-150"
          >
            <FolderOpen size={16} />
          </ActionIcon>
        )}
        {conComandos && (
          <ActionIcon
            data-no-window-drag
            data-page="snippets"
            size="md"
            onClick={() => onOpenPanel('snippets')}
            title="Mis comandos"
            aria-label="Mis comandos"
            style={iconStyle(isComandos)}
            className="hover:bg-[var(--interactive-hover)] hover:text-[var(--text-primary)] transition-colors duration-150"
          >
            <Code2 size={16} />
          </ActionIcon>
        )}
      </Group>
    </div>
  );
};

export default SidebarSessionActions;
