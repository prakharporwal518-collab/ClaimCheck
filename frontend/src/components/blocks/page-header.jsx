import { useRef } from 'react'
import { gsap, useMotionGSAP } from '@/lib/gsap'

export function PageHeader({ title, description, actions, icon: Icon }) {
  const ref = useRef(null)
  useMotionGSAP(() => {
    const q = gsap.utils.selector(ref)
    const tl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.45 } })
    const step = (sel, from, to, at) => { if (q(sel).length) tl.fromTo(q(sel), from, to, at) }
    step('[data-ph="icon"]', { autoAlpha: 0, scale: 0.4, rotation: -20 }, { autoAlpha: 1, scale: 1, rotation: 0, ease: 'back.out(2.2)' })
    step('[data-ph="title"]', { autoAlpha: 0, x: -10 }, { autoAlpha: 1, x: 0 }, '<0.05')
    step('[data-ph="desc"]', { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0 }, '<0.1')
    step('[data-ph="actions"] > *', { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, stagger: 0.05, clearProps: 'transform' }, '<0.05')
  }, { scope: ref })

  return (
    <div ref={ref} className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:text-[28px]">
          {Icon && <Icon data-ph="icon" className="size-6 text-primary-text" aria-hidden="true" />}
          <span data-ph="title">{title}</span>
        </h1>
        {description && <p data-ph="desc" className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div data-ph="actions" className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
