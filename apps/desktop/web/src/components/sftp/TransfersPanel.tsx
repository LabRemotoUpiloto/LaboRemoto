import React from 'react';
import { formatBytes } from '../fileFormatters';
import './TransfersPanel.css';
import './TransfersPanel.css';

export interface Transfer {
  id: string;
  direction: 'upload' | 'download';
  local_path: string;
  remote_path: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  bytes?: number;
  total?: number;
  message?: string;
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
    <div className="sftp-transfers">
      <div className="sftp-transfers__header">
        <strong>Transferencias</strong>
        <span className="sftp-transfers__count">{transfers.length}</span>
        {hasCompletedTransfers && onClear && (
          <button 
            className="sftp-transfers__clear-btn"
            onClick={onClear}
            title="Limpiar transferencias completadas"
            aria-label="Limpiar transferencias completadas"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 4h12M5.5 4V2.5A1.5 1.5 0 0 1 7 1h2a1.5 1.5 0 0 1 1.5 1.5V4m2 0v9.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 2.5 13.5V4h11zM6.5 7v4M9.5 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Limpiar
          </button>
        )}
      </div>
      
      {transfers.length === 0 ? (
        <div className="sftp-transfers__empty" aria-live="polite">
          No hay transferencias activas
        </div>
      ) : (
        <div className="sftp-transfers__list" aria-live="polite">
          {transfers.map(t => {
            // Calculate percentage
            let pct: number | undefined;
            if (t.status === 'done') {
              pct = 100;
            } else if (t.total && t.total > 0) {
              pct = Math.min(100, Math.floor(((t.bytes || 0) / t.total) * 100));
            }
            
            const statusClass = t.status === 'running' ? 'running' 
              : t.status === 'error' ? 'error' 
              : t.status === 'done' ? 'done' 
              : 'cancelled';
            
            const itemClass = `sftp-transfer-item sftp-transfer-item--${statusClass}`;
            
            const statusLabel = t.status === 'running' ? 'En progreso' 
              : t.status === 'done' ? 'Completado' 
              : t.status === 'error' ? 'Error' 
              : 'Cancelado';
            
            const progressText = pct !== undefined ? `${pct}%` 
              : t.status === 'running' 
                ? (t.total ? formatBytes(t.bytes || 0) : `${t.bytes || 0} B`)
              : t.status === 'done' ? '100%' 
              : '—';
            
            return (
              <div key={t.id} className={itemClass}>
                {/* Icon with inline label */}
                <div className={`sftp-transfer__icon-wrapper sftp-transfer__icon-wrapper--${t.direction}`}>
                  <div className="sftp-transfer__icon-symbol">
                    {t.direction === 'download' ? '↓' : '↑'}
                  </div>
                  <span className="sftp-transfer__icon-label">
                    {t.direction === 'download' ? 'Downloaded' : 'Uploaded'}
                  </span>
                </div>
                
                {/* Path info */}
                <div className="sftp-transfer__info">
                  <div className="sftp-transfer__path">
                    {t.direction === 'download' ? t.remote_path : t.local_path}
                    <span className="sftp-transfer__path-arrow">→</span>
                    {t.direction === 'download' ? t.local_path : t.remote_path}
                  </div>
                </div>
                
                {/* Status badge */}
                <div className={`sftp-transfer__status sftp-transfer__status--${statusClass}`}>
                  {statusLabel}
                </div>
                
                {/* Cancel button */}
                <button 
                  className="sftp-transfer__cancel-btn"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    onCancel(t.id); 
                  }}
                  disabled={t.status !== 'running'}
                  title="Cancelar transferencia"
                  aria-label="Cancelar transferencia"
                >
                  ×
                </button>
                
                {/* Progress bar with percentage */}
                <div className="sftp-transfer__progress-wrapper">
                  <div className="sftp-transfer__progress-bar">
                    <div 
                      className={`sftp-transfer__progress-fill sftp-transfer__progress-fill--${statusClass}`}
                      style={{ width: `${pct ?? 0}%` }}
                    />
                  </div>
                  <span className="sftp-transfer__progress-text">
                    {progressText}
                  </span>
                </div>
                
                {/* Optional error message */}
                {t.message && (
                  <div className={`sftp-transfer__message ${t.status === 'error' ? 'error' : ''}`}>
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
