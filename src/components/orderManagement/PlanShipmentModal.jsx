import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { usePoShipmentPlans } from '../../hooks/usePoShipmentPlans'

const inputCls = 'w-28 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-colors placeholder:text-gray-400'

// Selected POs (from PoRecord.jsx's bulk-select) + a CBM entry per PO.
// Submitting records each as a merchant "planned to ship" po_shipment_plans
// row — the first step of the reversed shipment flow.
export default function PlanShipmentModal({ open, pos, onClose, onSuccess }) {
  const { createPlans } = usePoShipmentPlans()
  const [cbms, setCbms] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) { setCbms({}); setError(null); setSubmitting(false) }
  }, [open])

  if (!open) return null

  const canSubmit = pos.length > 0 && pos.every(po => Number(cbms[po.id]) > 0) && !submitting

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await createPlans(pos.map(po => ({ po_id: po.id, cbm: Number(cbms[po.id]) })))
      onSuccess?.()
      onClose()
    } catch (err) {
      const msg = err?.message?.includes('duplicate key')
        ? 'One or more of these POs is already planned.'
        : (err.message || 'Failed to plan shipment')
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[110] bg-black/40" onClick={!submitting ? onClose : undefined} />
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col pointer-events-auto">

          <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900">Plan for Shipment</h2>
              <p className="text-xs text-gray-500 mt-0.5">Enter a CBM estimate for each PO — group and confirm them from My Planned Shipments once ready</p>
            </div>
            <button type="button" onClick={!submitting ? onClose : undefined}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-black transition-colors flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-2">
            {pos.map(po => (
              <div key={po.id} className="flex items-center justify-between gap-3 px-3 py-2 border border-gray-200 rounded-lg">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">{po.po_number}</div>
                  <div className="text-xs text-gray-500 truncate">{po.buyer_name || '—'} · {po.supplier_name || '—'}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <input
                    type="number" min="0" step="0.01"
                    value={cbms[po.id] ?? ''}
                    onChange={e => setCbms(prev => ({ ...prev, [po.id]: e.target.value }))}
                    placeholder="CBM"
                    className={inputCls}
                  />
                  <span className="text-xs text-gray-400">m³</span>
                </div>
              </div>
            ))}

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {error}
              </div>
            )}
          </form>

          <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-gray-100 flex-shrink-0">
            <button type="button" onClick={onClose} disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {submitting ? 'Planning…' : `Plan ${pos.length} PO${pos.length !== 1 ? 's' : ''}`}
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body
  )
}
