import React from 'react'
import './SweetAlert.css'

type SweetAlertType = 'success' | 'error' | 'warning' | 'info' | 'question'

type Props = {
  open: boolean
  type?: SweetAlertType
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  showCancel?: boolean
  onConfirm: () => void
  onCancel?: () => void
  loading?: boolean
}

const icons: Record<SweetAlertType, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
  question: '?'
}

export default function SweetAlert({ 
  open, 
  type = 'question', 
  title, 
  message, 
  confirmText = 'Confirmar', 
  cancelText = 'Cancelar',
  showCancel = true,
  onConfirm, 
  onCancel,
  loading = false 
}: Props) {
  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading && onCancel) {
      onCancel()
    }
  }

  return (
    <div className="sweet-alert-overlay" onClick={handleBackdropClick}>
      <div className="sweet-alert-container">
        <div className={`sweet-alert-icon sweet-alert-icon-${type}`}>
          <span className="sweet-alert-icon-symbol">{icons[type]}</span>
        </div>
        
        <h2 className="sweet-alert-title">{title}</h2>
        
        {message && <p className="sweet-alert-message">{message}</p>}
        
        <div className="sweet-alert-actions">
          {showCancel && onCancel && (
            <button 
              className="sweet-alert-btn sweet-alert-btn-cancel" 
              onClick={onCancel}
              disabled={loading}
            >
              {cancelText}
            </button>
          )}
          <button 
            className={`sweet-alert-btn sweet-alert-btn-confirm sweet-alert-btn-confirm-${type}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Procesando...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
