import React from 'react';

interface CategoryCardProps {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    practiceCount: number;
    onClick: () => void;
}

const iconMap: Record<string, React.ReactNode> = {
    robot: (
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <circle cx="8.5" cy="15.5" r="1.5" />
            <circle cx="15.5" cy="15.5" r="1.5" />
            <path d="M12 11V7" />
            <circle cx="12" cy="5" r="2" />
            <path d="M1 15h2M21 15h2" />
        </svg>
    ),
    terminal: (
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
    ),
    circuit: (
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="6" width="4" height="4" rx="1" />
            <rect x="14" y="6" width="4" height="4" rx="1" />
            <rect x="6" y="14" width="4" height="4" rx="1" />
            <rect x="14" y="14" width="4" height="4" rx="1" />
            <path d="M10 8h4M10 16h4M8 10v4M16 10v4" />
        </svg>
    ),
};

const CategoryCard: React.FC<CategoryCardProps> = ({ name, description, icon, color, practiceCount, onClick }) => {
    const IconSvg = iconMap[icon] || iconMap.terminal;

    return (
        <button
            className="group relative bg-secondary border border-subtle rounded-[20px] p-7 cursor-pointer text-left w-full flex flex-col gap-[18px] transition-all duration-300 overflow-hidden min-h-[220px] hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(0,0,0,0.15)]"
            onClick={onClick}
            style={{ 
                borderColor: 'var(--border-color)', 
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = color;
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
            }}
        >
            <div 
                className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] opacity-0 transition-opacity duration-400 pointer-events-none group-hover:opacity-[0.04]" 
                style={{ background: `radial-gradient(circle at 50% 50%, ${color}, transparent 60%)` }}
            />
            <div 
                className="w-[60px] h-[60px] rounded-2xl flex items-center justify-center shrink-0 border"
                style={{ 
                    color: color,
                    background: `linear-gradient(135deg, color-mix(in srgb, ${color} 12%, transparent), color-mix(in srgb, ${color} 5%, transparent))`,
                    borderColor: `color-mix(in srgb, ${color} 15%, transparent)`
                }}
            >
                {IconSvg}
            </div>
            <div>
                <h3 className="text-[22px] font-bold text-primary m-0 mb-1.5">{name}</h3>
                <p className="text-[14px] text-secondary m-0 leading-relaxed">{description}</p>
            </div>
            <div className="mt-auto flex items-center justify-between pt-3.5 border-t border-subtle w-full">
                <span className="text-[13px] font-semibold text-tertiary uppercase tracking-wider">
                    {practiceCount > 0 ? `${practiceCount} práctica${practiceCount !== 1 ? 's' : ''}` : 'Próximamente'}
                </span>
                {practiceCount > 0 && (
                    <svg 
                        width="18" 
                        height="18" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2.5"
                        className="text-tertiary opacity-50 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-1"
                        style={{ color: color }}
                    >
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                )}
            </div>
        </button>
    );
};

export default CategoryCard;
