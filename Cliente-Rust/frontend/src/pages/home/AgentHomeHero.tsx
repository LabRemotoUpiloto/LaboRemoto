import React from 'react';
import { FlaskConical, GraduationCap, MonitorUp, Plus, Server, ShieldCheck } from 'lucide-react';
import { unipilotoLogo } from '../../assets/logoBase64';

interface AgentHomeHeroProps {
  displayName: string;
  onOpenPanel?: (panelId: string) => void;
  onStartTutorial?: () => void;
}

const QUICK_LINKS = [
  { id: 'connect', label: 'Conectar ahora', detail: 'Abrir una sesión remota', icon: Plus, primary: true },
  { id: 'practices', label: 'Prácticas', detail: 'Ver actividades disponibles', icon: FlaskConical },
  { id: 'hosts', label: 'Mis hosts', detail: 'Gestionar accesos guardados', icon: Server },
] as const;

const CAPABILITIES = [
  {
    icon: MonitorUp,
    title: 'Acceso remoto al laboratorio',
    text: 'Conectate a equipos y recursos disponibles para tus prácticas.',
  },
  {
    icon: FlaskConical,
    title: 'Prácticas en un solo lugar',
    text: 'Consulta guías, actividades y herramientas de apoyo académico.',
  },
  {
    icon: ShieldCheck,
    title: 'Soporte durante la sesión',
    text: 'Usá la asistencia técnica cuando necesites ayuda en el proceso.',
  },
] as const;

const AgentHomeHero: React.FC<AgentHomeHeroProps> = ({
  displayName,
  onOpenPanel,
  onStartTutorial,
}) => {
  return (
    <div className="agent-home-hero">
      <section className="agent-home-hero__intro" aria-labelledby="landing-title">
        <div className="agent-home-hero__brand">
          <img src={unipilotoLogo} alt="Universidad Piloto de Colombia" />
          <span>Laboratorio remoto Unipiloto</span>
        </div>

        <h1 id="landing-title" className="agent-home-hero__title">
          Laboratorio <span>remoto</span>
        </h1>

        <p className="agent-home-hero__subtitle">
          {displayName ? `${displayName}, ` : ''}conecta, practica y administra tus accesos desde un solo entorno académico.
        </p>

        {onOpenPanel && (
          <div className="agent-home-hero__actions">
            {QUICK_LINKS.map(({ id, label, detail, icon: Icon, primary }, i) => (
              <button
                key={id}
                type="button"
                className={primary ? 'agent-home-hero__action agent-home-hero__action--primary' : 'agent-home-hero__action'}
                onClick={() => onOpenPanel(id)}
              >
                <em>0{i + 1}</em>
                <Icon size={18} strokeWidth={2} />
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
              </button>
            ))}
            {onStartTutorial && (
              <button
                type="button"
                className="agent-home-hero__action"
                onClick={onStartTutorial}
              >
                <em>04</em>
                <GraduationCap size={18} strokeWidth={2} />
                <span>
                  <strong>Ver Tutorial</strong>
                  <small>Recorrido guiado por la app</small>
                </span>
              </button>
            )}
          </div>
        )}
      </section>

      <aside className="agent-home-hero__panel" aria-label="Funciones principales">
        <div className="agent-home-hero__panel-label">Qué puedes hacer</div>
        <div className="agent-home-hero__capabilities">
          {CAPABILITIES.map(({ icon: Icon, title, text }, i) => (
            <article key={title} className="agent-home-hero__capability">
              <span className="agent-home-hero__capability-number">0{i + 1}</span>
              <Icon size={20} strokeWidth={1.9} />
              <div>
                <h2>{title}</h2>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </aside>

    </div>
  );
};

export default AgentHomeHero;
