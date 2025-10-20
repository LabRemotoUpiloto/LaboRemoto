import React from 'react';
import './RecentConnectionsPanel.css';

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

  return (
    <div className="recent-connections" title="Historial de tus últimas 8 conexiones SSH. Auto-limpieza cada 30 días">
      <div className="recent-connections__header">
        <h3 className="recent-connections__title">
          🕒 Conexiones recientes
        </h3>
        {onClear && (
          <button
            className="recent-connections__clear-btn"
            onClick={onClear}
            title="Limpiar todo el historial de conexiones recientes"
          >
            Limpiar
          </button>
        )}
      </div>
      
      <div className="recent-connections__list">
        {connections.map((conn) => {
          // Detectar si es Raspberry Pi
          const isRaspberryPi = conn.host === '200.115.181.211' && conn.port === 9000;
          const displayHost = isRaspberryPi ? 'Raspberry Pi 4' : conn.host;
          const showPort = !isRaspberryPi && conn.port !== 22;
          
          return (
            <button
              key={conn.id}
              className="recent-connection-item"
              onClick={() => onSelect(conn)}
              title={`Rellenar formulario con ${conn.user}@${displayHost}${showPort ? ':' + conn.port : ''}. Última conexión: ${formatRelativeTime(conn.lastConnected)}`}
            >
              <div className="recent-connection-item__main">
                <span className="recent-connection-item__user">{conn.user}</span>
                <span className="recent-connection-item__separator">@</span>
                <span className="recent-connection-item__host">{displayHost}</span>
                {showPort && (
                  <span className="recent-connection-item__port">:{conn.port}</span>
                )}
              </div>
              <span className="recent-connection-item__time">
                {formatRelativeTime(conn.lastConnected)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RecentConnectionsPanel;
