import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PASOS_PRACTICA_LINUX } from '@/features/practicas/tour/pasos';

const PUBLIC = resolve(__dirname, '../../public/tutorial/practica-linux');
const GUION = resolve(__dirname, '../../../tools/practica-linux-tour/frases_elevenlabs.txt');

/** Frases del guion grabado, por número de audio («01» → texto). Mismo parseo que tutorialBienvenida.test.ts. */
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

describe('tour de la práctica de Linux', () => {
  it('cada paso tiene su audio en public/, en orden y sin repetir', () => {
    const audios = PASOS_PRACTICA_LINUX.map((p) => p.audio);
    expect(new Set(audios).size).toBe(audios.length);
    expect([...audios].sort()).toEqual(audios);
    for (const a of audios) expect(existsSync(resolve(PUBLIC, a)), a).toBe(true);
  });

  it('los subtítulos dicen lo mismo que la frase grabada de su audio', () => {
    const frases = frasesDelGuion();
    for (const p of PASOS_PRACTICA_LINUX) {
      expect(p.texto, p.audio).toBe(frases.get(p.audio.replace('.mp3', '')) ?? '');
    }
  });

  it('cada paso resalta exactamente un data-tour real de la pantalla de práctica', () => {
    for (const p of PASOS_PRACTICA_LINUX) {
      expect(p.elementos.length, p.audio).toBeGreaterThan(0);
      for (const sel of p.elementos) expect(sel, p.audio).toMatch(/^\[data-tour="practica-[a-z]+"\]$/);
    }
  });
});
