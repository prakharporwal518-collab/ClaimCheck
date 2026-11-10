import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { gridTheme } from '../lib/grid'
import { useGridMotion } from '../lib/grid-motion'
import { daysLabel, money, statusText } from '../lib/format'
import { ScorePill, Spinner } from '../components/ui'
import { useApp } from '../components/AppShell'
import { AlarmClock, CircleDollarSign, Clock, FolderOpen, Gauge, Inbox as InboxIcon, RefreshCw, Search, Zap, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/blocks/page-header'
import { StatCard } from '@/components/blocks/stat-card'
import { DataTableCard } from '@/components/blocks/data-table'
import { InViewStagger } from '@/components/motion-primitives/in-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'

const isOpen = (r) => r.status === 'WAITING_FOR_SELLER_RESPONSE'

function DaysLeft({ data }) {
  if (!isOpen(data)) return <span className="text-subtle">—</span>
  const urgent = data.days_left <= 3
  return (
    <span className={`inline-flex items-center gap-1 font-mono font-semibold tabular ${urgent ? 'text-danger-fg' : 'text-foreground'}`}>
      {urgent && <AlertTriangle className="size-3.5" aria-label="Due soon" />}
      {daysLabel(data.days_left)}
    </span>
  )
}

function Status({ data }) {
  const tone = isOpen(data) ? 'warning'
    : ['UNDER_REVIEW', 'WAITING_FOR_BUYER_RESPONSE', 'OTHER'].includes(data.status) ? 'info' : 'neutral'
  return <Badge tone={tone}>{statusText(data.status)}</Badge>
}

function NextStep({ data }) {
  if (data.analysis_state === 'queued' || data.analysis_state === 'running')
    return <span className="flex items-center gap-1.5 text-primary-text"><Spinner className="size-3.5" /> Drafting…</span>
  if (data.decision === 'submitted') return <span className="text-info-fg">Evidence sent</span>
  if (data.decision === 'refunded') return <span className="text-muted-foreground">Refunded</span>
  if (!isOpen(data)) return <span className="text-subtle">{data.outcome === 'won' ? 'Won' : data.outcome === 'lost' ? 'Lost' : '—'}</span>
  if (!data.label) return <span className="text-muted-foreground">Add evidence</span>
  return data.recommendation === 'refund'
    ? <span className="font-semibold text-danger-fg">Recommend refund</span>
    : <span className="font-semibold text-success-fg">Draft ready</span>
}

export default function Inbox() {
  const { health, notify } = useApp()
  const nav = useNavigate()
  const grid = useRef(null)
  const [rows, setRows] = useState(null)
  const [quick, setQuick] = useState('')
  const [view, setView] = useState('open')
  const [source, setSource] = useState('all')
  // Rows fade up on load and when you switch filters; new disputes also get a highlight.
  const gridMotion = useGridMotion(`${view}|${source}`)
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
      avg: scored.length ? scored.reduce((s, r) => s + r.score, 0) / scored.length : null,
    }
  }, [rows])

  const columns = useMemo(
    () => [
      { field: 'id', headerName: 'Dispute', width: 130, cellClass: 'font-mono text-xs', pinned: 'left' },
      { field: 'buyer', headerName: 'Buyer', flex: 1, minWidth: 140 },
      {
        field: 'source', headerName: 'Source', width: 160, filter: 'agSetColumnFilter',
        valueFormatter: (p) => (p.value === 'sandbox' ? 'PayPal Sandbox' : 'Demo data'),
        cellRenderer: (p) => p.value === 'sandbox' ? <Badge tone="info">PayPal Sandbox</Badge> : <Badge>Demo data</Badge>,
      },
      { field: 'item', headerName: 'Item', flex: 1.4, minWidth: 200 },
      {
        field: 'amount', headerName: 'Amount', width: 110, type: 'rightAligned',
        valueFormatter: (p) => money(p.value, p.data.currency), cellClass: 'tabular',
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
    <div className="space-y-6">
      <PageHeader
        icon={InboxIcon}
        title="Dispute inbox"
        description="Item Not Received disputes from PayPal, sorted by response deadline."
        actions={
          <div className="flex flex-col items-start gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" disabled={!!busy}
                onClick={() => run('sync', api.sync, (r) => {
                  const parts = Object.entries(r.sources || {}).map(([k, v]) => {
                    if (v.error) return `${k === 'sandbox' ? 'PayPal Sandbox' : 'demo data'}: error – ${v.error}`
                    const counts = `${v.listed} listed, ${v.new} new`
                    // PayPal Sandbox lists a newly opened dispute only after a few minutes.
                    return k === 'sandbox'
                      ? `PayPal Sandbox: ${counts}${v.new ? '' : ' (a dispute opened in the last few minutes may not be listed yet; sync again shortly)'}`
                      : `demo data: ${counts}`
                  })
                  return `Synced. ${parts.join(' · ')}`
                })}>
                {busy === 'sync' ? <Spinner /> : <RefreshCw />} Sync from PayPal
              </Button>
              {health?.paypal_sources?.includes('mock') && (
                <Button disabled={!!busy}
                  onClick={() => run('sim', api.simulate, (r) => `Webhook CUSTOMER.DISPUTE.CREATED → ${r.dispute_id} synced, drafting a defence…`)}>
                  {busy === 'sim' ? <Spinner /> : <Zap />} Simulate new dispute (webhook)
                </Button>
              )}
            </div>
            {health?.paypal_sources?.includes('sandbox') && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                New PayPal Sandbox disputes can take a few minutes to appear here after they're opened.
              </p>
            )}
          </div>
        }
      />

      <InViewStagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Open disputes" value={rows ? kpis.open : undefined} icon={FolderOpen} />
        <StatCard label="Money at risk" value={rows ? kpis.atRisk : undefined} icon={CircleDollarSign} format={(v) => money(v)} />
        <StatCard label="Due in ≤ 3 days" value={rows ? kpis.urgent : undefined} icon={AlarmClock} tone={kpis.urgent ? 'danger' : 'default'} emphasis={kpis.urgent > 0} />
        <StatCard label="Avg evidence strength" value={kpis.avg ?? '—'} icon={Gauge} format={(v) => v.toFixed(1)} suffix="/10" tone="success" />
      </InViewStagger>

      <DataTableCard
        toolbar={
          <>
            <Segmented label="Dispute status" value={view} onChange={setView}
              options={[['open', 'Needs response'], ['closed', 'Closed'], ['all', 'All']]} />
            {both && (
              <Segmented label="Source" value={source} onChange={setSource}
                options={[['all', 'All sources'], ['mock', 'Demo data'], ['sandbox', 'PayPal Sandbox']]} />
            )}
            <div className="relative ml-auto w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
              <Input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Search buyer, item, dispute ID…"
                aria-label="Search disputes" className="pl-9" />
            </div>
          </>
        }
      >
        <div ref={gridMotion.ref} style={{ height: 540 }}>
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
              rowHeight={46}
              animateRows
              {...gridMotion.gridProps}
            />
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-muted-foreground" role="status"><Spinner /> Loading disputes…</div>
          )}
        </div>
      </DataTableCard>
    </div>
  )
}
