import React, { createContext, useCallback, useContext, useState } from 'react'

type LoadingContextType = {
  loading: boolean
  label: string | null
  setLoading: (v: boolean, label?: string | null) => void
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined)

export const LoadingProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [loading, setLoadingState] = useState(false)
  const [label, setLabel] = useState<string | null>(null)

  const setLoading = useCallback((v: boolean, l: string | null = null) => {
    setLoadingState(v)
    setLabel(l)
  }, [])

  return (
    <LoadingContext.Provider value={{ loading, label, setLoading }}>
      {children}
    </LoadingContext.Provider>
  )
}

export const useLoading = () => {
  const ctx = useContext(LoadingContext)
  if (!ctx) throw new Error('useLoading must be used within LoadingProvider')
  return ctx
}

export default LoadingContext
