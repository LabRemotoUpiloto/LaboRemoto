import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './PinsPanel.css'

type Line = { gpio: number; level: number | null; func: string; pull: string | null }

type PinRole = 'power5' | 'power3' | 'ground' | 'gpio' | 'other'

type PinDefinition = {
  physical: number
  label: string
  role: PinRole
  gpio?: number
  alias?: string
}

const PIN_DEFINITIONS: PinDefinition[] = [
  { physical: 1, label: 'Poder 3v3', role: 'power3' },
  { physical: 2, label: 'Poder 5V', role: 'power5' },
  { physical: 3, label: 'GPIO 2 (SDA1)', role: 'gpio', gpio: 2, alias: 'I2C SDA' },
  { physical: 4, label: 'Poder 5V', role: 'power5' },
  { physical: 5, label: 'GPIO 3 (SCL1)', role: 'gpio', gpio: 3, alias: 'I2C SCL' },
  { physical: 6, label: 'Suelo', role: 'ground' },
  { physical: 7, label: 'GPIO 4 (GPCLK0)', role: 'gpio', gpio: 4, alias: 'CLK' },
  { physical: 8, label: 'GPIO 14 (UART TX)', role: 'gpio', gpio: 14, alias: 'UART TX' },
  { physical: 9, label: 'Suelo', role: 'ground' },
  { physical: 10, label: 'GPIO 15 (UART RX)', role: 'gpio', gpio: 15, alias: 'UART RX' },
  { physical: 11, label: 'GPIO 17', role: 'gpio', gpio: 17 },
  { physical: 12, label: 'GPIO 18 (PCM CLK)', role: 'gpio', gpio: 18, alias: 'PCM CLK' },
  { physical: 13, label: 'GPIO 27', role: 'gpio', gpio: 27 },
  { physical: 14, label: 'Suelo', role: 'ground' },
  { physical: 15, label: 'GPIO 22', role: 'gpio', gpio: 22 },
  { physical: 16, label: 'GPIO 23', role: 'gpio', gpio: 23 },
  { physical: 17, label: 'Poder 3v3', role: 'power3' },
  { physical: 18, label: 'GPIO 24', role: 'gpio', gpio: 24 },
  { physical: 19, label: 'GPIO 10 (MOSI)', role: 'gpio', gpio: 10, alias: 'SPI MOSI' },
  { physical: 20, label: 'Suelo', role: 'ground' },
  { physical: 21, label: 'GPIO 9 (MISO)', role: 'gpio', gpio: 9, alias: 'SPI MISO' },
  { physical: 22, label: 'GPIO 25', role: 'gpio', gpio: 25 },
  { physical: 23, label: 'GPIO 11 (SCLK)', role: 'gpio', gpio: 11, alias: 'SPI SCLK' },
  { physical: 24, label: 'GPIO 8 (CE0)', role: 'gpio', gpio: 8, alias: 'SPI CE0' },
  { physical: 25, label: 'Suelo', role: 'ground' },
  { physical: 26, label: 'GPIO 7 (CE1)', role: 'gpio', gpio: 7, alias: 'SPI CE1' },
  { physical: 27, label: 'GPIO 0 (ID_SD)', role: 'other', gpio: 0, alias: 'EEPROM SDA' },
  { physical: 28, label: 'GPIO 1 (ID_SC)', role: 'other', gpio: 1, alias: 'EEPROM SCL' },
  { physical: 29, label: 'GPIO 5', role: 'gpio', gpio: 5 },
  { physical: 30, label: 'Suelo', role: 'ground' },
  { physical: 31, label: 'GPIO 6', role: 'gpio', gpio: 6 },
  { physical: 32, label: 'GPIO 12 (PWM0)', role: 'gpio', gpio: 12, alias: 'PWM0' },
  { physical: 33, label: 'GPIO 13 (PWM1)', role: 'gpio', gpio: 13, alias: 'PWM1' },
  { physical: 34, label: 'Suelo', role: 'ground' },
  { physical: 35, label: 'GPIO 19 (PCM FS)', role: 'gpio', gpio: 19, alias: 'PCM FS' },
  { physical: 36, label: 'GPIO 16', role: 'gpio', gpio: 16 },
  { physical: 37, label: 'GPIO 26', role: 'gpio', gpio: 26 },
  { physical: 38, label: 'GPIO 20 (PCM DIN)', role: 'gpio', gpio: 20, alias: 'PCM DIN' },
  { physical: 39, label: 'Suelo', role: 'ground' },
  { physical: 40, label: 'GPIO 21 (PCM DOUT)', role: 'gpio', gpio: 21, alias: 'PCM DOUT' },
]

