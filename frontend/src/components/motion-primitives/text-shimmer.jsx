// Modelled on Motion Primitives' <TextShimmer>: a light sweep across text, for "thinking" states.
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

export function TextShimmer({ children, as = 'span', duration = 2, className }) {
  const Comp = motion[as] || motion.span
  return (
    <Comp
      className={cn('inline-block bg-clip-text text-transparent', className)}
      style={{
        backgroundImage:
          'linear-gradient(90deg, var(--muted-foreground) 0%, var(--muted-foreground) 40%, var(--foreground) 50%, var(--muted-foreground) 60%, var(--muted-foreground) 100%)',
        backgroundSize: '250% 100%',
      }}
      initial={{ backgroundPosition: '100% 0' }}
      animate={{ backgroundPosition: '0% 0' }}
      transition={{ repeat: Infinity, duration, ease: 'linear' }}
    >
      {children}
    </Comp>
  )
}
