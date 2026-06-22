/**
 * ThemeContext.tsx — extendido con Mantine colorScheme bridge.
 * Mantiene compatibilidad total con el sistema de 22 temas CSS.
 * Agrega `mantineColorScheme` para que MantineProvider sepa si es dark/light.
 */
import React, { createContext, useContext, useEffect, useState } from 'react'
import type { MantineColorScheme } from '@mantine/core'

export type Theme =
  // Oscuros
  | 'default' | 'dracula' | 'crimson-gold' | 'obsidian-rose' | 'aurora-coral'
  | 'electric-indigo' | 'amber-night' | 'oceanic-teal' | 'toxic-lime'
  | 'violet-ember' | 'metro-gray' | 'neo-brutalist'
  // Claros
  | 'light' | 'lavender-dream' | 'polar-mint' | 'peachy-sunrise'
  | 'sakura-blush' | 'rose-quartz' | 'silver-cloud'
  // Institucional
  | 'unipiloto'
  // Especiales
  | 'sunburst-rainbow' | 'bold-rainbow' | 'pastel-dream' | 'fc-barcelona'
  // Legacy (compatibilidad)
  | 'midnight-muse' | 'granite-fog' | 'mist-harbor' | 'paper-sand'
  | 'verdant-neon' | 'sunset-blush' | 'moody-purple' | 'ruby-night'
  | 'forest-moss' | 'berry-soda'
  // Extra (nuevos temas CSS)
  | 'glass-water' | 'cosmic-latte' | 'ember-dawn' | 'nebula-ink' | 'sepia-paper'

export type ThemePersonality = 'recolor' | 'personality' | 'special'

export interface ThemeMeta {
  id: Theme
  label: string
  personality: ThemePersonality
  darkMode: boolean
}

/** Catálogo de temas consolidado a 12 personalidades */
export const THEME_CATALOG: ThemeMeta[] = [
  // Institucional — personality
  { id: 'unipiloto',       label: 'UniPiloto',         personality: 'personality',  darkMode: false },
  
  // Claros — personality
  { id: 'lavender-dream',  label: 'Lavender Dream',    personality: 'personality',  darkMode: false },
  { id: 'polar-mint',      label: 'Polar Mint',        personality: 'personality',  darkMode: false },
  { id: 'sepia-paper',     label: 'Sepia Paper',       personality: 'personality',  darkMode: false },
  { id: 'pastel-dream',    label: 'Pastel Dream',      personality: 'personality',  darkMode: false },

  // Oscuros — personality
  { id: 'dracula',         label: 'Dracula Console',   personality: 'personality',  darkMode: true },
  { id: 'neo-brutalist',   label: 'Brutalist Lime',    personality: 'personality',  darkMode: true },
  { id: 'amber-night',     label: 'Amber Night',       personality: 'personality',  darkMode: true },
  { id: 'oceanic-teal',    label: 'Oceanic Teal',      personality: 'personality',  darkMode: true },
  { id: 'crimson-gold',    label: 'Crimson Gold',      personality: 'personality',  darkMode: true },
  { id: 'obsidian-rose',   label: 'Obsidian Rose',     personality: 'personality',  darkMode: true },

  // Especiales
  { id: 'sunburst-rainbow', label: 'Sunburst Rainbow', personality: 'special',      darkMode: true },
]

/** Qué temas son light para Mantine */
const LIGHT_THEMES = new Set<Theme>([
  'light', 'lavender-dream', 'polar-mint', 'peachy-sunrise',
  'sakura-blush', 'rose-quartz', 'silver-cloud', 'paper-sand',
  'mist-harbor', 'unipiloto', 'sepia-paper', 'cosmic-latte',
  'pastel-dream'
])

export function getMantineScheme(theme: Theme): MantineColorScheme {
  return LIGHT_THEMES.has(theme) ? 'light' : 'dark'
}

type ThemeContextType = {
  theme: Theme
  setTheme: (t: Theme) => void
  mantineColorScheme: MantineColorScheme
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const ThemeProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const v = localStorage.getItem('theme')
      // migrate legacy ids
      if (v === 'fgonzalez') { localStorage.setItem('theme', 'unipiloto'); return 'unipiloto' }
      return (v as Theme) || 'unipiloto'
    } catch { return 'unipiloto' }
  })

  useEffect(() => {
    try { localStorage.setItem('theme', theme) } catch {}
    document.documentElement.setAttribute('data-theme', theme)

    // Lazy-load Google Font for personality themes
    const THEME_FONTS: Partial<Record<Theme, string>> = {
      'unipiloto':      'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Open+Sans:wght@400;600&display=swap',
      'neo-brutalist':   'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap',
      'amber-night':    'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&display=swap',
      'lavender-dream': 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&display=swap',
      'pastel-dream':   'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap',
      'sepia-paper':    'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&display=swap',
    }
    const fontUrl = THEME_FONTS[theme]
    const existingLink = document.getElementById('theme-font') as HTMLLinkElement | null
    if (fontUrl) {
      if (!existingLink) {
        const link = document.createElement('link')
        link.id = 'theme-font'
        link.rel = 'stylesheet'
        link.href = fontUrl
        document.head.appendChild(link)
      } else {
        existingLink.href = fontUrl
      }
    } else if (existingLink) {
      existingLink.remove()
    }
  }, [theme])

  const setTheme = (t: Theme) => setThemeState(t)
  const mantineColorScheme = getMantineScheme(theme)

  return (
    <ThemeContext.Provider value={{ theme, setTheme, mantineColorScheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

export default ThemeContext
