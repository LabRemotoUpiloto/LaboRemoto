import React, { useEffect, useRef, useState } from 'react';
import AskRenderer from './AskRenderer';
import ToolResultRenderer from './ToolResultRenderer';
import DiffView from '../analysis/DiffView';
import { Message, ChatMode } from '../chatModes/types';
import { RelativeTime } from './RelativeTime';
import type { ChatAppearance } from './ChatMessageList';
import { ActionIcon, Button, Group, Text } from '@mantine/core';
import { Copy, RefreshCw, RotateCcw, ClipboardCheck } from 'lucide-react';
import { BlockView } from '../practicas/linux/blocks/BlockRenderer';
import { ModuleCompleteCelebration } from '../practicas/linux/ModuleCompleteCelebration';
import { markModuleBadgeEarned } from '../../services/badges.service';

interface AiMessageBubbleProps {
  appearance?: ChatAppearance;
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
  linuxPracticeId?: string | null;
  linuxRules?: any[];
  linuxResult?: any | null;
  linuxQuizAnswers?: Record<string, string>;
  linuxQuizSubmitting?: boolean;
  linuxQuizSubmitted?: boolean;
  onLinuxQuizAnswer?: (questionId: string, optionId: string) => void;
  onLinuxQuizSubmit?: () => void;
}

