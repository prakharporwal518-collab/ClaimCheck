import { Link } from 'react-router-dom'
import { Logo, StatusFlag } from '../components/ui'

const FLOW = [
  ['Buyer opens a dispute', 'An Item Not Received case lands in PayPal.'],
  ['ClaimCheck fetches it', 'Disputes API sync, or instantly via the CUSTOMER.DISPUTE.CREATED webhook.'],
  ['You drop in evidence', 'Tracking PDFs, invoices, chat screenshots, delivery photos.'],
  ['AI checks every claim', 'Each statement: contradicted, supported or unverified, with cited evidence.'],
  ['You edit the report', 'Transparent score, evidence gaps, honest advice. You stay in control.'],
  ['Response sent to PayPal', 'provide-evidence, or accept-claim when the buyer is right.'],
]

const SPONSORS = [
  ['PayPal Disputes API', 'Lists and reads disputes, submits evidence with provide-evidence, refunds with accept-claim, and reacts to dispute webhooks. Sandbox and a seeded mock share one adapter.'],
  ['Google Gemini', 'Strict-JSON calls for fact extraction, claim breakdown, cross-check and report. OCR first; vision only when needed. Retries, fallback model, cache.'],
  ['AG Grid + AG Studio', 'Dispute inbox, claim-vs-evidence master-detail grid, editable evidence grid, and an AG Studio analytics dashboard with an AI assistant.'],
  ['Render + Render Workflows', 'Docker web service + Postgres from one Blueprint. Analysis runs as a Workflow: parallel file extraction, automatic retries with backoff.'],
  ['APIMatic ContextMatic', 'Gives the coding agent exact PayPal API methods and types while writing the PayPal client and Sandbox seed script.'],
]

