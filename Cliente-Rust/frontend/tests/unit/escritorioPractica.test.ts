// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LinuxBlock } from '@/features/practicas/linuxPractice.service';
import { armarPlan, accionesDelPaso, instruccion, tituloDelPaso } from '@/features/practicas/linux/ritmo';
import {
  EVENTO_ACCION_ESCRITORIO, EVENTO_DETENER_ESCRITORIO, EVENTO_VISTA_PRACTICA,
  accionEscritorioHecha, detenerEscritorio, marcarAccionEscritorio, olvidarAccionesEscritorio, pedirVista,
} from '@/features/practicas/linux/escritorioPractica';

const texto = (id: string): LinuxBlock => ({ type: 'text', id, body_md: id });
const tarea = (id: string): LinuxBlock => ({ type: 'command_step', id, command: id, explain_md: id });
const abrir = (id: string): LinuxBlock => ({ type: 'desktop_task', id, programa: 'terminal', goal_md: id });
const cerrar = (id: string): LinuxBlock => ({ type: 'desktop_close', id });

const forma = (blocks: LinuxBlock[]) =>
  armarPlan(blocks).pasos.map((p) => `[${p.bloques.map((b) => b.id).join(' ')}]`).join(' ');

const escuchar = (evento: string) => {
  const vistos: unknown[] = [];
  const alOir = (ev: Event) => vistos.push((ev as CustomEvent).detail);
  document.addEventListener(evento, alOir);
  return { vistos, dejar: () => document.removeEventListener(evento, alOir) };
};

describe('acciones del escritorio remoto en el plan de pasos', () => {
  const modulo = [texto('shell'), texto('gui'), abrir('g'), texto('contraste'), cerrar('c'), texto('saber')];

  it('cortan como un comando: van con el texto que las presenta y lo que sigue abre paso', () => {
    expect(forma(modulo)).toBe('[shell] [gui g] [contraste c] [saber]');
  });

  it('esos pasos se completan con la acción, sin botón «Siguiente paso»', () => {
    expect(armarPlan(modulo).pasos.map((p) => p.conBoton)).toEqual([true, false, false, true]);
  });

  it('dicen qué hacer en cada paso', () => {
    const [, usar, volver] = armarPlan(modulo).pasos;
    expect(accionesDelPaso(usar).map((a) => a.tipo)).toEqual(['leer', 'escritorio']);
    expect(tituloDelPaso(usar)).toBe('Usa la interfaz gráfica');
    expect(accionesDelPaso(volver).map((a) => a.tipo)).toEqual(['leer', 'volver']);
    expect(tituloDelPaso(volver)).toBe('Vuelve a la terminal');
    expect(instruccion({ id: 'g', tipo: 'escritorio', texto: '' })).toMatch(/doble clic en el ícono «Terminal»/);
  });

  it('no cuentan como el primer comando del módulo', () => {
    const plan = armarPlan([texto('gui'), abrir('g'), texto('a'), tarea('whoami')]);
    expect(forma([texto('gui'), abrir('g'), texto('a'), tarea('whoami')])).toBe('[gui g] [a whoami]');
    expect(plan.pasos.map((p) => p.primerComando)).toEqual([false, true]);
  });
});

describe('estado y avisos del escritorio en la práctica', () => {
  it('una acción se marca una sola vez, avisa por evento y se olvida al cambiar de práctica', () => {
    const oido = escuchar(EVENTO_ACCION_ESCRITORIO);
    marcarAccionEscritorio('g-gui-terminal');
    marcarAccionEscritorio('g-gui-terminal');
    expect(accionEscritorioHecha('g-gui-terminal')).toBe(true);
    expect(oido.vistos).toEqual([{ id: 'g-gui-terminal' }]);
    olvidarAccionesEscritorio();
    expect(accionEscritorioHecha('g-gui-terminal')).toBe(false);
    oido.dejar();
  });

  it('pide la vista y el apagado del escritorio de una sesión concreta', () => {
    const vista = escuchar(EVENTO_VISTA_PRACTICA);
    const detener = escuchar(EVENTO_DETENER_ESCRITORIO);
    pedirVista('escritorio');
    pedirVista('terminal');
    detenerEscritorio('sesion-1');
    expect(vista.vistos).toEqual([{ vista: 'escritorio' }, { vista: 'terminal' }]);
    expect(detener.vistos).toEqual([{ sessionId: 'sesion-1' }]);
    vista.dejar();
    detener.dejar();
  });
});
