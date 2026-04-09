import React from 'react';
import AgentStepsRenderer from './AgentStepsRenderer';
import AskRenderer from './AskRenderer';
import ToolResultRenderer from './ToolResultRenderer';
import DiffView from '../analysis/DiffView';
import { Message, ChatMode } from '../chatModes/types';
import { fmtTime } from '../chatPane/chatPane.constants';

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
    <div className={`message-text message-card${isStreaming ? ' is-streaming' : ''}${isError ? ' message-card--error' : ''}`}>
      {msg.timestamp && (
        <span className="msg-timestamp" title={new Date(msg.timestamp).toLocaleString('es')}>
          {fmtTime(msg.timestamp)}
        </span>
      )}
      <div className="message-content">
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
        <div className="msg-actions">
          <button className="msg-action-btn" onClick={() => onCopy(msg.text)} title="Copiar mensaje">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          {!isStreaming && !isError && (
            <button className="msg-action-btn" onClick={() => onRegenerate(msg.id)} title="Regenerar respuesta" disabled={isSending}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
              </svg>
            </button>
          )}
          {isError && (
            <button className="msg-action-btn msg-action-btn--retry" onClick={() => onRetry(msg.id)} title="Reintentar" disabled={isSending}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            </button>
          )}
        </div>
        {!isStreaming && wordCount > 10 && (
          <span className="msg-word-count">~{wordCount} pal.</span>
        )}
        {msg.meta?.fileEdit && (
          <div className="file-edit-diff">
            <h4>Diff propuesto</h4>
            <DiffView diff={msg.meta.fileEdit.diff} />
            {msg.meta.fileEdit.needsConfirmation && (
              <div className="file-edit-actions">
                <button onClick={() => onSetInput(`aplicar ${msg.meta?.fileEdit?.path}`)}>Preparar aplicar</button>
                <button onClick={() => onSetInput('descartar')}>Descartar</button>
                <button onClick={() => onSetInput(`backups ${msg.meta?.fileEdit?.path}`)}>Ver backups</button>
              </div>
            )}
          </div>
        )}
        {msg.meta?.fileAnalysisDisambiguation?.candidates && (
          <div className="file-disambiguation enhanced">
            <div className="file-disambiguation__header">
              <h4>
                {msg.meta.fileAnalysisDisambiguation.action === 'optimize'
                  ? 'Selecciona cuál archivo quieres optimizar'
                  : 'Selecciona cuál archivo quieres analizar'}
              </h4>
              <p className="hint">
                Se encontraron {msg.meta.fileAnalysisDisambiguation.candidates.length} rutas con el mismo nombre.
                Haz clic para {msg.meta.fileAnalysisDisambiguation.action === 'optimize' ? 'optimizar' : 'cargar el contenido'}.
              </p>
            </div>
            <ul className="file-disambiguation__list" role="list">
              {msg.meta.fileAnalysisDisambiguation.candidates.map((c: string, idx: number) => (
                <li key={c} className="file-disambiguation__item">
                  <button
                    type="button"
                    className="file-disambiguation__btn"
                    onClick={() => onAnalyzeCandidate(msg.meta!.fileAnalysisDisambiguation!.base, c, msg.meta!.fileAnalysisDisambiguation!.action || 'analyze', idx)}
                    disabled={isSending}
                    aria-label={`${msg.meta!.fileAnalysisDisambiguation!.action === 'optimize' ? 'Optimizar' : 'Analizar'} opción ${idx + 1}: ${c}`}
                  >
                    <span className="file-disambiguation__index">{idx + 1}</span>
                    <span className="file-disambiguation__path">{c}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
