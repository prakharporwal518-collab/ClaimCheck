import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { money } from '../lib/format'
import { Spinner } from '../components/ui'
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/blocks/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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

export default function Calendar() {
  const [rows, setRows] = useState(null)
  const [offset, setOffset] = useState(0) // weeks from this week
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

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarClock}
        title="Response deadlines"
        description="Every open dispute on its PayPal due date, with a “gather evidence” reminder two days before."
        actions={
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" onClick={() => setOffset(offset - 1)} aria-label="Previous week"><ChevronLeft /></Button>
            <Button variant="outline" onClick={() => setOffset(0)}>Today</Button>
            <Button variant="outline" size="icon" onClick={() => setOffset(offset + 1)} aria-label="Next week"><ChevronRight /></Button>
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
        <Card className="overflow-x-auto">
          <div className="grid min-w-[840px] grid-cols-7">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="border-b bg-muted px-3 py-2.5 text-xs font-semibold text-muted-foreground">{d}</div>
            ))}
            {days.map((d) => {
              const k = dayKey(d)
              const past = d < new Date(new Date().toDateString())
              return (
                <div key={k} className={cn('min-h-32 border-b border-r p-2', past && 'bg-muted/40')}>
                  <div className={cn('mb-1.5 text-xs font-semibold', k === today ? 'inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground' : 'text-muted-foreground')}>
                    {d.getDate()}{d.getDate() === 1 || d === days[0] ? <span className="ml-1 font-normal">{d.toLocaleString('en', { month: 'short' })}</span> : null}
                  </div>
                  <div className="space-y-1">
                    {(events[k] || []).map(({ kind, r }) => (
                      <Link key={kind + r.id} to={`/app/disputes/${r.id}`}
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
          </div>
        </Card>
      )}
    </div>
  )
}
