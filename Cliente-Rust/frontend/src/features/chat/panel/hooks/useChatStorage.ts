import React, { useEffect } from 'react';
import { Message, ChatMode } from '../../modos/types';
import { CHAT_STORAGE_KEY } from '../chatPane.constants';

export function useChatStorage(
  sessionId: string | null | undefined,
  mode: ChatMode,
  messages: Message[],
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  practiceTutorial: string | undefined,
  skipRestoreRef: React.MutableRefObject<boolean>
) {
  // Persist messages
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      const key = CHAT_STORAGE_KEY(sessionId ?? null, mode);
      const toSave = messages.slice(-100).map(m => {
        const { attachedFileContent, imagePreview, ...safeMeta } = (m.meta ?? {}) as any;
        void attachedFileContent; void imagePreview;
        const meta = Object.keys(safeMeta).length > 0 ? safeMeta : undefined;
        return { id: m.id, sender: m.sender, text: m.text, timestamp: m.timestamp, ...(meta ? { meta } : {}) };
      });
      localStorage.setItem(key, JSON.stringify(toSave));
    } catch { /* storage full */ }
  }, [messages, sessionId, mode]);

  // Restore messages
  useEffect(() => {
    if (skipRestoreRef.current) { skipRestoreRef.current = false; return; }
    try {
      const key = CHAT_STORAGE_KEY(sessionId ?? null, mode);
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved) as Message[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch { /* corrupted */ }

    // Inject tutorial automatically when starting a new practice chat
    if (practiceTutorial) {
      setMessages([{
        id: String(Date.now()),
        sender: 'ai',
        text: practiceTutorial,
        timestamp: Date.now()
      }]);
    }
  }, [sessionId, mode, practiceTutorial, setMessages, skipRestoreRef]);
}
