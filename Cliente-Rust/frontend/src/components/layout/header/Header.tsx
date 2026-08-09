import React, { useState, useRef } from 'react';
import type { ActiveView } from '../../../hooks/useAppTabs';
import { Tab } from './HeaderConstants';

import SessionTabs from './SessionTabs';
import HeaderActions from './HeaderActions';
import { WindowDragZone } from '../../window/WindowDragZone';

interface HeaderProps {
  activePanel: string;
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewSession: () => void;
  onNewLocalTerminal: () => void;
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
}

const Header: React.FC<HeaderProps> = ({
  activePanel,
  tabs,
  activeTabId,
  onTabClick,
  onCloseTab,
  onNewSession,
  onNewLocalTerminal,
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

  const sharedDragProps = { dragOver, dragRef, handleMouseDown, handleMouseEnter, handleMouseUp };
  return (
    <WindowDragZone
      as="header"
      className="app-header fixed z-[2000] flex items-center bg-primary transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
      role="banner"
      onMouseUp={handleMouseUpGlobal}
    >
      {/* Session tabs */}
      <div className="flex-1 overflow-hidden h-full flex items-center">
        <SessionTabs
          tabs={tabs}
          activeTabId={activeTabId}
          onTabClick={onTabClick}
          onCloseTab={onCloseTab}
          onNewSession={onNewSession}
          onNewLocalTerminal={onNewLocalTerminal}
          activePanel={activePanel}
          {...sharedDragProps}
        />
      </div>

      {/* Right actions — only visible when a session is open */}
      {showViewToggle && (
        <div className="h-full flex items-center gap-0.5 pr-3 pl-2 border-l border-subtle shrink-0">
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
        </div>
      )}
    </WindowDragZone>
  );
};

export default Header;
