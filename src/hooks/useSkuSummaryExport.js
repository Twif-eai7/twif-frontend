import { useState, useCallback } from 'react'
import { downloadSummaryXlsx, downloadPivotXlsx } from '../utils/xlsxExport'
import { supabase } from '../lib/supabase'
import { useProfileStore } from '../stores/profileStore'
import { resolveMerchantMemberLinkIds, findMerchantMemberId } from '../lib/poQueries'
import { titleCaseName } from '../utils/formatters'
import { statusLabel } from '../utils/skuStatus'

// Same visibility rule as useShipmentSkuSummary.js / usePendingWorkOverview.js.
function canSeeAll(role, dept) {
  return role === 'admin' || role === 'owner' || dept === 'tech'
}

// Flat, one row per SKU line item — no merged cells, no PO group headers,
// so it opens straight into a normal filterable/sortable Excel table.
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
]

// POs per RPC request while paging through the export. A single oversized
// request (page_size in the millions) gets silently truncated by
// PostgREST's own per-request row cap (commonly 1000-2000 rows, regardless
// of the LIMIT inside get_sku_summary_page's own SQL) — confirmed via a
// production export that cut off at exactly 2,000 rows while the stats card
// showed 2,419 total SKUs. Paging in modest chunks and accumulating across
// requests, the same way the on-screen table already does, keeps every
// individual request comfortably under that cap regardless of how big a
// single PO's SKU count runs.
const EXPORT_PAGE_SIZE = 20

// Which $ figure a totals export (Weekly/Monthly/Summary) reports, and which
// date field it's grouped by, depends on the active status filter — the same
// distinction this page's Target-FY vs Shipped-FY pills draw: "Shipped"
// totals are keyed to when a leg actually shipped, everything else is keyed
// to when it's due. Aggregating from the exact same detail rows the regular
// export already fetches (rather than a second, separately-filtered SQL
// aggregate) means these totals can never drift from the detailed sheet the
// way the MIS-vs-AnalyticsV2 numbers did.
function metricForStatus(status) {
  if (status === 'closed' || status === 'on_time' || status === 'late') {
    return { dateKey: 'shippedDate', qtyKey: 'shipped', valueKey: 'shippedValue', qtyLabel: 'Shipped Qty', valueLabel: 'Shipped $' }
  }
  if (status === 'open' || status === 'partial') {
    return { dateKey: 'targetDate', qtyKey: 'balance', valueKey: 'balanceValue', qtyLabel: 'Balance Qty', valueLabel: 'Balance $' }
  }
  return null // 'all' / 'cancelled' / unset — no single status lens, show Ordered/Shipped/Balance together
}

function weekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + ((day === 0 ? -6 : 1) - day)) // shift back to Monday
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

// Every SKU row matching the current filters, across ALL pages — not just
// the page currently on screen.
export function useSkuSummaryExport() {
  const { orgMembership } = useProfileStore()
  const role = orgMembership?.role
  const dept = orgMembership?.department
  const memberId = orgMembership?.memberId

  const [exporting, setExporting] = useState(false)

  // mode: 'detailed' (default, unchanged) | 'weekly' | 'monthly' | 'summary'
  const exportToExcel = useCallback(async (filters = {}, mode = 'detailed') => {
    if (!role) return
    setExporting(true)
    try {
      let linkIds = canSeeAll(role, dept) ? null : await resolveMerchantMemberLinkIds(memberId)

      // Merchant filter: prefer scoping to that merchant's own assigned
      // buyer access rather than ANDing a literal created_by text match on
      // top of the buyer/vendor filters — see useShipmentSkuSummary.js for
      // why that combination can zero out real data.
      let merchantText = filters.merchant?.trim() || null
      if (merchantText) {
        const merchantMemberId = await findMerchantMemberId(merchantText)
        if (merchantMemberId) {
          const merchantLinkIds = await resolveMerchantMemberLinkIds(merchantMemberId)
          linkIds = linkIds ? linkIds.filter(id => merchantLinkIds.includes(id)) : merchantLinkIds
          merchantText = null
        }
      }

      if (linkIds && linkIds.length === 0) { alert('No data to export.'); return }

      const baseParams = {
        p_link_ids: linkIds,
        p_buyer_org_id: filters.buyerOrgId || null,
        p_vendor_org_id: filters.vendorOrgId || null,
        p_status: filters.status && filters.status !== 'all' ? filters.status : null,
        p_search: filters.search?.trim() || null,
        p_target_date_from: filters.targetDateFrom || null,
        p_target_date_to: filters.targetDateTo || null,
        p_shipped_date_from: filters.shippedDateFrom || null,
        p_shipped_date_to: filters.shippedDateTo || null,
        // merchantExact bypasses the resolveMerchantMemberLinkIds
        // substitution above — see useShipmentSkuSummary.js for why (a
        // merchant like Lakshit Bohra whose real DB access is broader than
        // just his own POs, where that substitution silently widens the
        // filter back out instead of narrowing it).
        p_merchant: filters.merchantExact?.trim() || merchantText,
        // See useShipmentSkuSummary.js — a plain created_by NOT ILIKE match,
        // no link-scoping shortcut, for a merchant whose slice is defined as
        // "everything except someone else's POs" rather than a positive
        // name match.
        p_merchant_exclude: filters.merchantExclude?.trim() || null,
      }

      let allData = []
      let page = 1
      let totalPoCount = null
      while (totalPoCount === null || (page - 1) * EXPORT_PAGE_SIZE < totalPoCount) {
        const { data, error } = await supabase.rpc('get_sku_summary_page', {
          ...baseParams, p_page: page, p_page_size: EXPORT_PAGE_SIZE,
        })
        if (error) { console.error('[useSkuSummaryExport] fetch error:', error.message); alert('Export failed — see console.'); return }
        if (!data?.length) break
        allData = allData.concat(data)
        totalPoCount = Number(data[0].total_po_count)
        page += 1
      }

      if (!allData.length) { alert('No data to export.'); return }

      const rows = allData.map(r => {
        return {
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
        aoa = [headers, ...rows.map(r => cols.map(c => r[c.key]))]
        sheetName = 'MIS'
        fileSuffix = ''
      } else {
        const metric = metricForStatus(filters.status)

        if (mode === 'summary') {
          // One grand total, no period breakdown at all.
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
          const buyerVendors  = new Map() // buyer -> Set(vendor)

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

      const date = new Date().toISOString().slice(0, 10)
      if (pivotRowKinds) {
        downloadPivotXlsx(aoa, pivotRowKinds, sheetName, `MIS${fileSuffix}_${date}.xlsx`)
      } else {
        downloadSummaryXlsx(aoa, sheetName, `MIS${fileSuffix}_${date}.xlsx`)
      }
    } finally {
      setExporting(false)
    }
  }, [role, dept, memberId])

  return { exportToExcel, exporting }
}
