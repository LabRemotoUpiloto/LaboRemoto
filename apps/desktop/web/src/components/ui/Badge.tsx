import React from 'react'
import './Badge.css'

export type BadgeVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
export type BadgeSize = 'sm' | 'md' | 'lg'

export interface BadgeProps {
  variant?: BadgeVariant
  size?: BadgeSize
  children: React.ReactNode
  icon?: React.ReactNode
  className?: string
  onClick?: () => void
}

/**
 * Componente de badge reutilizable con múltiples variantes y tamaños.
 * Usa las nuevas variables CSS expandidas.
 * 
 * @example
 * ```tsx
 * <Badge variant="success" size="md">Conectado</Badge>
 * <Badge variant="primary" icon="⭐">Premium</Badge>
 * <Badge variant="neutral">Inactivo</Badge>
 * ```
 */
const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  children,
  icon,
  className = '',
  onClick
}) => {
  const isClickable = !!onClick
  
  return (
    <span
      className={`badge badge-${variant} badge-${size} ${isClickable ? 'badge-clickable' : ''} ${className}`}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      {icon && <span className="badge-icon" aria-hidden="true">{icon}</span>}
      <span className="badge-text">{children}</span>
    </span>
  )
}

export default Badge
