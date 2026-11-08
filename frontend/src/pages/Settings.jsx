import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../components/AppShell'
import { Spinner } from '../components/ui'
import { Bot, Building2, Cpu, Database, Monitor, Moon, RotateCcw, ScanText, Settings as SettingsIcon, ShieldCheck, Sun, Workflow, BookOpen, Save, Landmark } from 'lucide-react'
import { PageHeader } from '@/components/blocks/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { InView } from '@/components/motion-primitives/in-view'
import { useTheme } from '@/lib/theme'

const FIELDS = [
  ['business_name', 'Business name'],
  ['business_address', 'Business address'],
  ['support_email', 'Support email'],
  ['website', 'Website'],
  ['support_name', 'Name used in chats'],
]

export default function Settings() {
  const { health, notify } = useApp()
  const [m, setM] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.merchant().then(setM) }, [])

  const { theme, setTheme } = useTheme()
  const rows = health && !health.offline ? [
    [Landmark, 'PayPal', <>
      {health.paypal_sources?.includes('sandbox') && health.paypal_sources?.includes('mock')
        ? 'PayPal Sandbox (live API calls) + seeded demo data'
        : health.paypal_sources?.includes('sandbox') ? 'PayPal Sandbox (live API calls)' : 'Seeded mock in the PayPal API JSON shape'}
      {' · '}<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{health.paypal_disputes_path}</code></>],
    [Bot, 'AI model', health.gemini ? health.gemini_model : 'Rules engine (set GEMINI_API_KEY to use Gemini)'],
    [Workflow, 'Jobs', health.render_workflows ? 'Render Workflows (parallel extraction + retries)' : 'In-process fallback'],
    [ScanText, 'OCR', health.ocr ? 'Tesseract installed (OCR-first)' : 'Tesseract not installed'],
    [Database, 'Database', health.database],
    [BookOpen, 'Playbooks', health.playbooks.map((p) => `${p.label} (${p.status})`).join(', ')],
  ] : []

  return (
    <div className="space-y-6">
      <PageHeader icon={SettingsIcon} title="Settings" description="Your business details, appearance and the services this ClaimCheck is connected to." />
      <div className="grid gap-5 lg:grid-cols-2">
        <InView>
          <Card>
            <CardHeader><CardTitle as="h2"><Building2 />Merchant allowlist</CardTitle></CardHeader>
            <CardContent>
              <p className="mb-5 flex gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                Your own details are never masked, because PayPal needs them as evidence. Everything about the buyer (name, email,
                phone, address, card numbers) is replaced with placeholders before any AI call.
              </p>
              {!m ? <Spinner /> : (
                <form className="space-y-4" onSubmit={async (e) => {
                  e.preventDefault()
                  setBusy(true)
                  try { await api.saveMerchant(m); notify('Saved', 'success') } catch (err) { notify(err.message, 'error') } finally { setBusy(false) }
                }}>
                  {FIELDS.map(([k, label]) => (
                    <div key={k} className="space-y-1.5">
                      <Label htmlFor={`f-${k}`}>{label}</Label>
                      <Input id={`f-${k}`} value={m[k] || ''} onChange={(e) => setM({ ...m, [k]: e.target.value })} />
                    </div>
                  ))}
                  <Button type="submit" disabled={busy}>{busy ? <Spinner /> : <Save />} Save</Button>
                </form>
              )}
            </CardContent>
          </Card>
        </InView>

        <div className="space-y-5">
          <InView delay={0.05}>
            <Card>
              <CardHeader><CardTitle as="h2"><Monitor />Appearance</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Light or dark. ClaimCheck follows your system until you choose.</p>
                <Segmented label="Theme" value={theme} onChange={setTheme}
                  options={[['light', <span key="l" className="flex items-center gap-1.5"><Sun className="size-3.5" />Light</span>],
                    ['dark', <span key="d" className="flex items-center gap-1.5"><Moon className="size-3.5" />Dark</span>]]} />
              </CardContent>
            </Card>
          </InView>
          <InView delay={0.1}>
            <Card>
              <CardHeader><CardTitle as="h2"><Cpu />System</CardTitle></CardHeader>
              <CardContent>
                {!health ? <Spinner /> : (
                  <dl className="divide-y">
                    {rows.map(([Icon, k, v]) => (
                      <div key={k} className="grid grid-cols-[130px_1fr] gap-3 py-2.5 text-sm sm:grid-cols-[150px_1fr]">
                        <dt className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4" aria-hidden="true" />{k}</dt>
                        <dd className="min-w-0 break-words">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </CardContent>
            </Card>
          </InView>
          {health?.paypal_sources?.includes('mock') && (
            <InView delay={0.15}>
              <Card>
                <CardHeader><CardTitle as="h2"><RotateCcw />Demo data</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Reset every demo dispute, file and analysis back to the seeded state.{health?.paypal_sources?.includes('sandbox') && ' PayPal Sandbox disputes are kept.'}</p>
                  <Button variant="outline" className="mt-4" disabled={busy} onClick={async () => {
                    if (!confirm('Reset all demo data?')) return
                    setBusy(true)
                    try { await api.reset(); notify('Demo data reset', 'success') } finally { setBusy(false) }
                  }}><RotateCcw /> Reset demo</Button>
                </CardContent>
              </Card>
            </InView>
          )}
        </div>
      </div>
    </div>
  )
}
