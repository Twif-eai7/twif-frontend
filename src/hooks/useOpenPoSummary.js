import { useEffect } from 'react'
import { useOpenPoStore, labelToSlug, extractMonthKey } from '../stores/openPoStore'
import { useAuthStore } from '../stores/authStore'
const API_BASE = import.meta.env.VITE_BACKEND_URL

export { labelToSlug, extractMonthKey }

export function useOpenPO({ year, buyer = '', month = '', page = 1, pageSize = 3 }) {
  const { cache, fetch: storeFetch } = useOpenPoStore()
  const key = `${year}__${buyer}__${month}`
  const entry = cache[key] ?? {}

  useEffect(() => {
    storeFetch({ year, buyer, month, page, pageSize })
  }, [year, buyer, month, page, pageSize])

  const fetchAllForExport = async ({ year, buyer, month, vendor } = {}) => {
    const session = useAuthStore.getState().session
    const p = new URLSearchParams()
    p.set('fy', year)
    p.set('page', '1')
    p.set('pageSize', '99999')
    if (buyer) p.set('buyers', buyer)
    if (month) p.set('month', month)

    const res = await window.fetch(`${API_BASE}/dashboard/open-po-summary?${p}`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const j = await res.json()
    let rows = j.data?.rows ?? []
    // vendor is client-side only — filter after fetch
    if (vendor) rows = rows.filter(r => r.vendor?.trim() === vendor.trim())
    return rows
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