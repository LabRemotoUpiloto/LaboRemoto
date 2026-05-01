import React, { useState } from 'react';
import { AgentStep } from '../chatModes/types';

const TOOL_SVG: Record<string, React.ReactNode> = {
  ejecutar_comando: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
    </svg>
  ),
  leer_archivo: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  escribir_archivo: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  listar_directorio: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  info_sistema: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  ),
  reiniciar_servicio: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  ),
  get_terminal_output: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 10 12 14 16 10"/>
    </svg>
  ),
};

const DefaultToolIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
);

const ToolCallStep: React.FC<{ step: AgentStep }> = ({ step }) => {
  const [open, setOpen] = useState(false);
  const icon = TOOL_SVG[step.name ?? ''] ?? <DefaultToolIcon />;
  let inputPreview = '';
  try {
    const parsed = JSON.parse(step.input ?? '{}');
    inputPreview = Object.entries(parsed).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join(', ');
  } catch {
    inputPreview = (step.input ?? '').slice(0, 80);
  }

  return (
    <div style={{ margin: '4px 0', fontSize: '12px' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
          background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '2px 8px',
          border: '1px solid rgba(255,255,255,0.12)', userSelect: 'none',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', color: '#7dd3fc' }}>{icon}</span>
        <span style={{ color: '#7dd3fc', fontFamily: 'monospace' }}>{step.name}</span>
        {inputPreview && <span style={{ color: '#94a3b8' }}>({inputPreview})</span>}
        <span style={{ color: '#64748b', marginLeft: 4 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && step.input && (
        <pre style={{
          marginTop: 4, padding: '6px 10px', background: 'rgba(0,0,0,0.3)',
          borderRadius: 4, fontSize: 11, color: '#94a3b8', overflowX: 'auto', whiteSpace: 'pre-wrap',
        }}>
          {(() => { try { return JSON.stringify(JSON.parse(step.input), null, 2); } catch { return step.input; } })()}
        </pre>
      )}
    </div>
  );
}

const ToolResultStep: React.FC<{ step: AgentStep }> = ({ step }) => {
  const [open, setOpen] = useState(false);
  const output = step.output ?? '';
  const preview = output.slice(0, 100).replace(/\n/g, ' ');
  const hasMore = output.length > 100;
  const icon = TOOL_SVG[step.name ?? ''] ?? <DefaultToolIcon />;

  return (
    <div style={{ margin: '4px 0', fontSize: '12px' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
          background: 'rgba(34,197,94,0.08)', borderRadius: 4, padding: '2px 8px',
          border: '1px solid rgba(34,197,94,0.15)', userSelect: 'none',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', color: '#86efac' }}>{icon}</span>
        <span style={{ color: '#86efac', fontFamily: 'monospace' }}>{step.name} ✓</span>
        {!open && <span style={{ color: '#64748b' }}>{preview}{hasMore ? '…' : ''}</span>}
        {hasMore && <span style={{ color: '#64748b', marginLeft: 4 }}>{open ? '▲' : '▼'}</span>}
      </div>
      {open && (
        <pre style={{
          marginTop: 4, padding: '6px 10px', background: 'rgba(0,0,0,0.3)',
          borderRadius: 4, fontSize: 11, color: '#86efac', overflowX: 'auto', whiteSpace: 'pre-wrap',
          maxHeight: 300,
        }}>
          {output}
        </pre>
      )}
    </div>
  );
}

interface Props {
  steps: AgentStep[];
}

const AgentStepsRenderer: React.FC<Props> = ({ steps }) => {
  const [collapsed, setCollapsed] = useState(true);
  if (!steps || steps.length === 0) return null;

  const toolCount = steps.filter(s => s.kind === 'tool_call').length;

  return (
    <div style={{
      marginBottom: 8, padding: '6px 10px',
      background: 'rgba(255,255,255,0.04)', borderRadius: 6,
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          fontSize: 11, color: '#64748b', userSelect: 'none', marginBottom: collapsed ? 0 : 6,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5"/>
          <line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
        <span>Agente usó {toolCount} herramienta{toolCount !== 1 ? 's' : ''}</span>
        <span style={{ marginLeft: 'auto' }}>{collapsed ? '▶ mostrar' : '▼ ocultar'}</span>
      </div>
      {!collapsed && steps.map((step, i) =>
        step.kind === 'tool_call'
          ? <ToolCallStep key={i} step={step} />
          : step.kind === 'tool_result'
          ? <ToolResultStep key={i} step={step} />
          : null
      )}
    </div>
  );
};

export default AgentStepsRenderer;
