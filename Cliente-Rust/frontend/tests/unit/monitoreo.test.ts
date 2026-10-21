import { describe, it, expect } from 'vitest';
import type { MuestraPi } from '../../src/services/rendimiento.service';
import {
  agruparPorDia, agruparPorEstudiantes, duracion, etiquetaDia, paginar, paginasVisibles, tramosEnElTiempo,
} from '../../src/pages/rendimiento/monitoreo';

/** Muestra mínima con lo que usan estas cuentas: estudiantes y CPU. */
function muestra(t: number, estudiantes: number, cpu: number | null): MuestraPi {
  return {
    t, cpu_pct: cpu, cpu_nucleos: null, iowait_pct: 0, carga: null, memoria: null, temperatura_c: null, frenado: null,
    red_rx_kbps: null, red_tx_kbps: null, conexiones: null,
    sesiones_ssh: { estudiantes, estudiantes_distintos: estudiantes, tuneles_app: estudiantes, otras: 0 },
    camaras: null,
    api: { peticiones: 0, errores: 0, en_curso: 0, p50_ms: null, p95_ms: null, max_ms: null, bytes: 0, por_tipo: {} },
  };
}
const cpu = (m: MuestraPi) => m.cpu_pct;

describe('por estudiantes', () => {
  it('da mínimo, mediana y máximo por cantidad de estudiantes, en orden', () => {
    const r = agruparPorEstudiantes([muestra(1, 2, 30), muestra(2, 1, 10), muestra(3, 2, 50), muestra(4, 2, 40)], cpu);
    expect(r).toEqual([
      { estudiantes: 1, minimo: 10, mediana: 10, maximo: 10, muestras: 1 },
      { estudiantes: 2, minimo: 30, mediana: 40, maximo: 50, muestras: 3 },
    ]);
  });

  it('con cantidad par de muestras la mediana es el promedio de las del medio; sin dato no cuenta', () => {
    const r = agruparPorEstudiantes([muestra(1, 3, 10), muestra(2, 3, 20), muestra(3, 3, null)], cpu);
    expect(r).toEqual([{ estudiantes: 3, minimo: 10, mediana: 15, maximo: 20, muestras: 2 }]);
  });
});

describe('en el tiempo', () => {
  it('agrupa en tramos de 30 s con promedio y rango, centrados en su tramo', () => {
    const ms = [muestra(0, 0, 10), muestra(10, 0, 30), muestra(31, 0, 5), muestra(100, 0, 99)];
    expect(tramosEnElTiempo(ms, cpu, 0, 60)).toEqual([
      { t: 15, minimo: 10, promedio: 20, maximo: 30 },
      { t: 45, minimo: 5, promedio: 5, maximo: 5 },
    ]);
  });

  it('la muestra que cae justo en el final de la ventana entra al último tramo', () => {
    const t = tramosEnElTiempo([muestra(50, 0, 10), muestra(60, 0, 20)], cpu, 0, 60);
    expect(t).toEqual([{ t: 45, minimo: 10, promedio: 15, maximo: 20 }]);
  });
});

describe('paginación', () => {
  const items = Array.from({ length: 23 }, (_, i) => i + 1);

  it('corta la página pedida y dice qué se está mostrando', () => {
    const p = paginar(items, 2, 10);
    expect(p.filas).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect([p.pagina, p.paginas, p.total, p.desde, p.hasta]).toEqual([2, 3, 23, 11, 20]);
  });

  it('una página que ya no existe se ajusta a la última; sin filas hay una página vacía', () => {
    expect(paginar(items, 9, 10).pagina).toBe(3);
    expect(paginar([], 1, 10)).toEqual({ filas: [], pagina: 1, paginas: 1, total: 0, desde: 0, hasta: 0 });
  });

  it('muestra la primera, la última y las vecinas, con «…» en los saltos', () => {
    expect(paginasVisibles(1, 15)).toEqual([1, 2, 3, '…', 15]);
    expect(paginasVisibles(8, 15)).toEqual([1, '…', 7, 8, 9, '…', 15]);
    expect(paginasVisibles(15, 15)).toEqual([1, '…', 13, 14, 15]);
    expect(paginasVisibles(1, 2)).toEqual([1, 2]);
  });
});

describe('días y duraciones', () => {
  const ahora = new Date(2026, 9, 21, 9, 0, 0).getTime() / 1000; // mié 21 oct 2026, 09:00
  const el = (dia: number, hora: number) => new Date(2026, 9, dia, hora, 0, 0).getTime() / 1000;

  it('dice hoy y ayer; los demás días solo con la fecha', () => {
    expect(etiquetaDia(el(21, 8), ahora)).toMatch(/^HOY · /);
    expect(etiquetaDia(el(20, 23), ahora)).toMatch(/^AYER · /);
    expect(etiquetaDia(el(19, 21), ahora)).not.toMatch(/HOY|AYER/);
  });

  it('agrupa por día sin cambiar el orden', () => {
    const filas = [{ t: el(21, 8) }, { t: el(20, 21) }, { t: el(20, 19) }, { t: el(18, 21) }];
    expect(agruparPorDia(filas, ahora).map((g) => g.filas.length)).toEqual([1, 2, 1]);
  });

  it('dice cuánto tiempo pasó en palabras cortas', () => {
    expect(duracion(2 * 86400 + 3600 + 59)).toBe('2 d 1 h');
    expect(duracion(3 * 3600 + 12 * 60)).toBe('3 h 12 min');
    expect(duracion(20)).toBe('1 min');
  });
});
