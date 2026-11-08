// Watermelon-style hero: eyebrow badge, animated heading, sub-copy, CTAs and a visual, on the bg/ SVGs.
import { motion } from 'motion/react'
import { TextEffect } from '@/components/motion-primitives/text-effect'

export function HeroBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="bg-glow absolute inset-x-0 top-0 h-[720px]" />
      <div className="bg-pattern-grid fade-edges absolute inset-0" />
    </div>
  )
}

export function Hero({ eyebrow, title, highlight, description, actions, note, visual }) {
  return (
    <section className="relative isolate">
      <HeroBackground />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <div>
          {eyebrow && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              {eyebrow}
            </motion.div>
          )}
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-[56px]">
            <TextEffect as="span" per="word" preset="fade-in-blur" className="block">{title}</TextEffect>
            {highlight && (
              <TextEffect as="span" per="word" preset="fade-in-blur" delay={0.35}
                className="block bg-gradient-to-r from-[var(--grad-a)] via-[var(--grad-b)] to-[var(--grad-c)] bg-clip-text text-transparent"
                segmentClassName="bg-gradient-to-r from-[var(--grad-a)] via-[var(--grad-b)] to-[var(--grad-c)] bg-clip-text text-transparent">
                {highlight}
              </TextEffect>
            )}
          </h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.5 }}
            className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
            {description}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.5 }}
            className="mt-8 flex flex-wrap gap-3">
            {actions}
          </motion.div>
          {note && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="mt-4 text-sm text-subtle">{note}</motion.p>}
        </div>
        {visual && (
          <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            {visual}
          </motion.div>
        )}
      </div>
    </section>
  )
}
