import { ChatMode } from '../modos/types';

interface WelcomeMessageProps {
  mode: ChatMode;
  /** Ya no se ofrecen sugerencias (eran ruido); se mantiene para no cambiar a quien lo usa. */
  handleSuggestionClick?: (text: string) => void;
}

const TEXTO: Record<ChatMode, string> = {
  ask: 'Escribe una pregunta para empezar.',
  agente: 'Pide algo y el agente lo hace en el servidor.',
  plan: 'Cuenta qué quieres hacer y te armo el plan.',
};

/** Chat vacío: una sola línea discreta, sin íconos ni sugerencias. */
export default function WelcomeMessage({ mode }: WelcomeMessageProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-8 pb-[10vh]">
      <p className="m-0 text-center text-[13px] text-[var(--text-secondary)]">{TEXTO[mode] ?? TEXTO.ask}</p>
    </div>
  );
}
