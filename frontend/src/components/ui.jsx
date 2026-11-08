// Small shared pieces used across pages (kept at this path so existing imports keep working).
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle2, CircleAlert, Info, Loader2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function Logo({ className = 'h-7 w-7' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="cc-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b7cfa" />
          <stop offset="1" stopColor="#2a52d9" />
        </linearGradient>
      </defs>
      <path d="M16 2 4 7v8c0 7.2 5 13.4 12 15 7-1.6 12-7.8 12-15V7z" fill="url(#cc-logo)" />
      <path d="m10.5 16 4 4 7-8" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const STRENGTH_TONE = { High: 'success', Medium: 'warning', Low: 'danger' }

export function ScorePill({ label, score }) {
  if (!label) return <span className="text-xs text-subtle">Not analysed</span>
  return (
    <Badge tone={STRENGTH_TONE[label]}>
      {label}
      {score != null && <span className="font-mono tabular">{score}/10</span>}
    </Badge>
  )
}

const FLAG = {
  contradicted: { tone: 'danger', text: 'Contradicted', dot: 'bg-danger' },
  supported: { tone: 'success', text: 'Supported', dot: 'bg-success' },
  unverified: { tone: 'neutral', text: 'Unverified', dot: 'border-2 border-subtle bg-transparent' },
}

export function StatusFlag({ status, pop = false }) {
  const f = FLAG[status] || FLAG.unverified
  return (
    <Badge tone={f.tone} className={cn(pop && status === 'contradicted' && 'flag-pop')}>
      <span className={cn('inline-block size-2 rounded-full', f.dot)} aria-hidden="true" />
      {f.text}
    </Badge>
  )
}

export function Spinner({ className = 'size-4' }) {
  return <Loader2 className={cn('animate-spin', className)} aria-hidden="true" />
}

const TOAST = {
  error: { icon: CircleAlert, cls: 'border-danger-border bg-card text-foreground [&_.ti]:text-danger' },
  success: { icon: CheckCircle2, cls: 'border-success-border bg-card text-foreground [&_.ti]:text-success' },
  info: { icon: Info, cls: 'border-border bg-card text-foreground [&_.ti]:text-primary-text' },
}

export function Toast({ toast, onClose }) {
  const t = toast && (TOAST[toast.kind] || TOAST.info)
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-end sm:inset-x-auto sm:right-5">
      <AnimatePresence>
        {toast && (
          <motion.div key={toast.text} role="status" aria-live="polite"
            initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
            className={cn('pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-pop', t.cls)}>
            <t.icon className="ti mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 leading-relaxed">{toast.text}</span>
            <button onClick={onClose} className="rounded text-muted-foreground hover:text-foreground" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
