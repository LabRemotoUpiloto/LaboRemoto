// features/practicas/ev3/trayectorias/odometria.ts — odometría: dónde quedó el robot según lo que giraron de verdad
// sus motores (encoders). Es la operación inversa a cinematica.ts. Módulo puro.
import { gradosMotorPorCm, normalizarAngulo } from './cinematica';
import type { ConfigRobot, GradosMotores, Pose } from './tipos';

/**
 * Nueva pose a partir de lo que giró cada motor desde la pose anterior. Cada rueda avanzó Δs = Δgrados / gradosPorCm;
 * el centro avanza el promedio y el giro sale de la diferencia entre ruedas sobre el ancho de vía. Se proyecta con el
 * rumbo a mitad de camino (θ + Δθ/2) para no acumular error en las curvas.
 */
export function odometriaInversa(deltaGradosIzq: number, deltaGradosDer: number, poseAnterior: Pose, config: ConfigRobot): Pose {
  const gradCm = gradosMotorPorCm(config.diametroRuedaCm);
  const deltaSIzqCm = deltaGradosIzq / gradCm;
  const deltaSDerCm = deltaGradosDer / gradCm;
  const deltaSCm = (deltaSIzqCm + deltaSDerCm) / 2;
  const deltaThetaRad = (deltaSDerCm - deltaSIzqCm) / config.anchoViaCm;
  const thMedioRad = (poseAnterior.th * Math.PI) / 180 + deltaThetaRad / 2;
  return {
    x: poseAnterior.x + deltaSCm * Math.cos(thMedioRad),
    y: poseAnterior.y + deltaSCm * Math.sin(thMedioRad),
    th: normalizarAngulo(poseAnterior.th + (deltaThetaRad * 180) / Math.PI),
  };
}

/** Poses a partir de lecturas acumuladas de los encoders (no deltas). Incluye la pose inicial en el índice 0. */
export function reconstruirTrayectoria(lecturasAcumuladas: GradosMotores[], poseInicial: Pose, config: ConfigRobot): Pose[] {
  const poses = [poseInicial];
  let anteriorIzq = 0;
  let anteriorDer = 0;
  for (const lectura of lecturasAcumuladas) {
    poses.push(odometriaInversa(lectura.izquierda - anteriorIzq, lectura.derecha - anteriorDer, poses[poses.length - 1], config));
    anteriorIzq = lectura.izquierda;
    anteriorDer = lectura.derecha;
  }
  return poses;
}

/** Distancia en línea recta entre donde terminó el robot y donde debía terminar, en cm. */
export function errorFinalCm(poseReal: Pose, posePlaneada: Pose): number {
  return Math.hypot(poseReal.x - posePlaneada.x, poseReal.y - posePlaneada.y);
}
