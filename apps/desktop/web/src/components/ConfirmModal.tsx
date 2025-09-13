import React from 'react'
import './ConfirmModal.css'

type Props = {
  open: boolean
  title?: string
  message?: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  cancelLabel?: string
  confirmClassName?: string
  loading?: boolean
}

export default function ConfirmModal({ open, title='Confirm', message='Are you sure?', onConfirm, onCancel, confirmLabel='Eliminar', cancelLabel='Cancelar', confirmClassName='danger', loading=false }: Props){
  if (!open) return null
  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3>{title}</h3>
        <p>{message}</p>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
          <button onClick={onCancel} disabled={loading}>{cancelLabel}</button>
          <button className={confirmClassName} onClick={onConfirm} disabled={loading}>
            {loading ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
