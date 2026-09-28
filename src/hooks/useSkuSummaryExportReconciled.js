import { useState, useCallback } from 'react'
import { downloadSummaryXlsx, downloadPivotXlsx } from '../utils/xlsxExport'
import { supabase } from '../lib/supabase'
import { useProfileStore } from '../stores/profileStore'
import { resolveMerchantMemberLinkIds, findMerchantMemberId } from '../lib/poQueries'
import { titleCaseName } from '../utils/formatters'
import { statusLabel } from '../utils/skuStatus'
import { dateFieldForStatus } from '../utils/misFilters'

// Same visibility rule as useSkuSummaryExport.js.
function canSeeAll(role, dept) {
  return role === 'admin' || role === 'owner' || dept === 'tech'
}

// Same 15 columns/order as useSkuSummaryExport.js's DETAIL_COLS, plus one
// extra column so a line item shipped across several legs (partial
// shipments over time) shows each leg's OWN quantity/value/date as its own
// row, instead of the line item's single aggregate row hiding everything
// but the latest leg's date (see fetchLegRows below).
const DETAIL_COLS = [
  { key: 'poNumber',    label: 'PO No.',        wch: 14 },
  { key: 'buyerName',   label: 'Buyer',         wch: 20 },
  { key: 'vendorName',  label: 'Vendor',        wch: 20 },
  { key: 'skuRef',      label: 'SKU',           wch: 16 },
  { key: 'variant',     label: 'Variant',       wch: 12 },
  { key: 'status',      label: 'Status',        wch: 12 },
  { key: 'ordered',     label: 'Ordered Qty',   wch: 12 },
  { key: 'orderedValue',label: 'Ordered $',     wch: 12 },
  { key: 'shipped',     label: 'Shipped Qty',   wch: 12 },
  { key: 'shippedValue',label: 'Shipped $',     wch: 12 },
  { key: 'balance',     label: 'Balance Qty',   wch: 12 },
  { key: 'balanceValue',label: 'Balance $',     wch: 12 },
  { key: 'orderDate',   label: 'Ordered Date',  wch: 13 },
  { key: 'targetDate',  label: 'Target Date',   wch: 13 },
  { key: 'shippedDate', label: 'Shipped Date',  wch: 13 },
  { key: 'legNote',     label: 'Shipment',      wch: 16 },
]

const EXPORT_PAGE_SIZE = 20
// po_shipment_leg.po_line_item_id IN (...) chunk size — defensive, same
// "don't hand PostgREST one giant request" instinct as EXPORT_PAGE_SIZE
// above, just for an IN-list rather than a page size.
const LEG_FETCH_CHUNK_SIZE = 300

function metricForStatus(status) {
  if (status === 'closed' || status === 'on_time' || status === 'late') {
    return { dateKey: 'shippedDate', qtyKey: 'shipped', valueKey: 'shippedValue', qtyLabel: 'Shipped Qty', valueLabel: 'Shipped $' }
  }
  if (status === 'open' || status === 'partial') {
    return { dateKey: 'targetDate', qtyKey: 'balance', valueKey: 'balanceValue', qtyLabel: 'Balance Qty', valueLabel: 'Balance $' }
  }
  return null // 'all' / 'cancelled' / unset
}

function weekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + ((day === 0 ? -6 : 1) - day))
  return d
}
// "2-Feb" — hyphenated, no year — the Weekly/Monthly pivot sheet's own
// column-header date format.
function fmtShortHyphen(d) {
  const day = d.getUTCDate()
  const month = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
  return `${day}-${month}`
}
// Period key+label for the Weekly/Monthly pivot sheet (buyer > vendor rows,
// one column per week/month) — see exportToExcel's weekly/monthly branch.
function pivotPeriodOf(dateStr, mode) {
  if (mode === 'monthly') {
    const d = new Date(dateStr + 'T00:00:00Z')
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    return { key, label }
  }
  const start = weekStart(dateStr)
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6)
  return { key: start.toISOString().slice(0, 10), label: `${fmtShortHyphen(start)} to ${fmtShortHyphen(end)}` }
}

