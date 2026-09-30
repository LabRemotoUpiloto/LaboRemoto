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
  /**
   * Se llama cuando un módulo llega al 100% (todas las reglas requeridas +
   * TODO el quiz correcto, ver validation.py en la Pi) y el estudiante ya
   * vio la celebración (o, si el módulo ya estaba completo de antes, de
   * inmediato). Documentado en frontend/docs/practice-completion.md — toda
   * práctica nueva (no solo Linux) debe llamar a este mismo mecanismo al
   * terminar, para que el comportamiento de "volver a la lista de módulos"
   * sea consistente en toda la app.
   */
  onModuleCompleted?: (moduleId: string) => void;
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

export function useLinuxPracticeSession({ onNewSession, setChatOpen, onModuleCompleted }: UseLinuxPracticeSessionParams) {
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
  // Cache por moduleId del LinuxModule completo -- reportCommandHistory solo
  // recibe sessionId (viene de TerminalView, que no conoce el módulo), así
  // que necesita este + moduleBySession para poder llamar revalidate() sin
  // esperar al próximo tick de polling. Se refresca en cada revalidate().
  const modulesById = useRef<Record<string, LinuxModule>>({});
  // Snapshot del último cómputo de revalidate(), por moduleId -- para poder
  // diferenciar "no pasó nada porque no ejecutó nada" de "ejecutó algo nuevo
  // y no pasó nada" (ver mistakeSignal en revalidate()).
  const lastPassedRuleIdsRef = useRef<Record<string, Set<string>>>({});
  const lastCommandCountRef = useRef<Record<string, number>>({});
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
  // Se pisa (no se acumula en lista) cada vez que revalidate() detecta un
  // comando nuevo que no destrabó ningún paso -- ChatPane lo escucha por
  // referencia (`nonce` cambia siempre, incluso si el comando se repite) para
  // disparar la explicación del error. Ver revalidate().
  const [mistakeSignal, setMistakeSignal] = useState<{ moduleId: string; command: string; nonce: number } | null>(null);

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

  /** Una validación real contra la Pi. Usar `revalidate`, que evita solaparlas. */
  const revalidateNow = useCallback(async (module: LinuxModule): Promise<LinuxValidationResult | null> => {
    modulesById.current[module.id] = module;
    const sessionId = sessionByPractice.current[module.id];
    if (!sessionId) return null;

    const commandHistory = commandHistoryBySession.current[sessionId] ?? [];
    const quizAnswers = quizAnswersByModule.current[module.id];
    const result = await linuxValidate(module.id, commandHistory, quizAnswers);

    // Detección de "el estudiante escribió algo y no pasó nada" (typo, comando
    // equivocado, comando que no era el esperado en este paso): si el
    // historial de comandos creció pero ninguna regla nueva pasó a `true`,
    // el último comando ejecutado no destrabó el paso pendiente. No es lo
    // mismo que "todavía no ejecutó nada" -- acá SÍ ejecutó algo, solo que no
    // era lo que hacía falta. `mistakeSignal` dispara la explicación en
    // ChatPane (ver explainLinuxMistake) en vez de dejar la práctica
    // esperando en silencio (lo que se percibe como que "se congeló").
    const newlyPassedIds = new Set(result.results.filter((r) => r.passed).map((r) => r.rule_id));
    const previouslyPassedIds = lastPassedRuleIdsRef.current[module.id] ?? new Set<string>();
    const gotNewPass = [...newlyPassedIds].some((id) => !previouslyPassedIds.has(id));
    lastPassedRuleIdsRef.current[module.id] = newlyPassedIds;

    const prevCommandCount = lastCommandCountRef.current[module.id] ?? commandHistory.length;
    const grewByNewCommand = commandHistory.length > prevCommandCount;
    lastCommandCountRef.current[module.id] = commandHistory.length;

    if (grewByNewCommand && !gotNewPass) {
      const lastCommand = commandHistory[commandHistory.length - 1];
      setMistakeSignal({ moduleId: module.id, command: lastCommand, nonce: Date.now() });
    }

    await memPut(sessionId, {
      practice_context: buildPracticeContext(module, result),
    });

    setResults((prev) => ({ ...prev, [module.id]: result }));
    return result;
  }, []);

  // Coalescing: un mismo comando dispara varias revalidaciones casi a la vez
  // (Enter, polling, reportes de historial) y cada una es un POST por el
  // túnel. Con ~35 alumnos en simultáneo eso multiplica la carga en la Pi sin
  // aportar nada. Regla: máximo UNA validación en vuelo por módulo y UNA
  // pendiente; todas las llamadas que llegan mientras hay una en vuelo
  // comparten esa pendiente, que arranca al terminar la actual y lee el
  // historial/respuestas más recientes (así nunca se devuelve un resultado
  // anterior al último comando o quiz enviado).
  const revalidateInFlight = useRef<Record<string, Promise<LinuxValidationResult | null>>>({});
  const revalidateQueued = useRef<Record<string, Promise<LinuxValidationResult | null>>>({});

  const revalidate = useCallback((module: LinuxModule): Promise<LinuxValidationResult | null> => {
    const id = module.id;
    const run = (): Promise<LinuxValidationResult | null> => {
      const p: Promise<LinuxValidationResult | null> = revalidateNow(module).finally(() => {
        if (revalidateInFlight.current[id] === p) delete revalidateInFlight.current[id];
      });
      revalidateInFlight.current[id] = p;
      return p;
    };
    const enVuelo = revalidateInFlight.current[id];
    if (!enVuelo) return run();
    let pendiente = revalidateQueued.current[id];
    if (!pendiente) {
      pendiente = enVuelo.catch(() => null).then(() => {
        delete revalidateQueued.current[id];
        return run();
      });
      revalidateQueued.current[id] = pendiente;
    }
    return pendiente;
  }, [revalidateNow]);

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
    // Revalida apenas se ejecuta un comando nuevo, sin esperar el próximo
    // tick del polling (hasta REVALIDATE_INTERVAL_MS de rezago) -- el chat
    // tiene que reaccionar al toque, no unos segundos después. `commands`
    // solo cambia una vez por comando completo (Enter), nunca por tecla
    // suelta (ver useCommandHistory.pushCommand), así que esto no satura la
    // validación contra la Pi.
    const moduleId = moduleBySession.current[sessionId];
    const module = moduleId ? modulesById.current[moduleId] : undefined;
    if (module) {
      revalidate(module).catch((e) =>
        console.warn('[linux-practice] revalidate inmediato tras comando falló, el polling reintentará', e),
      );
    }
  }, [revalidate]);

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
    delete modulesById.current[moduleId];
    delete lastPassedRuleIdsRef.current[moduleId];
    delete lastCommandCountRef.current[moduleId];
    delete revalidateInFlight.current[moduleId];
    delete revalidateQueued.current[moduleId];
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
    mistakeSignal,
    sessionModuleMap,
    connecting,
    submittingPassword,
    connectError,
    passwordPrompt,
    submitPassword,
    cancelPassword,
    /** Ver UseLinuxPracticeSessionParams.onModuleCompleted -- lo llama el chat
     * (ChatPane) cuando termina de mostrar la celebración del módulo. */
    notifyModuleComplete: (moduleId: string) => onModuleCompleted?.(moduleId),
  };
}

/** Tipo del valor devuelto por el hook, para threadearlo por props sin repetir la firma completa. */
export type LinuxPracticeSessionApi = ReturnType<typeof useLinuxPracticeSession>;
