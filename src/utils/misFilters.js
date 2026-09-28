// Shared MIS filter constants — kept in their own plain-JS file (not
// SkuShipmentSummary.jsx itself) so both MIS's own filter bar and
// AnalyticsV2Section's copy of it (status pills + target/shipped date FY
// pills, no detailed table) import the exact same source instead of two
// copies quietly drifting apart. A .jsx component file exporting these
// alongside its default component would also trip the
// react-refresh/only-export-components lint rule.

export const STATUS_FILTERS = [
  { key: 'all',       label: 'All' },
  { key: 'open',      label: 'Open' },
  { key: 'partial',   label: 'Partial' },
  { key: 'closed',    label: 'Fully Shipped' },
  // Drill-downs INSIDE 'closed' — a fully shipped PO whose final_date beats
  // (or misses) its effective target date, same on-time definition
  // dashboard_summary/otif_rpc.sql use. See sql/sku_summary_rpc.sql.
  { key: 'on_time',   label: 'On Time' },
  { key: 'late',      label: 'Late' },
  { key: 'cancelled', label: 'Cancelled' },
]

// Apr-Mar fiscal year — same boundaries as FY_DATES in analyticsStore.js.
// A "Year" filter here is just a shortcut that fills in the Target Date
// range with a FY's bounds, reusing the existing date-range filter/params
// rather than adding a new server-side concept.
export const FY_RANGES = {
  fy26: ['2025-04-01', '2026-03-31'],
  fy27: ['2026-04-01', '2027-03-31'],
}

// Which FY a "YYYY-MM-DD" date falls in, by FY_RANGES bounds — used to infer
// selectedYear from a deep-linked month (which can land in either FY
// depending on which chart it was clicked from) instead of assuming fy27.
export function fyForDate(dateStr) {
  return Object.keys(FY_RANGES).find(fy => dateStr >= FY_RANGES[fy][0] && dateStr <= FY_RANGES[fy][1])
}

// Which date field a status's "does this belong to year X" question binds
// to — a PO that hasn't shipped yet only has a target_date (no shipped leg
// exists), so open/cancelled/all bind to that; shipped/on_time/late/partial
// bind to shipped_date instead. Never bind both fields to the same year at
// once — get_sku_summary_page ANDs target_date and "has a leg in this
// shipped window" together, so doing that would wrongly require a still-open
// PO to also have a shipment leg in the window, excluding it entirely.
//
// 'partial' binds to shipped, not target, even though its exported summary
// columns are still balance-focused (see metricForStatus in
// useSkuSummaryExportReconciled.js — a separate, deliberate choice about
// which NUMBER to show, not which date scopes the row match). dashboard_
// summary's own v_partial counts POs with a shipment leg dated in the given
// (shipped) window that are NOT fully shipped (still have an open line
// item) — same "fully shipped" completion check on_time/late use, just
// inverted, and independent of final_date. Binding 'partial' to target here
// used to scope its RPC calls by target_date instead (and leave the leg
// check unscoped by date), which could both over- and under-count against
// that dashboard figure at once.
export function dateFieldForStatus(status) {
  return (status === 'closed' || status === 'on_time' || status === 'late' || status === 'partial') ? 'shipped' : 'target'
}