const PIN_ROWS = Array.from({ length: 20 }, (_, idx) => ({
  left: PIN_DEFINITIONS[idx * 2],
  right: PIN_DEFINITIONS[idx * 2 + 1],
}))

const COLORS = {
  power5: 'var(--danger)',
  power3: 'var(--warning)',
  ground: 'var(--pinout-ground)',
  gpioInput: 'var(--info)',
  gpioOutput: 'var(--success)',
  gpioAlt: 'var(--accent-strong, var(--accent-primary))',
  other: 'color-mix(in srgb, var(--pinout-muted) 65%, transparent)',
  idle: 'color-mix(in srgb, var(--pinout-muted) 45%, transparent)',
  high: 'var(--success)',
  low: 'color-mix(in srgb, var(--text-primary) 25%, transparent)'
}

const resolveColor = (pin: PinDefinition, line: Line | undefined) => {
  if (pin.role === 'power5') return COLORS.power5
  if (pin.role === 'power3') return COLORS.power3
  if (pin.role === 'ground') return COLORS.ground
  if (pin.role === 'other') return COLORS.other
  if (!line) return COLORS.idle

  const func = line.func.toUpperCase()
  // Color del círculo según el modo (INPUT/OUTPUT/ALT)
  if (func.includes('INPUT')) return COLORS.gpioInput
  if (func.includes('OUTPUT')) return COLORS.gpioOutput
  return COLORS.gpioAlt
}

const describeLevel = (line: Line | undefined) => {
  if (!line || line.level == null) return 'Sin nivel'
  return line.level === 1 ? 'Nivel alto' : 'Nivel bajo'
}

const describePull = (line: Line | undefined) => {
  if (!line || !line.pull) return 'Pull: no informado'
  return `Pull: ${line.pull}`
}

const formatFunction = (line: Line | undefined) => {
  if (!line) return 'Función desconocida'
  return line.func || 'Sin función'
}

