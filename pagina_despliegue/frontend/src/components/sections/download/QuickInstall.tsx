import { Monitor, Terminal, AlertCircle } from "lucide-react";
import CopyButton from "../../ui/CopyButton";

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

export default function QuickInstall() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-16 border-b border-border">
      <h2 className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-8">
        Instalación rápida
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {INSTALL_CMDS.map(({ platform, Icon, cmd, hint }) => (
          <div
            key={platform}
            className="border border-border bg-surface-2 hover:border-cyan/25 transition-colors"
          >
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
  );
}
