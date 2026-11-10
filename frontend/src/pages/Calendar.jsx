import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { money } from '../lib/format'
import { Spinner } from '../components/ui'
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/blocks/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Appear } from '@/components/motion-primitives/in-view'
import { gsap, useMotionGSAP } from '@/lib/gsap'
import { cn } from '@/lib/utils'

// Response-deadline calendar: each open dispute sits on its PayPal response due
// date, coloured by evidence strength, with a "gather evidence by" task 2 days earlier.
const COLOR = {
  High: 'border-success-border bg-success-bg text-success-fg',
  Medium: 'border-warning-border bg-warning-bg text-warning-fg',
  Low: 'border-danger-border bg-danger-bg text-danger-fg',
  none: 'border-border bg-muted text-foreground',
}
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const shortDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export default function Calendar() {
  const [rows, setRows] = useState(null)
  const [offset, setOffset] = useState(0) // weeks from this week
  const [dir, setDir] = useState(0) // -1 = went back, 1 = went forward: the weeks slide in from that side
  const go = (next) => { setDir(Math.sign(next - offset)); setOffset(next) }
  useEffect(() => { api.disputes().then(setRows) }, [])

  const events = useMemo(() => {
    const map = {}
    for (const r of rows || []) {
      if (r.status !== 'WAITING_FOR_SELLER_RESPONSE' || !r.deadline) continue
      const due = new Date(r.deadline)
      const prep = new Date(due)
      prep.setDate(prep.getDate() - 2)
      ;(map[dayKey(due)] ||= []).push({ kind: 'due', r })
      ;(map[dayKey(prep)] ||= []).push({ kind: 'prep', r })
    }
    return map
  }, [rows])

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7) // Monday
  const days = Array.from({ length: 21 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
  const today = dayKey(new Date())
  const range = `${shortDate(days[0])} – ${shortDate(days[20])} ${days[20].getFullYear()}`

  // After the weeks arrive: a ring pulses round today's date, and deadlines due within 3 days
  // give a small wiggle. Waits for the cascade to finish, so the two never fight over a chip.
  const cal = useRef(null)
  useMotionGSAP(() => {
    const q = gsap.utils.selector(cal)
    const tl = gsap.timeline({ delay: 0.9 })
    if (q('[data-today-ring]').length) {
      tl.fromTo(q('[data-today-ring]'), { scale: 1, autoAlpha: 0.7 }, { scale: 2, autoAlpha: 0, duration: 0.9, ease: 'power2.out', repeat: 1, immediateRender: false }, 0)
    }
    if (q('[data-urgent]').length) {
      tl.to(q('[data-urgent]'), { keyframes: { rotation: [0, -2.5, 2.5, -1.5, 1, 0] }, duration: 0.6, ease: 'power1.inOut', stagger: 0.1, clearProps: 'transform' }, 0.1)
    }
  }, { scope: cal, dependencies: [offset, rows] })

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarClock}
        title="Response deadlines"
        description="Every open dispute on its PayPal due date, with a “gather evidence” reminder two days before."
        actions={
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" onClick={() => go(offset - 1)} aria-label="Previous week"><ChevronLeft /></Button>
            {/* Which three weeks are shown; slides with the grid and is announced to screen readers. */}
            <Appear as="span" watch={offset} from={{ autoAlpha: 0, x: dir * 12 }} duration={0.3} aria-live="polite"
              className="min-w-40 text-center text-sm font-semibold tabular">{range}</Appear>
            <Button variant="outline" size="icon" onClick={() => go(offset + 1)} aria-label="Next week"><ChevronRight /></Button>
            <Button variant="outline" onClick={() => go(0)} disabled={offset === 0}>Today</Button>
          </div>
        }
      />
      <div className="flex flex-wrap gap-2 text-xs">
        {['High', 'Medium', 'Low', 'none'].map((k) => (
          <span key={k} className={cn('rounded-full border px-2.5 py-0.5 font-semibold', COLOR[k])}>{k === 'none' ? 'Not analysed' : `${k} strength`}</span>
        ))}
        <span className="rounded-full border border-dashed border-subtle px-2.5 py-0.5 font-semibold text-muted-foreground">Gather evidence by</span>
      </div>
      {!rows ? (
        <div className="flex items-center gap-2 text-muted-foreground" role="status"><Spinner /> Loading…</div>
      ) : (
        <div ref={cal}>
        <Card className="overflow-x-auto">
          {/* Re-plays when you change week: days and deadline chips arrive in a wave from the side
              you moved towards (first load: a plain fade up). */}
          <Appear watch={offset} className="grid min-w-[840px] grid-cols-7" targets="[data-cal]" duration={0.3}
            stagger={{ each: 0.012, from: dir < 0 ? 'end' : 'start' }}
            from={dir ? { autoAlpha: 0, x: dir * 24 } : { autoAlpha: 0, y: 6 }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="border-b bg-muted px-3 py-2.5 text-xs font-semibold text-muted-foreground">{d}</div>
            ))}
            {days.map((d) => {
              const k = dayKey(d)
              const past = d < new Date(new Date().toDateString())
              return (
                <div key={k} data-cal="" className={cn('min-h-32 border-b border-r p-2', past && 'bg-muted/40')}>
                  <div className={cn('mb-1.5 text-xs font-semibold', k === today ? 'relative inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground' : 'text-muted-foreground')}>
                    {d.getDate()}{d.getDate() === 1 || d === days[0] ? <span className="ml-1 font-normal">{d.toLocaleString('en', { month: 'short' })}</span> : null}
                    {k === today && <span data-today-ring="" aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border-2 border-primary opacity-0" />}
                  </div>
                  <div className="space-y-1">
                    {(events[k] || []).map(({ kind, r }) => (
                      <Link key={kind + r.id} to={`/app/disputes/${r.id}`} data-cal=""
                        data-urgent={kind === 'due' && r.days_left != null && r.days_left <= 3 ? '' : undefined}
                        className={cn('block rounded-lg px-2 py-1.5 text-xs leading-tight transition-opacity hover:opacity-85',
                          kind === 'due' ? cn('border', COLOR[r.label || 'none']) : 'border border-dashed border-subtle text-muted-foreground hover:bg-muted')}>
                        {kind === 'due' ? (
                          <>
                            <div className="font-semibold">Due: {r.buyer}</div>
                            <div className="tabular">{money(r.amount)} · {r.label ? `${r.label} ${r.score}/10` : 'not analysed'}</div>
                          </>
                        ) : (
                          <div>Gather evidence: {r.buyer}</div>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </Appear>
        </Card>
        </div>
      )}
    </div>
  )
}
