import { useState } from 'react'
import { requestQuantityCancellation } from '../../hooks/usePoLineItemCancellations'

// Multi-SKU version of CancelQuantityModal.jsx's single-SKU request — same
// reason/comment/proof-photo shape and the same otif_exceptions review flow
// (one quantity_cancellation request per line item, since the underlying
// table and backend route are both line-item-scoped), just submitted for
// several SKUs sharing one reason/proof in a single flow instead of
// re-entering the same reason per SKU one at a time. Two entry points reuse
// this: PoRecord.jsx's kebab "Cancel Order" (no `selectedLineItems` — every
// still-cancelable SKU on the PO), and PoDrawer.jsx's row-checkbox "Cancel
// Selected" (`selectedLineItems` scoped to whatever was checked).
export default function CancelOrderModal({ po, pendingCancellations, selectedLineItems, onClose, onSubmitted }) {
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [proofImage, setProofImage] = useState(null)
  const [quantities, setQuantities] = useState(null) // lazily initialized below, once `eligible` is known
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null) // { succeeded: [], failed: [{li, message}] } once submitted

  if (!po) return null

  const isBulkSelection = !!selectedLineItems
  const remainingFor = (li) => Math.max(0, Number(li.quantity_ordered || 0) - Number(li.cancelled_quantity || 0))
  const sourceLineItems = selectedLineItems ?? po.po_line_items ?? []
  // Re-filtered defensively even for an already-checked selection — a
  // pending request could have landed (another tab, another reviewer) in
  // the moment between checking the row and opening this modal.
  const eligible = sourceLineItems.filter(li => li.buyer_sku_ref && !pendingCancellations?.[li.id] && remainingFor(li) > 0)
  const excludedCount = sourceLineItems.filter(li => li.buyer_sku_ref).length - eligible.length

  // Quantities default to each line's full remaining balance but stay
  // editable — initialized once per modal instance (parent remounts this
  // via `key` on po/selection change, so this only ever runs on open).
  if (quantities === null) {
    setQuantities(Object.fromEntries(eligible.map(li => [li.id, String(remainingFor(li))])))
  }

  const qtyFor = (li) => Number(quantities?.[li.id])
  const qtyValid = (li) => Number.isFinite(qtyFor(li)) && qtyFor(li) > 0 && qtyFor(li) <= remainingFor(li)
  const allQtyValid = quantities != null && eligible.every(qtyValid)

  const canSubmit = eligible.length > 0 && allQtyValid && reason.trim() && proofImage && !submitting

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    const succeeded = []
    const failed = []
    for (const li of eligible) {
      try {
        await requestQuantityCancellation(li.id, { quantity: qtyFor(li), reason: reason.trim(), comment: comment.trim(), proofImage })
        succeeded.push(li)
      } catch (err) {
        failed.push({ li, message: err.message || 'Failed to submit' })
      }
    }
    setSubmitting(false)
    setResults({ succeeded, failed })
    if (succeeded.length) onSubmitted?.()
    if (!failed.length) onClose()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-sm overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <span className="text-sm font-bold text-gray-900">
            {isBulkSelection ? 'Cancel Selected SKUs' : 'Cancel Order'} — {po?.po_number || '—'}
          </span>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {results ? (
            <>
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                Submitted {results.succeeded.length} of {eligible.length} cancellation request{eligible.length === 1 ? '' : 's'} for approval.
              </p>
              {results.failed.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-red-600">Failed to submit for:</p>
                  {results.failed.map(({ li, message }) => (
                    <p key={li.id} className="text-[11px] text-red-600">{li.buyer_sku_ref} — {message}</p>
                  ))}
                </div>
              )}
              <button type="button" onClick={onClose}
                className="w-full px-4 py-2.5 rounded-lg text-xs font-bold text-white bg-gray-900 hover:bg-gray-700 transition-colors">
                Close
              </button>
            </>
          ) : eligible.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              {isBulkSelection
                ? 'None of the selected SKUs can be cancelled — they\'re either already fully cancelled or already have a pending cancellation request.'
                : "Nothing left to cancel — every SKU on this PO is either already fully cancelled or already has a pending cancellation request."}
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                  {isBulkSelection
                    ? `Requesting cancellation on ${eligible.length} SKU${eligible.length === 1 ? '' : 's'} — one shared reason and proof`
                    : `Cancelling the full remaining quantity on ${eligible.length} SKU${eligible.length === 1 ? '' : 's'} — one shared reason and proof`}
                </p>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {eligible.map(li => (
                    <div key={li.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                      <span className="font-medium text-gray-800 truncate min-w-0 flex-1">{li.buyer_sku_ref}{li.sku_variant ? ` · ${li.sku_variant}` : ''}</span>
                      {isBulkSelection ? (
                        <input
                          type="number" min={1} max={remainingFor(li)}
                          value={quantities?.[li.id] ?? ''}
                          onChange={e => setQuantities(prev => ({ ...prev, [li.id]: e.target.value }))}
                          className={`w-16 flex-shrink-0 px-1.5 py-1 text-xs text-right border rounded-md focus:outline-none
                            ${qtyValid(li) ? 'border-gray-200 focus:border-gray-900' : 'border-red-400 bg-red-50'}`}
                        />
                      ) : (
                        // Whole-PO "Cancel Order" — no per-SKU picking, so the
                        // quantity isn't editable either; that precision belongs
                        // to PoDrawer's per-SKU Cancel Qty / Cancel Selected
                        // instead, which is exactly what this would otherwise
                        // duplicate.
                        <span className="w-16 flex-shrink-0 text-right font-semibold text-amber-700">{remainingFor(li)}</span>
                      )}
                    </div>
                  ))}
                </div>
                {isBulkSelection && !allQtyValid && (
                  <p className="text-[11px] text-red-600">Each quantity must be between 1 and that SKU's remaining order quantity.</p>
                )}
                {excludedCount > 0 && (
                  <p className="text-[10px] text-gray-400">{excludedCount} other SKU{excludedCount === 1 ? '' : 's'} skipped (already cancelled or pending).</p>
                )}
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Reason <span className="text-red-400">*</span></label>
                <textarea
                  value={reason} onChange={e => setReason(e.target.value)} rows={2}
                  className="mt-1 w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 resize-none"
                  placeholder="Why are these being cancelled?"
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
                disabled={!canSubmit}
                className="w-full px-4 py-2.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? `Submitting… (${eligible.length} SKUs)` : `Submit ${eligible.length} cancellation request${eligible.length === 1 ? '' : 's'}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
