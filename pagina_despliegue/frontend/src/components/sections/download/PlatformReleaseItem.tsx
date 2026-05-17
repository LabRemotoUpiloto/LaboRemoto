import { Download } from "lucide-react";
import type { PlatformRelease } from "./types";
import { PLATFORM_LABELS } from "./types";
import { TuxIcon, WindowsIcon, AppleIcon } from "./PlatformIcons";

const PLATFORM_ICONS = {
  windows: WindowsIcon,
  linux: TuxIcon,
  macos: AppleIcon,
} as const;

export default function PlatformReleaseItem({ release }: { release: PlatformRelease }) {
  const PlatformIcon = PLATFORM_ICONS[release.platform];

  return (
    <div className="py-8 border-b border-border last:border-b-0">
      <div className="flex items-start gap-5 mb-5">
        <PlatformIcon size={40} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-mono text-base font-bold text-foreground">
            {PLATFORM_LABELS[release.platform]}
          </h3>
          <p className="font-mono text-[11px] text-muted mt-1">
            {release.available
              ? `Versión ${release.version} — ${release.date}`
              : release.comingSoonMessage ?? "No disponible"}
          </p>
        </div>
      </div>

      {release.available && release.variants.length > 0 && (
        <ul className="space-y-3 pl-0 md:pl-14">
          {release.variants.map((variant) => (
            <li
              key={variant.filename}
              className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6"
            >
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm text-foreground">{variant.label}</p>
                <p className="font-mono text-[11px] text-muted mt-0.5 truncate">
                  {variant.filename}
                  <span className="ml-2 text-muted-foreground">· {variant.size}</span>
                </p>
                {variant.notes && (
                  <p className="font-mono text-[11px] text-muted-foreground mt-1">
                    {variant.notes}
                  </p>
                )}
              </div>
              <a
                href={variant.downloadUrl}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan text-background font-mono text-[11px] font-bold tracking-widest uppercase hover:bg-cyan-light transition-colors shrink-0"
              >
                <Download size={12} />
                Descargar
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
