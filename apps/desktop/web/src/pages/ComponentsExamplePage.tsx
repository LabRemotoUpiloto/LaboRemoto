import React, { useState } from 'react'
import Alert from '../components/ui/Alert'
import Badge from '../components/ui/Badge'
import './ComponentsExamplePage.css'

/**
 * Página de ejemplo para demostrar los nuevos componentes UI:
 * - Alert (con 4 variantes)
 * - Badge (con 7 variantes y 3 tamaños)
 * 
 * Esta página sirve como showcase y referencia para desarrolladores.
 */
export default function ComponentsExamplePage() {
  const [alerts, setAlerts] = useState([
    { id: 1, variant: 'success' as const, message: 'Conexión establecida correctamente' },
    { id: 2, variant: 'warning' as const, message: 'La sesión expirará en 5 minutos' },
    { id: 3, variant: 'danger' as const, message: 'Error al conectar con el servidor SSH' },
    { id: 4, variant: 'info' as const, message: 'Nueva actualización disponible' },
  ])

  const removeAlert = (id: number) => {
    setAlerts(alerts.filter(a => a.id !== id))
  }

  return (
    <div className="page-content components-example-page">
      <h2 className="page-title">Componentes UI</h2>
      <p className="page-description">
        Demostración de los nuevos componentes reutilizables con el sistema de diseño v2.0
      </p>

      {/* ==================== ALERTS ==================== */}
      <section className="component-section">
        <div className="section-header">
          <h3 className="section-title">Alertas</h3>
          <Badge variant="info" size="sm">4 variantes</Badge>
        </div>
        <p className="section-description">
          Componente de alerta con soporte para múltiples variantes y estados.
          Usa las nuevas variables CSS de estado (--success-bg, --warning-bg, etc.)
        </p>

        <div className="examples-grid">
          {alerts.map(alert => (
            <Alert
              key={alert.id}
              variant={alert.variant}
              title={alert.variant.charAt(0).toUpperCase() + alert.variant.slice(1)}
              message={alert.message}
              dismissible
              onClose={() => removeAlert(alert.id)}
            />
          ))}
        </div>

        {/* Código de ejemplo */}
        <details className="code-example">
          <summary>Ver código</summary>
          <pre className="code-block">
{`<Alert 
  variant="success" 
  title="Éxito"
  message="Conexión establecida correctamente"
  dismissible
  onClose={handleClose}
/>`}
          </pre>
        </details>
      </section>

      {/* ==================== BADGES ==================== */}
      <section className="component-section">
        <div className="section-header">
          <h3 className="section-title">Badges</h3>
          <Badge variant="info" size="sm">7 variantes × 3 tamaños</Badge>
        </div>
        <p className="section-description">
          Sistema de badges con jerarquía visual clara. Soporta iconos y estados clickeables.
        </p>

        {/* Variantes */}
        <div className="subsection">
          <h4 className="subsection-title">Variantes</h4>
          <div className="badges-row">
            <Badge variant="primary">Primary</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
            <Badge variant="info">Info</Badge>
            <Badge variant="neutral">Neutral</Badge>
          </div>
        </div>

        {/* Tamaños */}
        <div className="subsection">
          <h4 className="subsection-title">Tamaños</h4>
          <div className="badges-row">
            <Badge variant="primary" size="sm">Small</Badge>
            <Badge variant="primary" size="md">Medium</Badge>
            <Badge variant="primary" size="lg">Large</Badge>
          </div>
        </div>

        {/* Con iconos */}
        <div className="subsection">
          <h4 className="subsection-title">Con Iconos</h4>
          <div className="badges-row">
            <Badge variant="success" icon="✓">Conectado</Badge>
            <Badge variant="warning" icon="⚠">Advertencia</Badge>
            <Badge variant="danger" icon="✕">Desconectado</Badge>
            <Badge variant="info" icon="ℹ">Información</Badge>
            <Badge variant="primary" icon="⭐">Premium</Badge>
          </div>
        </div>

        {/* Clickeables */}
        <div className="subsection">
          <h4 className="subsection-title">Clickeables</h4>
          <div className="badges-row">
            <Badge 
              variant="primary" 
              icon="🔧"
              onClick={() => alert('Badge clicked!')}
            >
              Configurar
            </Badge>
            <Badge 
              variant="secondary" 
              icon="📁"
              onClick={() => alert('Badge clicked!')}
            >
              Archivos
            </Badge>
            <Badge 
              variant="info" 
              icon="💡"
              onClick={() => alert('Badge clicked!')}
            >
              Tips
            </Badge>
          </div>
        </div>

        {/* Código de ejemplo */}
        <details className="code-example">
          <summary>Ver código</summary>
          <pre className="code-block">
{`<Badge variant="success" size="md" icon="✓">
  Conectado
</Badge>

<Badge 
  variant="primary" 
  icon="🔧"
  onClick={handleClick}
>
  Clickeable
</Badge>`}
          </pre>
        </details>
      </section>

      {/* ==================== CASOS DE USO ==================== */}
      <section className="component-section">
        <div className="section-header">
          <h3 className="section-title">Casos de Uso Reales</h3>
        </div>

        {/* Estado de conexión */}
        <div className="use-case">
          <h4 className="use-case-title">Estado de Conexión SSH</h4>
          <div className="use-case-content">
            <Badge variant="success" icon="●" className="badge-pulse">
              Conectado - 200.115.181.211
            </Badge>
            <Badge variant="danger" icon="●">
              Desconectado
            </Badge>
            <Badge variant="warning" icon="●">
              Reconectando...
            </Badge>
          </div>
        </div>

        {/* Notificaciones de sistema */}
        <div className="use-case">
          <h4 className="use-case-title">Notificaciones del Sistema</h4>
          <div className="use-case-content">
            <Alert
              variant="success"
              title="Archivo guardado"
              message="config.json se guardó correctamente en /home/user/"
            />
            <Alert
              variant="info"
              title="Nueva versión disponible"
              message="v2.0.1 incluye mejoras de rendimiento y correcciones"
            />
          </div>
        </div>

        {/* Tags de archivos */}
        <div className="use-case">
          <h4 className="use-case-title">Tags de Archivos</h4>
          <div className="use-case-content badges-row">
            <Badge variant="secondary" size="sm">.txt</Badge>
            <Badge variant="primary" size="sm">.js</Badge>
            <Badge variant="success" size="sm">.md</Badge>
            <Badge variant="warning" size="sm">.json</Badge>
            <Badge variant="danger" size="sm">.log</Badge>
            <Badge variant="info" size="sm">.css</Badge>
          </div>
        </div>
      </section>

      {/* ==================== GUÍA DE USO ==================== */}
      <section className="component-section">
        <div className="section-header">
          <h3 className="section-title">Guía de Uso</h3>
        </div>

        <div className="guide-content">
          <h4>Cuándo usar Alertas</h4>
          <ul>
            <li><strong>Success:</strong> Confirmaciones de acciones completadas</li>
            <li><strong>Warning:</strong> Información importante que requiere atención</li>
            <li><strong>Danger:</strong> Errores o acciones destructivas</li>
            <li><strong>Info:</strong> Información general o tips</li>
          </ul>

          <h4>Cuándo usar Badges</h4>
          <ul>
            <li><strong>Primary:</strong> Elemento destacado o principal</li>
            <li><strong>Secondary:</strong> Información secundaria o metadatos</li>
            <li><strong>Success/Warning/Danger:</strong> Estados del sistema</li>
            <li><strong>Info:</strong> Información adicional o tooltips</li>
            <li><strong>Neutral:</strong> Tags o categorías genéricas</li>
          </ul>

          <div className="guide-note">
            <strong>💡 Tip:</strong> Para más información sobre el sistema de colores,
            consulta <code>COLOR_GUIDE.md</code> en la raíz del proyecto.
          </div>
        </div>
      </section>
    </div>
  )
}
