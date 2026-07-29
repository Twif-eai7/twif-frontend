import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { useAuthStore } from './authStore'

const API_BASE = import.meta.env.VITE_BACKEND_URL

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

export function extractMonthKey(target) {
  if (!target) return null
  const d = new Date(target)
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const m = target.match(/^(\d{4}-\d{2})/)
  return m ? m[1] : null
}

function monthKeyToLabel(key) {
  const [yr, m] = key.split('-')
  return `${MONTHS[parseInt(m, 10) - 1] || m} ${yr}`
}

export function labelToSlug(label) {
  const [mon, yr] = label.split(' ')
  const idx = MONTHS.indexOf(mon)
  if (idx === -1) return label
  return `${yr}-${String(idx + 1).padStart(2, '0')}`
}

// Cache shape per key:
// { pages: { 1: rows[], 2: rows[], ... }, totalPages, totalCustomers,
//   buyerList, vendorList, monthLabels, loading, error }
export const useOpenPoStore = create(
  devtools(
    (set, get) => ({
      cache: {},

      fetch: async ({ year, buyer = '', month = '', page = 1, pageSize = 3 }) => {
        const key = `${year}__${buyer}__${month}`
        const existing = get().cache[key]
        const session = useAuthStore.getState().session
        if (!session) return

        if (existing?.pages?.[page]) return

        set(s => ({
          cache: {
            ...s.cache,
            [key]: {
              ...(s.cache[key] ?? { pages: {}, totalPages: 1, totalCustomers: 0, buyerList: [], vendorList: [], monthLabels: [] }),
              loading: true,
              error: null,
            },
          },
        }), false, 'openPo/fetchStart')

        try {
          const p = new URLSearchParams()
          p.set('fy', year)
          p.set('page', page)
          p.set('pageSize', pageSize)
          if (buyer) p.set('buyers', buyer)
          if (month) p.set('month', month) 

          const res = await fetch(`${API_BASE}/dashboard/open-po-summary?${p}`, {
            credentials: 'include',
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const j = await res.json()
          if (!j.success) throw new Error(j.error || 'API error')

          const rows           = j.data?.rows || []
          const totalPages     = j.pagination?.totalPages     ?? 1
          const totalCustomers = j.pagination?.totalCustomers ?? 0

          set(s => {
            const prev = s.cache[key] ?? {}

            // buyerList: use customerBuyers from server once and preserve — it has the full list
            const serverBuyers = (j.customerBuyers || []).filter(Boolean)
            const resolvedBuyerList = serverBuyers.length
              ? serverBuyers.sort()
              : prev.buyerList ?? []

            // vendorList: customerSuppliers may be empty (join issue), so accumulate from rows across pages
            const serverVendors = (j.customerSuppliers || []).filter(Boolean)
            const pageVendors   = rows.map(r => r.vendor).filter(Boolean)
            const resolvedVendorList = serverVendors.length
              ? serverVendors.sort()
              : [...new Set([...(prev.vendorList ?? []), ...pageVendors])].sort()

            // monthLabels: accumulate across pages similarly
            const pageMonthKeys  = rows.map(r => extractMonthKey(r.target)).filter(Boolean)
            const allMonthKeys   = [...new Set([...(prev._monthKeys ?? []), ...pageMonthKeys])].sort()
            const monthLabels    = allMonthKeys.map(monthKeyToLabel)
            const overall = j.overall ?? prev.overall ?? null

            return {
              cache: {
                ...s.cache,
                [key]: {
                  ...prev,
                  pages: { ...prev.pages, [page]: rows },
                  totalPages,
                  totalCustomers,
                  buyerList:   resolvedBuyerList,
                  vendorList:  resolvedVendorList,
                  _monthKeys:  allMonthKeys,
                  monthLabels,
                  overall,
                  loading: false,
                  error: null,
                },
              },
            }
          }, false, 'openPo/fetchDone')
        } catch (err) {
          set(s => ({
            cache: { ...s.cache, [key]: { ...(s.cache[key] ?? {}), loading: false, error: err.message } },
          }), false, 'openPo/fetchError')
        }
      },

      invalidate: (year, buyer = '', month = '') => {
        const key = `${year}__${buyer}__${month}`
        set(s => {
          const next = { ...s.cache }
          delete next[key]
          return { cache: next }
        }, false, 'openPo/invalidate')
      },
    }),
    { name: 'OpenPO Store' }
  )
)
