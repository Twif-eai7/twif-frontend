import { useState } from 'react'
import { fmt$, impliedRateFor } from './poUtils'

const NOTES_MAX = 300

export default function AdvancePaymentModal({ po, onClose, onSubmit }) {
  const [amount, setAmount]       = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  if (!po) return null

  const currency = po.currency || 'USD'
  // Same rate the PO's own line-item value checks use (PoDrawer.jsx) — an
  // advance is priced at whatever rate the PO itself was booked at, not a
  // live FX lookup that could disagree with it.
  const rate = impliedRateFor(po)
  const amountNum = Number(amount)
  const amountUsdPreview = rate != null && amountNum > 0 ? amountNum * rate : null

  const handleSubmit = async () => {
    if (!amount || amountNum <= 0) { setError('Please enter a valid amount.'); return }
    if (!paymentDate) { setError('Please select a payment date.'); return }
    if (rate == null) { setError("Can't determine this PO's USD conversion rate — check its amount/currency fields."); return }
    setLoading(true)
    setError('')
    try {
      await onSubmit({ amount: amountNum, paymentDate, referenceNumber, notes })
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to submit advance payment')
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
            <div className="text-sm font-bold text-gray-900">Submit Advance Payment</div>
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

          <div className="grid grid-cols-[1fr_80px] gap-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                Amount received <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => { setAmount(e.target.value); setError('') }}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-900 placeholder:text-gray-400"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Currency</label>
              {/* Derived from the PO, not editable — an advance is always in
                  whatever currency the PO itself was booked in. */}
              <div className="w-full px-2.5 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm font-semibold text-gray-700 text-center">
                {currency}
              </div>
            </div>
          </div>
          {amountUsdPreview != null && currency !== 'USD' && (
            <p className="text-[11px] text-gray-500 -mt-2">≈ {fmt$(amountUsdPreview)} at this PO's booked rate</p>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              Payment date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={paymentDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={e => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-900"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Reference number</label>
            <input
              type="text"
              value={referenceNumber}
              onChange={e => setReferenceNumber(e.target.value)}
              placeholder="e.g. transaction/UTR number"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-900 placeholder:text-gray-400"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
            <textarea
              rows={3}
              maxLength={NOTES_MAX}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional context for this advance…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 resize-none focus:outline-none focus:border-gray-900"
            />
            <div className="text-[10px] text-gray-400 text-right">{notes.length}/{NOTES_MAX}</div>
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
