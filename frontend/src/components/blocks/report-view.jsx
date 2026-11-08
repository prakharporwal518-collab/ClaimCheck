// Defence-report view: strength gauge + breakdown, recommendation, gap checklist and the report editor.
import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Circle, FileDown, Gauge, ListChecks, RotateCcw, Send, ShieldCheck, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox, Textarea } from '@/components/ui/input'
import { AnimatedNumber } from '@/components/motion-primitives/animated-number'
import { Appear } from '@/components/motion-primitives/in-view'
import { gsap, useMotionGSAP } from '@/lib/gsap'
import { Spinner } from '@/components/ui'
import { cn } from '@/lib/utils'

const TONE = { High: 'success', Medium: 'warning', Low: 'danger' }
const STROKE = { High: 'var(--success)', Medium: 'var(--warning)', Low: 'var(--danger)' }

function ScoreGauge({ score, label }) {
  const r = 52
  const c = Math.PI * r
  const arc = useRef(null)
  // Draw the arc from empty to the score; the markup already holds the final offset.
  useMotionGSAP(() => {
    gsap.fromTo(arc.current, { strokeDashoffset: c }, { strokeDashoffset: c * (1 - score / 10), duration: 1.1, ease: 'power3.out' })
  }, { scope: arc, dependencies: [score] })
  return (
    <div className="relative mx-auto h-[86px] w-[140px] shrink-0" role="img" aria-label={`Evidence strength ${label}, ${score} out of 10`}>
      <svg viewBox="0 0 128 72" className="h-full w-full" aria-hidden="true">
        <path d="M12 64a52 52 0 0 1 104 0" fill="none" stroke="var(--muted)" strokeWidth="10" strokeLinecap="round" />
        <path ref={arc} d="M12 64a52 52 0 0 1 104 0" fill="none" stroke={STROKE[label]} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 10)} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="text-[28px] font-bold leading-none tracking-tight">
          <AnimatedNumber value={score} /><span className="text-sm font-semibold text-muted-foreground">/10</span>
        </div>
      </div>
    </div>
  )
}

export function StrengthCard({ analysis: a }) {
  const [open, setOpen] = useState(false)
  const rec = a.recommendation
  return (
    <Card>
      <CardHeader><CardTitle><Gauge />Evidence strength</CardTitle><Badge tone={TONE[a.strength_label]}>{a.strength_label}</Badge></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <ScoreGauge score={a.strength_score} label={a.strength_label} />
          <p className="text-sm font-medium leading-relaxed">{a.strength_line}</p>
        </div>
        <button className="flex items-center gap-1 text-xs font-semibold text-primary-text hover:underline" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
          {open ? 'Hide' : 'Show'} how the score was earned
        </button>
        {open && (
          <table className="w-full text-sm">
            <Appear as="tbody" targets="tr" stagger={0.04} from={{ autoAlpha: 0, x: -8 }} duration={0.3}>
              {a.score_breakdown.map((b, i) => (
                <tr key={i} className="border-t">
                  <td className={cn('w-12 py-1.5 font-mono font-semibold tabular', b.points > 0 ? 'text-success-fg' : b.points < 0 ? 'text-danger-fg' : '')}>
                    {b.points > 0 ? `+${b.points}` : b.points}
                  </td>
                  <td className="py-1.5 text-muted-foreground">{b.label}</td>
                </tr>
              ))}
              <tr className="border-t font-semibold"><td className="py-1.5 font-mono tabular">{a.strength_score}</td><td>Final score (0–10). High 7–10, Medium 4–6, Low 0–3.</td></tr>
            </Appear>
          </table>
        )}
        {rec && (
          <div className={cn('rounded-xl border px-4 py-3', rec.action === 'refund' ? 'border-danger-border bg-danger-bg' : 'border-success-border bg-success-bg')}>
            <div className={cn('flex items-center gap-2 text-sm font-bold', rec.action === 'refund' ? 'text-danger-fg' : 'text-success-fg')}>
              {rec.action === 'refund' ? <RotateCcw className="size-4" /> : <ShieldCheck className="size-4" />}{rec.title}
            </div>
            <div className="mt-0.5 text-sm text-foreground/85">{rec.why}</div>
          </div>
        )}
        <p className="text-[11px] leading-relaxed text-subtle">Evidence strength is a transparent heuristic, not a promise: PayPal decides the outcome. ClaimCheck checks consistency, not authenticity.</p>
      </CardContent>
    </Card>
  )
}

