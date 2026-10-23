/**
 * cvaSessionDiagnostics.ts
 *
 * Módulo de diagnóstico de sesión continua (hasta 3 horas) para CVA.
 * Registra muestras periódicas cada ~10s en un búfer circular acotado,
 * monitoreando memoria JS, tareas largas (LongTasks), métricas del esqueleto
 * y estadísticas de envío de frames.
 */

export interface CvaDiagnosticSnapshot {
    timestamp: string;
    envioCargaPct: number;
    esqueletoCostoMs: number;
    esqueletoFps: number;
    esqueletoEstado: string;
    cuadrosEnviados: number;
    cuadrosDescartados: number;
    cuadrosFallidos: number;
    memoriaJsMb: number | null;
    tareasLargasCount: number;
}

export class BoundedCircularBuffer<T> {
    private buffer: T[] = [];
    private maxSize: number;

    constructor(maxSize: number = 1200) {
        this.maxSize = maxSize;
    }

    push(item: T): void {
        if (this.buffer.length >= this.maxSize) {
            this.buffer.shift();
        }
        this.buffer.push(item);
    }

    getAll(): T[] {
        return [...this.buffer];
    }

    size(): number {
        return this.buffer.length;
    }

    getMaxSize(): number {
        return this.maxSize;
    }

    clear(): void {
        this.buffer = [];
    }
}

/**
 * Obtiene el uso de memoria JS heap si la API performance.memory está disponible.
 */
export function getJsHeapMemoryMb(): number | null {
    if (typeof window !== 'undefined' && (window.performance as any)?.memory?.usedJSHeapSize) {
        const bytes = (window.performance as any).memory.usedJSHeapSize;
        return Math.round((bytes / (1024 * 1024)) * 10) / 10;
    }
    return null;
}

/**
 * Administrador del observer de Long Tasks (tareas largas del hilo principal >50ms).
 */
export class LongTaskTracker {
    private count = 0;
    private observer: PerformanceObserver | null = null;

    constructor() {
        if (
            typeof window !== 'undefined' &&
            typeof PerformanceObserver !== 'undefined' &&
            PerformanceObserver.supportedEntryTypes?.includes('longtask')
        ) {
            try {
                this.observer = new PerformanceObserver((list) => {
                    this.count += list.getEntries().length;
                });
                this.observer.observe({ entryTypes: ['longtask'] });
            } catch (_) {
                this.observer = null;
            }
        }
    }

    getCount(): number {
        return this.count;
    }

    disconnect(): void {
        if (this.observer) {
            try {
                this.observer.disconnect();
            } catch (_) {}
            this.observer = null;
        }
    }
}

/**
 * Exporta el historial de diagnóstico a un archivo CSV descargable.
 */
export function exportDiagnosticsToCsv(
    entries: CvaDiagnosticSnapshot[],
    filename = 'cva_diagnostico_sesion_3h.csv'
): void {
    const headers = [
        'timestamp',
        'envio_carga_pct',
        'esqueleto_costo_ms',
        'esqueleto_fps',
        'esqueleto_estado',
        'cuadros_enviados',
        'cuadros_descartados',
        'cuadros_fallidos',
        'memoria_js_mb',
        'tareas_largas_count',
    ];

    const rows = entries.map((e) => [
        e.timestamp,
        e.envioCargaPct,
        e.esqueletoCostoMs.toFixed(1),
        e.esqueletoFps,
        `"${e.esqueletoEstado}"`,
        e.cuadrosEnviados,
        e.cuadrosDescartados,
        e.cuadrosFallidos,
        e.memoriaJsMb !== null ? e.memoriaJsMb : 'N/A',
        e.tareasLargasCount,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
