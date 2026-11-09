import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { BarChart3, CalendarClock, Inbox, Settings } from 'lucide-react'
import { api } from '../lib/api'
import { gsap, ScrollTrigger, useMotionGSAP } from '../lib/gsap'
import { Toast } from './ui'
import { Navbar } from './blocks/navbar'
import { Badge } from './ui/badge'

const TOAST_MS = 5000 // how long a toast stays up

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
    const t = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(t)
  }, [toast])

  // Page transition: each route fades up into place.
  const { pathname } = useLocation()
  const main = useRef(null)
  useMotionGSAP(() => {
    gsap.fromTo(main.current, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power3.out', clearProps: 'transform' })
  }, { scope: main, dependencies: [pathname] })

  // Pages fill in after data loads, which moves scroll-reveal trigger points: re-measure them.
  useEffect(() => {
    let t
    const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => ScrollTrigger.refresh(), 150) })
    ro.observe(main.current)
    return () => { ro.disconnect(); clearTimeout(t) }
  }, [])

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
        <main ref={main} id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
        <footer className="border-t px-6 py-4 text-center text-xs text-muted-foreground">
          ClaimCheck drafts; you decide. Nothing is sent to PayPal until you approve it. Not legal advice.
        </footer>
      </div>
      <Toast toast={toast} onClose={() => setToast(null)} duration={TOAST_MS} />
    </AppCtx.Provider>
  )
}
