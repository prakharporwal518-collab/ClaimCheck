export const money = (v, cur = 'USD') =>
  v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(v)

export const daysLabel = (d) => {
  if (d == null) return '—'
  if (d < 0) return 'Overdue'
  if (d < 1) return `${Math.round(d * 24)} h`
  return `${Math.floor(d)} d`
}

export const statusText = (s) =>
  ({
    WAITING_FOR_SELLER_RESPONSE: 'Needs response',
    UNDER_REVIEW: 'Under review',
    RESOLVED: 'Resolved',
    OPEN: 'Open',
  })[s] || s

export const fileSize = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

export const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'
