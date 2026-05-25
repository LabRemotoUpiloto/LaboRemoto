import React, { useState, useRef, useCallback } from 'react';
import { ChatMode, Message } from '../../chatModes/types';

export function useChatModeSwitch(
  mode: ChatMode,
  setMode: (m: ChatMode) => void,
  messages: Message[],
  setMessages: (m: Message[]) => void,
  sessionId: string | null | undefined,
  pi4AgentReady: boolean,
  attachedImage: any | null,
  setAttachedImage: (v: any | null) => void,
  attachedFile: any | null,
  setAttachedFile: (v: any | null) => void,
  archiveCurrentChatRef: React.MutableRefObject<any>,
  clearMemory: () => void,
  loadedHistoryIdRef: React.MutableRefObject<string | null>,
  messageCountAtLoadRef: React.MutableRefObject<number>,
  skipRestoreRef: React.MutableRefObject<boolean>,
  setToasts: (msg: string | null) => void
) {
  const [showModeConfirm, setShowModeConfirm] = useState<ChatMode | null>(null);
  const pendingAttachedImageRef = useRef<any | null>(null);
  const pendingAttachedFileRef = useRef<any | null>(null);

  const handleModeSwitch = useCallback((newMode: ChatMode) => {
    if (newMode === mode) return;
    if (!sessionId && !pi4AgentReady && (newMode === 'agente' || newMode === 'plan')) {
      setToasts('Requiere sesión SSH o PI4_USER/PI4_PASSWORD en .env');
      setTimeout(() => setToasts(null), 2500);
      return;
    }
    if (messages.some(m => m.sender === 'user')) {
      pendingAttachedImageRef.current = attachedImage;
      pendingAttachedFileRef.current = attachedFile;
      setShowModeConfirm(newMode);
    } else {
      setAttachedImage(null); setAttachedFile(null); setMode(newMode); clearMemory();
    }
  }, [mode, messages, sessionId, pi4AgentReady, attachedImage, attachedFile, clearMemory, setMode, setAttachedImage, setAttachedFile, setToasts]);

  const confirmModeSwitch = useCallback(async () => {
    if (!showModeConfirm) return;
    await archiveCurrentChatRef.current?.();
    loadedHistoryIdRef.current = null; messageCountAtLoadRef.current = 0;
    setAttachedImage(null); setAttachedFile(null); pendingAttachedImageRef.current = null; pendingAttachedFileRef.current = null;
    skipRestoreRef.current = true;
    setMode(showModeConfirm); setMessages([]); clearMemory(); setShowModeConfirm(null);
  }, [showModeConfirm, archiveCurrentChatRef, loadedHistoryIdRef, messageCountAtLoadRef, setMessages, setAttachedImage, setAttachedFile, skipRestoreRef, setMode, clearMemory]);

  const cancelModeSwitch = useCallback(() => {
    if (pendingAttachedImageRef.current !== null) {
      setAttachedImage(pendingAttachedImageRef.current);
      pendingAttachedImageRef.current = null;
    }
    if (pendingAttachedFileRef.current !== null) {
      setAttachedFile(pendingAttachedFileRef.current);
      pendingAttachedFileRef.current = null;
    }
    setShowModeConfirm(null);
  }, [setAttachedImage, setAttachedFile]);

  return { showModeConfirm, handleModeSwitch, confirmModeSwitch, cancelModeSwitch };
}
