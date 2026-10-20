import { describe, expect, it } from 'vitest';
import { personalizarComandos, type LinuxModule } from '../../src/services/linuxPractice.service';
import { teclasDelComando } from '../../src/components/practicas/linux/ejecutarComando';
import { newLine, typeKeys } from '../../src/utils/shellLine';

const modulo = {
  id: 'linux-m2',
  validation_rules: [],
  blocks: [
    { type: 'command_step', id: 's-pwd', command: 'pwd', explain_md: '' },
    {
      type: 'command_step', id: 's-cd-casa', command: 'cd /home/tu-usuario@upiloto.edu', explain_md: '',
      comando_personal: 'cd /home/{usuario}', ejecutable: true,
    },
  ],
} as unknown as LinuxModule;

const comandos = (m: LinuxModule) => m.blocks.map((b) => (b.type === 'command_step' ? b.command : ''));

describe('personalizarComandos', () => {
  it('completa {usuario} con el usuario de la sesión y deja los demás comandos igual', () => {
    expect(comandos(personalizarComandos(modulo, 'ana-perez3@upiloto.edu'))).toEqual(['pwd', 'cd /home/ana-perez3@upiloto.edu']);
  });

  it('sin usuario conocido deja el comando genérico', () => {
    expect(comandos(personalizarComandos(modulo, null))).toEqual(['pwd', 'cd /home/tu-usuario@upiloto.edu']);
  });
});

describe('teclasDelComando (botón «Ejecutar comando»)', () => {
  it('entra al historial como un comando tecleado, aunque hubiera algo a medio escribir', () => {
    const aMedias = typeKeys(newLine(), 'ls -', 0).line;
    const { commands } = typeKeys(aMedias, teclasDelComando('cd /home/ana-perez3@upiloto.edu'), 1);
    expect(commands).toEqual(['cd /home/ana-perez3@upiloto.edu']);
  });
});
