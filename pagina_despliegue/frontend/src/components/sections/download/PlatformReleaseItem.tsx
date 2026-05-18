import { Download } from "lucide-react";
import type { PlatformRelease } from "./types";
import { PLATFORM_LABELS } from "./types";
import { TuxIcon, WindowsIcon, AppleIcon } from "./PlatformIcons";

const PLATFORM_ICONS = {
  windows: WindowsIcon,
  linux: TuxIcon,
  macos: AppleIcon,
} as const;

export default function PlatformReleaseItem({
  release,
}: {
  release: PlatformRelease;
  onVersionChange?: (version: string) => void;
}) {
  const PlatformIcon = PLATFORM_ICONS[release.platform];

  return (
    <div className="group relative bg-surface border border-border hover:border-white/20 hover:-translate-y-0.5 transition-all duration-300 flex flex-col">
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
                <a
                  href={variant.downloadUrl}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-white/10 border border-white/20 text-white font-mono text-[11px] font-bold tracking-widest uppercase hover:bg-white/20 hover:border-white/30 transition-colors group/btn"
                >
                  <Download
                    size={13}
                    className="shrink-0 group-hover/btn:translate-y-px transition-transform"
                  />
                  <span className="truncate">{variant.label}</span>
                </a>
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
