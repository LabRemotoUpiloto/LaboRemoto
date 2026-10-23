// features/monitoreo/hojasPrueba.ts — el Excel de una prueba de rendimiento, hoja por hoja (sin librerías,
// para probarlo aparte; exportarPrueba.ts lo convierte en .xlsx).
//
// El CSV anterior no se entendía: en Excel con configuración de Colombia la coma no separa columnas,
// y los nombres (`api_p95_ms`, `red_tx`…) no decían qué se medía. Acá cada columna lleva un título
// claro con su unidad, y una hoja aparte explica qué mide cada dato y cuándo es bueno o malo.
import type { MuestraPi } from './rendimiento.service';
import { INDICADORES, estadoDe, estudiantesEn, type Estado, type ResumenPrueba } from './rendimientoStats';

/** Celda en el formato de write-excel-file (solo lo que se usa acá). */
export interface Celda {
  value: string | number | null;
  type?: typeof String | typeof Number;
  format?: string;
  fontWeight?: 'bold';
  fontSize?: number;
  textColor?: string;
  backgroundColor?: string;
  wrap?: boolean;
  columnSpan?: number;
  align?: 'left' | 'center' | 'right';
}
export type Fila = (Celda | null)[];
export interface Hoja {
  sheet: string;
  data: Fila[];
  columns: { width: number }[];
  stickyRowsCount?: number;
}

interface Columna {
  titulo: string;
  /** Qué mide, en palabras simples (hoja «Qué significa cada dato»). */
  mide: string;
  /** Cuándo preocuparse. */
  leer: string;
  valor: (m: MuestraPi) => string | number | null;
  decimales?: number;
  ancho: number;
}

const hora = (t: number) => new Date(t * 1000).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const fecha = (t: number) => new Date(t * 1000).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
const redondo = (v: number | null | undefined, dec = 1) => (v == null ? null : Math.round(v * 10 ** dec) / 10 ** dec);
const ind = (id: string) => INDICADORES.find((i) => i.id === id)!;
const limites = (id: string) => {
  const i = ind(id);
  return `Bien por debajo de ${i.alerta} ${i.unidad}; alerta desde ${i.alerta} ${i.unidad}; crítico desde ${i.critico} ${i.unidad}.`;
};

