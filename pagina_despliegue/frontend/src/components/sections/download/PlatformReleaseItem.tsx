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
  const [changing, setChanging] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (status !== "idle") return;

    setStatus("pre");
    setTimeout(() => {
      setChanging(true);
      setTimeout(() => {
        setStatus("hash");
        setChanging(false);
        setTimeout(() => {
          setChanging(true);
          setTimeout(() => {
            setStatus("init");
            setChanging(false);
            setTimeout(() => {
              // Trigger file download programmatically
              const link = document.createElement("a");
              link.href = variant.downloadUrl;
              link.download = variant.filename;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              setStatus("idle");
            }, 800);
          }, 150);
        }, 800);
      }, 150);
    }, 800);
  };

  const getLabel = () => {
    switch (status) {
      case "pre": return "PREPARANDO ENTORNO...";
      case "hash": return "VERIFICANDO INTEGRIDAD...";
      case "init": return "INICIANDO DESCARGA...";
      default: return variant.label.toUpperCase();
    }
  };

  const isLoading = status !== "idle";

  return (
    <button
      onClick={handleClick}
      className={`relative w-full px-4 py-3.5 border font-mono text-[10.5px] font-bold tracking-widest uppercase transition-all duration-500 overflow-hidden flex items-center justify-center gap-3 ${
        isLoading
          ? "bg-cyan/10 border-cyan text-cyan shadow-[0_0_15px_rgba(6,182,212,0.15)] cursor-wait pointer-events-none scale-[0.99]"
          : "bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20 hover:scale-[1.01]"
      }`}
    >
      {isLoading ? (
        <div className="relative w-4 h-4 shrink-0 flex items-center justify-center">
          {/* Outer Clockwise Spin */}
          <div className="absolute inset-0 rounded-full border border-t-cyan border-r-transparent border-b-transparent border-l-transparent animate-spin duration-700" />
          {/* Inner Counter-Clockwise Spin */}
          <div className="absolute inset-[3px] rounded-full border border-b-cyan border-t-transparent border-r-transparent border-l-transparent animate-[spin_0.4s_linear_infinite_reverse]" />
        </div>
      ) : (
        <Download
          size={12}
          className="shrink-0 group-hover:translate-y-px transition-transform"
        />
      )}

      <span className={`transition-all duration-300 transform ${
        changing ? "opacity-0 -translate-y-1 blur-[3px]" : "opacity-100 translate-y-0 blur-0"
      }`}>
        {getLabel()}
      </span>
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