// A line item's aggregate row (built in exportToExcel below) shows only the
// SUM of every po_shipment_leg's qty/value and the MAX (latest) leg's date
// — real numbers, but a line item shipped across 3 partial batches on 3
// different dates only ever shows one date. This fetches every leg
// directly (po_shipment_leg isn't behind an RPC — same direct-table
// pattern AnalyticsV2Section.jsx's Lakshit fetch and
// useShipmentContainerDetail.js already use) and expands each row into one
// row per leg, so the detailed export can show what actually shipped, when
// — not just the aggregate.
//
// Reversed legs (delete_meta IS NOT NULL) are INCLUDED, not excluded —
// reverse_shipment_leg (sql/shipment_leg_reversal_reason.sql) only flags a
// leg row, it never deletes it or negates its quantity/value, and
// sku_summary_rpc(_reconciled).sql's own leg_totals CTE has no delete_meta
// filter either — so the "Shipped Qty/$" aggregate already shown on screen
// (and this same DETAIL_COLS sheet's own shipped/shippedValue columns
// before this feature existed) already sums reversed legs in. Excluding
// them here would make a line item's own expanded leg rows sum to LESS
// than its own aggregate figure — a fresh mismatch of exactly the kind
// this whole reconciliation effort exists to avoid. Flagged via legNote
// instead (unlike the on-screen drawer, SkuLegBreakdownDrawer, which shows
// the same inclusion but with a dedicated "Reversed" badge + reason).
//
// Only ever called for 'detailed' mode — summary/weekly/monthly keep
// summing the original one-row-per-line-item `rows` untouched, since
// Ordered/Balance are line-item facts, not per-leg ones, and would be
// double/triple/etc.-counted if summed across exploded leg rows instead.
//
// shippedDateFrom/To (nullable) must match leg_totals' own window exactly
// (same p_shipped_date_from/p_shipped_date_to passed to the page RPC) — a
// line item's aggregate shipped/shippedValue only sums legs INSIDE that
// window, so fetching every leg the line item ever had, unwindowed, would
// pull in extra legs the aggregate itself never counted.
async function fetchLegRows(rows, shippedDateFrom, shippedDateTo) {
  const ids = rows.map(r => r.id).filter(Boolean)
  const legsByLineItem = new Map()
  for (let i = 0; i < ids.length; i += LEG_FETCH_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + LEG_FETCH_CHUNK_SIZE)
    let query = supabase
      .from('po_shipment_leg')
      .select('po_line_item_id, shipped_quantity, shipped_value_usd, shipped_date, delete_meta')
      .in('po_line_item_id', chunk)
    if (shippedDateFrom) query = query.gte('shipped_date', shippedDateFrom)
    if (shippedDateTo) query = query.lte('shipped_date', shippedDateTo)
    const { data, error } = await query
    // Non-fatal — a failed chunk just leaves those line items showing their
    // single aggregate row (this feature's whole reason to exist skipped
    // for that subset), same as the export behaved before this existed,
    // rather than failing the export outright over what's an enhancement.
    if (error) { console.error('[useSkuSummaryExportReconciled] leg fetch error:', error.message); continue }
    ;(data || []).forEach(leg => {
      if (!legsByLineItem.has(leg.po_line_item_id)) legsByLineItem.set(leg.po_line_item_id, [])
      legsByLineItem.get(leg.po_line_item_id).push(leg)
    })
  }

  const legRows = []
  rows.forEach(row => {
    const legs = (legsByLineItem.get(row.id) || [])
      .slice()
      .sort((a, b) => (a.shipped_date || '').localeCompare(b.shipped_date || ''))
    if (!legs.length) {
      // Never shipped (still open) — keep the line item's own single row
      // instead of dropping it from the export.
      legRows.push({ ...row, legNote: '' })
      return
    }
    legs.forEach((leg, i) => {
      const seq = legs.length > 1 ? `${i + 1} of ${legs.length}` : ''
      const reversed = leg.delete_meta != null
      legRows.push({
        ...row,
        shipped: leg.shipped_quantity ?? 0,
        shippedValue: leg.shipped_value_usd ?? 0,
        shippedDate: leg.shipped_date || '',
        legNote: [seq, reversed ? 'Reversed' : ''].filter(Boolean).join(' · '),
      })
    })
  })
  return legRows
}

