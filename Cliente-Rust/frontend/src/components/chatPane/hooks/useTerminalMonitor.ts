import { useState, useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import {
  analyzeTerminalContext,
  analyzeTerminalPrompt,
  terminalContextLooksClean,
} from '../../../utils/terminalErrorAnalysis';

const ANALYZE_DELAY_MS = 900;

export function useTerminalMonitor(sessionId?: string | null) {
  const [errorBanner, setErrorBanner] = useState<{ snippet: string; hint?: string } | null>(null);
  const [promptBanner, setPromptBanner] = useState<{ snippet: string } | null>(null);
  const [terminalActivity, setTerminalActivity] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;

  const analyzeBuffer = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) return;
    try {
      const ctx = await invoke<string>('get_terminal_context', { sessionId: id, lines: 80 });
      if (/\x1b\[2J/.test(ctx)) {
        setErrorBanner(null);
        setPromptBanner(null);
        setTerminalActivity(false);
        return;
      }

      // Prompt bloqueado (Y/n, password, diálogo whiptail...) es la señal
      // más urgente — la terminal no va a avanzar sola hasta que respondas.
      const promptInsight = analyzeTerminalPrompt(ctx);
      setPromptBanner(promptInsight);

      const insight = analyzeTerminalContext(ctx);
      if (insight) {
        setErrorBanner(insight);
        setTerminalActivity(true);
        return;
      }
      setTerminalActivity(true);
      setErrorBanner(prev => (terminalContextLooksClean(ctx) ? null : prev));
    } catch {
      /* sin sesión activa */
    }
  }, []);

  const scheduleAnalyze = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void analyzeBuffer();
    }, ANALYZE_DELAY_MS);
  }, [analyzeBuffer]);

  useEffect(() => {
    if (!sessionId) {
      setErrorBanner(null);
      setPromptBanner(null);
      setTerminalActivity(false);
      return;
    }

    // Chequeo inmediato del estado YA EXISTENTE del buffer, no solo de lo que
    // llegue de acá en más: si el ChatPane se abre/monta DESPUÉS de que algo
    // pasó en la terminal (ej. un comando ya quedó bloqueado esperando un
    // Y/n), no va a haber ningún evento nuevo que dispare el análisis — el
    // prompt ya está ahí, quieto, sin generar más output. Sin este chequeo
    // inicial esos casos quedan invisibles hasta que llegue output nuevo.
    void analyzeBuffer();

    const unlistenOut = listen<string>(`ssh_out_${sessionId}`, (ev) => {
      if (ev.payload && /\x1b\[2J/.test(ev.payload)) {
        setErrorBanner(null);
        setPromptBanner(null);
        setTerminalActivity(false);
        return;
      }
      setTerminalActivity(true);
      scheduleAnalyze();
    });

    const unlistenActivity = listen<{ session_id: string }>('terminal:activity', (ev) => {
      if (ev.payload.session_id !== sessionId) return;
      setTerminalActivity(true);
      scheduleAnalyze();
    });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      unlistenOut.then(fn => fn());
      unlistenActivity.then(fn => fn());
    };
  }, [sessionId, scheduleAnalyze, analyzeBuffer]);

  return {
    errorBanner, setErrorBanner,
    promptBanner, setPromptBanner,
    terminalActivity, setTerminalActivity,
  };
}
