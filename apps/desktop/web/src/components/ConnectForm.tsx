import React from 'react'
import { invoke, Channel } from '@tauri-apps/api/core'

interface Props { onConnected: (id: string) => void }

export default function ConnectForm({ onConnected }: Props) {
  const [host, setHost] = React.useState('127.0.0.1')
  const [port, setPort] = React.useState(22)
  const [user, setUser] = React.useState('root')
  const [password, setPassword] = React.useState('')
  const [connecting, setConnecting] = React.useState(false)
  const [log, setLog] = React.useState<string[]>([])

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    setConnecting(true)

    const stdout = new Channel<string>((data) => {
      setLog((prev) => [...prev.slice(-200), data])
    })

    try {
      const id = await invoke<string>('ssh_connect', {
        host, port, user, password, cols: 120, rows: 32, stdout
      })
      onConnected(id)
    } catch (e: any) {
      setLog((prev) => [...prev, `ERROR: ${e}`])
    } finally {
      setConnecting(false)
    }
  }

  return (
    <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input style={{ background: '#222C3A', borderRadius: 4, padding: '4px 8px', color: '#e5e7eb', border: 'none' }} placeholder="Host" value={host} onChange={e=>setHost(e.target.value)} />
        <input style={{ background: '#222C3A', borderRadius: 4, padding: '4px 8px', color: '#e5e7eb', border: 'none' }} placeholder="Port" type="number" value={port} onChange={e=>setPort(Number(e.target.value))} />
        <input style={{ background: '#222C3A', borderRadius: 4, padding: '4px 8px', color: '#e5e7eb', border: 'none' }} placeholder="Usuario" value={user} onChange={e=>setUser(e.target.value)} />
        <input style={{ background: '#222C3A', borderRadius: 4, padding: '4px 8px', color: '#e5e7eb', border: 'none' }} placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
      </div>
      <button disabled={connecting} style={{ background: '#059669', borderRadius: 4, padding: '4px 12px', color: '#fff', opacity: connecting ? 0.5 : 1, border: 'none', marginTop: 8 }}>
        {connecting ? 'Conectando…' : 'Conectar'}
      </button>
      <pre style={{ fontSize: 12, opacity: 0.7, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 160, overflow: 'auto', marginTop: 8 }}>{log.join('\n')}</pre>
    </form>
  )
}
