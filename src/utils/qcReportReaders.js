// Deep-path readers for inspection_reports rows. The summary query is rooted
// at inspection_reports (for a clean top-level date filter, rather than a
// fragile doubly-nested PostgREST embed filter through purchase_orders ->
// po_line_items), so every row carries the PO/buyer/vendor/inspector a few
// levels down. Shared between QcReportsSummary.jsx and the trend-chart
// bucketing util so both use identical field-path readers.
export function getPo(r)          { return r.po_line_items?.purchase_orders ?? null }
export function getBuyerName(r)   { return getPo(r)?.buyer_supplier_links?.buyer?.display_name ?? null }
export function getVendorName(r)  { return getPo(r)?.buyer_supplier_links?.supplier?.display_name ?? null }
// Combined-document reference numbers (TWFCMB..., see
// supabase/migrations/20260917_create_inspection_report_batches.sql) embedded
// straight off the same purchase_orders relation the rest of this file reads
// - one report row's PO can have several (one per distinct combined export),
// so this is always an array. Embedding it here (instead of a separate
// po_id-keyed fetch after the fact) is what lets batch-number search work
// off data that's already in hand, synchronously, same as PO number/SKU
// search already does - no extra round trip, nothing to race or go stale.
export function getBatchNos(r)    { return (getPo(r)?.inspection_report_batches ?? []).map(b => b.batch_no) }
// Strictly the assigned QA (inspection_schedules.assigned_qa_id -> a real
// organization_members row), not the report's free-text inspector_name,
// which isn't a reliable identity (typos, stale names, etc.). Reports with
// no linked schedule just have no inspector for filtering purposes; the
// Inspector dropdown filter matches on this alone (getInspector(r)?.id).
export function getInspector(r)   { return r.inspection_schedules?.organization_members ?? null }
// For display only (chips, the day activity list): prefer the linked
// assigned QA, but fall back to the report's free-text inspector_name so a
// report created without a schedule link (no assigned_qa_id to resolve)
// still names someone instead of showing nothing. Never used for filtering.
export function getInspectorDisplayName(r) { return getInspector(r)?.full_name ?? r.inspector_name ?? null }
export function getSkuRef(r) { return r.po_line_items?.buyer_sku_ref ?? null }
export function getTargetDate(r) { return r.po_line_items?.target_date ?? null }
export function getOrderQty(r) { return r.po_line_items?.quantity_ordered ?? null }
// PO-level (not per-line-item like target_date) - the exceptional override
// wins when set, same `exceptional_ex_factory_date ?? ex_factory_date`
// convention PoInspectionComments.jsx's own exFactory() already uses.
export function getExFactoryDate(r) { const po = getPo(r); return po?.exceptional_ex_factory_date ?? po?.ex_factory_date ?? null }

// Same buyer/vendor names, but for a purchase_orders row directly (the QC
// Reports Analytics page's "open POs" dataset is rooted at purchase_orders,
// not inspection_reports, so buyer_supplier_links sits one level shallower
// than getBuyerName/getVendorName above expect).
export function getOpenPoBuyerName(po)  { return po.buyer_supplier_links?.buyer?.display_name ?? null }
export function getOpenPoVendorName(po) { return po.buyer_supplier_links?.supplier?.display_name ?? null }
export function getOpenPoExFactoryDate(po) { return po.exceptional_ex_factory_date ?? po.ex_factory_date ?? null }

// Dropdown option-list builders, shared by QcReportsSummary.jsx and
// QcRepositoryPanel.jsx - kept here (not in the component files) so
// both can import plain functions without a component file exporting
// non-component values, which breaks Fast Refresh.
export function distinctOptions(rows, getValue, getLabel) {
  const seen = new Map()
  for (const r of rows) {
    const v = getValue(r)
    if (v == null || seen.has(v)) continue
    seen.set(v, getLabel(r))
  }
  return [...seen.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

// Reports and schedules (or reports and open POs) produce separate option
// lists (different row shapes) that need combining for one dropdown, e.g. a
// buyer with only scheduled-but-not-started work wouldn't otherwise appear
// as filterable.
export function mergeOptionLists(...lists) {
  const seen = new Map()
  for (const list of lists) for (const o of list) if (!seen.has(o.value)) seen.set(o.value, o.label)
  return [...seen.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
