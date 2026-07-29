import { useCallback } from 'react'
import {
  useCourierLogStore,
  useCourierLogFilters,
} from '../stores/courierLogStore'

const BASE = `${import.meta.env.VITE_BACKEND_URL || ''}/logistics/courier-logs`

export function useFetchCourierLogs() {
  const filters    = useCourierLogFilters()
  const setRows    = useCourierLogStore(s => s.setRows)
  const setPage    = useCourierLogStore(s => s.setPage)
  const setLoading = useCourierLogStore(s => s.setLoading)
  const setError   = useCourierLogStore(s => s.setError)

  return useCallback(async (overrideFilters) => {
    const f = overrideFilters ?? filters
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (f.dateFrom)      params.set('from',          f.dateFrom)
      if (f.dateTo)        params.set('to',             f.dateTo)
      if (f.cost_centre)   params.set('cost_centre',    f.cost_centre)
      if (f.merchant_name) params.set('merchant_name',  f.merchant_name)
      if (f.vendor_name)   params.set('vendor_name',    f.vendor_name)
      if (f.search)        params.set('search',         f.search)

      const res = await fetch(`${BASE}?${params}`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setRows(data.logs || [])
      setPage(1)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filters])
}

export function useCourierLogActions() {
  const _addRow    = useCourierLogStore(s => s._addRow)
  const _updateRow = useCourierLogStore(s => s._updateRow)
  const _deleteRow = useCourierLogStore(s => s._deleteRow)

  const createLog = useCallback(async (payload) => {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to create courier log')
    _addRow(data.log)
    return data.log
  }, [_addRow])

  const updateLog = useCallback(async (id, payload) => {
    const res = await fetch(`${BASE}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to update courier log')
    _updateRow(id, data.log)
    return data.log
  }, [_updateRow])

  const deleteLog = useCallback(async (id) => {
    const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Failed to delete courier log')
    }
    _deleteRow(id)
  }, [_deleteRow])

  const uploadInvoice = useCallback(async (id, file) => {
    const fd = new FormData()
    fd.append('invoiceFile', file)
    const res = await fetch(`${BASE}/${id}/invoice`, { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Upload failed')
    _updateRow(id, data.log)
    return data.log
  }, [_updateRow])

  const getInvoiceUrl = useCallback(async (id) => {
    const res = await fetch(`${BASE}/${id}/invoice`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to get invoice URL')
    return data.url
  }, [])

  const deleteInvoice = useCallback(async (id) => {
    const res = await fetch(`${BASE}/${id}/invoice`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to delete invoice')
    _updateRow(id, data.log)
  }, [_updateRow])

  return { createLog, updateLog, deleteLog, uploadInvoice, getInvoiceUrl, deleteInvoice }
}
