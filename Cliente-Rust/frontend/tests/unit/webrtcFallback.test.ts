import { describe, expect, it } from 'vitest';
import { ESPERA_FALLO_DE_RED_MS, esFalloDeRed, esperaReintentoMs } from '../../src/utils/webrtcFallback';

describe('esFalloDeRed', () => {
  it('es de red solo si la conexión NUNCA llegó a establecerse', () => {
    expect(esFalloDeRed(true, false)).toBe(true);   // no conecta: el puerto del video no pasa
  });

  it('un corte de una cámara que ya estaba conectada NO es de la red (el caso de editar una cámara)', () => {
    // MediaMTX cierra la sesión de UNA cámara al cambiarle el origen de video; antes esto mandaba todas a HLS.
    expect(esFalloDeRed(true, true)).toBe(false);
  });

  it('un fallo de negociación de esa cámara (p. ej. 404, no tiene video) tampoco es de la red', () => {
    expect(esFalloDeRed(false, false)).toBe(false);
    expect(esFalloDeRed(false, true)).toBe(false);
  });
});

describe('esperaReintentoMs', () => {
  it('duplica la espera en cada reintento y se detiene en 5 minutos', () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(esperaReintentoMs)).toEqual([20_000, 40_000, 80_000, 160_000, 300_000, 300_000, 300_000]);
  });

  it('un índice negativo (primer fallo aún sin contar) usa la espera base', () => {
    expect(esperaReintentoMs(-1)).toBe(20_000);
  });
});

describe('ESPERA_FALLO_DE_RED_MS', () => {
  it('sigue siendo de 2 minutos', () => {
    expect(ESPERA_FALLO_DE_RED_MS).toBe(120_000);
  });
});
