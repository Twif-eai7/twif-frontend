import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export const PO_PAGE_SIZE = 20

export const EMPTY_FILTERS = {
  dateFrom: '', dateTo: '', merchant: '', buyer: '',
  supplier: '', poNumber: '', piStatus: '', erpStatus: '', exceptionStatus: '',
}

export const usePoStore = create(
  devtools(
    (set, get) => ({
      rows:       [],
      stats:      null,
      total:      0,
      page:       1,
      totalPages: 1,
      hasMore:    false,
      loading:    true,
      error:      null,

      merchants: [],
      buyers:    [],
      suppliers: [],

      filters: { ...EMPTY_FILTERS },

      // ── Pure setters (called by hooks after backend/supabase responses) ──

      setRows: (rows)       => set({ rows },       false, 'po/setRows'),
      setStats: (stats)     => set({ stats },       false, 'po/setStats'),
      setTotal: (total)     => set({ total },       false, 'po/setTotal'),
      setPage: (page)       => set({ page },        false, 'po/setPage'),
      setTotalPages: (n)    => set({ totalPages: n }, false, 'po/setTotalPages'),
      setHasMore: (v)       => set({ hasMore: v },  false, 'po/setHasMore'),
      setLoading: (loading) => set({ loading },     false, 'po/setLoading'),
      setError: (error)     => set({ error },       false, 'po/setError'),

      setMerchants: (merchants) => set({ merchants }, false, 'po/setMerchants'),
      setBuyers:    (buyers)    => set({ buyers },    false, 'po/setBuyers'),
      setSuppliers: (suppliers) => set({ suppliers }, false, 'po/setSuppliers'),

      // ── Filter actions (pure state — no async, hooks trigger fetches) ──

      setFilters: (filters) => set({ filters }, false, 'po/setFilters'),

      clearFilters: () =>
        set({ filters: { ...EMPTY_FILTERS } }, false, 'po/clearFilters'),

      // ── Row patch helpers (optimistic updates after mutations) ──

      _updateRow: (poId, updates) =>
        set(
          { rows: get().rows.map(r => r.id === poId ? { ...r, ...updates } : r) },
          false,
          'po/updateRow'
        ),

      _updateRows: (poIds, updates) =>
        set(
          { rows: get().rows.map(r => poIds.includes(r.id) ? { ...r, ...updates } : r) },
          false,
          'po/updateRows'
        ),
    }),
    { name: 'PO Store' }
  )
)

// ── Selector hooks ────────────────────────────────────────────────────────────

export const usePORows       = () => usePoStore(s => s.rows)
export const usePOStats      = () => usePoStore(s => s.stats)
export const usePOLoading    = () => usePoStore(s => s.loading)
export const usePOError      = () => usePoStore(s => s.error)
export const usePOFilters    = () => usePoStore(s => s.filters)
export const usePOMerchants  = () => usePoStore(s => s.merchants)
export const usePOBuyers     = () => usePoStore(s => s.buyers)
export const usePOSuppliers  = () => usePoStore(s => s.suppliers)
export const usePOTotal      = () => usePoStore(s => s.total)
export const usePOPage       = () => usePoStore(s => s.page)
export const usePOTotalPages = () => usePoStore(s => s.totalPages)
export const usePOHasMore    = () => usePoStore(s => s.hasMore)