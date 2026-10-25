import { describe, expect, it } from 'vitest';
import { comandoEnPantalla, newLine, serverOutput, typeKeys, SYNC_WINDOW_MS, type ShellLine } from '@/features/terminal/shellLine';

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
    /** `pantalla`: la línea que muestra la terminal en ese momento (la manda xterm con el Enter). */
    teclea(data: string, pantalla?: string) {
      const r = typeKeys(line, data, t, pantalla);
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

const PROMPT = 'estudiante@upiloto.edu@raspberrypi:~ $ ';

describe('Enter tras ↑/↓: manda lo que se ve en la terminal', () => {
  it('la Pi tarda en contestar a ↑: se registra el comando de la pantalla, no nada', () => {
    const s = sesion();
    s.teclea('hostname\r');
    s.teclea(UP);
    s.espera(SYNC_WINDOW_MS + 300);
    s.servidor('hostname'); // llega tarde: el modelo ya no la aplica
    s.teclea('\r', PROMPT + 'hostname');
    expect(s.comandos).toEqual(['hostname', 'hostname']);
  });

  it('↑ dos veces seguidas con la segunda respuesta tarde: no se queda con el primer comando', () => {
    const s = sesion();
    s.teclea('whoami\r');
    s.teclea('pwd\r');
    s.teclea(UP);
    s.servidor('pwd');
    s.teclea(UP);
    s.espera(SYNC_WINDOW_MS + 100);
    s.servidor('\b\b\bwhoami');
    expect(s.texto).toBe('pwd'); // lo que el modelo cree
    s.teclea('\r', PROMPT + 'whoami');
    expect(s.comandos.at(-1)).toBe('whoami');
  });

  it('lo tecleado tras ↑ cuyo eco aún no llega a la pantalla también cuenta', () => {
    const s = sesion();
    s.teclea('ls\r');
    s.teclea(UP);
    s.servidor('ls');
    s.teclea(' -l');
    s.teclea('\r', PROMPT + 'ls -');
    expect(s.comandos.at(-1)).toBe('ls -l');
  });

  it('sin ↑/↓ ni Tab manda el modelo aunque la pantalla vaya atrasada', () => {
    const s = sesion();
    s.teclea('whoami');
    s.teclea('\r', PROMPT + 'who');
    expect(s.comandos).toEqual(['whoami']);
  });

  it('Enter con la búsqueda de Ctrl+R abierta: cuenta el comando encontrado', () => {
    const s = sesion();
    s.teclea('\x12');
    s.teclea('wc');
    s.teclea('\r', "(reverse-i-search)`wc': echo uno | wc -w");
    expect(s.comandos).toEqual(['echo uno | wc -w']);
  });

  it('Ctrl+R sin pantalla (no se sabe qué encontró): no se inventa nada', () => {
    const s = sesion();
    s.teclea('\x12');
    s.teclea('wc');
    s.teclea('\r');
    expect(s.comandos).toEqual([]);
  });

  it('Ctrl+P (historial con el teclado) y Ctrl+Y (pegar lo borrado) también los decide la pantalla', () => {
    const s = sesion();
    s.teclea('\x10'); // Ctrl+P
    s.teclea('\r', PROMPT + 'uname -a');
    s.teclea('ls -l');
    s.teclea('\x15'); // Ctrl+U borra
    s.teclea('\x19'); // Ctrl+Y lo vuelve a poner
    s.teclea('\r', PROMPT + 'ls -l');
    expect(s.comandos).toEqual(['uname -a', 'ls -l']);
  });

  it('tras salir de Ctrl+R con una flecha, la pantalla dice el comando', () => {
    const s = sesion();
    s.teclea('\x12');
    s.teclea('wc');
    s.teclea(RIGHT);
    s.teclea('\r', PROMPT + 'echo uno | wc -w');
    expect(s.comandos).toEqual(['echo uno | wc -w']);
  });
});

describe('Enter que no es un comando de bash', () => {
  it('la contraseña de sudo no se registra (ni se manda al chat)', () => {
    const s = sesion();
    s.teclea('sudo apt update\r', PROMPT + 'sudo apt update');
    s.teclea('MiClaveSecreta');
    s.teclea('\r', '[sudo] password for estudiante@upiloto.edu: ');
    expect(s.comandos).toEqual(['sudo apt update']);
  });

  it('lo que se escribe dentro de python o de `cat` sin archivo no es un comando', () => {
    const s = sesion();
    s.teclea('print("hola")');
    s.teclea('\r', '>>> print("hola")');
    s.teclea('uno dos tres');
    s.teclea('\r', 'uno dos tres');
    expect(s.comandos).toEqual([]);
  });
});

describe('pegar en la terminal', () => {
  const PEGAR = (t: string) => `\x1b[200~${t}\x1b[201~`;

  it('pegado protegido con salto de línea: bash no lo ejecuta hasta el Enter', () => {
    const s = sesion();
    s.teclea(PEGAR('whoami\r'));
    expect(s.comandos).toEqual([]); // todavía no se ejecutó: no hay que validarlo
    s.teclea('\r', '');
    expect(s.comandos).toEqual(['whoami']);
  });

  it('pegado protegido sin salto: queda en la línea y se puede seguir escribiendo', () => {
    const s = sesion();
    s.teclea(PEGAR('ls'));
    s.teclea(' -l');
    s.teclea('\r', PROMPT + 'ls -l');
    expect(s.comandos).toEqual(['ls -l']);
  });

  it('pegar varias líneas: con el Enter cuenta cada una', () => {
    const s = sesion();
    s.teclea(PEGAR('mkdir proyecto\rcd proyecto\r'));
    s.teclea('\r', '');
    expect(s.comandos).toEqual(['mkdir proyecto', 'cd proyecto']);
  });

  it('pegado sin protección (bash viejo): el salto de línea ya es el Enter', () => {
    const s = sesion();
    s.teclea('whoami\r');
    expect(s.comandos).toEqual(['whoami']);
  });
});

describe('comandoEnPantalla', () => {
  it('quita el prompt de bash', () => {
    expect(comandoEnPantalla(PROMPT + 'ls -l /tmp')).toBe('ls -l /tmp');
    expect(comandoEnPantalla('pi@raspberrypi:~$ whoami')).toBe('whoami');
    expect(comandoEnPantalla('root@raspberrypi:/etc# cat hosts')).toBe('cat hosts');
  });

  it('respeta un "$ " dentro del comando', () => {
    expect(comandoEnPantalla(PROMPT + 'echo "$ hola"')).toBe('echo "$ hola"');
  });

  it('prompt vacío: línea vacía', () => {
    expect(comandoEnPantalla(PROMPT)).toBe('');
  });

  it('null si no hay prompt', () => {
    expect(comandoEnPantalla('>>> print("a@b $ c")')).toBeNull();
    expect(comandoEnPantalla('Password: ')).toBeNull();
  });
});
