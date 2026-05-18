import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Download, ArrowRight } from "lucide-react";
import gsap from "gsap";
import TerminalWindow from "../../ui/terminal";

const ASCII_LOGO = `
██╗       █████╗  ██████╗   ██████╗  ██████╗   █████╗  ████████╗  ██████╗  ██████╗  ██╗  ██████╗ 
██║      ██╔══██╗ ██╔══██╗ ██╔═══██╗ ██╔══██╗ ██╔══██╗ ╚══██╔══╝ ██╔═══██╗ ██╔══██╗ ██║ ██╔═══██╗
██║      ███████║ ██████╔╝ ██║   ██║ ██████╔╝ ███████║    ██║    ██║   ██║ ██████╔╝ ██║ ██║   ██║
██║      ██╔══██║ ██╔══██╗ ██║   ██║ ██╔══██╗ ██╔══██║    ██║    ██║   ██║ ██╔══██╗ ██║ ██║   ██║
███████╗ ██║  ██║ ██████╔╝ ╚██████╔╝ ██║  ██║ ██║  ██║    ██║    ╚██████╔╝ ██║  ██║ ██║ ╚██████╔╝
╚══════╝ ╚═╝  ╚═╝ ╚═════╝   ╚═════╝  ╚═╝  ╚═╝ ╚═╝  ╚═╝    ╚═╝     ╚═════╝  ╚═╝  ╚═╝ ╚═╝  ╚═════╝ 

██████╗  ███████╗ ███╗   ███╗   ██████╗  ████████╗  ██████╗ 
██╔══██╗ ██╔════╝ ████╗ ████║  ██╔═══██╗ ╚══██╔══╝ ██╔═══██╗
██████╔╝ █████╗   ██╔████╔██║  ██║   ██║    ██║    ██║   ██║
██╔══██╗ ██╔══╝   ██║╚██╔╝██║  ██║   ██║    ██║    ██║   ██║
██║  ██║ ███████╗ ██║ ╚═╝ ██║  ╚██████╔╝    ██║    ╚██████╔╝
╚═╝  ╚═╝ ╚══════╝ ╚═╝     ╚═╝   ╚═════╝     ╚═╝     ╚═════╝ 
`.trim();

