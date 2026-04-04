import React, { useRef } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import './ThemesPage.css'

type ThemeCategory = 'dark' | 'light' | 'special'

interface ThemeInfo {
  id: string
  label: string
  previewClass?: string
  category: ThemeCategory
  description?: string
}

// Temas organizados por categoría (paletas completamente únicas y distintivas)
const THEMES: ThemeInfo[] = [
  // Temas Oscuros (11 temas con paletas únicas)
  { id: 'default', label: 'Predeterminado', previewClass: 'default', category: 'dark', description: 'Tema oscuro profesional' },
  { id: 'dracula', label: 'Dracula', previewClass: 'dracula', category: 'dark', description: 'Retro y vibrante' },
  { id: 'crimson-gold', label: 'Crimson Gold', previewClass: 'crimson-gold', category: 'dark', description: 'Rojo intenso con detalles dorados' },
  { id: 'obsidian-rose', label: 'Obsidian Rose', previewClass: 'obsidian-rose', category: 'dark', description: 'Dramático e intenso' },
  { id: 'aurora-coral', label: 'Aurora Coral', previewClass: 'aurora-coral', category: 'dark', description: 'Cálido y acogedor' },
  { id: 'electric-indigo', label: 'Electric Indigo', previewClass: 'electric-indigo', category: 'dark', description: 'Índigo eléctrico con chispas cyan' },
  { id: 'amber-night', label: 'Amber Night', previewClass: 'amber-night', category: 'dark', description: 'Ámbar profundo con toques bronce' },
  { id: 'oceanic-teal', label: 'Oceanic Teal', previewClass: 'oceanic-teal', category: 'dark', description: 'Fresco y tranquilo' },
  { id: 'toxic-lime', label: 'Toxic Lime', previewClass: 'toxic-lime', category: 'dark', description: 'Lima radioactivo con neón ácido' },
  { id: 'violet-ember', label: 'Violet Ember', previewClass: 'violet-ember', category: 'dark', description: 'Místico y elegante' },
  { id: 'metro-gray', label: 'Metro Gray', previewClass: 'metro-gray', category: 'dark', description: 'Neutro e industrial' },
  
  // Temas Claros (7 temas con paletas únicas)
  { id: 'light', label: 'Light', previewClass: 'light', category: 'light', description: 'Limpio y profesional' },
  { id: 'lavender-dream', label: 'Lavender Dream', previewClass: 'lavender-dream', category: 'light', description: 'Lavanda suave con toques violeta' },
  { id: 'polar-mint', label: 'Polar Mint', previewClass: 'polar-mint', category: 'light', description: 'Fresco y energizante' },
  { id: 'peachy-sunrise', label: 'Peachy Sunrise', previewClass: 'peachy-sunrise', category: 'light', description: 'Durazno vibrante con amanecer coral' },
  { id: 'sakura-blush', label: 'Sakura Blush', previewClass: 'sakura-blush', category: 'light', description: 'Delicado y suave' },
  { id: 'rose-quartz', label: 'Rose Quartz', previewClass: 'rose-quartz', category: 'light', description: 'Rosa cuarzo con detalles fucsia' },
  { id: 'silver-cloud', label: 'Silver Cloud', previewClass: 'silver-cloud', category: 'light', description: 'Plateado brillante con azul cielo' },
  
  // Temas Especiales (4 temas únicos con efectos especiales)
  { id: 'sunburst-rainbow', label: 'Sunburst Rainbow', previewClass: 'sunburst-rainbow', category: 'special', description: 'Arcoíris cálido con efectos RGB animados' },
  { id: 'bold-rainbow', label: 'Bold Rainbow', previewClass: 'bold-rainbow', category: 'special', description: 'RGB intenso con neón y resplandor' },
  { id: 'pastel-dream', label: 'Pastel Dream', previewClass: 'pastel-dream', category: 'special', description: 'Colores pastel suaves multi-color' },
  { id: 'fc-barcelona', label: 'FC Barcelona', previewClass: 'fc-barcelona', category: 'special', description: 'Azulgrana del Barça con detalles dorados' },
];

// Agrupar temas por categoría
const THEME_CATEGORIES = {
  dark: THEMES.filter(t => t.category === 'dark'),
  light: THEMES.filter(t => t.category === 'light'),
  special: THEMES.filter(t => t.category === 'special')
}

export default function ThemesPage() {
  const { theme, setTheme } = useTheme()
  const gridRef = useRef<HTMLDivElement>(null)

  const renderThemeCard = (t: ThemeInfo, i: number) => (
    <div
      key={t.id}
      className={`theme-card ${theme===t.id ? 'active' : ''}`}
      role="radio"
      aria-checked={theme===t.id}
      tabIndex={0}
      onClick={()=>setTheme(t.id as any)}
    >
      <div className={`preview ${t.previewClass ?? ''}`}>
        {theme === t.id && (
          <div className="active-indicator">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}
      </div>
      {(t.previewClass === 'sunburst-rainbow' || t.previewClass === 'bold-rainbow') && (
        <div className="swatches">
          {t.previewClass === 'sunburst-rainbow' ? (
            <> 
              <div className="sw" />
              <div className="sw" />
              <div className="sw" />
              <div className="sw" />
              <div className="sw" />
            </>
          ) : (
            <>
              <div className="sw" />
              <div className="sw" />
              <div className="sw" />
              <div className="sw" />
              <div className="sw" />
              <div className="sw" />
              <div className="sw" />
            </>
          )}
        </div>
      )}
      <div className="meta">
        <div className="meta-label">{t.label}</div>
        {t.description && <div className="meta-description">{t.description}</div>}
      </div>
    </div>
  )

  return (
    <div className="themes-page">
      {/* Header fijo - Doble Header Minimalista */}
      <header className="page-header-integrated">
        <h2 className="page-header-title">Temas</h2>
        <div className="page-header-content">
          <p className="page-header-description">
            Personaliza la apariencia de la aplicación con temas únicos.
          </p>
        </div>
      </header>

      {/* Contenido con scroll */}
      <div className="themes-page__scrollable">
        <div className="themes-page-inner">
          {/* Temas Oscuros */}
          <div className="theme-category">
        <div className="category-header">
          <span className="category-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </span>
          <h3 className="category-title">Temas Oscuros</h3>
          <span className="category-count">{THEME_CATEGORIES.dark.length} temas</span>
        </div>
        <div className="themes-grid" role="radiogroup" aria-label="Temas oscuros" ref={gridRef}>
          {THEME_CATEGORIES.dark.map((t, i) => renderThemeCard(t, i))}
        </div>
      </div>

      {/* Temas Claros */}
      <div className="theme-category">
        <div className="category-header">
          <span className="category-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          </span>
          <h3 className="category-title">Temas Claros</h3>
          <span className="category-count">{THEME_CATEGORIES.light.length} temas</span>
        </div>
        <div className="themes-grid" role="radiogroup" aria-label="Temas claros">
          {THEME_CATEGORIES.light.map((t, i) => renderThemeCard(t, i))}
        </div>
      </div>

      {/* Temas Especiales */}
      <div className="theme-category">
        <div className="category-header">
          <span className="category-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </span>
          <h3 className="category-title">Temas Especiales</h3>
          <span className="category-count">{THEME_CATEGORIES.special.length} temas</span>
        </div>
        <div className="themes-grid" role="radiogroup" aria-label="Temas especiales">
          {THEME_CATEGORIES.special.map((t, i) => renderThemeCard(t, i))}
        </div>
      </div>
        </div>
      </div>
    </div>
  )
}
