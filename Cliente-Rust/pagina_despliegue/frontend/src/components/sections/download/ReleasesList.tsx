import { useEffect, useRef } from "react";
import PlatformReleaseItem from "./PlatformReleaseItem";
import type { Platform, PlatformRelease } from "./types";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface ReleasesListProps {
  releases: PlatformRelease[];
  switchVersion: (platform: Platform, versionTag: string) => void;
}

export default function ReleasesList({ releases, switchVersion }: ReleasesListProps) {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 85%",
          toggleActions: "play none none reverse",
        }
      });

      tl.fromTo(".rl-heading",
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.8 }
      )
      .fromTo(".rl-card",
        { opacity: 0, y: 32, filter: "blur(4px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.8, stagger: 0.15 },
        "-=0.5"
      );
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="rl-heading mb-14 text-center" style={{ opacity: 0 }}>
          <p className="font-mono text-[10px] tracking-widest uppercase text-white/60 mb-3">
            Versiones disponibles
          </p>
          <h2 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">
            Elige tu plataforma
            <br />
            y empieza a usarlo.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {releases.map((release) => (
            <div key={release.platform} className="rl-card" style={{ opacity: 0 }}>
              <PlatformReleaseItem
                release={release}
                onVersionChange={(v) => switchVersion(release.platform, v)}
              />
            </div>
          ))}
        </div>

        <p className="mt-12 text-center font-mono text-[11px] text-muted leading-relaxed">
          Los binarios pueden generar alertas en algunos antivirus. Verifica la firma
          digital antes de ejecutar el instalador.
        </p>
      </div>
    </section>
  );
}
