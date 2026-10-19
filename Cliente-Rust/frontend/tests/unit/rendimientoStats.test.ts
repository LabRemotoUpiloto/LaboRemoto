import { describe, it, expect } from 'vitest';
import type { MuestraPi } from '../../src/services/rendimiento.service';
import { INDICADORES, estadoDe, resumirPrueba, unirMuestras } from '../../src/pages/rendimiento/rendimientoStats';

/** Muestra mínima: lo que no se pasa queda «sano». */
function muestra(t: number, o: { estudiantes?: number; cpu?: number | null; temp?: number; p95?: number | null; errores?: number; peticiones?: number; frenada?: boolean } = {}): MuestraPi {
  return {
    t,
    cpu_pct: o.cpu === undefined ? 20 : o.cpu,
    cpu_nucleos: null,
    iowait_pct: 0,
    carga: [0.5, 0.5, 0.5],
    memoria: { total_mb: 3800, usada_mb: 1000, pct: 26, swap_usada_mb: 0 },
    temperatura_c: o.temp ?? 50,
    frenado: o.frenada ? { bajo_voltaje: false, frecuencia_limitada: false, frenada: true, limite_temperatura: true, hubo_bajo_voltaje: false, hubo_frenado: true } : null,
    red_rx_kbps: 1000,
    red_tx_kbps: 2000,
    conexiones: { ssh: o.estudiantes ?? 0 },
    sesiones_ssh: { estudiantes: o.estudiantes ?? 0, estudiantes_distintos: o.estudiantes ?? 0, tuneles_app: o.estudiantes ?? 0, otras: 0 },
    camaras: { total: 2, por_camara: { cam1: 2 } },
    api: { peticiones: o.peticiones ?? 10, errores: o.errores ?? 0, en_curso: 0, p50_ms: 50, p95_ms: o.p95 === undefined ? 200 : o.p95, max_ms: 300, bytes: 1000, por_tipo: {} },
  };
}

const cpu = INDICADORES.find((i) => i.id === 'cpu')!;

describe('estados por umbral', () => {
  it('bien, alerta y crítico según el valor; sin dato no hay estado', () => {
    expect(estadoDe(cpu, 50)).toBe('bueno');
    expect(estadoDe(cpu, 70)).toBe('alerta');
    expect(estadoDe(cpu, 95)).toBe('critico');
    expect(estadoDe(cpu, null)).toBeNull();
  });
});

describe('resumen de una prueba', () => {
  it('marca con cuántos estudiantes algo llegó a crítico por primera vez', () => {
    const r = resumirPrueba([
      muestra(1, { estudiantes: 5, cpu: 30 }),
      muestra(3, { estudiantes: 18, cpu: 75 }),   // primera alerta
      muestra(5, { estudiantes: 24, cpu: 93 }),   // se cae acá
      muestra(7, { estudiantes: 30, cpu: 99 }),
    ])!;
    expect(r.maxEstudiantes).toBe(30);
    expect(r.primeraAlerta).toMatchObject({ t: 3, estudiantes: 18 });
    expect(r.quiebre).toMatchObject({ t: 5, estudiantes: 24, valor: 93 });
    expect(r.quiebre!.indicador.id).toBe('cpu');
    expect(r.picos.find((p) => p.indicador.id === 'cpu')).toMatchObject({ valor: 99, estudiantes: 30 });
  });

  it('cuenta los errores de la API como porcentaje de las peticiones', () => {
    const r = resumirPrueba([muestra(1, { peticiones: 20, errores: 2 })])!;
    expect(r.quiebre?.indicador.id).toBe('errores');   // 10 % >= 5 %
    expect(r.errores).toBe(2);
    expect(r.peticiones).toBe(20);
  });

  it('sin nada en rojo no hay quiebre, y avisa si la Pi se frenó', () => {
    const r = resumirPrueba([muestra(1, { estudiantes: 12 }), muestra(3, { estudiantes: 12, frenada: true })])!;
    expect(r.quiebre).toBeNull();
    expect(r.primeraAlerta).toBeNull();
    expect(r.huboFrenado).toBe(true);
  });

  it('un dato que la Pi no pudo leer no cuenta como pico ni como quiebre', () => {
    const r = resumirPrueba([muestra(1, { cpu: null, p95: null })])!;
    expect(r.picos.find((p) => p.indicador.id === 'cpu')).toBeUndefined();
    expect(r.quiebre).toBeNull();
  });

  it('sin muestras no hay resumen', () => {
    expect(resumirPrueba([])).toBeNull();
  });
});

describe('historial', () => {
  it('une sin repetir y corta lo más viejo', () => {
    const previas = [muestra(1), muestra(3)];
    const unidas = unirMuestras(previas, [muestra(3), muestra(5), muestra(7)], 3);
    expect(unidas.map((m) => m.t)).toEqual([3, 5, 7]);
  });

});