// Same shape as useSkuSummaryExport.js, but calls get_sku_summary_page_reconciled
// (sql/sku_summary_rpc_reconciled.sql) instead of the original get_sku_summary_page
// — a separate RPC, so nothing here can change what MIS's own export shows.
// The one behavior difference, matching useShipmentSkuSummaryReconciled.js:
// for status 'all' (or unset), BOTH the target-date and shipped-date windows
// are forwarded (the RPC OR-matches them there), so the exported totals
// actually reconcile with AnalyticsV2Section's on-screen SimpleSkuSummaryTable
// instead of only ever looking at target_date the way the original export
// (and MIS's own "All") does. Every other status still forwards only the one
// field dateFieldForStatus implies, identical to the original.
export function useSkuSummaryExportReconciled() {
  const { orgMembership } = useProfileStore()
  const role = orgMembership?.role
  const dept = orgMembership?.department
  const memberId = orgMembership?.memberId
  const orgType = orgMembership?.orgType
  const orgId = orgMembership?.orgId
  // Same reasoning as useShipmentSkuSummaryReconciled.js: a supplier/buyer
  // org exporting its own data isn't a merchant staff member, so forcing
  // p_vendor_org_id (supplier) / p_buyer_org_id (buyer) to their own org id
  // is what scopes the export, not linkIds.
  const isSupplierViewer = orgType === 'supplier'
  const isBuyerViewer    = orgType === 'buyer'
  const isScopedOrgViewer = isSupplierViewer || isBuyerViewer

  const [exporting, setExporting] = useState(false)

  const exportToExcel = useCallback(async (filters = {}, mode = 'detailed') => {
    if (!role) return
    setExporting(true)
    try {
      let linkIds = isScopedOrgViewer ? null : (canSeeAll(role, dept) ? null : await resolveMerchantMemberLinkIds(memberId))

      let merchantText = isScopedOrgViewer ? null : (filters.merchant?.trim() || null)
      if (merchantText) {
        const merchantMemberId = await findMerchantMemberId(merchantText)
        if (merchantMemberId) {
          const merchantLinkIds = await resolveMerchantMemberLinkIds(merchantMemberId)
          linkIds = linkIds ? linkIds.filter(id => merchantLinkIds.includes(id)) : merchantLinkIds
          merchantText = null
        }
      }

      if (linkIds && linkIds.length === 0) { alert('No data to export.'); return }

      // 'all'/unset forwards both windows (the RPC OR-matches them); every
      // other status forwards only the field it's bound to — same rule
      // useShipmentSkuSummaryReconciled.js applies for the live table, so
      // caller can pass both misTargetDateFrom/To and misShippedDateFrom/To
      // unconditionally without pre-nulling either one itself.
      const isAllStatus = !filters.status || filters.status === 'all'
      const dateField = isAllStatus ? null : dateFieldForStatus(filters.status)
      const useTarget  = isAllStatus || dateField === 'target'
      const useShipped = isAllStatus || dateField === 'shipped'

      const baseParams = {
        p_link_ids: linkIds,
        p_buyer_org_id: isBuyerViewer ? orgId : (filters.buyerOrgId || null),
        p_vendor_org_id: isSupplierViewer ? orgId : (filters.vendorOrgId || null),
        p_status: filters.status && filters.status !== 'all' ? filters.status : null,
        p_search: filters.search?.trim() || null,
        p_target_date_from: useTarget ? (filters.targetDateFrom || null) : null,
        p_target_date_to: useTarget ? (filters.targetDateTo || null) : null,
        p_shipped_date_from: useShipped ? (filters.shippedDateFrom || null) : null,
        p_shipped_date_to: useShipped ? (filters.shippedDateTo || null) : null,
        p_merchant: filters.merchantExact?.trim() || merchantText,
        p_merchant_exclude: filters.merchantExclude?.trim() || null,
      }

      let allData = []
      let page = 1
      let totalPoCount = null
      while (totalPoCount === null || (page - 1) * EXPORT_PAGE_SIZE < totalPoCount) {
        const { data, error } = await supabase.rpc('get_sku_summary_page_reconciled', {
          ...baseParams, p_page: page, p_page_size: EXPORT_PAGE_SIZE,
        })
        if (error) { console.error('[useSkuSummaryExportReconciled] fetch error:', error.message); alert('Export failed — see console.'); return }
        if (!data?.length) break
        allData = allData.concat(data)
        totalPoCount = Number(data[0].total_po_count)
        page += 1
      }

      if (!allData.length) { alert('No data to export.'); return }

      // Dedupe by line-item id — pagination here is OFFSET/LIMIT over POs
      // ordered by (po_number, po_id) (see sql/sku_summary_rpc_reconciled.sql),
      // stable as long as the underlying rows don't change between page
      // fetches; if they do (or ever did, before that tiebreaker existed), a
      // PO landing on two pages would double its balance/ordered contribution
      // here, since unlike shippedValue (one non-paginated query) these are
      // summed client-side across every fetched row.
      const seenLineItemIds = new Set()
      allData = allData.filter(r => {
        if (seenLineItemIds.has(r.li_id)) return false
        seenLineItemIds.add(r.li_id)
        return true
      })

      const rows = allData.map(r => {
        return {
          id: r.li_id,
          poNumber: r.po_number || '',
          buyerName: titleCaseName(r.buyer_name) || '',
          vendorName: titleCaseName(r.vendor_name) || '',
          skuRef: r.sku_ref || '',
          variant: r.sku_variant || '',
          status: statusLabel(r.status),
          ordered: r.ordered ?? 0,
          orderedValue: r.ordered_value ?? 0,
          shipped: r.shipped ?? 0,
          shippedValue: r.shipped_value ?? 0,
          balance: r.balance ?? 0,
          balanceValue: r.balance_value ?? 0,
          orderDate: r.order_date || '',
          targetDate: r.target_date || '',
          shippedDate: r.shipped_date || '',
        }
      })

      let cols, aoa, sheetName, fileSuffix, pivotRowKinds = null

      if (mode === 'detailed') {
        cols = DETAIL_COLS
        const headers = cols.map(c => c.label)
        const legRows = await fetchLegRows(rows, baseParams.p_shipped_date_from, baseParams.p_shipped_date_to)
        aoa = [headers, ...legRows.map(r => cols.map(c => r[c.key]))]
        sheetName = 'MIS'
        fileSuffix = ''
      } else {
        const metric = metricForStatus(filters.status)

        if (mode === 'summary') {
          if (metric) {
            cols = [
              { key: 'qty', label: metric.qtyLabel, wch: 14 },
              { key: 'value', label: metric.valueLabel, wch: 14 },
            ]
            const totals = rows.reduce((acc, r) => ({
              qty: acc.qty + (r[metric.qtyKey] || 0),
              value: acc.value + (r[metric.valueKey] || 0),
            }), { qty: 0, value: 0 })
            aoa = [cols.map(c => c.label), cols.map(c => totals[c.key])]
          } else {
            cols = [
              { key: 'ordered', label: 'Ordered $', wch: 14 },
              { key: 'shipped', label: 'Shipped $', wch: 14 },
              { key: 'balance', label: 'Balance $', wch: 14 },
            ]
            const totals = rows.reduce((acc, r) => ({
              ordered: acc.ordered + (r.orderedValue || 0),
              shipped: acc.shipped + (r.shippedValue || 0),
              balance: acc.balance + (r.balanceValue || 0),
            }), { ordered: 0, shipped: 0, balance: 0 })
            aoa = [cols.map(c => c.label), cols.map(c => totals[c.key])]
          }
        } else {
          // Pivot: rows = Buyer (bold group header, no values) > Vendor
          // (indented, one number per period column), columns = period
          // (week/month) — a period with zero value across EVERY buyer/
          // vendor is dropped entirely rather than padding the sheet with a
          // mostly-blank column. Follows metricForStatus, same as the
          // Summary sheet above: Balance $ by Target Date for Open/Partial,
          // Shipped $ by Shipped Date for Closed/On Time/Late — an Open PO
          // has no shipped_date/Shipped $ at all (it hasn't shipped), so a
          // Shipped-$-always pivot would just be empty for that status.
          // Falls back to Shipped $ by Shipped Date for 'all'/'cancelled'
          // (no single metric applies there either).
          const pivotDateKey  = metric ? metric.dateKey  : 'shippedDate'
          const pivotValueKey = metric ? metric.valueKey : 'shippedValue'
          const periodLabels  = new Map() // periodKey -> label
          const cellMap       = new Map() // `${buyer}||${vendor}||${periodKey}` -> sum
          const buyerVendors  = new Map() // buyer -> Set(vendor), insertion order irrelevant (sorted below)

          rows.forEach(r => {
            const cellVal = r[pivotValueKey] || 0
            const dateVal = r[pivotDateKey]
            if (!dateVal || !cellVal) return
            const { key, label } = pivotPeriodOf(dateVal, mode)
            periodLabels.set(key, label)
            const buyer  = r.buyerName  || 'Unknown'
            const vendor = r.vendorName || 'Unknown'
            if (!buyerVendors.has(buyer)) buyerVendors.set(buyer, new Set())
            buyerVendors.get(buyer).add(vendor)
            const cellKey = `${buyer}||${vendor}||${key}`
            cellMap.set(cellKey, (cellMap.get(cellKey) || 0) + cellVal)
          })

          // Sorts correctly as plain strings — both period key formats
          // (weekStart ISO date, or "YYYY-MM") are fixed-width.
          const sortedPeriodKeys = [...periodLabels.keys()].sort()
          cols = [
            { key: 'label', label: 'Customer, Vendor', wch: 26 },
            ...sortedPeriodKeys.map(k => ({ key: k, label: periodLabels.get(k), wch: 14 })),
          ]
          const headers = cols.map(c => c.label)

          const bodyRows = []
          pivotRowKinds = []
          const sortedBuyers = [...buyerVendors.keys()].sort((a, b) => a.localeCompare(b))
          sortedBuyers.forEach(buyer => {
            bodyRows.push([buyer, ...sortedPeriodKeys.map(() => null)])
            pivotRowKinds.push('group')
            const buyerTotals = sortedPeriodKeys.map(() => 0)
            ;[...buyerVendors.get(buyer)].sort((a, b) => a.localeCompare(b)).forEach(vendor => {
              const vendorValues = sortedPeriodKeys.map((k, i) => {
                const v = cellMap.get(`${buyer}||${vendor}||${k}`) || 0
                buyerTotals[i] += v
                return v || null
              })
              bodyRows.push([vendor, ...vendorValues])
              pivotRowKinds.push('data')
            })
            // Subtotal, then a blank spacer row, before the next buyer's
            // own block — makes each buyer's section visually self-
            // contained instead of running straight into the next one.
            bodyRows.push(['Subtotal', ...buyerTotals.map(v => v || null)])
            pivotRowKinds.push('subtotal')
            bodyRows.push([null, ...sortedPeriodKeys.map(() => null)])
            pivotRowKinds.push('blank')
          })
          aoa = [headers, ...bodyRows]
        }
        sheetName = mode === 'weekly' ? 'Weekly Totals' : mode === 'monthly' ? 'Monthly Totals' : 'Summary'
        fileSuffix = `_${sheetName.replace(/\s+/g, '_')}`
      }

      // "All" status forwards both date windows so the RPC's OR-matching
      // kicks in (see header comment) — meaning a line item's balance can
      // come from a PO targeted in a DIFFERENT financial year that only has
      // shipment activity inside the selected window. That balance is real,
      // but it's why this total can run higher than a strict "target date
      // in this FY" count (e.g. the dashboard's own Total Open KPI tile).
      // Computed the same way as that cross-check: any row with balance
      // outstanding whose own targetDate falls outside the selected target
      // window (or has none at all) only qualified via its shipped leg.
      const extraOpenAmount = rows.reduce((sum, r) => {
        if (!(r.balanceValue > 0)) return sum
        const outsideTargetWindow =
          !r.targetDate ||
          (filters.targetDateFrom && r.targetDate < filters.targetDateFrom) ||
          (filters.targetDateTo && r.targetDate > filters.targetDateTo)
        return outsideTargetWindow ? sum + r.balanceValue : sum
      }, 0)

      // Not relevant to the pivot sheet (weekly/monthly) — that's Shipped $
      // only, no Balance $ figure for this caveat to explain.
      const extraSheets = (isAllStatus && !pivotRowKinds) ? [{
        name: 'Notes',
        rows: [
          ['Note on Open Value (Balance) in this export'],
          ['This is the "All" status view, which matches a PO here if its target date falls in the selected date range OR it has shipment activity in that range.'],
          ['As a result, Open Value can include the remaining unshipped balance of a PO that was originally targeted for a different financial year but is still partially shipping within the selected range.'],
          [`Of the Open Value in this export, approximately $${extraOpenAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} belongs to POs targeted for a different financial year than the one selected.`],
          ['That balance is genuine (it is unshipped and outstanding), but it means this total can be higher than a stricter "target date in this range only" count — e.g. the dashboard\'s own Total Open KPI tile, which does not include it.'],
        ],
      }] : []

      const date = new Date().toISOString().slice(0, 10)
      if (pivotRowKinds) {
        downloadPivotXlsx(aoa, pivotRowKinds, sheetName, `MIS${fileSuffix}_${date}.xlsx`, extraSheets)
      } else {
        downloadSummaryXlsx(aoa, sheetName, `MIS${fileSuffix}_${date}.xlsx`, extraSheets)
      }
    } finally {
      setExporting(false)
    }
  }, [role, dept, memberId, orgId, isSupplierViewer, isBuyerViewer, isScopedOrgViewer])

  return { exportToExcel, exporting }
}
