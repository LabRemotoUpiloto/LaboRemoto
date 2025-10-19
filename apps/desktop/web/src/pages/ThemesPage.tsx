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
  // 🌙 Temas Oscuros (11 temas con paletas únicas)
  { id: 'default', label: 'Predeterminado', previewClass: 'default', category: 'dark', description: 'Tema oscuro profesional' },
  { id: 'dracula', label: 'Dracula', previewClass: 'dracula', category: 'dark', description: 'Retro y vibrante' },
  { id: 'crimson-gold', label: 'Crimson Gold', previewClass: 'crimson-gold', category: 'dark', description: '🔥 Rojo intenso con detalles dorados' },
  { id: 'obsidian-rose', label: 'Obsidian Rose', previewClass: 'obsidian-rose', category: 'dark', description: 'Dramático e intenso' },
  { id: 'aurora-coral', label: 'Aurora Coral', previewClass: 'aurora-coral', category: 'dark', description: 'Cálido y acogedor' },
  { id: 'electric-indigo', label: 'Electric Indigo', previewClass: 'electric-indigo', category: 'dark', description: '⚡ Índigo eléctrico con chispas cyan' },
  { id: 'amber-night', label: 'Amber Night', previewClass: 'amber-night', category: 'dark', description: '🌙 Ámbar profundo con toques bronce' },
  { id: 'oceanic-teal', label: 'Oceanic Teal', previewClass: 'oceanic-teal', category: 'dark', description: 'Fresco y tranquilo' },
  { id: 'toxic-lime', label: 'Toxic Lime', previewClass: 'toxic-lime', category: 'dark', description: '☢️ Lima radioactivo con neón ácido' },
  { id: 'violet-ember', label: 'Violet Ember', previewClass: 'violet-ember', category: 'dark', description: 'Místico y elegante' },
  { id: 'metro-gray', label: 'Metro Gray', previewClass: 'metro-gray', category: 'dark', description: 'Neutro e industrial' },
  
  // ☀️ Temas Claros (7 temas con paletas únicas)
  { id: 'light', label: 'Light', previewClass: 'light', category: 'light', description: 'Limpio y profesional' },
  { id: 'lavender-dream', label: 'Lavender Dream', previewClass: 'lavender-dream', category: 'light', description: '💜 Lavanda suave con toques violeta' },
  { id: 'polar-mint', label: 'Polar Mint', previewClass: 'polar-mint', category: 'light', description: 'Fresco y energizante' },
  { id: 'peachy-sunrise', label: 'Peachy Sunrise', previewClass: 'peachy-sunrise', category: 'light', description: '🍑 Durazno vibrante con amanecer coral' },
  { id: 'sakura-blush', label: 'Sakura Blush', previewClass: 'sakura-blush', category: 'light', description: 'Delicado y suave' },
  { id: 'rose-quartz', label: 'Rose Quartz', previewClass: 'rose-quartz', category: 'light', description: '🌹 Rosa cuarzo con detalles fucsia' },
  { id: 'silver-cloud', label: 'Silver Cloud', previewClass: 'silver-cloud', category: 'light', description: '☁️ Plateado brillante con azul cielo' },
  
  // 🌈 Temas Especiales (4 temas únicos con efectos especiales)
  { id: 'sunburst-rainbow', label: 'Sunburst Rainbow', previewClass: 'sunburst-rainbow', category: 'special', description: '🌅 Arcoíris cálido con efectos RGB animados' },
  { id: 'bold-rainbow', label: 'Bold Rainbow', previewClass: 'bold-rainbow', category: 'special', description: '⚡ RGB intenso con neón y resplandor' },
  { id: 'pastel-dream', label: 'Pastel Dream', previewClass: 'pastel-dream', category: 'special', description: '🍭 Colores pastel suaves multi-color' },
  { id: 'fc-barcelona', label: 'FC Barcelona', previewClass: 'fc-barcelona', category: 'special', description: '⚽ Azulgrana del Barça con detalles dorados' },
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

  const onCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, idx: number, id: string) => {
    const target = e.currentTarget
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setTheme(id as any)
      return
    }
    const grid = gridRef.current
    if (!grid) return
  const cards = Array.from(grid.querySelectorAll('.theme-card')) as HTMLElement[]
  const focusCard = (i: number) => { const el = cards[i]; if (el) (el as HTMLElement).focus() }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); focusCard(Math.min(cards.length - 1, idx + 1)) }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); focusCard(Math.max(0, idx - 1)) }
  }
  const renderThemeCard = (t: ThemeInfo, i: number) => (
    <div
      key={t.id}
      className={`theme-card ${theme===t.id ? 'active' : ''}`}
      role="radio"
      aria-checked={theme===t.id}
      tabIndex={0}
      onKeyDown={(e)=>onCardKeyDown(e, i, t.id)}
      onClick={()=>setTheme(t.id as any)}
    >
      <div className={`preview ${t.previewClass ?? ''}`} />
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
    <div className="page-content themes-page">
      <div className="themes-page-inner">
        <h2 className="page-title">Temas</h2>
        <p className="page-description">
          Personaliza la apariencia de la aplicación con una amplia variedad de temas oscuros, claros y coloridos.
        </p>

        {/* Temas Oscuros */}
        <div className="theme-category">
        <div className="category-header">
          <span className="category-icon">🌙</span>
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
          <span className="category-icon">☀️</span>
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
          <span className="category-icon">🌈</span>
          <h3 className="category-title">Temas Especiales</h3>
          <span className="category-count">{THEME_CATEGORIES.special.length} temas</span>
        </div>
        <div className="themes-grid" role="radiogroup" aria-label="Temas especiales">
          {THEME_CATEGORIES.special.map((t, i) => renderThemeCard(t, i))}
        </div>
      </div>
      </div>
    </div>
  )
}
