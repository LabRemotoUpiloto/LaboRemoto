import React, { useEffect, useRef, useState } from 'react';
import { ModelSelection, AVAILABLE_MODELS } from '../chatModes/types';

interface Props {
  value: ModelSelection;
  onChange: (m: ModelSelection) => void;
}

const ModelSelect: React.FC<Props> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = AVAILABLE_MODELS.find(m => m.value === value) ?? AVAILABLE_MODELS[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          height: 26, padding: '0 22px 0 10px', borderRadius: 5,
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(255,255,255,0.05)',
          color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 20 20" fill="none"><path d="M5 8l5 5 5-5" stroke="%23ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>')`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 5px center',
          width: '100%', whiteSpace: 'nowrap', overflow: 'hidden',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{current.label}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 3, zIndex: 999,
          background: '#1e2130', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 7, overflow: 'hidden', minWidth: '100%',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {AVAILABLE_MODELS.map(m => (
            <button
              key={m.value}
              onClick={() => { onChange(m.value); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '7px 12px', border: 'none',
                background: m.value === value ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: m.value === value ? '#fff' : 'rgba(255,255,255,0.7)',
                fontSize: 12.5, cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.1s', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
              onMouseLeave={e => (e.currentTarget.style.background = m.value === value ? 'rgba(255,255,255,0.07)' : 'transparent')}
            >
              <span style={{ flex: 1 }}>{m.label}</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{m.provider}</span>
              {m.value === value && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', flexShrink: 0, marginLeft: 4 }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ModelSelect;
