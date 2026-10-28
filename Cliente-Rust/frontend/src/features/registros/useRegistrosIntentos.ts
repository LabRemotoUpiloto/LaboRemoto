// features/registros/useRegistrosIntentos.ts — manda a la Pi el registro de la terminal de cada intento de práctica de Linux:
// al aprobarla, al cerrar su pestaña (o cambiarla por otra práctica) y al cerrar la app. Cada 2 minutos deja una copia en
// este equipo (una por intento, se sobrescribe) por si la app se cuelga o se apaga el computador; lo que no salió se manda
// al volver a iniciar sesión. Va montado una sola vez en App.tsx. Informativo: un fallo nunca interrumpe la práctica.
import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { pedirRegistroSesion } from '@/features/cursos/registroSesion';
import { SAVE_SESSION_BEFORE_CLOSE_EVENT } from '@/features/conexion/ssh.service';
import { EVENTO_CERRANDO, registrosService, type EstadoIntento, type IntentoPractica } from './registros.service';
import {
  compararIntentos, estadoDe, notaDe, recienAprobada, type Intento, type PracticaEnPestana, type ResultadoValidacion,
} from './intentos';

const COPIA_MS = 2 * 60_000;
/** Al cerrar la app se espera esto el envío; lo que no alcance queda en la copia (Rust cierra igual a los 10 s). */
const ESPERA_ENVIO_AL_CERRAR_MS = 5000;

const avisar = (e: unknown) => console.warn('[registros] no se pudo guardar el registro de la práctica:', e);
const esperar = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/**
 * @param abiertas    sessionId -> práctica de cada pestaña de práctica abierta
 * @param resultados  práctica -> último resultado de validación
 * @param habilitado  hay sesión de Keycloak (sin ella no hay a quién atribuir el registro)
 */
export function useRegistrosIntentos(
  abiertas: Record<string, PracticaEnPestana>,
  resultados: Record<string, ResultadoValidacion | null>,
  habilitado: boolean,
) {
  const intentos = useRef<Record<string, Intento>>({});
  /** Intentos ya mandados al cerrar su pestaña: no se vuelven a mandar al desaparecer de `abiertas`. */
  const cerrados = useRef(new Set<string>());
  const resultadosRef = useRef(resultados);
  resultadosRef.current = resultados;
  const habilitadoRef = useRef(habilitado);
  habilitadoRef.current = habilitado;

  // Pide el registro a la terminal (sincrónico: la terminal responde al evento en el acto, también si su pestaña está oculta).
  const armar = useRef(async (i: Intento, estado: EstadoIntento): Promise<IntentoPractica | null> => {
    const registro = await pedirRegistroSesion(i.sessionId);
    if (!registro) return null;
    const r = resultadosRef.current[i.practica];
    return { id: i.id, practica: i.practica, practicaNombre: i.nombre, estado, inicio: i.inicio, nota: notaDe(r), registro };
  }).current;

  const mandar = useRef((i: Intento, estado: EstadoIntento) => {
    if (!habilitadoRef.current) return;
    void armar(i, estado).then((x) => x && registrosService.enviarIntento(x)).catch(avisar);
  }).current;

  // Pestañas: empieza un intento por cada práctica nueva; el de una pestaña que ahora tiene otra práctica termina aquí.
  useEffect(() => {
    const { actuales, terminados } = compararIntentos(intentos.current, abiertas, (sessionId, p) => ({
      id: crypto.randomUUID(), sessionId, practica: p.practiceId, nombre: p.nombre, inicio: new Date().toISOString(),
    }));
    intentos.current = actuales;
    for (const i of terminados) {
      // si la pestaña se cerró, ya se mandó al cerrarla (y su terminal ya no existe)
      if (cerrados.current.delete(i.id)) continue;
      mandar(i, estadoDe(resultadosRef.current[i.practica], false));
    }
  }, [abiertas, mandar]);

  // Cerrar la pestaña: el cierre espera a que la terminal guarde su sesión, así que todavía se le puede pedir el registro.
  useEffect(() => {
    const alCerrar = (e: Event) => {
      const i = intentos.current[(e as CustomEvent<{ sessionId: string }>).detail?.sessionId];
      if (!i || cerrados.current.has(i.id)) return;
      cerrados.current.add(i.id);
      mandar(i, estadoDe(resultadosRef.current[i.practica], false));
    };
    window.addEventListener(SAVE_SESSION_BEFORE_CLOSE_EVENT, alCerrar);
    return () => window.removeEventListener(SAVE_SESSION_BEFORE_CLOSE_EVENT, alCerrar);
  }, [mandar]);

  // Aprobada: se manda en el momento (la pestaña sigue abierta; si después la cierra, el mismo archivo se actualiza).
  const resultadosPrevios = useRef(resultados);
  useEffect(() => {
    for (const i of Object.values(intentos.current)) {
      if (recienAprobada(resultadosPrevios.current[i.practica], resultados[i.practica])) mandar(i, 'terminada');
    }
    resultadosPrevios.current = resultados;
  }, [resultados, mandar]);

  // Copia en el equipo cada 2 minutos, con el estado que tendría si la app se cerrara ahora.
  useEffect(() => {
    if (!habilitado) return;
    const t = setInterval(() => {
      for (const i of Object.values(intentos.current)) {
        void armar(i, estadoDe(resultadosRef.current[i.practica], true))
          .then((x) => x && registrosService.guardarCopia(x))
          .catch(avisar);
      }
    }, COPIA_MS);
    return () => clearInterval(t);
  }, [habilitado, armar]);

  // Al iniciar sesión, lo que quedó en este equipo de esta persona.
  useEffect(() => {
    if (habilitado) registrosService.enviarPendientes().catch(avisar);
  }, [habilitado]);

  // Cerrar la app: Rust retiene la ventana y avisa. Primero la copia (rápida, en el disco) y luego el envío, con tope; la
  // ventana se cierra siempre, haya o no prácticas abiertas.
  useEffect(() => {
    let vivo = true;
    let quitar: (() => void) | undefined;
    listen(EVENTO_CERRANDO, async () => {
      try {
        if (habilitadoRef.current) {
          const abiertos = Object.values(intentos.current);
          const armados = (await Promise.all(abiertos.map((i) => armar(i, estadoDe(resultadosRef.current[i.practica], true)).catch(() => null))))
            .filter((x): x is IntentoPractica => !!x);
          await Promise.all(armados.map((x) => registrosService.guardarCopia(x).catch(avisar)));
          await Promise.race([Promise.all(armados.map((x) => registrosService.enviarIntento(x).catch(avisar))), esperar(ESPERA_ENVIO_AL_CERRAR_MS)]);
        }
      } finally {
        await registrosService.cerrarApp().catch(avisar);
      }
    })
      .then((f) => { if (vivo) quitar = f; else f(); })
      .catch(() => { /* fuera de Tauri (pruebas, navegador): no hay ventana que cerrar */ });
    return () => { vivo = false; quitar?.(); };
  }, [armar]);
}
