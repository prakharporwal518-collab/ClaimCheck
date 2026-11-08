import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AgGridReact } from 'ag-grid-react'
import { api } from '../lib/api'
import { gridTheme } from '../lib/grid'
import { daysLabel, fileSize, money, statusText } from '../lib/format'
import { guessTag, MAX_FILES, prepareFile } from '../lib/compress'
import { ScorePill, Spinner, StatusFlag } from '../components/ui'
import { useApp } from '../components/AppShell'
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronRight, ExternalLink, FileSpreadsheet, FileText, FlaskConical,
  History, Info, MessageSquareQuote, PackageOpen, ScrollText, ShieldCheck, Sparkles, Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Checkbox, Select } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { FileUpload } from '@/components/blocks/file-upload'
import { AnalysisLoader } from '@/components/blocks/analysis-loader'
import { GapsCard, ReportEditor, StrengthCard } from '@/components/blocks/report-view'
import { Appear, InView } from '@/components/motion-primitives/in-view'
import { cn } from '@/lib/utils'

const TAGS = ['Invoice', 'Tracking', 'Chat', 'Delivery photo', 'Order', 'Other']
const PIPELINE = [
  'Extract evidence facts',
  'Integrity check + number facts',
  'Mask buyer PII',
  'Break down the claim',
  'Cross-check claims vs evidence',
  'Gaps + evidence strength',
  'Write defence report',
]
const STORY_SETS = ['strong', 'weak', 'buyer_right']
const SCENARIOS = [
  ['strong', 'Delivered + signature, photo, chat'],
  ['weak', 'Delivered, no proof of delivery'],
  ['buyer_right', 'Returned to sender (buyer is right)'],
]
const SAMPLE_FILES = {
  strong: ['tracking.pdf', 'chat.png', 'delivery_photo.jpg', 'invoice.pdf'],
  weak: ['tracking.pdf', 'invoice.pdf'],
  buyer_right: ['tracking.pdf', 'invoice.pdf'],
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------
function Section({ title, icon, right, children, className = '', contentClassName = '' }) {
  const Icon = icon
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{Icon && <Icon />}{title}</CardTitle>
        {right}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  )
}

function OcrCell({ data }) {
  if (data.ocr_confidence == null) return <span className="text-subtle">{data.mime === 'application/pdf' ? 'text layer' : '—'}</span>
  const low = data.ocr_confidence < 60
  return <Badge tone={low ? 'warning' : 'neutral'} className="font-mono">{data.ocr_confidence.toFixed(0)}%</Badge>
}

function IntegrityCell({ data }) {
  const st = data.integrity?.status
  if (!st) return <span className="text-subtle">—</span>
  const issues = data.integrity?.issues || []
  return (
    <span title={[...(data.integrity?.ok || []), ...issues].join('\n')}>
      <Badge tone={st === 'OK' ? 'success' : 'warning'}>{st === 'OK' ? <><Check /> OK</> : <><AlertTriangle /> Check</>}</Badge>
    </span>
  )
}

function StateCell({ data }) {
  if (data.state === 'pending' || data.state === 'processing')
    return <span className="flex items-center gap-1.5 text-primary-text"><Spinner className="size-3.5" /> Reading…</span>
  if (data.state === 'error') return <span className="text-danger-fg" title={data.error}>Error</span>
  return <span className="text-muted-foreground tabular">{data.facts.length} facts</span>
}

