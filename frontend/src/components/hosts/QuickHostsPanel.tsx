import React, { useRef, useState, useEffect } from 'react';
import { UnstyledButton, ActionIcon } from '@mantine/core';

export interface QuickHost {
  id: string;
  name: string;
  host: string;
  port: number;
}

interface QuickHostsPanelProps {
  hosts?: QuickHost[];
  onHostSelect: (host: QuickHost | null) => void;
  selectedHostId?: string | null;
  'data-tour'?: string;
}

const QuickHostsPanel: React.FC<QuickHostsPanelProps> = ({ 
  hosts = [], 
  onHostSelect, 
  selectedHostId,
  'data-tour': dataTour
}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Hosts por defecto si no se proporcionan
  const defaultHosts: QuickHost[] = [
    { id: 'pi4', name: 'pi4', host: '200.115.181.211', port: 9000 }
  ];

  const hostsToShow = hosts.length > 0 ? hosts : defaultHosts;

  const checkScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    setCanScrollLeft(scroller.scrollLeft > 0);
    setCanScrollRight(scroller.scrollLeft < scroller.scrollWidth - scroller.clientWidth - 1);
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [hostsToShow]);

  const handleHostClick = (host: QuickHost) => {
    if (selectedHostId === host.id) {
      onHostSelect(null);
    } else {
      onHostSelect(host);
    }
  };

  const scrollLeft = () => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
    }
  };

  return (
    <header 
      className="w-full bg-secondary border-b border-subtle px-4 flex flex-row items-center gap-3 m-0 h-9 sticky top-0 z-10 overflow-hidden" 
      aria-label="Hosts rápidos" 
      data-tour={dataTour}
    >
      <h2 className="m-0 text-[11px] font-semibold text-secondary whitespace-nowrap shrink-0 tracking-wider uppercase opacity-80 border-r border-subtle pr-3 leading-4 hidden sm:block">
        Hosts rápidos
      </h2>
      
      <div className="relative flex items-center flex-1 h-full min-w-0">
        {canScrollLeft && (
          <ActionIcon
            variant="transparent"
            className="absolute left-0 top-0 bottom-0 w-6 h-full rounded-none bg-secondary/90 hover:bg-secondary text-secondary hover:text-accent z-[5]"
            onClick={scrollLeft}
            aria-label="Scroll izquierda"
          >
            ‹
          </ActionIcon>
        )}

        <div 
          ref={scrollerRef}
          className="flex flex-row overflow-x-auto overflow-y-hidden flex-1 h-full scrollbar-none"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
          onScroll={checkScroll}
        >
          {hostsToShow.map(host => {
            const isActive = selectedHostId === host.id;
            return (
              <UnstyledButton
                key={host.id}
                className={`
                  relative px-3.5 h-full flex items-center shrink-0 transition-all duration-250 ease-out text-secondary
                  hover:bg-tertiary/50 hover:text-primary
                  ${isActive ? 'text-accent bg-accent/5' : ''}
                `}
                onClick={() => handleHostClick(host)}
                aria-pressed={isActive}
                title={`Conectar a ${host.name}`}
              >
                <span className={`text-xs whitespace-nowrap ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {host.name}
                </span>
                
                {/* Active indicator bar */}
                <div 
                  className={`absolute bottom-0 left-0 right-0 h-[2px] bg-accent transition-transform duration-250 ease-out origin-center ${isActive ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'}`}
                />
              </UnstyledButton>
            );
          })}
        </div>

        {canScrollRight && (
          <ActionIcon
            variant="transparent"
            className="absolute right-0 top-0 bottom-0 w-6 h-full rounded-none bg-secondary/90 hover:bg-secondary text-secondary hover:text-accent z-[5]"
            onClick={scrollRight}
            aria-label="Scroll derecha"
          >
            ›
          </ActionIcon>
        )}
      </div>
    </header>
  );
};

export default QuickHostsPanel;