export default function AiMessageBubble({
  appearance = 'session',
  msg, mode, isSending, sessionId, streamingMsgId, streamedText, setLastCommand,
  onCopy, onRegenerate, onRetry, onAnalyzeCandidate, onSetInput, wordCount,
  linuxPracticeId, linuxRules = [], linuxResult = null,
  linuxQuizAnswers = {}, linuxQuizSubmitting = false, linuxQuizSubmitted = false,
  onLinuxQuizAnswer, onLinuxQuizSubmit,
}: AiMessageBubbleProps) {
  const isStreaming = streamingMsgId === msg.id;
  const isError = msg.text.startsWith('Error');
  const isLanding = appearance === 'landing';
  const answerText = isStreaming ? streamedText : msg.text;
  const hasAnswerContent = answerText.trim().length > 0;

  const actionBtnClass = 'text-[var(--text-secondary)]/60 hover:text-[var(--text-primary)] hover:bg-[var(--interactive-hover)]';

  // Fuegos artificiales + insignia: una sola vez por módulo (persistido vía
  // services/badges.service.ts -- misma fuente que lee la Sala de Trofeos
  // del Perfil) -- nunca de nuevo en re-renders o remounts posteriores una
  // vez que ya se ganó la insignia.
  const [showCelebration, setShowCelebration] = useState(false);
  const celebratedRef = useRef(false);
  const linuxQuizModuleId = msg.meta?.linuxQuiz?.moduleId;
  useEffect(() => {
    if (!linuxQuizSubmitted || !linuxResult?.passed || !linuxQuizModuleId || celebratedRef.current) return;
    celebratedRef.current = true;
    const { alreadyEarned } = markModuleBadgeEarned(linuxQuizModuleId);
    setShowCelebration(!alreadyEarned);
  }, [linuxQuizSubmitted, linuxResult?.passed, linuxQuizModuleId]);

  return (
    <div className={`relative flex flex-col group/ai items-start w-full`}>
      <div
        className={
          isLanding
            ? `w-full rounded-2xl border px-4 py-3.5 text-[13px] leading-relaxed break-words shadow-sm
              ${isError
                ? 'border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]'
                : 'border-[var(--border-subtle)] bg-[var(--background-secondary)] text-[var(--text-primary)]'
              }`
            : `chat-bubble chat-bubble-ai relative max-w-full border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm text-[13px] leading-relaxed break-words
              ${isError ? 'border-[var(--danger-border)] text-[var(--danger-text)] bg-[var(--danger-bg)]' : ''}`
        }
      >
        {!isLanding && (
          <img
            src="/abeja-Profesor.jpeg"
            alt=""
            aria-hidden
            className="absolute -left-9 bottom-0 w-8 h-8 rounded-full object-contain bg-white shadow-sm"
            style={{ border: '1.5px solid var(--border-subtle)' }}
          />
        )}

        {isLanding && msg.timestamp && (
          <span
            className="block text-[10px] mb-2 tabular-nums text-right"
            style={{ color: 'var(--text-muted)' }}
          >
            <RelativeTime timestamp={msg.timestamp} />
          </span>
        )}

        {!isLanding && msg.timestamp && (
          <span className="block text-[9.5px] opacity-50 mb-1 font-mono tracking-wide">
            <RelativeTime timestamp={msg.timestamp} />
          </span>
        )}

        <div className="flex flex-col gap-2 overflow-hidden max-w-full">
          {isStreaming && !hasAnswerContent && (
            <span className="text-[12px] animate-pulse" style={{ color: 'var(--text-secondary)' }}>
              Analizando la mejor respuesta…
            </span>
          )}

          {!msg.meta?.fileAnalysisDisambiguation && hasAnswerContent && (
            <AskRenderer
              content={answerText}
              sessionId={sessionId || undefined}
              setLastCommand={setLastCommand}
              mode={mode}
              appearance={appearance}
            />
          )}
          {msg.meta?.toolAction && (
            <ToolResultRenderer action={msg.meta.toolAction} sessionId={sessionId || undefined} />
          )}

          {msg.meta?.linuxContentBlocks && linuxPracticeId && (
            <div className="flex flex-col gap-2 mt-1">
              {msg.meta.linuxContentBlocks.map((block: any) => (
                <BlockView key={block.id} block={block} rules={linuxRules} result={linuxResult} practiceId={linuxPracticeId} />
              ))}
            </div>
          )}

          {msg.meta?.linuxQuiz && linuxPracticeId && (
            <div className="flex flex-col gap-2 mt-1">
              {msg.meta.linuxQuiz.blocks.map((block: any) => (
                <BlockView
                  key={block.id}
                  block={block}
                  rules={linuxRules}
                  result={linuxResult}
                  practiceId={linuxPracticeId}
                  quizAnswers={linuxQuizAnswers}
                  onQuizAnswer={onLinuxQuizAnswer}
                  quizLocked={linuxQuizSubmitted}
                />
              ))}
              {!linuxQuizSubmitted && (
                <Group justify="flex-end">
                  <Button
                    size="xs"
                    leftSection={<ClipboardCheck size={14} />}
                    loading={linuxQuizSubmitting}
                    disabled={!msg.meta.linuxQuiz.blocks.every((b: any) => !!linuxQuizAnswers[b.id])}
                    onClick={onLinuxQuizSubmit}
                  >
                    Enviar evaluación
                  </Button>
                </Group>
              )}
              {linuxQuizSubmitted && linuxResult && (
                <Text fz="xs" c="dimmed">
                  {linuxResult.earned_points}/{linuxResult.total_points} pts ({linuxResult.percentage}%)
                  {linuxResult.passed ? ' — ¡módulo completo!' : ''}
                </Text>
              )}
              {showCelebration && linuxResult && linuxQuizModuleId && (
                <ModuleCompleteCelebration
                  moduleId={linuxQuizModuleId}
                  moduleTitle={msg.meta?.linuxQuiz?.moduleTitle}
                  earnedPoints={linuxResult.earned_points}
                  totalPoints={linuxResult.total_points}
                  onClose={() => setShowCelebration(false)}
                />
              )}
            </div>
          )}

          <div className={`flex items-center gap-1 mt-2 -ml-1 opacity-0 group-hover/ai:opacity-100 transition-opacity ${isLanding ? 'border-t pt-2' : ''}`}
            style={isLanding ? { borderColor: 'var(--border-subtle)' } : undefined}
          >
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => onCopy(msg.text)} title="Copiar mensaje" className={actionBtnClass}>
              <Copy size={13} />
            </ActionIcon>
            {!isStreaming && !isError && (
              <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => onRegenerate(msg.id)} title="Regenerar respuesta" disabled={isSending} className={actionBtnClass}>
                <RefreshCw size={13} />
              </ActionIcon>
            )}
            {isError && (
              <ActionIcon variant="subtle" color="red" size="sm" onClick={() => onRetry(msg.id)} title="Reintentar" disabled={isSending} className={actionBtnClass}>
                <RotateCcw size={13} />
              </ActionIcon>
            )}
            {!isStreaming && wordCount > 10 && (
              <span
                className="text-[10px] font-mono ml-auto tabular-nums px-1 text-[var(--text-muted)]"
              >
                ~{wordCount} pal.
              </span>
            )}
          </div>

          {msg.meta?.fileEdit && (
            <div className="mt-3 border border-[var(--border-subtle)] bg-[var(--background-tertiary)] rounded-lg overflow-hidden">
              <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--background-primary)] text-[var(--text-secondary)] text-[11px] font-semibold uppercase tracking-wider">
                Diff propuesto
              </div>
              <div className="p-2">
                <DiffView diff={msg.meta.fileEdit.diff} />
              </div>
              {msg.meta.fileEdit.needsConfirmation && (
                <div className="flex gap-2 p-2 border-t border-[var(--border-subtle)] bg-[var(--background-primary)]">
                  <button className="px-3 py-1.5 text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded" onClick={() => onSetInput(`aplicar ${msg.meta?.fileEdit?.path}`)}>Preparar aplicar</button>
                  <button className="px-3 py-1.5 text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded" onClick={() => onSetInput('descartar')}>Descartar</button>
                  <button className="px-3 py-1.5 text-xs rounded bg-[var(--interactive-hover)] text-[var(--text-secondary)] hover:bg-[var(--interactive-selected)]" onClick={() => onSetInput(`backups ${msg.meta?.fileEdit?.path}`)}>Ver backups</button>
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
                <p className="text-[11px] mt-1 mb-0 text-[var(--text-muted)]">
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
                      <span className="text-[12px] font-mono truncate text-[var(--text-primary)]">{c}</span>
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
