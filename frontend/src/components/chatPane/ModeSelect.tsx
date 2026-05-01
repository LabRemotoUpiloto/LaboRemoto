import React, { useEffect, useRef, useState } from 'react';
import { ChatMode } from '../chatModes/types';
import { MODES, ModeIcons } from './chatPane.constants';

interface Props {
  value: ChatMode;
  onChange: (m: ChatMode) => void;
  sessionId?: string | null;
}

const ModeSelect: React.FC<Props> = ({ value, onChange, sessionId }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODES.find(m => m.value === value) ?? MODES[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          height: 26, padding: '0 22px 0 8px', borderRadius: 5,
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(255,255,255,0.05)',
          color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 20 20" fill="none"><path d="M5 8l5 5 5-5" stroke="%23ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>')`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 5px center',
          minWidth: 110, whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: current.color, display: 'flex', alignItems: 'center' }}>
          {ModeIcons[current.value]}
        </span>
        <span>{current.label}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 3, zIndex: 999,
          background: '#1e2130', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 7, overflow: 'hidden', minWidth: 148,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {MODES.map(m => {
            const locked = !sessionId && (m.value === 'agente' || m.value === 'plan');
            return (
              <button
                key={m.value}
                onClick={() => { onChange(m.value); setOpen(false); }}
                title={locked ? 'Requiere sesión SSH activa' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  width: '100%', padding: '7px 12px', border: 'none',
                  background: m.value === value ? 'rgba(255,255,255,0.07)' : 'transparent',
                  color: m.value === value ? '#fff' : 'rgba(255,255,255,0.7)',
                  fontSize: 12.5, cursor: 'pointer', textAlign: 'left',
                  transition: 'background 0.1s',
                  opacity: locked ? 0.45 : 1,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
                onMouseLeave={e => (e.currentTarget.style.background = m.value === value ? 'rgba(255,255,255,0.07)' : 'transparent')}
              >
                <span style={{ color: m.color, display: 'flex', alignItems: 'center' }}>
                  {ModeIcons[m.value]}
                </span>
                <span style={{ flex: 1 }}>{m.label}</span>
                {locked && (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, flexShrink: 0 }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                )}
                {m.value === value && !locked && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ModeSelect;
