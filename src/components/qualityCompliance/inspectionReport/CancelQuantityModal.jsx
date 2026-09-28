import { useState } from 'react'
import { requestQuantityCancellation } from '../../../hooks/usePoLineItemCancellations'

// Shared by both entry points (InspectionReportEntry.jsx's per-SKU header bar
// and PoSkuSummary.jsx's Overview table) - quantity capped at Order Qty (not
// Balance, per the confirmed requirement), one proof photo (matches the
// existing OTIF-exception request's single-proofImage convention), blocked
// entirely while a request is already pending for this SKU.
export default function CancelQuantityModal({ lineItem, pending, onClose, onSubmitted, defaultQuantity }) {
  // Pre-filled (still fully editable) when opened from InspectionForm.jsx's
  // leftover-quantity choice at submit time - the inspector already knows
  // the exact leftover amount at that point, no reason to make them retype
  // it, but they can still adjust it before submitting the request.
  const [quantity, setQuantity] = useState(defaultQuantity != null ? String(defaultQuantity) : '')
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [proofImage, setProofImage] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const orderQty = Number(lineItem?.quantity_ordered || 0)
  const approved = Number(lineItem?.cancelled_quantity || 0)
  const amount = Number(quantity)
  const validAmount = Number.isFinite(amount) && amount > 0 && amount <= orderQty

  const submit = async () => {
    if (!validAmount || !reason.trim() || !proofImage) return
    setSubmitting(true)
    setError(null)
    try {
      await requestQuantityCancellation(lineItem.id, { quantity: amount, reason: reason.trim(), comment: comment.trim(), proofImage })
      onSubmitted?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to submit cancellation request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="text-sm font-bold text-gray-900">Cancel Quantity - {lineItem?.buyer_sku_ref || '-'}</span>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {pending ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              A cancellation request for {pending.requested_quantity} unit{pending.requested_quantity === 1 ? '' : 's'} is already pending approval for this SKU.
            </p>
          ) : (
            <>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Quantity to cancel (Order Qty: {orderQty}{approved ? `, already cancelled: ${approved}` : ''})</label>
                <input
                  type="number" min={1} max={orderQty} value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  className="mt-1 w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
                  placeholder={`Up to ${orderQty}`}
                />
                {quantity && !validAmount && (
                  <p className="text-[11px] text-red-600 mt-1">Can't exceed the Order Qty of {orderQty}.</p>
                )}
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Reason <span className="text-red-400">*</span></label>
                <textarea
                  value={reason} onChange={e => setReason(e.target.value)} rows={2}
                  className="mt-1 w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 resize-none"
                  placeholder="Why is this quantity being cancelled?"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Comment (optional)</label>
                <input
                  type="text" value={comment} onChange={e => setComment(e.target.value)}
                  className="mt-1 w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Proof (photo or PDF) <span className="text-red-400">*</span></label>
                <input
                  type="file" accept="image/*,application/pdf"
                  onChange={e => setProofImage(e.target.files?.[0] || null)}
                  className="mt-1 w-full text-xs text-gray-600"
                />
              </div>

              {error && <p className="text-[11px] text-red-600">{error}</p>}

              <button
                type="button" onClick={submit}
                disabled={submitting || !validAmount || !reason.trim() || !proofImage}
                className="w-full px-4 py-2.5 rounded-lg text-xs font-bold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit for approval'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
