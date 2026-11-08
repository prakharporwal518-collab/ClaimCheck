// Scroll and mount reveals, built on GSAP + ScrollTrigger.
// The markup renders in its final state; GSAP only animates *from* hidden, so with
// reduced motion on (or no JavaScript) everything is simply visible.
import { useRef } from 'react'
import { gsap, useMotionGSAP } from '@/lib/gsap'

const EASE = 'power3.out'
// Items already on screen at load start immediately (their start point is above the top of the page).
const START = 'top bottom-=40'

// The resting value for each property we animate from. Tweening to explicit values (fromTo)
// instead of gsap.from() means a CSS transition or a half-finished earlier run can't leave an
// element stuck part-way, because from() would read that in-between value as its end point.
const REST = { autoAlpha: 1, opacity: 1, scale: 1 }
const restingFor = (from) => Object.fromEntries(Object.keys(from).map((k) => [k, REST[k] ?? 0]))
const HIDDEN = { autoAlpha: 0, y: 16 }

/** Fades and slides its content up when it scrolls into view. */
export function InView({ children, delay = 0, as: Comp = 'div', className, ...props }) {
  const ref = useRef(null)
  useMotionGSAP(() => {
    gsap.fromTo(ref.current, HIDDEN, {
      ...restingFor(HIDDEN), duration: 0.55, delay, ease: EASE, clearProps: 'transform',
      scrollTrigger: { trigger: ref.current, start: START, once: true },
    })
  }, { scope: ref })
  return <Comp ref={ref} className={className} {...props}>{children}</Comp>
}

/** Stagger a list: wrap items in <InViewStagger> and each child in <InViewItem>. */
export function InViewStagger({ children, className, stagger = 0.07, as: Comp = 'div' }) {
  const ref = useRef(null)
  useMotionGSAP(() => {
    const items = gsap.utils.toArray('[data-inview-item]', ref.current)
    if (!items.length) return
    gsap.fromTo(items, HIDDEN, {
      ...restingFor(HIDDEN), duration: 0.55, stagger, ease: EASE, clearProps: 'transform',
      scrollTrigger: { trigger: ref.current, start: START, once: true },
    })
  }, { scope: ref })
  return <Comp ref={ref} className={className}>{children}</Comp>
}

export function InViewItem({ children, className, as: Comp = 'div' }) {
  return <Comp data-inview-item="" className={className}>{children}</Comp>
}

/**
 * Plays an entrance on mount and again whenever `watch` changes (a selected id, a week offset…).
 * Animates the element itself, its direct children (`stagger` > 0), or the `targets` selector inside it.
 */
export function Appear({ children, watch, from = { autoAlpha: 0, y: 6 }, targets, stagger = 0, duration = 0.4, delay = 0,
  as: Comp = 'div', ...props }) {
  const ref = useRef(null)
  useMotionGSAP(() => {
    const root = ref.current
    const els = targets ? gsap.utils.toArray(targets, root) : stagger ? [...root.children] : [root]
    if (!els.length) return
    gsap.fromTo(els, from, { ...restingFor(from), duration, delay, stagger, ease: EASE, clearProps: 'transform' })
  }, { scope: ref, dependencies: [watch] })
  return <Comp ref={ref} {...props}>{children}</Comp>
}
