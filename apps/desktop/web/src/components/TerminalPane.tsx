import React from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { AttachAddon } from '@xterm/addon-attach'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import 'xterm/css/xterm.css'

interface Props { sessionId: string | null }

export default function TerminalPane({ sessionId }: Props) {
  const ref = React.useRef<HTMLDivElement>(null)
  const termRef = React.useRef<Terminal | null>(null)
  const fitRef = React.useRef<FitAddon | null>(null)

  React.useEffect(() => {
    if (!ref.current) return
    const term = new Terminal({
      convertEol: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 14,
      theme: { background: '#0B1220' }
    })
    const fit = new FitAddon()
  // const attach = new AttachAddon(ws) // Solo si usas WebSocket directo
    const webLinks = new WebLinksAddon()
    term.loadAddon(fit)
    term.loadAddon(webLinks)
    // term.loadAddon(attach) // Solo si usas WebSocket directo
    term.open(ref.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    const onResize = () => { try { fit.fit() } catch {} }
    addEventListener('resize', onResize)

    return () => { removeEventListener('resize', onResize); term.dispose() }
  }, [])

  React.useEffect(() => {
    const term = termRef.current
    if (!term || !sessionId) return
    term.write(`\r\nConectado, sesión: ${sessionId}\r\n`)
    // Para resize real del PTY: invoca un comando backend (pendiente en este MVP)
    // invoke('ssh_resize', { id: sessionId, cols: term.cols, rows: term.rows })
    term.onData((data) => { invoke('ssh_stdin', { id: sessionId, data }) })

    // Escuchar eventos de salida SSH desde el backend
    let unlisten: (() => void) | null = null
    listen<string>(`ssh_out_${sessionId}`, (event) => {
      if (event.payload) {
        term.write(event.payload)
      }
    }).then((fn) => { unlisten = fn })

    return () => { if (unlisten) unlisten() }
  }, [sessionId])

  return <div style={{ height: '100%' }} ref={ref} />
}
