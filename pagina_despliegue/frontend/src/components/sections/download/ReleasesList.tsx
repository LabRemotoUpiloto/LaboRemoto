import { AlertCircle } from "lucide-react";
import ReleaseCard from "./ReleaseCard";
import { useReleases } from "./useReleases";

export default function ReleasesList() {
  const releases = useReleases();

  return (
    <section className="max-w-6xl mx-auto px-6 py-16">
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-mono text-[10px] tracking-widest uppercase text-muted">
          Versiones disponibles — {releases.length} plataformas
        </h2>
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-widest uppercase text-cyan">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-border-pulse" />
          Estable
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {releases.map((release, i) => (
          <ReleaseCard key={i} release={release} />
        ))}
      </div>

      <div className="mt-8 flex items-start gap-3 p-4 border border-border/60">
        <AlertCircle size={12} className="text-cyan/60 mt-0.5 shrink-0" />
        <p className="font-mono text-[11px] text-muted leading-relaxed">
          Los binarios pueden generar alertas en algunos antivirus.
          Verifica la firma digital antes de ejecutar el instalador.
        </p>
      </div>
    </section>
  );
}
