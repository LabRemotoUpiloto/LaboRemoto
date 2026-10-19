import { describe, it, expect } from 'vitest';
import type { LinuxBlock } from '../../src/services/linuxPractice.service';
import { armarPlan, accionesDelPaso, accionActual, instruccion, tituloDelPaso } from '../../src/components/practicas/linux/ritmo';

const texto = (id: string): LinuxBlock => ({ type: 'text', id, body_md: id });
const imagen = (id: string): LinuxBlock => ({ type: 'media', id, kind: 'image', file: `${id}.png` });
const video = (id: string): LinuxBlock => ({ type: 'media', id, kind: 'video', file: `${id}.mp4` });
const tarea = (id: string): LinuxBlock => ({ type: 'command_step', id, command: id, explain_md: id });
const pregunta = (id: string): LinuxBlock => ({ type: 'quiz', id, question_md: id, options: [] });

/** Los pasos como `[a b] [c]` para leer el corte de un vistazo. */
const forma = (blocks: LinuxBlock[]) =>
  armarPlan(blocks).pasos.map((p) => `[${p.bloques.map((b) => b.id).join(' ')}]`).join(' ');

describe('armarPlan — el módulo en pasos', () => {
  it('corta como linux-m3: cada texto abre paso y el comando va después del material', () => {
    const blocks = [
      texto('intro'), texto('nano'), imagen('atajos'), video('demo'),
      tarea('nano-cmd'), tarea('ls'), tarea('wc'),
      texto('tuberia'), imagen('ejemplo'), tarea('echo'),
      texto('puente'), tarea('reto'), imagen('resumen'),
      pregunta('q1'), pregunta('q2'), { type: 'checkpoint', id: 'cp' },
    ];
    expect(forma(blocks)).toBe(
      '[intro] [nano atajos demo] [nano-cmd] [ls] [wc] [tuberia ejemplo] [echo] [puente reto] [resumen]',
    );
    const plan = armarPlan(blocks);
    expect(plan.preguntas.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(plan.total).toBe(10);
  });

  it('solo los pasos sin comandos llevan botón «Siguiente paso»', () => {
    const plan = armarPlan([texto('a'), imagen('b'), texto('c'), tarea('d')]);
    expect(plan.pasos.map((p) => p.conBoton)).toEqual([true, false]);
  });

  it('con frenos propios (EV3) cada freno cierra un paso y conserva su etiqueta', () => {
    const plan = armarPlan([
      texto('a'), imagen('b'), { type: 'step_gate', id: 'g1', label: 'Ya lo vi, sigue' },
      texto('c'), texto('d'), pregunta('q'),
    ]);
    expect(plan.pasos.map((p) => p.bloques.map((b) => b.id))).toEqual([['a', 'b'], ['c', 'd']]);
    expect(plan.pasos[0].etiquetaBoton).toBe('Ya lo vi, sigue');
  });
});

describe('acciones del paso y la franja «Ahora:»', () => {
  const [paso] = armarPlan([texto('nano'), imagen('atajos'), video('demo')]).pasos;

  it('lista leer, abrir la imagen, mirar el video y seguir', () => {
    expect(accionesDelPaso(paso).map((a) => a.texto)).toEqual([
      'Lee la explicación', 'Abre la imagen', 'Mira el video', 'Pasa al siguiente paso',
    ]);
    expect(tituloDelPaso(paso)).toBe('Lee y mira el video');
  });

  it('mientras toca leer, resalta lo siguiente: el botón de la imagen', () => {
    const { actual, resaltada } = accionActual(accionesDelPaso(paso), new Set());
    expect(actual?.tipo).toBe('leer');
    expect(resaltada?.id).toBe('atajos');
  });

  it('un paso que es solo una imagen no dice «Lee»', () => {
    const [soloImagen] = armarPlan([imagen('rutas')]).pasos;
    expect(tituloDelPaso(soloImagen)).toBe('Mira la imagen');
  });

  it('un paso de solo texto deja pasar enseguida: «leer» no tiene botón (PasoCard habilita con `resaltada`)', () => {
    const [soloTexto] = armarPlan([texto('gnu')]).pasos;
    const { actual, resaltada } = accionActual(accionesDelPaso(soloTexto), new Set());
    expect(actual?.tipo).toBe('leer');
    expect(resaltada?.tipo).toBe('siguiente');
  });

  it('avanza a la acción pendiente siguiente', () => {
    const { actual, resaltada } = accionActual(accionesDelPaso(paso), new Set(['leer', 'atajos']));
    expect(actual?.id).toBe('demo');
    expect(resaltada?.id).toBe('demo');
  });

  it('el comando se pide tal cual, con dónde escribirlo', () => {
    const [p] = armarPlan([texto('intro'), tarea('ls -l')]).pasos;
    const comando = accionesDelPaso(p).find((a) => a.tipo === 'comando')!;
    expect(comando.texto).toBe('Escribe ls -l en la terminal');
    expect(instruccion(comando)).toBe('escribe ls -l en la terminal y presiona Enter.');
  });

  it('marca el primer paso con comando, donde se explica qué es la terminal', () => {
    const plan = armarPlan([texto('a'), imagen('b'), tarea('c'), tarea('d')]);
    expect(plan.pasos.map((p) => p.primerComando)).toEqual([false, true, false]);
  });
});
