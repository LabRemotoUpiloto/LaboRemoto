import React from 'react'

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

  // Clases dinámicas basadas en el tipo
  const iconStyles = {
    success: 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success)] before:bg-[var(--success)]',
    error: 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger)] before:bg-[var(--danger)]',
    warning: 'bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning)] before:bg-[var(--warning)]',
    info: 'bg-[var(--info-bg)] border-[var(--info-border)] text-[var(--info)] before:bg-[var(--info)]',
    question: 'bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] border-[color-mix(in_srgb,var(--accent-primary)_30%,transparent)] text-[var(--accent-primary)] before:bg-[var(--accent-primary)]'
  }

  const confirmBtnStyles = {
    success: 'bg-gradient-to-br from-[var(--success)] to-[#16A34A] text-[var(--text-inverse)] border-[var(--success-border)]',
    error: 'bg-gradient-to-br from-[var(--danger)] to-[#DC2626] text-white border-[var(--danger-border)]',
    warning: 'bg-gradient-to-br from-[var(--danger)] to-[#DC2626] text-white border-[var(--danger-border)]', // Note: using danger colors per original CSS for warning confirm
    info: 'bg-gradient-to-br from-[var(--info)] to-[#06B6D4] text-[var(--text-inverse)] border-[var(--info-border)]',
    question: 'bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-primary-hover)] text-[var(--text-inverse)] border-[color-mix(in_srgb,var(--accent-primary)_80%,transparent)]'
  }

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-5 animate-[sweetAlertFadeIn_0.2s_ease-out] motion-reduce:animate-none" 
      onClick={handleBackdropClick}
    >
      <div className="bg-secondary rounded-2xl pt-8 pb-6 px-7 max-w-[420px] w-full shadow-[0_20px_60px_rgba(0,0,0,0.4),0_0_0_1px_var(--border-subtle),inset_0_1px_0_rgba(255,255,255,0.05)] animate-[sweetAlertSlideIn_0.3s_cubic-bezier(0.4,0,0.2,1)] motion-reduce:animate-none relative max-sm:p-5 max-sm:mx-4 max-sm:pt-7">
        
        <div className={`w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center relative border-2 animate-[sweetAlertIconPulse_0.5s_ease-out] motion-reduce:animate-none max-sm:w-[70px] max-sm:h-[70px] max-sm:mb-5 ${iconStyles[type]}`}>
          {/* Anillo exterior animado */}
          <div className={`absolute -inset-1 rounded-full opacity-20 animate-[sweetAlertIconRing_2s_ease-in-out_infinite] motion-reduce:animate-none ${iconStyles[type].match(/before:bg-\[.*?\]/)?.[0].replace('before:', '')}`}></div>
          <span className="text-[42px] font-bold leading-none relative z-10 max-sm:text-[36px]">{icons[type]}</span>
        </div>
        
        <h2 className="text-[22px] font-bold text-primary m-0 mb-3 text-center leading-snug tracking-tight max-sm:text-xl">{title}</h2>
        
        {message && <p className="text-[14px] text-secondary m-0 mb-7 text-center leading-relaxed max-sm:text-[13px] max-sm:mb-6">{message}</p>}
        
        <div className="flex gap-3 justify-center max-sm:flex-col-reverse">
          {showCancel && onCancel && (
            <button 
              className="py-3 px-6 rounded-lg border border-color bg-transparent text-secondary text-sm font-semibold cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] min-w-[100px] relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed hover:not(:disabled):bg-tertiary hover:not(:disabled):border-strong hover:not(:disabled):text-primary hover:not(:disabled):-translate-y-0.5 active:not(:disabled):translate-y-0 motion-reduce:hover:transform-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent max-sm:w-full" 
              onClick={onCancel}
              disabled={loading}
            >
              {cancelText}
            </button>
          )}
          <button 
            className={`py-3 px-6 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] min-w-[100px] relative overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] disabled:opacity-50 disabled:cursor-not-allowed hover:not(:disabled):-translate-y-0.5 hover:not(:disabled):shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] active:not(:disabled):translate-y-0 active:not(:disabled):shadow-[0_1px_4px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] motion-reduce:hover:transform-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent max-sm:w-full ${confirmBtnStyles[type]}`}
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
