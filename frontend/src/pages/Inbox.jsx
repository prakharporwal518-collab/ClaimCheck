import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { gridTheme } from '../lib/grid'
import { daysLabel, money, statusText } from '../lib/format'
import { ScorePill, Spinner } from '../components/ui'
import { useApp } from '../components/AppShell'

const isOpen = (r) => r.status === 'WAITING_FOR_SELLER_RESPONSE'

function DaysLeft({ data }) {
  if (!isOpen(data)) return <span className="text-slate-400">—</span>
  const urgent = data.days_left <= 3
  return (
    <span className={`font-mono font-semibold ${urgent ? 'text-rose-700' : 'text-slate-700'}`}>
      {urgent && '⚠ '}
      {daysLabel(data.days_left)}
    </span>
  )
}

function Status({ data }) {
  const cls = isOpen(data)
    ? 'bg-amber-50 text-amber-800 ring-amber-200'
    : ['UNDER_REVIEW', 'WAITING_FOR_BUYER_RESPONSE', 'OTHER'].includes(data.status)
      ? 'bg-blue-50 text-blue-800 ring-blue-200'
      : 'bg-slate-100 text-slate-600 ring-slate-200'
  return <span className={`chip ring-1 ${cls}`}>{statusText(data.status)}</span>
}

function NextStep({ data }) {
  if (data.analysis_state === 'queued' || data.analysis_state === 'running')
    return <span className="flex items-center gap-1.5 text-brand-700"><Spinner className="h-3.5 w-3.5" /> Drafting…</span>
  if (data.decision === 'submitted') return <span className="text-blue-700">Evidence sent</span>
  if (data.decision === 'refunded') return <span className="text-slate-600">Refunded</span>
  if (!isOpen(data)) return <span className="text-slate-400">{data.outcome === 'won' ? 'Won' : data.outcome === 'lost' ? 'Lost' : '—'}</span>
  if (!data.label) return <span className="text-slate-500">Add evidence</span>
  return data.recommendation === 'refund'
    ? <span className="font-semibold text-rose-700">Recommend refund</span>
    : <span className="font-semibold text-emerald-700">Draft ready</span>
}

