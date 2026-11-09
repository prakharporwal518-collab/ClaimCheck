// Watermelon-style navbar: logo, sliding active-link pill, status slot, theme toggle, mobile menu.
// Animated with GSAP. The pill marks the current page, so it is always positioned; with reduced
// motion it simply jumps instead of sliding, and the purely decorative motion is skipped.
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Logo } from '@/components/ui'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from './theme-toggle'
import { gsap, ScrollTrigger, useGSAP, useMotionGSAP } from '@/lib/gsap'
import { cn } from '@/lib/utils'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Navbar({ links = [], right, cta, sticky = true, maxWidth = 'max-w-[1440px]' }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const header = useRef(null)
  const nav = useRef(null)
  const pill = useRef(null)
  const mobile = useRef(null)
  const menuIcon = useRef(null)
  const pillTo = useRef(null) // (link element | null, instant?) => void, set up below
  const wasOpen = useRef(open)

  // Sliding pill: follows the hovered link, rests on the current page's link.
  const { contextSafe } = useGSAP(() => {
    let placed = false
    pillTo.current = (el, instant) => {
      const now = instant || !placed || reducedMotion()
      if (!el) {
        gsap.to(pill.current, { autoAlpha: 0, duration: now ? 0 : 0.2, overwrite: true })
        return
      }
      gsap.to(pill.current, {
        x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight,
        autoAlpha: 1, duration: now ? 0 : 0.45, ease: 'power3.out', overwrite: true,
      })
      placed = true
    }
    const active = () => nav.current?.querySelector('[aria-current="page"]')
    pillTo.current(active(), true)

    // Fonts loading or the window resizing moves the links: keep the pill on its link.
    const ro = new ResizeObserver(() => pillTo.current?.(active(), true))
    if (nav.current) ro.observe(nav.current)

    // Soft shadow once the page has scrolled (a data attribute, so React's className stays untouched).
    const setScrolled = (y) => header.current?.toggleAttribute('data-scrolled', y > 8)
    const shadow = ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => setScrolled(self.scroll()) })
    setScrolled(shadow.scroll())
    return () => { ro.disconnect(); shadow.kill() }
  }, { scope: header })

  useEffect(() => {
    pillTo.current?.(nav.current?.querySelector('[aria-current="page"]'))
    setOpen(false) // a new page closes the mobile menu
  }, [pathname])

  const onLinkEnter = contextSafe((e) => pillTo.current?.(e.currentTarget))
  const onNavLeave = contextSafe(() => pillTo.current?.(nav.current?.querySelector('[aria-current="page"]')))

  // Entrance on first load: logo pops, then links and the right-hand controls drop in.
  useMotionGSAP(() => {
    const q = gsap.utils.selector(header)
    const tl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.45 } })
    tl.fromTo(q('[data-nav="logo"]'), { autoAlpha: 0, scale: 0.5, rotation: -30 }, { autoAlpha: 1, scale: 1, rotation: 0, ease: 'back.out(2)', duration: 0.6 })
      .fromTo(q('[data-nav="brand"]'), { autoAlpha: 0, x: -8 }, { autoAlpha: 1, x: 0 }, '<0.1')
    const items = q('[data-nav="link"], [data-nav="end"] > *')
    if (items.length) tl.fromTo(items, { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, stagger: 0.05, clearProps: 'transform' }, '<0.05')
  }, { scope: header })

  // Logo wiggle on hover.
  const wiggle = contextSafe(() => {
    if (reducedMotion()) return
    gsap.to(header.current.querySelector('[data-nav="logo"]'), {
      keyframes: { rotation: [0, -14, 10, 0] }, duration: 0.6, ease: 'power2.out', overwrite: true,
    })
  })

  // Mobile menu: grow to its natural height and drop the links in; collapse on close.
  useGSAP(() => {
    const el = mobile.current
    if (!el) return
    const instant = reducedMotion()
    if (open) {
      gsap.timeline()
        .to(el, { height: 'auto', autoAlpha: 1, duration: instant ? 0 : 0.35, ease: 'power3.out' })
        .fromTo(el.querySelectorAll('[data-mnav]'), { autoAlpha: 0, y: -6 },
          { autoAlpha: 1, y: 0, stagger: 0.04, duration: instant ? 0 : 0.25, ease: 'power2.out' }, '<0.05')
    } else {
      gsap.to(el, { height: 0, autoAlpha: 0, duration: instant ? 0 : 0.25, ease: 'power2.in' })
    }
    // The menu icon spins as it swaps.
    if (wasOpen.current !== open && !instant) {
      gsap.fromTo(menuIcon.current, { rotation: open ? -90 : 90, scale: 0.6 }, { rotation: 0, scale: 1, duration: 0.3, ease: 'back.out(2)' })
    }
    wasOpen.current = open
  }, { scope: header, dependencies: [open] })

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header ref={header} className={cn('z-40 border-b bg-background/80 backdrop-blur-xl transition-shadow duration-300 supports-[backdrop-filter]:bg-background/65', sticky && 'sticky top-0')}>
      <div className={cn('mx-auto flex h-16 items-center gap-6 px-4 sm:px-6', maxWidth)}>
        <Link to="/" onPointerEnter={wiggle} className="flex items-center gap-2.5 rounded-md text-[17px] font-bold tracking-tight" aria-label="ClaimCheck home">
          <span data-nav="logo" className="inline-flex"><Logo className="size-7" /></span>
          <span data-nav="brand">ClaimCheck</span>
        </Link>

        <nav ref={nav} aria-label="Main" onPointerLeave={onNavLeave} className="relative hidden items-center gap-1 md:flex">
          <span ref={pill} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 rounded-lg bg-muted"
            style={{ visibility: 'hidden', opacity: 0 }} />
          {links.map((l) => <NavItem key={l.to} {...l} onPointerEnter={onLinkEnter} />)}
        </nav>

        <div data-nav="end" className="ml-auto flex items-center gap-2">
          {right && <div className="hidden items-center gap-2 xl:flex">{right}</div>}
          <ThemeToggle />
          {cta && <div className="hidden sm:block">{cta}</div>}
          {links.length > 0 && (
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(!open)}
              aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? 'Close menu' : 'Open menu'}>
              <span ref={menuIcon} className="flex">{open ? <X /> : <Menu />}</span>
            </Button>
          )}
        </div>
      </div>

      {links.length > 0 && (
        // Always rendered so it can animate closed; hidden (and unfocusable) until opened.
        <nav ref={mobile} id="mobile-nav" aria-label="Mobile" className="overflow-hidden md:hidden"
          style={{ height: 0, visibility: 'hidden', opacity: 0 }}>
          <div className="flex flex-col gap-1 border-t p-3">
            {links.map((l) => <NavItem key={l.to} {...l} onClick={() => setOpen(false)} mobile />)}
            {right && <div data-mnav="" className="flex flex-wrap gap-2 px-1 pt-2">{right}</div>}
            {cta && <div data-mnav="" className="px-1 pt-2">{cta}</div>}
          </div>
        </nav>
      )}
    </header>
  )
}

function NavItem({ to, label, icon: Icon, end, href, onClick, onPointerEnter, mobile }) {
  const cls = 'relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors'
  const data = mobile ? { 'data-mnav': '' } : { 'data-nav': 'link' }
  if (href) {
    return (
      <a href={href} onClick={onClick} onPointerEnter={onPointerEnter} {...data}
        className={cn(cls, 'text-muted-foreground hover:text-foreground')}>
        {Icon && <Icon className="size-4" />}{label}
      </a>
    )
  }
  return (
    <NavLink to={to} end={end} onClick={onClick} onPointerEnter={onPointerEnter} {...data}
      className={({ isActive }) => cn(cls, isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        mobile && isActive && 'bg-muted')}>
      {Icon && <Icon className="size-4" />}{label}
    </NavLink>
  )
}
