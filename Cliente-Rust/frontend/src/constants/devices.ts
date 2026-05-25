/**
 * devices.ts
 *
 * Constantes de dispositivos conocidos en el laboratorio.
 * Centraliza IPs y puertos que antes estaban hardcodeados en hooks y componentes.
 *
 * Si en el futuro estos valores vienen del backend o de configuración,
 * solo hay que cambiar este archivo.
 */

export const KNOWN_DEVICES = {
  RASPBERRY_PI_4: {
    label: 'Raspberry Pi 4',
    host: '200.115.181.211',
    port: 9000,
  },
} as const;

/** Sesión sintética: el backend usa PI4_USER / PI4_PASSWORD del .env */
export const PI4_AGENT_SESSION_ID = '__pi4_env__';

/**
 * Determina si unas credenciales de conexión corresponden a una Raspberry Pi 4
 * del laboratorio (basado en IP y puerto conocidos).
 */
export function isRaspberryPi4(host: string, port: number | string): boolean {
  return (
    host === KNOWN_DEVICES.RASPBERRY_PI_4.host &&
    Number(port) === KNOWN_DEVICES.RASPBERRY_PI_4.port
  );
}

/**
 * Devuelve el label a mostrar al usuario para un host/puerto dado.
 * Si es un dispositivo conocido, muestra su nombre amigable.
 */
export function getDeviceLabel(host: string, port: number | string, user?: string): string {
  if (isRaspberryPi4(host, port)) {
    return user ? `${user}@${KNOWN_DEVICES.RASPBERRY_PI_4.label}` : KNOWN_DEVICES.RASPBERRY_PI_4.label;
  }
  return user ? `${user}@${host}:${port}` : `${host}:${port}`;
}
