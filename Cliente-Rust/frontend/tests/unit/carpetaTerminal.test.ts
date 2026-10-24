// En qué carpeta está la terminal, según su prompt.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { carpetaDelPrompt, expandirHome } from '@/features/sesion/carpetaTerminal';

describe('carpeta de la terminal', () => {
  it('toma la ruta del último prompt, aunque traiga colores', () => {
    const salida = 'pi@raspberrypi:~ $ cd proyecto\r\n\x1b[01;32mpi@raspberrypi\x1b[00m:\x1b[01;34m~/proyecto \x1b[00m$ ls\r\nleds.py\r\n';
    expect(carpetaDelPrompt(salida)).toBe('~/proyecto');
  });

  it('reconoce rutas absolutas, root y entornos de Python delante', () => {
    expect(carpetaDelPrompt('(venv) labiot@jetson:/opt/app # ')).toBe('/opt/app');
  });

  it('si el prompt no muestra la ruta, no adivina', () => {
    expect(carpetaDelPrompt('bash-5.1$ ls\r\n$ ')).toBeNull();
  });

  it('expande ~ con la carpeta personal', () => {
    expect(expandirHome('~', '/home/pi')).toBe('/home/pi');
    expect(expandirHome('~/proyecto', '/home/pi/')).toBe('/home/pi/proyecto');
    expect(expandirHome('/etc', '/home/pi')).toBe('/etc');
  });
});
