import CopyButton from "../../ui/CopyButton";
import { TuxIcon, WindowsIcon } from "./PlatformIcons";

const INSTALL_CMDS = [
  {
    platform: "Windows",
    Icon: WindowsIcon,
    cmd: "irm https://raw.githubusercontent.com/Haider2231/Releases-Cliente-SSH-Unipiloto/main/download-release.ps1 | iex",
    hint: "Ejecutar en PowerShell",
  },
  {
    platform: "Linux",
    Icon: TuxIcon,
    cmd: "curl -sSL https://raw.githubusercontent.com/Haider2231/Releases-Cliente-SSH-Unipiloto/main/download-release.sh | bash",
    hint: "Ejecutar en la Terminal",
  },
];

export default function QuickInstall() {
  return (
    <section className="py-16">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-10">
          <p className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-3">
            Instalación rápida
          </p>
          <h2 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">
            Una sola línea
            <br />
            en tu terminal.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {INSTALL_CMDS.map(({ platform, Icon, cmd, hint }) => (
            <div key={platform} className="border-l border-border pl-6">
              <div className="flex items-center gap-3 mb-3">
                <Icon size={20} />
                <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
                  {platform}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <code className="font-mono text-xs text-foreground truncate">
                  {cmd}
                </code>
                <CopyButton text={cmd} />
              </div>
              <p className="font-mono text-[11px] text-muted">{hint}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
