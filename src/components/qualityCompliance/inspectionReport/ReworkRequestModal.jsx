import { useState } from 'react'
import { submitReworkRequest } from '../../../hooks/useInspectionRework'
import { STAGE_LABEL } from './stageStatus'

// Opened from InspectionReportEntry.jsx's Rework button - `items` is already
// narrowed to just the checked SKUs that actually have a reworkable stage
// (submitted + accepted), each `{ po_line_item_id, sku_ref, inspection_type,
// round, report_id }`. One request row covers the whole batch - a QA admin
// reviews and approves/rejects it as a unit (ReworkReviewModal.jsx).
export default function ReworkRequestModal({ po, items, userName, userEmail, memberId, onClose, onSubmitted }) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    if (!reason.trim()) return
    setSubmitting(true)
    setError(null)
    const { error: err } = await submitReworkRequest({
      poId: po.id,
      items: items.map(({ po_line_item_id, sku_ref, inspection_type, round, report_id }) => ({ po_line_item_id, sku_ref, inspection_type, round, report_id })),
      reason: reason.trim(),
      requestedBy: userName,
      requestedByEmail: userEmail,
      requestedByMemberId: memberId,
    })
    setSubmitting(false)
    if (err) { setError(err.message || 'Failed to submit rework request'); return }
    onSubmitted?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="text-sm font-bold text-gray-900">Request Rework</span>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" className="flex-shrink-0 mt-0.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <p className="text-xs font-bold text-red-700">Are you sure you want to send this for rework?</p>
              <p className="text-[11px] text-red-600 mt-0.5">
                The currently submitted report for this stage stays saved exactly as it is. Once approved, a new round opens
                pre-filled with everything from it - photos included - ready to review and correct, ending in its own fresh sign-off.
              </p>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
              {items.length} SKU{items.length === 1 ? '' : 's'} - resets each one's furthest stage
            </label>
            <div className="mt-1.5 space-y-1 max-h-32 overflow-y-auto">
              {items.map(it => (
                <div key={it.po_line_item_id} className="flex items-center justify-between text-xs px-2.5 py-1.5 bg-gray-50 border border-gray-100 rounded-lg">
                  <span className="font-semibold text-gray-800">{it.sku_ref || '-'}</span>
                  <span className="text-gray-400 uppercase font-bold">{STAGE_LABEL[it.inspection_type] || it.inspection_type}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Reason for rework</label>
            <textarea
              value={reason} onChange={e => setReason(e.target.value)} rows={3}
              className="mt-1 w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 resize-none"
              placeholder="Why does this need to be redone?"
            />
          </div>

          {error && <p className="text-[11px] text-red-600">{error}</p>}

          <button
            type="button" onClick={submit}
            disabled={submitting || !reason.trim() || items.length === 0}
            className="w-full px-4 py-2.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Submitting…' : 'Yes, send for rework'}
          </button>
        </div>
      </div>
    </div>
  )
}
