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
  const sectionRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);

  /* heading fade-in */
  useEffect(() => {
    const ctx = gsap.context(() => {
      const heading = sectionRef.current?.querySelector(".features-heading");
      if (!heading) return;
      gsap.fromTo(heading,
        { opacity: 0, y: 24 },
        {
          opacity: 1, y: 0,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: {
            trigger: heading,
            start: "top 90%",
          },
        }
      );
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  /* cards — same trigger pattern as BentoGrid, smooth blur-fade entrance */
  useEffect(() => {
    const ctx = gsap.context(() => {
      const cards = featuresRef.current?.querySelectorAll(".feature-card");
      if (!cards || cards.length === 0) return;

      gsap.fromTo(cards,
        { opacity: 0, y: 32, filter: "blur(8px)" },
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.9,
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: featuresRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        }
      );
    }, featuresRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} id="caracteristicas" className="relative py-24 overflow-hidden">
      <div className="relative max-w-6xl mx-auto px-6">
        <div className="features-heading mb-14">
          <p className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-3">
            Capacidades
          </p>
          <h2 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">
            Todo lo que necesitas
            <br />
            para practicar de verdad.
          </h2>
        </div>

        <div ref={featuresRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ Icon, title, body }) => (
            <FeatureCard key={title} Icon={Icon} title={title} body={body} />
          ))}
        </div>
      </div>
    </section>
  );
}
