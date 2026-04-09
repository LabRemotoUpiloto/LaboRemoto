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
            className="practice-category-card"
            onClick={onClick}
            style={{ '--cat-color': color } as React.CSSProperties}
        >
            <div className="practice-category-card__glow" />
            <div className="practice-category-card__icon">
                {IconSvg}
            </div>
            <div className="practice-category-card__content">
                <h3>{name}</h3>
                <p>{description}</p>
            </div>
            <div className="practice-category-card__footer">
                <span className="practice-category-card__count">
                    {practiceCount > 0 ? `${practiceCount} práctica${practiceCount !== 1 ? 's' : ''}` : 'Próximamente'}
                </span>
                {practiceCount > 0 && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                )}
            </div>
        </button>
    );
};

export default CategoryCard;
