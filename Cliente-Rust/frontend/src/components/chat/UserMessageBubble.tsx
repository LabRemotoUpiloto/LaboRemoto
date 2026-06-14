import React, { useState } from 'react';
import { Message } from '../chatModes/types';
import { fmtTime } from '../chatPane/chatPane.constants';
import { ActionIcon, Textarea, Button, Group } from '@mantine/core';
import { Pencil, Trash2, File as FileIcon } from 'lucide-react';

interface UserMessageBubbleProps {
  msg: Message;
  isSending: boolean;
  onDelete: (id: string) => void;
  onSaveEdit: (id: string, newText: string) => void;
  onEditStateChange: (id: string, isEditing: boolean) => void;
}

export default function UserMessageBubble({ msg, isSending, onDelete, onSaveEdit, onEditStateChange }: UserMessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(msg.text);

  const startEdit = () => {
    setIsEditing(true);
    setDraft(msg.text);
    onEditStateChange(msg.id, true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    onEditStateChange(msg.id, false);
  };

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setIsEditing(false);
    onEditStateChange(msg.id, false);
    onSaveEdit(msg.id, trimmed);
  };

  if (isEditing) {
    return (
      <div className="flex flex-col items-end w-full animate-in fade-in">
        <div className="w-full max-w-[85%] bg-black/20 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSave();
              }
              if (e.key === 'Escape') cancelEdit();
            }}
            autoFocus
            minRows={2}
            maxRows={10}
            autosize
            variant="unstyled"
            styles={{ input: { color: 'white', fontSize: 13, lineHeight: 1.5, padding: 0 } }}
            className="w-full"
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-white/30 hidden sm:inline-block">Enter · enviar &nbsp;·&nbsp; Esc · cancelar</span>
            <Group gap="xs" justify="flex-end" className="ml-auto">
              <Button size="compact-xs" variant="subtle" color="gray" onClick={cancelEdit} className="text-white/60 hover:text-white">Cancelar</Button>
              <Button size="compact-xs" color="blue" disabled={!draft.trim() || isSending} onClick={handleSave}>Guardar</Button>
            </Group>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end w-full group/user">
      <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[85%] shadow-sm relative break-words text-[13px] leading-relaxed">
        <div className="flex flex-col gap-1.5">
          {msg.meta?.imagePreview && (
            <img src={msg.meta.imagePreview} alt="adjunto"
              className="block max-h-[160px] max-w-full rounded-md object-contain bg-black/20"
            />
          )}
          {msg.meta?.attachedFileName && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/25 border border-white/20 text-[11px] max-w-full self-start">
              <FileIcon size={12} className="shrink-0 opacity-80" />
              <span className="opacity-95 overflow-hidden text-ellipsis whitespace-nowrap">{msg.meta.attachedFileName}</span>
            </div>
          )}
          <span className="whitespace-pre-wrap">{msg.text}</span>
        </div>
        {msg.timestamp && (
          <span 
            className="block text-[9.5px] opacity-60 mt-1 text-right tabular-nums" 
            title={new Date(msg.timestamp).toLocaleString('es')}
          >
            {fmtTime(msg.timestamp)}
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-0.5 mt-1 opacity-0 group-hover/user:opacity-100 transition-opacity">
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          title="Editar"
          disabled={isSending}
          onClick={startEdit}
          className="text-white/40 hover:text-white hover:bg-white/10"
        >
          <Pencil size={12} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="red"
          size="sm"
          title="Borrar mensaje"
          disabled={isSending}
          onClick={() => onDelete(msg.id)}
          className="text-white/40 hover:text-red-400 hover:bg-red-500/10"
        >
          <Trash2 size={12} />
        </ActionIcon>
      </div>
    </div>
  );
}
