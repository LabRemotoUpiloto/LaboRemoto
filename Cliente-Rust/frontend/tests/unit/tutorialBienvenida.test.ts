import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PASOS_BIENVENIDA } from '../../src/tour/bienvenida/pasos';

const PUBLIC = resolve(__dirname, '../../public/tutorial/bienvenida');
const GUION = resolve(__dirname, '../../../tools/video-bienvenida/frases_elevenlabs.txt');

/** Frases del guion grabado, por número de audio («01» → texto). */
function frasesDelGuion(): Map<string, string> {
  const lineas = readFileSync(GUION, 'utf8').split(/\r?\n/);
  const frases = new Map<string, string>();
  lineas.forEach((l, i) => {
    if (!/^\d{2}$/.test(l.trim())) return;
    const texto = lineas.slice(i + 1).find((x) => x.trim() && !x.trim().startsWith('#'));
    if (texto) frases.set(l.trim(), texto.trim());
  });
  return frases;
}

const normal = (s: string) => s.replace(/Ráspberri Pai/g, 'Raspberry Pi').replace(/E-V tres/g, 'EV3').replace(/Línux/g, 'Linux');

describe('tutorial de bienvenida', () => {
  it('cada paso tiene su audio en public/, en orden y sin repetir', () => {
    const audios = PASOS_BIENVENIDA.map((p) => p.audio);
    expect(new Set(audios).size).toBe(audios.length);
    expect([...audios].sort()).toEqual(audios);
    for (const a of audios) expect(existsSync(resolve(PUBLIC, a)), a).toBe(true);
  });

  it('los subtítulos dicen lo mismo que la frase grabada de su audio (salvo la ortografía de nombres en inglés)', () => {
    const frases = frasesDelGuion();
    for (const p of PASOS_BIENVENIDA) {
      expect(p.texto, p.audio).toBe(normal(frases.get(p.audio.replace('.mp3', '')) ?? ''));
    }
  });

  it('Reservas no aparece en el tutorial mientras esté desactivada', () => {
    expect(PASOS_BIENVENIDA.some((p) => p.pagina === 'reservas' || /Reservas/.test(p.texto))).toBe(false);
  });
});
