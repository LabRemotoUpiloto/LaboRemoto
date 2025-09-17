import React from 'react'
import { useLoading } from '../contexts/LoadingContext'
import './GlobalLoader.css'

export default function GlobalLoader() {
  const { loading, label } = useLoading()
  if (!loading) return null
  return (
    <div className="global-loading-overlay" role="status" aria-live="polite">
      <div className="global-loading-box">
        {/* Spinner con clase única para evitar colisiones con otras .spinner globales */}
        <div className="global-spinner" aria-hidden></div>
        <div className="loading-text">{label ?? 'Cargando...'}</div>
      </div>
    </div>
  )
}
