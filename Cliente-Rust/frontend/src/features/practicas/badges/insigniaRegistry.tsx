// features/practicas/badges/insigniaRegistry.tsx
//
// Qué insignia específica le corresponde a cada práctica -- un mapa
// practiceId -> elemento ya armado. Cada entrada envuelve el marco común
// <Insignia> (ver Insignia.tsx) con su propio contenido: hoy todas usan
// MedalIcon con su código de módulo, pero nada impide que una práctica
// futura (EV3, por ejemplo) traiga un ícono completamente distinto sin
// tocar el marco compartido ni las demás entradas.
//
// `tier` arma una CADENA evolutiva entre módulos (ver MedalIcon.tsx): cada
// nivel suma un elemento nuevo sobre el anterior (resplandor en tier 2,
// + estrella en tier 3) y un color más "avanzado", para que completar más
// módulos se sienta como progresar, no solo juntar íconos sueltos.
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
      <MedalIcon code="M1" tier={1} ringColor="#E21F19" discColor="#F7CD3D" ariaLabel="" className="h-8 w-8" />
    </Insignia>
  ),
  'linux-m2': (
    <Insignia label="Insignia ganada: Explorador (Módulo 2)" rotation={11}>
      <MedalIcon code="M2" tier={2} ringColor="#2B6E6E" discColor="#F7CD3D" burstColor="#2B6E6E" ariaLabel="" className="h-8 w-8" />
    </Insignia>
  ),
  'linux-permisos': (
    <Insignia label="Insignia ganada: Guardián (Módulo 3)" rotation={-8}>
      <MedalIcon code="M3" tier={3} ringColor="#B4531B" discColor="#F7CD3D" burstColor="#B4531B" starColor="#F7CD3D" ariaLabel="" className="h-8 w-8" />
    </Insignia>
  ),
  // El editor sigue siendo `linux-m3` (el id no cambia), pero ahora se cursa 4.º.
  'linux-m3': (
    <Insignia label="Insignia ganada: Editor (Módulo 4)" rotation={9}>
      <MedalIcon code="M4" tier={3} ringColor="#5B3A8E" discColor="#F7CD3D" burstColor="#F7CD3D" starColor="#F7CD3D" ariaLabel="" className="h-8 w-8" />
    </Insignia>
  ),
};

export function getInsigniaForPractice(practiceId: string): React.ReactNode | null {
  return REGISTRY[practiceId] ?? null;
}
