// Página de conexión SSH — layout con Tailwind, ConnectFormPage.css eliminado
import React, { useCallback, useState } from 'react';
import ConnectForm from '../../components/connect/ConnectForm';
import QuickHostsPanel, { QuickHost } from '../../components/hosts/QuickHostsPanel';
import RecentConnectionsPanel, { RecentConnection } from '../../components/connect/RecentConnectionsPanel';
import { useRecentConnections } from '../../hooks/useRecentConnections';
import { KNOWN_DEVICES } from '../../constants/devices';

interface ConnectFormPageProps {
  onConnected: (session: { id: string; label: string }) => void;
  initialPayload?: any | null;
}

const ConnectFormPage: React.FC<ConnectFormPageProps> = ({ onConnected, initialPayload }) => {
  const { recentConnections, saveConnection, clearConnections } = useRecentConnections();

  // Quick Hosts tomados de constants/devices (sin hardcoding)
  const quickHosts: QuickHost[] = [
    {
      id: 'pi4',
      name: KNOWN_DEVICES.RASPBERRY_PI_4.label,
      host: KNOWN_DEVICES.RASPBERRY_PI_4.host,
      port: KNOWN_DEVICES.RASPBERRY_PI_4.port,
    },
  ];

  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [activeQuickHost, setActiveQuickHost] = useState<QuickHost | null>(null);
  const [activeRecentConnection, setActiveRecentConnection] = useState<RecentConnection | null>(null);

  const selectQuickHost = useCallback((host: QuickHost | null) => {
    if (host) {
      setSelectedHostId(host.id);
      setActiveQuickHost(host);
      setActiveRecentConnection(null);
    } else {
      setSelectedHostId(null);
      setActiveQuickHost(null);
    }
  }, []);

  const clearQuickHost = useCallback(() => {
    setSelectedHostId(null);
    setActiveQuickHost(null);
  }, []);

  const selectRecentConnection = useCallback((connection: RecentConnection) => {
    setActiveRecentConnection(connection);
    setActiveQuickHost(null);
    setSelectedHostId(null);
  }, []);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Paneles laterales */}
      <div className="flex flex-col gap-0 w-56 flex-shrink-0 border-r border-white/5 overflow-y-auto">
        <QuickHostsPanel
          hosts={quickHosts}
          onHostSelect={selectQuickHost}
          selectedHostId={selectedHostId}
          data-tour="quick-hosts-panel"
        />
        <RecentConnectionsPanel
          connections={recentConnections}
          onSelect={selectRecentConnection}
          onClear={clearConnections}
        />
      </div>

      {/* Formulario centrado */}
      <div
        className="flex-1 flex items-center justify-center p-8 overflow-y-auto"
        data-tour="connect-form"
      >
        <ConnectForm
          onConnected={onConnected}
          initialPayload={initialPayload}
          quickHost={activeQuickHost}
          recentConnection={activeRecentConnection}
          recentConnections={recentConnections}
          onQuickHostCleared={clearQuickHost}
          onConnectionSuccess={saveConnection}
        />
      </div>
    </div>
  );
};

export default ConnectFormPage;
