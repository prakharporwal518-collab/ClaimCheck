import { useCallback, useSyncExternalStore } from 'react'

const KEY = 'claimcheck-theme'

function read() {
  try {
    const t = localStorage.getItem(KEY)
    if (t === 'light' || t === 'dark') return t
  } catch { /* storage blocked */ }
  return null
}

const system = () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

// One shared theme for the whole app. Every useTheme() reads this store, so the navbar toggle,
// the Settings page and the Analytics dashboard always agree. (Each call used to keep its own
// copy, so the dashboard kept its old colours after you switched theme from the navbar.)
// index.html sets the <html> class before first paint, so start from that.
let current = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
const listeners = new Set()

function apply(theme) {
  if (theme === current) return
  current = theme
  document.documentElement.classList.toggle('dark', theme === 'dark')
  listeners.forEach((notify) => notify())
}

const subscribe = (notify) => {
  listeners.add(notify)
  return () => listeners.delete(notify)
}
const getSnapshot = () => current

// Follow the system setting until the viewer picks one, and follow a choice made in another tab.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!read()) apply(system()) })
window.addEventListener('storage', (e) => { if (e.key === KEY) apply(read() || system()) })

/** Light/dark theme: the viewer's saved choice, else the system setting. Shared app-wide. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot)

  const setTheme = useCallback((t) => {
    try { localStorage.setItem(KEY, t) } catch { /* storage blocked */ }
    apply(t)
  }, [])

  const toggle = useCallback(() => setTheme(current === 'dark' ? 'light' : 'dark'), [setTheme])

  return { theme, setTheme, toggle }
}

/** Resolved colour of a CSS variable, for canvas-drawn widgets (AG Studio charts). */
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
