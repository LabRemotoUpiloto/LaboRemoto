import React, { useState } from 'react';
import { Message, ChatMode } from '../chatModes/types';
import WelcomeMessage from './WelcomeMessage';
import UserMessageBubble from './UserMessageBubble';
import AiMessageBubble from './AiMessageBubble';
import TypingIndicator from './TypingIndicator';
import ChatEmbeddedTerminal from './ChatEmbeddedTerminal';
import ChatEmbeddedCameras from './ChatEmbeddedCameras';
import ChatEmbeddedDesktop from './ChatEmbeddedDesktop';
import SystemMessageBanner from './SystemMessageBanner';
import { isNearBottom } from './chatUtils';
import { ActionIcon } from '@mantine/core';
import { ArrowDown } from 'lucide-react';

export type ChatAppearance = 'landing' | 'session';

interface ChatMessageListProps {
  className?: string;
  hideWelcome?: boolean;
  appearance?: ChatAppearance;
  messages: Message[];
  mode: ChatMode;
  isSending: boolean;
  searchMatchIds: string[];
  searchMatchIndex: number;
  streamingMsgId: string | null;
  streamedText: string;
  sessionId?: string | null;
  showScrollToBottom: boolean;
  messagesRef: React.RefObject<HTMLDivElement>;
  setShowScrollToBottom: (val: boolean) => void;
  onScrollToBottom: () => void;
  handleSuggestionClick: (text: string) => void;
  onDeleteMsg: (id: string) => void;
  onSaveEditMsg: (id: string, draft: string) => void;
  onCopyMsg: (text: string) => void;
  onRegenerateMsg: (id: string) => void;
  onRetryMsg: (id: string) => void;
  onAnalyzeCandidate: (base: string, candidate: string, action: string, index?: number) => void;
  onSetInput: (text: string) => void;
  setLastCommand: any;
  /** Terminal Pi4 embebida en el hilo del chat (no panel aparte). */
  embeddedTerminal?: {
    sessionId: string | null;
    sshCommandLine?: string | null;
    connecting?: boolean;
    error?: string | null;
    label?: string;
    onClose?: () => void;
  } | null;
  embeddedCameras?: {
    sessionId: string | null;
    connecting?: boolean;
    error?: string | null;
    label?: string;
    onClose?: () => void;
  } | null;
  embeddedDesktop?: {
    sessionId: string | null;
    connecting?: boolean;
    error?: string | null;
    label?: string;
    onClose?: () => void;
  } | null;
}

