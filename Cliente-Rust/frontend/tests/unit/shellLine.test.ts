import { describe, expect, it } from 'vitest';
import { newLine, serverOutput, typeKeys, SYNC_WINDOW_MS, type ShellLine } from '../../src/utils/shellLine';

const UP = '\x1b[A';
const DOWN = '\x1b[B';
const LEFT = '\x1b[D';
const RIGHT = '\x1b[C';
const BKSP = '\x7f';

/** Simula una sesión: cada paso es lo que teclea el usuario o lo que contesta el servidor. */
function sesion() {
  let line: ShellLine = newLine();
  const comandos: string[] = [];
  let t = 1000;
  return {
    teclea(data: string) {
      const r = typeKeys(line, data, t);
      line = r.line;
      comandos.push(...r.commands);
      t += 20;
    },
    servidor(data: string) {
      line = serverOutput(line, data, t);
      t += 20;
    },
    espera(ms: number) { t += ms; },
    get texto() { return line.text; },
    get cursor() { return line.cursor; },
    comandos,
  };
}

const EJEMPLO = 'echo "uno dos tres" | wc -w';

describe('línea de comandos del estudiante', () => {
  it('registra el comando tal cual se teclea', () => {
    const s = sesion();
    s.teclea(EJEMPLO);
    s.teclea('\r');
    expect(s.comandos).toEqual([EJEMPLO]);
  });

  it('acepta el comando pegado de una vez, con Enter incluido', () => {
    const s = sesion();
    s.teclea(EJEMPLO + '\r');
    expect(s.comandos).toEqual([EJEMPLO]);
  });

  it('↑ + Enter repite el comando anterior (bash devuelve solo el texto, sin prompt)', () => {
    const s = sesion();
    s.teclea(EJEMPLO + '\r');
    s.teclea(UP);
    s.servidor(EJEMPLO); // lo que bash manda de verdad: capturado en la Pi
    s.teclea('\r');
    expect(s.comandos).toEqual([EJEMPLO, EJEMPLO]);
  });

  it('el caso del estudiante: typo, ↑, mover con ← y corregir en medio', () => {
    const s = sesion();
    s.teclea('echo "uno dos tres " | ec -w\r');
    s.teclea(UP);
    s.servidor('echo "uno dos tres " | ec -w'); // bytes reales tras ↑
    s.teclea(LEFT + LEFT + LEFT);
    s.servidor('\b\b\b'); // el eco de las flechas: ya lo contó el teclado, no debe contarse dos veces
    expect(s.cursor).toBe('echo "uno dos tres " | ec -w'.length - 3);
    s.teclea(BKSP + BKSP); // borra "ec"
    s.teclea('wc');
    s.teclea('\r');
    expect(s.comandos).toEqual(['echo "uno dos tres " | ec -w', 'echo "uno dos tres " | wc -w']);
  });

  it('quitar el espacio de dentro de las comillas con ← y Backspace', () => {
    const s = sesion();
    s.teclea('echo "uno dos tres " | wc -w\r');
    s.teclea(UP);
    s.servidor('echo "uno dos tres " | wc -w');
    s.teclea(LEFT.repeat('" | wc -w'.length)); // hasta justo después del espacio
    s.teclea(BKSP); // borra el espacio
    s.teclea('\r');
    expect(s.comandos.at(-1)).toBe(EJEMPLO);
  });

  it('↑ varias veces y luego ↓ llega al comando correcto', () => {
    const s = sesion();
    s.teclea('ls\r');
    s.teclea('pwd\r');
    s.teclea(UP);
    s.servidor('pwd');
    s.teclea(UP);
    s.servidor('\b\b\b\x1b[Kls'); // readline reemplaza "pwd" por "ls"
    s.teclea(DOWN);
    s.servidor('\b\b\x1b[Kpwd');
    s.teclea('\r');
    expect(s.comandos).toEqual(['ls', 'pwd', 'pwd']);
  });

  it('↓ al final del historial deja la línea vacía y Enter no registra nada', () => {
    const s = sesion();
    s.teclea('abc');
    s.teclea(DOWN);
    s.servidor('\b\b\b\x1b[K');
    s.teclea('\r');
    expect(s.comandos).toEqual([]);
  });

  it('Tab completa lo que falta y se puede seguir escribiendo', () => {
    const s = sesion();
    s.teclea('pyt');
    s.teclea('\t');
    s.servidor('hon ');
    s.teclea('flechas.py\r');
    expect(s.comandos).toEqual(['python flechas.py']);
  });

  it('Tab con varias opciones: bash lista y redibuja el prompt con la línea', () => {
    const s = sesion();
    s.teclea('l');
    s.teclea('\t');
    s.servidor('\r\nlast   less   ls\r\nhaider@raspberrypi:~ $ l');
    expect(s.texto).toBe('l');
    s.teclea('s\r');
    expect(s.comandos).toEqual(['ls']);
  });

  it('redibujo completo con prompt tras ↑ (otros shells)', () => {
    const s = sesion();
    s.teclea(UP);
    s.servidor('\r\x1b[Khaider-canon@upiloto.edu@raspberrypi:~ $ ls -l');
    s.teclea('\r');
    expect(s.comandos).toEqual(['ls -l']);
  });

  it('ignora lo que escribe el servidor si no se pulsó Tab ni ↑/↓', () => {
    const s = sesion();
    s.teclea('ls');
    s.servidor('salida cualquiera del comando anterior');
    expect(s.texto).toBe('ls');
  });

  it('ignora la respuesta del servidor si llega fuera de la ventana de sincronización', () => {
    const s = sesion();
    s.teclea(UP);
    s.espera(SYNC_WINDOW_MS + 50);
    s.servidor('echo tarde');
    expect(s.texto).toBe('');
  });

  it('Home/End, Supr y Ctrl+A/E/U/K/W editan como readline', () => {
    const s = sesion();
    s.teclea('hola mundo cruel');
    s.teclea('\x01'); // Ctrl+A
    expect(s.cursor).toBe(0);
    s.teclea('\x1b[3~'); // Supr borra la "h"
    expect(s.texto).toBe('ola mundo cruel');
    s.teclea('\x05'); // Ctrl+E
    s.teclea('\x17'); // Ctrl+W borra "cruel"
    expect(s.texto).toBe('ola mundo ');
    s.teclea('\x1b[H'); // Home
    s.teclea(RIGHT.repeat(3));
    s.teclea('\x0b'); // Ctrl+K borra desde el cursor
    expect(s.texto).toBe('ola');
    s.teclea('\x15'); // Ctrl+U borra hasta el cursor (al final: todo)
    expect(s.texto).toBe('');
  });

  it('Ctrl+C descarta la línea', () => {
    const s = sesion();
    s.teclea('rm algo');
    s.teclea('\x03');
    s.teclea('\r');
    expect(s.comandos).toEqual([]);
  });

  it('Ctrl+R (búsqueda en el historial): no se inventa un comando', () => {
    const s = sesion();
    s.teclea('\x12');
    s.teclea('wc');
    s.teclea('\r');
    expect(s.comandos).toEqual([]);
    s.teclea('ls\r'); // y la línea siguiente vuelve a la normalidad
    expect(s.comandos).toEqual(['ls']);
  });

  it('un comando por Enter aunque lleguen varios juntos', () => {
    const s = sesion();
    s.teclea('pwd\rls\r');
    expect(s.comandos).toEqual(['pwd', 'ls']);
  });
});
