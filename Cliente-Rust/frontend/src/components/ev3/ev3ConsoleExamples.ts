/**
 * Programas de ejemplo de la Consola del panel EV3. Corren DENTRO del robot
 * (ev3dev, Python 3.5): no usan f-strings ni nada posterior a 3.5. Los
 * motores se frenan solos al terminar el programa, pero conviene empezar
 * siempre con potencias bajas.
 */

export interface Ev3Example {
  id: string;
  title: string;
  /** Módulo de Aprendizaje al que acompaña (solo para ordenarlos y rotularlos). */
  module: number;
  code: string;
}

export const EV3_EXAMPLES: Ev3Example[] = [
  {
    id: 'hola',
    title: 'Hola, robot (solo imprime)',
    module: 1,
    code: `# Un programa mínimo: no mueve nada, solo imprime.
# Sirve para comprobar que la consola y el robot se entienden.
import time

for i in range(3):
    print("Hola desde el EV3, vuelta", i)
    time.sleep(1)

print("Listo")
`,
  },
  {
    id: 'motor',
    title: 'Mover el motor A (2 segundos)',
    module: 1,
    code: `# Mueve el motor del puerto A al 30 % durante 2 segundos.
from ev3dev2.motor import LargeMotor, OUTPUT_A

motor = LargeMotor(OUTPUT_A)
motor.on_for_seconds(speed=30, seconds=2)
print("Listo")
`,
  },
  {
    id: 'tacto',
    title: 'Leer el sensor de contacto',
    module: 2,
    code: `# Imprime si el sensor de contacto (puerto 1) está presionado.
# Pulsa el sensor del robot mientras corre. Termina solo a los 10 segundos.
import time
from ev3dev2.sensor.lego import TouchSensor
from ev3dev2.sensor import INPUT_1

touch = TouchSensor(INPUT_1)

for i in range(20):
    print("presionado:", touch.is_pressed)
    time.sleep(0.5)
`,
  },
  {
    id: 'reactivo',
    title: 'Avanzar hasta presionar el sensor',
    module: 2,
    code: `# Tu primer programa reactivo: avanza hasta que se presiona el contacto.
from ev3dev2.motor import LargeMotor, OUTPUT_A
from ev3dev2.sensor.lego import TouchSensor
from ev3dev2.sensor import INPUT_1

motor = LargeMotor(OUTPUT_A)
touch = TouchSensor(INPUT_1)

motor.on(30)
while True:
    if touch.is_pressed:
        motor.off()
        break
print("Me detuve")
`,
  },
  {
    id: 'ultra',
    title: 'Frenar si algo está cerca (ultrasónico)',
    module: 4,
    code: `# Avanza y frena si el sensor ultrasónico (puerto 2) ve algo a menos de 15 cm.
# Termina solo a los 20 segundos.
import time
from ev3dev2.motor import LargeMotor, OUTPUT_A
from ev3dev2.sensor.lego import UltrasonicSensor
from ev3dev2.sensor import INPUT_2

motor = LargeMotor(OUTPUT_A)
ultra = UltrasonicSensor(INPUT_2)

inicio = time.time()
while time.time() - inicio < 20:
    distancia = ultra.distance_centimeters
    print("distancia:", distancia)
    if distancia < 15:
        motor.off()
    else:
        motor.on(25)
    time.sleep(0.1)
motor.off()
`,
  },
  {
    id: 'grados',
    title: 'Avanzar una distancia exacta (grados)',
    module: 3,
    code: `# Avanza 20 cm con una rueda de 5,6 cm de diámetro.
# grados = cm * 360 / (pi * diámetro)
import math
from ev3dev2.motor import LargeMotor, OUTPUT_A

DIAMETRO = 5.6   # cm
CM = 20

grados = CM * 360 / (math.pi * DIAMETRO)
print("grados de motor:", grados)

motor = LargeMotor(OUTPUT_A)
inicio = motor.position
motor.on_for_degrees(speed=30, degrees=grados)
print("el encoder avanzó:", motor.position - inicio, "grados")
`,
  },
];

export const EV3_DEFAULT_CODE = EV3_EXAMPLES[0].code;
