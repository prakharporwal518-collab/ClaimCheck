import { cn } from '@/lib/utils'

export function Card({ className, ...props }) {
  return <section className={cn('rounded-xl border bg-card text-card-foreground shadow-card', className)} {...props} />
}
export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5', className)} {...props} />
}
export function CardTitle({ className, as: Comp = 'h2', ...props }) {
  return <Comp className={cn('flex items-center gap-2 text-sm font-semibold tracking-tight [&_svg]:size-4 [&_svg]:text-muted-foreground', className)} {...props} />
}
export function CardDescription({ className, ...props }) {
  return <p className={cn('text-xs text-muted-foreground', className)} {...props} />
}
export function CardContent({ className, ...props }) {
  return <div className={cn('p-5', className)} {...props} />
}
