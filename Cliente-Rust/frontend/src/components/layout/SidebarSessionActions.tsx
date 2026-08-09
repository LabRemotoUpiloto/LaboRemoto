import React from 'react';
import { Group, ActionIcon, Menu, Text, UnstyledButton } from '@mantine/core';
import { MessageSquare } from 'lucide-react';
import type { ActiveView } from '../../hooks/useAppTabs';
import { PANEL_ICONS } from './header/HeaderConstants';

type Props = {
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

/** Acciones de sesión en el sidebar (sustituye la barra superior). Orden:
 *  Chat, Cámara, Escritorio remoto, Pines — igual en expandido y colapsado. */
const SidebarSessionActions: React.FC<Props> = ({
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
  const onToggleEscritorio = () => onViewChange(activeView === 'terminal' ? 'escritorio' : 'terminal');

  // ── Rail colapsado: un solo botón (ícono de chat) que despliega las 4
  //    opciones en menú — misma estrategia que el grupo de sesiones. ──
  if (collapsed) {
    const anyActive = isChatOpen || isCameraActive || isEscritorioActive || isPinsActive;
    return (
      <div className="pb-2 mb-1 border-b flex flex-col" style={{ borderColor: 'var(--border-subtle)' }}>
        <Menu shadow="md" width={190} position="right-start" withinPortal offset={8}>
          <Menu.Target>
            <UnstyledButton
              data-no-window-drag
              aria-label="Vista"
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
          </Menu.Dropdown>
        </Menu>
      </div>
    );
  }

  return (
    <div className="px-2 pb-2 mb-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
      <Text
        size="xs"
        fw={600}
        px={8}
        mb={4}
        style={{
          color: 'var(--text-muted)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontSize: '10px',
        }}
      >
        Vista
      </Text>
      <Group gap={4} px={4} wrap="nowrap">
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
      </Group>
    </div>
  );
};

export default SidebarSessionActions;
