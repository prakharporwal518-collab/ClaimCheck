const BASE = import.meta.env.VITE_API_BASE || ''

async function request(path, options = {}) {
  const res = await fetch(BASE + path, options)
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = await res.json()
      msg = body.detail || JSON.stringify(body)
    } catch { /* not JSON */ }
    throw new Error(msg)
  }
  const type = res.headers.get('content-type') || ''
  return type.includes('application/json') ? res.json() : res
}

// Real PayPal Sandbox actions can be locked with a key (SANDBOX_ACTIONS_KEY on the server).
const withKey = (opts, key) => (key ? { ...opts, headers: { ...opts.headers, 'X-Sandbox-Key': key } } : opts)

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

export const api = {
  base: BASE,
  health: () => request('/api/health'),
  disputes: () => request('/api/disputes'),
  sync: () => request('/api/disputes/sync', { method: 'POST' }),
  dispute: (id) => request(`/api/disputes/${id}`),
  upload: (id, files, tags) => {
    const fd = new FormData()
    files.forEach((f, i) => { fd.append('files', f); fd.append('tags', tags[i] || 'Other') })
    return request(`/api/disputes/${id}/evidence`, { method: 'POST', body: fd })
  },
  loadSample: (id) => request(`/api/disputes/${id}/evidence/sample`, { method: 'POST' }),
  orderCsv: (id, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return request(`/api/disputes/${id}/order-csv`, { method: 'POST', body: fd })
  },
  patchEvidence: (eid, body) => request(`/api/evidence/${eid}`, json('PATCH', body)),
  deleteEvidence: (eid) => request(`/api/evidence/${eid}`, { method: 'DELETE' }),
  fileUrl: (eid) => `${BASE}/api/evidence/${eid}/file`,
  analyse: (id) => request(`/api/disputes/${id}/analyse`, { method: 'POST' }),
  saveReport: (id, text) => request(`/api/disputes/${id}/report`, json('PUT', { text })),
  submit: (id, text, key) => request(`/api/disputes/${id}/submit`, withKey(json('POST', { approved: true, text }), key)),
  acceptClaim: (id, note, key) => request(`/api/disputes/${id}/accept-claim`, withKey(json('POST', { note }), key)),
  pdfUrl: (id) => `${BASE}/api/disputes/${id}/report.pdf`,
  simulate: () => request('/api/demo/simulate-dispute', { method: 'POST' }),
  reset: () => request('/api/demo/reset', { method: 'POST' }),
  analytics: () => request('/api/analytics'),
  merchant: () => request('/api/settings/merchant'),
  saveMerchant: (body) => request('/api/settings/merchant', json('PUT', body)),
  studioTurn: (body, signal) => request('/api/ai/studio-turn', { ...json('POST', body), signal }),
}
