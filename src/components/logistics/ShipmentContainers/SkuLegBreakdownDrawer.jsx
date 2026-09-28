import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSkuLegBreakdown } from '../../../hooks/useSkuLegBreakdown'
import { fmtQty, fmt$ } from '../../orderManagement/poUtils'

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function SkeletonRows() {
  return Array.from({ length: 3 }, (_, i) => (
    <div key={i} className="px-4 py-3 border-b border-gray-100 last:border-0 space-y-1.5">
      <div className="h-3 w-2/5 rounded bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse" />
      <div className="h-3 w-3/5 rounded bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse" />
    </div>
  ))
}

// One PO line item's "shipped" total (on the Logistics MIS summary table) is
// the sum of potentially several po_shipment_leg rows — partial shipments
// recorded over time, across different invoices/containers. This drawer
// shows those individual legs. Reversed legs are included (not hidden, the
// way the summary table excludes them) since this view is specifically for
// seeing the full history, not just the current net position.
export default function SkuLegBreakdownDrawer({ lineItem, open, onClose }) {
  const { legs, loading, fetchLegs } = useSkuLegBreakdown()

  useEffect(() => {
    if (open && lineItem?.id) fetchLegs(lineItem.id)
  }, [open, lineItem?.id, fetchLegs])

  if (!open || !lineItem) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[110] bg-black/25 cursor-pointer" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-[120] w-full sm:w-[480px] bg-gray-100 shadow-2xl flex flex-col">
        <div className="bg-white border-b border-gray-200 px-5 py-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">SKU</div>
              <div className="text-base font-bold text-gray-900 truncate">
                {lineItem.skuRef || '—'}
                {lineItem.variant && <span className="ml-1.5 text-xs font-medium text-gray-500">{lineItem.variant}</span>}
              </div>
            </div>
            <button type="button" onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          {/* Same label/value style as the Ordered/Shipped/Balance grid below,
              instead of cramming PO/Buyer/Vendor into one inline "·"-joined
              line — consistent look, and each field reads clearly on its own. */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">PO No.</div>
              <div className="text-xs font-semibold text-gray-800 truncate">{lineItem.poNumber || '—'}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Buyer</div>
              <div className="text-xs font-semibold text-purple-700 truncate">{lineItem.buyerName || '—'}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Vendor</div>
              <div className="text-xs font-semibold text-orange-700 truncate">{lineItem.vendorName || '—'}</div>
            </div>
          </div>
        </div>

        {/* Ordered/Shipped/Balance summary — same numbers as the row this drawer was opened from. */}
        <div className="grid grid-cols-3 gap-2 px-5 py-3 bg-white border-b border-gray-200 flex-shrink-0">
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Ordered</div>
            <div className="text-sm font-bold text-gray-900">{fmtQty(lineItem.ordered)}</div>
            <div className="text-xs font-semibold text-emerald-700">{fmt$(lineItem.orderedValue)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Shipped</div>
            <div className="text-sm font-bold text-gray-900">{fmtQty(lineItem.shipped)}</div>
            <div className="text-xs font-semibold text-emerald-700">{fmt$(lineItem.shippedValue)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Balance</div>
            <div className="text-sm font-bold text-gray-900">{fmtQty(lineItem.balance)}</div>
            <div className="text-xs font-semibold text-emerald-700">{fmt$(lineItem.balanceValue)}</div>
          </div>
        </div>

        <div className="px-5 pt-3 pb-1.5 bg-gray-100 flex-shrink-0">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            Shipments{!loading && legs.length > 0 ? ` (${legs.length})` : ''}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <SkeletonRows />}
          {!loading && legs.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-5">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                <path d="M20.59 13.41L13.42 20.59a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
              <p className="text-sm text-gray-500">No shipment legs recorded yet</p>
            </div>
          )}
          {!loading && legs.map(leg => (
            <div key={leg.id} className={`px-5 py-3 border-b border-gray-100 bg-white ${leg.reversed ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-gray-900">{fmtDate(leg.shippedDate)}</span>
                {leg.reversed && (
                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 whitespace-nowrap">
                    Reversed
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-xs text-gray-500">Qty <span className="font-bold text-gray-900">{fmtQty(leg.shippedQuantity)}</span></span>
                <span className="text-xs text-gray-500">Value <span className="font-bold text-emerald-700">{fmt$(leg.shippedValue)}</span></span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-gray-500">
                {leg.invoiceNumber && <span>Invoice <span className="font-semibold text-gray-700">{leg.invoiceNumber}</span></span>}
                {leg.blNumber && <span>BL <span className="font-semibold text-gray-700">{leg.blNumber}</span></span>}
                {leg.containerNumber && <span>Container <span className="font-semibold text-gray-700">{leg.containerNumber}</span></span>}
                {leg.submittedBy && <span>By <span className="font-semibold text-gray-700">{leg.submittedBy}</span></span>}
              </div>
              {leg.reversed && leg.reversedReason && (
                <div className="text-[11px] text-red-600 mt-1">Reason: {leg.reversedReason}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body
  )
}
