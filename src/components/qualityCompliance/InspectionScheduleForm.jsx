import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { useOrgId, useProfileStore } from '../../stores/profileStore'
import { useAuthStore } from '../../stores/authStore'
import SearchableSelect from '../ui/SearchableSelect'
import { createSchedule, updateSchedule, fetchPoScheduleEntries } from '../../hooks/useInspectionSchedule'
import { resolveSamplingPlan } from '../../lib/samplingPlan'
import { ACCEPTED_RESULTS, getStageRollup, wasStageRejected } from './inspectionReport/stageStatus'
import { closedForReinspection } from './inspectionReport/resultGroups'
import { useSendMailStore } from '../../stores/sendMailStore'

// How many units are actually still left to inspect at this stage - the
// order quantity minus whatever's already been cumulatively accepted/
// available across every submitted round there (same getStageRollup check
// isDoneForStage uses), not just the SKU's raw order quantity. A SKU that
// already had 75 of 150 accepted in an earlier round defaults to (and caps
// at) 75, not 150 - the other 75 was already covered, only the leftover is
// genuinely still outstanding. Falls back to the plain order quantity when
// nothing's been covered yet (the common, single-round case). Editable
// afterward (e.g. down to an AQL sample size) but never starts pre-shrunk
// below what's actually needed, and never typeable back up past it either.
function remainingForLineItem(li, stage, fulfillmentReports) {
  const orderQty = li.quantity_ordered ?? 0
  const rollup = getStageRollup(fulfillmentReports, li.id, stage)
  // cumulativeAvailable only stands in for "covered" when nothing's actually
  // been accepted yet AND this stage's most recent submitted round wasn't a
  // rejection - a rejected round's available_quantity was inspected and
  // turned down, not accepted, so it was never "covered" and the whole
  // order quantity is still outstanding. A rejected SKU keeps re-offering
  // its full order quantity every time it's scheduled again here, no matter
  // how many rounds it's been through - only cancelling it changes that.
  // Without this check, a SKU rejected in full (available_quantity ==
  // order, accepted_quantity == 0) read as fully covered here and defaulted
  // this dialog's quantity to 0 instead of the true remaining amount.
  const rejected = rollup.cumulativeAccepted === 0 && !!wasStageRejected(fulfillmentReports, li.id, stage)
  const covered = rejected ? 0 : (rollup.cumulativeAccepted > 0 ? rollup.cumulativeAccepted : rollup.cumulativeAvailable)
  return covered > 0 ? Math.max(0, orderQty - covered) : orderQty
}

// Never let a typed/redistributed quantity exceed the ceiling passed in -
// the physical limit on how many units actually still exist to inspect.
function clampQuantity(raw, cap) {
  if (raw === '') return raw
  const n = Math.max(0, Math.floor(Number(raw)) || 0)
  return cap != null ? Math.min(n, cap) : n
}

