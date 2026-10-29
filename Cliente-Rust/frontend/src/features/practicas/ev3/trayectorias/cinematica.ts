// features/practicas/ev3/trayectorias/cinematica.ts — robot diferencial: de primitivas de movimiento a grados de cada
// motor. Módulo puro (sin DOM ni React).
import type { ConfigRobot, GradosMotores, Primitiva } from './tipos';

/**
 * Grados de motor por cada cm en línea recta. En una vuelta (360°) la rueda avanza su circunferencia, π·D; por regla
 * de tres, 360 / (π·D).
 */
export function gradosMotorPorCm(diametroRuedaCm: number): number {
  return 360 / (Math.PI * diametroRuedaCm);
}

/** Lleva un ángulo al rango (-180, 180]: 370° se lee como 10° y -190° como 170°. */
export function normalizarAngulo(grados: number): number {
  let normalizado = grados % 360;
  if (normalizado <= -180) normalizado += 360;
  if (normalizado > 180) normalizado -= 360;
  return normalizado;
}

/** Avanzar `cm` en línea recta: las dos ruedas giran lo mismo. Con `cm` negativo, retrocede. */
export function calcularAvance(cm: number, config: ConfigRobot): GradosMotores {
  const grados = cm * gradosMotorPorCm(config.diametroRuedaCm) * config.factorCalibracion;
  return { izquierda: grados, derecha: grados };
}

/**
 * Girar sobre su eje (positivo = antihorario). Cada rueda recorre un arco de radio E/2; al pasarlo a grados de motor
 * los π se cancelan y queda Δθ·(E/D)·k.
 */
export function calcularGiro(grados: number, config: ConfigRobot): GradosMotores {
  const magnitud = grados * (config.anchoViaCm / config.diametroRuedaCm) * config.factorCalibracion;
  // Antihorario: la rueda izquierda retrocede y la derecha avanza.
  return { izquierda: -magnitud, derecha: magnitud };
}

/**
 * Arco de radio `radioCm` (desde el centro del eje) que gira `grados`. La rueda exterior recorre R + E/2 y la interior
 * R − E/2; si R < E/2 la interior retrocede. Con R = 0 coincide con `calcularGiro`.
 */
export function calcularArco(radioCm: number, grados: number, config: ConfigRobot): GradosMotores {
  const anguloRad = Math.abs(grados) * (Math.PI / 180);
  const gradCm = gradosMotorPorCm(config.diametroRuedaCm);
  const gradosExterior = (radioCm + config.anchoViaCm / 2) * anguloRad * gradCm * config.factorCalibracion;
  const gradosInterior = (radioCm - config.anchoViaCm / 2) * anguloRad * gradCm * config.factorCalibracion;
  // Antihorario: el centro del giro queda a la izquierda, así que la rueda izquierda es la interior.
  return grados >= 0
    ? { izquierda: gradosInterior, derecha: gradosExterior }
    : { izquierda: gradosExterior, derecha: gradosInterior };
}

/** Grados de cada motor para una primitiva. Las pausas no mueven motores. */
export function gradosMotorParaPrimitiva(primitiva: Primitiva, config: ConfigRobot): GradosMotores {
  switch (primitiva.tipo) {
    case 'avanzar': return calcularAvance(primitiva.cm, config);
    case 'girar': return calcularGiro(primitiva.grados, config);
    case 'arco': return calcularArco(primitiva.radioCm, primitiva.grados, config);
    case 'pausa': return { izquierda: 0, derecha: 0 };
    default: throw new Error(`Primitiva desconocida: ${(primitiva as { tipo: string }).tipo}`);
  }
}
