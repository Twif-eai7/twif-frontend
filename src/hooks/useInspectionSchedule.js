import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ACCEPTED_RESULTS } from '../components/qualityCompliance/inspectionReport/stageStatus'

// Local copy, not imported from QcReportsSummary.jsx - same "each file keeps
// its own tiny copy rather than cross-importing" convention that file
// already follows for its own STAGE_ORDER.
const STAGE_ORDER = { inline: 0, midline: 1, final: 2 }

// Fetches every page of a query via keyset (cursor) pagination - same
// helper (and same reasoning) as QcReportsSummary.jsx's own fetchAllPages,
// duplicated here rather than imported since that file doesn't export it.
// .order('id') on the caller's query is mandatory - it's both what makes
// pagination deterministic (see that file's own comment for the row-loss
// bug an unordered query caused) and what a keyset page's own `.gt('id',
// cursor)` filter depends on to return a correct next slice. Was OFFSET-
// based (.range()) and fired several pages concurrently for speed; switched
// to sequential keyset pagination after that OFFSET approach was found live
// to start missing the database's own statement timeout on deep pages once
// a table's matching row count grew large enough (reproduced: failed past
// ~13,000 rows, whereas keyset pagination stayed fast through 51,000+) -
// see QcReportsSummary.jsx's own copy for the full story.
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

// A schedule-restricted manager (see ownScheduleRestrictionEmail in
// utils/inspectionScheduleAccess.js) is meant to be hidden from a
// colleague's own manually-created schedules, not from the system's own
// automatic follow-up entries (created_by: 'System', no created_by_email -
// see InspectionForm.jsx's auto-reschedule-on-rejection) for their own PO's
// activity. Widening rather than narrowing: every existing restricted
// query still excludes other managers' entries exactly as before, it just
// stops also hiding System-generated ones.
// restrictToMemberId (optional) additionally widens this to entries
// assigned to that person as QA, even when someone else scheduled it - a
// named manager is also a working QA in practice, and being scoped to only
// what they personally created was hiding POs genuinely assigned to them
// (e.g. scheduled by a colleague, assigned_qa_id pointing at this manager).
function applyScheduleRestriction(q, restrictToEmail, restrictToMemberId) {
  if (!restrictToEmail) return q
  const clauses = [`created_by_email.ilike.${restrictToEmail}`, `created_by.eq.System`]
  if (restrictToMemberId) clauses.push(`assigned_qa_id.eq.${restrictToMemberId}`)
  return q.or(clauses.join(','))
}

// restrictToEmail (optional) - when set, scopes results to schedule entries
// created_by_email matches (see ownScheduleRestrictionEmail in
// utils/inspectionScheduleAccess.js), OR assigned to restrictToMemberId.
// Omitted/null keeps today's behavior - every existing caller is unaffected.
export function useInspectionSchedules(monthStart, monthEnd, restrictToEmail, restrictToMemberId) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!monthStart || !monthEnd) return
    setLoading(true)
    setError(null)
    let q = supabase
      .from('inspection_schedules')
      .select(`
        id, po_id, inspection_type, scheduled_date, scheduled_time, assigned_qa_id, status, notes, line_items, created_by, created_by_email, created_at,
        purchase_orders(
          po_number,
          buyer_supplier_links!inner(
            buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(display_name),
            supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(display_name, state, country)
          ),
          po_line_items(id, status, quantity_ordered, inspection_reports(inspection_type, status, inspection_result, accepted_quantity, fulfilled_schedule_id))
        ),
        organization_members!assigned_qa_id(full_name)
      `)
      // 'cancelled' entries are historical only - nothing in the app creates
      // one anymore, so this calendar excludes them outright instead of
      // giving them their own status bucket.
      .neq('status', 'cancelled')
      .gte('scheduled_date', monthStart)
      .lte('scheduled_date', monthEnd)
      // Chronological by date first (that's what makes a calendar/agenda
      // readable at all) - within the same date, most-recently-created
      // entry first, so a freshly added/auto-booked schedule surfaces at
      // the top of that day's list instead of wherever it landed relative
      // to whatever else already existed for that date.
      .order('scheduled_date')
      .order('created_at', { ascending: false })
    q = applyScheduleRestriction(q, restrictToEmail, restrictToMemberId)
    const { data, error: err } = await q
    if (err) setError(err.message)
    else setEntries(data ?? [])
    setLoading(false)
  }, [monthStart, monthEnd, restrictToEmail, restrictToMemberId])

  useEffect(() => { load() }, [load])

  return { entries, loading, error, refresh: load }
}

