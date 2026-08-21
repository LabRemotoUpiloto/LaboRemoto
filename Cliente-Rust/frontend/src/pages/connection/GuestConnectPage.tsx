// Conexión SSH minimalista, sin quick-hosts de laboratorio ni conexiones
// recientes -- pensada como alternativa para quien no puede iniciar sesión
// con Keycloak pero necesita conectarse a un servidor por SSH igual.
import React from 'react';
import { Paper, UnstyledButton } from '@mantine/core';
import { ArrowLeft } from 'lucide-react';
import ConnectForm from '../../components/connect/ConnectForm';

interface GuestConnectPageProps {
  onConnected: (session: { id: string; label: string }) => void;
  onBack?: () => void;
}

const GuestConnectPage: React.FC<GuestConnectPageProps> = ({ onConnected, onBack }) => {
  return (
    <div className="flex h-full overflow-hidden items-center justify-center">
      <div className="w-full max-w-lg px-6 py-8 overflow-y-auto max-h-full">
        {onBack && (
          <UnstyledButton
            onClick={onBack}
            className="inline-flex items-center gap-1.5 mb-4 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Volver</span>
          </UnstyledButton>
        )}
        <Paper p="xl" className="dribbble-card">
          <ConnectForm onConnected={onConnected} hideSaveHost />
        </Paper>
      </div>
    </div>
  );
};

export default GuestConnectPage;
