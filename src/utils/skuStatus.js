// Shared status helpers for MIS SKU rows.
//
// Individual SKU rows now trust po_line_items.status directly (returned as
// `status` from get_sku_summary_page, same column sql/dashboard_rpcs.sql
// filters on) — no derivation needed there, just statusLabel() below.
//
// deriveStatusKey is still used for the PO-group rollup badge in
// SkuShipmentSummary.jsx, which has no single status column to read since it
// summarizes multiple line items' quantities into one badge — shipped_qty is
// checked first and wins over cancellation: a group that shipped everything
// it needed to (shipped >= ordered - cancelled) is 'closed' even if some/all
// of the remainder was later cancelled; only a group with nothing shipped
// AND nothing left to ship (remaining <= 0) is 'cancelled'.
export function deriveStatusKey(row) {
  const remaining = row.ordered - (row.cancelled || 0)
  if (row.shipped > 0 && row.shipped >= remaining) return 'closed'
  if (remaining <= 0) return 'cancelled'
  if (row.shipped <= 0) return 'open'
  return 'partial'
}

const STATUS_LABEL = {
  open: 'Open',
  partial: 'Partial',
  closed: 'Shipped',
  cancelled: 'Cancelled',
}
export function statusLabel(key) {
  if (!key) return '—'
  return STATUS_LABEL[key] ?? key
}

// Same badge colors as SkuShipmentSummary.jsx's own (private, unexported)
// STATUS_BADGE map — duplicated here rather than imported from that
// component file (which would trip react-refresh/only-export-components,
// same reason misFilters.js exists) so other views can match MIS's status
// coloring without touching the MIS tab itself.
const STATUS_BADGE = {
  open:      'bg-gray-100 text-gray-600',
  partial:   'bg-amber-100 text-amber-800',
  closed:    'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-700',
}
export function statusBadge(key) {
  return STATUS_BADGE[key] ?? 'bg-gray-100 text-gray-600'
}
