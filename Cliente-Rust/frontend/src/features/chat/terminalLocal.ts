// features/chat/terminalLocal.ts — lo que el chat de la terminal local le dice al modelo: qué terminal es, para que dé
// comandos de esa shell (PowerShell en Windows) y no de Linux.
export function reglasTerminalLocal(shell: string, sistema: string): string {
  const nombre = (shell.split(/[\\/]/).pop() ?? shell).replace(/\.exe$/i, '');
  const esPowerShell = /^(pwsh|powershell)$/i.test(nombre);
  const so = sistema === 'windows' ? 'Windows' : sistema === 'macos' ? 'macOS' : sistema === 'linux' ? 'Linux' : sistema;
  return [
    `Estás ayudando en la terminal local de la persona, en su propio computador (${so}), no en un servidor por SSH.`,
    esPowerShell
      ? `La terminal es ${/^pwsh$/i.test(nombre) ? 'PowerShell 7 (pwsh)' : 'Windows PowerShell'}: da comandos y ejemplos de PowerShell (cmdlets como Get-ChildItem, Get-Process, Stop-Process), no de bash, salvo que pida otra cosa.`
      : `La terminal es ${nombre}: da comandos de esa shell.`,
    'Los bloques de código que des tienen un botón Ejecutar que escribe el comando en esa terminal: un comando por bloque y sin texto de más dentro del bloque.',
  ].join('\n');
}
