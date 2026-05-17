import { useEffect, useState, useRef, useCallback } from "react";
import type { Line, DownloadUrls } from "./types";
import { handleCommand } from "./commands";

const GITHUB_REPO = "Haider2231/Releases-Cliente-SSH-Unipiloto";
const WIN_FALLBACK =
  "https://github.com/Haider2231/Releases-Cliente-SSH-Unipiloto/releases/download/v0.1.6/Cliente%20SSH%20Unipiloto_0.1.6_x64-setup.exe";
const LINUX_FALLBACK =
  "https://github.com/Haider2231/Releases-Cliente-SSH-Unipiloto/releases/download/v0.1.6/ClienteSSH-Unipiloto-Linux";

const INTRO: Line[] = [
  { text: "$ remote-lab connect --session physics-lab-01", type: "cmd" },
  { text: "  Autenticando usuario… OK", type: "info" },
  { text: "  Estableciendo túnel SSH… OK", type: "info" },
  { text: "✓ Conexión segura establecida", type: "ok" },
  { text: "✓ Entorno de práctica cargado", type: "ok" },
  { text: "✓ Listo — laboratorio activo", type: "ok" },
  { text: "", type: "info" },
  { text: "Escribe 'help' para ver los comandos disponibles.", type: "info" },
];

const INTRO_DELAYS = [0, 900, 1700, 2400, 3100, 3800, 4200, 4600];

export function useTerminal() {
  const [history, setHistory] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [introDone, setIntroDone] = useState(false);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const downloadUrls = useRef<DownloadUrls>({ win: WIN_FALLBACK, linux: LINUX_FALLBACK });

  /* fetch latest release URLs */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
        );
        const data = await res.json();
        const winAsset = data.assets?.find((a: any) =>
          a.name.includes("setup.exe")
        );
        const linuxAsset = data.assets?.find((a: any) =>
          a.name.includes("Linux")
        );
        if (winAsset) downloadUrls.current.win = winAsset.browser_download_url;
        if (linuxAsset) downloadUrls.current.linux = linuxAsset.browser_download_url;
      } catch {
        /* keep fallbacks */
      }
    })();
  }, []);

  /* intro animation */
  useEffect(() => {
    const timers = INTRO.map((line, i) =>
      setTimeout(() => {
        setHistory((p) => [...p, line]);
        if (i === INTRO.length - 1) setIntroDone(true);
      }, INTRO_DELAYS[i])
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  /* auto-scroll */
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [history]);

  const submit = useCallback(() => {
    if (!introDone) return;
    const raw = input;
    setInput("");

    if (raw.trim().toLowerCase() === "clear") {
      setHistory([]);
      return;
    }

    const prompt: Line = { text: `$ ${raw}`, type: "cmd" };
    const result = handleCommand(raw, downloadUrls.current);
    setHistory((p) => [...p, prompt, ...result]);

    if (raw.trim()) {
      setCmdHistory((p) => [raw, ...p]);
      setHistoryIdx(-1);
    }
  }, [input, introDone]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (cmdHistory.length > 0) {
        const next = Math.min(historyIdx + 1, cmdHistory.length - 1);
        setHistoryIdx(next);
        setInput(cmdHistory[next]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx > 0) {
        const next = historyIdx - 1;
        setHistoryIdx(next);
        setInput(cmdHistory[next]);
      } else {
        setHistoryIdx(-1);
        setInput("");
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setHistory([]);
    }
  };

  const focusInput = () => inputRef.current?.focus();

  const handleWheel = (e: React.WheelEvent) => {
    const el = bodyRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const atTop = scrollTop === 0 && e.deltaY < 0;
    const atBottom = scrollTop + clientHeight >= scrollHeight && e.deltaY > 0;
    if (!atTop && !atBottom) {
      e.stopPropagation();
    }
  };

  return {
    history,
    input,
    setInput,
    introDone,
    bodyRef,
    inputRef,
    handleKeyDown,
    focusInput,
    handleWheel,
  };
}
