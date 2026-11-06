import { createContext, useContext, useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { api } from '../lib/api'
import { Logo, Toast } from './ui'

const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)

const NAV = [
  ['/app', 'Inbox', true],
  ['/app/calendar', 'Deadlines'],
  ['/app/analytics', 'Analytics'],
  ['/app/settings', 'Settings'],
]

function Badge({ ok, on, off }) {
  return (
    <span className={`chip ${ok ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {ok ? on : off}
    </span>
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

  const notify = (text, kind = 'info') => setToast({ text, kind })

  return (
    <AppCtx.Provider value={{ health, notify }}>
      <div className="flex min-h-full flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1500px] items-center gap-6 px-4 py-3 sm:px-6">
            <Link to="/" className="flex items-center gap-2 font-extrabold tracking-tight text-brand-900">
              <Logo /> ClaimCheck
            </Link>
            <nav className="flex gap-1 overflow-x-auto">
              {NAV.map(([to, label, end]) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="ml-auto hidden items-center gap-2 lg:flex">
              {health?.offline && <span className="chip bg-rose-100 text-rose-700">API offline</span>}
              {health && !health.offline && (
                <>
                  <Badge ok={health.paypal_mode === 'sandbox'} on="PayPal Sandbox" off="PayPal: seeded demo" />
                  <Badge ok={health.gemini} on={health.gemini_model} off="AI: rules engine" />
                  <Badge ok={health.render_workflows} on="Render Workflows" off="In-process jobs" />
                </>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
        <footer className="border-t border-slate-200 bg-white px-6 py-3 text-center text-xs text-slate-500">
          ClaimCheck drafts; you decide. Nothing is sent to PayPal until you approve it. Not legal advice.
        </footer>
      </div>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </AppCtx.Provider>
  )
}
