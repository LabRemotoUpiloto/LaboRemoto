import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CARPETA_TOUR_CIRCUITOS, PASOS_PRACTICA_CIRCUITOS } from '@/features/circuitos/tour/pasos';

const PUBLIC = resolve(__dirname, '../../../public/tutorial', CARPETA_TOUR_CIRCUITOS);
const GUION = resolve(__dirname, '../../../../tools/practica-circuitos-tour/frases.txt');

/** Frases del guion grabado, por número de audio («01» → texto). Mismo parseo que tourPracticaLinux.test.ts. */
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

describe('tour de la práctica de circuitos', () => {
  it('cada paso tiene su audio en public/, en orden y sin repetir', () => {
    const audios = PASOS_PRACTICA_CIRCUITOS.map((p) => p.audio);
    expect(new Set(audios).size).toBe(audios.length);
    expect([...audios].sort()).toEqual(audios);
    for (const a of audios) expect(existsSync(resolve(PUBLIC, a)), a).toBe(true);
  });

  it('los clips de los pasos existen en la misma carpeta', () => {
    for (const p of PASOS_PRACTICA_CIRCUITOS.filter((x) => x.clip)) {
      expect(existsSync(resolve(PUBLIC, p.clip!)), p.clip).toBe(true);
    }
  });

  it('los subtítulos dicen lo mismo que la frase grabada de su audio', () => {
    const frases = frasesDelGuion();
    for (const p of PASOS_PRACTICA_CIRCUITOS) {
      expect(p.texto, p.audio).toBe(frases.get(p.audio.replace('.mp3', '')) ?? '');
    }
  });

  it('cada paso resalta un data-tour de la vista de la práctica o del chat', () => {
    for (const p of PASOS_PRACTICA_CIRCUITOS) {
      expect(p.elementos.length, p.audio).toBeGreaterThan(0);
      for (const sel of p.elementos) expect(sel, p.audio).toMatch(/^\[data-tour="(practica|circuito)-[a-z]+"\]$/);
    }
  });
});
