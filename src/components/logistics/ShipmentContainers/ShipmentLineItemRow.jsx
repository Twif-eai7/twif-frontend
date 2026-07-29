import { useState } from 'react'
import { fmt$, fmtQty } from '../../orderManagement/poUtils'

const STATUS_STYLE = {
  open:      { strip: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-800' },
  shipped:   { strip: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800' },
  cancelled: { strip: 'bg-red-400',     badge: 'bg-red-100 text-red-700' },
  confirmed: { strip: 'bg-blue-400',    badge: 'bg-blue-100 text-blue-800' },
}
function statusStyle(s) {
  return STATUS_STYLE[s?.toLowerCase()] ?? { strip: 'bg-gray-300', badge: 'bg-gray-100 text-gray-600' }
}

function ShipProgress({ ordered, shipped }) {
  if (!ordered) return null
  const pct = Math.min(100, Math.round(((shipped ?? 0) / ordered) * 100))
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-800 whitespace-nowrap flex-shrink-0">{pct}% shipped</span>
    </div>
  )
}

// One PO line item, scoped to a single invoice's closing context. Same
// component/layout whether or not the invoice's BL has been uploaded —
// `canClose` just gates whether the qty input is interactive, per the
// "one continuous record" design decision (no separate locked/unlocked view).
export default function ShipmentLineItemRow({ li, canClose, onRecordLeg }) {
  const { strip, badge } = statusStyle(li.status)
  const [qty, setQty] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const balance = li.balance_quantity ?? 0
  const qtyNum = Number(qty)
  const canSubmit = canClose && qty !== '' && qtyNum > 0 && qtyNum <= balance && !submitting

  const handleConfirm = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await onRecordLeg(li, qtyNum)
      setQty('')
    } catch (err) {
      setError(err.message || 'Failed to record shipment leg')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
      <div className={`w-1 flex-shrink-0 ${strip}`} />
      <div className="flex-1 px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold text-gray-900 truncate">{li.buyer_sku_ref || '—'}</span>
            {li.sku_variant && (
              <span className="text-[11px] text-gray-600 truncate">{li.sku_variant}</span>
            )}
          </div>
          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap flex-shrink-0 ${badge}`}>
            {li.status || '—'}
          </span>
        </div>

        <ShipProgress ordered={li.quantity_ordered} shipped={li.shipped_quantity} />

        <div className="grid grid-cols-3 divide-x divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
          {[
            { label: 'Ordered', qty: li.quantity_ordered, val: li.order_value_usd },
            { label: 'Shipped', qty: li.shipped_quantity, val: li.shipped_value_usd },
            { label: 'Balance', qty: li.balance_quantity, val: li.balance_value_usd },
          ].map(({ label, qty: cellQty, val }) => (
            <div key={label} className="px-2.5 py-2 bg-gray-50">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</div>
              <div className="text-sm font-bold text-gray-900 leading-none">{fmtQty(cellQty)}</div>
              <div className="text-xs font-semibold text-gray-600 mt-0.5">{fmt$(val)}</div>
            </div>
          ))}
        </div>

        {/* Inline closing — same row, gated by canClose */}
        <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
          {canClose ? (
            <>
              <input
                type="number"
                min="1"
                max={balance}
                value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder={`Qty being shipped now (max ${fmtQty(balance)})`}
                className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canSubmit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                {submitting ? 'Saving…' : 'Confirm'}
              </button>
            </>
          ) : (
            <span className="text-[11px] text-gray-400 italic">Closes after BL upload</span>
          )}
        </div>
        {error && <p className="text-[11px] text-red-500">{error}</p>}
      </div>
    </div>
  )
}