export const COLUMNAS: Columna[] = [
  { titulo: 'Hora', mide: 'Momento de la medición. La Pi toma una cada 2 segundos.', leer: '—', valor: (m) => hora(m.t), ancho: 10 },
  {
    titulo: 'Estudiantes conectados', ancho: 13,
    mide: 'Cuántos estudiantes estaban conectados: el mayor entre los que tienen la terminal abierta y las apps conectadas.',
    leer: 'Es la carga. Compara las demás columnas contra este número para ver con cuántos estudiantes empieza a fallar algo.',
    valor: estudiantesEn,
  },
  { titulo: 'Con terminal abierta', ancho: 12, mide: 'Estudiantes con una terminal SSH abierta en la Pi.', leer: 'Cada terminal es un proceso que consume CPU y RAM.', valor: (m) => m.sesiones_ssh?.estudiantes ?? null },
  { titulo: 'Apps conectadas', ancho: 11, mide: 'Apps de LaboRemoto conectadas a la Pi (una por estudiante; también las simulaciones).', leer: '—', valor: (m) => m.sesiones_ssh?.tuneles_app ?? null },
  {
    titulo: 'Viendo cámaras', ancho: 10,
    mide: 'Conexiones a las cámaras en vivo. Incluye las grabaciones de Shinobi (unas 4) aunque nadie las esté viendo.',
    leer: 'Resta las grabaciones para saber cuántas personas las están viendo.',
    valor: (m) => m.camaras?.total ?? null,
  },
  { titulo: 'CPU (%)', ancho: 9, decimales: 1, mide: 'Cuánto del procesador de la Pi estaba ocupado (0 a 100 %).', leer: limites('cpu'), valor: (m) => redondo(m.cpu_pct) },
  {
    titulo: 'Núcleo más cargado (%)', ancho: 12, decimales: 1,
    mide: 'El más ocupado de los 4 núcleos del procesador.',
    leer: 'Si llega a 100 % aunque la CPU total esté baja, algún proceso se está quedando con un núcleo entero.',
    valor: (m) => (m.cpu_nucleos?.length ? redondo(Math.max(...m.cpu_nucleos)) : null),
  },
  { titulo: 'RAM usada (%)', ancho: 10, decimales: 1, mide: 'Porcentaje de la memoria de la Pi en uso.', leer: limites('ram'), valor: (m) => redondo(m.memoria?.pct) },
  { titulo: 'RAM usada (MB)', ancho: 10, mide: 'Memoria en uso, en megabytes (la Pi tiene unos 7.800 MB).', leer: '—', valor: (m) => m.memoria?.usada_mb ?? null },
  { titulo: 'Temperatura (°C)', ancho: 11, decimales: 1, mide: 'Temperatura del procesador.', leer: `${limites('temperatura')} Hacia 80-85 °C la Pi baja su velocidad sola.`, valor: (m) => redondo(m.temperatura_c) },
  {
    titulo: '¿Se frenó?', ancho: 9,
    mide: 'Si la Pi estaba bajando su velocidad por calor o por voltaje bajo en ese momento.',
    leer: '«Sí» significa que lo medido no refleja su capacidad normal: revisar ventilación o fuente.',
    valor: (m) => (m.frenado ? (m.frenado.frenada || m.frenado.bajo_voltaje || m.frenado.frecuencia_limitada ? 'Sí' : 'No') : null),
  },
  {
    titulo: 'Subida (Mbps)', ancho: 10, decimales: 2,
    mide: 'Datos que la Pi estaba enviando: video de los módulos, cámaras y respuestas.',
    leer: `${limites('subida')} Cerca del límite del enlace, el video y las cámaras se cortan.`,
    valor: (m) => redondo(m.red_tx_kbps == null ? null : m.red_tx_kbps / 1000, 2),
  },
  { titulo: 'Bajada (Mbps)', ancho: 10, decimales: 2, mide: 'Datos que la Pi estaba recibiendo.', leer: '—', valor: (m) => redondo(m.red_rx_kbps == null ? null : m.red_rx_kbps / 1000, 2) },
  { titulo: 'Peticiones a la API', ancho: 11, mide: 'Pedidos que los estudiantes hicieron a la API de prácticas en esos 2 segundos (abrir módulo, video, validar).', leer: '—', valor: (m) => m.api.peticiones },
  { titulo: 'Peticiones con error', ancho: 11, mide: 'De esas peticiones, cuántas fallaron.', leer: 'Debería ser 0. Cualquier error es un estudiante al que algo no le cargó.', valor: (m) => m.api.errores },
  {
    titulo: 'Respuesta típica de la API (ms)', ancho: 14,
    mide: 'Lo que tardó la API en responder a la mitad de las peticiones (mediana), en milisegundos.',
    leer: 'Menos de 200 ms se siente instantáneo.',
    valor: (m) => redondo(m.api.p50_ms, 0),
  },
  {
    titulo: 'Respuesta lenta de la API (ms)', ancho: 14,
    mide: 'Lo que tardaron las peticiones más lentas (el 5 % más lento, «p95»), en milisegundos.',
    leer: limites('latencia'),
    valor: (m) => redondo(m.api.p95_ms, 0),
  },
];

const COLOR: Record<Estado, string> = { bueno: '#0ca30c', alerta: '#b07700', critico: '#d03b3b' };
const ESTADO_TEXTO: Record<Estado, string> = { bueno: 'Bien', alerta: 'Alerta', critico: 'Crítico' };
const titulo = (texto: string, span: number): Fila => [{ value: texto, fontWeight: 'bold', fontSize: 14, columnSpan: span }, ...Array(span - 1).fill(null)];
const cabecera = (textos: string[]): Fila => textos.map((t) => ({ value: t, fontWeight: 'bold', backgroundColor: '#e8eef8', wrap: true }));
const par = (etiqueta: string, valor: string | number, extra: Partial<Celda> = {}): Fila => [{ value: etiqueta, fontWeight: 'bold' }, { value: valor, ...extra }];

function duracion(seg: number) {
  const m = Math.floor(seg / 60), s = Math.round(seg % 60);
  return m ? `${m} min ${s} s` : `${s} s`;
}