export default function HeroSection() {
  const heroRef   = useRef<HTMLDivElement>(null);
  const asciiRef  = useRef<HTMLPreElement>(null);
  const leftRef   = useRef<HTMLDivElement>(null);
  const rightRef  = useRef<HTMLDivElement>(null);
  const abejaRef  = useRef<HTMLImageElement>(null);
  const termRef   = useRef<HTMLDivElement>(null);
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      // 1. ASCII fades in
      tl.fromTo(asciiRef.current,
        { opacity: 0, y: 16 },
        { opacity: 0.85, y: 0, duration: 0.8 }
      )
      // 2. Left copy slides up
      .fromTo(leftRef.current,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.7 },
        "-=0.5"
      )
      // 3. Terminal fades up
      .fromTo(termRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8 },
        "-=0.5"
      )
      // 4. Abeja peeks out from behind the terminal
      .fromTo(abejaRef.current,
        { opacity: 0, y: 40, x: -20, scale: 0.8 },
        { opacity: 1, y: 0, x: 0, scale: 1, duration: 1, ease: "back.out(1.5)" },
        "-=0.4"
      );
    }, heroRef);

    return () => ctx.revert();
  }, []);

  const handleAbejaClick = () => {
    if (!abejaRef.current || isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    const tl = gsap.timeline({
      onComplete: () => {
        isAnimatingRef.current = false;
      }
    });
    // 1. Squash down (pre-jump preparation)
    tl.to(abejaRef.current, {
      scaleY: 0.75,
      scaleX: 1.15,
      duration: 0.15,
      ease: "power1.inOut"
    })
    // 2. Launch up with stretch + slight rotation
    .to(abejaRef.current, {
      y: -60,
      scaleY: 1.2,
      scaleX: 0.85,
      rotationY: 180, // Spin around 3D!
      duration: 0.35,
      ease: "power2.out"
    })
    // 3. Shake/Flutter at the peak of the jump (wing buzz)
    .to(abejaRef.current, {
      rotation: 12,
      x: 10,
      duration: 0.08,
      yoyo: true,
      repeat: 3,
      ease: "sine.inOut"
    })
    // 4. Spin back and plunge down
    .to(abejaRef.current, {
      rotationY: 360,
      rotation: 0,
      x: 0,
      duration: 0.3,
      ease: "power1.in"
    })
    // 5. Land with a satisfying bounce
    .to(abejaRef.current, {
      y: 0,
      scaleY: 1,
      scaleX: 1,
      rotationY: 0,
      duration: 0.6,
      ease: "bounce.out"
    });
  };

  return (
    <section
      ref={heroRef}
      className="relative min-h-screen flex flex-col justify-start lg:justify-center pt-28 lg:pt-20 pb-16 overflow-hidden"
    >
      <div className="relative max-w-6xl mx-auto px-6 w-full">

        {/* Title Wrapper (fades in via GSAP) */}
        <pre
          ref={asciiRef}
          className="text-[5px] sm:text-[6.5px] md:text-[8px] leading-tight mb-10 select-none overflow-x-auto scrollbar-hide"
          style={{ opacity: 0, fontFamily: '"Courier New", Courier, monospace' }}
          aria-hidden="true"
        >
          {ASCII_LOGO}
        </pre>

        {/* 50 / 50 grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* ── LEFT — text + buttons (unchanged) ── */}
          <div
            ref={leftRef}
            className="flex flex-col justify-center space-y-6"
            style={{ opacity: 0 }}
          >
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-cyan">
              Semillero de IoT · Universidad Piloto de Colombia
            </p>

            <p className="text-muted-foreground text-base leading-relaxed max-w-[440px]">
              Plataforma de laboratorio remoto para estudiantes, profesores y
              laboratoristas. Conexión real, prácticas reales — desde cualquier lugar.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                to="/descargar"
                className="inline-flex items-center gap-2.5 px-6 py-3 bg-cyan text-background font-mono text-xs font-bold tracking-widest uppercase hover:bg-cyan-light transition-colors"
              >
                <Download size={13} />
                Descargar
              </Link>
              <a
                href="#caracteristicas"
                className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground hover:text-foreground tracking-widest uppercase transition-colors group"
              >
                Ver más
                <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
              </a>
            </div>
          </div>

          {/* ── RIGHT — Terminal (main visual) with peeking abeja ── */}
          <div className="flex justify-center lg:justify-end relative w-full mt-20 sm:mt-28 lg:mt-0">

            {/* Terminal Container */}
            <div
              ref={termRef}
              className="relative w-full max-w-xl"
              style={{ opacity: 0 }}
            >
              {/* Abeja peeking from top-center. 
                  mix-blend-screen removes the black background from the JPEG! */}
              <div
                ref={abejaRef}
                onClick={handleAbejaClick}
                className="absolute -top-36 sm:-top-44 md:-top-52 lg:-top-60 right-32 sm:right-40 md:right-48 lg:right-64 xl:right-72 z-0 pointer-events-auto cursor-pointer select-none group"
                style={{ opacity: 0 }}
                title="¡Haz clic en la abeja!"
              >
                <img
                  src="/abeja.jpeg"
                  alt="Mascota Semillero IoT"
                  className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 lg:w-56 lg:h-56 object-contain mix-blend-screen drop-shadow-2xl transition-transform group-hover:scale-105"
                />
              </div>

              {/* Terminal window is placed on top (z-10) so the abeja appears to peek from behind */}
              <div className="relative z-10 drop-shadow-2xl shadow-cyan/10">
                <TerminalWindow />
              </div>

            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
