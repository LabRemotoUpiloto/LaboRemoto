import React from 'react'
import { useLoading } from '../contexts/LoadingContext'
import './GlobalLoader.css'

export default function GlobalLoader() {
  const { loading, label } = useLoading()
  if (!loading) return null
  return (
    <div className="global-loading-overlay" role="status" aria-live="polite">
      <div className="global-loading-box">
        <div className="spinner" aria-hidden></div>
        <div className="loading-text">{label ?? 'Cargando...'}</div>
      </div>
    </div>
  )
}
