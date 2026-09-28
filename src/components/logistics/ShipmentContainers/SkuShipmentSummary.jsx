import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { useShipmentSkuSummary, SKU_SUMMARY_PAGE_SIZE } from '../../../hooks/useShipmentSkuSummary'
import { useBuyerOptions } from '../../../hooks/useBuyerOptions'
import { useMerchantOptions } from '../../../hooks/useMerchantOptions'
import { useProfileStore } from '../../../stores/profileStore'
import {
  resolveSupplierOrgsForBuyer, resolveSupplierNamesForMember,
  resolveBuyerOrgsForMerchant, resolveSupplierOrgsForMerchant,
} from '../../../lib/poQueries'
import { fmtQty, fmt$ } from '../../orderManagement/poUtils'
import SearchableSelect from '../../ui/SearchableSelect'
import SkuLegBreakdownDrawer from './SkuLegBreakdownDrawer'
import { deriveStatusKey, statusLabel } from '../../../utils/skuStatus'
import { useSkuSummaryExport } from '../../../hooks/useSkuSummaryExport'

// Same pulse pattern as PoRecord.jsx's SkeletonRows, adapted to this
// table's 8 columns — keeps the real thead visible while loading instead of
// replacing the whole table with a spinner, so the layout doesn't jump once
// data arrives.
function SkeletonRows() {
  const widths = [90, 40, 40, 30, 60, 60, 70, 60]
  return Array.from({ length: 6 }, (_, i) => (
    <tr key={i} className="border-b border-gray-100 last:border-b-0">
      {widths.map((w, j) => (
        <td key={j} className="px-3 py-2">
          <div className="h-3 rounded bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse" style={{ width: `${w}%` }} />
        </td>
      ))}
    </tr>
  ))
}

// Mobile equivalent of SkeletonRows — same card shape as the real
// (md:hidden) list below, just pulsing placeholder bars instead of data.
function SkeletonCards() {
  return Array.from({ length: 4 }, (_, i) => (
    <div key={i} className="px-3 py-3 border-b border-gray-100 last:border-b-0 space-y-2">
      <div className="h-3 w-2/5 rounded bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse" />
      <div className="h-3 w-3/5 rounded bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map(j => (
          <div key={j} className="h-3 rounded bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse" />
        ))}
      </div>
    </div>
  ))
}

// Same StatCard shell as PoRecord.jsx's PO Summary Dashboard, so the two
// "dashboard" screens in this app read as one family. While loading, the
// value/subValue text is swapped for pulsing bars — same visual language as
// SkeletonRows/SkeletonCards below — instead of showing stale or zeroed-out
// numbers with no indication a fetch is in flight.
function StatCard({ label, value, subValue, accent, icon, pct, loading }) {
  return (
    <div className={`relative bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 shadow-sm overflow-hidden before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 ${accent}`}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-200 text-gray-600">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">{label}</div>
        {loading ? (
          <>
            <div className="h-6 w-20 rounded bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse" />
            {subValue != null && (
              <div className="h-4 w-14 mt-1 rounded bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse" />
            )}
          </>
        ) : (
          <>
            <div className="text-xl sm:text-2xl font-bold text-emerald-700 leading-tight truncate">{value ?? '—'}</div>
            {subValue != null && (
              <div className="text-xs sm:text-sm font-bold text-gray-500 leading-tight truncate">{subValue}</div>
            )}
          </>
        )}
      </div>
      {pct != null && !loading && (
        <span className="flex-shrink-0 text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-300 px-2 py-0.5 rounded-full">{pct}</span>
      )}
    </div>
  )
}

const STATUS_BADGE = {
  open:      'bg-gray-100 text-gray-600',
  partial:   'bg-amber-100 text-amber-800',
  closed:    'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-700',
}
function statusBadge(key) {
  return STATUS_BADGE[key] ?? 'bg-gray-100 text-gray-600'
}

const PROGRESS_BAR_COLOR = {
  open:      'bg-gray-300',
  partial:   'bg-amber-400',
  closed:    'bg-emerald-500',
  cancelled: 'bg-red-300',
}
// % of a PO's shipped quantity against what's actually still expected to
// ship (ordered minus cancelled) — same "remaining" basis deriveStatusKey
// uses, so the bar and the status badge next to it never disagree.
function poProgressPct(group) {
  const remaining = group.totalOrdered - (group.totalCancelled || 0)
  if (remaining <= 0) return 0
  return Math.min(100, Math.round((group.totalShipped / remaining) * 100))
}