// "SKUs to Inspect" — how many SKUs still don't have this entry's stage
// satisfied. Scoped to open line items only (matches the rest of the app's
// convention that only active/open SKUs count as inspection work), further
// scoped to `line_items` when the entry was scheduled against a specific SKU
// subset rather than the whole PO, and always scoped to this entry's own
// stage — a SKU already done for Inline still counts as remaining work on a
// Midline-scheduled entry. "Satisfied" needs more than a submitted report:
// a report that fulfilled this exact entry but came in short (partial accept
// or reject) still leaves this entry's SKU outstanding — the shortfall lives
// on as its own new entry instead (see InspectionForm.jsx's submit handler).
// accepted_quantity is only ever compared when it's actually recorded - many
// reports (older ones, or accepted via a flow that never asked for a split
// quantity) legitimately have it as null despite a genuine accepted verdict,
// and treating null as "0 accepted" made those entries read as permanently
// outstanding even though nothing further is expected of them.
export function remainingSkusForEntry(entry) {
  const lineItems = entry?.purchase_orders?.po_line_items ?? []
  const scopedIds = entry?.line_items?.map(x => x.id)
  const scoped = scopedIds?.length ? lineItems.filter(li => scopedIds.includes(li.id)) : lineItems
  const open = scoped.filter(li => li.status?.toLowerCase() === 'open')
  return open.filter(li => {
    const qty = entry.line_items?.find(x => x.id === li.id)?.quantity ?? li.quantity_ordered
    const satisfied = li.inspection_reports?.some(r =>
      r.inspection_type === entry.inspection_type && r.status === 'submitted' && r.fulfilled_schedule_id === entry.id &&
      (r.accepted_quantity != null ? Number(r.accepted_quantity) >= qty : ACCEPTED_RESULTS.includes(r.inspection_result))
    )
    return !satisfied
  }).length
}

// The calendars' single three-state display status - 'scheduled' (no report
// activity at all yet for this entry's scope), 'processing' (a report row
// exists, tied to this entry, but remainingSkusForEntry isn't 0 yet - covers
// drafts in progress and rejected rounds still awaiting re-inspection alike),
// or 'completed' (remainingSkusForEntry === 0). Deliberately no separate
// rejected/cancelled bucket: a rejection just means the SKU stays
// "processing" until its next round is satisfied, and 'cancelled' entries
// are excluded from the fetch entirely (see the .neq filter above - nothing
// creates one anymore, so there's nothing left to bucket).
export function getScheduleStatus(entry) {
  if (remainingSkusForEntry(entry) === 0) return 'completed'
  const lineItems = entry?.purchase_orders?.po_line_items ?? []
  const scopedIds = entry?.line_items?.map(x => x.id)
  const scoped = scopedIds?.length ? lineItems.filter(li => scopedIds.includes(li.id)) : lineItems
  const started = scoped.some(li => li.inspection_reports?.some(r =>
    r.inspection_type === entry.inspection_type && r.fulfilled_schedule_id === entry.id
  ))
  return started ? 'processing' : 'scheduled'
}

