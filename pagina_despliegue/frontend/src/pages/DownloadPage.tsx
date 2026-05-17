import { useState, useEffect } from "react";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import {
  Download,
  Monitor,
  Terminal,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  AlertCircle,
  Cpu,
} from "lucide-react";

interface Release {
  version: string;
  date: string;
  size: string;
  platform: "windows" | "linux";
  filename: string;
  downloadUrl: string;
  isLatest: boolean;
  notes: string[];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="shrink-0 p-1 text-muted hover:text-cyan transition-colors"
      aria-label="Copiar"
    >
      {copied ? <Check size={12} className="text-cyan" /> : <Copy size={12} />}
    </button>
  );
}

function ReleaseCard({ release }: { release: Release }) {
  const PlatformIcon = PLATFORM_ICONS[release.platform];

  return (
    <div className="relative border border-border bg-surface-2 hover:border-cyan/30 hover:shadow-glow-cyan transition-all duration-300">
      {/* cyan top stripe for latest */}
      {release.isLatest && (
        <div className="absolute top-0 left-0 right-0 h-px bg-cyan animate-border-pulse" />
      )}

      <div className="p-6">
        {/* top row */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <PlatformIcon size={16} strokeWidth={1.5} className="text-muted-foreground" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-foreground">
                  {PLATFORM_LABELS[release.platform]}
                </span>
                {release.isLatest && (
                  <span className="font-mono text-[9px] tracking-widest uppercase text-cyan border border-cyan/30 px-1.5 py-0.5">
                    latest
                  </span>
                )}
              </div>
              <p className="font-mono text-[11px] text-muted mt-0.5">{release.filename}</p>
            </div>
          </div>
          <div className="text-right font-mono text-[11px] text-muted">
            <div>v{release.version}</div>
            <div className="mt-0.5">{release.size}</div>
          </div>
        </div>

        {/* notes */}
        <ul className="space-y-1.5 mb-6">
          {release.notes.map((note) => (
            <li key={note} className="flex items-start gap-2">
              <CheckCircle2 size={11} className="text-cyan mt-0.5 shrink-0" />
              <span className="font-mono text-[11px] text-muted-foreground">{note}</span>
            </li>
          ))}
        </ul>

        {/* footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-muted font-mono text-[11px]">
            <Clock size={10} />
            <span>{release.date}</span>
          </div>
          <a
            href={release.downloadUrl}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan text-background font-mono text-[11px] font-bold tracking-widest uppercase hover:bg-cyan-light transition-colors"
          >
            <Download size={11} />
            Descargar
          </a>
        </div>
      </div>
    </div>
  );
}

const PLATFORM_ICONS: Record<
  string,
  React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
> = {
  windows: Monitor,
  linux: Terminal,
};

const PLATFORM_LABELS: Record<string, string> = {
  windows: "Windows",
  linux: "Linux",
};

export default function DownloadPage() {
  const [windowsRelease, setWindowsRelease] = useState<Release>({
    version: "0.1.6",
    date: "2026-05-17",
    size: "Auto",
    platform: "windows",
    filename: "Cliente SSH Unipiloto_x64-setup.exe",
    downloadUrl: "https://github.com/Haider2231/Releases-Cliente-SSH-Unipiloto/releases/download/v0.1.6/Cliente%20SSH%20Unipiloto_0.1.6_x64-setup.exe",
    isLatest: true,
    notes: [
      "Lanzamiento oficial",
      "Instalación desatendida"
    ],
  });

  const [linuxRelease, setLinuxRelease] = useState<Release>({
    version: "0.1.6",
    date: "2026-05-17",
    size: "Auto",
    platform: "linux",
    filename: "ClienteSSH-Unipiloto-Linux",
    downloadUrl: "https://github.com/Haider2231/Releases-Cliente-SSH-Unipiloto/releases/download/v0.1.6/ClienteSSH-Unipiloto-Linux",
    isLatest: true,
    notes: [
      "Lanzamiento oficial",
      "Binario ejecutable"
    ],
  });

  useEffect(() => {
    async function cargarEnlacesDescarga() {
      const repo = "Haider2231/Releases-Cliente-SSH-Unipiloto";
      try {
        const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`);
        const release = await res.json();
        const version = release.tag_name || "latest";
        const date = release.published_at ? release.published_at.split("T")[0] : "Reciente";
        
        const winAsset = release.assets?.find((a: any) => a.name.includes("setup.exe"));
        const linuxAsset = release.assets?.find((a: any) => a.name.includes("Linux"));

        if (winAsset) {
          setWindowsRelease(prev => ({
            ...prev,
            version,
            date,
            size: (winAsset.size / (1024 * 1024)).toFixed(1) + " MB",
            filename: winAsset.name,
            downloadUrl: winAsset.browser_download_url
          }));
        }
        if (linuxAsset) {
          setLinuxRelease(prev => ({
            ...prev,
            version,
            date,
            size: (linuxAsset.size / (1024 * 1024)).toFixed(1) + " MB",
            filename: linuxAsset.name,
            downloadUrl: linuxAsset.browser_download_url
          }));
        }
      } catch (e) {
        console.error("Error al cargar dinámicamente desde GitHub:", e);
      }
    }
    cargarEnlacesDescarga();
  }, []);

  const RELEASES: Release[] = [windowsRelease, linuxRelease];

  const INSTALL_CMDS = [
    {
      platform: "Windows",
      Icon: Monitor,
      cmd: "irm https://raw.githubusercontent.com/Haider2231/Releases-Cliente-SSH-Unipiloto/main/download-release.ps1 | iex",
      hint: "Ejecutar en PowerShell",
    },
    {
      platform: "Linux",
      Icon: Terminal,
      cmd: "curl -sSL https://raw.githubusercontent.com/Haider2231/Releases-Cliente-SSH-Unipiloto/main/download-release.sh | bash",
      hint: "Ejecutar en la Terminal",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 pt-24">

        {/* Page header */}
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

        {/* Quick install */}
        <section className="max-w-6xl mx-auto px-6 py-16 border-b border-border">
          <h2 className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-8">
            Instalación rápida
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {INSTALL_CMDS.map(({ platform, Icon, cmd, hint }) => (
              <div key={platform} className="border border-border bg-surface-2 hover:border-cyan/25 transition-colors">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
                  <Icon size={11} strokeWidth={1.5} className="text-cyan" />
                  <span className="font-mono text-[10px] tracking-widest uppercase text-muted">
                    {platform}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <code className="font-mono text-xs text-foreground truncate mr-2">{cmd}</code>
                  <CopyButton text={cmd} />
                </div>
                <div className="px-4 pb-3 flex items-center gap-1.5 font-mono text-[10px] text-muted">
                  <AlertCircle size={9} className="text-cyan/60" />
                  {hint}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Downloads */}
        <section className="max-w-6xl mx-auto px-6 py-16">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-mono text-[10px] tracking-widest uppercase text-muted">
              Versiones disponibles — {RELEASES.length} plataformas
            </h2>
            <div className="flex items-center gap-2 font-mono text-[10px] tracking-widest uppercase text-cyan">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-border-pulse" />
              Estable
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {RELEASES.map((release, i) => (
              <ReleaseCard key={i} release={release} />
            ))}
          </div>

          <div className="mt-8 flex items-start gap-3 p-4 border border-border/60">
            <AlertCircle size={12} className="text-cyan/60 mt-0.5 shrink-0" />
            <p className="font-mono text-[11px] text-muted leading-relaxed">
              Los binarios pueden generar alertas en algunos antivirus.
              Verifica la firma digital antes de ejecutar el instalador.
            </p>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
