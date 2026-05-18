import PlatformReleaseItem from "./PlatformReleaseItem";
import type { Platform, PlatformRelease } from "./types";

interface ReleasesListProps {
  releases: PlatformRelease[];
  switchVersion: (platform: Platform, versionTag: string) => void;
}

export default function ReleasesList({ releases, switchVersion }: ReleasesListProps) {
  return (
    <section className="py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-14 text-center">
          <p className="font-mono text-[10px] tracking-widest uppercase text-white/60 mb-3">
            Versiones disponibles
          </p>
          <h2 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">
            Elige tu plataforma
            <br />
            y empieza a usarlo.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {releases.map((release) => (
            <PlatformReleaseItem
              key={release.platform}
              release={release}
              onVersionChange={(v) => switchVersion(release.platform, v)}
            />
          ))}
        </div>

        <p className="mt-12 text-center font-mono text-[11px] text-muted leading-relaxed">
          Los binarios pueden generar alertas en algunos antivirus. Verifica la firma
          digital antes de ejecutar el instalador.
        </p>
      </div>
    </section>
  );
}