// PPM (Pre-Production Meeting) and Pilot Run come first — the schedule-side
// stage list only, not the wizard/report system (stageStatus.jsx's own
// STAGES), which still only covers inline/midline/final: both can be
// planned and shown on the calendar but have no inspection report/wizard
// of their own yet.
const STAGES = [
  { value: 'ppm',       label: 'PPM (Pre-Production Meeting)' },
  { value: 'pilot_run', label: 'Pilot Run' },
  { value: 'inline',    label: 'Inline' },
  { value: 'midline',   label: 'Midline' },
  { value: 'final',     label: 'Final' },
]

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtScheduledDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
// Created/updated timestamps are full ISO datetimes (unlike scheduled_date,
// a bare date), so the created/modified-by footer shows both date and time.
function fmtDateTime(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return d
  return `${dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

export default function InspectionScheduleForm({ entry, defaultDate, onClose, onSaved }) {
  const isEdit = !!entry
  const orgId = useOrgId()
  const userName = useProfileStore(s => s.orgMembership?.fullName || 'QA Team')
  const userEmail = useAuthStore(s => s.session?.user?.email)

  const [poId, setPoId]           = useState(entry?.po_id || '')
  const [poOptions, setPoOptions] = useState(
    entry ? [{ value: entry.po_id, label: entry.purchase_orders?.po_number || 'PO' }] : []
  )
  const [poLoading, setPoLoading] = useState(false)
  // Optional pre-filters for the PO Number search - narrow the (long) PO
  // list to one customer's and/or one vendor's POs first, since a QA
  // scheduling for a specific customer/vendor usually already knows whose PO
  // it is. '' = all. (Kept the `buyer`/`vendor` field names internally -
  // buyer_supplier_links's own terms - but the UI says "Customer"/"Vendor"
  // to match the rest of the app.) Both filters combine (AND), same as
  // picking a PO fills in both fields below.
  const [buyerFilter, setBuyerFilter] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [poLineItems, setPoLineItems] = useState([])   // open SKUs on the selected PO
  const [poLineItemsLoading, setPoLineItemsLoading] = useState(false)
  const [poInspectionLevel, setPoInspectionLevel] = useState(null)
  // Which of those SKUs this entry is scoped to. Empty = "the whole PO" (the
  // only option before this existed, and still the default) — line_items
  // only gets a value once the inspector deliberately narrows it down.
  const [selectedLineItemIds, setSelectedLineItemIds] = useState(() => new Set((entry?.line_items || []).map(x => x.id)))
  // Filters which SKUs are shown in the list below, not which are selected -
  // Pick/Total Qty/Select All keep operating on the full poLineItems list.
  const [skuSearch, setSkuSearch] = useState('')
  // How many units to inspect per checked SKU, keyed by line item id — set
  // once when a SKU is first checked, kept in local state even if unchecked
  // so re-checking restores it instead of re-defaulting.
  const [lineItemQuantities, setLineItemQuantities] = useState(() =>
    Object.fromEntries((entry?.line_items || []).map(x => [x.id, x.quantity]))
  )
  // Skips the very first auto-default pass in edit mode, so opening Edit on
  // an entry never overwrites the SKU selection/quantities it was saved with.
  const skipInitialAutoDefault = useRef(isEdit)

  const [stage, setStage] = useState(entry?.inspection_type || 'inline')
  const [date, setDate]   = useState(entry?.scheduled_date || defaultDate || todayISO())
  // Optional — time-of-day wasn't tracked at all before this, so most
  // existing entries have none; leaving it blank keeps that valid.
  const [time, setTime]   = useState(entry?.scheduled_time?.slice(0, 5) || '')

  const [qaId, setQaId]           = useState(entry?.assigned_qa_id || '')
  const [qaOptions, setQaOptions] = useState([])
  const [qaLoading, setQaLoading] = useState(false)

  const [notes, setNotes]   = useState(entry?.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  // Fetched fresh here rather than relying on whichever fields the caller's
  // own list query happened to select (several different screens open this
  // form with entries from different queries) - guarantees this is always
  // present and up to date regardless of caller.
  const [lastEdited, setLastEdited] = useState(null)
  useEffect(() => {
    if (!entry?.id) return
    let cancelled = false
    supabase.from('inspection_schedules')
      .select('created_by, created_at, updated_by, updated_by_email, updated_at')
      .eq('id', entry.id)
      .single()
      .then(({ data }) => { if (!cancelled) setLastEdited(data || null) })
    return () => { cancelled = true }
  }, [entry?.id])

  // Every PI-confirmed, open PO that still has at least one open SKU, loaded
  // once — SearchableSelect's built-in search box filters this list
  // client-side by PO number as the user types (it has no server-side search
  // of its own). Deliberately no .limit() here beyond PostgREST's own
  // default row cap — an explicit limit(200) used to sit here ordered by
  // most-recently-received, which silently made any PO past the 200th most
  // recent unreachable no matter what was typed (found via a PO ranked #423
  // not showing up at all). "Confirmed" here matches PoRecord.jsx's own
  // definition exactly (pi_confirmed === true || !!pi_file_url) — not just
  // the boolean column alone, since a PO can read as "Confirmed" on the PO
  // Summary Dashboard via either path. There's no separate pi_status string
  // column; that name is just the RPC filter parameter's label elsewhere.
  useEffect(() => {
    let cancelled = false
    setPoLoading(true)
    supabase
      .from('purchase_orders')
      .select('id, po_number, po_line_items(status), buyer_supplier_links(buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(display_name), supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(display_name))')
      .is('deleted_at', null)
      .is('delete_meta', null)
      .neq('status', 'closed')
      .or('pi_confirmed.eq.true,pi_file_url.not.is.null')
      .order('po_received_date', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        const withOpenSkus = (data || []).filter(po => po.po_line_items?.some(li => li.status?.toLowerCase() === 'open'))
        let options = withOpenSkus.map(po => ({
          value: po.id, label: po.po_number,
          buyer: po.buyer_supplier_links?.buyer?.display_name || '',
          vendor: po.buyer_supplier_links?.supplier?.display_name || '',
        }))
        // The entry's own PO may have gone closed/lost its last open SKU
        // since this entry was scheduled - keep it selectable in edit mode
        // even if the fresh fetch above no longer includes it.
        if (isEdit && entry?.po_id && !options.some(o => o.value === entry.po_id)) {
          options = [{ value: entry.po_id, label: entry.purchase_orders?.po_number || 'PO', buyer: '', vendor: '' }, ...options]
        }
        setPoOptions(options)
        setPoLoading(false)
      })
    return () => { cancelled = true }
  }, [isEdit, entry?.po_id, entry?.purchase_orders?.po_number])

  // Distinct customers/vendors across the loaded PO list, for the Customer/
  // Vendor pre-filters.
  const buyerOptions = useMemo(() => {
    const names = [...new Set(poOptions.map(o => o.buyer).filter(Boolean))].sort((a, b) => a.localeCompare(b))
    return [{ value: '', label: 'All customers' }, ...names.map(n => ({ value: n, label: n }))]
  }, [poOptions])
  const vendorOptions = useMemo(() => {
    const names = [...new Set(poOptions.map(o => o.vendor).filter(Boolean))].sort((a, b) => a.localeCompare(b))
    return [{ value: '', label: 'All vendors' }, ...names.map(n => ({ value: n, label: n }))]
  }, [poOptions])
  // The PO Number search only sees POs matching both filters once either is
  // picked - Customer and Vendor combine (AND), not either-or.
  const visiblePoOptions = useMemo(
    () => poOptions.filter(o => (!buyerFilter || o.buyer === buyerFilter) && (!vendorFilter || o.vendor === vendorFilter)),
    [poOptions, buyerFilter, vendorFilter]
  )

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    setQaLoading(true)
    supabase
      .from('organization_members')
      .select('id, full_name')
      .eq('organization_id', orgId)
      .eq('department', 'qa')
      .is('removed_at', null)
      .order('full_name')
      .then(({ data }) => {
        if (cancelled) return
        setQaOptions((data || []).map(m => ({ value: m.id, label: m.full_name })))
        setQaLoading(false)
      })
    return () => { cancelled = true }
  }, [orgId])

  // Open SKUs on whichever PO is selected — same "open" convention PO
  // Inspection's PO cards already use. Also the source list for the SKU
  // picker below, so the scheduler can see (and narrow down) the size of the
  // job before assigning a QA/date rather than after.
  useEffect(() => {
    if (!poId) { setPoLineItems([]); return }
    let cancelled = false
    setPoLineItemsLoading(true)
    supabase.from('purchase_orders')
      .select('inspection_level, po_line_items(id, buyer_sku_ref, sku_variant, status, quantity_ordered)')
      .eq('id', poId).single()
      .then(({ data }) => {
        if (cancelled) return
        setPoInspectionLevel(data?.inspection_level || null)
        setPoLineItems((data?.po_line_items || []).filter(li => li.status?.toLowerCase() === 'open'))
        setPoLineItemsLoading(false)
      })
    return () => { cancelled = true }
  }, [poId])

  // Every other (non-cancelled) schedule entry that already exists for this
  // PO, so the picker below can flag a SKU as already covered instead of
  // silently letting it get double-booked. Excludes the entry being edited
  // itself, which would otherwise always show as "already scheduled" for its
  // own SKUs.
  const [scheduleEntries, setScheduleEntries] = useState([])
  useEffect(() => {
    if (!poId) { setScheduleEntries([]); return }
    let cancelled = false
    fetchPoScheduleEntries(poId).then(({ entries }) => {
      if (!cancelled) setScheduleEntries((entries || []).filter(e => e.status !== 'cancelled' && e.id !== entry?.id))
    })
    return () => { cancelled = true }
  }, [poId, entry?.id])

  // Just enough of each SKU's inspection reports to tell whether an existing
  // schedule entry has already been fulfilled — a SKU whose prior entry was
  // fully accepted shouldn't still read as "Scheduled" here.
  const [fulfillmentReports, setFulfillmentReports] = useState([])
  useEffect(() => {
    const ids = poLineItems.map(li => li.id)
    if (!ids.length) { setFulfillmentReports([]); return }
    let cancelled = false
    supabase.from('inspection_reports')
      .select('po_line_item_id, inspection_type, status, accepted_quantity, available_quantity, fulfilled_schedule_id, inspection_result, round')
      .in('po_line_item_id', ids)
      .then(({ data }) => { if (!cancelled) setFulfillmentReports(data || []) })
    return () => { cancelled = true }
  }, [poLineItems])

  // Earliest still-outstanding scheduled date per SKU, scoped to the stage
  // currently picked below — a SKU already booked for Inline shouldn't read
  // as "Scheduled" while setting up a separate Final entry, and vice versa.
  // scheduledSkuInfo: still genuinely pending, blocks a fresh manual
  // schedule (unchanged meaning from before). rejectedSkuInfo: the entry
  // WAS resolved, by a rejection specifically - doesn't block re-selection,
  // but still worth showing so a rejected SKU doesn't look identical to one
  // that was never scheduled at all. Accepted-and-resolved entries are
  // simply dropped from both, same as before.
  const { scheduledSkuInfo, rejectedSkuInfo } = useMemo(() => {
    const info = {}
    const rejected = {}
    const allIds = poLineItems.map(li => li.id)
    for (const e of scheduleEntries) {
      if (e.inspection_type !== stage) continue
      const ids = e.line_items?.length ? e.line_items.map(x => x.id) : allIds
      for (const id of ids) {
        const li = poLineItems.find(x => x.id === id)
        if (!li) continue
        const qty = e.line_items?.find(x => x.id === id)?.quantity ?? li.quantity_ordered
        // An entry stops blocking a fresh manual schedule once it has a real
        // verdict - either accepted (the work is done) or rejected (the
        // work is done too, just failed; re-inspection is warranted via a
        // NEW entry, not by being stuck behind this one forever). Only a
        // still-unsubmitted/draft report leaves it genuinely pending and
        // blocking. Final-stage rejections already get an automatic
        // re-inspection entry (InspectionForm.jsx's submit handler); this
        // is what unblocks Inline/Midline too, which have no such
        // auto-reschedule of their own.
        const wasRejected = fulfillmentReports.some(r =>
          r.po_line_item_id === id && r.inspection_type === e.inspection_type &&
          r.status === 'submitted' && r.fulfilled_schedule_id === e.id && closedForReinspection(r, fulfillmentReports)
        )
        if (wasRejected) {
          if (!rejected[id] || e.scheduled_date > rejected[id]) rejected[id] = e.scheduled_date
          continue
        }
        const accepted = fulfillmentReports.some(r =>
          r.po_line_item_id === id && r.inspection_type === e.inspection_type &&
          r.status === 'submitted' && r.fulfilled_schedule_id === e.id &&
          (r.accepted_quantity != null ? Number(r.accepted_quantity) >= qty : ACCEPTED_RESULTS.includes(r.inspection_result))
        )
        if (accepted) continue
        if (!info[id] || e.scheduled_date < info[id].date) info[id] = { date: e.scheduled_date, entry: e }
      }
    }
    return { scheduledSkuInfo: info, rejectedSkuInfo: rejected }
  }, [scheduleEntries, fulfillmentReports, poLineItems, stage])

  // New-entry mode has no single row of its own to attribute yet, but the
  // user still wants to see who's been managing THIS PO's inspections - the
  // most recently touched entry (by any stage) already loaded in
  // scheduleEntries for the selected PO.
  const poLastActivity = useMemo(() => {
    let latest = null
    for (const e of scheduleEntries) {
      const at = e.updated_at || e.created_at
      if (!at) continue
      if (!latest || at > latest.at) latest = { at, by: e.updated_by || e.created_by }
    }
    return latest
  }, [scheduleEntries])

  // Per-SKU, per-stage acceptance - whether Inline/Midline/Final was already
  // submitted with an accepted-ish verdict (latest round only, matching
  // getStage's convention). Drives blocking a stage from being re-picked for
  // a SKU once accepted, flagging when only a later stage is left, and (see
  // stageHasRemainingSkus/availableStages below) which stages the picker
  // offers at all and which one it defaults to.
  // A stage's "accepted" flag must not survive a fresh, still-unsubmitted
  // round on top of it (e.g. Rework approval resets the stage to a new
  // draft round) - otherwise that stage silently vanishes from the Stage
  // dropdown below (stageHasRemainingSkus reads every SKU as already done),
  // even though the whole point of the rework was to reopen it. Same "read
  // only the latest round, draft or not" convention isFinalized/getStage
  // already follow elsewhere - track the latest round of ANY status per
  // (line item, stage), and only trust the latest SUBMITTED round's verdict
  // when nothing newer (a draft) has since superseded it.
  const stageAcceptance = useMemo(() => {
    const latestAny = {}       // { [lineItemId]: { [stage]: round } }
    const latestSubmitted = {} // { [lineItemId]: { [stage]: { round, accepted } } }
    for (const r of fulfillmentReports) {
      const round = r.round ?? 1
      const byItem = latestAny[r.po_line_item_id] || (latestAny[r.po_line_item_id] = {})
      byItem[r.inspection_type] = Math.max(byItem[r.inspection_type] || 0, round)
      if (r.status === 'submitted') {
        const subByItem = latestSubmitted[r.po_line_item_id] || (latestSubmitted[r.po_line_item_id] = {})
        const current = subByItem[r.inspection_type]
        if (!current || round > current.round) {
          subByItem[r.inspection_type] = { round, accepted: ACCEPTED_RESULTS.includes(r.inspection_result) }
        }
      }
    }
    const info = {}
    for (const lineItemId of Object.keys(latestAny)) {
      info[lineItemId] = {}
      for (const stageKey of Object.keys(latestAny[lineItemId])) {
        const submitted = latestSubmitted[lineItemId]?.[stageKey]
        const supersededByDraft = latestAny[lineItemId][stageKey] > (submitted?.round ?? 0)
        info[lineItemId][stageKey] = {
          round: latestAny[lineItemId][stageKey],
          accepted: !supersededByDraft && !!submitted?.accepted,
        }
      }
    }
    return info
  }, [fulfillmentReports])

  // Fully done for the currently picked stage (already accepted) - nothing
  // left to schedule here, so it's dropped from the list entirely rather
  // than shown frozen with a badge. Scheduling never freezes a SKU
  // otherwise - "already scheduled"/"rejected" are shown as informational
  // labels only (below) and stay fully selectable via the checkbox, Select
  // All, and "Pick: N", since the scheduler may legitimately want to add
  // another date for the same SKU.
  // Latest submitted round reading "accepted" isn't the whole story - a
  // round can itself be a plain "accepted" and the SKU still be short of
  // its full order if an earlier round only covered part of it (see
  // InspectionForm.jsx's auto-reschedule: a schedule entry for the leftover
  // may already exist, or a fresh round may already be in progress, neither
  // of which changes what this one round's own inspection_result says).
  // Only actually "done" once the cumulative accepted/available across
  // every submitted round at this stage reaches the true order quantity -
  // same getStageRollup check the app's "Partially Accepted" badges use.
  // Parameterized on `s` (not just the currently-picked `stage`) so
  // stageHasRemainingSkus below can ask the exact same "is this SKU truly
  // done" question for every stage, not just the active one - it used to
  // only check the raw accepted flag, missing this quantity-coverage half
  // entirely. That mismatch let a SKU accepted for only part of its order
  // read as "no longer needed" for the Stage dropdown/auto-default while
  // the SKU list (which does use this full check) still correctly showed
  // it as needing more of that same stage - the two disagreeing meant the
  // auto-default could see nothing "remaining" at any stage even though the
  // list plainly still had SKUs to schedule, and silently give up rather
  // than advance past its initial "Inline" default.
  const isDoneForStageValue = (li, s) => {
    if (!stageAcceptance[li.id]?.[s]?.accepted) return false
    if (li.quantity_ordered == null) return true
    const rollup = getStageRollup(fulfillmentReports, li.id, s)
    const covered = rollup.cumulativeAccepted > 0 ? rollup.cumulativeAccepted : rollup.cumulativeAvailable
    return covered >= li.quantity_ordered
  }
  const isDoneForStage = (li) => isDoneForStageValue(li, stage)
  // Same "is this SKU truly done" check, generalized to "any SKU on this PO
  // still needs stage s" - drives both the Stage dropdown's own options
  // (availableStages below) and which stage a fresh entry defaults to.
  const stageHasRemainingSkus = (s) => poLineItems.some(li => !isDoneForStageValue(li, s))
  // PPM and Pilot Run have no report/wizard of their own (see the STAGES
  // comment above), so there's no way to know if either is "done" - always
  // offered, unfiltered. Every other stage only stays offered if some SKU
  // still needs it, or it's the one already selected (so the dropdown
  // never lands on a value that isn't one of its own rendered options -
  // matters in edit mode, where an existing entry's stage could otherwise
  // vanish from the list).
  const availableStages = useMemo(
    () => STAGES.filter(s => s.value === 'ppm' || s.value === 'pilot_run' || s.value === stage || stageHasRemainingSkus(s.value)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [poLineItems, stageAcceptance, stage]
  )

  // "Done" SKUs used to be dropped from this list entirely - correct when a
  // SKU's full order quantity is genuinely, cleanly accepted, but the same
  // "done" flag also fires on a real SKU (e.g. `partially_accepted` with 0
  // actually accepted) whose covered-quantity math still reads as "fully
  // presented," even though nothing passed and it still needs scheduling.
  // That silently hid a real, searchable SKU behind "No SKUs match" with no
  // way to find it. Every open SKU is shown now regardless of done-ness -
  // one already submitted for this stage just carries the "Submitted" badge
  // below instead of vanishing, so it's still searchable and selectable.
  const filteredLineItems = useMemo(() => {
    const q = skuSearch.trim().toLowerCase()
    if (!q) return poLineItems
    return poLineItems.filter(li =>
      (li.buyer_sku_ref || '').toLowerCase().includes(q) || (li.sku_variant || '').toLowerCase().includes(q)
    )
  }, [poLineItems, skuSearch])

  // Switching the stage picker for a SKU that's now done at the newly picked
  // stage must drop it from the selection, not just hide its row going
  // forward - otherwise a SKU checked under one stage could stay checked
  // (and get saved) after flipping the dropdown to a stage where it's
  // already fully accepted.
  useEffect(() => {
    setSelectedLineItemIds(prev => {
      let changed = false
      const next = new Set(prev)
      for (const id of next) {
        const li = poLineItems.find(x => x.id === id)
        if (li && isDoneForStage(li)) { next.delete(id); changed = true }
      }
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, stageAcceptance, poLineItems])

  // Defaults a SKU's quantity the first time it's checked; leaves an already-set
  // quantity alone so unchecking/re-checking doesn't lose an edited value.
  const defaultQuantities = (items) => setLineItemQuantities(prev => {
    const next = { ...prev }
    items.forEach(li => { if (next[li.id] == null) next[li.id] = remainingForLineItem(li, stage, fulfillmentReports) })
    return next
  })

  const toggleLineItem = (li) => {
    setSelectedLineItemIds(prev => {
      const next = new Set(prev)
      if (next.has(li.id)) next.delete(li.id)
      else next.add(li.id)
      return next
    })
    defaultQuantities([li])
  }
  const selectableLineItems = poLineItems.filter(li => !isDoneForStage(li))
  const allLineItemsSelected = selectableLineItems.length > 0 && selectableLineItems.every(li => selectedLineItemIds.has(li.id))
  const toggleAllLineItems = () => {
    if (allLineItemsSelected) { setSelectedLineItemIds(new Set()); return }
    setSelectedLineItemIds(new Set(selectableLineItems.map(li => li.id)))
    defaultQuantities(selectableLineItems)
  }

  // Quick "Pick: N of total" - re-selects the first N SKUs in list order,
  // skipping any already done for this stage rather than counting them
  // toward N.
  const applyLineItemCount = (n) => {
    const count = Math.max(0, Math.min(selectableLineItems.length, Math.floor(n) || 0))
    const picked = selectableLineItems.slice(0, count)
    setSelectedLineItemIds(new Set(picked.map(li => li.id)))
    defaultQuantities(picked)
  }

  // Quick "Total Qty" — evenly redistributes a target unit total across the
  // currently checked SKUs (remainder to the first few), each capped at its
  // own quantity_ordered so no box exceeds what was ordered. Selection itself
  // is untouched; this only rewrites the quantities of SKUs already checked.
  const applyTotalQuantity = (target) => {
    const ids = [...selectedLineItemIds]
    if (!ids.length) return
    const n = Math.max(0, Math.floor(Number(target)) || 0)
    const base = Math.floor(n / ids.length)
    let remainder = n % ids.length
    setLineItemQuantities(prev => {
      const next = { ...prev }
      ids.forEach(id => {
        const cap = poLineItems.find(li => li.id === id)?.quantity_ordered
        let qty = base + (remainder > 0 ? 1 : 0)
        if (remainder > 0) remainder--
        next[id] = cap != null ? Math.min(qty, cap) : qty
      })
      return next
    })
  }

  // Auto-default to the PO's AQL-recommended SKU count on a fresh PO pick
  // (selection still empty). Skipped once in edit mode so hydrating from a
  // saved entry doesn't get clobbered by this.
  useEffect(() => {
    if (skipInitialAutoDefault.current) { skipInitialAutoDefault.current = false; return }
    if (!poLineItems.length || selectedLineItemIds.size > 0) return
    const plan = resolveSamplingPlan({ lotSize: poLineItems.length, inspectionLevel: poInspectionLevel })
    if (plan?.sampleSize) applyLineItemCount(plan.sampleSize)
    // selectedLineItemIds.size is read only as an early-return guard here, and
    // applyLineItemCount is stable in intent (redefined each render, but that's
    // fine since it's only invoked, not depended on for its identity) — including
    // either would re-run this on every selection change, defeating the "once per
    // fresh PO pick" behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poLineItems, poInspectionLevel])

  // Auto-default the Stage picker to whichever stage is actually still
  // needed on a fresh PO pick, instead of always landing on "Inline" - a PO
  // where every SKU already has Inline (and maybe Midline) accepted used to
  // open on Inline and show an empty SKU list (nothing left there), looking
  // broken, when what the scheduler almost always wants is whichever stage
  // still has SKUs pending. Own ref, separate from skipInitialAutoDefault
  // above - sharing one ref between two effects would let whichever runs
  // first consume the single skip flag before the other gets to check it,
  // wrongly disabling that other effect's own edit-mode skip. Bails out once
  // the stage picker or SKU selection has actually been touched, so it only
  // ever adjusts the untouched initial default, never a deliberate choice.
  const skipInitialStageAutoDefault = useRef(isEdit)
  useEffect(() => {
    if (skipInitialStageAutoDefault.current) { skipInitialStageAutoDefault.current = false; return }
    if (!poLineItems.length || stage !== 'inline' || selectedLineItemIds.size > 0) return
    const nextStage = ['inline', 'midline', 'final'].find(stageHasRemainingSkus)
    if (nextStage && nextStage !== stage) setStage(nextStage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poLineItems, stageAcceptance])

  const totalQuantity = [...selectedLineItemIds].reduce((sum, id) => sum + (Number(lineItemQuantities[id]) || 0), 0)

  const canSave = poId && stage && date && qaId && !saving

  // Any still-outstanding entry (no submitted report yet) covering this SKU,
  // in ANY stage - not just the one currently picked. Mirrors
  // scheduledSkuInfo's own "resolved" check (rejected or accepted both count
  // as dealt with) but without its stage filter, since a SKU being moved to
  // a different stage is exactly the case this needs to catch.
  const findOutstandingEntry = (id) => {
    const allIds = poLineItems.map(li => li.id)
    let best = null
    for (const e of scheduleEntries) {
      const ids = e.line_items?.length ? e.line_items.map(x => x.id) : allIds
      if (!ids.includes(id)) continue
      const li = poLineItems.find(x => x.id === id)
      if (!li) continue
      const qty = e.line_items?.find(x => x.id === id)?.quantity ?? li.quantity_ordered
      const resolved = fulfillmentReports.some(r =>
        r.po_line_item_id === id && r.inspection_type === e.inspection_type &&
        r.status === 'submitted' && r.fulfilled_schedule_id === e.id &&
        (closedForReinspection(r, fulfillmentReports) || (r.accepted_quantity != null ? Number(r.accepted_quantity) >= qty : ACCEPTED_RESULTS.includes(r.inspection_result)))
      )
      if (resolved) continue
      if (!best || e.scheduled_date < best.scheduled_date) best = e
    }
    return best
  }

  // A selected SKU can already belong to another still-outstanding entry,
  // possibly under a different stage. Saving here must not leave that old
  // entry as-is - doing so double-books the SKU into two independent active
  // entries, which is exactly the duplicate-row bug this once had. When
  // every SKU an old entry covered is moving into this save, that old entry
  // is repurposed in place (its stage/date/etc. become the new ones)
  // instead of being cancelled next to a brand-new duplicate row - so
  // "only the stage changed" reads as one updated row, not two. When only
  // some of an old entry's SKUs are moving, it's shrunk to keep the rest (or
  // cancelled if that empties it), same as before.
  const resolveOldEntries = async (selectedIds, currentEntryId) => {
    const byOldEntry = new Map()
    for (const id of selectedIds) {
      const old = findOutstandingEntry(id)
      if (!old || old.id === currentEntryId) continue
      if (!byOldEntry.has(old.id)) byOldEntry.set(old.id, { entry: old, removeIds: new Set() })
      byOldEntry.get(old.id).removeIds.add(id)
    }
    const allIds = poLineItems.map(li => li.id)
    let mergeTargetId = null
    for (const { entry: oldEntry, removeIds } of byOldEntry.values()) {
      const currentIds = oldEntry.line_items?.length ? oldEntry.line_items.map(x => x.id) : allIds
      const remainingIds = currentIds.filter(id => !removeIds.has(id))
      if (remainingIds.length === 0 && !mergeTargetId) {
        mergeTargetId = oldEntry.id
        continue
      }
      if (remainingIds.length === 0) {
        await updateSchedule(oldEntry.id, { status: 'cancelled', updated_by: userName, updated_by_email: userEmail })
      } else {
        const newLineItems = remainingIds.map(id => {
          const existingQty = oldEntry.line_items?.find(x => x.id === id)?.quantity
          const li = poLineItems.find(x => x.id === id)
          return { id, quantity: existingQty ?? li?.quantity_ordered ?? 0 }
        })
        await updateSchedule(oldEntry.id, { line_items: newLineItems, updated_by: userName, updated_by_email: userEmail })
      }
    }
    return mergeTargetId
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    // Wrapped in try/finally - resolveOldEntries/createSchedule/updateSchedule
    // can throw (a network hiccup, a rejected promise) rather than always
    // resolving to a clean { error } result. Without this, a thrown error
    // here skipped the setSaving(false) below entirely, leaving the Schedule
    // button permanently disabled (opacity-40) for the rest of this modal's
    // session, with no visible error and no way to retry short of closing
    // and reopening the whole dialog - exactly the "why can't I click
    // Schedule, every field looks filled in" symptom this fixes.
    try {
      const mergeTargetId = await resolveOldEntries([...selectedLineItemIds], isEdit ? entry.id : null)
      const payload = {
        po_id: poId,
        inspection_type: stage,
        scheduled_date: date,
        scheduled_time: time || null,
        assigned_qa_id: qaId,
        notes: notes.trim() || null,
        line_items: selectedLineItemIds.size > 0
          ? [...selectedLineItemIds].map(id => ({ id, quantity: Number(lineItemQuantities[id]) || 0 }))
          : null,
      }
      const targetId = isEdit ? entry.id : mergeTargetId
      const { data, error: err } = targetId
        ? await updateSchedule(targetId, { ...payload, updated_by: userName, updated_by_email: userEmail })
        : await createSchedule({ ...payload, created_by: userName, created_by_email: userEmail })
      if (err) { setError(err.message); return }
      // Notification email - only on a genuine brand-new row, not edits and
      // not a merge into an existing entry (mergeTargetId). Queued into the
      // shared send-mail store rather than fired directly - this form closes
      // (onSaved() below) right after, and it's rendered from several
      // different parent pages, so there's no single component to host the
      // actual network call locally (see sendMailStore.js, mounted once in
      // Dashboard.jsx as SendRecipientsModal.jsx). A flaky network call here
      // must still never block or fail the scheduling action the user just
      // completed. `auto: true` - unlike the manual "Send Mail" button
      // elsewhere, scheduling shouldn't need a human to review/confirm
      // recipients every time, so this sends straight through with no dialog.
      if (!targetId && data?.id) {
        useSendMailStore.getState().requestSend({
          auto: true,
          previewRequest: {
            url: `${import.meta.env.VITE_BACKEND_URL}/inspection-schedule/notify/preview`,
            body: { scheduleId: data.id, scheduledByEmail: userEmail, scheduledByName: userName },
          },
          buildSendRequests: (selectedEmails) => [{
            url: `${import.meta.env.VITE_BACKEND_URL}/inspection-schedule/notify`,
            body: { scheduleId: data.id, scheduledByEmail: userEmail, scheduledByName: userName, selectedEmails },
          }],
        })
      }
      onSaved()
    } catch (err) {
      setError(err.message || 'Failed to save this schedule entry.')
    } finally {
      setSaving(false)
    }
  }

  // Portaled to document.body - `fixed inset-0` only covers the true
  // viewport when nothing between it and the page root has a CSS transform;
  // this form is mounted inside the page's own nested layout divs (opened
  // from InspectionSchedule.jsx among other places), so without the portal
  // it could get clipped/repositioned relative to whichever ancestor
  // happens to establish one, instead of covering the whole screen - same
  // fix already applied to InspectionSchedule.jsx's own DetailModal/
  // DayListModal and to CalloutModal.jsx/SkuCommentsModal.jsx earlier.
  return createPortal(
    // items-end + rounded-t-2xl only up to sm - same mobile bottom-sheet
    // convention every other modal in this app already uses (DetailModal/
    // DayListModal/ReworkRequestModal/CalloutModal). This one was left as a
    // plain centered dialog with no such treatment, and on a phone its full
    // content (several stacked fields, each full-width below sm) routinely
    // ran taller than the viewport with nothing capping/scrolling it
    // properly. Previously this tried to keep header/footer permanently
    // pinned via flex-col + an inner flex-1/h-full scrolling region - at
    // some combinations of browser zoom and viewport size that inner
    // percentage-height region stopped resizing correctly (a real,
    // reproduced bug: the footer ended up overlapping mid-form fields
    // instead of sitting below them, with no way to scroll past it). Now the
    // WHOLE card - header, fields, footer - is just one normal
    // overflow-y-auto region: whatever doesn't fit is reachable by
    // scrolling, no matter how extreme the zoom, and nothing can ever
    // silently overlap. The header and footer keep their own `sticky`
    // positioning purely as a convenience (visible without scrolling all the
    // way, in the common case where everything already fits) - not
    // load-bearing the way the old flex partition was, since `sticky` alone
    // never blocks reaching the rest of the scrollable content.
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Mobile-only slide-up entrance for the bottom sheet - the media
          query (matching Tailwind's own sm breakpoint) turns both
          animations off at sm and up, restoring the desktop dialog's
          original no-animation appearance exactly rather than also sliding
          it up from the bottom of the screen. */}
      <style>{`
        @keyframes scheduleFormOverlayIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scheduleFormSheetIn { from { opacity: 0; transform: translateY(100%) } to { opacity: 1; transform: translateY(0) } }
        .schedule-form-overlay { animation: scheduleFormOverlayIn 0.32s ease-out; }
        .schedule-form-sheet { animation: scheduleFormSheetIn 0.45s cubic-bezier(0.22, 1, 0.36, 1); }
        @media (min-width: 640px) {
          .schedule-form-overlay, .schedule-form-sheet { animation: none; }
        }
      `}</style>
      <div
        className="schedule-form-overlay absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        className="schedule-form-sheet relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >

        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 sm:py-4 border-b border-gray-100 bg-white">
          <div className="text-sm font-bold text-gray-900">{isEdit ? 'Edit Scheduled Inspection' : 'Schedule Inspection'}</div>
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

        <div className="px-5 py-3 sm:py-4 space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Customer</label>
              <div className="mt-1">
                <SearchableSelect
                  options={buyerOptions}
                  value={buyerFilter}
                  onChange={v => {
                    setBuyerFilter(v)
                    // Drop the picked PO if it no longer belongs to the
                    // newly-filtered customer, so the fields never disagree.
                    if (poId && v && !poOptions.some(o => o.value === poId && o.buyer === v)) {
                      setPoId(''); setSelectedLineItemIds(new Set()); setLineItemQuantities({})
                    }
                  }}
                  loading={poLoading}
                  placeholder="All customers"
                  triggerClassName="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-400 disabled:opacity-60"
                  dropdownClassName="rounded-lg border border-gray-200"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Vendor</label>
              <div className="mt-1">
                <SearchableSelect
                  options={vendorOptions}
                  value={vendorFilter}
                  onChange={v => {
                    setVendorFilter(v)
                    // Drop the picked PO if it no longer belongs to the
                    // newly-filtered vendor, so the fields never disagree.
                    if (poId && v && !poOptions.some(o => o.value === poId && o.vendor === v)) {
                      setPoId(''); setSelectedLineItemIds(new Set()); setLineItemQuantities({})
                    }
                  }}
                  loading={poLoading}
                  placeholder="All vendors"
                  triggerClassName="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-400 disabled:opacity-60"
                  dropdownClassName="rounded-lg border border-gray-200"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">PO Number</label>
            <div className="mt-1">
              <SearchableSelect
                options={visiblePoOptions}
                value={poId}
                onChange={v => {
                  setPoId(v)
                  setSelectedLineItemIds(new Set())
                  setLineItemQuantities({})
                  // Picking a PO directly (e.g. with Customer/Vendor still
                  // on "All") should fill in its own customer and vendor
                  // too, so the fields never disagree - the reverse of the
                  // Customer/Vendor fields' own drop-mismatched-PO behavior
                  // just above.
                  const picked = poOptions.find(o => o.value === v)
                  if (picked?.buyer) setBuyerFilter(picked.buyer)
                  if (picked?.vendor) setVendorFilter(picked.vendor)
                }}
                loading={poLoading}
                placeholder="Search PO number…"
                triggerClassName="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-400 disabled:opacity-60"
                dropdownClassName="rounded-lg border border-gray-200"
              />
            </div>
          </div>

          {poId && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  SKUs to Schedule
                  {!poLineItemsLoading && poLineItems.length > 0 && (
                    <span className="ml-1.5 normal-case font-medium text-gray-400">
                      ({selectedLineItemIds.size > 0 ? `${selectedLineItemIds.size} of ${poLineItems.length} selected` : `${poLineItems.length} open`})
                    </span>
                  )}
                </label>
                {poLineItems.length > 0 && (
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                      Pick
                      <input
                        type="number"
                        min={0}
                        max={poLineItems.length}
                        value={selectedLineItemIds.size}
                        onChange={e => applyLineItemCount(e.target.value)}
                        onWheel={e => e.currentTarget.blur()}
                        className="w-12 h-6 px-1.5 text-xs text-center border border-gray-200 rounded-md focus:outline-none focus:border-gray-900"
                      />
                      of {poLineItems.length}
                    </label>
                    {selectedLineItemIds.size > 0 && (
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                        Total Qty
                        <input
                          type="number"
                          min={0}
                          value={totalQuantity}
                          onChange={e => applyTotalQuantity(e.target.value)}
                          onWheel={e => e.currentTarget.blur()}
                          title="Redistributes evenly across checked SKUs"
                          className="w-14 h-6 px-1.5 text-xs text-center border border-gray-200 rounded-md focus:outline-none focus:border-gray-900"
                        />
                      </label>
                    )}
                    <button type="button" onClick={toggleAllLineItems} className="text-[11px] font-semibold text-gray-600 hover:text-gray-900 cursor-pointer">
                      {allLineItemsSelected ? 'Clear' : 'Select All'}
                    </button>
                  </div>
                )}
              </div>
              {poLineItemsLoading ? (
                <p className="text-[11px] text-gray-400">Loading SKUs…</p>
              ) : poLineItems.length === 0 ? (
                <p className="text-[11px] text-gray-400">No open SKUs on this PO.</p>
              ) : (
                <>
                  <input
                    type="text"
                    value={skuSearch}
                    onChange={e => setSkuSearch(e.target.value)}
                    placeholder="Search SKUs…"
                    className="w-full h-7 px-2 mb-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gray-900"
                  />
                  {/* max-h-56 was a flat 14rem regardless of how little
                      room the modal actually has left at a given zoom/
                      viewport - a vh-relative cap instead shrinks this
                      sub-list along with everything else instead of
                      insisting on the same fixed height no matter what. */}
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[40vh] overflow-y-auto">
                    {filteredLineItems.length === 0 && (
                      <p className="text-[11px] text-gray-400 px-3 py-2">No SKUs match "{skuSearch}".</p>
                    )}
                    {filteredLineItems.map(li => {
                      const checked = selectedLineItemIds.has(li.id)
                      const scheduledInfo = scheduledSkuInfo[li.id]
                      const scheduledDate = scheduledInfo?.date
                      const overdue = scheduledDate && scheduledDate < todayISO()
                      const isRescheduled = scheduledInfo?.entry?.created_by === 'System'
                      const rejectedDate = rejectedSkuInfo[li.id]
                      const acceptance = stageAcceptance[li.id]
                      // Informational only - a SKU already covered by another entry for
                      // this stage still shows the "Scheduled {date}" label, but stays
                      // fully selectable like any other row (e.g. to pick a new date).
                      const alreadyScheduled = !!scheduledDate
                      // Already submitted (and covered) for the currently-picked stage -
                      // see filteredLineItems' own comment above for why this no longer
                      // hides the row entirely (it needs to stay searchable/visible), but
                      // it's genuinely done - nothing left to schedule here, so unlike the
                      // other informational badges below this one also disables the row
                      // rather than leaving it selectable.
                      const alreadySubmitted = isDoneForStage(li)
                      // "Final required" ("Inline/Midline already accepted, only Final is
                      // left") reads as an instruction to act on this row - confusing
                      // sitting next to "Submitted" on a row that's already done and
                      // disabled, so it's suppressed there.
                      const finalRequired = !alreadySubmitted && stage === 'final' && acceptance?.inline?.accepted && acceptance?.midline?.accepted
                      return (
                        <div key={li.id} className={`flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 ${alreadySubmitted ? 'opacity-60' : ''}`}>
                          <label className={`flex items-center gap-2 flex-1 min-w-0 ${alreadySubmitted ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={alreadySubmitted}
                              onChange={() => toggleLineItem(li)}
                              className="w-3.5 h-3.5 flex-shrink-0 disabled:cursor-not-allowed"
                            />
                            <span className="font-semibold truncate text-gray-800">{li.buyer_sku_ref || '-'}</span>
                            {li.sku_variant && <span className="text-gray-400 truncate">{li.sku_variant}</span>}
                            {/* Round 2+ at this stage (a rework reopening it, a
                                leftover-quantity re-inspection, etc.) - worth
                                surfacing here since it's otherwise invisible
                                until the scheduler opens the SKU itself. */}
                            {acceptance?.[stage]?.round > 1 && (
                              <span
                                title={`This SKU is on round ${acceptance[stage].round} of ${STAGES.find(s => s.value === stage)?.label || stage}`}
                                className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 bg-violet-50 text-violet-700"
                              >
                                Round {acceptance[stage].round}
                              </span>
                            )}
                            {finalRequired && (
                              <span
                                title="Inline and Midline are already accepted - this SKU only needs Final"
                                className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 bg-blue-50 text-blue-700"
                              >
                                Final required
                              </span>
                            )}
                            {alreadyScheduled && (
                              <span
                                title={`${isRescheduled ? 'Automatically rescheduled' : 'Already scheduled'} for ${STAGES.find(s => s.value === stage)?.label || stage} on ${fmtScheduledDate(scheduledDate)}`}
                                className={`ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0
                                  ${overdue ? 'bg-red-50 text-red-700' : isRescheduled ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}
                              >
                                {isRescheduled ? 'Rescheduled' : 'Scheduled'} {fmtScheduledDate(scheduledDate)}
                              </span>
                            )}
                            {!alreadyScheduled && rejectedDate && (
                              <span
                                title={`Most recent ${STAGES.find(s => s.value === stage)?.label || stage} attempt was rejected on ${fmtScheduledDate(rejectedDate)} - selectable for a new schedule`}
                                className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 bg-red-50 text-red-700"
                              >
                                Rejected {fmtScheduledDate(rejectedDate)}
                              </span>
                            )}
                            {alreadySubmitted && (
                              <span
                                title={`Already submitted and fully covered for ${STAGES.find(s => s.value === stage)?.label || stage} - nothing left to schedule`}
                                className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 bg-gray-100 text-gray-500"
                              >
                                Submitted
                              </span>
                            )}
                          </label>
                          {checked && (
                            <input
                              type="number"
                              min={0}
                              max={remainingForLineItem(li, stage, fulfillmentReports) || undefined}
                              value={lineItemQuantities[li.id] ?? ''}
                              onChange={e => setLineItemQuantities(prev => ({ ...prev, [li.id]: clampQuantity(e.target.value, remainingForLineItem(li, stage, fulfillmentReports)) }))}
                              onWheel={e => e.currentTarget.blur()}
                              title="Quantity to inspect"
                              className="w-14 flex-shrink-0 text-xs px-1.5 py-1 text-right border border-gray-200 rounded-md focus:outline-none focus:border-gray-900"
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {selectedLineItemIds.size === 0 && (
                    <p className="text-[10px] text-gray-400 mt-1">Leave all unchecked to schedule the whole PO.</p>
                  )}
                </>
              )}
            </div>
          )}

          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Stage</label>
            <select
              value={stage}
              onChange={e => setStage(e.target.value)}
              className="mt-1 w-full h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-900 cursor-pointer"
            >
              {availableStages.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="mt-1 w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Time (optional)</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="mt-1 w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Assigned QA</label>
            <div className="mt-1">
              <SearchableSelect
                options={qaOptions}
                value={qaId}
                onChange={setQaId}
                loading={qaLoading}
                placeholder="Select QA…"
                triggerClassName="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-400"
                dropdownClassName="rounded-lg border border-gray-200"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-2 px-5 py-3 sm:py-4 border-t border-gray-100 bg-white">
          <div className="text-[11px] text-gray-400 flex flex-col gap-0.5">
            {isEdit ? (
              <>
                {lastEdited?.created_by && (
                  <span>Created by <span className="font-semibold text-gray-600">{lastEdited.created_by}</span>, {fmtDateTime(lastEdited.created_at)}</span>
                )}
                {lastEdited?.updated_by && (
                  <span>Modified by <span className="font-semibold text-gray-600">{lastEdited.updated_by}</span>, {fmtDateTime(lastEdited.updated_at)}</span>
                )}
              </>
            ) : (
              poLastActivity?.by && (
                <span>Last edited by <span className="font-semibold text-gray-600">{poLastActivity.by}</span>, {fmtDateTime(poLastActivity.at)}</span>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40 transition-colors cursor-pointer"
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Schedule'}
          </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  )
}
