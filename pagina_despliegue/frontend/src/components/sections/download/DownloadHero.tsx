export default function DownloadHero() {
  return (
    <section className="max-w-6xl mx-auto px-6 pt-12 pb-16 border-b border-border">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
        <div>
          <p className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-4">
            Releases / Estable
          </p>
          <h1 className="font-mono text-4xl md:text-5xl font-black tracking-tight uppercase text-foreground leading-none">
            Descargar
          </h1>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed md:max-w-xs md:ml-auto">
          Cliente oficial de SSH Unipiloto. Instaladores para Windows y Linux.
          Accede a tus servidores en segundos.
        </p>
      </div>
    </section>
  );
}
