import React, { useState } from 'react';
import { Message } from '../chatModes/types';
import { fmtTime } from '../chatPane/chatPane.constants';

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
      <div className="user-bubble-group">
        <div className="user-edit-wrap">
          <textarea
            className="user-edit-textarea"
            value={draft}
            autoFocus
            rows={Math.max(3, draft.split('\n').length)}
            onChange={e => {
              setDraft(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSave();
              }
              if (e.key === 'Escape') {
                cancelEdit();
              }
            }}
          />
          <div className="user-edit-actions">
            <button className="user-edit-btn user-edit-btn--cancel" onClick={cancelEdit}>Cancelar</button>
            <button className="user-edit-btn user-edit-btn--save" disabled={!draft.trim() || isSending} onClick={handleSave}>Enviar</button>
          </div>
          <span className="user-edit-hint">Enter · enviar &nbsp;·&nbsp; Esc · cancelar</span>
        </div>
      </div>
    );
  }

  return (
    <div className="user-bubble-group">
      <div className="message-text message-card">
        <div className="message-content">
          {msg.meta?.imagePreview && (
            <img src={msg.meta.imagePreview} alt="adjunto"
              style={{ display: 'block', maxHeight: 160, maxWidth: '100%', borderRadius: 6, marginBottom: msg.text ? 6 : 0, objectFit: 'contain' }}
            />
          )}
          {msg.meta?.attachedFileName && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.30)', fontSize: 11, marginBottom: msg.text ? 6 : 0, maxWidth: '100%' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span style={{ opacity: 0.95, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.meta.attachedFileName}</span>
            </div>
          )}
          {msg.text}
        </div>
        {msg.timestamp && (
          <span className="msg-timestamp" title={new Date(msg.timestamp).toLocaleString('es')}>{fmtTime(msg.timestamp)}</span>
        )}
      </div>
      <div className="msg-actions msg-actions--user">
        <button
          className="msg-action-btn"
          title="Editar"
          disabled={isSending}
          onClick={startEdit}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button
          className="msg-action-btn msg-action-btn--delete"
          title="Borrar mensaje"
          disabled={isSending}
          onClick={() => onDelete(msg.id)}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
