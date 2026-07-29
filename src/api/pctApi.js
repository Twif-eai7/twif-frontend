const BASE = import.meta.env.VITE_BACKEND_URL

async function pctFetch(path, token, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...opts.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err = new Error(body.error || res.statusText)
    err.code = body.code
    err.status = res.status
    throw err
  }
  return res.json()
}

export const fetchPctDashboard = (token, params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return pctFetch(`/pct/dashboard${qs ? `?${qs}` : ''}`, token)
}

export const fetchPctLines = (token, params = {}) =>
  pctFetch(`/pct/lines?${new URLSearchParams(params)}`, token)

export const fetchPctLine = (id, token) =>
  pctFetch(`/pct/lines/${id}`, token)

export const fetchPctWorkflow = (id, token) =>
  pctFetch(`/pct/lines/${id}/workflow`, token)

export const fetchPctPoLines = (poNumber, token) =>
  pctFetch(`/pct/po/${encodeURIComponent(poNumber)}/lines`, token)

export const fetchPctActivity = (id, token) =>
  pctFetch(`/pct/lines/${id}/activity`, token)

export const advancePctStage = (id, stageId, token) =>
  pctFetch(`/pct/lines/${id}/advance-stage`, token, {
    method: 'POST',
    body: JSON.stringify({ stageId }),
  })

export const patchStageCheck = (id, body, token) =>
  pctFetch(`/pct/lines/${id}/stage-checks`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

export const patchAlertCheck = (id, body, token) =>
  pctFetch(`/pct/lines/${id}/alert-checks`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

export const uploadPctFile = (id, formData, token) =>
  pctFetch(`/pct/lines/${id}/uploads`, token, {
    method: 'POST',
    body: formData,
  })

export const syncPlmSnapshot = (id, token) =>
  pctFetch(`/pct/lines/${id}/sync-plm`, token, { method: 'POST' })

export const fetchPctExceptions = (poNumber, token) =>
  pctFetch(`/pct/po/${encodeURIComponent(poNumber)}/exceptions`, token)

export const patchPctException = (poNumber, body, token) =>
  pctFetch(`/pct/po/${encodeURIComponent(poNumber)}/exceptions`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

export const fetchPctTabChecks = (poNumber, tabKey, labels, token) =>
  pctFetch(`/pct/po/${encodeURIComponent(poNumber)}/tab-checks/${tabKey}?labels=${encodeURIComponent(JSON.stringify(labels))}`, token)

export const patchPctTabCheck = (poNumber, tabKey, body, token) =>
  pctFetch(`/pct/po/${encodeURIComponent(poNumber)}/tab-checks/${tabKey}`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
