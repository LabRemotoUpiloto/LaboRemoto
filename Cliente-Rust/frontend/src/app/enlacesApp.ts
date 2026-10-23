// utils/enlacesApp.ts — enlaces laboremoto://… que abren la app (p. ej. desde una tarea de Moodle, vía la página puente del broker).
// La entrada no es de fiar (cualquier página puede lanzar un enlace así): solo se acepta lo que se reconoce y el id se valida estricto.
// Un enlace solo NAVEGA (abre la práctica en pantalla); nunca arranca nada por sí mismo.

export type EnlaceApp = { tipo: 'practica'; id: string };

const ID_PRACTICA = /^[A-Za-z0-9._-]{1,100}$/;

/** `laboremoto://practica/<id>` -> `{tipo:'practica', id}`; cualquier otra cosa -> `null`. */
export function leerEnlaceApp(texto: string): EnlaceApp | null {
  let url: URL;
  try { url = new URL(texto.trim()); } catch { return null; }
  if (url.protocol !== 'laboremoto:') return null;
  if (url.hostname.toLowerCase() !== 'practica') return null;
  // Windows puede agregar una barra final: laboremoto://practica/ev3-m3/
  const id = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, '');
  return ID_PRACTICA.test(id) ? { tipo: 'practica', id } : null;
}
