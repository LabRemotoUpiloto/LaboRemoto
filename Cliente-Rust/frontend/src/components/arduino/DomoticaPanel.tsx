import React, { useCallback, useEffect, useRef, useState } from 'react'
import * as arduinoService from '../../services/hardware/arduino.service'
import { BridgeStatus } from '../../services/hardware/arduino.service'

/**
 * Panel de control para el tablero de domótica conectado al Arduino DUE de la Pi.
 *
 * Se comunica con el bridge HTTP (`arduino-bridge.service`) a través de comandos
 * Tauri que ejecutan `curl` sobre la sesión SSH ya autenticada.
 *
 * Ver `docs/arduino_domotica.md` para la configuración del lado de la Pi y el
 * sketch `DomoticaMaster.ino` que debe estar cargado en el Arduino.
 */


type LogEntry = {
  ts: string
  direction: 'tx' | 'rx' | 'err' | 'info'
  text: string
}

type ScriptStep = {
  cmd: string
  delay?: number // delay en ms después de ejecutar este comando
}

type Script = {
  id: string
  name: string
  steps: ScriptStep[]
}

const MAX_LOG = 80

const DomoticaPanel: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [status, setStatus] = useState<BridgeStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])

  // Estados reflejados localmente (no confiables al 100%, el Arduino es la verdad)
  const [luz1, setLuz1] = useState(false)
  const [luz2, setLuz2] = useState(false)
  const [motor, setMotor] = useState(90)
  const [distancia, setDistancia] = useState<string | null>(null)
  const [lcdLine1, setLcdLine1] = useState('')
  const [lcdLine2, setLcdLine2] = useState('')

  // Scripts guardados
  const [scripts] = useState<Script[]>([
    {
      id: 'semaforo',
      name: 'Semáforo',
      steps: [
        { cmd: 'LUZ1:ON', delay: 2000 },
        { cmd: 'LUZ1:OFF', delay: 500 },
        { cmd: 'LUZ2:ON', delay: 2000 },
        { cmd: 'LUZ2:OFF', delay: 500 },
      ]
    },
    {
      id: 'alarma',
      name: 'Alarma (intermitente)',
      steps: [
        { cmd: 'LUZ1:ON', delay: 200 },
        { cmd: 'LUZ1:OFF', delay: 200 },
        { cmd: 'LUZ2:ON', delay: 200 },
        { cmd: 'LUZ2:OFF', delay: 200 },
        { cmd: 'LUZ1:ON', delay: 200 },
        { cmd: 'LUZ1:OFF', delay: 200 },
        { cmd: 'LUZ2:ON', delay: 200 },
        { cmd: 'LUZ2:OFF', delay: 200 },
      ]
    },
    {
      id: 'proximidad',
      name: 'Proximidad → Luces',
      steps: [
        { cmd: 'DIST?', delay: 0 },
      ]
    }
  ])

  // Automatización de proximidad deshabilitada - solo medición manual

  const logEndRef = useRef<HTMLDivElement | null>(null)

  const pushLog = useCallback((direction: LogEntry['direction'], text: string) => {
    setLog(prev => {
      const ts = new Date().toLocaleTimeString()
      const next = [...prev, { ts, direction, text }]
      return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next
    })
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const s = await arduinoService.getBridgeStatus(sessionId)
      setStatus(s)
      if (!s.reachable) {
        pushLog('err', 'Bridge no responde. Revisa arduino-bridge.service en la Pi.')
      } else if (!s.open) {
        pushLog('err', `Serial cerrado: ${s.last_error ?? '(sin detalle)'}`)
      }
    } catch (e: any) {
      pushLog('err', `Error status: ${e}`)
    }
  }, [sessionId, pushLog])

  useEffect(() => {
    refreshStatus()
    // Poll cada 10s de estado (barato)
    const it = window.setInterval(refreshStatus, 10000)
    return () => window.clearInterval(it)
  }, [refreshStatus])

  const sendCmd = useCallback(
    async (cmd: string): Promise<string | null> => {
      if (busy) return null
      setBusy(true)
      pushLog('tx', cmd)
      try {
        const r = await arduinoService.sendCmd(sessionId, cmd)
        pushLog('rx', r.response || '(sin respuesta)')
        return r.response
      } catch (e: any) {
        pushLog('err', String(e))
        return null
      } finally {
        setBusy(false)
      }
    },
    [busy, sessionId, pushLog]
  )

  // ──────────── Acciones concretas ────────────

  const toggleLuz = async (n: 1 | 2) => {
    const current = n === 1 ? luz1 : luz2
    const next = !current
    const resp = await sendCmd(`LUZ${n}:${next ? 'ON' : 'OFF'}`)
    if (resp && resp.startsWith('OK')) {
      if (n === 1) setLuz1(next)
      else setLuz2(next)
    }
  }

  // Slider sin spam: envía sólo al soltar (onMouseUp / onTouchEnd / onChange final)
  const commitMotor = async (v: number) => {
    const resp = await sendCmd(`MOTOR:${v}`)
    if (resp && resp.startsWith('OK')) setMotor(v)
  }

  const medirDist = async () => {
    const resp = await sendCmd('DIST?')
    if (resp && resp.startsWith('DIST:')) {
      const value = resp.substring(5).trim()
      setDistancia(value === 'ERR' ? 'sin eco' : `${value} cm`)
    }
  }

  const stopAll = async () => {
    const resp = await sendCmd('STOP')
    if (resp && resp.startsWith('OK')) {
      setLuz1(false)
      setLuz2(false)
      setMotor(90)
    }
  }

  const ping = async () => {
    await sendCmd('PING')
  }

  const sendLcd = async () => {
    if (!lcdLine1.trim()) return
    const resp = await sendCmd(`LCD:${lcdLine1}`)
    if (resp && resp.startsWith('OK')) {
      setLcdLine1('')
    }
  }

  const sendLcd2 = async () => {
    if (!lcdLine2.trim()) return
    const resp = await sendCmd(`LCD2:${lcdLine2}`)
    if (resp && resp.startsWith('OK')) {
      setLcdLine2('')
    }
  }

  const clearLcd = async () => {
    const resp = await sendCmd('LCDCLR')
    if (resp && resp.startsWith('OK')) {
      setLcdLine1('')
      setLcdLine2('')
    }
  }

  const runScript = async (script: Script) => {
    setBusy(true)
    pushLog('info', `Ejecutando script: ${script.name}`)
    try {
      // Lógica especial para script de proximidad
      if (script.id === 'proximidad') {
        const resp = await sendCmd('DIST?')
        if (resp && resp.startsWith('DIST:')) {
          const value = parseFloat(resp.substring(5).trim())
          if (!isNaN(value)) {
            setDistancia(`${value.toFixed(1)} cm`)
            if (value < 20) {
              await sendCmd('LUZ1:ON')
              await sendCmd('LUZ2:ON')
              pushLog('info', `Objeto a ${value.toFixed(1)}cm - luces encendidas`)
              // Apagar después de 3 segundos
              await new Promise(resolve => setTimeout(resolve, 3000))
              await sendCmd('LUZ1:OFF')
              await sendCmd('LUZ2:OFF')
              pushLog('info', 'Luces apagadas automáticamente')
            } else {
              pushLog('info', `Objeto a ${value.toFixed(1)}cm - fuera de rango`)
            }
          }
        }
      } else {
        // Ejecución normal para otros scripts
        for (const step of script.steps) {
          await sendCmd(step.cmd)
          if (step.delay) {
            await new Promise(resolve => setTimeout(resolve, step.delay))
          }
        }
      }
      pushLog('info', `Script completado: ${script.name}`)
    } catch (err) {
      pushLog('err', `Error en script: ${err}`)
    } finally {
      setBusy(false)
    }
  }

  // ──────────── UI ────────────

  const statusBadge = (() => {
    const baseBadge = "text-[10px] py-[3px] px-2.5 rounded-full font-semibold tracking-[0.3px]"
    if (!status) return <span className={`${baseBadge} bg-tertiary text-secondary`}>…</span>
    if (!status.reachable) return <span className={`${baseBadge} bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] text-danger border border-[color-mix(in_srgb,var(--danger)_30%,transparent)]`}>Bridge offline</span>
    if (!status.open) return <span className={`${baseBadge} bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] text-warning border border-[color-mix(in_srgb,var(--warning)_30%,transparent)]`}>Serial cerrado</span>
    return <span className={`${baseBadge} bg-[color-mix(in_srgb,var(--success)_18%,transparent)] text-success border border-[color-mix(in_srgb,var(--success)_30%,transparent)]`}>Conectado · {status.port}</span>
  })()

  const cardClasses = "bg-tertiary border border-color rounded-xl py-3 px-3.5 flex flex-col gap-2.5 transition-all duration-200 ease-in-out hover:border-[color-mix(in_srgb,var(--accent-primary)_25%,transparent)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
  const cardTitleClasses = "text-[13px] font-bold text-primary flex items-center gap-1.5 mb-0.5 [&>svg]:w-4 [&>svg]:h-4 [&>svg]:opacity-70"
  const btnClasses = "border border-color rounded-lg bg-[var(--background-secondary)] text-primary text-[11px] cursor-pointer transition-all duration-150 ease-in-out font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:not(:disabled):border-accent hover:not(:disabled):text-accent"

  return (
    <div className="flex flex-col gap-3 h-full min-h-0 py-3.5 pr-2.5 pl-3.5 rounded-2xl bg-[var(--background-secondary)] text-primary border border-color shadow-[0_12px_32px_rgba(0,0,0,0.2)] overflow-y-scroll overflow-x-hidden [scrollbar-width:thin] [scrollbar-color:var(--border-subtle)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[var(--border-subtle)] [&::-webkit-scrollbar-thumb]:rounded">
      <header className="flex justify-between items-center gap-3">
        <div>
          <h2 className="m-0 text-[15px] font-bold">Control de Domótica</h2>
          <span className="text-[11px] text-secondary">Arduino DUE · sketch DomoticaMaster</span>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge}
          <button type="button" className={`${btnClasses} py-[3px] px-2 text-[11px]`} onClick={refreshStatus} disabled={busy}>
            ↻
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-2.5">
        {/* Luces — Interruptores visuales con bombilla */}
        <div className={cardClasses}>
          <div className={cardTitleClasses}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18h6M10 22h4M12 2v1M12 2a6 6 0 00-6 6c0 1.5.5 2.5 1.5 3.5L9 14h6l1.5-2.5C17.5 10.5 18 9.5 18 8a6 6 0 00-6-6z"/></svg>
            Bombillos
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              className={`flex-1 flex flex-col items-center gap-2 py-3.5 px-2.5 rounded-[10px] border border-color bg-[var(--background-secondary)] text-primary text-xs font-semibold cursor-pointer transition-all duration-200 ease-in-out relative disabled:opacity-50 disabled:cursor-default hover:not(:disabled):border-[color-mix(in_srgb,var(--accent-primary)_40%,transparent)] hover:not(:disabled):-translate-y-[1px] group ${luz1 ? 'on border-[#facc15]' : ''}`}
              onClick={() => toggleLuz(1)}
              disabled={busy}
            >
              <span className={`w-10 h-10 rounded-full bg-tertiary border-2 border-color flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${luz1 ? 'bg-[#facc15] border-[#facc15] shadow-[0_0_20px_#facc1566,0_0_40px_#facc1522,inset_0_0_10px_#facc1533] scale-105' : ''}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-[22px] h-[22px] text-secondary transition-colors duration-300 ease-in-out ${luz1 ? 'text-[#713f12]' : ''}`}><path d="M9 18h6M10 22h4M12 2v1M12 2a6 6 0 00-6 6c0 1.5.5 2.5 1.5 3.5L9 14h6l1.5-2.5C17.5 10.5 18 9.5 18 8a6 6 0 00-6-6z"/></svg>
              </span>
              <span>Bombillo 1</span>
              <span className={`text-[11px] font-extrabold tracking-[0.8px] uppercase ${luz1 ? 'text-[#facc15] [text-shadow:0_0_8px_#facc1533]' : 'text-secondary'}`}>{luz1 ? 'ENCENDIDO' : 'APAGADO'}</span>
            </button>
            <button
              type="button"
              className={`flex-1 flex flex-col items-center gap-2 py-3.5 px-2.5 rounded-[10px] border border-color bg-[var(--background-secondary)] text-primary text-xs font-semibold cursor-pointer transition-all duration-200 ease-in-out relative disabled:opacity-50 disabled:cursor-default hover:not(:disabled):border-[color-mix(in_srgb,var(--accent-primary)_40%,transparent)] hover:not(:disabled):-translate-y-[1px] group ${luz2 ? 'on border-[#facc15]' : ''}`}
              onClick={() => toggleLuz(2)}
              disabled={busy}
            >
              <span className={`w-10 h-10 rounded-full bg-tertiary border-2 border-color flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${luz2 ? 'bg-[#facc15] border-[#facc15] shadow-[0_0_20px_#facc1566,0_0_40px_#facc1522,inset_0_0_10px_#facc1533] scale-105' : ''}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-[22px] h-[22px] text-secondary transition-colors duration-300 ease-in-out ${luz2 ? 'text-[#713f12]' : ''}`}><path d="M9 18h6M10 22h4M12 2v1M12 2a6 6 0 00-6 6c0 1.5.5 2.5 1.5 3.5L9 14h6l1.5-2.5C17.5 10.5 18 9.5 18 8a6 6 0 00-6-6z"/></svg>
              </span>
              <span>Bombillo 2</span>
              <span className={`text-[11px] font-extrabold tracking-[0.8px] uppercase ${luz2 ? 'text-[#facc15] [text-shadow:0_0_8px_#facc1533]' : 'text-secondary'}`}>{luz2 ? 'ENCENDIDO' : 'APAGADO'}</span>
            </button>
          </div>
        </div>

        {/* Motor continuo — Controles con iconos grandes */}
        <div className={cardClasses}>
          <div className={cardTitleClasses}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
            Motor continuo <span className="font-normal text-[10px] text-secondary">(pin 3)</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={180}
              value={motor}
              onChange={(e) => setMotor(parseInt(e.target.value, 10))}
              onMouseUp={(e) => commitMotor(parseInt((e.target as HTMLInputElement).value, 10))}
              onTouchEnd={(e) => commitMotor(parseInt((e.target as HTMLInputElement).value, 10))}
              onKeyUp={(e) => commitMotor(parseInt((e.target as HTMLInputElement).value, 10))}
              disabled={busy}
              className="flex-1 accent-[var(--accent-primary)] cursor-pointer h-1.5 rounded-[3px]"
            />
            <span className="min-w-[44px] text-right tabular-nums font-bold text-[14px] text-accent">{motor}</span>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 flex flex-col items-center gap-1 py-2.5 px-1.5 rounded-[10px] border border-color bg-[var(--background-secondary)] text-primary text-[11px] font-semibold cursor-pointer transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-default hover:not(:disabled):border-accent hover:not(:disabled):bg-[color-mix(in_srgb,var(--accent-primary)_8%,var(--background-secondary))] hover:not(:disabled):-translate-y-[1px]" disabled={busy} onClick={() => commitMotor(0)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              Izquierda
            </button>
            <button className="flex-1 flex flex-col items-center gap-1 py-2.5 px-1.5 rounded-[10px] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--background-secondary)] text-primary text-[11px] font-semibold cursor-pointer transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-default hover:not(:disabled):border-danger hover:not(:disabled):bg-[color-mix(in_srgb,var(--danger)_10%,var(--background-secondary))] hover:not(:disabled):-translate-y-[1px]" disabled={busy} onClick={() => commitMotor(90)}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
              Stop
            </button>
            <button className="flex-1 flex flex-col items-center gap-1 py-2.5 px-1.5 rounded-[10px] border border-color bg-[var(--background-secondary)] text-primary text-[11px] font-semibold cursor-pointer transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-default hover:not(:disabled):border-accent hover:not(:disabled):bg-[color-mix(in_srgb,var(--accent-primary)_8%,var(--background-secondary))] hover:not(:disabled):-translate-y-[1px]" disabled={busy} onClick={() => commitMotor(180)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              Derecha
            </button>
          </div>
        </div>

        {/* Sensor distancia — Display estilo gauge */}
        <div className={cardClasses}>
          <div className={cardTitleClasses}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="3"/></svg>
            Sensor HC-SR04 <span className="font-normal text-[10px] text-secondary">(trig 5 · echo 6)</span>
          </div>
          <div className="flex items-center gap-3 justify-between">
            <div className="flex items-center gap-2.5 flex-1">
              <div className="w-9 h-9 rounded-full bg-[color-mix(in_srgb,var(--accent-primary)_12%,var(--background-secondary))] border-[1.5px] border-[color-mix(in_srgb,var(--accent-primary)_30%,transparent)] flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[18px] h-[18px] text-accent"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
              <div className="flex flex-col">
                {distancia ? (
                  <>
                    <span className={`text-[22px] font-extrabold text-primary tabular-nums leading-none ${(parseFloat(distancia) < 20 && distancia !== 'sin eco') ? 'text-[#4ade80]' : ''}`}>
                      {distancia.replace(' cm', '').replace('sin eco', '—')}
                    </span>
                    <span className="text-[11px] text-secondary font-medium">{distancia.includes('sin eco') ? 'Sin eco' : 'centímetros'}</span>
                  </>
                ) : (
                  <span className="text-secondary italic text-xs">Presiona Medir</span>
                )}
              </div>
            </div>
            <button className={`${btnClasses} py-[7px] px-3.5`} disabled={busy} onClick={medirDist}>Medir</button>
          </div>
        </div>

        {/* LCD I2C — Estilo pantalla física */}
        <div className={`${cardClasses} col-span-full`}>
          <div className={cardTitleClasses}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h12M6 12h12M6 16h8"/></svg>
            Pantalla LCD I2C <span className="font-normal text-[10px] text-secondary">(16x2 · SDA 20 · SCL 21)</span>
          </div>
          <div className="bg-[#1a3a1a] border-2 border-[#2d5a2d] rounded-lg py-2.5 px-3 mb-2 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
            <div className={`font-mono text-[13px] text-[#4ade80] leading-[1.6] min-h-[20px] [text-shadow:0_0_4px_#4ade8033] tracking-[0.5px] ${!lcdLine1 ? 'text-[#2d5a2d]' : ''}`}>{lcdLine1 || '________________'}</div>
            <div className={`font-mono text-[13px] text-[#4ade80] leading-[1.6] min-h-[20px] [text-shadow:0_0_4px_#4ade8033] tracking-[0.5px] ${!lcdLine2 ? 'text-[#2d5a2d]' : ''}`}>{lcdLine2 || '________________'}</div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                className="flex-1 py-2 px-3 rounded-lg border border-color bg-[var(--background-secondary)] text-primary text-xs font-mono transition-all duration-150 ease-in-out focus:outline-none focus:border-accent focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent-primary)_15%,transparent)] disabled:opacity-50 disabled:cursor-default placeholder:text-secondary"
                placeholder="Escribe línea 1..."
                value={lcdLine1}
                onChange={(e) => setLcdLine1(e.target.value)}
                disabled={busy}
                maxLength={16}
                onKeyDown={(e) => e.key === 'Enter' && sendLcd()}
              />
              <button className={`${btnClasses} py-[7px] px-3.5`} disabled={busy || !lcdLine1.trim()} onClick={sendLcd}>Enviar</button>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                className="flex-1 py-2 px-3 rounded-lg border border-color bg-[var(--background-secondary)] text-primary text-xs font-mono transition-all duration-150 ease-in-out focus:outline-none focus:border-accent focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent-primary)_15%,transparent)] disabled:opacity-50 disabled:cursor-default placeholder:text-secondary"
                placeholder="Escribe línea 2..."
                value={lcdLine2}
                onChange={(e) => setLcdLine2(e.target.value)}
                disabled={busy}
                maxLength={16}
                onKeyDown={(e) => e.key === 'Enter' && sendLcd2()}
              />
              <button className={`${btnClasses} py-[7px] px-3.5`} disabled={busy || !lcdLine2.trim()} onClick={sendLcd2}>Enviar</button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button className={`${btnClasses} flex-1 py-1.5 px-2.5 bg-[var(--background-secondary)]`} disabled={busy} onClick={clearLcd}>Limpiar pantalla</button>
            </div>
          </div>
        </div>

        {/* Scripts guardados — Tarjetas grandes */}
        <div className={`${cardClasses} col-span-full`}>
          <div className={cardTitleClasses}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Scripts guardados
          </div>
          <div className="grid grid-cols-2 gap-2">
            {scripts.map(script => (
              <button
                key={script.id}
                className={`flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-[10px] border border-color bg-[var(--background-secondary)] text-primary text-[11px] font-semibold cursor-pointer transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-default hover:not(:disabled):-translate-y-[1px] hover:not(:disabled):shadow-[0_2px_8px_rgba(0,0,0,0.15)]
                  ${script.id === 'semaforo' ? 'hover:not(:disabled):border-[#facc15] hover:not(:disabled):bg-[color-mix(in_srgb,#facc15_8%,var(--background-secondary))]' : ''}
                  ${script.id === 'alarma' ? 'hover:not(:disabled):border-[#f87171] hover:not(:disabled):bg-[color-mix(in_srgb,#f87171_8%,var(--background-secondary))]' : ''}
                  ${script.id === 'proximidad' ? 'hover:not(:disabled):border-[#4ade80] hover:not(:disabled):bg-[color-mix(in_srgb,#4ade80_8%,var(--background-secondary))]' : ''}
                  ${!['semaforo', 'alarma', 'proximidad'].includes(script.id) ? 'hover:not(:disabled):border-accent hover:not(:disabled):bg-[color-mix(in_srgb,var(--accent-primary)_8%,var(--background-secondary))]' : ''}
                `}
                disabled={busy}
                onClick={() => runScript(script)}
              >
                {script.id === 'semaforo' && (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                    <circle cx="12" cy="6" r="3" />
                    <circle cx="12" cy="12" r="3" />
                    <circle cx="12" cy="18" r="3" />
                    <rect x="10" y="2" width="4" height="20" />
                  </svg>
                )}
                {script.id === 'alarma' && (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                )}
                {script.id === 'proximidad' && (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
                {script.name}
              </button>
            ))}
          </div>
        </div>

        {/* Acciones globales */}
        <div className={`${cardClasses} col-span-full`}>
          <div className="flex gap-2 flex-wrap">
            <button className={`${btnClasses} py-[7px] px-3.5`} disabled={busy} onClick={ping}>PING</button>
            <button className={`${btnClasses} py-[7px] px-3.5 border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-danger hover:not(:disabled):bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:not(:disabled):border-danger flex items-center gap-2`} disabled={busy} onClick={stopAll}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
                <path d="M18.36 6.64a9 9 0 11-12.72 0M12 2v10"/>
              </svg>
              Detener todo
            </button>
          </div>
        </div>
      </section>

      <section className="flex flex-col flex-1 min-h-[120px] max-h-[300px] bg-tertiary border border-color rounded-[10px] overflow-hidden">
        <div className="flex justify-between items-center py-1.5 px-2.5 text-[11px] font-semibold text-secondary border-b border-color shrink-0">
          <span>Consola serial</span>
          <button className={`${btnClasses} py-[3px] px-2 text-[11px]`} onClick={() => setLog([])} disabled={log.length === 0}>
            limpiar
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-1.5 px-2 font-mono text-[11px] leading-[1.5] scroll-smooth [scrollbar-width:thin] [scrollbar-color:var(--border-subtle)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[var(--border-subtle)] [&::-webkit-scrollbar-thumb]:rounded-[3px]">
          {log.length === 0 && <div className="text-secondary italic p-1.5">Sin actividad aún.</div>}
          {log.map((e, i) => (
            <div key={i} className="grid grid-cols-[64px_16px_1fr] gap-1.5 py-[1px] px-0.5">
              <span className="text-secondary tabular-nums">{e.ts}</span>
              <span className={`text-center font-bold ${e.direction === 'tx' ? 'text-accent' : e.direction === 'rx' ? 'text-success' : e.direction === 'err' ? 'text-danger' : 'text-secondary'}`}>
                {e.direction === 'tx' ? '→' : e.direction === 'rx' ? '←' : e.direction === 'err' ? '⚠' : 'i'}
              </span>
              <span className={e.direction === 'err' ? 'text-danger' : ''}>{e.text}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </section>
    </div>
  )
}

export default DomoticaPanel