// A handful of data-correction batches (backfilled POs with leftover/never-
// presented quantity that never went through the live scheduling flow) had
// to set a real assigned_qa_id anyway - the column is NOT NULL and there is
// no genuine "unassigned" value - so they used a real person as a stand-in,
// tagged unambiguously via this notes prefix, precisely so the UI can tell
// "a real person was actually assigned" apart from "a placeholder had to go
// somewhere." Callers use this to keep Inspector Name/Assigned QA blank for
// these until a lead genuinely reassigns the entry (at which point a fresh,
// real notes value - or a schedule update - naturally stops matching this).
export function isPlaceholderAssignment(entry) {
  return !!entry?.notes?.startsWith('Auto-scheduled (backfill')
}

export async function createSchedule(payload) {
  return supabase.from('inspection_schedules').insert(payload).select().single()
}

export async function updateSchedule(id, changes) {
  return supabase.from('inspection_schedules').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id)
}

export async function updateScheduleStatus(id, status, notes) {
  const changes = { status, updated_at: new Date().toISOString() }
  if (notes !== undefined) changes.notes = notes
  return supabase.from('inspection_schedules').update(changes).eq('id', id)
}

// Hard delete, removes the row entirely, unlike updateScheduleStatus's
// 'cancelled' which keeps it around as history. Irreversible; callers must
// confirm with the user first.
export async function deleteSchedule(id) {
  return supabase.from('inspection_schedules').delete().eq('id', id)
}

// Books (or merges into) a follow-up schedule entry for a leftover quantity.
// Standalone/component-free version of what used to live only as a closure
// inside InspectionForm.jsx's own `bookFollowUpSchedule` - extracted so both
// that component (the online, in-person submit path) and offlineSync.js's
// attemptSyncSubmit (the offline replay path, run with no InspectionForm
// mounted - see ReconnectSyncScreen.jsx) can call the exact same logic
// instead of two copies drifting apart. Returns the resolved schedule entry
// id (or null on failure) for the caller to link into startReInspection's
// fulfilled_schedule_id.
//
// Two SKUs on the same PO can each need a follow-up booked around the same
// moment - most plausibly right after reconnecting, when InspectionForm.jsx's
// own background-sync effect (for whichever SKU's wizard happens to still be
// open) and ReconnectSyncScreen.jsx's runSync (sweeping every other queued
// SKU) run independently. Both read "does an entry already exist for this
// PO/stage/date" before either writes - a genuine TOCTOU race with no DB
// constraint backing the decision, since po_id/inspection_type/scheduled_date
// isn't unique on inspection_schedules. Guarded by a module-level promise
// CHAIN per key (NOT a shared/reused result - each caller has its own
// lineItemId/followUpQty that genuinely needs its own merge applied, so
// short-circuiting a second call straight to the first call's result would
// silently drop that SKU from the entry's line_items): a call for a key
// already in flight is queued behind the one ahead of it, so each one's own
// read-then-write runs against the state the previous one already
// committed, instead of racing it. Fully closes the race for calls made in
// this tab, which covers both triggers above since they share this one
// module instance.
const bookingQueue = new Map()
export function bookFollowUpSchedule(args) {
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const key = `${args.poId}|${args.inspectionType}|${today}`
  const ahead = bookingQueue.get(key) ?? Promise.resolve()
  const run = ahead.catch(() => {}).then(() => bookFollowUpScheduleInner(args, today))
  // Swallow this call's own rejection in the tracked tail (not in what's
  // returned to the actual caller below) - a failed booking must not
  // permanently wedge every later call for this same PO/stage/date behind a
  // rejected promise.
  bookingQueue.set(key, run.catch(() => {}))
  return run
}

