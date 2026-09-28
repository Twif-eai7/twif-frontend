/**
 * Analytics V2 — sources every number from Supabase RPCs (dashboard_summary,
 * dashboard_volume_by_month, dashboard_open_by_month) via analyticsStore.
 *
 * This is the /dashboard index route. The original AnalyticsSection (backend
 * API-driven) lives at /dashboard/analytics-v2 now, kept around for
 * comparison/rollback rather than as the primary page.
 */
import { useMemo, useState, useEffect, useRef } from 'react'
import { useAnalyticsStore, FY_CONFIG } from '../../../stores/analyticsStore'
import { useProfileStore } from '../../../stores/profileStore'
import Fy26ByMonthsChart from '../../../components/dashboard/Fy26ByMonthsChart'
import SourcingRegionChart from '../../../components/dashboard/SourcingRegionChart'
import { extractMonthKey, labelToSlug } from '../../../hooks/useOpenPoSummary'
import { useNavigate, Navigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useLakshitStore } from '../../../stores/lakshitStore'
import { otifMonthKeysForFy, monthKeyToLabel } from '../../../utils/otifMonthly'
import { useSkuSummaryExportReconciled } from '../../../hooks/useSkuSummaryExportReconciled'
import { resolveOrgIdByName } from '../../../lib/poQueries'
import { STATUS_FILTERS, FY_RANGES, dateFieldForStatus } from '../../../utils/misFilters'
import SimpleSkuSummaryTable from '../../../components/logistics/ShipmentContainers/SimpleSkuSummaryTable'
// Grid layout for the .magic-bento-grid / data-card-id cards below — normally
// pulled in as a side effect of MerchantDashboard.jsx's import, but this page
// doesn't render that component, so it needs its own import or the cards
// fall back to plain stacked blocks (no CSS grid at all).
import '../../../styles/sales-analytics.css'

// ── Excluded from merchant dropdown ──────────
const EXCLUDED_MERCHANTS = new Set([])

// ── Lakshit Bohra hardcoded case (mirrors AnalyticsSection) ──────────────────
const LAKSHIT_FY_DATES = {
  fy26: { fyStart: '2025-04-01', fyEnd: '2026-03-31', prevStart: '2024-04-01', prevEnd: '2025-03-31' },
  fy27: { fyStart: '2026-04-01', fyEnd: '2027-03-31', prevStart: '2025-04-01', prevEnd: '2026-03-31' },
}
const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const NKUKU_REAL_BUYER = 'NKUKU'
const NKUKU_SPLIT_MERCHANTS = {
  'NKUKU Lalit':  'Lalit Chopra',
  'NKUKU Sujata': 'Sujata Soni',
  'NKUKU Suraj':  'Suraj Prakash',
}

function dateToFiscalKey(dateStr, cfg) {
  const d = new Date(dateStr)
  const label = `${FULL_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
  const idx = cfg.openPoFiscal.indexOf(label)
  return idx >= 0 ? cfg.fiscalMonths[idx] : null
}

function computeLakshitOpenData(poList, poBuyer, poSupplier, cfg) {
  const breakdown = {}
  const rowMap    = {}
  const allowedMonths = new Set([...cfg.openPoFiscal, ...cfg.openPoCalendar])
  // Row values are keyed by the raw full month name (e.g. "April 2025"),
  // matching toOpenData in analyticsStore.js — not a short fiscal key like
  // "April", which FY26 and FY27's own fiscalMonths arrays both reuse for
  // their first 9 months and would collide if this data were ever read
  // through a chart card using a different fyConfig than cfg here.
  poList.forEach(po => {
    const buyer  = poBuyer[po.id] || 'Unknown'
    const vendor = poSupplier[po.id] || 'Unknown'
    ;(po.po_line_items || []).forEach(li => {
      if (li.status !== 'open' || !li.target_date) return
      const d = new Date(li.target_date)
      const label = `${FULL_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
      if (!allowedMonths.has(label)) return
      if (!breakdown[buyer]) breakdown[buyer] = {}
      if (!breakdown[buyer][label]) breakdown[buyer][label] = { poIds: new Set(), value: 0 }
      breakdown[buyer][label].poIds.add(po.id)
      breakdown[buyer][label].value += li.balance_value_usd || 0
      const k = `${buyer}||${vendor}`
      if (!rowMap[k]) rowMap[k] = { buyer, vendor }
      rowMap[k][label] = (rowMap[k][label] || 0) + (li.balance_value_usd || 0)
    })
  })
  const buyerBreakdown = {}
  Object.entries(breakdown).forEach(([buyer, months]) => {
    buyerBreakdown[buyer] = Object.entries(months).map(([month, { poIds, value }]) => ({
      month, count: poIds.size, value,
    }))
  })
  return { buyerBreakdown, rows: Object.values(rowMap), months: cfg.fiscalMonths }
}

function computeLakshitVolumeData(poList, legs, poBuyer, poSupplier, cfg) {
  const liToPo = {}
  poList.forEach(po => { (po.po_line_items || []).forEach(li => { liToPo[li.id] = po.id }) })
  const byRow = {}
  legs.forEach(leg => {
    if (!leg.shipped_date) return
    const monthKey = dateToFiscalKey(leg.shipped_date, cfg)
    if (!monthKey) return
    const poId   = liToPo[leg.po_line_item_id]
    if (!poId) return
    const buyer  = poBuyer[poId] || 'Unknown'
    const vendor = poSupplier[poId] || 'Unknown'
    const key = `${buyer}||${vendor}`
    if (!byRow[key]) byRow[key] = { buyer, vendor }
    byRow[key][monthKey] = (byRow[key][monthKey] || 0) + (leg.shipped_value_usd || 0)
  })
  const totalShipped = legs.reduce((s, leg) => s + (leg.shipped_value_usd || 0), 0)
  return {
    headers:    cfg.fiscalMonths,
    rows:       Object.values(byRow),
    originData: [{ origin: 'Denmark', value: totalShipped || 1 }],
    clientData: [{ client: 'House Doctor', value: totalShipped || 1 }],
  }
}

function computeLakshitOtifMonthly(poList, legs, monthKeys) {
  const liToPo    = {}
  const poTarget  = {}
  const poBalance = {}
  poList.forEach(po => {
    let bal = 0
    ;(po.po_line_items || []).forEach(li => {
      liToPo[li.id] = po.id
      bal += li.balance_value_usd || 0
      if (li.target_date && !poTarget[po.id]) poTarget[po.id] = li.target_date
    })
    poBalance[po.id] = bal
  })
  const byMonth = Object.fromEntries(monthKeys.map(k => [k, { shippedValue: 0, poOnTime: new Map() }]))
  legs.forEach(leg => {
    if (!leg.shipped_date) return
    const monthKey = leg.shipped_date.slice(0, 7)
    const bucket = byMonth[monthKey]
    if (!bucket) return
    const poId = liToPo[leg.po_line_item_id]
    if (!poId) return
    bucket.shippedValue += leg.shipped_value_usd || 0
    const target = poTarget[poId]
    const onTime = target ? leg.shipped_date <= target : true
    if (!bucket.poOnTime.has(poId)) bucket.poOnTime.set(poId, onTime)
    else if (!onTime) bucket.poOnTime.set(poId, false)
  })
  const months = monthKeys.map(key => {
    const bucket    = byMonth[key]
    const poIds     = [...bucket.poOnTime.keys()]
    const shippedPos = poIds.length
    const onTimePos  = poIds.filter(id => bucket.poOnTime.get(id)).length
    const balanceValue = poIds.reduce((s, id) => s + (poBalance[id] || 0), 0)
    return {
      label: monthKeyToLabel(key),
      shippedValue: shippedPos ? bucket.shippedValue : null,
      percentage:   shippedPos ? (onTimePos / shippedPos) * 100 : null,
      shippedPos,
      onTimePos,
    }
  })
  return { months }
}

function computeLakshitStats(pos, legs, { fyStart, fyEnd, prevStart, prevEnd }) {
  const liToPo    = {}
  const poFinal   = {}
  const poTarget  = {}
  pos.forEach(po => {
    poFinal[po.id] = po.final_date ?? null
    ;(po.po_line_items || []).forEach(li => {
      liToPo[li.id] = po.id
      if (li.target_date && !poTarget[po.id]) poTarget[po.id] = li.target_date
    })
  })
  let currentFyVolume  = 0
  let previousFyVolume = 0
  const posWithLegInFy = new Set()
  // Converted SKUs: distinct po_line_items responsible for open balance OR
  // shipped value in the current FY — a union, not a raw line-item count, so
  // a partially-shipped item (open balance + a leg) only counts once.
  const convertedSkuIds = new Set()
  legs.forEach(leg => {
    if (leg.shipped_date >= fyStart && leg.shipped_date <= fyEnd) {
      currentFyVolume += leg.shipped_value_usd || 0
      convertedSkuIds.add(leg.po_line_item_id)
      const poId = liToPo[leg.po_line_item_id]
      if (poId) posWithLegInFy.add(poId)
    // Same live-leg source as currentFyVolume above — po_line_items'
    // shipped_value_usd/shipped_date rollup only backfills once a leg gets
    // a shipment_invoice_id (see sql/sku_summary_rpc.sql's header comment),
    // so reading it here for the prior FY silently drops anything shipped
    // before that invoice-linking flow existed.
    } else if (leg.shipped_date >= prevStart && leg.shipped_date <= prevEnd) {
      previousFyVolume += leg.shipped_value_usd || 0
    }
  })
  let totalOpenPos = 0
  const openPoIds  = new Set()
  pos.forEach(po => {
    ;(po.po_line_items || []).forEach(li => {
      if (li.status === 'open') {
        totalOpenPos += li.balance_value_usd || 0
        openPoIds.add(po.id)
        if (li.target_date && li.target_date >= fyStart) convertedSkuIds.add(li.id)
      }
    })
  })
  let onTimePos = 0, latePos = 0, partialPos = 0
  posWithLegInFy.forEach(poId => {
    const finalDate  = poFinal[poId]
    const targetDate = poTarget[poId]
    if (!finalDate)                                   partialPos++
    else if (!targetDate || finalDate <= targetDate)  onTimePos++
    else                                              latePos++
  })
  return {
    currentFyVolume, previousFyVolume, totalOpenPos,
    openPosCount: openPoIds.size, totalOrders: currentFyVolume,
    onTimePos, latePos, partialPos, totalConvertedSKUs: convertedSkuIds.size,
    // This function never reads exceptional_ex_factory_date to begin with —
    // poTarget is always the plain target date — so onTimePos/latePos above
    // are already what dashboard_rpcs.sql calls "Original" (exception-free).
    // Lakshit/Shayni have no separate exception-aware computation, so both
    // OTIF cards show the same number for them — accurate to what this
    // function actually computes, not a fabricated distinction.
    onTimePosOriginal: onTimePos, latePosOriginal: latePos,
    // Same figure as onTimePos+latePos — unlike dashboard_summary's own
    // v_shipped_fully, this function was never gated on true shipment
    // completion to begin with (partialPos here only means "no final_date
    // yet"), so nothing changes for Lakshit/Shayni's own "Fully Shipped"
    // tab when the general RPC path widens onTimePos/latePos to include
    // qualifying partials elsewhere.
    shippedFullyPos: onTimePos + latePos,
  }
}

function subtractSummary(base, sub) {
  if (!base || !sub) return base
  return {
    ...base,
    currentFyVolume:  Math.max(0, (base.currentFyVolume  || 0) - (sub.currentFyVolume  || 0)),
    previousFyVolume: Math.max(0, (base.previousFyVolume || 0) - (sub.previousFyVolume || 0)),
    totalOpenPos:     Math.max(0, (base.totalOpenPos     || 0) - (sub.totalOpenPos     || 0)),
    openPosCount:     Math.max(0, (base.openPosCount     || 0) - (sub.openPosCount     || 0)),
    totalOrders:      Math.max(0, (base.totalOrders      || 0) - (sub.currentFyVolume  || 0)),
    onTimePos:        Math.max(0, (base.onTimePos        || 0) - (sub.onTimePos        || 0)),
    latePos:          Math.max(0, (base.latePos          || 0) - (sub.latePos          || 0)),
    onTimePosOriginal: Math.max(0, (base.onTimePosOriginal || 0) - (sub.onTimePosOriginal || 0)),
    latePosOriginal:  Math.max(0, (base.latePosOriginal   || 0) - (sub.latePosOriginal   || 0)),
    partialPos:       Math.max(0, (base.partialPos       || 0) - (sub.partialPos       || 0)),
    shippedFullyPos:  Math.max(0, (base.shippedFullyPos  || 0) - (sub.shippedFullyPos  || 0)),
  }
}

function subtractVolumeData(base, sub) {
  if (!base || !sub) return base
  const headers = base.headers || []
  const subMap  = Object.fromEntries(sub.rows.map(r => [`${r.buyer}||${r.vendor}`, r]))
  return {
    ...base,
    rows: base.rows.map(row => {
      const s = subMap[`${row.buyer}||${row.vendor}`]
      if (!s) return row
      const patched = { ...row }
      headers.forEach(m => { patched[m] = Math.max(0, (row[m] || 0) - (s[m] || 0)) })
      return patched
    }),
  }
}

