import { createPortal } from 'react-dom'

// Generic destructive-action confirmation modal.
// Keeps the confirmation step one deliberate click away from the trigger.
export default function ConfirmModal({
  open,
  title,
  message,
  warning,            // optional amber warning note (e.g. "This cannot be undone")
  confirmLabel = 'Delete',
  loadingLabel,       // defaults to "Deleting…" for tone="danger", "Saving…" otherwise
  tone = 'danger',    // 'danger' (red, trash icon) | 'neutral' (gray, pencil icon)
  onConfirm,
  onClose,
  loading = false,
  // Optional mandatory-reason field — pass reason/onReasonChange to require
  // one before confirming. Omitted entirely, existing callers are unaffected.
  reason,
  onReasonChange,
  reasonLabel = 'Reason',
  reasonPlaceholder = '',
  // Optional quantity field, for in-place-edit style confirmations.
  quantity,
  onQuantityChange,
  quantityLabel = 'Quantity',
}) {
  if (!open) return null

  const needsReason = onReasonChange !== undefined
  const needsQuantity = onQuantityChange !== undefined
  const confirmDisabled = loading
    || (needsReason && !reason?.trim())
    || (needsQuantity && !(Number(quantity) > 0))
  const isDanger = tone === 'danger'

  return createPortal(
    <>
      <div className="fixed inset-0 z-[200] bg-black/40" onClick={!loading ? onClose : undefined} />
      <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col pointer-events-auto">

          {/* Header */}
          <div className="flex items-start gap-3 px-5 pt-5 pb-4">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${isDanger ? 'bg-red-100' : 'bg-gray-100'}`}>
              {isDanger ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-600">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6" /><path d="M14 11v6" />
                  <path d="M9 6V4h6v2" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-600">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-gray-900">{title}</h3>
              {message && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{message}</p>}
              {warning && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2">
                  {warning}
                </p>
              )}
            </div>
          </div>

          {needsQuantity && (
            <div className="px-5 pb-3">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{quantityLabel}</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={e => onQuantityChange(e.target.value)}
                disabled={loading}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900 disabled:opacity-50 transition-colors"
              />
            </div>
          )}

          {needsReason && (
            <div className="px-5 pb-4">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{reasonLabel}</label>
              <textarea
                value={reason}
                onChange={e => onReasonChange(e.target.value)}
                disabled={loading}
                rows={2}
                placeholder={reasonPlaceholder}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900 disabled:opacity-50 transition-colors resize-none placeholder:text-gray-400"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 px-5 pb-5">
            <button type="button" onClick={onClose} disabled={loading}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={onConfirm} disabled={confirmDisabled}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors
                ${isDanger ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-900 hover:bg-gray-700'}`}>
              {loading && (
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              )}
              {loading ? (loadingLabel ?? (isDanger ? 'Deleting…' : 'Saving…')) : confirmLabel}
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body
  )
}