async function bookFollowUpScheduleInner({
  poId, inspectionType, lineItemId, followUpQty, remaining, neverInspected, acceptedQty, rejected,
  activeEntryScheduledQty, quantityOrdered, assignedQaId,
}, today) {
  // `today` (local date, not UTC - matches the scheduling convention used
  // everywhere else a "today" gets written as a scheduled_date) is computed
  // once by the exported wrapper above, both to build its own in-flight key
  // and to pass down here, rather than being recomputed - a call that
  // starts just before local midnight and resolves just after would
  // otherwise use a different "today" for its own key than for the entry it
  // actually books.
  // Merge into an already-existing entry for this exact PO/stage/date
  // (e.g. one someone scheduled by hand, or a prior SKU's own auto-reschedule
  // from this same batch) instead of creating a second entry that would just
  // duplicate the same row in the Scheduled POs table.
  const { entries: poEntries } = await fetchPoScheduleEntries(poId)
  const existingEntry = poEntries.find(e =>
    e.status !== 'cancelled' && e.inspection_type === inspectionType && e.scheduled_date === today
  )
  const noteParts = []
  if (remaining > 0) {
    noteParts.push(rejected
      ? `Final rejected, ${remaining} to re-inspect.`
      : `${acceptedQty} of ${activeEntryScheduledQty ?? '?'} accepted, ${remaining} remaining.`)
  }
  if (neverInspected > 0) {
    noteParts.push(`${neverInspected} of ${quantityOrdered ?? '?'} never presented for inspection.`)
  }
  const notes = `Auto-scheduled: ${noteParts.join(' ')}`
  if (existingEntry) {
    // A null line_items entry already means "every open SKU" - this SKU is
    // already covered, nothing to add. Otherwise fold it into the existing
    // list, replacing any stale entry for this SKU.
    const nextLineItems = existingEntry.line_items?.length
      ? [...existingEntry.line_items.filter(li => li.id !== lineItemId), { id: lineItemId, quantity: followUpQty }]
      : null
    const { error: mergeError } = await updateSchedule(existingEntry.id, { line_items: nextLineItems })
    if (mergeError) { console.error('[bookFollowUpSchedule] merge failed:', mergeError.message); return null }
    return existingEntry.id
  }
  const { data: newEntry, error: scheduleError } = await createSchedule({
    po_id: poId,
    inspection_type: inspectionType,
    scheduled_date: today,
    // No covering entry to inherit an assignee from when the whole
    // follow-up is "neverInspected" (the exact no-entry-at-all case this was
    // built for) - inspection_schedules.assigned_qa_id is NOT NULL, so fall
    // back to whoever is submitting/syncing right now; a lead can reassign
    // it from the Scheduled POs list same as any other entry.
    assigned_qa_id: assignedQaId,
    line_items: [{ id: lineItemId, quantity: followUpQty }],
    notes,
    created_by: 'System',
  })
  if (scheduleError) { console.error('[bookFollowUpSchedule] create failed:', scheduleError.message); return null }
  return newEntry?.id ?? null
}

// PO Inspection's "Scheduled POs" restriction — every PO ever scheduled, any
// status, so a PO stays visible for the whole lifecycle of an assignment
// rather than disappearing once it's completed/cancelled. Pass a memberId to
// scope to one person's own assignments (regular QA/tech); pass null/undefined
// for Admins/Owners, who see everything anyone has been scheduled for.
export async function fetchScheduledPoIds(memberId) {
  let q = supabase.from('inspection_schedules').select('po_id')
  if (memberId) q = q.eq('assigned_qa_id', memberId)
  const { data, error } = await q
  if (error) return { poIds: [], error }
  return { poIds: [...new Set((data ?? []).map(r => r.po_id))], error: null }
}

// Same as fetchScheduledPoIds above, but scoped to who *scheduled* the entry
// (created_by_email) rather than who it's assigned to - the mechanism the 5
// named INSPECTION_SCHEDULE_MANAGER_EMAILS people are restricted by (see
// ownScheduleRestrictionEmail in utils/inspectionScheduleAccess.js).
export async function fetchScheduledPoIdsByCreator(email, memberId) {
  const q = applyScheduleRestriction(supabase.from('inspection_schedules').select('po_id'), email, memberId)
  const { data, error } = await q
  if (error) return { poIds: [], error }
  return { poIds: [...new Set((data ?? []).map(r => r.po_id))], error: null }
}

