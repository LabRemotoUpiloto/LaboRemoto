/**
 * ThemeContext.tsx — extendido con Mantine colorScheme bridge.
 * Mantiene compatibilidad total con el sistema de 22 temas CSS.
 * Agrega `mantineColorScheme` para que MantineProvider sepa si es dark/light.
 */
import React, { createContext, useContext, useEffect, useState } from 'react'
import { useAppStore } from '@/store/app'
import { getEffectiveRole, usaTemaInstitucional } from '@/features/cuenta/usePermissions'

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

/** Qué temas son light para Mantine */
const LIGHT_THEMES = new Set<Theme>([
  'light', 'lavender-dream', 'polar-mint', 'peachy-sunrise',
  'sakura-blush', 'rose-quartz', 'silver-cloud', 'paper-sand',
  'mist-harbor', 'unipiloto', 'sepia-paper', 'cosmic-latte',
  'pastel-dream'
])

function getMantineScheme(theme: Theme): 'light' | 'dark' {
  return LIGHT_THEMES.has(theme) ? 'light' : 'dark'
}

type ThemeContextType = {
  /** Tema efectivo (el institucional si el rol lo exige). */
  theme: Theme
  setTheme: (t: Theme) => void
  /** Siempre resuelto a un valor concreto -- nunca 'auto' (MantineProvider's
   * forceColorScheme tampoco lo acepta). */
  mantineColorScheme: 'light' | 'dark'
  /** true para roles administrativos: el tema no se puede cambiar. */
  temaFijo: boolean
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

  // El store de auth es global (Zustand), así que se puede leer aunque
  // ThemeProvider envuelva a AuthProvider. La preferencia guardada no se toca:
  // quien use el mismo equipo con otro rol conserva su tema.
  const roles = useAppStore((s) => s.user?.roles)
  const temaFijo = usaTemaInstitucional(getEffectiveRole(roles))
  const efectivo: Theme = temaFijo ? 'unipiloto' : theme

  useEffect(() => {
    try { localStorage.setItem('theme', theme) } catch {}
  }, [theme])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', efectivo)
    // Para la pantalla de carga de index.html, que se pinta antes de que llegue este código: el tema y sus colores ya resueltos
    const guardar = requestAnimationFrame(() => {
      const css = getComputedStyle(document.documentElement)
      try {
        localStorage.setItem('arranque', JSON.stringify({
          tema: efectivo,
          fondo: css.getPropertyValue('--background-primary').trim(),
          texto: css.getPropertyValue('--text-secondary').trim(),
        }))
      } catch {}
    })

    // Lazy-load Google Font for personality themes
    const THEME_FONTS: Partial<Record<Theme, string>> = {
      'unipiloto':       'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&family=Open+Sans:wght@400;500;600&display=swap',
      'dracula':         'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&display=swap',
      'neo-brutalist':   'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800;900&display=swap',
      'amber-night':     'https://fonts.googleapis.com/css2?family=Urbanist:wght@600;700;800&family=Inter:wght@400;500;600&display=swap',
      'oceanic-teal':    'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap',
      'crimson-gold':    'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800;900&family=Inter:wght@400;500;600&display=swap',
      'obsidian-rose':   'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&display=swap',
      'lavender-dream':  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap',
      'polar-mint':      'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap',
      'sepia-paper':     'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,600;0,700;1,500&display=swap',
      'pastel-dream':    'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap',
      'sunburst-rainbow':'https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;700;800&display=swap',
      'glass-water':     'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
    }
    const fontUrl = THEME_FONTS[efectivo]
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
    return () => cancelAnimationFrame(guardar)
  }, [efectivo])

  const setTheme = (t: Theme) => setThemeState(t)
  const mantineColorScheme = getMantineScheme(efectivo)

  return (
    <ThemeContext.Provider value={{ theme: efectivo, setTheme, mantineColorScheme, temaFijo }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
