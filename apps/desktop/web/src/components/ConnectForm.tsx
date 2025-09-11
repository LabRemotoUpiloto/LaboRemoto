import React, { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { saveHostEncrypted, saveHostWithMaster } from '../api/storage'
import './HomeScreen.css'
import { useLoading } from '../contexts/LoadingContext'
import { useToasts } from '../contexts/ToastContext'

type Props = {
  onConnected: (id: string) => void
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
      onConnected(id)
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

  return (
    <div className="home-screen">
      <div className="connect-box" onKeyDown={onKeyDown}>
        <div className="form-grid">
          <div className="field host">
            <label>Host</label>
            <input placeholder="ej. 192.168.1.10" value={host} onChange={e => setHost(e.target.value)} />
          </div>
          <div className="field port">
            <label>Puerto</label>
            {/* Input de texto con teclado numérico; sin spinners; permite vaciar */}
            <input
              placeholder="22"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={port}
              onChange={e => setPort(e.target.value)}
              onWheel={(e) => { try { (e.target as HTMLInputElement).blur() } catch {} }}
              autoComplete="off"
            />
          </div>
          <div className="field user">
            <label>Usuario</label>
            <input placeholder="usuario" value={user} onChange={e => setUser(e.target.value)} />
          </div>
          <div className="field pass">
            <label>Password</label>
            <input placeholder="password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
        </div>
        <div className="actions-row">
          <button title={isValid ? '' : 'Completa host, usuario y password'} onClick={connect} disabled={busyLocal || !isValid}>
            {busyLocal ? <span className="spinner" style={{ width:18, height:18, borderWidth:3, marginRight:8 }} /> : null}
            Conectar
          </button>
          {!showSaveName ? (
            <button className="ghost" disabled={busyLocal} onClick={() => setShowSaveName(true)}>Guardar host</button>
          ) : (
            <>
              <button disabled={busyLocal} onClick={doSaveHost}>Confirmar guardar</button>
              <button className="ghost" onClick={() => { setShowSaveName(false); setSaveName('') }}>Cancelar</button>
            </>
          )}
        </div>
        {showSaveName && (
          <div className="save-row">
            <label>Nombre (opcional)</label>
            <div className="save-inline">
              <input placeholder="Mi servidor" value={saveName} onChange={e => setSaveName(e.target.value)} />
              <small className="muted">Ctrl/⌘+S para guardar rápidamente</small>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
