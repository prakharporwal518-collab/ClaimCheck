import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../components/AppShell'
import { Spinner } from '../components/ui'
import { Bot, Building2, Check, Cpu, Lock, Database, Monitor, Moon, RotateCcw, ScanText, Settings as SettingsIcon, ShieldCheck, Sun, Workflow, BookOpen, Save, Landmark } from 'lucide-react'
import { PageHeader } from '@/components/blocks/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Appear, InView } from '@/components/motion-primitives/in-view'
import { gsap, useGSAP, useMotionGSAP } from '@/lib/gsap'
import { useTheme } from '@/lib/theme'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const FIELDS = [
  ['business_name', 'Business name'],
  ['business_address', 'Business address'],
  ['support_email', 'Support email'],
  ['website', 'Website'],
  ['support_name', 'Name used in chats'],
]

function LockedNote() {
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
      <Lock className="size-3.5 shrink-0" aria-hidden="true" />
      Locked on the public demo: this asks for the owner's action key.
    </p>
  )
}

export default function Settings() {
  const { health, notify } = useApp()
  // On the public demo, Save and Reset demo need the owner's action key (SANDBOX_ACTIONS_KEY).
  // It's asked for once and remembered for this visit; a rejected key is forgotten.
  const locked = !!health?.sandbox_actions_locked
  const actionKey = useRef('')
  const askKey = () => {
    if (!locked) return ''
    if (actionKey.current) return actionKey.current
    return prompt('This action is locked on the public demo. Enter the action key:')
  }
  const rememberKey = (key, err) => { actionKey.current = err?.status === 403 ? '' : key }
  const [m, setM] = useState(null)
  const [busy, setBusy] = useState('') // '' | 'save' | 'reset'
  const [saved, setSaved] = useState(false) // shows "Saved" on the button for a moment
  useEffect(() => { api.merchant().then(setM) }, [])

  // Save feedback: the tick pops and the button pulses after a save; the form shakes if it fails.
  const page = useRef(null)
  const form = useRef(null)
  const saveBtn = useRef(null)
  const savedTimer = useRef(null)
  useEffect(() => () => clearTimeout(savedTimer.current), [])
  const { contextSafe } = useGSAP({ scope: page })
  const shake = contextSafe(() => {
    if (reducedMotion() || !form.current) return
    gsap.fromTo(form.current, { x: 0 }, { keyframes: { x: [-8, 8, -6, 6, -3, 0] }, duration: 0.45, ease: 'power1.inOut', clearProps: 'transform' })
  })
  useMotionGSAP(() => {
    if (!saved) return
    gsap.fromTo('[data-saved-icon]', { scale: 0, rotation: -45 }, { scale: 1, rotation: 0, duration: 0.45, ease: 'back.out(3)' })
    gsap.to(saveBtn.current, { keyframes: { scale: [1, 1.06, 1] }, duration: 0.35, ease: 'power2.out', clearProps: 'transform' })
  }, { scope: saveBtn, dependencies: [saved] })

  // Reset demo: the arrow spins (backwards, like "undo") while the reset runs.
  const resetIcon = useRef(null)
  useMotionGSAP(() => {
    if (busy !== 'reset') return
    gsap.to(resetIcon.current, { rotation: '-=360', duration: 0.8, ease: 'none', repeat: -1 })
  }, { scope: resetIcon, dependencies: [busy] })

  const { theme, setTheme } = useTheme()
  const rows = health && !health.offline ? [
    [Landmark, 'PayPal', <>
      {health.paypal_sources?.includes('sandbox') && health.paypal_sources?.includes('mock')
        ? 'PayPal Sandbox (live API calls) + seeded demo data'
        : health.paypal_sources?.includes('sandbox') ? 'PayPal Sandbox (live API calls)' : 'Seeded mock in the PayPal API JSON shape'}
      {' · '}<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{health.paypal_disputes_path}</code></>],
    [Bot, 'AI model', health.gemini ? health.gemini_model : 'Rules engine (set GEMINI_API_KEY to use Gemini)'],
    [Workflow, 'Jobs', health.render_workflows ? 'Render Workflows (parallel extraction + retries)' : <>
      In-process (Render Workflows supported, not enabled)
      <span className="mt-0.5 block text-xs text-muted-foreground">
        Analyses run the same pipeline inside the web service. Setting RENDER_API_KEY moves them to Render Workflows.
      </span></>],
    [ScanText, 'OCR', health.ocr ? 'Tesseract installed (OCR-first)' : 'Tesseract not installed'],
    [Database, 'Database', health.database],
    [BookOpen, 'Playbooks', health.playbooks.map((p) => `${p.label} (${p.status})`).join(', ')],
  ] : []

  return (
    <div ref={page} className="space-y-6">
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
                <div ref={form}>
                {/* Fields drop in one after another once your details have loaded. */}
                <Appear as="form" className="space-y-4" stagger={0.05} from={{ autoAlpha: 0, y: 8 }} onSubmit={async (e) => {
                  e.preventDefault()
                  const key = askKey()
                  if (key === null) return
                  setBusy('save')
                  try {
                    await api.saveMerchant(m, key)
                    rememberKey(key)
                    notify('Saved', 'success')
                    setSaved(true)
                    clearTimeout(savedTimer.current)
                    savedTimer.current = setTimeout(() => setSaved(false), 2000)
                  } catch (err) {
                    rememberKey(key, err)
                    notify(err.message, 'error')
                    shake()
                  } finally { setBusy('') }
                }}>
                  {FIELDS.map(([k, label]) => (
                    <div key={k} className="space-y-1.5">
                      <Label htmlFor={`f-${k}`}>{label}</Label>
                      <Input id={`f-${k}`} value={m[k] || ''} onChange={(e) => { setM({ ...m, [k]: e.target.value }); setSaved(false) }} />
                    </div>
                  ))}
                  <div>
                    <Button ref={saveBtn} type="submit" disabled={!!busy}>
                      {busy === 'save' ? <Spinner /> : saved ? <Check data-saved-icon="" /> : <Save />} {saved ? 'Saved' : 'Save'}
                    </Button>
                    {locked && <LockedNote />}
                  </div>
                </Appear>
                </div>
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
                  // System rows slide in one by one once the status has loaded.
                  <Appear as="dl" className="divide-y" stagger={0.05} from={{ autoAlpha: 0, x: -10 }}>
                    {rows.map(([Icon, k, v]) => (
                      <div key={k} className="grid grid-cols-[130px_1fr] gap-3 py-2.5 text-sm sm:grid-cols-[150px_1fr]">
                        <dt className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4" aria-hidden="true" />{k}</dt>
                        <dd className="min-w-0 break-words">{v}</dd>
                      </div>
                    ))}
                  </Appear>
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
                  <Button variant="outline" className="mt-4" disabled={!!busy} onClick={async () => {
                    if (!confirm('Reset all demo data?')) return
                    const key = askKey()
                    if (key === null) return
                    setBusy('reset')
                    try { await api.reset(key); rememberKey(key); notify('Demo data reset', 'success') }
                    catch (err) { rememberKey(key, err); notify(err.message, 'error') }
                    finally { setBusy('') }
                  }}><span ref={resetIcon} className="inline-flex"><RotateCcw /></span> {busy === 'reset' ? 'Resetting…' : 'Reset demo'}</Button>
                  {locked && <LockedNote />}
                </CardContent>
              </Card>
            </InView>
          )}
        </div>
      </div>
    </div>
  )
}
