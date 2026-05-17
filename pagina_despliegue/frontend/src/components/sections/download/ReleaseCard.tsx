import { Download, Monitor, Terminal, CheckCircle2, Clock } from "lucide-react";
import type { Release } from "./types";
import { PLATFORM_LABELS } from "./types";

const PLATFORM_ICONS: Record<
  string,
  React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
> = {
  windows: Monitor,
  linux: Terminal,
};

export default function ReleaseCard({ release }: { release: Release }) {
  const PlatformIcon = PLATFORM_ICONS[release.platform];

  return (
    <div className="relative border border-border bg-surface-2 hover:border-cyan/30 hover:shadow-glow-cyan transition-all duration-300">
      {/* cyan top stripe for latest */}
      {release.isLatest && (
        <div className="absolute top-0 left-0 right-0 h-px bg-cyan animate-border-pulse" />
      )}

      <div className="p-6">
        {/* top row */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <PlatformIcon size={16} strokeWidth={1.5} className="text-muted-foreground" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-foreground">
                  {PLATFORM_LABELS[release.platform]}
                </span>
                {release.isLatest && (
                  <span className="font-mono text-[9px] tracking-widest uppercase text-cyan border border-cyan/30 px-1.5 py-0.5">
                    latest
                  </span>
                )}
              </div>
              <p className="font-mono text-[11px] text-muted mt-0.5">{release.filename}</p>
            </div>
          </div>
          <div className="text-right font-mono text-[11px] text-muted">
            <div>v{release.version}</div>
            <div className="mt-0.5">{release.size}</div>
          </div>
        </div>

        {/* notes */}
        <ul className="space-y-1.5 mb-6">
          {release.notes.map((note) => (
            <li key={note} className="flex items-start gap-2">
              <CheckCircle2 size={11} className="text-cyan mt-0.5 shrink-0" />
              <span className="font-mono text-[11px] text-muted-foreground">{note}</span>
            </li>
          ))}
        </ul>

        {/* footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-muted font-mono text-[11px]">
            <Clock size={10} />
            <span>{release.date}</span>
          </div>
          <a
            href={release.downloadUrl}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan text-background font-mono text-[11px] font-bold tracking-widest uppercase hover:bg-cyan-light transition-colors"
          >
            <Download size={11} />
            Descargar
          </a>
        </div>
      </div>
    </div>
  );
}
