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
        {/* Luces — Interruptores visuales con bombilla */}
        <div className="dom-card">
          <div className="dom-card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18h6M10 22h4M12 2v1M12 2a6 6 0 00-6 6c0 1.5.5 2.5 1.5 3.5L9 14h6l1.5-2.5C17.5 10.5 18 9.5 18 8a6 6 0 00-6-6z"/></svg>
            Bombillos
          </div>
          <div className="dom-toggle-row">
            <button
              type="button"
              className={`dom-toggle ${luz1 ? 'on' : ''}`}
              onClick={() => toggleLuz(1)}
              disabled={busy}
            >
              <span className="dom-bulb">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18h6M10 22h4M12 2v1M12 2a6 6 0 00-6 6c0 1.5.5 2.5 1.5 3.5L9 14h6l1.5-2.5C17.5 10.5 18 9.5 18 8a6 6 0 00-6-6z"/></svg>
              </span>
              <span>Bombillo 1</span>
              <span className="dom-state">{luz1 ? 'ENCENDIDO' : 'APAGADO'}</span>
            </button>
            <button
              type="button"
              className={`dom-toggle ${luz2 ? 'on' : ''}`}
              onClick={() => toggleLuz(2)}
              disabled={busy}
            >
              <span className="dom-bulb">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18h6M10 22h4M12 2v1M12 2a6 6 0 00-6 6c0 1.5.5 2.5 1.5 3.5L9 14h6l1.5-2.5C17.5 10.5 18 9.5 18 8a6 6 0 00-6-6z"/></svg>
              </span>
              <span>Bombillo 2</span>
              <span className="dom-state">{luz2 ? 'ENCENDIDO' : 'APAGADO'}</span>
            </button>
          </div>
        </div>

        {/* Motor continuo — Controles con iconos grandes */}
        <div className="dom-card">
          <div className="dom-card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
            Motor continuo <span className="dom-muted">(pin 3)</span>
          </div>
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
          <div className="dom-motor-controls">
            <button className="dom-motor-btn" disabled={busy} onClick={() => commitMotor(0)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              Izquierda
            </button>
            <button className="dom-motor-btn stop" disabled={busy} onClick={() => commitMotor(90)}>
              <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
              Stop
            </button>
            <button className="dom-motor-btn" disabled={busy} onClick={() => commitMotor(180)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              Derecha
            </button>
          </div>
        </div>

        {/* Sensor distancia — Display estilo gauge */}
        <div className="dom-card">
          <div className="dom-card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="3"/></svg>
            Sensor HC-SR04 <span className="dom-muted">(trig 5 · echo 6)</span>
          </div>
          <div className="dom-sensor-row">
            <div className="dom-sensor-display">
              <div className="dom-sensor-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
              <div className="dom-sensor-info">
                {distancia ? (
                  <>
                    <span className={`dom-sensor-value ${(parseFloat(distancia) < 20 && distancia !== 'sin eco') ? 'in-range' : ''}`}>
                      {distancia.replace(' cm', '').replace('sin eco', '—')}
                    </span>
                    <span className="dom-sensor-unit">{distancia.includes('sin eco') ? 'Sin eco' : 'centímetros'}</span>
                  </>
                ) : (
                  <span className="dom-sensor-waiting">Presiona Medir</span>
                )}
              </div>
            </div>
            <button className="dom-btn" disabled={busy} onClick={medirDist}>Medir</button>
          </div>
        </div>

        {/* LCD I2C — Estilo pantalla física */}
        <div className="dom-card dom-card--span">
          <div className="dom-card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h12M6 12h12M6 16h8"/></svg>
            Pantalla LCD I2C <span className="dom-muted">(16x2 · SDA 20 · SCL 21)</span>
          </div>
          <div className="dom-lcd-screen">
            <div className={`dom-lcd-line ${!lcdLine1 ? 'empty' : ''}`}>{lcdLine1 || '________________'}</div>
            <div className={`dom-lcd-line ${!lcdLine2 ? 'empty' : ''}`}>{lcdLine2 || '________________'}</div>
          </div>
          <div className="dom-lcd">
            <div className="dom-lcd-row">
              <input
                type="text"
                className="dom-input"
                placeholder="Escribe línea 1..."
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
                placeholder="Escribe línea 2..."
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

        {/* Scripts guardados — Tarjetas grandes */}
        <div className="dom-card dom-card--span">
          <div className="dom-card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Scripts guardados
          </div>
          <div className="dom-scripts-grid">
            {scripts.map(script => (
              <button
                key={script.id}
                className={`dom-script-btn ${script.id}`}
                disabled={busy}
                onClick={() => runScript(script)}
              >
                {script.id === 'semaforo' && (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="6" r="3" />
                    <circle cx="12" cy="12" r="3" />
                    <circle cx="12" cy="18" r="3" />
                    <rect x="10" y="2" width="4" height="20" />
                  </svg>
                )}
                {script.id === 'alarma' && (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                )}
                {script.id === 'proximidad' && (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}>
                <path d="M18.36 6.64a9 9 0 11-12.72 0M12 2v10"/>
              </svg>
              Detener todo
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
