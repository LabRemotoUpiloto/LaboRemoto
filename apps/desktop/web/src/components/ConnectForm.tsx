import React, { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { saveHostWithMaster } from '../api/storage'
import './HomeScreen.css'
import { useLoading } from '../contexts/LoadingContext'
import { useToasts } from '../contexts/ToastContext'
import { QuickHost } from './QuickHostsPanel'

type Props = {
  onConnected: (info: { id: string; label?: string }) => void
  getTermSize?: () => { cols: number; rows: number }  // optional
  initialPayload?: any | null
  quickHost?: QuickHost | null
  onQuickHostCleared?: () => void
}

export default function ConnectForm({ onConnected, getTermSize, initialPayload, quickHost, onQuickHostCleared }: Props) {
  const [host, setHost] = useState('')
  // Port como string para permitir borrar completamente y evitar spinners
  const [port, setPort] = useState<string>('22')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [busyLocal, setBusyLocal] = useState(false) // keep local to disable inputs in this component
  const { setLoading } = useLoading()
  const [showSaveName, setShowSaveName] = useState(false)
  const [saveName, setSaveName] = useState('')
  const { push } = useToasts()

  useEffect(() => {
    if (!quickHost) return
    setHost(quickHost.host)
    setPort(String(quickHost.port))
    setUser('')
    setPassword('')
  }, [quickHost])

  useEffect(() => {
    if (initialPayload) {
      const p = initialPayload;
      if (p.host) setHost(p.host);
  if (p.port) setPort(String(p.port));
      if (p.user) setUser(p.user);
      if (p.password) setPassword(p.password);
      if (p.autoConnect) {
        // small timeout so inputs render first
        setTimeout(() => { connect(); }, 50);
      }
    }
  }, [initialPayload]);

  const isValid = host.trim() && user.trim() && password.trim()

  const connect = async () => {
    setBusyLocal(true)
    setLoading(true, `Conectando ${host}...`)
    try {
      // Parsear puerto (por defecto 22 si vacío o inválido)
      const parsedPort = parseInt((port || '22').trim(), 10)
      const safePort = (parsedPort > 0 && parsedPort <= 65535) ? parsedPort : 22
      const size = getTermSize ? getTermSize() : { cols: 80, rows: 24 }
  const id = await invoke<string>('ssh_connect', {
        host, port: safePort, user, password, cols: size.cols, rows: size.rows,
      })
  const label = (user ? `${user}@` : '') + host
  onConnected({ id, label })
    } catch (e: any) {
      alert(e?.toString?.() ?? 'Error conectando')
    } finally {
      setBusyLocal(false)
      setLoading(false, null)
    }
  }

  const doSaveHost = useCallback(async () => {
    if (!host || !user) { push({ type: 'error', message: 'Host y usuario requeridos' }); return }
    const parsedPort = parseInt((port || '22').trim(), 10)
    const safePort = (parsedPort > 0 && parsedPort <= 65535) ? parsedPort : 22
    const id = `${host}:${safePort}:${user}`
    try {
      const payload = { host, port: safePort, user, password, name: saveName || undefined }
      await saveHostWithMaster(id, payload as any)
      push({ type: 'success', message: 'Host guardado' })
      setSaveName('')
      setShowSaveName(false)
    } catch (e: any) {
      console.error('saveHostWithMaster error', e)
      push({ type: 'error', message: 'Error guardando host' })
    }
  }, [host, port, user, password, saveName, push])

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Enter: conectar si válido; Ctrl/Cmd+S: guardar
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (isValid && !busyLocal) connect()
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault()
      if (!showSaveName) setShowSaveName(true)
      else doSaveHost()
    }
  }

  const selectedQuickHostId = quickHost?.id ?? null

  const clearQuickHostIfNeeded = useCallback(() => {
    if (selectedQuickHostId) onQuickHostCleared?.()
  }, [selectedQuickHostId, onQuickHostCleared])

  return (
    <div className="home-screen connect-layout">
      <div className="connect-box" onKeyDown={onKeyDown}>
        <header className="connect-box-head">
          <h1>Conectar</h1>
          {selectedQuickHostId && (
            <span className="active-host-indicator">
              {quickHost?.name ?? quickHost?.host ?? selectedQuickHostId}
            </span>
          )}
        </header>
          <div className="form-grid compact full-rows">
          {/* Host + Port Row */}
          <div className="field floating host">
            <input id="field-host" placeholder=" " value={host} onChange={e => { clearQuickHostIfNeeded(); setHost(e.target.value) }} />
            <label htmlFor="field-host">Host</label>
          </div>
          <div className="field floating port">
            <input id="field-port" placeholder=" " type="text" inputMode="numeric" pattern="[0-9]*" value={port} onChange={e => { clearQuickHostIfNeeded(); setPort(e.target.value) }} onWheel={(e) => { try { (e.target as HTMLInputElement).blur() } catch {} }} autoComplete="off" />
            <label htmlFor="field-port">Puerto</label>
          </div>
          {/* User + Password Row */}
          <div className="field floating user full">
            <input id="field-user" placeholder=" " value={user} onChange={e => { clearQuickHostIfNeeded(); setUser(e.target.value) }} />
            <label htmlFor="field-user">Usuario</label>
          </div>
          <div className="field floating pass full">
            <input id="field-pass" placeholder=" " type="password" value={password} onChange={e => { clearQuickHostIfNeeded(); setPassword(e.target.value) }} />
            <label htmlFor="field-pass">Password</label>
          </div>
          </div>
        <div className="actions-row align-right primary-first">
          <button className="primary" title={isValid ? '' : 'Completa host, usuario y password'} onClick={connect} disabled={busyLocal || !isValid}>
            {busyLocal ? <span className="spinner" style={{ width:18, height:18, borderWidth:3, marginRight:8 }} /> : null}
            Conectar
          </button>
          {!showSaveName ? (
            <button className="ghost minor" disabled={busyLocal} onClick={() => setShowSaveName(true)}>Guardar host</button>
          ) : (
            <div className="inline-save-buttons">
              <button disabled={busyLocal} onClick={doSaveHost}>Confirmar</button>
              <button className="ghost" onClick={() => { setShowSaveName(false); setSaveName('') }}>Cancelar</button>
            </div>
          )}
        </div>
        {showSaveName && (
          <div className="save-row floating-inline">
            <div className="field floating inline-name">
              <input id="field-saveName" placeholder=" " value={saveName} onChange={e => setSaveName(e.target.value)} />
              <label htmlFor="field-saveName">Nombre (opcional)</label>
            </div>
            <small className="muted">Ctrl/⌘+S para guardar</small>
          </div>
        )}
      </div>
    </div>
  )
}
