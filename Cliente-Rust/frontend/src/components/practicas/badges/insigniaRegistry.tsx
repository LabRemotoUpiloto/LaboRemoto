// components/practicas/badges/insigniaRegistry.tsx
//
// Qué insignia específica le corresponde a cada práctica -- un mapa
// practiceId -> elemento ya armado. Cada entrada envuelve el marco común
// <Insignia> (ver Insignia.tsx) con su propio contenido: hoy todas usan
// MedalIcon con su código de módulo, pero nada impide que una práctica
// futura (EV3, por ejemplo) traiga un ícono completamente distinto sin
// tocar el marco compartido ni las demás entradas.
//
// `getInsigniaForPractice` es el único punto de despacho: PracticeCard no
// sabe nada de insignias puntuales, solo pide "la insignia de este id" y
// pinta lo que le llegue (o nada, si la práctica no tiene una todavía).
import React from 'react';
import { Insignia } from './Insignia';
import { MedalIcon } from '../linux/MedalIcon';

const REGISTRY: Record<string, React.ReactNode> = {
  'linux-m1': (
    <Insignia label="Insignia ganada: Acceso básico (Módulo 1)" rotation={-14}>
      <MedalIcon code="M1" ariaLabel="" className="h-8 w-8" />
    </Insignia>
  ),
  'linux-m2': (
    <Insignia label="Insignia ganada: Explorador (Módulo 2)" rotation={11}>
      <MedalIcon code="M2" ariaLabel="" className="h-8 w-8" />
    </Insignia>
  ),
  'linux-m3': (
    <Insignia label="Insignia ganada: Editor (Módulo 3)" rotation={-8}>
      <MedalIcon code="M3" ariaLabel="" className="h-8 w-8" />
    </Insignia>
  ),
};

export function getInsigniaForPractice(practiceId: string): React.ReactNode | null {
  return REGISTRY[practiceId] ?? null;
}
