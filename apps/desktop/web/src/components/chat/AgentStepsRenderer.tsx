import React, { useState } from 'react';
import { AgentStep } from '../chatModes/types';

const TOOL_ICONS: Record<string, string> = {
  ejecutar_comando:   '⚡',
  leer_archivo:       '📄',
  escribir_archivo:   '✏️',
  listar_directorio:  '📁',
  info_sistema:       '🖥️',
  reiniciar_servicio: '🔄',
};

const ToolCallStep: React.FC<{ step: AgentStep }> = ({ step }) => {
  const [open, setOpen] = useState(false);
  const icon = TOOL_ICONS[step.name ?? ''] ?? '🔧';
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
        <span>{icon}</span>
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
  const icon = TOOL_ICONS[step.name ?? ''] ?? '🔧';

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
        <span>{icon}</span>
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
  const [collapsed, setCollapsed] = useState(false);
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
