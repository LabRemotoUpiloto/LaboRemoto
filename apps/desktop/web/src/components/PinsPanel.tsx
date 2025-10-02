import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

/**
 * PinsPanel: placeholder para pines de Raspberry Pi (UI futura).
 */
const PinsPanel: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  type Line = { gpio: number; level: number | null; func: string; pull: string | null }
  const [data, setData] = useState<Line[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const res = await invoke<any>('rpi_pins_status', { id: sessionId })
      const lines: Line[] = Array.isArray(res) ? res.map((r: any) => ({
        gpio: Number(r.gpio),
        level: r.level == null ? null : Number(r.level),
        func: String(r.func || ''),
        pull: r.pull == null ? null : String(r.pull),
      })) : []
      setData(lines)
    } catch (e: any) {
      setError(e?.toString?.() ?? 'No se pudo obtener el estado de GPIO')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [sessionId])

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8,height:'100%'}}>
      <header style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <strong>Pines Raspberry Pi</strong>
        <button onClick={load} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar'}</button>
      </header>
      {error && <div style={{color:'var(--danger,#e66)'}}>{error}</div>}
      <div style={{flex:'1 1 auto',minHeight:0,overflow:'auto'}}>
        {!data ? (
          <div style={{opacity:.8}}>Cargando…</div>
        ) : data.length === 0 ? (
          <div style={{opacity:.8}}>Sin datos</div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr>
                <th style={{textAlign:'left',borderBottom:'1px solid var(--border-subtle,#3a3a3a)'}}>GPIO</th>
                <th style={{textAlign:'left',borderBottom:'1px solid var(--border-subtle,#3a3a3a)'}}>Nivel</th>
                <th style={{textAlign:'left',borderBottom:'1px solid var(--border-subtle,#3a3a3a)'}}>Función</th>
                <th style={{textAlign:'left',borderBottom:'1px solid var(--border-subtle,#3a3a3a)'}}>Pull</th>
              </tr>
            </thead>
            <tbody>
              {data.map((l,i) => (
                <tr key={i}>
                  <td>GPIO {l.gpio}</td>
                  <td>{l.level==null? '—' : l.level}</td>
                  <td>{l.func}</td>
                  <td>{l.pull ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default PinsPanel
