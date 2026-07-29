import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useRaisedUnbookedInvoices } from '../../../hooks/useRaisedUnbookedInvoices'
import { useShipmentContainerActions } from '../../../hooks/useShipmentContainerActions'

// Attaches already-raised, not-yet-booked invoices to an existing container —
// replaces the old "author a new invoice inline" add-mode now that invoices
// are raised earlier in the flow (see InvoiceDetailsModal.jsx).
export default function AttachInvoicesModal({ open, container, onClose, onAttached }) {
  const { invoices, loading } = useRaisedUnbookedInvoices(open ? container?.buyer_org_id : null)
  const { bookInvoicesIntoContainer } = useShipmentContainerActions()
  const [selectedIds, setSelectedIds] = useState([])
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { if (open) { setSelectedIds([]); setSearch(''); setError(null) } }, [open])

  // Every eligible invoice is shown at once (checklist), not hidden behind a
  // click-to-open dropdown — this modal has exactly one job, so the extra
  // interaction step was pure friction.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return invoices
    return invoices.filter(inv =>
      inv.invoice_number?.toLowerCase().includes(term) ||
      inv.vendor_name?.toLowerCase().includes(term) ||
      inv.po_numbers.some(n => n.toLowerCase().includes(term))
    )
  }, [invoices, search])

  const toggle = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  if (!open) return null

  const handleSubmit = async () => {
    if (!selectedIds.length || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await bookInvoicesIntoContainer(container.id, selectedIds)
      onAttached?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to attach invoices')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[110] bg-black/40" />
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col pointer-events-auto">
          <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900">Attach Invoice</h2>
              <p className="text-xs text-gray-500 mt-0.5">To container {container?.container_number}</p>
            </div>
            <button type="button" onClick={!submitting ? onClose : undefined}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-black transition-colors flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            {!loading && invoices.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-6 text-center">No raised, unbooked invoices for this buyer yet — raise one from the Invoices stage first.</p>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search invoice # or vendor…"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
                  />
                </div>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-gray-400 text-center">No invoices match your search</p>
                  ) : (
                    filtered.map(inv => {
                      const checked = selectedIds.includes(inv.id)
                      return (
                        <label key={inv.id}
                          className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${checked ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggle(inv.id)}
                            className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600 cursor-pointer flex-shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="text-xs font-semibold text-gray-900">{inv.invoice_number}</span>
                            <span className="text-[11px] text-gray-400 ml-1.5">{inv.vendor_name || 'Unknown vendor'}</span>
                          </span>
                          {inv.po_numbers.length > 0 && (
                            <span className="text-[10px] text-gray-400 flex-shrink-0 truncate max-w-[35%]">{inv.po_numbers.join(', ')}</span>
                          )}
                        </label>
                      )
                    })
                  )}
                </div>
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-gray-100 flex-shrink-0">
            <button type="button" onClick={onClose} disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={!selectedIds.length || submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {submitting ? 'Attaching…' : `Attach ${selectedIds.length || ''}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
