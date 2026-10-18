// pages/rendimiento/rendimientoStats.ts — cuentas del panel de Rendimiento (sin React, para probarlas aparte).
import type { MuestraPi } from '../../services/rendimiento.service';

export type Estado = 'bueno' | 'alerta' | 'critico';

/** Métricas que se vigilan durante una prueba, con su umbral de alerta y de crítico. */
export interface Indicador {
  id: string;
  titulo: string;
  unidad: string;
  alerta: number;
  critico: number;
  /** Valor de la muestra, o null si la Pi no lo pudo leer. */
  valor: (m: MuestraPi) => number | null;
}

/**
 * Subida de la Pi en Mbps. El enlace del laboratorio da unos 23 Mbps (medido con el video de los
 * módulos), así que acercarse a eso significa que el video y las cámaras van a empezar a cortarse.
 */
export const ENLACE_SUBIDA_MBPS = 23;

export const INDICADORES: Indicador[] = [
  { id: 'cpu', titulo: 'CPU', unidad: '%', alerta: 70, critico: 90, valor: (m) => m.cpu_pct },
  { id: 'ram', titulo: 'RAM', unidad: '%', alerta: 75, critico: 90, valor: (m) => m.memoria?.pct ?? null },
  // La Pi 4 empieza a bajar la velocidad sola hacia los 80-85 °C.
  { id: 'temperatura', titulo: 'Temperatura', unidad: '°C', alerta: 70, critico: 80, valor: (m) => m.temperatura_c },
  {
    id: 'subida', titulo: 'Red de subida', unidad: 'Mbps',
    alerta: ENLACE_SUBIDA_MBPS * 0.65, critico: ENLACE_SUBIDA_MBPS * 0.85,
    valor: (m) => (m.red_tx_kbps == null ? null : m.red_tx_kbps / 1000),
  },
  { id: 'latencia', titulo: 'Respuesta de la API (p95)', unidad: 'ms', alerta: 1000, critico: 3000, valor: (m) => m.api.p95_ms },
  {
    id: 'errores', titulo: 'Errores de la API', unidad: '%', alerta: 0.01, critico: 5,
    valor: (m) => (m.api.peticiones ? (100 * m.api.errores) / m.api.peticiones : 0),
  },
];

export function estadoDe(ind: Indicador, valor: number | null): Estado | null {
  if (valor == null) return null;
  if (valor >= ind.critico) return 'critico';
  if (valor >= ind.alerta) return 'alerta';
  return 'bueno';
}

/**
 * Estudiantes conectados: el mayor entre los que tienen la terminal abierta (SSH con pts) y las apps
 * conectadas a la API (un túnel por app). Un estudiante real tiene las dos; la simulación de carga
 * (loadtest.py) y quien todavía no abrió la terminal, solo el túnel.
 */
export const estudiantesEn = (m: MuestraPi): number | null =>
  m.sesiones_ssh ? Math.max(m.sesiones_ssh.estudiantes, m.sesiones_ssh.tuneles_app) : null;

/** Une el historial con las muestras nuevas, sin repetir y en orden; corta lo más viejo pasado `maximo`. */
export function unirMuestras(previas: MuestraPi[], nuevas: MuestraPi[], maximo = 5400): MuestraPi[] {
  const ultimo = previas.length ? previas[previas.length - 1].t : -Infinity;
  const todas = previas.concat(nuevas.filter((m) => m.t > ultimo));
  return todas.length > maximo ? todas.slice(todas.length - maximo) : todas;
}

export interface Pico {
  indicador: Indicador;
  valor: number;
  t: number;
  estudiantes: number | null;
}

export interface Quiebre {
  indicador: Indicador;
  valor: number;
  t: number;
  estudiantes: number | null;
}

export interface ResumenPrueba {
  inicio: number;
  fin: number;
  maxEstudiantes: number;
  maxCamaras: number;
  peticiones: number;
  errores: number;
  picos: Pico[];
  /** Primer momento en que algo llegó a crítico, y cuántos estudiantes había: el «aquí se cae». */
  quiebre: Quiebre | null;
  /** Primer momento en que algo llegó a alerta. */
  primeraAlerta: Quiebre | null;
  /** La Pi bajó la velocidad (calor o voltaje) en algún momento de la prueba. */
  huboFrenado: boolean;
}

export function resumirPrueba(muestras: MuestraPi[]): ResumenPrueba | null {
  if (muestras.length === 0) return null;
  let quiebre: Quiebre | null = null;
  let primeraAlerta: Quiebre | null = null;
  const picos = new Map<string, Pico>();
  let maxEstudiantes = 0;
  let maxCamaras = 0;
  let peticiones = 0;
  let errores = 0;
  let huboFrenado = false;

  for (const m of muestras) {
    const estudiantes = estudiantesEn(m);
    maxEstudiantes = Math.max(maxEstudiantes, estudiantes ?? 0);
    maxCamaras = Math.max(maxCamaras, m.camaras?.total ?? 0);
    peticiones += m.api.peticiones;
    errores += m.api.errores;
    if (m.frenado && (m.frenado.frenada || m.frenado.bajo_voltaje || m.frenado.frecuencia_limitada)) huboFrenado = true;

    for (const ind of INDICADORES) {
      const valor = ind.valor(m);
      if (valor == null) continue;
      const previo = picos.get(ind.id);
      if (!previo || valor > previo.valor) picos.set(ind.id, { indicador: ind, valor, t: m.t, estudiantes });
      const estado = estadoDe(ind, valor);
      if (estado === 'critico' && !quiebre) quiebre = { indicador: ind, valor, t: m.t, estudiantes };
      if (estado !== 'bueno' && !primeraAlerta) primeraAlerta = { indicador: ind, valor, t: m.t, estudiantes };
    }
  }

  return {
    inicio: muestras[0].t,
    fin: muestras[muestras.length - 1].t,
    maxEstudiantes,
    maxCamaras,
    peticiones,
    errores,
    picos: INDICADORES.map((ind) => picos.get(ind.id)).filter((p): p is Pico => !!p),
    quiebre,
    primeraAlerta,
    huboFrenado,
  };
}
