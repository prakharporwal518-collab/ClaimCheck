import { useRef } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import { gsap, useMotionGSAP } from '@/lib/gsap'

export function ThemeToggle({ className }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  const icon = useRef(null)
  const shown = useRef(theme) // only animate on a real change, not on first render

  useMotionGSAP(() => {
    if (shown.current === theme) return
    shown.current = theme
    gsap.fromTo(icon.current, { rotation: -90, scale: 0.4, autoAlpha: 0 },
      { rotation: 0, scale: 1, autoAlpha: 1, duration: 0.4, ease: 'back.out(2)' })
  }, { scope: icon, dependencies: [theme] })

  return (
    <Button variant="ghost" size="icon" onClick={toggle} className={className}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
      <span ref={icon} className="flex">{dark ? <Sun /> : <Moon />}</span>
    </Button>
  )
}
