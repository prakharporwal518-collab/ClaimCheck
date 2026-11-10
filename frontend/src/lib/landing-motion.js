// GSAP animations for the landing page.
//
// Markup hooks (all inside the `scope` element):
//   .hero-*            hero intro timeline (see components/blocks/hero.jsx)
//   .preview-*         the dispute preview card in the hero
//   [data-reveal]      fades up when scrolled into view (batched, so neighbours stagger)
//   [data-pop]         an icon inside a [data-reveal] that pops in after its card
//   [data-count]       a number that counts up from 0 when scrolled into view
//   .scroll-progress   bar at the top of the page that fills as you scroll
//
// Everything runs inside gsap.matchMedia(), so nothing animates for people who prefer
// reduced motion, and the page renders its final state with no JavaScript at all.
import { gsap, ScrollTrigger, SplitText, useGSAP } from '@/lib/gsap'
import { HIGHLIGHT_GRADIENT } from '@/components/blocks/hero'

export function useLandingMotion(scope) {
  useGSAP(() => {
    const q = gsap.utils.selector(scope)
    const mm = gsap.matchMedia()

    mm.add(
      {
        motionOk: '(prefers-reduced-motion: no-preference)',
        canTilt: '(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine) and (min-width: 1024px)',
      },
      (ctx) => {
        const { motionOk, canTilt } = ctx.conditions
        if (!motionOk) return

        heroIntro(q)
        scrollReveals(q, ctx)
        countUps(q)
        parallax(q)
        scrollProgress(q)
        // Fonts can change line heights, which moves every trigger point.
        document.fonts?.ready.then(() => ScrollTrigger.refresh())

        if (canTilt) return previewTilt(q)
      },
      scope,
    )

    return () => mm.revert()
  }, { scope })
}

function heroIntro(q) {
  const [highlight] = q('.hero-highlight')
  // aria: 'none' – the default puts aria-label on these plain <span>s, which isn't allowed on them.
  // Splitting by words keeps the text readable as-is, and the words fade with opacity only.
  const title = SplitText.create(q('.hero-title'), { type: 'words', aria: 'none' })
  // bg-clip-text doesn't follow moving children, so each word carries its own gradient.
  const hl = highlight && SplitText.create(highlight, { type: 'words', wordsClass: HIGHLIGHT_GRADIENT, aria: 'none' })
  if (highlight) gsap.set(highlight, { backgroundImage: 'none' })

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
  tl.from(q('.hero-eyebrow'), { autoAlpha: 0, y: 10, duration: 0.5 })
    .from(title.words, {
      opacity: 0, yPercent: 60, filter: 'blur(8px)', duration: 0.7, stagger: 0.06, clearProps: 'filter',
    }, '-=0.2')

  if (hl) {
    tl.from(hl.words, {
      opacity: 0, yPercent: 60, scale: 0.9, filter: 'blur(8px)', duration: 0.8, ease: 'back.out(1.6)', clearProps: 'filter',
    }, '-=0.35')
      // A slow sweep across the gradient once the word lands.
      .fromTo(hl.words,
        { backgroundSize: '250% auto', backgroundPosition: '100% 50%' },
        { backgroundSize: '100% auto', backgroundPosition: '0% 50%', duration: 1.6, ease: 'power2.inOut' }, '-=0.4')
  }

  tl.from(q('.hero-desc'), { autoAlpha: 0, y: 16, duration: 0.6 }, '<0.1')
    .from(q('.hero-actions > *'), { autoAlpha: 0, y: 14, duration: 0.5, stagger: 0.08 }, '<0.15')
    .from(q('.hero-note'), { autoAlpha: 0, duration: 0.5 }, '<0.2')

    // The preview card plays alongside the copy, then fills itself in row by row.
    .from(q('.hero-visual'), { autoAlpha: 0, y: 40, scale: 0.96, duration: 1, ease: 'expo.out' }, 0.25)
    .from(q('.preview-row'), { autoAlpha: 0, x: 16, duration: 0.5, stagger: 0.18 }, 0.9)
    .from(q('.preview-flag'), { autoAlpha: 0, scale: 0, duration: 0.45, stagger: 0.18, ease: 'back.out(2.5)' }, 1.05)
    .from(q('.preview-score'), { clipPath: 'inset(0 100% 0 0)', duration: 0.8, ease: 'power2.inOut' }, '>-0.1')
    .from(q('.preview-score-icon'), { rotation: -90, scale: 0.4, duration: 0.6, ease: 'back.out(2)' }, '<0.2')

  // After the intro, the card floats gently.
  tl.add(() => {
    gsap.to(q('.preview-float'), { y: -8, duration: 3, ease: 'sine.inOut', yoyo: true, repeat: -1 })
  })
  return tl
}

function scrollReveals(q, ctx) {
  const items = q('[data-reveal]')
  const icons = q('[data-reveal] [data-pop]')
  // Opacity only, so links and buttons in sections not yet revealed stay reachable with Tab.
  gsap.set(items, { opacity: 0, y: 32 })
  gsap.set(icons, { opacity: 0, scale: 0.5, rotation: -15 })

  ScrollTrigger.batch(items, {
    start: 'top bottom-=12px',
    once: true,
    // ctx.add keeps tweens made in later callbacks inside this matchMedia context, so they revert with it.
    onEnter: (els) => ctx.add(() => {
      gsap.to(els, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.1, overwrite: true })
      const pops = els.flatMap((el) => [...el.querySelectorAll('[data-pop]')])
      if (pops.length) gsap.to(pops, { opacity: 1, scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(2.2)', stagger: 0.1, delay: 0.25 })
    }),
  })
}

function countUps(q) {
  q('[data-count]').forEach((el) => {
    gsap.from(el, {
      textContent: 0,
      snap: { textContent: 1 },
      duration: 1.4,
      ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 92%', once: true },
    })
  })
}

function parallax(q) {
  const [hero] = q('.hero')
  if (hero) {
    gsap.to(q('.hero-glow'), {
      yPercent: 20, ease: 'none',
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
    })
  }
  const [problem] = q('.problem')
  if (problem) {
    gsap.fromTo(q('.problem-waves'), { yPercent: 35 }, {
      yPercent: -5, ease: 'none',
      scrollTrigger: { trigger: problem, start: 'top bottom', end: 'bottom top', scrub: true },
    })
  }
}

function scrollProgress(q) {
  gsap.fromTo(q('.scroll-progress'), { scaleX: 0 }, {
    scaleX: 1, ease: 'none',
    scrollTrigger: { start: 0, end: 'max', scrub: 0.3 },
  })
}

// Desktop only: the preview card leans towards the pointer.
function previewTilt(q) {
  const [area] = q('.hero-visual')
  const [card] = q('.preview-tilt')
  if (!area || !card) return

  gsap.set(card, { transformPerspective: 900 })
  const rotX = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3.out' })
  const rotY = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3.out' })

  const onMove = (e) => {
    const r = area.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    rotY(gsap.utils.clamp(-6, 6, x * 12))
    rotX(gsap.utils.clamp(-6, 6, -y * 12))
  }
  const onLeave = () => { rotX(0); rotY(0) }

  area.addEventListener('pointermove', onMove)
  area.addEventListener('pointerleave', onLeave)
  return () => {
    area.removeEventListener('pointermove', onMove)
    area.removeEventListener('pointerleave', onLeave)
  }
}
