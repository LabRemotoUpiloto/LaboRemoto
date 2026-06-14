import type { Line, DownloadUrls } from "./types";

/* ── neofetch ascii ── */
const NEOFETCH = `
        .-/+oossssoo+/-.          student@remote-lab
    \`:+ssssssssssssssssss+:\`      ──────────────────
  -+ssssssssssssssssssyyssss+-    OS: Remote-Lab Linux
.ossssssssssssssssss##ssssssso.   Kernel: 6.8.0-lab
+sssssssssss####ssssssssssssss+   Uptime: siempre activo
ssssssssssss####sssssssssssssss   Shell: bash 5.2.21
ssssssssssssssssssssssssssssss    Terminal: remote-lab v0.1.6
ossssssssssssssssssssssssssso     CPU: Cloud vCPU
 +sssssssssssssssssssssssss+      Memoria: ∞
  \`+ssssssssssssssssssssss+\`      Disco: práctica ilimitada
    \`-+ssssssssssssssss+-\`        Conexión: SSH + SFTP
       \`.-/+oossoo+/-.\`          El laboratorio te espera.
`.trim();

/* ── trigger browser download ── */
export function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ── command handler ── */
export function handleCommand(raw: string, downloadUrls: DownloadUrls): Line[] {
  const trimmed = raw.trim();
  const cmd = trimmed.toLowerCase();
  const args = cmd.split(/\s+/);

  if (!cmd) return [];

  /* ── help ── */
  if (cmd === "help" || cmd === "commands" || cmd === "command") {
    return [
      { text: "Comandos disponibles:", type: "ok" },
      { text: "", type: "info" },
      { text: " [instalacion]", type: "ok" },
      { text: "  install [win|linux]     — descarga Remote-Lab", type: "info" },
      { text: "  curl -sSL ... | bash    — descarga (estilo dev)", type: "info" },
      { text: "", type: "info" },
      { text: " [sistema]", type: "ok" },
      { text: "  neofetch                — info del sistema", type: "info" },
      { text: "  whoami                  — usuario actual", type: "info" },
      { text: "  uname -a               — info del kernel", type: "info" },
      { text: "  hostname                — nombre del host", type: "info" },
      { text: "  uptime                  — tiempo activo", type: "info" },
      { text: "  date                    — fecha y hora", type: "info" },
      { text: "  htop                    — procesos activos", type: "info" },
      { text: "", type: "info" },
      { text: " [archivos]", type: "ok" },
      { text: "  ls                      — listar archivos", type: "info" },
      { text: "  cat README.md           — leer archivo", type: "info" },
      { text: "  pwd                     — directorio actual", type: "info" },
      { text: "", type: "info" },
      { text: " [red]", type: "ok" },
      { text: "  ping <host>             — probar conexion", type: "info" },
      { text: "", type: "info" },
      { text: " [utilidades]", type: "ok" },
      { text: "  echo <texto>            — imprimir texto", type: "info" },
      { text: "  cowsay <texto>          — vaca ascii", type: "info" },
      { text: "  clear                   — limpiar terminal", type: "info" },
      { text: "  help | commands         — esta ayuda", type: "info" },
    ];
  }

  /* ── system info ── */
  if (cmd === "neofetch") {
    return NEOFETCH.split("\n").map((l) => ({ text: l, type: "ascii" as const }));
  }

  if (cmd === "whoami") return [{ text: "student", type: "ok" }];

  if (cmd === "uname -a") {
    return [{ text: "Linux remote-lab 6.8.0-lab #1 SMP x86_64 GNU/Linux", type: "info" }];
  }

  if (cmd === "date") {
    return [{ text: new Date().toString(), type: "info" }];
  }

  if (cmd === "pwd") {
    return [{ text: "/home/student/physics-lab-01", type: "info" }];
  }

  if (cmd === "uptime") {
    return [{ text: " 12:00:00 up 999 days,  0:00,  1 user,  load average: 0.00, 0.01, 0.05", type: "info" }];
  }

  if (cmd === "hostname") {
    return [{ text: "remote-lab", type: "ok" }];
  }

  if (cmd === "htop" || cmd === "top") {
    return [
      { text: "  PID USER      PR  NI    VIRT    RES  COMMAND", type: "info" },
      { text: "    1 student   20   0   42069   1337  remote-lab", type: "ok" },
      { text: "    2 student   20   0    2048    512  ssh-tunnel", type: "info" },
      { text: "    3 student   20   0    1024    256  sftp-session", type: "info" },
    ];
  }

  /* ── files ── */
  if (cmd === "ls" || cmd === "ls -la" || cmd === "ll") {
    return [
      { text: "total 5", type: "info" },
      { text: "drwxr-xr-x  2 student lab 4096 may 17 README.md", type: "info" },
      { text: "-rw-r--r--  1 student lab  512 may 17 practica_01.py", type: "info" },
      { text: "-rw-r--r--  1 student lab  256 may 17 config.yaml", type: "info" },
      { text: "-rwxr-xr-x  1 student lab 1024 may 17 run_tests.sh", type: "info" },
      { text: "drwxr-xr-x  3 student lab 4096 may 17 resultados/", type: "ok" },
    ];
  }

  if (cmd === "cat readme.md" || cmd === "cat readme") {
    return [
      { text: "# Remote-Lab", type: "ok" },
      { text: "", type: "info" },
      { text: "Plataforma de laboratorio remoto para estudiantes.", type: "info" },
      { text: "Conexión SSH/SFTP segura a servidores de prácticas.", type: "info" },
      { text: "", type: "info" },
      { text: "Características:", type: "ok" },
      { text: "  • Terminal SSH interactiva", type: "info" },
      { text: "  • Explorador SFTP integrado", type: "info" },
      { text: "  • Asistente IA con herramientas reales", type: "info" },
      { text: "  • Control GPIO (Raspberry Pi)", type: "info" },
      { text: "  • Escritorio remoto VNC", type: "info" },
      { text: "  • Sistema de prácticas con Moodle", type: "info" },
      { text: "", type: "info" },
      { text: "Escribe 'install' para descargar.", type: "ok" },
    ];
  }

  /* ── network ── */
  if (cmd.startsWith("ping ")) {
    const host = args[1] || "remote-lab";
    return [
      { text: `PING ${host} (10.0.42.1) 56(84) bytes of data.`, type: "info" },
      { text: `64 bytes from ${host}: icmp_seq=1 ttl=64 time=0.42 ms`, type: "info" },
      { text: `64 bytes from ${host}: icmp_seq=2 ttl=64 time=0.38 ms`, type: "info" },
      { text: `64 bytes from ${host}: icmp_seq=3 ttl=64 time=0.41 ms`, type: "info" },
      { text: "", type: "info" },
      { text: `--- ${host} ping statistics ---`, type: "info" },
      { text: "3 packets transmitted, 3 received, 0% packet loss", type: "ok" },
    ];
  }

  /* ── utilities ── */
  if (cmd.startsWith("echo ")) {
    return [{ text: trimmed.slice(5), type: "info" }];
  }

  /* ── install / download ── */
  if (cmd === "install" || cmd === "install win" || cmd === "install windows") {
    triggerDownload(downloadUrls.win);
    return [
      { text: "Descargando Remote-Lab para Windows...", type: "ok" },
      { text: "  -> " + downloadUrls.win.split("/").pop()?.replace(/%20/g, " "), type: "info" },
      { text: "✓ Descarga iniciada. Revisa tu carpeta de descargas.", type: "ok" },
    ];
  }

  if (cmd === "install linux") {
    triggerDownload(downloadUrls.linux);
    return [
      { text: "Descargando Remote-Lab para Linux...", type: "ok" },
      { text: "  -> " + downloadUrls.linux.split("/").pop(), type: "info" },
      { text: "✓ Descarga iniciada. Revisa tu carpeta de descargas.", type: "ok" },
    ];
  }

  if (cmd.includes("curl") && cmd.includes("bash")) {
    triggerDownload(downloadUrls.linux);
    return [
      { text: "  % Total    % Received % Xferd  Speed", type: "info" },
      { text: "  100  1024  100  1024    0     0  12345      0 --:--:-- --:--:--  0:00:00 12345", type: "info" },
      { text: "Descargando Remote-Lab...", type: "ok" },
      { text: "✓ Descarga iniciada.", type: "ok" },
    ];
  }

  /* ── easter eggs ── */
  if (cmd.startsWith("sudo ")) {
    return [
      { text: "student is not in the sudoers file.", type: "err" },
      { text: "This incident will be reported.", type: "err" },
    ];
  }

  if (cmd === "rm -rf /" || cmd === "rm -rf / --no-preserve-root") {
    return [
      { text: "rm: nice try.", type: "err" },
      { text: "El laboratorio es indestructible.", type: "ok" },
    ];
  }

  if (cmd === "exit" || cmd === "logout") {
    return [{ text: "No puedes escapar del laboratorio.", type: "err" }];
  }

  if (cmd === "vim" || cmd === "nano" || cmd === "emacs") {
    return [{ text: `${args[0]}: aqui usamos Remote-Lab, no editores del pasado.`, type: "info" }];
  }

  if (cmd === "cowsay" || cmd.startsWith("cowsay ")) {
    const msg = trimmed.slice(7) || "moo";
    const border = "─".repeat(msg.length + 2);
    return [
      { text: ` ┌${border}┐`, type: "info" },
      { text: ` │ ${msg} │`, type: "info" },
      { text: ` └${border}┘`, type: "info" },
      { text: "        \\   ^__^", type: "info" },
      { text: "         \\  (oo)\\_______", type: "info" },
      { text: "            (__)\\       )\\/\\", type: "info" },
      { text: "                ||----w |", type: "info" },
      { text: "                ||     ||", type: "info" },
    ];
  }

  if (cmd === "sl") {
    return [
      { text: "      ====        ________", type: "ok" },
      { text: "  _D _|  |_______/        \\__I_I_____===__|_", type: "ok" },
      { text: "   |(_)---  |   H\\________/ |   |        =|_", type: "ok" },
      { text: "   /     |  |   H  |  |     |   |         ||", type: "ok" },
      { text: "  |      |  |   H  |__--------------------| |", type: "ok" },
      { text: "  | ________|___H__/__|_____/[][]~\\_______|  |", type: "ok" },
      { text: "  |/ |   |-----------I_____I [][] []  D   |  |__", type: "ok" },
      { text: "Chuuu chuuu! Escribiste 'sl' en vez de 'ls'", type: "info" },
    ];
  }

  /* ── unknown ── */
  return [{ text: `bash: ${args[0]}: command not found. Escribe 'help'.`, type: "err" }];
}
