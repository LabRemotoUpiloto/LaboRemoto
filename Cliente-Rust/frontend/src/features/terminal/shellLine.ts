// Modelo de la línea de comandos que el estudiante edita en la terminal (readline de bash), para saber QUÉ
// comando se ejecutó realmente al pulsar Enter -- lo que alimenta la validación de las prácticas.
//
// Antes la app solo juntaba las teclas tecleadas: las flechas ← → no movían ningún cursor (se escribía y
// borraba siempre al final) y ↑/↓ vaciaban el registro esperando un redibujo con prompt que bash NO manda
// (con ↑ devuelve solo el texto recordado). Resultado: al corregir un comando con ↑ y las flechas, o al repetir
// uno con ↑, la terminal ejecutaba lo correcto pero la app registraba otra cosa (o nada) y el paso no avanzaba.
//
// Aquí la línea tiene texto y cursor. Las teclas la editan igual que readline, y tras ↑/↓/Tab se aplica a esa
// misma línea lo que el servidor devuelve (borrar, retroceder, escribir encima), como lo haría la pantalla.
//
// Ese redibujo depende de que la respuesta llegue dentro de SYNC_WINDOW_MS: con una Pi lenta, o con ↑ varias
// veces seguidas, se perdía y la app registraba otro comando (el paso lo daba por error aunque en la terminal se
// ejecutara el correcto). Por eso, si la línea pasó por el servidor, al pulsar Enter manda lo que se VE en la
// pantalla (ver comandoEnPantalla), que es lo que bash ejecuta.
//
// La pantalla también dice cuándo un Enter NO es un comando: si la línea no empieza por el prompt de bash, el
// estudiante está respondiendo a un programa (python, `cat` sin archivo, la contraseña de sudo) y eso no se
// registra. Lo que se pega con el pegado protegido de bash (\x1b[200~ … \x1b[201~) no se ejecuta hasta el Enter.

export interface ShellLine {
  text: string;
  cursor: number;
  /** El servidor va a redibujar la línea (tras Tab o ↑/↓): solo entonces se interpreta su salida. */
  awaiting: 'tab' | 'history' | null;
  /** Momento de la tecla que espera respuesta (ms). */
  stamp: number;
  /** Ctrl+R y similares: la línea ya no se puede reconstruir y lo que se ejecute no se registra. */
  dirty: boolean;
  /** Desde el último Enter, el servidor cambió la línea (↑/↓, Tab, Alt+tecla): el modelo puede no coincidir. */
  fromServer: boolean;
}

/** Tiempo máximo, desde la tecla, para aceptar la respuesta del servidor como redibujo de la línea. */
export const SYNC_WINDOW_MS = 500;

export const newLine = (): ShellLine => ({ text: '', cursor: 0, awaiting: null, stamp: 0, dirty: false, fromServer: false });

/**
 * El comando de una línea de la pantalla con el prompt de bash (`usuario@equipo:~ $ comando`), o null si la
 * línea no empieza por un prompt reconocible (búsqueda con Ctrl+R, un programa pidiendo datos, Python...).
 */
