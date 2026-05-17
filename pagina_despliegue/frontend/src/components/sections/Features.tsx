import { useEffect, useRef } from "react";
import { Terminal, Cpu, Monitor, FolderSync, Sparkles, Layout } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import FeatureCard from "../ui/FeatureCard";

gsap.registerPlugin(ScrollTrigger);

const FEATURES = [
  {
    Icon: Terminal,
    title: "Terminal SSH",
    body: "Sesiones SSH interactivas con PTY completo. Comandos reales sobre equipos reales, sin emulaciones.",
  },
  {
    Icon: FolderSync,
    title: "Transferencia SFTP",
    body: "Sube y descarga archivos con progreso en tiempo real. Operaciones recursivas, cancelación y reconexión automática.",
  },
  {
    Icon: Sparkles,
    title: "Impulsado por IA",
    body: "Asistente inteligente integrado que puede ejecutar comandos, leer archivos y diagnosticar problemas directamente en tu sesión remota.",
  },
  {
    Icon: Cpu,
    title: "Hardware Remoto",
    body: "Accede a equipos físicos reales. Raspberry Pi, Arduino, servidores de laboratorio — todo a un clic.",
  },
  {
    Icon: Monitor,
    title: "Escritorio Remoto",
    body: "Sesiones de escritorio gráfico con baja latencia vía VNC. Trabaja con IDEs, osciloscopios virtuales y más.",
  },
  {
    Icon: Layout,
    title: "Interfaz Moderna",
    body: "Diseñada con React y Tailwind. Terminal, SFTP, escritorio remoto y chat con IA — todo en una sola ventana.",
  },
];

export default function Features() {
  const featuresRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const cards = featuresRef.current?.querySelectorAll(".feature-card");
      if (!cards) return;
      gsap.fromTo(cards,
        { opacity: 0, y: 40 },
        {
          opacity: 1, y: 0,
          duration: 0.65,
          stagger: 0.14,
          ease: "power3.out",
          scrollTrigger: {
            trigger: featuresRef.current,
            start: "top 82%",
            toggleActions: "play none none reverse",
          },
        }
      );
    }, featuresRef);
    return () => ctx.revert();
  }, []);

  return (
    <section id="caracteristicas" className="relative py-24 overflow-hidden">
      <div className="relative max-w-6xl mx-auto px-6">
        <div className="mb-14">
          <p className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-3">
            Capacidades
          </p>
          <h2 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">
            Todo lo que necesitas
            <br />
            para practicar de verdad.
          </h2>
        </div>

        <div ref={featuresRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
          {FEATURES.map(({ Icon, title, body }) => (
            <FeatureCard key={title} Icon={Icon} title={title} body={body} />
          ))}
        </div>
      </div>
    </section>
  );
}
