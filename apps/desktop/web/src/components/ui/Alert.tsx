import React from 'react'
import './Alert.css'

export type AlertVariant = 'success' | 'warning' | 'danger' | 'info'

export interface AlertProps {
  variant: AlertVariant
  title?: string
  message: string
  icon?: React.ReactNode
  onClose?: () => void
  dismissible?: boolean
  className?: string
}

/**
 * Componente de alerta reutilizable con soporte para múltiples variantes.
 * Usa las nuevas variables CSS de estado (--success-bg, --warning-bg, etc.)
 * 
 * @example
 * ```tsx
 * <Alert 
 *   variant="success" 
 *   title="Conexión exitosa"
 *   message="Conectado a servidor SSH" 
 * />
 * ```
 */
const Alert: React.FC<AlertProps> = ({
  variant,
  title,
  message,
  icon,
  onClose,
  dismissible = false,
  className = ''
}) => {
  const defaultIcons = {
    success: '✓',
    warning: '⚠',
    danger: '✕',
    info: 'ℹ'
  }

  const displayIcon = icon ?? defaultIcons[variant]

  return (
    <div className={`alert alert-${variant} ${className}`} role="alert">
      {displayIcon && (
        <div className="alert-icon" aria-hidden="true">
          {displayIcon}
        </div>
      )}
      
      <div className="alert-content">
        {title && <div className="alert-title">{title}</div>}
        <div className="alert-message">{message}</div>
      </div>

      {dismissible && onClose && (
        <button
          className="alert-close"
          onClick={onClose}
          aria-label="Cerrar alerta"
          type="button"
        >
          ✕
        </button>
      )}
    </div>
  )
}

export default Alert
