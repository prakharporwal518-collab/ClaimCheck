// Modelled on Motion Primitives' <AnimatedNumber>: springs from 0 (or the last value) to `value`.
import { useEffect, useState } from 'react'
import { useInView, useSpring } from 'motion/react'
import { useRef } from 'react'
import { cn } from '@/lib/utils'

export function AnimatedNumber({ value, format = (v) => Math.round(v).toLocaleString('en-US'), springOptions, as: Comp = 'span', className }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })
  const spring = useSpring(0, { bounce: 0, duration: 1200, ...springOptions })
  const [shown, setShown] = useState(format(0))

  useEffect(() => spring.on('change', (v) => setShown(format(v))), [spring, format])
  useEffect(() => { if (inView && Number.isFinite(value)) spring.set(value) }, [inView, value, spring])

  return (
    <Comp ref={ref} className={cn('tabular', className)} aria-label={Number.isFinite(value) ? format(value) : undefined}>
      {Number.isFinite(value) ? shown : '—'}
    </Comp>
  )
}
