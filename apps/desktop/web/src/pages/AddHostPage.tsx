import React, { useState } from 'react'
import { saveHostWithMaster } from '../api/storage'

type Props = {
  onConnect?: (id: string) => void
}

export default function AddHostPage({ onConnect }: Props) {
  const [host, setHost] = useState('')
  const [port, setPort] = useState<number>(22)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!host || !user) return alert('host and user required')
    setBusy(true)
    try {
      const id = `${host}:${port}:${user}`
      await saveHostWithMaster(id, { host, port, user, password })
      alert('Host guardado')
    } catch (e: any) {
      alert('Error guardando: ' + e?.toString?.())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-content">
      <h2>Añadir Host</h2>
      <div className="form">
        <input placeholder="host" value={host} onChange={e => setHost(e.target.value)} />
        <input placeholder="puerto" type="number" value={port}
          onChange={e => setPort(parseInt(e.target.value || '22'))} />
        <input placeholder="usuario" value={user} onChange={e => setUser(e.target.value)} />
        <input placeholder="password" type="password" value={password}
          onChange={e => setPassword(e.target.value)} />
        <div style={{display:'flex',gap:8}}>
          <button onClick={save} disabled={busy}>Guardar</button>
        </div>
      </div>
    </div>
  )
}
