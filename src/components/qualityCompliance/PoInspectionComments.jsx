import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useProfileStore } from '../../stores/profileStore'
import { useAuthStore } from '../../stores/authStore'
import { useUiStore } from '../../stores/uiStore'
import SkuCommentsModal from './SkuCommentsModal'
import InspectionHistoryModal from './inspectionReport/InspectionHistoryModal'
import InspectionReportEntry from './inspectionReport/InspectionReportEntry'
import { closedForReinspection } from './inspectionReport/resultGroups'
import { StageDots, getStage, getStageRollup, wasAnyStageRejected, STAGE_LABEL, ACCEPTED_RESULTS, RESULT_LABEL, hasAnySubmittedReport } from './inspectionReport/stageStatus'
import { useInspectionReportsForPo, fetchInspectionReportsForLineItems, fetchSkuMasterForIds } from '../../hooks/useInspectionReports'
import { fetchScheduledPoIds, fetchScheduledPoIdsByCreator, fetchPoScheduleEntries, fetchPoScheduleEntriesForPos, fetchPoScheduleEntriesBulkForPos, fetchBackfilledPoIds, fetchBackfilledPoSummaries, getScheduleStatus, isPlaceholderAssignment } from '../../hooks/useInspectionSchedule'
import { ownScheduleRestrictionEmail, isQaReworkAdmin } from '../../utils/inspectionScheduleAccess'
import { resolveSamplingPlan } from '../../lib/samplingPlan'
import AqlChartModal from './AqlChartModal'
import { DocChip, publicUrl } from '../orderManagement/poUtils'
import DocPreviewModal from '../shared/DocPreviewModal'
import ScrollNav from '../shared/ScrollNav'
import ScheduledPosCalendar from './ScheduledPosCalendar'
import ReworkReviewModal from './inspectionReport/ReworkReviewModal'
import { useReworkRequestsForPo, useAllPendingReworkRequests } from '../../hooks/useInspectionRework'
import MobileFilterSheet from './MobileFilterSheet'
import FetchErrorCard from '../shared/FetchErrorCard'
import {
  getCachedPoList, setCachedPoList, getCachedPoDetail, setCachedPoDetail, getCachedPoDetailIds, setCachedSkuMasterMany, getAllDrafts,
} from '../../lib/offlineDrafts'
import ReconnectSyncScreen from './inspectionReport/ReconnectSyncScreen'
import { PLAN_OFFLINE_ENABLED } from '../../lib/planOffline'

function fmtQty(n) { return n != null ? Number(n).toLocaleString() : '-' }
// Local-date (not UTC) "today" — same shape as InspectionScheduleForm.jsx's
// todayISO(), matters right at day boundaries for a scheduling comparison.
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtScheduledDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
// Scheduled-POs overview table chips (see ScheduledPoRow below) - same stage
// abbreviations and status palette InspectionSchedule.jsx/QcReportsSummary.jsx
// already use, minus 'cancelled' since those entries are filtered out before
// a chip is ever built.
const STAGE_ABBR = { ppm: 'PPM', pilot_run: 'Pilot Run', inline: 'Inline', midline: 'Midline', final: 'Final' }
const SCHEDULE_STATUS_BADGE = { scheduled: 'bg-gray-100 text-gray-600', completed: 'bg-emerald-100 text-emerald-700' }
// Same inline/midline/final ranking QcReportsSummary.jsx and
// repositoryLayout.js each keep their own copy of - used below to pick the
// furthest-along schedule entry for the Scheduled POs overview row, not
// just whichever entry happens to have been created most recently (those
// aren't the same thing: a PO can pick up a fresh Midline entry after its
// Final has already been scheduled and accepted, e.g. a re-inspection
// cycle, which left the overview showing "Midline" for a PO that had
// actually gone all the way through). 'ppm'/'pilot_run' (pre-production,
// not part of the inline->midline->final acceptance pipeline) fall through
// to the -1 default, ranking below every real inspection stage.
const STAGE_ORDER = { inline: 0, midline: 1, final: 2 }

