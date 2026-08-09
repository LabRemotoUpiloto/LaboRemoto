import React from 'react';
import { GraduationCap } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { unipilotoLogo } from '../../assets/logoBase64';

interface AgentHomeHeroProps {
  displayName: string;
  onOpenPanel?: (panelId: string) => void;
  onStartTutorial?: () => void;
}

const AgentHomeHero: React.FC<AgentHomeHeroProps> = ({
  displayName,
  onStartTutorial,
}) => {
  const { isAuthenticated, login, isLoading } = useAuth();

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1.15fr_0.85fr] gap-8 md:gap-16 items-center w-full h-full max-w-[1120px] mx-auto px-4 py-6 md:p-10 box-border animate-[agent-home-in_0.55s_ease-out_both]">
      {/* Columna Izquierda: Contenido e información */}
      <div className="flex flex-col items-center text-center md:items-start md:text-left">
        <div className="inline-flex items-center gap-3 mb-5 md:mb-6 text-[11px] font-extrabold tracking-[0.16em] uppercase text-[var(--text-secondary)]">
          <img src={unipilotoLogo} alt="Universidad Piloto de Colombia" className="w-[34px] h-[34px] object-contain bg-white rounded-lg p-1 border border-[var(--border-subtle)]" />
          <span>Laboratorio remoto Unipiloto</span>
        </div>

        <h1 id="landing-title" className="m-0 max-w-[680px] text-[clamp(2.55rem,10vw,4.1rem)] md:text-[clamp(3.2rem,7.4vw,5.5rem)] font-[850] tracking-[-0.075em] leading-[0.94] text-[var(--text-primary)] flex flex-col items-center text-center md:items-start md:text-left">
          Laboratorio
          <span className="flex items-center justify-center md:justify-start gap-3 md:gap-[clamp(16px,2.4vw,28px)] text-[#d51f22]">
            <span>remoto</span>
          </span>
        </h1>

        <p className="mt-4 mb-6 md:mt-6 md:mb-8 max-w-[540px] text-[0.95rem] md:text-[1.05rem] leading-[1.6] text-[var(--text-secondary)] text-center md:text-left">
          {displayName ? `${displayName}, bienvenido` : 'Bienvenido'} a tu espacio de prácticas. Aquí podrás interactuar de forma real y segura con equipos de laboratorio para complementar tu formación académica.
        </p>

        {!isAuthenticated ? (
          <div className="flex justify-center md:justify-start w-full">
            <button
              type="button"
              className="group inline-flex items-center gap-2.5 px-7 py-3.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] active:translate-y-0 active:shadow-[0_4px_10px_-2px_var(--accent-guard-shadow,rgba(0,0,0,0.3))] text-white border-none rounded-full text-[13.5px] font-bold cursor-pointer shadow-[0_6px_16px_-4px_var(--accent-guard-shadow,rgba(0,0,0,0.3))] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-4px_var(--accent-guard-shadow,rgba(0,0,0,0.45))] disabled:opacity-70 disabled:cursor-not-allowed"
              onClick={login}
              disabled={isLoading}
            >
              <span>{isLoading ? 'Iniciando...' : 'Iniciar sesión'}</span>
            </button>
          </div>
        ) : (
          onStartTutorial && (
            <div className="flex justify-center md:justify-start w-full">
              <button
                type="button"
                className="group inline-flex items-center gap-2.5 px-7 py-3.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] active:translate-y-0 active:shadow-[0_4px_10px_-2px_rgba(213,31,34,0.3)] text-white border-none rounded-full text-[13.5px] font-bold cursor-pointer shadow-[0_6px_16px_-4px_rgba(213,31,34,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-4px_rgba(213,31,34,0.45)]"
                onClick={onStartTutorial}
              >
                <GraduationCap size={18} strokeWidth={2} className="text-white transition-transform duration-200 group-hover:scale-110 group-hover:rotate-6" />
                <span>Iniciar recorrido</span>
              </button>
            </div>
          )
        )}
      </div>

      {/* Columna Derecha: Composición de la Mascota */}
      <div className="flex justify-center items-center w-full">
        <div className="relative w-[240px] h-[240px] md:w-[320px] md:h-[320px] flex items-center justify-center">
          {/* Ejes (Crosshair) */}
          <div className="absolute z-0 left-0 right-0 top-1/2 h-[1px] bg-[var(--border-subtle)] opacity-40 pointer-events-none" />
          <div className="absolute z-0 top-0 bottom-0 left-1/2 w-[1px] bg-[var(--border-subtle)] opacity-40 pointer-events-none" />

          {/* Anillos orbitales */}
          <div className="absolute z-0 w-[210px] h-[210px] md:w-[280px] md:h-[280px] rounded-full border border-dashed border-[var(--accent-primary)] opacity-25 pointer-events-none" />
          <div className="absolute z-0 w-[176px] h-[176px] md:w-[236px] md:h-[236px] rounded-full border border-[var(--border-subtle)] opacity-50 pointer-events-none" />

          {/* Círculo central con Mascota */}
          <div className="relative z-10 w-[140px] h-[140px] md:w-[190px] md:h-[190px] rounded-full bg-[var(--background-secondary)] border border-[var(--border-strong)] flex items-center justify-center overflow-hidden shadow-[0_20px_40px_-15px_rgba(0,0,0,0.22),_inset_0_2px_4px_rgba(255,255,255,0.05)] transition-all duration-300 hover:scale-[1.03] hover:border-[var(--accent-primary)]">
            <img src="/abeja1.jpeg" alt="Mascota Abeja" className="w-[96px] h-[96px] md:w-[130px] md:h-[130px] object-contain rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentHomeHero;
