// components/chat/RelativeTime.tsx
//
// `fmtTime(ts)` (chatPane.constants.ts) calcula bien "ahora"/"hace 3m"/hora
// exacta según cuánto pasó -- pero lo llamaban una sola vez al renderizar el
// mensaje y nunca de nuevo, así que un mensaje quedaba diciendo "ahora" para
// siempre aunque pasaran horas. Este componente se re-renderiza solo cada
// 30s para que el texto avance con el reloj real, sin tocar la lógica de
// `fmtTime` (que ya está bien, calcula fresco cada vez que se llama).
import React, { useEffect, useState } from 'react';
import { fmtTime } from '../chatPane/chatPane.constants';

const TICK_MS = 30_000;

export const RelativeTime: React.FC<{ timestamp?: number }> = ({ timestamp }) => {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!timestamp) return;
    const id = window.setInterval(() => tick((t) => t + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, [timestamp]);

  return <>{fmtTime(timestamp)}</>;
};
