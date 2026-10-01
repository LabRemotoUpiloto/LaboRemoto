/** @typedef {import('./tipos.js').Config} Config */

/**
 * Valores por defecto del robot. Cambiar aquí afecta a toda la app: nunca
 * dupliques estos números sueltos en componentes o en el módulo de cinemática.
 *
 * @type {Config}
 */
export const CONFIG_POR_DEFECTO = {
  diametroRuedaCm: 5.6,
  anchoViaCm: 12.0,
  factorCalibracion: 1.0,
  potencia: 40,
};
