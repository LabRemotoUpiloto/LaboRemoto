import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function DownloadHero() {
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(".hero-tag", { opacity: 0, y: 16 }, { opacity: 0.6, y: 0, duration: 0.7 })
        .fromTo(".hero-title", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8 }, "-=0.5")
        .fromTo(".hero-desc", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7 }, "-=0.5");
    }, heroRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={heroRef} className="pt-32 pb-16">
      <div className="max-w-6xl mx-auto px-6">
        <p className="hero-tag font-mono text-[10px] tracking-widest uppercase text-white/60 mb-3" style={{ opacity: 0 }}>
          Releases / Estable
        </p>
        <h1 className="hero-title text-3xl md:text-5xl font-black text-foreground tracking-tight mb-6" style={{ opacity: 0 }}>
          Descargar el cliente
          <br />
          SSH Unipiloto.
        </h1>
        <p className="hero-desc text-muted-foreground text-base max-w-xl leading-relaxed" style={{ opacity: 0 }}>
          Cliente oficial para conectarse a los laboratorios remotos. Instaladores
          para Windows, Linux y próximamente macOS.
        </p>
      </div>
    </section>
  );
}
