import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { setCachedSkuMasterMany, getCachedSkuMasterMany } from '../lib/offlineDrafts'
import { PLAN_OFFLINE_ENABLED } from '../lib/planOffline'
import { withSortedPhotos } from '../lib/photoSequence'
import { roundAcceptedQty } from '../components/qualityCompliance/inspectionReport/stageBalance'

// One row per (po_line_item_id, inspection_type) — each SKU has up to 3 fixed
// stages: inline, midline, final.
export function useInspectionReportsForPo(po) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const lineItemIds = (po?.po_line_items ?? []).map(li => li.id)
  const key = lineItemIds.join(',')

  const load = useCallback(async () => {
    if (!lineItemIds.length) { setReports([]); setLoading(false); return }
    setLoading(true)
    setError(null)
    // Fast-fail instead of letting the request hang against a dead network -
    // PoInspectionComments.jsx's own cachedPoDetail fallback (see its derived
    // `inspectionReports`) only kicks in once `error` is set, so leaving this
    // to time out on its own left the offline UI stuck on a spinner for a
    // long time even though the cached data was sitting right there.
    if (!navigator.onLine) { setError('offline'); setLoading(false); return }
    const { data, error: err } = await supabase
      .from('inspection_reports')
      .select('*, inspection_report_defects(*), inspection_report_photos(*)')
      .in('po_line_item_id', lineItemIds)
      .order('created_at', { ascending: false })
      // Without this, embedded inspection_report_photos come back in
      // whatever order Postgres happens to return them - not upload order -
      // so the Digitals grid could reshuffle on every refetch. Oldest first
      // matches "first uploaded should be on first".
      .order('created_at', { ascending: true, foreignTable: 'inspection_report_photos' })
    if (err) setError(err.message)
    else setReports((data ?? []).map(withSortedPhotos))
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => { load() }, [load])

  return { reports, loading, error, refresh: load }
}

// Bulk counterpart to useInspectionReportsForPo, above - same query shape
// (full report row + defects + photos), but across every SKU from every PO
// in a whole list at once, for the "Download for Offline" bulk-prefetch
// flow (PoInspectionComments.jsx). Callers are expected to chunk
// `lineItemIds` themselves (a few hundred at a time) rather than pass all
// of a large PO list's line items in one call - this function itself makes
// exactly one request per call, no chunking here.
export async function fetchInspectionReportsForLineItems(lineItemIds) {
  if (!lineItemIds?.length) return { reports: [], error: null }
  const { data, error } = await supabase
    .from('inspection_reports')
    .select('*, inspection_report_defects(*), inspection_report_photos(*)')
    .in('po_line_item_id', lineItemIds)
    .order('created_at', { ascending: false })
    .order('created_at', { ascending: true, foreignTable: 'inspection_report_photos' })
  return { reports: (data ?? []).map(withSortedPhotos), error }
}

export function useInspectionReportDetail(id) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const load = useCallback(async () => {
    if (!id) { setReport(null); setLoading(false); return }
    setLoading(true)
    setError(null)
    if (!navigator.onLine) { setError('offline'); setLoading(false); return }
    const { data, error: err } = await supabase
      .from('inspection_reports')
      .select('*, inspection_report_defects(*), inspection_report_photos(*)')
      .eq('id', id)
      .order('created_at', { ascending: true, foreignTable: 'inspection_report_photos' })
      .single()
    if (err) setError(err.message)
    else setReport(withSortedPhotos(data))
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  return { report, loading, error, refresh: load }
}

// Combined per-SKU activity timeline: every lifecycle event (draft saved,
// submitted, edited, re-inspection started) across all 3 stages and all
// rounds for one po_line_item_id, newest first.
export function useInspectionReportLogsForLineItem(lineItemId) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!lineItemId) { setLogs([]); setLoading(false); return }
    setLoading(true)
    if (!navigator.onLine) { setLoading(false); return } // no offline cache for this timeline - just stop spinning, keep whatever was last loaded
    const { data, error } = await supabase
      .from('inspection_report_logs')
      .select('*')
      .eq('po_line_item_id', lineItemId)
      .order('created_at', { ascending: false })
    if (!error) setLogs(data ?? [])
    setLoading(false)
  }, [lineItemId])

  useEffect(() => { load() }, [load])

  return { logs, loading, refresh: load }
}

