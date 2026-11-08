import { useCallback, useEffect, useState } from 'react'

const KEY = 'claimcheck-theme'

function read() {
  try {
    const t = localStorage.getItem(KEY)
    if (t === 'light' || t === 'dark') return t
  } catch { /* storage blocked */ }
  return null
}

const system = () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

/** Light/dark theme: the viewer's saved choice, else the system setting. */
export function useTheme() {
  const [theme, setThemeState] = useState(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'))

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Follow the system setting until the viewer picks one.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => { if (!read()) setThemeState(system()) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback((t) => {
    try { localStorage.setItem(KEY, t) } catch { /* storage blocked */ }
    setThemeState(t)
  }, [])

  return { theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
}

/** Resolved colour of a CSS variable, for canvas-drawn widgets (AG Studio charts). */
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
