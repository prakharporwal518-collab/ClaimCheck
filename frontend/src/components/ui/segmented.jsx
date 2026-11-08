import { useId } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

/** Segmented control with a sliding highlight (Motion layoutId). */
export function Segmented({ value, onChange, options, className, label }) {
  const id = useId()
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex max-w-full overflow-x-auto rounded-lg border bg-muted p-0.5', className)}>
      {options.map(([v, l]) => {
        const active = v === value
        return (
          <button key={v} type="button" role="radio" aria-checked={active} onClick={() => onChange(v)}
            className={cn('relative shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {active && (
              <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-md bg-card shadow-sm ring-1 ring-border"
                transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }} />
            )}
            <span className="relative">{l}</span>
          </button>
        )
      })}
    </div>
  )
}
