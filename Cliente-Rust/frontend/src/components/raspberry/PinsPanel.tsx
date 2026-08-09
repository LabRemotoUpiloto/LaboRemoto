import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import {
  Group,
  Stack,
  Text,
  Title,
  Paper,
  Button,
  ActionIcon,
  SegmentedControl,
  Switch,
  TextInput,
  Tooltip,
  ScrollArea,
  Table,
  UnstyledButton,
  Box,
  Alert,
} from '@mantine/core'
import {
  RefreshCw,
  LayoutGrid,
  List,
  ArrowLeft,
  Zap,
  Edit3,
  AlertTriangle,
  Check,
  Power,
  Search,
  X,
} from 'lucide-react'
import * as gpioService from '../../services/hardware/gpio.service'
import type { GpioLine } from '../../services/hardware/gpio.service'

type PinRole = 'power5' | 'power3' | 'ground' | 'gpio' | 'other'

type PinDefinition = {
  physical: number
  name: string
  role: PinRole
  gpio?: number
  alias?: string
}

// 40 Pines Raspberry Pi con nombres cortos y precisos para evitar desbordamientos
const PIN_DEFINITIONS: PinDefinition[] = [
  { physical: 1, name: '3.3V', role: 'power3' },
  { physical: 2, name: '5V', role: 'power5' },
  { physical: 3, name: 'GPIO 2', role: 'gpio', gpio: 2, alias: 'SDA1' },
  { physical: 4, name: '5V', role: 'power5' },
  { physical: 5, name: 'GPIO 3', role: 'gpio', gpio: 3, alias: 'SCL1' },
  { physical: 6, name: 'GND', role: 'ground' },
  { physical: 7, name: 'GPIO 4', role: 'gpio', gpio: 4, alias: 'CLK' },
  { physical: 8, name: 'GPIO 14', role: 'gpio', gpio: 14, alias: 'TXD' },
  { physical: 9, name: 'GND', role: 'ground' },
  { physical: 10, name: 'GPIO 15', role: 'gpio', gpio: 15, alias: 'RXD' },
  { physical: 11, name: 'GPIO 17', role: 'gpio', gpio: 17 },
  { physical: 12, name: 'GPIO 18', role: 'gpio', gpio: 18, alias: 'PWM0' },
  { physical: 13, name: 'GPIO 27', role: 'gpio', gpio: 27 },
  { physical: 14, name: 'GND', role: 'ground' },
  { physical: 15, name: 'GPIO 22', role: 'gpio', gpio: 22 },
  { physical: 16, name: 'GPIO 23', role: 'gpio', gpio: 23 },
  { physical: 17, name: '3.3V', role: 'power3' },
  { physical: 18, name: 'GPIO 24', role: 'gpio', gpio: 24 },
  { physical: 19, name: 'GPIO 10', role: 'gpio', gpio: 10, alias: 'MOSI' },
  { physical: 20, name: 'GND', role: 'ground' },
  { physical: 21, name: 'GPIO 9', role: 'gpio', gpio: 9, alias: 'MISO' },
  { physical: 22, name: 'GPIO 25', role: 'gpio', gpio: 25 },
  { physical: 23, name: 'GPIO 11', role: 'gpio', gpio: 11, alias: 'SCLK' },
  { physical: 24, name: 'GPIO 8', role: 'gpio', gpio: 8, alias: 'CE0' },
  { physical: 25, name: 'GND', role: 'ground' },
  { physical: 26, name: 'GPIO 7', role: 'gpio', gpio: 7, alias: 'CE1' },
  { physical: 27, name: 'GPIO 0', role: 'other', gpio: 0, alias: 'ID_SD' },
  { physical: 28, name: 'GPIO 1', role: 'other', gpio: 1, alias: 'ID_SC' },
  { physical: 29, name: 'GPIO 5', role: 'gpio', gpio: 5 },
  { physical: 30, name: 'GND', role: 'ground' },
  { physical: 31, name: 'GPIO 6', role: 'gpio', gpio: 6 },
  { physical: 32, name: 'GPIO 12', role: 'gpio', gpio: 12, alias: 'PWM0' },
  { physical: 33, name: 'GPIO 13', role: 'gpio', gpio: 13, alias: 'PWM1' },
  { physical: 34, name: 'GND', role: 'ground' },
  { physical: 35, name: 'GPIO 19', role: 'gpio', gpio: 19, alias: 'PCM_FS' },
  { physical: 36, name: 'GPIO 16', role: 'gpio', gpio: 16 },
  { physical: 37, name: 'GPIO 26', role: 'gpio', gpio: 26 },
  { physical: 38, name: 'GPIO 20', role: 'gpio', gpio: 20, alias: 'PCM_DIN' },
  { physical: 39, name: 'GND', role: 'ground' },
  { physical: 40, name: 'GPIO 21', role: 'gpio', gpio: 21, alias: 'PCM_DOUT' },
]