// PO Inspection's view of what was planned for a PO — every schedule entry
// regardless of who it's assigned to, so the SKU/quantity context shows up
// for anyone inspecting the PO, not just the assignee. restrictToEmail
// (optional) narrows this further to entries that person created, for the 5
// named schedule managers who shouldn't see a colleague's entries even on a
// PO they're both allowed to open.
export async function fetchPoScheduleEntries(poId, restrictToEmail, restrictToMemberId) {
  let q = supabase
    .from('inspection_schedules')
    .select('id, inspection_type, scheduled_date, status, line_items, assigned_qa_id, created_by, created_by_email, created_at, updated_by, updated_at, notes, organization_members!assigned_qa_id(full_name)')
    .eq('po_id', poId)
  q = applyScheduleRestriction(q, restrictToEmail, restrictToMemberId)
  const { data, error } = await q
  return { entries: data ?? [], error }
}

// Bulk counterpart to fetchPoScheduleEntries, above - identical column
// shape (so its output is a drop-in per-PO `entries` array, exactly what
// cachedPoDetail.scheduleEntries already stores from the single-PO path),
// just across a whole batch of PO ids in one request instead of one PO at
// a time. Used by the "Download for Offline" bulk-prefetch flow
// (PoInspectionComments.jsx) - NOT the same as fetchPoScheduleEntriesForPos
// below, which has a different (thinner, overview-table-shaped) column
// list and would silently produce the wrong cachedPoDetail shape if reused
// here. Callers are expected to chunk `poIds` themselves.
export async function fetchPoScheduleEntriesBulkForPos(poIds, restrictToEmail, restrictToMemberId) {
  if (!poIds?.length) return { entriesByPo: {}, error: null }
  let q = supabase
    .from('inspection_schedules')
    .select('id, po_id, inspection_type, scheduled_date, status, line_items, assigned_qa_id, created_by, created_by_email, created_at, updated_by, updated_at, organization_members!assigned_qa_id(full_name)')
    .in('po_id', poIds)
  q = applyScheduleRestriction(q, restrictToEmail, restrictToMemberId)
  const { data, error } = await q
  if (error) return { entriesByPo: {}, error }
  const entriesByPo = {}
  for (const e of data ?? []) (entriesByPo[e.po_id] ??= []).push(e)
  return { entriesByPo, error: null }
}

// PO Inspection's "Scheduled POs" overview (KPI tiles + table shown when no
// PO is selected) - every schedule entry for a whole batch of POs at once,
// with the assigned QA's name joined in for display. Unlike
// fetchPoScheduleEntries (one PO, no QA name), this covers a whole PO list's
// schedule info in a single round trip, modeled on useInspectionSchedules'
// organization_members!assigned_qa_id join but filtered by po_id membership
// instead of a date range. Left unfiltered by status (same convention as
// fetchScheduledPoIds/fetchPoScheduleEntries above) - cancelled entries are
// filtered out by the caller. The po_line_items(...inspection_reports...)
// join mirrors useInspectionSchedules' own shape - it's what
// isEntryOutstanding/remainingSkusForEntry below need to tell "still open
// work" apart from an entry that's already been fully inspected+accepted,
// and (via inspection_result) what the overview table's Accepted SKUs
// column counts.
export async function fetchPoScheduleEntriesForPos(poIds, restrictToEmail, restrictToMemberId) {
  if (!poIds?.length) return { entriesByPo: {}, error: null }
  let q = supabase
    .from('inspection_schedules')
    .select(`
      id, po_id, inspection_type, scheduled_date, status, line_items, created_by, created_by_email, created_at, assigned_qa_id, notes,
      organization_members!assigned_qa_id(full_name),
      purchase_orders(
        po_number,
        buyer_supplier_links(
          buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(display_name),
          supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(display_name)
        ),
        po_line_items(id, status, quantity_ordered, inspection_reports(inspection_type, status, inspection_result, accepted_quantity, fulfilled_schedule_id))
      )
    `)
    .in('po_id', poIds)
    .order('scheduled_date')
  q = applyScheduleRestriction(q, restrictToEmail, restrictToMemberId)
  const { data, error } = await q
  if (error) return { entriesByPo: {}, error }
  const entriesByPo = {}
  for (const e of data ?? []) (entriesByPo[e.po_id] ??= []).push(e)
  return { entriesByPo, error: null }
}

