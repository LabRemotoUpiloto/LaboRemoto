import React from 'react'
import './HamburgerIcon.css'

interface HamburgerIconProps {
  isOpen: boolean
  onClick: () => void
  className?: string
}

const HamburgerIcon: React.FC<HamburgerIconProps> = ({ isOpen, onClick, className = '' }) => {
  return (
    <button 
      className={`hamburger-button ${isOpen ? 'open' : ''} ${className}`}
      onClick={onClick}
      aria-label={isOpen ? 'Cerrar menú' : 'Abrir menú'}
      aria-expanded={isOpen}
    >
      <span className="hamburger-box">
        <span className="hamburger-inner"></span>
      </span>
    </button>
  )
}

export default HamburgerIcon
