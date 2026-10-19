// components/practicas/linux/GuiaPractica.tsx — barra «qué toca ahora» de la práctica.
//
// Es una fila más de la columna del chat (ver ChatPane), arriba de los
// mensajes, con la misma forma que la caja del input de abajo pero teñida del
// acento. No flota sobre el scroll -- los mensajes nunca le pasan por encima.
// La alimentan PasoCard y la evaluación final vía DatosGuia.

import React from 'react';
import {
  ArrowRight, BookOpen, CircleHelp, Flag, Image as ImageIcon, MessageCircle, Play, Pointer,
  Send, SlidersHorizontal, SquareTerminal,
} from 'lucide-react';
import type { DatosGuia } from './PasoCard';
import { isMacOS } from '../../../utils/platform';
import './guiaPractica.css';

const ICONOS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  leer: BookOpen,
  video: Play,
  imagen: ImageIcon,
  ejercicio: SlidersHorizontal,
  comando: SquareTerminal,
  reto: Flag,
  siguiente: ArrowRight,
  pregunta: CircleHelp,
  enviar: Send,
};

export function GuiaPractica({ guia }: { guia: DatosGuia | null }) {
  const actual = guia?.acciones.find((a) => a.id === guia.actual) ?? null;
  const texto = guia ? (guia.ahora ?? actual?.texto ?? null) : null;
  const Icono = (actual?.tipo && ICONOS[actual.tipo]) || (texto ? Pointer : MessageCircle);
  const total = guia?.acciones.length ?? 0;
  const listas = guia ? guia.acciones.filter((a) => guia.hechas.has(a.id)).length : 0;

  return (
    <div className={`guia-practica${isMacOS() ? ' guia-practica--mac' : ''}`}>
      {/* data-tour en la tarjeta (no en la fila, que toca el borde de la ventana y le
          corta el aro del tour) y siempre presente, aunque no haya nada pendiente. */}
      <div className={`guia-practica__caja${texto ? '' : ' guia-practica__caja--quieta'}`} data-tour="practica-guia" aria-live="polite">
        <div className="guia-practica__fila">
          <span key={actual?.id ?? 'quieta'} className="guia-practica__icono" aria-hidden="true">
            <Icono size={15} strokeWidth={2.2} />
          </span>
          <div className="guia-practica__cuerpo">
            <div className="guia-practica__meta">
              <span>{guia?.etiqueta ?? 'Práctica'}</span>
              {total > 1 && <span className="guia-practica__cuenta">{listas}/{total}</span>}
            </div>
            <p key={`${actual?.id ?? 'quieta'}:${typeof texto === 'string' ? texto : ''}`} className="guia-practica__texto">
              {texto ?? 'Sigue las indicaciones del chat.'}
            </p>
          </div>
        </div>

        {guia?.extra && <div className="guia-practica__extra">{guia.extra}</div>}

        {total > 1 && (
          <div className="guia-practica__pasos" role="list" aria-label={`${listas} de ${total} acciones listas`}>
            {guia!.acciones.map((a) => {
              const hecha = guia!.hechas.has(a.id);
              const esActual = a.id === guia!.actual;
              return (
                <span
                  key={a.id}
                  role="listitem"
                  title={a.texto}
                  aria-label={`${a.texto}${hecha ? ' (lista)' : esActual ? ' (ahora)' : ''}`}
                  className={`guia-practica__seg${hecha ? ' is-hecha' : ''}`}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
