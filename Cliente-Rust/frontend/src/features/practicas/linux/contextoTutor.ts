// components/practicas/linux/contextoTutor.ts — lo que el modelo necesita saber de dónde va el estudiante.
//
// Sin esto el tutor respondía a ciegas: si en la evaluación final el estudiante escribía `clear`, le
// decía que era «de un paso posterior» (era de uno anterior) y le sugería listar archivos (tocaba
// responder el quiz). Todo sale de lo mismo que ve el estudiante: la barra de la guía (DatosGuia) y
// los comandos ya aprobados.

import type { LinuxBlock, LinuxModule, LinuxValidationResult } from '../linuxPractice.service';
import type { DatosGuia } from './PasoCard';

type PasoComando = Extract<LinuxBlock, { type: 'command_step' }>;

function reglaDe(mod: LinuxModule, b: PasoComando) {
  return mod.validation_rules.find((r) => r.id === b.rule_id) ?? mod.validation_rules.find((r) => r.target === b.command);
}

function resueltos(mod: LinuxModule | null, res: LinuxValidationResult | null) {
  const aprobadas = new Set((res?.results ?? []).filter((r) => r.passed).map((r) => r.rule_id));
  const comandos = (mod?.blocks ?? []).filter((b): b is PasoComando => b.type === 'command_step');
  const resuelto = (b: PasoComando) => {
    const regla = mod ? reglaDe(mod, b) : undefined;
    return !!regla && aprobadas.has(regla.id);
  };
  return { comandos, resuelto };
}

/** Lo que toca ahora, tal como lo dice la barra de la guía («Paso 11 de 16: Lee la explicación…»). */
export function loQueTocaAhora(guia: DatosGuia | null): string | null {
  if (!guia) return null;
  const ahora = typeof guia.ahora === 'string' ? guia.ahora : guia.acciones.find((a) => a.id === guia.actual)?.texto;
  return ahora ? `${guia.etiqueta ?? 'Práctica'}: ${ahora}` : null;
}

/** Progreso completo para el modelo, como mensaje de sistema en cada respuesta de la práctica. */
export function contextoPractica(guia: DatosGuia | null, mod: LinuxModule | null, res: LinuxValidationResult | null): string {
  const { comandos, resuelto } = resueltos(mod, res);
  const hechos = comandos.filter(resuelto).map((b) => `\`${b.command}\``);
  const faltan = comandos.filter((b) => !resuelto(b)).map((b) => `\`${b.command}\``);
  const hechoEnPaso = guia ? guia.acciones.filter((a) => guia.hechas.has(a.id)).map((a) => a.texto) : [];
  const ahora = loQueTocaAhora(guia);
  return [
    'PROGRESO DEL ESTUDIANTE EN ESTA PRÁCTICA (es para que sepas exactamente dónde va; no lo recites):',
    ahora ? `- Lo que tiene que hacer AHORA: ${ahora}` : '- Ahora mismo no hay ninguna acción pendiente en la guía.',
    hechoEnPaso.length ? `- En este paso ya hizo: ${hechoEnPaso.join('; ')}.` : null,
    `- Comandos que YA resolvió bien, en pasos anteriores: ${hechos.length ? hechos.join(', ') : 'ninguno todavía'}.`,
    `- Comandos de pasos siguientes (no se los adelantes): ${faltan.length ? faltan.join(', ') : 'ninguno, ya terminó la parte de la terminal'}.`,
    'Nunca le indiques algo distinto de lo que tiene que hacer AHORA.',
  ].filter(Boolean).join('\n');
}

export type RelacionComando = 'anterior' | 'posterior' | 'otro';

/** Si el comando que escribió es el de un paso ya resuelto, el de uno que todavía no le llega, o ninguno. */
export function relacionDelComando(
  comando: string, mod: LinuxModule, res: LinuxValidationResult | null, pendienteId?: string,
): RelacionComando {
  const norm = (s: string) => s.trim().toLowerCase();
  const { comandos, resuelto } = resueltos(mod, res);
  const mismos = comandos.filter((b) => b.id !== pendienteId && norm(b.command) === norm(comando));
  if (mismos.length === 0) return 'otro';
  return mismos.some(resuelto) ? 'anterior' : 'posterior';
}

/** Instrucción para el modelo cuando el estudiante escribe en la terminal algo que no es lo que toca. */
export function textoComandoFueraDeLugar(opts: {
  comando: string;
  esperado?: string;
  relacion: RelacionComando;
  ahora: string | null;
  salidaTerminal: string | null;
}): string {
  const { comando, esperado, relacion, ahora, salidaTerminal } = opts;
  // Lo que toca ahora sale de la barra de la guía: puede ser leer, ampliar una imagen o responder la
  // evaluación, no siempre escribir el próximo comando.
  const queHacer = ahora
    ? `${ahora}${esperado ? '' : ' (eso se hace acá en el chat; ahora no hace falta escribir nada en la terminal)'}`
    : esperado ? `escribir \`${esperado}\` en la terminal` : 'seguir con lo que indica el chat';
  return (
    `El estudiante ejecutó \`${comando}\` en la terminal, pero eso no es lo que toca ahora en la práctica. ` +
    `Esta es la salida real reciente de la terminal:\n\n` +
    `${salidaTerminal ?? '(no se pudo leer la salida de la terminal)'}\n\n` +
    (relacion === 'anterior'
      ? `IMPORTANTE: \`${comando}\` es un comando válido que ya usó bien en un paso ANTERIOR de esta práctica: no ` +
        `está mal escrito, solo que ese paso ya quedó atrás. Decíselo en una frase, sin volver a explicar qué hace, y`
      : relacion === 'posterior'
        ? `IMPORTANTE: \`${comando}\` es un comando real y bien escrito -- NO es un error -- que corresponde a un ` +
          `paso MÁS ADELANTE de esta práctica. Decíselo explícitamente, sin explicarle todavía qué hace, y`
        : `Mirá la salida real: si fue un typo o un error de sintaxis, decile EXACTAMENTE qué escribió mal; si el ` +
          `comando existe pero no tiene que ver con este momento de la práctica, decíselo amablemente. Después,`) +
    ` recordale exactamente lo que tiene que hacer ahora: ${queHacer}. No le sugieras ninguna otra cosa. En 2-4 ` +
    `líneas, tono de profesor paciente (nunca de regaño ni de "error", es parte normal de aprender).`
  );
}
