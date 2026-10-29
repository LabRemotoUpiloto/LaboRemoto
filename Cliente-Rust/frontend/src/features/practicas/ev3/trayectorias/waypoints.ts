// features/practicas/ev3/trayectorias/waypoints.ts — traducción entre los puntos que se dibujan en el lienzo y las
// primitivas (la fuente de verdad). El lienzo no guarda su propia ruta: cada gesto recalcula la lista con estas
// funciones.
//
// Un punto (waypoint) es el final de un `avanzar`; el `girar` que hace falta para encarar el siguiente punto va justo
// antes («tramo de llegada»). Agregar, mover o borrar un punto solo reescribe los tramos de llegada afectados: los
// arcos y pausas de otras partes de la lista se conservan intactos. Por eso, al mover o borrar un punto, los puntos
// siguientes se reapuntan para seguir en su misma posición, aunque su rumbo de llegada pueda cambiar.
import { normalizarAngulo } from './cinematica';
import { POSE_INICIAL_DEFECTO, poseFinal, simularPrimitivas } from './planificador';
import type { Pose, Primitiva, Punto } from './tipos';

/** Por debajo de este giro no se emite un `girar`: sería ruido en la lista. */
const EPSILON_GRADOS = 0.01;

export interface Waypoint extends Punto {
  /** Índice del `avanzar` que termina en este punto. */
  indicePrimitiva: number;
}

/** El `girar` (si hace falta) y el `avanzar` que llevan de `pose` a `punto`. Vacío si ya está ahí. */
function tramoHaciaPunto(pose: Pose, punto: Punto): Primitiva[] {
  const dx = punto.x - pose.x;
  const dy = punto.y - pose.y;
  const distancia = Math.hypot(dx, dy);
  if (distancia === 0) return [];
  const tramo: Primitiva[] = [];
  const giro = normalizarAngulo((Math.atan2(dy, dx) * 180) / Math.PI - pose.th);
  if (Math.abs(giro) > EPSILON_GRADOS) tramo.push({ tipo: 'girar', grados: giro });
  tramo.push({ tipo: 'avanzar', cm: distancia });
  return tramo;
}

/** Reemplaza solo el tramo de llegada del punto `indiceWaypoint` por uno que termina en `objetivo`. */
function reconstruirTramoHaciaWaypoint(
  primitivas: Primitiva[],
  puntos: Waypoint[],
  indiceWaypoint: number,
  objetivo: Punto,
  poseInicial: Pose,
): Primitiva[] {
  const idxAvanzar = puntos[indiceWaypoint].indicePrimitiva;
  const hayGirarPrevio = idxAvanzar > 0 && primitivas[idxAvanzar - 1].tipo === 'girar';
  const idxInicioTramo = hayGirarPrevio ? idxAvanzar - 1 : idxAvanzar;
  // Lo anterior al tramo no cambia: simularlo da dónde arranca el tramo nuevo.
  const poseAntes = poseFinal(primitivas.slice(0, idxInicioTramo), poseInicial);
  return [
    ...primitivas.slice(0, idxInicioTramo),
    ...tramoHaciaPunto(poseAntes, objetivo),
    ...primitivas.slice(idxAvanzar + 1),
  ];
}

/** Ruta nueva que visita los puntos en orden. Rehace toda la lista: descarta arcos y pausas. */
export function primitivasDesdeWaypoints(puntos: Punto[], poseInicial: Pose = POSE_INICIAL_DEFECTO): Primitiva[] {
  const primitivas: Primitiva[] = [];
  let pose: Pose = { ...poseInicial };
  for (const punto of puntos) {
    const tramo = tramoHaciaPunto(pose, punto);
    if (tramo.length === 0) continue;
    primitivas.push(...tramo);
    const giro = tramo.find((p): p is Extract<Primitiva, { tipo: 'girar' }> => p.tipo === 'girar');
    pose = { x: punto.x, y: punto.y, th: giro ? normalizarAngulo(pose.th + giro.grados) : pose.th };
  }
  return primitivas;
}

