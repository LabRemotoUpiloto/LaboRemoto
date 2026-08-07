import React from 'react';
import AgentHomeHero from './AgentHomeHero';
import { useDisplayName } from './useDisplayName';

interface LandingPageProps {
  onStartTutorial?: () => void;
  onOpenPanel?: (panelId: string) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStartTutorial, onOpenPanel }) => {
  const displayName = useDisplayName();

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
    </div>
  );
};

export default LandingPage;
