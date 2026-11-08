import { forwardRef } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 ' +
    '[&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover',
        outline: 'border border-input bg-card text-foreground shadow-sm hover:bg-muted',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        secondary: 'bg-muted text-foreground hover:bg-accent',
        destructive: 'bg-danger text-white shadow-sm hover:bg-danger-hover',
        link: 'h-auto px-0 text-primary-text underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-3.5',
        sm: 'h-8 px-2.5 text-xs',
        lg: 'h-11 px-5 text-[15px]',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

/** shadcn-style Button. `as` renders it as another element (e.g. a Link or <a>). */
export const Button = forwardRef(function Button({ className, variant, size, as: Comp = 'button', ...props }, ref) {
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
})
