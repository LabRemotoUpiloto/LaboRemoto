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
  | 'violet-ember' | 'metro-gray'
  // Claros
  | 'light' | 'lavender-dream' | 'polar-mint' | 'peachy-sunrise'
  | 'sakura-blush' | 'rose-quartz' | 'silver-cloud'
  // Especiales
  | 'sunburst-rainbow' | 'bold-rainbow' | 'pastel-dream' | 'fc-barcelona'
  // Legacy (compatibilidad)
  | 'midnight-muse' | 'granite-fog' | 'mist-harbor' | 'paper-sand'
  | 'verdant-neon' | 'sunset-blush' | 'moody-purple' | 'ruby-night'
  | 'forest-moss' | 'berry-soda'

/** Qué temas son light para Mantine */
const LIGHT_THEMES = new Set<Theme>([
  'light', 'lavender-dream', 'polar-mint', 'peachy-sunrise',
  'sakura-blush', 'rose-quartz', 'silver-cloud', 'paper-sand',
  'mist-harbor',
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
      if (v === 'fgonzalez') { localStorage.setItem('theme', 'granite-fog'); return 'granite-fog' }
      return (v as Theme) || 'default'
    } catch { return 'default' }
  })

  useEffect(() => {
    try { localStorage.setItem('theme', theme) } catch {}
    document.documentElement.setAttribute('data-theme', theme)
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
