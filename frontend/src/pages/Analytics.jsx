import { useEffect, useMemo, useState } from 'react'
import { AgStudio } from 'ag-studio-react'
import { AgStudioAiModule, AgStudioLicenseManager, createAiHarness, studioTheme } from 'ag-studio'
import '../lib/grid'
import { api } from '../lib/api'
import { money } from '../lib/format'
import { Spinner } from '../components/ui'
import { buildReport } from '../lib/studioReport'
import { BarChart3, CircleDollarSign, FolderOpen, Timer, Trophy } from 'lucide-react'
import { PageHeader } from '@/components/blocks/page-header'
import { StatCard } from '@/components/blocks/stat-card'
import { Card } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { InViewStagger } from '@/components/motion-primitives/in-view'
import { cssVar, useTheme } from '@/lib/theme'

/** AG Studio draws charts on a canvas, so it gets the theme's resolved colours (not CSS variables). */
function studioColors() {
  const c = (n) => cssVar(n)
  return {
    page: c('--muted'), widget: c('--card'), border: c('--border'), fg: c('--foreground'), muted: c('--muted-foreground'),
    accent: c('--primary'), card: c('--card'), bg: c('--background'), dark: document.documentElement.classList.contains('dark'),
  }
}

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
  const { theme } = useTheme()
  const colors = useMemo(() => studioColors(), [theme]) // eslint-disable-line react-hooks/exhaustive-deps
  const initialState = useMemo(() => buildReport(colors), [colors])
  const agTheme = useMemo(() => studioTheme.withParams({
    fontFamily: 'Inter, ui-sans-serif, system-ui',
    browserColorScheme: colors.dark ? 'dark' : 'light',
    backgroundColor: colors.card, foregroundColor: colors.fg, textColor: colors.fg, subtleTextColor: colors.muted,
    borderColor: colors.border, accentColor: colors.accent, menuBackgroundColor: colors.card, menuTextColor: colors.fg,
    iconColor: colors.muted, studioWrapperBackgroundColor: colors.page, studioPanelContainerBackgroundColor: colors.card,
    chartTextColor: colors.fg, chartSubtleTextColor: colors.muted, chartAxisLabelColor: colors.muted, chartAxisTitleColor: colors.muted,
    chartGridLineColor: colors.border, chartAxisLineColor: colors.border, chartBorderColor: colors.border,
    chartTooltipBackgroundColor: colors.card, chartTooltipTextColor: colors.fg, chartAccentColor: colors.accent,
  }), [colors])
  const ai = useMemo(
    () => (params) =>
      createAiHarness(params.api, { adapter: geminiAdapter, promptStarters: PROMPTS }),
    [],
  )

  const open = (rows || []).filter((r) => r.status === 'Open')
  const resolved = (rows || []).filter((r) => r.outcome !== 'Pending')
  const won = resolved.filter((r) => r.outcome === 'Won').length

  const timed = (rows || []).filter((r) => r.response_minutes != null)
  return (
    <div className="space-y-6">
      <PageHeader
        icon={BarChart3}
        title="Analytics"
        description={<>Built with AG Studio. Switch to <b className="text-foreground">Edit</b> to drag fields into new charts, or open the <b className="text-foreground">AI assistant</b> panel and ask a question{health && !health.gemini && <> (needs a Gemini key on the backend)</>}.</>}
        actions={<Segmented label="Dashboard mode" value={mode} onChange={setMode} options={[['view', 'View'], ['edit', 'Edit + AI assistant']]} />}
      />

      <InViewStagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Money at risk" icon={CircleDollarSign} value={rows ? rows.reduce((s_, r) => s_ + (r.money_at_risk || 0), 0) : undefined} format={(v) => money(v)} hint="Disputes not resolved yet" />
        <StatCard label="Open disputes" icon={FolderOpen} value={rows ? open.length : undefined} />
        <StatCard label="Win rate (resolved)" icon={Trophy} tone="success" value={resolved.length ? Math.round((won / resolved.length) * 100) : '—'} suffix="%" />
        <StatCard label="Avg time to draft" icon={Timer} value={timed.length ? timed.reduce((s_, r) => s_ + r.response_minutes, 0) / timed.length : '—'} format={(v) => v.toFixed(1)} suffix=" min" />
      </InViewStagger>

      <Card className="overflow-hidden" style={{ height: 900 }}>
        {data ? (
          <AgStudio
            key={theme}
            theme={agTheme}
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
          <div className="flex h-full items-center justify-center gap-2 text-muted-foreground" role="status"><Spinner /> Loading data…</div>
        )}
      </Card>
    </div>
  )
}
