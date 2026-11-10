// Small shared pieces used across pages (kept at this path so existing imports keep working).
import { useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, Info, Loader2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { gsap, useGSAP, useMotionGSAP } from '@/lib/gsap'
import { cn } from '@/lib/utils'

export function Logo({ className = 'h-7 w-7' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="cc-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b7cfa" />
          <stop offset="1" stopColor="#2a52d9" />
        </linearGradient>
      </defs>
      <path d="M16 2 4 7v8c0 7.2 5 13.4 12 15 7-1.6 12-7.8 12-15V7z" fill="url(#cc-logo)" />
      <path d="m10.5 16 4 4 7-8" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const STRENGTH_TONE = { High: 'success', Medium: 'warning', Low: 'danger' }

export function ScorePill({ label, score }) {
  if (!label) return <span className="text-xs text-subtle">Not analysed</span>
  return (
    <Badge tone={STRENGTH_TONE[label]}>
      {label}
      {score != null && <span className="font-mono tabular">{score}/10</span>}
    </Badge>
  )
}

const FLAG = {
  contradicted: { tone: 'danger', text: 'Contradicted', dot: 'bg-danger' },
  supported: { tone: 'success', text: 'Supported', dot: 'bg-success' },
  unverified: { tone: 'neutral', text: 'Unverified', dot: 'border-2 border-subtle bg-transparent' },
}

/**
 * A claim's verdict badge. With `pop` set (for a few seconds after an analysis finishes), a
 * "Contradicted" badge bounces, its dot throbs and a ring pulses out twice. `pop` can be a run
 * number: each new value replays the pop. `delay` lets a list of flags pop one after another.
 * Nothing animates when the viewer prefers reduced motion.
 */
export function StatusFlag({ status, pop = false, delay = 0 }) {
  const f = FLAG[status] || FLAG.unverified
  const popping = Boolean(pop) && status === 'contradicted'
  const badge = useRef(null)

  useMotionGSAP(() => {
    if (!popping) return
    const q = gsap.utils.selector(badge)
    gsap.timeline({ delay })
      .to(badge.current, { keyframes: { scale: [1, 1.18, 0.96, 1] }, duration: 0.5, ease: 'power2.out' })
      .fromTo(q('[data-flag="dot"]'), { scale: 1 }, { keyframes: { scale: [1, 1.9, 1] }, duration: 0.5, ease: 'power2.out', repeat: 1, repeatDelay: 0.4 }, 0)
      // Grow the ring's edges outward by the same distance on every side (scaling a wide pill
      // would spread it far more sideways than up and down, and thicken the border).
      .fromTo(q('[data-flag="ring"]'), { inset: 0, autoAlpha: 0.75 }, { inset: -9, autoAlpha: 0, duration: 0.9, ease: 'power2.out', repeat: 1 }, 0)
  }, { scope: badge, dependencies: [popping ? pop : false] })

  return (
    <Badge ref={badge} tone={f.tone} className="relative">
      {popping && (
        <span data-flag="ring" aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-danger opacity-0" />
      )}
      <span data-flag="dot" className={cn('inline-block size-2 rounded-full', f.dot)} aria-hidden="true" />
      {f.text}
    </Badge>
  )
}

export function Spinner({ className = 'size-4' }) {
  return <Loader2 className={cn('animate-spin', className)} aria-hidden="true" />
}

const TOAST = {
  error: { icon: CircleAlert, cls: 'glass border-danger-border! text-foreground [&_.ti]:text-danger' },
  success: { icon: CheckCircle2, cls: 'glass border-success-border! text-foreground [&_.ti]:text-success' },
  info: { icon: Info, cls: 'glass text-foreground [&_.ti]:text-primary-text' },
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Toast with GSAP enter and exit. When `toast` becomes null the last message stays on screen
 * while it animates out, then unmounts. A thin bar counts down the `duration` before auto-close.
 */
export function Toast({ toast, onClose, duration = 5000 }) {
  const [shown, setShown] = useState(toast)
  if (toast && toast !== shown) setShown(toast) // a new message replaces the old one straight away
  const box = useRef(null)
  const t = shown && (TOAST[shown.kind] || TOAST.info)

  useGSAP(() => {
    const el = box.current
    if (!el) return
    const q = gsap.utils.selector(el)
    const instant = reducedMotion()
    if (toast) {
      // overwrite stops a still-running exit, so its onComplete can't hide this new message
      gsap.timeline()
        .fromTo(el, { autoAlpha: 0, y: 16, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: instant ? 0 : 0.4, ease: 'back.out(1.6)', overwrite: true })
        .fromTo(q('.ti'), { scale: 0.3, rotation: -45 }, { scale: 1, rotation: 0, duration: instant ? 0 : 0.45, ease: 'back.out(3)' }, '<0.1')
      if (!instant) gsap.fromTo(q('[data-toast="timer"]'), { scaleX: 1 }, { scaleX: 0, duration: duration / 1000, ease: 'none' })
    } else {
      gsap.to(el, { autoAlpha: 0, y: 8, scale: 0.98, duration: instant ? 0 : 0.25, ease: 'power2.in', overwrite: true, onComplete: () => setShown(null) })
    }
  }, { scope: box, dependencies: [toast] })

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-end sm:inset-x-auto sm:right-5">
      {shown && (
        <div ref={box} role="status" aria-live="polite"
          className={cn('pointer-events-auto relative flex w-full max-w-md items-start gap-3 overflow-hidden rounded-xl border px-4 py-3 text-sm', t.cls)}>
          <t.icon className="ti mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 leading-relaxed">{shown.text}</span>
          <button onClick={onClose} className="rounded text-muted-foreground hover:text-foreground" aria-label="Dismiss">
            <X className="size-4" />
          </button>
          <span data-toast="timer" aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-current opacity-20" />
        </div>
      )}
    </div>
  )
}
