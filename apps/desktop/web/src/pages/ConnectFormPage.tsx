// Página dedicada para el formulario de conexión SSH
import React, { useCallback, useMemo, useState } from 'react';
import ConnectForm from '../components/ConnectForm';
import QuickHostsPanel, { QuickHost } from '../components/QuickHostsPanel';
import './ConnectFormPage.css';

interface ConnectFormPageProps {
    onConnected: (session: { id: string; label: string }) => void;
    initialPayload?: any | null;
}

const ConnectFormPage: React.FC<ConnectFormPageProps> = ({ onConnected, initialPayload }) => {
    const quickHosts = useMemo<QuickHost[]>(() => ([
        { id: 'pi4', name: 'pi4', host: '200.115.181.211', port: 9000 },
    ]), []);

    const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
    const [activeQuickHost, setActiveQuickHost] = useState<QuickHost | null>(null);

    const selectQuickHost = useCallback((host: QuickHost) => {
        setSelectedHostId(host.id);
        setActiveQuickHost(host);
    }, []);

    const clearQuickHost = useCallback(() => {
        setSelectedHostId(null);
        setActiveQuickHost(null);
    }, []);

    return (
        <div className="connect-form-page">
            <QuickHostsPanel 
                hosts={quickHosts}
                onHostSelect={selectQuickHost}
                selectedHostId={selectedHostId}
            />
            <div className="connect-form-page__content">
                <ConnectForm
                    onConnected={onConnected}
                    initialPayload={initialPayload}
                    quickHost={activeQuickHost}
                    onQuickHostCleared={clearQuickHost}
                />
            </div>
        </div>
    );
};

export default ConnectFormPage;
