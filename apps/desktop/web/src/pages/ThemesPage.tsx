import React from 'react'
import { useTheme } from '../contexts/ThemeContext'
import './ThemesPage.css'

export default function ThemesPage(){
  const { theme, setTheme } = useTheme()
  return (
    <div className="page-content themes-page">
      <h2 className="page-title">Temas</h2>
      <div className="themes-grid">
        <div className={`theme-card ${theme==='dracula' ? 'active' : ''}`} onClick={()=>setTheme('dracula')}>
          <div className="preview dracula" />
          <div className="meta">Dracula (oscuro)</div>
        </div>
        <div className={`theme-card ${theme==='light' ? 'active' : ''}`} onClick={()=>setTheme('light')}>
          <div className="preview light" />
          <div className="meta">Light</div>
        </div>
      </div>
    </div>
  )
}
