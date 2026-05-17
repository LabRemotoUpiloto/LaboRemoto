import PlatformReleaseItem from "./PlatformReleaseItem";
import { useReleases } from "./useReleases";

export default function ReleasesList() {
  const releases = useReleases();

  return (
    <section className="py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-10">
          <p className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-3">
            Versiones disponibles
          </p>
          <h2 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">
            Elige tu plataforma
            <br />
            y empieza a usarlo.
          </h2>
        </div>

        <div className="border-t border-border">
          {releases.map((release) => (
            <PlatformReleaseItem key={release.platform} release={release} />
          ))}
        </div>

        <p className="mt-10 font-mono text-[11px] text-muted leading-relaxed">
          Los binarios pueden generar alertas en algunos antivirus. Verifica la firma
          digital antes de ejecutar el instalador.
        </p>
      </div>
    </section>
  );
}