function Spinner({ size = 'w-4 h-4' }) {
  return (
    <svg className={`${size} animate-spin text-gray-400`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

// `locked`: the closed Rejected (or Plan Aborted / On Hold) card sitting next to its Re-Scheduled
// card - shown with a lock and not openable; the way in is the Re-Scheduled card.
function SkuListRow({ li, selected, onSelect, reports, scheduledDate, completed, isPartial, hideRejected, hideScheduled, rescheduled, locked = false }) {
  const finalReport = getStage(reports, li.id, 'final')
  // Rejected and re-scheduled normally coexist (a rejected stage auto-books
  // a fresh round on top of itself - any of Inline/Midline/Final, not just
  // Final - see InspectionForm.jsx's submit handler) - shown as two separate
  // cards for the same SKU rather than cramming both onto one row, so each
  // reads as its own fact: what happened, and what's next.
  // `wasAnyStageRejected` deliberately looks past the fresh round the reset
  // already started, so the Rejected card keeps showing even though that
  // stage's own latest round is a blank draft again. The caller renders this
  // component twice for that case (see displayedLineItems below), each time
  // suppressing the other via these two props so only one badge shows per
  // card.
  const rejectedStage = !hideRejected && wasAnyStageRejected(reports, li.id)
  const shownScheduledDate = hideScheduled ? null : scheduledDate
  // Green while the scheduled date is today or still upcoming, red once it's
  // passed without the stage having been done — same tag color carries into
  // the date text right after it.
  const overdue = shownScheduledDate && shownScheduledDate < todayISO()

  return (
    <div
      role="button"
      tabIndex={locked ? -1 : 0}
      aria-disabled={locked || undefined}
      title={locked ? `${RESULT_LABEL[rejectedStage?.inspection_result] || 'Rejected'}. This round is closed. Re-inspection is on the Re-Scheduled card.` : undefined}
      onClick={locked ? undefined : () => onSelect(li)}
      onKeyDown={locked ? undefined : e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(li) } }}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 border-l-2 transition-colors
        ${locked ? 'cursor-not-allowed' : 'hover:bg-gray-50 active:bg-gray-100 cursor-pointer'}
        ${selected ? 'bg-gray-100 border-l-gray-900' : 'border-l-transparent'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-bold text-gray-900 truncate block">
            {li.buyer_sku_ref || '-'}
            {completed && isPartial ? (
              <>
                {/* Cumulative accepted/available across every submitted
                    Final round is still short of the SKU's true order - a
                    round can itself read "accepted" and the SKU still be
                    partial overall, if an earlier round already used up
                    part of the order (see InspectionForm.jsx's
                    auto-reschedule). Amber, not the plain green Completed
                    tag, so it doesn't read as fully done. */}
                <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-[1px] rounded-sm text-[9px] font-bold leading-none align-middle normal-case bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                  Partially Accepted
                </span>
                {finalReport?.submitted_at && (
                  <span className="ml-1 text-[10px] font-semibold align-middle normal-case text-amber-600">
                    {fmtScheduledDate(finalReport.submitted_at)}
                  </span>
                )}
              </>
            ) : completed ? (
              <>
                <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-[1px] rounded-sm text-[9px] font-bold leading-none align-middle normal-case bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                  <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><polyline points="20 6 9 17 4 12" /></svg>
                  Completed
                </span>
                {finalReport?.submitted_at && (
                  <span className="ml-1 text-[10px] font-semibold align-middle normal-case text-emerald-600">
                    {fmtScheduledDate(finalReport.submitted_at)}
                  </span>
                )}
              </>
            ) : rejectedStage ? (
              <>
                <span className="ml-1.5 inline-flex items-center px-1.5 py-[1px] rounded-sm text-[9px] font-bold leading-none align-middle normal-case ring-1 bg-red-50 text-red-700 ring-red-200">
                  {RESULT_LABEL[rejectedStage.inspection_result] || 'Rejected'}{rejectedStage.inspection_type !== 'final' ? ` · ${STAGE_LABEL[rejectedStage.inspection_type]}` : ''}
                </span>
                {rejectedStage.submitted_at && (
                  <span className="ml-1 text-[10px] font-semibold align-middle normal-case text-red-600">
                    {fmtScheduledDate(rejectedStage.submitted_at)}
                  </span>
                )}
              </>
            ) : shownScheduledDate && (
              <>
                <span className={`ml-1.5 inline-flex items-center px-1.5 py-[1px] rounded-sm text-[9px] font-bold leading-none align-middle normal-case ring-1
                  ${overdue ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
                  {rescheduled ? 'Re-Scheduled' : 'Scheduled'}
                </span>
                <span className={`ml-1 text-[10px] font-semibold align-middle normal-case ${overdue ? 'text-red-600' : 'text-emerald-600'}`}>
                  {fmtScheduledDate(shownScheduledDate)}
                </span>
              </>
            )}
          </span>
          {li.sku_variant && <div className="text-xs text-gray-500 mt-0.5 truncate">{li.sku_variant}</div>}
        </div>
        {/* A completed SKU (latest round accepted) shows its live dots: an earlier rejected / plan aborted round
            must not colour the stage dot any more once a later round was accepted. */}
        <StageDots reports={reports} lineItemId={li.id} forceRejectedStage={completed ? undefined : rejectedStage?.inspection_type} forcedResult={rejectedStage?.inspection_result} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="text-[11px] text-gray-400 font-medium">Balance: <span className="text-gray-600">{fmtQty(li.balance_quantity)}</span></div>
        {locked && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-gray-400 flex-shrink-0" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        )}
      </div>
    </div>
  )
}

// The mobile "Scheduled POs" card - on a phone this is the ONLY way to
// browse POs (the desktop overview's KPI tiles + 13-column table, below, are
// `hidden md:flex` and never shown there at all), so this card carries the
// same facts that overview table row does per PO - Stage/Status chips,
// Scheduled/Accepted SKU counts, the "Auto re-inspect" signal - rather than
// just PO number + open-SKU-count, which used to be all a mobile user ever
// saw of this data. `entry` is the same "furthest-along, non-cancelled
// schedule entry for this PO" ScheduledPoRow already resolves
// (scheduledPosOverview, below) - null for a PO with no schedule entry at
// all, in which case the Stage/Status chips and Scheduled-by line are simply
// omitted rather than shown as empty/dashed (an empty chip reads as broken,
// not "not applicable").
function MobileScheduledPoCard({ po, entry, selected, onSelect, exFactory, availableOffline }) {
  const status = rowStatus(entry)
  const poWideScheduledCount = po.po_line_items?.filter(li => li.status?.toLowerCase() === 'open').length ?? 0
  const scheduledSkuCount = entry?.line_items ? entry.line_items.length : poWideScheduledCount
  const poWideAcceptedCount = (entry?.purchase_orders?.po_line_items ?? []).filter(li =>
    li.inspection_reports?.some(r => r.inspection_type === 'final' && r.status === 'submitted' && ACCEPTED_RESULTS.includes(r.inspection_result))
  ).length
  const acceptedCount = (entry?.purchase_orders?.po_line_items ?? []).filter(li =>
    li.inspection_reports?.some(r =>
      r.inspection_type === 'final' && r.status === 'submitted' && ACCEPTED_RESULTS.includes(r.inspection_result) && r.fulfilled_schedule_id === entry?.id
    )
  ).length
  // See ScheduledPoRow's own comment - a backfilled row's synthetic entry.id
  // never matches any real report's fulfilled_schedule_id.
  const displayAccepted = entry?.isBackfilled ? poWideAcceptedCount : acceptedCount
  const region = [po.supplier_state, po.supplier_country].filter(Boolean).join(', ')

  return (
    <button
      type="button"
      onClick={() => onSelect(po)}
      className={`w-full text-left px-4 py-3.5 border-b border-gray-100 border-l-2 hover:bg-gray-50 active:bg-gray-100 transition-colors
        ${selected ? 'bg-gray-100 border-l-gray-900' : 'border-l-transparent'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-bold text-gray-900 truncate min-w-0 flex items-center gap-1.5">
          {po.po_number || '-'}
          {availableOffline && (
            <span title="Available offline - already cached on this device" className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {entry && (
            <span
              title={`${entry.inspection_type} · QA: ${assignedQaOf(entry) || 'Unassigned'} · ${entry.status}`}
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide ${SCHEDULE_STATUS_BADGE[entry.status] || 'bg-gray-100 text-gray-600'}`}
            >
              {STAGE_ABBR[entry.inspection_type] || entry.inspection_type}
            </span>
          )}
          {status && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide ${ENTRY_STATUS_BADGE[status]}`}>
              {ENTRY_STATUS_LABEL[status]}
            </span>
          )}
        </div>
      </div>
      <div className="text-xs text-gray-500 mt-0.5 truncate">
        {[po.buyer_name, po.supplier_name].filter(Boolean).join(' · ') || '-'}
      </div>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {exFactory(po) && (
          <span className="text-[11px] text-gray-400 font-medium">EXF: {exFactory(po)}</span>
        )}
        <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
          {scheduledSkuCount} scheduled
        </span>
        {displayAccepted > 0 && (
          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
            {displayAccepted} accepted
          </span>
        )}
        {entry?.isBackfilled && (
          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
            Backfilled
          </span>
        )}
      </div>
      {(region || entry) && (
        <div className="flex items-center justify-between gap-2 mt-1.5">
          <span className="text-[10px] text-gray-400 truncate min-w-0">{region}</span>
          {entry && (
            <span className="text-[10px] text-gray-400 flex-shrink-0">{assignedQaOf(entry) || 'Unassigned'}</span>
          )}
        </div>
      )}
    </button>
  )
}

function chunkArray(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Bulk "Download for Offline" - fills in cachedPoDetail (see offlineDrafts.js)
// for every PO in `pos` at once, instead of the lazy one-PO-at-a-time write
// that already happens when a PO is opened while online (PoInspectionComments
// itself still does that too - this is additive, not a replacement). Desktop
// only (see the "desktop-only UI by default" convention for this page) -
// lives in the Scheduled POs overview header, next to Rework Requests.
function DownloadForOfflineButton({ pos, selectedPoIds, scheduleRestrictEmailRef, memberIdRef, setCachedPoIds }) {
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [failedCount, setFailedCount] = useState(0)
  const [lastRunCount, setLastRunCount] = useState(0)
  const [lastRunAt, setLastRunAt] = useState(null)
  const [retryTargets, setRetryTargets] = useState(null) // po[] to retry, or null = "use the checkbox selection / everything"

  // A checked row wins over "download everything" - a QA who ticked 6 POs
  // they're heading out to inspect today almost certainly doesn't want the
  // other 194 pulled down too. Clearing every checkbox reverts to "all".
  const hasSelection = selectedPoIds?.size > 0
  const scopedTargets = hasSelection ? pos.filter(p => selectedPoIds.has(p.id)) : pos

  const run = async () => {
    const targets = retryTargets ?? scopedTargets
    if (!targets.length) return
    setStatus('running')
    setProgress({ done: 0, total: targets.length })

    const entriesByPo = {}
    const reportsByLineItem = {}
    const failedPoIds = new Set()

    // Phase 1 — schedule entries, chunked ~50 PO ids per request.
    const poChunks = chunkArray(targets.map(p => p.id), 50)
    for (const chunk of poChunks) {
      const { entriesByPo: got, error } = await fetchPoScheduleEntriesBulkForPos(chunk, scheduleRestrictEmailRef.current, memberIdRef.current)
      if (error) { chunk.forEach(id => failedPoIds.add(id)); continue }
      Object.assign(entriesByPo, got)
      setProgress(p => ({ ...p, done: Math.min(p.total, p.done + chunk.length * 0.2) }))
    }

    // Phase 2 — inspection reports, chunked ~200 line-item ids per request.
    const allLineItems = targets.flatMap(p => (p.po_line_items ?? []).map(li => li.id))
    const itemChunks = chunkArray(allLineItems, 200)
    for (const chunk of itemChunks) {
      const { reports, error } = await fetchInspectionReportsForLineItems(chunk)
      if (error) continue // reports missing for these SKUs - their owning POs just get an empty reports list below, not a hard failure
      for (const r of reports) (reportsByLineItem[r.po_line_item_id] ??= []).push(r)
      setProgress(p => ({ ...p, done: Math.min(p.total, p.done + chunk.length * 0.5 * (targets.length / allLineItems.length || 1)) }))
    }

    // Phase 3 — SKU master data (dimensions/materials/barcodes/category) -
    // not part of cachedPoDetail (keyed by sku id, not PO), so it needs its
    // own bulk fetch + write-through. Same chunk size as the reports fetch.
    const allSkuIds = [...new Set(targets.flatMap(p => (p.po_line_items ?? []).map(li => li.sku_id).filter(Boolean)))]
    for (const chunk of chunkArray(allSkuIds, 200)) {
      const { skus, error } = await fetchSkuMasterForIds(chunk)
      if (error) continue // a SKU missing its master data offline just shows blank derived fields, not a hard PO failure
      await setCachedSkuMasterMany(skus)
      setProgress(p => ({ ...p, done: Math.min(p.total, p.done + chunk.length * 0.3 * (targets.length / (allSkuIds.length || 1))) }))
    }

    // Phase 4 — write-through, one PO at a time (matches the lazy per-PO-
    // open path's own setCachedPoDetail call exactly, same stored shape).
    const written = []
    for (const po of targets) {
      if (failedPoIds.has(po.id)) continue
      const lineItemIds = (po.po_line_items ?? []).map(li => li.id)
      const inspectionReports = lineItemIds.flatMap(id => reportsByLineItem[id] ?? [])
      const scheduleEntries = entriesByPo[po.id] ?? []
      await setCachedPoDetail(po.id, { inspectionReports, scheduleEntries })
      written.push(po.id)
    }

    setCachedPoIds(prev => {
      const next = new Set(prev)
      written.forEach(id => next.add(id))
      return next
    })

    const failed = targets.filter(po => !written.includes(po.id))
    setFailedCount(failed.length)
    setLastRunCount(written.length)
    setRetryTargets(failed.length ? failed : null)
    setProgress({ done: targets.length, total: targets.length })
    setStatus(failed.length ? 'error' : 'done')
    setLastRunAt(Date.now())
  }

  if (status === 'running') {
    return (
      <span className="flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 whitespace-nowrap">
        Downloading... {Math.min(progress.total, Math.round(progress.done))}/{progress.total}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <button
        type="button"
        onClick={run}
        title="Cache the selected (or every scheduled) PO's SKUs, reports and schedule info on this device for offline inspection"
        className="px-3 py-1.5 rounded-md text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors whitespace-nowrap"
      >
        {retryTargets
          ? `Retry (${retryTargets.length})`
          : hasSelection ? `Download Selected (${scopedTargets.length})` : 'Download for Offline'}
      </button>
      {status === 'done' && lastRunAt && (
        <span className="text-[10px] text-gray-400">
          {lastRunCount} downloaded · as of {new Date(lastRunAt).toLocaleTimeString()}
        </span>
      )}
      {status === 'error' && (
        <span className="text-[10px] text-red-500">
          {failedCount} failed - tap Retry
        </span>
      )}
    </div>
  )
}

// Loading placeholder for the mobile PO card list - shaped/sized like
// MobileScheduledPoCard itself so the list doesn't visibly jump once real
// cards replace these, shown instead of a bare spinner for the initial
// fetch (which routinely takes longer than an instant tab-switch would).
function PoCardSkeleton() {
  return (
    <div className="px-4 py-3.5 border-b border-gray-100 border-l-2 border-l-transparent animate-pulse">
      <div className="flex items-center justify-between gap-2">
        <div className="h-4 w-24 bg-gray-200 rounded" />
        <div className="h-4 w-12 bg-gray-100 rounded" />
      </div>
      <div className="h-3 w-40 bg-gray-100 rounded mt-2" />
      <div className="flex items-center gap-2 mt-2.5">
        <div className="h-4 w-20 bg-gray-100 rounded-full" />
        <div className="h-4 w-16 bg-gray-100 rounded-full" />
      </div>
    </div>
  )
}

// One row per PO for the Scheduled-POs overview table - one <tr> per PO,
// not per schedule entry. A PO with several entries (e.g. Midline done, then
// Final scheduled later) used to get one row per entry; now only its most
// recently *created* entry (by `created_at`, not `scheduled_date` - a
// re-schedule can carry an earlier date than the entry it replaces)
// represents that PO, so Stage/Date/Status/Scheduled SKUs/Accepted SKUs all
// read as "where this PO stands right now" instead of its full history.
// Scheduled/Accepted SKUs are still scoped to that one surviving entry (see
// ScheduledPoRow below), matching the single stage/round it now shows. Shows
// who's actually ASSIGNED to inspect (organization_members.full_name, via
// assigned_qa_id), not who scheduled it (entry.created_by) - those can be
// different people. entry.created_by === 'System' means InspectionForm.jsx
// auto-booked this round after a Final was rejected/partially accepted (see
// its submit handler) - shown as a distinct chip alongside the assigned QA's
// name (not replacing it) so the column still always answers "who's
// assigned" while also flagging why this particular round exists.
function ScheduledByCell({ entry }) {
  if (!entry) return <span className="text-gray-300 text-xs">-</span>
  if (entry.isBackfilled) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {entry.inspector_name || 'Unknown'}
        <span
          title="Imported from historical inspection records - never went through live scheduling"
          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500"
        >
          Backfilled
        </span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {isPlaceholderAssignment(entry) ? 'Unassigned' : (entry.organization_members?.full_name || 'Unassigned')}
      {entry.created_by === 'System' && (
        <span
          title={entry.notes || 'Automatically scheduled'}
          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700"
        >
          Auto re-inspect
        </span>
      )}
    </span>
  )
}

// Scheduled/Completed/Rejected - a simpler three-state summary than
// getScheduleStatus's own scheduled/processing/completed (which folds a
// rejection into "processing" until its next round is satisfied, see that
// function's comment). Here a still-unresolved rejection on this entry's
// own scope is surfaced as its own bucket instead, since this overview is
// meant to flag at a glance which POs need re-inspection.
function entryStatus(entry) {
  if (!entry) return null
  const lineItems = entry.purchase_orders?.po_line_items ?? []
  const scopedIds = entry.line_items?.map(x => x.id)
  const scoped = scopedIds?.length ? lineItems.filter(li => scopedIds.includes(li.id)) : lineItems
  const hasRejected = scoped.some(li => li.inspection_reports?.some(r =>
    r.inspection_type === entry.inspection_type && r.status === 'submitted' &&
    r.fulfilled_schedule_id === entry.id && closedForReinspection(r, li.inspection_reports)
  ))
  if (hasRejected) return 'rejected'
  return getScheduleStatus(entry) === 'completed' ? 'completed' : 'scheduled'
}
// entryStatus()/getScheduleStatus() both reason from a real entry.id showing
// up as some report's fulfilled_schedule_id - a synthetic backfilled entry's
// fake id never matches any real report, so entryStatus would read it as
// perpetually "scheduled" rather than the "completed" it actually is (every
// backfill-script report is already submitted/accepted). Bypass entirely for
// backfilled rows instead of teaching entryStatus about a shape it was never
// designed for.
function rowStatus(entry) {
  return entry?.isBackfilled ? 'completed' : entryStatus(entry)
}
// Who's actually assigned to inspect - organization_members.full_name for a
// real entry (via assigned_qa_id), or the report's own inspector_name for a
// backfilled one (no organization_members link exists for those). A real
// entry that's only a placeholder assignment (a data-correction batch had
// to put a real person in the NOT NULL assigned_qa_id column with nothing
// real to assign - see isPlaceholderAssignment's own comment) shows blank
// too, same as no assignment at all, rather than naming that placeholder
// person as if they were genuinely assigned. Module-level since both
// ScheduledPoRow/the overview's own filters and MobileScheduledPoCard need
// the same logic.
function assignedQaOf(entry) {
  if (entry?.isBackfilled) return entry.inspector_name
  if (isPlaceholderAssignment(entry)) return null
  return entry?.organization_members?.full_name
}
const ENTRY_STATUS_BADGE = {
  scheduled: 'bg-gray-100 text-gray-600',
  completed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}
const ENTRY_STATUS_LABEL = { scheduled: 'Scheduled', completed: 'Completed', rejected: 'Rejected' }

// Search + "(Select All)" + checkbox-list body shared by ExcelFilterHeader's
// desktop popover (below) and MobileFilterSheet.jsx's bottom-sheet sections -
// one filter-list *logic* (search-within-column, Set semantics: null = no
// filter, a full Set collapses back to null) rendered inside two different
// *shells* (a positioned popover vs. a bottom-sheet section) rather than two
// separate implementations that could drift apart.
export function FilterChecklistBody({ options, selected, onChange, formatLabel = (o) => o }) {
  const [search, setSearch] = useState('')
  const checkedSet = selected ?? new Set(options)
  const visibleOptions = search.trim()
    ? options.filter(o => formatLabel(o).toLowerCase().includes(search.trim().toLowerCase()))
    : options
  const allChecked = checkedSet.size === options.length

  const toggleValue = (val) => {
    const next = new Set(checkedSet)
    if (next.has(val)) next.delete(val)
    else next.add(val)
    onChange(next.size === options.length ? null : next)
  }
  const toggleAll = () => onChange(allChecked ? new Set() : null)

  return (
    <>
      <div className="p-1.5 border-b border-gray-100">
        <input
          autoFocus
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-full h-7 px-1.5 text-[11px] border border-gray-200 rounded focus:outline-none focus:border-gray-900"
        />
      </div>
      <div className="max-h-48 overflow-y-auto p-1.5 space-y-0.5">
        <label className="flex items-center gap-1.5 px-1 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 rounded cursor-pointer">
          <input type="checkbox" checked={allChecked} onChange={toggleAll} className="w-3 h-3" />
          (Select All)
        </label>
        {visibleOptions.length === 0 && <p className="px-1 py-1 text-[11px] text-gray-400">No matches</p>}
        {visibleOptions.map(opt => (
          <label key={opt} className="flex items-center gap-1.5 px-1 py-1 text-[11px] text-gray-600 hover:bg-gray-50 rounded cursor-pointer truncate">
            <input type="checkbox" checked={checkedSet.has(opt)} onChange={() => toggleValue(opt)} className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{formatLabel(opt)}</span>
          </label>
        ))}
      </div>
    </>
  )
}

// Excel-style column header filter: a small funnel icon right of the label
// (same header row - no extra row eating vertical space), opening a
// checklist of every distinct value in that column. `selected` is null
// (no filter - everything shown) or a Set of the values still checked;
// unchecking one removes it from the Set, and re-checking every option
// collapses back to null rather than an explicitly-full Set, so "no
// filter" and "all boxes checked" stay the same state. Closes on any click
// outside the popover (checkbox clicks inside must NOT close it, ruling
// out a plain blur-based close like the simpler single-select filters).
export function ExcelFilterHeader({ label, options, selected, onChange, isOpen, onToggle, onClose, formatLabel = (o) => o, align = 'left' }) {
  const popoverRef = useRef(null)
  const buttonRef = useRef(null)
  // Portaled to document.body (fixed positioning computed from the trigger
  // button's own rect) instead of `absolute` inside the <th> - the header
  // row is `position: sticky` inside a scrollable table container, and an
  // absolutely-positioned descendant of a sticky element uses that
  // element's pre-stick layout box as its containing block, so it visually
  // drifts away from the button once the header is actually stuck (the
  // "popover floating in the wrong place, clipped" bug). Same pattern as
  // InspectionSchedule.jsx's own hover-preview portal.
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e) => {
      if (popoverRef.current?.contains(e.target)) return
      if (buttonRef.current?.contains(e.target)) return
      onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen, onClose])

  const isFiltered = selected !== null

  return (
    <th className={`text-${align} px-3.5 py-2.5`}>
      <span className="inline-flex items-center gap-1">
        {label}
        <button
          ref={buttonRef}
          type="button"
          onClick={onToggle}
          title={`Filter by ${label}`}
          className={`inline-flex items-center justify-center w-4 h-4 rounded hover:bg-gray-200 cursor-pointer ${isFiltered ? 'text-indigo-600' : 'text-gray-400'}`}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18l-7 9v7l-4 2v-9z" /></svg>
        </button>
      </span>
      {isOpen && pos && createPortal(
        <div ref={popoverRef} className="fixed z-[300] w-48 bg-white border border-gray-200 rounded-lg shadow-lg font-normal normal-case" style={{ top: pos.top, left: pos.left }}>
          <FilterChecklistBody options={options} selected={selected} onChange={onChange} formatLabel={formatLabel} />
        </div>,
        document.body
      )}
    </th>
  )
}

function ScheduledPoRow({ po, entry, selected, onSelect, exFactory, inspectionNo, downloadChecked, onToggleDownloadCheck }) {
  const status = rowStatus(entry)
  const poWideScheduledCount = po.po_line_items?.filter(li => li.status?.toLowerCase() === 'open').length ?? 0
  // entry.line_items is this specific round's own scope - [{id, quantity}]
  // for a partial-PO schedule, or null for "the whole PO" (matching the
  // po_line_items null/[] convention used everywhere else in this app).
  const scheduledSkuCount = entry?.line_items ? entry.line_items.length : poWideScheduledCount

  // Every entry for this PO carries the same purchase_orders.po_line_items
  // join (see fetchPoScheduleEntriesForPos). PO-wide total (today's original
  // rule): any SKU with a submitted+accepted Final report anywhere on the
  // PO - kept as a fallback/reference number so nothing appears to vanish.
  const poWideAcceptedCount = (entry?.purchase_orders?.po_line_items ?? []).filter(li =>
    li.inspection_reports?.some(r => r.inspection_type === 'final' && r.status === 'submitted' && ACCEPTED_RESULTS.includes(r.inspection_result))
  ).length
  // Per-entry: only reports this specific schedule entry actually fulfilled
  // (r.fulfilled_schedule_id === entry.id) count toward it - this is what
  // makes 3 rows for the same PO show 3 different, meaningful numbers
  // instead of the same PO-wide total three times. A report submitted
  // off-schedule (fulfilled_schedule_id null) can't be attributed to any
  // entry, so it's never lost - it just still shows up in the PO-wide total
  // surfaced in this cell's tooltip.
  const acceptedCount = (entry?.purchase_orders?.po_line_items ?? []).filter(li =>
    li.inspection_reports?.some(r =>
      r.inspection_type === 'final' && r.status === 'submitted' && ACCEPTED_RESULTS.includes(r.inspection_result) && r.fulfilled_schedule_id === entry?.id
    )
  ).length
  // A backfilled row's synthetic entry.id never matches any real report's
  // fulfilled_schedule_id, so acceptedCount (per-entry) is always 0 for it -
  // poWideAcceptedCount (unscoped) is the correct, only meaningful number
  // there, same one the tooltip already falls back to for a real entry.
  const displayAccepted = entry?.isBackfilled ? poWideAcceptedCount : acceptedCount
  const acceptedTitle = displayAccepted !== poWideAcceptedCount
    ? `${acceptedCount} accepted from this round · ${poWideAcceptedCount} accepted PO-wide`
    : undefined
  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={() => onSelect(po)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(po) } }}
      className={`cursor-pointer odd:bg-gray-50/40 hover:bg-sky-50/50 transition-colors ${selected ? 'bg-gray-100' : ''}`}
    >
      {/* PLAN OFFLINE (disabled): the download-selection cell is hidden. */}
      {PLAN_OFFLINE_ENABLED && (
        <td className="px-3 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={downloadChecked}
            onChange={() => onToggleDownloadCheck(po.id)}
            title="Select for Download for Offline"
            className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
          />
        </td>
      )}
      <td className="px-3.5 py-2.5 text-gray-500 whitespace-nowrap">{inspectionNo}</td>
      <td className="px-3.5 py-2.5 font-bold text-gray-900 whitespace-nowrap">{po.po_number || '-'}</td>
      <td className="px-3.5 py-2.5 text-gray-600 whitespace-nowrap">{po.buyer_name || '-'}</td>
      <td className="px-3.5 py-2.5 text-gray-600 whitespace-nowrap">{po.supplier_name || '-'}</td>
      <td className="px-3.5 py-2.5 text-gray-600 whitespace-nowrap">{[po.supplier_state, po.supplier_country].filter(Boolean).join(', ') || '-'}</td>
      <td className="px-3.5 py-2.5 text-gray-600 whitespace-nowrap">{fmtScheduledDate(exFactory(po)) || '-'}</td>
      <td className="px-3.5 py-2.5 text-gray-600 whitespace-nowrap">{fmtQty(po.quantity_ordered)}</td>
      <td className="px-3.5 py-2.5 text-gray-600 whitespace-nowrap">{scheduledSkuCount}</td>
      <td title={acceptedTitle} className={`px-3.5 py-2.5 whitespace-nowrap ${displayAccepted > 0 ? 'text-emerald-600 font-semibold' : 'text-gray-600'}`}>{displayAccepted > 0 ? displayAccepted : '-'}</td>
      <td className="px-3.5 py-2.5 whitespace-nowrap text-[11px] text-gray-600">
        <ScheduledByCell entry={entry} />
      </td>
      <td className="px-3.5 py-2.5 whitespace-nowrap">
        {entry ? (
          <span
            title={`${entry.inspection_type} · QA: ${assignedQaOf(entry) || 'Unassigned'} · ${entry.status}`}
            className={`inline-flex items-center gap-1 w-fit px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${SCHEDULE_STATUS_BADGE[entry.status] || 'bg-gray-100 text-gray-600'}`}
          >
            {STAGE_ABBR[entry.inspection_type] || entry.inspection_type}
          </span>
        ) : <span className="text-gray-300 text-xs">-</span>}
      </td>
      <td className="px-3.5 py-2.5 whitespace-nowrap text-[11px] text-gray-600">
        {entry ? fmtScheduledDate(entry.scheduled_date) : <span className="text-gray-300 text-xs">-</span>}
      </td>
      <td className="px-3.5 py-2.5 whitespace-nowrap">
        {status ? (
          <span className={`inline-flex items-center gap-1 w-fit px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${ENTRY_STATUS_BADGE[status]}`}>
            {ENTRY_STATUS_LABEL[status]}
          </span>
        ) : <span className="text-gray-300 text-xs">-</span>}
      </td>
    </tr>
  )
}

export default function PoInspectionComments() {
  const { orgMembership } = useProfileStore()
  const userEmail  = useAuthStore(s => s.session?.user?.email)
  const userName   = orgMembership?.fullName || 'QA Team'
  const dept       = orgMembership?.department
  const canComment = dept === 'qa' || dept === 'tech'
  // Anyone who can be assigned an inspection on the calendar (see
  // InspectionScheduleForm.jsx's QA picker) is scoped to Scheduled POs here —
  // not just qa-department members. Admins/Owners see every scheduled PO
  // (everyone's assignments, for oversight); regular QA/tech see only their
  // own — they didn't get personally assigned anything otherwise.
  const isAdminRole  = orgMembership?.role === 'admin' || orgMembership?.role === 'owner'
  const isRestricted = dept === 'qa' || dept === 'tech' || isAdminRole
  // The 5 named schedule managers take a separate, higher-precedence
  // restriction: their own scheduled entries only (created_by_email), not
  // assigned_qa_id like the dept-based rule above - they're schedulers, not
  // necessarily qa/tech dept, and often not the assignee either. null for
  // everyone else (including Admins/Owners, who keep seeing everything).
  const scheduleRestrictEmail = ownScheduleRestrictionEmail(userEmail, orgMembership)

  // PO/SKU selection is mirrored into the URL (?po=&sku=) so browser
  // back/forward and reload work, AND into uiStore (persisted) so it survives
  // the case the URL can't: the sidebar's tab links are static hrefs
  // (?tab=po-inspection), so switching to another tab and back always lands
  // on a bare URL with no selection params at all — the store is what
  // actually restores it in that case. `pos` (needed to resolve a stored/URL
  // id into the full object the rest of this component works with) loads
  // async, so restoring happens once in an effect below rather than at
  // initial useState time.
  const [searchParams, setSearchParams] = useSearchParams()
  const poInspectionSelection = useUiStore(s => s.poInspectionSelection)
  const setPoInspectionSelection = useUiStore(s => s.setPoInspectionSelection)
  const restoredFromUrl = useRef(false)

  // Refs so fetchPos (stable [] deps) always sees latest values without
  // recreating. Synced in an effect (not directly during render) — this runs
  // before the fetchPos-triggering effect further down since passive effects
  // run in declaration order, so the refs are always current by the time
  // fetchPos actually executes.
  const deptRef = useRef(dept)
  const isRestrictedRef = useRef(isRestricted)
  const isAdminRoleRef = useRef(isAdminRole)
  const memberIdRef = useRef(orgMembership?.memberId)
  const scheduleRestrictEmailRef = useRef(scheduleRestrictEmail)
  useEffect(() => {
    deptRef.current = dept
    isRestrictedRef.current = isRestricted
    isAdminRoleRef.current = isAdminRole
    memberIdRef.current = orgMembership?.memberId
    scheduleRestrictEmailRef.current = scheduleRestrictEmail
  }, [dept, isRestricted, isAdminRole, orgMembership?.memberId, scheduleRestrictEmail])

  // Historical backfill-script PO ids (see fetchBackfilledPoIds' own
  // comment) - a ref (not state) since fetchPos itself is a stable
  // useCallback reading refs, same convention as the ones just above. A
  // small state counter alongside it exists purely to re-trigger fetchPos
  // once these ids actually arrive - they load asynchronously, so the very
  // first fetchPos() call on mount would otherwise run before the ref is
  // populated and miss every backfilled PO until the next search keystroke.
  const backfilledPoIdsRef = useRef(new Set())
  const [backfilledPoIdsVersion, setBackfilledPoIdsVersion] = useState(0)
  useEffect(() => {
    let cancelled = false
    fetchBackfilledPoIds().then(({ poIds }) => {
      if (cancelled) return
      backfilledPoIdsRef.current = new Set(poIds)
      setBackfilledPoIdsVersion(v => v + 1)
    })
    return () => { cancelled = true }
  }, [])

  const [pos, setPos]               = useState([])
  const [loading, setLoading]       = useState(false)
  // A failed fetchPos used to just console.error and leave `pos` at whatever
  // it was before (empty on first load) - indistinguishable from "nothing is
  // scheduled". This is the visible, retry-capable state for that instead.
  const [fetchError, setFetchError] = useState(null)
  // Non-null (a timestamp) when `pos` is currently the offline-cached
  // snapshot rather than a live fetch - drives the "Offline - showing data
  // from…" note on the list. Cleared at the top of every fetchPos call so
  // a subsequent successful online fetch doesn't leave it stuck showing.
  const [offlineListFetchedAt, setOfflineListFetchedAt] = useState(null)
  // Every PO id with cached detail (reports/schedule) available offline -
  // powers the small "available offline" dot on each sidebar row. Not
  // scoped to `pos` itself since a PO can stay cached even after falling
  // out of the current list/search.
  const [cachedPoIds, setCachedPoIds] = useState(() => new Set())
  const refreshCachedPoIds = () => getCachedPoDetailIds().then(setCachedPoIds).catch(() => {})
  // PLAN OFFLINE (disabled): no "available offline" dots without a cache.
  useEffect(() => { if (PLAN_OFFLINE_ENABLED) refreshCachedPoIds() }, [])
  // Row checkboxes on the Scheduled POs overview table (desktop only) - lets
  // a QA pick specific POs to bulk-download for offline instead of always
  // downloading all 175/200. Not persisted - a fresh page load starts with
  // nothing checked.
  const [selectedForDownload, setSelectedForDownload] = useState(() => new Set())
  const toggleSelectedForDownload = (poId) => {
    setSelectedForDownload(prev => {
      const next = new Set(prev)
      if (next.has(poId)) next.delete(poId); else next.add(poId)
      return next
    })
  }
  const toggleSelectAllForDownload = () => {
    setSelectedForDownload(prev => {
      const allChecked = filteredOverviewRows.length > 0 && filteredOverviewRows.every(({ po }) => prev.has(po.id))
      if (allChecked) return new Set()
      return new Set(filteredOverviewRows.map(({ po }) => po.id))
    })
  }
  const [search, setSearch]         = useState('')      // PO-number search — active when no PO is selected
  // Mobile-only: no room for the desktop overview's Row/Calendar toggle (a
  // real mobile month-calendar is a separate, larger feature - see the
  // "Filters" button below for the equivalent of that toggle's other half,
  // the Excel-style column filters), so instead the mobile card list gets a
  // plain sort choice: newest-scheduled-first (matches the desktop table's
  // default order) or soonest-Ex-Factory-first (what "what's coming up"
  // actually means day-to-day).
  const [mobileSortBy, setMobileSortBy] = useState('latest')
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [skuSearch, setSkuSearch]   = useState('')       // SKU-number search — active once a PO is selected
  // Which sidebar card labels to show - 'all' or one of Completed/Scheduled/
  // Re-Scheduled/Rejected, matching the badges SkuListRow itself renders.
  const [skuStatusFilter, setSkuStatusFilter] = useState('all')
  // Row (the existing flat table) vs Calendar (the full Day/Week/Month/Year
  // view already built for the separate Inspection Schedule page - reused
  // as-is here rather than building a second, narrower calendar).
  const [scheduledPosView, setScheduledPosView] = useState('row')
  const [selectedPo, setSelectedPo] = useState(null)
  const [selectedLineItem, setSelectedLineItem] = useState(null)
  // Which sidebar card is highlighted - usually just the SKU's id, but a
  // rejected+rescheduled SKU renders as two separate cards for the same
  // line item (see displayedLineItems below), so a plain li.id match would
  // highlight both at once. Tracked separately so only the card actually
  // clicked lights up, even though both point at the same underlying SKU.
  const [selectedCardKey, setSelectedCardKey] = useState(null)
  const [showSkuComments, setShowSkuComments] = useState(false)
  const [showSkuHistory, setShowSkuHistory] = useState(false)
  const [showReworkReview, setShowReworkReview] = useState(false)
  // Global (all-POs) rework review, opened from the Scheduled POs overview
  // page instead of from one open PO - see showReworkReview above for the
  // per-PO equivalent.
  const [showGlobalReworkReview, setShowGlobalReworkReview] = useState(false)
  const [showAqlChart, setShowAqlChart] = useState(false)
  const [docPreview, setDocPreview] = useState(null) // { url, label } for the PO/PI doc preview modal
  // Desktop-only: lets the SCHEDULED POS panel be collapsed once a PO is open
  // to reclaim width for the inspection form. Mobile already hides it behind
  // the back arrow in that state, so this only matters at md+.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [overviewTableEl, setOverviewTableEl] = useState(null)   // Scheduled-POs overview table's own scroll box (see ScrollNav below it)
  // Raw name (not `scheduleEntries` directly) - see the derived `scheduleEntries`
  // near the offline PO-detail cache below, which falls back to
  // cachedPoDetail.scheduleEntries whenever this raw fetch has nothing
  // (offline, or a genuine failure).
  const [rawScheduleEntries, setRawScheduleEntries] = useState([])   // this PO's inspection_schedules rows, any stage
  const [scheduleEntriesError, setScheduleEntriesError] = useState(null)
  const [poScheduleEntriesByPo, setPoScheduleEntriesByPo] = useState({})   // bulk schedule data for the Scheduled-POs overview table, keyed by po_id
  const [backfilledPoSummaries, setBackfilledPoSummaries] = useState({})   // historical backfill-script POs with zero real schedule entries, keyed by po_id

  // When a stage wizard is open, the sidebar swaps its full SKU list for just
  // the active SKU + a step nav — InspectionForm's own step-switching logic
  // (which must flush autosave first) stays where it lives; it just portals
  // its nav buttons into this stable, always-mounted container instead of
  // duplicating that logic up here.
  const [wizardOpen, setWizardOpen] = useState(false)
  // Incrementing this asks InspectionForm to run its own proper close (which
  // flushes any pending autosave first) rather than this component ripping
  // the wizard away by deselecting the SKU out from under it.
  const [closeWizardToken, setCloseWizardToken] = useState(0)
  const [stepNavContainer, setStepNavContainer] = useState(null)

  const { reports: rawInspectionReports, loading: inspectionReportsLoading, error: inspectionReportsError, refresh: refreshInspectionReports } = useInspectionReportsForPo(selectedPo)
  // Offline PO-detail cache (choose-a-PO journey) - `cachedPoDetail` below
  // holds the last-known-good { inspectionReports, scheduleEntries } for
  // whichever PO was last successfully opened online (see the write-through
  // effect and getCachedPoDetail in offlineDrafts.js). `inspectionReports`/
  // `scheduleEntries` (used everywhere else in this file, unchanged) fall
  // back to it whenever the live hook/fetch has nothing - offline from the
  // start, or a fetch that genuinely failed - rather than every downstream
  // usage needing its own online/offline branch.
  const [cachedPoDetail, setCachedPoDetailState] = useState(null)
  const baseInspectionReports = (!navigator.onLine || inspectionReportsError) && cachedPoDetail
    ? cachedPoDetail.inspectionReports
    : rawInspectionReports
  const scheduleEntries = (!navigator.onLine || scheduleEntriesError) && cachedPoDetail
    ? cachedPoDetail.scheduleEntries
    : rawScheduleEntries
  // Overlays any locally-queued-but-not-yet-synced Submit (see
  // offlineDrafts.js's markPendingSubmit / InspectionForm.jsx's offline
  // handleSubmit branch) onto the fetched/cached reports array - without
  // this, a SKU submitted offline would still read as its old pre-submit
  // status (still "draft"/locked) everywhere that checks `inspectionReports`
  // (stage-lock logic, sidebar badges) until the real sync actually lands,
  // which could be a long time later - breaking exactly the "submit one
  // stage, immediately move to the next, all offline" flow this exists for.
  // Deliberately narrow: only drafts with a pendingSubmit action or an
  // already-submitted patch are merged in, not every plain in-progress
  // draft - a SKU merely being autosaved mid-edit already has its own
  // separate "in progress" signal elsewhere and doesn't need this overlay.
  const [localDraftOverlay, setLocalDraftOverlay] = useState([])
  const refreshLocalDraftOverlay = () => {
    if (!selectedPo?.id) { Promise.resolve().then(() => setLocalDraftOverlay([])); return }
    const lineItemIds = new Set((selectedPo.po_line_items ?? []).map(li => li.id))
    getAllDrafts().then(drafts => {
      setLocalDraftOverlay(drafts.filter(d =>
        lineItemIds.has(d.poLineItemId) && (d.pendingSubmit || d.patch?.status === 'submitted')
      ))
    }).catch(() => {})
  }
  useEffect(() => {
    refreshLocalDraftOverlay()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPo?.id])
  const inspectionReports = useMemo(() => {
    if (!localDraftOverlay.length) return baseInspectionReports
    const byKey = new Map(baseInspectionReports.map(r => [`${r.po_line_item_id}:${r.inspection_type}:${r.round}`, r]))
    for (const d of localDraftOverlay) {
      const key = `${d.poLineItemId}:${d.inspectionType}:${d.round}`
      const existing = byKey.get(key)
      byKey.set(key, {
        inspection_report_defects: [], inspection_report_photos: [],
        ...existing,
        ...d.patch,
        id: d.serverReportId || existing?.id || `local:${d.draftId}`,
        po_line_item_id: d.poLineItemId, inspection_type: d.inspectionType, round: d.round,
      })
    }
    return Array.from(byKey.values())
  }, [baseInspectionReports, localDraftOverlay])
  // Loads (or clears) the fallback the two derived values above read from,
  // whenever the selected PO changes - fetched fresh rather than reused
  // from setCachedPoDetail's own write below, since opening a PO you last
  // cached in an EARLIER session (page reload, different day) has no live
  // write to piggyback on.
  useEffect(() => {
    let cancelled = false
    // PLAN OFFLINE (disabled): never fall back to a cached PO snapshot.
    if (!PLAN_OFFLINE_ENABLED) return
    if (!selectedPo?.id) { Promise.resolve().then(() => { if (!cancelled) setCachedPoDetailState(null) }); return }
    getCachedPoDetail(selectedPo.id).then(d => { if (!cancelled) setCachedPoDetailState(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [selectedPo?.id])
  // Write-through - once both this PO's reports and schedule entries have
  // genuinely loaded online (no error), cache them together as this PO's
  // offline snapshot for next time. Deliberately NOT gated on `disabled`/
  // `loading` beyond what's already implied by inspectionReportsError/
  // scheduleEntriesError both being clear - a stale-but-present previous
  // fetch still counts as "the current known-good state" worth caching.
  useEffect(() => {
    // PLAN OFFLINE (disabled): stop writing the offline PO snapshot.
    if (!PLAN_OFFLINE_ENABLED) return
    if (!selectedPo?.id || !navigator.onLine) return
    if (inspectionReportsLoading || inspectionReportsError || scheduleEntriesError) return
    const poId = selectedPo.id
    setCachedPoDetail(poId, { inspectionReports: rawInspectionReports, scheduleEntries: rawScheduleEntries }).then(() => {
      // Also keep the "available offline" badge (cachedPoIds) fresh right
      // after this PO becomes newly cached, without waiting for the next
      // full refreshCachedPoIds() poll elsewhere.
      setCachedPoIds(prev => (prev.has(poId) ? prev : new Set(prev).add(poId)))
    }).catch(() => {})
  }, [selectedPo?.id, rawInspectionReports, rawScheduleEntries, inspectionReportsLoading, inspectionReportsError, scheduleEntriesError])
  const { requests: reworkRequests, refresh: refreshReworkRequests } = useReworkRequestsForPo(selectedPo?.id)
  const pendingReworkRequests = reworkRequests.filter(r => r.status === 'pending')
  // Only fetched for QA rework admins - same gate as the button that opens it.
  const { requests: allReworkRequests, refresh: refreshAllReworkRequests } = useAllPendingReworkRequests(isQaReworkAdmin(orgMembership))
  const allPendingReworkRequests = allReworkRequests.filter(r => r.status === 'pending')

  // Stable signature of WHO is asking - different users legitimately see
  // different PO lists (see the restriction comment just below), so the
  // offline cache can't be one shared entry; each scope gets its own.
  const poListScopeKey = () =>
    `${scheduleRestrictEmailRef.current || ''}|${isRestrictedRef.current ? 1 : 0}|${isAdminRoleRef.current ? 1 : 0}|${memberIdRef.current || ''}`

  // fetchPos is called on every search-box keystroke with no debounce (see
  // the onChange handlers below), and now also from the backfilledPoIdsVersion
  // effect further down - multiple calls can genuinely be in flight at once,
  // and nothing about network timing guarantees they resolve in the order
  // they were issued. Without a guard, a slower, now-stale request (e.g. one
  // fired for an earlier, partial search string) resolving AFTER a faster,
  // newer one would silently overwrite the correct result with a wrong one -
  // exactly what made "KI-21/06" briefly show a large, unrelated PO list
  // instead of its own real (empty) match. Every state-mutating point below
  // checks fetchRequestIdRef.current === requestId first and bails out
  // silently if a newer call has since superseded it.
  const fetchRequestIdRef = useRef(0)

  const fetchPos = useCallback(async (poNumber = '') => {
    const requestId = ++fetchRequestIdRef.current
    const isCurrent = () => fetchRequestIdRef.current === requestId
    const isTech = deptRef.current === 'tech'
    setLoading(true)
    setFetchError(null)
    setOfflineListFetchedAt(null)

    // Serves the last-cached snapshot for this scope (see setCachedPoList
    // below), filtered client-side by whatever search term was typed - used
    // both when navigator.onLine already says there's no connection, and as
    // the fallback once a live attempt below genuinely fails (a flaky
    // signal can still report "online" while every real request times out).
    // No cache yet for this scope = genuinely nothing to show - the one
    // hard "never been online" boundary.
    const serveFromCache = async (failureMessage) => {
      // PLAN OFFLINE (disabled): no cached list - a plain online-only message.
      if (!PLAN_OFFLINE_ENABLED) {
        if (isCurrent()) { setFetchError(failureMessage || "You're offline. Connect to the internet to load this list."); setLoading(false) }
        return false
      }
      const cached = await getCachedPoList(poListScopeKey())
      if (!isCurrent()) return true // a newer call has since taken over - don't touch state either way
      if (!cached) {
        setFetchError(failureMessage || "You're offline and this PO list hasn't been loaded yet. Connect once to make it available offline.")
        setLoading(false)
        return false
      }
      const q = poNumber.trim().toLowerCase()
      setPos(q ? cached.pos.filter(p => p.po_number?.toLowerCase().includes(q)) : cached.pos)
      setOfflineListFetchedAt(cached.fetchedAt)
      setLoading(false)
      return true
    }

    if (!navigator.onLine) { await serveFromCache(); return }

    // "Scheduled POs" is a genuine query restriction, not a fetch-everything-
    // then-hide-in-the-UI filter — only POs that actually have a schedule
    // entry are ever requested (any status; a PO stays visible for the whole
    // lifecycle of the assignment). Admins/Owners see every scheduled PO
    // (memberId omitted); regular QA/tech see only their own. The named
    // schedule managers take precedence over that dept-based rule - they're
    // scoped to what they personally scheduled (created_by_email) OR what's
    // assigned to them (their own memberId), regardless of their own
    // department.
    let scheduledIds = null
    if (scheduleRestrictEmailRef.current) {
      const { poIds, error: idsError } = await fetchScheduledPoIdsByCreator(scheduleRestrictEmailRef.current, memberIdRef.current)
      // A genuine fetch failure here used to look identical to "nothing is
      // scheduled" (poIds also comes back [] on error) - `idsError` is what
      // tells the two apart, so a real outage shows the retry state instead
      // of a false empty list.
      if (idsError) { if (await serveFromCache(idsError.message)) return; if (isCurrent()) setLoading(false); return }
      if (!poIds.length) { if (isCurrent()) { setPos([]); setLoading(false) }; return }
      scheduledIds = poIds
    } else if (isRestrictedRef.current) {
      const { poIds, error: idsError } = await fetchScheduledPoIds(isAdminRoleRef.current ? null : memberIdRef.current)
      if (idsError) { if (await serveFromCache(idsError.message)) return; if (isCurrent()) setLoading(false); return }
      // Admins/Owners additionally see every historically backfilled PO
      // (see fetchBackfilledPoIds' own comment) - fetched once on mount
      // into backfilledPoIdsRef, not re-fetched on every search keystroke.
      // Not applied to a named schedule-restriction manager above (their
      // scope is who created/is assigned a real entry - backfilled rows
      // have neither).
      const combined = isAdminRoleRef.current ? [...new Set([...poIds, ...backfilledPoIdsRef.current])] : poIds
      if (!combined.length) { if (isCurrent()) { setPos([]); setLoading(false) }; return }
      scheduledIds = combined
    }

    const poSelect = `
      id, po_number, po_received_date, ex_factory_date, exceptional_ex_factory_date,
      quantity_ordered, inspection_level, po_file_url,
      buyer_supplier_links!inner (
        buyer:organizations!buyer_supplier_links_buyer_org_id_fkey (display_name),
        supplier:organizations!buyer_supplier_links_supplier_org_id_fkey (display_name, city, address, state, zip, country, phone_no)
      ),
      po_line_items (
        id, sku_id, buyer_sku_ref, sku_variant,
        quantity_ordered, shipped_quantity, balance_quantity,
        status, target_date
      )
    `
    const buildBaseQuery = () => {
      let bq = supabase.from('purchase_orders').select(poSelect)
        .is('deleted_at', null).is('delete_meta', null).neq('status', 'closed')
      if (!isTech) bq = bq.not('is_test', 'is', true)
      if (poNumber.trim()) bq = bq.ilike('po_number', `%${poNumber.trim()}%`)
      return bq
    }

    let data, error
    if (scheduledIds) {
      // A PO that's genuinely scheduled must show up here regardless of how
      // old it is - the date cutoff in the `else` branch below is only
      // meant to trim the unbounded "every open PO" fallback, not to hide
      // POs the schedule query above already explicitly named.
      //
      // scheduledIds can now run into the ~1000s once backfilled POs are
      // unioned in (see the combined-ids comment above) - a single
      // .in('id', scheduledIds) with that many UUIDs, combined with this
      // query's joined select columns, silently fails the whole request
      // with a 400 (a real bug found live: it broke this entire list, not
      // just backfilled search, the moment the combined set crossed a
      // request-size limit). Chunked into parallel batches instead, same
      // reasoning as fetchAllPages elsewhere in this app - each chunk's
      // .in() list stays small regardless of how large scheduledIds grows.
      const CHUNK = 150
      const chunks = []
      for (let i = 0; i < scheduledIds.length; i += CHUNK) chunks.push(scheduledIds.slice(i, i + CHUNK))
      const results = await Promise.all(chunks.map(chunk => buildBaseQuery().in('id', chunk)))
      error = results.find(r => r.error)?.error
      if (!error) {
        // No per-chunk .order()/.limit() - the top-200-by-po_received_date
        // cutoff only means anything once every chunk's rows are merged.
        data = results.flatMap(r => r.data || [])
          .sort((a, b) => (b.po_received_date || '').localeCompare(a.po_received_date || ''))
          .slice(0, 200)
      }
    } else {
      const { data: d, error: e } = await buildBaseQuery()
        .gte('po_received_date', '2026-01-01')
        .order('po_received_date', { ascending: false })
        .limit(200)
      data = d; error = e
    }
    if (!isCurrent()) return // a newer call has since taken over - discard this one's result

    if (error) {
      console.error('[PoInspectionComments] fetch error:', error.message)
      if (await serveFromCache(error.message)) return
      setLoading(false)
      return
    }
    setLoading(false)

    const mapped = (data || []).map(po => ({
      ...po,
      buyer_name:      po.buyer_supplier_links?.buyer?.display_name    ?? null,
      supplier_name:   po.buyer_supplier_links?.supplier?.display_name ?? null,
      supplier_city:   po.buyer_supplier_links?.supplier?.city         ?? null,
      supplier_address: po.buyer_supplier_links?.supplier?.address     ?? null,
      supplier_state:   po.buyer_supplier_links?.supplier?.state       ?? null,
      supplier_zip:     po.buyer_supplier_links?.supplier?.zip         ?? null,
      supplier_country: po.buyer_supplier_links?.supplier?.country     ?? null,
      supplier_phone:   po.buyer_supplier_links?.supplier?.phone_no    ?? null,
    }))
    // Same relevance ranking RepositoryPanel.jsx's own search already uses -
    // an exact po_number match first, then a prefix match, then a plain
    // substring match, so typing "K" (say) surfaces "KI-21/06" itself
    // ahead of any other PO that merely happens to contain a "k" somewhere.
    // Stable sort (Array.prototype.sort, spec-guaranteed since ES2019) so
    // same-rank rows keep the query's own po_received_date-desc order.
    if (poNumber.trim()) {
      const q = poNumber.trim().toLowerCase()
      const rank = (po) => {
        const v = (po.po_number || '').toLowerCase()
        if (v === q) return 0
        if (v.startsWith(q)) return 1
        return 2
      }
      mapped.sort((a, b) => rank(a) - rank(b))
    }
    setPos(mapped)
    // Only the unfiltered (no search term) fetch is cached as "the scope's
    // list" - caching a narrowed search result under the same key would
    // poison the offline fallback with whatever was last typed into the
    // search box instead of the real full list.
    if (PLAN_OFFLINE_ENABLED && !poNumber.trim()) setCachedPoList(poListScopeKey(), mapped).catch(() => {})
  }, []) // stable — reads dept via deptRef

  // Also re-fetch once `isRestricted`/`isAdminRole`/memberId resolve — profile
  // data loads asynchronously after mount, and fetchPos itself stays stable
  // (empty-deps useCallback reading current values via refs), so without
  // these as explicit deps here the very first fetch (made before the profile
  // finishes loading) would never be redone with the correct restriction.
  // backfilledPoIdsVersion is here for the same reason - the first fetchPos()
  // call on mount runs before backfilledPoIdsRef has loaded, so this re-runs
  // it once those ids actually arrive. Re-fetches with whatever's currently
  // in the search box (not a blind empty search) so a search already in
  // progress isn't wiped out by this version bump.
  useEffect(() => { fetchPos(search) },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `search` read at fire time only, deliberately not reactive here (its own onChange handler already calls fetchPos on every keystroke)
    [fetchPos, isRestricted, isAdminRole, orgMembership?.memberId, backfilledPoIdsVersion])

  // Restore selection once the PO list has loaded — URL first (browser
  // back/forward, a shared deep link), falling back to uiStore (survives a
  // sidebar tab switch, which the URL alone can't). Only runs once; after
  // that, selection changes are driven by user clicks (below), which keep
  // both in sync going forward.
  useEffect(() => {
    if (restoredFromUrl.current || !pos.length) return
    restoredFromUrl.current = true
    const poId = searchParams.get('po') || poInspectionSelection?.poId
    if (!poId) return
    const po = pos.find(p => p.id === poId)
    if (!po) return
    setSelectedPo(po)
    const skuId = searchParams.get('sku') || poInspectionSelection?.skuId
    const li = skuId ? po.po_line_items?.find(x => x.id === skuId) : null
    if (li) { setSelectedLineItem(li); setSelectedCardKey(li.id) }
  }, [pos, searchParams, poInspectionSelection])

  const selectPo = (po) => {
    setSelectedPo(po)
    setSkuSearch('')
    setSelectedLineItem(null)
    setSelectedCardKey(null)
    setShowSkuComments(false)
    setShowSkuHistory(false)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('po', po.id)
      next.delete('sku')
      next.delete('stage')
      return next
    }, { replace: true })
    setPoInspectionSelection({ poId: po.id, skuId: null })
  }

  const closePo = () => {
    setSelectedPo(null)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('po')
      next.delete('sku')
      next.delete('stage')
      return next
    }, { replace: true })
    setPoInspectionSelection(null)
  }

  const closeSku = () => {
    setSelectedLineItem(null)
    setSelectedCardKey(null)
    setShowSkuComments(false)
    setShowSkuHistory(false)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('sku')
      next.delete('stage')
      return next
    }, { replace: true })
    setPoInspectionSelection(prev => prev ? { ...prev, skuId: null } : prev)
  }

  const selectLineItem = (li, cardKey = li.id) => {
    const deselecting = selectedCardKey === cardKey
    setSelectedLineItem(deselecting ? null : li)
    setSelectedCardKey(deselecting ? null : cardKey)
    if (deselecting) { setShowSkuComments(false); setShowSkuHistory(false) }
    setPoInspectionSelection(prev => prev ? { ...prev, skuId: deselecting ? null : li.id } : prev)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (deselecting) { next.delete('sku'); next.delete('stage') }
      else { next.set('sku', li.id); next.delete('stage') }
      return next
    }, { replace: true })
  }

  const exFactory = (po) => po.exceptional_ex_factory_date ?? po.ex_factory_date

  // Optimistic local patch after saving the PO-wide Inspection Level, avoids
  // a full re-fetch of the PO list/detail for a single-field change.
  const patchSelectedPo = (patch) => {
    setSelectedPo(prev => (prev ? { ...prev, ...patch } : prev))
    setPos(prev => prev.map(p => (p.id === selectedPo?.id ? { ...p, ...patch } : p)))
  }

  const displayedPos = useMemo(() => pos.filter(p => {
    // Scheduled POs is already restricted at the query level to exactly
    // what's on the calendar — being scheduled is the criterion, not whether
    // a line item still shows 'open' (a PO can be scheduled for Midline/Final
    // after its SKUs have already shipped). Only the unrestricted baseline
    // list (merchandising etc.) still needs this "has active work" filter.
    if (isRestricted) return true
    if (!p.po_line_items?.some(li => li.status?.toLowerCase() === 'open')) return false
    return true
  }), [pos, isRestricted])

  const displayedPoIds = useMemo(() => displayedPos.map(p => p.id), [displayedPos])

  // Bulk schedule data backing the Scheduled-POs overview table shown when no
  // PO is selected - a separate fetch from fetchPos/`pos` so that query stays
  // untouched; this only runs once displayedPos changes.
  useEffect(() => {
    if (!displayedPoIds.length) { setPoScheduleEntriesByPo({}); return }
    let cancelled = false
    fetchPoScheduleEntriesForPos(displayedPoIds, scheduleRestrictEmailRef.current, memberIdRef.current).then(({ entriesByPo }) => {
      if (!cancelled) setPoScheduleEntriesByPo(entriesByPo)
    })
    return () => { cancelled = true }
  }, [displayedPoIds, scheduleRestrictEmail])

  // Historical backfill-script POs (no real inspection_schedules row at
  // all) that still belong on the Scheduled POs overview table - see
  // fetchBackfilledPoSummaries' own comment. A separate fetch/effect from
  // the one just above, same reasoning: unscoped by displayedPoIds (the
  // whole small batch-script dataset is fetched once, not re-fetched every
  // time the PO list/search narrows), and isolated so a failure or slowness
  // here can't block the real-schedule table from rendering.
  useEffect(() => {
    let cancelled = false
    fetchBackfilledPoSummaries().then(({ summariesByPo }) => {
      if (!cancelled) setBackfilledPoSummaries(summariesByPo)
    })
    return () => { cancelled = true }
  }, [])

  // Scheduled-POs overview table rows - the full displayedPos list, still
  // browsable even once fully inspected (unlike the KPI tiles above, this
  // isn't trying to match the other pages' numbers, just listing every PO
  // this page's sidebar already listed).
  // Per-column filters on the Scheduled POs overview table, purely
  // client-side over the already-fetched rows - separate from `search`
  // (the PO-number box), which drives the actual query.
  // Each value is null (no filter - show all) or a Set of the values still
  // checked in that column's Excel-style filter popover.
  const [overviewColumnFilters, setOverviewColumnFilters] = useState({ customer: null, vendor: null, region: null, scheduledBy: null, stage: null, status: null })
  const setOverviewFilter = (key, value) => setOverviewColumnFilters(prev => ({ ...prev, [key]: value }))
  const [openFilterCol, setOpenFilterCol] = useState(null)
  const toggleFilterCol = (col) => setOpenFilterCol(prev => prev === col ? null : col)
  // A Set (even an empty one, from unchecking "Select All") means that
  // column has an active filter - only null means "no filter". Drives the
  // "Clear filters" affordance below, which exists specifically because the
  // filter icons themselves live in the table header - and that header used
  // to disappear along with the rest of the table whenever a filter combo
  // matched zero rows, leaving no visible way back in.
  const hasActiveOverviewFilters = Object.values(overviewColumnFilters).some(v => v !== null)
  const clearOverviewFilters = () => setOverviewColumnFilters({ customer: null, vendor: null, region: null, scheduledBy: null, stage: null, status: null })

  const scheduledPosOverview = useMemo(() => {
    // One (po, entry) row per PO - `entry` is that PO's furthest-along
    // non-cancelled schedule entry (by STAGE_ORDER: inline < midline <
    // final), not just whichever was *created* most recently - those can
    // disagree (a PO can pick up a fresh Midline entry, e.g. for a
    // re-inspection cycle, after its Final entry already exists and was
    // accepted, which left this row reading "Midline" for a PO that had
    // actually gone all the way through). Ties at the same stage fall back
    // to most-recently-created. Row order (below) is unchanged by this -
    // still newest-created-entry first; a PO with no entries at all still
    // gets one row (entry: null), sorted to the end.
    const rows = []
    for (const po of displayedPos) {
      const entries = (poScheduleEntriesByPo[po.id] ?? []).filter(e => e.status !== 'cancelled')
      if (entries.length === 0) {
        // No real schedule entry - but this PO may still be genuinely,
        // completely inspected via the historical backfill-script import
        // (see fetchBackfilledPoSummaries). Give it a synthetic entry-like
        // object instead of leaving the row blank, so it's no longer
        // invisible just because it never went through live scheduling.
        const summary = backfilledPoSummaries[po.id]
        if (summary) {
          rows.push({
            po,
            entry: {
              id: `backfill-${po.id}`, isBackfilled: true,
              inspection_type: summary.inspection_type,
              scheduled_date: summary.submitted_at, created_at: summary.submitted_at,
              status: 'completed',
              created_by: null, created_by_email: null,
              line_items: null, // no specific SKU subset - the whole PO's backfilled coverage
              organization_members: null, inspector_name: summary.inspector_name,
              purchase_orders: { po_number: po.po_number, po_line_items: summary.po_line_items },
              notes: null,
            },
          })
          continue
        }
        rows.push({ po, entry: null }); continue
      }
      const furthest = entries.reduce((a, b) => {
        const stageA = STAGE_ORDER[a.inspection_type] ?? -1
        const stageB = STAGE_ORDER[b.inspection_type] ?? -1
        if (stageB !== stageA) return stageB > stageA ? b : a
        return b.created_at > a.created_at ? b : a
      })
      rows.push({ po, entry: furthest })
    }
    rows.sort((a, b) => {
      if (!a.entry && !b.entry) return 0
      if (!a.entry) return 1
      if (!b.entry) return -1
      return b.entry.created_at.localeCompare(a.entry.created_at)
    })
    return { rows, poCount: displayedPos.length }
  }, [displayedPos, poScheduleEntriesByPo, backfilledPoSummaries])

  // Every distinct-value option list is built from whatever's actually
  // present in the currently loaded rows (not filtered by the OTHER active
  // column filters, kept simple, unlike real Excel's cross-column
  // recompute) - so a filter never offers a value with zero matching rows.
  const regionOf = (po) => [po.supplier_state, po.supplier_country].filter(Boolean).join(', ')
  const overviewCustomerOptions = useMemo(
    () => [...new Set(scheduledPosOverview.rows.map(r => r.po.buyer_name).filter(Boolean))].sort(),
    [scheduledPosOverview.rows]
  )
  const overviewVendorOptions = useMemo(
    () => [...new Set(scheduledPosOverview.rows.map(r => r.po.supplier_name).filter(Boolean))].sort(),
    [scheduledPosOverview.rows]
  )
  const overviewRegionOptions = useMemo(
    () => [...new Set(scheduledPosOverview.rows.map(r => regionOf(r.po)).filter(Boolean))].sort(),
    [scheduledPosOverview.rows]
  )
  const overviewScheduledByOptions = useMemo(
    () => [...new Set(scheduledPosOverview.rows.map(r => assignedQaOf(r.entry)).filter(Boolean))].sort(),
    [scheduledPosOverview.rows]
  )
  const overviewStageOptions = useMemo(
    () => [...new Set(scheduledPosOverview.rows.map(r => r.entry?.inspection_type).filter(Boolean))].sort(),
    [scheduledPosOverview.rows]
  )
  const overviewStatusOptions = ['scheduled', 'completed', 'rejected']

  const filteredOverviewRows = useMemo(() => {
    const f = overviewColumnFilters
    const matches = (set, value) => !set || set.has(value)
    return scheduledPosOverview.rows.filter(({ po, entry }) => {
      if (!matches(f.customer, po.buyer_name)) return false
      if (!matches(f.vendor, po.supplier_name)) return false
      if (!matches(f.region, regionOf(po))) return false
      if (!matches(f.scheduledBy, assignedQaOf(entry))) return false
      if (!matches(f.stage, entry?.inspection_type)) return false
      if (!matches(f.status, rowStatus(entry))) return false
      return true
    })
  }, [scheduledPosOverview.rows, overviewColumnFilters])

  // Mobile card list's own ordering - same filtered rows the desktop overview
  // table shows, just re-sorted. 'latest' matches filteredOverviewRows'
  // existing default (newest-created-entry first); 'exFactory' surfaces
  // what's coming up soonest, closer to what "Calendar view" would answer if
  // mobile had room for one (see the Row/Calendar toggle's own comment,
  // desktop-only by design). A row with no ex-factory date sorts to the end
  // rather than first, so missing data doesn't masquerade as "most urgent".
  const mobileSortedRows = useMemo(() => {
    if (mobileSortBy !== 'exFactory') return filteredOverviewRows
    return [...filteredOverviewRows].sort((a, b) => {
      const da = exFactory(a.po), db = exFactory(b.po)
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return da.localeCompare(db)
    })
  }, [filteredOverviewRows, mobileSortBy])

  // What Inspection Schedule planned for this PO — surfaced here as badges,
  // the sidebar/Overview scheduled-only filters, and the sample-size default
  // InspectionForm seeds.
  useEffect(() => {
    if (!selectedPo?.id) { setRawScheduleEntries([]); setScheduleEntriesError(null); return }
    let cancelled = false
    fetchPoScheduleEntries(selectedPo.id, scheduleRestrictEmailRef.current, memberIdRef.current).then(({ entries, error }) => {
      if (cancelled) return
      setRawScheduleEntries(entries)
      setScheduleEntriesError(error ?? null)
    })
    return () => { cancelled = true }
  }, [selectedPo?.id, scheduleRestrictEmail])

  // Re-fetches this PO's schedule entries on demand - `scheduleEntries`
  // otherwise only loads once per PO selection, so a SKU that gets rejected
  // (auto-booking a fresh schedule entry, see InspectionForm.jsx's submit
  // handler) wouldn't show up as "Re-Scheduled" in the sidebar until the
  // page was reloaded, even though inspectionReports itself already
  // refreshes and shows the rejection immediately.
  const refreshScheduleEntries = () => {
    if (!selectedPo?.id) return Promise.resolve()
    return fetchPoScheduleEntries(selectedPo.id, scheduleRestrictEmailRef.current, memberIdRef.current).then(({ entries, error }) => {
      setRawScheduleEntries(entries)
      setScheduleEntriesError(error ?? null)
    })
  }
  // Returns the combined promise (not fire-and-forget) - callers that
  // navigate or re-gate on `reports`/`scheduleEntries` right after calling
  // this (e.g. InspectionForm.jsx's submit handler closing back to the
  // overview, whose stage pills lock-check reads this same data) need the
  // refetch to have actually landed first, not just been kicked off.
  const refreshPoData = () => Promise.all([refreshInspectionReports(), refreshScheduleEntries()]).then(() => refreshLocalDraftOverlay())

  // Resolves the entry that actually covers a given SKU for a stage - a PO
  // can carry more than one concurrent, non-cancelled entry for the same
  // stage at once (e.g. a stage split off to a different QA for just the
  // still-open SKUs, or a Rework-approved SKU getting its own fresh entry) -
  // so picking a single "latest entry PO-wide" regardless of who it actually
  // covers would misattribute every OTHER SKU on that stage to whichever
  // entry happens to have the newest date, even when that entry excludes
  // them entirely. Instead this only considers entries that actually cover
  // the given SKU (either a whole-PO entry with no line_items subset, or one
  // that explicitly lists it), then takes the latest-dated one among those.
  // A plain function (not a precomputed map) since callers resolve many
  // different SKUs against the same stage in a single pass (InspectionReportEntry's
  // bulk-accept), not just the one SKU InspectionForm has open at a time.
  const getScheduleEntryForSku = useCallback((stage, lineItemId) => {
    let best = null
    for (const e of scheduleEntries) {
      if (e.status === 'cancelled' || e.inspection_type !== stage) continue
      const covers = !e.line_items?.length || e.line_items.some(x => x.id === lineItemId)
      if (!covers) continue
      if (!best || e.scheduled_date > best.scheduled_date) best = e
    }
    return best
  }, [scheduleEntries])

  // Per-SKU scheduling view — earliest scheduled_date across every
  // non-cancelled entry for this PO. Deliberately walks all of
  // `scheduleEntries`, not just getScheduleEntryForSku's per-SKU latest pick -
  // a stage can carry more than one concurrent entry (different dates,
  // different SKU subsets), and a SKU whose only coverage is the
  // non-latest entry still needs to show up here. A `line_items: null` entry
  // means "whole PO", so every open SKU counts as scheduled for that entry's
  // date, not zero of them. A SKU is dropped once the entry covering it is
  // actually satisfied - a submitted report tied to that exact entry, full
  // accept or not. A submitted-but-rejected report still means the visit
  // happened; leaving its old entry showing as an overdue "Scheduled X" would
  // misreport a completed (if failed) inspection as one that never occurred.
  // A rejected Final gets its own fresh follow-up entry instead (see
  // InspectionForm.jsx's submit handler), so this only ever needs to check
  // that one entry, not walk every report ever filed for the SKU. Feeds both
  // the sidebar list's date/color and (via its keys) which SKUs count as
  // "scheduled" for badging/filtering in the Overview table.
  const skuScheduleInfo = useMemo(() => {
    const info = {}
    const allIds = (selectedPo?.po_line_items ?? []).map(li => li.id)
    for (const entry of scheduleEntries) {
      if (entry.status === 'cancelled') continue
      const ids = entry.line_items?.length ? entry.line_items.map(x => x.id) : allIds
      for (const id of ids) {
        // Only the CURRENT (latest-round) report can satisfy an entry - an
        // older, now-superseded round matching this entry's id (e.g. a
        // rejected round whose fulfilled_schedule_id still points at an
        // entry that later got other SKUs merged into it) must never keep
        // hiding a SKU that's actually back to needing re-inspection. A
        // fresh reset round (see InspectionForm.jsx's submit handler) is
        // exactly what makes the latest round stop matching once rejected.
        const latest = getStage(inspectionReports, id, entry.inspection_type)
        const satisfied = latest?.status === 'submitted' && latest?.fulfilled_schedule_id === entry.id
        if (satisfied) continue
        if (!info[id] || entry.scheduled_date < info[id]) info[id] = entry.scheduled_date
      }
    }
    return info
  }, [scheduleEntries, selectedPo, inspectionReports])

  const scheduledSkuIds = useMemo(() => new Set(Object.keys(skuScheduleInfo)), [skuScheduleInfo])

  // Additive display filter for the PO Inspection screen only (Overview
  // table + per-stage tabs in PoSkuSummary.jsx) - a subset of scheduledSkuIds
  // narrowed to entries whose scheduled_date has actually arrived. Reuses
  // skuScheduleInfo's existing per-SKU earliest-date map rather than
  // re-walking scheduleEntries. Does NOT change scheduledSkuIds itself - the
  // sidebar list below, badges, and InspectionForm's sample-size seed all
  // keep reading the full set - so a SKU split off via "Inspect Later"
  // disappears from today's Overview/stage tabs while still correctly
  // showing as "Scheduled" (for its new date) everywhere else.
  const visibleTodaySkuIds = useMemo(
    () => new Set(Object.entries(skuScheduleInfo).filter(([, date]) => date <= todayISO()).map(([id]) => id)),
    [skuScheduleInfo]
  )

  // Fulfillment already drops a SKU from skuScheduleInfo once its Final
  // report is submitted+accepted (same rule the Overview table's own
  // fulfillment filter uses) — that's right for the Overview table, but this
  // sidebar list should keep a completed SKU visible instead of just letting
  // it vanish, so it shows up as "Completed" rather than disappearing.
  const completedSkuIds = useMemo(() => {
    const ids = new Set()
    for (const li of selectedPo?.po_line_items ?? []) {
      const finalReport = getStage(inspectionReports, li.id, 'final')
      if (finalReport?.status === 'submitted' && ACCEPTED_RESULTS.includes(finalReport.inspection_result)) ids.add(li.id)
    }
    return ids
  }, [selectedPo, inspectionReports])

  const displayedLineItems = useMemo(() => {
    // hasAnySubmittedReport covers a SKU whose Inline/Midline are both done
    // (satisfying those entries, so it drops out of skuScheduleInfo) but
    // whose Final hasn't been scheduled yet - neither "scheduled" nor
    // "completed" (Final not accepted), it used to fall through both
    // filters and vanish from the PO entirely despite having real, frozen
    // inspection history that should stay visible. Same fix as
    // PoSkuSummary.jsx's Overview table/card list row filters.
    // Ascending by SKU ref - previously whatever order po_line_items came
    // back from the query in (effectively arbitrary from a QA's point of
    // view), which made an otherwise-numeric-looking SKU list (24046-0,
    // 24047-14, 24048-14...) read as shuffled. `numeric: true` sorts
    // "24050-2" before "24051-14" correctly (by value, not by comparing
    // "2" vs "1" as the first differing character) rather than plain
    // string comparison, which would put a 2-digit suffix before a
    // 1-digit one whenever it starts with a smaller digit.
    const items = (selectedPo?.po_line_items ?? [])
      .filter(li => skuScheduleInfo[li.id] != null || completedSkuIds.has(li.id) || hasAnySubmittedReport(inspectionReports, li.id))
      .sort((a, b) => (a.buyer_sku_ref || '').localeCompare(b.buyer_sku_ref || '', undefined, { numeric: true, sensitivity: 'base' }))
    const q = skuSearch.trim().toLowerCase()
    // Matches either the SKU number, or the Inspection Number (report_no) of
    // ANY of this SKU's reports across every stage/round - not just its
    // currently-displayed one, so an older, now-superseded round's number
    // still finds the right SKU even after a newer round exists.
    const searched = q ? items.filter(li =>
      li.buyer_sku_ref?.toLowerCase().includes(q) ||
      inspectionReports.some(r => r.po_line_item_id === li.id && r.report_no?.toLowerCase().includes(q))
    ) : items
    if (skuStatusFilter === 'all') return searched
    // Matches the same per-SKU classification the sidebar's own card-split
    // render uses below - a rejected SKU with a fresh re-schedule already
    // booked counts as both "rejected" and "rescheduled" for filtering.
    return searched.filter(li => {
      if (completedSkuIds.has(li.id)) return skuStatusFilter === 'completed'
      const isRejected = !!wasAnyStageRejected(inspectionReports, li.id)
      const hasSchedule = skuScheduleInfo[li.id] != null
      if (isRejected) return skuStatusFilter === 'rejected' || (skuStatusFilter === 'rescheduled' && hasSchedule)
      return skuStatusFilter === 'scheduled' && hasSchedule
    })
  }, [selectedPo, skuSearch, skuScheduleInfo, completedSkuIds, skuStatusFilter, inspectionReports])

  // ── PO list panel (shared between mobile/desktop) ─────────────────────────
  const poList = (
    <div className={`
      flex flex-col bg-white
      border-gray-200
      ${selectedPo
        // Desktop stays a flex item at all times once a PO is open (never
        // display:none - that can't be animated) and slides shut by
        // transitioning width/border to 0 instead of vanishing instantly.
        // Mobile has no room for this at all, so it's still a hard `hidden`
        // there regardless of the collapsed toggle.
        ? `hidden md:flex md:flex-shrink-0 md:overflow-hidden md:transition-all md:duration-300 md:ease-in-out ${sidebarCollapsed ? 'md:w-0 md:border-r-0' : 'md:w-[270px] md:border-r'}`
        // No PO selected: desktop shows the full-width Scheduled/Open POs
        // overview instead (KPI tiles + table, see the `detail` branch below):
        // this sidebar list would just be a redundant, narrower repeat of
        // that same table, so it's hidden there. Mobile has no room for the
        // overview table (that block is itself `hidden md:flex`), so this
        // stays the only way to browse/pick a PO on small screens. `detail`
        // renders null in this branch, so this is the parent flex-col's only
        // child - without flex-1 min-h-0 it sizes to its full content height
        // instead of the available viewport, and the parent's overflow-hidden
        // just clips the rest instead of it scrolling (the actual list below
        // is already its own `flex-1 overflow-y-auto`, but that only works
        // once this outer wrapper itself is height-constrained).
        : 'flex flex-1 min-h-0 w-full md:hidden'}
    `}>
      {/* Scheduled POs — restricted members only (qa, tech, admin/owner). Not a
          tab, just a label: there's only one view now, so nothing to switch. */}
      {isRestricted && (
        <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0 bg-gradient-to-b from-gray-50 to-white flex items-center justify-between gap-2">
          <span className="text-xs font-extrabold text-gray-900 uppercase tracking-wider">Scheduled POs</span>
          {/* Same global Rework Requests entry point as the desktop overview
              header (see the `mb-5 flex items-start justify-between` block
              below) - mobile only (md:hidden): this same "Scheduled POs"
              label block is also reused, unchanged, as the desktop narrow
              sidebar once a PO is open, which already has its own Rework
              Requests button in the per-PO detail header - without
              md:hidden this duplicated it there. */}
          {isQaReworkAdmin(orgMembership) && (
            <button
              type="button"
              onClick={() => setShowGlobalReworkReview(true)}
              title="Rework requests — all POs"
              className="md:hidden relative flex-shrink-0 px-2.5 py-1 rounded-md text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors whitespace-nowrap"
            >
              Rework Requests
              {allPendingReworkRequests.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white px-1">
                  {allPendingReworkRequests.length > 99 ? '99+' : allPendingReworkRequests.length}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {offlineListFetchedAt && (
        <div className="px-4 py-1.5 border-b border-amber-100 bg-amber-50 flex-shrink-0 text-[11px] font-medium text-amber-700">
          Offline - showing data from {new Date(offlineListFetchedAt).toLocaleString()}
        </div>
      )}

      {/* Search + sidebar collapse toggle */}
      <div className="px-3 py-2.5 border-b border-gray-200 flex-shrink-0 space-y-2">
        {selectedPo && (
          <div className="flex items-center gap-2">
            {/* Same step-back behavior as the "X" close button in the detail
                header (wizard open -> close wizard; SKU selected -> back to
                PO summary; else -> back to all POs) - this used to always
                jump straight to closePo(), skipping those intermediate
                steps the X button already does. */}
            <button
              type="button"
              onClick={() => {
                if (wizardOpen) { setCloseWizardToken(t => t + 1) }
                else if (selectedLineItem) { closeSku() }
                else closePo()
              }}
              title={selectedLineItem ? 'Back to PO summary' : 'Back to all POs'}
              className="hidden md:flex flex-shrink-0 w-9 h-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-50 hover:text-gray-900 hover:shadow transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="min-w-0">
              <div className="text-base font-extrabold text-gray-900 tracking-tight truncate">PO {selectedPo.po_number || '-'}</div>
              {selectedPo.buyer_name || selectedPo.supplier_name ? (
                <>
                  {selectedPo.buyer_name && <div className="text-xs text-gray-500 mt-0.5 truncate">{selectedPo.buyer_name}</div>}
                  {selectedPo.supplier_name && <div className="text-xs text-gray-500 truncate">{selectedPo.supplier_name}</div>}
                </>
              ) : (
                <div className="text-xs text-gray-500 mt-0.5">-</div>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {selectedPo ? (
              <input
                type="text"
                value={skuSearch}
                onChange={e => setSkuSearch(e.target.value)}
                placeholder="Search SKU number…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white transition-colors"
              />
            ) : (
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); fetchPos(e.target.value) }}
                placeholder="Search PO number…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white transition-colors"
              />
            )}
          </div>
          {/* Filters/sort - mobile only. The desktop overview's Excel-style
              per-column filter icons live in a table header that doesn't
              exist on mobile (see MobileFilterSheet.jsx's own comment); this
              button opens the same filtering logic as one bottom sheet
              instead. Sort is the mobile substitute for the desktop's
              Row/Calendar toggle - see mobileSortedRows' own comment. */}
          {!selectedPo && (
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className={`md:hidden flex-shrink-0 relative inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border shadow-sm transition-colors cursor-pointer
                ${hasActiveOverviewFilters ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18l-7 9v7l-4 2v-9z" /></svg>
              Filters
              {hasActiveOverviewFilters && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-white text-gray-900 text-[10px] font-bold">
                  {Object.values(overviewColumnFilters).filter(v => v !== null).length}
                </span>
              )}
            </button>
          )}
        </div>

        {!selectedPo && (
          <select
            value={mobileSortBy}
            onChange={e => setMobileSortBy(e.target.value)}
            className="md:hidden w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white transition-colors"
          >
            <option value="latest">Latest scheduled</option>
            <option value="exFactory">Soonest Ex-Factory</option>
          </select>
        )}

        {selectedPo && (
          <select
            value={skuStatusFilter}
            onChange={e => setSkuStatusFilter(e.target.value)}
            className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white transition-colors"
          >
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="scheduled">Scheduled</option>
            <option value="rescheduled">Re-Scheduled</option>
            <option value="rejected">Rejected</option>
          </select>
        )}

        {!selectedPo && search && (
          <button
            type="button"
            onClick={() => { setSearch(''); fetchPos('') }}
            className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* List — SKUs of the selected PO once one is chosen, otherwise the full PO list */}
      <div className="flex-1 overflow-y-auto">
        {selectedPo ? (
          <>
            {/* Wizard open: just the active SKU for context + a step nav slot.
                Always mounted (hidden via class, not unmounted) so the portal
                target exists before InspectionForm ever asks for it. */}
            <div className={`h-full flex flex-col ${wizardOpen && selectedLineItem ? '' : 'hidden'}`}>
              {selectedLineItem && (
                <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
                  <span className="text-sm font-bold text-gray-900 truncate block">{selectedLineItem.buyer_sku_ref || '-'}</span>
                  {selectedLineItem.sku_variant && <div className="text-xs text-gray-500 mt-0.5 truncate">{selectedLineItem.sku_variant}</div>}
                  <div className="text-[11px] text-gray-400 mt-1.5">Balance: {fmtQty(selectedLineItem.balance_quantity)}</div>
                </div>
              )}
              <div className="px-4 py-3 flex-1 min-h-0 flex flex-col">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex-shrink-0">Steps</div>
                <div className="relative flex-1 min-h-0">
                  <div ref={setStepNavContainer} className="h-full overflow-y-auto space-y-1 pr-1" />
                  <ScrollNav scrollEl={stepNavContainer} />
                </div>
              </div>
            </div>
            <div className={wizardOpen && selectedLineItem ? 'hidden' : ''}>
              {displayedLineItems.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-10">
                  {!selectedPo.po_line_items?.length
                    ? 'No line items on this PO'
                    : skuSearch
                      ? `No SKUs match “${skuSearch}”`
                      : skuStatusFilter !== 'all'
                        ? 'No SKUs match this status filter.'
                        : 'No SKUs scheduled on this PO yet.'}
                </p>
              ) : displayedLineItems.map(li => {
                const scheduledDate = skuScheduleInfo[li.id]
                const isRejected = !!wasAnyStageRejected(inspectionReports, li.id)
                const isCompleted = completedSkuIds.has(li.id)
                // Cumulative accepted/available across every submitted
                // Final round vs. the SKU's true order quantity - a
                // "Completed" SKU whose latest round alone reads accepted
                // can still be short of the full order if an earlier round
                // only covered part of it (see InspectionForm.jsx's
                // auto-reschedule). Same check PoSkuSummary.jsx's Overview
                // table/cards already use.
                const finalRollup = getStageRollup(inspectionReports, li.id, 'final')
                const finalCovered = finalRollup.cumulativeAccepted > 0 ? finalRollup.cumulativeAccepted : finalRollup.cumulativeAvailable
                const isPartial = isCompleted && li.quantity_ordered != null && finalCovered > 0 && finalCovered < li.quantity_ordered
                const commonProps = { li, reports: inspectionReports, completed: isCompleted, isPartial }
                const want = key => skuStatusFilter === 'all' || skuStatusFilter === key
                // Rejected + a fresh re-schedule already booked (the common
                // case - see InspectionForm.jsx's submit handler) shows as
                // two cards: what happened, and what's next - each with its
                // own cardKey so clicking one doesn't also highlight the other.
                // The status filter can show just one of the pair, or hide
                // this SKU entirely if neither matches.
                if (isCompleted) {
                  if (!want('completed')) return null
                  return <SkuListRow key={li.id} {...commonProps} selected={selectedCardKey === li.id} onSelect={selectLineItem} />
                }
                if (isRejected && scheduledDate) {
                  const cards = []
                  if (want('rejected')) {
                    cards.push(
                      <SkuListRow key={`${li.id}:rejected`} {...commonProps} scheduledDate={scheduledDate} hideScheduled locked={want('rescheduled') && selectedCardKey !== `${li.id}:rejected`}
                        selected={selectedCardKey === `${li.id}:rejected`} onSelect={() => selectLineItem(li, `${li.id}:rejected`)} />
                    )
                  }
                  if (want('rescheduled')) {
                    cards.push(
                      <SkuListRow key={`${li.id}:rescheduled`} {...commonProps} scheduledDate={scheduledDate} hideRejected rescheduled
                        selected={selectedCardKey === `${li.id}:rescheduled`} onSelect={() => selectLineItem(li, `${li.id}:rescheduled`)} />
                    )
                  }
                  return cards.length ? <div key={li.id}>{cards}</div> : null
                }
                if (isRejected) {
                  if (!want('rejected')) return null
                  return <SkuListRow key={li.id} {...commonProps} scheduledDate={null} selected={selectedCardKey === li.id} onSelect={selectLineItem} />
                }
                if (!want('scheduled')) return null
                return <SkuListRow key={li.id} {...commonProps} scheduledDate={scheduledDate} selected={selectedCardKey === li.id} onSelect={selectLineItem} />
              })}
            </div>
          </>
        ) : (
          <>
            {loading && (
              <div className="space-y-0">
                {[0, 1, 2].map(i => <PoCardSkeleton key={i} />)}
              </div>
            )}
            {!loading && fetchError && (
              <FetchErrorCard message={fetchError} onRetry={() => fetchPos(search)} />
            )}
            {!loading && !fetchError && displayedPos.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-10 px-4">
                {isRestricted && pos.length === 0
                  ? (isAdminRole ? 'No inspections currently scheduled.' : 'Nothing scheduled to you yet - check Inspection Schedule.')
                  : pos.length === 0 ? 'No open POs found' : 'No POs match the filters'}
              </p>
            )}
            {/* Column filters (MobileFilterSheet) reduce mobileSortedRows
                further than displayedPos.length===0 above would ever catch -
                a distinct empty case (filters excluded everything) from
                "there's genuinely nothing scheduled", with its own way back
                out (matches the desktop table's identical situation/message,
                see filteredOverviewRows' own empty-state above). */}
            {!loading && !fetchError && displayedPos.length > 0 && mobileSortedRows.length === 0 && (
              <div className="text-center py-10 px-4">
                <p className="text-xs text-gray-400">No POs match the selected filters.</p>
                <button
                  type="button"
                  onClick={clearOverviewFilters}
                  className="mt-1.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                >
                  Clear filters
                </button>
              </div>
            )}
            {!loading && !fetchError && mobileSortedRows.map(({ po, entry }) => (
              <MobileScheduledPoCard key={po.id} po={po} entry={entry} selected={selectedPo?.id === po.id} onSelect={selectPo} exFactory={exFactory} availableOffline={cachedPoIds.has(po.id)} />
            ))}
          </>
        )}
      </div>
    </div>
  )

  // ── Detail panel ──────────────────────────────────────────────────────────
  const detail = selectedPo ? (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-gray-50 w-full">

      {/* Header — back button on mobile, close X on desktop */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2 min-w-0">
            {/* Back button — mobile only */}
            <button
              type="button"
              onClick={() => {
                if (wizardOpen) { setCloseWizardToken(t => t + 1) }
                else if (selectedLineItem) { closeSku() }
                else closePo()
              }}
              className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 mt-0.5"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            {/* Scheduled POs panel toggle - desktop only, sits right next to
                the SKU/PO label rather than the doc/history icon row so it
                reads as "collapse the thing on the left of this", not one
                more icon in an unrelated action cluster. */}
            <button
              type="button"
              onClick={() => setSidebarCollapsed(c => !c)}
              title={sidebarCollapsed ? 'Show Scheduled POs panel' : 'Collapse Scheduled POs panel'}
              className="hidden md:flex flex-shrink-0 w-10 h-10 items-center justify-center rounded-lg hover:bg-gray-100 text-gray-700 mt-0.5"
            >
              {/* Sidebar-panel icon - a rounded panel split into two sections
                  with a chevron in the narrow one, pointing the direction the
                  click sends it: left (« collapse) while the panel's open,
                  mirrored to the right side pointing right (» expand) once
                  it's closed. */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="4" transform={sidebarCollapsed ? 'scale(-1, 1) translate(-24, 0)' : undefined} />
                <path d="M9 3v18" transform={sidebarCollapsed ? 'scale(-1, 1) translate(-24, 0)' : undefined} />
                <polyline points="7.5 9 5.5 12 7.5 15" transform={sidebarCollapsed ? 'scale(-1, 1) translate(-24, 0)' : undefined} />
              </svg>
            </button>
            <div className="min-w-0">
              <div className="text-sm font-bold text-gray-900 flex items-center gap-3">
                {selectedLineItem ? (
                  <>
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-gray-900 text-white text-sm font-bold whitespace-nowrap">
                      SKU {selectedLineItem.buyer_sku_ref || '-'}
                    </span>
                    {selectedLineItem.sku_variant && (
                      <span className="text-xs font-medium text-gray-500 truncate">{selectedLineItem.sku_variant}</span>
                    )}
                  </>
                ) : (
                  <span className="text-xs font-medium text-gray-400">SKUs of {selectedPo.po_number || '-'}</span>
                )}
                {/* Was md:flex - at 768-1023px (a real tablet width, not just
                    a gap between phone/desktop) this strip plus the SKU
                    badge, AQL button, doc chips and history icon all fighting
                    for one unwrapping row forced the whole header into
                    horizontal scroll. lg: matches the app shell's own
                    hamburger cutoff (Sidebar.jsx), so "desktop chrome" and
                    "this meta strip" now agree on where tablet ends. */}
                <div className="hidden lg:flex items-start gap-4 flex-shrink-0">
                  {[
                    { label: 'Ex-Factory', value: exFactory(selectedPo) },
                    selectedLineItem
                      ? { label: 'SKU Qty', value: fmtQty(selectedLineItem.quantity_ordered) }
                      : { label: 'Total Qty', value: fmtQty(selectedPo.quantity_ordered) },
                    // AQL sample size for this SKU's lot — same lookup already
                    // used for the "Sample Plan" column on the PO overview
                    // grid (PoSkuSummary.jsx) and by InspectionForm.jsx.
                    ...(selectedLineItem ? (() => {
                      const plan = resolveSamplingPlan({ lotSize: selectedLineItem.quantity_ordered, inspectionLevel: selectedPo.inspection_level })
                      return [{ label: 'Insp. Qty', value: plan ? `${plan.codeLetter} (${plan.sampleSize})` : null }]
                    })() : []),
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                        {label}
                        {label === 'Insp. Qty' && (
                          <button
                            type="button"
                            onClick={() => setShowAqlChart(true)}
                            title="Reference AQL charts"
                            className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-orange-50 text-orange-500 hover:bg-orange-100 hover:text-orange-600 transition-colors cursor-pointer normal-case whitespace-nowrap"
                          >
                            AQL Chart
                          </button>
                        )}
                      </div>
                      <div className="text-xs font-semibold text-gray-800 mt-0.5">{value || '-'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Desktop - unchanged: one unwrapped row. Rework Requests' pill
              label plus PO Doc/history/comment/close all fighting for
              space in one line is exactly what forced horizontal scroll on
              mobile - restacked into its own md:hidden block below instead,
              same "N-up grid for short pills" convention already used for
              the stage tabs (InspectionReportEntry.jsx). PI Doc removed -
              only PO Doc stays here now. */}
          <div className="hidden md:flex items-center gap-1 flex-shrink-0">
            {isQaReworkAdmin(orgMembership) && (
              <button
                type="button"
                onClick={() => setShowReworkReview(true)}
                title="Rework requests"
                className="relative px-2 py-1 rounded-md text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors whitespace-nowrap"
              >
                Rework Requests
                {pendingReworkRequests.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white px-1">
                    {pendingReworkRequests.length > 99 ? '99+' : pendingReworkRequests.length}
                  </span>
                )}
              </button>
            )}
            <DocChip url={publicUrl(selectedPo.po_file_url)} label="PO Doc" onPreview={(url) => setDocPreview({ url, label: 'PO Doc' })} />
            {selectedLineItem && (
              <button
                type="button"
                onClick={() => setShowSkuHistory(true)}
                title="Inspection history"
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M12 7v5l4 2" />
                </svg>
              </button>
            )}
            {selectedLineItem && (
              <button
                type="button"
                onClick={() => setShowSkuComments(true)}
                title="Comments for this SKU"
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </button>
            )}
            {/* Close — desktop only. If a SKU is selected, step back to the PO
                summary first; only exits the PO entirely on a second click. */}
            <button
              type="button"
              onClick={() => {
                if (wizardOpen) { setCloseWizardToken(t => t + 1) }
                else if (selectedLineItem) { closeSku() }
                else closePo()
              }}
              title={selectedLineItem ? 'Back to PO summary' : 'Close'}
              className="flex w-7 h-7 items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Mobile - same buttons, restacked instead of one unwrapped row:
              Rework Requests/PO Doc as a 2-up grid (short pills, same
              convention as the stage tabs' N-up grid), history/comment on
              their own row underneath. Close isn't repeated here - mobile
              already has the dedicated back-button at the top-left of this
              header for that. */}
          <div className="md:hidden w-full space-y-1.5">
            {/* PO Doc always renders here (even with no file yet) -
                matching the desktop row's own DocChip call just above,
                which always shows a "No PO Doc" placeholder pill rather
                than disappearing - this grid used to be gated on
                po_file_url being truthy, which hid that "no doc uploaded
                yet" signal entirely on mobile whenever it was missing.
                PI Doc removed - only PO Doc stays here now (was a 3-up
                grid with PI Doc, now 2-up without it). */}
            <div className="grid grid-cols-2 gap-1.5">
              {isQaReworkAdmin(orgMembership) && (
                <button
                  type="button"
                  onClick={() => setShowReworkReview(true)}
                  title="Rework requests"
                  className="relative px-2 py-1.5 rounded-md text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors truncate"
                >
                  Rework Requests
                  {pendingReworkRequests.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white px-1">
                      {pendingReworkRequests.length > 99 ? '99+' : pendingReworkRequests.length}
                    </span>
                  )}
                </button>
              )}
              <DocChip url={publicUrl(selectedPo.po_file_url)} label="PO Doc" onPreview={(url) => setDocPreview({ url, label: 'PO Doc' })} />
            </div>
            {selectedLineItem && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowSkuHistory(true)}
                  title="Inspection history"
                  className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M12 7v5l4 2" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSkuComments(true)}
                  title="Comments for this SKU"
                  className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {!navigator.onLine && !cachedPoDetail && (
        <div className="flex-shrink-0 bg-amber-50 border-b border-amber-100 px-4 py-2.5 text-xs font-medium text-amber-700">
          {PLAN_OFFLINE_ENABLED
            ? "This PO hasn't been opened while online yet, so it's not available offline. Connect once to load it."
            : "You're offline. Connect to the internet to work on this PO."}
        </div>
      )}

      {/* Body — per-SKU Final Inspection Report wizard */}
      <InspectionReportEntry
        po={selectedPo}
        selectedLineItem={selectedLineItem}
        onSelectLineItem={selectLineItem}
        reports={inspectionReports}
        loading={inspectionReportsLoading}
        refresh={refreshPoData}
        userName={userName}
        userEmail={userEmail}
        memberId={orgMembership?.memberId}
        canManage={canComment}
        onWizardOpenChange={setWizardOpen}
        stepNavContainer={stepNavContainer}
        closeWizardToken={closeWizardToken}
        onPoPatched={patchSelectedPo}
        scheduleByStage={getScheduleEntryForSku}
        scheduledSkuIds={scheduledSkuIds}
        visibleTodaySkuIds={visibleTodaySkuIds}
        viewingRejectedFinal={!!selectedLineItem && selectedCardKey === `${selectedLineItem.id}:rejected`}
        onOpenComments={() => setShowSkuComments(true)}
      />
    </div>
  ) : (
    // Empty state — desktop only (mobile shows list when nothing selected).
    // Full-width overview of the same POs already in the sidebar: 2 KPI
    // tiles + a detail table, one row per PO with every scheduled stage
    // shown as a chip. Rows are clickable and reuse selectPo, so this
    // doubles as an alternate PO picker instead of being purely decorative.
    <div className="hidden md:flex flex-1 flex-col min-h-0 overflow-y-auto bg-gray-50 p-4 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-gray-900 tracking-tight">
            {isRestricted ? 'Scheduled POs' : 'Open POs'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Select a PO to view line items and inspection reports</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* PLAN OFFLINE (disabled): "Download for Offline" is hidden. */}
          {PLAN_OFFLINE_ENABLED && (
            <DownloadForOfflineButton
              pos={pos} selectedPoIds={selectedForDownload} scheduleRestrictEmailRef={scheduleRestrictEmailRef} memberIdRef={memberIdRef}
              setCachedPoIds={setCachedPoIds}
            />
          )}
          {/* Same Rework Requests entry point as the per-PO header (see
              showReworkReview above), just scoped to every PO instead of one -
              for when a QA admin wants to review requests without first
              picking a PO. */}
          {isQaReworkAdmin(orgMembership) && (
            <button
              type="button"
              onClick={() => setShowGlobalReworkReview(true)}
              title="Rework requests — all POs"
              className="relative flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors whitespace-nowrap"
            >
              Rework Requests
              {allPendingReworkRequests.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white px-1">
                  {allPendingReworkRequests.length > 99 ? '99+' : allPendingReworkRequests.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm flex flex-col flex-1 min-h-0">
        <div className="p-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-900 uppercase tracking-wide">
            {hasActiveOverviewFilters && (
              <button
                type="button"
                onClick={clearOverviewFilters}
                className="normal-case font-semibold text-[11px] text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
              >
                Clear filters
              </button>
            )}
          </div>
          {/* Search sits in the middle of the header, right after the title (it also searches the
              Calendar view: both read off the same displayedPos/poScheduleEntriesByPo pipeline this
              term drives). The Row/Calendar toggle stays at the right end. */}
          <div className="relative flex-1 min-w-[220px] max-w-2xl">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); fetchPos(e.target.value) }}
              placeholder="Search PO number…"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white transition-colors"
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap ml-auto">
            <div className="flex items-center gap-1 bg-gray-100/70 p-1 rounded-lg">
              {[{ key: 'row', label: 'Row' }, { key: 'calendar', label: 'Calendar' }].map(v => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setScheduledPosView(v.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${scheduledPosView === v.key ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:bg-white hover:text-gray-900'}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {scheduledPosView === 'calendar' ? (
          <div className="flex-1 min-h-0 overflow-auto p-3.5">
            <ScheduledPosCalendar entriesByPo={poScheduleEntriesByPo} pos={displayedPos} />
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-10"><Spinner /></div>
        ) : scheduledPosOverview.rows.length === 0 ? (
          <p className="text-xs text-gray-400 italic px-3.5 py-6 text-center">
            {search.trim()
              ? `No POs match “${search.trim()}”.`
              : isRestricted
                ? (isAdminRole ? 'No inspections currently scheduled.' : 'Nothing scheduled to you yet - check Inspection Schedule.')
                : 'No open POs found.'}
          </p>
        ) : (
          // Bounded + independently scrollable (with its own jump buttons) so
          // this table is never at the mercy of the outer panel's own scroll
          // - a long list (45+ POs) always stays fully reachable right here.
          <div className="relative flex-1 min-h-0">
            <div ref={setOverviewTableEl} className="h-full overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    {/* PLAN OFFLINE (disabled): the download-selection column is hidden. */}
                    {PLAN_OFFLINE_ENABLED && (
                      <th className="text-left px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={filteredOverviewRows.length > 0 && filteredOverviewRows.every(({ po }) => selectedForDownload.has(po.id))}
                          onChange={toggleSelectAllForDownload}
                          title="Select all rows shown for Download for Offline"
                          className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="text-left px-3.5 py-2.5">Inspection No.</th>
                    <th className="text-left px-3.5 py-2.5">PO</th>
                    <ExcelFilterHeader
                      label="Customer" options={overviewCustomerOptions}
                      selected={overviewColumnFilters.customer} onChange={v => setOverviewFilter('customer', v)}
                      isOpen={openFilterCol === 'customer'} onToggle={() => toggleFilterCol('customer')} onClose={() => setOpenFilterCol(null)}
                    />
                    <ExcelFilterHeader
                      label="Vendor" options={overviewVendorOptions}
                      selected={overviewColumnFilters.vendor} onChange={v => setOverviewFilter('vendor', v)}
                      isOpen={openFilterCol === 'vendor'} onToggle={() => toggleFilterCol('vendor')} onClose={() => setOpenFilterCol(null)}
                    />
                    <ExcelFilterHeader
                      label="Region" options={overviewRegionOptions}
                      selected={overviewColumnFilters.region} onChange={v => setOverviewFilter('region', v)}
                      isOpen={openFilterCol === 'region'} onToggle={() => toggleFilterCol('region')} onClose={() => setOpenFilterCol(null)}
                    />
                    <th className="text-left px-3.5 py-2.5">Ex-Factory</th>
                    <th className="text-left px-3.5 py-2.5">Qty</th>
                    <th className="text-left px-3.5 py-2.5">Scheduled SKUs</th>
                    <th className="text-left px-3.5 py-2.5">Accepted SKUs</th>
                    <ExcelFilterHeader
                      label="Assigned QA" options={overviewScheduledByOptions}
                      selected={overviewColumnFilters.scheduledBy} onChange={v => setOverviewFilter('scheduledBy', v)}
                      isOpen={openFilterCol === 'scheduledBy'} onToggle={() => toggleFilterCol('scheduledBy')} onClose={() => setOpenFilterCol(null)}
                    />
                    <ExcelFilterHeader
                      label="Stage" options={overviewStageOptions}
                      selected={overviewColumnFilters.stage} onChange={v => setOverviewFilter('stage', v)}
                      formatLabel={stage => STAGE_ABBR[stage] || stage}
                      isOpen={openFilterCol === 'stage'} onToggle={() => toggleFilterCol('stage')} onClose={() => setOpenFilterCol(null)}
                    />
                    <th className="text-left px-3.5 py-2.5">Date</th>
                    <ExcelFilterHeader
                      label="Status" options={overviewStatusOptions}
                      selected={overviewColumnFilters.status} onChange={v => setOverviewFilter('status', v)}
                      formatLabel={s => ENTRY_STATUS_LABEL[s] || s}
                      isOpen={openFilterCol === 'status'} onToggle={() => toggleFilterCol('status')} onClose={() => setOpenFilterCol(null)}
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredOverviewRows.length === 0 ? (
                    // Header (and its filter icons) stays visible even here -
                    // this used to be a separate branch that swapped the
                    // whole table out for a bare message, taking the filter
                    // controls down with it and leaving no way back in
                    // besides the "Clear filters" link above.
                    <tr>
                      <td colSpan={PLAN_OFFLINE_ENABLED ? 14 : 13} className="text-xs text-gray-400 italic px-3.5 py-6 text-center">No rows match the selected filters.</td>
                    </tr>
                  ) : filteredOverviewRows.map(({ po, entry }, idx) => (
                    <ScheduledPoRow
                      key={entry?.id || po.id} po={po} entry={entry} selected={selectedPo?.id === po.id} onSelect={selectPo} exFactory={exFactory} inspectionNo={idx + 1}
                      downloadChecked={selectedForDownload.has(po.id)} onToggleDownloadCheck={toggleSelectedForDownload}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <ScrollNav scrollEl={overviewTableEl} />
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col md:flex-row overflow-hidden" style={{ height: 'calc(100svh - 72px)' }}>
      <ReconnectSyncScreen pos={pos} userName={userName} />
      {poList}
      {detail}
      {showSkuComments && selectedPo && (
        <SkuCommentsModal
          po={selectedPo}
          lineItem={selectedLineItem}
          userName={userName}
          canComment={canComment}
          onClose={() => setShowSkuComments(false)}
        />
      )}
      {showSkuHistory && selectedLineItem && (
        <InspectionHistoryModal lineItem={selectedLineItem} onClose={() => setShowSkuHistory(false)} />
      )}
      {showAqlChart && <AqlChartModal onClose={() => setShowAqlChart(false)} />}
      {showReworkReview && selectedPo && (
        <ReworkReviewModal
          poId={selectedPo.id}
          requests={reworkRequests}
          lineItems={selectedPo.po_line_items}
          userName={userName}
          userEmail={userEmail}
          onClose={() => setShowReworkReview(false)}
          onReviewed={() => { refreshReworkRequests(); refreshPoData() }}
        />
      )}
      {showGlobalReworkReview && (
        <ReworkReviewModal
          requests={allReworkRequests}
          lineItems={[]}
          userName={userName}
          userEmail={userEmail}
          onClose={() => setShowGlobalReworkReview(false)}
          onReviewed={() => refreshAllReworkRequests()}
        />
      )}
      {docPreview && <DocPreviewModal url={docPreview.url} label={docPreview.label} onClose={() => setDocPreview(null)} />}
      {mobileFiltersOpen && (
        <MobileFilterSheet
          sections={[
            { key: 'customer', label: 'Customer', options: overviewCustomerOptions, selected: overviewColumnFilters.customer, onChange: v => setOverviewFilter('customer', v) },
            { key: 'vendor', label: 'Vendor', options: overviewVendorOptions, selected: overviewColumnFilters.vendor, onChange: v => setOverviewFilter('vendor', v) },
            { key: 'region', label: 'Region', options: overviewRegionOptions, selected: overviewColumnFilters.region, onChange: v => setOverviewFilter('region', v) },
            { key: 'scheduledBy', label: 'Assigned QA', options: overviewScheduledByOptions, selected: overviewColumnFilters.scheduledBy, onChange: v => setOverviewFilter('scheduledBy', v) },
            { key: 'stage', label: 'Stage', options: overviewStageOptions, selected: overviewColumnFilters.stage, onChange: v => setOverviewFilter('stage', v), formatLabel: stage => STAGE_ABBR[stage] || stage },
            { key: 'status', label: 'Status', options: overviewStatusOptions, selected: overviewColumnFilters.status, onChange: v => setOverviewFilter('status', v), formatLabel: s => ENTRY_STATUS_LABEL[s] || s },
          ]}
          resultCount={filteredOverviewRows.length}
          onClear={clearOverviewFilters}
          onClose={() => setMobileFiltersOpen(false)}
        />
      )}
    </div>
  )
}
