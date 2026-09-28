import { useState, useEffect } from 'react'
import { useShipmentSkuSummaryReconciled } from '../../../hooks/useShipmentSkuSummaryReconciled'
import { fmt$, fmtQty } from '../../orderManagement/poUtils'
import { statusLabel, statusBadge } from '../../../utils/skuStatus'
import SkuLegBreakdownDrawer from './SkuLegBreakdownDrawer'

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// One row per SKU line item, same 15 columns/order as the "Detailed
// (SKU-level)" Excel export (DETAIL_COLS in useSkuSummaryExport.js) — no PO
// grouping, no collapsible rows, no stacked qty/value cells. SkuShipmentSummary
// (the MIS tab) groups by PO and is left exactly as-is; this is a separate,
// deliberately plainer table for wherever people found that one confusing.
// Self-fetching via useShipmentSkuSummaryReconciled — a separate RPC pair
// (sql/sku_summary_rpc_reconciled.sql) from the one MIS/its Excel export use,
// so that "All" here reconciles with AnalyticsV2Section's header stats
// (target-in-window OR shipped-in-window) without touching a single number
// those existing views show.
// The first four columns are pinned (sticky) while the rest scroll
// horizontally underneath — each needs a fixed pixel width so its cumulative
// left offset stays correct, computed once below rather than hand-maintained.
const RAW_COLUMNS = [
  { key: 'poNumber',     label: 'PO No.',      sticky: true, width: 96 },
  { key: 'buyerName',    label: 'Buyer',       sticky: true, width: 128 },
  { key: 'vendorName',   label: 'Vendor',      sticky: true, width: 128 },
  { key: 'skuRef',       label: 'SKU',         sticky: true, width: 112 },
  { key: 'variant',      label: 'Variant' },
  { key: 'ordered',      label: 'Ordered Qty', align: 'right' },
  { key: 'orderedValue', label: 'Ordered $',   align: 'right' },
  { key: 'shipped',      label: 'Shipped Qty', align: 'right' },
  { key: 'shippedValue', label: 'Shipped $',   align: 'right' },
  { key: 'balance',      label: 'Balance Qty', align: 'right' },
  { key: 'balanceValue', label: 'Balance $',   align: 'right' },
  { key: 'orderDate',    label: 'Ordered Date' },
  { key: 'targetDate',   label: 'Target Date' },
  { key: 'shippedDate',  label: 'Shipped Date' },
  { key: 'status',       label: 'Status' },
]
let _cumLeft = 0
const COLUMNS = RAW_COLUMNS.map(c => {
  if (!c.sticky) return c
  const left = _cumLeft
  _cumLeft += c.width
  return { ...c, left }
})

const LAST_STICKY_KEY = [...COLUMNS].reverse().find(c => c.sticky)?.key

function stickyStyle(c, zIndex, isHeader) {
  if (!c.sticky) return undefined
  const style = { position: 'sticky', left: c.left, width: c.width, minWidth: c.width, maxWidth: c.width, zIndex }
  if (c.key === LAST_STICKY_KEY) {
    style.borderRight = `2px solid ${isHeader ? '#475569' : '#d1d5db'}`
    style.boxShadow = '4px 0 6px -2px rgba(0,0,0,0.25)'
  }
  return style
}

