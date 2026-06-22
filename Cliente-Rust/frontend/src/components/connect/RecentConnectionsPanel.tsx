import React from 'react';
import { UnstyledButton, Collapse, Tooltip } from '@mantine/core';
import { Clock, ChevronRight, Trash2, Monitor } from 'lucide-react';
import { isRaspberryPi4 } from '../../constants/devices';

export interface RecentConnection {
  id: string;
  host: string;
  port: number;
  user: string;
  lastConnected: number;
}

interface RecentConnectionsPanelProps {
  connections: RecentConnection[];
  onSelect: (connection: RecentConnection) => void;
  onClear?: () => void;
}

const RecentConnectionsPanel: React.FC<RecentConnectionsPanelProps> = ({
  connections,
  onSelect,
  onClear,
}) => {
  if (connections.length === 0) return null;

  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return 'ahora';
  };

  const [isExpanded, setIsExpanded] = React.useState(true);

  return (
    <div>
      {/* Header */}
      <div
        className="w-full flex items-center justify-between py-1 group cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Clock size={14} style={{ color: 'var(--text-secondary)' }} />
          <span className="text-xs font-semibold uppercase tracking-wider style={{ color: 'var(--text-secondary)' }}">
            Recientes ({connections.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onClear && isExpanded && (
            <Tooltip label="Limpiar historial" position="left" withArrow openDelay={300}>
              <button
                className="p-1 rounded transition-colors text-[var(--text-secondary)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onClear(); }}
              >
                <Trash2 size={12} />
              </button>
            </Tooltip>
          )}
          <ChevronRight
            size={14}
            style={{ color: 'var(--text-secondary)' }}
            className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
          />
        </div>
      </div>

      <Collapse in={isExpanded}>
        <div className="flex flex-col gap-1.5 mt-2 max-h-[200px] overflow-y-auto pr-1">
          {connections.map((conn) => {
            const isKnownDevice = isRaspberryPi4(conn.host, conn.port);
            const displayHost = isKnownDevice ? 'Raspberry Pi 4' : conn.host;
            const showPort = !isKnownDevice && conn.port !== 22;

            return (
              <UnstyledButton
                key={conn.id}
                className="group/item flex items-center gap-2.5 w-full px-2.5 py-2 transition-all duration-150 hover:bg-[var(--interactive-hover)] active:scale-[0.99] cursor-pointer"
                style={{ borderRadius: 'var(--radius-md)' }}
                onClick={() => onSelect(conn)}
                title={`${conn.user}@${displayHost}${showPort ? ':' + conn.port : ''}`}
              >
                <div className="flex items-center justify-center w-6 h-6 shrink-0 transition-colors" style={{ backgroundColor: 'color-mix(in srgb, var(--border-subtle) 40%, transparent)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)' }}>
                  <Monitor size={12} />
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-[12px] font-medium text-[var(--text-primary)] truncate leading-tight">
                    <span style={{ color: 'var(--accent-primary)' }}>{conn.user}</span>
                    <span style={{ color: 'var(--text-secondary)' }} className="mx-0.5">@</span>
                    <span>{displayHost}</span>
                    {showPort && <span style={{ color: 'var(--text-secondary)' }}>:{conn.port}</span>}
                  </span>
                </div>
                <span className="text-[10px] text-[var(--text-secondary)] tabular-nums whitespace-nowrap shrink-0">
                  {formatRelativeTime(conn.lastConnected)}
                </span>
              </UnstyledButton>
            );
          })}
        </div>
      </Collapse>
    </div>
  );
};

export default RecentConnectionsPanel;
