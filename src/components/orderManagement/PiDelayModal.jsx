import { useState } from 'react'

const MAX = 500

export default function PiDelayModal({ po, onClose, onSubmit }) {
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  if (!po) return null

  const handleSubmit = async () => {
    if (!comment.trim()) { setError('Please enter a reason before submitting.'); return }
    setLoading(true)
    setError('')
    try {
      await onSubmit(comment.trim())
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save comment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="text-sm font-bold text-gray-900">PI Delay</div>
            <div className="text-xs text-gray-500 mt-0.5">
              PO#{po.po_number} · {po.buyer_name}
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-3">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-xs text-red-600">{error}</span>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              Reason for delay
            </label>
            <textarea
              rows={4}
              maxLength={MAX}
              value={comment}
              onChange={e => { setComment(e.target.value); setError('') }}
              placeholder="Describe why the PI is delayed…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 resize-none focus:outline-none focus:border-gray-900"
            />
            <div className="text-[10px] text-gray-400 text-right">{comment.length}/{MAX}</div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button type="button" onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-50 transition-colors cursor-pointer">
            {loading ? 'Submitting…' : 'Submit'}
          </button>
        </div>

      </div>
    </div>
  )
}
