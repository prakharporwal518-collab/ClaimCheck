import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const field =
  'w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-sm placeholder:text-subtle ' +
  'focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/40 disabled:opacity-60'

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(field, 'h-9', className)} {...props} />
})

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(field, 'py-2.5', className)} {...props} />
})

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(field, 'h-9 cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  )
})

export function Checkbox({ className, ...props }) {
  return <input type="checkbox" className={cn('size-4 shrink-0 cursor-pointer rounded accent-[var(--primary)]', className)} {...props} />
}

export function Label({ className, ...props }) {
  return <label className={cn('eyebrow', className)} {...props} />
}
