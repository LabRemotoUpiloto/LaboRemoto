import React from 'react';
import { Terminal } from 'lucide-react';
import AgentHomeHero from './AgentHomeHero';
import { useDisplayName } from './useDisplayName';
import { useAuth } from '../../contexts/AuthContext';

interface LandingPageProps {
  onStartTutorial?: () => void;
  onOpenPanel?: (panelId: string) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStartTutorial, onOpenPanel }) => {
  const displayName = useDisplayName();
  const { isAuthenticated } = useAuth();

  return (
    <div className="relative w-full h-full overflow-hidden bg-transparent flex items-center justify-center">
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(135deg,transparent_0_63%,color-mix(in_srgb,var(--background-tertiary)_44%,transparent)_63%_100%),_repeating-linear-gradient(135deg,transparent_0_46px,color-mix(in_srgb,var(--text-primary)_2%,transparent)_46px_47px)] opacity-55"
        aria-hidden
      />
      <div className="flex flex-col items-stretch justify-center w-full max-w-[1060px] flex-1 min-h-0 gap-0 z-10">
        <AgentHomeHero
          displayName={displayName}
          onOpenPanel={onOpenPanel}
          onStartTutorial={onStartTutorial}
        />
      </div>

      {/* Alternativa para quien no puede iniciar sesion con Keycloak (ej. un
          invitado sin cuenta institucional) pero necesita conectarse a un
          servidor por SSH igual -- discreta a proposito, no compite con el
          CTA principal de "Iniciar sesion". */}
      {!isAuthenticated && onOpenPanel && (
        <button
          type="button"
          onClick={() => onOpenPanel('ssh-guest')}
          className="absolute right-5 bottom-5 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--background-secondary)]/70 hover:bg-[var(--interactive-hover)] border border-[var(--border-subtle)] backdrop-blur-sm transition-colors"
        >
          <Terminal size={13} />
          <span>Conexión SSH</span>
        </button>
      )}
    </div>
  );
};

export default LandingPage;
