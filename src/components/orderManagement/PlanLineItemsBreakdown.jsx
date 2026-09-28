import { useState } from 'react'

// Read-only per-SKU breakdown for a planned PO — collapsed by default so a
// long list of plans/POs doesn't turn into a wall of SKU rows. Shared by
// MyShipmentPlansDrawer.jsx (pending plans + grouped POs) and
// GroupComposer.jsx's EditGroupInline, so a PO's CBM is never just an opaque
// total — the SKU quantities behind it (from po_shipment_plan_line_items,
// the same data PlanShipmentModal.jsx collects) are always one click away.
export default function PlanLineItemsBreakdown({ lines }) {
  const [expanded, setExpanded] = useState(false)
  if (!lines?.length) return null

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className={`flex items-center gap-1 px-1.5 py-0.5 -ml-1.5 rounded-md text-[11px] font-bold uppercase tracking-wide cursor-pointer transition-colors
          ${expanded ? 'text-indigo-700 bg-indigo-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
          className={`transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {lines.length} SKU{lines.length !== 1 ? 's' : ''}
      </button>
      {expanded && (
        <div className="mt-1 pl-2.5 border-l-2 border-indigo-100 divide-y divide-gray-100">
          {lines.map(l => (
            <div key={l.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate font-semibold text-gray-800">
                {l.buyer_sku_ref || '—'}
                {l.sku_variant && <span className="ml-1.5 font-medium text-gray-400">{l.sku_variant}</span>}
              </span>
              <span className="flex-shrink-0 text-gray-500">{l.quantity} units</span>
              <span className="flex-shrink-0 w-16 text-right font-bold text-gray-700">{Number(l.cbm).toFixed(3)} m³</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
