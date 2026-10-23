import React from 'react';
import { UnstyledButton, Tooltip } from '@mantine/core';

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
  const defaultHosts: QuickHost[] = [
    { id: 'pi4', name: 'Raspberry Pi 4', host: '200.115.181.211', port: 9000 }
  ];

  const hostsToShow = hosts.length > 0 ? hosts : defaultHosts;

  const handleHostClick = (host: QuickHost) => {
    if (selectedHostId === host.id) {
      onHostSelect(null);
    } else {
      onHostSelect(host);
    }
  };

  if (hostsToShow.length === 0) return null;

  return (
    <div data-tour={dataTour}>
      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3 block">
        Hosts rápidos
      </span>

      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(hostsToShow.length, 3)}, 1fr)` }}>
        {hostsToShow.map(host => {
          const isActive = selectedHostId === host.id;

          return (
            <Tooltip
              key={host.id}
              label={`${host.host}:${host.port}`}
              position="bottom"
              withArrow
              openDelay={400}
            >
              <UnstyledButton
                className={`group flex items-center gap-2.5 px-3.5 py-2.5 dribbble-quick-host cursor-pointer ${isActive ? 'active' : ''}`}
                onClick={() => handleHostClick(host)}
                aria-pressed={isActive}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-medium truncate leading-tight" style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                    {host.name}
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)] truncate leading-tight mt-0.5">
                    :{host.port}
                  </span>
                </div>
              </UnstyledButton>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};

export default QuickHostsPanel;