function ClaimDetail({ data, context }) {
  const facts = context.factsById
  return (
    <div role="gridcell" className="space-y-2 bg-muted/50 px-6 py-4">
      <div className="text-sm"><span className="font-semibold">Why:</span> <span className="text-muted-foreground">{data.why}</span></div>
      {data.evidence.length === 0 && <div className="text-sm text-muted-foreground">No evidence cited. Upload evidence that covers this claim.</div>}
      <div className="space-y-1.5">
        {data.evidence.map((id) => {
          const f = facts[id]
          if (!f) return null
          return (
            <div key={id} className="flex flex-wrap items-start gap-2 text-sm">
              <Badge tone="info" className="font-mono">{id}</Badge>
              <span className="flex-1">{f.fact_display || f.fact}</span>
              {f.evidence_id ? (
                <a href={api.fileUrl(f.evidence_id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary-text hover:underline">
                  {f.source} <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">{f.source}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Evidence upload + grid + facts
// ---------------------------------------------------------------------------
function EvidencePanel({ d, linkedEvidence, reload, notify }) {
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(null)
  const input = useRef(null)
  const csvInput = useRef(null)

  const upload = async (fileList) => {
    const files = Array.from(fileList)
    if (d.evidence.length + files.length > MAX_FILES) return notify(`Max ${MAX_FILES} files per dispute`, 'error')
    setBusy(true)
    try {
      const prepared = []
      for (const f of files) prepared.push(await prepareFile(f))
      await api.upload(d.id, prepared, prepared.map((f) => guessTag(f.name)))
      notify(`${prepared.length} file(s) uploaded. Reading them now (OCR first, vision only if needed).`)
      await reload()
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const columns = useMemo(
    () => [
      {
        field: 'filename', headerName: 'File', flex: 1.3, minWidth: 150,
        cellRenderer: (p) => <a className="font-medium text-primary-text hover:underline" href={api.fileUrl(p.data.id)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{p.value}</a>,
      },
      {
        field: 'tag', headerName: 'Tag (edit)', width: 135, editable: true,
        cellEditor: 'agRichSelectCellEditor', cellEditorParams: { values: TAGS },
        cellClass: 'cursor-pointer',
      },
      { field: 'size', headerName: 'Size', width: 85, valueFormatter: (p) => fileSize(p.value) },
      { field: 'ocr_confidence', headerName: 'OCR conf.', width: 105, cellRenderer: OcrCell },
      { headerName: 'Vision model', width: 115, valueGetter: (p) => (p.data.sent_to_vision ? 'Yes' : 'No') },
      { headerName: 'Integrity', width: 100, cellRenderer: IntegrityCell },
      { headerName: 'Facts', width: 110, cellRenderer: StateCell },
      {
        headerName: '', width: 56, sortable: false,
        cellRenderer: (p) => (
          <button className="grid size-7 place-items-center rounded-md text-subtle hover:bg-danger-bg hover:text-danger-fg" title="Remove file" aria-label={`Remove ${p.data.filename}`}
            onClick={async (e) => { e.stopPropagation(); await api.deleteEvidence(p.data.id); reload() }}><Trash2 className="size-4" /></button>
        ),
      },
    ],
    [reload],
  )

  // Story cases load their prepared set; every other dispute gets files drawn for it
  // (its own buyer, address, order number, item, amount and dates).
  const loadSample = async (scenario) => {
    setBusy(true)
    try {
      await api.loadSample(d.id, scenario)
      notify(d.sample_set === 'starter' && !scenario
        ? 'Order found in the sample CSV and added as evidence'
        : 'Sample evidence loaded – reading the files now')
      await reload()
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  // PayPal no longer accepts evidence once a dispute is under review or resolved.
  const closed = d.status !== 'WAITING_FOR_SELLER_RESPONSE'
  const sel = d.evidence.find((e) => e.id === selected) || d.evidence[0]

  const updateFact = async (idx, patch) => {
    const facts = sel.facts.map((f, i) => (i === idx ? { ...f, ...patch } : f))
    await api.patchEvidence(sel.id, { facts })
    reload()
  }

  const upload_ = (files) => upload(files)

  return (
    <Section
      icon={PackageOpen}
      title={`Merchant evidence (${d.evidence.length}/${MAX_FILES})`}
      right={closed ? null : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => csvInput.current.click()}><FileSpreadsheet /> Import order CSV</Button>
          {d.sample_set && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => loadSample()}>
              <FlaskConical /> {d.sample_set === 'starter' ? 'Import sample order CSV' : 'Load sample evidence'}
            </Button>
          )}
          {!STORY_SETS.includes(d.sample_set) && (
            <Select aria-label="Load sample evidence" disabled={busy} value="" className="h-8 w-auto text-xs font-semibold"
              onChange={(e) => { if (e.target.value) loadSample(e.target.value) }}>
              <option value="">Load sample evidence…</option>
              {SCENARIOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          )}
        </div>
      )}
    >
      <input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={async (e) => {
        try { const r = await api.orderCsv(d.id, e.target.files[0]); notify(`Matched order ${r.matched['Order ID'] || ''} in the CSV`, 'success'); reload() } catch (err) { notify(err.message, 'error') }
        e.target.value = ''
      }} />
      {closed ? (
        <Alert tone="neutral" icon={Info} className="mb-4">
          {d.status === 'WAITING_FOR_BUYER_RESPONSE'
            ? 'PayPal is waiting for the buyer to reply, so no new evidence can be added.'
            : `This dispute is ${statusText(d.status).toLowerCase()} on PayPal, so no new evidence can be added.`}
        </Alert>
      ) : (<>
      {d.sample_set === 'starter' && d.evidence.length === 0 && (
        <Alert tone="info" icon={Info} className="mb-4">
          <b>No evidence yet — on purpose.</b> This demo case shows a brand-new dispute.
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>Press <b>Generate AI Defence</b> now: claims come back <b>Unverified</b> and the checklist lists exactly what to upload.</li>
            <li>Or click <b>Import sample order CSV</b> (top right): ClaimCheck finds this order in a store export and adds its tracking number.</li>
            <li>Or pick a scenario in <b>Load sample evidence…</b>: files are made for this dispute (Sofia's name, address and order).</li>
          </ul>
        </Alert>
      )}
      <FileUpload onFiles={upload_} busy={busy} accept="application/pdf,image/png,image/jpeg" className="mb-4"
        title="Drop tracking PDFs, invoices, chat screenshots, delivery photos"
        hint="PDF, PNG or JPG · max 5 MB each · images are compressed in your browser first">
        {d.sample_set === 'starter' ? (
          <>Sample order export:{' '}
            <a href={`${api.base}/samples/orders_export.csv`} download className="font-medium text-primary-text hover:underline">orders_export.csv</a></>
        ) : d.sample_set ? (
          <>Sample files to drag in:{' '}
            {SAMPLE_FILES[d.sample_set].map((f) => (
              <a key={f} href={`${api.base}/samples/${d.sample_set}/${f}`} download className="mx-1 font-medium text-primary-text hover:underline">{f}</a>
            ))}</>
        ) : (
          <>No files to hand? Use <b>Load sample evidence…</b> (top right): files are made to match this dispute.</>
        )}
      </FileUpload>
      </>)}

      {d.evidence.length > 0 && (
        <>
          <div className="overflow-hidden rounded-xl border" style={{ height: Math.min(52 + d.evidence.length * 44, 310) }}>
            <AgGridReact
              theme={gridTheme}
              rowData={d.evidence}
              columnDefs={columns}
              getRowId={(p) => String(p.data.id)}
              defaultColDef={{ sortable: true, resizable: true }}
              singleClickEdit
              stopEditingWhenCellsLoseFocus
              rowHeight={44}
              rowClassRules={{ 'row-linked': (p) => linkedEvidence.has(p.data.id) }}
              onRowClicked={(e) => setSelected(e.data.id)}
              onCellValueChanged={async (e) => {
                if (e.colDef.field === 'tag') {
                  await api.patchEvidence(e.data.id, { tag: e.newValue })
                  notify(`Re-reading ${e.data.filename} as "${e.newValue}"`)
                  reload()
                }
              }}
            />
          </div>
          {sel && (
            <Appear watch={sel.id} className="mt-4 rounded-xl border bg-muted/40 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <FileText className="size-3.5" aria-hidden="true" />
                <span className="font-semibold text-foreground">{sel.filename}</span>
                <span>· {sel.extractor || 'waiting'}</span>
                {sel.error && <span className="text-danger-fg">· {sel.error}</span>}
              </div>
              {(sel.integrity?.issues || []).map((i) => (
                <div key={i} className="mb-1 flex items-center gap-1.5 text-xs font-medium text-warning-fg"><AlertTriangle className="size-3.5" />{i}</div>
              ))}
              <ul className="space-y-1">
                {sel.facts.map((f, i) => (
                  <li key={i} className={cn('flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm', f.needs_confirmation && !f.confirmed && 'bg-warning-bg ring-1 ring-warning-border')}>
                    <Badge tone="outline" className="mt-0.5 shrink-0 bg-card font-mono text-[10px] font-medium">{f.kind}</Badge>
                    <span className="flex-1">{f.fact}</span>
                    {f.confidence != null && (
                      <span title="OCR confidence of the line this fact was read from">
                        <Badge tone={f.confidence < 60 ? 'warning' : 'outline'} className="shrink-0 font-mono text-[10px]">{Math.round(f.confidence)}%</Badge>
                      </span>
                    )}
                    {f.needs_confirmation && (
                      <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-warning-fg">
                        <Checkbox checked={!!f.confirmed} onChange={(e) => updateFact(i, { confirmed: e.target.checked })} />
                        {f.confirmed ? 'Confirmed' : 'Please confirm'}
                      </label>
                    )}
                  </li>
                ))}
                {sel.facts.length === 0 && sel.state === 'done' && <li className="text-sm text-muted-foreground">No facts found in this file.</li>}
              </ul>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-subtle"><ShieldCheck className="size-3.5" aria-hidden="true" />Buyer details are masked ([BUYER], [ADDRESS]…) before anything is sent to the AI model.</p>
            </Appear>
          )}
        </>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Dispute() {
  const { id } = useParams()
  const { notify, health } = useApp()
  const [d, setD] = useState(null)
  const [selectedClaim, setSelectedClaim] = useState(null)
  const [report, setReport] = useState('')
  const [saved, setSaved] = useState(true)
  const [approved, setApproved] = useState(false)
  const [busy, setBusy] = useState('')
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [startedAt, setStartedAt] = useState(null)
  const [elapsed, setElapsed] = useState(null)
  const [justDone, setJustDone] = useState(false)
  const prevState = useRef(null)

  const reload = useCallback(() => api.dispute(id).then(setD).catch((e) => notify(e.message, 'error')), [id, notify])
  useEffect(() => { reload() }, [reload])

  const working = d && (['queued', 'running'].includes(d.analysis_state) || d.evidence.some((e) => ['pending', 'processing'].includes(e.state)))
  useEffect(() => {
    if (!working) return
    const t = setTimeout(reload, 1000)
    return () => clearTimeout(t)
  }, [d, working, reload])

  // Report text follows the latest analysis.
  const analysisId = d?.analysis?.id
  useEffect(() => {
    if (d?.analysis) { setReport(d.analysis.report_final || d.analysis.report_text); setSaved(true) }
  }, [analysisId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!d) return
    if (prevState.current && prevState.current !== 'done' && d.analysis_state === 'done' && startedAt) {
      setElapsed((Date.now() - startedAt) / 1000)
      setJustDone(true)
      setTimeout(() => setJustDone(false), 3000)
    }
    prevState.current = d.analysis_state
  }, [d, startedAt])

  const a = d?.analysis
  const factsById = useMemo(() => Object.fromEntries((a?.facts || []).map((f) => [f.id, f])), [a])
  const claimRows = useMemo(() => (a?.results || []).map((r, i) => ({ ...r, n: i + 1 })), [a])
  const linkedEvidence = useMemo(() => {
    const r = claimRows.find((c) => c.claim_id === selectedClaim)
    return new Set((r?.evidence || []).map((e) => factsById[e]?.evidence_id).filter(Boolean))
  }, [selectedClaim, claimRows, factsById])

  const claimCols = useMemo(
    () => [
      { field: 'n', headerName: '#', width: 70, cellRenderer: 'agGroupCellRenderer' },
      { field: 'claim_text', headerName: 'Buyer claim', flex: 2, minWidth: 220, wrapText: true, autoHeight: true, cellClass: 'leading-snug py-2' },
      { field: 'status', headerName: 'Status', width: 150, cellRenderer: (p) => <StatusFlag status={p.value} pop={justDone} /> },
      { headerName: 'Evidence', width: 100, valueGetter: (p) => p.data.evidence.length, cellRenderer: (p) => <span className="font-mono text-muted-foreground">{p.value ? p.data.evidence.join(', ') : '—'}</span> },
      {
        field: 'strength', headerName: 'Strength', width: 105,
        cellRenderer: (p) => p.value === 'none' || p.data.status !== 'contradicted' ? <span className="text-subtle">—</span> : <Badge tone={p.value === 'strong' ? 'solid' : 'neutral'}>{p.value}</Badge>,
      },
      { field: 'why', headerName: 'Why', flex: 2, minWidth: 220, wrapText: true, autoHeight: true, cellClass: 'leading-snug py-2 text-muted-foreground' },
    ],
    [justDone],
  )

  if (!d) {
    return (
      <div className="space-y-5" role="status" aria-label="Loading dispute">
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid gap-5 xl:grid-cols-12"><Skeleton className="h-72 rounded-xl xl:col-span-5" /><Skeleton className="h-72 rounded-xl xl:col-span-7" /></div>
      </div>
    )
  }

  const open = d.status === 'WAITING_FOR_SELLER_RESPONSE'
  // Past disputes seeded for the Analytics page store only a final score, not claims or a report.
  const history = a?.engine === 'seeded history'
  const full = a && !history
  const urgent = open && d.days_left <= 3
  const rec = a?.recommendation
  const pendingConfirm = d.evidence.some((e) => e.facts.some((f) => f.needs_confirmation && !f.confirmed))

  const generate = async () => {
    setBusy('analyse')
    setStartedAt(Date.now())
    setElapsed(null)
    try {
      const r = await api.analyse(d.id)
      notify(r.engine === 'render-workflows' ? `Started Render Workflow run ${r.run_id}` : 'Analysis started')
      await reload()
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  // Real PayPal Sandbox actions can't be undone; the server may also ask for a key.
  const sandboxKey = () => {
    if (d.source !== 'sandbox') return ''
    if (!confirm('This is a real PayPal Sandbox dispute. Sending this calls PayPal and cannot be undone. Continue?')) return null
    return health?.sandbox_actions_locked ? (prompt('Enter the Sandbox action key') ?? null) : ''
  }

  const act = async (name, fn, okMsg) => {
    setBusy(name)
    try {
      const r = await fn()
      notify(okMsg(r), 'success')
      await reload()
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const running = working && d.analysis_state !== 'done'
  const filesDone = !d.evidence.some((e) => ['pending', 'processing'].includes(e.state))

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <InView>
        <Card className="relative overflow-hidden">
          <div aria-hidden="true" className="bg-pattern-dots fade-edges pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-4">
            <Button as={Link} to="/app" variant="ghost" size="sm" className="-ml-2"><ArrowLeft /> Inbox</Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
                {d.id}
                <Badge tone={d.source === 'sandbox' ? 'info' : 'neutral'}>{d.source === 'sandbox' ? 'PayPal Sandbox' : 'seeded demo data'}</Badge>
              </div>
              <div className="mt-0.5 truncate text-lg font-bold tracking-tight">{d.buyer} <span className="font-normal text-muted-foreground">· {d.item}</span></div>
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-3">
              <div><dt className="eyebrow">Amount</dt><dd className="font-semibold tabular">{money(d.amount, d.currency)}</dd></div>
              <div><dt className="eyebrow">Reason</dt><dd><Badge tone="info">Item Not Received</Badge></dd></div>
              <div><dt className="eyebrow">Respond within</dt><dd className={cn('font-mono font-semibold tabular', urgent && 'text-danger-fg')}>{open ? daysLabel(d.days_left) : '—'}</dd></div>
              <div><dt className="eyebrow">Status</dt><dd className="text-sm font-semibold">{statusText(d.status)}{d.decision !== 'open' && ` · ${d.decision}`}</dd></div>
            </dl>
            <div className="flex w-full items-center gap-3 md:ml-auto md:w-auto">
              {a && <ScorePill label={a.strength_label} score={a.strength_score} />}
              <Button size="lg" className="flex-1 md:flex-none" onClick={generate} disabled={!!busy || working || !open || pendingConfirm}
                title={pendingConfirm ? 'Confirm the amber facts first' : ''}>
                {running ? <Spinner /> : <Sparkles />} {a ? 'Re-run AI Defence' : 'Generate AI Defence'}
              </Button>
            </div>
          </div>
        </Card>
      </InView>

      {d.source === 'sandbox' && (
        <Alert tone="info" icon={ShieldCheck}>
          <b>Real PayPal Sandbox dispute.</b> It was read from the PayPal Disputes API.
          {open
            ? <> <b>Submit</b> and <b>Refund</b> call PayPal for real and can't be undone. The demo disputes are safe to play with.</>
            : <> Its current status comes straight from PayPal.</>}
        </Alert>
      )}

      {pendingConfirm && (
        <Alert tone="warning" icon={AlertTriangle}>
          Some facts were read with low OCR confidence. Tick <b>Please confirm</b> on each amber fact (or fix the file) before running the analysis.
        </Alert>
      )}

      {history && (
        <Alert tone="neutral" icon={History}>
          <div className="font-semibold text-foreground">Past dispute (history)</div>
          This dispute was resolved on PayPal before this demo
          {d.outcome && <> and was <b className="text-foreground">{d.outcome === 'won' ? 'won by the merchant' : 'lost (buyer refunded)'}</b></>}.
          It is part of the seeded history behind the <b className="text-foreground">Analytics</b> page, so only its final evidence-strength score
          (<b className="text-foreground">{a.strength_label} {a.strength_score}/10</b>) is stored, not a claim-by-claim analysis.
          Try an open dispute in the Inbox to see ClaimCheck at work.
        </Alert>
      )}

      {/* AI analysis: loading state while it runs, step summary after */}
      {running ? (
        <AnalysisLoader steps={PIPELINE} filesDone={filesDone} startedAt={startedAt} />
      ) : full && (
        <InView>
          <Card className="px-5 py-3.5">
            <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-xs">
              {PIPELINE.map((name, i) => {
                const step = a?.steps?.find((st) => st.name === name)
                return (
                  <li key={name} className="flex items-center gap-1" title={step ? `${step.detail} · ${step.engine}` : ''}>
                    <span className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1', step ? 'bg-muted text-foreground' : 'text-subtle')}>
                      {step ? <Check className="size-3.5 text-success" aria-hidden="true" /> : <span className="size-3 rounded-full border border-current" aria-hidden="true" />}
                      {name}
                      {step && <span className="font-mono text-subtle tabular">{step.ms}ms</span>}
                    </span>
                    {i < PIPELINE.length - 1 && <ChevronRight className="size-3.5 text-subtle" aria-hidden="true" />}
                  </li>
                )
              })}
            </ol>
            <div className="mt-2 text-xs text-muted-foreground">
              Engine: <b className="text-foreground">{a.engine}</b> · ran {d.analysis_engine === 'render-workflows' ? <>as a <b className="text-foreground">Render Workflow</b> ({d.analysis_run_id})</> : (d.analysis_engine || 'in-process')} · pipeline {(a.duration_ms / 1000).toFixed(1)} s
              {elapsed != null && <> · <b className="text-success-fg">defence drafted in {elapsed.toFixed(1)} s</b> (vs ~20 min by hand)</>}
            </div>
          </Card>
        </InView>
      )}
      {d.analysis_state === 'error' && <Alert tone="danger" icon={AlertTriangle}>Analysis failed: {d.analysis_error}</Alert>}

      <div className="grid gap-5 xl:grid-cols-12">
        {/* Left: customer claim */}
        <InView className="xl:col-span-5">
          <Section title="Customer claim" icon={MessageSquareQuote} className="h-full">
            <blockquote className="rounded-xl border-l-4 border-primary bg-muted/50 px-4 py-3 text-[15px] leading-relaxed">
              “{d.buyer_message}”
              <div className="mt-2 text-xs text-muted-foreground">— {d.buyer}, via PayPal</div>
            </blockquote>
            {full ? (
              <Appear as="ol" className="mt-4 space-y-2" stagger={0.08} from={{ autoAlpha: 0, x: -8 }} duration={0.45}
                watch={a.results.map((r) => r.claim_id + r.status).join()}>
                {a.results.map((r, i) => (
                  <li key={r.claim_id}>
                    <button onClick={() => setSelectedClaim(r.claim_id === selectedClaim ? null : r.claim_id)}
                      aria-pressed={selectedClaim === r.claim_id}
                      className={cn('flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                        selectedClaim === r.claim_id ? 'border-primary bg-accent' : 'hover:bg-muted')}>
                      <span className="mt-0.5 font-mono text-xs text-subtle">c{i + 1}</span>
                      <span className="flex-1 text-sm font-medium">{r.claim_text}</span>
                      <StatusFlag status={r.status} pop={justDone} />
                    </button>
                  </li>
                ))}
              </Appear>
            ) : open ? (
              <p className="mt-4 text-sm text-muted-foreground">Add evidence, then press <b className="text-foreground">Generate AI Defence</b>. ClaimCheck splits this message into separate claims and checks each one.</p>
            ) : null}
          </Section>
        </InView>

        {/* Right: evidence */}
        <InView className="xl:col-span-7" delay={0.08}>
          <EvidencePanel d={d} linkedEvidence={linkedEvidence} reload={reload} notify={notify} />
        </InView>
      </div>

      {/* Middle: claim vs evidence */}
      {full && (
        <InView>
          <Section title="Claim vs evidence" icon={ShieldCheck} contentClassName="p-0"
            right={<span className="text-xs text-muted-foreground">Expand a row to see the cited facts · click to highlight the files</span>}>
            <AgGridReact
              domLayout="autoHeight"
              theme={gridTheme}
              rowData={claimRows}
              columnDefs={claimCols}
              getRowId={(p) => p.data.claim_id}
              masterDetail
              detailCellRenderer={ClaimDetail}
              detailRowAutoHeight
              context={{ factsById }}
              defaultColDef={{ resizable: true, sortable: false }}
              rowClassRules={{ 'row-linked': (p) => p.data.claim_id === selectedClaim }}
              onRowClicked={(e) => setSelectedClaim(e.data.claim_id)}
              onFirstDataRendered={(e) => e.api.forEachNode((n) => n.data.status === 'contradicted' && n.data.n === 1 && n.setExpanded(true))}
            />
          </Section>
        </InView>
      )}

      {/* Bottom: strength, gaps, report */}
      {full && (
        <div className="grid gap-5 xl:grid-cols-12">
          <InView className="space-y-5 xl:col-span-5">
            <StrengthCard analysis={a} />
            <GapsCard analysis={a} />
          </InView>
          <InView className="xl:col-span-7" delay={0.08}>
            <ReportEditor
              value={report}
              onChange={(e) => { setReport(e.target.value); setSaved(false); setApproved(false) }}
              onBlur={async () => { if (!saved) { await api.saveReport(d.id, report); setSaved(true) } }}
              saved={saved}
              open={open}
              approved={approved}
              onApprove={setApproved}
              busy={busy}
              refundRecommended={rec?.action === 'refund'}
              statusLabel={statusText(d.status).toLowerCase()}
              pdfUrl={api.pdfUrl(d.id)}
              onSubmit={() => { const k = sandboxKey(); if (k !== null) act('submit', () => api.submit(d.id, report, k), (r) => `Evidence submitted via provide-evidence (${r.mode === 'mock' ? 'seeded mock' : 'PayPal Sandbox'})`) }}
              onRefund={() => { if (!confirm('Accept the claim and refund the buyer through PayPal?')) return; const k = sandboxKey(); if (k !== null) act('refund', () => api.acceptClaim(d.id, '', k), (r) => `Claim accepted, buyer refunded (accept-claim, ${r.mode})`) }}
            />
          </InView>
        </div>
      )}

      {/* Audit log */}
      <Card>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm font-semibold">
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
            <ScrollText className="size-4 text-muted-foreground" aria-hidden="true" />
            Audit log ({d.audit.length})
          </summary>
          <ul className="space-y-1 border-t px-5 py-3 font-mono text-xs text-muted-foreground">
            {d.audit.slice().reverse().map((l, i) => (
              <li key={i} className="break-words"><span className="text-subtle">{new Date(l.at).toLocaleString()}</span> <span className="text-foreground">{l.action}</span> {Object.entries(l.detail).filter(([k]) => !['ai_draft', 'final', 'request', 'response'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ')}</li>
            ))}
          </ul>
        </details>
      </Card>
    </div>
  )
}
