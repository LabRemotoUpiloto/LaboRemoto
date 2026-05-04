import React, { useState } from 'react';
import { Message, ChatMode } from '../chatModes/types';
import WelcomeMessage from './WelcomeMessage';
import UserMessageBubble from './UserMessageBubble';
import AiMessageBubble from './AiMessageBubble';
import TypingIndicator from './TypingIndicator';
import { isNearBottom } from './chatUtils';
import { ActionIcon } from '@mantine/core';
import { ArrowDown } from 'lucide-react';

interface ChatMessageListProps {
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
  onCancel: () => void;
  setLastCommand: any;
}

export default function ChatMessageList({
  messages, mode, isSending, searchMatchIds, searchMatchIndex, streamingMsgId, streamedText,
  sessionId, showScrollToBottom, messagesRef, setShowScrollToBottom, onScrollToBottom,
  handleSuggestionClick, onDeleteMsg, onSaveEditMsg, onCopyMsg, onRegenerateMsg, onRetryMsg,
  onAnalyzeCandidate, onSetInput, onCancel, setLastCommand
}: ChatMessageListProps) {
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);

  const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

  return (
    <div
      className={`flex-1 min-h-0 pt-[10px] pr-[10px] pb-[24px] pl-[34px] overflow-y-auto overflow-x-hidden flex flex-col gap-[10px] relative custom-scrollbar ${editingMsgId ? ' chat-messages--editing' : ''}`}
      ref={messagesRef}
      role="log"
      aria-live={isSending ? 'polite' : undefined}
      aria-busy={isSending ? true : undefined}
      onScroll={(e) => {
        setShowScrollToBottom(!isNearBottom(e.currentTarget as HTMLDivElement));
      }}
      style={{ scrollbarGutter: 'stable both-edges' }}
    >
      {/* Welcome state */}
      {messages.length === 0 && !isSending && (
        <WelcomeMessage mode={mode} handleSuggestionClick={handleSuggestionClick} />
      )}

      {/* Message list */}
      {messages.map((msg) => {
        const isSearchMatch = searchMatchIds.includes(msg.id);
        const isActiveMatch = searchMatchIds[searchMatchIndex] === msg.id;
        const msgWordCount = msg.sender === 'ai' ? countWords(msg.text) : 0;
        const isEditing = editingMsgId === msg.id;

        return (
          <div
            key={msg.id}
            id={`msg-${msg.id}`}
            className={`message message-animate ${msg.sender} ${msg.sender === 'user' ? 'message--user' : 'message--assistant'} ${mode}${isActiveMatch ? ' search-active-match' : isSearchMatch ? ' search-match' : ''}${isEditing ? ' editing-active' : ''}`}
          >
            {!(msg.sender === 'system' && msg.meta?.pendingCommand && !msg.meta?.processed) && (
              msg.sender === 'user' ? (
                <UserMessageBubble
                  msg={msg}
                  isSending={isSending}
                  onDelete={onDeleteMsg}
                  onSaveEdit={onSaveEditMsg}
                  onEditStateChange={(id, active) => setEditingMsgId(active ? id : null)}
                />
              ) : (
                <AiMessageBubble
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
              )
            )}
          </div>
        );
      })}

      {/* Typing indicator */}
      {isSending && (
        <TypingIndicator streamingMsgId={streamingMsgId} onCancel={onCancel} />
      )}

      {/* Scroll to bottom */}
      {showScrollToBottom && (
        <ActionIcon
          className="absolute bottom-4 right-4 z-50 bg-accent hover:bg-accent/90 text-white rounded-full shadow-lg transition-transform hover:scale-105"
          onClick={onScrollToBottom}
          size="lg"
          title="Bajar al último mensaje"
          aria-label="Bajar al último mensaje"
        >
          <ArrowDown size={18} />
        </ActionIcon>
      )}
    </div>
  );
}
