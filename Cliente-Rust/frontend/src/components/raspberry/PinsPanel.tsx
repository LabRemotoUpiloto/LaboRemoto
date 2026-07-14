import React, { useCallback, useEffect, useMemo, useState } from 'react'
import * as gpioService from '../../services/hardware/gpio.service'
import { GpioLine } from '../../services/hardware/gpio.service'

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
  ground: 'color-mix(in srgb, var(--text-primary) 12%, transparent)',
  gpioInput: 'var(--info)',
  gpioOutput: 'var(--success)',
  gpioAlt: 'var(--accent-strong, var(--accent-primary))',
  other: 'color-mix(in srgb, var(--text-secondary) 65%, transparent)',
  idle: 'color-mix(in srgb, var(--text-secondary) 45%, transparent)',
  high: 'var(--success)',
  low: 'color-mix(in srgb, var(--text-primary) 25%, transparent)'
}

const resolveColor = (pin: PinDefinition, line: GpioLine | undefined) => {
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

const describeLevel = (line: GpioLine | undefined) => {
  if (!line || line.level == null) return 'Sin nivel'
  return line.level === 1 ? 'Nivel alto' : 'Nivel bajo'
}

const describePull = (line: GpioLine | undefined) => {
  if (!line || !line.pull) return 'Pull: no informado'
  return `Pull: ${line.pull}`
}

const formatFunction = (line: GpioLine | undefined) => {
  if (!line) return 'Función desconocida'
  return line.func || 'Sin función'
}

const PinsPanel: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [data, setData] = useState<GpioLine[] | null>(null)
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
      const res = await gpioService.getPinsStatus(sessionId)
      setData(res)
    } catch (e: any) {
      setError(e?.message ?? String(e))
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
    const map = new Map<number, GpioLine>()
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
      await gpioService.setPinMode(sessionId, selectedDefinition.gpio, mode)
      await load()
      setMessage(`GPIO ${selectedDefinition.gpio} configurado como ${mode === 'input' ? 'entrada' : 'salida'}.`)
    } catch (e: any) {
      setMessage(e?.message ?? String(e))
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
      await gpioService.setPinPull(sessionId, selectedDefinition.gpio, pull)
      await load()
      const label = pull === 'up' ? 'Pull-Up' : pull === 'down' ? 'Pull-Down' : 'Sin pull'
      setMessage(`GPIO ${selectedDefinition.gpio}: ${label}.`)
    } catch (e: any) {
      setMessage(e?.message ?? String(e))
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
      await gpioService.writePinLevel(sessionId, selectedDefinition.gpio, level)
      await load()
      setMessage(`GPIO ${selectedDefinition.gpio}: nivel ${level === 1 ? 'alto' : 'bajo'}.`)
    } catch (e: any) {
      setMessage(e?.message ?? String(e))
    } finally {
      setActionLoading(false)
    }
  }

  const readNow = async () => {
    if (!selectedDefinition || selectedDefinition.gpio == null) return
    try {
      const updated = await gpioService.readPin(sessionId, selectedDefinition.gpio)
      setData(prev => {
        const list = prev ? [...prev] : []
        const idx = list.findIndex(x => x.gpio === updated.gpio)
        if (idx >= 0) list[idx] = updated; else list.push(updated)
        return list
      })
    } catch (e: any) {
      setMessage(e?.message ?? String(e))
    }
  }

  const renderNode = (pin: PinDefinition, line: GpioLine | undefined, isSelected: boolean) => {
    const color = resolveColor(pin, line)
    const level = line?.level
    const dotColor = level == null ? 'transparent' : level === 1 ? COLORS.high : COLORS.low
    const occupied = pin.gpio != null && (isReserved(pin.gpio) || ((line?.func || '').toUpperCase().startsWith('ALT')))
    const title = pin.gpio != null
      ? `GPIO ${pin.gpio} · ${line?.func ?? '—'} · ${line?.level == null ? 'sin nivel' : (line.level === 1 ? 'HIGH' : 'LOW')}`
      : pin.label
      
    // Clases dinámicas Tailwind
    const baseClass = "flex flex-col items-center gap-1.5 border-none bg-transparent text-inherit cursor-pointer rounded-xl p-1.5 transition-all duration-150 ease-in-out relative hover:bg-[var(--interactive-hover,rgba(255,255,255,0.06))] hover:-translate-y-[1px]"
    const selectedClass = isSelected ? " shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent-primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_14%,transparent)]" : ""
    const staticClass = pin.gpio == null ? " opacity-85" : ""
    const occupiedClass = occupied ? " shadow-[0_0_0_2px_color-mix(in_srgb,var(--warning)_50%,transparent)]" : ""
    
    return (
      <button
        type="button"
        key={pin.physical}
        className={`${baseClass}${selectedClass}${staticClass}${occupiedClass} group`}
        onClick={() => handlePinClick(pin)}
        title={title}
      >
        <span className="text-[11px] font-semibold text-secondary">{pin.physical}</span>
        <span className="w-[26px] h-[26px] rounded-full flex items-center justify-center shadow-[inset_0_0_0_1px_rgba(0,0,0,0.45)] relative" style={{ backgroundColor: color }}>
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--panel,#fff)] shadow-[0_0_0_1px_rgba(0,0,0,0.2)] relative z-[2]" style={{ backgroundColor: dotColor }} />
          {occupied && <span className="absolute top-1.5 right-2.5 w-2 h-2 rounded-full bg-warning shadow-[0_0_0_1px_rgba(0,0,0,0.3)] z-[3]" title="Ocupado (reservado/ALT)" />}
          {occupied && <span className="absolute inset-0 rounded-full bg-black opacity-25 z-[1]" />}
        </span>
        <span className={`text-[10px] font-semibold text-center ${occupied ? 'opacity-80' : ''}`}>{pin.gpio != null ? `GPIO ${pin.gpio}` : pin.label}</span>
        {pin.alias && <span className={`text-[9px] text-secondary uppercase tracking-[0.04em] ${occupied ? 'opacity-80' : ''}`}>{pin.alias}</span>}
        {pin.gpio != null && line && (
          <span className="text-[9px] text-secondary text-center leading-[1.3]">
            {line.func}
            {line.level == null ? '' : line.level === 1 ? ' • Nivel alto' : ' • Nivel bajo'}
          </span>
        )}
      </button>
    )
  }

  const renderGrid = () => (
    <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto py-3 px-3.5 bg-tertiary rounded-xl border border-color shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border-subtle)_40%,transparent)] max-w-[320px] w-full mx-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_srgb,var(--text-secondary)_40%,transparent)] [&::-webkit-scrollbar-thumb]:rounded-full">
      {PIN_ROWS.map(row => {
        const leftLine = row.left.gpio != null ? gpioMap.get(row.left.gpio) : undefined
        const rightLine = row.right.gpio != null ? gpioMap.get(row.right.gpio) : undefined
        return (
          <div className="grid grid-cols-2 gap-3" key={row.left.physical}>
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
      <div className="flex-1 flex flex-col gap-3.5 p-[18px] bg-tertiary rounded-xl border border-color shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border-subtle)_40%,transparent)] overflow-y-auto w-full">
        <button type="button" className="self-start border-none bg-transparent text-accent text-xs font-semibold cursor-pointer inline-flex items-center gap-1 hover:text-[var(--accent-primary-hover)]" onClick={handleBack}>
          ← Ver todos los pines
        </button>

        <h3 className="m-0 text-base font-bold text-primary">Pin físico {selectedDefinition.physical}</h3>

        <div className="flex flex-col gap-1 text-[13px]">
          <span className="text-[11px] text-secondary uppercase tracking-[0.05em]">Propósito (editable)</span>
          <div className="flex gap-2">
            <input
              className="w-full py-2 px-2.5 rounded-lg border border-color bg-[var(--background-secondary)] text-primary text-xs"
              type="text"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Ej: Sensor de puerta, Relé 1"
            />
          </div>
        </div>

        {reserved && (
          <div className="rounded-[10px] py-2 px-3 text-xs text-warning bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] border border-[color-mix(in_srgb,var(--warning)_22%,transparent)]">
            ⚠ Este pin está asociado a un periférico del sistema.
            {selectedDefinition.gpio === 2 || selectedDefinition.gpio === 3 ? ' (I2C SDA/SCL)' : ''}
            {selectedDefinition.gpio === 14 || selectedDefinition.gpio === 15 ? ' (UART TX/RX)' : ''}
            {([7, 8, 9, 10, 11] as number[]).includes(selectedDefinition.gpio as number) ? ' (SPI)' : ''}
            Cambiarlo puede afectar sensores o la consola serie.
          </div>
        )}

        {selectedDefinition.alias && (
          <div className="flex flex-col gap-1 text-[13px]">
            <span className="text-[11px] text-secondary uppercase tracking-[0.05em]">Alias</span>
            <span>{selectedDefinition.alias}</span>
          </div>
        )}

        {selectedDefinition.gpio != null ? (
          <>
            <div className="flex flex-col gap-1 text-[13px]">
              <span className="text-[11px] text-secondary uppercase tracking-[0.05em]">GPIO</span>
              <span>GPIO {selectedDefinition.gpio}</span>
            </div>

            <div className="flex flex-col gap-1 text-[13px]">
              <span className="text-[11px] text-secondary uppercase tracking-[0.05em]">Función actual</span>
              <span>{formatFunction(selectedStatus)}</span>
            </div>
            <div className="flex flex-col gap-1 text-[13px]">
              <span className="text-[11px] text-secondary uppercase tracking-[0.05em]">Nivel</span>
              <span>{describeLevel(selectedStatus)}</span>
            </div>
            <div className="flex flex-col gap-1 text-[13px]">
              <span className="text-[11px] text-secondary uppercase tracking-[0.05em]">Pull</span>
              <span>{describePull(selectedStatus)}</span>
            </div>

            <div className="grid gap-2.5">
              <button
                type="button"
                className="border-none rounded-xl py-2.5 px-3.5 text-xs font-semibold cursor-pointer text-[var(--accent-contrast,#061016)] bg-gradient-to-br from-info to-accent transition-all duration-150 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--info)_20%,transparent)] disabled:cursor-default disabled:opacity-50 hover:not(:disabled):-translate-y-[1px] hover:not(:disabled):shadow-[0_10px_20px_color-mix(in_srgb,var(--info)_25%,transparent)]"
                onClick={() => setMode('input')}
                disabled={actionLoading || !!selectedStatus?.func?.toUpperCase().includes('INPUT') || reserved}
              >
                Configurar como entrada
              </button>
              <button
                type="button"
                className="border-none rounded-xl py-2.5 px-3.5 text-xs font-semibold cursor-pointer text-[var(--accent-contrast,#061016)] bg-gradient-to-br from-info to-accent transition-all duration-150 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--info)_20%,transparent)] disabled:cursor-default disabled:opacity-50 hover:not(:disabled):-translate-y-[1px] hover:not(:disabled):shadow-[0_10px_20px_color-mix(in_srgb,var(--info)_25%,transparent)]"
                onClick={() => setMode('output')}
                disabled={actionLoading || !!selectedStatus?.func?.toUpperCase().includes('OUTPUT') || reserved}
              >
                Configurar como salida
              </button>

              <button
                type="button"
                className="border-none rounded-xl py-2.5 px-3.5 text-xs font-semibold cursor-pointer text-[var(--accent-contrast,#061016)] bg-gradient-to-br from-info to-accent transition-all duration-150 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--info)_20%,transparent)] disabled:cursor-default disabled:opacity-50 hover:not(:disabled):-translate-y-[1px] hover:not(:disabled):shadow-[0_10px_20px_color-mix(in_srgb,var(--info)_25%,transparent)]"
                onClick={() => setPull('up')}
                disabled={actionLoading || !selectedStatus?.func?.toUpperCase().includes('INPUT') || reserved}
              >
                Pull-Up (INPUT)
              </button>
              <button
                type="button"
                className="border-none rounded-xl py-2.5 px-3.5 text-xs font-semibold cursor-pointer text-[var(--accent-contrast,#061016)] bg-gradient-to-br from-info to-accent transition-all duration-150 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--info)_20%,transparent)] disabled:cursor-default disabled:opacity-50 hover:not(:disabled):-translate-y-[1px] hover:not(:disabled):shadow-[0_10px_20px_color-mix(in_srgb,var(--info)_25%,transparent)]"
                onClick={() => setPull('down')}
                disabled={actionLoading || !selectedStatus?.func?.toUpperCase().includes('INPUT') || reserved}
              >
                Pull-Down (INPUT)
              </button>
              <button
                type="button"
                className="border-none rounded-xl py-2.5 px-3.5 text-xs font-semibold cursor-pointer text-[var(--accent-contrast,#061016)] bg-gradient-to-br from-info to-accent transition-all duration-150 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--info)_20%,transparent)] disabled:cursor-default disabled:opacity-50 hover:not(:disabled):-translate-y-[1px] hover:not(:disabled):shadow-[0_10px_20px_color-mix(in_srgb,var(--info)_25%,transparent)]"
                onClick={() => setPull('none')}
                disabled={actionLoading || !selectedStatus?.func?.toUpperCase().includes('INPUT') || reserved}
              >
                Sin pull (INPUT)
              </button>
              <button
                type="button"
                className="border-none rounded-xl py-2.5 px-3.5 text-xs font-semibold cursor-pointer text-[var(--accent-contrast,#061016)] bg-gradient-to-br from-info to-accent transition-all duration-150 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--info)_20%,transparent)] disabled:cursor-default disabled:opacity-50 hover:not(:disabled):-translate-y-[1px] hover:not(:disabled):shadow-[0_10px_20px_color-mix(in_srgb,var(--info)_25%,transparent)]"
                onClick={() => writeLevel(1)}
                disabled={actionLoading || !selectedStatus?.func?.toUpperCase().includes('OUTPUT') || reserved}
              >
                Escribir HIGH (1)
              </button>
              <button
                type="button"
                className="border-none rounded-xl py-2.5 px-3.5 text-xs font-semibold cursor-pointer text-[var(--accent-contrast,#061016)] bg-gradient-to-br from-info to-accent transition-all duration-150 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--info)_20%,transparent)] disabled:cursor-default disabled:opacity-50 hover:not(:disabled):-translate-y-[1px] hover:not(:disabled):shadow-[0_10px_20px_color-mix(in_srgb,var(--info)_25%,transparent)]"
                onClick={() => writeLevel(0)}
                disabled={actionLoading || !selectedStatus?.func?.toUpperCase().includes('OUTPUT') || reserved}
              >
                Escribir LOW (0)
              </button>
              <button
                type="button"
                className="border-none rounded-xl py-2.5 px-3.5 text-xs font-semibold cursor-pointer text-[var(--accent-contrast,#061016)] bg-gradient-to-br from-info to-accent transition-all duration-150 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--info)_20%,transparent)] disabled:cursor-default disabled:opacity-50 hover:not(:disabled):-translate-y-[1px] hover:not(:disabled):shadow-[0_10px_20px_color-mix(in_srgb,var(--info)_25%,transparent)]"
                onClick={readNow}
                disabled={actionLoading}
              >
                Leer ahora
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1 text-[13px]">
            <span className="text-[11px] text-secondary uppercase tracking-[0.05em]">Información</span>
            <span>Este pin no admite cambio de modo.</span>
          </div>
        )}
      </div>
    )
  }

  const isDetail = selectedDefinition != null

  return (
    <div className="flex flex-col gap-4 h-full p-4 rounded-2xl bg-[var(--background-secondary)] text-primary border border-color shadow-[0_12px_32px_rgba(0,0,0,0.2)]">
      <header className="flex justify-between items-center gap-3">
        <div>
          <h2 className="m-0 text-base font-bold text-primary">Pinout Raspberry Pi</h2>
          <span className="block text-xs text-secondary">Estado actual según raspi-gpio</span>
        </div>
        <button
          type="button"
          className="border-none rounded-full py-1.5 px-4 text-xs font-semibold text-[var(--accent-contrast,#061016)] bg-gradient-to-br from-accent to-[var(--accent-primary-hover)] cursor-pointer transition-all duration-150 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-primary)_25%,transparent)] disabled:opacity-60 disabled:cursor-default hover:not(:disabled):-translate-y-[1px] hover:not(:disabled):shadow-[0_10px_24px_color-mix(in_srgb,var(--accent-primary)_25%,transparent)]"
          onClick={load}
          disabled={loading || actionLoading}
        >
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </header>

      {error && <div className="rounded-xl py-2 px-3 text-xs leading-[1.4] text-danger bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] border border-[color-mix(in_srgb,var(--danger)_28%,transparent)]">{error}</div>}
      {isDetail && message && !error && <div className="rounded-xl py-2 px-3 text-xs leading-[1.4] text-accent bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent-primary)_24%,transparent)]">{message}</div>}

      <div className="flex gap-4 items-center text-secondary">
        <label className="inline-flex gap-1.5 items-center text-xs cursor-pointer"><input type="checkbox" checked={showSummary} onChange={e => setShowSummary(e.target.checked)} /> Mostrar resumen</label>
      </div>

      <div className="flex-1 min-h-0 flex">
        {isDetail ? renderDetail() : (
          <>
            {renderGrid()}
            {showSummary && (
              <div className="flex-1 ml-3 overflow-auto">
                <table className="w-full border-collapse text-xs text-primary">
                  <thead>
                    <tr>
                      <th className="border border-color py-1.5 px-2 text-left bg-[color-mix(in_srgb,var(--background-tertiary)_80%,transparent)] sticky top-0 z-[1]">Físico</th>
                      <th className="border border-color py-1.5 px-2 text-left bg-[color-mix(in_srgb,var(--background-tertiary)_80%,transparent)] sticky top-0 z-[1]">GPIO</th>
                      <th className="border border-color py-1.5 px-2 text-left bg-[color-mix(in_srgb,var(--background-tertiary)_80%,transparent)] sticky top-0 z-[1]">Modo</th>
                      <th className="border border-color py-1.5 px-2 text-left bg-[color-mix(in_srgb,var(--background-tertiary)_80%,transparent)] sticky top-0 z-[1]">Pull</th>
                      <th className="border border-color py-1.5 px-2 text-left bg-[color-mix(in_srgb,var(--background-tertiary)_80%,transparent)] sticky top-0 z-[1]">Estado</th>
                      <th className="border border-color py-1.5 px-2 text-left bg-[color-mix(in_srgb,var(--background-tertiary)_80%,transparent)] sticky top-0 z-[1]">Propósito</th>
                      <th className="border border-color py-1.5 px-2 text-left bg-[color-mix(in_srgb,var(--background-tertiary)_80%,transparent)] sticky top-0 z-[1]">Ocupado</th>
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
                        <tr key={p.gpio} onClick={() => handlePinClick(p)} className="cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)]">
                          <td className="border border-color py-1.5 px-2 text-left bg-tertiary">{p.physical}</td>
                          <td className="border border-color py-1.5 px-2 text-left bg-tertiary">{p.gpio}</td>
                          <td className="border border-color py-1.5 px-2 text-left bg-tertiary">{modo}</td>
                          <td className="border border-color py-1.5 px-2 text-left bg-tertiary">{pull}</td>
                          <td className="border border-color py-1.5 px-2 text-left bg-tertiary">{estado}</td>
                          <td className="border border-color py-1.5 px-2 text-left bg-tertiary" title={desc}>{desc || '—'}</td>
                          <td className="border border-color py-1.5 px-2 text-left bg-tertiary">{ocupado ? 'Ocupado' : 'Libre'}</td>
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

      <footer className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2.5 text-[11px] text-secondary">
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]" style={{ backgroundColor: COLORS.gpioInput }} /> Entrada
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]" style={{ backgroundColor: COLORS.gpioOutput }} /> Salida
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]" style={{ backgroundColor: COLORS.gpioAlt }} /> Función alternativa
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]" style={{ backgroundColor: COLORS.high }} /> HIGH (1)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]" style={{ backgroundColor: COLORS.low }} /> LOW (0)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]" style={{ backgroundColor: COLORS.power5 }} /> Alimentación 5V
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]" style={{ backgroundColor: COLORS.power3 }} /> Alimentación 3.3V
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]" style={{ backgroundColor: COLORS.ground }} /> Suelo
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-warning shadow-[0_0_0_1px_rgba(0,0,0,0.2)]" /> Ocupado (reservado/ALT)
        </div>
      </footer>
    </div>
  )
}

export default PinsPanel
