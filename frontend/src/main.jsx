import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import AppShell from './components/AppShell'
import Landing from './pages/Landing'
import { Spinner } from './components/ui'

// The landing page loads first; grids and AG Studio load with the app pages.
const Inbox = lazy(() => import('./pages/Inbox'))
const Dispute = lazy(() => import('./pages/Dispute'))
const Calendar = lazy(() => import('./pages/Calendar'))
const Settings = lazy(() => import('./pages/Settings'))
const Analytics = lazy(() => import('./pages/Analytics'))

const page = (El, label = 'Loading…') => (
  <Suspense fallback={<div className="flex items-center gap-2 text-muted-foreground" role="status"><Spinner /> {label}</div>}>
    <El />
  </Suspense>
)

const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  {
    path: '/app',
    element: <AppShell />,
    children: [
      { index: true, element: page(Inbox) },
      { path: 'disputes/:id', element: page(Dispute) },
      { path: 'calendar', element: page(Calendar) },
      { path: 'analytics', element: page(Analytics, 'Loading AG Studio…') },
      { path: 'settings', element: page(Settings) },
    ],
  },
])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Animations use GSAP; each one checks the viewer's "reduce motion" setting (lib/gsap.js). */}
    <RouterProvider router={router} />
  </StrictMode>,
)
