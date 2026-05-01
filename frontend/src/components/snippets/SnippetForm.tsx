import React, { useEffect, useRef } from 'react';
import './SnippetForm.css';

export interface SnippetFormProps {
  title: string;
  content: string;
  category?: string;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  onCategoryChange?: (category: string) => void;
  onSave: () => void;
  onClear: () => void;
  isEditing?: boolean;
  editingTitle?: string;
}

const SnippetForm: React.FC<SnippetFormProps> = ({
  title,
  content,
  category = '',
  onTitleChange,
  onContentChange,
  onCategoryChange,
  onSave,
  onClear,
  isEditing = false,
  editingTitle = '',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const adjustHeight = () => {
      textarea.style.height = 'auto';
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 120), 400);
      textarea.style.height = `${newHeight}px`;
    };

    adjustHeight();
    textarea.addEventListener('input', adjustHeight);
    return () => textarea.removeEventListener('input', adjustHeight);
  }, [content]);

  const charCount = content.length;
  const isSaveDisabled = !content.trim();

  return (
    <section className={`snippet-form ${isEditing ? 'snippet-form--editing' : ''}`}>
      {isEditing && (
        <div className="snippet-form__editing-badge">
          <span className="snippet-form__editing-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </span>
          Editando: <strong>{editingTitle}</strong>
        </div>
      )}

      <div className="snippet-form__fields">
        <input
          type="text"
          className="snippet-form__title-input"
          placeholder="Título (opcional)"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          maxLength={100}
        />
        
        <input
          type="text"
          className="snippet-form__title-input"
          placeholder="Categoría (opcional, ej: Python, Linux, Git...)"
          value={category}
          onChange={(e) => onCategoryChange?.(e.target.value)}
          maxLength={30}
        />
        
        <div className="snippet-form__textarea-wrapper">
          <textarea
            ref={textareaRef}
            className="snippet-form__content-input"
            placeholder="Contenido del snippet..."
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
          />
          <div className="snippet-form__char-count">
            {charCount} caracteres
          </div>
        </div>
      </div>

      <div className="snippet-form__actions">
        <button
          type="button"
          className="snippet-form__btn snippet-form__btn--primary"
          onClick={onSave}
          disabled={isSaveDisabled}
          title={isSaveDisabled ? 'Escribe algo para guardar' : 'Guardar snippet'}
        >
          <span className="snippet-form__btn-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          </span>
          {isEditing ? 'Actualizar' : 'Guardar'}
        </button>
        
        <button
          type="button"
          className="snippet-form__btn snippet-form__btn--secondary"
          onClick={onClear}
          title="Limpiar formulario"
        >
          <span className="snippet-form__btn-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </span>
          {isEditing ? 'Cancelar' : 'Limpiar'}
        </button>
      </div>
    </section>
  );
};

export default SnippetForm;
