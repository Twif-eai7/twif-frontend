// Client-side period bucketing for the QC Reports Open-vs-Inspected trend
// chart, modeled on otifMonthly.js's convention: build a dense, ordered key
// list first (so a period with zero activity still renders as a real zero
// bucket, not a gap), then do one pass over the raw rows into a Map keyed by
// that same bucket key.

import { reportEffectiveDate } from './reportEffectiveDate'

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad2(n) { return String(n).padStart(2, '0') }
function fmtISOLocal(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }

// Bare "YYYY-MM-DD" dates (po_received_date, inspection_date) need the
// T00:00:00 suffix to parse as local midnight rather than UTC midnight.
function toLocalDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`)
  return isNaN(d) ? null : d
}

function monthKeyOf(dateStr) {
  const d = toLocalDate(dateStr)
  return d ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}` : null
}
function dayKeyOf(dateStr) {
  const d = toLocalDate(dateStr)
  return d ? fmtISOLocal(d) : null
}
function yearKeyOf(dateStr) {
  const d = toLocalDate(dateStr)
  return d ? String(d.getFullYear()) : null
}

function monthKeyToLabel(key) {
  const [yr, m] = key.split('-')
  return `${SHORT_MONTHS[parseInt(m, 10) - 1] || m} ${yr}`
}
const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function dayKeyToLabel(key) {
  const d = toLocalDate(key)
  return d ? `${SHORT_WEEKDAYS[d.getDay()]} ${d.getDate()}` : key
}
function yearKeyToLabel(key) { return key }

function monthKeysBack(n) {
  const first = new Date()
  first.setDate(1)
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(first.getFullYear(), first.getMonth() - (n - 1 - i), 1)
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}`
  })
}
function dayKeysBack(n) {
  const today = new Date()
  return Array.from({ length: n }, (_, i) => fmtISOLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (n - 1 - i))))
}
function yearKeysBack(n) {
  const y = new Date().getFullYear()
  return Array.from({ length: n }, (_, i) => String(y - (n - 1 - i)))
}

const GRANULARITY = {
  month: { keyOf: monthKeyOf, keysBack: () => monthKeysBack(12), labelOf: monthKeyToLabel },
  // "Week" tab: daily bars for the trailing 7 days, not week-over-week
  // buckets - per explicit user request, a day-by-day view of the most
  // recent week rather than 12 weekly totals.
  week:  { keyOf: dayKeyOf,   keysBack: () => dayKeysBack(7),    labelOf: dayKeyToLabel },
  year:  { keyOf: yearKeyOf,  keysBack: () => yearKeysBack(2),   labelOf: yearKeyToLabel },
}

// openPoRows: purchase_orders rows (already filtered "open" + buyer/vendor/
// merchant scoped), each carrying po_received_date and a po_line_items array
// (its SKUs). inspectedRows: inspection_reports rows (already filtered
// submitted + buyer/vendor/inspector/merchant scoped), each carrying
// inspection_date, po_line_item_id, and the nested po_line_items ->
// purchase_orders path for its parent PO id.
export function computeOpenVsInspectedTrend(openPoRows, inspectedRows, granularity = 'month') {
  const g = GRANULARITY[granularity] || GRANULARITY.month
  const keys = g.keysBack()
  const byKey = new Map(keys.map(k => [k, {
    openPoIds: new Set(), inspectedPoIds: new Set(),
    openSkuIds: new Set(), inspectedSkuIds: new Set(),
  }]))

  for (const po of openPoRows) {
    const bucket = byKey.get(g.keyOf(po.po_received_date))
    if (!bucket) continue
    bucket.openPoIds.add(po.id)
    for (const li of (po.po_line_items || [])) bucket.openSkuIds.add(li.id)
  }

  for (const r of inspectedRows) {
    const bucket = byKey.get(g.keyOf(reportEffectiveDate(r)))
    if (!bucket) continue
    const poId = r.po_line_items?.purchase_orders?.id
    if (poId) bucket.inspectedPoIds.add(poId)
    if (r.po_line_item_id) bucket.inspectedSkuIds.add(r.po_line_item_id)
  }

  return keys.map(key => {
    const b = byKey.get(key)
    return {
      key,
      label: g.labelOf(key),
      openPos: b.openPoIds.size,
      inspectedPos: b.inspectedPoIds.size,
      openSkus: b.openSkuIds.size,
      inspectedSkus: b.inspectedSkuIds.size,
    }
  })
}