const PIN_ROWS = Array.from({ length: 20 }, (_, idx) => ({
  left: PIN_DEFINITIONS[idx * 2],
  right: PIN_DEFINITIONS[idx * 2 + 1],
}))

const PIN_COLORS = {
  power5: '#ef4444',
  power3: '#f59e0b',
  ground: '#334155',
  gpioInput: '#06b6d4',
  gpioOutput: '#10b981',
  gpioAlt: '#8b5cf6',
  other: '#64748b',
  idle: '#475569',
  high: '#22c55e',
  low: '#0f172a',
}

const resolvePinColor = (pin: PinDefinition, line: GpioLine | undefined) => {
  if (pin.role === 'power5') return PIN_COLORS.power5
  if (pin.role === 'power3') return PIN_COLORS.power3
  if (pin.role === 'ground') return PIN_COLORS.ground
  if (pin.role === 'other') return PIN_COLORS.other
  if (!line) return PIN_COLORS.idle

  const func = (line.func || '').toUpperCase()
  if (func.includes('INPUT')) return PIN_COLORS.gpioInput
  if (func.includes('OUTPUT')) return PIN_COLORS.gpioOutput
  return PIN_COLORS.gpioAlt
}

const PinsPanel: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [data, setData] = useState<GpioLine[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedPin, setSelectedPin] = useState<number | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [descriptions, setDescriptions] = useState<Record<number, string>>({})
  const [viewMode, setViewMode] = useState<'pinout' | 'table'>('pinout')
  const [filterText, setFilterText] = useState('')

  const RESERVED: Record<string, number[]> = useMemo(
    () => ({
      I2C: [2, 3],
      UART: [14, 15],
      SPI: [7, 8, 9, 10, 11],
      EEPROM: [0, 1],
    }),
    []
  )

  const RESERVED_SET = useMemo(() => new Set(Object.values(RESERVED).flat()), [RESERVED])
  const isReserved = useCallback(
    (gpio?: number | null) => gpio != null && RESERVED_SET.has(gpio),
    [RESERVED_SET]
  )

  const storageKey = useMemo(() => `pins:descriptions:${sessionId}`, [sessionId])
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) setDescriptions(JSON.parse(raw))
    } catch {}
  }, [storageKey])

  const persistDescriptions = useCallback(
    (next: Record<number, string>) => {
      setDescriptions(next)
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {}
    },
    [storageKey]
  )

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
    // Initial fast fetch
    load()

    let unlistenUpdate: (() => void) | undefined
    let unlistenError: (() => void) | undefined

    const setupRustMonitor = async () => {
      try {
        unlistenUpdate = await listen<any[]>(`gpio_update_${sessionId}`, (event) => {
          if (event.payload) {
            const lines: GpioLine[] = event.payload.map((r) => ({
              gpio: Number(r.gpio),
              level: r.level == null ? null : Number(r.level),
              func: String(r.func || ''),
              pull: r.pull == null ? null : String(r.pull),
            }))
            setData(lines)
            setError(null)
          }
        })

        unlistenError = await listen<string>(`gpio_error_${sessionId}`, (event) => {
          if (event.payload) {
            setError(event.payload)
          }
        })

        // Start Rust background async task
        await gpioService.startPinsMonitor(sessionId, 1000)
      } catch (e: any) {
        console.warn('Fallback: Error al iniciar monitor Rust:', e)
      }
    }

    setupRustMonitor()

    return () => {
      unlistenUpdate?.()
      unlistenError?.()
      gpioService.stopPinsMonitor(sessionId).catch(() => {})
    }
  }, [sessionId, load])

  const gpioMap = useMemo(() => {
    const map = new Map<number, GpioLine>()
    if (data) {
      for (const line of data) map.set(line.gpio, line)
    }
    return map
  }, [data])

  const selectedDefinition =
    selectedPin != null
      ? PIN_DEFINITIONS.find((p) => p.physical === selectedPin) ?? null
      : null
  const selectedStatus =
    selectedDefinition?.gpio != null ? gpioMap.get(selectedDefinition.gpio) : undefined

  const handlePinClick = (pin: PinDefinition) => {
    setSelectedPin((prev) => (prev === pin.physical ? null : pin.physical))
    setMessage(null)
  }

  const setMode = async (mode: 'input' | 'output') => {
    if (!selectedDefinition || selectedDefinition.gpio == null) return
    if (isReserved(selectedDefinition.gpio)) {
      setMessage('Pin reservado: operación bloqueada por seguridad.')
      return
    }
    setActionLoading(true)
    setMessage(null)
    try {
      await gpioService.setPinMode(sessionId, selectedDefinition.gpio, mode)
      await load()
      setMessage(`GPIO ${selectedDefinition.gpio} en ${mode === 'input' ? 'ENTRADA' : 'SALIDA'}.`)
    } catch (e: any) {
      setMessage(e?.message ?? String(e))
    } finally {
      setActionLoading(false)
    }
  }

  const setPull = async (pull: 'up' | 'down' | 'none') => {
    if (!selectedDefinition || selectedDefinition.gpio == null) return
    if (isReserved(selectedDefinition.gpio)) {
      setMessage('Pin reservado: operación bloqueada por seguridad.')
      return
    }
    setActionLoading(true)
    setMessage(null)
    try {
      await gpioService.setPinPull(sessionId, selectedDefinition.gpio, pull)
      await load()
      const label = pull === 'up' ? 'Pull-Up' : pull === 'down' ? 'Pull-Down' : 'Sin Pull'
      setMessage(`GPIO ${selectedDefinition.gpio}: ${label}.`)
    } catch (e: any) {
      setMessage(e?.message ?? String(e))
    } finally {
      setActionLoading(false)
    }
  }

  const writeLevel = async (level: 0 | 1) => {
    if (!selectedDefinition || selectedDefinition.gpio == null) return
    if (isReserved(selectedDefinition.gpio)) {
      setMessage('Pin reservado: operación bloqueada por seguridad.')
      return
    }
    setActionLoading(true)
    setMessage(null)
    try {
      await gpioService.writePinLevel(sessionId, selectedDefinition.gpio, level)
      await load()
      setMessage(`GPIO ${selectedDefinition.gpio}: ${level === 1 ? 'HIGH (1)' : 'LOW (0)'}.`)
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
      setData((prev) => {
        const list = prev ? [...prev] : []
        const idx = list.findIndex((x) => x.gpio === updated.gpio)
        if (idx >= 0) list[idx] = updated
        else list.push(updated)
        return list
      })
    } catch (e: any) {
      setMessage(e?.message ?? String(e))
    }
  }

  // Filtrado de pines por búsqueda
  const matchesFilter = useCallback(
    (pin: PinDefinition) => {
      if (!filterText.trim()) return true
      const q = filterText.toLowerCase()
      const gpioStr = pin.gpio != null ? `gpio ${pin.gpio}` : ''
      const aliasStr = pin.alias || ''
      const nameStr = pin.name || ''
      const physStr = pin.physical.toString()
      return (
        gpioStr.includes(q) ||
        aliasStr.toLowerCase().includes(q) ||
        nameStr.toLowerCase().includes(q) ||
        physStr.includes(q)
      )
    },
    [filterText]
  )

  // ── Render de Pin Individual en la Cabecera 2x20 ────────────────────────────
  const renderPinUnit = (pin: PinDefinition, side: 'left' | 'right') => {
    const line = pin.gpio != null ? gpioMap.get(pin.gpio) : undefined
    const isSelected = selectedPin === pin.physical
    const isMatched = matchesFilter(pin)
    const color = resolvePinColor(pin, line)
    const level = line?.level
    const isHigh = level === 1
    const occupied =
      pin.gpio != null &&
      (isReserved(pin.gpio) || (line?.func || '').toUpperCase().startsWith('ALT'))

    const funcStr = line?.func || ''
    const currentMode = funcStr.toUpperCase().includes('INPUT')
      ? 'Entrada'
      : funcStr.toUpperCase().includes('OUTPUT')
        ? 'Salida'
        : funcStr || '—'

    const tooltipLabel = (
      <Stack gap={2} style={{ fontSize: 11 }}>
        <Text fw={700} size="xs">
          Pin Físico #{pin.physical} · {pin.name} {pin.alias ? `(${pin.alias})` : ''}
        </Text>
        {pin.gpio != null && (
          <>
            <Text size="xs">Modo: {currentMode} | Level: {level == null ? '—' : isHigh ? 'HIGH (1)' : 'LOW (0)'}</Text>
            <Text size="xs" color="dimmed">Pull: {line?.pull || 'no especificado'}</Text>
          </>
        )}
      </Stack>
    )

    return (
      <Tooltip key={pin.physical} label={tooltipLabel} position={side === 'left' ? 'left' : 'right'} withArrow openDelay={100}>
        <UnstyledButton
          onClick={() => handlePinClick(pin)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '2px 4px',
            borderRadius: 6,
            background: isSelected ? 'var(--mantine-color-dark-4)' : 'transparent',
            outline: isSelected ? '1.5px solid var(--accent-primary)' : 'none',
            opacity: isMatched ? 1 : 0.25,
            transition: 'all 0.12s ease',
            cursor: 'pointer',
            flexDirection: side === 'left' ? 'row' : 'row-reverse',
            width: '100%',
          }}
        >
          {/* Texto del Pin (Nombre Corto + Alias) */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: side === 'left' ? 'row' : 'row-reverse',
              alignItems: 'center',
              gap: 4,
              minWidth: 0,
              justifyContent: 'flex-end',
            }}
          >
            {pin.alias && (
              <Text
                size="xs"
                fw={700}
                style={{
                  fontSize: 9,
                  color: 'var(--danger)',
                  whiteSpace: 'nowrap',
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                {pin.alias}
              </Text>
            )}
            <Text
              size="xs"
              fw={600}
              style={{
                fontSize: 11,
                color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                lineHeight: 1.1,
                textAlign: side === 'left' ? 'right' : 'left',
              }}
            >
              {pin.name}
            </Text>
          </div>

          {/* Número físico */}
          <Text
            size="xs"
            fw={700}
            style={{
              width: 16,
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              fontSize: 10,
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {pin.physical}
          </Text>

          {/* Cabeza metálica del Pin físico */}
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              backgroundColor: color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isSelected
                ? '0 0 0 2px var(--accent-primary)'
                : 'inset 0 0 0 1px rgba(0,0,0,0.3)',
              position: 'relative',
              flexShrink: 0,
            }}
          >
            {/* Indicador LED de Estado (HIGH/LOW) */}
            {pin.gpio != null && (
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: level == null ? 'transparent' : isHigh ? PIN_COLORS.high : '#0f172a',
                  boxShadow: isHigh ? '0 0 5px #22c55e' : 'none',
                }}
              />
            )}

            {/* Advertencia reservado */}
            {occupied && (
              <div
                style={{
                  position: 'absolute',
                  top: -1,
                  right: -1,
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  backgroundColor: '#f59e0b',
                }}
              />
            )}
          </div>
        </UnstyledButton>
      </Tooltip>
    )
  }

  // ── Tarjeta de Control del Pin Seleccionado (Inspector) ────────────────────
  const renderInspector = () => {
    if (!selectedDefinition) return null
    const reserved = isReserved(selectedDefinition.gpio)
    const desc = selectedDefinition.gpio != null ? descriptions[selectedDefinition.gpio] || '' : ''
    const setDesc = (val: string) => {
      if (selectedDefinition.gpio == null) return
      const next = { ...descriptions, [selectedDefinition.gpio]: val }
      persistDescriptions(next)
    }

    const funcUpper = (selectedStatus?.func || '').toUpperCase()
    const currentModeValue = funcUpper.includes('INPUT')
      ? 'input'
      : funcUpper.includes('OUTPUT')
        ? 'output'
        : ''

    const pullUpper = (selectedStatus?.pull || '').toLowerCase()
    const currentPullValue = pullUpper.includes('up')
      ? 'up'
      : pullUpper.includes('down')
        ? 'down'
        : 'none'

    return (
      <Paper p="xs" radius="md" style={{ background: 'var(--surface-2)', border: '1.5px solid var(--accent-primary)' }}>
        <Stack gap="xs">
          <Group justify="space-between" align="center">
            <Group gap={6}>
              <Title order={5} style={{ color: 'var(--text-primary)', fontSize: 13 }}>
                Pin #{selectedDefinition.physical} · {selectedDefinition.name}
              </Title>
              {selectedDefinition.alias && (
                <Text size="xs" fw={700} style={{ color: 'var(--accent-primary)', fontSize: 11 }}>
                  ({selectedDefinition.alias})
                </Text>
              )}
            </Group>
            <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setSelectedPin(null)}>
              <X size={12} />
            </ActionIcon>
          </Group>

          {/* Nota personalizada de uso */}
          <TextInput
            size="xs"
            placeholder="Etiqueta / Nota (ej: Sensor, Relé 1)..."
            leftSection={<Edit3 size={11} />}
            value={desc}
            onChange={(e) => setDesc(e.currentTarget.value)}
            styles={{ input: { fontSize: 11 } }}
          />

          {reserved && (
            <Alert icon={<AlertTriangle size={14} />} color="yellow" radius="xs" p="xs">
              <Text size="xs" style={{ fontSize: 10 }}>
                Pin de sistema reservado (I2C/UART/SPI).
              </Text>
            </Alert>
          )}

          {selectedDefinition.gpio != null ? (
            <Stack gap={6}>
              <Group justify="space-between" align="center">
                <Text size="xs" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                  Modo actual: <strong style={{ color: 'var(--text-primary)' }}>{selectedStatus?.func || '—'}</strong>
                </Text>
                <Group gap={4}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: selectedStatus?.level === 1 ? PIN_COLORS.high : '#475569',
                    }}
                  />
                  <Text size="xs" fw={700} style={{ fontSize: 11, color: selectedStatus?.level === 1 ? 'var(--success)' : 'var(--text-secondary)' }}>
                    {selectedStatus?.level == null ? '—' : selectedStatus.level === 1 ? 'HIGH (1)' : 'LOW (0)'}
                  </Text>
                </Group>
              </Group>

              {/* Selector de Modo: ENTRADA / SALIDA */}
              <div>
                <SegmentedControl
                  fullWidth
                  size="xs"
                  value={currentModeValue}
                  onChange={(val) => setMode(val as 'input' | 'output')}
                  disabled={actionLoading || reserved}
                  data={[
                    { label: 'Entrada (INPUT)', value: 'input' },
                    { label: 'Salida (OUTPUT)', value: 'output' },
                  ]}
                  styles={{ label: { fontSize: 10, padding: '2px 4px' } }}
                />
              </div>

              {/* Selector de Pull (si es Input) */}
              {currentModeValue === 'input' && (
                <div>
                  <SegmentedControl
                    fullWidth
                    size="xs"
                    value={currentPullValue}
                    onChange={(val) => setPull(val as 'up' | 'down' | 'none')}
                    disabled={actionLoading || reserved}
                    data={[
                      { label: 'Pull-Up', value: 'up' },
                      { label: 'Pull-Down', value: 'down' },
                      { label: 'Sin Pull', value: 'none' },
                    ]}
                    styles={{ label: { fontSize: 10, padding: '2px 4px' } }}
                  />
                </div>
              )}

              {/* Conmutador HIGH / LOW (si es Output) */}
              {currentModeValue === 'output' && (
                <Group grow gap={4}>
                  <Button
                    size="xs"
                    variant={selectedStatus?.level === 1 ? 'filled' : 'outline'}
                    color="green"
                    leftSection={<Zap size={11} />}
                    onClick={() => writeLevel(1)}
                    disabled={actionLoading || reserved}
                    styles={{ root: { fontSize: 10, height: 26 } }}
                  >
                    HIGH (1)
                  </Button>
                  <Button
                    size="xs"
                    variant={selectedStatus?.level === 0 ? 'filled' : 'outline'}
                    color="gray"
                    leftSection={<Power size={11} />}
                    onClick={() => writeLevel(0)}
                    disabled={actionLoading || reserved}
                    styles={{ root: { fontSize: 10, height: 26 } }}
                  >
                    LOW (0)
                  </Button>
                </Group>
              )}
            </Stack>
          ) : (
            <Text size="xs" style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>
              Pin de alimentación/tierra no configurable por software.
            </Text>
          )}
        </Stack>
      </Paper>
    )
  }

  return (
    <Stack gap="xs" style={{ height: '100%', minHeight: 0 }}>
      {/* Barra de Controles e Inspección */}
      <Paper p="xs" radius="md" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
        <Stack gap="xs">
          {/* Toggle de Modo y Búsqueda */}
          <Group gap="xs" wrap="nowrap">
            <Box style={{ flex: 1 }}>
              <SegmentedControl
                fullWidth
                size="xs"
                value={viewMode}
                onChange={(v) => setViewMode(v as 'pinout' | 'table')}
                data={[
                  {
                    label: (
                      <Group gap={3} justify="center">
                        <LayoutGrid size={11} />
                        <span>Cabecera 2x20</span>
                      </Group>
                    ),
                    value: 'pinout',
                  },
                  {
                    label: (
                      <Group gap={3} justify="center">
                        <List size={11} />
                        <span>Tabla</span>
                      </Group>
                    ),
                    value: 'table',
                  },
                ]}
                styles={{ label: { fontSize: 10 } }}
              />
            </Box>
          </Group>

          {viewMode === 'pinout' && (
            <TextInput
              size="xs"
              placeholder="Buscar GPIO, I2C, SPI, 5V..."
              leftSection={<Search size={11} />}
              rightSection={
                filterText ? (
                  <UnstyledButton onClick={() => setFilterText('')} style={{ display: 'flex' }}>
                    <X size={11} />
                  </UnstyledButton>
                ) : null
              }
              value={filterText}
              onChange={(e) => setFilterText(e.currentTarget.value)}
              styles={{ input: { fontSize: 11, height: 26 } }}
            />
          )}
        </Stack>
      </Paper>

      {/* Alertas / Mensajes de Operación */}
      {error && (
        <Alert icon={<AlertTriangle size={14} />} color="red" radius="md" p="xs">
          <Text size="xs" style={{ fontSize: 10 }}>{error}</Text>
        </Alert>
      )}
      {message && !error && (
        <Alert icon={<Check size={14} />} color="green" radius="md" p="xs">
          <Text size="xs" style={{ fontSize: 10 }}>{message}</Text>
        </Alert>
      )}

      {/* Inspector del Pin Seleccionado */}
      {selectedPin != null && renderInspector()}

      {/* Contenido Principal: Cabecera 2x20 Compacta vs Tabla */}
      <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {viewMode === 'pinout' ? (
          <Paper p="xs" radius="md" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
            <Stack gap={0} style={{ flex: 1, justifyContent: 'space-between' }}>
              {PIN_ROWS.map((row) => (
                <Group key={row.left.physical} gap={4} wrap="nowrap" justify="space-between">
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    {renderPinUnit(row.left, 'left')}
                  </Box>
                  <div
                    style={{
                      width: 1,
                      height: 16,
                      background: 'var(--border-subtle)',
                      flexShrink: 0,
                    }}
                  />
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    {renderPinUnit(row.right, 'right')}
                  </Box>
                </Group>
              ))}
            </Stack>
          </Paper>
        ) : (
          /* Tabla Resumen con ScrollArea solo en modo tabla */
          <ScrollArea style={{ flex: 1 }} scrollbarSize={6} type="hover" styles={{ viewport: { overflowX: 'hidden' } }}>
            <Paper p="xs" radius="md" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
              <Table highlightOnHover fontSize="xs" verticalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ fontSize: 10 }}>Pin</Table.Th>
                    <Table.Th style={{ fontSize: 10 }}>Nombre</Table.Th>
                    <Table.Th style={{ fontSize: 10 }}>Modo</Table.Th>
                    <Table.Th style={{ fontSize: 10 }}>Nivel</Table.Th>
                    <Table.Th style={{ fontSize: 10 }}>Nota</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {PIN_DEFINITIONS.filter((p) => p.gpio != null).map((p) => {
                    const line = gpioMap.get(p.gpio!)
                    const func = (line?.func || '').toUpperCase()
                    const modo = func.includes('INPUT')
                      ? 'INPUT'
                      : func.includes('OUTPUT')
                        ? 'OUTPUT'
                        : func || '—'
                    const estado = line?.level == null ? '—' : line.level === 1 ? 'HIGH (1)' : 'LOW (0)'
                    const desc = descriptions[p.gpio!] || ''
                    return (
                      <Table.Tr
                        key={p.gpio}
                        style={{ cursor: 'pointer' }}
                        onClick={() => handlePinClick(p)}
                      >
                        <Table.Td fw={700} style={{ fontSize: 10 }}>{p.physical}</Table.Td>
                        <Table.Td style={{ fontSize: 10 }}>{p.name} {p.alias ? `(${p.alias})` : ''}</Table.Td>
                        <Table.Td style={{ fontSize: 10 }}>{modo}</Table.Td>
                        <Table.Td fw={600} style={{ fontSize: 10, color: estado.includes('HIGH') ? 'var(--success)' : 'inherit' }}>
                          {estado}
                        </Table.Td>
                        <Table.Td style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{desc || '—'}</Table.Td>
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
              </Table>
            </Paper>
          </ScrollArea>
        )}
      </Box>

      {/* Leyenda de colores compacta */}
      <Paper p="xs" radius="md" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
        <Group gap="xs" justify="center" wrap="wrap">
          <Group gap={3}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: PIN_COLORS.power5 }} />
            <Text size="xs" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>5V</Text>
          </Group>
          <Group gap={3}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: PIN_COLORS.power3 }} />
            <Text size="xs" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>3.3V</Text>
          </Group>
          <Group gap={3}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: PIN_COLORS.ground }} />
            <Text size="xs" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>GND</Text>
          </Group>
          <Group gap={3}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: PIN_COLORS.gpioInput }} />
            <Text size="xs" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>Input</Text>
          </Group>
          <Group gap={3}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: PIN_COLORS.gpioOutput }} />
            <Text size="xs" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>Output</Text>
          </Group>
          <Group gap={3}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: PIN_COLORS.gpioAlt }} />
            <Text size="xs" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>ALT</Text>
          </Group>
        </Group>
      </Paper>
    </Stack>
  )
}

export default PinsPanel
