import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { money } from '../lib/format'
import { Spinner } from '../components/ui'

// Response-deadline calendar: each open dispute sits on its PayPal response due
// date, coloured by evidence strength, with a "gather evidence by" task 2 days earlier.
const COLOR = {
  High: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
  Medium: 'bg-amber-100 text-amber-900 ring-amber-300',
  Low: 'bg-rose-100 text-rose-900 ring-rose-300',
  none: 'bg-slate-100 text-slate-800 ring-slate-300',
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Response deadlines</h1>
          <p className="text-sm text-slate-500">Every open dispute on its PayPal due date, with a “gather evidence” reminder two days before.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => setOffset(offset - 1)}>←</button>
          <button className="btn-ghost" onClick={() => setOffset(0)}>Today</button>
          <button className="btn-ghost" onClick={() => setOffset(offset + 1)}>→</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        {['High', 'Medium', 'Low', 'none'].map((k) => (
          <span key={k} className={`chip ring-1 ${COLOR[k]}`}>{k === 'none' ? 'Not analysed' : `${k} strength`}</span>
        ))}
        <span className="chip border border-dashed border-slate-400 text-slate-600">Gather evidence by</span>
      </div>
      {!rows ? (
        <div className="flex items-center gap-2 text-slate-500"><Spinner /> Loading…</div>
      ) : (
        <div className="card overflow-x-auto">
          <div className="grid min-w-[840px] grid-cols-7">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">{d}</div>
            ))}
            {days.map((d) => {
              const k = dayKey(d)
              const past = d < new Date(new Date().toDateString())
              return (
                <div key={k} className={`min-h-32 border-b border-r border-slate-100 p-2 ${past ? 'bg-slate-50/60' : ''}`}>
                  <div className={`mb-1 text-xs font-semibold ${k === today ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white' : 'text-slate-500'}`}>
                    {d.getDate()}{d.getDate() === 1 || d === days[0] ? <span className="ml-1 font-normal">{d.toLocaleString('en', { month: 'short' })}</span> : null}
                  </div>
                  <div className="space-y-1">
                    {(events[k] || []).map(({ kind, r }) => (
                      <Link key={kind + r.id} to={`/app/disputes/${r.id}`}
                        className={`block rounded-md px-2 py-1 text-xs leading-tight ${kind === 'due' ? `ring-1 ${COLOR[r.label || 'none']}` : 'border border-dashed border-slate-400 text-slate-600 hover:bg-slate-50'}`}>
                        {kind === 'due' ? (
                          <>
                            <div className="font-semibold">Due: {r.buyer}</div>
                            <div>{money(r.amount)} · {r.label ? `${r.label} ${r.score}/10` : 'not analysed'}</div>
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
        </div>
      )}
    </div>
  )
}
