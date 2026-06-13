import React from 'react';
import { MODE_SUGGESTIONS } from '../../components/chatPane/chatPane.constants';
import { ChatMode } from '../../components/chatModes/types';
import { FlaskConical, Plus, Server, Sparkles } from 'lucide-react';

interface AgentHomeHeroProps {
  displayName: string;
  mode: ChatMode;
  onSuggestionClick: (text: string) => void;
  onOpenPanel?: (panelId: string) => void;
}

const QUICK_LINKS = [
  { id: 'practices', label: 'Prácticas', icon: FlaskConical },
  { id: 'connect', label: 'Conectar', icon: Plus },
  { id: 'hosts', label: 'Mis hosts', icon: Server },
] as const;

const AgentHomeHero: React.FC<AgentHomeHeroProps> = ({
  displayName,
  mode,
  onSuggestionClick,
  onOpenPanel,
}) => {
  const suggestions = MODE_SUGGESTIONS[mode] ?? MODE_SUGGESTIONS.ask;

  return (
    <div className="agent-home-hero">
      <div className="agent-home-hero__badge" aria-hidden>
        <Sparkles size={18} strokeWidth={1.75} />
      </div>

      <h1 className="agent-home-hero__title">
        ¿Qué toca hoy{displayName ? ',' : ''}{' '}
        {displayName && (
          <span className="agent-home-hero__name">{displayName}</span>
        )}
        ?
      </h1>

      <p className="agent-home-hero__subtitle">
        Tu asistente del laboratorio remoto — Linux, SSH y prácticas guiadas.
      </p>

      <div className="agent-home-hero__suggestions">
        {suggestions.map((s, i) => (
          <button
            key={i}
            type="button"
            className="agent-home-hero__chip"
            onClick={() => onSuggestionClick(s.text)}
          >
            <span className="agent-home-hero__chip-icon">{s.icon}</span>
            <span>{s.text}</span>
          </button>
        ))}
      </div>

      {onOpenPanel && (
        <div className="agent-home-hero__quick">
          {QUICK_LINKS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className="agent-home-hero__quick-btn"
              onClick={() => onOpenPanel(id)}
            >
              <Icon size={14} strokeWidth={2} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgentHomeHero;
