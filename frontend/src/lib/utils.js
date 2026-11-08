import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn/ui helper: merge Tailwind classes, later ones win. */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
