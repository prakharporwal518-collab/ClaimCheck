// One place to import GSAP from, so plugins are registered once.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText)

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
