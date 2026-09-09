import { useState, useCallback, useRef } from 'react'

// Limpia TODOS los códigos de escape ANSI/VT de una cadena
function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[\d;?]*[a-zA-Z]/g, '')  // CSI: ESC [ (incluyendo ?)
    .replace(/\x1b\][^\x07]*\x07/g, '')       // OSC: ESC ] ... BEL
    .replace(/\x1b[()][AB012]/g, '')           // charset
    .replace(/\x1b[DMEHIJ78NOP]/g, '')         // ESC de 1 char
    .replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '') // control (sin \n)
}

export interface CommandEntry {
  cmd: string
  time: Date
}

export function useCommandHistory() {
  const [commandEntries, setCommandEntries] = useState<CommandEntry[]>([])
  const inputBufRef    = useRef<string>('')
  const lastCmdRef     = useRef<string>('')
  const tabPendingRef  = useRef(false)   // Tab fue presionado, esperar sync del servidor
  const histPendingRef = useRef(false)   // Flecha ↑↓ presionada, esperar sync del servidor

  const pushCommand = useCallback((command: string) => {
    const cmd = command.trim()
    if (!cmd) return
    lastCmdRef.current = cmd
    if (import.meta.env.DEV) console.log('[CMD] push:', JSON.stringify(cmd))
    setCommandEntries(prev => [...prev, { cmd, time: new Date() }])
  }, [])

  /**
   * processTerminalInput — lo que el usuario TECLEA (onData de xterm).
   * - Caracteres normales → acumular en inputBufRef
   * - Tab → marcar tabPendingRef (el servidor enviará la compleción)
   * - Flechas ↑↓ → limpiar buffer y marcar histPendingRef
   * - Enter → guardar comando
   */
  const processTerminalInput = useCallback((data: string) => {
    let i = 0
    while (i < data.length) {
      const code = data.charCodeAt(i)
      const ch   = data[i]

      // Enter
      if (ch === '\r' || ch === '\n') {
        pushCommand(inputBufRef.current)
        inputBufRef.current = ''
        tabPendingRef.current  = false
        histPendingRef.current = false
        i++
        continue
      }

      // Backspace / DEL
      if (code === 127 || code === 8) {
        inputBufRef.current = inputBufRef.current.slice(0, -1)
        tabPendingRef.current = false
        i++
        continue
      }

      // Tab
      if (code === 9) {
        tabPendingRef.current = true   // esperar compleción del servidor
        i++
        continue
      }

      // Secuencia ESC
      if (code === 27) {
        i++ // consumir ESC
        if (i < data.length && (data[i] === '[' || data[i] === 'O')) {
          i++ // consumir [ u O
          while (i < data.length && !/[A-Za-z~]/.test(data[i])) i++
          const letter = data[i]
          i++ // consumir letra final
          // Flechas arriba/abajo → historial del shell
          if (letter === 'A' || letter === 'B') {
            inputBufRef.current = ''
            histPendingRef.current = true
          }
          // Flechas izq/der → solo mueven el cursor, no cambian el comando
        }
        continue
      }

      // Otros caracteres de control → ignorar
      if (code < 32) {
        i++
        continue
      }

      // Carácter imprimible
      // Si había Tab o historia pendiente y el usuario sigue escribiendo,
      // cancelar el sync pendiente y agregar al buffer
      tabPendingRef.current  = false
      histPendingRef.current = false
      inputBufRef.current += ch
      i++
    }
  }, [pushCommand])

  /**
   * processTerminalData — salida del servidor SSH.
   * SOLO sincroniza inputBufRef cuando Tab o flecha de historial fueron presionados.
   * Busca la línea reescrita por el servidor (el \r seguido de prompt+comando).
   */
  const processTerminalData = useCallback((data: string) => {
    if (!tabPendingRef.current && !histPendingRef.current) return

    // Caso 1: redraw completo  →  \r + prompt + comando
    const parts = data.split('\r')
    let synced = false
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]
      if (part.startsWith('\n')) continue

      const clean = stripAnsi(part).trim()
      if (!clean) continue

      const dollarPos = clean.lastIndexOf('$ ')
      if (dollarPos === -1) continue
      if (!clean.slice(0, dollarPos).includes('@')) continue

      const afterPrompt = clean.slice(dollarPos + 2).trim()
      if (import.meta.env.DEV) console.log('[CMD] server sync (redraw):', JSON.stringify(afterPrompt))
      inputBufRef.current    = afterPrompt
      tabPendingRef.current  = false
      histPendingRef.current = false
      synced = true
    }

    if (synced) return

    // Caso 2: bash solo envía los caracteres de completado (sin redraw)
    // Ejemplo: usuario escribió "pyt", Tab → servidor envía "hon flechas.py "
    if (tabPendingRef.current) {
      const completion = stripAnsi(data)
        .replace(/[\x00-\x1f\x7f]/g, '') // quitar control chars
        .replace(/\s+$/, '')              // trim derecho pero no izquierdo
      if (completion) {
        if (import.meta.env.DEV) console.log('[CMD] tab append:', JSON.stringify(completion))
        inputBufRef.current += completion
        tabPendingRef.current = false
      }
    }
  }, [])

  const clearHistory = useCallback(() => {
    setCommandEntries([])
    inputBufRef.current    = ''
    lastCmdRef.current     = ''
    tabPendingRef.current  = false
    histPendingRef.current = false
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
