/**
 * useLinuxPracticeSession.ts
 *
 * Orquesta la práctica de Linux: resuelve host/usuario desde el backend
 * (que a su vez lo resuelve de la sesión Keycloak activa), pide la
 * contraseña de Active Directory UNA vez por un diálogo nativo (nunca el
 * navegador, nunca se persiste), abre la sesión SSH real, y mantiene el
 * chat como "profesor" — inyecta practice_context/practice_tutorial en la
 * memoria de sesión y lo reconstruye cada vez que se valida progreso.
 */

import { useCallback, useRef, useState } from 'react';
import { sshConnect, waitForConnection, memPut } from '../services/ssh.service';
import {
  linuxConnectionTarget,
  linuxValidate,
  type LinuxBlock,
  type LinuxModule,
  type LinuxValidationResult,
} from '../services/linuxPractice.service';

interface UseLinuxPracticeSessionParams {
  onNewSession: (info: { id: string; label: string }) => void;
  setChatOpen: (open: boolean) => void;
}

interface PasswordPromptState {
  username: string;
}

// Antes vivía como setInterval dentro de LinuxModulePage.tsx: como esa
// página se desmonta apenas el estudiante navega a la pestaña de la sesión
// SSH recién abierta (queda mostrando la terminal, no el módulo), el
// intervalo moría ahí y el practice_context que lee el chat quedaba
// congelado para siempre. Vive acá porque este hook se instancia una sola
// vez a nivel de App (mismo patrón que usePracticeSession) y sobrevive toda
// la navegación entre pestañas.
const REVALIDATE_INTERVAL_MS = 5000;

function isCommandStep(b: LinuxBlock): b is Extract<LinuxBlock, { type: 'command_step' }> {
  return b.type === 'command_step';
}

function buildPracticeContext(module: LinuxModule, result: LinuxValidationResult | null): string {
  const lines: string[] = [];
  // Persona + reglas de estilo primero, antes que nada específico del módulo
  // -- se repite completo en cada mensaje del sistema (memPut reescribe
  // practice_context entero en cada revalidate), así que el tono no debería
  // ir derivando de un mensaje al siguiente durante la misma práctica.
  lines.push(
    'Sos un profesor experto en Linux, administración de servidores, Python y scripting, ' +
      'dando clases a un estudiante principiante que recién está aprendiendo a usar la terminal. ' +
      'Reglas de estilo — todo el tiempo, sin excepción, en cada mensaje de esta práctica:',
  );
  lines.push('- Explicá siempre en lenguaje simple: si usás un término técnico (kernel, permisos, proceso, extensión de archivo, etc.) explicalo en la misma frase, como si fuera la primera vez que el estudiante lo escucha.');
  lines.push('- Mantené el MISMO tono y una estructura parecida de un mensaje al siguiente durante toda la práctica — nada de variar el estilo, la extensión o el nivel de formalidad de una respuesta a otra.');
  lines.push('- Cuando expliques la salida de un comando que el estudiante YA ejecutó, andá directo a explicar qué significa lo que salió en pantalla (2-4 líneas, con los valores/nombres reales que aparecieron) — no sugieras comandos nuevos ni repitas el formato de bloque de comandos ahí.');
  lines.push('- Conocés a fondo tipos y extensiones de archivo (.sh, .py, .conf, .log, .service, .yml, etc.), servicios típicos de un servidor Linux (systemd, ssh, cron, apt/dnf) y Python — usá ese conocimiento para dar ejemplos concretos cuando ayude a entender, sin irte del tema del módulo.');
  lines.push('');
  lines.push(`Sos la guía de la Práctica de Linux — Módulo ${module.order}: ${module.title}`);
  lines.push(`Objetivo: ${module.objective}`);
  lines.push('');
  lines.push('Progreso actual:');

  const commandSteps = module.blocks.filter(isCommandStep);

  for (const rule of module.validation_rules) {
    const ruleResult = result?.results.find((r) => r.rule_id === rule.id);
    const step = commandSteps.find((s) => s.command === rule.target);
    const label = step?.command ?? rule.target ?? rule.id;

    if (ruleResult?.passed) {
      lines.push(`[x] ${label} — validado`);
    } else {
      const explain = step?.explain_md ? ` — pendiente: "${step.explain_md}"` : ' — pendiente';
      lines.push(`[ ] ${label}${explain}`);
    }
  }

  lines.push('');
  lines.push(
    'Guialo hacia el siguiente paso pendiente. No le des el comando textual salvo que lo ' +
      'pida explícitamente — explicá qué hace y por qué, dejá que lo escriba él.',
  );

  return lines.join('\n');
}

