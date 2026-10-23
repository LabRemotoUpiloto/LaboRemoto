// components/cursos/envioMoodle.ts — lógica compartida para enviar el resultado de una práctica a Moodle: buscar la tarea
// (ID number `labo:<práctica>`), armar la nota y el comentario, adjuntar el registro de la sesión y enviar. La usan el modal de
// la insignia (EnvioMoodlePanel, dentro de ModuleCompleteCelebration) y el aviso flotante de respaldo (ResultadoMoodleAviso).
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { moodleCursosService, type MoodlePractica } from './moodleCursos.service';
import { pedirRegistroSesion } from './registroSesion';

/** Lo mínimo que se necesita del resultado de validación (ver LinuxValidationResult). */
export interface ResultadoPractica {
  practice_id: string;
  total_points: number;
  earned_points: number;
  percentage: number;
  passed: boolean;
}

export interface Vinculo { practica: MoodlePractica; curso: string }

/** Estados en los que el docente ya tiene la tarea en sus manos: no se vuelve a ofrecer. */
const YA_ENVIADA = new Set(['readyforreview', 'inreview', 'readyforrelease', 'released', 'graded']);

export const yaEnviada = (estado: string | null | undefined) => !!estado && YA_ENVIADA.has(estado);

/** Nota 0–100 y comentario para el docente a partir del resultado de validación. */
export function notaYResumen(r: ResultadoPractica): { nota: number; resumen: string } {
  const nota = Math.max(0, Math.min(100, Math.round(r.percentage)));
  return {
    nota,
    resumen: `Práctica ${r.practice_id}: ${r.earned_points} de ${r.total_points} puntos (${nota} %). Enviado desde LaboRemoto.`,
  };
}

const mensajeDe = (e: any) => e?.message ?? String(e);

/** Qué se le dice al estudiante según cómo quedó el registro de su sesión en Moodle. */
export function textoRegistro(adjuntar: boolean, sesionAbierta: boolean, resultado: string): string {
  if (!adjuntar) return 'Se envió sin el registro de la sesión.';
  if (!sesionAbierta) return 'No se pudo adjuntar el registro porque la sesión ya está cerrada: se envió solo la nota.';
  switch (resultado) {
    case 'adjuntado': return 'El registro completo de tu sesión va adjunto (en un .zip).';
    case 'fallo_la_subida':
    case 'subida_no_disponible': return 'Moodle no aceptó el archivo del registro: se envió solo la nota.';
    default: return 'No se pudo adjuntar el registro de la sesión: se envió solo la nota.';
  }
}

/** práctica -> id de la sesión (pestaña) de terminal donde se hizo; lo provee App.tsx. */
export const SesionPorPracticaContext = createContext<Record<string, string>>({});

// ── Estado compartido entre el modal de la insignia y el aviso flotante ──
// La tarea de cada práctica se busca una sola vez; al enviar, se marca como enviada para que ninguno de los dos la vuelva a ofrecer.
const vinculos = new Map<string, Promise<Vinculo | null>>();
let version = 0;
const oyentes = new Set<() => void>();
const avisar = () => { version++; oyentes.forEach((f) => f()); };
const suscribir = (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; };
const leerVersion = () => version;

async function buscarVinculo(practiceId: string): Promise<Vinculo | null> {
  try {
    const { enMoodle, cursos } = await moodleCursosService.misCursos();
    if (!enMoodle) return null;
    for (const c of cursos.filter((x) => x.rol === 'estudiante')) {
      const { practicas } = await moodleCursosService.practicasDeCurso(c.id);
      const p = practicas.find((x) => x.practica === practiceId);
      if (p) return { practica: p, curso: c.nombre };
    }
  } catch (e) {
    // Sin Moodle (o sin red) la práctica sigue igual: solo no se ofrece el envío.
    console.warn('[moodle] no se pudo buscar la tarea de la práctica:', mensajeDe(e));
  }
  return null;
}

/** Cuántas celebraciones de insignia hay abiertas: mientras haya una, el aviso flotante espera (el envío va dentro de ella). */
let celebraciones = 0;
export const celebracion = {
  abrir() { celebraciones++; avisar(); },
  cerrar() { celebraciones = Math.max(0, celebraciones - 1); avisar(); },
};
export function useCelebracionAbierta(): boolean {
  useSyncExternalStore(suscribir, leerVersion);
  return celebraciones > 0;
}

export interface EnvioMoodle {
  /** `undefined` mientras se busca; `null` si la práctica no tiene tarea en Moodle para esta persona. */
  vinculo: Vinculo | null | undefined;
  /** Hay una tarea que todavía no se envió. */
  pendiente: boolean;
  adjuntar: boolean;
  setAdjuntar: (v: boolean) => void;
  enviando: boolean;
  /** Lo que se le dice tras enviar (o tras fallar). */
  mensaje: { texto: string; ok: boolean } | null;
  enviar: () => Promise<void>;
}

export function useEnvioMoodle(resultado: ResultadoPractica | null, habilitado = true): EnvioMoodle {
  useSyncExternalStore(suscribir, leerVersion);
  const sesiones = useContext(SesionPorPracticaContext);
  const [adjuntar, setAdjuntar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; ok: boolean } | null>(null);
  const [vinculo, setVinculo] = useState<Vinculo | null | undefined>(undefined);
  const id = resultado?.passed ? resultado.practice_id : null;

  useEffect(() => {
    if (!habilitado || !id) return;
    let activo = true;
    let p = vinculos.get(id);
    if (!p) { p = buscarVinculo(id); vinculos.set(id, p); }
    void p.then((v) => { if (activo) setVinculo(v); });
    return () => { activo = false; };
  }, [habilitado, id]);

  const enviar = useCallback(async () => {
    if (!resultado || !vinculo) return;
    const { nota, resumen } = notaYResumen(resultado);
    setEnviando(true);
    try {
      const sesion = sesiones[resultado.practice_id];
      const registro = adjuntar && sesion ? await pedirRegistroSesion(sesion) : null;
      const r = await moodleCursosService.enviarResultado(vinculo.practica.cmid, nota, resumen, registro);
      vinculo.practica.estado = 'readyforreview'; // ya no se vuelve a ofrecer (modal ni aviso)
      setMensaje({ ok: true, texto: `«${vinculo.practica.nombre}» quedó en Moodle para que tu docente la revise. ${textoRegistro(adjuntar, registro !== null, r)}` });
      avisar();
    } catch (e) {
      setMensaje({ ok: false, texto: `No se pudo enviar el resultado: ${mensajeDe(e)}` });
    } finally {
      setEnviando(false);
    }
  }, [resultado, vinculo, sesiones, adjuntar]);

  return {
    vinculo,
    pendiente: !!vinculo && !yaEnviada(vinculo.practica.estado),
    adjuntar, setAdjuntar, enviando, mensaje, enviar,
  };
}
