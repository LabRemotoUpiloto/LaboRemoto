import React from 'react'
import { useLoading } from '../../contexts/LoadingContext'

export default function GlobalLoader() {
  const { loading, label, onCancel } = useLoading()
  
  if (!loading) return null
  
  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] animate-[fadeIn_0.2s_ease-out]" 
      role="status" 
      aria-live="polite"
    >
      <div className="bg-secondary border border-color rounded-2xl py-8 px-10 max-w-[420px] w-[90%] shadow-[0_12px_40px_rgba(0,0,0,0.5)] flex flex-col items-center gap-5 animate-[slideUp_0.3s_ease-out] max-sm:py-6 max-sm:px-7 max-sm:max-w-[340px]">
        {/* Spinner animado */}
        <div className="relative w-20 h-20 flex items-center justify-center max-sm:w-[60px] max-sm:h-[60px]">
          <div className="absolute w-full h-full border-3 border-transparent border-t-accent rounded-full animate-[spin_1.5s_cubic-bezier(0.68,-0.55,0.265,1.55)_infinite]"></div>
          <div className="absolute w-[70%] h-[70%] border-3 border-transparent border-t-accent rounded-full opacity-60 animate-[spin_1.5s_cubic-bezier(0.68,-0.55,0.265,1.55)_infinite] [animation-delay:-0.5s]"></div>
          <div className="absolute w-[50%] h-[50%] border-3 border-transparent border-t-accent rounded-full opacity-30 animate-[spin_1.5s_cubic-bezier(0.68,-0.55,0.265,1.55)_infinite] [animation-delay:-1s]"></div>
        </div>
        <div className="m-0 text-lg font-semibold text-primary text-center max-sm:text-base">
          {label ?? 'Cargando...'}
        </div>
        <p className="m-0 text-sm text-secondary text-center leading-relaxed max-sm:text-[13px]">
          Espera mientras se establece la conexión
        </p>
        {onCancel && (
          <button
            className="mt-2 bg-transparent border border-color text-primary py-2.5 px-6 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 ease-in-out hover:bg-danger hover:border-danger hover:text-white hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(239,68,68,0.3)] active:translate-y-0"
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
