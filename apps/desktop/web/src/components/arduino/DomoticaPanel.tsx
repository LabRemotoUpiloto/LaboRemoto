import React, { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './DomoticaPanel.css'

/**
 * Panel de control para el tablero de domótica conectado al Arduino DUE de la Pi.
 *
 * Se comunica con el bridge HTTP (`arduino-bridge.service`) a través de comandos
 * Tauri que ejecutan `curl` sobre la sesión SSH ya autenticada.
 *
 * Ver `docs/arduino_domotica.md` para la configuración del lado de la Pi y el
 * sketch `DomoticaMaster.ino` que debe estar cargado en el Arduino.
 */

type BridgeStatus = {
  port: string | null
  open: boolean
  last_error: string | null
  rx_lines: number | null
  reachable: boolean
}

type CmdResp = { response: string; http_code: number }

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
  const [servo, setServo] = useState(90)
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
      const s = await invoke<BridgeStatus>('arduino_bridge_status', { id: sessionId })
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
        const r = await invoke<CmdResp>('arduino_send_cmd', { id: sessionId, cmd })
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
  const commitServo = async (v: number) => {
    const resp = await sendCmd(`SERVO:${v}`)
    if (resp && resp.startsWith('OK')) setServo(v)
  }
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
      setServo(90)
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
    if (!status) return <span className="dom-badge dom-badge--muted">…</span>
    if (!status.reachable) return <span className="dom-badge dom-badge--err">Bridge offline</span>
    if (!status.open) return <span className="dom-badge dom-badge--warn">Serial cerrado</span>
    return <span className="dom-badge dom-badge--ok">Conectado · {status.port}</span>
  })()

  return (
    <div className="dom-panel">
      <header className="dom-header">
        <div>
          <h2 className="dom-title">Control de Domótica</h2>
          <span className="dom-subtitle">Arduino DUE · sketch DomoticaMaster</span>
        </div>
        <div className="dom-header-actions">
          {statusBadge}
          <button type="button" className="dom-btn-mini" onClick={refreshStatus} disabled={busy}>
            ↻
          </button>
        </div>
      </header>

      <section className="dom-grid">
        {/* Luces */}
        <div className="dom-card">
          <div className="dom-card-title">Bombillos</div>
          <div className="dom-row">
            <button
              type="button"
              className={`dom-toggle ${luz1 ? 'on' : ''}`}
              onClick={() => toggleLuz(1)}
              disabled={busy}
            >
              <span className="dom-bulb" />
              <span>Bombillo 1</span>
              <span className="dom-state">{luz1 ? 'ON' : 'OFF'}</span>
            </button>
            <button
              type="button"
              className={`dom-toggle ${luz2 ? 'on' : ''}`}
              onClick={() => toggleLuz(2)}
              disabled={busy}
            >
              <span className="dom-bulb" />
              <span>Bombillo 2</span>
              <span className="dom-state">{luz2 ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>

        {/* Servo 180 */}
        <div className="dom-card">
          <div className="dom-card-title">Servo 180° <span className="dom-muted">(pin 2)</span></div>
          <div className="dom-slider-row">
            <input
              type="range"
              min={0}
              max={180}
              value={servo}
              onChange={(e) => setServo(parseInt(e.target.value, 10))}
              onMouseUp={(e) => commitServo(parseInt((e.target as HTMLInputElement).value, 10))}
              onTouchEnd={(e) => commitServo(parseInt((e.target as HTMLInputElement).value, 10))}
              onKeyUp={(e) => commitServo(parseInt((e.target as HTMLInputElement).value, 10))}
              disabled={busy}
              className="dom-slider"
            />
            <span className="dom-slider-value">{servo}°</span>
          </div>
          <div className="dom-row">
            <button className="dom-btn-sec" disabled={busy} onClick={() => commitServo(0)}>0°</button>
            <button className="dom-btn-sec" disabled={busy} onClick={() => commitServo(90)}>90°</button>
            <button className="dom-btn-sec" disabled={busy} onClick={() => commitServo(180)}>180°</button>
          </div>
        </div>

        {/* Motor continuo */}
        <div className="dom-card">
          <div className="dom-card-title">Motor continuo <span className="dom-muted">(pin 3)</span></div>
          <div className="dom-slider-row">
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
              className="dom-slider"
            />
            <span className="dom-slider-value">{motor}</span>
          </div>
          <div className="dom-row">
            <button className="dom-btn-sec" disabled={busy} onClick={() => commitMotor(0)}>← Máx</button>
            <button className="dom-btn-sec" disabled={busy} onClick={() => commitMotor(90)}>■ Stop</button>
            <button className="dom-btn-sec" disabled={busy} onClick={() => commitMotor(180)}>Máx →</button>
          </div>
        </div>

        {/* Sensor distancia */}
        <div className="dom-card">
          <div className="dom-card-title">Sensor HC-SR04 <span className="dom-muted">(trig 5 · echo 6)</span></div>
          <div className="dom-distance">
            <span className="dom-distance-value">{distancia ?? '— —'}</span>
            <button className="dom-btn" disabled={busy} onClick={medirDist}>Medir</button>
          </div>
        </div>

        {/* LCD I2C */}
        <div className="dom-card dom-card--span">
          <div className="dom-card-title">Pantalla LCD I2C <span className="dom-muted">(16x2 · SDA 20 · SCL 21)</span></div>
          <div className="dom-lcd">
            <div className="dom-lcd-row">
              <input
                type="text"
                className="dom-input"
                placeholder="Línea 1..."
                value={lcdLine1}
                onChange={(e) => setLcdLine1(e.target.value)}
                disabled={busy}
                maxLength={16}
                onKeyDown={(e) => e.key === 'Enter' && sendLcd()}
              />
              <button className="dom-btn" disabled={busy || !lcdLine1.trim()} onClick={sendLcd}>Enviar</button>
            </div>
            <div className="dom-lcd-row">
              <input
                type="text"
                className="dom-input"
                placeholder="Línea 2..."
                value={lcdLine2}
                onChange={(e) => setLcdLine2(e.target.value)}
                disabled={busy}
                maxLength={16}
                onKeyDown={(e) => e.key === 'Enter' && sendLcd2()}
              />
              <button className="dom-btn" disabled={busy || !lcdLine2.trim()} onClick={sendLcd2}>Enviar</button>
            </div>
            <div className="dom-row">
              <button className="dom-btn-sec" disabled={busy} onClick={clearLcd}>Limpiar pantalla</button>
            </div>
          </div>
        </div>

        {/* Scripts guardados */}
        <div className="dom-card dom-card--span">
          <div className="dom-card-title">Scripts guardados</div>
          <div className="dom-row">
            {scripts.map(script => (
              <button
                key={script.id}
                className="dom-btn dom-btn--icon"
                disabled={busy}
                onClick={() => runScript(script)}
              >
                {script.id === 'semaforo' && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="6" r="3" />
                    <circle cx="12" cy="12" r="3" />
                    <circle cx="12" cy="18" r="3" />
                    <rect x="10" y="2" width="4" height="20" />
                  </svg>
                )}
                {script.id === 'alarma' && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                )}
                {script.id === 'proximidad' && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
        <div className="dom-card dom-card--span">
          <div className="dom-row">
            <button className="dom-btn" disabled={busy} onClick={ping}>PING</button>
            <button className="dom-btn dom-btn--danger" disabled={busy} onClick={stopAll}>
              ⏻ Detener todo
            </button>
          </div>
        </div>
      </section>

      <section className="dom-log">
        <div className="dom-log-header">
          <span>Consola serial</span>
          <button className="dom-btn-mini" onClick={() => setLog([])} disabled={log.length === 0}>
            limpiar
          </button>
        </div>
        <div className="dom-log-body">
          {log.length === 0 && <div className="dom-log-empty">Sin actividad aún.</div>}
          {log.map((e, i) => (
            <div key={i} className={`dom-log-line dom-log-line--${e.direction}`}>
              <span className="dom-log-ts">{e.ts}</span>
              <span className="dom-log-arrow">
                {e.direction === 'tx' ? '→' : e.direction === 'rx' ? '←' : e.direction === 'err' ? '⚠' : 'i'}
              </span>
              <span className="dom-log-text">{e.text}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </section>
    </div>
  )
}

export default DomoticaPanel
