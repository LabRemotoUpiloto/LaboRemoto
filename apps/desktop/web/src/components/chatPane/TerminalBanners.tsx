import React from 'react';

interface Props {
  errorBanner: { snippet: string } | null;
  onDismissError: () => void;
  onAnalyze: () => void;
  terminalActivity: boolean;
  onDismissActivity: () => void;
}

const TerminalBanners: React.FC<Props> = ({
  errorBanner, onDismissError, onAnalyze,
  terminalActivity, onDismissActivity,
}) => (
  <>
    {errorBanner && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 12px',
        background: 'rgba(248,113,113,0.07)',
        borderTop: '1px solid rgba(248,113,113,0.2)',
        fontSize: 11,
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span style={{ color: '#f87171', fontWeight: 500, flexShrink: 0 }}>Error detectado</span>
        <span style={{
          color: 'rgba(255,255,255,0.35)', flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'monospace', fontSize: 10.5,
        }}>
          {errorBanner.snippet}
        </span>
        <button
          onClick={onAnalyze}
          style={{
            background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)',
            color: '#f87171', borderRadius: 4, padding: '2px 10px', fontSize: 11,
            cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
          }}
        >→ Analizar</button>
        <button onClick={onDismissError}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 14, padding: 0, flexShrink: 0 }}
        >×</button>
      </div>
    )}

    {terminalActivity && !errorBanner && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '3px 12px',
        borderTop: '1px solid rgba(96,165,250,0.10)',
        fontSize: 10.5,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#60a5fa', flexShrink: 0, animation: 'pulse 2s infinite' }} />
        <span style={{ color: 'rgba(255,255,255,0.3)', flex: 1 }}>
          Terminal activa · el Agente puede leer el output si lo necesita
        </span>
        <button onClick={onDismissActivity}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 12, padding: 0 }}
        >×</button>
      </div>
    )}
  </>
);

export default TerminalBanners;
