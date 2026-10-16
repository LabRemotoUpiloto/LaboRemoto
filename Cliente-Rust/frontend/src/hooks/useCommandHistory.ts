import { useState, useCallback, useRef } from 'react'
import { newLine, typeKeys, serverOutput, type ShellLine } from '../utils/shellLine'

export interface CommandEntry {
  cmd: string
  time: Date
}

export function useCommandHistory() {
  const [commandEntries, setCommandEntries] = useState<CommandEntry[]>([])
  // Línea que se está editando (texto + cursor): ver utils/shellLine.ts
  const lineRef    = useRef<ShellLine>(newLine())
  const lastCmdRef = useRef<string>('')

  const pushCommand = useCallback((command: string) => {
    const cmd = command.trim()
    if (!cmd) return
    lastCmdRef.current = cmd
    if (import.meta.env.DEV) console.log('[CMD] push:', JSON.stringify(cmd))
    setCommandEntries(prev => [...prev, { cmd, time: new Date() }])
  }, [])

  /**
   * processTerminalInput — lo que el usuario TECLEA (onData de xterm).
   * Edita la línea como readline (cursor, flechas, Supr, Ctrl+A/E/U/K/W) y, con Enter, guarda el comando.
   */
  const processTerminalInput = useCallback((data: string) => {
    const { line, commands } = typeKeys(lineRef.current, data, Date.now())
    lineRef.current = line
    commands.forEach(pushCommand)
  }, [pushCommand])

  /**
   * processTerminalData — salida del servidor SSH.
   * Solo cuenta justo después de Tab o ↑/↓: bash redibuja la línea y eso se aplica a la línea que llevamos.
   */
  const processTerminalData = useCallback((data: string) => {
    const antes = lineRef.current
    lineRef.current = serverOutput(antes, data, Date.now())
    if (import.meta.env.DEV && lineRef.current !== antes) {
      console.log('[CMD] server sync:', JSON.stringify(lineRef.current.text))
    }
  }, [])

  const clearHistory = useCallback(() => {
    setCommandEntries([])
    lineRef.current    = newLine()
    lastCmdRef.current = ''
  }, [])

  const addCommand = useCallback((command: string) => {
    pushCommand(command)
  }, [pushCommand])

  // commandHistory como string[] para compatibilidad con el resto del sistema
  const commandHistory = commandEntries.map(e => e.cmd)

  return {
    commandHistory,
    commandEntries,
    processTerminalData,
    processTerminalInput,
    clearHistory,
    addCommand,
  }
}
