import { useEffect, useRef } from "react";
import { Terminal, Cpu, Monitor, Network, FolderOpen, Wifi, Building2 } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const BENTO_ITEMS = [
  {
    id: "b1",
    size: "md:col-span-2",
    Icon: Wifi,
    label: "Internet de las Cosas",
    title: "IoT",
    body: "Desarrollo y pruebas de dispositivos conectados, sensores y domótica.",
  },
  {
    id: "b2",
    size: "md:col-span-1",
    Icon: Terminal,
    label: "Sistemas",
    title: "Ing. de Sistemas",
    body: "Redes, servidores Linux y bases de datos en entornos controlados.",
  },
  {
    id: "b3",
    size: "md:col-span-1",
    Icon: Network,
    label: "Telecomunicaciones",
    title: "Ingeniería en Telecomunicaciones",
    body: "Protocolos, antenas y simulación de redes de datos.",
  },
  {
    id: "b4",
    size: "md:col-span-1",
    Icon: Monitor,
    label: "Mecatrónica",
    title: "Ingeniería Mecatrónica",
    body: "Control de actuadores, PLC y robótica remota.",
  },
  {
    id: "b5",
    size: "md:col-span-1",
    Icon: FolderOpen,
    label: "Ciencias Básicas",
    title: "Física",
    body: "Plataforma extensible para realizar prácticas con simuladores y hardware.",
  },
  {
    id: "b6",
    size: "md:col-span-1",
    Icon: Cpu,
    label: "Electrónica",
    title: "Ingeniería Electrónica",
    body: "Diseño de circuitos, microcontroladores y sistemas embebidos con acceso a hardware real.",
  },
  {
    id: "b7",
    size: "md:col-span-2",
    Icon: Building2,
    label: "Estructural",
    title: "Ingeniería Civil",
    body: "Software de diseño estructural, análisis de materiales y modelado remoto.",
  },
];

export default function BentoGrid() {
  const bentoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const cards = bentoRef.current?.querySelectorAll(".bento-card");
      if (!cards) return;
      gsap.fromTo(cards,
        { opacity: 0, y: 80, scale: 0.9, rotateX: -10 },
        {
          opacity: 1, y: 0, scale: 1, rotateX: 0,
          duration: 1.2,
          stagger: 0.15,
          ease: "elastic.out(1, 0.8)",
          scrollTrigger: {
            trigger: bentoRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        }
      );
    }, bentoRef);
    return () => ctx.revert();
  }, []);

  return (
    <section className="py-16">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <p className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-2">
            Programas académicos
          </p>
          <h2 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">
            Diseñado para múltiples
            <br />
            disciplinas de ingeniería.
          </h2>
        </div>

        <div
          ref={bentoRef}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 grid-rows-[auto] gap-3 md:gap-4 [perspective:1000px]"
        >
          {BENTO_ITEMS.map(({ id, size, Icon, label, title, body }) => (
            <div
              key={id}
              className={`bento-card ${size} bg-surface-2 p-5 md:p-6 flex flex-col justify-between gap-4 min-h-[160px] rounded-3xl border border-border shadow-sm`}
            >
              <div className="flex items-start justify-between">
                <div className="w-9 h-9 rounded-xl border flex items-center justify-center border-border bg-surface-3">
                  <Icon size={16} strokeWidth={1.5} className="text-muted-foreground" />
                </div>
                <span className="font-mono text-[9px] tracking-widest uppercase text-muted">
                  {label}
                </span>
              </div>

              <div>
                <h3 className="font-mono text-sm font-bold mb-1.5 text-foreground">{title}</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
