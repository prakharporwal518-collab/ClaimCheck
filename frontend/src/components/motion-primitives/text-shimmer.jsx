// A light sweep across text, for "thinking" states (GSAP). Static text when motion is reduced.
import { useRef } from 'react'
import { gsap, useMotionGSAP } from '@/lib/gsap'
import { cn } from '@/lib/utils'

export function TextShimmer({ children, as: Comp = 'span', duration = 2, className }) {
  const ref = useRef(null)
  useMotionGSAP(() => {
    gsap.fromTo(ref.current, { backgroundPosition: '100% 0' }, { backgroundPosition: '0% 0', duration, ease: 'none', repeat: -1 })
  }, { scope: ref })
  return (
    <Comp
      ref={ref}
      className={cn('inline-block bg-clip-text text-transparent', className)}
      style={{
        backgroundImage:
          'linear-gradient(90deg, var(--muted-foreground) 0%, var(--muted-foreground) 40%, var(--foreground) 50%, var(--muted-foreground) 60%, var(--muted-foreground) 100%)',
        backgroundSize: '250% 100%',
      }}
    >
      {children}
    </Comp>
  )
}
