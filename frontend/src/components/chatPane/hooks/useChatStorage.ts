import React, { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Message, ChatMode } from '../../chatModes/types';
import { CHAT_STORAGE_KEY, TOKEN_STORAGE_KEY } from '../chatPane.constants';

export function useChatStorage(
  sessionId: string | null | undefined,
  mode: ChatMode,
  messages: Message[],
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  practiceTutorial: string | undefined,
  skipRestoreRef: React.MutableRefObject<boolean>
) {
  const [sessionTokens, setSessionTokens] = useState<{ input: number; output: number }>(() => {
    try {
      const saved = localStorage.getItem(TOKEN_STORAGE_KEY(sessionId ?? null));
      if (saved) return JSON.parse(saved);
    } catch {}
    return { input: 0, output: 0 };
  });

  // Token tracking
  useEffect(() => {
    const unlisten = listen<{ request_id: string; input_tokens: number; output_tokens: number; model: string }>('ai:usage', (ev) => {
      const { input_tokens, output_tokens } = ev.payload;
      setSessionTokens(prev => {
        const next = { input: prev.input + input_tokens, output: prev.output + output_tokens };
        try { localStorage.setItem(TOKEN_STORAGE_KEY(sessionId ?? null), JSON.stringify(next)); } catch {}
        return next;
      });
    });
    return () => { unlisten.then(fn => fn()); };
  }, [sessionId]);

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

  return { sessionTokens, setSessionTokens };
}
