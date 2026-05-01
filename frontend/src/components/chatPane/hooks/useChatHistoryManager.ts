import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Message, ChatMode } from '../../chatModes/types';
import { HistoryEntry, CHAT_STORAGE_KEY, TOKEN_STORAGE_KEY } from '../chatPane.constants';

export function useChatHistoryManager(
  sessionId: string | null | undefined,
  hostKey: string,
  mode: ChatMode,
  messages: Message[],
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  setSessionTokens: React.Dispatch<React.SetStateAction<{ input: number; output: number }>>,
  setMode: React.Dispatch<React.SetStateAction<ChatMode>>,
  setToast: (msg: string | null) => void,
  skipRestoreRef: React.MutableRefObject<boolean>,
  clearMemory: () => void,
  practiceTutorial: string | undefined
) {
  const [showHistory, setShowHistory] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const loadedHistoryIdRef = useRef<string | null>(null);
  const messageCountAtLoadRef = useRef<number>(0);
  const archiveCurrentChatRef = useRef<((excludeEntryId?: string) => Promise<boolean>)>();

  const archiveCurrentChat = useCallback(async (excludeEntryId?: string): Promise<boolean> => {
    if (!messages.some(m => m.sender === 'user')) return false;
    const userMsgs = messages.filter(m => m.sender !== 'system');
    if (loadedHistoryIdRef.current && userMsgs.length <= messageCountAtLoadRef.current) return false;
    const excludeIds = new Set<string>([
      ...(excludeEntryId ? [excludeEntryId] : []),
      ...(loadedHistoryIdRef.current ? [loadedHistoryIdRef.current] : []),
    ]);
    try {
      const existing = await invoke<HistoryEntry[]>('chat_history_load', { sessionId: hostKey, mode });
      const entry: HistoryEntry = {
        id: crypto.randomUUID(), date: Date.now(),
        preview: messages.find(m => m.sender === 'user')?.text?.slice(0, 100) ?? '',
        messageCount: userMsgs.length, mode,
        messages: userMsgs.slice(-50).map(m => {
          const { attachedFileContent, imagePreview, ...safeMeta } = (m.meta ?? {}) as any;
          void attachedFileContent; void imagePreview;
          const meta = Object.keys(safeMeta).length > 0 ? safeMeta : undefined;
          return { id: m.id, sender: m.sender, text: m.text, timestamp: m.timestamp, ...(meta ? { meta } : {}) };
        }),
      };
      const merged = [entry, ...existing.filter(e => !excludeIds.has(e.id))];
      const seenIds = new Set<string>();
      const updated = merged.filter(e => { if (seenIds.has(e.id)) return false; seenIds.add(e.id); return true; }).slice(0, 20);
      await invoke('chat_history_save', { sessionId: hostKey, mode, entries: updated });
      return true;
    } catch { return false; }
  }, [messages, hostKey, mode]);

  useEffect(() => { archiveCurrentChatRef.current = archiveCurrentChat; }, [archiveCurrentChat]);

  const handleNewChat = useCallback(async () => {
    const saved = await archiveCurrentChatRef.current?.();
    loadedHistoryIdRef.current = null;
    messageCountAtLoadRef.current = 0;
    setSessionTokens({ input: 0, output: 0 });
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY(sessionId ?? null, mode));
      localStorage.removeItem(TOKEN_STORAGE_KEY(sessionId ?? null));
    } catch {}
    clearMemory();
    
    setMessages(practiceTutorial ? [{
        id: String(Date.now()),
        sender: 'ai',
        text: practiceTutorial,
        timestamp: Date.now()
    }] : []);

    if (saved) { setToast('Chat guardado en historial'); setTimeout(() => setToast(null), 2500); }
  }, [sessionId, mode, clearMemory, practiceTutorial, setMessages, setSessionTokens, setToast]);

  const handleLoadHistory = useCallback(async (entry: HistoryEntry) => {
    await archiveCurrentChatRef.current?.(entry.id);
    loadedHistoryIdRef.current = entry.id;
    messageCountAtLoadRef.current = (entry.messages as Message[]).filter(m => m.sender !== 'system').length;
    setMessages(entry.messages as Message[]);
    setShowHistory(false);
    if (entry.mode && entry.mode !== mode) { skipRestoreRef.current = true; setMode(entry.mode as ChatMode); }
  }, [mode, setMessages, setMode, skipRestoreRef]);

  const handleDeleteHistoryEntry = useCallback((id: string, ev: React.MouseEvent) => {
    ev.stopPropagation(); setPendingDeleteId(id);
  }, []);

  const confirmDeleteHistoryEntry = useCallback(async (id: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    try {
      const updated = await invoke<HistoryEntry[]>('chat_history_delete_entry', { sessionId: hostKey, mode, entryId: id });
      setHistoryEntries(updated);
    } catch { } finally { setPendingDeleteId(null); }
  }, [hostKey, mode]);

  const cancelDeleteHistoryEntry = useCallback((ev: React.MouseEvent) => {
    ev.stopPropagation(); setPendingDeleteId(null);
  }, []);

  useEffect(() => {
    if (!showHistory) return;
    Promise.all(
      (['ask', 'agente', 'plan'] as ChatMode[]).map(m =>
        invoke<HistoryEntry[]>('chat_history_load', { sessionId: hostKey, mode: m })
          .then(entries => entries.map(e => ({ ...e, mode: e.mode ?? m })))
          .catch(() => [] as HistoryEntry[])
      )
    ).then(results => {
      const seen = new Set<string>();
      const merged = results.flat()
        .sort((a, b) => b.date - a.date)
        .filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
      setHistoryEntries(merged);
    });
  }, [showHistory, hostKey]);

  return {
    showHistory, setShowHistory,
    historyEntries, setHistoryEntries,
    historySearch, setHistorySearch,
    pendingDeleteId,
    archiveCurrentChat, handleNewChat, handleLoadHistory,
    handleDeleteHistoryEntry, confirmDeleteHistoryEntry, cancelDeleteHistoryEntry,
    loadedHistoryIdRef, messageCountAtLoadRef, archiveCurrentChatRef
  };
}
