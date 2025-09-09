import React, { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dracula' | 'light' | 'default' | 'midnight-muse' | 'obsidian-rose' | 'mist-harbor' | 'paper-sand' | 'aurora-coral' | 'verdant-neon' | 'sunset-blush' | 'emerald-dusk' | 'moody-purple' | 'oceanic-teal' | 'ruby-night' | 'forest-moss' | 'sunburst-rainbow' | 'lime-electric' | 'berry-soda' | 'citrus-pop' | 'violet-ember' | 'bold-rainbow'

type ThemeContextType = { theme: Theme; setTheme: (t: Theme)=>void }

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const ThemeProvider: React.FC<{children?: React.ReactNode}> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const v = localStorage.getItem('theme')
      // Ensure we don't default to 'light' — prefer the 'default' palette
      if (v === 'light') {
        try { localStorage.setItem('theme', 'default') } catch {}
        return 'default'
      }
      // If there's no saved theme, prefer the new 'midnight-muse' for fresh installs
      return (v as Theme) || 'midnight-muse'
    } catch { return 'midnight-muse' }
  })

  useEffect(() => {
    try { localStorage.setItem('theme', theme) } catch {}
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const setTheme = (t: Theme) => setThemeState(t)

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = ()=>{
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

export default ThemeContext
