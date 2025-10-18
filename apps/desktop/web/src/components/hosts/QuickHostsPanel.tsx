import React, { useRef, useState, useEffect } from 'react';
import './QuickHostsPanel.css';

export interface QuickHost {
  id: string;
  name: string;
  host: string;
  port: number;
}

interface QuickHostsPanelProps {
  hosts?: QuickHost[];
  onHostSelect: (host: QuickHost) => void;
  selectedHostId?: string | null;
}

const QuickHostsPanel: React.FC<QuickHostsPanelProps> = ({ 
  hosts = [], 
  onHostSelect, 
  selectedHostId 
}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [showDots, setShowDots] = useState(false);

  // Hosts por defecto si no se proporcionan
  const defaultHosts: QuickHost[] = [
    { id: 'pi4', name: 'pi4', host: '200.115.181.211', port: 9000 }
  ];

  const hostsToShow = hosts.length > 0 ? hosts : defaultHosts;

  // Verificar si se puede hacer scroll
  const checkScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const hasOverflow = scroller.scrollWidth > scroller.clientWidth;
    setShowDots(hasOverflow);
    setCanScrollLeft(scroller.scrollLeft > 0);
    setCanScrollRight(scroller.scrollLeft < scroller.scrollWidth - scroller.clientWidth - 1);
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [hostsToShow]);

  const handleHostClick = (host: QuickHost) => {
    onHostSelect(host);
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
    <header className="quick-host-header" aria-label="Hosts rápidos">
      <h2>Hosts rápidos</h2>
      
      <div className="quick-hosts-wrapper">
        {canScrollLeft && (
          <button
            type="button"
            className="quick-hosts-nav quick-hosts-nav--left"
            onClick={scrollLeft}
            aria-label="Scroll izquierda"
          >
            ‹
          </button>
        )}

        <div 
          ref={scrollerRef}
          className="quick-hosts-scroller"
          onScroll={checkScroll}
        >
          {hostsToShow.map(host => (
            <button
              key={host.id}
              type="button"
              className={`quick-host-pill ${selectedHostId === host.id ? 'selected' : ''}`}
              onClick={() => handleHostClick(host)}
              aria-pressed={selectedHostId === host.id}
              title={`Rellenar host ${host.name}`}
            >
              <span className="qh-name">{host.name}</span>
              <span className="qh-addr">{host.host}:{host.port}</span>
            </button>
          ))}
        </div>

        {canScrollRight && (
          <button
            type="button"
            className="quick-hosts-nav quick-hosts-nav--right"
            onClick={scrollRight}
            aria-label="Scroll derecha"
          >
            ›
          </button>
        )}
      </div>

      {showDots && (
        <div className="quick-hosts-dots" aria-hidden="true">
          {hostsToShow.map((_, index) => (
            <span key={index} className="quick-hosts-dot"></span>
          ))}
        </div>
      )}
    </header>
  );
};

export default QuickHostsPanel;
