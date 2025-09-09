import React from 'react'
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
]

export default function ThemesPage(){
  const { theme, setTheme } = useTheme()
  return (
    <div className="page-content themes-page">
      <h2 className="page-title">Temas</h2>
      <div className="themes-grid">
        {THEMES.map(t => (
          <div key={t.id} className={`theme-card ${theme===t.id ? 'active' : ''}`} onClick={()=>setTheme(t.id as any)}>
            {theme === t.id && <div className="selected-badge">Seleccionado</div>}
            <div className={`preview ${t.previewClass ?? ''}`} />
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
