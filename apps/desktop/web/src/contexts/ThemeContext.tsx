import React, { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dracula' | 'light'

type ThemeContextType = { theme: Theme; setTheme: (t: Theme)=>void }

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const ThemeProvider: React.FC<{children?: React.ReactNode}> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    try { const v = localStorage.getItem('theme'); return (v as Theme) || 'dracula' } catch { return 'dracula' }
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