export function GapsCard({ analysis: a }) {
  return (
    <Card>
      <CardHeader><CardTitle><ListChecks />Evidence checklist</CardTitle>
        <span className="text-xs text-muted-foreground tabular">{a.gaps.filter((g) => !g.missing).length}/{a.gaps.length} covered</span>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {a.gaps.map((g) => (
            <li key={g.id} className="flex items-center gap-2.5 text-sm">
              {!g.missing ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Covered" />
                : g.critical ? <XCircle className="size-4 shrink-0 text-danger" aria-label="Missing, critical" />
                : <Circle className="size-4 shrink-0 text-warning" aria-label="Missing" />}
              <span className={g.missing ? 'text-foreground' : 'text-muted-foreground'}>{g.label}</span>
              {g.missing && g.critical && <Badge tone="danger">critical</Badge>}
            </li>
          ))}
        </ul>
        {a.integrity?.checks?.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <div className="eyebrow mb-1.5">Integrity checks</div>
            {a.integrity.checks.map((c, i) => (
              <div key={i} className={cn('flex items-start gap-2 text-sm', c.ok ? 'text-success-fg' : 'text-warning-fg')}>
                {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}{c.text}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ReportEditor({ value, onChange, onBlur, saved, open, approved, onApprove, busy, refundRecommended, statusLabel,
  onSubmit, onRefund, pdfUrl }) {
  const over = value.length > 2000
  return (
    <Card>
      <CardHeader>
        <CardTitle>Defence report</CardTitle>
        <span className="text-xs text-muted-foreground">{saved ? 'Saved' : 'Unsaved changes'} · AI draft kept in the audit log</span>
      </CardHeader>
      <CardContent>
        <Textarea value={value} onChange={onChange} onBlur={onBlur} disabled={!open} aria-label="Defence report"
          className="h-80 resize-y bg-muted/40 font-mono text-[13px] leading-relaxed" />
        <div className={cn('mt-1.5 text-right text-xs tabular', over ? 'font-semibold text-danger-fg' : 'text-muted-foreground')}>
          {value.length} / 2000 characters (PayPal notes limit)
        </div>
        {open ? (
          <>
            <label className="mt-4 flex items-start gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
              <Checkbox className="mt-0.5" checked={approved} onChange={(e) => onApprove(e.target.checked)} />
              <span>I have read this report and the evidence. Send it to PayPal on my behalf.</span>
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={!approved || !!busy || over} onClick={onSubmit}>
                {busy === 'submit' ? <Spinner /> : <Send />} Submit to PayPal
              </Button>
              <Button as="a" variant="outline" href={pdfUrl}><FileDown /> Export PDF</Button>
              <Button variant={refundRecommended ? 'destructive' : 'outline'} disabled={!!busy} onClick={onRefund}>
                {busy === 'refund' ? <Spinner /> : <RotateCcw />} {refundRecommended ? 'Refund buyer (recommended)' : 'Accept claim & refund'}
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">This dispute is {statusLabel}.</Badge>
            <Button as="a" variant="outline" href={pdfUrl}><FileDown /> Export PDF</Button>
          </div>
        )}
        <p className="mt-4 text-[11px] text-subtle">ClaimCheck drafts; you decide. Nothing is sent until you approve. This is not legal advice.</p>
      </CardContent>
    </Card>
  )
}
