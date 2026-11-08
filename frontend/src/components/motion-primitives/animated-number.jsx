// Counts up to `value` with GSAP: from 0 the first time it scrolls into view, then from the
// number on screen whenever `value` changes. Renders the final value when motion is reduced.
import { useRef, useState } from 'react'
import { gsap, useMotionGSAP } from '@/lib/gsap'
import { cn } from '@/lib/utils'

const defaultFormat = (v) => Math.round(v).toLocaleString('en-US')

export function AnimatedNumber({ value, format = defaultFormat, duration = 1.2, as: Comp = 'span', className }) {
  const ref = useRef(null)
  const formatRef = useRef(format)
  formatRef.current = format // callers often pass an inline function; don't re-run on every render
  const shown = useRef(0)    // the number currently on screen
  const started = useRef(false)
  const [frame, setFrame] = useState(null) // text while animating; null = show the final value

  useMotionGSAP(() => {
    if (!Number.isFinite(value)) return
    const fmt = (v) => formatRef.current(v)
    const obj = { v: shown.current }
    setFrame(fmt(obj.v))
    gsap.to(obj, {
      v: value,
      duration,
      ease: 'power2.out',
      onUpdate: () => { shown.current = obj.v; setFrame(fmt(obj.v)) },
      onComplete: () => setFrame(null),
      scrollTrigger: started.current ? undefined : { trigger: ref.current, start: 'top bottom', once: true },
    })
    started.current = true
    return () => setFrame(null)
  }, { scope: ref, dependencies: [value] })

  const ok = Number.isFinite(value)
  return (
    <Comp ref={ref} className={cn('tabular', className)} aria-label={ok ? format(value) : undefined}>
      {ok ? (frame ?? format(value)) : '—'}
    </Comp>
  )
}