export function comandoEnPantalla(fila: string): string | null {
  const arroba = fila.indexOf('@');
  if (arroba <= 0 || /\s/.test(fila.slice(0, arroba))) return null;
  const fin = /[$#] /.exec(fila.slice(arroba));
  if (!fin) return null;
  return fila.slice(arroba + fin.index + 2).trim();
}

/** Búsqueda en el historial (Ctrl+R): «(reverse-i-search)`wc': echo uno | wc -w». Enter ejecuta lo encontrado. */
function comandoDeLaBusqueda(fila: string): string | null {
  const m = /^\((?:failed )?(?:reverse-|bck-|fwd-)?i-search\)`.*?': (.*)$/.exec(fila.trim());
  return m ? m[1].trim() : null;
}

/** Al pulsar Enter tras ↑/↓/Tab: manda la pantalla, salvo que el modelo vaya por delante (eco aún sin llegar). */
function elegirComando(modelo: string, pantalla: string): string {
  if (modelo.length > pantalla.length && modelo.startsWith(pantalla)) return modelo;
  return pantalla;
}

/** Lo que ejecuta bash al pulsar Enter, según el modelo de la línea y, si la hay, la línea de la pantalla. */
function comandosDelEnter(text: string, dirty: boolean, fromServer: boolean, screen: string | null | undefined): string[] {
  const lineas = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (text.includes('\n')) return lineas; // pegado de varias líneas: bash las ejecuta todas con este Enter
  if (screen == null) return dirty ? [] : lineas;
  const enPantalla = comandoEnPantalla(screen);
  if (enPantalla === null) {
    const buscado = dirty ? comandoDeLaBusqueda(screen) : null;
    return buscado ? [buscado] : []; // no es el prompt de bash: es la entrada de otro programa
  }
  if (fromServer || dirty) {
    const cmd = elegirComando(text.trim(), enPantalla);
    return cmd ? [cmd] : [];
  }
  return lineas;
}

/** Limpia los códigos de escape ANSI/VT de una cadena (conserva \n). */
function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[\d;?]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b[()][AB012]/g, '')
    .replace(/\x1b[DMEHIJ78NOP]/g, '')
    .replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '');
}

function prevWord(text: string, cursor: number): number {
  let i = cursor;
  while (i > 0 && text[i - 1] === ' ') i--;
  while (i > 0 && text[i - 1] !== ' ') i--;
  return i;
}

function nextWord(text: string, cursor: number): number {
  let i = cursor;
  while (i < text.length && text[i] === ' ') i++;
  while (i < text.length && text[i] !== ' ') i++;
  return i;
}

/**
 * Lo que el usuario TECLEA (onData de xterm). Devuelve la línea actualizada y los comandos que se enviaron con
 * Enter en este trozo de datos. `screen` es la línea de la terminal donde está el cursor al pulsar ese Enter
 * (solo vale para el primero del trozo).
 */
export function typeKeys(prev: ShellLine, data: string, now: number, screen?: string | null): { line: ShellLine; commands: string[] } {
  let { text, cursor, awaiting, stamp, dirty, fromServer } = prev;
  const commands: string[] = [];
  let pegando = false; // dentro de \x1b[200~ … \x1b[201~ (xterm manda el pegado entero en un solo trozo)
  let i = 0;

  while (i < data.length) {
    const ch = data[i];
    const code = data.charCodeAt(i);

    if (ch === '\r' || ch === '\n') {
      if (pegando) { // el salto de línea pegado queda en la línea: bash espera el Enter
        text = text.slice(0, cursor) + '\n' + text.slice(cursor);
        cursor++;
        i++;
        continue;
      }
      commands.push(...comandosDelEnter(text, dirty, fromServer, screen));
      screen = null;
      text = '';
      cursor = 0;
      awaiting = null;
      dirty = false;
      fromServer = false;
      i++;
      continue;
    }

    if (code === 127 || code === 8) { // Backspace: borra el carácter anterior al cursor
      if (cursor > 0) {
        text = text.slice(0, cursor - 1) + text.slice(cursor);
        cursor--;
      }
      awaiting = null;
      i++;
      continue;
    }

    if (code === 9) { // Tab: el servidor completa o lista
      awaiting = 'tab';
      stamp = now;
      fromServer = true;
      i++;
      continue;
    }

    if (code === 27) { // ESC
      i++;
      if (data[i] === '[' || data[i] === 'O') {
        i++;
        let params = '';
        while (i < data.length && !/[A-Za-z~]/.test(data[i])) { params += data[i]; i++; }
        const letter = data[i];
        i++;
        const conControl = params.includes(';5') || params.includes(';3'); // Ctrl/Alt + flecha: de palabra en palabra
        switch (letter) {
          case 'A':
          case 'B':
            awaiting = 'history'; // ↑ ↓: bash redibuja la línea con otro comando
            stamp = now;
            fromServer = true;
            break;
          case 'C':
            cursor = conControl ? nextWord(text, cursor) : Math.min(text.length, cursor + 1);
            awaiting = null;
            break;
          case 'D':
            cursor = conControl ? prevWord(text, cursor) : Math.max(0, cursor - 1);
            awaiting = null;
            break;
          case 'H':
            cursor = 0;
            awaiting = null;
            break;
          case 'F':
            cursor = text.length;
            awaiting = null;
            break;
          case '~':
            if (params === '200') { pegando = true; break; } // empieza un pegado protegido
            if (params === '201') { pegando = false; break; }
            if (params === '3') text = text.slice(0, cursor) + text.slice(cursor + 1); // Supr
            else if (params === '1' || params === '7') cursor = 0;
            else if (params === '4' || params === '8') cursor = text.length;
            else fromServer = true; // Insert, AvPág…: que decida la pantalla
            awaiting = null;
            break;
          default:
            fromServer = true; // una tecla especial que el modelo no conoce
            break;
        }
      } else if (i < data.length) {
        // Alt + tecla (Alt+. repite el último argumento, etc.): lo resuelve el servidor
        awaiting = 'history';
        stamp = now;
        fromServer = true;
        i++;
      }
      continue;
    }

    if (code < 32) { // teclas de control
      switch (code) {
        case 1: cursor = 0; awaiting = null; break; // Ctrl+A
        case 5: cursor = text.length; awaiting = null; break; // Ctrl+E
        case 11: text = text.slice(0, cursor); awaiting = null; break; // Ctrl+K
        case 21: text = text.slice(cursor); cursor = 0; awaiting = null; break; // Ctrl+U
        case 23: { // Ctrl+W
          const from = prevWord(text, cursor);
          text = text.slice(0, from) + text.slice(cursor);
          cursor = from;
          awaiting = null;
          break;
        }
        case 3: text = ''; cursor = 0; awaiting = null; dirty = false; fromServer = false; break; // Ctrl+C
        case 18: case 19: case 31: dirty = true; break; // Ctrl+R / Ctrl+S / Ctrl+_: la línea ya no es fiable
        // Ctrl+B/D/F (mover, borrar), Ctrl+N/P (historial), Ctrl+T (intercambiar), Ctrl+V, Ctrl+Y (pegar lo
        // borrado): el modelo no las reproduce, así que al Enter manda la pantalla.
        case 2: case 4: case 6: case 14: case 16: case 20: case 22: case 25: fromServer = true; break;
        default: break;
      }
      i++;
      continue;
    }

    text = text.slice(0, cursor) + ch + text.slice(cursor);
    cursor++;
    awaiting = null;
    i++;
  }

  return { line: { text, cursor, awaiting, stamp, dirty, fromServer }, commands };
}

/** Redibujo completo: `\r` + prompt + comando (el prompt lleva usuario@host y termina en "$ "). */
function extractRedraw(data: string): string | null {
  const parts = data.split('\r');
  let found: string | null = null;
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('\n')) continue;
    const clean = stripAnsi(part).trim();
    if (!clean) continue;
    const dollar = clean.lastIndexOf('$ ');
    if (dollar === -1) continue;
    if (!clean.slice(0, dollar).includes('@')) continue;
    found = clean.slice(dollar + 2).trim();
  }
  return found;
}

/**
 * Lo que el servidor ESCRIBE de vuelta. Solo cuenta justo después de Tab o ↑/↓ (ventana de SYNC_WINDOW_MS): ahí
 * se aplica a la línea como lo haría la pantalla (retroceso, borrar hasta el final, escribir encima).
 */
export function serverOutput(prev: ShellLine, data: string, now: number): ShellLine {
  if (!prev.awaiting || now - prev.stamp > SYNC_WINDOW_MS) return prev;

  const redraw = extractRedraw(data);
  if (redraw !== null) return { ...prev, text: redraw, cursor: redraw.length };

  // Varias líneas sin prompt reconocible (lista de compleciones, avisos): no es la línea de comandos.
  if (data.includes('\n')) return prev;

  let { text, cursor } = prev;
  let i = 0;
  while (i < data.length) {
    const ch = data[i];
    const code = data.charCodeAt(i);

    if (code === 27) {
      if (data[i + 1] === '[') {
        let j = i + 2;
        let params = '';
        while (j < data.length && !/[A-Za-z@`~]/.test(data[j])) { params += data[j]; j++; }
        const letter = data[j];
        const n = parseInt(params, 10) || 1;
        switch (letter) {
          case 'K': if (params === '' || params === '0') text = text.slice(0, cursor); break;
          case 'P': text = text.slice(0, cursor) + text.slice(cursor + n); break;
          case '@': text = text.slice(0, cursor) + ' '.repeat(n) + text.slice(cursor); break;
          case 'C': cursor = Math.min(text.length, cursor + n); break;
          case 'D': cursor = Math.max(0, cursor - n); break;
          default: break;
        }
        i = j + 1;
      } else if (data[i + 1] === ']') {
        const fin = data.indexOf('\x07', i);
        i = fin === -1 ? data.length : fin + 1;
      } else {
        i += 2;
      }
      continue;
    }

    if (ch === '\b') {
      cursor = Math.max(0, cursor - 1);
      i++;
      continue;
    }
    if (code < 32 || code === 127) { i++; continue; }

    text = cursor < text.length ? text.slice(0, cursor) + ch + text.slice(cursor + 1) : text + ch;
    cursor++;
    i++;
  }

  return { ...prev, text, cursor };
}

/**
 * Programas de pantalla completa (nano, less, top, vim) entran a la «pantalla alterna» de la terminal con
 * `ESC[?1049h` (o `?1047h` / `?47h`) y salen con la `l`. Mientras están abiertos, lo que se teclea es para ellos:
 * un Enter dentro de nano es un salto de línea del archivo, no un comando de la shell.
 * Devuelve si, después de esta salida del servidor, la terminal queda en la pantalla alterna. `cola` son los
 * últimos caracteres del fragmento anterior, por si la secuencia llegó partida en dos.
 */
export function pantallaAlterna(antes: boolean, cola: string, data: string): boolean {
  const re = /\x1b\[\?(?:1049|1047|47)([hl])/g;
  let estado = antes;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cola + data)) !== null) estado = m[1] === 'h';
  return estado;
}
