// features/circuitos/contextoCircuito.ts — lo que el tutor del chat «ve» de la práctica de circuitos: la práctica, cómo va el
// estudiante y su circuito tal como está ahora (piezas, dónde están encajadas, qué está unido con qué, corrientes y quemados).
// Va como mensaje de sistema en cada respuesta, así el tutor puede contestar «¿así va bien?» mirando el circuito real.
import { corrienteLed, evaluar, valorResistencia, type Resultado } from './comprobaciones';
import { pasoActual } from './practicaEnCurso';
import type { PracticaCircuito } from './practicas';
import type { EstadoSimulador } from './simulador';

export const REGLAS_CIRCUITOS =
  'MODO PRÁCTICA DE CIRCUITOS (estas reglas mandan sobre el FORMATO DE RESPUESTA): eres el tutor de un estudiante que ' +
  'arma un circuito en un simulador de protoboard. Responde en español, con texto corto y lenguaje simple. NO uses títulos ' +
  '(«### Explicación», «### Comandos» ni otros) y NO pongas bloques de código ni comandos de terminal: aquí no hay terminal. ' +
  'Cuando te pregunte si va bien, mira la descripción de SU CIRCUITO AHORA (abajo) y dile concretamente qué está bien y qué ' +
  'no, nombrando piezas, pines y columnas de la protoboard. Guía con preguntas; no le des el resultado final si no lo ha ' +
  'intentado. Nunca inventes conexiones que no aparecen en la descripción.';

/** Nombre de cada pin para una persona (los pines del simulador son 'A', 'C', '1', '+'…). */
function nombrePin(tipo: string | undefined, pin: string): string {
  if (tipo === 'led') return pin === 'A' ? 'ánodo (pata larga, A)' : pin === 'C' ? 'cátodo (pata corta, C)' : pin;
  if (tipo === 'resistor') return `pata ${pin}`;
  if (tipo?.startsWith('battery')) return pin === '+' ? 'borne +' : 'borne −';
  return pin;
}

/** «bb1:12t.a» → columna 12, mitad de arriba (fila a). */
function agujero(pin: string): string {
  const m = /^(\d+)([tb])\.([a-j])$/.exec(pin);
  if (!m) return pin.startsWith('t') || pin.startsWith('b') ? `riel ${pin}` : pin;
  return `columna ${m[1]} ${m[2] === 't' ? 'de arriba' : 'de abajo'} (fila ${m[3]})`;
}

const formatoV = (v: number) => `${(Math.abs(v) < 0.005 ? 0 : v).toFixed(2).replace('.', ',')} V`;
const COLORES: Record<string, string> = { red: 'rojo', green: 'verde', yellow: 'amarillo', blue: 'azul', white: 'blanco', orange: 'naranja' };
const formatoMA = (a: number) => `${(a * 1000).toFixed(1).replace('.', ',')} mA`;