// Given po_line_items' sku_ids, fetches the product master record (dimensions,
// materials, barcodes, category) that the form/PDF derive fields from instead
// of duplicating them onto inspection_reports.
// One-shot bulk counterpart to useSkuMasterData's own query, for the
// "Download for Offline" bulk-prefetch flow (PoInspectionComments.jsx) -
// callers chunk `skuIds` themselves and write through via
// setCachedSkuMasterMany, same as useSkuMasterData's own online path does.
export async function fetchSkuMasterForIds(skuIds) {
  if (!skuIds?.length) return { skus: [], error: null }
  const { data, error } = await supabase
    .from('skus')
    .select(`
      *, categories(name, level_name, parent_id),
      primary_material:material_options!primary_base_material_id(label),
      secondary_material:material_options!secondary_base_material_id(label)
    `)
    .in('id', skuIds)
  return { skus: data ?? [], error }
}

export function useSkuMasterData(skuIds) {
  const [byId, setById]     = useState({})
  const [loading, setLoading] = useState(true)

  const ids = [...new Set((skuIds ?? []).filter(Boolean))]
  const key = ids.join(',')

  useEffect(() => {
    let cancelled = false
    if (!ids.length) { setById({}); setLoading(false); return }
    setLoading(true)
    // Offline (or a genuinely failed fetch) - read whatever was cached the
    // last time this SKU loaded successfully online, instead of hanging
    // against a dead network with nothing to show. This is the one data
    // dependency of the Inline/Midline/Final steps that cachedPoDetail never
    // covered (it's keyed by sku id, not by PO/report), so it needed its own
    // small IndexedDB store (see setCachedSkuMasterMany/getCachedSkuMasterMany
    // in offlineDrafts.js).
    const serveFromCache = () => {
      // PLAN OFFLINE (disabled): no cached SKU master - nothing to serve.
      if (!PLAN_OFFLINE_ENABLED) { setById({}); setLoading(false); return }
      getCachedSkuMasterMany(ids).then(rows => {
        if (cancelled) return
        const map = {}
        rows.forEach(s => { map[s.id] = s })
        setById(map)
        setLoading(false)
      }).catch(() => { if (!cancelled) { setById({}); setLoading(false) } })
    }
    if (!navigator.onLine) { serveFromCache(); return () => { cancelled = true } }
    supabase
      .from('skus')
      .select(`
        *, categories(name, level_name, parent_id),
        primary_material:material_options!primary_base_material_id(label),
        secondary_material:material_options!secondary_base_material_id(label)
      `)
      .in('id', ids)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.error('[useSkuMasterData] error:', error.message); serveFromCache(); return }
        const map = {}
        ;(data ?? []).forEach(s => { map[s.id] = s })
        setById(map)
        setLoading(false)
        if (PLAN_OFFLINE_ENABLED) setCachedSkuMasterMany(data ?? []).catch(() => {})
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { skuMasterById: byId, loading }
}

export async function createInspectionReport(payload) {
  return supabase.from('inspection_reports').insert(payload).select().single()
}

// Recovery lookup for createInspectionReport's unique-constraint-violation
// path (po_line_item_id, inspection_type, round) — a report for this exact
// (SKU, stage, round) can already exist from an earlier session that a stale
// `reports` list hadn't picked up yet.
export async function findInspectionReport({ po_line_item_id, inspection_type, round = 1 }) {
  return supabase.from('inspection_reports').select('id')
    .eq('po_line_item_id', po_line_item_id).eq('inspection_type', inspection_type).eq('round', round).maybeSingle()
}

// Sum of Available Qty across every already-submitted round for this SKU at
// this stage, excluding one report id (the one currently being submitted,
// whose own Available Qty the caller adds in separately from local state
// rather than trusting a possibly-stale re-read). Used by InspectionForm's
// auto-reschedule to tell how much of the SKU's true order quantity has
// ever actually been presented for inspection at this stage, across all
// rounds — not just what the schedule entry being fulfilled targeted.
export async function sumSubmittedAvailableQty({ po_line_item_id, inspection_type, excludeReportId = null }) {
  let query = supabase.from('inspection_reports').select('id, available_quantity')
    .eq('po_line_item_id', po_line_item_id).eq('inspection_type', inspection_type).eq('status', 'submitted')
  if (excludeReportId) query = query.neq('id', excludeReportId)
  const { data, error } = await query
  if (error) return { total: 0, error }
  const total = (data || []).reduce((sum, r) => sum + (Number(r.available_quantity) || 0), 0)
  return { total, error: null }
}

// maybeSingle(), not single() — the target row can be gone by the time this
// runs (deleted directly in the DB, or by another tab) if the caller's own
// `id` came from a stale in-memory reports list. single() would throw
// PGRST116 ("Cannot coerce the result to a single JSON object") on the
// resulting zero-row match; callers that care can detect that by checking
// for `data === null` with no `error` instead of catching a crash.
//
// `guardSubmitted: true` is for every form-driven write that is NOT a Submit
// (autosave, Save, field saves, the 23505 merge, the offline drain). It reads
// the server row first:
//   - submitted with a verdict result: the report is locked, so nothing is
//     written and the current row comes back (data is non-null, so callers do
//     not mistake it for a deleted report);
//   - submitted with a workflow result (on hold, plan aborted, feedback): the
//     rest of the patch saves but result / status / submitted_at are dropped -
//     that result only changes through an explicit Submit;
//   - a draft: unchanged.
// A patch that itself says status 'submitted' is a deliberate Submit and is
// never guarded.
// Same set as VERDICT_RESULTS in stageStatus.jsx (kept local: this hook must not import a component module).
const LOCKED_VERDICTS = ['accepted', 'partially_accepted', 'accepted_with_deviations', 'rejected']
export async function updateInspectionReport(id, patch, actorName = null, { guardSubmitted = false } = {}) {
  let safePatch = patch
  let current = null
  let guardedDraft = false
  if (guardSubmitted && patch?.status !== 'submitted') {
    const read = await supabase.from('inspection_reports').select('id, status, inspection_result').eq('id', id).maybeSingle()
    if (read.error) return { data: null, error: read.error }
    current = read.data
    if (current?.status === 'submitted') {
      if (LOCKED_VERDICTS.includes(current.inspection_result)) return { data: current, error: null, skipped: 'locked' }
      const { inspection_result: _r, status: _s, submitted_at: _t, ...rest } = patch || {}
      safePatch = rest
    } else if (current) {
      guardedDraft = true
    }
  }
  let q = supabase.from('inspection_reports')
    .update({ ...safePatch, updated_at: new Date().toISOString(), ...(actorName ? { updated_by: actorName } : {}) })
    .eq('id', id)
  // A draft read a moment ago may have been submitted by someone else since: the
  // write itself refuses to touch a row that is no longer a draft.
  if (guardedDraft) q = q.neq('status', 'submitted')
  const res = await q.select().maybeSingle()
  if (guardedDraft && !res.error && !res.data) return { data: current, error: null, skipped: 'locked' }
  return res
}

export async function updateInspectionReportStatus(id, status) {
  const patch = status === 'submitted' ? { status, submitted_at: new Date().toISOString() } : { status }
  return supabase.from('inspection_reports').update(patch).eq('id', id).select().single()
}

// The latest round's current row for one SKU/stage, read fresh from the
// database (not from a possibly-stale in-memory list). Bulk Accept re-reads
// through this right before writing so it classifies what is really there.
// `previousResult` is the result of the newest SUBMITTED round below a draft
// (null otherwise) - lets the caller tell a fresh re-inspection draft that
// follows a rejection from an ordinary draft.
export async function fetchLatestStageReport(poLineItemId, inspectionType) {
  const { data, error } = await supabase.from('inspection_reports')
    .select('id, status, inspection_result, round, fulfilled_schedule_id')
    .eq('po_line_item_id', poLineItemId).eq('inspection_type', inspectionType)
    .order('round', { ascending: false }).limit(1).maybeSingle()
  if (error) return { report: null, previousResult: null, error }
  if (!data) return { report: null, previousResult: null, error: null }
  let previousResult = null
  if (data.status !== 'submitted' && (data.round ?? 1) > 1) {
    const { data: prev, error: prevErr } = await supabase.from('inspection_reports')
      .select('inspection_result')
      .eq('po_line_item_id', poLineItemId).eq('inspection_type', inspectionType)
      .eq('status', 'submitted').lt('round', data.round)
      .order('round', { ascending: false }).limit(1).maybeSingle()
    if (prevErr) return { report: null, previousResult: null, error: prevErr }
    previousResult = prev?.inspection_result ?? null
  }
  return { report: data, previousResult, error: null }
}

// Just the status and result of one report, read fresh - for the wizard's
// submit-time check that nobody changed the report since the form loaded it.
export async function fetchReportResultState(id) {
  const { data, error } = await supabase.from('inspection_reports')
    .select('status, inspection_result').eq('id', id).maybeSingle()
  return { state: data ?? null, error }
}

// Bulk Accept's single atomic, guarded write. ONE statement sets the result,
// status and submitted_at together (the old two-step write - result, then
// status - could leave a half-updated report if the second call failed) and
// only matches while the report is STILL in the state the caller classified:
// `expectedStatus` always, `expectedResults` only when converting an already-
// submitted report (a draft's result legitimately changes on autosave, so a
// draft is guarded on status alone). Zero rows matched means someone else
// changed it in the meantime -> `conflict: true`, nothing was written.
// fulfilled_schedule_id is only written when supplied, so an existing link to
// the schedule entry it already fulfilled is never nulled out.
export async function acceptReportGuarded(id, { expectedStatus, expectedResults = null }, { acceptedQuantity, fulfilledScheduleId = null, actorName = null }) {
  const now = new Date().toISOString()
  const patch = {
    inspection_result: 'accepted', status: 'submitted', submitted_at: now,
    accepted_quantity: acceptedQuantity, updated_at: now,
    ...(actorName ? { updated_by: actorName } : {}),
    ...(fulfilledScheduleId ? { fulfilled_schedule_id: fulfilledScheduleId } : {}),
  }
  let q = supabase.from('inspection_reports').update(patch).eq('id', id).eq('status', expectedStatus)
  if (expectedResults) q = q.in('inspection_result', expectedResults)
  const { data, error } = await q.select('id')
  if (error) return { ok: false, conflict: false, error }
  const matched = (data ?? []).length
  return { ok: matched === 1, conflict: matched === 0, error: null }
}

export async function deleteInspectionReport(id) {
  return supabase.from('inspection_reports').delete().eq('id', id)
}

// result (only meaningful for event_type 'submitted') - a snapshot of
// inspection_result AT THIS EXACT SUBMISSION, so a later in-place resubmit
// of the same round (e.g. a non-verdict "Plan Aborted"/"On Hold" reopened
// and resubmitted as a real verdict) doesn't silently erase every trace
// that the earlier result ever existed - InspectionActivityLog.jsx surfaces
// a past result that differs from the report's current one as a small
// "Was: ..." row under the live one.
export async function addInspectionReportLog({ report_id, po_line_item_id, inspection_type, round = 1, event_type, actor_name, reason = null, result = null }) {
  return supabase.from('inspection_report_logs')
    .insert({ report_id, po_line_item_id, inspection_type, round, event_type, actor_name, reason, result })
    .select().single()
}

// Every distinct result a SKU's reports were EVER submitted with, across
// every stage/round, for InspectionActivityLog.jsx's own "Was: ..." rows -
// a same-round in-place resubmit overwrites inspection_reports.inspection_result
// directly, so this is the only place an earlier result (e.g. "Plan Aborted"
// before it got reopened and Accepted) still exists at all. Only
// 'submitted' events ever carry a result (see addInspectionReportLog).
export async function fetchSubmittedResultLogs(poLineItemId) {
  const { data, error } = await supabase
    .from('inspection_report_logs')
    .select('report_id, result, actor_name, created_at')
    .eq('po_line_item_id', poLineItemId)
    .eq('event_type', 'submitted')
    .not('result', 'is', null)
    .order('created_at', { ascending: true })
  // The permanent Plan Aborted log (inspection_plan_aborted_log) fills the
  // gap the logs table leaves: it survives a Plan Aborted being converted to
  // Accepted. Best-effort - a missing table just contributes nothing.
  const { data: pa } = await fetchPlanAbortedLog([poLineItemId])
  const rows = [...(error ? [] : data || []), ...pa]
  return { data: rows.sort((x, y) => new Date(x.created_at) - new Date(y.created_at)), error: error || null }
}

// Plan Aborted events for the given line items, shaped like the logs rows the
// callers already read ({ report_id, result, actor_name, created_at }).
export async function fetchPlanAbortedLog(lineItemIds) {
  if (!lineItemIds?.length) return { data: [] }
  try {
    const { data, error } = await supabase
      .from('inspection_plan_aborted_log')
      .select('report_id, result, actor_name, created_at')
      .in('po_line_item_id', lineItemIds)
    return { data: error ? [] : data || [] }
  } catch {
    return { data: [] }
  }
}

// Starts a new Final inspection round for a SKU: the previously submitted
// Final report is left untouched as history, and a fresh draft row is
// created for the next round. The log write happens after the row exists
// (it needs a real report_id to reference) — if it fails, we don't fail the
// whole action, since the caller computes next_round from currently loaded
// data and a retry would collide with the round we just created.
// fulfilled_schedule_id links this fresh round back to whichever schedule
// entry now covers its follow-up visit (the caller resolves this - the
// entry it just merged into or created) - without it, this draft reads as
// "nothing has started yet" everywhere that checks fulfilled_schedule_id
// (Inspection Schedule's processing badge, PoInspectionComments.jsx's own
// scheduledSkuInfo), even once someone's genuinely begun working on it.
export async function startReInspection({ po_line_item_id, inspection_type = 'final', next_round, actor_name, reason, fulfilled_schedule_id = null }) {
  const { data, error } = await supabase.from('inspection_reports')
    .insert({ po_line_item_id, inspection_type, round: next_round, status: 'draft', created_by: actor_name, fulfilled_schedule_id })
    .select().single()
  if (error) {
    // Recovery for a retried offline-submit replay (see offlineSync.js's
    // attemptSyncSubmit) landing twice - a genuine duplicate click already
    // created this exact round before a connectivity drop hid the success
    // from the caller. Same shape as createReportRow's own 23505 recovery.
    if (error.code === '23505') {
      const { data: existing, error: findErr } = await findInspectionReport({ po_line_item_id, inspection_type, round: next_round })
      if (!findErr && existing) return { data: existing, error: null }
    }
    return { data: null, error }
  }

  const { error: logError } = await addInspectionReportLog({
    report_id: data.id, po_line_item_id, inspection_type, round: next_round,
    event_type: 'reinspection_started', actor_name, reason,
  })
  if (logError) console.error('[startReInspection] log write failed:', logError.message)

  return { data, error: null }
}

// Marks a leftover quantity (the portion of a SKU's order never physically
// presented for inspection, or previously accepted-with-a-shortfall) as
// rejected WITHOUT a real inspection round ever happening for it - the
// inspector's alternative to InspectionForm.jsx's automatic reschedule when
// they'd rather write the leftover off as rejected than book a follow-up
// visit. There's no dedicated flag for "rejected without inspection"
// anywhere in this schema, and every other piece of this app that reads a
// verdict (stage dots, wasStageRejected, the PDF export, the Activity Log)
// already keys off a real, SUBMITTED inspection_reports row with a genuine
// inspection_result - so this creates exactly that (not a draft, straight to
// submitted) rather than inventing a second, parallel "rejected" concept
// those readers would all need to learn about too. available_quantity/
// accepted_quantity are both 0 (nothing was actually inspected or accepted),
// and the auto-generated remark is what distinguishes this from a normal
// manually-submitted rejection when read back later.
export async function rejectLeftoverQuantity({ po_line_item_id, inspection_type = 'final', next_round, actor_name, quantity }) {
  const { data, error } = await supabase.from('inspection_reports')
    .insert({
      po_line_item_id, inspection_type, round: next_round, status: 'submitted',
      available_quantity: 0, accepted_quantity: 0, inspection_result: 'rejected',
      remarks: [`Leftover quantity (${quantity}) rejected without physical inspection - system generated`],
      created_by: actor_name, updated_by: actor_name,
    })
    .select().single()
  if (error) {
    // Same retried-replay recovery as startReInspection above.
    if (error.code === '23505') {
      const { data: existing, error: findErr } = await findInspectionReport({ po_line_item_id, inspection_type, round: next_round })
      if (!findErr && existing) return { data: existing, error: null }
    }
    return { data: null, error }
  }

  const { error: logError } = await addInspectionReportLog({
    report_id: data.id, po_line_item_id, inspection_type, round: next_round,
    event_type: 'submitted', actor_name, reason: `Leftover quantity (${quantity}) rejected without inspection`,
  })
  if (logError) console.error('[rejectLeftoverQuantity] log write failed:', logError.message)

  return { data, error: null }
}

export async function addDefectRow(row) {
  return supabase.from('inspection_report_defects').insert(row).select().single()
}

export async function updateDefectRow(id, changes) {
  return supabase.from('inspection_report_defects').update(changes).eq('id', id)
}

export async function deleteDefectRow(id) {
  return supabase.from('inspection_report_defects').delete().eq('id', id)
}

export async function addPhotoRow(row) {
  return supabase.from('inspection_report_photos').insert(row).select().single()
}

export async function updatePhotoRow(id, changes) {
  return supabase.from('inspection_report_photos').update(changes).eq('id', id)
}

export async function deletePhotoRow(id) {
  return supabase.from('inspection_report_photos').delete().eq('id', id)
}

// Sets the PO-wide Inspection Level (drives the AQL sampling plan computed
// for every SKU on this PO from its own quantity_ordered, see
// src/lib/samplingPlan.js). Lives directly on purchase_orders since it's a
// single value per PO, not a per-SKU/per-report row.
export async function updatePoInspectionLevel(poId, inspectionLevel) {
  return supabase.from('purchase_orders')
    .update({ inspection_level: inspectionLevel })
    .eq('id', poId).select().single()
}

// Accepted units of every OTHER submitted round of one SKU at one stage (fresh from the database),
// so the leftover check at Submit never relies on a possibly stale in-memory list. Rounds that are not
// accepted-ish count 0; an accepted-ish round with no accepted quantity counts its available quantity.
export async function sumSubmittedAcceptedQty({ po_line_item_id, inspection_type, excludeReportId = null }) {
  let query = supabase.from('inspection_reports')
    .select('id, status, inspection_result, accepted_quantity, available_quantity')
    .eq('po_line_item_id', po_line_item_id).eq('inspection_type', inspection_type).eq('status', 'submitted')
  if (excludeReportId) query = query.neq('id', excludeReportId)
  const { data, error } = await query
  if (error) return { total: 0, error }
  const total = (data || []).reduce((sum, r) => sum + roundAcceptedQty(r), 0)
  return { total, error: null }
}