/** Puntos arrastrables: la posición del robot al terminar cada `avanzar`. */
export function waypointsDesdePrimitivas(primitivas: Primitiva[], poseInicial: Pose = POSE_INICIAL_DEFECTO): Waypoint[] {
  return simularPrimitivas(primitivas, poseInicial)
    .filter((s) => s.primitiva.tipo === 'avanzar')
    .map((s) => ({ x: s.poseFinal.x, y: s.poseFinal.y, indicePrimitiva: s.indice }));
}

/** Clic en un espacio vacío: agrega un punto al final, sin tocar lo anterior. */
export function agregarWaypoint(primitivas: Primitiva[], nuevaPos: Punto, poseInicial: Pose = POSE_INICIAL_DEFECTO): Primitiva[] {
  return [...primitivas, ...tramoHaciaPunto(poseFinal(primitivas, poseInicial), nuevaPos)];
}

/** Arrastrar un punto: reescribe su tramo y, en cascada, el de los siguientes para que sigan donde estaban. */
export function moverWaypoint(
  primitivas: Primitiva[],
  indiceWaypoint: number,
  nuevaPos: Punto,
  poseInicial: Pose = POSE_INICIAL_DEFECTO,
): Primitiva[] {
  const originales = waypointsDesdePrimitivas(primitivas, poseInicial);
  if (indiceWaypoint < 0 || indiceWaypoint >= originales.length) return primitivas;
  let resultado = primitivas;
  for (let i = indiceWaypoint; i < originales.length; i++) {
    const objetivo = i === indiceWaypoint ? nuevaPos : { x: originales[i].x, y: originales[i].y };
    resultado = reconstruirTramoHaciaWaypoint(resultado, waypointsDesdePrimitivas(resultado, poseInicial), i, objetivo, poseInicial);
  }
  return resultado;
}

/** Doble clic en un punto: lo quita y reapunta los siguientes a su posición original. */
export function eliminarWaypoint(primitivas: Primitiva[], indiceWaypoint: number, poseInicial: Pose = POSE_INICIAL_DEFECTO): Primitiva[] {
  const originales = waypointsDesdePrimitivas(primitivas, poseInicial);
  if (indiceWaypoint < 0 || indiceWaypoint >= originales.length) return primitivas;
  const idxAvanzar = originales[indiceWaypoint].indicePrimitiva;
  const hayGirarPrevio = idxAvanzar > 0 && primitivas[idxAvanzar - 1].tipo === 'girar';
  const idxInicioTramo = hayGirarPrevio ? idxAvanzar - 1 : idxAvanzar;
  let resultado = [...primitivas.slice(0, idxInicioTramo), ...primitivas.slice(idxAvanzar + 1)];
  for (let i = indiceWaypoint; i < originales.length - 1; i++) {
    const objetivo = { x: originales[i + 1].x, y: originales[i + 1].y };
    resultado = reconstruirTramoHaciaWaypoint(resultado, waypointsDesdePrimitivas(resultado, poseInicial), i, objetivo, poseInicial);
  }
  return resultado;
}

/** Shift al agregar o arrastrar: ajusta al ángulo (45°) y a la distancia (5 cm) más cercanos desde el punto anterior. */
export function snapRelativoAAnterior(
  anterior: Punto,
  objetivo: Punto,
  paso: { anguloGrados?: number; distanciaCm?: number } = {},
): Punto {
  const anguloGrados = paso.anguloGrados ?? 45;
  const distanciaCm = paso.distanciaCm ?? 5;
  const dx = objetivo.x - anterior.x;
  const dy = objetivo.y - anterior.y;
  const distancia = Math.hypot(dx, dy);
  if (distancia === 0) return { x: anterior.x, y: anterior.y };
  const pasoRad = (anguloGrados * Math.PI) / 180;
  const anguloSnap = Math.round(Math.atan2(dy, dx) / pasoRad) * pasoRad;
  const distanciaSnap = Math.round(distancia / distanciaCm) * distanciaCm;
  return { x: anterior.x + distanciaSnap * Math.cos(anguloSnap), y: anterior.y + distanciaSnap * Math.sin(anguloSnap) };
}
