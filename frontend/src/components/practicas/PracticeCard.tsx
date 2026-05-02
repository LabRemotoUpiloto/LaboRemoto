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

const difficultyConfig: Record<string, { label: string; badgeClasses: string }> = {
    beginner: { label: 'Principiante', badgeClasses: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    intermediate: { label: 'Intermedio', badgeClasses: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    advanced: { label: 'Avanzado', badgeClasses: 'text-red-400 bg-red-500/10 border-red-500/20' },
};

const PracticeCard: React.FC<PracticeCardProps> = ({ name, description, difficulty, hasCamera, hasChat, onStart, loading = false }) => {
    const diff = difficultyConfig[difficulty] || difficultyConfig.beginner;

    return (
        <div className="bg-secondary border border-subtle rounded-2xl p-6 transition-all duration-250 animate-in slide-in-from-bottom-4 hover:border-accent hover:shadow-[0_4px_20px_rgba(0,0,0,0.1)]">
            <div className="flex items-center justify-between mb-3.5">
                <span 
                    className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${diff.badgeClasses}`}
                >
                    {diff.label}
                </span>
                <div className="flex gap-2">
                    {hasCamera && (
                        <span className="w-8 h-8 flex items-center justify-center bg-tertiary text-secondary rounded-lg border border-subtle" title="Cámara del laboratorio">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                <circle cx="12" cy="13" r="4" />
                            </svg>
                        </span>
                    )}
                    {hasChat && (
                        <span className="w-8 h-8 flex items-center justify-center bg-tertiary text-secondary rounded-lg border border-subtle" title="Chat con asistente IA">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                        </span>
                    )}
                </div>
            </div>
            <h4 className="text-[20px] font-bold text-primary m-0 mb-2">{name}</h4>
            <p className="text-[14px] text-secondary leading-relaxed m-0 mb-5">{description}</p>
            <button 
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-accent text-inverse border-none rounded-[10px] text-[14px] font-semibold cursor-pointer transition-all duration-200 disabled:opacity-70 disabled:cursor-wait hover:not(:disabled):bg-[#0da574] hover:not(:disabled):-translate-y-[1px] hover:not(:disabled):shadow-[0_4px_14px_rgba(16,185,129,0.25)]" 
                onClick={onStart}
                disabled={loading}
            >
                {loading ? (
                    <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
