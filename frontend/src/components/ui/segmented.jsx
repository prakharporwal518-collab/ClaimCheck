import { useEffect, useRef } from 'react'
import { gsap, useGSAP } from '@/lib/gsap'
import { cn } from '@/lib/utils'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Segmented control with a sliding highlight (GSAP). The highlight shows which option is
 * selected, so it is always placed: it slides between options, or jumps with reduced motion.
 */
export function Segmented({ value, onChange, options, className, label }) {
  const group = useRef(null)
  const thumb = useRef(null)
  const moveTo = useRef(null)

  useGSAP(() => {
    let placed = false
    moveTo.current = () => {
      const el = group.current?.querySelector('[aria-checked="true"]')
      if (!el) return gsap.set(thumb.current, { autoAlpha: 0 })
      gsap.to(thumb.current, {
        x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight, autoAlpha: 1,
        duration: !placed || reducedMotion() ? 0 : 0.4, ease: 'back.out(1.2)', overwrite: true,
      })
      placed = true
    }
    moveTo.current()
    // Fonts and resizes change the option widths: keep the highlight on its option.
    const ro = new ResizeObserver(() => { placed = false; moveTo.current() })
    ro.observe(group.current)
    return () => ro.disconnect()
  }, { scope: group })

  useEffect(() => { moveTo.current?.() }, [value])

  return (
    <div ref={group} role="radiogroup" aria-label={label}
      className={cn('relative inline-flex max-w-full overflow-x-auto rounded-lg border bg-muted p-0.5', className)}>
      <span ref={thumb} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 rounded-md bg-card shadow-sm ring-1 ring-border"
        style={{ visibility: 'hidden', opacity: 0 }} />
      {options.map(([v, l]) => {
        const active = v === value
        return (
          <button key={v} type="button" role="radio" aria-checked={active} onClick={() => onChange(v)}
            className={cn('relative shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {l}
          </button>
        )
      })}
    </div>
  )
}
