import React, { useRef } from 'react';
import { Tabs, ActionIcon, rem } from '@mantine/core';
import { gsap } from 'gsap';
import { PANEL_ICONS, PANEL_LABELS, CloseIcon } from './HeaderConstants';

interface PanelTabsProps {
  openPanels: string[];
  activePanel: string;
  onPanelClick: (panelId: string) => void;
  onPanelClose: (panelId: string) => void;
  dragOver: string | null;
  dragRef: React.MutableRefObject<string | null>;
  handleMouseDown: (e: React.MouseEvent, id: string, type: 'panel' | 'tab') => void;
  handleMouseEnter: (id: string) => void;
  handleMouseUp: (e: React.MouseEvent, dropId: string, type: 'panel' | 'tab') => void;
}

const PanelTabs: React.FC<PanelTabsProps> = ({
  openPanels,
  activePanel,
  onPanelClick,
  onPanelClose,
  dragOver,
  dragRef,
  handleMouseDown,
  handleMouseEnter,
  handleMouseUp,
}) => {
  const panelsRef = useRef<HTMLDivElement | null>(null);

  const animateClose = (e: React.MouseEvent, callback: () => void) => {
    e.stopPropagation();
    const tabEl = (e.currentTarget as HTMLElement).closest('[role="tab"]');
    if (tabEl) {
      gsap.to(tabEl, {
        scale: 0.85,
        opacity: 0,
        x: -20,
        duration: 0.35,
        ease: "power3.inOut",
        onComplete: callback
      });
    } else {
      callback();
    }
  };

  // Entry animation for new panel tabs
  React.useLayoutEffect(() => {
    const panels = panelsRef.current?.querySelectorAll('[role="tab"]');
    if (panels && panels.length > 0) {
      const lastPanel = panels[panels.length - 1];
      gsap.fromTo(lastPanel, 
        { scale: 0.8, opacity: 0, y: 8 },
        { scale: 1, opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.7)" }
      );
    }
  }, [openPanels.length]);

  return (
    <div ref={panelsRef} className="h-full">
      <Tabs
        value={activePanel}
        onChange={(val) => val && onPanelClick(val)}
        variant="outline"
        classNames={{
          root: '!border-0',
          tabsList: '!border-0 !border-b-0',
        }}
        styles={{
          root: { border: 0, borderBottom: 0, height: '100%' },
          tabsList: { border: 0, borderBottom: 0, height: '100%', paddingLeft: rem(12), flexWrap: 'nowrap' },
          tab: {
            height: rem(44),
            fontSize: rem(12),
            padding: `0 ${rem(16)}`,
            border: 0,
            borderBottom: '2px solid transparent',
            borderRadius: 0,
            transition: 'all 0.2s ease',
            '&[data-active]': {
              borderBottomColor: 'var(--accent-primary)',
              backgroundColor: 'var(--interactive-selected)',
              color: 'var(--accent-primary)',
            },
            '&:hover': {
              backgroundColor: 'var(--interactive-hover)',
              borderBottomColor: 'var(--border-subtle)',
            },
            '&.tab-closing': {
              pointerEvents: 'none',
              opacity: 0,
              transform: 'scale(0.9) translateX(-10px)',
              transition: 'all 0.3s ease'
            }
          }
        }}
      >
        <Tabs.List>
          {openPanels.map(panelId => {
            const isDragOver = dragOver === panelId && dragRef.current !== `panel:${panelId}`;
            return (
              <Tabs.Tab
                key={panelId}
                value={panelId}
                leftSection={
                  <span className="flex items-center shrink-0 w-3.5 h-3.5 text-current">
                    {PANEL_ICONS[panelId] || null}
                  </span>
                }
                rightSection={
                  panelId !== 'landing' && (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="xs"
                      onClick={(e) => animateClose(e, () => onPanelClose(panelId))}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <CloseIcon />
                    </ActionIcon>
                  )
                }
                style={panelId === activePanel ? {
                  borderBottom: '2px solid var(--accent-primary)',
                  backgroundColor: 'var(--interactive-selected)',
                  color: 'var(--accent-primary)',
                } : { borderBottom: '2px solid transparent' }}
                className={`group capitalize ${isDragOver ? 'border-l-2 border-l-accent bg-accent/10' : ''}`}
                onMouseDown={(e) => handleMouseDown(e, panelId, 'panel')}
                onMouseEnter={() => handleMouseEnter(panelId)}
                onMouseUp={(e) => handleMouseUp(e, panelId, 'panel')}
              >
                <span className="hidden sm:inline">{PANEL_LABELS[panelId] || panelId}</span>
              </Tabs.Tab>
            );
          })}
        </Tabs.List>
      </Tabs>
    </div>
  );
};

export default PanelTabs;
