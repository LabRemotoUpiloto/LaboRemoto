import React from 'react'
import { useLoading } from '../../contexts/LoadingContext'
import './GlobalLoader.css'

export default function GlobalLoader() {
  const { loading, label, onCancel } = useLoading()
  
  if (!loading) return null
  
  return (
    <div className="global-loading-overlay" role="status" aria-live="polite">
      <div className="global-loading-box">
        {/* Spinner animado */}
        <div className="global-loading-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
        <div className="loading-text">{label ?? 'Cargando...'}</div>
        <p className="loading-subtitle">
          Espera mientras se establece la conexión
        </p>
        {onCancel && (
          <button
            className="loading-cancel-btn"
            onClick={onCancel}
            title="Cancelar conexión"
          >
            Cancelar conexión
          </button>
        )}
      </div>
    </div>
  )
}
