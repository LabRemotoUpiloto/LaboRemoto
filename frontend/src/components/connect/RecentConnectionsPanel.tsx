import React from 'react';
import { UnstyledButton, Collapse, Text, Group } from '@mantine/core';

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

    if (days > 0) return `Hace ${days} día${days > 1 ? 's' : ''}`;
    if (hours > 0) return `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `Hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
    return 'Recién';
  };

  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <div 
      className={`mx-6 mt-4 border rounded-lg bg-secondary overflow-hidden transition-all duration-200 ${isExpanded ? 'border-accent/30 shadow-[0_4px_16px_rgba(0,0,0,0.1)]' : 'border-subtle'}`}
      title="Historial de tus últimas 8 conexiones SSH. Auto-limpieza cada 30 días"
    >
      <UnstyledButton 
        className="w-full flex items-center justify-between px-3.5 py-2.5 bg-secondary hover:bg-tertiary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent -outline-offset-2"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Group gap="xs" className="text-[13px] font-semibold text-secondary hover:text-primary transition-colors">
          <svg 
            className={`transition-transform duration-200 ${isExpanded ? 'rotate-90 text-accent' : 'text-muted'}`} 
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className={isExpanded ? 'text-primary' : ''}>Historial reciente ({connections.length})</span>
        </Group>
        
        {onClear && isExpanded && (
          <button
            className="bg-transparent border border-subtle text-muted px-2.5 py-0.5 text-[11px] rounded transition-all hover:bg-tertiary hover:border-strong hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            title="Limpiar todo el historial de conexiones recientes"
          >
            Limpiar
          </button>
        )}
      </UnstyledButton>
      
      <Collapse in={isExpanded}>
        <div className="flex flex-col gap-2 px-3.5 pb-3.5 pt-3 border-t border-subtle max-h-[250px] overflow-y-auto scrollbar-thin scrollbar-thumb-strong">
          {connections.map((conn) => {
            const isRaspberryPi = conn.host === '200.115.181.211' && conn.port === 9000;
            const displayHost = isRaspberryPi ? 'Raspberry Pi 4' : conn.host;
            const showPort = !isRaspberryPi && conn.port !== 22;
            
            return (
              <UnstyledButton
                key={conn.id}
                className="flex items-center justify-between w-full bg-tertiary border border-subtle rounded-md px-3 py-2 text-left font-mono text-[13px] transition-all hover:bg-tertiary hover:border-strong active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent -outline-offset-1"
                onClick={() => onSelect(conn)}
                title={`Rellenar formulario con ${conn.user}@${displayHost}${showPort ? ':' + conn.port : ''}. Última conexión: ${formatRelativeTime(conn.lastConnected)}`}
              >
                <div className="flex items-center flex-1 min-w-0">
                  <span className="text-primary font-medium truncate max-w-[100px]">{conn.user}</span>
                  <span className="text-muted mx-[3px]">@</span>
                  <span className="text-secondary truncate flex-1 min-w-0">{displayHost}</span>
                  {showPort && (
                    <span className="text-info ml-[2px] whitespace-nowrap">:{conn.port}</span>
                  )}
                </div>
                <Text size="xs" c="dimmed" className="whitespace-nowrap ml-3 tabular-nums font-mono">
                  {formatRelativeTime(conn.lastConnected)}
                </Text>
              </UnstyledButton>
            );
          })}
        </div>
      </Collapse>
    </div>
  );
};

export default RecentConnectionsPanel;