/** El circuito del estudiante, en palabras. */
export function describirCircuito(practica: PracticaCircuito, estado: EstadoSimulador | null): string {
  if (!estado) return 'Todavía no hay datos del simulador (está cargando).';
  const tipos = new Map(estado.componentes.map((c) => [c.id, c.tipo]));
  const nombre = (id: string) => practica.parts[id] ?? id;
  const esProtoboard = (id: string) => (tipos.get(id) ?? '').includes('breadboard');

  const piezas = estado.componentes
    .filter((c) => !esProtoboard(c.id))
    .map((c) => {
      const extra = c.tipo === 'resistor' ? ` de ${valorResistencia(estado, c.id) ?? '?'} Ω`
        : c.tipo === 'led' ? ` (${COLORES[String(c.propiedades.color ?? 'red')] ?? String(c.propiedades.color)})` : '';
      return `- ${nombre(c.id)} [${c.id}]${extra}${estado.quemadas.includes(c.id) ? ' — QUEMADA' : ''}`;
    });

  // Voltajes respecto del − de la pila (el simulador no tiene una tierra fija: sin esa referencia los números no dicen nada)
  const pila = estado.componentes.find((c) => c.tipo.startsWith('battery'));
  const redMenos = pila ? estado.redes[`${pila.id}:−`] ?? estado.redes[`${pila.id}:-`] : undefined;
  const voltaje = (red: string) => (red === '0' ? 0 : estado.voltajes[red]);
  const vRef = redMenos != null ? voltaje(redMenos) : undefined;

  // cada red: qué pines de piezas y qué agujeros de la protoboard quedan unidos
  const porRed = new Map<string, { pines: string[]; agujeros: string[] }>();
  for (const [punto, red] of Object.entries(estado.redes)) {
    const [id, pin] = [punto.slice(0, punto.indexOf(':')), punto.slice(punto.indexOf(':') + 1)];
    const g = porRed.get(red) ?? { pines: [], agujeros: [] };
    if (esProtoboard(id)) g.agujeros.push(agujero(pin));
    else g.pines.push(`${nombrePin(tipos.get(id), pin)} de ${nombre(id)}`);
    porRed.set(red, g);
  }
  const nodos = [...porRed.entries()]
    .filter(([, g]) => g.pines.length > 0)
    .map(([red, g]) => {
      const v = voltaje(red);
      const textoV = typeof v === 'number' && typeof vRef === 'number' ? ` (${formatoV(v - vRef)} respecto del − de la pila)` : '';
      const lugar = g.agujeros.length ? `; en la protoboard: ${[...new Set(g.agujeros)].join(', ')}` : '';
      return `- Unidos${textoV}: ${g.pines.join(' + ')}${lugar}`;
    });

  // pines que no tocan nada (piezas con dos pines conocidos)
  const PINES: Record<string, string[]> = { led: ['A', 'C'], resistor: ['1', '2'], 'battery-9v': ['+', '−'] };
  const sueltos = estado.componentes.flatMap((c) =>
    (PINES[c.tipo] ?? [])
      .filter((p) => !(`${c.id}:${p}` in estado.redes) && !(p === '−' && `${c.id}:-` in estado.redes))
      .map((p) => `${nombrePin(c.tipo, p)} de ${nombre(c.id)}`));

  const leds = estado.componentes.filter((c) => c.tipo === 'led').map((c) => {
    const i = corrienteLed(estado, c.id);
    const como = estado.quemadas.includes(c.id) ? 'QUEMADO' : i != null && i > 1e-4 ? `encendido, ${formatoMA(i)}` : 'apagado (no pasa corriente)';
    return `- ${nombre(c.id)}: ${como}`;
  });

  return [
    'Piezas en el lienzo:', ...piezas,
    nodos.length ? 'Conexiones (cada línea es un grupo de puntos unidos eléctricamente):' : 'Conexiones: ninguna todavía (nada está encajado ni cableado).',
    ...nodos,
    sueltos.length ? `Sin conectar: ${sueltos.join('; ')}.` : null,
    'Lo que mide el simulador:', ...leds,
    // «no vectors» es lo que dice ngspice cuando no hay nada que resolver (sin conexiones): no es un problema del circuito
    estado.error && !/no vectors/i.test(estado.error) ? `Aviso del simulador: ${estado.error}` : null,
  ].filter(Boolean).join('\n');
}

const PALABRA: Record<Resultado, string> = { bien: 'cumplida', falta: 'pendiente', mal: 'NO cumple' };

/** Todo el contexto del tutor para la próxima respuesta. */
export function contextoTutorCircuito(practica: PracticaCircuito, estado: EstadoSimulador | null, logrados: Set<string>): string {
  const actual = pasoActual(practica, logrados);
  const numero = actual ? practica.steps.indexOf(actual) + 1 : 0;
  return [
    REGLAS_CIRCUITOS,
    '',
    `PRÁCTICA: ${practica.title}. Objetivo: ${practica.objective}`,
    'Pasos de la práctica (el chat se los va entregando de a uno):',
    ...practica.steps.map((s, i) => `${i + 1}. ${s.title}${logrados.has(s.id) ? ' (YA LOGRADO)' : ''}: ${s.text}`),
    actual
      ? `PASO EN EL QUE VA AHORA: ${numero}. ${actual.title}. Ayúdale con este paso; no le adelantes los siguientes.`
      : 'YA TERMINÓ TODOS LOS PASOS: felicítalo si pregunta y respóndele lo que quiera saber.',
    '',
    `LO QUE DEBES SABER DE ESTA PRÁCTICA (no lo recites): ${practica.tutor_context}`,
    '',
    'COMPROBACIONES (lo que ve el estudiante a la izquierda):',
    ...practica.checks.map((c) => `- ${c.text}: ${PALABRA[evaluar(c, estado)]}`),
    '',
    'SU CIRCUITO AHORA:',
    describirCircuito(practica, estado),
  ].join('\n');
}
