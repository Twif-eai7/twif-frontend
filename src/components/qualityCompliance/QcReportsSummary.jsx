import { reportEffectiveDate, effectiveDateRangeFilter, effectiveDateFromFilter } from '../../utils/reportEffectiveDate'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import JSZip from 'jszip'
import QcRepositoryPanel from './QcRepositoryPanel'
import { groupReports, groupSchedulesOnly, groupOpenPosOnly } from './repositoryLayout'
import { supabase } from '../../lib/supabase'
import { useIsAdmin, useOrgDepartment, useOrgId, useProfileStore } from '../../stores/profileStore'
import { useAuthStore } from '../../stores/authStore'
import { useUiStore } from '../../stores/uiStore'
import { useMerchantPoBuyersAccess } from '../../hooks/useMerchantPoBuyersAccess'
import { resolveBuyerOrgsForMember, resolveMerchantMemberLinkIds } from '../../lib/poQueries'
import SearchableSelect from '../ui/SearchableSelect'
import { ExportPicker } from './inspectionReport/InspectionReportEntry'
import { ACCEPTED_RESULTS, RESULT_LABEL, RESULT_BADGE_CLASS } from './inspectionReport/stageStatus'
import { ownScheduleRestrictionEmail } from '../../utils/inspectionScheduleAccess'
import { getPo, getBuyerName, getVendorName, getInspector, getInspectorDisplayName, getSkuRef, getOpenPoBuyerName, getOpenPoVendorName, getBatchNos, distinctOptions, mergeOptionLists } from '../../utils/qcReportReaders'
import { useDragToDismiss } from '../../hooks/useDragToDismiss'
import { FilterIcon, FilterField, FilterSheetShell } from './MobileFilterPrimitives'
import { withSortedPhotos } from '../../lib/photoSequence'

// Supabase/PostgREST caps a single unbounded query at a server-configured
// max row count (confirmed live at 2000 rows for this project) - a query
// with no .range()/.limit() of its own doesn't error past that cap, it just
// silently truncates, in whatever order the rows happen to come back. Real
// bug found live: a PO's freshly-submitted reports simply didn't appear
// anywhere on this page (not the stage tabs, not Combined Reports, not the
// KPI counts) even though the rows were completely valid - the 24-month
// reports query alone already matches over 21,000 rows district-wide, more
// than 10x the cap, so which ~2000 of them actually came back was arbitrary
// and excluded this PO's. Paginates via .range() instead, accumulating
// every page, so nothing is silently dropped regardless of how large the
// matching set grows.
//
// A SECOND, subtler instance of this same class of bug: pagination via
// .range() across several SEPARATE requests only returns a complete,
// non-overlapping partition of the result set if the underlying row order
// is stable across those requests - which Postgres does NOT guarantee
// without an explicit ORDER BY. Without one, a row can silently fall into
// the gap between two page windows (or get returned twice) if the planner's
// default output order shifts between requests. This is exactly how a PO
// already inspected through Final (real, `submitted`/`accepted` reports,
// well within the date window) still failed to turn up anywhere on this
// page or in its own Repository search - found live via PO 30 (BALANCE &
// BLOOM / HVM Network Private Limited). Every loadTrend query below ends in
// .order('id') - any stable, unique column - so each page is a
// deterministic slice of the same total order.
//
// A THIRD instance, found live once this table's matching row count grew
// past ~13,000 (from ~21,000 to over 51,000 as more inspection data was
// backfilled/corrected): .range() is OFFSET-based, and Postgres has to walk
// past every earlier row to serve a deep page - each page gets slower the
// further into the table it reads, and an earlier version of this function
// that ALSO fired several .range() pages concurrently (to keep the common,
// small case fast) made that worse by hitting several expensive deep
// offsets at once. Once total rows grew enough, deep pages started missing
// the database's own statement timeout entirely - reproduced live: the
// OFFSET version failed outright past ~13,000 rows, while the fix below
// (keyset/cursor pagination - `WHERE id > <last id seen> ORDER BY id LIMIT
// pageSize` instead of an OFFSET) stayed at 200-800ms per page all the way
// through 51,000+ rows, since a keyset page never has to scan past rows it
// isn't returning. This gives up the earlier version's concurrent-batch
// speedup for the common small-result case (every page is now sequential,
// since each one's cursor depends on the previous page's last row) - a
// real, deliberate tradeoff: reliable-but-sequential beats
// fast-until-it-breaks for a query this page's KPI tiles and Repository
// table both depend on completing at all.
// sessionStorage cache for loadTrend's three query results - the KPI tiles
// and Repository table both read from these, so a cache hit means the page
// paints real numbers immediately on a repeat visit/navigation within the
// same tab session instead of showing the skeleton every single time, even
// though the data underneath hasn't meaningfully changed in the last few
// minutes. sessionStorage (not localStorage) so a closed tab always starts
// clean rather than serving arbitrarily old numbers days later. This is a
// pure speed optimization, never load-bearing - loadTrend() below always
// still runs a real fetch after a cache hit and overwrites both the state
// and the cache entry once it resolves; a cache miss, a parse failure, or a
// quota error (the big inspection_reports array can be large enough that
// some browsers refuse to store it) all just fall through to the normal
// cold-start loading state.
const TREND_CACHE_KEY = 'qcReportsTrendCache_v1'
// 30 minutes, not 5 - fetchAllPages' keyset pagination (see its own comment)
// traded concurrent-batch speed for reliability at this table's current
// size, so a fresh fetch now genuinely takes longer. A short TTL meant
// routine navigating away and back within one work session kept re-paying
// that full cost instead of feeling "loaded" - 30 minutes covers a normal
// session's worth of switching between this page and others while still
// bounding how stale the numbers can get.
const TREND_CACHE_TTL_MS = 30 * 60 * 1000

function readTrendCache(scheduleRestrictEmail) {
  try {
    const raw = sessionStorage.getItem(TREND_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.scheduleRestrictEmail !== (scheduleRestrictEmail || null)) return null
    if (!parsed.savedAt || Date.now() - parsed.savedAt > TREND_CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeTrendCache(scheduleRestrictEmail, poRows, reportRows, scheduleRows) {
  try {
    sessionStorage.setItem(TREND_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      scheduleRestrictEmail: scheduleRestrictEmail || null,
      poRows, reportRows, scheduleRows,
    }))
  } catch {
    // Quota exceeded (most likely culprit - the full reports array can run
    // into several MB) or storage unavailable (private browsing) - skip
    // caching this time rather than let a storage error break the page.
  }
}

// buildQuery's own .order('id') is load-bearing here, not just for the
// no-order truncation bug above - keyset pagination's `.gt('id', cursor)`
// only returns a correct, non-overlapping next page if 'id' is what the
// query is actually sorted by.
async function fetchAllPages(buildQuery, pageSize = 1000) {
  const all = []
  let cursor = null
  while (true) {
    let q = buildQuery().limit(pageSize)
    if (cursor) q = q.gt('id', cursor)
    const { data, error } = await q
    if (error) return { data: all, error }
    all.push(...(data || []))
    if (!data || data.length < pageSize) break
    cursor = data[data.length - 1].id
  }
  return { data: all, error: null }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STAGE_ABBR = { inline: 'IL', midline: 'ML', final: 'FN' }
const STAGE_ORDER = { inline: 0, midline: 1, final: 2 }
const STAGE_TABS = [{ key: 'inline', label: 'Inline' }, { key: 'midline', label: 'Midline' }, { key: 'final', label: 'Final' }]
const VIEW_LABELS = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' }

// Mobile-only stand-in for the "Refresh" text link (Open POs KPI) - icon
// only, no word, to save space next to "QC Reports" on a phone.
function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
    </svg>
  )
}

// Highest-stage report per SKU (Final beats Midline beats Inline) - same
// rule the Generated Reports dropdown and ExportPicker's autoPreview both
// use, applied here for exports so a SKU that's gone all the way only
// contributes its Final report, not every earlier stage too.
function pickHighestStagePerSku(reports) {
  const bestBySku = new Map()
  for (const r of reports) {
    const stage = STAGE_ORDER[r.inspection_type] ?? -1
    const cur = bestBySku.get(r.po_line_item_id)
    if (!cur || stage > cur.stage) bestBySku.set(r.po_line_item_id, { stage, report: r })
  }
  return [...bestBySku.values()].map(v => v.report)
}

function fmtCompactUsd(n) {
  const v = Number(n) || 0
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toLocaleString()}`
}

function fmtISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDisplayDate(dateStr) {
  if (!dateStr) return '-'
  // A bare "YYYY-MM-DD" (calendar-cell keys, inspection_date) needs the
  // T00:00:00 suffix to parse as local midnight rather than UTC midnight -
  // but a full timestamp (submitted_at) already carries its own time/offset,
  // and appending another T00:00:00 to that would just malform the string.
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`)
  return isNaN(d) ? dateStr : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDayHeader(d) {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}
