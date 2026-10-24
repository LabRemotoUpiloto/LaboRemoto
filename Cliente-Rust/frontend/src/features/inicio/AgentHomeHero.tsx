// features/inicio/AgentHomeHero.tsx — la portada de Inicio (y del chat vacío): logo, «Laboratorio remoto», la bienvenida y la
// abeja. Sin sesión, el botón es «Iniciar sesión» (y, mientras se espera al navegador, abrirlo de nuevo o cancelar); con sesión,
// «Iniciar recorrido».
import React from 'react';
import { GraduationCap } from 'lucide-react';
import { Boton, BotonPrincipal, TARJETA } from '@/components/ui';
import { useAuth } from '@/features/cuenta/AuthContext';
import unipilotoLogo from '@/assets/unipiloto-logo.png';

interface AgentHomeHeroProps {
  displayName: string;
  onOpenPanel?: (panelId: string) => void;
  onStartTutorial?: () => void;
}

const AgentHomeHero: React.FC<AgentHomeHeroProps> = ({ displayName, onStartTutorial }) => {
  const { isAuthenticated, login, cancelLogin, isLoading, isLoggingIn } = useAuth();

  return (
    <section className="mx-auto grid w-full max-w-[1080px] grid-cols-1 items-center gap-8 px-4 py-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] md:gap-12 md:px-8">
      <div className="flex flex-col items-center gap-6 text-center md:items-start md:text-left">
        <span className="inline-flex items-center gap-3 text-[11px] font-extrabold uppercase tracking-[0.16em] text-ui-tinta-2">
          <img src={unipilotoLogo} alt="Universidad Piloto de Colombia" className="h-[34px] w-[34px] rounded-ui border border-ui-borde bg-white object-contain p-1" />
          Laboratorio remoto Unipiloto
        </span>

        <h1 id="landing-title" className="m-0 flex flex-col font-ui-titulo text-[clamp(2.55rem,10vw,4.1rem)] font-extrabold leading-[0.94] tracking-[-0.06em] text-ui-tinta md:text-[clamp(3.2rem,7.4vw,5.5rem)]">
          Laboratorio<span className="text-ui-acento-texto">remoto</span>
        </h1>

        <p className="m-0 max-w-[540px] text-[15px] leading-relaxed text-ui-tinta-2 md:text-[16px]">
          {displayName ? `${displayName}, bienvenido` : 'Bienvenido'} a tu espacio de prácticas. Aquí podrás interactuar de forma real y segura con equipos de laboratorio para complementar tu formación académica.
        </p>

        {!isAuthenticated && isLoggingIn ? (
          <div role="status" aria-live="polite" className={`${TARJETA} flex w-full max-w-[460px] flex-col gap-3 px-5 py-4 text-left`}>
            <p className="m-0 text-[13px] leading-normal text-ui-tinta-2">
              <span className="text-ui-tinta">Esperando el inicio de sesión en tu navegador…</span>
              <br />
              ¿Cerraste la ventana o no se abrió? Puedes volver a abrirla.
            </p>
            <div className="flex flex-wrap gap-2">
              <BotonPrincipal onClick={login}>Abrir de nuevo</BotonPrincipal>
              <Boton onClick={cancelLogin}>Cancelar</Boton>
            </div>
          </div>
        ) : !isAuthenticated ? (
          <BotonPrincipal onClick={login} disabled={isLoading} className="h-[42px] px-6 text-[14px]">
            {isLoading ? 'Cargando…' : 'Iniciar sesión'}
          </BotonPrincipal>
        ) : onStartTutorial && (
          <BotonPrincipal onClick={onStartTutorial} data-tour="inicio-tutorial" className="h-[42px] px-5 text-[14px]">
            <GraduationCap size={18} aria-hidden /> Iniciar recorrido
          </BotonPrincipal>
        )}
      </div>

      <div className="flex justify-center">
        <span className="flex h-[180px] w-[180px] items-center justify-center rounded-full border border-ui-borde bg-ui-superficie md:h-[240px] md:w-[240px]">
          <img src="/abeja1.webp" alt="Mascota del laboratorio" className="h-[112px] w-[112px] object-contain md:h-[150px] md:w-[150px]" />
        </span>
      </div>
    </section>
  );
};

export default AgentHomeHero;
