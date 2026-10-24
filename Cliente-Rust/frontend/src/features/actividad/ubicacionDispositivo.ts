// Ubicación del equipo vía la API del navegador (en Windows la resuelve el
// servicio de ubicación del sistema: wifi cercanas o GPS). La geolocalización
// por IP en red móvil solo da el centro de la ciudad del operador.

// 3 decimales ≈ 110 m: precisión de barrio. Se redondea aquí para que la
// ubicación exacta del estudiante nunca salga de su equipo.
const DECIMALES = 3;
const TIMEOUT_MS = 15_000;

export interface UbicacionDispositivo {
  lat: number;
  lon: number;
  precisionM: number;
}

const redondear = (v: number) => Math.round(v * 10 ** DECIMALES) / 10 ** DECIMALES;

/** `null` si el equipo no tiene ubicación, el usuario la niega o no responde. */
export function obtenerUbicacionDispositivo(): Promise<UbicacionDispositivo | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        lat: redondear(coords.latitude),
        lon: redondear(coords.longitude),
        precisionM: Math.round(coords.accuracy),
      }),
      (err) => {
        console.warn('[ubicacion] no disponible:', err.message);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 5 * 60_000 },
    );
  });
}
