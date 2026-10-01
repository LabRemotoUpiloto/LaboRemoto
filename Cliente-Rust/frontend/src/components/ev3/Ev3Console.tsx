import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getEv3RunOutput,
  startEv3Program,
  stopEv3Program,
} from '../../services/hardware/ev3.service';
import { EV3_DEFAULT_CODE, EV3_EXAMPLES } from './ev3ConsoleExamples';
import './Ev3Console.css';

const STORAGE_KEY = 'labremoto.ev3.consola.codigo';
const POLL_IDLE_MS = 1500;
const POLL_BUSY_MS = 250;
const MAX_FAILURES = 3;
const MAX_OUTPUT_CHARS = 200_000;
const MAX_RUN_SECONDS = 120;
const INDENT = '    ';

type RunState =
  | { kind: 'idle' }
  | { kind: 'running'; runId: string; startedAt: number }
  | { kind: 'done'; exitCode: number | null; stopped: boolean }
  | { kind: 'error'; message: string };

interface Ev3ConsoleProps {
  sessionId: string;
}

function loadSavedCode(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || EV3_DEFAULT_CODE;
  } catch {
    return EV3_DEFAULT_CODE;
  }
}

function errorText(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

/**
 * Consola de Python del panel EV3: escribe un programa, lo manda al robot y
 * mira su salida en vivo (ver cmd::hardware::ev3_console en el backend).
 * Un solo programa a la vez en el robot y 2 minutos como máximo.
 */
const Ev3Console: React.FC<Ev3ConsoleProps> = ({ sessionId }) => {
  const [code, setCode] = useState<string>(loadSavedCode);
  const [output, setOutput] = useState('');
  const [state, setState] = useState<RunState>({ kind: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  const [exampleId, setExampleId] = useState('');

  const runRef = useRef<{ id: string; offset: number } | null>(null);
  const timerRef = useRef<number | null>(null);
  const failuresRef = useRef(0);
  const stoppedByUserRef = useRef(false);
  const unmountedRef = useRef(false);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const outputRef = useRef<HTMLPreElement | null>(null);
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;

  const running = state.kind === 'running';
  const lineCount = useMemo(() => code.split('\n').length, [code]);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const append = useCallback((text: string) => {
    if (!text) return;
    setOutput(prev => (prev + text).slice(-MAX_OUTPUT_CHARS));
  }, []);

  const finish = useCallback((exitCode: number | null) => {
    clearTimer();
    runRef.current = null;
    setState({ kind: 'done', exitCode, stopped: stoppedByUserRef.current });
  }, []);

  const poll = useCallback(async () => {
    const run = runRef.current;
    if (!run || unmountedRef.current) return;
    try {
      const r = await getEv3RunOutput(sessionRef.current, run.id, run.offset);
      if (runRef.current !== run || unmountedRef.current) return;
      failuresRef.current = 0;
      run.offset = r.next_offset;
      append(r.chunk);

      if (r.state === 'running' || r.chunk) {
        // Mientras llegue salida se pide más seguido; si no, a ritmo tranquilo.
        timerRef.current = window.setTimeout(poll, r.chunk ? POLL_BUSY_MS : POLL_IDLE_MS);
      } else if (r.state === 'done') {
        finish(r.exit_code);
      } else {
        append('\n[El robot ya no tiene este programa.]\n');
        finish(null);
      }
    } catch (e) {
      if (runRef.current !== run || unmountedRef.current) return;
      failuresRef.current += 1;
      if (failuresRef.current >= MAX_FAILURES) {
        clearTimer();
        runRef.current = null;
        append('\n[Se perdió la comunicación con el robot. El programa se corta solo al cumplirse el tiempo máximo.]\n');
        setState({ kind: 'error', message: errorText(e) });
      } else {
        timerRef.current = window.setTimeout(poll, POLL_IDLE_MS);
      }
    }
  }, [append, finish]);

  const handleRun = useCallback(async () => {
    if (runRef.current) return;
    if (!code.trim()) return;
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch { /* sin almacenamiento: no pasa nada */ }

    stoppedByUserRef.current = false;
    failuresRef.current = 0;
    setOutput('');
    setElapsed(0);
    setState({ kind: 'running', runId: '', startedAt: Date.now() });
    try {
      const { run_id } = await startEv3Program(sessionRef.current, code);
      if (unmountedRef.current) {
        void stopEv3Program(sessionRef.current, run_id).catch(() => undefined);
        return;
      }
      runRef.current = { id: run_id, offset: 0 };
      setState({ kind: 'running', runId: run_id, startedAt: Date.now() });
      timerRef.current = window.setTimeout(poll, POLL_BUSY_MS);
    } catch (e) {
      const message = errorText(e);
      append(message + '\n');
      setState({ kind: 'error', message });
    }
  }, [code, poll, append]);

  const handleStop = useCallback(async () => {
    const run = runRef.current;
    if (!run) return;
    stoppedByUserRef.current = true;
    append('\n[Deteniendo…]\n');
    try {
      await stopEv3Program(sessionRef.current, run.id);
    } catch (e) {
      append('[No se pudo confirmar la parada: ' + errorText(e) + ']\n');
    }
    // El poll siguiente lee la salida final y el código de salida.
    clearTimer();
    timerRef.current = window.setTimeout(poll, 300);
  }, [append, poll]);

  // Reloj mientras corre.
  useEffect(() => {
    if (state.kind !== 'running') return;
    const startedAt = state.startedAt;
    const it = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => window.clearInterval(it);
  }, [state]);

  // Autodesplazamiento de la salida.
  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [output]);

  // Al cerrar el panel de verdad (se desmonta), se corta lo que haya corriendo.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      clearTimer();
      const run = runRef.current;
      if (run) void stopEv3Program(sessionRef.current, run.id).catch(() => undefined);
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: s, selectionEnd: en } = el;
      const next = code.slice(0, s) + INDENT + code.slice(en);
      setCode(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = s + INDENT.length;
      });
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleRun();
    }
  };

  const handleExample = (id: string) => {
    setExampleId(id);
    const ex = EV3_EXAMPLES.find(x => x.id === id);
    if (ex && !running) setCode(ex.code);
  };

  const statusLabel = (() => {
    switch (state.kind) {
      case 'running':
        return state.runId ? `Ejecutando… ${elapsed} s de ${MAX_RUN_SECONDS}` : 'Enviando al robot…';
      case 'done':
        if (state.stopped) return 'Detenido';
        return state.exitCode === 0 ? 'Terminó bien' : `Terminó con error (código ${state.exitCode ?? '?'})`;
      case 'error':
        return 'Error';
      default:
        return 'Listo';
    }
  })();

  const statusClass =
    state.kind === 'running' ? 'run'
    : state.kind === 'error' ? 'bad'
    : state.kind === 'done' && !state.stopped && state.exitCode !== 0 ? 'bad'
    : 'ok';

  return (
    <div className="ev3-console">
      <div className="ev3-console-bar">
        <select
          className="ev3-console-select"
          value={exampleId}
          onChange={e => handleExample(e.target.value)}
          disabled={running}
          aria-label="Cargar un ejemplo"
        >
          <option value="">Cargar un ejemplo…</option>
          {EV3_EXAMPLES.map(ex => (
            <option key={ex.id} value={ex.id}>
              Módulo {ex.module} · {ex.title}
            </option>
          ))}
        </select>

        <div className="ev3-console-actions">
          <span className={`ev3-console-status ${statusClass}`}>{statusLabel}</span>
          {running ? (
            <button className="ev3-console-btn stop" onClick={() => void handleStop()} disabled={!state.runId}>
              ■ Detener
            </button>
          ) : (
            <button className="ev3-console-btn run" onClick={() => void handleRun()} disabled={!code.trim()} title="Ctrl+Enter">
              ▶ Ejecutar en EV3
            </button>
          )}
        </div>
      </div>

      <div className="ev3-console-editor">
        <div className="ev3-console-gutter" ref={gutterRef} aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          className="ev3-console-code"
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={e => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          readOnly={running}
          aria-label="Código Python"
        />
      </div>

      <div className="ev3-console-outhead">
        <span>Salida</span>
        <button className="ev3-console-link" onClick={() => setOutput('')} disabled={running || !output}>
          Limpiar
        </button>
      </div>
      <pre className="ev3-console-output" ref={outputRef}>
        {output || <span className="ev3-console-placeholder">Aquí aparece lo que imprime tu programa.</span>}
      </pre>

      <p className="ev3-console-hint">
        El programa corre dentro del robot (Python 3.5: no uses f-strings), máximo {MAX_RUN_SECONDS / 60} minutos y
        una persona a la vez. Al terminar o detenerlo, los motores se frenan solos. Ctrl+Enter ejecuta.
      </p>
    </div>
  );
};

export default Ev3Console;