const STATUS_FILTERS = [
  { key: 'all',       label: 'All' },
  { key: 'open',      label: 'Open' },
  { key: 'partial',   label: 'Partial' },
  { key: 'closed',    label: 'Shipped' },
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
const FY_RANGES = {
  fy26: ['2025-04-01', '2026-03-31'],
  fy27: ['2026-04-01', '2027-03-31'],
}

// AnalyticsV2Section's Open POs By Months table drills into a single month
// (labelToSlug's "YYYY-MM") rather than a whole FY — same date-range filter
// as the "Year" pills above, just narrowed to that month's own bounds.
function monthSlugToRange(slug) {
  const m = /^(\d{4})-(\d{2})$/.exec(slug || '')
  if (!m) return null
  const [, y, mo] = m
  const lastDay = new Date(Number(y), Number(mo), 0).getDate()
  return [`${y}-${mo}-01`, `${y}-${mo}-${String(lastDay).padStart(2, '0')}`]
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Read-only, interactive "sailed out summary" for every SKU on every PO this
// member can see — the Logistics MIS landing page. Recent Plannings (the
// old landing screen, grouping/booking work) moves behind the "Planning &
// Shipment" button instead of being the first thing you see.
//
// Filtering, pagination and the stat-card totals all run server-side
// (sql/sku_summary_rpc.sql) — pulling all 13k+ line items into the browser
// to filter/paginate/group in JS froze the page, so the client only ever
// holds one page's worth of rows (paginated by PO, so a PO's SKUs never
// split across two pages).
export default function SkuShipmentSummary({ onOpenPlanning, initialFilters }) {
  const { orgMembership } = useProfileStore()
  const { buyers } = useBuyerOptions()
  // Admin/owner only — same "Merchant" concept and same audience as
  // PoRecord.jsx's Merchant filter (purchase_orders.created_by).
  const isAdminOrOwner = orgMembership?.role === 'admin' || orgMembership?.role === 'owner'
  const merchantOptions = useMerchantOptions(isAdminOrOwner)

  // Everything deep-linkable that DOESN'T need an async name→id lookup
  // (status, dates, merchant's free text) is seeded straight into these
  // useState initializers instead of being applied via an effect after
  // mount — the effect approach fetches once unfiltered, then again once
  // the effect runs, which is exactly the "loads, then reloads a moment
  // later" flash this was written to avoid. Only buyer/vendor (org names
  // that must be resolved to ids against an async-loaded options list)
  // still need the effect-based approach below.
  const initialDateRange = initialFilters?.month
    ? monthSlugToRange(initialFilters.month)
    : initialFilters?.fy ? FY_RANGES[initialFilters.fy] : null
  const initialTargetRange = initialDateRange && initialFilters?.dateField !== 'shipped' ? initialDateRange : null
  const initialShippedRange = initialDateRange && initialFilters?.dateField === 'shipped' ? initialDateRange : null

  const [search, setSearch] = useState('')
  const [buyerFilter, setBuyerFilter] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')   // vendor org id
  const [merchantFilter, setMerchantFilter] = useState(() => initialFilters?.merchant || '')
  // Deep-link only, no UI control — a plain created_by NOT ILIKE match (see
  // useShipmentSkuSummary.js), for a merchant whose slice is defined as
  // "everything except someone else's POs" (Shayni Sharma's House Doctor
  // view = everything except Lakshit Bohra's) rather than a positive name
  // match on their own, which isn't reliable for every merchant.
  const [merchantExcludeFilter] = useState(() => initialFilters?.merchantExclude || '')
  // Deep-link only, no UI control either — the positive counterpart to
  // merchantExclude above. A plain created_by ILIKE match that bypasses
  // useShipmentSkuSummary.js's usual "prefer the matched member's own
  // assigned buyer access" substitution, for a merchant (Lakshit Bohra)
  // whose real DB access is broader than just his own POs, where that
  // substitution would otherwise silently widen the filter back out to
  // everyone's POs instead of narrowing it to his.
  const [merchantExactFilter] = useState(() => initialFilters?.merchantExact || '')
  const [statusFilter, setStatusFilter] = useState(() => initialFilters?.status || 'all')
  const [targetDateFrom, setTargetDateFrom] = useState(() => initialTargetRange?.[0] || '')
  const [targetDateTo, setTargetDateTo] = useState(() => initialTargetRange?.[1] || '')
  const [shippedDateFrom, setShippedDateFrom] = useState(() => initialShippedRange?.[0] || '')
  const [shippedDateTo, setShippedDateTo] = useState(() => initialShippedRange?.[1] || '')
  const [page, setPage] = useState(1)
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [legDrawerItem, setLegDrawerItem] = useState(null)

  // Buyer needs the buyer list loaded first to resolve a deep-linked name to
  // an org id — filtersReady gates useShipmentSkuSummary's fetch so it never
  // fires the unfiltered default fetch first only to immediately refetch
  // once this resolves; it starts "ready" when there's no buyer to resolve.
  const [filtersReady, setFiltersReady] = useState(!initialFilters?.buyer)
  const appliedInitialBuyer = useRef(false)
  useEffect(() => {
    if (!initialFilters?.buyer || appliedInitialBuyer.current) return
    if (!buyers.length) return
    appliedInitialBuyer.current = true

    const match = buyers.find(b => b.name.toLowerCase() === initialFilters.buyer.toLowerCase())
    Promise.resolve().then(() => {
      if (match) setBuyerFilter(match.id)
      setFiltersReady(true)
    })
  }, [initialFilters, buyers])

  const { rows, stats, loading, totalPoCount, totalPages } = useShipmentSkuSummary({
    enabled: filtersReady,
    buyerOrgId: buyerFilter || null,
    vendorOrgId: vendorFilter || null,
    status: statusFilter,
    search,
    page,
    targetDateFrom: targetDateFrom || null,
    targetDateTo: targetDateTo || null,
    shippedDateFrom: shippedDateFrom || null,
    shippedDateTo: shippedDateTo || null,
    merchant: merchantFilter || null,
    merchantExclude: merchantExcludeFilter || null,
    merchantExact: merchantExactFilter || null,
  })

  const toggleCollapsed = (key) => setCollapsed(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const { exportToExcel, exporting } = useSkuSummaryExport()
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  // Exports every matching SKU across all pages, respecting whatever
  // filters are currently active — not just the page on screen. mode
  // 'detailed' keeps the original one-row-per-SKU sheet; 'weekly'/'monthly'/
  // 'summary' instead report totals — which $ figure depends on the active
  // status filter (see metricForStatus in the hook).
  const handleExport = (mode) => exportToExcel({
    buyerOrgId: buyerFilter || null,
    vendorOrgId: vendorFilter || null,
    status: statusFilter,
    search,
    targetDateFrom: targetDateFrom || null,
    targetDateTo: targetDateTo || null,
    shippedDateFrom: shippedDateFrom || null,
    shippedDateTo: shippedDateTo || null,
    merchant: merchantFilter || null,
    merchantExclude: merchantExcludeFilter || null,
    merchantExact: merchantExactFilter || null,
  }, mode)

  useEffect(() => {
    if (!exportMenuOpen) return
    const close = () => setExportMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [exportMenuOpen])

  // Merchant → Buyer cascade: once a Merchant is picked, the Buyer list
  // narrows to only buyers that merchant has actually created POs for
  // (same cascading idea as PoRecord.jsx's Merchant/Buyer/Vendor filters).
  const [buyerOptionsForMerchant, setBuyerOptionsForMerchant] = useState(null)
  useEffect(() => {
    const load = merchantFilter ? resolveBuyerOrgsForMerchant(merchantFilter) : Promise.resolve(null)
    load.then(setBuyerOptionsForMerchant)
  }, [merchantFilter])

  const effectiveBuyers = merchantFilter && buyerOptionsForMerchant ? buyerOptionsForMerchant : buyers

  const buyerOptions = useMemo(() => ([
    { value: '', label: 'All Buyers' },
    ...effectiveBuyers.map(b => ({ value: b.id, label: b.name })),
  ]), [effectiveBuyers])

  // Vendor options resolved server-side, scoped to whichever of
  // Merchant/Buyer are selected — no longer scanned from loaded rows, since
  // only one page of rows is ever held on the client.
  const [vendorOptionsRaw, setVendorOptionsRaw] = useState([])
  useEffect(() => {
    const memberId = orgMembership?.memberId
    const load = merchantFilter
      ? resolveSupplierOrgsForMerchant(merchantFilter, buyerFilter || null)
      : buyerFilter
        ? resolveSupplierOrgsForBuyer(memberId, buyerFilter)
        : resolveSupplierNamesForMember(memberId)
    load.then(setVendorOptionsRaw)
  }, [buyerFilter, merchantFilter, orgMembership?.memberId])

  const vendorOptions = useMemo(() => ([
    { value: '', label: 'All Vendors' },
    ...vendorOptionsRaw.map(v => ({ value: v.id, label: v.name })),
  ]), [vendorOptionsRaw])

  // Deep-linked vendor name (see initialFilters effect above) — resolved to
  // an org id once vendorOptionsRaw has actually loaded something, since it
  // depends on the buyer/merchant filters that effect just applied.
  const appliedInitialVendor = useRef(false)
  useEffect(() => {
    if (!initialFilters?.vendor || appliedInitialVendor.current) return
    if (!vendorOptionsRaw.length) return
    appliedInitialVendor.current = true
    const match = vendorOptionsRaw.find(v => v.name.toLowerCase() === initialFilters.vendor.toLowerCase())
    if (match) Promise.resolve().then(() => setVendorFilter(match.id))
  }, [initialFilters, vendorOptionsRaw])

  // Grouped by PO — each group's header carries buyer/vendor/PO# (so those
  // columns don't repeat on every SKU row) plus a rolled-up ordered/shipped
  // total. Cheap to do client-side now: only this one page's ~20 POs, not
  // the full 13k-row dataset.
  const poGroups = useMemo(() => {
    const map = new Map()
    rows.forEach(row => {
      const key = row.poId
      if (!map.has(key)) {
        map.set(key, {
          key, poId: row.poId, poNumber: row.poNumber,
          buyerName: row.buyerName, vendorName: row.vendorName,
          rows: [],
        })
      }
      map.get(key).rows.push(row)
    })
    const groups = [...map.values()]
    groups.forEach(g => {
      g.totalOrdered = g.rows.reduce((s, r) => s + r.ordered, 0)
      g.totalShipped = g.rows.reduce((s, r) => s + r.shipped, 0)
      g.totalCancelled = g.rows.reduce((s, r) => s + (r.cancelled || 0), 0)
      // PO-level status collapses all its SKUs into one badge — same
      // quantity-based derivation as a single row, just fed the group's
      // totals instead of one SKU's numbers.
      g.statusKey = deriveStatusKey({ ordered: g.totalOrdered, shipped: g.totalShipped, cancelled: g.totalCancelled })
    })
    return groups
  }, [rows])

  // "All collapsed" only means something once there's something to collapse —
  // an empty page shouldn't show the button as already toggled.
  const allCollapsed = poGroups.length > 0 && poGroups.every(g => collapsed.has(g.key))
  const toggleCollapseAll = () => {
    setCollapsed(allCollapsed ? new Set() : new Set(poGroups.map(g => g.key)))
  }

  const pctShipped = stats.ordered ? `${Math.round((stats.shipped / stats.ordered) * 100)}%` : null

  // merchantExcludeFilter deliberately isn't part of this or clearFilters
  // below — it's an identity-level scope ("this is Shayni's own view", set
  // once from the deep link), not a filter the user toggles, so "Clear"
  // shouldn't reset it any more than it would reset a non-admin's own
  // permission-based row scoping.
  const hasActiveFilters = !!(
    search || buyerFilter || vendorFilter || merchantFilter || statusFilter !== 'all' ||
    targetDateFrom || targetDateTo || shippedDateFrom || shippedDateTo
  )
  const clearFilters = () => {
    setSearch(''); setBuyerFilter(''); setVendorFilter(''); setMerchantFilter(''); setStatusFilter('all')
    setTargetDateFrom(''); setTargetDateTo(''); setShippedDateFrom(''); setShippedDateTo('')
    setPage(1)
  }

  // Any filter change resets to page 1 — a stale page number from a
  // narrower/wider result set would otherwise point at the wrong POs.
  const setStatusFilterAndReset = (v) => { setStatusFilter(v); setPage(1) }
  const setBuyerFilterAndReset = (v) => { setBuyerFilter(v); setVendorFilter(''); setPage(1) }
  const setVendorFilterAndReset = (v) => { setVendorFilter(v); setPage(1) }
  const setMerchantFilterAndReset = (v) => { setMerchantFilter(v); setBuyerFilter(''); setVendorFilter(''); setPage(1) }
  const setSearchAndReset = (v) => { setSearch(v); setPage(1) }
  const setTargetDateFromAndReset = (v) => { setTargetDateFrom(v); setPage(1) }
  const setTargetDateToAndReset = (v) => { setTargetDateTo(v); setPage(1) }
  const setShippedDateFromAndReset = (v) => { setShippedDateFrom(v); setPage(1) }
  const setShippedDateToAndReset = (v) => { setShippedDateTo(v); setPage(1) }

  // Derived, not stored — a Year pill is "active" only when its date range
  // exactly matches that FY's bounds, so manually editing the dates (or
  // clearing them) naturally falls back to no year selected instead of two
  // sources of truth drifting apart.
  //
  // Two separate pill groups, not one: "Target FY" (due date) and "Shipped
  // FY" (actual ship date) answer different questions and can disagree for
  // a PO that shipped early/late relative to its target — same distinction
  // AnalyticsV2 draws between its Open (target_date) and Shipped
  // (shipped_date) KPIs. Each pill only ever sets its own date-range pair,
  // so the table and stat cards never silently disagree with each other the
  // way two independently-dated KPI tiles could.
  const activeTargetYear = Object.keys(FY_RANGES).find(
    fy => targetDateFrom === FY_RANGES[fy][0] && targetDateTo === FY_RANGES[fy][1]
  ) ?? 'all'
  const setTargetYearFilter = (fy) => {
    if (fy === 'all') { setTargetDateFrom(''); setTargetDateTo('') }
    else { setTargetDateFrom(FY_RANGES[fy][0]); setTargetDateTo(FY_RANGES[fy][1]) }
    setPage(1)
  }
  const activeShippedYear = Object.keys(FY_RANGES).find(
    fy => shippedDateFrom === FY_RANGES[fy][0] && shippedDateTo === FY_RANGES[fy][1]
  ) ?? 'all'
  const setShippedYearFilter = (fy) => {
    if (fy === 'all') { setShippedDateFrom(''); setShippedDateTo('') }
    else { setShippedDateFrom(FY_RANGES[fy][0]); setShippedDateTo(FY_RANGES[fy][1]) }
    setPage(1)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 w-full py-4 px-4 space-y-4 text-sm">

      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-900 rounded-lg flex items-center justify-center text-white flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 leading-tight">MIS</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {loading ? 'Loading…' : `${totalPoCount} PO${totalPoCount === 1 ? '' : 's'}${buyers.length > 1 ? ' across all buyers' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setExportMenuOpen(v => !v)} disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 cursor-pointer disabled:cursor-default transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {exporting ? 'Exporting…' : 'Export'}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
                <button type="button" onClick={() => { handleExport('detailed'); setExportMenuOpen(false) }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
                  Detailed (SKU-level)
                </button>
                <div className="my-1 border-t border-gray-100" />
                <button type="button" onClick={() => { handleExport('weekly'); setExportMenuOpen(false) }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
                  Weekly Totals
                </button>
                <button type="button" onClick={() => { handleExport('monthly'); setExportMenuOpen(false) }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
                  Monthly Totals
                </button>
                <button type="button" onClick={() => { handleExport('summary'); setExportMenuOpen(false) }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
                  Summary Totals
                </button>
              </div>
            )}
          </div>
          {onOpenPlanning && (
            <button type="button" onClick={onOpenPlanning}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              Planning & Shipment
            </button>
          )}
        </div>
      </div>

      {/* Stat cards — server-side aggregates across the full filtered set,
          not just the current page. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total POs" value={fmtQty(totalPoCount)} accent="before:bg-gray-900" loading={loading}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41L13.42 20.59a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>} />
        <StatCard label="Ordered" value={fmt$(stats.orderedValue)} accent="before:bg-indigo-500" loading={loading}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>} />
        <StatCard label="Shipped" value={fmt$(stats.shippedValue)} accent="before:bg-emerald-500" pct={pctShipped} loading={loading}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /></svg>} />
        <StatCard label="Balance" value={fmt$(stats.balanceValue)} accent="before:bg-amber-400" loading={loading}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>} />
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_FILTERS.map(f => (
              <button key={f.key} type="button" onClick={() => setStatusFilterAndReset(f.key)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer
                  ${statusFilter === f.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative w-50">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearchAndReset(e.target.value)}
              placeholder="Search SKU or PO #…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
            />
          </div>
          {isAdminOrOwner && (
            <div className="w-44">
              <SearchableSelect
                options={[{ value: '', label: 'All Merchants' }, ...merchantOptions.map(m => ({ value: m, label: m }))]}
                value={merchantFilter}
                onChange={setMerchantFilterAndReset}
                placeholder="All Merchants"
                triggerClassName="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:border-gray-900 transition-colors"
                dropdownClassName="border border-gray-200 rounded-lg mt-1 shadow-lg"
              />
            </div>
          )}
          {effectiveBuyers.length > 1 && (
            <div className="w-44">
              <SearchableSelect
                options={buyerOptions}
                value={buyerFilter}
                onChange={setBuyerFilterAndReset}
                placeholder="All Buyers"
                triggerClassName="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:border-gray-900 transition-colors"
                dropdownClassName="border border-gray-200 rounded-lg mt-1 shadow-lg"
              />
            </div>
          )}
          <div className="w-44">
            <SearchableSelect
              options={vendorOptions}
              value={vendorFilter}
              onChange={setVendorFilterAndReset}
              placeholder="All Vendors"
              triggerClassName="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:border-gray-900 transition-colors"
              dropdownClassName="border border-gray-200 rounded-lg mt-1 shadow-lg"
            />
          </div>
          {hasActiveFilters && (
            <button type="button" onClick={clearFilters}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-500 hover:bg-red-100 transition-colors cursor-pointer">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 items-center pt-3 border-t border-gray-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Target Date</span>
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">From</span>
            <input type="date" value={targetDateFrom} onChange={e => setTargetDateFromAndReset(e.target.value)}
              className="w-32 sm:w-36 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:border-gray-900 transition-colors" />
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">To</span>
            <input type="date" value={targetDateTo} onChange={e => setTargetDateToAndReset(e.target.value)}
              className="w-32 sm:w-36 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:border-gray-900 transition-colors" />
            <div className="flex items-center gap-1 ml-0.5">
              {[{ key: 'fy26', label: 'FY26' }, { key: 'fy27', label: 'FY27' }].map(f => (
                <button key={f.key} type="button" onClick={() => setTargetYearFilter(activeTargetYear === f.key ? 'all' : f.key)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer
                    ${activeTargetYear === f.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Shipped Date</span>
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">From</span>
            <input type="date" value={shippedDateFrom} onChange={e => setShippedDateFromAndReset(e.target.value)}
              className="w-32 sm:w-36 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:border-gray-900 transition-colors" />
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">To</span>
            <input type="date" value={shippedDateTo} onChange={e => setShippedDateToAndReset(e.target.value)}
              className="w-32 sm:w-36 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:border-gray-900 transition-colors" />
            <div className="flex items-center gap-1 ml-0.5">
              {[{ key: 'fy26', label: 'FY26' }, { key: 'fy27', label: 'FY27' }].map(f => (
                <button key={f.key} type="button" onClick={() => setShippedYearFilter(activeShippedYear === f.key ? 'all' : f.key)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer
                    ${activeShippedYear === f.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {loading && (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                {/* Background on thead, not tr — a <tr>'s background can
                    fall short of the table's true rendered width in a
                    horizontally scrolling table-fixed layout, leaving a
                    pale gap past the last column once scrolled all the way
                    right. thead always spans the full table width. */}
                <thead className="bg-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">SKU</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">Ordered</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">Shipped</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">Balance</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">Ordered Date</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">Target Date</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">Shipped Date</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody><SkeletonRows /></tbody>
              </table>
            </div>
            <div className="md:hidden divide-y divide-gray-100"><SkeletonCards /></div>
          </>
        )}
        {!loading && poGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
              <path d="M20.59 13.41L13.42 20.59a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
            <p className="text-sm text-gray-500">{hasActiveFilters ? 'No items match your filters' : 'No SKU data found'}</p>
          </div>
        )}
        {!loading && poGroups.length > 0 && (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
              <span className="text-[11px] text-gray-500">
                Showing {(page - 1) * SKU_SUMMARY_PAGE_SIZE + 1}–{(page - 1) * SKU_SUMMARY_PAGE_SIZE + poGroups.length} of {totalPoCount} POs
              </span>
              <button type="button" onClick={toggleCollapseAll}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-900 cursor-pointer transition-colors">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  className={`transition-transform ${allCollapsed ? '-rotate-90' : ''}`}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                {allCollapsed ? 'Expand All' : 'Collapse All'}
              </button>
            </div>
            {/* Desktop/tablet: full table. A horizontally-scrolling table
                buries the group header's own summary (Ordered/Shipped)
                off-screen on a phone since it lives in the same wide row as
                the data columns — mobile gets its own stacked card layout
                below instead of relying on scroll. */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                {/* Background on thead, not tr — a <tr>'s background can
                    fall short of the table's true rendered width in a
                    horizontally scrolling table-fixed layout, leaving a
                    pale gap past the last column once scrolled all the way
                    right. thead always spans the full table width. */}
                <thead className="bg-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">SKU</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">Ordered</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">Shipped</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">Balance</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">Ordered Date</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">Target Date</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">Shipped Date</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {poGroups.map(group => {
                    const isCollapsed = collapsed.has(group.key)
                    return (
                      <Fragment key={group.key}>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <td colSpan={8} className="p-0">
                            <button
                              type="button"
                              onClick={() => toggleCollapsed(group.key)}
                              className="w-full flex items-center justify-between gap-2 px-4 py-2 text-left cursor-pointer"
                            >
                              <span className="flex items-center gap-2 min-w-0 flex-1">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                  className={`text-gray-400 flex-shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                                <span className="text-sm font-bold text-gray-900 truncate">{group.poNumber || '—'}</span>
                                <span className="text-[10px] font-medium truncate">
                                  <span className="text-xs text-purple-700">{group.buyerName}</span>
                                  <span className="text-gray-400"> · </span>
                                  <span className="text-orange-700">{group.vendorName}</span>
                                </span>
                                <span className="text-[10px] font-semibold text-gray-700 bg-gray-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                  {group.rows.length} SKU{group.rows.length === 1 ? '' : 's'}
                                </span>
                              </span>
                              <span className="flex items-center gap-2 flex-shrink-0">
                                <div className="hidden sm:block w-24 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                                  <div className={`h-full rounded-full ${PROGRESS_BAR_COLOR[group.statusKey]}`} style={{ width: `${poProgressPct(group)}%` }} />
                                </div>
                                <span className="text-[10px] font-semibold text-gray-700 whitespace-nowrap">{poProgressPct(group)}%</span>
                              </span>
                            </button>
                          </td>
                        </tr>
                        {!isCollapsed && group.rows.map(r => (
                          <tr key={r.id} onClick={() => setLegDrawerItem(r)}
                            className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer">
                            <td className="px-3 py-2 text-xs font-semibold text-gray-900 truncate">
                              {r.skuRef || '—'}
                              {r.variant && <span className="ml-1.5 text-[10px] font-medium text-gray-500">{r.variant}</span>}
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <div className="flex items-baseline justify-end gap-1.5">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Value</span>
                                <span className="text-sm font-bold text-emerald-700">{fmt$(r.orderedValue)}</span>
                              </div>
                              <div className="flex items-baseline justify-end gap-1.5">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Qty</span>
                                <span className="text-sm font-bold text-gray-900">{fmtQty(r.ordered)}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <div className="flex items-baseline justify-end gap-1.5">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Value</span>
                                <span className="text-sm font-bold text-emerald-700">{fmt$(r.shippedValue)}</span>
                              </div>
                              <div className="flex items-baseline justify-end gap-1.5">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Qty</span>
                                <span className="text-sm font-bold text-gray-900">{fmtQty(r.shipped)}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <div className="flex items-baseline justify-end gap-1.5">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Value</span>
                                <span className="text-sm font-bold text-emerald-700">{fmt$(r.balanceValue)}</span>
                              </div>
                              <div className="flex items-baseline justify-end gap-1.5">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Qty</span>
                                <span className="text-sm font-bold text-gray-900">{fmtQty(r.balance)}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-xs font-semibold text-gray-900 whitespace-nowrap">{fmtDate(r.orderDate)}</td>
                            <td className="px-3 py-2 text-xs font-semibold text-gray-900 whitespace-nowrap">{fmtDate(r.targetDate)}</td>
                            <td className="px-3 py-2 text-xs font-semibold text-gray-900 whitespace-nowrap">{fmtDate(r.shippedDate)}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${statusBadge(r.status)}`}>
                                {statusLabel(r.status)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: stacked cards, nothing horizontally scrolls or hides. */}
            <div className="md:hidden divide-y divide-gray-100">
              {poGroups.map(group => {
                const isCollapsed = collapsed.has(group.key)
                return (
                  <div key={group.key}>
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(group.key)}
                      className="w-full flex flex-col gap-1 px-3 py-2.5 bg-gray-50 text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          className={`text-gray-400 flex-shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                        <span className="text-xs font-bold text-gray-900 truncate flex-1 min-w-0">{group.poNumber || '—'}</span>
                        <span className="text-[10px] font-semibold text-gray-700 bg-gray-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          {group.rows.length} SKU{group.rows.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="text-[10px] font-medium truncate pl-5">
                        <span className="text-purple-700">{group.buyerName}</span>
                        <span className="text-gray-400"> · </span>
                        <span className="text-orange-700">{group.vendorName}</span>
                      </div>
                      <div className="flex items-center gap-2 pl-5">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                          <div className={`h-full rounded-full ${PROGRESS_BAR_COLOR[group.statusKey]}`} style={{ width: `${poProgressPct(group)}%` }} />
                        </div>
                        <span className="text-[10px] font-semibold text-gray-700 whitespace-nowrap">{poProgressPct(group)}%</span>
                      </div>
                    </button>
                    {!isCollapsed && group.rows.map(r => (
                      <div key={r.id} onClick={() => setLegDrawerItem(r)} className="px-3 py-2 border-t border-gray-100 cursor-pointer active:bg-gray-50">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-gray-900 truncate min-w-0">
                            {r.skuRef || '—'}
                            {r.variant && <span className="ml-1.5 text-[10px] font-medium text-gray-500">{r.variant}</span>}
                          </span>
                          <span className={`flex-shrink-0 inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${statusBadge(r.status)}`}>
                            {statusLabel(r.status)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[10px] text-gray-600">
                          <span>Ordered <span className="font-semibold text-emerald-700">{fmt$(r.orderedValue)}</span> <span className="font-semibold text-gray-900">{fmtQty(r.ordered)}</span></span>
                          <span>Shipped <span className="font-semibold text-emerald-700">{fmt$(r.shippedValue)}</span> <span className="font-semibold text-gray-900">{fmtQty(r.shipped)}</span></span>
                          <span>Balance <span className="font-semibold text-emerald-700">{fmt$(r.balanceValue)}</span> <span className="font-semibold text-gray-900">{fmtQty(r.balance)}</span></span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-semibold text-gray-700 mt-1">
                          <span>Ordered: <span className="text-gray-900">{fmtDate(r.orderDate)}</span></span>
                          <span>Target: <span className="text-gray-900">{fmtDate(r.targetDate)}</span></span>
                          <span>Shipped: <span className="text-gray-900">{fmtDate(r.shippedDate)}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>

            {totalPages > 1 && (
              <div className="rounded-b-xl flex items-center justify-end gap-3 px-4 py-1.5 border-t border-gray-100 bg-gray-50">
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
          </>
        )}
      </div>

      <SkuLegBreakdownDrawer
        lineItem={legDrawerItem}
        open={!!legDrawerItem}
        onClose={() => setLegDrawerItem(null)}
      />
    </div>
  )
}
