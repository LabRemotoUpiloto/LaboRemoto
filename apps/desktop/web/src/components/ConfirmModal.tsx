import React from 'react'
import './ConfirmModal.css'

type Props = {
  open: boolean
  title?: string
  message?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ open, title='Confirm', message='Are you sure?', onConfirm, onCancel }: Props){
  if (!open) return null
  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3>{title}</h3>
        <p>{message}</p>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
          <button onClick={onCancel}>Cancelar</button>
          <button className="danger" onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}
