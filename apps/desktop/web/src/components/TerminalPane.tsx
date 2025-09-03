import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import 'xterm/css/xterm.css'

export type TerminalHandle = {
  fit: () => void
  getSize: () => { cols: number; rows: number }
}

interface Props { sessionId: string | null }

const TerminalPane = forwardRef<TerminalHandle, Props>(({ sessionId }, ref) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal>()
  const fitRef = useRef<FitAddon>()
  const unlistenRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const term = new Terminal({
      // convertEol: false (por defecto) -> mejor para readline/bash
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
      fontSize: 14,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      theme: { background: '#0B1220' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())

    term.open(hostRef.current!)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    const onWindowResize = () => {
      try {
        fit.fit()
        if (sessionId) invoke('ssh_resize', { id: sessionId, cols: term.cols, rows: term.rows })
      } catch {}
    }
    window.addEventListener('resize', onWindowResize)

    const disposeOnResize = term.onResize(({ cols, rows }) => {
      if (sessionId) invoke('ssh_resize', { id: sessionId, cols, rows }).catch(() => {})
    })

    return () => {
      if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null }
      disposeOnResize.dispose()
      window.removeEventListener('resize', onWindowResize)
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Conectar teclado/salida cuando llega la sesión
  useEffect(() => {
    const term = termRef.current
    if (!term) return

    // limpia listeners anteriores
    if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null }

    const disposers: Array<{ dispose: () => void }> = []

    if (sessionId) {
      // teclado -> backend (sin hacks de backspace)
      disposers.push(term.onData((data) => {
        invoke('ssh_stdin', { id: sessionId, data }).catch(() => {})
      }))

      // backend -> terminal
      listen<string>(`ssh_out_${sessionId}`, (event) => {
        if (event.payload) term.write(event.payload)
      }).then(un => { unlistenRef.current = un })

      // tamaño inicial correcto
      invoke('ssh_resize', { id: sessionId, cols: term.cols, rows: term.rows }).catch(() => {})
    }

    return () => {
      disposers.forEach(d => d.dispose())
      if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null }
    }
  }, [sessionId])

  useImperativeHandle(ref, () => ({
    fit: () => { try { fitRef.current?.fit() } catch {} },
    getSize: () => {
      const t = termRef.current!
      return { cols: t.cols, rows: t.rows }
    },
  }), [])

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
})

export default TerminalPane
