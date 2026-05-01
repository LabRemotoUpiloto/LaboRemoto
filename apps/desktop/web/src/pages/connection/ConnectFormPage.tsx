// Página dedicada para el formulario de conexión SSH
import React, { useCallback, useState } from 'react';
import ConnectForm from '../../components/connect/ConnectForm';
import QuickHostsPanel, { QuickHost } from '../../components/hosts/QuickHostsPanel';
import RecentConnectionsPanel, { RecentConnection } from '../../components/connect/RecentConnectionsPanel';
import { useRecentConnections } from '../../hooks/useRecentConnections';
import './ConnectFormPage.css';

interface ConnectFormPageProps {
    onConnected: (session: { id: string; label: string }) => void;
    initialPayload?: any | null;
}

const ConnectFormPage: React.FC<ConnectFormPageProps> = ({ onConnected, initialPayload }) => {
    // Hook para gestionar conexiones recientes
    const { recentConnections, saveConnection, clearConnections } = useRecentConnections();

    // Quick Hosts: Hosts predefinidos por el administrador/sistema
    // Solo contienen IP y puerto, sin credenciales
    const quickHosts: QuickHost[] = [
        { id: 'pi4', name: 'Raspberry Pi 4', host: '200.115.181.211', port: 9000 },
        // Puedes agregar más hosts aquí que quieras ofrecer a los usuarios
        // { id: 'server1', name: 'Servidor Principal', host: '192.168.1.100', port: 22 },
        // { id: 'dev', name: 'Ambiente Dev', host: 'dev.example.com', port: 2222 },
    ];

    const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
    const [activeQuickHost, setActiveQuickHost] = useState<QuickHost | null>(null);
    const [activeRecentConnection, setActiveRecentConnection] = useState<RecentConnection | null>(null);

    const selectQuickHost = useCallback((host: QuickHost | null) => {
        if (host) {
            setSelectedHostId(host.id);
            setActiveQuickHost(host);
            setActiveRecentConnection(null); // Limpiar selección de recientes
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
        setActiveQuickHost(null); // Limpiar selección de quick hosts
        setSelectedHostId(null);
    }, []);

    return (
        <div className="connect-form-page">
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
            <div className="connect-form-page__content" data-tour="connect-form">
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
