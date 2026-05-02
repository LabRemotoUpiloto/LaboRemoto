import React from 'react';
import { formatBytes } from '../shared/fileFormatters';

export interface Transfer {
  id: string;
  direction: 'upload' | 'download';
  local_path: string;
  remote_path: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  bytes?: number;
  total?: number;
  message?: string;
  session_id?: string;
}

export interface TransfersPanelProps {
  transfers: Transfer[];
  onCancel: (transferId: string) => void;
  onClear?: () => void;
}

const TransfersPanel: React.FC<TransfersPanelProps> = ({ transfers, onCancel, onClear }) => {
  // Count completed/cancelled/error transfers
  const completedCount = transfers.filter(t => 
    t.status === 'done' || t.status === 'cancelled' || t.status === 'error'
  ).length;
  
  const hasCompletedTransfers = completedCount > 0;
  
  return (
    <div className="col-span-1 md:col-span-2 flex flex-col max-h-[190px] min-h-[80px] bg-gradient-to-br from-secondary to-tertiary rounded-xl border-2 border-subtle overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.12),0_4px_16px_rgba(0,0,0,0.08)]">
      <div className="flex items-center gap-2 py-2 px-3 bg-tertiary border-b border-subtle min-h-[38px]">
        <strong className="font-semibold text-[13px] text-primary">Transferencias</strong>
        <span className="inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 bg-interactive border border-subtle rounded-full text-[11px] font-semibold text-primary">{transfers.length}</span>
        {hasCompletedTransfers && onClear && (
          <button 
            className="inline-flex items-center gap-[5px] ml-auto px-2.5 h-[26px] bg-transparent border border-subtle rounded-md text-secondary text-[11px] font-semibold cursor-pointer transition-all duration-200 select-none hover:bg-white/5 hover:border-strong hover:text-primary hover:-translate-y-[1px] active:translate-y-0 active:bg-white/10 group"
            onClick={onClear}
            title="Limpiar transferencias completadas"
            aria-label="Limpiar transferencias completadas"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 opacity-80 transition-opacity duration-200 group-hover:opacity-100">
              <path d="M2 4h12M5.5 4V2.5A1.5 1.5 0 0 1 7 1h2a1.5 1.5 0 0 1 1.5 1.5V4m2 0v9.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 2.5 13.5V4h11zM6.5 7v4M9.5 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Limpiar
          </button>
        )}
      </div>
      
      {transfers.length === 0 ? (
        <div className="flex items-center justify-center py-8 px-5 text-center text-muted text-[13px] opacity-70" aria-live="polite">
          No hay transferencias activas
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar" aria-live="polite">
          {transfers.map(t => {
            // Calculate percentage
            let pct: number | undefined;
            if (t.status === 'done') {
              pct = 100;
            } else if (t.total && t.total > 0) {
              pct = Math.min(100, Math.floor(((t.bytes || 0) / t.total) * 100));
            }
            
            const isRunning = t.status === 'running';
            const isError = t.status === 'error';
            const isDone = t.status === 'done';
            
            const statusLabel = isRunning ? 'En progreso' 
              : isDone ? 'Completado' 
              : isError ? 'Error' 
              : 'Cancelado';
            
            const progressText = pct !== undefined ? `${pct}%` 
              : isRunning 
                ? (t.total ? formatBytes(t.bytes || 0) : `${t.bytes || 0} B`)
              : isDone ? '100%' 
              : '—';
            
            return (
              <div key={t.id} className={`grid grid-cols-[55px_1fr_auto_auto] grid-rows-[auto_auto] gap-y-1.5 gap-x-2.5 items-center py-2 px-3 border-b border-subtle transition-all duration-200 relative last:border-b-0 hover:bg-white/5 ${isRunning ? 'bg-accent/5' : isError ? 'bg-danger/5' : isDone ? 'opacity-70' : ''}`} style={{ gridTemplateAreas: '"icon path status cancel" "icon progress progress progress"' }}>
                {/* Icon with inline label */}
                <div style={{ gridArea: 'icon' }} className={`flex flex-col items-center justify-center gap-[3px] w-[55px] py-[5px] px-1 rounded-md bg-interactive border border-subtle transition-opacity duration-250 cursor-default select-none ${t.direction === 'download' ? 'text-blue-400' : 'text-accent'} ${isRunning ? 'animate-pulse' : ''}`}>
                  <div className="text-[16px] font-bold leading-none">
                    {t.direction === 'download' ? '↓' : '↑'}
                  </div>
                  <span className="text-[8px] font-bold uppercase tracking-[0.5px] leading-none opacity-70">
                    {t.direction === 'download' ? 'Downloaded' : 'Uploaded'}
                  </span>
                </div>
                
                {/* Path info */}
                <div style={{ gridArea: 'path' }} className="min-w-0 flex flex-col gap-1">
                  <div className="text-[11px] text-primary whitespace-nowrap overflow-hidden text-ellipsis leading-[1.2]">
                    {t.direction === 'download' ? t.remote_path : t.local_path}
                    <span className="opacity-50 mx-1">→</span>
                    {t.direction === 'download' ? t.local_path : t.remote_path}
                  </div>
                </div>
                
                {/* Status badge */}
                <div style={{ gridArea: 'status' }} className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md text-[10px] font-semibold uppercase tracking-[0.3px] whitespace-nowrap ${isRunning ? 'bg-accent/15 text-accent border border-accent/30' : isDone ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30' : isError ? 'bg-danger/15 text-danger border border-danger/30' : 'bg-muted/15 text-muted border border-muted/30'}`}>
                  {statusLabel}
                </div>
                
                {/* Cancel button */}
                <button 
                  style={{ gridArea: 'cancel' }}
                  className="inline-flex items-center justify-center w-6 h-6 p-0 rounded-md bg-transparent border border-subtle text-secondary text-[14px] leading-none cursor-pointer transition-all duration-150 hover:not(:disabled):bg-danger hover:not(:disabled):border-danger hover:not(:disabled):text-white hover:not(:disabled):scale-105 active:not(:disabled):scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    onCancel(t.id); 
                  }}
                  disabled={!isRunning}
                  title="Cancelar transferencia"
                  aria-label="Cancelar transferencia"
                >
                  ×
                </button>
                
                {/* Progress bar with percentage */}
                <div style={{ gridArea: 'progress' }} className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-white/10 rounded-[3px] overflow-hidden relative shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]">
                    <div 
                      className={`h-full transition-[width] duration-300 rounded-[3px] relative overflow-hidden ${isError ? 'bg-gradient-to-r from-danger to-danger/80' : isDone ? 'bg-gradient-to-r from-emerald-500 to-emerald-500/80' : 'bg-gradient-to-r from-accent to-[#0da574]'}`}
                      style={{ width: `${pct ?? 0}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-secondary whitespace-nowrap min-w-[42px] text-right tabular-nums">
                    {progressText}
                  </span>
                </div>
                
                {/* Optional error message */}
                {t.message && (
                  <div className={`col-span-3 text-[11px] -mt-1 ${isError ? 'text-danger' : 'text-muted'}`}>
                    {t.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TransfersPanel;
