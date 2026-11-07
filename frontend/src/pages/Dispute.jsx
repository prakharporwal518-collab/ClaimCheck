import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AgGridReact } from 'ag-grid-react'
import { api } from '../lib/api'
import { gridTheme } from '../lib/grid'
import { daysLabel, fileSize, money, statusText } from '../lib/format'
import { guessTag, MAX_FILES, prepareFile } from '../lib/compress'
import { ScorePill, Spinner, StatusFlag } from '../components/ui'
import { useApp } from '../components/AppShell'

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
function Section({ title, right, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold tracking-tight text-slate-800">{title}</h2>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function OcrCell({ data }) {
  if (data.ocr_confidence == null) return <span className="text-slate-400">{data.mime === 'application/pdf' ? 'text layer' : '—'}</span>
  const low = data.ocr_confidence < 60
  return <span className={`chip ${low ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{data.ocr_confidence.toFixed(0)}%</span>
}

function IntegrityCell({ data }) {
  const st = data.integrity?.status
  if (!st) return <span className="text-slate-400">—</span>
  const issues = data.integrity?.issues || []
  return (
    <span title={[...(data.integrity?.ok || []), ...issues].join('\n')}
      className={`chip ${st === 'OK' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'}`}>
      {st === 'OK' ? '✓ OK' : '! Check'}
    </span>
  )
}

function StateCell({ data }) {
  if (data.state === 'pending' || data.state === 'processing')
    return <span className="flex items-center gap-1 text-brand-700"><Spinner className="h-3.5 w-3.5" /> Reading…</span>
  if (data.state === 'error') return <span className="text-rose-700" title={data.error}>Error</span>
  return <span className="text-slate-600">{data.facts.length} facts</span>
}

function ClaimDetail({ data, context }) {
  const facts = context.factsById
  return (
    <div className="space-y-2 bg-slate-50 px-6 py-4">
      <div className="text-sm text-slate-700"><span className="font-semibold">Why:</span> {data.why}</div>
      {data.evidence.length === 0 && <div className="text-sm text-slate-500">No evidence cited. Upload evidence that covers this claim.</div>}
      <ul className="space-y-1.5">
        {data.evidence.map((id) => {
          const f = facts[id]
          if (!f) return null
          return (
            <li key={id} className="flex flex-wrap items-start gap-2 text-sm">
              <span className="chip bg-brand-100 font-mono text-brand-700">{id}</span>
              <span className="flex-1 text-slate-800">{f.fact_display || f.fact}</span>
              {f.evidence_id ? (
                <a href={api.fileUrl(f.evidence_id)} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-600 hover:underline">
                  {f.source} ↗
                </a>
              ) : (
                <span className="text-xs text-slate-500">{f.source}</span>
              )}
            </li>
          )
        })}
      </ul>
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
        cellRenderer: (p) => <a className="font-medium text-brand-700 hover:underline" href={api.fileUrl(p.data.id)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{p.value}</a>,
      },
      {
        field: 'tag', headerName: 'Tag ✎', width: 135, editable: true,
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
          <button className="text-slate-400 hover:text-rose-600" title="Remove file"
            onClick={async (e) => { e.stopPropagation(); await api.deleteEvidence(p.data.id); reload() }}>🗑</button>
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

  const sel = d.evidence.find((e) => e.id === selected) || d.evidence[0]

  const updateFact = async (idx, patch) => {
    const facts = sel.facts.map((f, i) => (i === idx ? { ...f, ...patch } : f))
    await api.patchEvidence(sel.id, { facts })
    reload()
  }

  return (
    <Section
      title={`Merchant evidence (${d.evidence.length}/${MAX_FILES})`}
      right={
        <div className="flex gap-2">
          <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => csvInput.current.click()}>Import order CSV</button>
          {d.sample_set && (
            <button className="btn-ghost px-2.5 py-1 text-xs" disabled={busy}
              onClick={() => loadSample()}>
              {d.sample_set === 'starter' ? 'Import sample order CSV' : 'Load sample evidence'}
            </button>
          )}
          {!STORY_SETS.includes(d.sample_set) && (
            <select aria-label="Load sample evidence" disabled={busy} value=""
              className="btn-ghost cursor-pointer px-2.5 py-1 text-xs"
              onChange={(e) => { if (e.target.value) loadSample(e.target.value) }}>
              <option value="">Load sample evidence…</option>
              {SCENARIOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
        </div>
      }
    >
      <input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={async (e) => {
        try { const r = await api.orderCsv(d.id, e.target.files[0]); notify(`Matched order ${r.matched['Order ID'] || ''} in the CSV`, 'success'); reload() } catch (err) { notify(err.message, 'error') }
        e.target.value = ''
      }} />
      {d.sample_set === 'starter' && d.evidence.length === 0 && (
        <div className="mb-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          <b>No evidence yet — on purpose.</b> This demo case shows a brand-new dispute.
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>Press <b>Generate AI Defence</b> now: claims come back <b>Unverified</b> and the checklist lists exactly what to upload.</li>
            <li>Or click <b>Import sample order CSV</b> (top right): ClaimCheck finds this order in a store export and adds its tracking number.</li>
            <li>Or pick a scenario in <b>Load sample evidence…</b>: files are made for this dispute (Sofia's name, address and order).</li>
          </ul>
        </div>
      )}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files) }}
        onClick={() => input.current.click()}
        className={`mb-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-5 text-center transition ${drag ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-500 hover:bg-slate-50'}`}
      >
        <input ref={input} type="file" multiple accept="application/pdf,image/png,image/jpeg" hidden onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
        {busy ? <Spinner className="h-5 w-5 text-brand-600" /> : <div className="text-2xl">⇪</div>}
        <div className="mt-1 text-sm font-semibold text-slate-700">Drop tracking PDFs, invoices, chat screenshots, delivery photos</div>
        <div className="text-xs text-slate-500">PDF, PNG or JPG · max 5 MB each · images are compressed in your browser first</div>
        {d.sample_set === 'starter' ? (
          <div className="mt-2 text-xs text-slate-500" onClick={(e) => e.stopPropagation()}>
            Sample order export:{' '}
            <a href={`${api.base}/samples/orders_export.csv`} download className="font-medium text-brand-600 hover:underline">orders_export.csv</a>
          </div>
        ) : d.sample_set ? (
          <div className="mt-2 text-xs text-slate-500" onClick={(e) => e.stopPropagation()}>
            Sample files to drag in:{' '}
            {SAMPLE_FILES[d.sample_set].map((f) => (
              <a key={f} href={`${api.base}/samples/${d.sample_set}/${f}`} download className="mx-1 font-medium text-brand-600 hover:underline">{f}</a>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-xs text-slate-500">
            No files to hand? Use <b>Load sample evidence…</b> (top right): files are made to match this dispute.
          </div>
        )}
      </div>

      {d.evidence.length > 0 && (
        <>
          <div style={{ height: Math.min(56 + d.evidence.length * 42, 300) }}>
            <AgGridReact
              theme={gridTheme}
              rowData={d.evidence}
              columnDefs={columns}
              getRowId={(p) => String(p.data.id)}
              defaultColDef={{ sortable: true, resizable: true }}
              singleClickEdit
              stopEditingWhenCellsLoseFocus
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
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{sel.filename}</span>
                <span>· {sel.extractor || 'waiting'}</span>
                {sel.error && <span className="text-rose-600">· {sel.error}</span>}
              </div>
              {(sel.integrity?.issues || []).map((i) => (
                <div key={i} className="mb-1 text-xs font-medium text-amber-800">⚠ {i}</div>
              ))}
              <ul className="space-y-1">
                {sel.facts.map((f, i) => (
                  <li key={i} className={`flex items-start gap-2 rounded px-2 py-1 text-sm ${f.needs_confirmation && !f.confirmed ? 'bg-amber-50 ring-1 ring-amber-200' : ''}`}>
                    <span className="chip mt-0.5 bg-white font-mono text-[10px] text-slate-500 ring-1 ring-slate-200">{f.kind}</span>
                    <span className="flex-1 text-slate-800">{f.fact}</span>
                    {f.confidence != null && (
                      <span title="OCR confidence of the line this fact was read from"
                        className={`chip shrink-0 font-mono text-[10px] ${f.confidence < 60 ? 'bg-amber-100 text-amber-800' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>
                        {Math.round(f.confidence)}%
                      </span>
                    )}
                    {f.needs_confirmation && (
                      <label className="flex shrink-0 items-center gap-1 text-xs font-semibold text-amber-800">
                        <input type="checkbox" checked={!!f.confirmed} onChange={(e) => updateFact(i, { confirmed: e.target.checked })} />
                        {f.confirmed ? 'Confirmed' : 'Please confirm'}
                      </label>
                    )}
                  </li>
                ))}
                {sel.facts.length === 0 && sel.state === 'done' && <li className="text-sm text-slate-500">No facts found in this file.</li>}
              </ul>
              <p className="mt-2 text-[11px] text-slate-500">Buyer details are masked ([BUYER], [ADDRESS]…) before anything is sent to the AI model.</p>
            </div>
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
      { headerName: 'Evidence', width: 100, valueGetter: (p) => p.data.evidence.length, cellRenderer: (p) => <span className="font-mono">{p.value ? p.data.evidence.join(', ') : '—'}</span> },
      {
        field: 'strength', headerName: 'Strength', width: 105,
        cellRenderer: (p) => p.value === 'none' || p.data.status !== 'contradicted' ? <span className="text-slate-400">—</span> : <span className={`chip ${p.value === 'strong' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>{p.value}</span>,
      },
      { field: 'why', headerName: 'Why', flex: 2, minWidth: 220, wrapText: true, autoHeight: true, cellClass: 'leading-snug py-2 text-slate-600' },
    ],
    [justDone],
  )

  if (!d) return <div className="flex items-center gap-2 text-slate-500"><Spinner /> Loading dispute…</div>

  const open = d.status === 'WAITING_FOR_SELLER_RESPONSE'
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

  const currentStep = d.analysis_state === 'running' ? (d.evidence.some((e) => e.state !== 'done') ? 0 : 3) : -1

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
        <Link to="/app" className="text-sm text-slate-500 hover:text-slate-800">← Inbox</Link>
        <div>
          <div className="font-mono text-xs text-slate-500">{d.id} · {d.source === 'sandbox' ? 'PayPal Sandbox' : 'seeded demo data'}</div>
          <div className="text-lg font-bold">{d.buyer} <span className="font-normal text-slate-500">· {d.item}</span></div>
        </div>
        <div><div className="label">Amount</div><div className="font-semibold">{money(d.amount, d.currency)}</div></div>
        <div><div className="label">Reason</div><span className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-200">Item Not Received</span></div>
        <div><div className="label">Respond within</div><div className={`font-mono font-semibold ${urgent ? 'text-rose-600' : ''}`}>{open ? daysLabel(d.days_left) : '—'}</div></div>
        <div><div className="label">Status</div><div className="text-sm font-semibold">{statusText(d.status)}{d.decision !== 'open' && ` · ${d.decision}`}</div></div>
        <div className="ml-auto flex items-center gap-3">
          {a && <ScorePill label={a.strength_label} score={a.strength_score} />}
          <button className="btn-primary px-5 py-2.5 text-base" onClick={generate} disabled={!!busy || working || !open || pendingConfirm}
            title={pendingConfirm ? 'Confirm the amber facts first' : ''}>
            {working && d.analysis_state !== 'done' ? <Spinner /> : '✦'} {a ? 'Re-run AI Defence' : 'Generate AI Defence'}
          </button>
        </div>
      </div>

      {d.source === 'sandbox' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
          <b>Real PayPal Sandbox dispute.</b> It was read from the PayPal Disputes API. <b>Submit</b> and <b>Refund</b> call
          PayPal for real and can't be undone. The demo disputes are safe to play with.
        </div>
      )}

      {pendingConfirm && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Some facts were read with low OCR confidence. Tick <b>Please confirm</b> on each amber fact (or fix the file) before running the analysis.
        </div>
      )}

      {/* Pipeline progress / timeline */}
      {(working || a) && (
        <div className="card px-5 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {PIPELINE.map((name, i) => {
              const step = a?.steps?.find((s) => s.name === name)
              const running = working && d.analysis_state !== 'done'
              const done = !running && step
              const active = running && i === Math.max(currentStep, 0)
              return (
                <div key={name} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${active ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : done ? 'bg-slate-100 text-slate-700' : 'text-slate-400'}`}
                  title={step ? `${step.detail} · ${step.engine}` : ''}>
                  {active ? <Spinner className="h-3 w-3" /> : done ? '✓' : '○'} {name}
                  {done && <span className="font-mono text-slate-400">{step.ms}ms</span>}
                </div>
              )
            })}
          </div>
          {a && !working && (
            <div className="mt-2 text-xs text-slate-500">
              Engine: <b>{a.engine}</b> · ran {d.analysis_engine === 'render-workflows' ? <>as a <b>Render Workflow</b> ({d.analysis_run_id})</> : (d.analysis_engine || 'in-process')} · pipeline {(a.duration_ms / 1000).toFixed(1)} s
              {elapsed != null && <> · <b className="text-emerald-700">defence drafted in {elapsed.toFixed(1)} s</b> (vs ~20 min by hand)</>}
            </div>
          )}
          {d.analysis_state === 'error' && <div className="mt-2 text-sm text-rose-700">Analysis failed: {d.analysis_error}</div>}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-12">
        {/* Left: customer claim */}
        <Section title="Customer claim" className="xl:col-span-5">
          <blockquote className="rounded-lg border-l-4 border-slate-300 bg-slate-50 px-4 py-3 text-[15px] leading-relaxed text-slate-800">
            “{d.buyer_message}”
            <div className="mt-2 text-xs text-slate-500">— {d.buyer}, via PayPal</div>
          </blockquote>
          {a ? (
            <ol className="mt-4 space-y-2">
              {a.results.map((r, i) => (
                <li key={r.claim_id}>
                  <button onClick={() => setSelectedClaim(r.claim_id === selectedClaim ? null : r.claim_id)}
                    className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition ${selectedClaim === r.claim_id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <span className="mt-0.5 font-mono text-xs text-slate-400">c{i + 1}</span>
                    <span className="flex-1 text-sm font-medium">{r.claim_text}</span>
                    <StatusFlag status={r.status} pop={justDone} />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Add evidence, then press <b>Generate AI Defence</b>. ClaimCheck splits this message into separate claims and checks each one.</p>
          )}
        </Section>

        {/* Right: evidence */}
        <div className="xl:col-span-7">
          <EvidencePanel d={d} linkedEvidence={linkedEvidence} reload={reload} notify={notify} />
        </div>
      </div>

      {/* Middle: claim vs evidence */}
      {a && (
        <Section title="Claim vs evidence" right={<span className="text-xs text-slate-500">Expand a row to see the cited facts · click to highlight the files</span>}>
          <div>
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
          </div>
        </Section>
      )}

      {/* Bottom: gaps, strength, report */}
      {a && (
        <div className="grid gap-5 xl:grid-cols-12">
          <div className="space-y-5 xl:col-span-5">
            <Section title="Evidence strength">
              <div className={`rounded-lg px-4 py-3 text-sm font-semibold ${a.strength_label === 'High' ? 'bg-emerald-50 text-emerald-900' : a.strength_label === 'Medium' ? 'bg-amber-50 text-amber-900' : 'bg-rose-50 text-rose-900'}`}>
                {a.strength_line}
              </div>
              <button className="mt-2 text-xs font-semibold text-brand-600 hover:underline" onClick={() => setShowBreakdown(!showBreakdown)}>
                {showBreakdown ? 'Hide' : 'Show'} how the score was earned
              </button>
              {showBreakdown && (
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {a.score_breakdown.map((b, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className={`w-12 py-1.5 font-mono font-semibold ${b.points > 0 ? 'text-emerald-700' : b.points < 0 ? 'text-rose-700' : ''}`}>{b.points > 0 ? `+${b.points}` : b.points}</td>
                        <td className="py-1.5 text-slate-700">{b.label}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-300 font-semibold"><td className="py-1.5 font-mono">{a.strength_score}</td><td>Final score (0–10). High 7–10, Medium 4–6, Low 0–3.</td></tr>
                  </tbody>
                </table>
              )}
              {rec && (
                <div className={`mt-4 rounded-lg border px-4 py-3 ${rec.action === 'refund' ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
                  <div className="text-sm font-bold">{rec.title}</div>
                  <div className="text-sm text-slate-700">{rec.why}</div>
                </div>
              )}
              <p className="mt-3 text-[11px] text-slate-500">Evidence strength is a transparent heuristic, not a promise: PayPal decides the outcome. ClaimCheck checks consistency, not authenticity.</p>
            </Section>

            <Section title="Evidence gaps">
              <ul className="space-y-1.5">
                {a.gaps.map((g) => (
                  <li key={g.id} className="flex items-center gap-2 text-sm">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${g.missing ? (g.critical ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700') : 'bg-emerald-100 text-emerald-700'}`}>
                      {g.missing ? '✕' : '✓'}
                    </span>
                    <span className={g.missing ? 'text-slate-800' : 'text-slate-500'}>{g.label}</span>
                    {g.missing && g.critical && <span className="chip bg-rose-100 text-rose-700">critical</span>}
                  </li>
                ))}
              </ul>
              {a.integrity?.checks?.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <div className="label mb-1">Integrity checks</div>
                  {a.integrity.checks.map((c, i) => (
                    <div key={i} className={`text-sm ${c.ok ? 'text-emerald-700' : 'text-amber-800'}`}>{c.ok ? '✓' : '⚠'} {c.text}</div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <Section title="Defence report" className="xl:col-span-7"
            right={<span className="text-xs text-slate-500">{saved ? 'Saved' : 'Unsaved changes'} · AI draft kept in the audit log</span>}>
            <textarea
              value={report}
              onChange={(e) => { setReport(e.target.value); setSaved(false); setApproved(false) }}
              onBlur={async () => { if (!saved) { await api.saveReport(d.id, report); setSaved(true) } }}
              className="h-80 w-full resize-y rounded-lg border border-slate-300 p-3 font-mono text-[13px] leading-relaxed focus:border-brand-500 focus:outline-none"
              disabled={!open}
            />
            <div className="mt-1 text-right text-xs text-slate-500">{report.length} / 2000 characters (PayPal notes limit)</div>
            {open ? (
              <>
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
                  <span>I have read this report and the evidence. Send it to PayPal on my behalf.</span>
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-primary" disabled={!approved || !!busy || report.length > 2000}
                    onClick={() => { const k = sandboxKey(); if (k !== null) act('submit', () => api.submit(d.id, report, k), (r) => `Evidence submitted via provide-evidence (${r.mode === 'mock' ? 'seeded mock' : 'PayPal Sandbox'})`) }}>
                    {busy === 'submit' ? <Spinner /> : '➤'} Submit to PayPal
                  </button>
                  <a className="btn-ghost" href={api.pdfUrl(d.id)}>⇩ Export PDF</a>
                  <button className={rec?.action === 'refund' ? 'btn-danger' : 'btn-ghost'} disabled={!!busy}
                    onClick={() => { if (!confirm('Accept the claim and refund the buyer through PayPal?')) return; const k = sandboxKey(); if (k !== null) act('refund', () => api.acceptClaim(d.id, '', k), (r) => `Claim accepted, buyer refunded (accept-claim, ${r.mode})`) }}>
                    {busy === 'refund' ? <Spinner /> : '↺'} {rec?.action === 'refund' ? 'Refund buyer (recommended)' : 'Accept claim & refund'}
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-3 flex gap-2">
                <span className="chip bg-slate-100 text-slate-700">This dispute is {statusText(d.status).toLowerCase()}.</span>
                <a className="btn-ghost" href={api.pdfUrl(d.id)}>⇩ Export PDF</a>
              </div>
            )}
            <p className="mt-3 text-[11px] text-slate-500">ClaimCheck drafts; you decide. Nothing is sent until you approve. This is not legal advice.</p>
          </Section>
        </div>
      )}

      {/* Audit log */}
      <details className="card px-5 py-3">
        <summary className="cursor-pointer text-sm font-bold text-slate-800">Audit log ({d.audit.length})</summary>
        <ul className="mt-2 space-y-1 font-mono text-xs text-slate-600">
          {d.audit.slice().reverse().map((l, i) => (
            <li key={i}><span className="text-slate-400">{new Date(l.at).toLocaleString()}</span> {l.action} {Object.entries(l.detail).filter(([k]) => !['ai_draft', 'final', 'request', 'response'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ')}</li>
          ))}
        </ul>
      </details>
    </div>
  )
}