export default function Inbox() {
  const { health, notify } = useApp()
  const nav = useNavigate()
  const grid = useRef(null)
  const [rows, setRows] = useState(null)
  const [quick, setQuick] = useState('')
  const [view, setView] = useState('open')
  const [source, setSource] = useState('all')
  const both = health?.paypal_sources?.length > 1
  const [busy, setBusy] = useState('')

  const load = useCallback(() => api.disputes().then(setRows).catch((e) => notify(e.message, 'error')), [notify])
  useEffect(() => { load() }, [load])
  // Keep polling while an auto-draft (webhook) is running.
  useEffect(() => {
    if (!rows?.some((r) => ['queued', 'running'].includes(r.analysis_state))) return
    const t = setTimeout(load, 2000)
    return () => clearTimeout(t)
  }, [rows, load])

  const shown = useMemo(() => {
    if (!rows) return null
    let list = rows
    if (source !== 'all') list = list.filter((r) => (source === 'sandbox' ? r.source === 'sandbox' : r.source !== 'sandbox'))
    if (view === 'open') return list.filter(isOpen)
    if (view === 'closed') return list.filter((r) => !isOpen(r))
    return list
  }, [rows, view, source])

  const kpis = useMemo(() => {
    const open = (rows || []).filter(isOpen)
    const scored = (rows || []).filter((r) => r.score != null)
    return {
      open: open.length,
      atRisk: open.reduce((s, r) => s + r.amount, 0),
      urgent: open.filter((r) => r.days_left <= 3).length,
      avg: scored.length ? (scored.reduce((s, r) => s + r.score, 0) / scored.length).toFixed(1) : '—',
    }
  }, [rows])

  const columns = useMemo(
    () => [
      { field: 'id', headerName: 'Dispute', width: 130, cellClass: 'font-mono text-xs', pinned: 'left' },
      { field: 'buyer', headerName: 'Buyer', flex: 1, minWidth: 140 },
      {
        field: 'source', headerName: 'Source', width: 135, filter: 'agSetColumnFilter',
        valueFormatter: (p) => (p.value === 'sandbox' ? 'PayPal Sandbox' : 'Demo data'),
        cellRenderer: (p) => p.value === 'sandbox'
          ? <span className="chip bg-blue-50 text-blue-800 ring-1 ring-blue-200">PayPal Sandbox</span>
          : <span className="chip bg-slate-100 text-slate-600">Demo data</span>,
      },
      { field: 'item', headerName: 'Item', flex: 1.4, minWidth: 200 },
      {
        field: 'amount', headerName: 'Amount', width: 110, type: 'rightAligned',
        valueFormatter: (p) => money(p.value, p.data.currency),
      },
      { field: 'reason_label', headerName: 'Reason', width: 150, filter: 'agSetColumnFilter' },
      {
        field: 'days_left', headerName: 'Days left', width: 120, sort: 'asc', cellRenderer: DaysLeft,
        comparator: (a, b, na, nb) => {
          const va = isOpen(na.data) ? a : 9999
          const vb = isOpen(nb.data) ? b : 9999
          return va - vb
        },
      },
      { field: 'status', headerName: 'Status', width: 150, cellRenderer: Status, filter: 'agSetColumnFilter', valueFormatter: (p) => statusText(p.value) },
      {
        field: 'score', headerName: 'Evidence strength', width: 160,
        cellRenderer: (p) => <ScorePill label={p.data.label} score={p.data.score} />,
      },
      { headerName: 'Next step', width: 160, cellRenderer: NextStep, sortable: false },
      { field: 'evidence_count', headerName: 'Files', width: 80, type: 'rightAligned' },
    ],
    [],
  )

  const run = async (name, fn, ok) => {
    setBusy(name)
    try {
      const r = await fn()
      ok && notify(ok(r), 'success')
      await load()
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dispute inbox</h1>
          <p className="text-sm text-slate-500">Item Not Received disputes from PayPal, sorted by response deadline.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" disabled={!!busy}
            onClick={() => run('sync', api.sync, (r) => {
              const parts = Object.entries(r.sources || {}).map(([k, v]) => `${k === 'sandbox' ? 'PayPal Sandbox' : 'demo data'}: ${v.error ? 'error – ' + v.error : `${v.listed} listed, ${v.new} new`}`)
              return `Synced. ${parts.join(' · ')}`
            })}>
            {busy === 'sync' ? <Spinner /> : '↻'} Sync from PayPal
          </button>
          {health?.paypal_sources?.includes('mock') && (
            <button className="btn-primary" disabled={!!busy}
              onClick={() => run('sim', api.simulate, (r) => `Webhook CUSTOMER.DISPUTE.CREATED → ${r.dispute_id} synced, drafting a defence…`)}>
              {busy === 'sim' ? <Spinner /> : '⚡'} Simulate new dispute (webhook)
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Open disputes', kpis.open],
          ['Money at risk', money(kpis.atRisk)],
          ['Due in ≤ 3 days', kpis.urgent, kpis.urgent ? 'text-rose-600' : ''],
          ['Avg evidence strength', `${kpis.avg}${kpis.avg !== '—' ? '/10' : ''}`],
        ].map(([label, value, cls]) => (
          <div key={label} className="card px-4 py-3">
            <div className="label">{label}</div>
            <div className={`mt-1 text-2xl font-bold ${cls || ''}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="card p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {[['open', 'Needs response'], ['closed', 'Closed'], ['all', 'All']].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {l}
            </button>
          ))}
          {both && (
            <div className="ml-2 flex rounded-lg border border-slate-200 p-0.5 text-sm">
              {[['all', 'All sources'], ['mock', 'Demo data'], ['sandbox', 'PayPal Sandbox']].map(([v, l]) => (
                <button key={v} onClick={() => setSource(v)}
                  className={`rounded-md px-2.5 py-1 font-medium ${source === v ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {l}
                </button>
              ))}
            </div>
          )}
          <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Search buyer, item, dispute ID…"
            className="ml-auto w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm sm:w-72" />
        </div>
        <div style={{ height: 520 }}>
          {shown ? (
            <AgGridReact
              ref={grid}
              theme={gridTheme}
              rowData={shown}
              columnDefs={columns}
              defaultColDef={{ sortable: true, resizable: true, filter: true }}
              getRowId={(p) => p.data.id}
              quickFilterText={quick}
              rowClassRules={{ 'row-urgent': (p) => isOpen(p.data) && p.data.days_left <= 3 }}
              onRowClicked={(e) => nav(`/app/disputes/${e.data.id}`)}
              rowStyle={{ cursor: 'pointer' }}
              animateRows
            />
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-slate-500"><Spinner /> Loading disputes…</div>
          )}
        </div>
      </div>
    </div>
  )
}
