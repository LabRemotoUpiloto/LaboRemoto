import { describe, it, expect } from 'vitest';
import {
  analyzeTerminalContext,
  terminalContextLooksClean,
} from '../../src/utils/terminalErrorAnalysis';

const PROMPT = 'andres-gonzalez16@upiloto.edu@raspberrypi:~ $';

describe('analyzeTerminalContext / terminalContextLooksClean', () => {
  it('no debe seguir mostrando un error de un comando anterior una vez que el último comando salió bien', () => {
    // Reproduce exactamente el bug reportado: `ghjk` falla, después `whoami`
    // corre bien -- el error de `ghjk` sigue dentro de la ventana de 80
    // líneas, pero ya no es "actual".
    const raw = [
      `${PROMPT} ghjk`,
      `-bash: ghjk: command not found`,
      `${PROMPT} whoami`,
      `andres-gonzalez16@upiloto.edu`,
      `${PROMPT} `,
    ].join('\r\n');

    expect(analyzeTerminalContext(raw)).toBeNull();
    expect(terminalContextLooksClean(raw)).toBe(true);
  });

  it('sí debe detectar un error cuando el ÚLTIMO comando es el que falló', () => {
    const raw = [
      `${PROMPT} whoami`,
      `andres-gonzalez16@upiloto.edu`,
      `${PROMPT} ghjk`,
      `-bash: ghjk: command not found`,
      `${PROMPT} `,
    ].join('\r\n');

    const insight = analyzeTerminalContext(raw);
    expect(insight).not.toBeNull();
    expect(insight?.snippet).toContain('ghjk: command not found');
    expect(terminalContextLooksClean(raw)).toBe(false);
  });

  it('sigue detectando el error mientras el comando que falló no haya sido seguido por otro', () => {
    const raw = [`${PROMPT} ghjk`, `-bash: ghjk: command not found`, `${PROMPT} `].join('\r\n');

    expect(analyzeTerminalContext(raw)).not.toBeNull();
    expect(terminalContextLooksClean(raw)).toBe(false);
  });
});
