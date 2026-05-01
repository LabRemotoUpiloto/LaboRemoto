import React from 'react';

interface PracticeCardProps {
    id: string;
    name: string;
    description: string;
    difficulty: string;
    hasCamera: boolean;
    hasChat: boolean;
    onStart: () => void;
    loading?: boolean;
}

const difficultyConfig: Record<string, { label: string; cssVar: string }> = {
    beginner: { label: 'Principiante', cssVar: 'success' },
    intermediate: { label: 'Intermedio', cssVar: 'warning' },
    advanced: { label: 'Avanzado', cssVar: 'danger' },
};

const PracticeCard: React.FC<PracticeCardProps> = ({ name, description, difficulty, hasCamera, hasChat, onStart, loading = false }) => {
    const diff = difficultyConfig[difficulty] || difficultyConfig.beginner;

    return (
        <div className="practice-card">
            <div className="practice-card__header">
                <span 
                    className={`practice-card__badge practice-card__badge--${diff.cssVar}`}
                >
                    {diff.label}
                </span>
                <div className="practice-card__panels">
                    {hasCamera && (
                        <span className="practice-card__panel-icon" title="Cámara del laboratorio">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                <circle cx="12" cy="13" r="4" />
                            </svg>
                        </span>
                    )}
                    {hasChat && (
                        <span className="practice-card__panel-icon" title="Chat con asistente IA">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                        </span>
                    )}
                </div>
            </div>
            <h4 className="practice-card__title">{name}</h4>
            <p className="practice-card__desc">{description}</p>
            <button 
                className="practice-card__start-btn" 
                onClick={onStart}
                disabled={loading}
            >
                {loading ? (
                    <>
                        <span className="practice-card__spinner" />
                        Preparando...
                    </>
                ) : (
                    <>
                        Iniciar Práctica
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                    </>
                )}
            </button>
        </div>
    );
};

export default PracticeCard;