function subtractOpenData(base, sub) {
  if (!base || !sub) return base
  const newBreakdown = {}
  Object.entries(base.buyerBreakdown || {}).forEach(([buyer, entries]) => {
    const subEntries = sub.buyerBreakdown[buyer] || []
    newBreakdown[buyer] = entries.map(e => {
      const s = subEntries.find(x => x.month === e.month)
      if (!s) return e
      return { ...e, count: Math.max(0, (e.count || 0) - (s.count || 0)), value: Math.max(0, (e.value || 0) - (s.value || 0)) }
    })
  })
  return { ...base, buyerBreakdown: newBreakdown }
}

function lakshitOtifToV2Format(lakshitOtif) {
  if (!lakshitOtif) return null
  return lakshitOtif.months.map(m => ({
    month: m.label, totalPos: m.shippedPos || 0, onTimePos: m.onTimePos || 0, shippedValue: m.shippedValue || 0,
  }))
}

function subtractOtifV2(base, sub) {
  if (!base || !sub) return base
  const subMap = Object.fromEntries(sub.map(r => [r.month, r]))
  return base.map(r => {
    const s = subMap[r.month]
    if (!s) return r
    const totalPos  = Math.max(0, (r.totalPos  || 0) - (s.totalPos  || 0))
    const onTimePos = Math.max(0, (r.onTimePos || 0) - (s.onTimePos || 0))
    return { ...r, totalPos, onTimePos, shippedValue: Math.max(0, (r.shippedValue || 0) - (s.shippedValue || 0)) }
  })
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmt$(n) {
  return '$' + parseFloat(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}
function fmtPct(n) {
  return parseFloat(n || 0).toFixed(2) + '%'
}
function fmtDays(n) {
  return n == null ? '—' : Math.round(n) + ' Days'
}

// ── Shared Tailwind constants (matches MerchantDashboard) ─────────────────────
const CARD        = 'flex flex-col relative p-3.5 rounded-xl border border-gray-200 bg-white transition-all duration-300 cursor-default text-black hover:-translate-y-0.5 hover:border-[#1100ff] hover:shadow-[0_8px_30px_rgba(0,0,0,0.1)]'
const CARD_HEADER = 'flex justify-between items-center mb-2 gap-4 flex-wrap'
const CARD_TITLE  = 'font-semibold text-[0.9em] m-0'
const CARD_SUB    = 'text-[0.72em] text-[#555] mt-0.5'
const CARD_CONTENT = 'flex-1 flex flex-col min-h-0'
const KPI_VALUE   = 'text-[1.6em] font-semibold my-0.5 leading-tight break-words'

function MiniTabs({ options, value, onChange }) {
  return (
    <div className="flex gap-1 items-center">
      {options.map(opt => (
        <button key={opt} type="button" onClick={() => onChange(opt)}
          className={`px-1.5 py-0.5 text-[10px] rounded-md border cursor-pointer transition-all duration-200
            ${value === opt
              ? 'bg-black text-white font-medium border-black'
              : 'bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200'
            }`}>
          {opt}
        </button>
      ))}
    </div>
  )
}

function KpiCard({ cardId, title, subtitle, value, children, onClick }) {
  return (
    <div className={`${onClick ? 'cursor-pointer' : ''} ${CARD}`} data-card-id={cardId} onClick={onClick}>
      <div className={CARD_HEADER}>
        <div>
          <h2 className={CARD_TITLE}>{title}</h2>
          {subtitle && <div className={CARD_SUB}>{subtitle}</div>}
        </div>
      </div>
      <div className={CARD_CONTENT}>
        {value != null && <div className={KPI_VALUE}>{value}</div>}
        {children}
      </div>
    </div>
  )
}

// Horizontal pill/capsule progress bar — current value bold dark-left,
// target value bold orange-right, gradient fill proportional to current/target.
function GaugeCard({ current, target }) {
  const pct  = target > 0 ? Math.min(current / target, 1) : 0
  // Truncate (not round) to 2 decimals — 9,056,013 should read 9.05M, not
  // the rounded-up 9.06M toFixed would give.
  const fmtM = v => (Math.floor(v / 1e4) / 100).toFixed(2) + 'M'
  return (
    <div className="w-full flex flex-col gap-3 justify-center h-full">
      <div className="w-full h-3.5 rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct * 100}%`, background: 'linear-gradient(90deg, #7c6df2, #4f7dfb)' }}
        />
      </div>
      <div className="w-full flex items-center justify-between">
        <span className="font-bold text-gray-900 text-base">{fmtM(current)}</span>
        <span className="font-bold text-orange-500 text-base">{fmtM(target)}</span>
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skel({ className = '' }) {
  return <div className={`bg-gray-200 rounded-md animate-pulse ${className}`} />
}

// "YYYY-MM" (labelToSlug's format) -> that month's [first, last] date —
// mirrors SkuShipmentSummary's own monthSlugToRange, used here to narrow the
// inline drill-down table to one month instead of the whole FY.
function monthSlugToRange(slug) {
  const [y, m] = slug.split('-').map(Number)
  const from = `${slug}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${slug}-${String(lastDay).padStart(2, '0')}`
  return [from, to]
}

// Clamps a [from, to] target-date range to just its overdue (target already
// passed, through yesterday) or upcoming (today onward) portion — used by
// the By-Months chart's own overdue/upcoming legend-chip drill-through
// (handleOpenInMis's subSegment), which totals up one specific FY's chart so
// clamping against the range's own bounds is correct there (an already-
// fully-elapsed FY's "upcoming", or a not-yet-started FY's "overdue", should
// collapse to nothing useful rather than leaking into a neighboring FY).
// NOT used by the Open status pill's own Backlog/Future sub-tabs below —
// those mean "overall open till date" (spanning every FY, same idea
// dashboard_open_by_month/TYTD Open POs already use), not "within this one
// FY", so they set an unbounded from/to directly instead of clamping a
// single-FY range.
function clampRangeBySubSegment(range, subSegment) {
  if (!subSegment) return range
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  if (subSegment === 'overdue') {
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)
    return [range[0], yesterdayStr < range[1] ? yesterdayStr : range[1]]
  }
  if (subSegment === 'upcoming') {
    return [todayStr > range[0] ? todayStr : range[0], range[1]]
  }
  return range
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AnalyticsV2Section() {
  const navigate = useNavigate()

  // Store selectors
  const fetchAll        = useAnalyticsStore(s => s.fetchAll)
  const summary         = useAnalyticsStore(s => s.summary)
  const volumeData      = useAnalyticsStore(s => s.volumeData)
  const openOrdersData  = useAnalyticsStore(s => s.openOrdersData)
  const openCurrentMonthSplit = useAnalyticsStore(s => s.openCurrentMonthSplit)
  const fy26VolumeData    = useAnalyticsStore(s => s.fy26VolumeData)
  const fy26ShippedTotal = useAnalyticsStore(s => s.fy26ShippedTotal)
  const storedFyTarget   = useAnalyticsStore(s => s.storedFyTarget)
  const fy25ShippedTotal = useAnalyticsStore(s => s.fy25ShippedTotal)
  const availableBuyers = useAnalyticsStore(s => s.availableBuyers)
  const merchantList    = useAnalyticsStore(s => s.merchantList)
  const currentBuyer    = useAnalyticsStore(s => s.currentBuyer)
  const currentMerchant = useAnalyticsStore(s => s.currentMerchant)
  const isAdmin         = useAnalyticsStore(s => s.isAdmin)
  const fyYear          = useAnalyticsStore(s => s.fyYear)
  const loading         = useAnalyticsStore(s => s.loading)
  const error           = useAnalyticsStore(s => s.error)
  const availableSuppliers = useAnalyticsStore(s => s.availableSuppliers)
  const currentSupplier   = useAnalyticsStore(s => s.currentSupplier)
  const switchFyYear      = useAnalyticsStore(s => s.switchFyYear)
  const switchBuyer       = useAnalyticsStore(s => s.switchBuyer)
  const switchSupplier    = useAnalyticsStore(s => s.switchSupplier)
  const switchMerchant    = useAnalyticsStore(s => s.switchMerchant)
  const reload            = useAnalyticsStore(s => s.reload)
  const fetchOtifMonthly  = useAnalyticsStore(s => s.fetchOtifMonthly)
  const otifMonthlyData   = useAnalyticsStore(s => s.otifMonthlyData)
  const otifLoading       = useAnalyticsStore(s => s.otifLoading)

  const orgType      = useProfileStore(s => s.orgMembership?.orgType)
  const selfFullName = useProfileStore(s => s.orgMembership?.fullName)
  const orgId        = useProfileStore(s => s.orgMembership?.orgId)
  // Unconditionally enabled — these KPI cards drill into the inline
  // SimpleSkuSummaryTable ("Simple MIS"), meant for the same broad audience
  // this whole dashboard already has. They only ever fall back to
  // navigating to the old standalone MIS page (MisSection.jsx, local-use
  // only now, no route in production — see App.jsx) for an fyYear value no
  // actual UI control can produce.
  const canSeeMis    = true
  // Target/growth-vs-target figures (the FY target itself, the gauge, Target
  // Growth Rate, Target Achieved) are a merchant-org planning construct —
  // meaningless for a buyer or supplier viewing only their own POs against it.
  const showTargetStats = orgType === 'merchant'
  // A supplier org has exactly one vendor — themselves — so the By-Months
  // charts' own per-chart "Vendor" micro-filter is meaningless for them; a
  // "Buyer" micro-filter (they ship to several buyers) is the useful
  // equivalent axis. See the FY26/FY27/current-FY By Months cards below. A
  // buyer org is the mirror image — several vendors, one buyer (themselves)
  // — so it keeps the existing Vendor micro-filter unchanged, just scoped to
  // its own data via resolveBuyerOrgLinkIds in analyticsStore.js.
  const isSupplierViewer = orgType === 'supplier'
  const isBuyerViewer    = orgType === 'buyer'

  // Boot fetch
  useEffect(() => {
    if ((orgType === 'merchant' || orgType === 'supplier') && loading && !summary) fetchAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgType])

  // ── Lakshit Bohra special case ───────────────────────────────────────────────
  const lakshitMember = merchantList?.find(m => m.name === 'Lakshit Bohra')
  const shayniMember  = merchantList?.find(m => m.name === 'Shayni Sharma')
  const isLakshit     = selfFullName === 'Lakshit Bohra'
                     || (!!currentMerchant && currentMerchant === lakshitMember?.email)
  const isShayni      = !isLakshit
                     && (selfFullName === 'Shayni Sharma'
                         || (!!currentMerchant && currentMerchant === shayniMember?.email))

  useEffect(() => {
    if (isLakshit && fyYear === 'fy26') switchFyYear('fy27')
  }, [isLakshit, fyYear, switchFyYear])

  const [lakshitSummary,     setLakshitSummary]     = useState(null)
  const [lakshitVolumeData,  setLakshitVolumeData]  = useState(null)
  const [lakshitOpenData,    setLakshitOpenData]     = useState(null)
  const [lakshitOtifMonthly, setLakshitOtifMonthly] = useState(null)
  const [lakshitLoading,     setLakshitLoading]     = useState(false)
  const lakshitAbortRef = useRef(null)


  useEffect(() => {
    if (!isLakshit && !isShayni) {
      setLakshitSummary(null)
      setLakshitVolumeData(null)
      setLakshitOpenData(null)
      setLakshitOtifMonthly(null)
      useLakshitStore.getState().setPoNos(null)
      return
    }
    const dates = LAKSHIT_FY_DATES[fyYear] ?? LAKSHIT_FY_DATES.fy27
    const cfgL  = FY_CONFIG[fyYear] ?? FY_CONFIG.fy27
    if (lakshitAbortRef.current) lakshitAbortRef.current.abort()
    const ctrl = new AbortController()
    lakshitAbortRef.current = ctrl
    setLakshitLoading(true)
    ;(async () => {
      try {
        const { data: pos, error: posErr } = await supabase
          .from('purchase_orders')
          .select('id, po_number, final_date, buyer_supplier_link_id, po_line_items(id, status, target_date, balance_value_usd, shipped_value_usd, shipped_date)')
          .eq('created_by', 'Lakshit Bohra')
          .is('deleted_at', null)
          .is('delete_meta', null)
          .neq('is_test', true)
        if (ctrl.signal.aborted) return
        if (posErr) throw new Error(posErr.message)
        const poList = pos || []
        const linkIds = [...new Set(poList.map(po => po.buyer_supplier_link_id).filter(Boolean))]
        let poBuyer = {}, poSupplier = {}
        if (linkIds.length) {
          const { data: links } = await supabase.from('buyer_supplier_links').select('id, buyer_org_id, supplier_org_id').in('id', linkIds)
          if (!ctrl.signal.aborted && links?.length) {
            const orgIds = [...new Set([...links.map(l => l.buyer_org_id), ...links.map(l => l.supplier_org_id)].filter(Boolean))]
            if (orgIds.length) {
              const { data: orgs } = await supabase.from('organizations').select('id, display_name').in('id', orgIds)
              if (!ctrl.signal.aborted && orgs) {
                const orgMap        = Object.fromEntries(orgs.map(o => [o.id, o.display_name]))
                const lBuyerMap     = Object.fromEntries(links.map(l => [l.id, orgMap[l.buyer_org_id] || 'Unknown']))
                const lSupplierMap  = Object.fromEntries(links.map(l => [l.id, orgMap[l.supplier_org_id] || 'Unknown']))
                poList.forEach(po => {
                  poBuyer[po.id]    = lBuyerMap[po.buyer_supplier_link_id] || 'Unknown'
                  poSupplier[po.id] = lSupplierMap[po.buyer_supplier_link_id] || 'Unknown'
                })
              }
            }
          }
        }
        if (ctrl.signal.aborted) return
        const lineItemIds = poList.flatMap(po => (po.po_line_items || []).map(li => li.id))
        let legs = []
        if (lineItemIds.length) {
          const { data: legData, error: legErr } = await supabase
            .from('po_shipment_leg')
            .select('po_line_item_id, shipped_date, shipped_value_usd')
            .in('po_line_item_id', lineItemIds)
            .gte('shipped_date', dates.prevStart)
            .lte('shipped_date', dates.fyEnd)
          if (ctrl.signal.aborted) return
          if (legErr) throw new Error(legErr.message)
          legs = legData || []
        }
        const fy       = fyYear.replace('fy', '')
        const computed = computeLakshitStats(poList, legs, dates)
        const volData  = computeLakshitVolumeData(poList, legs, poBuyer, poSupplier, cfgL)
        const openData = computeLakshitOpenData(poList, poBuyer, poSupplier, cfgL)
        const otifMon  = computeLakshitOtifMonthly(poList, legs, otifMonthKeysForFy(fy))
        if (!ctrl.signal.aborted) {
          setLakshitSummary(computed)
          setLakshitVolumeData(volData)
          setLakshitOpenData(openData)
          setLakshitOtifMonthly(otifMon)
          useLakshitStore.getState().setPoNos(
            new Set(poList.map(po => po.po_number).filter(Boolean)),
            isShayni ? 'exclude' : 'include'
          )
        }
      } catch (err) {
        if (!ctrl.signal.aborted) console.error('Lakshit fetch error:', err)
      } finally {
        if (!ctrl.signal.aborted) setLakshitLoading(false)
      }
    })()
    return () => ctrl.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLakshit, isShayni, fyYear])

  const mergedOpenData = (() => {
    if (!isLakshit || !lakshitOpenData) return openOrdersData
    const fy26Months = new Set(FY_CONFIG.fy26.openPoFiscal)
    const merged = {}
    Object.entries(openOrdersData?.buyerBreakdown ?? {}).forEach(([buyer, entries]) => {
      const fy26 = entries.filter(e => fy26Months.has(e.month))
      if (fy26.length) merged[buyer] = fy26
    })
    Object.entries(lakshitOpenData.buyerBreakdown).forEach(([buyer, entries]) => {
      merged[buyer] = [...(merged[buyer] ?? []), ...entries]
    })
    return { ...lakshitOpenData, buyerBreakdown: merged }
  })()

  const effectiveSummary = isLakshit && lakshitSummary
    ? lakshitSummary
    : isShayni && lakshitSummary
    ? subtractSummary(summary, lakshitSummary)
    : summary

  const effectiveVolumeData = isLakshit
    ? (lakshitVolumeData ?? volumeData)
    : isShayni && lakshitVolumeData
    ? subtractVolumeData(volumeData, lakshitVolumeData)
    : volumeData

  const effectiveOpenOrdersData = isLakshit
    ? (mergedOpenData ?? openOrdersData)
    : isShayni && lakshitOpenData
    ? subtractOpenData(openOrdersData, lakshitOpenData)
    : openOrdersData

  const lakshitOtifV2 = lakshitOtifToV2Format(lakshitOtifMonthly)
  const effectiveOtifData = isLakshit && lakshitOtifV2
    ? lakshitOtifV2
    : isShayni && lakshitOtifV2 && otifMonthlyData
    ? subtractOtifV2(otifMonthlyData, lakshitOtifV2)
    : otifMonthlyData
  // ─────────────────────────────────────────────────────────────────────────

  const cfg          = FY_CONFIG[fyYear] ?? FY_CONFIG.fy27
  const currentFyVol = parseFloat(effectiveSummary?.currentFyVolume || 0)
  // fy26ShippedTotal (from the store) is a flat sum over EVERY row
  // dashboard_volume_by_month returned — scoped by buyerOnlyLinkIds only,
  // deliberately NOT narrowed by the selected Vendor filter, so the "FY26 By
  // Months" chart's own vendor dropdown always has every vendor's data to
  // client-side filter from (see that RPC call's own comment in
  // analyticsStore.js). The bento "FY26 Shipped" card doesn't get that same
  // re-filtering treatment though, so with a Vendor actually selected it
  // kept showing the FULL (every-vendor) total instead of matching what
  // switching the FY Year dropdown to FY26 directly shows (dashboard_
  // summary's own currentFyVolume, which IS narrowed by the Vendor filter
  // via filteredLinkIds) — re-derive it from fy26VolumeData's own rows,
  // filtered by currentSupplier, instead of the flat unfiltered total
  // whenever a vendor is actually selected.
  const fy26ShippedTotalForVendor = useMemo(() => {
    if (!currentSupplier || currentSupplier === 'All') return fy26ShippedTotal
    const rows = (fy26VolumeData?.rows || []).filter(r => r.vendor === currentSupplier)
    return rows.reduce((sum, r) => sum + Object.entries(r).reduce(
      (s, [k, v]) => (k === 'buyer' || k === 'vendor' ? s : s + (Number(v) || 0)), 0
    ), 0)
  }, [fy26VolumeData, fy26ShippedTotal, currentSupplier])
  // For Lakshit/Shayni use locally computed prev-FY. Otherwise: while viewing
  // FY27, use fy26ShippedTotalForVendor above — reconciles with the "FY26 By
  // Months" card right below and with MIS's own live numbers. While viewing
  // FY26 itself, "previous FY" means FY25 — Supabase's po_shipment_leg data
  // is incomplete that far back, so unlike FY26/FY27 this one genuinely
  // still needs the legacy backend's own figure (fy25ShippedTotal,
  // FY_CONFIG.fy26.perfRoute's volumeLY25) rather than a live RPC sum.
  const prevFyVol    = (isLakshit || isShayni) && effectiveSummary
    ? parseFloat(effectiveSummary.previousFyVolume || 0)
    : (fyYear === 'fy27' ? fy26ShippedTotalForVendor : fy25ShippedTotal)

  // Fixed, not user-editable — was previously an <input>, but the growth
  // rate assumption feeds Target/Target Achieved/the gauge, so letting any
  // viewer change it skewed KPIs that are supposed to be a shared source of
  // truth. House Doctor keeps its own fixed 10% below.
  const targetGrowthRate = 45
  const isHouseDoctorOnly = useMemo(() => {
    if (currentBuyer && currentBuyer !== 'Total' && currentBuyer !== 'All') {
      return currentBuyer.trim().toUpperCase() === 'HOUSE DOCTOR'
    }
    const real = (availableBuyers || []).filter(b => b.toUpperCase() !== 'TOTAL')
    return real.length === 1 && real[0].trim().toUpperCase() === 'HOUSE DOCTOR'
  }, [availableBuyers, currentBuyer])
  const effectiveGrowthRate = isHouseDoctorOnly ? 10 : targetGrowthRate

  // Lakshit and Shayni split House Doctor's FY27 target 40/60 — hardcoded
  // rather than fetched/derived, since every attempt to compute House
  // Doctor's real previousFyVolume ourselves (via summary, via a dedicated
  // buyer-wide RPC call) came out different from the true figure for
  // reasons that kept moving (member access, link relationship_status,
  // casing). The 4,007,999 target itself is known-correct from elsewhere.
  const HOUSE_DOCTOR_TARGET = 4007999
  const LAKSHIT_TARGET = 1603199.6
  const SHAYNI_TARGET  = HOUSE_DOCTOR_TARGET - LAKSHIT_TARGET

  // FY26 uses the real, stored target (buyer_fy_targets — sql/buyer_fy_
  // targets.sql, summed by analyticsStore.js over whichever buyers are in
  // scope for the current member/company-wide view) instead of a
  // growth-rate guess, since FY26 is closed and actual assigned figures now
  // exist. Falls back to the old calc if that buyer scope has no stored
  // target yet (not populated), so this never regresses to $0. FY27 is
  // untouched — still growth-rate/hardcoded-split derived as before.
  const ytdTarget = fyYear === 'fy26' && storedFyTarget != null
    ? storedFyTarget
    : isLakshit
    ? LAKSHIT_TARGET
    : isShayni
    ? SHAYNI_TARGET
    : prevFyVol > 0 ? prevFyVol * (1 + effectiveGrowthRate / 100) : 0

  const actualGrowth = prevFyVol > 0
    ? ((currentFyVol - prevFyVol) / prevFyVol) * 100
    : 0
  const targetAchieved = ytdTarget > 0 ? (currentFyVol / ytdTarget) * 100 : 0

  // OTIF — two distinct definitions, not two views of the same number.
  // otifRate ("After Exception") allows exceptional_ex_factory_date to
  // stand in for a line item's own target_date when set. otifRateOriginal
  // ("Original") never consults it, comparing final_date straight against
  // MIN(target_date) — see dashboard_rpcs.sql's v_on_time/v_on_time_original.
  const [otifModalOpen, setOtifModalOpen] = useState(false)
  const onTimePos  = effectiveSummary?.onTimePos  ?? 0
  const latePos    = effectiveSummary?.latePos    ?? 0
  const otifRate   = (onTimePos + latePos) > 0
    ? (onTimePos / (onTimePos + latePos)) * 100
    : null
  const onTimePosOriginal = effectiveSummary?.onTimePosOriginal ?? 0
  const latePosOriginal   = effectiveSummary?.latePosOriginal   ?? 0
  const otifRateOriginal  = (onTimePosOriginal + latePosOriginal) > 0
    ? (onTimePosOriginal / (onTimePosOriginal + latePosOriginal)) * 100
    : null

  useEffect(() => {
    if (!otifModalOpen) return
    if (isLakshit) return  // Lakshit OTIF is computed locally
    if (otifMonthlyData === null && !otifLoading) fetchOtifMonthly()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otifModalOpen, isLakshit])

  // Shipped PO tab state. Default tab labeled "Fully Shipped" (not "Total")
  // — it's a strict subset, not an aggregate: onTimePos/latePos now also
  // count a qualifying partial PO (one with final_date set, even though a
  // line item is still 'open' — see dashboard_rpcs.sql's own comment on
  // v_on_time/v_late), so summing them would double-count that PO here
  // alongside Partial. shippedFullyPos is the untouched, still-gated-on-
  // full-shipment-completion figure this tab actually needs.
  const [shippedTab, setShippedTab] = useState('Fully Shipped')
  const partialPos = effectiveSummary?.partialPos ?? 0
  const shippedFullyPos = effectiveSummary?.shippedFullyPos ?? 0
  const shippedDisplay = shippedTab === 'On Time' ? onTimePos
    : shippedTab === 'Late'    ? latePos
    : shippedTab === 'Partial' ? partialPos
    : shippedFullyPos

  // Global markets
  const [sourcingMode, setSourcingMode] = useState('country')
  const sourcingList = useMemo(() => {
    const src = effectiveVolumeData
    if (sourcingMode === 'client') return src?.clientData || []
    const palette = ['#4285F4','#34A853','#FBBC05','#EA4335','#9E9E9E']
    return (src?.originData || []).map((o, i) => ({
      region: o.origin, value: o.value, color: palette[i % palette.length],
    }))
  }, [effectiveVolumeData, sourcingMode])

  // Vendor filter for charts — syncs FROM top-bar vendor but not back
  const [volumeVendor, setVolumeVendor] = useState(currentSupplier || 'All')
  useEffect(() => {
    setVolumeVendor(currentSupplier || 'All')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSupplier])

  // Shared Y-axis scale for the side-by-side "FY26 By Months"/"FY27 By
  // Months" cards — each chart reports its own computed max via onYMax, and
  // both then render against whichever is larger (yMax) via
  // Fy26ByMonthsChart's own effectiveMaxY fallback, so bar heights are
  // directly comparable between the two instead of each chart scaling to
  // its own data independently.
  const [fy26ChartMaxY, setFy26ChartMaxY] = useState(0)
  const [fy27ChartMaxY, setFy27ChartMaxY] = useState(0)
  const byMonthsSharedMaxY = Math.max(fy26ChartMaxY, fy27ChartMaxY)

  // Open POs by months table
  const [openPoView, setOpenPoView] = useState('fiscal') // 'fiscal' | 'calendar'

  const buyerOptions = useMemo(() => {
    const real = (availableBuyers || []).filter(b => b.toUpperCase() !== 'TOTAL')
    if (real.length === 1) return real // single buyer — no "All" needed
    const list = [...(availableBuyers || [])]
    const ti = list.findIndex(b => b.toUpperCase() === 'TOTAL')
    if (ti !== -1) { const [t] = list.splice(ti, 1); list.unshift(t) }
    return list.map(b => b.toUpperCase() === 'TOTAL' ? 'All' : b)
  }, [availableBuyers])

  // When a merchant's only buyer is auto-implied, keep the filter (and thus
  // the growth-target logic etc.) actually scoped to it instead of sitting
  // on "All" just because switchMerchant doesn't carry a buyer selection.
  useEffect(() => {
    if (buyerOptions.length === 1 && currentBuyer !== buyerOptions[0]) {
      switchBuyer(buyerOptions[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyerOptions])

  const activeBuyer = (!currentBuyer || currentBuyer === 'Total' || currentBuyer === 'All')
    ? '' : currentBuyer
  const activeVendor = (!currentSupplier || currentSupplier === 'All') ? '' : currentSupplier
  // currentMerchant is a portal member's email (AnalyticsV2's own scoping
  // concept); MIS's Merchant filter matches purchase_orders.created_by text
  // instead, so resolve to that member's name via merchantList first.
  // Lakshit/Shayni logged in directly as themselves (not via an admin's
  // merchant switcher) never set currentMerchant at all — isLakshit/isShayni
  // are still true (via selfFullName), but without this fallback their own
  // name never reaches MIS, so a KPI card click-through showed House
  // Doctor's whole unsplit total instead of just their own slice.
  const viewedMerchantName = currentMerchant
    ? (merchantList?.find(m => m.email === currentMerchant)?.name || '')
    : (isLakshit || isShayni) ? (selfFullName || '') : ''
  // Lakshit's own POs are reliably tagged created_by = 'Lakshit Bohra', so a
  // positive name match works for him — but it has to be the "exact" raw
  // match (merchantExact), not the regular "merchant" filter: his
  // member_organization_access grant covers all of House Doctor rather than
  // just his own slice (the same reason his AnalyticsV2 numbers need the raw
  // created_by query above instead of the normal RPC path), so MIS's usual
  // "prefer the matched member's own assigned buyer access" substitution
  // would silently widen the regular merchant filter back out to everyone's
  // POs instead of narrowing it to his — see useShipmentSkuSummary.js.
  // Shayni's aren't reliably tagged created_by = 'Shayni Sharma' (someone
  // else may have created a PO on her behalf), so her MIS drill-through
  // instead excludes Lakshit's POs from the buyer's whole set — the same
  // subtraction effectiveSummary already applies for her elsewhere on this
  // page — rather than trusting her own name to capture everything that's
  // actually hers.
  const activeMerchantName        = isShayni || isLakshit ? '' : viewedMerchantName
  const activeMerchantExactName   = isLakshit ? 'Lakshit Bohra' : ''
  const activeMerchantExcludeName = isShayni ? 'Lakshit Bohra' : ''

  // KPI cards and the Open POs By Months table drill in by swapping the
  // stats bar + bento grid for SimpleSkuSummaryTable, filtered to match —
  // not by navigating to the standalone MIS page. Buyer/vendor/merchant
  // filters need no extra wiring here: SimpleSkuSummaryTable already reads
  // them from this same page's own top filters (misBuyerOrgId/
  // misVendorOrgId/activeMerchantName etc.), same as the rest of the
  // dashboard. The inline table/filter bar render for both fy26 and fy27
  // (see the filter bar's own header comment) — navigating to the full MIS
  // page is now only a fallback for some other/unrecognized fyYear value,
  // which the FY selector's own dropdown never actually offers.
  // subSegment (optional): 'overdue'|'upcoming' — from Fy26ByMonthsChart's
  // split current-month bar (see dashboard_open_current_month_split) OR its
  // whole-FY "Open (past)"/"Open (future)" legend chips (totalOpenPast/
  // totalOpenFuture, which split every month — not just the current one —
  // by today). Either way this narrows whichever range was already chosen
  // (one month, or the whole FY) down to just the already-passed or
  // still-to-come half, matching the RPC's own target_date < CURRENT_DATE /
  // >= CURRENT_DATE boundary exactly, so the table's total_open lines up
  // with whichever bar/chip was actually clicked instead of showing the
  // same unfiltered range for both.
  // fy: which FY this drill-in is FOR — required, not inferred from the
  // global fyYear pill, since the FY27 tab renders BOTH the FY26 and FY27
  // "By Months" cards side by side; a whole-FY legend-chip click on the
  // FY26 card (month falsy) has no month slug to derive the year from, so
  // without this it silently fell back to whatever fyYear the page pill was
  // on (always 'fy27' whenever both cards are visible), mapping an FY26
  // legend click to FY27 data. Matches handleShippedInMis's own (fy, month)
  // convention. Individual-month clicks are unaffected either way — the
  // month slug itself already encodes the right year.
  const handleOpenInMis = (fy, month, subSegment) => {
    if (!canSeeMis) return
    // A supplier viewer's chart-local dropdown (volumeVendor, relabeled
    // "Buyer" for them — see the By Months cards) only ever filtered the
    // chart's own client-side rendering; it was never wired into the actual
    // MIS drill-through, so a bar/legend click ignored whatever buyer was
    // picked there. Applying it as the real global buyer filter here (same
    // action the top-level Buyer dropdown itself calls) is what actually
    // scopes the inline table/export, not just the chart.
    if (isSupplierViewer && volumeVendor && volumeVendor !== 'All' && volumeVendor !== currentBuyer) {
      switchBuyer(volumeVendor)
    }
    if (fyYear !== 'fy27' && fyYear !== 'fy26') {
      const p = new URLSearchParams({ status: 'open', dateField: 'target' })
      if (month) p.set('month', month)
      else p.set('fy', fy)
      if (subSegment) p.set('sub', subSegment)
      if (isSupplierViewer && volumeVendor && volumeVendor !== 'All') p.set('buyer', volumeVendor)
      else if (activeBuyer) p.set('buyer', activeBuyer)
      if (activeVendor) p.set('vendor', activeVendor)
      if (activeMerchantName) p.set('merchant', activeMerchantName)
      if (activeMerchantExactName) p.set('merchantExact', activeMerchantExactName)
      if (activeMerchantExcludeName) p.set('merchantExclude', activeMerchantExcludeName)
      navigate(`/dashboard/mis?${p}`)
      return
    }
    setMisStatus('open')
    setMisDateFieldOverride(null) // 'open' already defaults to 'target'
    // NOT synced to 'backlog'/'future' here even when subSegment is
    // 'overdue'/'upcoming' — this drill-in clamps to the clicked chart's own
    // FY range (below), a different, narrower query than what the Backlog/
    // Future tabs themselves produce (unbounded, all-FY "overall open till
    // date"). Highlighting a tab that implies a query this isn't would be
    // misleading, so this always lands on the plain Open view instead.
    setMisOpenSubFilter('all')
    const baseRange = month ? monthSlugToRange(month) : (FY_RANGES[fy] || FY_RANGES.fy27)
    const range = clampRangeBySubSegment(baseRange, subSegment)
    setMisTargetDateFrom(range[0]); setMisTargetDateTo(range[1])
    setMisViewMode('table')
  }
  // month (optional): a 'YYYY-MM' slug (from Fy26ByMonthsChart's shipped-bar
  // click, via labelToSlug) to narrow to just that month instead of the
  // whole FY, same idea as handleOpenInMis's own month param.
  const handleShippedInMis = (fy, month) => {
    if (!canSeeMis) return
    if (fy !== 'fy26' && fy !== 'fy27') return
    // See handleOpenInMis's own comment — volumeVendor is the actual buyer
    // selection for a supplier viewer and needs to be applied as the real
    // global buyer filter, not just left driving the chart's own rendering.
    if (isSupplierViewer && volumeVendor && volumeVendor !== 'All' && volumeVendor !== currentBuyer) {
      switchBuyer(volumeVendor)
    }
    // Same check as handleOpenInMis — the inline table/filter bar renders
    // for both fy26 and fy27, so this only falls through to the full MIS
    // page for some other/unrecognized fyYear value.
    if (fyYear !== 'fy27' && fyYear !== 'fy26') {
      const p = new URLSearchParams({ status: 'all', dateField: 'shipped', fy })
      if (month) p.set('month', month)
      if (isSupplierViewer && volumeVendor && volumeVendor !== 'All') p.set('buyer', volumeVendor)
      else if (activeBuyer) p.set('buyer', activeBuyer)
      if (activeVendor) p.set('vendor', activeVendor)
      if (activeMerchantName) p.set('merchant', activeMerchantName)
      if (activeMerchantExactName) p.set('merchantExact', activeMerchantExactName)
      if (activeMerchantExcludeName) p.set('merchantExclude', activeMerchantExcludeName)
      navigate(`/dashboard/mis?${p}`)
      return
    }
    setMisStatus('all')
    setMisDateFieldOverride('shipped') // force shipped-date active for 'all', not the default target-date
    // FY_RANGES[fy], not a hardcoded fy27 — fy can be 'fy26' here (the FY26
    // card's own KPI tile calls this with no month, meaning "all of FY26").
    const range = month ? monthSlugToRange(month) : (FY_RANGES[fy] || FY_RANGES.fy27)
    setMisTargetDateFrom(range[0]); setMisTargetDateTo(range[1])
    setMisShippedDateFrom(range[0]); setMisShippedDateTo(range[1])
    setMisViewMode('table')
  }

  // Open POs by months rows
  const { openPoRows, openPoTotalCount, openPoTotalValue, tytdValue } = useMemo(() => {
    const empty = { openPoRows: [], openPoTotalCount: 0, openPoTotalValue: 0, tytdValue: fmt$(0) }
    if (!effectiveOpenOrdersData?.buyerBreakdown) return empty

    const breakdown  = effectiveOpenOrdersData.buyerBreakdown
    const isAll      = !currentBuyer || currentBuyer === 'All' || currentBuyer?.toUpperCase() === 'TOTAL'
    const buyersToSum = isAll
      ? Object.keys(breakdown).filter(k => k.toUpperCase() !== 'TOTAL')
      : [currentBuyer]

    const merged = {}
    buyersToSum.forEach(buyer => {
      const key = Object.keys(breakdown).find(k => k.toUpperCase() === buyer?.toUpperCase())
      if (!key) return
      ;(breakdown[key] || []).forEach(m => {
        if (!merged[m.month]) merged[m.month] = { month: m.month, count: 0, value: 0 }
        merged[m.month].count += m.count || 0
        merged[m.month].value += m.value || 0
      })
    })

    const months = openPoView === 'fiscal' ? cfg.openPoFiscal : cfg.openPoCalendar
    const rows   = months.map(m => merged[m] || { month: m, count: 0, value: 0 })

    const tytd = [...FY_CONFIG.fy26.openPoFiscal, ...FY_CONFIG.fy27.openPoFiscal]
      .reduce((s, m) => s + (merged[m]?.value || 0), 0)

    // Summing each month's own distinct-PO count overcounts any PO whose
    // open line items straddle two target months (it lands in both months'
    // buckets) — dashboard_open_by_month counts distinct POs per (buyer,
    // vendor, month) cell, which is right for a single cell but not for a
    // total across cells. The Open POs Count KPI's openPosCount is a true
    // once-each count across the whole current FY (dashboard_summary), so
    // the fiscal view's Total reuses it instead of re-summing the rows —
    // same reasoning as MIS's counts deferring to dashboard_summary
    // elsewhere. The calendar view is a different (shifted) date window
    // that KPI doesn't cover, so it keeps the row-sum as the closest
    // available approximation.
    const totalCount = openPoView === 'fiscal' && effectiveSummary?.openPosCount != null
      ? effectiveSummary.openPosCount
      : rows.reduce((s, r) => s + r.count, 0)

    return {
      openPoRows: rows,
      openPoTotalCount: totalCount,
      openPoTotalValue: rows.reduce((s, r) => s + r.value, 0),
      tytdValue: fmt$(tytd),
    }
  }, [effectiveOpenOrdersData, currentBuyer, openPoView, cfg, effectiveSummary])

  // ── MIS-style filters + export bar — works for both FY26 and FY27: this
  // reconciled SKU summary path (get_sku_summary_page_reconciled/get_sku_
  // summary_stats_reconciled) takes plain date params with no FY of its own
  // baked in, so it filters/exports either year identically; initialMisRange
  // below already picks up whichever FY_RANGES[fyYear] is active. (The "FY26
  // By Months"/"FY27 By Months" bento cards are a separate, simpler
  // dashboard_volume_by_month-based view — fy26ShippedTotal/fy26VolumeData in
  // analyticsStore.js — unrelated to this filter bar.) Mirrors MIS's own
  // status pills + STATUS_FILTERS/FY_RANGES from
  // misFilters.js so the two never drift apart, plus the
  // Merchant/Buyer/Vendor selects this page already has (moved in here) —
  // an Export button (same as MIS's Excel export), and now also
  // SimpleSkuSummaryTable for an actual on-screen simple table.
  const [misStatus, setMisStatus] = useState('all')
  // Backlog/Future are subsets of 'open' (target date already passed vs.
  // still to come — same overdue/upcoming boundary the By-Months chart's
  // own legend chips use), shown as sub-tabs under the Open pill instead of
  // two more flat top-level pills next to it — clicking one narrows
  // misTargetDateFrom/To (see clampRangeBySubSegment) without changing
  // misStatus itself, which stays 'open'.
  const [misOpenSubFilter, setMisOpenSubFilter] = useState('all')
  // Free-text filter, forwarded straight through to the reconciled RPC's
  // own p_search (matches PO number OR SKU ref, ILIKE, OR'd together — see
  // sql/sku_summary_rpc_reconciled.sql) — same combined field MIS's own
  // search box ("Search SKU or PO #…", SkuShipmentSummary.jsx) already
  // uses, not two separate PO/SKU inputs.
  const [misSearch, setMisSearch] = useState('')
  const initialMisRange = FY_RANGES[fyYear] || FY_RANGES.fy27
  const [misTargetDateFrom, setMisTargetDateFrom] = useState(initialMisRange[0])
  const [misTargetDateTo, setMisTargetDateTo] = useState(initialMisRange[1])
  const [misShippedDateFrom, setMisShippedDateFrom] = useState(initialMisRange[0])
  const [misShippedDateTo, setMisShippedDateTo] = useState(initialMisRange[1])
  const [misExportMenuOpen, setMisExportMenuOpen] = useState(false)
  const [resolvingOrgIds, setResolvingOrgIds] = useState(false)
  const [misBuyerOrgId, setMisBuyerOrgId] = useState(null)
  const [misVendorOrgId, setMisVendorOrgId] = useState(null)
  const { exportToExcel: exportMisReport, exporting: exportingMisReport } = useSkuSummaryExportReconciled()

  // Clicking a KPI card (handleOpenInMis/handleShippedInMis below) shows
  // SimpleSkuSummaryTable in place of the stats bar + bento grid, instead of
  // navigating to the standalone MIS page — 'table' swaps the content below
  // the filter bar; the filter bar itself (and its own controls) stays put.
  const [misViewMode, setMisViewMode] = useState('dashboard') // 'dashboard' | 'table'
  // Lifted from SimpleSkuSummaryTable's onStatsChange so the table-view
  // header stats bar below can be rendered here, in the exact same
  // analytics-stats-bar markup the dashboard view's own header uses, instead
  // of a visually different summary drawn inside the table component itself.
  const [tableStats, setTableStats] = useState(null)
  // dateFieldForStatus(misStatus) picks 'target' for 'all', but
  // handleShippedInMis needs to force the 'shipped' field active for that
  // same 'all' status (drilling into "shipped this FY", not "targeted this
  // FY") — this override wins over the status-implied default when set, and
  // is cleared the moment the merchant manually picks a status pill again.
  const [misDateFieldOverride, setMisDateFieldOverride] = useState(null)
  const misDateField = misDateFieldOverride || dateFieldForStatus(misStatus)
  const switchFyYearAndSyncMis = (year) => {
    switchFyYear(year)
    const range = FY_RANGES[year] || FY_RANGES.fy27
    setMisTargetDateFrom(range[0]); setMisTargetDateTo(range[1])
    setMisShippedDateFrom(range[0]); setMisShippedDateTo(range[1])
  }
  // A date input left blank on blur snaps back to fyYear's own bound on
  // that side rather than resolving to an unbounded query.
  const snapMisDateIfBlank = (which) => (e) => {
    if (e.target.value) return
    const range = FY_RANGES[fyYear] || FY_RANGES.fy27
    if (which === 'targetFrom') setMisTargetDateFrom(range[0])
    else if (which === 'targetTo') setMisTargetDateTo(range[1])
    else if (which === 'shippedFrom') setMisShippedDateFrom(range[0])
    else if (which === 'shippedTo') setMisShippedDateTo(range[1])
  }

  useEffect(() => {
    if (!misExportMenuOpen) return
    const close = () => setMisExportMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [misExportMenuOpen])

  // activeBuyer/activeVendor are display-name strings (this page's own
  // convention) but get_sku_summary_page/stats and SimpleSkuSummaryTable
  // need real org uuids, so resolve them here whenever they change — used by
  // both handleMisExport and the live SimpleSkuSummaryTable below.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [buyerId, vendorId] = await Promise.all([
        activeBuyer  ? resolveOrgIdByName(activeBuyer, 'buyer')     : Promise.resolve(null),
        activeVendor ? resolveOrgIdByName(activeVendor, 'supplier') : Promise.resolve(null),
      ])
      if (!cancelled) { setMisBuyerOrgId(buyerId); setMisVendorOrgId(vendorId) }
    })()
    return () => { cancelled = true }
  }, [activeBuyer, activeVendor])

  const handleMisExport = async (mode) => {
    setResolvingOrgIds(true)
    const [buyerOrgId, vendorOrgId] = await Promise.all([
      activeBuyer  ? resolveOrgIdByName(activeBuyer, 'buyer')     : Promise.resolve(null),
      activeVendor ? resolveOrgIdByName(activeVendor, 'supplier') : Promise.resolve(null),
    ])
    setResolvingOrgIds(false)
    // Raw target/shipped values go straight through — useSkuSummaryExportReconciled
    // decides internally which field(s) to actually forward based on status
    // (both, for 'all', so the RPC's OR-matching kicks in; just the one
    // dateFieldForStatus implies otherwise), the same rule
    // useShipmentSkuSummaryReconciled.js applies for the live table. No need
    // to special-case misDateFieldOverride here: it's only ever set alongside
    // status 'all' (handleShippedInMis sets both together), and 'all' already
    // forwards both windows regardless of which field is visually "active".
    exportMisReport({
      buyerOrgId,
      vendorOrgId,
      status: misStatus,
      search: misSearch || null,
      targetDateFrom: misTargetDateFrom || null,
      targetDateTo: misTargetDateTo || null,
      shippedDateFrom: misShippedDateFrom || null,
      shippedDateTo: misShippedDateTo || null,
      merchant: activeMerchantName || null,
      merchantExclude: activeMerchantExcludeName || null,
      merchantExact: activeMerchantExactName || null,
    }, mode)
  }

  // Buyer orgs redirect to /plm for now — the scoped buyer-dashboard view
  // (resolveBuyerOrgLinkIds in analyticsStore.js, the hidden Buyer filter,
  // etc.) is fully built, just deliberately not exposed yet. Supplier orgs
  // still get their own scoped view of this same dashboard
  // (resolveSupplierOrgLinkIds), unaffected by this.
  if (orgType === 'buyer') return <Navigate to="/plm" replace />

  if (orgType !== 'merchant' && orgType !== 'supplier') return null

  if (error) return (
    <div className="p-4 rounded-xl bg-red-50 text-red-700 mx-4 mt-4">
      {error}
      <button type="button" onClick={reload} className="ml-2 underline font-medium">Retry</button>
    </div>
  )

  return (
    <div className="space-y-2 px-4">
      {/* MIS-style filters + export — works for FY26 and FY27 alike (see
          the comment above this block's state declarations for why).
          Mirrors MIS's own status pills + target/shipped date pills
          (STATUS_FILTERS/FY_RANGES imported from src/utils/misFilters.js) so
          the two never drift apart — plus the Merchant/Buyer/Vendor selects
          this page already had (moved in from the old Filters row), an
          Export button (same as MIS's Excel export), and
          SimpleSkuSummaryTable for an actual on-screen simple table below
          the filters. */}
      {(fyYear === 'fy27' || fyYear === 'fy26') && (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-3 space-y-3 -mx-4">
          <div className="analytics-filter-row flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-center sm:justify-between">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 min-w-0">
              {/* Horizontal scroll strip on mobile instead of wrapping mid-
                  group — a row of 7 pills wrapping onto a second line reads
                  as two disconnected groups; scrolling keeps them as one. */}
              <div className="flex items-center gap-1.5 overflow-x-auto sm:overflow-visible sm:flex-wrap -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {STATUS_FILTERS.map(f => (
                  <button key={f.key} type="button" onClick={() => {
                    setMisStatus(f.key)
                    setMisDateFieldOverride(null)
                    // Backlog/Future only mean anything under the Open pill
                    // — switching to any status (Open included) starts that
                    // sub-filter fresh at "All" rather than silently
                    // inheriting whichever one was last picked.
                    setMisOpenSubFilter('all')
                    // A prior drill-in (a KPI card, a chart bar, the
                    // overdue/upcoming split) can leave misTargetDateFrom/To
                    // or misShippedDateFrom/To narrowed to one month (or
                    // half of one) — reset both back to the full FY range
                    // here, same as switchFyYearAndSyncMis does, so a plain
                    // status pill click always starts from the whole year
                    // instead of silently inheriting that leftover window.
                    const range = FY_RANGES[fyYear] || FY_RANGES.fy27
                    setMisTargetDateFrom(range[0]); setMisTargetDateTo(range[1])
                    setMisShippedDateFrom(range[0]); setMisShippedDateTo(range[1])
                    // 'All' is the dashboard's own default lens (stats bar +
                    // bento grid already cover it) — every other status pill
                    // is a drill-down with nothing to show except the actual
                    // rows, so it jumps straight to the table view, same as
                    // clicking a KPI card does (handleOpenInMis/handleShippedInMis).
                    setMisViewMode(f.key === 'all' ? 'dashboard' : 'table')
                  }}
                    className={`analytics-status-pill flex-shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer
                      ${misStatus === f.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                    {f.label}
                  </button>
                ))}
              </div>

              {isAdmin && merchantList?.length > 0 && (
                <select
                  className="analytics-mis-select w-full sm:w-auto h-7 px-2 border border-gray-200 rounded-lg bg-white text-[11px] font-semibold text-gray-600"
                  value={currentMerchant || ''}
                  onChange={e => switchMerchant(e.target.value || null)}
                >
                  <option value="">— All Merchants —</option>
                  {merchantList
                    .filter(m => !EXCLUDED_MERCHANTS.has(m.email))
                    .map(m => <option key={m.email} value={m.email}>{m.name}</option>)}
                </select>
              )}

              {/* A buyer org is always its own single "buyer" — this
                  dropdown would only ever offer that one redundant option
                  ("All Buyers" / their own name), same reasoning as hiding
                  the Vendor filter for supplier viewers below. */}
              {!isBuyerViewer && buyerOptions.length > 0 && (
                <select
                  className="analytics-mis-select w-full sm:w-auto h-7 px-2 border border-gray-200 rounded-lg bg-white text-[11px] font-semibold text-gray-600 sm:max-w-[180px] truncate"
                  value={currentBuyer === 'Total' ? 'All' : (currentBuyer || 'All')}
                  onChange={e => switchBuyer(e.target.value === 'All' ? 'Total' : e.target.value)}
                >
                  {buyerOptions.map(b => <option key={b} value={b}>{b === 'All' ? 'All Buyers' : b}</option>)}
                </select>
              )}

              {orgType !== 'supplier' && availableSuppliers?.length > 0 && (
                <select
                  className="analytics-mis-select w-full sm:w-auto h-7 px-2 border border-gray-200 rounded-lg bg-white text-[11px] font-semibold text-gray-600 sm:max-w-[180px] truncate"
                  value={currentSupplier || 'All'}
                  onChange={e => switchSupplier(e.target.value === 'All' ? null : e.target.value)}
                >
                  <option value="All">All Vendors</option>
                  {availableSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </div>
            <div className="relative w-full sm:w-auto" onClick={e => e.stopPropagation()}>
              <button type="button" onClick={() => setMisExportMenuOpen(v => !v)} disabled={exportingMisReport || resolvingOrgIds}
                className="analytics-export-btn w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 cursor-pointer disabled:cursor-default transition-colors">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {resolvingOrgIds ? 'Preparing…' : exportingMisReport ? 'Exporting…' : 'Export'}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {misExportMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
                  <button type="button" onClick={() => { handleMisExport('detailed'); setMisExportMenuOpen(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
                    Detailed (SKU-level)
                  </button>
                  <div className="my-1 border-t border-gray-100" />
                  <button type="button" onClick={() => { handleMisExport('weekly'); setMisExportMenuOpen(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
                    Weekly Totals
                  </button>
                  <button type="button" onClick={() => { handleMisExport('monthly'); setMisExportMenuOpen(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
                    Monthly Totals
                  </button>
                  <button type="button" onClick={() => { handleMisExport('summary'); setMisExportMenuOpen(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
                    Summary Totals
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Backlog/Future — subsets of Open (target date already passed
              vs. still to come), shown as sub-tabs instead of two more flat
              pills next to Open itself. On its own row, not packed into the
              filter row above — that row already wraps the Export button
              onto an awkward line at narrower widths, and adding more
              content there made it worse. Deliberately NOT clamped to the
              current FY's own bounds the way the By-Months chart's
              overdue/upcoming legend chips are (clampRangeBySubSegment) —
              those chips total up one specific FY's chart, but Backlog/
              Future here mean "overall open till date" (same all-time-
              spanning idea dashboard_open_by_month/TYTD Open POs already
              use), so an overdue PO targeted before this FY started is
              still Backlog, and any still-open PO from any future FY is
              still Future. Backlog leaves targetDateFrom empty (no floor,
              just "up to yesterday"); Future leaves targetDateTo empty (no
              ceiling, just "from today on"). */}
          {misStatus === 'open' && (
            <MiniTabs
              options={['All', 'Backlog', 'Future']}
              value={misOpenSubFilter === 'backlog' ? 'Backlog' : misOpenSubFilter === 'future' ? 'Future' : 'All'}
              onChange={opt => {
                setMisOpenSubFilter(opt === 'Backlog' ? 'backlog' : opt === 'Future' ? 'future' : 'all')
                if (opt === 'Backlog') {
                  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
                  setMisTargetDateFrom(''); setMisTargetDateTo(yesterday.toISOString().slice(0, 10))
                } else if (opt === 'Future') {
                  const todayStr = new Date().toISOString().slice(0, 10)
                  setMisTargetDateFrom(todayStr); setMisTargetDateTo('')
                } else {
                  const range = FY_RANGES[fyYear] || FY_RANGES.fy27
                  setMisTargetDateFrom(range[0]); setMisTargetDateTo(range[1])
                }
              }}
            />
          )}

          {/* Target/Shipped date range only matters once you're looking at
              actual rows (table view) — the dashboard view's own cards
              already break Open/Shipped down by month, so there's nothing
              here for these to filter while that view is showing. */}
          {misViewMode === 'table' && (
          <div className="analytics-date-row flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-x-6 sm:gap-y-2 sm:items-center pt-3 border-t border-gray-100">
            {/* Target Date and Shipped Date stay visible/editable at all
                times, but only the one dateFieldForStatus(misStatus) implies
                is actually sent on export (see handleMisExport) — the other
                is dimmed to signal it's inert for the current status, not
                removed, so switching status back doesn't lose whatever the
                merchant had set on it. Label+FY-pills share one line, with
                From/To on their own line below on mobile (each input taking
                half the width) — the desktop layout (single wrapping row)
                is unchanged from sm: up. */}
            <div className={`flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1.5 transition-opacity ${misDateField === 'target' ? '' : 'opacity-40'}`}>
              <div className="flex items-center gap-2">
                <span className="analytics-date-label text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Target Date</span>
                <div className="flex items-center gap-1 sm:hidden">
                  {[{ key: 'fy26', label: 'FY26' }, { key: 'fy27', label: 'FY27' }]
                    .filter(f => f.key !== 'fy26' || !isLakshit)
                    .map(f => (
                      <button key={f.key} type="button" onClick={() => switchFyYearAndSyncMis(f.key)}
                        className={`analytics-year-pill px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer
                          ${fyYear === f.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {f.label}
                      </button>
                    ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="analytics-date-label text-[10px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">From</span>
                <input type="date" value={misTargetDateFrom} onChange={e => setMisTargetDateFrom(e.target.value)}
                  onBlur={snapMisDateIfBlank('targetFrom')}
                  className="analytics-date-input flex-1 sm:flex-none sm:w-36 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:border-gray-900 transition-colors" />
                <span className="analytics-date-label text-[10px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">To</span>
                <input type="date" value={misTargetDateTo} onChange={e => setMisTargetDateTo(e.target.value)}
                  onBlur={snapMisDateIfBlank('targetTo')}
                  className="analytics-date-input flex-1 sm:flex-none sm:w-36 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:border-gray-900 transition-colors" />
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1">
              {[{ key: 'fy26', label: 'FY26' }, { key: 'fy27', label: 'FY27' }]
                .filter(f => f.key !== 'fy26' || !isLakshit)
                .map(f => (
                  <button key={f.key} type="button" onClick={() => switchFyYearAndSyncMis(f.key)}
                    className={`analytics-year-pill px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer
                      ${fyYear === f.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {f.label}
                  </button>
                ))}
            </div>
            <div className={`flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1.5 transition-opacity ${misDateField === 'shipped' ? '' : 'opacity-40'}`}>
              <div className="flex items-center gap-2">
                <span className="analytics-date-label text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Shipped Date</span>
                <div className="flex items-center gap-1 sm:hidden">
                  {[{ key: 'fy26', label: 'FY26' }, { key: 'fy27', label: 'FY27' }]
                    .filter(f => f.key !== 'fy26' || !isLakshit)
                    .map(f => (
                      <button key={`b-${f.key}`} type="button" onClick={() => switchFyYearAndSyncMis(f.key)}
                        className={`analytics-year-pill px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer
                          ${fyYear === f.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {f.label}
                      </button>
                    ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="analytics-date-label text-[10px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">From</span>
                <input type="date" value={misShippedDateFrom} onChange={e => setMisShippedDateFrom(e.target.value)}
                  onBlur={snapMisDateIfBlank('shippedFrom')}
                  className="analytics-date-input flex-1 sm:flex-none sm:w-36 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:border-gray-900 transition-colors" />
                <span className="analytics-date-label text-[10px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">To</span>
                <input type="date" value={misShippedDateTo} onChange={e => setMisShippedDateTo(e.target.value)}
                  onBlur={snapMisDateIfBlank('shippedTo')}
                  className="analytics-date-input flex-1 sm:flex-none sm:w-36 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:border-gray-900 transition-colors" />
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1">
              {[{ key: 'fy26', label: 'FY26' }, { key: 'fy27', label: 'FY27' }]
                .filter(f => f.key !== 'fy26' || !isLakshit)
                .map(f => (
                  <button key={`b-${f.key}`} type="button" onClick={() => switchFyYearAndSyncMis(f.key)}
                    className={`analytics-year-pill px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer
                      ${fyYear === f.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {f.label}
                  </button>
                ))}
            </div>
          </div>
          )}
        </div>
      )}

      {misViewMode === 'dashboard' ? (<>
      {/* Stats bar */}
      {(loading || ((isLakshit || isShayni) && lakshitLoading)) && !summary ? (
        <div className="analytics-stats-bar grid grid-cols-2 gap-x-8 gap-y-4 sm:flex sm:flex-wrap sm:gap-6 md:gap-8 py-4 mb-2 border-b border-gray-100 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="relative sm:pr-6">
              <div className="h-6 w-20 bg-gray-200 rounded mb-1.5" />
              <div className="h-2.5 w-14 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      ) : summary && (
        <div className="analytics-stats-bar grid grid-cols-2 gap-x-8 gap-y-4 sm:flex sm:flex-wrap sm:gap-6 md:gap-8 py-4 mb-2 border-b border-gray-100">
          {[
            { id: 'buyer',     label: 'Buyer',           value: currentBuyer === 'Total' ? 'All' : (currentBuyer || 'All') },
            { id: 'total_pos', label: 'Total PO Value',  value: fmt$(currentFyVol + (effectiveSummary?.totalOpenPos || 0)) },
            // shippedFullyPos + partialPos, not onTimePos + latePos +
            // partialPos — onTimePos/latePos now also count a qualifying
            // partial PO (see shippedDisplay's own comment below), so
            // summing all three would double-count it. shippedFullyPos is
            // still mutually exclusive with partialPos (a PO is either
            // fully shipped or it isn't), same as before that widening.
            { id: 'pos_count', label: 'Total POs',       value: shippedFullyPos + partialPos + (effectiveSummary?.openPosCount || 0) },
            { id: 'total_skus',label: 'Converted SKUs',  value: effectiveSummary?.totalConvertedSKUs || 0 },
          ].map(s => (
            <div key={s.id}
              className="analytics-stat-item relative sm:pr-6 sm:after:absolute sm:after:right-0 sm:after:top-0 sm:after:bottom-0 sm:after:w-px sm:after:bg-gray-200 sm:last:after:hidden">
              <div className="stat-value text-lg sm:text-xl font-bold text-gray-900">{s.value}</div>
              <div className="stat-label text-[10px] font-medium text-gray-500 uppercase tracking-wide">{s.label}</div>
            </div>
          ))}
          <button type="button" onClick={() => setOtifModalOpen(true)}
            className="analytics-stat-item relative sm:pr-6 sm:after:absolute sm:after:right-0 sm:after:top-0 sm:after:bottom-0 sm:after:w-px sm:after:bg-gray-200 text-left cursor-pointer hover:opacity-80 transition-opacity">
            <div className="stat-value text-lg sm:text-xl font-bold text-gray-900">{otifRateOriginal != null ? fmtPct(otifRateOriginal) : '—'}</div>
            <div className="stat-label text-[10px] font-medium text-gray-500 uppercase tracking-wide">OTIF (Original)</div>
          </button>
          <div className="analytics-stat-item relative sm:pr-6 sm:after:absolute sm:after:right-0 sm:after:top-0 sm:after:bottom-0 sm:after:w-px sm:after:bg-gray-200 sm:last:after:hidden">
            <div className="stat-value text-lg sm:text-xl font-bold text-gray-900">{otifRate != null ? fmtPct(otifRate) : '—'}</div>
            <div className="stat-label text-[10px] font-medium text-gray-500 uppercase tracking-wide">OTIF (After Exception)</div>
          </div>
          <div className="analytics-fy-refresh col-span-2 sm:col-span-1 sm:ml-auto flex items-center justify-between sm:justify-normal gap-4 flex-shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-600">FY Year:</span>
              <select
                className="min-w-[110px] h-8 px-3 border border-gray-200 rounded-lg bg-white text-xs"
                value={fyYear}
                onChange={e => switchFyYearAndSyncMis(e.target.value)}
              >
                <option value="fy27">FY 2027</option>
                {!isLakshit && <option value="fy26">FY 2026</option>}
              </select>
            </div>
            <button type="button" onClick={reload}
              className="self-center text-xs text-gray-400 hover:text-gray-600 underline">
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* OTIF modal */}
      {otifModalOpen && (() => {
        const byMonth = Object.fromEntries((effectiveOtifData || []).map(r => [r.month, r]))
        const rows = cfg.openPoFiscal.map(month => ({
          month,
          ...(byMonth[month] || { totalPos: 0, onTimePos: 0, shippedValue: 0 }),
        }))
        // Shipped Value is legitimately additive across months (real dollars
        // that moved each month, no double-counting risk), so it's still
        // summed from these monthly rows. Total POs/On Time are NOT — a PO
        // shipping across multiple months appears as its own row in each of
        // them, so summing would double-count it. Those two instead read
        // straight from dashboard_summary's own onTimePosOriginal/
        // latePosOriginal (already computed above — the same whole-FY,
        // fully-shipped-only figures the "OTIF (Original)" header card
        // shows), guaranteeing this Total row always agrees with it.
        const totals = rows.reduce((acc, r) => ({
          shippedValue: acc.shippedValue + (r.shippedValue || 0),
        }), { shippedValue: 0 })
        const totalPosOriginal = onTimePosOriginal + latePosOriginal
        const overallPct = totalPosOriginal > 0
          ? (onTimePosOriginal / totalPosOriginal) * 100
          : null
        return (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
            onClick={() => setOtifModalOpen(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative p-5 pt-10"
              onClick={e => e.stopPropagation()}>
              <button type="button" onClick={() => setOtifModalOpen(false)}
                className="absolute top-3 right-3 p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
              <div className="mb-3">
                <h2 className="font-semibold text-base m-0 text-gray-900">OTIF Monthly View</h2>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  On-time = PO finalised on or before original target date
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[0.8em]">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 font-semibold text-[11px]">
                      <th className="px-2 py-1.5 text-left whitespace-nowrap border-b border-gray-200">Month</th>
                      <th className="px-2 py-1.5 text-center whitespace-nowrap border-b border-gray-200">Total POs</th>
                      <th className="px-2 py-1.5 text-center whitespace-nowrap border-b border-gray-200">On Time</th>
                      <th className="px-2 py-1.5 text-center whitespace-nowrap border-b border-gray-200">OTIF %</th>
                      <th className="px-2 py-1.5 text-center whitespace-nowrap border-b border-gray-200">Shipped Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otifLoading && !isLakshit ? (
                      <tr><td colSpan={5} className="px-2 py-4 text-center text-gray-400 text-xs">Loading…</td></tr>
                    ) : rows.map(r => {
                      const pct = r.totalPos > 0 ? (r.onTimePos / r.totalPos) * 100 : null
                      return (
                        <tr key={r.month} className="border-b border-gray-100 hover:bg-[#f5f7ff] text-[10px]">
                          <td className="px-2 py-1.5 whitespace-nowrap">{r.month}</td>
                          <td className={`px-2 py-1.5 text-center whitespace-nowrap font-semibold ${r.totalPos ? 'text-black' : 'text-gray-300'}`}>
                            {r.totalPos || '—'}
                          </td>
                          <td className={`px-2 py-1.5 text-center whitespace-nowrap font-semibold ${r.onTimePos ? 'text-green-700' : 'text-gray-300'}`}>
                            {r.totalPos ? r.onTimePos : '—'}
                          </td>
                          <td className={`px-2 py-1.5 text-center whitespace-nowrap font-semibold ${pct != null ? 'text-black' : 'text-gray-300'}`}>
                            {pct != null ? fmtPct(pct) : '—'}
                          </td>
                          <td className={`px-2 py-1.5 text-center whitespace-nowrap ${r.shippedValue ? 'text-[#005A9C]' : 'text-gray-300'}`}>
                            {r.shippedValue > 0 ? fmt$(r.shippedValue) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {!otifLoading && (
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-[11px] sticky bottom-0">
                        <td className="px-2 py-2 whitespace-nowrap text-gray-700">Total</td>
                        <td className="px-2 py-2 text-center whitespace-nowrap text-gray-900">{totalPosOriginal}</td>
                        <td className="px-2 py-2 text-center whitespace-nowrap text-gray-900">{onTimePosOriginal}</td>
                        <td className="px-2 py-2 text-center whitespace-nowrap text-gray-900">
                          {overallPct != null ? fmtPct(overallPct) : '—'}
                        </td>
                        <td className="px-2 py-2 text-center whitespace-nowrap text-gray-900">{fmt$(totals.shippedValue)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Pill stats — mirrors MerchantDashboard.jsx's row below its filters.
          Quality Claims is omitted: it reads summary.totalQualityClaims(LY),
          which dashboard_summary (this page's only data source) doesn't
          return. Grid-aligned with the bento grid's own column structure
          (analytics-pill-grid mirrors magic-bento-grid's breakpoints in
          sales-analytics.css) so pill 1 sits directly above KPI card 1
          (current_fy_shipped), pill 2 above card 2 (open_po), and so on —
          not just "somewhere above the row" via flex-wrap. */}
      <div className="analytics-pill-grid mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">TYTD Open Pos:</span>
          <div className="pill-box flex h-11 items-center gap-2 px-3 border border-gray-200 rounded-lg bg-white">
            <span className="pill-value text-lg font-bold text-gray-900">{tytdValue}</span>
          </div>
        </div>
        {showTargetStats && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">Target:</span>
            <div className="pill-box flex h-11 items-center gap-2 px-3 border border-gray-200 rounded-lg bg-white">
              <span className={`pill-value text-lg font-bold ${fyYear === 'fy27' ? 'text-gray-300' : 'text-gray-900'}`}>{fmt$(ytdTarget)}</span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">Achieved:</span>
          <div className="pill-box flex h-11 items-center gap-2 px-3 border border-gray-200 rounded-lg bg-white">
            <span className="pill-value text-lg font-bold text-gray-900">{fmt$(currentFyVol)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">YOY Growth:</span>
          <div className="pill-box flex h-11 items-center gap-2 px-3 border border-gray-200 rounded-lg bg-white">
            <span className="pill-value text-lg font-bold text-gray-900">{fmtPct(actualGrowth)}</span>
          </div>
        </div>
      </div>

      {/* Mobile-only counterpart to the grid above (below 600px, see
          .analytics-pill-grid-mobile in sales-analytics.css) — a genuinely
          separate 2-column layout with the label stacked above the value,
          matching the header stats bar's own mobile treatment, instead of
          the desktop grid's bento-aligned single column looking sparse and
          oversized at mobile widths. */}
      <div className="analytics-pill-grid-mobile mb-3">
        <div className="pill-box flex flex-col gap-1 p-3 border border-gray-200 rounded-lg bg-white">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">TYTD Open Pos</span>
          <span className="pill-value text-base font-bold text-gray-900">{tytdValue}</span>
        </div>
        {showTargetStats && (
          <div className="pill-box flex flex-col gap-1 p-3 border border-gray-200 rounded-lg bg-white">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Target</span>
            <span className={`pill-value text-base font-bold ${fyYear === 'fy27' ? 'text-gray-300' : 'text-gray-900'}`}>{fmt$(ytdTarget)}</span>
          </div>
        )}
        <div className="pill-box flex flex-col gap-1 p-3 border border-gray-200 rounded-lg bg-white">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Achieved</span>
          <span className="pill-value text-base font-bold text-gray-900">{fmt$(currentFyVol)}</span>
        </div>
        <div className="pill-box flex flex-col gap-1 p-3 border border-gray-200 rounded-lg bg-white">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">YOY Growth</span>
          <span className="pill-value text-base font-bold text-gray-900">{fmtPct(actualGrowth)}</span>
        </div>
      </div>

      {/* Bento grid */}
      {summary && (
        <div className="bg-white">
          <div className="magic-bento-grid">

            <KpiCard cardId="current_fy_shipped"
              title={`FYTD ${cfg.current.short} Shipped`}
              subtitle={showTargetStats ? `Target: ${fmt$(ytdTarget)}` : undefined}
              value={fmt$(currentFyVol)}
              onClick={canSeeMis ? () => handleShippedInMis(fyYear) : undefined} />

            <KpiCard cardId="open_po"
              title="Open POs" subtitle={cfg.current.short}
              value={fmt$(effectiveSummary?.totalOpenPos || 0)}
              onClick={canSeeMis ? () => handleOpenInMis(fyYear) : undefined} />

            {showTargetStats && (
              <div className={CARD} data-card-id="volume_shipped">
                <div className={CARD_HEADER}>
                  <div>
                    <h2 className={CARD_TITLE}>{`FYTD ${cfg.current.short} Shipped`}</h2>
                    <div className={CARD_SUB}>Progress to Target</div>
                  </div>
                </div>
                <div className={CARD_CONTENT}>
                  <GaugeCard current={currentFyVol} target={ytdTarget} />
                </div>
              </div>
            )}

            <KpiCard cardId="prev_fy_shipped"
              title={`${cfg.previous.short} Shipped`}
              subtitle="April–March"
              value={fmt$(prevFyVol)}
              onClick={canSeeMis ? () => handleShippedInMis(fyYear === 'fy27' ? 'fy26' : null) : undefined} />

            <div className={CARD} data-card-id="shipped_po_count">
              <div className={CARD_HEADER}>
                <div>
                  <h2 className={CARD_TITLE}>Shipped POs Count</h2>
                  <div className={CARD_SUB}>This Year</div>
                </div>
                <MiniTabs options={['Fully Shipped','On Time','Late','Partial']} value={shippedTab} onChange={setShippedTab} />
              </div>
              <div className={CARD_CONTENT}>
                <div className={KPI_VALUE}>{shippedDisplay}</div>
              </div>
            </div>

            <KpiCard cardId="open_pos_count"
              title="Open POs Count"
              subtitle={cfg.current.short}
              value={String(effectiveSummary?.openPosCount ?? 0)}
              onClick={canSeeMis ? () => handleOpenInMis(fyYear) : undefined} />

            {showTargetStats && (
              <div className={CARD} data-card-id="growth_rate">
                <div className={CARD_HEADER}>
                  <div>
                    <p className={CARD_TITLE}>Target Growth Rate</p>
                    <p className={CARD_SUB}>vs {cfg.previous.short} shipped</p>
                  </div>
                </div>
                <div className={CARD_CONTENT}>
                  {isHouseDoctorOnly ? (
                    <>
                      <div className="flex items-baseline gap-1 my-1">
                        <span className="text-[2em] font-semibold text-gray-900">10</span>
                        <span className="text-[1.4em] font-semibold text-gray-400">%</span>
                        <span className="ml-2 text-[10px] text-gray-400 self-center">fixed</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">Target: {fmt$(ytdTarget)}</div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1 my-1">
                        <span className="text-[2em] font-semibold text-gray-900">{targetGrowthRate}</span>
                        <span className="text-[1.4em] font-semibold text-gray-400">%</span>
                        <span className="ml-2 text-[10px] text-gray-400 self-center">fixed</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">Target: {fmt$(ytdTarget)}</div>
                    </>
                  )}
                </div>
              </div>
            )}

            {showTargetStats && (
              <KpiCard cardId="target_achieved"
                title="Target Achieved"
                subtitle={`FYTD ${cfg.current.short}`}
                value={fmtPct(targetAchieved)} />
            )}

            {/* Buyer/supplier-only replacements for the 3 hidden target
                cards above (showTargetStats is only true for orgType ===
                'merchant') — sales-analytics.css places these three in
                exactly those cards' old grid cells (data-card-id-keyed, so
                the merchant view's own volume_shipped/growth_rate/
                target_achieved rules are untouched). quality_claims has no
                live data source yet (dashboard_summary doesn't return a
                quality-claims figure, same reason the pill-stats row above
                already omits it) — placeholder until that's wired up. Avg.
                Lead Time (order_date -> actual shipped_date) and Average
                Delivery Delay (final_date - effective_target, late POs only)
                are computed server-side in dashboard_summary (avgLeadTimeDays/
                avgDelayDays, sql/dashboard_rpcs.sql) — see analyticsStore.js.
                Same figures, just scoped to whichever org's own links
                baseLinkIds resolves to (a buyer's own POs across every
                vendor they source from, or a supplier's own POs across
                every buyer they ship to). */}
            {!showTargetStats && (
              <>
                <KpiCard cardId="quality_claims"
                  title="Quality Claims"
                  subtitle={`FYTD ${cfg.current.short}`}
                  value="—" />

                <KpiCard cardId="avg_lead_time"
                  title="Avg. Lead Time"
                  subtitle="Order to Ship"
                  value={fmtDays(effectiveSummary?.avgLeadTimeDays)} />

                <KpiCard cardId="avg_delivery_delay"
                  title="Avg. Delivery Delay"
                  subtitle="Ex-Factory, Late POs only"
                  value={fmtDays(effectiveSummary?.avgDelayDays)} />
              </>
            )}

            {/* Global Markets */}
            <div className={CARD} data-card-id="sourcing_by_region">
              <div className={CARD_HEADER}>
                <div>
                  <h2 className={CARD_TITLE}>Global Markets</h2>
                  <div className={CARD_SUB}>YTD Value</div>
                </div>
                <MiniTabs
                  options={['By Country', 'By Client']}
                  value={sourcingMode === 'country' ? 'By Country' : 'By Client'}
                  onChange={v => setSourcingMode(v === 'By Country' ? 'country' : 'client')}
                />
              </div>
              <div className={CARD_CONTENT}>
                <SourcingRegionChart
                  sourcingList={sourcingList}
                  sourcingMode={sourcingMode}
                  setSourcingMode={setSourcingMode}
                />
              </div>
            </div>

            {/* Open POs By Months table */}
            <div className={CARD} data-card-id="open_po_monthly">
              <div className={CARD_HEADER}>
                <div>
                  <h2 className={CARD_TITLE}>Open POs By Months</h2>
                  <div className={CARD_SUB}>Count &amp; Value</div>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <MiniTabs
                    options={[`${cfg.current.short} (Apr-Mar)`, `FY${cfg.current.year + 1} (Apr-Mar)`]}
                    value={openPoView === 'fiscal'
                      ? `${cfg.current.short} (Apr-Mar)`
                      : `FY${cfg.current.year + 1} (Apr-Mar)`}
                    onChange={v => setOpenPoView(v.startsWith(cfg.current.short) ? 'fiscal' : 'calendar')}
                  />
                  {canSeeMis && (
                  <button
                    onClick={() => handleOpenInMis(fyYear)}
                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors cursor-pointer shrink-0"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </button>
                  )}
                </div>
              </div>
              <div className={CARD_CONTENT}>
                <div className="flex-1 overflow-y-auto min-h-0">
                  <table className="w-full border-collapse text-[0.8em]">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 font-semibold text-[11px] sticky top-0 z-[1]">
                        <th className="px-2 py-1.5 text-left whitespace-nowrap border-b border-gray-200">Month</th>
                        <th className="px-2 py-1.5 text-left whitespace-nowrap border-b border-gray-200">Count</th>
                        <th className="px-2 py-1.5 text-left whitespace-nowrap border-b border-gray-200">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openPoRows.map(r => (
                        <tr key={r.month} className="border-b border-gray-100 text-[10px] hover:bg-[#f5f7ff]">
                          <td className="px-2 py-1.5 whitespace-nowrap">{r.month}</td>
                          <td className={`px-2 py-1.5 whitespace-nowrap font-semibold ${r.count ? 'text-black' : 'text-gray-300'}`}>
                            {r.count || '0'}
                          </td>
                          <td
                            className={`px-2 py-1.5 whitespace-nowrap font-medium transition-colors
                              ${r.value && canSeeMis
                                ? 'text-[#005A9C] cursor-pointer hover:text-blue-800 hover:underline underline-offset-2'
                                : r.value ? 'text-[#005A9C]' : 'text-gray-300'
                              }`}
                            onClick={r.value && canSeeMis ? e => {
                              e.stopPropagation()
                              handleOpenInMis(fyYear, labelToSlug(String(r.month)))
                            } : undefined}
                          >
                            {r.value > 0 ? fmt$(r.value) : '$0'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-[11px] sticky bottom-0">
                        <td className="px-2 py-2 whitespace-nowrap text-gray-700">Total</td>
                        <td className="px-2 py-2 whitespace-nowrap text-gray-900">{openPoTotalCount} POs</td>
                        <td className="px-2 py-2 whitespace-nowrap text-gray-900">{fmt$(openPoTotalValue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* FY By Months charts */}
            {fyYear === 'fy27' ? (<>
              <div className={CARD} data-card-id="volume_fy26">
                <div className={CARD_HEADER}>
                  <div>
                    <h2 className={CARD_TITLE}>FY26 By Months</h2>
                    <div className={CARD_SUB}>Shipped &amp; Open POs</div>
                  </div>
                  {!isLakshit && (
                    <select className="h-6 px-1.5 text-[10px] border border-gray-200 rounded-md bg-white"
                      value={volumeVendor} onChange={e => setVolumeVendor(e.target.value)}>
                      <option value="All">{isSupplierViewer ? 'All Buyers' : 'All Vendors'}</option>
                      {fy26VolumeData?.rows && [...new Set(fy26VolumeData.rows.map(r => isSupplierViewer ? r.buyer : r.vendor).filter(Boolean))].sort()
                        .map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  )}
                </div>
                <div className={CARD_CONTENT}>
                  {/* This chart's data (fy26VolumeData) comes from the old
                      backend route — company-wide, not scoped to any
                      merchant — so it can't represent Lakshit's own numbers.
                      Left blank rather than showing unrelated totals. */}
                  {isLakshit ? null : fy26VolumeData ? (
                    <div className="-ml-6">
                      <Fy26ByMonthsChart
                        volumeData={fy26VolumeData}
                        openOrdersData={effectiveOpenOrdersData}
                        currentMonthSplit={openCurrentMonthSplit}
                        buyer={isSupplierViewer ? volumeVendor : (currentBuyer === 'Total' ? 'All' : currentBuyer)}
                        buyerSwitcherBuyers={availableBuyers}
                        vendor={isSupplierViewer ? 'All' : volumeVendor}
                        fyConfig={FY_CONFIG.fy26}
                        onYMax={setFy26ChartMaxY}
                        yMax={byMonthsSharedMaxY}
                        onBarClick={canSeeMis ? ({ bar, fullMonthName, subSegment }) => {
                          // null fullMonthName = a legend-chip click (whole
                          // FY, no specific month) — handleOpenInMis/
                          // handleShippedInMis already default to the full
                          // FY range when month is falsy.
                          const month = fullMonthName ? labelToSlug(fullMonthName) : null
                          if (bar === 'shipped') handleShippedInMis('fy26', month)
                          else handleOpenInMis('fy26', month, subSegment)
                        } : undefined}
                      />
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-xs text-gray-300 animate-pulse">
                      Loading FY26 data…
                    </div>
                  )}
                </div>
              </div>

              <div className={CARD} data-card-id="volume_fy27">
                <div className={CARD_HEADER}>
                  <div>
                    <h2 className={CARD_TITLE}>FY27 By Months</h2>
                    <div className={CARD_SUB}>Shipped &amp; Open POs</div>
                  </div>
                  <select className="h-6 px-1.5 text-[10px] border border-gray-200 rounded-md bg-white"
                    value={volumeVendor} onChange={e => setVolumeVendor(e.target.value)}>
                    <option value="All">{isSupplierViewer ? 'All Buyers' : 'All Vendors'}</option>
                    {/* Options come from this chart's OWN (FY-scoped) rows,
                        not the global availableBuyers/availableSuppliers lists — those
                        list every buyer/vendor this org has EVER linked to,
                        so picking one with no data in this specific FY would
                        otherwise show a correctly-empty but confusing blank
                        chart, even though the org does have data elsewhere. */}
                    {(isSupplierViewer
                      ? [...new Set((effectiveVolumeData?.rows || []).map(r => r.buyer).filter(Boolean))].sort()
                      : [...new Set((effectiveVolumeData?.rows || []).map(r => r.vendor).filter(Boolean))].sort()
                    ).map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className={CARD_CONTENT}>
                  <div className="-ml-6">
                    <Fy26ByMonthsChart
                      volumeData={effectiveVolumeData}
                      openOrdersData={effectiveOpenOrdersData}
                      currentMonthSplit={openCurrentMonthSplit}
                      buyer={isSupplierViewer ? volumeVendor : (currentBuyer === 'Total' ? 'All' : currentBuyer)}
                      buyerSwitcherBuyers={availableBuyers}
                      vendor={isSupplierViewer ? 'All' : volumeVendor}
                      fyConfig={cfg}
                      onYMax={setFy27ChartMaxY}
                      yMax={byMonthsSharedMaxY}
                      onBarClick={canSeeMis ? ({ bar, fullMonthName, subSegment }) => {
                        const month = fullMonthName ? labelToSlug(fullMonthName) : null
                        if (bar === 'shipped') handleShippedInMis('fy27', month)
                        else handleOpenInMis('fy27', month, subSegment)
                      } : undefined}
                    />
                  </div>
                </div>
              </div>
            </>) : (
              <div className={CARD} data-card-id="volume_over_time">
                <div className={CARD_HEADER}>
                  <div>
                    <h2 className={CARD_TITLE}>{cfg.current.short} By Months</h2>
                    <div className={CARD_SUB}>Shipped &amp; Open POs</div>
                  </div>
                  <select className="h-6 px-1.5 text-[10px] border border-gray-200 rounded-md bg-white"
                    value={volumeVendor} onChange={e => setVolumeVendor(e.target.value)}>
                    <option value="All">{isSupplierViewer ? 'All Buyers' : 'All Vendors'}</option>
                    {/* Options come from this chart's OWN (FY-scoped) rows,
                        not the global availableBuyers/availableSuppliers lists — those
                        list every buyer/vendor this org has EVER linked to,
                        so picking one with no data in this specific FY would
                        otherwise show a correctly-empty but confusing blank
                        chart, even though the org does have data elsewhere. */}
                    {(isSupplierViewer
                      ? [...new Set((effectiveVolumeData?.rows || []).map(r => r.buyer).filter(Boolean))].sort()
                      : [...new Set((effectiveVolumeData?.rows || []).map(r => r.vendor).filter(Boolean))].sort()
                    ).map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className={CARD_CONTENT}>
                  <div className="-ml-6">
                    <Fy26ByMonthsChart
                      volumeData={effectiveVolumeData}
                      openOrdersData={effectiveOpenOrdersData}
                      currentMonthSplit={openCurrentMonthSplit}
                      buyer={isSupplierViewer ? volumeVendor : (currentBuyer === 'Total' ? 'All' : currentBuyer)}
                      buyerSwitcherBuyers={availableBuyers}
                      vendor={isSupplierViewer ? 'All' : volumeVendor}
                      fyConfig={cfg}
                      compact
                      onBarClick={canSeeMis ? ({ bar, fullMonthName, subSegment }) => {
                        const month = fullMonthName ? labelToSlug(fullMonthName) : null
                        if (bar === 'shipped') handleShippedInMis(fyYear, month)
                        else handleOpenInMis(fyYear, month, subSegment)
                      } : undefined}
                    />
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
      </>) : (<>
        {/* Drill-down table — shown in place of the stats bar + bento grid
            above when a KPI card (handleOpenInMis/handleShippedInMis) was
            clicked. The filter bar's own controls stay live: adjusting them
            here keeps refining this same table instead of needing another
            KPI-card click. Header stats bar mirrors the dashboard view's own
            (analytics-stats-bar/analytics-stat-item/stat-value/stat-label)
            exactly, fed by the table's onStatsChange, with Back sitting where
            the dashboard's own FY-Year/Refresh block does (analytics-fy-refresh,
            pinned right via ml-auto) instead of a separate row above the table. */}
        <div className="analytics-stats-bar grid grid-cols-2 gap-x-8 gap-y-4 sm:flex sm:flex-wrap sm:items-center sm:gap-6 md:gap-8 py-4 mb-2 border-b border-gray-100">
          <div className="analytics-stat-item relative sm:pr-6 sm:after:absolute sm:after:right-0 sm:after:top-0 sm:after:bottom-0 sm:after:w-px sm:after:bg-gray-200">
            <div className="stat-value text-lg sm:text-xl font-bold text-gray-900">
              {currentBuyer === 'Total' ? 'All' : (currentBuyer || 'All')}
            </div>
            <div className="stat-label text-[10px] font-medium text-gray-500 uppercase tracking-wide">Buyer</div>
          </div>
          <div className="analytics-stat-item relative sm:pr-6 sm:after:absolute sm:after:right-0 sm:after:top-0 sm:after:bottom-0 sm:after:w-px sm:after:bg-gray-200">
            <div className="stat-value text-lg sm:text-xl font-bold text-gray-900">
              {!tableStats || tableStats.loading ? '—' : tableStats.totalPoDisplay}
            </div>
            <div className="stat-label text-[10px] font-medium text-gray-500 uppercase tracking-wide">
              {tableStats?.totalPoDisplay === 1 ? 'PO' : 'POs'}
            </div>
          </div>
          {/* Converted SKUs (distinct line items in the filtered set,
              stats.skuCount — same idea as dashboard_summary's
              totalConvertedSKUs) shown for every status. Qty total dropped —
              Converted SKUs + Value cover it without a raw quantity figure
              that reads oddly mixed across differently unit'd SKUs. */}
          <div className="analytics-stat-item relative sm:pr-6 sm:after:absolute sm:after:right-0 sm:after:top-0 sm:after:bottom-0 sm:after:w-px sm:after:bg-gray-200">
            <div className="stat-value text-lg sm:text-xl font-bold text-gray-900">
              {!tableStats || tableStats.loading ? '—' : tableStats.skuCount}
            </div>
            <div className="stat-label text-[10px] font-medium text-gray-500 uppercase tracking-wide">Converted SKUs</div>
          </div>
          <div className="analytics-stat-item relative sm:pr-6 sm:after:absolute sm:after:right-0 sm:after:top-0 sm:after:bottom-0 sm:after:w-px sm:after:bg-gray-200 sm:last:after:hidden">
            <div className="stat-value text-lg sm:text-xl font-bold text-emerald-700">
              {!tableStats || tableStats.loading ? '—' : fmt$(tableStats.totalValue)}
            </div>
            <div className="stat-label text-[10px] font-medium text-gray-500 uppercase tracking-wide">
              Total {tableStats?.totalLabel || ''} Value
            </div>
          </div>
          {/* OTIF only makes sense once POs have actually shipped/been
              inspected — shown for 'all' and 'closed' (the "Shipped" pill),
              not for open/partial-only views. Reuses the same page-level
              otifRate the dashboard view's own OTIF cards show (already
              scoped to the current buyer/vendor/merchant selection), not a
              separately-filtered number. */}
          {(misStatus === 'all' || misStatus === 'closed') && (
            // col-span-2 on mobile — this is the 5th stat when shown, which
            // would otherwise sit alone in its own row with empty space
            // beside it in the 2-column mobile grid.
            <div className="analytics-stat-item relative col-span-2 sm:col-span-1 sm:pr-6 sm:after:absolute sm:after:right-0 sm:after:top-0 sm:after:bottom-0 sm:after:w-px sm:after:bg-gray-200 sm:last:after:hidden">
              <div className="stat-value text-lg sm:text-xl font-bold text-gray-900">
                {otifRate != null ? fmtPct(otifRate) : '—'}
              </div>
              <div className="stat-label text-[10px] font-medium text-gray-500 uppercase tracking-wide">OTIF</div>
            </div>
          )}
          <div className="analytics-fy-refresh col-span-2 sm:col-span-1 sm:ml-auto flex items-center gap-2 flex-shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-100">
            {/* Search replaces the old "Showing X POs — FY Y" line here —
                the stats bar above already covers plenty (Buyer, POs,
                Converted SKUs, Value, OTIF), so that text was redundant. */}
            <div className="relative flex-1 sm:flex-none sm:w-56">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={misSearch}
                onChange={e => setMisSearch(e.target.value)}
                placeholder="Search SKU or PO #…"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
              />
            </div>
            <button type="button" onClick={() => {
              // Same full reset as the "All" status pill — otherwise misStatus
              // (and a possibly month-narrowed date range) from whatever KPI
              // card/chart bar got you here leaks back into the dashboard view:
              // the status pill row would keep showing e.g. "Open" highlighted,
              // and the next plain drill-in that doesn't itself set every field
              // (there isn't one today, but Back shouldn't rely on that) could
              // inherit a stale range instead of starting clean.
              setMisStatus('all')
              setMisSearch('')
              setMisDateFieldOverride(null)
              const range = FY_RANGES[fyYear] || FY_RANGES.fy27
              setMisTargetDateFrom(range[0]); setMisTargetDateTo(range[1])
              setMisShippedDateFrom(range[0]); setMisShippedDateTo(range[1])
              setMisViewMode('dashboard')
            }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              Back
            </button>
          </div>
        </div>
        <SimpleSkuSummaryTable
          buyerOrgId={misBuyerOrgId}
          vendorOrgId={misVendorOrgId}
          status={misStatus}
          search={misSearch}
          targetDateFrom={misTargetDateFrom}
          targetDateTo={misTargetDateTo}
          shippedDateFrom={misShippedDateFrom}
          shippedDateTo={misShippedDateTo}
          dateFieldOverride={misDateFieldOverride}
          merchant={activeMerchantName}
          merchantExclude={activeMerchantExcludeName}
          merchantExact={activeMerchantExactName}
          onStatsChange={setTableStats}
        />
      </>)}
    </div>
  )
}
