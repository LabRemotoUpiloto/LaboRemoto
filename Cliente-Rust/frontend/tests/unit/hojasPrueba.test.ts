import { describe, it, expect } from 'vitest';
import type { MuestraPi } from '@/features/monitoreo/rendimiento.service';
import { resumirPrueba } from '@/features/monitoreo/rendimientoStats';
import { COLUMNAS, hojasDePrueba, type Celda } from '@/features/monitoreo/hojasPrueba';

function muestra(t: number, estudiantes: number, cpu: number): MuestraPi {
  return {
    t, cpu_pct: cpu, cpu_nucleos: [cpu, cpu / 2, 5, 5], iowait_pct: 0, carga: [1, 1, 1],
    memoria: { total_mb: 7847, usada_mb: 1800, pct: 22.9, swap_usada_mb: 0 },
    temperatura_c: 48.26, frenado: null, red_rx_kbps: 2000, red_tx_kbps: 6543,
    conexiones: { ssh: estudiantes },
    sesiones_ssh: { estudiantes: 0, estudiantes_distintos: 0, tuneles_app: estudiantes, otras: 0 },
    camaras: { total: 4, por_camara: {} },
    api: { peticiones: 10, errores: 0, en_curso: 0, p50_ms: 30, p95_ms: 80, max_ms: 120, bytes: 1000, por_tipo: {} },
  };
}

const muestras = [muestra(1760800000, 5, 20), muestra(1760800002, 24, 93), muestra(1760800004, 25, 60)];
const hojas = hojasDePrueba(muestras, resumirPrueba(muestras)!);
const valores = (fila: (Celda | null)[]) => fila.map((c) => c?.value ?? null);

describe('Excel de la prueba de rendimiento', () => {
  it('trae las tres hojas con nombres que se entienden', () => {
    expect(hojas.map((h) => h.sheet)).toEqual(['Resumen', 'Datos cada 2 segundos', 'Qué significa cada dato']);
  });

  it('el resumen dice con cuántos estudiantes se degradó', () => {
    const resultado = hojas[0].data.find((f) => f[0]?.value === 'Resultado')!;
    expect(String(resultado[1]!.value)).toContain('Se degradó con 24 estudiantes');
    expect(String(resultado[1]!.value)).toContain('cpu llegó a 93 %');
  });

  it('una fila por medición, con títulos claros y números como números', () => {
    const datos = hojas[1].data;
    expect(valores(datos[0])).toEqual(COLUMNAS.map((c) => c.titulo));
    expect(datos).toHaveLength(1 + muestras.length);
    const col = (titulo: string) => COLUMNAS.findIndex((c) => c.titulo === titulo);
    expect(datos[2][col('Estudiantes conectados')]).toMatchObject({ value: 24, type: Number });
    expect(datos[2][col('CPU (%)')]).toMatchObject({ value: 93, format: '0.0' });
    expect(datos[1][col('Subida (Mbps)')]).toMatchObject({ value: 6.54 });
    expect(datos[1][col('Temperatura (°C)')]).toMatchObject({ value: 48.3 });
  });

  it('cada columna de los datos está explicada', () => {
    const significado = hojas[2].data.slice(1);
    expect(significado.map((f) => f[0]?.value)).toEqual(COLUMNAS.map((c) => c.titulo));
    expect(significado.every((f) => String(f[1]?.value).length > 10)).toBe(true);
  });
});