export function hojasDePrueba(muestras: MuestraPi[], resumen: ResumenPrueba): Hoja[] {
  const q = resumen.quiebre;
  const veredicto = q
    ? `Se degradó con ${q.estudiantes ?? '?'} estudiantes: a las ${hora(q.t)} ${q.indicador.titulo.toLowerCase()} llegó a ${redondo(q.valor)} ${q.indicador.unidad} (crítico desde ${q.indicador.critico} ${q.indicador.unidad}).`
    : resumen.primeraAlerta
      ? `Nada llegó a crítico. La primera alerta fue ${resumen.primeraAlerta.indicador.titulo.toLowerCase()} a las ${hora(resumen.primeraAlerta.t)}, con ${resumen.primeraAlerta.estudiantes ?? '?'} estudiantes.`
      : `Todo se mantuvo bien con hasta ${resumen.maxEstudiantes} estudiantes.`;

  const resumenHoja: Fila[] = [
    titulo('Prueba de rendimiento de la Pi4', 8),
    [],
    par('Fecha', fecha(resumen.inicio)),
    par('Inicio', hora(resumen.inicio)),
    par('Fin', hora(resumen.fin)),
    par('Duración', duracion(resumen.fin - resumen.inicio)),
    par('Máximo de estudiantes conectados', resumen.maxEstudiantes, { type: Number }),
    par('Máximo viendo cámaras', resumen.maxCamaras, { type: Number }),
    par('Peticiones a la API', resumen.peticiones, { type: Number }),
    par('Peticiones con error', resumen.errores, { type: Number, textColor: resumen.errores ? COLOR.critico : undefined }),
    par('¿La Pi se frenó por calor o voltaje?', resumen.huboFrenado ? 'Sí: lo medido en ese tramo no refleja su capacidad normal' : 'No'),
    [],
    [{ value: 'Resultado', fontWeight: 'bold' }, { value: veredicto, fontWeight: 'bold', textColor: q ? COLOR.critico : COLOR.bueno, wrap: true, columnSpan: 7 }, null, null, null, null, null, null],
    [],
    titulo('Lo más alto de cada medida', 8),
    cabecera(['Medida', 'Valor más alto', 'Unidad', 'Hora', 'Estudiantes en ese momento', 'Estado', 'Alerta desde', 'Crítico desde']),
    ...resumen.picos.map((p): Fila => {
      const estado = estadoDe(p.indicador, p.valor);
      return [
        { value: p.indicador.titulo },
        { value: redondo(p.valor, p.indicador.unidad === 'Mbps' ? 2 : 1), type: Number },
        { value: p.indicador.unidad },
        { value: hora(p.t) },
        { value: p.estudiantes, type: Number },
        estado ? { value: ESTADO_TEXTO[estado], fontWeight: 'bold', textColor: COLOR[estado] } : { value: '—' },
        { value: redondo(p.indicador.alerta, 2), type: Number },
        { value: redondo(p.indicador.critico, 2), type: Number },
      ];
    }),
    [],
    [{ value: 'Cómo leer este archivo: la hoja «Datos cada 2 segundos» tiene una fila por medición, y la hoja «Qué significa cada dato» explica cada columna.', wrap: true, columnSpan: 8 }, null, null, null, null, null, null, null],
  ];

  const datos: Fila[] = [
    cabecera(COLUMNAS.map((c) => c.titulo)),
    ...muestras.map((m): Fila => COLUMNAS.map((c) => {
      const v = c.valor(m);
      return typeof v === 'number' ? { value: v, type: Number, format: c.decimales ? `0.${'0'.repeat(c.decimales)}` : '0' } : { value: v ?? '' };
    })),
  ];

  const significado: Fila[] = [
    cabecera(['Columna', 'Qué mide', 'Cuándo preocuparse']),
    ...COLUMNAS.map((c): Fila => [{ value: c.titulo, fontWeight: 'bold' }, { value: c.mide, wrap: true }, { value: c.leer, wrap: true }]),
  ];

  return [
    { sheet: 'Resumen', data: resumenHoja, columns: [{ width: 34 }, { width: 14 }, { width: 8 }, { width: 10 }, { width: 14 }, { width: 10 }, { width: 12 }, { width: 12 }] },
    { sheet: 'Datos cada 2 segundos', data: datos, columns: COLUMNAS.map((c) => ({ width: c.ancho })), stickyRowsCount: 1 },
    { sheet: 'Qué significa cada dato', data: significado, columns: [{ width: 28 }, { width: 60 }, { width: 60 }], stickyRowsCount: 1 },
  ];
}
