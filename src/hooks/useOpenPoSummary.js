import { useState, useEffect } from 'react'
import { useOpenPoStore, labelToSlug, extractMonthKey } from '../stores/openPoStore'
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

export function useOpenPO({ year, buyer = '', month = '', page = 1, pageSize = 3 }) {
  const { cache, fetch: storeFetch } = useOpenPoStore()
  const lakshitPoNos   = useLakshitStore(s => s.poNos)
  const lakshitMode    = useLakshitStore(s => s.mode)
  const isLakshitMode  = lakshitPoNos !== null

  const key   = `${year}__${buyer}__${month}`
  const entry = cache[key] ?? {}

  // ── Lakshit mode: fetch all rows once, filter + paginate client-side ────────
  const [lakshitAllRows,  setLakshitAllRows]  = useState(null)
  const [lakshitLoading,  setLakshitLoading]  = useState(false)

  useEffect(() => {
    if (!isLakshitMode) { setLakshitAllRows(null); return }

    let cancelled = false
    setLakshitLoading(true)
    const session = useAuthStore.getState().session
    if (!session) { setLakshitLoading(false); return }

    const p = new URLSearchParams({ fy: year, page: '1', pageSize: '99999', allRows: 'true' })
    if (buyer) p.set('buyers', buyer)
    if (month) p.set('month', month)

    window.fetch(`${API_BASE}/dashboard/open-po-summary?${p}`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.json())
      .then(j => { if (!cancelled) setLakshitAllRows(j.data?.rows ?? []) })
      .catch(() => { if (!cancelled) setLakshitAllRows([]) })
      .finally(() => { if (!cancelled) setLakshitLoading(false) })

    return () => { cancelled = true }
  }, [isLakshitMode, year, buyer, month])

  // ── Normal store fetch ────────────────────────────────────────────────────
  useEffect(() => {
    if (isLakshitMode) return
    storeFetch({ year, buyer, month, page, pageSize })
  }, [year, buyer, month, page, pageSize, isLakshitMode])

  const fetchAllForExport = async ({ year: y, buyer: b, month: mo, vendor } = {}) => {
    if (isLakshitMode && lakshitAllRows !== null) {
      let rows = lakshitAllRows.filter(r =>
        lakshitMode === 'exclude'
          ? !r.poNo || !lakshitPoNos.has(r.poNo)
          : r.poNo && lakshitPoNos.has(r.poNo)
      )
      if (vendor) rows = rows.filter(r => r.vendor?.trim() === vendor?.trim())
      return rows
    }
    const session = useAuthStore.getState().session
    const p = new URLSearchParams()
    p.set('fy', y ?? year)
    p.set('page', '1')
    p.set('pageSize', '99999')
    if (b ?? buyer) p.set('buyers', b ?? buyer)
    if (mo ?? month) p.set('month', mo ?? month)
    const res = await window.fetch(`${API_BASE}/dashboard/open-po-summary?${p}`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const j = await res.json()
    let rows = j.data?.rows ?? []
    if (vendor) rows = rows.filter(r => r.vendor?.trim() === vendor.trim())
    return rows
  }

  if (isLakshitMode) {
    const filtered  = (lakshitAllRows ?? []).filter(r =>
      lakshitMode === 'exclude'
        ? !r.poNo || !lakshitPoNos.has(r.poNo)
        : r.poNo && lakshitPoNos.has(r.poNo)
    )
    const startIdx  = (page - 1) * pageSize
    const pageRows  = filtered.slice(startIdx, startIdx + pageSize)
    const monthKeys = [...new Set(filtered.map(r => extractMonthKey(r.target)).filter(Boolean))].sort()

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
      fetchAllForExport,
    }
  }

  return {
    rows:           entry.pages?.[page] ?? [],
    buyerList:      entry.buyerList    ?? [],
    vendorList:     entry.vendorList   ?? [],
    monthLabels:    entry.monthLabels  ?? [],
    totalPages:     entry.totalPages   ?? 1,
    totalCustomers: entry.totalCustomers ?? 0,
    overall:        entry.overall      ?? null,
    loading:        entry.loading      ?? false,
    error:          entry.error        ?? null,
    fetchAllForExport,
  }
}
