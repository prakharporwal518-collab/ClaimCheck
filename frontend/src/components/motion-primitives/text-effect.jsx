// Modelled on Motion Primitives' <TextEffect> (same props). Animates text in per word or character.
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

const PRESETS = {
  fade: { hidden: { opacity: 0 }, visible: { opacity: 1 } },
  blur: { hidden: { opacity: 0, filter: 'blur(12px)' }, visible: { opacity: 1, filter: 'blur(0px)' } },
  'fade-in-blur': { hidden: { opacity: 0, y: 14, filter: 'blur(10px)' }, visible: { opacity: 1, y: 0, filter: 'blur(0px)' } },
  slide: { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0 } },
  scale: { hidden: { opacity: 0, scale: 0.85 }, visible: { opacity: 1, scale: 1 } },
}

export function TextEffect({ children, per = 'word', as = 'p', preset = 'fade-in-blur', delay = 0, speedReveal = 1, className, segmentClassName }) {
  const Comp = motion[as] || motion.p
  const text = String(children)
  const segments = per === 'char' ? Array.from(text) : text.split(/(\s+)/)
  const stagger = (per === 'char' ? 0.025 : 0.06) / speedReveal
  return (
    <Comp
      className={className}
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: stagger, delayChildren: delay } } }}
    >
      <span className="sr-only">{text}</span>
      {segments.map((seg, i) =>
        /^\s+$/.test(seg) ? (
          <span key={i} aria-hidden="true">{seg}</span>
        ) : (
          <motion.span key={i} aria-hidden="true" className={cn('inline-block', segmentClassName)}
            variants={PRESETS[preset] || PRESETS.fade} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
            {seg}
          </motion.span>
        ),
      )}
    </Comp>
  )
}