// Lightweight companion to fetchBackfilledPoSummaries below - just the
// distinct po_id set, no nested po_line_items/inspection_reports join. The
// "Scheduled POs" list itself (fetchPos in PoInspectionComments.jsx, which
// this feeds) is built from a poIds allowlist for restricted/admin users -
// a backfilled-only PO (zero real inspection_schedules rows) was previously
// excluded from that allowlist before it ever reached the table, so the
// table-level merge in fetchBackfilledPoSummaries's consumer was dead code
// for it. This id set widens that allowlist instead. Kept separate (not
// derived from fetchBackfilledPoSummaries's own keys) so callers that only
// need ids - fetched once, cheaply, and reused across every search
// keystroke - don't pay for the full per-PO report/line-item join every
// time this ID set is needed, only when the actual summary display data is.
export async function fetchBackfilledPoIds() {
  const { data, error } = await fetchAllPages(() => supabase
    .from('inspection_reports')
    .select('id, po_line_items!inner(po_id)')
    .eq('created_by', 'backfill-script')
    .order('id')
  )
  if (error) return { poIds: [], error }
  return { poIds: [...new Set(data.map(r => r.po_line_items?.po_id).filter(Boolean))], error: null }
}

// A one-time historical import ("backfill-script", ~20,000 inspection_reports
// rows) wrote fully submitted/accepted reports directly, but never created a
// matching inspection_schedules row for any of them - so every PO it touched
// (~930 of them, ~800 with literally zero schedule entries of any kind) is
// invisible on the "Scheduled POs" table above, even though it's genuinely,
// completely inspected. This powers that table also surfacing those POs.
//
// Deliberately NOT scoped by po_id/poIds like fetchPoScheduleEntriesForPos
// above - PostgREST's embedded-relation filtering (`.in('po_line_items.po_id', ...)`)
// is easy to get subtly wrong (silently returns the wrong rows rather than
// erroring), and the whole backfill-script batch is small enough (~20k rows)
// to fetch and group client-side once, unscoped, same as QcReportsSummary.jsx's
// own wide trend queries. Paginated with fetchAllPages/.order('id') - this
// table already had one real bug from skipping that (see QcReportsSummary.jsx).
export async function fetchBackfilledPoSummaries() {
  const { data, error } = await fetchAllPages(() => supabase
    .from('inspection_reports')
    .select(`
      id, inspection_type, status, inspection_result, inspector_name, submitted_at, accepted_quantity, fulfilled_schedule_id,
      po_line_items!inner(id, po_id, status, quantity_ordered)
    `)
    .eq('created_by', 'backfill-script')
    .order('id')
  )
  if (error) return { summariesByPo: {}, error }

  // Two passes per PO: every report grouped for furthest-stage selection
  // below, and every distinct line item (deduped, its own reports attached)
  // in the exact { id, status, quantity_ordered, inspection_reports } shape
  // ScheduledPoRow's poWideAcceptedCount already expects off a real entry's
  // purchase_orders.po_line_items - so that cell needs zero extra branching
  // for a backfilled row beyond the isBackfilled fallback already planned.
  const reportsByPo = {}
  const lineItemsByPo = {} // po_id -> Map(line_item_id -> line item w/ nested reports)
  for (const r of data) {
    const poId = r.po_line_items?.po_id
    if (!poId) continue
    ;(reportsByPo[poId] ??= []).push(r)
    const liMap = (lineItemsByPo[poId] ??= new Map())
    const liId = r.po_line_items.id
    if (!liMap.has(liId)) {
      liMap.set(liId, {
        id: liId, status: r.po_line_items.status, quantity_ordered: r.po_line_items.quantity_ordered,
        inspection_reports: [],
      })
    }
    liMap.get(liId).inspection_reports.push({
      inspection_type: r.inspection_type, status: r.status, inspection_result: r.inspection_result,
      accepted_quantity: r.accepted_quantity, fulfilled_schedule_id: r.fulfilled_schedule_id,
    })
  }

  const summariesByPo = {}
  for (const poId of Object.keys(reportsByPo)) {
    // Furthest-along stage per PO (Final beats Midline beats Inline), tied
    // by latest submitted_at - same convention the real-entry overview
    // table already uses to pick one representative entry per PO.
    let best = null
    for (const r of reportsByPo[poId]) {
      const order = STAGE_ORDER[r.inspection_type] ?? -1
      const bestOrder = best ? (STAGE_ORDER[best.inspection_type] ?? -1) : -1
      if (!best || order > bestOrder || (order === bestOrder && r.submitted_at > best.submitted_at)) best = r
    }
    summariesByPo[poId] = {
      inspection_type: best.inspection_type,
      submitted_at: best.submitted_at,
      inspector_name: best.inspector_name,
      po_line_items: [...lineItemsByPo[poId].values()],
    }
  }
  return { summariesByPo, error: null }
}

