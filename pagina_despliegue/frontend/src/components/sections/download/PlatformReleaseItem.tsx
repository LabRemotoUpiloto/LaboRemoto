import { useState } from "react";
import { Download } from "lucide-react";
import type { PlatformRelease } from "./types";
import { PLATFORM_LABELS } from "./types";
import { TuxIcon, WindowsIcon, AppleIcon } from "./PlatformIcons";

const PLATFORM_ICONS = {
  windows: WindowsIcon,
  linux: TuxIcon,
  macos: AppleIcon,
} as const;

function VariantDownloadButton({
  variant,
}: {
  variant: any;
}) {
  const [status, setStatus] = useState<"idle" | "pre" | "hash" | "init">("idle");

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (status !== "idle") return;

    setStatus("pre");
    setTimeout(() => {
      setStatus("hash");
      setTimeout(() => {
        setStatus("init");
        setTimeout(() => {
          // Trigger file download programmatically
          const link = document.createElement("a");
          link.href = variant.downloadUrl;
          link.download = variant.filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setStatus("idle");
        }, 700);
      }, 700);
    }, 700);
  };

  const getLabel = () => {
    switch (status) {
      case "pre": return "Preparando...";
      case "hash": return "Verificando...";
      case "init": return "Iniciando...";
      default: return variant.label;
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`flex items-center justify-center gap-2.5 w-full px-4 py-3 border font-mono text-[11px] font-bold tracking-widest uppercase transition-all duration-300 ${
        status !== "idle"
          ? "bg-cyan-subtle border-cyan text-cyan animate-pulse cursor-wait pointer-events-none"
          : "bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/30 hover:scale-[1.01]"
      }`}
    >
      {status !== "idle" ? (
        <svg className="animate-spin h-3.5 w-3.5 text-cyan shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : (
        <Download
          size={13}
          className="shrink-0"
        />
      )}
      <span className="truncate">{getLabel()}</span>
    </button>
  );
}

export default function PlatformReleaseItem({
  release,
}: {
  release: PlatformRelease;
  onVersionChange?: (version: string) => void;
}) {
  const PlatformIcon = PLATFORM_ICONS[release.platform];

  return (
    <div className="group relative bg-surface border border-border hover:border-white/20 hover:-translate-y-0.5 transition-all duration-300 flex flex-col h-full">
      <div className="p-6 flex flex-col items-center text-center flex-1">
        <div className="mb-5">
          <PlatformIcon
            size={release.available ? 52 : 44}
            className="opacity-90 group-hover:opacity-100 transition-opacity"
          />
        </div>

        <h3 className="font-mono text-xs font-bold text-foreground tracking-[0.15em] uppercase mb-3">
          {PLATFORM_LABELS[release.platform]}
        </h3>

        {release.available ? (
          <div className="mb-5">
            <span className="font-mono text-lg font-black text-white tracking-tight">
              v{release.version}
            </span>
            <p className="font-mono text-[10px] text-muted-foreground mt-1">
              {release.date}
            </p>
          </div>
        ) : (
          <div className="mb-5 flex-1 flex items-center">
            <span className="font-mono text-xs text-muted-foreground leading-relaxed">
              {release.comingSoonMessage}
            </span>
          </div>
        )}

        <div className="w-full mt-auto space-y-2.5">
          {release.available &&
            release.variants.map((variant) => (
              <div key={variant.filename}>
                <VariantDownloadButton variant={variant} />
                {variant.notes && (
                  <p className="font-mono text-[9px] text-muted-foreground mt-1.5 leading-relaxed">
                    {variant.notes}
                  </p>
                )}
              </div>
            ))}

          {release.platform === "linux" && release.available && (
            <div className="pt-3 border-t border-border/40 mt-2">
              <p className="font-mono text-[9.5px] text-muted-foreground leading-relaxed">
                ¿No sabes qué versión tienes? Ejecuta <code className="text-white bg-white/10 px-1 py-0.5 rounded">ldd --version</code>
              </p>
            </div>
          )}

          {!release.available && (
            <button
              disabled
              className="w-full px-4 py-3 border border-border text-muted font-mono text-[11px] font-bold tracking-widest uppercase cursor-not-allowed opacity-50"
            >
              Próximamente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
