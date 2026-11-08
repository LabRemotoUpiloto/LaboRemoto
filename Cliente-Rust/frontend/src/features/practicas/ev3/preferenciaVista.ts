// features/practicas/ev3/preferenciaVista.ts — recuerda si cada estudiante prefiere la vista completa de la práctica de
// EV3 («Ver todo»: terminal + Panel EV3) en vez de la guiada.
//
// Se guarda por usuario: en los equipos compartidos del laboratorio, `localStorage` es del computador, y con una clave
// común el siguiente estudiante arrancaba en la vista que eligió el anterior. Sin usuario no se guarda nada (la
// elección dura lo que dure la sesión).

/** Clave común de versiones anteriores: se borra al leer para que no siga mandando en los equipos compartidos. */
export const CLAVE_VISTA_COMPLETA_COMUN = 'labremoto.ev3.vistaCompleta';

export const claveVistaCompleta = (usuario: string) => `${CLAVE_VISTA_COMPLETA_COMUN}:${usuario.toLowerCase()}`;

/** true si este usuario eligió la vista completa. */
export function leerVistaCompleta(usuario: string): boolean {
  try {
    localStorage.removeItem(CLAVE_VISTA_COMPLETA_COMUN);
    return !!usuario && localStorage.getItem(claveVistaCompleta(usuario)) === '1';
  } catch {
    return false;
  }
}

export function guardarVistaCompleta(usuario: string, valor: boolean): void {
  if (!usuario) return;
  try {
    if (valor) localStorage.setItem(claveVistaCompleta(usuario), '1');
    else localStorage.removeItem(claveVistaCompleta(usuario));
  } catch { /* sin almacenamiento: la preferencia dura lo que dure la sesión */ }
}