// True when a schedule entry still represents real outstanding work - not
// cancelled, and not already fully satisfied (remainingSkusForEntry > 0).
// Matches InspectionSchedule.jsx's own effectiveStatus()==='scheduled' rule
// (an entry with 0 SKUs remaining reads as "completed" there, same idea),
// so a "POs/SKUs scheduled" count built from this lines up with that page's
// instead of also counting work that's already been fully inspected.
export function isEntryOutstanding(entry) {
  return entry.status !== 'cancelled' && remainingSkusForEntry(entry) > 0
}

// The single canonical "POs Scheduled / SKUs Scheduled" totals -
// InspectionSchedule.jsx, QcReportsSummary.jsx, and PoInspectionComments.jsx's
// top KPI tiles all call this same function instead of each deriving their
// own variant, so the three numbers can't drift apart. All-time (no
// scheduled_date range - unlike each page's own calendar/period view, which
// stays independently scoped) and unrestricted by assignee by default,
// matching InspectionSchedule.jsx's own always-everyone convention.
// restrictToEmail (optional) breaks that shared-number invariant on purpose,
// for the 5 named schedule managers who should only see totals for what they
// personally scheduled - everyone else keeps calling this with no argument.
export async function fetchScheduledOverviewStats(restrictToEmail, restrictToMemberId) {
  const { poIds, error: idsError } = restrictToEmail
    ? await fetchScheduledPoIdsByCreator(restrictToEmail, restrictToMemberId)
    : await fetchScheduledPoIds(null)
  if (idsError || !poIds.length) return { totalPos: 0, totalSkus: 0, poDates: [], error: idsError }
  const { entriesByPo, error } = await fetchPoScheduleEntriesForPos(poIds, restrictToEmail, restrictToMemberId)
  if (error) return { totalPos: 0, totalSkus: 0, poDates: [], error }
  const skuIds = new Set()
  const outstandingPoIds = new Set()
  // po_number -> earliest still-outstanding scheduled date, for the "POs
  // Scheduled" tile's hover popover - a PO can have several open entries
  // across stages/dates, so the nearest one is the most useful to surface.
  const poDatesByNumber = new Map()
  for (const [poId, entries] of Object.entries(entriesByPo)) {
    for (const e of entries) {
      if (!isEntryOutstanding(e)) continue
      outstandingPoIds.add(poId)
      const poNumber = e.purchase_orders?.po_number
      if (poNumber) {
        const current = poDatesByNumber.get(poNumber)
        if (!current || e.scheduled_date < current) poDatesByNumber.set(poNumber, e.scheduled_date)
      }
      for (const li of e.line_items || []) if (li?.id) skuIds.add(li.id)
    }
  }
  const poDates = [...poDatesByNumber.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([poNumber, date]) => ({ poNumber, date }))
  return { totalPos: outstandingPoIds.size, totalSkus: skuIds.size, poDates, error: null }
}
