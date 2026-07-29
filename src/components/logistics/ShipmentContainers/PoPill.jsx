import { useState } from 'react'
import ShipmentLineItemRow from './ShipmentLineItemRow'

// A PO within an invoice card. Shows the PO's actual vendor — derived live
// from its own supplier relationship, NOT the invoice's primary vendor field
// — since small POs sometimes piggyback onto another vendor's invoice.
export default function PoPill({ po, canClose, onRecordLeg }) {
  const [open, setOpen] = useState(false)
  const lineItems = po.po_line_items ?? []

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-gray-900 truncate">PO {po.po_number || '—'}</span>
          <span className="text-[10px] text-gray-500 truncate">{po.actual_vendor_name || '—'}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] font-semibold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
            {lineItems.length} SKU{lineItems.length !== 1 ? 's' : ''}
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="p-2.5 space-y-2 bg-white">
          {lineItems.length === 0 ? (
            <p className="text-xs text-gray-400 px-1 py-2">No line items on this PO</p>
          ) : (
            lineItems.map(li => (
              <ShipmentLineItemRow
                key={li.id}
                li={li}
                canClose={canClose}
                onRecordLeg={onRecordLeg}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
