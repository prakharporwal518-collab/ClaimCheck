// One place to import GSAP from, so plugins are registered once.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText)

// AG Grid and AG Studio can block the main thread for 100-350 ms while they render. By default
// GSAP catches up after any stall shorter than 500 ms, so an animation started just before one
// would be nearly finished by the first frame anyone sees. Counting a stall over 100 ms as one
// 33 ms frame makes animations pause briefly instead of skipping ahead.
gsap.ticker.lagSmoothing(100, 33)

export const MOTION_OK = '(prefers-reduced-motion: no-preference)'

/**
 * useGSAP that only runs `setup` when the viewer hasn't asked for reduced motion.
 * With reduced motion on, nothing animates and elements keep their normal (final) look.
 * By default it reverts and re-runs whenever `dependencies` change.
 */
export function useMotionGSAP(setup, { scope, dependencies = [], revertOnUpdate = true } = {}) {
  return useGSAP(() => {
    const mm = gsap.matchMedia()
    mm.add(MOTION_OK, (ctx) => setup(ctx), scope)
    return () => mm.revert()
  }, { scope, dependencies, revertOnUpdate })
}

export { gsap, ScrollTrigger, SplitText, useGSAP }
