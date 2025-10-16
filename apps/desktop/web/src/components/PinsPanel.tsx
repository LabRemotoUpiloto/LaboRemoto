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
}

const resolveColor = (pin: PinDefinition, line: Line | undefined) => {
  if (pin.role === 'power5') return COLORS.power5
  if (pin.role === 'power3') return COLORS.power3
  if (pin.role === 'ground') return COLORS.ground
  if (pin.role === 'other') return COLORS.other
  if (!line) return COLORS.idle

  const func = line.func.toUpperCase()
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

  const renderNode = (pin: PinDefinition, line: Line | undefined, isSelected: boolean) => {
    const color = resolveColor(pin, line)
    return (
      <button
        type="button"
        key={pin.physical}
        className={`pinout-node${isSelected ? ' selected' : ''}${pin.gpio == null ? ' static' : ''}`}
        onClick={() => handlePinClick(pin)}
      >
        <span className="pinout-node-number">{pin.physical}</span>
        <span className="pinout-node-circle" style={{ backgroundColor: color }}>
          <span className="pinout-node-dot" />
        </span>
        <span className="pinout-node-label">{pin.gpio != null ? `GPIO ${pin.gpio}` : pin.label}</span>
        {pin.alias && <span className="pinout-node-alias">{pin.alias}</span>}
        {pin.gpio != null && line && (
          <span className="pinout-node-meta">
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
    return (
      <div className="pinout-detail-view">
        <button type="button" className="pinout-back" onClick={handleBack}>
          ← Ver todos los pines
        </button>

        <h3 className="pinout-detail-title">Pin físico {selectedDefinition.physical}</h3>
        <div className="pinout-detail-block">
          <span className="pinout-detail-label">Descripción</span>
          <span>{selectedDefinition.label}</span>
        </div>
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
                disabled={
                  actionLoading ||
                  !!selectedStatus?.func?.toUpperCase().includes('INPUT')
                }
              >
                Configurar como entrada
              </button>
              <button
                type="button"
                className="pinout-action"
                onClick={() => setMode('output')}
                disabled={
                  actionLoading ||
                  !!selectedStatus?.func?.toUpperCase().includes('OUTPUT')
                }
              >
                Configurar como salida
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

      <div className="pinout-content">
        {isDetail ? renderDetail() : renderGrid()}
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
          <span className="pinout-legend-color" style={{ backgroundColor: COLORS.power5 }} /> Alimentación 5V
        </div>
        <div className="pinout-legend-item">
          <span className="pinout-legend-color" style={{ backgroundColor: COLORS.power3 }} /> Alimentación 3.3V
        </div>
        <div className="pinout-legend-item">
          <span className="pinout-legend-color" style={{ backgroundColor: COLORS.ground }} /> Suelo
        </div>
      </footer>
    </div>
  )
}

export default PinsPanel
