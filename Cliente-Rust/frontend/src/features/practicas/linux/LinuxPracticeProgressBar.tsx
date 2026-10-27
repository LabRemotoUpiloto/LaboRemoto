import React from 'react';
import { type LinuxValidationResult } from '../linuxPractice.service';
import './practicaProgreso.css';

/**
 * Lo que reporta el chat (ChatPane) de la práctica abierta. Es el MISMO conteo que la barra de la
 * guía («Paso 3 de 16»): antes acá se contaban las reglas de validación de la Pi («0 de 18 pasos,
 * 0/28 pts»), dos números distintos en la misma pantalla para lo que el estudiante ve como un solo
 * avance.
 */
export interface ProgresoPractica {
  titulo: string | null;
  /** Paso en el que va (el actual, todavía sin completar). */
  numero: number | null;
  total: number | null;
}

interface Props {
  result: LinuxValidationResult;
  progreso: ProgresoPractica | null;
}

export const LinuxPracticeProgressBar: React.FC<Props> = ({ result, progreso }) => {
  const completa = !!result.passed;
  const total = progreso?.total ?? null;
  const numero = progreso?.numero ?? null;
  // Pasos ya completados: todos los anteriores al actual (o todos, si la práctica terminó).
  const hechos = completa ? total ?? 0 : numero ? numero - 1 : 0;
  const pct = completa ? 100 : total ? (hechos / total) * 100 : 0;

  return (
    <div data-tour="practica-progreso" className="practica-progreso">
      <div className="practica-progreso__fila">
        <span className="practica-progreso__titulo">{progreso?.titulo ?? 'Práctica de laboratorio'}</span>
        <span className={`practica-progreso__estado${completa ? ' is-completa' : ''}`}>
          {completa ? '¡Práctica completa!' : numero && total ? `Paso ${numero} de ${total}` : ''}
        </span>
      </div>
      <div className="practica-progreso__pista" role="progressbar" aria-valuemin={0} aria-valuemax={total ?? 100} aria-valuenow={hechos}>
        <div className={`practica-progreso__barra${completa ? ' is-completa' : ''}`} style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
    </div>
  );
};
