import React from 'react';
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
  // Hosts por defecto si no se proporcionan
  const defaultHosts: QuickHost[] = [
    { id: 'pi4', name: 'pi4', host: '200.115.181.211', port: 9000 }
  ];

  const hostsToShow = hosts.length > 0 ? hosts : defaultHosts;

  const handleHostClick = (host: QuickHost) => {
    onHostSelect(host);
  };

  return (
    <header className="quick-host-header" aria-label="Hosts rápidos">
      <h2>Hosts rápidos</h2>
      <div className="quick-hosts-scroller">
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
    </header>
  );
};

export default QuickHostsPanel;
