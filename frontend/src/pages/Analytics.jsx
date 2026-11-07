import { useEffect, useMemo, useState } from 'react'
import { AgStudio } from 'ag-studio-react'
import { AgStudioAiModule, AgStudioLicenseManager, createAiHarness } from 'ag-studio'
import '../lib/grid'
import { api } from '../lib/api'
import { money } from '../lib/format'
import { Spinner } from '../components/ui'
import { buildReport } from '../lib/studioReport'

/**
 * AG Studio has no built-in model: Studio calls this adapter for each AI turn,
 * and the ClaimCheck backend forwards it to Gemini (function calling) with the
 * same key the analysis pipeline uses. No key → a friendly message, no crash.
 */
const geminiAdapter = {
  executeTurn(request, options) {
    const res = api.studioTurn(request, options?.signal)
    const complete = res.then((r) => ({
      id: `resp_${Date.now()}`,
      createdAt: Date.now(),
      output: r.output,
      status: r.status || 'completed',
      model: r.model,
      usage: r.usage,
    }))
    const stream = {
      async *[Symbol.asyncIterator]() {
        const r = await res
        for (const item of r.output) {
          if (item.type === 'message') {
            const text = item.content.map((c) => c.text || '').join('')
            yield { type: 'TEXT_MESSAGE_START', messageId: item.id, role: 'assistant' }
            yield { type: 'TEXT_MESSAGE_CONTENT', messageId: item.id, delta: text }
            yield { type: 'TEXT_MESSAGE_END', messageId: item.id }
          } else if (item.type === 'function_call') {
            yield { type: 'TOOL_CALL_START', toolCallId: item.callId, toolCallName: item.name }
            yield { type: 'TOOL_CALL_ARGS', toolCallId: item.callId, delta: item.arguments }
            yield { type: 'TOOL_CALL_END', toolCallId: item.callId }
          }
        }
      },
    }
    return { stream, complete }
  },
}

if (import.meta.env.VITE_AG_GRID_LICENSE_KEY) AgStudioLicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY)

const PROMPTS = [
  { label: 'Due this week, Low score', prompt: 'Which open disputes are due in the next 7 days and have a Low evidence strength? Show them in a table.' },
  { label: 'Money at risk by item', prompt: 'Add a bar chart of money at risk by item for open disputes.' },
  { label: 'Win rate', prompt: 'How many resolved disputes did we win versus lose? Add a donut chart of outcome.' },
]

export default function Analytics() {
  const [rows, setRows] = useState(null)
  const [mode, setMode] = useState('view')
  const [health, setHealth] = useState(null)
  useEffect(() => {
    api.analytics().then((r) => setRows(r.rows))
    api.health().then(setHealth)
  }, [])

  const data = useMemo(
    () =>
      rows && {
        description:
          'PayPal disputes handled by ClaimCheck for one small merchant. source is Demo data (seeded) or PayPal Sandbox (real API). strength is the evidence-strength label (High/Medium/Low), score is 0-10, money_at_risk is the amount of disputes that are not resolved yet, days_left is days until the PayPal response deadline (open disputes only).',
        sources: [{ id: 'disputes', name: 'Disputes', data: rows }],
      },
    [rows],
  )
  const initialState = useMemo(() => buildReport(), [])
  const ai = useMemo(
    () => (params) =>
      createAiHarness(params.api, { adapter: geminiAdapter, promptStarters: PROMPTS }),
    [],
  )

  const open = (rows || []).filter((r) => r.status === 'Open')
  const resolved = (rows || []).filter((r) => r.outcome !== 'Pending')
  const won = resolved.filter((r) => r.outcome === 'Won').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-slate-500">
            Built with AG Studio. Switch to <b>Edit</b> to drag fields into new charts, or open the <b>AI assistant</b> panel and ask a question
            {health && !health.gemini && <> (needs a Gemini key on the backend)</>}.
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm font-semibold">
          {['view', 'edit'].map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-md px-3 py-1.5 ${mode === m ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
              {m === 'view' ? 'View' : 'Edit + AI assistant'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Money at risk', money(open.reduce((s, r) => s + r.amount, 0))],
          ['Open disputes', open.length],
          ['Win rate (resolved)', resolved.length ? `${Math.round((won / resolved.length) * 100)}%` : '—'],
          ['Avg time to draft', (() => { const t = (rows || []).filter((r) => r.response_minutes != null); return t.length ? `${(t.reduce((s, r) => s + r.response_minutes, 0) / t.length).toFixed(1)} min` : '—' })()],
        ].map(([label, value]) => (
          <div key={label} className="card px-4 py-3">
            <div className="label">{label}</div>
            <div className="mt-1 text-2xl font-bold">{value}</div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden" style={{ height: 900 }}>
        {data ? (
          <AgStudio
            data={data}
            mode={mode}
            initialState={initialState}
            modules={[AgStudioAiModule]}
            ai={ai}
            panels={{ edit: { left: ['data'], right: ['edit', 'ai'] }, view: { right: ['filters'] } }}
            style={{ height: '100%', width: '100%' }}
            onErrorRaised={(e) => console.warn('AG Studio', e)}
            onApiReady={(e) => { if (import.meta.env.DEV) window.__studio = e.api }}
          />
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-slate-500"><Spinner /> Loading data…</div>
        )}
      </div>
    </div>
  )
}
