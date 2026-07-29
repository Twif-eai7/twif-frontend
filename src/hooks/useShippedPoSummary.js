import { useEffect } from 'react'
import { useShippedPoStore, labelToSlug, extractMonthKey } from '../stores/shippedPoStore'
import { useAuthStore } from '../stores/authStore'
const API_BASE = import.meta.env.VITE_BACKEND_URL

export { labelToSlug, extractMonthKey }

export function useShippedPO({ year = '27', buyer = '', month = '', merchant = '', page = 1, pageSize = 3, isAdmin = false }) {
  const key        = `${year}__${buyer}__${month}__${merchant || ''}`
  const entry      = useShippedPoStore(s => s.cache[key])
  const fetchFn    = useShippedPoStore(s => s.fetch)
  const invalidate = useShippedPoStore(s => s.invalidate)

  useEffect(() => {
    fetchFn({ year, buyer, month, merchant, page, pageSize, isAdmin })
  }, [year, buyer, month, merchant, page, pageSize, isAdmin])

  const fetchAllForExport = async () => {
    const session = useAuthStore.getState().session
    const p = new URLSearchParams()
    p.set('fy', year)
    p.set('page', '1')
    p.set('pageSize', '99999')
    p.set('allRows', 'true')
    if (buyer) p.set('buyers', buyer)
    if (month) p.set('month', month)
    if (isAdmin && merchant) p.set('merchant', merchant)

    const res = await window.fetch(`${API_BASE}/dashboard/shipped-po-summary?${p}`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const j = await res.json()
    return j.data?.rows ?? []
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