const PinsPanel: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [data, setData] = useState<Line[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedPin, setSelectedPin] = useState<number | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [descriptions, setDescriptions] = useState<Record<number, string>>({})
  const [showSummary, setShowSummary] = useState(false)

  // Pines reservados por defecto (advertencias/bloqueo)
  const RESERVED: Record<string, number[]> = useMemo(() => ({
    I2C: [2, 3],
    UART: [14, 15],
    SPI: [7, 8, 9, 10, 11],
    EEPROM: [0, 1],
  }), [])

  const RESERVED_SET = useMemo(() => new Set(Object.values(RESERVED).flat()), [RESERVED])
  const isReserved = useCallback((gpio?: number | null) => gpio != null && RESERVED_SET.has(gpio), [RESERVED_SET])

  // Storage para descripciones por sesión
  const storageKey = useMemo(() => `pins:descriptions:${sessionId}`, [sessionId])
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) setDescriptions(JSON.parse(raw))
    } catch {}
  }, [storageKey])
  const persistDescriptions = useCallback((next: Record<number, string>) => {
    setDescriptions(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
  }, [storageKey])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await invoke<any>('rpi_pins_status', { id: sessionId })
      const lines: Line[] = Array.isArray(res)
        ? res.map((r: any) => ({
            gpio: Number(r.gpio),
            level: r.level == null ? null : Number(r.level),
            func: String(r.func || ''),
            pull: r.pull == null ? null : String(r.pull),
          }))
        : []
      setData(lines)
    } catch (e: any) {
      setError(e?.toString?.() ?? 'No se pudo obtener el estado de GPIO')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    load()
  }, [load])

  // Auto-actualizar cada 1s si está activado
  useEffect(() => {
    if (!autoRefresh) return
    const t = window.setInterval(() => { load() }, 1000)
    return () => { try { window.clearInterval(t) } catch {} }
  }, [autoRefresh, load])

  const gpioMap = useMemo(() => {
    const map = new Map<number, Line>()
    if (data) {
      for (const line of data) map.set(line.gpio, line)
    }
    return map
  }, [data])

  const selectedDefinition = selectedPin != null
    ? PIN_DEFINITIONS.find(p => p.physical === selectedPin) ?? null
    : null
  const selectedStatus = selectedDefinition?.gpio != null
    ? gpioMap.get(selectedDefinition.gpio)
    : undefined

  const handlePinClick = (pin: PinDefinition) => {
    setSelectedPin(pin.physical)
    setMessage(null)
  }

  const handleBack = () => {
    setSelectedPin(null)
    setMessage(null)
  }

  const setMode = async (mode: 'input' | 'output') => {
    if (!selectedDefinition || selectedDefinition.gpio == null) return
    if (isReserved(selectedDefinition.gpio)) { setMessage('⚠ Pin reservado: operación bloqueada.'); return }
    setActionLoading(true)
    setMessage(null)
    try {
      await invoke('rpi_pin_set_mode', {
        id: sessionId,
        gpio: selectedDefinition.gpio,
        mode,
      })
      await load()
      setMessage(`GPIO ${selectedDefinition.gpio} configurado como ${mode === 'input' ? 'entrada' : 'salida'}.`)
    } catch (e: any) {
      setMessage(e?.toString?.() ?? 'No se pudo cambiar el modo del pin')
    } finally {
      setActionLoading(false)
    }
  }

  const setPull = async (pull: 'up' | 'down' | 'none') => {
    if (!selectedDefinition || selectedDefinition.gpio == null) return
    if (isReserved(selectedDefinition.gpio)) { setMessage('⚠ Pin reservado: operación bloqueada.'); return }
    setActionLoading(true)
    setMessage(null)
    try {
      await invoke('rpi_pin_set_pull', { id: sessionId, gpio: selectedDefinition.gpio, pull })
      await load()
      const label = pull === 'up' ? 'Pull-Up' : pull === 'down' ? 'Pull-Down' : 'Sin pull'
      setMessage(`GPIO ${selectedDefinition.gpio}: ${label}.`)
    } catch (e: any) {
      setMessage(e?.toString?.() ?? 'No se pudo configurar el pull del pin')
    } finally {
      setActionLoading(false)
    }
  }

  const writeLevel = async (level: 0 | 1) => {
    if (!selectedDefinition || selectedDefinition.gpio == null) return
    if (isReserved(selectedDefinition.gpio)) { setMessage('⚠ Pin reservado: operación bloqueada.'); return }
    setActionLoading(true)
    setMessage(null)
    try {
      await invoke('rpi_pin_write_level', { id: sessionId, gpio: selectedDefinition.gpio, level })
      await load()
      setMessage(`GPIO ${selectedDefinition.gpio}: nivel ${level === 1 ? 'alto' : 'bajo'}.`)
    } catch (e: any) {
      setMessage(e?.toString?.() ?? 'No se pudo escribir el nivel del pin')
    } finally {
      setActionLoading(false)
    }
  }

  const readNow = async () => {
    if (!selectedDefinition || selectedDefinition.gpio == null) return
    try {
      const r: any = await invoke('rpi_pin_read', { id: sessionId, gpio: selectedDefinition.gpio })
      const updated: Line = {
        gpio: Number(r.gpio),
        level: r.level == null ? null : Number(r.level),
        func: String(r.func || ''),
        pull: r.pull == null ? null : String(r.pull),
      }
      setData(prev => {
        const list = prev ? [...prev] : []
        const idx = list.findIndex(x => x.gpio === updated.gpio)
        if (idx >= 0) list[idx] = updated; else list.push(updated)
        return list
      })
    } catch (e: any) {
      setMessage(e?.toString?.() ?? 'No se pudo leer el estado del pin')
    }
  }

  const renderNode = (pin: PinDefinition, line: Line | undefined, isSelected: boolean) => {
    const color = resolveColor(pin, line)
    const level = line?.level
    const dotColor = level == null ? 'transparent' : level === 1 ? COLORS.high : COLORS.low
    const occupied = pin.gpio != null && (isReserved(pin.gpio) || ((line?.func || '').toUpperCase().startsWith('ALT')))
    const title = pin.gpio != null
      ? `GPIO ${pin.gpio} · ${line?.func ?? '—'} · ${line?.level == null ? 'sin nivel' : (line.level === 1 ? 'HIGH' : 'LOW')}`
      : pin.label
    return (
      <button
        type="button"
        key={pin.physical}
        className={`pinout-node${isSelected ? ' selected' : ''}${pin.gpio == null ? ' static' : ''}${occupied ? ' occupied' : ''}`}
        onClick={() => handlePinClick(pin)}
        title={title}
      >
        <span className="pinout-node-number">{pin.physical}</span>
        <span className="pinout-node-circle" style={{ backgroundColor: color }}>
          <span className="pinout-node-dot" style={{ backgroundColor: dotColor }} />
          {occupied && <span className="pinout-node-badge" title="Ocupado (reservado/ALT)" />}
        </span>
        <span className="pinout-node-label">{pin.gpio != null ? `GPIO ${pin.gpio}` : pin.label}</span>
        {pin.alias && <span className="pinout-node-alias">{pin.alias}</span>}
        {pin.gpio != null && line && (
          <span className="pinout-node-status">
            {line.func}
            {line.level == null ? '' : line.level === 1 ? ' • Nivel alto' : ' • Nivel bajo'}
          </span>
        )}
      </button>
    )
  }

  const renderGrid = () => (
    <div className="pinout-grid">
      {PIN_ROWS.map(row => {
        const leftLine = row.left.gpio != null ? gpioMap.get(row.left.gpio) : undefined
        const rightLine = row.right.gpio != null ? gpioMap.get(row.right.gpio) : undefined
        return (
          <div className="pinout-row" key={row.left.physical}>
            {renderNode(row.left, leftLine, selectedPin === row.left.physical)}
            {renderNode(row.right, rightLine, selectedPin === row.right.physical)}
          </div>
        )
      })}
    </div>
  )

  const renderDetail = () => {
    if (!selectedDefinition) return null
    const reserved = isReserved(selectedDefinition.gpio)
    const desc = selectedDefinition.gpio != null ? (descriptions[selectedDefinition.gpio] || '') : ''
    const setDesc = (value: string) => {
      if (selectedDefinition.gpio == null) return
      const next = { ...descriptions, [selectedDefinition.gpio]: value }
      persistDescriptions(next)
    }
    return (
      <div className="pinout-detail-view">
        <button type="button" className="pinout-back" onClick={handleBack}>
          ← Ver todos los pines
        </button>

        <h3 className="pinout-detail-title">Pin físico {selectedDefinition.physical}</h3>

        <div className="pinout-detail-block">
          <span className="pinout-detail-label">Propósito (editable)</span>
          <div className="pinout-desc-row">
            <input
              className="pinout-desc-input"
              type="text"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Ej: Sensor de puerta, Relé 1"
            />
          </div>
        </div>

        {reserved && (
          <div className="pinout-warning">
            ⚠ Este pin está asociado a un periférico del sistema.
            {selectedDefinition.gpio === 2 || selectedDefinition.gpio === 3 ? ' (I2C SDA/SCL)' : ''}
            {selectedDefinition.gpio === 14 || selectedDefinition.gpio === 15 ? ' (UART TX/RX)' : ''}
            {([7, 8, 9, 10, 11] as number[]).includes(selectedDefinition.gpio as number) ? ' (SPI)' : ''}
            Cambiarlo puede afectar sensores o la consola serie.
          </div>
        )}

        {selectedDefinition.alias && (
          <div className="pinout-detail-block">
            <span className="pinout-detail-label">Alias</span>
            <span>{selectedDefinition.alias}</span>
          </div>
        )}

        {selectedDefinition.gpio != null ? (
          <>
            <div className="pinout-detail-block">
              <span className="pinout-detail-label">GPIO</span>
              <span>GPIO {selectedDefinition.gpio}</span>
            </div>

            <div className="pinout-detail-block">
              <span className="pinout-detail-label">Función actual</span>
              <span>{formatFunction(selectedStatus)}</span>
            </div>
            <div className="pinout-detail-block">
              <span className="pinout-detail-label">Nivel</span>
              <span>{describeLevel(selectedStatus)}</span>
            </div>
            <div className="pinout-detail-block">
              <span className="pinout-detail-label">Pull</span>
              <span>{describePull(selectedStatus)}</span>
            </div>

            <div className="pinout-actions">
              <button
                type="button"
                className="pinout-action"
                onClick={() => setMode('input')}
                disabled={actionLoading || !!selectedStatus?.func?.toUpperCase().includes('INPUT') || reserved}
              >
                Configurar como entrada
              </button>
              <button
                type="button"
                className="pinout-action"
                onClick={() => setMode('output')}
                disabled={actionLoading || !!selectedStatus?.func?.toUpperCase().includes('OUTPUT') || reserved}
              >
                Configurar como salida
              </button>

              <button
                type="button"
                className="pinout-action"
                onClick={() => setPull('up')}
                disabled={actionLoading || !selectedStatus?.func?.toUpperCase().includes('INPUT') || reserved}
              >
                Pull-Up (INPUT)
              </button>
              <button
                type="button"
                className="pinout-action"
                onClick={() => setPull('down')}
                disabled={actionLoading || !selectedStatus?.func?.toUpperCase().includes('INPUT') || reserved}
              >
                Pull-Down (INPUT)
              </button>
              <button
                type="button"
                className="pinout-action"
                onClick={() => setPull('none')}
                disabled={actionLoading || !selectedStatus?.func?.toUpperCase().includes('INPUT') || reserved}
              >
                Sin pull (INPUT)
              </button>
              <button
                type="button"
                className="pinout-action"
                onClick={() => writeLevel(1)}
                disabled={actionLoading || !selectedStatus?.func?.toUpperCase().includes('OUTPUT') || reserved}
              >
                Escribir HIGH (1)
              </button>
              <button
                type="button"
                className="pinout-action"
                onClick={() => writeLevel(0)}
                disabled={actionLoading || !selectedStatus?.func?.toUpperCase().includes('OUTPUT') || reserved}
              >
                Escribir LOW (0)
              </button>
              <button
                type="button"
                className="pinout-action"
                onClick={readNow}
                disabled={actionLoading}
              >
                Leer ahora
              </button>
            </div>
          </>
        ) : (
          <div className="pinout-detail-block">
            <span className="pinout-detail-label">Información</span>
            <span>Este pin no admite cambio de modo.</span>
          </div>
        )}
      </div>
    )
  }

  const isDetail = selectedDefinition != null

  return (
    <div className="pinout-wrapper">
      <header className="pinout-header">
        <div>
          <h2 className="pinout-title">Pinout Raspberry Pi</h2>
          <span className="pinout-subtitle">Estado actual según raspi-gpio</span>
        </div>
        <button
          type="button"
          className="pinout-refresh"
          onClick={load}
          disabled={loading || actionLoading}
        >
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </header>

      {error && <div className="pinout-error">{error}</div>}
      {isDetail && message && !error && <div className="pinout-message">{message}</div>}

      <div className="pinout-toolbar">
        <label className="pinout-checkbox"><input type="checkbox" checked={showSummary} onChange={e => setShowSummary(e.target.checked)} /> Mostrar resumen</label>
      </div>

      <div className="pinout-content">
        {isDetail ? renderDetail() : (
          <>
            {renderGrid()}
            {showSummary && (
              <div className="pinout-summary">
                <table className="pinout-table">
                  <thead>
                    <tr>
                      <th>Físico</th>
                      <th>GPIO</th>
                      <th>Modo</th>
                      <th>Pull</th>
                      <th>Estado</th>
                      <th>Propósito</th>
                      <th>Ocupado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PIN_DEFINITIONS.filter(p => p.gpio != null).map(p => {
                      const line = gpioMap.get(p.gpio!)
                      const func = (line?.func || '').toUpperCase()
                      const modo = func.includes('INPUT') ? 'INPUT' : func.includes('OUTPUT') ? 'OUTPUT' : func || '—'
                      const estado = line?.level == null ? '—' : (line.level === 1 ? 'HIGH' : 'LOW')
                      const pull = line?.pull || (modo === 'OUTPUT' ? '—' : 'NONE')
                      const desc = descriptions[p.gpio!] || ''
                      const ocupado = isReserved(p.gpio) || func.startsWith('ALT')
                      return (
                        <tr key={p.gpio} onClick={() => handlePinClick(p)} className="pinout-row-clickable">
                          <td>{p.physical}</td>
                          <td>{p.gpio}</td>
                          <td>{modo}</td>
                          <td>{pull}</td>
                          <td>{estado}</td>
                          <td title={desc}>{desc || '—'}</td>
                          <td>{ocupado ? 'Ocupado' : 'Libre'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <footer className="pinout-legend">
        <div className="pinout-legend-item">
          <span className="pinout-legend-color" style={{ backgroundColor: COLORS.gpioInput }} /> Entrada
        </div>
        <div className="pinout-legend-item">
          <span className="pinout-legend-color" style={{ backgroundColor: COLORS.gpioOutput }} /> Salida
        </div>
        <div className="pinout-legend-item">
          <span className="pinout-legend-color" style={{ backgroundColor: COLORS.gpioAlt }} /> Función alternativa
        </div>
        <div className="pinout-legend-item">
          <span className="pinout-legend-color" style={{ backgroundColor: COLORS.high }} /> HIGH (1)
        </div>
        <div className="pinout-legend-item">
          <span className="pinout-legend-color" style={{ backgroundColor: COLORS.low }} /> LOW (0)
        </div>
        <div className="pinout-legend-item">
          <span className="pinout-legend-color" style={{ backgroundColor: COLORS.power5 }} /> Alimentación 5V
        </div>
        <div className="pinout-legend-item">
          <span className="pinout-legend-color" style={{ backgroundColor: COLORS.power3 }} /> Alimentación 3.3V
        </div>
        <div className="pinout-legend-item">
          <span className="pinout-legend-color" style={{ backgroundColor: COLORS.ground }} /> Suelo
        </div>
        <div className="pinout-legend-item">
          <span className="pinout-legend-badge" /> Ocupado (reservado/ALT)
        </div>
      </footer>
    </div>
  )
}

export default PinsPanel
