import React from 'react'
import './PinDetailPanel.css'

interface Pin {
  number: number
  name: string
  type: 'power' | 'ground' | 'gpio'
  function?: string
  color: string
  description: string
}

interface PinDetailPanelProps {
  pin: Pin | null
  onClose: () => void
  sessionId?: string
}

const PinDetailPanel: React.FC<PinDetailPanelProps> = ({ pin, onClose, sessionId }) => {
  if (!pin) {
    return (
      <div className="pin-detail-panel">
        <div className="pin-detail-empty">
          <div className="empty-icon">📌</div>
          <h3>Selecciona un Pin</h3>
          <p>Haz clic en cualquier pin de la izquierda para ver sus detalles y configuraciones.</p>
        </div>
      </div>
    )
  }

  const getPinTypeInfo = (type: string) => {
    switch (type) {
      case 'power':
        return {
          icon: '⚡',
          label: 'Alimentación',
          description: 'Pin de alimentación eléctrica'
        }
      case 'ground':
        return {
          icon: '🔌',
          label: 'Tierra',
          description: 'Pin de referencia de tierra (0V)'
        }
      case 'gpio':
        return {
          icon: '🔧',
          label: 'GPIO',
          description: 'Pin de entrada/salida de propósito general'
        }
      default:
        return {
          icon: '❓',
          label: 'Desconocido',
          description: 'Tipo de pin no identificado'
        }
    }
  }

  const pinType = getPinTypeInfo(pin.type)

  return (
    <div className="pin-detail-panel">
      <div className="pin-detail-header">
        <div className="pin-header-info">
          <div className="pin-main-indicator">
            <div 
              className="pin-main-color"
              style={{ backgroundColor: pin.color }}
            />
            <div className="pin-main-number">{pin.number}</div>
          </div>
          <div className="pin-header-text">
            <h2>{pin.name}</h2>
            <p className="pin-description">{pin.description}</p>
          </div>
        </div>
        <button 
          className="pin-close-btn"
          onClick={onClose}
          title="Cerrar panel"
        >
          ✕
        </button>
      </div>

      <div className="pin-detail-content">
        <div className="pin-info-section">
          <h3>Información del Pin</h3>
          <div className="pin-info-grid">
            <div className="pin-info-item">
              <div className="pin-info-label">Número</div>
              <div className="pin-info-value">{pin.number}</div>
            </div>
            <div className="pin-info-item">
              <div className="pin-info-label">Tipo</div>
              <div className="pin-info-value">
                <span className="pin-type-badge">
                  <span className="pin-type-icon">{pinType.icon}</span>
                  {pinType.label}
                </span>
              </div>
            </div>
            <div className="pin-info-item">
              <div className="pin-info-label">Función</div>
              <div className="pin-info-value">{pin.function || 'N/A'}</div>
            </div>
            <div className="pin-info-item">
              <div className="pin-info-label">Descripción</div>
              <div className="pin-info-value">{pinType.description}</div>
            </div>
          </div>
        </div>

        {pin.type === 'gpio' && (
          <div className="pin-controls-section">
            <h3>Controles GPIO</h3>
            <div className="gpio-controls">
              <div className="gpio-control-group">
                <label>Modo</label>
                <select className="gpio-select">
                  <option value="input">Entrada</option>
                  <option value="output">Salida</option>
                </select>
              </div>
              <div className="gpio-control-group">
                <label>Estado</label>
                <select className="gpio-select">
                  <option value="low">Bajo (0V)</option>
                  <option value="high">Alto (3.3V)</option>
                </select>
              </div>
              <div className="gpio-control-group">
                <label>Pull</label>
                <select className="gpio-select">
                  <option value="none">Ninguno</option>
                  <option value="up">Pull-up</option>
                  <option value="down">Pull-down</option>
                </select>
              </div>
            </div>
            <div className="gpio-actions">
              <button className="gpio-btn primary">Aplicar Configuración</button>
              <button className="gpio-btn secondary">Leer Estado</button>
            </div>
          </div>
        )}

        {pin.type === 'power' && (
          <div className="pin-power-info">
            <h3>Información de Alimentación</h3>
            <div className="power-status">
              <div className="power-indicator">
                <div className="power-led" />
                <span>Voltaje disponible</span>
              </div>
              <div className="power-specs">
                <div className="power-spec">
                  <span>Voltaje:</span>
                  <span>{pin.name}</span>
                </div>
                <div className="power-spec">
                  <span>Corriente máx:</span>
                  <span>~50mA</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {pin.type === 'ground' && (
          <div className="pin-ground-info">
            <h3>Información de Tierra</h3>
            <div className="ground-status">
              <div className="ground-indicator">
                <div className="ground-symbol">⛓️</div>
                <span>Referencia común</span>
              </div>
              <div className="ground-specs">
                <div className="ground-spec">
                  <span>Voltaje:</span>
                  <span>0V</span>
                </div>
                <div className="ground-spec">
                  <span>Resistencia:</span>
                  <span>~0Ω</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default PinDetailPanel
