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

  // Keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (content.trim()) {
        onSave();
      }
    }
  };

  const charCount = content.length;
  const isSaveDisabled = !content.trim();

  return (
    <section className={`snippet-form ${isEditing ? 'snippet-form--editing' : ''}`}>
      {isEditing && (
        <div className="snippet-form__editing-badge">
          <span className="snippet-form__editing-icon">✏️</span>
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
            placeholder="Contenido del snippet... (Ctrl+Enter para guardar)"
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            onKeyDown={handleKeyDown}
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
          title={isSaveDisabled ? 'Escribe algo para guardar' : 'Guardar snippet (Ctrl+Enter)'}
        >
          <span className="snippet-form__btn-icon">💾</span>
          {isEditing ? 'Actualizar' : 'Guardar'}
        </button>
        
        <button
          type="button"
          className="snippet-form__btn snippet-form__btn--secondary"
          onClick={onClear}
          title="Limpiar formulario"
        >
          <span className="snippet-form__btn-icon">🗑️</span>
          {isEditing ? 'Cancelar' : 'Limpiar'}
        </button>
      </div>
    </section>
  );
};

export default SnippetForm;
