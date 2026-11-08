import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { BarChart3, CalendarClock, Inbox, Settings } from 'lucide-react'
import { api } from '../lib/api'
import { Toast } from './ui'
import { Navbar } from './blocks/navbar'
import { Badge } from './ui/badge'

const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)

const NAV = [
  { to: '/app', label: 'Inbox', icon: Inbox, end: true },
  { to: '/app/calendar', label: 'Deadlines', icon: CalendarClock },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]

function Status({ ok, on, off }) {
  return (
    <Badge tone={ok ? 'success' : 'neutral'}>
      <span className={`size-1.5 rounded-full ${ok ? 'bg-success' : 'bg-subtle'}`} aria-hidden="true" />
      {ok ? on : off}
    </Badge>
  )
}

export default function AppShell() {
  const [health, setHealth] = useState(null)
  const [toast, setToast] = useState(null)
  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ offline: true }))
  }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const notify = useCallback((text, kind = 'info') => setToast({ text, kind }), [])

  const status = health && (health.offline ? (
    <Badge tone="danger">API offline</Badge>
  ) : (
    <>
      <Status ok={health.paypal_sources?.includes('sandbox')}
        on={health.paypal_sources?.includes('mock') ? 'PayPal Sandbox + demo data' : 'PayPal Sandbox'} off="PayPal: seeded demo" />
      <Status ok={health.gemini} on={health.gemini_model} off="AI: rules engine" />
      <Status ok={health.render_workflows} on="Render Workflows" off="In-process jobs" />
    </>
  ))

  return (
    <AppCtx.Provider value={{ health, notify }}>
      <div className="relative flex min-h-screen flex-col">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 overflow-hidden">
          <div className="bg-pattern-dots fade-bottom absolute inset-0" />
        </div>
        <Navbar links={NAV} right={status} />
        <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
        <footer className="border-t px-6 py-4 text-center text-xs text-muted-foreground">
          ClaimCheck drafts; you decide. Nothing is sent to PayPal until you approve it. Not legal advice.
        </footer>
      </div>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </AppCtx.Provider>
  )
}