export default function ChatMessageList({
  className,
  hideWelcome = false,
  appearance = 'session',
  messages, mode, isSending, searchMatchIds, searchMatchIndex, streamingMsgId, streamedText,
  sessionId, showScrollToBottom, messagesRef, setShowScrollToBottom, onScrollToBottom,
  handleSuggestionClick, onDeleteMsg, onSaveEditMsg, onCopyMsg, onRegenerateMsg, onRetryMsg,
  onAnalyzeCandidate, onSetInput, setLastCommand,
  embeddedTerminal = null,
  embeddedCameras = null,
  embeddedDesktop = null,
}: ChatMessageListProps) {
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);

  const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);
  const isLanding = appearance === 'landing';
  // pb ampliado (antes 24px) para reservar una franja vacía al fondo donde
  // pueda flotar el botón de "bajar al último mensaje" sin quedar nunca
  // encima del texto/código del último mensaje.
  const scrollPadding = isLanding
    ? ''
    : 'pt-[10px] pr-[10px] pb-[60px] pl-[34px]';

  return (
    <div
      className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-[10px] relative custom-scrollbar ${scrollPadding} ${editingMsgId ? ' chat-messages--editing' : ''} ${className ?? ''}`}
      ref={messagesRef}
      role="log"
      aria-live={isSending ? 'polite' : undefined}
      aria-busy={isSending ? true : undefined}
      onScroll={(e) => {
        setShowScrollToBottom(!isNearBottom(e.currentTarget as HTMLDivElement));
      }}
      style={{ scrollbarGutter: isLanding ? 'stable' : 'stable both-edges' }}
    >
      {/* Welcome state */}
      {messages.length === 0 && !isSending && !hideWelcome && (
        <WelcomeMessage mode={mode} handleSuggestionClick={handleSuggestionClick} />
      )}

      {/* Message list */}
      {messages.map((msg) => {
        const isSearchMatch = searchMatchIds.includes(msg.id);
        const isActiveMatch = searchMatchIds[searchMatchIndex] === msg.id;
        const msgWordCount = msg.sender === 'ai' ? countWords(msg.text) : 0;
        const isEditing = editingMsgId === msg.id;
        const isUser = msg.sender === 'user';
        const landingAlignmentClass = isLanding
          ? (isUser
              ? 'self-end max-w-[min(520px,88%)] mt-0.5'
              : 'self-center w-full max-w-[min(720px,100%)]')
          : '';

        return (
          <div
            key={msg.id}
            id={`msg-${msg.id}`}
            className={`message message-animate ${msg.sender} ${isUser ? 'message--user' : 'message--assistant'} ${mode}${isActiveMatch ? ' search-active-match' : isSearchMatch ? ' search-match' : ''}${isEditing ? ' editing-active' : ''} ${landingAlignmentClass}`}
          >
            {msg.sender === 'system' && !(msg.meta?.pendingCommand && !msg.meta?.processed) ? (
              <SystemMessageBanner text={msg.text} appearance={appearance} />
            ) : msg.sender === 'user' ? (
              <UserMessageBubble
                msg={msg}
                isSending={isSending}
                onDelete={onDeleteMsg}
                onSaveEdit={onSaveEditMsg}
                onEditStateChange={(id, active) => setEditingMsgId(active ? id : null)}
              />
            ) : (
              <AiMessageBubble
                appearance={appearance}
                msg={msg}
                mode={mode}
                isSending={isSending}
                sessionId={sessionId}
                streamingMsgId={streamingMsgId}
                streamedText={streamedText}
                setLastCommand={setLastCommand}
                onCopy={onCopyMsg}
                onRegenerate={onRegenerateMsg}
                onRetry={onRetryMsg}
                onAnalyzeCandidate={onAnalyzeCandidate}
                onSetInput={onSetInput}
                wordCount={msgWordCount}
              />
            )}

            {msg.meta?.embeddedPi4Terminal && embeddedTerminal && (
              <div
                className={`message message--assistant message--chat-terminal ${mode} mt-1 ${isLanding ? 'self-center w-full max-w-[min(720px,100%)]' : ''}`}
                id={`msg-terminal-${msg.id}`}
                role="article"
                aria-label="Terminal Raspberry Pi en el chat"
              >
                <ChatEmbeddedTerminal
                  sessionId={embeddedTerminal.sessionId}
                  sshCommandLine={embeddedTerminal.sshCommandLine}
                  connecting={embeddedTerminal.connecting}
                  error={embeddedTerminal.error}
                  label={embeddedTerminal.label}
                  onClose={embeddedTerminal.onClose}
                  variant="inline"
                />
              </div>
            )}

            {msg.meta?.embeddedPi4Cameras && embeddedCameras && (
              <div
                className={`message message--assistant message--chat-cameras ${mode} mt-1 ${isLanding ? 'self-center w-full max-w-[min(720px,100%)]' : ''}`}
                id={`msg-cameras-${msg.id}`}
                role="article"
                aria-label="Cámaras Raspberry Pi en el chat"
              >
                <ChatEmbeddedCameras
                  sessionId={embeddedCameras.sessionId}
                  sessionConnecting={embeddedCameras.connecting}
                  sessionError={embeddedCameras.error}
                  label={embeddedCameras.label}
                  onClose={embeddedCameras.onClose}
                />
              </div>
            )}

            {msg.meta?.embeddedPi4Desktop && embeddedDesktop && (
              <div
                className={`message message--assistant message--chat-desktop ${mode} mt-1 ${isLanding ? 'self-center w-full max-w-[min(720px,100%)]' : ''}`}
                id={`msg-desktop-${msg.id}`}
                role="article"
                aria-label="Escritorio remoto Raspberry Pi en el chat"
              >
                <ChatEmbeddedDesktop
                  sessionId={embeddedDesktop.sessionId}
                  sessionConnecting={embeddedDesktop.connecting}
                  sessionError={embeddedDesktop.error}
                  label={embeddedDesktop.label}
                  onClose={embeddedDesktop.onClose}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Indicador solo si aún no hay mensaje de IA en curso */}
      {isSending && !streamingMsgId && (
        <TypingIndicator appearance={appearance} streamingMsgId={streamingMsgId} />
      )}

      {/* Vive dentro de la franja pb-[60px] reservada arriba -- por eso nunca
          queda encima del texto/código del último mensaje. */}
      {showScrollToBottom && (
        <ActionIcon
          className="sticky bottom-2 self-end mr-1 z-40 bg-[color-mix(in_srgb,var(--background-secondary)_92%,transparent)] border border-[var(--border-subtle)] backdrop-blur-[10px] shadow-[0_4px_16px_rgba(0,0,0,0.12)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--interactive-hover)] transition-colors"
          onClick={onScrollToBottom}
          size="lg"
          radius="xl"
          title="Bajar al último mensaje"
          aria-label="Bajar al último mensaje"
        >
          <ArrowDown size={16} />
        </ActionIcon>
      )}
    </div>
  );
}
