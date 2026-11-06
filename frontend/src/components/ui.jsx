export function Logo({ className = 'h-7 w-7' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M16 2 4 7v8c0 7.2 5 13.4 12 15 7-1.6 12-7.8 12-15V7z" fill="#1d4ed8" />
      <path d="m10.5 16 4 4 7-8" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const PILL = {
  High: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  Medium: 'bg-amber-100 text-amber-800 ring-amber-200',
  Low: 'bg-rose-100 text-rose-800 ring-rose-200',
}

export function ScorePill({ label, score }) {
  if (!label) return <span className="text-xs text-slate-400">Not analysed</span>
  return (
    <span className={`chip ring-1 ${PILL[label]}`}>
      {label}
      {score != null && <span className="font-mono">{score}/10</span>}
    </span>
  )
}

const FLAG = {
  contradicted: { dot: 'bg-contra', text: 'Contradicted', cls: 'text-rose-700 bg-rose-50 ring-rose-200' },
  supported: { dot: 'bg-support', text: 'Supported', cls: 'text-emerald-700 bg-emerald-50 ring-emerald-200' },
  unverified: { dot: 'border-2 border-slate-400 bg-white', text: 'Unverified', cls: 'text-slate-600 bg-slate-50 ring-slate-200' },
}

export function StatusFlag({ status, pop = false }) {
  const f = FLAG[status] || FLAG.unverified
  return (
    <span className={`chip ring-1 ${f.cls} ${pop && status === 'contradicted' ? 'flag-pop' : ''}`}>
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${f.dot}`} />
      {f.text}
    </span>
  )
}

export function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

export function Toast({ toast, onClose }) {
  if (!toast) return null
  const cls = toast.kind === 'error' ? 'bg-rose-600' : toast.kind === 'success' ? 'bg-emerald-600' : 'bg-slate-900'
  return (
    <div className={`fixed bottom-5 right-5 z-50 max-w-md rounded-lg px-4 py-3 text-sm text-white shadow-lg ${cls}`} role="status">
      <div className="flex items-start gap-3">
        <span className="flex-1">{toast.text}</span>
        <button onClick={onClose} className="opacity-70 hover:opacity-100" aria-label="Close">✕</button>
      </div>
    </div>
  )
}
