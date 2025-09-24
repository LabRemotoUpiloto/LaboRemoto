import React, { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { saveHostEncrypted, saveHostWithMaster } from '../api/storage'
import './HomeScreen.css'
import { useLoading } from '../contexts/LoadingContext'
import { useToasts } from '../contexts/ToastContext'

type Props = {
  onConnected: (info: { id: string; label?: string }) => void
  getTermSize?: () => { cols: number; rows: number }  // optional
  initialPayload?: any | null
}

export default function ConnectForm({ onConnected, getTermSize, initialPayload }: Props) {
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

  const selectDefaultHost = (h: { host: string; port: number }) => {
    setHost(h.host)
    setPort(String(h.port))
  }

  const defaultHosts = [
    { id: 'pi4', name: 'pi4', host: '200.115.181.211', port: 9000 }
  ]

  const [selectedHostId, setSelectedHostId] = useState<string | null>(null)

  return (
    <div className="home-screen connect-layout">
      <div className="connect-box" onKeyDown={onKeyDown}>
        <header className="connect-box-head">
          <h1>Conectar</h1>
          {selectedHostId && <span className="active-host-indicator">{selectedHostId}</span>}
        </header>
          <div className="form-grid compact full-rows">
          {/* Host + Port Row */}
          <div className="field floating host">
            <input id="field-host" placeholder=" " value={host} onChange={e => { if (selectedHostId) setSelectedHostId(null); setHost(e.target.value) }} />
            <label htmlFor="field-host">Host</label>
          </div>
          <div className="field floating port">
            <input id="field-port" placeholder=" " type="text" inputMode="numeric" pattern="[0-9]*" value={port} onChange={e => { if (selectedHostId) setSelectedHostId(null); setPort(e.target.value) }} onWheel={(e) => { try { (e.target as HTMLInputElement).blur() } catch {} }} autoComplete="off" />
            <label htmlFor="field-port">Puerto</label>
          </div>
          {/* User + Password Row */}
          <div className="field floating user full">
            <input id="field-user" placeholder=" " value={user} onChange={e => { if (selectedHostId) setSelectedHostId(null); setUser(e.target.value) }} />
            <label htmlFor="field-user">Usuario</label>
          </div>
          <div className="field floating pass full">
            <input id="field-pass" placeholder=" " type="password" value={password} onChange={e => { if (selectedHostId) setSelectedHostId(null); setPassword(e.target.value) }} />
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
      <aside className="quick-host-panel" aria-label="Hosts rápidos">
        <h2>Hosts rápidos</h2>
        <div className="quick-hosts-scroller">
          {defaultHosts.map(h => (
            <button
              key={h.id}
              type="button"
              className={`quick-host-pill ${selectedHostId===h.id ? 'selected':''}`}
              onClick={() => { selectDefaultHost(h); setSelectedHostId(h.id) }}
              aria-pressed={selectedHostId===h.id}
              title={`Rellenar host ${h.name}`}
            >
              <span className="qh-name">{h.name}</span>
              <span className="qh-addr">{h.host}:{h.port}</span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  )
}
