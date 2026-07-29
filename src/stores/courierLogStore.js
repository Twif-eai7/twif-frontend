import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export const COURIER_LOG_PAGE_SIZE = 50

export const EMPTY_FILTERS = {
  dateFrom:      '',
  dateTo:        '',
  cost_centre:   '',
  merchant_name: '',
  vendor_name:   '',
  search:        '',
}

export const useCourierLogStore = create(
  devtools(
    (set, get) => ({
      rows:       [],
      total:      0,
      page:       1,
      totalPages: 1,
      loading:    true,
      error:      null,

      filters: { ...EMPTY_FILTERS },

      setRows: (rows) => set({
        rows,
        total:      rows.length,
        totalPages: Math.max(1, Math.ceil(rows.length / COURIER_LOG_PAGE_SIZE)),
      }, false, 'courierLog/setRows'),

      setPage:       (page)    => set({ page },    false, 'courierLog/setPage'),
      setLoading:    (loading) => set({ loading }, false, 'courierLog/setLoading'),
      setError:      (error)   => set({ error },   false, 'courierLog/setError'),
      setFilters:    (filters) => set({ filters }, false, 'courierLog/setFilters'),
      clearFilters:  ()        => set({ filters: { ...EMPTY_FILTERS } }, false, 'courierLog/clearFilters'),

      _addRow: (row) => {
        const rows = [row, ...get().rows]
        set({
          rows,
          total:      rows.length,
          totalPages: Math.max(1, Math.ceil(rows.length / COURIER_LOG_PAGE_SIZE)),
        }, false, 'courierLog/addRow')
      },

      _updateRow: (id, updates) =>
        set(
          { rows: get().rows.map(r => r.id === id ? { ...r, ...updates } : r) },
          false,
          'courierLog/updateRow'
        ),

      _deleteRow: (id) => {
        const rows = get().rows.filter(r => r.id !== id)
        set({
          rows,
          total:      rows.length,
          totalPages: Math.max(1, Math.ceil(rows.length / COURIER_LOG_PAGE_SIZE)),
        }, false, 'courierLog/deleteRow')
      },
    }),
    { name: 'Courier Log Store' }
  )
)

export const useCourierLogRows       = () => useCourierLogStore(s => s.rows)
export const useCourierLogLoading    = () => useCourierLogStore(s => s.loading)
export const useCourierLogError      = () => useCourierLogStore(s => s.error)
export const useCourierLogFilters    = () => useCourierLogStore(s => s.filters)
export const useCourierLogPage       = () => useCourierLogStore(s => s.page)
export const useCourierLogTotal      = () => useCourierLogStore(s => s.total)
export const useCourierLogTotalPages = () => useCourierLogStore(s => s.totalPages)
