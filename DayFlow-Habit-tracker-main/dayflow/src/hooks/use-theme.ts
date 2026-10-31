'use client'

import * as React from 'react'

const THEME_KEY = 'dayflow-theme'
type Theme = 'light' | 'dark' | 'system'

export function useTheme() {
  const [theme, setThemeState] = React.useState<Theme>('system')
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem(THEME_KEY) as Theme | null
    if (stored) setThemeState(stored)
  }, [])

  React.useEffect(() => {
    if (!mounted) return
    const root = document.documentElement
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme
    if (resolved === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
  }, [theme, mounted])

  const setTheme = (next: Theme) => {
    setThemeState(next)
    localStorage.setItem(THEME_KEY, next)
  }

  return { theme, setTheme, mounted }
}
