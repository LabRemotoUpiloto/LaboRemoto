// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { RANKS, rankForModule } from '@/features/practicas/badges.service';
import { getInsigniaForPractice } from '@/features/practicas/badges/insigniaRegistry';

// Un módulo sin rango se completa, pero no da insignia ni cierra el flujo de «fin de práctica»
// (ver AiMessageBubble): todo módulo de Linux que exista en la Pi tiene que estar acá.
const MODULOS_LINUX = ['linux-m1', 'linux-m2', 'linux-permisos', 'linux-m3', 'linux-archivos'];

describe('rangos e insignias de las prácticas de Linux', () => {
  it('cada módulo tiene su rango y su insignia', () => {
    for (const id of MODULOS_LINUX) {
      expect(rankForModule(id), id).toBeDefined();
      expect(getInsigniaForPractice(id), id).not.toBeNull();
    }
  });

  it('los códigos siguen el orden en que se cursan (M1, M2, …) sin repetirse', () => {
    expect(RANKS.map((r) => r.code)).toEqual(RANKS.map((_, i) => `M${i + 1}`));
    expect(MODULOS_LINUX.map((id) => rankForModule(id)!.code)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5']);
  });
});
