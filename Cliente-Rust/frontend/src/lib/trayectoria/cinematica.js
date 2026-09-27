/**
 * Cinemática del robot diferencial: convierte primitivas de movimiento
 * (avanzar, girar, arco) en grados de rotación de cada motor.
 *
 * Módulo puro: nada de DOM, nada de fetch, nada de estado de React. Se puede
 * probar con `npm test` sin robot ni navegador.
 *
 * @typedef {import('./tipos.js').Config} Config
 * @typedef {import('./tipos.js').Primitiva} Primitiva
 */

/**
 * Grados de motor que corresponden a 1 cm de avance en línea recta.
 *
 * La rueda es un círculo de diámetro D, así que su circunferencia (π·D) es
 * la distancia que avanza el robot en una vuelta completa (360°) del motor.
 * Por regla de tres: grados por cm = 360 / (π·D).
 *
 * @param {number} diametroRuedaCm
 * @returns {number}
 */
export function gradosMotorPorCm(diametroRuedaCm) {
  return 360 / (Math.PI * diametroRuedaCm);
}

/**
 * Normaliza un ángulo en grados al rango (-180, 180].
 *
 * Se usa en todos lados donde se acumula o se muestra un rumbo, para que
 * "dar una vuelta completa" no vaya inflando el número indefinidamente
 * (por ejemplo 370° debe leerse como 10°, y -190° como 170°).
 *
 * @param {number} grados
 * @returns {number}
 */
export function normalizarAngulo(grados) {
  let normalizado = grados % 360;
  if (normalizado <= -180) normalizado += 360;
  if (normalizado > 180) normalizado -= 360;
  return normalizado;
}

/**
 * Avanzar `cm` en línea recta: las dos ruedas giran lo mismo, en el mismo
 * sentido. `cm` negativo simplemente hace retroceder al robot.
 *
 * @param {number} cm
 * @param {Config} config
 * @returns {{ izquierda: number, derecha: number }} grados de cada motor
 */
export function calcularAvance(cm, config) {
  const grados = cm * gradosMotorPorCm(config.diametroRuedaCm) * config.factorCalibracion;
  return { izquierda: grados, derecha: grados };
}

/**
 * Girar `grados` sobre el propio eje (las dos ruedas se mueven en sentidos
 * opuestos, el robot no se desplaza). Convención: positivo = antihorario.
 *
 * Cada rueda recorre un arco de radio E/2 (la mitad de la vía) al dar la
 * vuelta, así que su desplazamiento en cm es (E/2)·Δθ_rad. Convirtiendo ese
 * desplazamiento a grados de motor con `gradosMotorPorCm` y simplificando
 * (el π de la circunferencia se cancela con el π de pasar grados a
 * radianes) queda la fórmula cerrada: Δθ·(E/D)·k.
 *
 * @param {number} grados Δθ, + = antihorario
 * @param {Config} config
 * @returns {{ izquierda: number, derecha: number }} grados de cada motor
 */
export function calcularGiro(grados, config) {
  const magnitud = grados * (config.anchoViaCm / config.diametroRuedaCm) * config.factorCalibracion;
  // Antihorario (+): la rueda izquierda retrocede y la derecha avanza.
  return { izquierda: -magnitud, derecha: magnitud };
}

/**
 * Arco de radio `radioCm` (siempre medido desde el centro del eje entre
 * ruedas) que gira `grados` (+ = antihorario, mismo criterio que `calcularGiro`).
 *
 * La rueda exterior recorre el arco mayor (radio R + E/2) y la interior el
 * arco menor (radio R - E/2); si R < E/2 la interior incluso retrocede, lo
 * cual es correcto para un giro muy cerrado. Con R=0 esta fórmula coincide
 * exactamente con `calcularGiro` (un giro sobre el propio eje es un arco de
 * radio 0).
 *
 * @param {number} radioCm R, cm (magnitud, siempre ≥ 0)
 * @param {number} grados Δθ, + = antihorario
 * @param {Config} config
 * @returns {{ izquierda: number, derecha: number }} grados de cada motor
 */
export function calcularArco(radioCm, grados, config) {
  const anguloRad = Math.abs(grados) * (Math.PI / 180);
  const gradCm = gradosMotorPorCm(config.diametroRuedaCm);

  const distExteriorCm = (radioCm + config.anchoViaCm / 2) * anguloRad;
  const distInteriorCm = (radioCm - config.anchoViaCm / 2) * anguloRad;

  const gradosExterior = distExteriorCm * gradCm * config.factorCalibracion;
  const gradosInterior = distInteriorCm * gradCm * config.factorCalibracion;

  // Antihorario (+): el centro del giro queda a la izquierda del robot, así
  // que la rueda izquierda es la interior. Horario (-): al revés.
  return grados >= 0
    ? { izquierda: gradosInterior, derecha: gradosExterior }
    : { izquierda: gradosExterior, derecha: gradosInterior };
}

/**
 * Despacha una `Primitiva` a su cálculo correspondiente. Las pausas no
 * mueven motores, así que devuelven grados 0 en ambos.
 *
 * @param {Primitiva} primitiva
 * @param {Config} config
 * @returns {{ izquierda: number, derecha: number }} grados de cada motor
 */
export function gradosMotorParaPrimitiva(primitiva, config) {
  switch (primitiva.tipo) {
    case 'avanzar':
      return calcularAvance(primitiva.cm, config);
    case 'girar':
      return calcularGiro(primitiva.grados, config);
    case 'arco':
      return calcularArco(primitiva.radioCm, primitiva.grados, config);
    case 'pausa':
      return { izquierda: 0, derecha: 0 };
    default:
      throw new Error(`Primitiva desconocida: ${primitiva.tipo}`);
  }
}
