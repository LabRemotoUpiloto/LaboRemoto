import React, { useState, useEffect, useRef } from 'react'
import './PromptModal.css'

type Props = {
  open: boolean
  title?: string
  message?: string
  placeholder?: string
  defaultValue?: string
  onConfirm: (value: string) => void
  onCancel: () => void
  confirmLabel?: string
  cancelLabel?: string
}

export default function PromptModal({ 
  open, 
  title = 'Input', 
  message = '', 
  placeholder = '',
  defaultValue = '',
  onConfirm, 
  onCancel, 
  confirmLabel = 'Aceptar', 
  cancelLabel = 'Cancelar'
}: Props) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue(defaultValue)
      // Focus el input cuando se abre el modal
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open, defaultValue])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim()) {
      onConfirm(value.trim())
    }
  }

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {message && <p>{message}</p>}
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="prompt-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
          />
          <div className="modal-buttons">
            <button type="button" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button type="submit" className="primary" disabled={!value.trim()}>
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
