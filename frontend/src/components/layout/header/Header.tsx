import React, { useState, useRef } from 'react';
import { Group } from '@mantine/core';
import type { ActiveView } from '../../../hooks/useAppTabs';
import { Tab } from './HeaderConstants';

// Sub-components
import PanelTabs from './PanelTabs';
import SessionTabs from './SessionTabs';
import HeaderActions from './HeaderActions';
import UserMenu from './UserMenu';

interface HeaderProps {
  openPanels: string[];
  activePanel: string;
  onPanelClick: (panelId: string) => void;
  onPanelClose: (panelId: string) => void;
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewSession: () => void;
  onReorderTabs: (dragID: string, dropID: string) => void;
  onReorderPanels: (dragID: string, dropID: string) => void;
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  showViewToggle?: boolean;
  isChatOpen: boolean;
  onToggleChat: () => void;
  onToggleCamera?: () => void;
  onTogglePins?: () => void;
  onToggleDomotica?: () => void;
  isCameraActive?: boolean;
  isPinsActive?: boolean;
  isDomoticaActive?: boolean;
  isSidebarExpanded?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  openPanels,
  activePanel,
  onPanelClick,
  onPanelClose,
  tabs,
  activeTabId,
  onTabClick,
  onCloseTab,
  onNewSession,
  activeView,
  onViewChange,
  showViewToggle = false,
  isChatOpen,
  onToggleChat,
  onReorderTabs,
  onReorderPanels,
  onToggleCamera,
  onTogglePins,
  isCameraActive = false,
  isPinsActive = false,
}) => {
  const dragRef = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const handleMouseDown = (e: React.MouseEvent, id: string, type: 'panel' | 'tab') => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = `${type}:${id}`;
  };

  const handleMouseEnter = (id: string) => {
    if (dragRef.current) setDragOver(id);
  };

  const handleMouseUp = (e: React.MouseEvent, dropId: string, type: 'panel' | 'tab') => {
    if (!dragRef.current) return;
    const [dragType, dragId] = dragRef.current.split(':');
    if (dragId && dragId !== dropId && dragType === type) {
      if (type === 'panel') onReorderPanels(dragId, dropId);
      if (type === 'tab') onReorderTabs(dragId, dropId);
    }
    dragRef.current = null;
    setDragOver(null);
  };

  const handleMouseUpGlobal = () => {
    dragRef.current = null;
    setDragOver(null);
  };

  const sharedDragProps = {
    dragOver,
    dragRef,
    handleMouseDown,
    handleMouseEnter,
    handleMouseUp,
  };

  return (
    <header
      className="fixed top-0 right-0 z-[2000] flex items-center bg-secondary border-b border-subtle transition-[left] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
      style={{ left: 'var(--sidebar-width)', height: '44px' }}
      role="banner"
      onMouseUp={handleMouseUpGlobal}
    >
      <Group h={44} px={0} justify="space-between" className="w-full" wrap="nowrap" gap="xs">
        <div className="flex-1 flex items-center overflow-hidden h-full">
          <PanelTabs 
            openPanels={openPanels}
            activePanel={activePanel}
            onPanelClick={onPanelClick}
            onPanelClose={onPanelClose}
            {...sharedDragProps}
          />

          <SessionTabs 
            tabs={tabs}
            activeTabId={activeTabId}
            onTabClick={onTabClick}
            onCloseTab={onCloseTab}
            onNewSession={onNewSession}
            activePanel={activePanel}
            {...sharedDragProps}
          />
        </div>

        <Group gap={4} wrap="nowrap" shrink={0} pr="md">
          <HeaderActions 
            showViewToggle={showViewToggle}
            activeView={activeView}
            onViewChange={onViewChange}
            isChatOpen={isChatOpen}
            onToggleChat={onToggleChat}
            onToggleCamera={onToggleCamera}
            onTogglePins={onTogglePins}
            isCameraActive={isCameraActive}
            isPinsActive={isPinsActive}
          />

          <div className="w-[1px] h-4 bg-border-subtle mx-1" />

          <UserMenu />
        </Group>
      </Group>
    </header>
  );
};

export default Header;
