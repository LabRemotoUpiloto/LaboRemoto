const STEPS = [
  {
    num: "01",
    title: "Descarga el cliente",
    body: "Instala la aplicación en Windows o Linux. Ligera, rápida, sin dependencias extras.",
  },
  {
    num: "02",
    title: "Elige tu práctica",
    body: "Selecciona el laboratorio y la sesión asignada por tu docente desde el catálogo académico.",
  },
  {
    num: "03",
    title: "Conéctate y trabaja",
    body: "Accede al equipo remoto con terminal SSH, SFTP o escritorio gráfico según requiera tu práctica.",
  },
];

export default function HowItWorks() {
  return (
    <section className="py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-14">
          <p className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-3">
            Flujo de trabajo
          </p>
          <h2 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">
            Tres pasos para
            <br />
            empezar a practicar.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {STEPS.map(({ num, title, body }) => (
            <div
              key={num}
              className="relative pl-8 border-l border-border hover:border-cyan/40 transition-colors duration-300"
            >
              <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground block mb-3">
                {num}
              </span>
              <h3 className="font-mono text-sm font-bold text-foreground mb-2">{title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
