import React, { useRef, useEffect, useLayoutEffect } from 'react';
import { Tabs, UnstyledButton, rem } from '@mantine/core';
import { gsap } from 'gsap';
import { CloseIcon, Tab } from './HeaderConstants';

interface SessionTabsProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewSession: () => void;
  activePanel: string;
  dragOver: string | null;
  dragRef: React.MutableRefObject<string | null>;
  handleMouseDown: (e: React.MouseEvent, id: string, type: 'panel' | 'tab') => void;
  handleMouseEnter: (id: string) => void;
  handleMouseUp: (e: React.MouseEvent, dropId: string, type: 'panel' | 'tab') => void;
}

const SessionTabs: React.FC<SessionTabsProps> = ({
  tabs,
  activeTabId,
  onTabClick,
  onCloseTab,
  onNewSession,
  activePanel,
  dragOver,
  dragRef,
  handleMouseDown,
  handleMouseEnter,
  handleMouseUp,
}) => {
  const sessionsRef = useRef<HTMLDivElement | null>(null);

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

  // Horizontal wheel scroll
  useEffect(() => {
    const el = sessionsRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Entry animation for session tabs
  useLayoutEffect(() => {
    const sessions = sessionsRef.current?.querySelectorAll('[role="tab"]');
    if (sessions && sessions.length > 0) {
      const lastSession = sessions[sessions.length - 1];
      gsap.fromTo(lastSession,
        { scale: 0.8, opacity: 0, x: 15 },
        { scale: 1, opacity: 1, x: 0, duration: 0.4, ease: "back.out(1.5)" }
      );
    }
  }, [tabs.length]);

  const sessionTabsList = tabs.filter(t => t.type === 'session');

  if (sessionTabsList.length === 0 && activePanel !== 'terminal') return null;

  return (
    <div className="flex items-center h-full px-2 gap-2 border-l border-subtle ml-2 bg-primary/30">
      <div className="flex items-center overflow-x-auto scrollbar-none" ref={sessionsRef}>
        <Tabs
          value={activeTabId}
          onChange={(val) => val && onTabClick(val)}
          variant="pills"
          styles={{
            root: { height: '100%' },
            tabsList: { height: '100%', gap: rem(6), padding: `0 ${rem(4)}`, border: 0, flexWrap: 'nowrap' },
            tab: {
              height: rem(28),
              alignSelf: 'center',
              fontSize: rem(11),
              padding: `0 ${rem(12)}`,
              borderRadius: rem(6),
              border: '1px solid transparent',
              '&[data-active]': {
                backgroundColor: 'var(--interactive-selected)',
                borderColor: 'var(--accent-primary)',
                color: 'var(--accent-primary)',
              },
              '&.tab-closing': {
                pointerEvents: 'none',
                opacity: 0,
                transform: 'scale(0.8) translateX(-5px)',
                transition: 'all 0.3s ease'
              }
            }
          }}
        >
          <Tabs.List>
            {sessionTabsList.map(t => {
              const isActive = activeTabId === t.id;
              const isDragOver = dragOver === t.id && dragRef.current !== `tab:${t.id}`;
              return (
                <Tabs.Tab
                  key={t.id}
                  value={t.id}
                  leftSection={
                    <div className={`w-[6px] h-[6px] rounded-full shrink-0 ${isActive ? 'bg-[#4ade80]' : 'bg-secondary opacity-50'}`} />
                  }
                  rightSection={
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={`Cerrar sesión ${t.label}`}
                      onClick={(e) => animateClose(e as any, () => onCloseTab(t.id))}
                      className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 3, flexShrink: 0 }}
                    >
                      <CloseIcon size={9} />
                    </span>
                  }
                  style={isActive ? {
                    backgroundColor: 'var(--interactive-selected)',
                    border: '1px solid var(--accent-primary)',
                    color: 'var(--accent-primary)',
                  } : {}}
                  className={`group ${isDragOver ? 'border-l-2 border-l-accent bg-accent/10' : ''}`}
                  onMouseDown={(e) => handleMouseDown(e, t.id, 'tab')}
                  onMouseEnter={() => handleMouseEnter(t.id)}
                  onMouseUp={(e) => handleMouseUp(e, t.id, 'tab')}
                >
                  {t.label}
                </Tabs.Tab>
              );
            })}
          </Tabs.List>
        </Tabs>
        <UnstyledButton
          className="flex items-center justify-center w-[24px] h-[24px] rounded-md text-secondary hover:text-primary hover:bg-secondary transition-colors shrink-0"
          onClick={onNewSession}
        >
          <svg viewBox="0 0 13 13" fill="none" className="w-3 h-3"><path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
        </UnstyledButton>
      </div>
    </div>
  );
};

export default SessionTabs;
