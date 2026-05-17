import { useEffect, useState } from "react";

const TERMINAL_LINES = [
  { delay: 0,    text: "$ remote-lab connect --session physics-lab-01", type: "cmd" },
  { delay: 900,  text: "  Autenticando usuario… OK",                    type: "info" },
  { delay: 1700, text: "  Estableciendo túnel SSH… OK",                 type: "info" },
  { delay: 2400, text: "✓ Conexión segura establecida",                  type: "ok" },
  { delay: 3100, text: "✓ Entorno de práctica cargado",                  type: "ok" },
  { delay: 3800, text: "✓ Listo — laboratorio activo",                   type: "ok" },
];

export default function TerminalWindow() {
  const [lines, setLines] = useState<number[]>([]);

  useEffect(() => {
    const timers = TERMINAL_LINES.map((l, i) =>
      setTimeout(() => setLines((p) => [...p, i]), l.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="w-full max-w-lg border border-border bg-surface font-mono text-xs shadow-glow-cyan">
      {/* title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-surface-2">
        <span className="w-2.5 h-2.5 rounded-full bg-danger/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-warning/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-success/70" />
        <span className="ml-3 text-muted tracking-widest uppercase text-[10px]">
          remote-lab — bash
        </span>
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan animate-border-pulse" />
      </div>
      {/* body */}
      <div className="p-5 space-y-2 min-h-[200px]">
        {TERMINAL_LINES.map((l, i) =>
          lines.includes(i) ? (
            <div key={i} className="animate-fade-in leading-relaxed">
              {l.type === "cmd"  && <span className="text-foreground">{l.text}</span>}
              {l.type === "info" && <span className="text-muted-foreground">{l.text}</span>}
              {l.type === "ok"   && <span style={{ color: "#00d2be" }}>{l.text}</span>}
            </div>
          ) : null
        )}
        {lines.length === TERMINAL_LINES.length && (
          <span className="inline-block w-2 h-4 bg-cyan/80 animate-blink" />
        )}
      </div>
    </div>
  );
}
