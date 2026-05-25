import React from 'react';
import { Check } from 'lucide-react';

interface ChatToastProps {
  message: string;
}

export default function ChatToast({ message }: ChatToastProps) {
  return (
    <div
      className="chat-toast absolute top-12 left-1/2 -translate-x-1/2 z-[150] flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-xl animate-in fade-in slide-in-from-top-4"
      role="status"
      aria-live="polite"
    >
      <span className="chat-toast__icon" aria-hidden>
        <Check size={14} strokeWidth={2.5} />
      </span>
      <span className="chat-toast__message">{message}</span>
    </div>
  );
}
