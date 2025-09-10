import React, { useRef } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import './ThemesPage.css'

const THEMES: { id: string; label: string; previewClass?: string }[] = [
  { id: 'default', label: 'Predeterminado', previewClass: 'default' },
  { id: 'dracula', label: 'Dracula (oscuro)', previewClass: 'dracula' },
  { id: 'light', label: 'Light', previewClass: 'light' },
  { id: 'midnight-muse', label: 'Midnight Muse', previewClass: 'midnight-muse' },
  { id: 'obsidian-rose', label: 'Obsidian Rose', previewClass: 'obsidian-rose' },
  { id: 'mist-harbor', label: 'Mist Harbor', previewClass: 'mist-harbor' },
  { id: 'paper-sand', label: 'Paper Sand', previewClass: 'paper-sand' },
  { id: 'aurora-coral', label: 'Aurora Coral', previewClass: 'aurora-coral' },
  { id: 'verdant-neon', label: 'Verdant Neon', previewClass: 'verdant-neon' },
  { id: 'sunset-blush', label: 'Sunset Blush', previewClass: 'sunset-blush' },
  { id: 'emerald-dusk', label: 'Emerald Dusk', previewClass: 'emerald-dusk' },
  { id: 'moody-purple', label: 'Moody Purple', previewClass: 'moody-purple' },
  { id: 'oceanic-teal', label: 'Oceanic Teal', previewClass: 'oceanic-teal' },
  { id: 'ruby-night', label: 'Ruby Night', previewClass: 'ruby-night' },
  { id: 'forest-moss', label: 'Forest Moss', previewClass: 'forest-moss' },
  { id: 'sunburst-rainbow', label: 'Sunburst Rainbow', previewClass: 'sunburst-rainbow' },
  { id: 'lime-electric', label: 'Lime Electric', previewClass: 'lime-electric' },
  { id: 'berry-soda', label: 'Berry Soda', previewClass: 'berry-soda' },
  { id: 'citrus-pop', label: 'Citrus Pop', previewClass: 'citrus-pop' },
  { id: 'violet-ember', label: 'Violet Ember', previewClass: 'violet-ember' },
  { id: 'bold-rainbow', label: 'Bold Rainbow', previewClass: 'bold-rainbow' },
  { id: 'polar-mint', label: 'Polar Mint', previewClass: 'polar-mint' },
  { id: 'midday-azure', label: 'Midday Azure', previewClass: 'midday-azure' },
  { id: 'sakura-blush', label: 'Sakura Blush', previewClass: 'sakura-blush' },
  { id: 'glass-water', label: 'Glass Water', previewClass: 'glass-water' },
  { id: 'metro-gray', label: 'Metro Gray', previewClass: 'metro-gray' },
  { id: 'cosmic-latte', label: 'Cosmic Latte', previewClass: 'cosmic-latte' },
  { id: 'ember-dawn', label: 'Ember Dawn', previewClass: 'ember-dawn' },
  { id: 'nebula-ink', label: 'Nebula Ink', previewClass: 'nebula-ink' },
  { id: 'sepia-paper', label: 'Sepia Paper', previewClass: 'sepia-paper' },
  { id: 'granite-fog', label: 'Granite Fog', previewClass: 'granite-fog' },
]

export default function ThemesPage(){
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
  return (
    <div className="page-content themes-page">
      <h2 className="page-title">Temas</h2>
      <div className="themes-grid" role="radiogroup" aria-label="Selector de tema" ref={gridRef}>
        {THEMES.map((t, i) => (
          <div
            key={t.id}
            className={`theme-card ${theme===t.id ? 'active' : ''}`}
            role="radio"
            aria-checked={theme===t.id}
            tabIndex={0}
            onKeyDown={(e)=>onCardKeyDown(e, i, t.id)}
            onClick={()=>setTheme(t.id as any)}
          >
            {theme === t.id && <div className="selected-badge">Seleccionado</div>}
            <div className={`preview ${t.previewClass ?? ''}`} />
            <button className="apply-btn" onClick={(e)=>{ e.stopPropagation(); setTheme(t.id as any) }}>Aplicar</button>
            {(t.previewClass === 'sunburst-rainbow' || t.previewClass === 'bold-rainbow') && (
              <div className="swatches">
                {/* sunburst: 5 swatches, bold: 7 swatches */}
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
            <div className="meta">{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
