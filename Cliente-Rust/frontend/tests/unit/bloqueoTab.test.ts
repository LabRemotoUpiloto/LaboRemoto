import { describe, expect, it } from 'vitest';
import { AVISO_TAB_CADA_MS, esPulsacionTab, quitarTabs, tocaAvisarTab } from '../../src/components/terminal/hooks/bloqueoTab';

describe('Tab desactivado en las prácticas', () => {
  it('reconoce la pulsación de Tab (también con Mayús) y solo al bajar la tecla', () => {
    expect(esPulsacionTab({ type: 'keydown', key: 'Tab' })).toBe(true);
    expect(esPulsacionTab({ type: 'keyup', key: 'Tab' })).toBe(false);
    expect(esPulsacionTab({ type: 'keydown', key: 'a' })).toBe(false);
    expect(esPulsacionTab({ type: 'keydown', key: 'Enter' })).toBe(false);
  });

  it('quita los tabuladores de lo que se enviaría (Tab, Ctrl+I o texto pegado) y deja el resto intacto', () => {
    expect(quitarTabs('\t')).toBe('');
    expect(quitarTabs('ls\t')).toBe('ls');
    expect(quitarTabs('echo\thola\tmundo')).toBe('echohola' + 'mundo');
    expect(quitarTabs('whoami')).toBe('whoami');
    expect(quitarTabs('ls -l\r')).toBe('ls -l\r');
  });

  it('avisa la primera vez y luego como mucho una vez cada 20 s', () => {
    expect(tocaAvisarTab(1_000_000, 0)).toBe(true);
    expect(tocaAvisarTab(1_000_000 + 1000, 1_000_000)).toBe(false);
    expect(tocaAvisarTab(1_000_000 + AVISO_TAB_CADA_MS - 1, 1_000_000)).toBe(false);
    expect(tocaAvisarTab(1_000_000 + AVISO_TAB_CADA_MS, 1_000_000)).toBe(true);
  });
});
