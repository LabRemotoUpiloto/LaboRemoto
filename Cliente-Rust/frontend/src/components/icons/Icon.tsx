import React from 'react'

export interface IconProps {
  size?: number | string
  color?: string
  className?: string
  style?: React.CSSProperties
}

export const Icon: React.FC<IconProps & { children: React.ReactNode }> = ({
  size = 24,
  color = 'currentColor',
  className = '',
  style,
  children
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {children}
    </svg>
  )
}
