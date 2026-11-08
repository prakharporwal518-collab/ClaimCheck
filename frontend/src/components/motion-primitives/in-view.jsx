// Modelled on Motion Primitives' <InView>: fades/slides children in when they scroll into view.
import { motion } from 'motion/react'

const DEFAULT = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
}

export function InView({ children, variants = DEFAULT, transition = { duration: 0.45, ease: [0.22, 1, 0.36, 1] }, delay = 0,
  viewOptions = { once: true, margin: '0px 0px -60px 0px' }, as = 'div', className, ...props }) {
  const Comp = motion[as] || motion.div
  return (
    <Comp className={className} initial="hidden" whileInView="visible" viewport={viewOptions} variants={variants}
      transition={{ ...transition, delay }} {...props}>
      {children}
    </Comp>
  )
}

/** Stagger a list: wrap items in <InViewStagger> and each child in <InViewItem>. */
export function InViewStagger({ children, className, stagger = 0.07, as = 'div' }) {
  const Comp = motion[as] || motion.div
  return (
    <Comp className={className} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      variants={{ visible: { transition: { staggerChildren: stagger } } }}>
      {children}
    </Comp>
  )
}

export function InViewItem({ children, className, as = 'div' }) {
  const Comp = motion[as] || motion.div
  return (
    <Comp className={className} variants={DEFAULT} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </Comp>
  )
}
