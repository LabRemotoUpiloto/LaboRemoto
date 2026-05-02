import React from 'react';
import AgentStepsRenderer from './AgentStepsRenderer';
import AskRenderer from './AskRenderer';
import ToolResultRenderer from './ToolResultRenderer';
import DiffView from '../analysis/DiffView';
import { Message, ChatMode } from '../chatModes/types';
import { fmtTime } from '../chatPane/chatPane.constants';
import { ActionIcon } from '@mantine/core';
import { Copy, RefreshCw, RotateCcw, Terminal } from 'lucide-react';

interface AiMessageBubbleProps {
  msg: Message;
  mode: ChatMode;
  isSending: boolean;
  sessionId?: string | null;
  streamingMsgId: string | null;
  streamedText: string;
  setLastCommand: any;
  onCopy: (text: string) => void;
  onRegenerate: (id: string) => void;
  onRetry: (id: string) => void;
  onAnalyzeCandidate: (base: string, candidate: string, action: string, index?: number) => void;
  onSetInput: (text: string) => void;
  wordCount: number;
}

export default function AiMessageBubble({
  msg, mode, isSending, sessionId, streamingMsgId, streamedText, setLastCommand,
  onCopy, onRegenerate, onRetry, onAnalyzeCandidate, onSetInput, wordCount
}: AiMessageBubbleProps) {
  const isStreaming = streamingMsgId === msg.id;
  const isError = msg.text.startsWith('Error');

  return (
    <div className={`relative flex flex-col group/ai items-start max-w-full ${isStreaming ? 'animate-pulse' : ''}`}>
      <div 
        className={`relative max-w-full bg-[#1e2130]/50 border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm text-[13px] leading-relaxed break-words
          ${isError ? 'border-red-500/30 text-red-400 bg-red-500/5' : 'border-white/10 text-white/90'}`}
      >
        {/* Avatar badge */}
        <div className="absolute -left-8 bottom-0 w-6 h-6 rounded-full bg-accent flex items-center justify-center shadow-sm">
          <Terminal size={12} className="text-white" strokeWidth={2.5} />
        </div>

        {msg.timestamp && (
          <span className="block text-[9.5px] opacity-50 mb-1 font-mono tracking-wide">
            {fmtTime(msg.timestamp)}
          </span>
        )}

        <div className="flex flex-col gap-2 overflow-hidden max-w-full">
          {msg.meta?.toolSteps && msg.meta.toolSteps.length > 0 && (
            <AgentStepsRenderer steps={msg.meta.toolSteps} />
          )}
          {!msg.meta?.fileAnalysisDisambiguation && (
            <AskRenderer
              content={isStreaming ? streamedText : msg.text}
              sessionId={sessionId || undefined}
              setLastCommand={setLastCommand}
              mode={mode}
            />
          )}
          {msg.meta?.toolAction && (
            <ToolResultRenderer action={msg.meta.toolAction} sessionId={sessionId || undefined} />
          )}

          <div className="flex items-center gap-1 mt-2 -ml-1 opacity-0 group-hover/ai:opacity-100 transition-opacity">
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => onCopy(msg.text)} title="Copiar mensaje" className="text-white/40 hover:text-white hover:bg-white/10">
              <Copy size={13} />
            </ActionIcon>
            {!isStreaming && !isError && (
              <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => onRegenerate(msg.id)} title="Regenerar respuesta" disabled={isSending} className="text-white/40 hover:text-white hover:bg-white/10">
                <RefreshCw size={13} />
              </ActionIcon>
            )}
            {isError && (
              <ActionIcon variant="subtle" color="red" size="sm" onClick={() => onRetry(msg.id)} title="Reintentar" disabled={isSending} className="text-white/40 hover:text-red-400 hover:bg-red-500/10">
                <RotateCcw size={13} />
              </ActionIcon>
            )}
            {!isStreaming && wordCount > 10 && (
              <span className="text-[10px] text-white/30 font-mono ml-auto tabular-nums px-1">~{wordCount} pal.</span>
            )}
          </div>

          {msg.meta?.fileEdit && (
            <div className="mt-3 border border-white/10 rounded-lg bg-black/20 overflow-hidden">
              <div className="px-3 py-1.5 bg-black/30 border-b border-white/5 text-[11px] font-semibold text-white/70 uppercase tracking-wide">
                Diff propuesto
              </div>
              <div className="p-2">
                <DiffView diff={msg.meta.fileEdit.diff} />
              </div>
              {msg.meta.fileEdit.needsConfirmation && (
                <div className="flex gap-2 p-2 bg-black/20 border-t border-white/5">
                  <button className="px-3 py-1.5 text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded" onClick={() => onSetInput(`aplicar ${msg.meta?.fileEdit?.path}`)}>Preparar aplicar</button>
                  <button className="px-3 py-1.5 text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded" onClick={() => onSetInput('descartar')}>Descartar</button>
                  <button className="px-3 py-1.5 text-xs bg-white/5 text-white/60 hover:bg-white/10 rounded" onClick={() => onSetInput(`backups ${msg.meta?.fileEdit?.path}`)}>Ver backups</button>
                </div>
              )}
            </div>
          )}

          {msg.meta?.fileAnalysisDisambiguation?.candidates && (
            <div className="mt-3 border border-accent/20 rounded-lg bg-accent/5 overflow-hidden">
              <div className="px-3 py-2 border-b border-accent/10 bg-accent/10">
                <h4 className="text-[13px] font-medium text-accent m-0">
                  {msg.meta.fileAnalysisDisambiguation.action === 'optimize'
                    ? 'Selecciona cuál archivo quieres optimizar'
                    : 'Selecciona cuál archivo quieres analizar'}
                </h4>
                <p className="text-[11px] text-white/50 mt-1 mb-0">
                  Se encontraron {msg.meta.fileAnalysisDisambiguation.candidates.length} rutas con el mismo nombre.
                  Haz clic para {msg.meta.fileAnalysisDisambiguation.action === 'optimize' ? 'optimizar' : 'cargar el contenido'}.
                </p>
              </div>
              <ul className="m-0 p-0 list-none flex flex-col">
                {msg.meta.fileAnalysisDisambiguation.candidates.map((c: string, idx: number) => (
                  <li key={c} className="border-b border-accent/5 last:border-b-0 relative">
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 flex gap-3 items-center hover:bg-accent/10 transition-colors disabled:opacity-50"
                      onClick={() => onAnalyzeCandidate(msg.meta!.fileAnalysisDisambiguation!.base, c, msg.meta!.fileAnalysisDisambiguation!.action || 'analyze', idx)}
                      disabled={isSending}
                    >
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-black/20 text-accent font-mono text-[10px] shrink-0 border border-accent/10">{idx + 1}</span>
                      <span className="text-[12px] text-white/80 font-mono truncate">{c}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
