/**
 * Catálogo de módulos de aprendizaje. Solo metadata (id, título, resumen,
 * lista de pasos con su id/título) — el CONTENIDO de cada paso vive en su
 * propio componente React (son demasiado distintos entre sí: un diagrama
 * interactivo, un quiz, un simulador de movimiento — forzarlos a un mismo
 * esquema de datos genérico complicaría más de lo que ahorra).
 *
 * Esta lista es lo que usan `AprendizajeHome` (para la grilla de módulos y
 * la barra de progreso) y cada visor de módulo (para el índice de pasos).
 * Agregar un módulo nuevo es: sumar una entrada acá + su carpeta de
 * componentes en `components/Aprendizaje/modulos/`.
 */
export const MODULOS = [
  {
    id: 'reconocimiento-ev3',
    numero: 1,
    titulo: 'Conociendo el EV3',
    resumen: 'Sensores, actuadores, los puertos del ladrillo y los primeros movimientos del robot.',
    pasos: [
      { id: 'intro', titulo: 'Qué es el EV3' },
      { id: 'sensores-actuadores', titulo: 'Sensores y actuadores' },
      { id: 'puertos', titulo: 'Puertos del ladrillo' },
      { id: 'movimientos', titulo: 'Movimientos básicos' },
      { id: 'cargar-archivos', titulo: 'Cargar y ejecutar un programa' },
      { id: 'quiz', titulo: 'Puesta a prueba' },
    ],
  },
  {
    id: 'sensores-en-accion',
    numero: 2,
    titulo: 'Sensores en acción',
    resumen: 'Cómo leer el valor de un sensor y usarlo para tomar decisiones en el programa.',
    pasos: [
      { id: 'como-leer', titulo: 'Cómo leer un sensor' },
      { id: 'tacto', titulo: 'Sensor de contacto' },
      { id: 'ultrasonido', titulo: 'Sensor de distancia' },
      { id: 'color', titulo: 'Sensor de color' },
      { id: 'programa-reactivo', titulo: 'Tu primer programa reactivo' },
      { id: 'quiz', titulo: 'Puesta a prueba' },
    ],
  },
  {
    id: 'movimiento-preciso',
    numero: 3,
    titulo: 'Movimiento preciso y trayectorias',
    resumen: 'De la potencia a la distancia exacta: grados, encoders y giros de ángulo exacto.',
    pasos: [
      { id: 'potencia-a-distancia', titulo: 'De potencia a distancia' },
      { id: 'formula-grados-cm', titulo: 'Grados por centímetro' },
      { id: 'encoders', titulo: 'Encoders' },
      { id: 'girar-angulo', titulo: 'Girar un ángulo exacto' },
      { id: 'quiz', titulo: 'Puesta a prueba' },
    ],
  },
  {
    id: 'comportamientos-reactivos',
    numero: 4,
    titulo: 'Comportamientos reactivos',
    resumen: 'Seguir una línea y evitar obstáculos: sensores y motores trabajando en un bucle continuo.',
    pasos: [
      { id: 'bucle-control', titulo: 'El bucle de control' },
      { id: 'seguir-linea', titulo: 'Seguir una línea' },
      { id: 'evitar-obstaculos', titulo: 'Evitar obstáculos' },
      { id: 'maquina-estados', titulo: 'Combinando comportamientos' },
      { id: 'quiz', titulo: 'Puesta a prueba' },
    ],
  },
  {
    id: 'python-para-robots',
    numero: 5,
    titulo: 'Python para robots',
    resumen: 'Bucles, funciones, máquinas de estado y manejo de errores, aplicados al control del EV3.',
    pasos: [
      { id: 'bucles', titulo: 'Bucles: while y for' },
      { id: 'funciones', titulo: 'Funciones reutilizables' },
      { id: 'maquina-de-estados', titulo: 'Máquinas de estado en código' },
      { id: 'manejo-de-errores', titulo: 'Manejo de errores' },
      { id: 'quiz', titulo: 'Puesta a prueba' },
    ],
  },
  {
    id: 'depuracion-diagnostico',
    numero: 6,
    titulo: 'Depuración y diagnóstico',
    resumen: 'Qué hacer cuando el robot no responde: leer errores, usar print(), y un checklist de diagnóstico.',
    pasos: [
      { id: 'leer-errores', titulo: 'Leer un error de Python' },
      { id: 'print-como-herramienta', titulo: 'print() como herramienta' },
      { id: 'conexion-vs-codigo', titulo: '¿Conexión o código?' },
      { id: 'checklist-diagnostico', titulo: 'Checklist: el motor no gira' },
      { id: 'quiz', titulo: 'Puesta a prueba' },
    ],
  },
  {
    id: 'laboratorio-remoto-criterio',
    numero: 7,
    titulo: 'Usar el laboratorio remoto con criterio',
    resumen: 'Es un robot físico compartido, no una simulación: paro de emergencia y buenas prácticas.',
    pasos: [
      { id: 'es-compartido', titulo: 'Un robot físico, compartido' },
      { id: 'paro-de-emergencia', titulo: 'El paro de emergencia' },
      { id: 'buenas-practicas', titulo: 'Antes y después de una sesión' },
      { id: 'quiz', titulo: 'Puesta a prueba' },
    ],
  },
  {
    id: 'proyecto-integrador',
    numero: 8,
    titulo: 'Proyecto integrador',
    resumen: 'Un desafío abierto para combinar todo lo aprendido, con una guía de trabajo y una autoevaluación.',
    pasos: [
      { id: 'el-desafio', titulo: 'El desafío' },
      { id: 'plan-de-trabajo', titulo: 'Cómo planificarlo' },
      { id: 'checklist-final', titulo: 'Autoevaluación' },
    ],
  },
];
