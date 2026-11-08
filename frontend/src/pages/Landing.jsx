import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  ArrowRight, BadgeCheck, Bot, CalendarClock, CheckCircle2, Cloud, Code2, FileSearch, FileText, Gauge, Inbox,
  LayoutGrid, Lock, Scale, Send, Sparkles, Timer, Upload,
} from 'lucide-react'
import { Navbar } from '@/components/blocks/navbar'
import { Hero } from '@/components/blocks/hero'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatusFlag } from '@/components/ui'
import { AnimatedNumber } from '@/components/motion-primitives/animated-number'
import { InView, InViewItem, InViewStagger } from '@/components/motion-primitives/in-view'

const FLOW = [
  [Inbox, 'Buyer opens a dispute', 'An Item Not Received case lands in PayPal.'],
  [Bot, 'ClaimCheck fetches it', 'Disputes API sync, or instantly via the CUSTOMER.DISPUTE.CREATED webhook.'],
  [Upload, 'You drop in evidence', 'Tracking PDFs, invoices, chat screenshots, delivery photos.'],
  [FileSearch, 'AI checks every claim', 'Each statement: contradicted, supported or unverified, with cited evidence.'],
  [FileText, 'You edit the report', 'Transparent score, evidence gaps, honest advice. You stay in control.'],
  [Send, 'Response sent to PayPal', 'provide-evidence, or accept-claim when the buyer is right.'],
]

const SPONSORS = [
  [BadgeCheck, 'PayPal Disputes API', 'Lists and reads disputes, submits evidence with provide-evidence, refunds with accept-claim, and reacts to dispute webhooks. Sandbox and a seeded mock share one adapter.'],
  [Sparkles, 'Google Gemini', 'Strict-JSON calls for fact extraction, claim breakdown, cross-check and report. OCR first; vision only when needed. Retries, fallback model, cache.'],
  [LayoutGrid, 'AG Grid + AG Studio', 'Dispute inbox, claim-vs-evidence master-detail grid, editable evidence grid, and an AG Studio analytics dashboard with an AI assistant.'],
  [Cloud, 'Render', 'Docker web service from one Blueprint, with a Render Workflows task and a safety net that never lets an analysis get stuck.'],
  [Code2, 'APIMatic ContextMatic', 'Reviewed our PayPal client against PayPal\'s Disputes and Webhooks specs in Cursor. It found webhook-verification and upload gaps, which we fixed and tested.'],
]

const ROADMAP = [
  ['Kernel', 'a cloud browser that checks the carrier’s live tracking page, so forged PDFs are caught.'],
  ['Channel3', 'product data to check “Not as Described” claims against real specs.'],
  ['Elastic', 'search past disputes – “show similar cases and how they ended”.'],
  ['Astropods', 'run the dispute agent as a long-lived hosted agent.'],
  ['Bryntum', 'a richer drag-and-drop deadline scheduler.'],
  ['More reasons', 'playbooks are JSON config; “Not as Described” is stubbed already.'],
]

