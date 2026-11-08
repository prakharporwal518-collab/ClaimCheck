// Watermelon-style dashboard stat card with an animated number.
import { AnimatedNumber } from '@/components/motion-primitives/animated-number'
import { InViewItem } from '@/components/motion-primitives/in-view'
import { cn } from '@/lib/utils'

const TONES = {
  default: 'bg-accent text-accent-foreground',
  danger: 'bg-danger-bg text-danger-fg',
  success: 'bg-success-bg text-success-fg',
  warning: 'bg-warning-bg text-warning-fg',
}

export function StatCard({ label, value, format, suffix, icon: Icon, tone = 'default', hint, emphasis }) {
  return (
    <InViewItem className="rounded-xl border bg-card p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="eyebrow">{label}</div>
        {Icon && (
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', TONES[tone])}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className={cn('mt-2 text-2xl font-bold tracking-tight sm:text-[28px]', emphasis && 'text-danger-fg')}>
        {typeof value === 'number' ? <AnimatedNumber value={value} format={format} /> : value}
        {suffix && typeof value === 'number' && <span className="ml-0.5 text-base font-semibold text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </InViewItem>
  )
}
