// Watermelon-style table card: header, toolbar and a framed body for the AG Grid tables.
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function DataTableCard({ title, description, icon: Icon, actions, toolbar, children, className, bodyClassName }) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden="true" />}
              {title}
            </h2>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-3">{toolbar}</div>}
      <div className={bodyClassName}>{children}</div>
    </Card>
  )
}
