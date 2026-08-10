import React from 'react';
import { ArrowRight, CircleAlert, CircleHelp, Terminal, X } from 'lucide-react';
import type { ChatAppearance } from '../chat/ChatMessageList';
import './TerminalBanners.css';

interface Props {
  appearance?: ChatAppearance;
  errorBanner: { snippet: string; hint?: string } | null;
  onDismissError: () => void;
  onAnalyze: () => void;
  promptBanner: { snippet: string } | null;
  onDismissPrompt: () => void;
  onAskAboutPrompt: () => void;
  terminalActivity: boolean;
  onDismissActivity: () => void;
}

const TerminalBanners: React.FC<Props> = ({
  appearance = 'session',
  errorBanner,
  onDismissError,
  onAnalyze,
  promptBanner,
  onDismissPrompt,
  onAskAboutPrompt,
  terminalActivity,
  onDismissActivity,
}) => {
  const isLanding = appearance === 'landing';

  return (
    <div
      className={[
        'terminal-notices',
        isLanding ? 'terminal-notices--landing' : 'terminal-notices--session',
      ].join(' ')}
    >
      {errorBanner && (
        <div
          className={[
            'terminal-notice terminal-notice--error',
            isLanding ? 'terminal-notice--landing' : 'terminal-notice--session',
          ].join(' ')}
          role="alert"
          aria-live="assertive"
        >
          <span
            className={[
              'terminal-notice__status-icon',
              isLanding && 'terminal-notice__status-icon--landing',
            ].filter(Boolean).join(' ')}
            aria-hidden
          >
            <CircleAlert size={12} strokeWidth={2.5} />
          </span>
          <div className="terminal-notice__body">
            <div className="terminal-notice__head">
              <Terminal size={13} className="terminal-notice__head-icon" strokeWidth={2.25} />
              <span className="terminal-notice__title">Salida con error en la terminal</span>
              <button
                type="button"
                className="terminal-notice__dismiss"
                onClick={onDismissError}
                aria-label="Descartar aviso"
              >
                <X size={14} />
              </button>
            </div>
            <p className="terminal-notice__snippet" title={errorBanner.snippet}>
              {errorBanner.snippet}
            </p>
            {errorBanner.hint && (
              <p className="terminal-notice__hint">{errorBanner.hint}</p>
            )}
            <button type="button" className="terminal-notice__action" onClick={onAnalyze}>
              Pedir al agente que lo revise
              <ArrowRight size={12} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {!errorBanner && promptBanner && (
        <div
          className={[
            'terminal-notice terminal-notice--prompt',
            isLanding ? 'terminal-notice--landing' : 'terminal-notice--session',
          ].join(' ')}
          role="status"
          aria-live="polite"
        >
          <span
            className={[
              'terminal-notice__status-icon terminal-notice__status-icon--prompt',
              isLanding && 'terminal-notice__status-icon--landing',
            ].filter(Boolean).join(' ')}
            aria-hidden
          >
            <CircleHelp size={12} strokeWidth={2.5} />
          </span>
          <div className="terminal-notice__body">
            <div className="terminal-notice__head">
              <Terminal size={13} className="terminal-notice__head-icon" strokeWidth={2.25} />
              <span className="terminal-notice__title">La terminal está esperando tu respuesta</span>
              <button
                type="button"
                className="terminal-notice__dismiss"
                onClick={onDismissPrompt}
                aria-label="Descartar aviso"
              >
                <X size={14} />
              </button>
            </div>
            <p className="terminal-notice__snippet" title={promptBanner.snippet}>
              {promptBanner.snippet}
            </p>
            <button type="button" className="terminal-notice__action" onClick={onAskAboutPrompt}>
              ¿Qué me está preguntando?
              <ArrowRight size={12} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {terminalActivity && !errorBanner && !promptBanner && (
        <div
          className={[
            'terminal-notice terminal-notice--activity',
            isLanding ? 'terminal-notice--landing' : 'terminal-notice--session',
          ].join(' ')}
          role="status"
        >
          <span className="terminal-notice__activity-dot" aria-hidden />
          <span className="terminal-notice__activity-text">
            Terminal activa — el agente puede leer la salida si lo necesita
          </span>
          <button
            type="button"
            className="terminal-notice__dismiss"
            onClick={onDismissActivity}
            aria-label="Ocultar aviso"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
};

export default TerminalBanners;
