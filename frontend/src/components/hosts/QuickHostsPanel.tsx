import React from 'react';
import { UnstyledButton, Tooltip } from '@mantine/core';
import { Server, Cpu, Monitor, Zap } from 'lucide-react';

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

const HOST_ICONS: Record<string, React.ElementType> = {
  pi4: Cpu,
  default: Server,
};

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
      <div className="flex items-center gap-2 mb-3">
        <Zap size={14} className="text-teal-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--mantine-color-dimmed)]">
          Hosts rápidos
        </span>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(hostsToShow.length, 3)}, 1fr)` }}>
        {hostsToShow.map(host => {
          const isActive = selectedHostId === host.id;
          const IconComponent = HOST_ICONS[host.id] ?? HOST_ICONS.default;

          return (
            <Tooltip
              key={host.id}
              label={`${host.host}:${host.port}`}
              position="bottom"
              withArrow
              openDelay={400}
            >
              <UnstyledButton
                className={`
                  group relative flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg
                  border transition-all duration-200 cursor-pointer
                  ${isActive 
                    ? 'border-teal-500/50 bg-teal-500/10 shadow-[0_0_12px_rgba(20,184,166,0.12)]' 
                    : 'border-[var(--mantine-color-default-border)] bg-[var(--mantine-color-body)] hover:border-teal-500/30 hover:bg-teal-500/5'
                  }
                `}
                onClick={() => handleHostClick(host)}
                aria-pressed={isActive}
              >
                <div className={`
                  flex items-center justify-center w-8 h-8 rounded-md shrink-0 transition-colors duration-200
                  ${isActive 
                    ? 'bg-teal-500/20 text-teal-400' 
                    : 'bg-[var(--mantine-color-default-border)]/50 text-[var(--mantine-color-dimmed)] group-hover:text-teal-400 group-hover:bg-teal-500/10'
                  }
                `}>
                  <IconComponent size={16} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className={`text-[13px] font-medium truncate leading-tight ${isActive ? 'text-teal-300' : 'text-[var(--mantine-color-text)]'}`}>
                    {host.name}
                  </span>
                  <span className="text-[11px] text-[var(--mantine-color-dimmed)] truncate leading-tight mt-0.5">
                    :{host.port}
                  </span>
                </div>

                {isActive && (
                  <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                )}
              </UnstyledButton>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};

export default QuickHostsPanel;
