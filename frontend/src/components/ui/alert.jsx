import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const alertVariants = cva('flex gap-3 rounded-xl border px-4 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0', {
  variants: {
    tone: {
      info: 'border-info-border bg-info-bg text-info-fg',
      warning: 'border-warning-border bg-warning-bg text-warning-fg',
      danger: 'border-danger-border bg-danger-bg text-danger-fg',
      success: 'border-success-border bg-success-bg text-success-fg',
      neutral: 'border-border bg-muted text-muted-foreground',
    },
  },
  defaultVariants: { tone: 'info' },
})

export function Alert({ className, tone, icon: Icon, children, ...props }) {
  return (
    <div role="status" className={cn(alertVariants({ tone }), className)} {...props}>
      {Icon && <Icon aria-hidden="true" />}
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
    </div>
  )
}