function PreviewCard() {
  const rows = [
    ['I never received the headphones', 'Delivered 3 Nov, signed by R. Sharma · buyer wrote “Got it, thanks!” on 4 Nov'],
    ['Nothing came to my house', 'Delivered to the PayPal shipping address · delivery photo'],
    ['The seller ignored my messages', 'Chat log: seller replied on 2 Nov and 4 Nov'],
  ]
  return (
    <div className="relative">
      <div aria-hidden="true" className="absolute -inset-4 -z-10 rounded-[28px] bg-gradient-to-br from-[var(--grad-a)]/25 via-transparent to-[var(--grad-c)]/20 blur-2xl" />
      <div className="overflow-hidden rounded-2xl border bg-card shadow-pop">
        <div className="flex items-center justify-between gap-3 border-b bg-muted/50 px-4 py-3">
          <span className="font-mono text-xs text-muted-foreground">PP-D-48213 · $249.00 · Item Not Received</span>
          <Badge tone="success">High 9/10</Badge>
        </div>
        <ul className="divide-y">
          {rows.map(([claim, ev], i) => (
            <motion.li key={claim} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 + i * 0.25 }}
              className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-3.5">
              <div className="text-sm font-semibold">“{claim}”</div>
              <StatusFlag status="contradicted" />
              <div className="col-span-2 text-xs text-muted-foreground">↳ {ev}</div>
            </motion.li>
          ))}
        </ul>
        <div className="flex items-center gap-2 border-t bg-success-bg px-4 py-3 text-xs font-semibold text-success-fg">
          <Gauge className="size-4" aria-hidden="true" />
          High (Score: 9/10) – 3 claims contradicted by strong and weak evidence, 0 critical gaps
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ eyebrow, title, description }) {
  return (
    <InView className="max-w-2xl">
      {eyebrow && <div className="eyebrow text-primary-text">{eyebrow}</div>}
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {description && <p className="mt-3 text-muted-foreground text-pretty">{description}</p>}
    </InView>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar
        links={[
          { to: '#how', href: '#how', label: 'How it works' },
          { to: '#built', href: '#built', label: 'Built with' },
        ]}
        cta={<Button as={Link} to="/app">Open the demo <ArrowRight /></Button>}
        maxWidth="max-w-6xl"
      />

      <main>
        <Hero
          eyebrow={<Badge tone="info" className="px-3 py-1"><Sparkles /> PayPal AI Hackathon 2026</Badge>}
          title="See exactly where a dispute claim"
          highlight="breaks."
          description="ClaimCheck is an AI agent for small PayPal merchants. It splits the buyer’s claim into separate statements, checks each one against your evidence, flags the contradictions and the gaps, and drafts a defence you approve before it is sent."
          actions={
            <>
              <Button as={Link} to="/app/disputes/PP-D-48213" size="lg">Try the strong-evidence case <ArrowRight /></Button>
              <Button as={Link} to="/app/disputes/PP-D-48402" size="lg" variant="outline">See the honesty case</Button>
            </>
          }
          note="No sign-up. Runs on seeded PayPal-shaped data, or your PayPal Sandbox."
          visual={<PreviewCard />}
        />

        {/* Stats */}
        <section aria-label="Key numbers" className="border-y bg-card/60">
          <InViewStagger className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-4">
            {[
              [Timer, <>~<AnimatedNumber value={1} />&thinsp;min</>, 'to a drafted defence', 'measured 50–80 s with Gemini, vs ~20 min by hand'],
              [FileSearch, <AnimatedNumber value={6} />, 'checks per dispute', 'evidence checklist items for Item Not Received'],
              [Lock, <AnimatedNumber value={0} />, 'buyer PII in AI prompts', 'masked before any AI call; covered by a test'],
              [Scale, <><AnimatedNumber value={10} />-point</>, 'explainable score', 'computed in code, never guessed'],
            ].map(([Icon, num, label, hint]) => (
              <InViewItem key={label}>
                <Icon className="size-5 text-primary-text" aria-hidden="true" />
                <div className="mt-3 text-3xl font-bold tracking-tight">{num}</div>
                <div className="mt-1 text-sm font-semibold">{label}</div>
                <div className="text-xs text-muted-foreground">{hint}</div>
              </InViewItem>
            ))}
          </InViewStagger>
        </section>

        {/* Problem */}
        <section className="relative isolate overflow-hidden bg-[#0b1430] text-white">
          <div aria-hidden="true" className="bg-waves absolute inset-x-0 bottom-0 h-40 opacity-40" style={{ backgroundColor: 'rgba(120,150,255,.25)' }} />
          <InViewStagger className="relative mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-3">
            {[
              [CalendarClock, 'Short window', 'Merchants have days, not weeks, to respond to a PayPal dispute. Miss it and you lose by default.'],
              [FileSearch, 'Wrong evidence', 'Most small sellers don’t know which proof matters for “Item Not Received”, so they send weak replies.'],
              [Scale, 'Money lost', 'Disputes they should win end in refunds, fees and hits to seller reputation.'],
            ].map(([Icon, t, d]) => (
              <InViewItem key={t}>
                <Icon className="size-6 text-[#9db4ff]" aria-hidden="true" />
                <div className="mt-3 text-xl font-bold">{t}</div>
                <p className="mt-2 text-[#c9d3ea]">{d}</p>
              </InViewItem>
            ))}
          </InViewStagger>
        </section>

        {/* How it works */}
        <section id="how" className="relative isolate scroll-mt-20">
          <div aria-hidden="true" className="bg-pattern-dots fade-edges absolute inset-0 -z-10" />
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <SectionTitle eyebrow="How it works" title="The merchant stays in control; the AI only drafts." />
            <InViewStagger as="ol" className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FLOW.map(([Icon, t, d], i) => (
                <InViewItem as="li" key={t}
                  className={`group relative rounded-xl border bg-card p-5 shadow-card transition-shadow hover:shadow-pop ${i === 5 ? 'ring-2 ring-primary' : ''}`}>
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden="true" /></span>
                    <span className="font-mono text-xs font-semibold text-primary-text">STEP {i + 1}</span>
                  </div>
                  <div className="mt-3 font-semibold">{t}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{d}</p>
                </InViewItem>
              ))}
            </InViewStagger>

            <InViewStagger className="mt-16 grid gap-5 lg:grid-cols-3">
              {[
                ['Claim by claim, not a template', 'Other tools collect evidence and fill templates. ClaimCheck shows each statement in the buyer’s message next to the evidence that contradicts or supports it. Every contradiction must cite an evidence ID, or it is downgraded.'],
                ['A score you can explain', 'Computed in code, never guessed: start at 4, +2 per claim contradicted by strong evidence, +1 weak, −2 per missing critical item, −3 per claim the buyer is right about. High 7–10, Medium 4–6, Low 0–3.'],
                ['Honest, and private', 'If the parcel was returned to sender, ClaimCheck says so and recommends a refund. Buyer names, emails, phones, addresses and card numbers are masked before any AI call.'],
              ].map(([t, d]) => (
                <InViewItem key={t} className="rounded-xl border bg-card p-6 shadow-card">
                  <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
                  <div className="mt-3 font-semibold">{t}</div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d}</p>
                </InViewItem>
              ))}
            </InViewStagger>
          </div>
        </section>

        {/* Built with */}
        <section id="built" className="relative isolate scroll-mt-20 border-t bg-muted/40">
          <div aria-hidden="true" className="bg-pattern-grid fade-edges absolute inset-0 -z-10 opacity-60" />
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <SectionTitle eyebrow="Built with" title="Sponsor tools, used where they matter." />
            <InViewStagger className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {SPONSORS.map(([Icon, t, d]) => (
                <InViewItem key={t} className="rounded-xl border bg-card p-5 shadow-card">
                  <div className="flex items-center gap-2.5 font-semibold">
                    <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden="true" /></span>
                    {t}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{d}</p>
                </InViewItem>
              ))}
            </InViewStagger>

            <div className="mt-16 grid gap-10 lg:grid-cols-2">
              <InView>
                <h3 className="text-lg font-bold">On the roadmap</h3>
                <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                  {ROADMAP.map(([t, d]) => (
                    <li key={t} className="flex gap-2"><ArrowRight className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden="true" /><span><b className="text-foreground">{t}</b>: {d}</span></li>
                  ))}
                </ul>
              </InView>
              <InView delay={0.1}>
                <h3 className="text-lg font-bold">Known limits, said plainly</h3>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  ClaimCheck checks consistency, not authenticity. Evidence strength is a heuristic, not a promise: PayPal decides. The MVP
                  covers Item Not Received only, and runs on PayPal Sandbox or seeded data, not real money. It is not legal advice.
                </p>
                <Button as={Link} to="/app" size="lg" className="mt-6">Open the demo <ArrowRight /></Button>
              </InView>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        ClaimCheck · Built for the PayPal AI Hackathon 2026 · Demo merchant, buyers and carrier are fictional.
      </footer>
    </div>
  )
}