// Same color conventions as SkuShipmentSummary.jsx's own row cells: $ values
// in emerald-700, qty in gray-900, buyer/vendor in purple-700/orange-700
// (matching its PO-group header), status as a colored pill via statusBadge.
function cellContent(row, key) {
  switch (key) {
    case 'status':
      return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${statusBadge(row.status)}`}>
          {statusLabel(row.status)}
        </span>
      )
    case 'buyerName':
      return <span className="text-purple-700">{row.buyerName || '—'}</span>
    case 'vendorName':
      return <span className="text-orange-700">{row.vendorName || '—'}</span>
    case 'ordered':
    case 'shipped':
    case 'balance':
      return <span className="text-gray-900">{fmtQty(row[key])}</span>
    case 'orderedValue':
    case 'shippedValue':
    case 'balanceValue':
      return <span className="text-emerald-700">{fmt$(row[key])}</span>
    case 'orderDate':
    case 'targetDate':
    case 'shippedDate':
      return <span className="text-gray-900">{fmtDate(row[key])}</span>
    default:
      return <span className="text-gray-900">{row[key] || '—'}</span>
  }
}

export default function SimpleSkuSummaryTable({
  enabled = true, buyerOrgId, vendorOrgId, status, search,
  targetDateFrom, targetDateTo, shippedDateFrom, shippedDateTo,
  merchant, merchantExclude, merchantExact,
  // Which date field is actually driving this view — dateFieldForStatus(status)
  // covers every ordinary status, but a caller can force it (AnalyticsV2Section's
  // "FYTD Shipped" drill-in forces 'shipped' even though status stays 'all',
  // which would otherwise default to 'target').
  dateFieldOverride = null,
  // Reports { totalPoDisplay, totalLabel, totalQty, totalValue, loading }
  // on every change, so the caller can render its own header-stats-bar-style
  // summary above this table (matching AnalyticsV2Section's own
  // analytics-stats-bar) instead of this component drawing one internally.
  onStatsChange,
}) {
  const [page, setPage] = useState(1)
  // Same drawer old MIS (SkuShipmentSummary.jsx) uses — one PO line item's
  // "Shipped Qty/$" here is a SUM across every po_shipment_leg (partial
  // shipments over time), and "Shipped Date" is just the latest leg's own
  // date (see sql/sku_summary_rpc_reconciled.sql's leg_totals CTE), so
  // neither column alone shows a line item that shipped across several
  // different dates. Clicking a row opens the same self-fetching drawer
  // (get_sku_leg_breakdown), unchanged, to see the individual legs.
  const [legDrawerItem, setLegDrawerItem] = useState(null)

  // Any filter change goes back to page 1 — a stale page number from a
  // narrower/wider result set would otherwise point at the wrong POs.
  useEffect(() => { setPage(1) }, [
    buyerOrgId, vendorOrgId, status, search,
    targetDateFrom, targetDateTo, shippedDateFrom, shippedDateTo,
    merchant, merchantExclude, merchantExact,
  ])

  const { rows, stats, totalPoCount, loading, totalPages } = useShipmentSkuSummaryReconciled({
    enabled, buyerOrgId, vendorOrgId, status, search, page,
    targetDateFrom, targetDateTo, shippedDateFrom, shippedDateTo,
    merchant, merchantExclude, merchantExact,
  })

  // The totals shown here come from get_sku_summary_stats_reconciled — the
  // same aggregate across the FULL filtered set the table itself is drawn
  // from (not just the current page) — so they're a direct sanity check
  // against whichever KPI card was clicked to get here: same RPC family, same
  // filters, just re-derived independently instead of trusted blindly.
  // Which METRIC to display (shipped vs. open/balance) — a different
  // question from which date field scopes the query (dateFieldForStatus).
  // dateFieldForStatus binds 'partial' to 'shipped' for that query-scoping
  // purpose alone (see its own comment in misFilters.js) — its display
  // metric still has to be the outstanding balance, not what has already
  // shipped, so this can't just reuse dateFieldForStatus's result wholesale.
  // Mirrors useSkuSummaryExportReconciled.js's metricForStatus: shipped for
  // closed/on_time/late, plus the 'all'+forced-shipped KPI-drill-in case
  // (dateFieldOverride is only ever set alongside status 'all' — see
  // AnalyticsV2Section's misDateFieldOverride comment); balance otherwise
  // (open/partial/cancelled/plain 'all').
  const isShippedView = status === 'closed' || status === 'on_time' || status === 'late'
    || (dateFieldOverride === 'shipped' && (!status || status === 'all'))
  const totalLabel = isShippedView ? 'Shipped' : 'Open'
  const totalQty   = isShippedView ? stats.shipped      : stats.balance
  const totalValue = isShippedView ? stats.shippedValue : stats.balanceValue
  // Three different PO counts exist for the "All"+shipped-active view
  // (status unset, dateFieldOverride/dateFieldForStatus = 'shipped') — pick
  // the one that actually answers "how many POs contributed to totalValue":
  //   - totalPoCount (page RPC): broadest — a PO matching EITHER target_date
  //     due in this window OR a shipped leg in it, so it includes POs that
  //     haven't shipped anything at all yet. Wrong for this view (845 real
  //     vs. 1483 shown).
  //   - stats.shippedPoCount: narrowest — fully-shipped AND final_date set,
  //     built for the separate, non-clickable "Shipped POs Count" KPI card.
  //     Wrong here too (excludes partials, which still contribute dollars).
  //   - stats.shippedContributingPoCount: any PO with a shipment leg in the
  //     window, regardless of completion — exactly "POs behind totalValue".
  // Only computed (non-null) for that same status-unset+shipped-window case;
  // every other status/view falls back to the plain totalPoCount, which is
  // already correctly scoped by the page RPC's own status-specific matching.
  const totalPoDisplay = isShippedView && stats.shippedContributingPoCount != null
    ? stats.shippedContributingPoCount
    : totalPoCount

  useEffect(() => {
    if (!onStatsChange) return
    // skuCount: total matching line items (get_sku_summary_stats_reconciled's
    // own COUNT(*)) — the caller shows this as "Converted SKUs" in place of
    // Shipped Qty, same idea as dashboard_summary's totalConvertedSKUs.
    onStatsChange({ totalPoDisplay, totalLabel, totalQty, totalValue, skuCount: stats.skuCount, loading })
  }, [onStatsChange, totalPoDisplay, totalLabel, totalQty, totalValue, stats.skuCount, loading])

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          {/* Background on thead, not tr — a <tr>'s background can fall
              short of the table's true rendered width in a horizontally
              scrolling layout, leaving a pale gap past the last column once
              scrolled all the way right. thead always spans the full table
              width. Sticky cells below still carry their own explicit
              bg-slate-800 too, since a sticky cell must paint its own
              background to stay opaque while the rest of the row scrolls
              under it. */}
          <thead className="bg-slate-800">
            <tr>
              {COLUMNS.map(c => (
                <th key={c.key} style={stickyStyle(c, 2, true)}
                  className={`px-3 py-2 text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.sticky ? 'bg-slate-800' : ''}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-b-0">
                  {COLUMNS.map(c => (
                    <td key={c.key} style={stickyStyle(c, 1)} className={`px-3 py-2 ${c.sticky ? 'bg-white' : ''}`}>
                      <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-xs text-gray-400">
                  No SKUs match the current filters
                </td>
              </tr>
            ) : (
              rows.map(r => (
                <tr key={r.id} onClick={() => setLegDrawerItem(r)}
                  className="group border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer">
                  {COLUMNS.map(c => (
                    <td key={c.key} style={stickyStyle(c, 1)}
                      className={`px-3 py-2 text-xs font-semibold whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.sticky ? 'bg-white group-hover:bg-gray-50' : ''}`}>
                      {cellContent(r, c.key)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-3 px-4 py-1.5 border-t border-gray-100 bg-gray-50">
          <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-medium text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors cursor-pointer disabled:cursor-default">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
            Prev
          </button>
          <span className="text-[11px] text-gray-500">Page {page} of {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-medium text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors cursor-pointer disabled:cursor-default">
            Next
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      )}

      <SkuLegBreakdownDrawer
        lineItem={legDrawerItem}
        open={!!legDrawerItem}
        onClose={() => setLegDrawerItem(null)}
      />
    </div>
  )
}
