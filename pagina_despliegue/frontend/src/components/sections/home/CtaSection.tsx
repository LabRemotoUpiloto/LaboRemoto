import { Link } from "react-router-dom";

export default function CtaSection() {
  return (
    <section className="py-28 relative overflow-hidden">
      <div className="relative max-w-6xl mx-auto px-6 text-center">
        <p className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-5">
          Empieza hoy
        </p>
        <h2 className="text-3xl md:text-5xl font-black text-foreground tracking-tight mb-6">
          El laboratorio que
          <br />
          no cierra nunca.
        </h2>
        <p className="text-muted-foreground text-base max-w-md mx-auto mb-10">
          Disponible las 24 horas para estudiantes, profesores y laboratoristas.
          Sin restricciones de horario ni de ubicación.
        </p>
        <Link
          to="/descargar"
          className="inline-flex items-center gap-3 px-8 py-3.5 bg-cyan text-background font-mono text-sm font-bold tracking-widest uppercase hover:bg-cyan-light transition-colors shadow-glow-cyan"
        >
          Descargar
        </Link>
      </div>
    </section>
  );
}
