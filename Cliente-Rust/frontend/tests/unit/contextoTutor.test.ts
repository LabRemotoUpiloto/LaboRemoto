import { describe, expect, it } from 'vitest';
import type { LinuxModule, LinuxValidationResult } from '@/features/practicas/linuxPractice.service';
import type { DatosGuia } from '@/features/practicas/linux/PasoCard';
import {
  contextoPractica, loQueTocaAhora, relacionDelComando, textoComandoFueraDeLugar,
} from '@/features/practicas/linux/contextoTutor';

const paso = (id: string, command: string) => ({ type: 'command_step', id, command, explain_md: '', rule_id: `r-${id}` });
const modulo = {
  id: 'linux-m1', title: 'M1',
  blocks: [paso('s-whoami', 'whoami'), paso('s-clear', 'clear'), paso('s-ls', 'ls /')],
  validation_rules: ['s-whoami', 's-clear', 's-ls'].map((id) => ({ id: `r-${id}`, rule_type: 'command_executed', target: id })),
} as unknown as LinuxModule;
const resultado = (aprobados: string[]) =>
  ({ results: aprobados.map((id) => ({ rule_id: `r-${id}`, passed: true })) }) as unknown as LinuxValidationResult;

// La barra de la guía en la evaluación final, como la reporta AiMessageBubble.
const guiaEvaluacion: DatosGuia = {
  acciones: [{ id: 'q1', texto: 'Responde la pregunta 1', tipo: 'pregunta' }, { id: 'enviar', texto: 'Envía la evaluación', tipo: 'enviar' }],
  hechas: new Set(),
  actual: 'q1',
  ahora: 'Responde la pregunta 1 de 9: elige la opción que te parezca correcta.',
  etiqueta: 'Evaluación final',
};

describe('contexto del tutor', () => {
  it('lo que toca ahora sale de la barra de la guía', () => {
    expect(loQueTocaAhora(guiaEvaluacion)).toBe('Evaluación final: Responde la pregunta 1 de 9: elige la opción que te parezca correcta.');
    expect(loQueTocaAhora(null)).toBeNull();
  });

  it('el contexto dice dónde va y qué comandos ya resolvió', () => {
    const txt = contextoPractica(guiaEvaluacion, modulo, resultado(['s-whoami', 's-clear', 's-ls']));
    expect(txt).toContain('AHORA: Evaluación final: Responde la pregunta 1 de 9');
    expect(txt).toContain('YA resolvió bien, en pasos anteriores: `whoami`, `clear`, `ls /`');
    expect(txt).toContain('ninguno, ya terminó la parte de la terminal');
  });

  it('un comando de un paso ya resuelto es «anterior», no «posterior»', () => {
    expect(relacionDelComando('clear', modulo, resultado(['s-whoami', 's-clear', 's-ls']))).toBe('anterior');
    expect(relacionDelComando('ls /', modulo, resultado(['s-whoami']), 's-clear')).toBe('posterior');
    expect(relacionDelComando('cler', modulo, resultado([]))).toBe('otro');
  });

  it('caso real: `clear` en plena evaluación -> paso anterior y lo que toca es responder el quiz, en el chat', () => {
    const txt = textoComandoFueraDeLugar({
      comando: 'clear',
      esperado: undefined,
      relacion: relacionDelComando('clear', modulo, resultado(['s-whoami', 's-clear', 's-ls'])),
      ahora: loQueTocaAhora(guiaEvaluacion),
      salidaTerminal: 'andres@raspberrypi:~ $',
    });
    expect(txt).toContain('paso ANTERIOR');
    expect(txt).not.toContain('MÁS ADELANTE');
    expect(txt).toContain('Evaluación final: Responde la pregunta 1 de 9');
    expect(txt).toContain('no hace falta escribir nada en la terminal');
  });
});
