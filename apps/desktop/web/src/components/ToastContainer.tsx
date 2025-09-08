import React from 'react'
import { useToasts } from '../contexts/ToastContext'
import './ToastContainer.css'

export default function ToastContainer(){
  const { toasts, remove } = useToasts()
  return (
    <div className="toast-root">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`} onClick={() => remove(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