function startOfWeek(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
}
// "Week" view shows 2 full calendar weeks (14 days) at once. CalendarGrid's
// grid-cols-7 auto-wraps 14 cells into 2 rows on its own, no extra layout
// code needed.
function buildWeek(cursor) {
  const start = startOfWeek(cursor)
  return Array.from({ length: 14 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}
function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const startOffset = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = startOffset; i > 0; i--) cells.push(new Date(year, month, 1 - i))
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  let extra = 1
  while (cells.length % 7 !== 0) { cells.push(new Date(year, month, daysInMonth + extra)); extra++ }
  return cells
}
function periodLabel(view, cursor, days) {
  if (view === 'day') return cursor.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  if (view === 'week') {
    const start = days[0], end = days[days.length - 1]
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
    return sameMonth
      ? `${start.getDate()}–${end.getDate()} ${start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
      : `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  if (view === 'month') return cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return String(cursor.getFullYear())
}

// Same deep-path readers, for inspection_schedules rows (assigned/planned
// work that hasn't necessarily produced a report yet), a parallel shape,
// not the same table, so these can't reuse the getPo/getBuyerName above.
function getSchedulePo(s)         { return s.purchase_orders ?? null }
function getScheduleBuyerName(s)  { return getSchedulePo(s)?.buyer_supplier_links?.buyer?.display_name ?? null }
function getScheduleVendorName(s) { return getSchedulePo(s)?.buyer_supplier_links?.supplier?.display_name ?? null }
function getScheduleInspector(s)  { return s.organization_members ?? null }

// Worst-first, same convention as dayDotColor in InspectionSchedule.jsx: any
// rejected report reads red even if others that day/PO passed - rejected at
// any stage (inline/midline/final) counts, this never requires Final.
// Green is the opposite: it requires Final specifically to be accepted, not
// just any stage - a PO that's only cleared Inline/Midline so far hasn't
// actually finished, so it stays amber ("in progress") until Final says so,
// not a premature green off an early stage's own accept.
function worstTone(reports) {
  const submitted = reports.filter(r => r.status === 'submitted')
  if (submitted.some(r => r.inspection_result === 'rejected')) return 'red'
  if (submitted.some(r => r.inspection_type === 'final' && ACCEPTED_RESULTS.includes(r.inspection_result))) return 'green'
  if (submitted.length) return 'amber'
  return 'gray'
}

const TONE_CLASS = {
  green:     'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  red:       'bg-red-50 text-red-600 ring-1 ring-red-200',
  amber:     'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  gray:      'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
  scheduled: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
}
const DOT_CLASS = { green: 'bg-emerald-500', red: 'bg-red-400', amber: 'bg-amber-400', gray: 'bg-gray-400', scheduled: 'bg-sky-500' }
// Same tint/ring as TONE_CLASS but no text color - the calendar-cell chips
// use this with a DOT_CLASS dot up front instead, so the tone reads from the
// dot + background rather than tinted text (which was hard to read at 10px).
const TONE_CHIP_BG_CLASS = {
  green:     'bg-emerald-50 ring-1 ring-emerald-200',
  red:       'bg-red-50 ring-1 ring-red-200',
  amber:     'bg-amber-50 ring-1 ring-amber-200',
  gray:      'bg-gray-100 ring-1 ring-gray-200',
  scheduled: 'bg-sky-50 ring-1 ring-sky-200',
}

// Worst-first across a mix of already-toned groups (report-based and
// schedule-only), used where a single day/dot has to summarize several POs
// at once. Green (a clean accept) is the "nothing needs attention" state, so
// it only wins when literally nothing else is present that day.
const TONE_PRIORITY = ['red', 'amber', 'gray', 'scheduled', 'green']
function worstToneAmong(items) {
  for (const t of TONE_PRIORITY) if (items.some(g => g.tone === t)) return t
  return null
}

export default function QcReportsSummary() {
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const orgId = useOrgId()
  // QA-department members were never part of the merchandising
  // buyer-access-grant system (member_organization_access) - they inspect
  // across buyers, not for one buyer's account, so they should see every
  // PO here unrestricted, same as admins/owners. This overrides only this
  // page's own local buyersAccess, not the shared hook itself (also used by
  // three Financial pages, which should stay buyer-scoped for QA staff).
  const isQaDept = useOrgDepartment() === 'qa'
  const rawBuyersAccess = useMerchantPoBuyersAccess()
  const buyersAccess = useMemo(
    () => (isQaDept ? { ...rawBuyersAccess, isUnrestricted: true } : rawBuyersAccess),
    [rawBuyersAccess, isQaDept]
  )
  const orgMembership = useProfileStore(s => s.orgMembership)
  const userEmail = useAuthStore(s => s.session?.user?.email)
  // Restricts the 5 named schedule managers to schedules/reports they
  // personally created; null (everyone else, plus Admins/Owners) sees
  // everything, same as today.
  const scheduleRestrictEmail = ownScheduleRestrictionEmail(userEmail, orgMembership)

  // Read once, at mount - restores the calendar/filter/scroll position this
  // page was left at, whether that's a route navigation away-and-back (this
  // component remounting fresh, local useState alone would lose it) or a
  // real page reload (uiStore's own localStorage persistence, not just
  // sessionStorage, covers that too). `useState(() => ...)` below only
  // reads this ONE snapshot, taken before any of this render's own setState
  // calls - later writes to the store (see the sync effect further down)
  // don't re-trigger these initializers.
  // A plain getState() snapshot, not the reactive useUiStore(selector) hook -
  // this is only ever read for these ONE-TIME lazy initializers below, never
  // reactively afterward, so subscribing the component to every future
  // store update (which the sync effect just below causes on every
  // filter/view change) would only cost extra re-renders for no benefit.
  const [persistedView] = useState(() => useUiStore.getState().qcReportsViewState)
  const setPersistedView = useUiStore(s => s.setQcReportsViewState)

  const [view, setView] = useState(() => persistedView?.view ?? 'month')
  const [cursor, setCursor] = useState(() => (persistedView?.cursor ? new Date(persistedView.cursor) : new Date()))
  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  const days = useMemo(() => {
    if (view === 'day')   return [cursor]
    if (view === 'week')  return buildWeek(cursor)
    if (view === 'month') return buildMonthGrid(year, month)
    return [] // year: rendered via 12 mini calendars, not a flat day list
  }, [view, cursor, year, month])

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === 'year') return { rangeStart: fmtISO(new Date(year, 0, 1)), rangeEnd: fmtISO(new Date(year, 11, 31)) }
    const d = days.length ? days : [cursor]
    return { rangeStart: fmtISO(d[0]), rangeEnd: fmtISO(d[d.length - 1]) }
  }, [view, cursor, days, year])

  const STEP = { day: 1, week: 14 }
  const goPrev = () => setCursor(c => {
    if (view === 'month') return new Date(c.getFullYear(), c.getMonth() - 1, 1)
    if (view === 'year')  return new Date(c.getFullYear() - 1, c.getMonth(), 1)
    return new Date(c.getFullYear(), c.getMonth(), c.getDate() - STEP[view])
  })
  const goNext = () => setCursor(c => {
    if (view === 'month') return new Date(c.getFullYear(), c.getMonth() + 1, 1)
    if (view === 'year')  return new Date(c.getFullYear() + 1, c.getMonth(), 1)
    return new Date(c.getFullYear(), c.getMonth(), c.getDate() + STEP[view])
  })
  const goToday = () => setCursor(new Date())

  const todayStr = fmtISO(new Date())

  const [rows, setRows]               = useState([])
  const [scheduleRows, setScheduleRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const [buyerFilter, setBuyerFilter]         = useState(() => persistedView?.buyerFilter ?? '')
  const [vendorFilter, setVendorFilter]       = useState(() => persistedView?.vendorFilter ?? '')
  const [regionFilter, setRegionFilter]       = useState(() => persistedView?.regionFilter ?? '')
  const [inspectorFilter, setInspectorFilter] = useState(() => persistedView?.inspectorFilter ?? '')
  const [poSearch, setPoSearch] = useState('')
  // Clicking a KPI tile below (Scheduled/Inspected/Accepted POs or SKUs)
  // restricts the calendar/Repository rows to just that tile's POs - `label`
  // is the clicked tile's own label (not the underlying metric), so only
  // that one box highlights even though its POs/SKUs sibling tile shares the
  // same poNumbers set. Deliberately NOT fed back into searchedRows/
  // searchedSchedules (which the KPI tiles' own numbers are computed from) -
  // see byDate/kpiFilteredInspectedTrendRows below, which apply this one
  // layer further downstream instead, so clicking one tile never changes
  // what any other tile displays.
  const [kpiFilter, setKpiFilter] = useState(null) // { label, poNumbers: Set<string> } | null
  // Clicking the already-active tile (or its own × button) clears it back
  // to no filter; clicking a different one replaces it - only one active
  // at a time.
  const toggleKpiFilter = (label, poDates) => setKpiFilter(cur => (
    cur?.label === label ? null : { label, poNumbers: new Set((poDates || []).map(d => d.poNumber)) }
  ))
  // Mobile-only: Buyer/Vendor/Region/Inspector/Merchant open in a bottom
  // sheet (drag-to-dismiss, same gesture MobileFilterSheet.jsx/
  // MobileBulkActionSheet.jsx already use) behind a single filter-icon
  // trigger, instead of an inline collapsible grid - desktop/tablet keep
  // the grid always visible, unaffected. Only relevant when the calendar is
  // showing - in Repository view, RepositoryPanel.jsx renders its own
  // combined trigger/sheet instead (these same fields, passed down as
  // props, plus its own Date/Status/Vendor-QA-Stage), so there's only ever
  // one "Filters" entry point visible on a phone at a time, never two.
  const [mobileFilterSheetOpen, setMobileFilterSheetOpen] = useState(false)

  // Admin-only "view as merchant": mirrors the same idea OpenPoSummary.jsx
  // uses, but resolved directly via resolveBuyerOrgsForMember (a plain
  // Supabase query) rather than pulling in the heavier Node-backend-driven
  // dashboard store, which drives unrelated global dashboard state.
  const [merchantOptions, setMerchantOptions]         = useState([])
  const [merchantFilter, setMerchantFilter]           = useState(() => persistedView?.merchantFilter ?? '')
  const [merchantBuyerNames, setMerchantBuyerNames]   = useState(null)

  useEffect(() => {
    if (!isAdmin || !orgId) return
    let cancelled = false
    supabase.from('organization_members')
      .select('id, full_name')
      .eq('organization_id', orgId)
      .eq('department', 'merchandising')
      .is('removed_at', null)
      .order('full_name')
      .then(({ data }) => { if (!cancelled) setMerchantOptions((data || []).map(m => ({ value: m.id, label: m.full_name }))) })
    return () => { cancelled = true }
  }, [isAdmin, orgId])

  useEffect(() => {
    if (!merchantFilter) { setMerchantBuyerNames(null); return }
    let cancelled = false
    resolveBuyerOrgsForMember(merchantFilter).then(orgs => {
      if (!cancelled) setMerchantBuyerNames(orgs.map(o => o.name).filter(Boolean))
    })
    return () => { cancelled = true }
  }, [merchantFilter])

  // The full QA roster, same source and query as the "Assigned QA" picker
  // in InspectionScheduleForm.jsx, not just whichever inspectors happen to
  // already have a report in the currently-loaded date window (that left
  // the dropdown empty on lighter-traffic periods even though real QA staff
  // exist).
  const [qaOptions, setQaOptions] = useState([])
  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    supabase.from('organization_members')
      .select('id, full_name')
      .eq('organization_id', orgId)
      .eq('department', 'qa')
      .is('removed_at', null)
      .order('full_name')
      .then(({ data }) => { if (!cancelled) setQaOptions((data || []).map(m => ({ value: m.id, label: m.full_name }))) })
    return () => { cancelled = true }
  }, [orgId])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    // Two sources, merged: inspection_reports is *actual* activity (draft or
    // submitted work), inspection_schedules is *assigned/planned* work:
    // an entry that's been scheduled but nobody has opened yet has no
    // inspection_reports row at all, so it would otherwise be invisible on
    // this page even though it's exactly the kind of thing "who has what
    // assigned" needs to show. Fetched in parallel, deduped below (a
    // schedule already reflected by a real report doesn't need its own
    // separate chip too).
    let scheduleQuery = supabase.from('inspection_schedules')
      .select(`
        id, inspection_type, scheduled_date, status, assigned_qa_id, line_items, created_by_email,
        organization_members!assigned_qa_id(id, full_name),
        purchase_orders!inner(
          id, po_number, ex_factory_date, exceptional_ex_factory_date,
          buyer_supplier_links!inner(
            buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(id, display_name),
            supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(id, display_name)
          )
        ),
        inspection_reports!fulfilled_schedule_id(id, status)
      `)
      .neq('status', 'cancelled')
      .gte('scheduled_date', rangeStart)
      .lte('scheduled_date', rangeEnd)
      .order('scheduled_date', { ascending: false })
    if (scheduleRestrictEmail) scheduleQuery = scheduleQuery.ilike('created_by_email', scheduleRestrictEmail)

    const [reportsRes, scheduleRes] = await Promise.all([
      supabase.from('inspection_reports')
        .select(`
          id, report_no, inspection_type, round, status, inspection_result, inspection_date, submitted_at,
          inspector_name, contact, arrival_time, start_time, complete_time, fulfilled_schedule_id, po_line_item_id,
          po_line_items!inner(
            id, buyer_sku_ref, sku_id,
            purchase_orders!inner(
              id, po_number,
              buyer_supplier_links!inner(
                buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(id, display_name),
                supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(id, display_name)
              ),
              inspection_report_batches(batch_no)
            )
          ),
          inspection_schedules!fulfilled_schedule_id(assigned_qa_id, created_by_email, organization_members!assigned_qa_id(id, full_name))
        `)
        // Inspection Date when typed, otherwise the submission date (see reportEffectiveDate.js).
        .or(effectiveDateRangeFilter(rangeStart, rangeEnd))
        .order('inspection_date', { ascending: false, nullsFirst: false }),
      scheduleQuery,
    ])
    setLoading(false)
    if (reportsRes.error) { setError(reportsRes.error.message); return }
    if (scheduleRes.error) { setError(scheduleRes.error.message); return }
    // Only submitted reports get their own chip. A draft (whether genuine
    // in-progress work or a bare accepted-quantity placeholder from the
    // bulk-accept flow) isn't a finished result worth its own entry here;
    // it either falls back to showing as "Scheduled" (if a schedule backs
    // it) or just doesn't appear, rather than cluttering the calendar with
    // an ambiguous gray "something happened, unclear what" chip.
    // The schedule query above is already restricted server-side; a report
    // has no created_by_email of its own, so it's scoped here by whether the
    // schedule entry it fulfilled was created by the restricted user - a
    // report with no linked schedule at all isn't part of "their own
    // schedules" either, so it's dropped too.
    const submittedReports = (reportsRes.data || []).filter(r => r.status === 'submitted')
    setRows(scheduleRestrictEmail
      ? submittedReports.filter(r => r.inspection_schedules?.created_by_email?.toLowerCase() === scheduleRestrictEmail)
      : submittedReports)
    setScheduleRows(scheduleRes.data || [])
  }, [rangeStart, rangeEnd, scheduleRestrictEmail])

  useEffect(() => { load() }, [load])

  // Wide, independent dataset for the Open-vs-Inspected trend chart/KPIs -
  // deliberately NOT coupled to rangeStart/rangeEnd (the calendar's own
  // view window), since a single-Day calendar view would otherwise drive an
  // empty/misleading trend. Fetched once on mount (re-fetched only if the
  // schedule restriction changes), independent of view/cursor.
  const trendRangeStart = useMemo(() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - 24)
    return fmtISO(d)
  }, [])

  const [openPoTrendRows, setOpenPoTrendRows] = useState([])
  const [inspectedTrendRows, setInspectedTrendRows] = useState([])
  const [scheduleTrendRows, setScheduleTrendRows] = useState([])
  const [trendLoading, setTrendLoading] = useState(true)
  const [trendError, setTrendError] = useState(null)
  // Set once this mount has painted from a cache hit - loadTrend's own
  // background refresh then skips re-showing the skeleton (there's already
  // real, if slightly stale, data on screen) instead of yanking the page
  // back into a loading state every time it silently re-verifies.
  const hydratedFromCacheRef = useRef(false)

  // Paint instantly from whatever this tab last fetched, before the real
  // fetch below even starts - see the cache helpers' own comment above.
  useEffect(() => {
    const cached = readTrendCache(scheduleRestrictEmail)
    if (!cached) return
    setOpenPoTrendRows(cached.poRows || [])
    setInspectedTrendRows(cached.reportRows || [])
    setScheduleTrendRows(cached.scheduleRows || [])
    setTrendLoading(false)
    hydratedFromCacheRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadTrend = useCallback(async () => {
    if (!hydratedFromCacheRef.current) setTrendLoading(true)
    setTrendError(null)
    const [poRes, reportsRes, scheduleRes] = await Promise.all([
      // Same "open PO" predicate as useFetchPOs.js: not soft-deleted, not
      // closed. po_line_items carries the per-SKU status needed for the
      // Open SKUs count/trend. Paginated (fetchAllPages) - already over
      // 1600 matching rows and climbing, well on its way to the same
      // silent-truncation risk the reports query below actually hit.
      fetchAllPages(() => supabase.from('purchase_orders')
        .select(`
          id, po_number, po_received_date, status, ex_factory_date, exceptional_ex_factory_date,
          buyer_supplier_links!inner(
            buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(id, display_name),
            supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(id, display_name)
          ),
          po_line_items(id, buyer_sku_ref, status, quantity_ordered, target_date)
        `)
        .is('deleted_at', null)
        .is('delete_meta', null)
        .neq('status', 'closed')
        .gte('po_received_date', trendRangeStart)
        .order('id')),
      // Same shape as load()'s inspection_reports query above, widened to
      // 24 months and restricted to submitted (finished) reports only.
      // Paginated (fetchAllPages) - this is the query that actually hit the
      // server's row cap live (21,000+ matching rows, only ~2000 returned,
      // no ordering to make that truncation predictable) and silently
      // dropped a real PO's reports from the whole page. See fetchAllPages'
      // own comment for the full story.
      fetchAllPages(() => supabase.from('inspection_reports')
        .select(`
          id, report_no, inspection_type, round, status, inspection_result, inspection_date, submitted_at, inspector_name, po_line_item_id,
          accepted_quantity, available_quantity,
          po_line_items!inner(
            id, buyer_sku_ref, target_date, quantity_ordered,
            purchase_orders!inner(
              id, po_number, ex_factory_date, exceptional_ex_factory_date,
              buyer_supplier_links!inner(
                buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(id, display_name),
                supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(id, display_name)
              ),
              inspection_report_batches(batch_no)
            )
          ),
          inspection_schedules!fulfilled_schedule_id(assigned_qa_id, created_by_email, organization_members!assigned_qa_id(id, full_name))
        `)
        .eq('status', 'submitted')
        .or(effectiveDateFromFilter(trendRangeStart))
        .order('id')),
      // Wide (24-month), same window as the two above - a report only
      // links back to a schedule via fulfilled_schedule_id when it was
      // submitted through the flow that sets it; a good chunk of reports
      // (bulk-accepted, or submitted before that linking existed) have it
      // null with no inspector_name either, even though a real schedule
      // entry assigning a QA to that exact SKU+stage still exists. This
      // powers the Repository drawer's Inspector column falling back to
      // "whoever was scheduled for this SKU" when the report itself didn't
      // capture who inspected it. Paginated (fetchAllPages), same reasoning
      // as the other two above.
      fetchAllPages(() => supabase.from('inspection_schedules')
        .select('id, po_id, inspection_type, line_items, assigned_qa_id, created_by_email, organization_members!assigned_qa_id(full_name)')
        .neq('status', 'cancelled')
        .gte('scheduled_date', trendRangeStart)
        .order('id')),
    ])
    setTrendLoading(false)
    if (poRes.error || reportsRes.error || scheduleRes.error) { setTrendError(poRes.error?.message || reportsRes.error?.message || scheduleRes.error?.message); return }
    const poRows = poRes.data || []
    // Same created_by_email restriction load() applies to submittedReports,
    // mirrored here since this is the same restricted-schedule-manager rule.
    const reportRows = scheduleRestrictEmail
      ? (reportsRes.data || []).filter(r => r.inspection_schedules?.created_by_email?.toLowerCase() === scheduleRestrictEmail)
      : (reportsRes.data || [])
    const scheduleRows = scheduleRestrictEmail
      ? (scheduleRes.data || []).filter(s => s.created_by_email?.toLowerCase() === scheduleRestrictEmail)
      : (scheduleRes.data || [])
    setOpenPoTrendRows(poRows)
    setInspectedTrendRows(reportRows)
    setScheduleTrendRows(scheduleRows)
    hydratedFromCacheRef.current = false
    writeTrendCache(scheduleRestrictEmail, poRows, reportRows, scheduleRows)
  }, [trendRangeStart, scheduleRestrictEmail])

  useEffect(() => { loadTrend() }, [loadTrend])

  // Non-admin merchant users are auto-scoped to their own buyers, same as
  // every other merchant-facing summary page in this app, no dropdown, no
  // way to see outside that scope.
  const scopedRows = useMemo(() => {
    if (buyersAccess.isUnrestricted) return rows
    if (!buyersAccess.ready) return []
    return rows.filter(r => buyersAccess.allowedBuyers.includes(getBuyerName(r)))
  }, [rows, buyersAccess])

  const merchantScopedRows = useMemo(() => {
    if (!merchantFilter || !merchantBuyerNames) return scopedRows
    return scopedRows.filter(r => merchantBuyerNames.includes(getBuyerName(r)))
  }, [scopedRows, merchantFilter, merchantBuyerNames])

  // Same scoping pipeline as the reports above, applied to the schedule
  // rows too. A schedule already reflected by a real report (via
  // fulfilled_schedule_id) is dropped so a fulfilled entry doesn't show up
  // twice, once as "Scheduled" and again as its actual result.
  const scopedSchedules = useMemo(() => {
    if (buyersAccess.isUnrestricted) return scheduleRows
    if (!buyersAccess.ready) return []
    return scheduleRows.filter(s => buyersAccess.allowedBuyers.includes(getScheduleBuyerName(s)))
  }, [scheduleRows, buyersAccess])

  const merchantScopedSchedules = useMemo(() => {
    if (!merchantFilter || !merchantBuyerNames) return scopedSchedules
    return scopedSchedules.filter(s => merchantBuyerNames.includes(getScheduleBuyerName(s)))
  }, [scopedSchedules, merchantFilter, merchantBuyerNames])

  // Same buyersAccess/merchantFilter scoping as rows/scheduleRows above,
  // applied to the independent 24-month trend datasets (openPoTrendRows/
  // inspectedTrendRows) that back the Repository panel - needed so the one
  // shared Buyer/Vendor filter dropdown below offers every buyer/vendor
  // either view might show, not just whichever happen to fall in the
  // calendar's current date window.
  const scopedOpenPoTrendRows = useMemo(() => {
    if (buyersAccess.isUnrestricted) return openPoTrendRows
    if (!buyersAccess.ready) return []
    return openPoTrendRows.filter(po => buyersAccess.allowedBuyers.includes(getOpenPoBuyerName(po)))
  }, [openPoTrendRows, buyersAccess])
  const merchantScopedOpenPoTrendRows = useMemo(() => {
    if (!merchantFilter || !merchantBuyerNames) return scopedOpenPoTrendRows
    return scopedOpenPoTrendRows.filter(po => merchantBuyerNames.includes(getOpenPoBuyerName(po)))
  }, [scopedOpenPoTrendRows, merchantFilter, merchantBuyerNames])

  // How many SKUs a PO originally has, and their total ordered quantity
  // (every po_line_items row, regardless of inspection/report status) - the
  // Repository table's "Ordered SKUs" column needs this, not "Submitted
  // SKUs" (report-derived, only counts/sums SKUs that have actually had
  // something submitted). Sourced from openPoTrendRows (rooted at
  // purchase_orders, not inspection_reports), the only dataset on this page
  // that already carries a PO's full line-items list - a closed/deleted PO
  // (excluded from that fetch) just won't have an entry here, a known gap
  // rather than an extra fetch for this one column.
  // targetDate here (earliest across this PO's line items, same "earliest
  // wins" convention groupReports() uses) is the fallback for stub groups
  // whose own targetDate reads null - groupSchedulesOnly() (a PO with a
  // schedule entry but nothing submitted yet) has no line-item data of its
  // own to compute one from at all, and groupOpenPosOnly() only has it when
  // every one of a PO's line items happens to have a target_date set. This
  // map already exists for the Ordered SKUs column below, for the same
  // reason - reused here rather than a second PO-id-keyed map.
  const originalSkuStatsByPoId = useMemo(() => new Map(merchantScopedOpenPoTrendRows.map(po => {
    const targetDates = (po.po_line_items || []).map(li => li.target_date).filter(Boolean)
    return [
      po.id,
      {
        count: po.po_line_items?.length ?? 0,
        qty: (po.po_line_items || []).reduce((sum, li) => sum + (li.quantity_ordered || 0), 0),
        targetDate: targetDates.length ? targetDates.reduce((min, d) => (d < min ? d : min)) : null,
        // PO-level (not per-line-item), same override convention
        // PoInspectionComments.jsx's own exFactory() uses - the fallback for
        // groupSchedulesOnly()'s stub groups, which have no PO-level fields
        // at all beyond what this map already carries.
        exFactoryDate: po.exceptional_ex_factory_date ?? po.ex_factory_date ?? null,
      },
    ]
  })), [merchantScopedOpenPoTrendRows])

  // Every scheduled entry, grouped by PO - the Repository drawer's fallback
  // for a SKU whose report has no resolvable inspector of its own (see
  // loadTrend's own comment on why that happens). Not buyer/vendor-scoped
  // like the option lists above - only ever looked up by poId for a PO
  // that's already passed those filters elsewhere, so narrowing this list
  // too would just risk missing a real match for no benefit.
  const scheduleAssignmentsByPoId = useMemo(() => {
    const byPo = new Map()
    for (const s of scheduleTrendRows) {
      if (!s.po_id) continue
      if (!byPo.has(s.po_id)) byPo.set(s.po_id, [])
      byPo.get(s.po_id).push({
        inspectionType: s.inspection_type,
        lineItems: s.line_items,
        qaName: s.organization_members?.full_name ?? null,
      })
    }
    return byPo
  }, [scheduleTrendRows])

  const scopedInspectedTrendRows = useMemo(() => {
    if (buyersAccess.isUnrestricted) return inspectedTrendRows
    if (!buyersAccess.ready) return []
    return inspectedTrendRows.filter(r => buyersAccess.allowedBuyers.includes(getBuyerName(r)))
  }, [inspectedTrendRows, buyersAccess])
  const merchantScopedInspectedTrendRows = useMemo(() => {
    if (!merchantFilter || !merchantBuyerNames) return scopedInspectedTrendRows
    return scopedInspectedTrendRows.filter(r => merchantBuyerNames.includes(getBuyerName(r)))
  }, [scopedInspectedTrendRows, merchantFilter, merchantBuyerNames])

  // Vendor's Region (state + country, same "region" concept
  // PoInspectionComments.jsx's own sidebar already filters by) - looked up
  // by vendor display_name rather than added to the four different queries
  // feeding rows/schedules/openPoTrendRows/inspectedTrendRows, none of which
  // select state/country today. This app already treats a vendor's
  // display_name as its identity everywhere else (vendorFilter itself
  // matches on the same name), so keying this lookup the same way doesn't
  // introduce a new assumption.
  const [vendorRegionByName, setVendorRegionByName] = useState(() => new Map())
  useEffect(() => {
    const names = [...new Set([
      ...merchantScopedRows.map(getVendorName),
      ...merchantScopedSchedules.map(getScheduleVendorName),
      ...merchantScopedOpenPoTrendRows.map(getOpenPoVendorName),
      ...merchantScopedInspectedTrendRows.map(getVendorName),
    ].filter(Boolean))]
    if (!names.length) { setVendorRegionByName(new Map()); return }
    let cancelled = false
    supabase.from('organizations').select('display_name, state, country').in('display_name', names).then(({ data, error: err }) => {
      if (cancelled) return
      if (err) { console.error('[QcReportsSummary] vendor region fetch failed:', err.message); return }
      const map = new Map()
      for (const o of data || []) {
        const region = [o.state, o.country].filter(Boolean).join(', ')
        if (region) map.set(o.display_name, region)
      }
      setVendorRegionByName(map)
    })
    return () => { cancelled = true }
  }, [merchantScopedRows, merchantScopedSchedules, merchantScopedOpenPoTrendRows, merchantScopedInspectedTrendRows])
  const regionOptions = useMemo(
    () => [...new Set(vendorRegionByName.values())].sort().map(r => ({ value: r, label: r })),
    [vendorRegionByName]
  )

  // Applies the same shared Buyer/Vendor/Region/Inspector filters as
  // filteredRows above, just against the trend dataset instead - this is
  // what feeds the Repository panel (QcRepositoryPanel) when that view is
  // toggled on.
  const filteredInspectedTrendRows = useMemo(() => merchantScopedInspectedTrendRows.filter(r => {
    if (buyerFilter && getBuyerName(r) !== buyerFilter) return false
    if (vendorFilter && getVendorName(r) !== vendorFilter) return false
    if (regionFilter && (vendorRegionByName.get(getVendorName(r)) || null) !== regionFilter) return false
    if (inspectorFilter && getInspector(r)?.id !== inspectorFilter) return false
    return true
  }), [merchantScopedInspectedTrendRows, buyerFilter, vendorFilter, regionFilter, inspectorFilter, vendorRegionByName])

  // A KPI tile click narrows the Repository panel's rows one layer further
  // than filteredInspectedTrendRows itself - that one stays untouched (still
  // feeds buyerOptions/vendorOptions below), only this derived copy gets the
  // extra restriction.
  const kpiFilteredInspectedTrendRows = useMemo(() => {
    if (!kpiFilter) return filteredInspectedTrendRows
    return filteredInspectedTrendRows.filter(r => kpiFilter.poNumbers.has(getPo(r)?.po_number))
  }, [filteredInspectedTrendRows, kpiFilter])

  const buyerOptions = useMemo(
    () => mergeOptionLists(
      distinctOptions(merchantScopedRows, getBuyerName, getBuyerName),
      distinctOptions(merchantScopedSchedules, getScheduleBuyerName, getScheduleBuyerName),
      distinctOptions(merchantScopedOpenPoTrendRows, getOpenPoBuyerName, getOpenPoBuyerName),
      distinctOptions(merchantScopedInspectedTrendRows, getBuyerName, getBuyerName)
    ),
    [merchantScopedRows, merchantScopedSchedules, merchantScopedOpenPoTrendRows, merchantScopedInspectedTrendRows]
  )
  const vendorOptions = useMemo(
    () => mergeOptionLists(
      distinctOptions(merchantScopedRows, getVendorName, getVendorName),
      distinctOptions(merchantScopedSchedules, getScheduleVendorName, getScheduleVendorName),
      distinctOptions(merchantScopedOpenPoTrendRows, getOpenPoVendorName, getOpenPoVendorName),
      distinctOptions(merchantScopedInspectedTrendRows, getVendorName, getVendorName)
    ),
    [merchantScopedRows, merchantScopedSchedules, merchantScopedOpenPoTrendRows, merchantScopedInspectedTrendRows]
  )

  const filteredRows = useMemo(() => merchantScopedRows.filter(r => {
    if (buyerFilter && getBuyerName(r) !== buyerFilter) return false
    if (vendorFilter && getVendorName(r) !== vendorFilter) return false
    if (regionFilter && (vendorRegionByName.get(getVendorName(r)) || null) !== regionFilter) return false
    if (inspectorFilter && getInspector(r)?.id !== inspectorFilter) return false
    return true
  }), [merchantScopedRows, buyerFilter, vendorFilter, regionFilter, inspectorFilter, vendorRegionByName])

  // Same Buyer/Vendor/Region filters as filteredRows - no Inspector narrowing
  // here, since an open PO with nothing scheduled yet has no inspector to
  // match against at all (it would just always fail that filter). Feeds
  // openPoOnlyGroups below, the Repository table's "every currently-open PO"
  // stub rows.
  const filteredOpenPoTrendRows = useMemo(() => merchantScopedOpenPoTrendRows.filter(po => {
    if (buyerFilter && getOpenPoBuyerName(po) !== buyerFilter) return false
    if (vendorFilter && getOpenPoVendorName(po) !== vendorFilter) return false
    if (regionFilter && (vendorRegionByName.get(getOpenPoVendorName(po)) || null) !== regionFilter) return false
    return true
  }), [merchantScopedOpenPoTrendRows, buyerFilter, vendorFilter, regionFilter, vendorRegionByName])

  // Feeds the "Open POs" KPI tile's click-to-filter (toggleKpiFilter) and
  // its hover PO-list, same poDates shape scheduledStats/kpis build for
  // their own tiles - the tile's own value/subLabel keep coming from
  // openPoSummary (a separate, manually-updated spreadsheet total that
  // doesn't necessarily match this live count exactly), but the actual
  // per-PO numbers to filter/hover by only exist here.
  const openPoStats = useMemo(() => ({
    poDates: filteredOpenPoTrendRows
      .filter(po => po.po_number)
      .map(po => ({ poNumber: po.po_number, date: po.po_received_date }))
      .sort((a, b) => a.poNumber.localeCompare(b.poNumber)),
  }), [filteredOpenPoTrendRows])

  // "Already fulfilled" is read straight off each schedule's own embedded
  // inspection_reports (a reverse FK on fulfilled_schedule_id) rather than
  // cross-referencing the separately-fetched, date-windowed `rows`. A
  // report's own inspection_date very often differs from (or predates) its
  // schedule's scheduled_date, so that cross-reference was silently missing
  // most real matches and left almost everything reading as "Scheduled."
  const filteredSchedules = useMemo(() => merchantScopedSchedules.filter(s => {
    // Only a submitted report counts as "fulfilled". A draft (bare
    // placeholder or genuine but unfinished) still reads as "Scheduled"
    // rather than switching to an ambiguous half-done chip.
    if (s.inspection_reports?.some(r => r.status === 'submitted')) return false
    if (buyerFilter && getScheduleBuyerName(s) !== buyerFilter) return false
    if (vendorFilter && getScheduleVendorName(s) !== vendorFilter) return false
    if (regionFilter && (vendorRegionByName.get(getScheduleVendorName(s)) || null) !== regionFilter) return false
    if (inspectorFilter && getScheduleInspector(s)?.id !== inspectorFilter) return false
    return true
  }), [merchantScopedSchedules, buyerFilter, vendorFilter, regionFilter, inspectorFilter, vendorRegionByName])

  // The PO search box applies on top of the dropdown filters, same as
  // everywhere else on this page (calendar cells, and now the Generated
  // Reports list below too) so "filtered" means the same thing everywhere.
  // Matches on PO number OR the report's own Inspection Number (report_no) -
  // typing either one narrows the calendar down to the right day(s).
  const searchedRows = useMemo(() => {
    const term = poSearch.trim().toLowerCase()
    if (!term) return filteredRows
    return filteredRows.filter(r =>
      (getPo(r)?.po_number || '').toLowerCase().includes(term) || (r.report_no || '').toLowerCase().includes(term)
    )
  }, [filteredRows, poSearch])

  // Report-number-specific matches, surfaced as direct "go straight to this
  // exact round" links (see reportSearchTarget below) - a PO-number search
  // already has plenty of visible feedback (the calendar narrows itself),
  // but an Inspection Number search is looking for one specific report, so
  // it gets a direct jump rather than making the user hunt through the
  // calendar for the right day/cell.
  const reportNoMatches = useMemo(() => {
    const term = poSearch.trim().toLowerCase()
    if (term.length < 3) return []
    return filteredRows.filter(r => (r.report_no || '').toLowerCase().includes(term)).slice(0, 8)
  }, [filteredRows, poSearch])

  // Jumps straight into PO Inspection with this exact report's PO/SKU/stage
  // pre-selected AND its exact round opened (via the new ?report= param -
  // see PoInspectionComments.jsx/InspectionReportEntry.jsx's restore-on-mount
  // handling of it) - not just "the latest round for that SKU", so an older,
  // now-superseded round is still reachable by its own Inspection Number
  // even after a newer round exists.
  const goToReport = (r) => {
    const po = getPo(r)
    if (!po?.id || !r.po_line_item_id) return
    const params = new URLSearchParams({
      tab: 'po-inspection', po: po.id, sku: r.po_line_item_id, stage: r.inspection_type, report: r.id,
    })
    navigate(`/dashboard/quality?${params.toString()}`)
  }

  const searchedSchedules = useMemo(() => {
    const term = poSearch.trim().toLowerCase()
    if (!term) return filteredSchedules
    return filteredSchedules.filter(s => (getSchedulePo(s)?.po_number || '').toLowerCase().includes(term))
  }, [filteredSchedules, poSearch])

  // "Open POs" - reads the exact same live `dashboard_summary` RPC My
  // Dashboard > Metrics & KPI's own tile calls (via analyticsStore.js), not
  // the older /dashboard/merchant-performance-fy27 endpoint this used
  // before - that one turned out to read a separate, manually-maintained
  // spreadsheet and could show a genuinely different number for the exact
  // same POs (confirmed: 724 from the spreadsheet vs 722 from this RPC).
  // Deliberately NOT calling useAnalyticsStore itself - that's a shared
  // global store also driven by the Dashboard page's own filters, and
  // fetching through it here would clobber whatever the Dashboard page is
  // showing the moment this page's Buyer/Merchant filters differ from it.
  // Fetched independently instead, reusing resolveMerchantMemberLinkIds
  // (same helper analyticsStore.js's own metadata step calls) plus the same
  // RPC and FY27 date range analyticsStore.js's FY_DATES.fy27 uses.
  const [openPoSummary, setOpenPoSummary] = useState({ totalOpenPos: 0, openPosCount: 0 })
  const [openPoRefreshToken, setOpenPoRefreshToken] = useState(0)
  useEffect(() => {
    // Admins/owners see every PO for the org, not just what their own
    // member_organization_access rows happen to grant - matches the same
    // isUnrestricted rule already applied to rows/scheduleRows below. Only
    // fall back to per-member resolution when an admin has explicitly
    // switched the Merchant filter to view a specific merchant's own scope.
    const viewingAsMerchant = !!merchantFilter
    const targetMemberId = merchantFilter || orgMembership?.memberId
    const usingOrgWideScope = buyersAccess.isUnrestricted && !viewingAsMerchant
    if (usingOrgWideScope ? !orgId : !targetMemberId) return
    let cancelled = false
    ;(async () => {
      let baseLinkIds
      if (usingOrgWideScope) {
        // buyer_supplier_links has no column tying a link back to which
        // merchant org manages it - member_organization_access is the only
        // place that association lives, per-staff-member. So "every PO the
        // org handles" (not just this admin's own grants) means the union
        // of every org member's access grants, resolved the same way
        // resolveMerchantMemberLinkIds resolves a single member's.
        const { data: orgMembers, error: membersErr } = await supabase
          .from('organization_members').select('id').eq('organization_id', orgId)
        if (cancelled) return
        if (membersErr) { console.error('[QcReportsSummary] organization_members fetch failed:', membersErr.message); setOpenPoSummary({ totalOpenPos: 0, openPosCount: 0 }); return }
        const memberIds = (orgMembers || []).map(m => m.id)
        const { data: access, error: accessErr } = await supabase
          .from('member_organization_access').select('organization_id, buyer_supplier_link_id').in('member_id', memberIds)
        if (cancelled) return
        if (accessErr) { console.error('[QcReportsSummary] member_organization_access fetch failed:', accessErr.message); setOpenPoSummary({ totalOpenPos: 0, openPosCount: 0 }); return }
        const directLinkIds = [...new Set((access || []).map(a => a.buyer_supplier_link_id).filter(Boolean))]
        const fallbackOrgIds = [...new Set((access || []).filter(a => !a.buyer_supplier_link_id).map(a => a.organization_id).filter(Boolean))]
        let fallbackLinkIds = []
        if (fallbackOrgIds.length) {
          const { data: links, error: linksErr } = await supabase
            .from('buyer_supplier_links').select('id').in('buyer_org_id', fallbackOrgIds).eq('relationship_status', 'active')
          if (cancelled) return
          if (linksErr) { console.error('[QcReportsSummary] buyer_supplier_links fetch failed:', linksErr.message); setOpenPoSummary({ totalOpenPos: 0, openPosCount: 0 }); return }
          fallbackLinkIds = (links || []).map(l => l.id)
        }
        baseLinkIds = [...new Set([...directLinkIds, ...fallbackLinkIds])]
      } else {
        baseLinkIds = await resolveMerchantMemberLinkIds(targetMemberId)
      }
      if (cancelled) return
      if (!baseLinkIds?.length) { setOpenPoSummary({ totalOpenPos: 0, openPosCount: 0 }); return }

      let linkIds = baseLinkIds
      if (buyerFilter) {
        const { data: links } = await supabase.from('buyer_supplier_links').select('id, buyer_org_id').in('id', baseLinkIds)
        if (cancelled) return
        const buyerOrgIds = [...new Set((links || []).map(l => l.buyer_org_id).filter(Boolean))]
        const { data: orgs } = await supabase.from('organizations').select('id, display_name').in('id', buyerOrgIds)
        if (cancelled) return
        const orgNameById = Object.fromEntries((orgs || []).map(o => [o.id, o.display_name]))
        const matching = (links || []).filter(l => orgNameById[l.buyer_org_id] === buyerFilter).map(l => l.id)
        if (matching.length) linkIds = matching
      }

      const { data: sd, error } = await supabase.rpc('dashboard_summary', {
        p_link_ids: linkIds,
        p_fy_start: '2026-04-01', p_fy_end: '2027-03-31',
        p_prev_start: '2025-04-01', p_prev_end: '2026-03-31',
      })
      if (cancelled) return
      if (error) { console.error('[QcReportsSummary] dashboard_summary RPC failed:', error.message); setOpenPoSummary({ totalOpenPos: 0, openPosCount: 0 }); return }
      setOpenPoSummary({ totalOpenPos: parseFloat(sd?.totalOpenPos || 0), openPosCount: parseInt(sd?.openPosCount || 0, 10) })
    })()
    return () => { cancelled = true }
  }, [orgMembership?.memberId, buyerFilter, merchantFilter, openPoRefreshToken, buyersAccess.isUnrestricted, orgId])

  // "Scheduled POs"/"Scheduled SKUs" - built from searchedSchedules (already
  // scoped to this page's own Buyer/Vendor/Inspector/Merchant filters and PO
  // search box, and already excludes anything fulfilled - see
  // filteredSchedules above), instead of the old canonical all-time
  // fetchScheduledOverviewStats() number: this tile row is meant to move
  // with the same filters as every other tile here now, same as
  // QcReportsAnalyticsPage.jsx's own version did before this row absorbed
  // it - it's no longer the one guaranteed-identical-everywhere number.
  const scheduledStats = useMemo(() => {
    const poDates = new Map()
    const skuIds = new Set()
    for (const s of searchedSchedules) {
      const po = getSchedulePo(s)
      if (po?.po_number) {
        const current = poDates.get(po.po_number)
        if (!current || s.scheduled_date > current) poDates.set(po.po_number, s.scheduled_date)
      }
      for (const li of s.line_items || []) if (li?.id) skuIds.add(li.id)
    }
    return {
      totalPos: new Set(searchedSchedules.map(s => getSchedulePo(s)?.id).filter(Boolean)).size,
      totalSkus: skuIds.size,
      poDates: [...poDates.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([poNumber, date]) => ({ poNumber, date })),
    }
  }, [searchedSchedules])

  // Computed once, shared by both `kpis` (Accepted's mutual-exclusivity
  // check below) and `rejectedStats` further down - groupReports() over the
  // same wide, 24-month dataset the Repository table itself reads from, so
  // "has this PO been flagged rejected" always means the same thing
  // everywhere on this page, not two different date-windowed answers.
  const rejectedGroupsWide = useMemo(
    () => groupReports(filteredInspectedTrendRows).filter(g => g.hasRejected),
    [filteredInspectedTrendRows]
  )
  const rejectedPoIdsWide = useMemo(() => new Set(rejectedGroupsWide.map(g => g.poId)), [rejectedGroupsWide])

  // Stub PO groups for the Repository table - every scheduled PO that
  // hasn't had anything submitted yet (so groupReports() alone would never
  // produce a row for it), so "Scheduled POs" can show ALL of its POs
  // there, not just the ones that have since been inspected. Scoped by
  // whatever KPI tile is currently active (if any), so clicking a
  // different tile like "Accepted POs" doesn't leak stub rows into a view
  // that should only ever show real, report-based POs.
  const scheduleOnlyGroups = useMemo(() => {
    const reportedPoIds = new Set(filteredInspectedTrendRows.map(r => getPo(r)?.id).filter(Boolean))
    const stubs = groupSchedulesOnly(searchedSchedules, reportedPoIds)
    return kpiFilter ? stubs.filter(g => kpiFilter.poNumbers.has(g.poNumber)) : stubs
  }, [searchedSchedules, filteredInspectedTrendRows, kpiFilter])

  // Same idea, one layer further out: every currently-open PO (same "not
  // deleted, not closed" predicate PoRecord.jsx's Daily PO & PI records
  // already fetch through - see openPoTrendRows' own query comment) that has
  // NEITHER a submitted report NOR a schedule entry yet, so the Repository
  // table can show every open PO, not just the ones something has already
  // happened on. Excludes both reportedPoIds (already covered by real rows)
  // and scheduledPoIds (already covered by scheduleOnlyGroups above) so a PO
  // never gets a duplicate row across all three sources.
  const openPoOnlyGroups = useMemo(() => {
    const reportedPoIds = new Set(filteredInspectedTrendRows.map(r => getPo(r)?.id).filter(Boolean))
    const scheduledPoIds = new Set(searchedSchedules.map(s => getSchedulePo(s)?.id).filter(Boolean))
    const excludePoIds = new Set([...reportedPoIds, ...scheduledPoIds])
    const stubs = groupOpenPosOnly(filteredOpenPoTrendRows, excludePoIds)
    return kpiFilter ? stubs.filter(g => kpiFilter.poNumbers.has(g.poNumber)) : stubs
  }, [filteredOpenPoTrendRows, filteredInspectedTrendRows, searchedSchedules, kpiFilter])
  const combinedExtraGroups = useMemo(
    () => [...scheduleOnlyGroups, ...openPoOnlyGroups],
    [scheduleOnlyGroups, openPoOnlyGroups]
  )

  const kpis = useMemo(() => {
    const submitted = searchedRows.filter(r => r.status === 'submitted')
    // Accepted is a PO count, not a report-row count: a PO can have several
    // rows (one per SKU, across every stage), so this groups every
    // submitted report by PO and gives each PO a single verdict. It
    // requires Final specifically - clearing Inline/Midline is just
    // progress, not the PO's actual outcome, so a PO only counts as
    // Accepted once its own Final report says so.
    const byPo = new Map()
    const byLineItem = new Map()
    for (const r of submitted) {
      const poId = getPo(r)?.id
      if (poId) { if (!byPo.has(poId)) byPo.set(poId, []); byPo.get(poId).push(r) }
      if (r.po_line_item_id) { if (!byLineItem.has(r.po_line_item_id)) byLineItem.set(r.po_line_item_id, []); byLineItem.get(r.po_line_item_id).push(r) }
    }
    // A PO flagged rejected anywhere (rejectedPoIdsWide - the same wide,
    // 24-month check the Rejected POs tile itself uses) never counts as
    // Accepted, even if some of its other SKUs did pass Final - Accepted
    // and Rejected are mutually exclusive states for a PO, not independent
    // "has at least one X" questions (a PO showing up in both at once read
    // as contradictory). Checked against the same wide dataset (not just
    // this narrower `submitted`) so a rejection outside this page's own
    // calendar window still excludes the PO here, matching what the
    // Repository table's own red dot already flags it as.
    let acceptedPos = 0
    // { poNumber -> latest event date } per tile, so the hover popover can
    // show when each PO actually hit that state, not just its number.
    const acceptedPoDates = new Map()
    for (const [poId, poReports] of byPo.entries()) {
      if (rejectedPoIdsWide.has(poId)) continue
      const poNumber = getPo(poReports[0])?.po_number
      if (!poNumber) continue
      if (poReports.some(r => r.inspection_type === 'final' && ACCEPTED_RESULTS.includes(r.inspection_result))) {
        acceptedPos++
        const finalRow = poReports.find(r => r.inspection_type === 'final' && ACCEPTED_RESULTS.includes(r.inspection_result))
        acceptedPoDates.set(poNumber, finalRow?.submitted_at || null)
      }
    }
    let acceptedSkus = 0
    for (const lineItemReports of byLineItem.values()) {
      const poId = getPo(lineItemReports[0])?.id
      if (poId && rejectedPoIdsWide.has(poId)) continue
      if (lineItemReports.some(r => r.inspection_type === 'final' && ACCEPTED_RESULTS.includes(r.inspection_result))) acceptedSkus++
    }
    // Inspected (POs/SKUs) requires an actually-submitted report - any
    // stage, any verdict - not just a draft someone opened and never
    // finished. "Has this SKU/PO ever had an inspection submitted", not
    // "what's its verdict" (that's what Accepted/Rejected answer) and not
    // "has this been touched at all" (a bare draft doesn't count). Date
    // shown is the most recent inspection_date among its submitted reports.
    const inspectedPoDates = new Map()
    const inspectedSkuIds = new Set()
    for (const r of submitted) {
      const poNumber = getPo(r)?.po_number
      const effectiveDate = reportEffectiveDate(r)
      if (poNumber && effectiveDate) {
        const current = inspectedPoDates.get(poNumber)
        if (!current || effectiveDate > current) inspectedPoDates.set(poNumber, effectiveDate)
      }
      if (r.po_line_item_id) inspectedSkuIds.add(r.po_line_item_id)
    }
    const toPoDateList = (map) => [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([poNumber, date]) => ({ poNumber, date }))
    return {
      inspectedPos: inspectedPoDates.size,
      inspectedSkus: inspectedSkuIds.size,
      accepted: acceptedPos,
      acceptedSkus,
      inspectedPoDates: toPoDateList(inspectedPoDates),
      acceptedPoDates: toPoDateList(acceptedPoDates),
      // Total Reports - every submitted report row itself (one per SKU per
      // stage per round), not a distinct PO/SKU count like the other tiles
      // - a SKU with Inline+Midline+Final all submitted counts as 3 here.
      totalReports: submitted.length,
    }
  }, [searchedRows, rejectedPoIdsWide])

  // Reuses rejectedGroupsWide (computed above, shared with Accepted's own
  // mutual-exclusivity check) - the exact same groupReports() output
  // RepositoryPanel.jsx builds its red "has a rejected SKU" dot from,
  // rather than hand-rolling a parallel definition here that could drift
  // out of sync with what the dot actually means.
  const rejectedStats = useMemo(() => {
    const rejectedSkus = rejectedGroupsWide.reduce((sum, g) => sum + g.skuGroups.filter(sg => sg.rejected).length, 0)
    return {
      rejectedPos: rejectedGroupsWide.length,
      rejectedSkus,
      rejectedPoDates: rejectedGroupsWide
        .map(g => ({ poNumber: g.poNumber, date: g.lastInspectionDate }))
        .sort((a, b) => (a.poNumber || '').localeCompare(b.poNumber || '')),
    }
  }, [rejectedGroupsWide])

  // date -> [{ poId, poNumber, buyerName, vendorName, tone, stagesAbbr, inspectors }],
  // one entry per PO with activity (real or scheduled) that specific
  // date, for the calendar cells below. Report-based and schedule-only
  // entries are merged here since a day's cell doesn't care which table an
  // item came from, only what to show.
  const byDate = useMemo(() => {
    const byDay = {}
    for (const r of searchedRows) {
      const effectiveDate = reportEffectiveDate(r)
      if (!effectiveDate) continue
      if (kpiFilter && !kpiFilter.poNumbers.has(getPo(r)?.po_number)) continue
      ;(byDay[effectiveDate] ||= []).push(r)
    }
    const grouped = {}
    for (const [date, dayReports] of Object.entries(byDay)) {
      const byPo = new Map()
      for (const r of dayReports) {
        const po = getPo(r)
        if (!po) continue
        if (!byPo.has(po.id)) {
          byPo.set(po.id, { poId: po.id, poNumber: po.po_number, buyerName: getBuyerName(r) || '-', vendorName: getVendorName(r) || '-', reports: [] })
        }
        byPo.get(po.id).reports.push(r)
      }
      grouped[date] = [...byPo.values()].map(g => ({
        ...g,
        kind: 'report',
        tone: worstTone(g.reports),
        stagesAbbr: [...new Set(g.reports.map(r => STAGE_ABBR[r.inspection_type] || r.inspection_type))],
        inspectors: [...new Set(g.reports.map(getInspectorDisplayName).filter(Boolean))],
        // Each report row is one SKU's stage result, so the distinct
        // po_line_item_ids in this PO's reports that date is the SKU count
        // covered by this chip.
        skuCount: new Set(g.reports.map(r => r.po_line_item_id)).size,
        skuRefs: [...new Set(g.reports.map(getSkuRef).filter(Boolean))],
      }))
    }
    for (const s of searchedSchedules) {
      const po = getSchedulePo(s)
      if (!po || !s.scheduled_date) continue
      if (kpiFilter && !kpiFilter.poNumbers.has(po.po_number)) continue
      const entry = {
        kind: 'scheduled',
        poId: po.id,
        poNumber: po.po_number,
        buyerName: getScheduleBuyerName(s) || '-',
        vendorName: getScheduleVendorName(s) || '-',
        tone: 'scheduled',
        stagesAbbr: [STAGE_ABBR[s.inspection_type] || s.inspection_type],
        inspectors: [getScheduleInspector(s)?.full_name].filter(Boolean),
      }
      ;(grouped[s.scheduled_date] ||= []).push(entry)
    }
    return grouped
  }, [searchedRows, searchedSchedules, kpiFilter])

  const [dayListDate, setDayListDate] = useState(null)
  const [showReportsList, setShowReportsList] = useState(false)
  // Toggles the calendar area (below) over to the Repository/report-browser
  // panel in place - this used to navigate to a whole separate page
  // (QcReportsAnalyticsPage, since renamed/repurposed as QcRepositoryPanel)
  // via its own "View Repository" click; now it swaps inline instead.
  // Defaults to the Repository panel (not the calendar) - "Back to
  // Calendar" is the toggle's initial label.
  const [showRepositoryPanel, setShowRepositoryPanel] = useState(() => persistedView?.showRepositoryPanel ?? true)

  // Keeps uiStore's snapshot current as the calendar/filters/view change, so
  // whatever this page is showing right now is what's restored next time -
  // by navigation away-and-back (this component remounting) or a real page
  // reload. cursor (a Date) is stored as an ISO string - Dates don't survive
  // uiStore's localStorage persistence as themselves, they'd silently come
  // back as plain strings on rehydration if stored raw.
  useEffect(() => {
    setPersistedView(prev => ({
      ...prev,
      view, cursor: cursor.toISOString(), showRepositoryPanel,
      buyerFilter, vendorFilter, regionFilter, inspectorFilter, merchantFilter,
    }))
  }, [view, cursor, showRepositoryPanel, buyerFilter, vendorFilter, regionFilter, inspectorFilter, merchantFilter, setPersistedView])

  // Scroll position - restored once, after this page's own loading skeletons
  // have cleared (restoring while content is still skeleton-height would
  // scroll to the wrong place once the real, differently-sized content
  // renders in). Saved continuously while scrolling so leaving via any
  // route (a sidebar click, browser back) captures wherever the user
  // actually was, not just an explicit "save" action.
  const scrollRestoredRef = useRef(false)
  useEffect(() => {
    const onScroll = () => {
      setPersistedView(prev => ({ ...prev, scrollY: window.scrollY }))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (scrollRestoredRef.current) return
    if (loading || trendLoading) return
    scrollRestoredRef.current = true
    const y = persistedView?.scrollY
    if (y) window.scrollTo(0, y)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, trendLoading])

  // Hover card for a calendar chip - the chip's own label truncates at 10px
  // in a narrow cell, so this shows everything behind it (buyer, full SKU
  // list, every inspector) next to the cursor instead of just the cut-off text.
  const [hoverChip, setHoverChip] = useState(null) // { g, top, left } | null
  const showChipHover = (g, targetEl) => {
    const rect = targetEl.getBoundingClientRect()
    const estHeight = 90 + (g.skuRefs?.length ? 20 : 0) + (g.inspectors.length ? 20 : 0)
    const openUpward = rect.bottom + estHeight + 6 > window.innerHeight
    setHoverChip({
      g,
      top: openUpward ? rect.top - estHeight - 6 : rect.bottom + 6,
      left: Math.min(rect.left, window.innerWidth - 272),
    })
  }
  const hideChipHover = () => setHoverChip(null)

  // Export/preview: a small on-demand fetch of the PO's *full* report
  // history (not windowed by the period in view), same shape
  // PoInspectionComments.jsx already builds, so ExportPicker (reused as-is)
  // can pick from everything submitted on that PO, not just what's visible.
  const [exportTarget, setExportTarget] = useState(null) // { po, reports } | null
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError, setExportError] = useState(null)

  // `lineItemId` scopes this to a single SKU's own Export button in
  // Generated Reports - reports are filtered down to just that SKU before
  // ExportPicker's autoPreview runs, so it ends up picking that SKU's own
  // furthest stage instead of every SKU's on the PO. Omitted (the normal
  // per-PO Export/calendar-chip path), every SKU is included as before.
  const openExport = async (poId, lineItemId = null) => {
    setDayListDate(null)
    setExportLoading(true)
    setExportError(null)
    const { data, error: err } = await supabase
      .from('purchase_orders')
      .select(`
        id, po_number, inspection_level,
        buyer_supplier_links!inner(
          buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(display_name),
          supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(display_name, city, address, state, zip, country, phone_no)
        ),
        po_line_items(
          id, sku_id, buyer_sku_ref, sku_variant, quantity_ordered, balance_quantity, target_date,
          inspection_reports(*, inspection_report_defects(*), inspection_report_photos(*))
        )
      `)
      .eq('id', poId)
      .single()
    setExportLoading(false)
    if (err) { setExportError(err.message); return }
    const po = {
      ...data,
      buyer_name:       data.buyer_supplier_links?.buyer?.display_name ?? null,
      supplier_name:    data.buyer_supplier_links?.supplier?.display_name ?? null,
      supplier_city:    data.buyer_supplier_links?.supplier?.city ?? null,
      supplier_address: data.buyer_supplier_links?.supplier?.address ?? null,
      supplier_state:   data.buyer_supplier_links?.supplier?.state ?? null,
      supplier_zip:     data.buyer_supplier_links?.supplier?.zip ?? null,
      supplier_country: data.buyer_supplier_links?.supplier?.country ?? null,
      supplier_phone:   data.buyer_supplier_links?.supplier?.phone_no ?? null,
    }
    let reports = (data.po_line_items || []).flatMap(li => li.inspection_reports || []).map(withSortedPhotos)
    if (lineItemId) reports = reports.filter(r => r.po_line_item_id === lineItemId)
    setExportTarget({ po, reports })
  }

  // "Export All" (Generated Reports header): one combined PDF covering every
  // PO currently listed there, each PO contributing only its own SKUs'
  // furthest stage (same rule ExportPicker's autoPreview uses for a single
  // PO). Reports are fetched fresh per PO here too, same reasoning as
  // openExport above; a single batched `.in('id', poIds)` query covers all
  // of them at once rather than one round trip per PO. Individual per-PO
  // PDFs are generated with the existing exportInspectionReportPdf (so its
  // letterhead/layout logic isn't duplicated or touched), then stitched into
  // one file with mergePdfBlobs.
  const [exportAllTarget, setExportAllTarget] = useState(null) // { blob, filename } | null
  const [exportAllLoading, setExportAllLoading] = useState(false)
  const [exportAllError, setExportAllError] = useState(null)

  const openExportAll = async (poIds) => {
    if (!poIds.length) return
    setShowReportsList(false)
    setExportAllLoading(true)
    setExportAllError(null)
    try {
      // Only what's needed to pick the right reportIds per PO now - the
      // server resolves buyer/supplier/SKU data itself (Phase 3), so the
      // heavier joins this used to fetch client-side are gone.
      const { data, error: err } = await supabase
        .from('purchase_orders')
        .select('id, po_line_items(id, inspection_reports(id, po_line_item_id, inspection_type, round, status, inspection_report_photos(id)))')
        .in('id', poIds)
      if (err) throw new Error(err.message)

      const poEntries = (data || [])
        .map((po) => {
          const submitted = (po.po_line_items || []).flatMap((li) => li.inspection_reports || []).filter((r) => r.status === 'submitted')
          return { poId: po.id, reports: pickHighestStagePerSku(submitted) }
        })
        .filter((e) => e.reports.length > 0)

      if (!poEntries.length) { setExportAllError('No submitted inspections to export.'); return }

      const { fetchInspectionReportPdf } = await import('../../lib/inspectionReportPdfApi')
      // Each PO's own call already returns a zip (isZip: true) if THAT PO
      // alone needed splitting - server-side generateInspectionReportPdf
      // handles that per-PO threshold internally now (Phase 2/3), so this
      // just needs to merge whatever comes back: plain PDFs go into one
      // merged file via mergePdfBlobs (still a cheap client-side page-copy,
      // no image processing - not a crash risk, left as-is), and any PO
      // that came back as its own zip gets its part-PDFs unzipped and
      // added alongside instead of trying to merge an already-split PO.
      const mergeableBlobs = []
      const partFiles = []
      let anyOversized = false
      for (const { poId, reports } of poEntries) {
        const { blob, filename, isZip } = await fetchInspectionReportPdf(poId, reports.map((r) => r.id), { mode: 'final', createdBy: orgMembership?.fullName })
        if (!isZip) { mergeableBlobs.push(blob); continue }
        anyOversized = true
        const innerZip = await JSZip.loadAsync(blob)
        for (const [name, entry] of Object.entries(innerZip.files)) {
          if (entry.dir) continue
          partFiles.push({ filename: name, blob: await entry.async('blob') })
        }
        void filename // the zip's own top-level name isn't needed - its parts are unzipped individually above
      }

      const { mergePdfBlobs } = await import('../../utils/exportInspectionReportPdf')
      const stamp = new Date().toISOString().slice(0, 10)
      if (!anyOversized) {
        const mergedBlob = await mergePdfBlobs(mergeableBlobs)
        setExportAllTarget({ blob: mergedBlob, filename: `inspection-reports-all-${stamp}.pdf`, isZip: false })
      } else {
        const zip = new JSZip()
        if (mergeableBlobs.length) {
          const mergedBlob = await mergePdfBlobs(mergeableBlobs)
          zip.file(`inspection-reports-all-${stamp}.pdf`, mergedBlob)
        }
        for (const { filename, blob } of partFiles) zip.file(filename, blob)
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        setExportAllTarget({ blob: zipBlob, filename: `inspection-reports-all-${stamp}.zip`, isZip: true, partCount: partFiles.length })
      }
    } catch (err) {
      setExportAllError(err.message || 'Failed to generate combined export')
    } finally {
      setExportAllLoading(false)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-0 sm:mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-extrabold text-gray-900 tracking-tight">QC Reports</h1>
            {/* Hidden on mobile - unnecessary extra line eating vertical
                space above the fold on a phone; desktop keeps it. */}
            <p className="hidden sm:block text-xs text-gray-500 mt-0.5">Summary - PO Inspection</p>
          </div>
        </div>
        {/* Mobile - icon only, no "Refresh" word, rightmost on the QC
            Reports heading row itself instead of its own row below (desktop
            keeps the text-link version further down, next to the KPI
            tiles, unchanged). */}
        <button
          type="button"
          onClick={() => setOpenPoRefreshToken(t => t + 1)}
          title="Open POs comes from a manually-updated spreadsheet - refresh if it looks out of date"
          className="sm:hidden w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 cursor-pointer"
        >
          <RefreshIcon />
        </button>
        {/* Replaces the old "POs Reported Repository" tile's own click,
            which opened Analytics/Repository, now that tile is gone. Toggles
            the calendar area below over to the Repository panel in place,
            rather than navigating to a separate page. */}
        {/* Hidden on mobile - the calendar grid itself is desktop-only
            (QcAgendaView substitutes for it below md), so there's nothing
            for a phone user to toggle back to; Repository is already the
            default view (showRepositoryPanel starts true) and the only one
            mobile actually needs. */}
        <button
          type="button"
          onClick={() => setShowRepositoryPanel(v => !v)}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gray-900 hover:bg-gray-700 transition-all cursor-pointer"
        >
          {showRepositoryPanel ? 'Back to Calendar' : 'View Repository'}
        </button>
      </div>

      {/* KPI tiles - ported up from QcRepositoryPanel.jsx's own row
          (Open/Scheduled/Inspected/Accepted, POs then SKUs), now the single
          set shown here instead of duplicated in the panel below - same
          KpiTile component, so hover-for-PO-list still works the same way.
          Open POs has no per-PO breakdown to hover (the backend summary it
          reads is aggregate-only), same as before. */}
      <div className="hidden sm:flex justify-end mb-1">
        <button
          type="button"
          onClick={() => setOpenPoRefreshToken(t => t + 1)}
          title="Open POs comes from a manually-updated spreadsheet - refresh if it looks out of date"
          className="hidden sm:inline text-xs text-gray-400 hover:text-gray-600 underline cursor-pointer"
        >
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        {/* Every submitted report row itself (one per SKU per stage per
            round) - not a PO/SKU count like its neighbors, so no poDates
            hover popover (there's no one-PO-per-entry list that would make
            sense here) and no click-to-filter. */}
        <KpiTile label="Total Reports" value={kpis.totalReports} onClick={() => setShowReportsList(true)} loading={loading || trendLoading} />
        <KpiTile label="Open POs" value={openPoSummary.openPosCount} subLabel={fmtCompactUsd(openPoSummary.totalOpenPos)} poDates={openPoStats.poDates}
          onClick={() => toggleKpiFilter('Open POs', openPoStats.poDates)} active={kpiFilter?.label === 'Open POs'} onClear={() => setKpiFilter(null)} loading={loading || trendLoading} />
        <KpiTile label="Scheduled POs" value={scheduledStats.totalPos} subLabel={`${scheduledStats.totalSkus} SKUs`} poDates={scheduledStats.poDates}
          onClick={() => toggleKpiFilter('Scheduled POs', scheduledStats.poDates)} active={kpiFilter?.label === 'Scheduled POs'} onClear={() => setKpiFilter(null)} loading={loading || trendLoading} />
        <KpiTile label="Inspected POs" value={kpis.inspectedPos} subLabel={`${kpis.inspectedSkus} SKUs`} accent="emerald" poDates={kpis.inspectedPoDates}
          onClick={() => toggleKpiFilter('Inspected POs', kpis.inspectedPoDates)} active={kpiFilter?.label === 'Inspected POs'} onClear={() => setKpiFilter(null)} loading={loading || trendLoading} />
        <KpiTile label="Accepted POs" value={kpis.accepted} subLabel={`${kpis.acceptedSkus} SKUs`} accent="emerald" poDates={kpis.acceptedPoDates}
          onClick={() => toggleKpiFilter('Accepted POs', kpis.acceptedPoDates)} active={kpiFilter?.label === 'Accepted POs'} onClear={() => setKpiFilter(null)} loading={loading || trendLoading} />
        <KpiTile label="Rejected POs" value={rejectedStats.rejectedPos} subLabel={`${rejectedStats.rejectedSkus} SKUs`} accent="red" poDates={rejectedStats.rejectedPoDates}
          onClick={() => toggleKpiFilter('Rejected POs', rejectedStats.rejectedPoDates)} active={kpiFilter?.label === 'Rejected POs'} onClear={() => setKpiFilter(null)} loading={loading || trendLoading} />
      </div>

      {/* Filters, then period navigation - filters come first now so this
          block's top half never moves: the period nav row right below is
          calendar-only and hides entirely in Repository mode (that dataset
          is a fixed 24-month window, not date-cursor-scoped), so putting it
          first used to make the filters visibly jump position when toggling
          "View Repository" - filters at the top stay pixel-identical in
          both modes instead, same as the KPI tiles above. One shared bar
          for both views - used to be two near-identical Buyer/Vendor/
          Inspector/Merchant filter rows, one per view. */}
      <div className={`border border-gray-200 rounded-xl bg-white shadow-sm p-4 mb-5 ${showRepositoryPanel ? 'hidden sm:block' : ''}`}>
        {/* Mobile-only, calendar mode only (see state comment above) - a
            single filter-icon trigger instead of the desktop grid. */}
        {!showRepositoryPanel && (
          <button
            type="button"
            onClick={() => setMobileFilterSheetOpen(true)}
            className="sm:hidden w-full flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer"
          >
            <FilterIcon />
            <span>
              Filters
              {[buyerFilter, vendorFilter, regionFilter, inspectorFilter, merchantFilter].filter(Boolean).length > 0
                && ` (${[buyerFilter, vendorFilter, regionFilter, inspectorFilter, merchantFilter].filter(Boolean).length})`}
            </span>
          </button>
        )}
        <div className="hidden sm:grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <FilterField label="Buyer">
            <SearchableSelect
              options={[{ value: '', label: 'All Buyers' }, ...buyerOptions]}
              value={buyerFilter}
              onChange={setBuyerFilter}
              placeholder="All Buyers"
              triggerClassName="h-9 px-3 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400"
              dropdownClassName="rounded-lg border border-gray-200"
            />
          </FilterField>
          <FilterField label="Vendor">
            <SearchableSelect
              options={[{ value: '', label: 'All Vendors' }, ...vendorOptions]}
              value={vendorFilter}
              onChange={setVendorFilter}
              placeholder="All Vendors"
              triggerClassName="h-9 px-3 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400"
              dropdownClassName="rounded-lg border border-gray-200"
            />
          </FilterField>
          <FilterField label="Vendor's Region">
            <SearchableSelect
              options={[{ value: '', label: 'All Regions' }, ...regionOptions]}
              value={regionFilter}
              onChange={setRegionFilter}
              placeholder="All Regions"
              triggerClassName="h-9 px-3 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400"
              dropdownClassName="rounded-lg border border-gray-200"
            />
          </FilterField>
          <FilterField label="Inspector">
            <SearchableSelect
              options={[{ value: '', label: 'All Inspectors' }, ...qaOptions]}
              value={inspectorFilter}
              onChange={setInspectorFilter}
              placeholder="All Inspectors"
              triggerClassName="h-9 px-3 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400"
              dropdownClassName="rounded-lg border border-gray-200"
            />
          </FilterField>
          {isAdmin && (
            <FilterField label="Merchant">
              <SearchableSelect
                options={[{ value: '', label: 'All Merchants' }, ...merchantOptions]}
                value={merchantFilter}
                onChange={setMerchantFilter}
                placeholder="All Merchants"
                triggerClassName="h-9 px-3 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400"
                dropdownClassName="rounded-lg border border-gray-200"
              />
            </FilterField>
          )}
        </div>
        {!showRepositoryPanel && (
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100 flex-wrap">
            <button type="button" onClick={goPrev} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-50 hover:text-gray-900 transition-all cursor-pointer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <div className="text-sm font-extrabold text-gray-900 tracking-tight min-w-48 text-center whitespace-nowrap">
              {periodLabel(view, cursor, days)}
            </div>
            <button type="button" onClick={goNext} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-50 hover:text-gray-900 transition-all cursor-pointer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <button type="button" onClick={goToday} className="ml-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-all cursor-pointer">
              Today
            </button>
            <ViewSelector view={view} onChange={setView} />
          </div>
        )}
      </div>

      {!showRepositoryPanel && mobileFilterSheetOpen && (
        <MobileTopFiltersSheet
          buyerFilter={buyerFilter} setBuyerFilter={setBuyerFilter} buyerOptions={buyerOptions}
          vendorFilter={vendorFilter} setVendorFilter={setVendorFilter} vendorOptions={vendorOptions}
          regionFilter={regionFilter} setRegionFilter={setRegionFilter} regionOptions={regionOptions}
          inspectorFilter={inspectorFilter} setInspectorFilter={setInspectorFilter} qaOptions={qaOptions}
          merchantFilter={merchantFilter} setMerchantFilter={setMerchantFilter} merchantOptions={merchantOptions}
          isAdmin={isAdmin}
          onClose={() => setMobileFilterSheetOpen(false)}
        />
      )}

      {showRepositoryPanel ? (
        <QcRepositoryPanel
          rows={kpiFilteredInspectedTrendRows}
          extraGroups={combinedExtraGroups}
          originalSkuStatsByPoId={originalSkuStatsByPoId}
          scheduleAssignmentsByPoId={scheduleAssignmentsByPoId}
          vendorRegionByName={vendorRegionByName}
          userName={orgMembership?.fullName}
          loading={trendLoading}
          error={trendError}
          sharedFilters={{
            buyerFilter, setBuyerFilter, buyerOptions,
            vendorFilter, setVendorFilter, vendorOptions,
            regionFilter, setRegionFilter, regionOptions,
            inspectorFilter, setInspectorFilter, qaOptions,
            merchantFilter, setMerchantFilter, merchantOptions,
            isAdmin,
          }}
        />
      ) : (
      <>
      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
      {exportError && <p className="text-xs text-red-500 mb-3">{exportError}</p>}
      {exportAllError && <p className="text-xs text-red-500 mb-3">{exportAllError}</p>}
      {exportLoading && (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 text-white text-xs font-semibold shadow-lg">
          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          Loading report…
        </div>
      )}
      {exportAllLoading && (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 text-white text-xs font-semibold shadow-lg">
          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          Generating combined report…
        </div>
      )}

      {/* Calendar view */}
      <div className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
        <div className="p-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs font-bold text-gray-900 uppercase tracking-wide">PO-wise Dt.-wise Summary</div>
          <div className="flex items-center gap-3 text-[11px] font-medium text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Accepted</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" />Rejected</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />In progress</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-500" />Scheduled</span>
          </div>
          <div className="relative max-w-sm w-full sm:w-64">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={poSearch}
              onChange={e => setPoSearch(e.target.value)}
              placeholder="Search PO number or Inspection No…"
              className="w-full h-9 pl-8 pr-3 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white transition-colors"
            />
            {/* Direct jump-to-report results - only for Inspection Number
                matches (a PO-number search already narrows the calendar
                itself, no extra list needed there). */}
            {reportNoMatches.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
                {reportNoMatches.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => goToReport(r)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-100 last:border-b-0 flex items-center justify-between gap-2"
                  >
                    <span className="font-semibold text-gray-900">{r.report_no}</span>
                    <span className="text-gray-500 truncate">{getPo(r)?.po_number} · {getSkuRef(r)} · {STAGE_ABBR[r.inspection_type] || r.inspection_type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {loading ? (
          <p className="text-xs text-gray-400 italic px-3.5 py-6 text-center">Loading…</p>
        ) : view === 'year' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
            {Array.from({ length: 12 }, (_, m) => (
              <MiniCal key={m} year={year} month={m} todayStr={todayStr} byDate={byDate} onSelectDay={d => setDayListDate(fmtISO(d))} />
            ))}
          </div>
        ) : (
          <>
            {/* Month/Week's grid-cols-7 grid is desktop-only below - a
                QcAgendaView list substitutes for it below md, matching the
                breakpoint this session's other table/grid→card conversions
                use (InspectionSchedule.jsx's own pre-existing AgendaView
                used sm:hidden, but that cutoff (640px) still left the grid
                cramped on phones just above it - md:hidden (768px) is more
                generous and consistent with every other mobile fix this
                session). Day view is already effectively a single-column
                list (cols=1) so it needs no mobile substitute and stays
                visible at every width. */}
            {view !== 'day' && (
              <div className="hidden md:block">
                <div className="grid grid-cols-7 border-b border-gray-200 bg-gradient-to-b from-gray-50 to-white">
                  {WEEKDAYS.map((w, i) => (
                    <div key={w} className={`px-2 py-2.5 text-[11px] font-bold text-center uppercase tracking-wider ${i === 0 || i === 6 ? 'text-sky-600' : 'text-gray-500'}`}>{w}</div>
                  ))}
                </div>
              </div>
            )}
            <div className={view !== 'day' ? 'hidden md:block' : undefined}>
              <CalendarGrid
                days={days}
                cols={view === 'day' ? 1 : 7}
                dimMonth={view === 'month' ? month : null}
                showFullLabel={view === 'day'}
                todayStr={todayStr}
                byDate={byDate}
                onChipClick={openExport}
                onMoreClick={setDayListDate}
                onChipHover={showChipHover}
                onChipLeave={hideChipHover}
              />
            </div>
            {view !== 'day' && (
              <div className="md:hidden">
                <QcAgendaView days={days} byDate={byDate} todayStr={todayStr} onSelectEntry={g => openExport(g.poId)} />
              </div>
            )}
          </>
        )}
        {!loading && Object.keys(byDate).length === 0 && (
          <p className="text-xs text-gray-400 italic px-3.5 py-6 text-center">
            {poSearch.trim() ? `No matches for "${poSearch.trim()}" in this range.` : 'No inspection activity in this range.'}
          </p>
        )}
      </div>
      </>
      )}

      {hoverChip && createPortal(
        <div
          className="fixed z-[300] pointer-events-none w-64 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden"
          style={{ top: hoverChip.top, left: hoverChip.left }}
        >
          <div className={`h-[3px] ${DOT_CLASS[hoverChip.g.tone]}`} />
          <div className="px-3.5 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-gray-900 truncate">{hoverChip.g.poNumber}</span>
              <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {hoverChip.g.stagesAbbr.join(', ')}
              </span>
            </div>
            {hoverChip.g.buyerName && hoverChip.g.buyerName !== '-' && (
              <div className="text-[11px] text-gray-500 truncate">{hoverChip.g.buyerName}</div>
            )}
            {!!hoverChip.g.skuCount && (
              <div className="text-[11px] text-gray-500">
                {hoverChip.g.skuCount} SKU{hoverChip.g.skuCount === 1 ? '' : 's'}
                {hoverChip.g.skuRefs?.length > 0 && <span className="text-gray-400"> - {hoverChip.g.skuRefs.join(', ')}</span>}
              </div>
            )}
            {hoverChip.g.inspectors.length > 0 && (
              <div className="text-[11px] text-gray-500">Inspector: {hoverChip.g.inspectors.join(', ')}</div>
            )}
          </div>
        </div>,
        document.body
      )}

      {dayListDate && (
        <DayActivityModal
          date={dayListDate}
          items={byDate[dayListDate] || []}
          onClose={() => setDayListDate(null)}
          onSelect={openExport}
        />
      )}

      {showReportsList && (
        <GeneratedReportsModal
          reports={searchedRows}
          onClose={() => setShowReportsList(false)}
          onSelectPo={(poId, lineItemId) => { setShowReportsList(false); openExport(poId, lineItemId) }}
          onExportAll={openExportAll}
        />
      )}

      {exportTarget && (
        <ExportPicker
          po={exportTarget.po}
          reports={exportTarget.reports}
          autoPreview
          userName={orgMembership?.fullName}
          onClose={() => setExportTarget(null)}
        />
      )}

      {exportAllTarget && (
        <ExportAllPreviewModal
          blob={exportAllTarget.blob}
          filename={exportAllTarget.filename}
          isZip={exportAllTarget.isZip}
          partCount={exportAllTarget.partCount}
          onClose={() => setExportAllTarget(null)}
        />
      )}
    </div>
  )
}

function ViewSelector({ view, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="ml-1 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-all cursor-pointer"
      >
        {VIEW_LABELS[view]}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 w-28 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {Object.entries(VIEW_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => onChange(key)}
              className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 ${view === key ? 'font-bold text-gray-900' : 'text-gray-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Day / Week / Month calendar cells. Each shows a PO chip (colored by
// worstTone) per PO with activity that date. Read-only: clicking a chip
// jumps straight to that PO's export flow, since preview/download is the
// whole point of this page. Hovering one shows the full-detail card (see
// QcReportsSummary's hoverChip) instead of a plain browser tooltip.
function CalendarGrid({ days, cols, dimMonth, showFullLabel, todayStr, byDate, onChipClick, onMoreClick, onChipHover, onChipLeave }) {
  const colClass = cols === 1 ? 'grid-cols-1' : 'grid-cols-7'
  const cellH = dimMonth != null ? 'min-h-[92px]' : 'min-h-[150px]'
  // Month's 7 narrow columns and Week's 7 columns both cap the list and push
  // the rest behind "+N more" so cells stay a reasonable, even height next
  // to their row neighbors. Day view is a single full-width cell with no
  // neighbor to stay even with, so there's no reason to hide anything
  // behind a popup there, just let the cell grow to fit everything.
  const chipCap = dimMonth != null ? 2 : cols === 1 ? Infinity : 6
  return (
    <div className={`grid ${colClass}`}>
      {days.map((d, i) => {
        const dateStr = fmtISO(d)
        const items = byDate[dateStr] || []
        const visible = items.slice(0, chipCap)
        const extra = items.length - visible.length
        const outsideMonth = dimMonth != null && d.getMonth() !== dimMonth
        return (
          <div key={i} className={`${cellH} border-b border-r border-gray-100 p-1.5 last:border-r-0 transition-colors ${outsideMonth ? 'bg-gray-50/50' : 'bg-white'}`}>
            <div className={`text-[11px] font-bold mb-1 ${
              dateStr === todayStr
                ? showFullLabel
                  ? 'inline-flex items-center px-2 py-0.5 rounded-full bg-gray-900 text-white shadow-sm'
                  : 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-900 text-white shadow-sm'
                : outsideMonth ? 'text-gray-300' : 'text-gray-700'
            }`}>
              {showFullLabel ? fmtDayHeader(d) : d.getDate()}
            </div>
            <div className="space-y-1">
              {visible.map(g => (
                <button
                  key={`${g.kind}-${g.poId}`}
                  type="button"
                  onClick={() => onChipClick(g.poId)}
                  onMouseEnter={ev => onChipHover(g, ev.currentTarget)}
                  onMouseLeave={onChipLeave}
                  className={`w-full flex items-center gap-1.5 text-left px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-900 cursor-pointer transition-all hover:shadow-sm hover:brightness-95 ${TONE_CHIP_BG_CLASS[g.tone]}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_CLASS[g.tone]}`} />
                  <span className="truncate min-w-0">
                    {g.poNumber} · {g.stagesAbbr.join(',')}{g.skuCount ? ` · ${g.skuCount} SKU${g.skuCount === 1 ? '' : 's'}` : ''}{g.inspectors.length > 0 ? ` · ${g.inspectors.join(', ')}` : ''}
                  </span>
                </button>
              ))}
              {extra > 0 && (
                <button
                  type="button"
                  onClick={() => onMoreClick(dateStr)}
                  className="w-full text-left px-1.5 text-[10px] font-semibold text-gray-400 hover:text-gray-700 cursor-pointer"
                >
                  +{extra} more
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Phone-width substitute for the grid-cols-7 Month/Week grid above - ported
// from InspectionSchedule.jsx's own AgendaView (same sm:hidden breakpoint,
// same day-section shape), adapted to this page's own byDate entries
// (PO-level activity groups, not raw schedule rows). Row content mirrors
// DayActivityModal's own rows almost verbatim, just inline instead of
// behind a "+N more" popup.
function QcAgendaView({ days, byDate, todayStr, onSelectEntry }) {
  return (
    <div className="p-3 space-y-3">
      {days.map(d => {
        const dateStr = fmtISO(d)
        const isToday = dateStr === todayStr
        const items = byDate[dateStr] || []
        return (
          <div key={dateStr} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            <div className={`px-3 py-2 text-xs font-bold flex items-center gap-2 ${isToday ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-700'}`}>
              {fmtDayHeader(d)}
              {isToday && <span className="text-[9px] font-semibold uppercase tracking-wide opacity-70">Today</span>}
            </div>
            {items.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-400 italic">No activity this day.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {items.map(g => (
                  <button
                    key={`${g.kind}-${g.poId}`}
                    type="button"
                    onClick={() => onSelectEntry(g)}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_CLASS[g.tone]}`} />
                      <span className="text-sm font-bold text-gray-900 truncate">{g.poNumber}</span>
                    </div>
                    <div className="text-[11px] text-gray-500 truncate mt-0.5 pl-4">
                      {g.stagesAbbr.join(', ')}{g.inspectors.length > 0 ? ` · ${g.inspectors.join(', ')}` : ''}
                    </div>
                    {g.skuCount > 0 && (
                      <div className="text-[11px] text-gray-400 truncate mt-0.5 pl-4">
                        {g.skuCount} SKU{g.skuCount === 1 ? '' : 's'}{g.skuRefs.length > 0 ? `: ${g.skuRefs.join(', ')}` : ''}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Compact read-only month calendar for Year view. Dotted days indicate
// activity; clicking one opens the day's activity list (same modal "+N
// more" uses in the other views).
function MiniCal({ year, month, todayStr, byDate, onSelectDay }) {
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month])
  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-sm p-3.5">
      <div className="text-xs font-extrabold text-gray-900 tracking-tight mb-2">
        {new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
      </div>
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(w => <div key={w} className="text-[9px] font-bold text-gray-400 text-center">{w[0]}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {grid.map((d, i) => {
          const dateStr = fmtISO(d)
          const inMonth = d.getMonth() === month
          const isToday = dateStr === todayStr
          const items = byDate[dateStr]
          const tone = items?.length ? worstToneAmong(items) : null
          return (
            <div key={i} className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => items?.length && onSelectDay(d)}
                className={`w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-semibold transition-all
                  ${isToday ? 'ring-2 ring-gray-900 text-gray-900 font-bold' : inMonth ? 'text-gray-700' : 'text-gray-300'}
                  ${items?.length ? 'cursor-pointer hover:bg-gray-100' : ''}`}
              >
                {d.getDate()}
              </button>
              <span className={`w-1 h-1 rounded-full mt-0.5 ${tone ? DOT_CLASS[tone] : 'invisible'}`} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayActivityModal({ date, items, onClose, onSelect }) {
  // Drag the sheet down (from the grip handle below) to dismiss it, same
  // convention MobileFilterSheet.jsx/MobileBulkActionSheet.jsx already use -
  // this already had the rounded-t-2xl bottom-sheet shape on mobile, just
  // never the matching gesture.
  const { dragY, dragHandlers } = useDragToDismiss({ onDismiss: onClose })
  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        style={{ transform: `translateY(${dragY}px)`, transition: dragY === 0 ? 'transform 0.2s ease-out' : 'none' }}
        className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-sm max-h-[80vh] sm:max-h-[70vh] flex flex-col"
      >
        <div {...dragHandlers} className="sm:hidden flex items-center justify-center py-2 flex-shrink-0 cursor-grab touch-none">
          <span className="w-9 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="text-sm font-bold text-gray-900">{fmtDisplayDate(date)}</div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-3 py-3 space-y-1.5">
          {items.length === 0 ? (
            <p className="text-xs text-gray-400 italic px-2 py-3">No activity this day.</p>
          ) : (
            items.map(g => (
              <button
                key={`${g.kind}-${g.poId}`}
                type="button"
                onClick={() => onSelect(g.poId)}
                className={`w-full text-left px-3 py-2 rounded-lg cursor-pointer ${TONE_CLASS[g.tone]}`}
              >
                <div className="text-xs font-bold">{g.poNumber} · {g.buyerName}</div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  {g.stagesAbbr.join(', ')}{g.inspectors.length > 0 ? ` · ${g.inspectors.join(', ')}` : ''}
                </div>
                {g.skuCount > 0 && (
                  <div className="text-[11px] opacity-70 mt-0.5 truncate">
                    {g.skuCount} SKU{g.skuCount === 1 ? '' : 's'}{g.skuRefs.length > 0 ? `: ${g.skuRefs.join(', ')}` : ''}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// Cross-PO list of every submitted report in `reports` (already filtered by
// the same Buyer/Vendor/Inspector/Merchant/search/date-range state as the
// calendar above, so "filtered" means the same thing here too). Clicking a
// PO's number expands it inline (no modal swap) to its SKUs, and clicking a
// SKU expands that further to its individual stage reports (Inline/Midline/
// Final) with inspector/date/result detail - a pure browse path. The
// separate "Export" button on the PO row is the only thing that opens the
// actual picker (openExport(poId) via onSelectPo), since browsing and
// picking-what-to-export are different intents that don't need to share one
// click target.
function GeneratedReportsModal({ reports, onClose, onSelectPo, onExportAll }) {
  const [expandedPoIds, setExpandedPoIds] = useState(() => new Set())
  const [search, setSearch] = useState('')
  // Same Inline/Midline/Final tab pattern ExportPicker already uses - each
  // tab shows every SKU that has ever submitted a report AT that stage,
  // independent of whether it's since gone on to a later one (a SKU
  // already Final-accepted still shows under Midline too, since it
  // genuinely submitted one) - matches ExportPicker's own reportsByStage,
  // which buckets by inspection_type directly rather than collapsing each
  // SKU to a single "current" stage first.
  const [activeStageTab, setActiveStageTab] = useState('inline')
  const togglePo = (poId) => setExpandedPoIds(prev => {
    const next = new Set(prev)
    if (next.has(poId)) next.delete(poId)
    else next.add(poId)
    return next
  })

  const groups = useMemo(() => {
    const byPo = new Map()
    for (const r of reports) {
      const po = getPo(r)
      if (!po) continue
      if (!byPo.has(po.id)) byPo.set(po.id, { poId: po.id, poNumber: po.po_number, buyerName: getBuyerName(r), batchNos: [], reports: [] })
      const group = byPo.get(po.id)
      group.reports.push(r)
      // Every report row for the same PO carries the same embedded batch
      // list (see qcReportReaders.js's getBatchNos) - dedupe it down to one
      // list per PO as rows come in, same as repositoryLayout.js's
      // groupReports does for the Repository panel.
      for (const b of getBatchNos(r)) if (!group.batchNos.includes(b)) group.batchNos.push(b)
    }
    return [...byPo.values()]
      .map(g => {
        // One skuGroups list per stage - a SKU that's gone all the way to
        // Final still shows up under Midline and Inline too, since it
        // genuinely submitted a report at each. A rejected-then-reinspected
        // SKU can have two submitted rounds at the *same* stage - only the
        // latest round represents that stage's current state, so earlier
        // rounds are dropped here (same reasoning
        // InspectionReportEntry.jsx's highestStagePerSkuIds/getStage
        // already apply elsewhere), independently per stage rather than
        // collapsing the whole SKU down to one "furthest" stage.
        const byStage = { inline: new Map(), midline: new Map(), final: new Map() }
        for (const r of g.reports) {
          const bucket = byStage[r.inspection_type]
          if (!bucket) continue
          const skuKey = r.po_line_item_id
          const existing = bucket.get(skuKey)
          if (!existing || (r.round ?? 1) > (existing.round ?? 1)) bucket.set(skuKey, r)
        }
        const skuGroupsByStage = {}
        for (const key of Object.keys(byStage)) {
          skuGroupsByStage[key] = [...byStage[key].values()]
            .map(r => ({ skuKey: r.po_line_item_id, skuRef: getSkuRef(r), reports: [r] }))
            .sort((a, b) => (a.skuRef || '').localeCompare(b.skuRef || ''))
        }
        return { ...g, skuGroupsByStage, reports: [...g.reports].sort((a, b) => (reportEffectiveDate(b) || '').localeCompare(reportEffectiveDate(a) || '')) }
      })
      .sort((a, b) => (reportEffectiveDate(b.reports[0]) || '').localeCompare(reportEffectiveDate(a.reports[0]) || ''))
  }, [reports])

  // Stage tab scopes the list first (every PO narrowed down to just the
  // SKUs with a submitted report at that stage) - search then layers on top
  // of that, same PO-match-keeps-everything / SKU-match-narrows-further
  // rule as before, just applied within the already stage-scoped set.
  const stageFilteredGroups = useMemo(() => {
    return groups
      .map(g => {
        const skuGroups = g.skuGroupsByStage[activeStageTab] || []
        return skuGroups.length ? { ...g, skuGroups } : null
      })
      .filter(Boolean)
  }, [groups, activeStageTab])

  // A PO-number/buyer match keeps every one of its SKUs; a SKU-only match
  // narrows that PO down to just the matching SKU rows, so searching "191..."
  // doesn't also surface every other unrelated SKU on the same PO. A
  // batch-number match (TWFCMB..., see
  // supabase/migrations/20260917_create_inspection_report_batches.sql)
  // behaves like a PO-number match - it identifies the whole document/PO,
  // not one SKU. g.batchNos comes straight off the same embedded
  // purchase_orders relation `groups` above already builds everything else
  // from (see qcReportReaders.js's getBatchNos) - no separate po_id-keyed
  // fetch, so there's nothing here to race or go stale.
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return stageFilteredGroups
    return stageFilteredGroups
      .map(g => {
        const poMatches = (g.poNumber || '').toLowerCase().includes(q) || (g.buyerName || '').toLowerCase().includes(q)
          || (g.batchNos || []).some(b => b.toLowerCase().includes(q))
        if (poMatches) return g
        const matchingSkuGroups = g.skuGroups.filter(sg => (sg.skuRef || '').toLowerCase().includes(q))
        return matchingSkuGroups.length ? { ...g, skuGroups: matchingSkuGroups } : null
      })
      .filter(Boolean)
  }, [stageFilteredGroups, search])

  // Same drag-to-dismiss convention as DayActivityModal above -
  // MobileFilterSheet.jsx/MobileBulkActionSheet.jsx's own gesture.
  const { dragY, dragHandlers } = useDragToDismiss({ onDismiss: onClose })
  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        style={{ transform: `translateY(${dragY}px)`, transition: dragY === 0 ? 'transform 0.2s ease-out' : 'none' }}
        className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] sm:max-h-[80vh] flex flex-col"
      >
        <div {...dragHandlers} className="sm:hidden flex items-center justify-center py-2 flex-shrink-0 cursor-grab touch-none">
          <span className="w-9 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="text-sm font-bold text-gray-900">Generated Reports</div>
          <div className="flex items-center gap-2">
            {filteredGroups.length > 0 && (
              <button
                type="button"
                onClick={() => onExportAll(filteredGroups.map(g => g.poId))}
                title="Combine every listed PO's report into one PDF and preview it"
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-gray-900 hover:bg-gray-700 transition-colors cursor-pointer"
              >
                Export All
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="px-3 pt-3 flex-shrink-0">
          <div className="relative">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by PO number, SKU, or TWFCMB batch no…"
              className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
            />
          </div>
        </div>
        <div className="flex items-center gap-1 px-3 pt-2.5 border-b border-gray-100 flex-shrink-0">
          {STAGE_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveStageTab(key)}
              className={`px-3 py-2 text-xs font-bold border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap
                ${activeStageTab === key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto px-3 py-3 space-y-2">
          {filteredGroups.length === 0 ? (
            <p className="text-xs text-gray-400 italic px-2 py-6 text-center">
              {groups.length === 0
                ? 'No inspection has been completed yet.'
                : search.trim()
                  ? 'No PO or SKU matches your search.'
                  : `No SKUs currently at ${STAGE_TABS.find(t => t.key === activeStageTab)?.label}.`}
            </p>
          ) : (
            filteredGroups.map(g => {
              // While searching, a matching PO is force-expanded so the SKU
              // that matched is actually visible, rather than found but
              // hidden behind a collapsed row - manual toggling still works
              // once the search is cleared.
              const poOpen = search.trim() ? true : expandedPoIds.has(g.poId)
              return (
                <div key={g.poId} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-50">
                    <button
                      type="button"
                      onClick={() => togglePo(g.poId)}
                      className="flex-1 min-w-0 text-left cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-gray-900 truncate">{g.poNumber || '-'}</div>
                        <div className="text-[11px] text-gray-500 truncate">{g.buyerName || '-'}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] font-semibold text-gray-400">
                          {g.skuGroups.length} SKU{g.skuGroups.length === 1 ? '' : 's'}
                        </span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          className={`text-gray-400 transition-transform ${poOpen ? 'rotate-180' : ''}`}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectPo(g.poId)}
                      title="Preview or download this PO's report"
                      className="flex-shrink-0 px-2.5 py-1.5 rounded-md text-[10px] font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-200 transition-colors cursor-pointer"
                    >
                      Export
                    </button>
                  </div>
                  {poOpen && (
                    <div className="divide-y divide-gray-100">
                      {/* One line per SKU: ref/stage/inspector/date on the
                          left (each SKU already narrowed to just its
                          furthest stage's report, see groups above), badge
                          and a per-SKU Export on the right. */}
                      {g.skuGroups.map(sg => sg.reports.map(r => (
                        <div key={r.id} className="px-3 py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-[11px] font-bold text-gray-700 truncate">{sg.skuRef || '-'}</span>
                              <span className="text-[10px] text-gray-400 truncate">
                                {/* submitted_at, not inspection_date - see InspectionReportEntry.jsx's
                                    ExportPicker for the same fix and why: inspection_date is manually
                                    entered and can go untouched between rounds. */}
                                {STAGE_ABBR[r.inspection_type] || r.inspection_type} · {getInspectorDisplayName(r) || 'Unassigned'} · {fmtDisplayDate(r.submitted_at)}
                              </span>
                            </div>
                            {(r.contact || r.arrival_time || r.start_time || r.complete_time) && (
                              <div className="text-[9px] text-gray-400 truncate mt-0.5">
                                {r.contact && <>Vendor Rep: {r.contact}</>}
                                {r.arrival_time && <>{r.contact ? ' · ' : ''}Arrival {r.arrival_time}</>}
                                {r.start_time && <> · Start {r.start_time}</>}
                                {r.complete_time && <> · Complete {r.complete_time}</>}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${RESULT_BADGE_CLASS[r.inspection_result] || 'bg-gray-100 text-gray-500'}`}>
                              {RESULT_LABEL[r.inspection_result] || 'Pending'}
                            </span>
                            <button
                              type="button"
                              onClick={() => onSelectPo(g.poId, sg.skuKey)}
                              title={`Preview or download ${sg.skuRef || 'this SKU'}'s report`}
                              className="px-2 py-1 rounded-md text-[9px] font-bold text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
                            >
                              Export
                            </button>
                          </div>
                        </div>
                      )))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// Preview/download for the single merged PDF openExportAll builds. Simpler
// than ExportPicker's own preview screen since there's no picking step here
// (the picking already happened, per-PO, before this ever renders), and
// "download" is a plain blob-to-file save rather than another jsPDF run -
// the file was already fully generated (and merged) by the time this opens.
function ExportAllPreviewModal({ blob, filename, isZip, partCount, onClose }) {
  // Unlike ExportPicker's own preview (built async, in response to a user
  // action), this blob is already fully formed by the time this modal opens
  // (openExportAll finishes generating and merging before setting
  // exportAllTarget), so the object URL is derived directly rather than via
  // an effect + setState round trip.
  const previewUrl = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl])

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = previewUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // Same bottom-sheet-on-mobile + drag-to-dismiss shape as DayActivityModal/
  // GeneratedReportsModal above - this used to be the one modal on this page
  // still a plain centered dialog with no mobile treatment at all.
  const { dragY, dragHandlers } = useDragToDismiss({ onDismiss: onClose })
  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        style={{ transform: `translateY(${dragY}px)`, transition: dragY === 0 ? 'transform 0.2s ease-out' : 'none' }}
        className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col"
      >
        <div {...dragHandlers} className="sm:hidden flex items-center justify-center py-2 flex-shrink-0 cursor-grab touch-none">
          <span className="w-9 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="text-sm font-bold text-gray-900">Preview - All Reports</div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {isZip ? (
          // At least one PO in this batch was too large for a single PDF
          // (see openExportAll's split-per-oversized-PO logic above) - the
          // result is a zip, which an iframe can't preview, so this shows
          // the same "too large to preview" notice ExportPicker's own
          // largeBatchNotice does instead of a broken/blank iframe.
          <div className="flex-1 flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-300">
              <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            <p className="text-sm font-semibold text-gray-500">One or more POs are too large to preview</p>
            <p className="text-xs text-gray-400 max-w-xs">Download will save a zip containing the merged PDF for every other PO, plus {partCount} separate part-PDFs for the oversized one(s).</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 px-5 py-4">
            <iframe src={previewUrl} title="Combined inspection reports preview" className="w-full h-full min-h-[65vh] border border-gray-200 rounded-lg" />
          </div>
        )}
        <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 flex items-center gap-3">
          <button
            type="button"
            onClick={handleDownload}
            className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 transition-colors cursor-pointer flex-shrink-0"
          >
            {isZip ? 'Download zip' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Formats either a date-only string ("2026-08-20") or a full timestamp
// ("2026-08-20T13:05:00Z") - fmtDisplayDate above assumes the former only
// and mis-renders the latter, since it appends its own "T00:00:00".
function fmtEventDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr.length <= 10 ? `${dateStr}T00:00:00` : dateStr)
  return isNaN(d) ? dateStr : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Hovering a tile reveals which POs actually make up its number, and the
// date that PO hit this state - poDates is only passed once its owning KPI
// has entries to offer, so a tile with none (or none loaded yet) just shows
// no popover, no dead hover state.
export function KpiTile({ label, value, accent, action, subLabel, poDates, onClick, active, onClear, loading }) {
  const accentClass = accent === 'emerald' ? 'text-emerald-600' : accent === 'red' ? 'text-red-500' : 'text-gray-900'
  const hasPoDates = poDates?.length > 0
  // While the trend data is still loading, a tile showing a bare "0" reads
  // as "there's genuinely nothing here" rather than "still counting" - on a
  // slow connection that's exactly what made this page feel stuck. A
  // pulsing skeleton bar in place of the label/value makes the in-progress
  // state visually obvious instead of a misleadingly-final zero.
  if (loading) {
    return (
      <div className="border border-gray-200 rounded-xl shadow-sm p-2.5 sm:p-4">
        <div className="h-2.5 w-16 rounded bg-gray-200 animate-pulse" />
        <div className="h-6 w-10 rounded bg-gray-200 animate-pulse mt-2" />
      </div>
    )
  }
  return (
    <div
      onClick={onClick}
      className={`group relative border rounded-xl shadow-sm p-2.5 sm:p-4 hover:shadow-md transition-shadow
        ${active ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'} ${onClick ? 'cursor-pointer' : ''}`}
    >
      {/* Hidden on mobile - tapping the already-active tile again clears it
          the same way (toggleKpiFilter toggles off on a repeat click), so
          this small corner X isn't needed there and was overlapping the
          tile's own value at this size. Desktop keeps it as a visible
          affordance next to the hover-driven tile interaction. */}
      {active && (
        <button
          type="button"
          aria-label={`Clear ${label} filter`}
          onClick={(e) => { e.stopPropagation(); onClear() }}
          className="hidden sm:flex absolute top-2 right-2 w-5 h-5 items-center justify-center rounded-full text-blue-400 hover:text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
      <div className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</div>
      <div className="flex items-baseline gap-1.5 sm:gap-2 mt-1 flex-wrap">
        <span className={`text-xl sm:text-2xl font-extrabold ${accentClass}`}>{value}</span>
        {subLabel && <span className="text-[11px] sm:text-xs font-semibold text-gray-400 truncate">{subLabel}</span>}
      </div>
      {action}
      {hasPoDates && (
        <div className="absolute left-0 top-full mt-1.5 z-20 w-72 max-w-[90vw] max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg p-2.5
          opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity pointer-events-none">
          <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">PO Numbers ({poDates.length})</div>
          <div className="space-y-1">
            {poDates.map(({ poNumber, date }) => (
              <div key={poNumber} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-semibold">{poNumber}</span>
                <span className="text-gray-400">{fmtEventDate(date) || '-'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Calendar-mode-only mobile filters sheet (Buyer/Vendor/Region/Inspector/
// Merchant) - same fields as the desktop grid just above, opened from the
// filter-icon trigger instead of shown inline. Not used in Repository view -
// RepositoryPanel.jsx renders its own combined sheet there instead (these
// same fields, passed down via `sharedFilters`, plus its own Date/Status/
// Vendor-QA-Stage).
function MobileTopFiltersSheet({
  buyerFilter, setBuyerFilter, buyerOptions,
  vendorFilter, setVendorFilter, vendorOptions,
  regionFilter, setRegionFilter, regionOptions,
  inspectorFilter, setInspectorFilter, qaOptions,
  merchantFilter, setMerchantFilter, merchantOptions,
  isAdmin, onClose,
}) {
  return (
    <FilterSheetShell title="Filters" onClose={onClose}>
      <FilterField label="Buyer">
        <SearchableSelect
          options={[{ value: '', label: 'All Buyers' }, ...buyerOptions]}
          value={buyerFilter} onChange={setBuyerFilter} placeholder="All Buyers"
          triggerClassName="h-9 px-3 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400"
          dropdownClassName="rounded-lg border border-gray-200"
        />
      </FilterField>
      <FilterField label="Vendor">
        <SearchableSelect
          options={[{ value: '', label: 'All Vendors' }, ...vendorOptions]}
          value={vendorFilter} onChange={setVendorFilter} placeholder="All Vendors"
          triggerClassName="h-9 px-3 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400"
          dropdownClassName="rounded-lg border border-gray-200"
        />
      </FilterField>
      <FilterField label="Vendor's Region">
        <SearchableSelect
          options={[{ value: '', label: 'All Regions' }, ...regionOptions]}
          value={regionFilter} onChange={setRegionFilter} placeholder="All Regions"
          triggerClassName="h-9 px-3 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400"
          dropdownClassName="rounded-lg border border-gray-200"
        />
      </FilterField>
      <FilterField label="Inspector">
        <SearchableSelect
          options={[{ value: '', label: 'All Inspectors' }, ...qaOptions]}
          value={inspectorFilter} onChange={setInspectorFilter} placeholder="All Inspectors"
          triggerClassName="h-9 px-3 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400"
          dropdownClassName="rounded-lg border border-gray-200"
        />
      </FilterField>
      {isAdmin && (
        <FilterField label="Merchant">
          <SearchableSelect
            options={[{ value: '', label: 'All Merchants' }, ...merchantOptions]}
            value={merchantFilter} onChange={setMerchantFilter} placeholder="All Merchants"
            triggerClassName="h-9 px-3 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400"
            dropdownClassName="rounded-lg border border-gray-200"
          />
        </FilterField>
      )}
    </FilterSheetShell>
  )
}