function PreviewCard() {
  return (
    <div className="card overflow-hidden text-left shadow-xl ring-1 ring-slate-900/5">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <span className="font-mono text-xs text-slate-500">PP-D-48213 · $249.00 · Item Not Received</span>
        <span className="chip bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200">High 9/10</span>
      </div>
      <div className="divide-y divide-slate-100">
        {[
          ['I never received the headphones', 'contradicted', 'Delivered 3 Nov, signed by R. Sharma · buyer wrote “Got it, thanks!” on 4 Nov'],
          ['Nothing came to my house', 'contradicted', 'Delivered to the PayPal shipping address · delivery photo'],
          ['The seller ignored my messages', 'contradicted', 'Chat log: seller replied on 2 Nov and 4 Nov'],
        ].map(([claim, st, ev]) => (
          <div key={claim} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-3">
            <div className="text-sm font-semibold text-slate-800">“{claim}”</div>
            <StatusFlag status={st} />
            <div className="col-span-2 text-xs text-slate-500">↳ {ev}</div>
          </div>
        ))}
      </div>
      <div className="bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-900">
        High (Score: 9/10) – 3 claims contradicted by strong and weak evidence, 0 critical gaps
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="min-h-full bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-brand-900"><Logo /> ClaimCheck</div>
        <nav className="flex items-center gap-2 text-sm">
          <a href="#how" className="hidden px-3 py-2 text-slate-600 hover:text-slate-900 sm:inline">How it works</a>
          <a href="#built" className="hidden px-3 py-2 text-slate-600 hover:text-slate-900 sm:inline">Built with</a>
          <Link to="/app" className="btn-primary">Open the demo →</Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-2">
        <div>
          <span className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-200">PayPal AI Hackathon 2026</span>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
            See exactly where a dispute claim <span className="text-contra">breaks</span>.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            ClaimCheck is an AI agent for small PayPal merchants. It splits the buyer’s claim into separate statements, checks each one
            against your evidence, flags the contradictions and the gaps, and drafts a defence you approve before it is sent.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/app/disputes/PP-D-48213" className="btn-primary px-5 py-3 text-base">Try the strong-evidence case</Link>
            <Link to="/app/disputes/PP-D-48402" className="btn-ghost px-5 py-3 text-base">See the honesty case</Link>
          </div>
          <p className="mt-4 text-sm text-slate-500">No sign-up. Runs on seeded PayPal-shaped data, or your PayPal Sandbox.</p>
        </div>
        <PreviewCard />
      </section>

      {/* Problem */}
      <section className="bg-brand-900 py-16 text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-3">
          {[
            ['Short window', 'Merchants have days, not weeks, to respond to a PayPal dispute. Miss it and you lose by default.'],
            ['Wrong evidence', 'Most small sellers don’t know which proof matters for “Item Not Received”, so they send weak replies.'],
            ['Money lost', 'Disputes they should win end in refunds, fees and hits to seller reputation.'],
          ].map(([t, d]) => (
            <div key={t}>
              <div className="text-xl font-bold">{t}</div>
              <p className="mt-2 text-slate-300">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
        <p className="mt-2 text-slate-600">The merchant stays in control; the AI only drafts.</p>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FLOW.map(([t, d], i) => (
            <li key={t} className={`card p-5 ${i === 5 ? 'ring-2 ring-brand-500' : ''}`}>
              <div className="font-mono text-xs font-semibold text-brand-600">STEP {i + 1}</div>
              <div className="mt-1 font-bold">{t}</div>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </li>
          ))}
        </ol>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          <div className="card p-6">
            <div className="text-sm font-bold text-brand-700">Claim by claim, not a template</div>
            <p className="mt-2 text-sm text-slate-600">
              Other tools collect evidence and fill templates. ClaimCheck shows each statement in the buyer’s message next to the
              evidence that contradicts or supports it. Every contradiction must cite an evidence ID, or it is downgraded.
            </p>
          </div>
          <div className="card p-6">
            <div className="text-sm font-bold text-brand-700">A score you can explain</div>
            <p className="mt-2 text-sm text-slate-600">
              Computed in code, never guessed: start at 4, <b>+2</b> per claim contradicted by strong evidence, <b>+1</b> weak,
              <b> −2</b> per missing critical item, <b>−3</b> per claim the buyer is right about. High 7–10, Medium 4–6, Low 0–3.
            </p>
          </div>
          <div className="card p-6">
            <div className="text-sm font-bold text-brand-700">Honest, and private</div>
            <p className="mt-2 text-sm text-slate-600">
              If the parcel was returned to sender, ClaimCheck says so and recommends a refund. Buyer names, emails, phones,
              addresses and card numbers are masked before any AI call.
            </p>
          </div>
        </div>
      </section>

      {/* Built with */}
      <section id="built" className="border-t border-slate-200 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">Built with</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {SPONSORS.map(([t, d]) => (
              <div key={t} className="card p-5">
                <div className="font-bold">{t}</div>
                <p className="mt-1 text-sm text-slate-600">{d}</p>
              </div>
            ))}
          </div>
          <h3 className="mt-14 text-lg font-bold">On the roadmap</h3>
          <ul className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
            <li><b>Kernel</b>: a cloud browser that checks the carrier’s live tracking page, so forged PDFs are caught.</li>
            <li><b>Channel3</b>: product data to check “Not as Described” claims against real specs.</li>
            <li><b>Elastic</b>: search past disputes – “show similar cases and how they ended”.</li>
            <li><b>Astropods</b>: run the dispute agent as a long-lived hosted agent.</li>
            <li><b>Bryntum</b>: a richer drag-and-drop deadline scheduler.</li>
            <li><b>More reasons</b>: playbooks are JSON config; “Not as Described” is stubbed already.</li>
          </ul>
          <h3 className="mt-14 text-lg font-bold">Known limits, said plainly</h3>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            ClaimCheck checks consistency, not authenticity. Evidence strength is a heuristic, not a promise: PayPal decides. The MVP
            covers Item Not Received only, and runs on PayPal Sandbox or seeded data, not real money. It is not legal advice.
          </p>
          <div className="mt-10">
            <Link to="/app" className="btn-primary px-5 py-3 text-base">Open the demo →</Link>
          </div>
        </div>
      </section>
      <footer className="py-8 text-center text-xs text-slate-500">ClaimCheck · Built for the PayPal AI Hackathon 2026 · Demo merchant, buyers and carrier are fictional.</footer>
    </div>
  )
}
