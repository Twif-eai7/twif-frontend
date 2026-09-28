import { useState, useEffect } from 'react'
import { useShippedPoStore, labelToSlug, extractMonthKey } from '../stores/shippedPoStore'
import { useAuthStore } from '../stores/authStore'
import { useLakshitStore } from '../stores/lakshitStore'
const API_BASE = import.meta.env.VITE_BACKEND_URL

export { labelToSlug, extractMonthKey }

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
function monthKeyToLabel(key) {
  const [yr, m] = key.split('-')
  return `${MONTHS[parseInt(m, 10) - 1] || m} ${yr}`
}

export function useShippedPO({ year = '27', buyer = '', month = '', merchant = '', page = 1, pageSize = 3, isAdmin = false }) {
  const key        = `${year}__${buyer}__${month}__${merchant || ''}`
  const entry      = useShippedPoStore(s => s.cache[key])
  const fetchFn    = useShippedPoStore(s => s.fetch)
  const invalidate = useShippedPoStore(s => s.invalidate)
  const lakshitPoNos   = useLakshitStore(s => s.poNos)
  const lakshitMode    = useLakshitStore(s => s.mode)
  const isLakshitMode  = lakshitPoNos !== null

  // ── Lakshit mode: fetch all rows once, filter + paginate client-side ────────
  const [lakshitAllRows, setLakshitAllRows] = useState(null)
  const [lakshitLoading, setLakshitLoading] = useState(false)

  useEffect(() => {
    if (!isLakshitMode) { setLakshitAllRows(null); return }

    let cancelled = false
    setLakshitLoading(true)
    const session = useAuthStore.getState().session
    if (!session) { setLakshitLoading(false); return }

    const p = new URLSearchParams({ fy: year, page: '1', pageSize: '99999', allRows: 'true' })
    if (buyer)            p.set('buyers',   buyer)
    if (month)            p.set('month',    month)
    if (isAdmin && merchant) p.set('merchant', merchant)

    window.fetch(`${API_BASE}/dashboard/shipped-po-summary?${p}`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.json())
      .then(j => { if (!cancelled) setLakshitAllRows(j.data?.rows ?? []) })
      .catch(() => { if (!cancelled) setLakshitAllRows([]) })
      .finally(() => { if (!cancelled) setLakshitLoading(false) })

    return () => { cancelled = true }
  }, [isLakshitMode, year, buyer, month, merchant, isAdmin])

  // ── Normal store fetch ────────────────────────────────────────────────────
  useEffect(() => {
    if (isLakshitMode) return
    fetchFn({ year, buyer, month, merchant, page, pageSize, isAdmin })
  }, [year, buyer, month, merchant, page, pageSize, isAdmin, isLakshitMode])

  const fetchAllForExport = async () => {
    if (isLakshitMode && lakshitAllRows !== null) {
      return lakshitAllRows.filter(r =>
        lakshitMode === 'exclude'
          ? !r.poNo || !lakshitPoNos.has(r.poNo)
          : r.poNo && lakshitPoNos.has(r.poNo)
      )
    }
    const session = useAuthStore.getState().session
    const p = new URLSearchParams({ fy: year, page: '1', pageSize: '99999', allRows: 'true' })
    if (buyer)            p.set('buyers',   buyer)
    if (month)            p.set('month',    month)
    if (isAdmin && merchant) p.set('merchant', merchant)
    const res = await window.fetch(`${API_BASE}/dashboard/shipped-po-summary?${p}`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const j = await res.json()
    return j.data?.rows ?? []
  }

  if (isLakshitMode) {
    const filtered  = (lakshitAllRows ?? []).filter(r =>
      lakshitMode === 'exclude'
        ? !r.poNo || !lakshitPoNos.has(r.poNo)
        : r.poNo && lakshitPoNos.has(r.poNo)
    )
    const startIdx  = (page - 1) * pageSize
    const pageRows  = filtered.slice(startIdx, startIdx + pageSize)
    const monthKeys = [...new Set(filtered.map(r => extractMonthKey(r.shippedDate)).filter(Boolean))].sort()

    return {
      rows:           pageRows,
      buyerList:      [...new Set(filtered.map(r => r.buyer).filter(Boolean))].sort(),
      vendorList:     [...new Set(filtered.map(r => r.vendor).filter(Boolean))].sort(),
      monthLabels:    monthKeys.map(monthKeyToLabel),
      totalPages:     Math.max(1, Math.ceil(filtered.length / pageSize)),
      totalCustomers: filtered.length,
      overall:        null,
      loading:        lakshitLoading,
      error:          null,
      refetch:        () => setLakshitAllRows(null),
      fetchAllForExport,
      labelToSlug,
    }
  }

  return {
    rows:           entry?.pages?.[page]  ?? [],
    buyerList:      entry?.buyerList      ?? [],
    vendorList:     entry?.vendorList     ?? [],
    monthLabels:    entry?.monthLabels    ?? [],
    totalPages:     entry?.totalPages     ?? 1,
    totalCustomers: entry?.totalCustomers ?? 0,
    overall:        entry?.overall        ?? null,
    loading:        !entry?.pages?.[page],
    error:          entry?.error          ?? null,
    refetch:        () => { invalidate(year, buyer, month, merchant); fetchFn({ year, buyer, month, merchant, page, pageSize, isAdmin }) },
    fetchAllForExport,
    labelToSlug,
  }
}
