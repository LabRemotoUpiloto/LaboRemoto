import { useState, useCallback, useMemo, useRef } from 'react'
import { newLine, typeKeys, serverOutput, pantallaAlterna, type ShellLine } from './shellLine'

export interface CommandEntry {
  cmd: string
  time: Date
}

export function useCommandHistory() {
  const [commandEntries, setCommandEntries] = useState<CommandEntry[]>([])
  // Línea que se está editando (texto + cursor): ver features/terminal/shellLine.ts
  const lineRef    = useRef<ShellLine>(newLine())
  const lastCmdRef = useRef<string>('')
  // nano, less, top…: mientras están abiertos, lo que se teclea no son comandos (ver pantallaAlterna)
  const alternaRef = useRef(false)
  const colaRef    = useRef('')

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
    if (alternaRef.current) return
    const { line, commands } = typeKeys(lineRef.current, data, Date.now())
    lineRef.current = line
    commands.forEach(pushCommand)
  }, [pushCommand])

  /**
   * processTerminalData — salida del servidor SSH.
   * Solo cuenta justo después de Tab o ↑/↓: bash redibuja la línea y eso se aplica a la línea que llevamos.
   */
  const processTerminalData = useCallback((data: string) => {
    const estaba = alternaRef.current
    alternaRef.current = pantallaAlterna(estaba, colaRef.current, data)
    colaRef.current = data.slice(-8)
    if (estaba !== alternaRef.current) {
      // al entrar o salir del programa, la línea de la shell empieza de cero
      lineRef.current = newLine()
      return
    }
    if (alternaRef.current) return
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
    alternaRef.current = false
    colaRef.current    = ''
  }, [])

  const addCommand = useCallback((command: string) => {
    pushCommand(command)
  }, [pushCommand])

  // commandHistory como string[] para compatibilidad con el resto del sistema.
  // Memoizado: solo cambia de referencia cuando entra un comando nuevo. Sin esto
  // era un arreglo nuevo en cada render y el efecto de TerminalView que lo
  // reporta mandaba un POST /validate a la Pi por cada render.
  const commandHistory = useMemo(() => commandEntries.map(e => e.cmd), [commandEntries])

  return {
    commandHistory,
    commandEntries,
    processTerminalData,
    processTerminalInput,
    clearHistory,
    addCommand,
  }
}
