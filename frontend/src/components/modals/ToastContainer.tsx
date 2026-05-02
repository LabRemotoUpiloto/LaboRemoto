import React from 'react'
import { useToasts } from '../../contexts/ToastContext'

const ICONS: Record<string, React.ReactNode> = {
  success: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  error: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  ),
  warn: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  info: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
}

const TYPE_STYLES: Record<string, string> = {
  success: 'border-l-[#4ade80] text-[#4ade80]',
  error: 'border-l-[#f87171] text-[#f87171]',
  warn: 'border-l-[#fbbf24] text-[#fbbf24]',
  info: 'border-l-[#60a5fa] text-[#60a5fa]'
}

export default function ToastContainer(){
  const { toasts, remove } = useToasts()
  return (
    <div className="fixed right-4 bottom-8 z-[11000] flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.map(t => (
        <div 
          key={t.id} 
          className={`flex items-center gap-[9px] py-[9px] pr-3 pl-[14px] rounded-[7px] shadow-[0_4px_18px_rgba(0,0,0,0.35)] cursor-pointer max-w-[320px] min-w-[200px] pointer-events-auto animate-[toast-in_0.18s_ease] bg-[#1a1d2e] border border-white/5 border-l-[3px] group ${TYPE_STYLES[t.type] || TYPE_STYLES.info}`} 
          onClick={() => remove(t.id)} 
          role="alert"
        >
          <span className="flex items-center shrink-0">{ICONS[t.type]}</span>
          <span className="flex-1 text-[12.5px] text-white/90 leading-[1.4]">{t.message}</span>
          <span className="flex items-center shrink-0 text-white/30 transition-colors duration-150 group-hover:text-white/70" aria-label="cerrar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </span>
        </div>
      ))}
    </div>
  )
}
