import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export const INTL_COURIER_LOG_PAGE_SIZE = 50

export const INTL_EMPTY_FILTERS = {
  dateFrom:        '',
  dateTo:          '',
  search:          '',
  buyer_name:      '',
  vendor_name:     '',
  merchant_name:   '',
  courier_company: '',
}

export const useIntlCourierLogStore = create(
  devtools(
    (set, get) => ({
      rows:       [],
      total:      0,
      page:       1,
      totalPages: 1,
      loading:    true,
      error:      null,

      filters: { ...INTL_EMPTY_FILTERS },

      setRows: (rows) => set({
        rows,
        total:      rows.length,
        totalPages: Math.max(1, Math.ceil(rows.length / INTL_COURIER_LOG_PAGE_SIZE)),
      }, false, 'intlCourierLog/setRows'),

      setPage:      (page)    => set({ page },    false, 'intlCourierLog/setPage'),
      setLoading:   (loading) => set({ loading }, false, 'intlCourierLog/setLoading'),
      setError:     (error)   => set({ error },   false, 'intlCourierLog/setError'),
      setFilters:   (filters) => set({ filters }, false, 'intlCourierLog/setFilters'),
      clearFilters: ()        => set({ filters: { ...INTL_EMPTY_FILTERS } }, false, 'intlCourierLog/clearFilters'),

      _addRow: (row) => {
        const rows = [row, ...get().rows]
        set({
          rows,
          total:      rows.length,
          totalPages: Math.max(1, Math.ceil(rows.length / INTL_COURIER_LOG_PAGE_SIZE)),
        }, false, 'intlCourierLog/addRow')
      },

      _updateRow: (id, updates) =>
        set(
          { rows: get().rows.map(r => r.id === id ? { ...r, ...updates } : r) },
          false,
          'intlCourierLog/updateRow'
        ),

      _deleteRow: (id) => {
        const rows = get().rows.filter(r => r.id !== id)
        set({
          rows,
          total:      rows.length,
          totalPages: Math.max(1, Math.ceil(rows.length / INTL_COURIER_LOG_PAGE_SIZE)),
        }, false, 'intlCourierLog/deleteRow')
      },
    }),
    { name: 'International Courier Log Store' }
  )
)

export const useIntlCourierLogRows       = () => useIntlCourierLogStore(s => s.rows)
export const useIntlCourierLogLoading    = () => useIntlCourierLogStore(s => s.loading)
export const useIntlCourierLogError      = () => useIntlCourierLogStore(s => s.error)
export const useIntlCourierLogFilters    = () => useIntlCourierLogStore(s => s.filters)
export const useIntlCourierLogPage       = () => useIntlCourierLogStore(s => s.page)
export const useIntlCourierLogTotal      = () => useIntlCourierLogStore(s => s.total)
export const useIntlCourierLogTotalPages = () => useIntlCourierLogStore(s => s.totalPages)
