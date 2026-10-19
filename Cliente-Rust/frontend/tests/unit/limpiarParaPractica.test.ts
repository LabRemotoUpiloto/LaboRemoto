import { describe, expect, it } from 'vitest';
import { limpiarParaPractica } from '../../src/components/chat/AskRenderer';

describe('limpiarParaPractica', () => {
  it('quita el título Explicación y la sección Comandos con su bloque', () => {
    const md = [
      '### Explicación',
      'La línea `andres@raspberrypi` muestra tu usuario y el nombre de la máquina.',
      '',
      '### Comandos',
      '```bash',
      '# No se necesita ejecutar ningún comando adicional',
      '```',
    ].join('\n');
    expect(limpiarParaPractica(md)).toBe('La línea `andres@raspberrypi` muestra tu usuario y el nombre de la máquina.');
  });

  it('acepta los títulos con emoji y conserva lo que venga después de Comandos', () => {
    const md = '### 🐧 Explicación\nTexto.\n### 💻 Comandos\n```bash\nls -la\n```\n### ✅ Resultado\nOtro texto.';
    expect(limpiarParaPractica(md)).toBe('Texto.\n### ✅ Resultado\nOtro texto.');
  });

  it('quita un bloque de código sin cerrar mientras llega el streaming', () => {
    expect(limpiarParaPractica('Hola.\n```bash\nrm -rf')).toBe('Hola.');
  });

  it('deja intacto un texto sin comandos (incluido el código en línea)', () => {
    expect(limpiarParaPractica('Escribiste `whoami` y salió tu usuario.')).toBe('Escribiste `whoami` y salió tu usuario.');
  });
});
