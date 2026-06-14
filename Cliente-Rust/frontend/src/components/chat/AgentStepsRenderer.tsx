import React, { useState } from 'react';
import { AgentStep } from '../chatModes/types';
import { Terminal, FileText, Edit, FolderSearch, Info, RotateCw, Monitor, Hammer, ChevronDown, ChevronUp } from 'lucide-react';

const TOOL_ICONS: Record<string, React.FC<any>> = {
  ejecutar_comando: Terminal,
  leer_archivo: FileText,
  escribir_archivo: Edit,
  listar_directorio: FolderSearch,
  info_sistema: Info,
  reiniciar_servicio: RotateCw,
  get_terminal_output: Monitor,
};

const DefaultToolIcon = Hammer;

const ToolCallStep: React.FC<{ step: AgentStep }> = ({ step }) => {
  const [open, setOpen] = useState(false);
  const Icon = TOOL_ICONS[step.name ?? ''] ?? DefaultToolIcon;
  let inputPreview = '';
  try {
    const parsed = JSON.parse(step.input ?? '{}');
    inputPreview = Object.entries(parsed).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join(', ');
  } catch {
    inputPreview = (step.input ?? '').slice(0, 80);
  }

  return (
    <div className="my-1 text-[12px]">
      <div
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 cursor-pointer bg-white/5 hover:bg-white/10 border border-white/10 rounded px-2 py-1 select-none transition-colors"
      >
        <span className="flex items-center text-blue-300"><Icon size={13} /></span>
        <span className="text-blue-300 font-mono text-[11px] font-medium">{step.name}</span>
        {inputPreview && <span className="text-white/40 truncate max-w-[200px] text-[10px]">({inputPreview})</span>}
        <span className="text-white/40 ml-1">{open ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}</span>
      </div>
      {open && step.input && (
        <pre className="mt-1 p-2 bg-black/40 rounded text-[11px] text-white/50 overflow-x-auto whitespace-pre-wrap font-mono custom-scrollbar">
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
  const Icon = TOOL_ICONS[step.name ?? ''] ?? DefaultToolIcon;

  return (
    <div className="my-1 text-[12px]">
      <div
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 cursor-pointer bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded px-2 py-1 select-none transition-colors"
      >
        <span className="flex items-center text-green-400"><Icon size={13} /></span>
        <span className="text-green-400 font-mono text-[11px] font-medium">{step.name} ✓</span>
        {!open && <span className="text-white/40 truncate max-w-[200px] text-[10px]">{preview}{hasMore ? '…' : ''}</span>}
        {hasMore && <span className="text-white/40 ml-1">{open ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}</span>}
      </div>
      {open && (
        <pre className="mt-1 p-2 bg-black/40 rounded text-[11px] text-green-400/80 overflow-x-auto whitespace-pre-wrap font-mono max-h-[300px] custom-scrollbar">
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
    <div className="mb-2 p-2 bg-white/5 rounded-lg border border-white/10 w-full max-w-[85%]">
      <div
        onClick={() => setCollapsed(c => !c)}
        className={`flex items-center gap-2 cursor-pointer text-[11px] text-white/50 select-none ${collapsed ? '' : 'mb-2 pb-2 border-b border-white/5'} hover:text-white/80 transition-colors`}
      >
        <Terminal size={12} className="text-white/40" />
        <span>Agente usó {toolCount} herramienta{toolCount !== 1 ? 's' : ''}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider font-medium opacity-60">
          {collapsed ? 'mostrar' : 'ocultar'}
        </span>
      </div>
      {!collapsed && (
        <div className="flex flex-col gap-0.5">
          {steps.map((step, i) =>
            step.kind === 'tool_call'
              ? <ToolCallStep key={i} step={step} />
              : step.kind === 'tool_result'
              ? <ToolResultStep key={i} step={step} />
              : null
          )}
        </div>
      )}
    </div>
  );
};

export default AgentStepsRenderer;
