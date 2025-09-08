import React, { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { saveHostEncrypted, saveHostWithMaster } from '../api/storage'
import './HomeScreen.css'
import { useLoading } from '../contexts/LoadingContext'

type Props = {
  onConnected: (id: string) => void
  getTermSize?: () => { cols: number; rows: number }  // optional
  initialPayload?: any | null
}

export default function ConnectForm({ onConnected, getTermSize, initialPayload }: Props) {
  const [host, setHost] = useState('')
  const [port, setPort] = useState<number>(22)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [busyLocal, setBusyLocal] = useState(false) // keep local to disable inputs in this component
  const { setLoading } = useLoading()
  const [showSaveName, setShowSaveName] = useState(false)
  const [saveName, setSaveName] = useState('')

  useEffect(() => {
    if (initialPayload) {
      const p = initialPayload;
      if (p.host) setHost(p.host);
      if (p.port) setPort(p.port);
      if (p.user) setUser(p.user);
      if (p.password) setPassword(p.password);
      if (p.autoConnect) {
        // small timeout so inputs render first
        setTimeout(() => { connect(); }, 50);
      }
    }
  }, [initialPayload]);

  const connect = async () => {
    setBusyLocal(true)
    setLoading(true, `Conectando ${host}...`)
    try {
      const size = getTermSize ? getTermSize() : { cols: 80, rows: 24 }
      const id = await invoke<string>('ssh_connect', {
        host, port, user, password, cols: size.cols, rows: size.rows,
      })
      onConnected(id)
    } catch (e: any) {
      alert(e?.toString?.() ?? 'Error conectando')
    } finally {
      setBusyLocal(false)
      setLoading(false, null)
    }
  }

  return (
    <div className="home-screen">
      <div className="connect-box">
        <input placeholder="host" value={host} onChange={e => setHost(e.target.value)} />
        <input placeholder="puerto" type="number" value={port}
          onChange={e => setPort(parseInt(e.target.value || '22'))} />
        <input placeholder="usuario" value={user} onChange={e => setUser(e.target.value)} />
        <input placeholder="password" type="password" value={password}
          onChange={e => setPassword(e.target.value)} />
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <div style={{display:'flex',gap:8}}>
              <button onClick={connect} disabled={busyLocal}>Conectar</button>
              {!showSaveName ? (
                <button disabled={busyLocal} onClick={() => setShowSaveName(true)}>Guardar host</button>
              ) : (
                <>
                  <button disabled={busyLocal} onClick={async () => {
                    if (!host || !user) return alert('host and user required');
                    const id = `${host}:${port}:${user}`;
                    try {
                      const payload = { host, port, user, password, name: saveName || undefined }
                      await saveHostWithMaster(id, payload as any);
                      alert('Host guardado (usando master-key en keychain)');
                      setSaveName('')
                      setShowSaveName(false)
                    } catch (e: any) {
                      console.error('saveHostWithMaster error', e);
                      alert('Error guardando: ' + e?.toString?.());
                    }
                  }}>Confirmar guardar</button>
                  <button onClick={() => { setShowSaveName(false); setSaveName('') }}>Cancelar</button>
                </>
              )}
            </div>
            {showSaveName && (
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <input placeholder="Nombre (opcional)" value={saveName} onChange={e => setSaveName(e.target.value)} />
                <small style={{color:'#999'}}>Puedes dejarlo vacío</small>
              </div>
            )}
          </div>
      </div>
    </div>
  )
}
