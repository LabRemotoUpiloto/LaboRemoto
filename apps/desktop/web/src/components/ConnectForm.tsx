import React, { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './HomeScreen.css'

type Props = {
  onConnected: (id: string) => void
  getTermSize?: () => { cols: number; rows: number }  // optional
}

export default function ConnectForm({ onConnected, getTermSize }: Props) {
  const [host, setHost] = useState('')
  const [port, setPort] = useState<number>(22)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const connect = async () => {
    setBusy(true)
    try {
      const size = getTermSize ? getTermSize() : { cols: 80, rows: 24 }
      const id = await invoke<string>('ssh_connect', {
        host, port, user, password, cols: size.cols, rows: size.rows,
      })
      onConnected(id)
    } catch (e: any) {
      alert(e?.toString?.() ?? 'Error conectando')
    } finally {
      setBusy(false)
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
        <button onClick={connect} disabled={busy}>Conectar</button>
      </div>
    </div>
  )
}
