import { useEffect, useRef, useState } from "react";
import CopyButton from "../../ui/CopyButton";
import { TuxIcon, WindowsIcon } from "./PlatformIcons";
import type { Platform, PlatformRelease } from "./types";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface QuickInstallProps {
  releases: PlatformRelease[];
}

const ICONS = {
  windows: WindowsIcon,
  linux: TuxIcon,
};

const HINTS = {
  windows: "Ejecutar en PowerShell",
  linux: "Ejecutar en la Terminal",
};

function QuickInstallItem({
  release,
}: {
  release: PlatformRelease;
}) {
  const Icon = ICONS[release.platform as keyof typeof ICONS];
  const hint = HINTS[release.platform as keyof typeof HINTS];
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);

  if (!Icon) return null;

  const variant = release.variants[selectedVariantIdx] || release.variants[0];
  const hasVariants = release.variants.length > 1;

  let cmd = "";
  if (release.platform === "windows") {
    cmd = `irm https://raw.githubusercontent.com/Haider2231/Releases-Cliente-SSH-Unipiloto/main/download-release.ps1 | iex`;
  } else {
    // Descarga directa del binario seleccionado para Linux
    cmd = `curl -LO ${variant.downloadUrl} && chmod +x ${variant.filename} && ./${variant.filename}`;
  }

  return (
    <div className="qi-card border-l border-border pl-6 flex flex-col justify-between" style={{ opacity: 0 }}>
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Icon size={20} />
            <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
              {release.platform === "windows" ? "WINDOWS 11" : release.platform}
            </span>
          </div>

          {hasVariants && (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-2 px-2 py-1 bg-surface border border-border text-muted-foreground font-mono text-[10px] tracking-wider uppercase hover:border-white/20 hover:text-foreground transition-colors"
              >
                <span className="whitespace-nowrap">{variant.label}</span>
                <svg
                  className={`w-3 h-3 transition-transform shrink-0 ${dropdownOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {dropdownOpen && (
                <ul className="absolute right-0 top-full mt-1 bg-surface border border-border overflow-hidden z-20 w-48 shadow-lg">
                  {release.variants.map((v, idx) => {
                    const isActive = idx === selectedVariantIdx;
                    return (
                      <li key={v.filename}>
                        <button
                          onClick={() => {
                            setSelectedVariantIdx(idx);
                            setDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 font-mono text-[10px] tracking-wider transition-colors ${
                            isActive
                              ? "bg-white/10 text-white"
                              : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                          }`}
                        >
                          {v.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 mb-2 w-full">
          <code className="flex-1 min-w-0 font-mono text-xs text-foreground overflow-x-auto scrollbar-hide whitespace-nowrap bg-surface-2 px-3 py-2.5 rounded-sm border border-border" title={cmd}>
            {cmd}
          </code>
          <div className="shrink-0">
            <CopyButton text={cmd} />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-1">
        <p className="font-mono text-[11px] text-muted">{hint}</p>
        {release.platform === "linux" && (
          <p className="font-mono text-[9.5px] text-muted-foreground">
            Ver versión: <code className="text-white bg-white/10 px-1 py-0.5 rounded">ldd --version</code>
          </p>
        )}
      </div>
    </div>
  );
}

export default function QuickInstall({ releases }: QuickInstallProps) {
  const availableReleases = releases.filter((r) => r.available);
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
      
      tl.fromTo(".qi-heading",
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.8 }
      )
      .fromTo(".qi-card",
        { opacity: 0, x: -16 },
        { opacity: 1, x: 0, duration: 0.8, stagger: 0.15 },
        "-=0.5"
      );
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="py-16">
      <div className="max-w-6xl mx-auto px-6">
        <div className="qi-heading mb-10" style={{ opacity: 0 }}>
          <p className="font-mono text-[10px] tracking-widest uppercase text-white/60 mb-3">
            Instalación rápida
          </p>
          <h2 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">
            Una sola línea
            <br />
            en tu terminal.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {availableReleases.map((release) => (
            <QuickInstallItem
              key={release.platform}
              release={release}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
