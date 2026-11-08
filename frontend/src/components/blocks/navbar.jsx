// Watermelon-style navbar: logo, animated active link, status slot, theme toggle, mobile menu.
import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Menu, X } from 'lucide-react'
import { Logo } from '@/components/ui'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from './theme-toggle'
import { cn } from '@/lib/utils'

export function Navbar({ links = [], right, cta, sticky = true, maxWidth = 'max-w-[1440px]' }) {
  const [open, setOpen] = useState(false)
  return (
    <header className={cn('z-40 border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65', sticky && 'sticky top-0')}>
      <div className={cn('mx-auto flex h-16 items-center gap-6 px-4 sm:px-6', maxWidth)}>
        <Link to="/" className="flex items-center gap-2.5 rounded-md text-[17px] font-bold tracking-tight" aria-label="ClaimCheck home">
          <Logo className="size-7" />
          <span>ClaimCheck</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {links.map((l) => <NavItem key={l.to} {...l} />)}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {right && <div className="hidden items-center gap-2 xl:flex">{right}</div>}
          <ThemeToggle />
          {cta && <div className="hidden sm:block">{cta}</div>}
          {links.length > 0 && (
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(!open)}
              aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'}>
              {open ? <X /> : <Menu />}
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav aria-label="Mobile" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t md:hidden">
            <div className="flex flex-col gap-1 p-3">
              {links.map((l) => <NavItem key={l.to} {...l} onClick={() => setOpen(false)} mobile />)}
              {right && <div className="flex flex-wrap gap-2 px-1 pt-2">{right}</div>}
              {cta && <div className="px-1 pt-2">{cta}</div>}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}

function NavItem({ to, label, icon: Icon, end, href, onClick, mobile }) {
  const cls = 'relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors'
  if (href) {
    return <a href={href} onClick={onClick} className={cn(cls, 'text-muted-foreground hover:text-foreground')}>{Icon && <Icon className="size-4" />}{label}</a>
  }
  return (
    <NavLink to={to} end={end} onClick={onClick}
      className={({ isActive }) => cn(cls, isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span layoutId={mobile ? 'nav-active-m' : 'nav-active'} className="absolute inset-0 rounded-lg bg-muted"
              transition={{ type: 'spring', bounce: 0.15, duration: 0.45 }} />
          )}
          <span className="relative flex items-center gap-2">{Icon && <Icon className="size-4" />}{label}</span>
        </>
      )}
    </NavLink>
  )
}