export function useLinuxPracticeSession({ onNewSession, setChatOpen }: UseLinuxPracticeSessionParams) {
  const [connecting, setConnecting] = useState(false);
  // Distinto de `connecting`: ese arranca en true apenas se hace click en
  // "Conectar" (antes de que el modal siquiera aparezca, mientras se resuelve
  // el destino). Si el modal usara `connecting` como su `loading`, el campo
  // de contraseña quedaría deshabilitado desde que se abre — nunca dejaría
  // escribir nada. Este solo se activa cuando el usuario ya envió la
  // contraseña y se está abriendo la sesión SSH.
  const [submittingPassword, setSubmittingPassword] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState<PasswordPromptState | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const passwordResolverRef = useRef<((password: string) => void) | null>(null);
  const passwordRejecterRef = useRef<((err: Error) => void) | null>(null);
  const sessionByPractice = useRef<Record<string, string>>({});
  // Mapa inverso: sessionId -> moduleId, para poder limpiar/parar el polling
  // desde useTabLifecycle cuando se cierra la pestaña (solo tenemos el
  // sessionId ahí, no el LinuxModule completo).
  const moduleBySession = useRef<Record<string, string>>({});
  const pollTimers = useRef<Record<string, number>>({});
  // Historial de comandos EN VIVO por sesión, alimentado en tiempo real por
  // useCommandHistory (vía TerminalView -> reportCommandHistory) mientras la
  // sesión sigue abierta. Reemplaza a extractSessionCommands (que lee
  // savedLogs/<id>.html de disco): ese archivo solo se escribe al cerrar la
  // pestaña o al cambiar de sesión, nunca mientras la sesión Linux sigue
  // activa -- revalidate() quedaba siempre contra RESOURCE_NOT_FOUND.
  const commandHistoryBySession = useRef<Record<string, string[]>>({});

  // Respuestas de quiz por módulo (no por sesión: sobreviven a un
  // reconnect/cambio de pestaña igual que sessionByPractice). Se mandan
  // recién cuando el estudiante aprieta "Enviar evaluación" en
  // LinuxModulePage, no en cada tick del polling -- un quiz no es progreso
  // continuo como el historial de comandos, es una entrega puntual.
  const quizAnswersByModule = useRef<Record<string, Record<string, string>>>({});

  // Progreso por módulo (keyed por module.id, no por sessionId) — LinuxModulePage
  // solo conoce el practiceId/module, nunca el sessionId directamente.
  const [connectedModules, setConnectedModules] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, LinuxValidationResult | null>>({});

  // Espejo en estado (no solo ref) del mapa inverso sessionId -> moduleId.
  // moduleBySession.current existe desde antes pero al ser un ref no dispara
  // re-render ni puede leerse reactivamente fuera de este hook — App.tsx
  // necesita derivar `practiceMeta` combinado (sessionId -> { practiceId })
  // para pasárselo a SessionContainer/TerminalView, y para eso hace falta
  // que este mapeo sea observable desde afuera.
  const [sessionModuleMap, setSessionModuleMap] = useState<Record<string, string>>({});

  const askPassword = useCallback((username: string): Promise<string> => {
    setPasswordPrompt({ username });
    return new Promise<string>((resolve, reject) => {
      passwordResolverRef.current = resolve;
      passwordRejecterRef.current = reject;
    });
  }, []);

  const submitPassword = useCallback((password: string) => {
    setSubmittingPassword(true);
    passwordResolverRef.current?.(password);
  }, []);

  const cancelPassword = useCallback(() => {
    passwordRejecterRef.current?.(new Error('Conexión cancelada'));
    setPasswordPrompt(null);
  }, []);

  /** Re-valida contra el historial real de comandos y actualiza el contexto del chat. */
  const revalidate = useCallback(async (module: LinuxModule): Promise<LinuxValidationResult | null> => {
    const sessionId = sessionByPractice.current[module.id];
    if (!sessionId) return null;

    const commandHistory = commandHistoryBySession.current[sessionId] ?? [];
    const quizAnswers = quizAnswersByModule.current[module.id];
    const result = await linuxValidate(module.id, commandHistory, quizAnswers);

    await memPut(sessionId, {
      practice_context: buildPracticeContext(module, result),
    });

    setResults((prev) => ({ ...prev, [module.id]: result }));
    return result;
  }, []);

  /**
   * Guarda las respuestas de quiz elegidas por el estudiante y dispara una
   * revalidación inmediata (no espera al próximo tick de los 5s) -- "Enviar
   * evaluación" en LinuxModulePage debe sentirse instantáneo.
   */
  const submitQuizAnswers = useCallback(
    async (module: LinuxModule, answers: Record<string, string>): Promise<LinuxValidationResult | null> => {
      quizAnswersByModule.current[module.id] = answers;
      return revalidate(module);
    },
    [revalidate],
  );

  /**
   * Recibe el historial de comandos en vivo de una sesión (llamado desde
   * TerminalView, alimentado por useCommandHistory). Solo escribe un ref --
   * no dispara re-render, lo lee revalidate() en el próximo tick de polling.
   */
  const reportCommandHistory = useCallback((sessionId: string, commands: string[]) => {
    commandHistoryBySession.current[sessionId] = commands;
  }, []);

  const stopPolling = useCallback((moduleId: string) => {
    const timer = pollTimers.current[moduleId];
    if (timer !== undefined) {
      window.clearInterval(timer);
      delete pollTimers.current[moduleId];
    }
  }, []);

  /** Arranca (o reinicia) el polling de revalidación para un módulo ya conectado. */
  const startPolling = useCallback(
    (module: LinuxModule) => {
      stopPolling(module.id);
      const timer = window.setInterval(() => {
        revalidate(module)
          .then((r) => { if (r?.passed) stopPolling(module.id); })
          .catch((e) => console.warn('[linux-practice] revalidate() falló en un tick de polling, reintentando en el próximo', e));
      }, REVALIDATE_INTERVAL_MS);
      pollTimers.current[module.id] = timer;
    },
    [revalidate, stopPolling],
  );

  /** Conecta (pidiendo contraseña si hace falta) y devuelve el sessionId de la terminal. */
  const connect = useCallback(
    async (module: LinuxModule): Promise<string> => {
      setConnecting(true);
      setConnectError(null);
      try {
        const target = await linuxConnectionTarget();
        const password = await askPassword(target.user);
        setPasswordPrompt(null);

        const sessionId = await sshConnect({
          host: target.host,
          port: target.port,
          user: target.user,
          password,
          cols: 120,
          rows: 40,
        });

        // sshConnect() es fire-and-forget: el backend devuelve el session_id
        // de inmediato y el handshake SSH/PAM real (más lento y variable
        // contra AD) sigue en background. Antes de esto, un 1200ms fijo
        // reemplazaba a "esperar la conexión real" — con contraseña
        // incorrecta (o AD lento) igual se abría la pestaña, con un
        // session_id sin canal detrás: terminal en blanco, sin overlay, sin
        // respuesta a nada. Esperamos acá la confirmación real
        // (`ssh_connected`/`ssh_connect_error`, ya emitidos por el backend
        // en `ssh_connect` — ver terminal.rs) antes de abrir la pestaña.
        await new Promise<void>((resolve, reject) => {
          const controller = new AbortController();
          let settled = false;
          // Los unlisten() reales llegan async (waitForConnection hace un
          // await listen(...) x2) -- pueden quedar disponibles ANTES o
          // DESPUÉS de que la conexión ya haya resuelto/rechazado. Se
          // guardan acá para poder limpiarlos apenas existan, sin importar
          // el orden en que lleguen las dos cosas.
          let cleanup: (() => void) | null = null;

          const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeout);
            fn();
            cleanup?.();
          };

          const timeout = window.setTimeout(() => {
            controller.abort();
            finish(() => reject(new Error('Tiempo de espera agotado conectando por SSH (AD puede tardar) — probá de nuevo')));
          }, 20000);

          waitForConnection(
            sessionId,
            controller.signal,
            () => finish(resolve),
            (err) => finish(() => reject(err)),
          ).then(([unlistenSuccess, unlistenError]) => {
            cleanup = () => { unlistenSuccess(); unlistenError(); };
            if (settled) cleanup();
          });
        });

        sessionByPractice.current[module.id] = sessionId;
        moduleBySession.current[sessionId] = module.id;
        setSessionModuleMap((prev) => ({ ...prev, [sessionId]: module.id }));
        onNewSession({ id: sessionId, label: `Linux — ${module.title}` });
        setChatOpen(true);
        setConnectedModules((prev) => ({ ...prev, [module.id]: true }));

        // practice_tutorial (el viejo "primer mensaje" fijo) ya no hace
        // falta: el contenido real del módulo (intro, video, primer comando
        // pendiente) lo entrega ChatPane apenas detecta `linuxModule` +
        // `practiceResult`, con contenido real en vez de un texto fijo.
        await memPut(sessionId, {
          practice_context: buildPracticeContext(module, null),
        });

        // Primera validación inmediata (progreso arranca en 0 pero ya
        // reconstruido contra el historial real) y arranque del polling que
        // reemplaza al setInterval que antes vivía en LinuxModulePage.tsx —
        // ahora sigue corriendo aunque esa página se desmonte al navegar a
        // la pestaña de la sesión SSH recién abierta.
        let initial: LinuxValidationResult | null = null;
        try {
          initial = await revalidate(module);
        } catch (e) {
          // Defensivo: linuxValidate() es una llamada de red real al backend/Pi
          // y puede fallar por motivos ajenos al historial de comandos (que acá
          // arranca vacío de todos modos, recién conectado). No es bloqueante:
          // el polling de abajo va a reintentar en el próximo tick.
          console.warn('[linux-practice] primera validación falló, reintentando por polling', e);
        }
        if (!initial?.passed) startPolling(module);

        return sessionId;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setConnectError(msg);
        throw err;
      } finally {
        setConnecting(false);
        setSubmittingPassword(false);
        setPasswordPrompt(null);
      }
    },
    [askPassword, onNewSession, setChatOpen, revalidate, startPolling],
  );

  /**
   * Corta el polling y limpia el estado de un módulo cuando se cierra la
   * pestaña de su sesión SSH (ver useTabLifecycle.handleCloseTab). Sin esto
   * el intervalo de revalidate() seguiría corriendo indefinidamente contra
   * una sesión ya desconectada.
   *
   * También REINICIA el progreso del módulo (resultado + respuestas de quiz)
   * sin importar si estaba completo o no -- todavía no hay guardado real de
   * progreso (queda para más adelante); por ahora, salir sin terminar
   * significa arrancar de cero la próxima vez que se conecte a este módulo.
   * El historial de comandos y el contenido ya entregado en el chat se
   * reinician solos (viven en el nuevo ChatPane que se monta al reconectar),
   * pero `results` y las respuestas de quiz viven acá, sobreviven a un
   * remount de ChatPane, y hay que limpiarlos a mano.
   */
  const stopSession = useCallback((sessionId: string) => {
    const moduleId = moduleBySession.current[sessionId];
    if (!moduleId) return;
    stopPolling(moduleId);
    delete moduleBySession.current[sessionId];
    delete sessionByPractice.current[moduleId];
    delete commandHistoryBySession.current[sessionId];
    delete quizAnswersByModule.current[moduleId];
    setSessionModuleMap((prev) => {
      if (!(sessionId in prev)) return prev;
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setConnectedModules((prev) => {
      if (!(moduleId in prev)) return prev;
      const next = { ...prev };
      delete next[moduleId];
      return next;
    });
    setResults((prev) => {
      if (!(moduleId in prev)) return prev;
      const next = { ...prev };
      delete next[moduleId];
      return next;
    });
  }, [stopPolling]);

  return {
    connect,
    revalidate,
    submitQuizAnswers,
    reportCommandHistory,
    stopSession,
    connectedModules,
    results,
    sessionModuleMap,
    connecting,
    submittingPassword,
    connectError,
    passwordPrompt,
    submitPassword,
    cancelPassword,
  };
}

/** Tipo del valor devuelto por el hook, para threadearlo por props sin repetir la firma completa. */
export type LinuxPracticeSessionApi = ReturnType<typeof useLinuxPracticeSession>;
