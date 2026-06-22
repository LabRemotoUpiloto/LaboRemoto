// Página de conexión SSH — layout unificado centrado
import React, { useCallback, useState } from 'react';
import { Paper, Divider } from '@mantine/core';
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
    <div className="flex h-full overflow-hidden items-center justify-center">
      <div className="w-full max-w-lg px-6 py-8 overflow-y-auto max-h-full">
        <Paper
          p="xl"
          className="dribbble-card"
        >
          {/* Quick Hosts integrados en la parte superior */}
          <div className="mb-5" data-tour="quick-hosts-panel">
            <QuickHostsPanel
              hosts={quickHosts}
              onHostSelect={selectQuickHost}
              selectedHostId={selectedHostId}
            />
          </div>

          {/* Separador sutil */}
          <Divider className="opacity-40 mb-5" />

          {/* Formulario principal */}
          <div data-tour="connect-form">
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

          {/* Conexiones recientes debajo del form */}
          {recentConnections.length > 0 && (
            <>
              <Divider className="opacity-40 mt-6 mb-4" />
              <RecentConnectionsPanel
                connections={recentConnections}
                onSelect={selectRecentConnection}
                onClear={clearConnections}
              />
            </>
          )}
        </Paper>
      </div>
    </div>
  );
};

export default ConnectFormPage;
