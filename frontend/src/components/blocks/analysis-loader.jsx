// Loading state while the AI analyses a dispute: shimmer title, scanning bar, live step list and timer.
import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { TextShimmer } from '@/components/motion-primitives/text-shimmer'
import { cn } from '@/lib/utils'

// Steps 0-2 are fast; the AI steps usually take 10-20 s each with Gemini, so the highlight
// moves along by elapsed time once the files are read (an estimate, shown with the timer).
const AI_STEP_SECONDS = [0, 0, 0, 15, 20, 1, 20]

export function AnalysisLoader({ steps, filesDone, startedAt }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [])
  const elapsed = startedAt ? Math.max(0, (now - startedAt) / 1000) : 0

  let active = 0
  if (filesDone) {
    let t = 0
    active = 3
    for (let i = 3; i < steps.length; i++) {
      t += AI_STEP_SECONDS[i] || 10
      if (elapsed > t && i < steps.length - 1) active = i + 1
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-5 shadow-card" aria-live="polite">
      <motion.div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"
        animate={{ x: ['-100%', '100%'] }} transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="relative grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground">
            <Sparkles className="size-4" aria-hidden="true" />
            <motion.span aria-hidden="true" className="absolute inset-0 rounded-lg ring-2 ring-primary/40"
              animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.25, 1] }} transition={{ repeat: Infinity, duration: 2 }} />
          </span>
          <div>
            <TextShimmer as="div" className="text-sm font-semibold">ClaimCheck is analysing this dispute…</TextShimmer>
            <div className="text-xs text-muted-foreground">Reading evidence, checking each claim, drafting the defence</div>
          </div>
        </div>
        {startedAt && <span className="font-mono text-xs text-muted-foreground tabular">{elapsed.toFixed(0)} s</span>}
      </div>
      <ol className="mt-4 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((name, i) => {
          const done = i < active
          const now_ = i === active
          return (
            <motion.li key={name} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={cn('flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs',
                now_ ? 'bg-accent font-semibold text-accent-foreground' : done ? 'text-foreground' : 'text-subtle')}>
              {done ? <Check className="size-3.5 text-success" aria-hidden="true" />
                : now_ ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                : <span className="size-3.5 rounded-full border border-current opacity-60" aria-hidden="true" />}
              {name}
            </motion.li>
          )
        })}
      </ol>
    </div>
  )
}
