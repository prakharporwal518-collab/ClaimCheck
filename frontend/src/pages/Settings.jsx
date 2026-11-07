import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../components/AppShell'
import { Spinner } from '../components/ui'

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

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card p-5">
        <h1 className="text-lg font-bold">Merchant allowlist</h1>
        <p className="mb-4 text-sm text-slate-500">
          Your own details are never masked, because PayPal needs them as evidence. Everything about the buyer (name, email,
          phone, address, card numbers) is replaced with placeholders before any AI call.
        </p>
        {!m ? <Spinner /> : (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            try { await api.saveMerchant(m); notify('Saved', 'success') } catch (err) { notify(err.message, 'error') } finally { setBusy(false) }
          }}>
            {FIELDS.map(([k, label]) => (
              <label key={k} className="block">
                <span className="label">{label}</span>
                <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={m[k] || ''}
                  onChange={(e) => setM({ ...m, [k]: e.target.value })} />
              </label>
            ))}
            <button className="btn-primary" disabled={busy}>Save</button>
          </form>
        )}
      </section>

      <section className="space-y-5">
        <div className="card p-5">
          <h2 className="text-lg font-bold">System</h2>
          {health && !health.offline && (
            <dl className="mt-3 grid grid-cols-[160px_1fr] gap-y-2 text-sm">
              <dt className="text-slate-500">PayPal</dt>
              <dd>
                {health.paypal_sources?.includes('sandbox') && health.paypal_sources?.includes('mock')
                  ? 'PayPal Sandbox (live API calls) + seeded demo data'
                  : health.paypal_sources?.includes('sandbox') ? 'PayPal Sandbox (live API calls)' : 'Seeded mock in the PayPal API JSON shape'}
                {' · '}<code className="text-xs">{health.paypal_disputes_path}</code>
              </dd>
              <dt className="text-slate-500">AI model</dt>
              <dd>{health.gemini ? health.gemini_model : 'Rules engine (set GEMINI_API_KEY to use Gemini)'}</dd>
              <dt className="text-slate-500">Jobs</dt>
              <dd>{health.render_workflows ? 'Render Workflows (parallel extraction + retries)' : 'In-process fallback'}</dd>
              <dt className="text-slate-500">OCR</dt>
              <dd>{health.ocr ? 'Tesseract installed (OCR-first)' : 'Tesseract not installed'}</dd>
              <dt className="text-slate-500">Database</dt>
              <dd>{health.database}</dd>
              <dt className="text-slate-500">Playbooks</dt>
              <dd>{health.playbooks.map((p) => `${p.label} (${p.status})`).join(', ')}</dd>
            </dl>
          )}
        </div>
        {health?.paypal_sources?.includes('mock') && (
          <div className="card p-5">
            <h2 className="text-lg font-bold">Demo data</h2>
            <p className="mt-1 text-sm text-slate-500">Reset every demo dispute, file and analysis back to the seeded state.{health?.paypal_sources?.includes('sandbox') && ' PayPal Sandbox disputes are kept.'}</p>
            <button className="btn-ghost mt-3" disabled={busy} onClick={async () => {
              if (!confirm('Reset all demo data?')) return
              setBusy(true)
              try { await api.reset(); notify('Demo data reset', 'success') } finally { setBusy(false) }
            }}>Reset demo</button>
          </div>
        )}
      </section>
    </div>
  )
}
