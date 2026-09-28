import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { fetchPlanAbortedLog } from '../../hooks/useInspectionReports'
import { RESULT_LABEL, RESULT_BADGE_CLASS, ACCEPTED_RESULTS, INSPECTION_RESULT_OPTIONS } from './inspectionReport/stageStatus'
import { getOrderQty, getInspectorDisplayName } from '../../utils/qcReportReaders'
import CalloutModal from './inspectionReport/CalloutModal'
import { useSwipeTabs } from '../../hooks/useSwipeTabs'
import { useLongPress } from '../../hooks/useLongPress'
import { publicUrl } from '../orderManagement/poUtils'
import PiPreviewPanel from '../orderManagement/PiPreviewPanel'
import { SkuCheckbox } from './CalloutSkuPicker'
import { useProfileStore } from '../../stores/profileStore'

const STAGE_LABELS = ['IL', 'ML', 'FN']
// Same Inline/Midline/Final tab pattern QcReportsSummary.jsx's own
// GeneratedReportsModal uses (STAGE_TABS/activeStageTab), reused here for
// the same reason: `group.skuGroupsByStage[key]` (repositoryLayout.js)
// already buckets independently per stage, so a SKU that's gone all the
// way to Final still shows up under Midline/Inline too.
const STAGE_TABS = [{ key: 'inline', label: 'Inline' }, { key: 'midline', label: 'Midline' }, { key: 'final', label: 'Final' }]

// Narrows the stage tab's own rows by result - Cancelled is its own row
// source entirely (see cancelledSkuGroups below), not a stage-scoped filter.
// Each one's active state uses the same color its rows already read as
// elsewhere (RESULT_BADGE_CLASS's emerald/red), rather than one flat color
// for every active tab - "Accepted" active should look green, not black.
// No 'all' entry - resultFilter is null by default (nothing selected shows
// everything, no separate "All" pill needed for that), and clicking the
// already-active pill again clears it back to null instead of needing a
// dedicated button to get back to "everything".
const RESULT_FILTER_COLORS = {
  accepted:                 'bg-emerald-600 text-white',
  partially_accepted:       'bg-yellow-500 text-white',
  accepted_with_deviations: 'bg-emerald-600 text-white',
  rejected:                 'bg-red-600 text-white',
  on_hold:                  'bg-blue-600 text-white',
  feedback_inprogress:      'bg-indigo-600 text-white',
  plan_aborted:             'bg-orange-600 text-white',
  cancelled:                'bg-amber-600 text-white',
}
// Derived from INSPECTION_RESULT_OPTIONS (stageStatus.jsx) - the single
// canonical list of every result a report can actually be submitted with -
// instead of a hand-picked subset. This IS the rule going forward: a new
// result type added there (the Sign-off dropdown's own source of truth)
// automatically gets its own filter pill here too, no second edit to
// remember. 'cancelled' is appended separately - not an inspection_result
// value at all, a quantity-cancellation concept with its own row source
// (cancelledSkuGroups below).
const RESULT_FILTERS = [
  ...INSPECTION_RESULT_OPTIONS.map(({ value, label }) => ({
    key: value, label, activeClass: RESULT_FILTER_COLORS[value] || 'bg-gray-600 text-white',
  })),
  { key: 'cancelled', label: 'Cancelled', activeClass: RESULT_FILTER_COLORS.cancelled },
]

// Same "YYYY-MM-DD"-vs-full-timestamp handling QcReportsSummary.jsx's own
// fmtDisplayDate uses, kept as a small local copy here rather than an
// export neither file currently has.
function fmtDisplayDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`)
  return isNaN(d) ? dateStr : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ExportIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}

// A report only links back to a schedule via fulfilled_schedule_id when it
// was submitted through the flow that sets it - a good chunk of reports
// (bulk-accepted, or submitted before that linking existed) have neither
// that link nor a free-text inspector_name, even though a real schedule
// entry assigning a QA to this SKU still exists. Three-step fallback, each
// step only used once the previous one comes up empty:
//   1. An exact-stage schedule entry covering this SKU (no line_items
//      subset = whole-PO, or an explicit match) - same "does this entry
//      cover this SKU" check PoInspectionComments.jsx's own
//      getScheduleEntryForSku already uses.
//   2. Any OTHER stage's schedule entry covering this SKU - a stage that
//      was never formally scheduled (e.g. Inline skipped straight to
//      submission) can still often be attributed to whoever's scheduled
//      for this SKU's other stages, same person in practice.
//   3. The PO's own single assigned QA (singleQaName, only set when every
//      report on the whole PO names exactly one QA) - the last resort
//      when nothing SKU-specific exists at all, deliberately NOT used when
//      more than one QA touched this PO, to avoid misattributing a SKU to
//      the wrong one of several.
function resolveFallbackInspector(scheduleAssignments, stageKey, skuKey, singleQaName) {
  const coveredBy = (stage) => (scheduleAssignments || []).find(s =>
    (!stage || s.inspectionType === stage) && (!s.lineItems?.length || s.lineItems.some(li => li.id === skuKey))
  )
  return coveredBy(stageKey)?.qaName ?? coveredBy(null)?.qaName ?? singleQaName ?? null
}

// Most recent result THIS report was submitted with that differs from its
// current one - see supersededByReportId above. Only the latest distinct
// prior value, not the full history (this is a compact table column, not
// the Activity Log's own dedicated panel).
function previousResult(report, logsByReportId) {
  const logs = report?.id && logsByReportId[report.id]
  if (!logs?.length) return null
  for (let i = logs.length - 1; i >= 0; i--) {
    if (logs[i].result !== report.inspection_result) return logs[i].result
  }
  return null
}

function SkuRow({ sg, selected, onToggleSelect, onExport, scheduleAssignments, singleQaName, supersededByReportId }) {
  const report = sg.reports[0]
  const result = report?.inspection_result
  const prevResult = previousResult(report, supersededByReportId)
  const inspectorName = getInspectorDisplayName(report) || resolveFallbackInspector(scheduleAssignments, report?.inspection_type, sg.skuKey, singleQaName)
  // The order quantity alone (getOrderQty) reads as "this much was
  // submitted" - misleading when the SKU's true covered total (summed
  // across every submitted round at this stage, not just the single latest
  // one this row displays - see sg.cumulativeAccepted/cumulativeAvailable
  // from repositoryLayout.js's getStageRollup call) is still short of it.
  // Cumulative, not just this one report's own number, so a SKU whose
  // leftover was later covered by a follow-up round correctly reads as
  // fully done again rather than forever comparing only the latest round.
  const orderQty = getOrderQty(report)
  const coveredQty = sg.cumulativeAccepted > 0 ? sg.cumulativeAccepted : (sg.cumulativeAvailable > 0 ? sg.cumulativeAvailable : null)
  const isPartial = coveredQty != null && orderQty != null && coveredQty < orderQty
  const qtyCell = isPartial ? `${coveredQty} / ${orderQty}` : (orderQty ?? '-')
  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-white transition-colors">
      <td className="px-4 py-2.5 w-8">
        <SkuCheckbox checked={selected} onToggle={onToggleSelect} label={`Select ${sg.skuRef || 'SKU'} for download`} />
      </td>
      <td className="px-2 py-2.5">
        <span className={`text-xs font-bold ${sg.rejected ? 'text-red-700' : 'text-gray-900'}`}>{sg.skuRef || '-'}</span>
        {/* This SKU's own current round already got a fresh re-inspection
            past this one - this row is history, not the current state, so
            it's tagged the same way PoSkuSummary.jsx's Overview table tags
            a rejected-then-rescheduled SKU ("Rejected · R1"). */}
        {sg.historicalRejection && (
          <span className="ml-1.5 inline-flex items-center px-1.5 py-[1px] rounded-sm bg-red-50 text-red-700 text-[9px] font-bold leading-none align-middle ring-1 ring-red-200">
            Rejected · R{report?.round ?? 1}
          </span>
        )}
      </td>
      <td className="px-2 py-2.5 text-xs text-gray-600 whitespace-nowrap">{orderQty ?? '-'}</td>
      <td className="px-2 py-2.5 text-xs text-gray-600 whitespace-nowrap">{qtyCell}</td>
      <td className="px-2 py-2.5">
        <span className="text-[10px] font-bold uppercase text-gray-400">{STAGE_LABELS[sg.highestStage] || '-'}</span>
      </td>
      <td className="px-2 py-2.5">
        {/* Cumulative quantity still short of the order overrides the label
            to "Partially Accepted (X of Y)" regardless of which literal
            verdict word this round itself used (a round can be a plain
            "accepted" and the SKU still read as partial overall, if an
            earlier round already used up part of the order) - only for an
            accepted-ish result; a genuine rejection keeps its own label and
            color untouched. */}
        {isPartial && ACCEPTED_RESULTS.includes(result) ? (
          // No quantity in the label itself - the QTY column right next to
          // this already shows the same "75 / 150" breakdown, so repeating
          // it here would just be redundant.
          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap bg-amber-50 text-amber-700">
            Partially Accepted
          </span>
        ) : (
          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${RESULT_BADGE_CLASS[result] || 'bg-gray-100 text-gray-500'}`}>
            {RESULT_LABEL[result] || 'Pending'}
          </span>
        )}
      </td>
      <td className="px-2 py-2.5">
        {/* This SAME round's own earlier verdict, before it got reopened
            and resubmitted as something else - not a separate round (see
            historicalRejection above, which IS one), just the one prior
            word worth keeping - see addInspectionReportLog's result param. */}
        {prevResult ? (
          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap opacity-70 ${RESULT_BADGE_CLASS[prevResult] || 'bg-gray-100 text-gray-500'}`} title="This round's earlier result, before it was resubmitted">
            {RESULT_LABEL[prevResult] || prevResult}
          </span>
        ) : (
          <span className="text-xs text-gray-300">-</span>
        )}
      </td>
      <td className="px-2 py-2.5 text-xs text-gray-600 whitespace-nowrap font-mono">{report?.report_no || '-'}</td>
      <td className="px-2 py-2.5 text-xs text-gray-600 whitespace-nowrap">{fmtDisplayDate(report?.submitted_at)}</td>
      <td className="px-2 py-2.5 text-xs text-gray-600 whitespace-nowrap">{inspectorName || '-'}</td>
      <td className="px-4 py-2.5 text-right">
        <button
          type="button"
          aria-label={`Export ${sg.skuRef || 'SKU'}`}
          onClick={onExport}
          className="w-6 h-6 inline-flex items-center justify-center rounded text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <ExportIcon />
        </button>
      </td>
    </tr>
  )
}

// Mobile counterpart to SkuRow - same data, stacked into a card instead of
// table cells (the table's min-w-[640px] forced horizontal scroll on a
// phone regardless of container width). Long-press enters select mode
// (useLongPress, same gesture PoSkuSummary.jsx's own SKU cards use) rather
// than relying on a small 14px checkbox hit-target; once in select mode, a
// tap anywhere on the card toggles it instead of opening anything (there's
// nothing to "open" per-SKU here - Export is the only per-SKU action, and
// its own button already stops propagation).
function SkuCard({ sg, selected, selectMode, onToggleSelect, onEnterSelectMode, onExport, scheduleAssignments, singleQaName }) {
  const report = sg.reports[0]
  const result = report?.inspection_result
  const inspectorName = getInspectorDisplayName(report) || resolveFallbackInspector(scheduleAssignments, report?.inspection_type, sg.skuKey, singleQaName)
  const orderQty = getOrderQty(report)
  const coveredQty = sg.cumulativeAccepted > 0 ? sg.cumulativeAccepted : (sg.cumulativeAvailable > 0 ? sg.cumulativeAvailable : null)
  const isPartial = coveredQty != null && orderQty != null && coveredQty < orderQty
  const qtyCell = isPartial ? `${coveredQty} / ${orderQty}` : (orderQty ?? '-')
  const longPress = useLongPress({
    onLongPress: () => onEnterSelectMode(sg.skuKey),
    onClick: () => {},
  })
  return (
    <div
      {...(selectMode ? { onClick: () => onToggleSelect(sg.skuKey) } : longPress)}
      className="border border-gray-200 rounded-lg bg-white p-2 space-y-1 active:bg-gray-50 transition-colors cursor-pointer"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {selectMode && (
            <SkuCheckbox checked={selected} onToggle={() => onToggleSelect(sg.skuKey)} label={`Select ${sg.skuRef || 'SKU'} for download`} />
          )}
          <span className={`text-sm font-bold truncate ${sg.rejected ? 'text-red-700' : 'text-gray-900'}`}>{sg.skuRef || '-'}</span>
          {sg.historicalRejection && (
            <span className="flex-shrink-0 inline-flex items-center px-1.5 py-[1px] rounded-sm bg-red-50 text-red-700 text-[9px] font-bold leading-none ring-1 ring-red-200">
              Rejected · R{report?.round ?? 1}
            </span>
          )}
          {/* Result badge - sits right of the SKU number on its own line
              below, not tucked under the Export button. */}
          {isPartial && ACCEPTED_RESULTS.includes(result) ? (
            <span className="flex-shrink-0 inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">
              Partially Accepted
            </span>
          ) : (
            <span className={`flex-shrink-0 inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${RESULT_BADGE_CLASS[result] || 'bg-gray-100 text-gray-500'}`}>
              {RESULT_LABEL[result] || 'Pending'}
            </span>
          )}
        </div>
        {!selectMode && (
          <button
            type="button"
            aria-label={`Export ${sg.skuRef || 'SKU'}`}
            onClick={(e) => { e.stopPropagation(); onExport() }}
            className="flex-shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <ExportIcon size={18} />
          </button>
        )}
      </div>
      <div className="pt-1 border-t border-gray-100 space-y-1 text-[11px] leading-tight">
        <div className="grid grid-cols-3 gap-x-3">
          <div>
            <div className="text-gray-400">Qty.</div>
            <div className="text-gray-700">{qtyCell}</div>
          </div>
          <div>
            <div className="text-gray-400">Stage</div>
            <div className="font-bold uppercase text-gray-500">{STAGE_LABELS[sg.highestStage] || '-'}</div>
          </div>
          <div className="min-w-0">
            <div className="text-gray-400">Inspection No.</div>
            <div className="text-gray-600 font-mono truncate">{report?.report_no || '-'}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3">
          <div>
            <div className="text-gray-400">Submitted</div>
            <div className="text-gray-600">{fmtDisplayDate(report?.submitted_at)}</div>
          </div>
          <div className="min-w-0">
            <div className="text-gray-400">Inspector</div>
            <div className="text-gray-600 truncate">{inspectorName || '-'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DownloadIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
function Spinner({ size = 'w-3 h-3' }) {
  return (
    <svg className={`${size} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

// One batch's resolved SKU list ({ sku_ref, inspection_type, round }[]),
// sorted, deduped by nothing in particular (a batch can legitimately list
// the same SKU twice if two different stages/rounds of it were both picked
// for that export) - same reasoning stageSkuGroups elsewhere in this file
// never collapses a SKU across stages either.
function batchSkuList(batch, getReportInfo) {
  return (batch.report_ids || [])
    .map(id => getReportInfo(id))
    .filter(Boolean)
    .sort((a, b) => (a.sku_ref || '').localeCompare(b.sku_ref || ''))
}

// Distinct stage abbreviations (IL/ML/FN) a batch's SKUs actually cover, in
// Inline/Midline/Final order regardless of which order they happen to
// appear in `skus` - which stages this combined document was for, at a
// glance, rather than a per-SKU breakdown (that's what the SKUs hover
// popover is for).
function batchStageLabels(skus) {
  const present = new Set(skus.map(s => s.inspection_type))
  return STAGE_TABS
    .map((t, i) => (present.has(t.key) ? STAGE_LABELS[i] : null))
    .filter(Boolean)
}

// Combined Reports tab content - every TWFCMB... batch ever generated for
// this PO, newest first, each re-downloadable via the same server-side
// generator (fetchInspectionReportPdf) ExportPicker's own Download button
// uses, keyed to that batch's exact report_ids so it's always a cache hit.
function CombinedReportsPanel({ batches, getReportInfo, error, downloadingBatchId, onDownload }) {
  const [search, setSearch] = useState('')
  if (batches === null) {
    return <p className="text-xs text-gray-400 italic py-6 text-center">Loading…</p>
  }
  if (batches.length === 0) {
    return <p className="text-xs text-gray-400 italic py-6 text-center">No combined reports sent yet for this PO.</p>
  }
  const q = search.trim().toLowerCase()
  const visibleBatches = q ? batches.filter(b => (b.batch_no || '').toLowerCase().includes(q)) : batches
  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="relative">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search TWFCMB batch no…"
          className="w-full sm:w-64 h-8 pl-7 pr-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 bg-gray-50 focus:bg-white transition-colors"
        />
      </div>
      {visibleBatches.length === 0 && (
        <p className="text-xs text-gray-400 italic py-6 text-center">No batch matches "{search.trim()}".</p>
      )}
      {/* Desktop table. */}
      {visibleBatches.length > 0 && (
      <div className="hidden md:block border border-gray-200 rounded-xl bg-white overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left">
              <th className="px-4 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Batch No</th>
              <th className="px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">Date &amp; Time</th>
              <th className="px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Stages</th>
              <th className="px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">SKUs</th>
              <th className="px-4 py-1.5 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wide">Download</th>
            </tr>
          </thead>
          <tbody>
            {visibleBatches.map(batch => {
              const skus = batchSkuList(batch, getReportInfo)
              return (
                <tr key={batch.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-2.5 text-xs font-mono font-bold text-gray-900 whitespace-nowrap">{batch.batch_no}</td>
                  <td className="px-2 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                    {new Date(batch.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {' · '}
                    {new Date(batch.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <div className="flex gap-1">
                      {batchStageLabels(skus).map(label => (
                        <span key={label} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-bold">
                          {label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="relative group inline-block">
                      <span className="text-xs text-gray-700 font-semibold cursor-default">
                        {skus.length} SKU{skus.length === 1 ? '' : 's'}
                      </span>
                      {skus.length > 0 && (
                        <div className="absolute left-0 top-full mt-1.5 z-20 w-64 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg p-2.5
                          opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity">
                          <div className="space-y-1">
                            {skus.map((s, i) => (
                              <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="font-semibold text-gray-700">{s.sku_ref || '-'}</span>
                                <span className="text-gray-400">
                                  {STAGE_LABELS[STAGE_TABS.findIndex(t => t.key === s.inspection_type)] || s.inspection_type}
                                  {s.round > 1 ? ` · R${s.round}` : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onDownload(batch)}
                      disabled={downloadingBatchId === batch.id}
                      aria-label={`Download ${batch.batch_no}`}
                      className="w-6 h-6 inline-flex items-center justify-center rounded text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {downloadingBatchId === batch.id ? <Spinner /> : <DownloadIcon />}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Mobile cards. */}
      {visibleBatches.length > 0 && (
      <div className="md:hidden space-y-1.5">
        {visibleBatches.map(batch => {
          const skus = batchSkuList(batch, getReportInfo)
          return (
            <div key={batch.id} className="border border-gray-200 rounded-lg bg-white p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono font-bold text-gray-900">{batch.batch_no}</span>
                <button
                  type="button"
                  onClick={() => onDownload(batch)}
                  disabled={downloadingBatchId === batch.id}
                  aria-label={`Download ${batch.batch_no}`}
                  className="flex-shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {downloadingBatchId === batch.id ? <Spinner /> : <DownloadIcon size={16} />}
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-gray-500">
                  {new Date(batch.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {' · '}
                  {new Date(batch.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {batchStageLabels(skus).map(label => (
                  <span key={label} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-bold">
                    {label}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {skus.map((s, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-semibold whitespace-nowrap">
                    {s.sku_ref || '-'}{s.round > 1 ? ` R${s.round}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      )}
    </div>
  )
}

// Right-side SKU-detail drawer for one PO from RepositoryPanel.jsx - opened
// by clicking that PO's row, same interaction PoRecord.jsx's rows use to
// open PoDrawer.jsx. Read-only (no PO/SKU editing here, unlike PoDrawer -
// this is browsing/exporting inspection reports, not order data), so only
// PoDrawer's outer shell (backdrop, slide-in panel, sticky header, portal)
// is mirrored, not its editing internals.
export default function RepositoryPoDrawer({ group, selectedSkuKeys, onToggleSelect, onToggleSelectAllForPo, onExportSku, onExportPo, scheduleAssignments, onClose }) {
  // Default to whichever stage this PO's own Stage column shows (its
  // furthest submitted stage), not always Inline - a lazy initializer, not
  // an effect, since RepositoryPanel.jsx keys this component by group.poId
  // (remounts fresh per PO, so this only ever runs once per PO opened -
  // switching straight from one PO's drawer to another's re-defaults too,
  // rather than keeping whatever tab was left selected on the previous PO).
  const [activeStageTab, setActiveStageTab] = useState(() => STAGE_TABS[group?.highestPoStage]?.key || 'inline')
  // Swipe left/right between Inline/Midline/Final on mobile, on top of the
  // tab buttons themselves - same gesture PoSkuSummary.jsx's own Overview/
  // Inline/Midline/Final tabs use.
  const swipeStageTabs = useSwipeTabs({ order: STAGE_TABS.map(t => t.key), activeKey: activeStageTab, onChange: setActiveStageTab })
  // SKU-number or Inspection-No search, scoped to whichever stage tab is
  // active - matches PoInspectionComments.jsx's own sidebar SKU search
  // (buyer_sku_ref or any round's report_no).
  const [skuSearch, setSkuSearch] = useState('')
  // Mobile-only select mode (the desktop table always shows its checkbox
  // column) - long-pressing a SKU card turns this on, same "Select/Done"
  // toggle convention PoSkuSummary.jsx's own SKU cards use.
  const [selectMode, setSelectMode] = useState(false)
  const enterSelectModeWith = (skuKey) => { setSelectMode(true); onToggleSelect(skuKey) }
  // null | { type: 'PPM_CALLOUT' | 'PILOT_RUN_CALLOUT', itemIds } - anyone who can open this
  // drawer can also post a callout from here now (see canComment below). `itemIds` is just the
  // modal's starting SKU selection (whichever rows are ticked here, if any) - CalloutModal opens
  // directly and its own SKUs drawer is where the selection is actually made/changed.
  const [calloutModal, setCalloutModal] = useState(null)
  const { orgMembership } = useProfileStore()
  // group.skuGroups only ever lists SKUs with a submitted Inline/Midline/
  // Final report - a PO that's ONLY ever had a PPM/Pilot Run entry
  // scheduled (no real inspection report at all yet) comes through as a
  // stub group with skuGroups: [] (see repositoryLayout.js's
  // groupSchedulesOnly), which made its Callouts view permanently show "0
  // SKUs selected" / "No callouts yet" even when real callouts existed for
  // its actual SKUs. Fetched fresh here instead - the PO's real line items,
  // independent of report/schedule status, same source
  // InspectionReportEntry.jsx's own calloutItems already uses (po.po_line_items).
  // cancelled_quantity added alongside the pre-existing id/buyer_sku_ref -
  // feeds the Cancelled filter below (an approved quantity cancellation,
  // from the Cancel-leftover-quantity pipeline - not an inspection_result at
  // all, so it needs this raw line-item field rather than anything off
  // `reports`).
  const [poLineItems, setPoLineItems] = useState(null)
  useEffect(() => {
    if (!group?.poId) return
    let cancelled = false
    supabase.from('po_line_items').select('id, buyer_sku_ref, cancelled_quantity').eq('po_id', group.poId).then(({ data }) => {
      if (!cancelled) setPoLineItems(data || [])
    })
    return () => { cancelled = true }
  }, [group?.poId])
  // Every 'submitted' log entry (with its own result snapshot - see
  // addInspectionReportLog's result param) for every SKU on this PO,
  // grouped by report_id - the only place an earlier result an in-place
  // resubmit overwrote (e.g. "Plan Aborted" before it got reopened and
  // Accepted) still exists at all. Fetched once per PO (all line items at
  // once) rather than per SKU row - this table can list 10+ SKUs at a time.
  const [supersededByReportId, setSupersededByReportId] = useState({})
  useEffect(() => {
    let cancelled = false
    const ids = (poLineItems || []).map(li => li.id)
    Promise.all([
      ids.length
        ? Promise.resolve(supabase.from('inspection_report_logs')
            .select('report_id, result, actor_name, created_at')
            .in('po_line_item_id', ids)
            .eq('event_type', 'submitted')
            .not('result', 'is', null)
            .order('created_at', { ascending: true }))
        : { data: [] },
      // Permanent Plan Aborted log - keeps "Plan Aborted" visible as the
      // previous result after it was converted to Accepted.
      fetchPlanAbortedLog(ids),
    ])
      .then(([{ data }, { data: pa }]) => {
        if (cancelled) return
        const byReport = {}
        const all = [...(data || []), ...pa].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        for (const log of all) (byReport[log.report_id] ??= []).push(log)
        setSupersededByReportId(byReport)
      })
    return () => { cancelled = true }
  }, [poLineItems])
  // PO Doc button in the header below - this drawer's own `group` never
  // carries this file URL (groupReports()/groupSchedulesOnly()/
  // groupOpenPosOnly() are all built for the table row, not this), so
  // it's fetched fresh here the same way poLineItems is, right above.
  // PI Doc removed from this drawer (only PO Doc shown now) - pi_file_url
  // dropped from the select accordingly.
  const [poDocUrls, setPoDocUrls] = useState(null)
  useEffect(() => {
    if (!group?.poId) return
    let cancelled = false
    supabase.from('purchase_orders').select('po_file_url').eq('id', group.poId).single().then(({ data }) => {
      if (!cancelled) setPoDocUrls(data || null)
    })
    return () => { cancelled = true }
  }, [group?.poId])
  // { url, label } for whichever of PO Doc/PI Doc is open - opens as an
  // in-page preview (PiPreviewPanel, docked to the left of this drawer, own
  // native browser PDF viewer so its text stays selectable/copyable), not a
  // download - same pattern PoDrawer.jsx already uses for its own PO/PI/
  // Product Sheet buttons.
  const [docPreview, setDocPreview] = useState(null)
  // Combined Reports tab - every TWFCMB... combined-document batch ever
  // generated for this PO (see supabase/migrations/20260917_create_
  // inspection_report_batches.sql), newest first. Independent of the
  // Inline/Midline/Final tabs entirely - toggled by its own boolean rather
  // than folded into activeStageTab/STAGE_TABS, so it's never part of
  // useSwipeTabs' order array and can't disturb that gesture's index math.
  const [showCombined, setShowCombined] = useState(false)
  const [combinedBatches, setCombinedBatches] = useState(null)
  const [combinedError, setCombinedError] = useState(null)
  useEffect(() => {
    if (!group?.poId) return
    let cancelled = false
    supabase.from('inspection_report_batches')
      .select('id, batch_no, report_ids, created_by, created_at')
      .eq('po_id', group.poId)
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) setCombinedError(err.message)
        else setCombinedBatches(data || [])
      })
    return () => { cancelled = true }
  }, [group?.poId])
  // Downloading a past batch re-invokes the same server-side generator
  // ExportPicker's own Download button uses, with the batch's exact
  // report_ids - same reportIdsKey server-side, so it's a cache hit (no
  // duplicate generation, no duplicate batch row), not a fresh export.
  const [downloadingBatchId, setDownloadingBatchId] = useState(null)
  const [combinedDownloadError, setCombinedDownloadError] = useState(null)
  const downloadCombinedBatch = async (batch) => {
    setDownloadingBatchId(batch.id)
    setCombinedDownloadError(null)
    try {
      const { fetchInspectionReportPdf, downloadBlob } = await import('../../lib/inspectionReportPdfApi')
      const { blob, filename } = await fetchInspectionReportPdf(group.poId, batch.report_ids, { mode: 'final', createdBy: orgMembership?.fullName })
      downloadBlob(blob, filename)
    } catch (err) {
      setCombinedDownloadError(err.message || 'Failed to download this report')
    } finally {
      setDownloadingBatchId(null)
    }
  }
  // Accepted/Rejected narrow the active stage tab's own rows (below);
  // Cancelled ignores the stage tab entirely - a cancellation isn't tied to
  // Inline/Midline/Final, it's a property of the SKU's order quantity as a
  // whole (po_line_items.cancelled_quantity), so it gets its own row source
  // instead of filtering skuGroupsByStage.
  const [resultFilter, setResultFilter] = useState(null)
  // Synthesizes a skuGroup-shaped row for each SKU with an approved
  // cancellation, reusing whatever report this SKU has at its furthest
  // stage (group.skuGroups, cross-stage) for the Inspection No/Submitted/
  // Inspector columns when one exists - a SKU can be fully cancelled with no
  // report at all, in which case those columns just read "-".
  const cancelledSkuGroups = useMemo(() => {
    if (!poLineItems || !group) return []
    return poLineItems
      .filter(li => (li.cancelled_quantity || 0) > 0)
      .map(li => {
        const existing = group.skuGroups?.find(sg => sg.skuKey === li.id)
        // `reports: [{}]`, not `[null]` - SkuRow (and the qcReportReaders
        // helpers it calls, e.g. getInspectorDisplayName) read straight off
        // reports[0] without a null guard, since every other caller always
        // has a real report row. An empty object renders every column as
        // "-", same as a null would have, without the read itself throwing.
        return existing || {
          skuKey: li.id, rowKey: li.id, skuRef: li.buyer_sku_ref, reports: [{}],
          highestStage: -1, rejected: false, cumulativeAccepted: 0, cumulativeAvailable: 0,
        }
      })
      .sort((a, b) => (a.skuRef || '').localeCompare(b.skuRef || ''))
  }, [poLineItems, group])
  // Every SKU on the PO, not just whichever stage tab is active - a
  // PPM/Pilot Run callout isn't scoped to Inline/Midline/Final at all, so
  // this view should show all of them regardless of the tab currently open.
  // Memoized - see InspectionReportEntry.jsx's own calloutItems for why an
  // unmemoized array here made CalloutModal refetch on every unrelated
  // re-render (e.g. switching Inline/Midline/Final tabs while it's open).
  // Declared before the `if (!group)` guard below - hooks can't be called
  // conditionally, and this component still renders (returns null) for a
  // null group on some passes.
  const calloutItems = useMemo(
    () => (poLineItems || []).map(li => ({ po_line_item_id: li.id, sku_ref: li.buyer_sku_ref })),
    [poLineItems]
  )
  // Opens the modal directly - no separate SKU-picker screen. Whichever SKUs are already ticked
  // in this drawer's own checkbox column are just the modal's starting selection; CalloutModal's
  // own SKUs drawer is where the user actually settles it (and can pick from every SKU on the PO,
  // not just this one) before posting.
  const openCallout = (type) => {
    const tickedIds = calloutItems.map(it => it.po_line_item_id).filter(id => selectedSkuKeys.has(String(id)))
    setCalloutModal({ type, itemIds: tickedIds })
  }
  // Combined Reports tab: resolves a batch's report_ids -> { sku_ref,
  // inspection_type, round } for display, off data already in memory first
  // - flattens every stage's skuGroupsByStage rows (covers both each SKU's
  // current round AND any historicalRejection row, same source SkuRow
  // itself reads from), so the common case needs zero extra fetch.
  const reportInfoById = useMemo(() => {
    const map = new Map()
    for (const { key } of STAGE_TABS) {
      for (const row of (group?.skuGroupsByStage?.[key] || [])) {
        const r = row.reports?.[0]
        if (r?.id) map.set(r.id, { sku_ref: row.skuRef, inspection_type: r.inspection_type, round: r.round ?? 1 })
      }
    }
    return map
  }, [group])
  // Fallback for report ids a batch references that AREN'T in the map above
  // - an older, since-superseded report (a re-inspection moved that SKU's
  // "current" row on past it) whose id is still sitting in a historical
  // batch's report_ids array. Waits for poLineItems too (a separate, own-
  // timed fetch above) - real bug caught in review: reading poLineItems
  // only inside this effect's closure, without it in the dependency array,
  // meant a batches-loads-first race permanently cached sku_ref: null for
  // whichever ids resolved before poLineItems arrived, since the effect
  // never re-ran once poLineItems actually showed up. Re-running is safe
  // now that `missing` also excludes ids already resolved into
  // fallbackReportInfoById - once nothing's left to resolve, the next fire
  // is a no-op, so this still only ever does the real fetch once per batch.
  const [fallbackReportInfoById, setFallbackReportInfoById] = useState({})
  useEffect(() => {
    if (!combinedBatches?.length || !poLineItems) return
    const ids = [...new Set(combinedBatches.flatMap(b => b.report_ids || []))]
    const missing = ids.filter(id => !reportInfoById.has(id) && !(id in fallbackReportInfoById))
    if (!missing.length) return
    let cancelled = false
    supabase.from('inspection_reports').select('id, po_line_item_id, inspection_type, round')
      .in('id', missing)
      .then(({ data }) => {
        if (cancelled) return
        setFallbackReportInfoById(prev => {
          const next = { ...prev }
          for (const r of data || []) {
            const sku = poLineItems.find(li => li.id === r.po_line_item_id)
            next[r.id] = { sku_ref: sku?.buyer_sku_ref ?? null, inspection_type: r.inspection_type, round: r.round ?? 1 }
          }
          // Any id that genuinely came back with no row (report since
          // deleted) - mark it explicitly so `missing` above stops
          // re-including it, rather than refetching it forever.
          for (const id of missing) if (!(id in next)) next[id] = null
          return next
        })
      })
    return () => { cancelled = true }
  }, [combinedBatches, poLineItems, reportInfoById, fallbackReportInfoById])
  const getReportInfo = (id) => reportInfoById.get(id) || fallbackReportInfoById[id] || null
  if (!group) return null

  // Cancelled ignores the stage tab and result-classifies nothing off
  // `reports` at all - it's already its own pre-filtered list (see
  // cancelledSkuGroups above). Accepted/Rejected instead narrow whichever
  // stage tab's rows are showing.
  const stageSkuGroups = group.skuGroupsByStage?.[activeStageTab] || []
  // 'accepted' and 'rejected' keep their own special-cased match (accepted
  // groups every accepted-ish result together via ACCEPTED_RESULTS -
  // Accepted with deviations included - and rejected uses sg.rejected, a
  // precomputed flag that isn't a plain inspection_result === check);
  // every OTHER result (partially_accepted, on_hold, plan_aborted,
  // accepted_with_deviations picked on its own, feedback_inprogress, or
  // anything added to INSPECTION_RESULT_OPTIONS later) falls through to one
  // generic exact-match branch - that's the actual "make it the rule" part,
  // so a new result type filters correctly with zero code change here.
  const resultFilteredSkuGroups = resultFilter === 'cancelled'
    ? cancelledSkuGroups
    : resultFilter === 'accepted'
      ? stageSkuGroups.filter(sg => ACCEPTED_RESULTS.includes(sg.reports[0]?.inspection_result))
      : resultFilter === 'rejected'
        ? stageSkuGroups.filter(sg => sg.rejected)
        : resultFilter === 'plan_aborted'
          // Also keeps a report that WAS Plan Aborted and has since been
          // converted (permanent log), so the conversion never hides it.
          ? stageSkuGroups.filter(sg => sg.reports[0]?.inspection_result === 'plan_aborted'
              || (supersededByReportId[sg.reports[0]?.id] || []).some(l => l.result === 'plan_aborted'))
          : resultFilter
          ? stageSkuGroups.filter(sg => sg.reports[0]?.inspection_result === resultFilter)
          : stageSkuGroups
  const allVisibleSkuGroups = resultFilteredSkuGroups
  const skuSearchTerm = skuSearch.trim().toLowerCase()
  const visibleSkuGroups = skuSearchTerm
    ? allVisibleSkuGroups.filter(sg =>
        sg.skuRef?.toLowerCase().includes(skuSearchTerm) || sg.reports[0]?.report_no?.toLowerCase().includes(skuSearchTerm)
      )
    : allVisibleSkuGroups
  const allSelected = visibleSkuGroups.length > 0 && visibleSkuGroups.every(sg => selectedSkuKeys.has(String(sg.skuKey)))
  // Last-resort Inspector fallback (see resolveFallbackInspector) - only
  // when exactly one QA touched this whole PO, so it's never a guess
  // between several.
  const singleQaName = group.qaNames?.length === 1 ? group.qaNames[0] : null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[110] bg-black/55" onClick={onClose} />
      {/* Widened from 620px - with Inspection No. added alongside the
          existing SKU/Qty/Stage/Result/Submitted/Inspector/Export columns,
          620px forced horizontal scroll to reach Export even on desktop.
          900px matches the same ballpark PoDrawer.jsx (this component's own
          doc comment above cites it as the pattern) already uses for its
          own data-heavy state (920px). */}
      <div className="fixed inset-y-0 right-0 z-[120] w-full sm:w-[900px] bg-gray-100 shadow-2xl flex flex-col">
        <div className="bg-white border-b border-gray-200 flex-shrink-0">
          {/* Desktop - unchanged single row. */}
          <div className="hidden md:flex items-center justify-between px-5 pt-4 pb-3">
            <div className="min-w-0">
              <div className="text-base font-bold text-gray-900 truncate">PO {group.poNumber || '-'}</div>
              <div className="text-xs text-gray-500 mt-0.5 truncate">{group.buyerName || '-'} · {group.vendorName || '-'}</div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* PO Doc - opens as an in-page preview docked to the left of
                  this drawer (PiPreviewPanel), not a download - same
                  pattern PoDrawer.jsx already uses for its own PO/PI/
                  Product Sheet buttons, so the PDF's own text stays
                  selectable/copyable (a real browser PDF viewer, not an
                  image). PI Doc removed - only PO Doc stays here now. */}
              <button type="button"
                onClick={() => setDocPreview({ url: publicUrl(poDocUrls?.po_file_url), label: 'PO Document' })}
                disabled={!poDocUrls?.po_file_url}
                title={poDocUrls?.po_file_url ? 'Open PO Document' : 'No PO Document uploaded'}
                className="px-2.5 py-1.5 rounded-md text-[10px] font-bold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
                PO Doc
              </button>
              <button type="button" onClick={() => openCallout('PPM_CALLOUT')}
                title="PPM callouts for this PO"
                className="px-2.5 py-1.5 rounded-md text-[10px] font-bold text-indigo-700 border border-indigo-200 hover:bg-indigo-50 transition-colors cursor-pointer whitespace-nowrap">
                PPM Callouts
              </button>
              <button type="button" onClick={() => openCallout('PILOT_RUN_CALLOUT')}
                title="Pilot Run callouts for this PO"
                className="px-2.5 py-1.5 rounded-md text-[10px] font-bold text-indigo-700 border border-indigo-200 hover:bg-indigo-50 transition-colors cursor-pointer whitespace-nowrap">
                Pilot Run Callouts
              </button>
              <button type="button" onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile - fully vertical: title gets its own full-width row (no
              longer squeezed down to "PO P001…" by 5 buttons sharing the
              same line), close button pinned top-right of just that row,
              then every action button wraps onto as many rows as it needs
              below instead of a single row that ran off-screen. */}
          <div className="md:hidden px-4 pt-3 pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-base font-bold text-gray-900 break-words">PO {group.poNumber || '-'}</div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">{group.buyerName || '-'} · {group.vendorName || '-'}</div>
              </div>
              <button type="button" onClick={onClose}
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              <button type="button"
                onClick={() => setDocPreview({ url: publicUrl(poDocUrls?.po_file_url), label: 'PO Document' })}
                disabled={!poDocUrls?.po_file_url}
                title={poDocUrls?.po_file_url ? 'Open PO Document' : 'No PO Document uploaded'}
                className="px-2.5 py-1.5 rounded-md text-[10px] font-bold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
                PO Doc
              </button>
              <button type="button" onClick={() => openCallout('PPM_CALLOUT')}
                title="PPM callouts for this PO"
                className="px-2.5 py-1.5 rounded-md text-[10px] font-bold text-indigo-700 border border-indigo-200 hover:bg-indigo-50 transition-colors cursor-pointer whitespace-nowrap">
                PPM
              </button>
              <button type="button" onClick={() => openCallout('PILOT_RUN_CALLOUT')}
                title="Pilot Run callouts for this PO"
                className="px-2.5 py-1.5 rounded-md text-[10px] font-bold text-indigo-700 border border-indigo-200 hover:bg-indigo-50 transition-colors cursor-pointer whitespace-nowrap">
                Pilot Run
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3">
            {showCombined ? (
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {combinedBatches?.length ?? 0} combined report{(combinedBatches?.length ?? 0) === 1 ? '' : 's'}
              </span>
            ) : (
              <>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {visibleSkuGroups.length} SKU{visibleSkuGroups.length === 1 ? '' : 's'}
                  {group.hasRejected && <span className="text-red-600 font-semibold"> · has a rejected SKU</span>}
                </span>
                {/* Mobile only - desktop's table always shows its own checkbox
                    column, no toggle needed there. Long-press a card also
                    enters select mode on its own (see SkuCard); this button is
                    the deliberate, discoverable way in/out of it. */}
                <div className="md:hidden flex items-center gap-1.5 flex-shrink-0">
                  {selectMode && visibleSkuGroups.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onToggleSelectAllForPo({ skuGroups: visibleSkuGroups })}
                      className="px-2 py-1 rounded-md text-[10px] font-semibold text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
                    >
                      {allSelected ? 'Clear all' : 'Select all'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectMode(v => !v)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer
                      ${selectMode ? 'bg-gray-900 text-white' : 'text-gray-500 bg-gray-100 hover:bg-gray-200'}`}
                  >
                    {selectMode ? 'Done' : 'Select'}
                  </button>
                </div>
                <div className="relative w-full md:w-48 order-last md:order-none">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={skuSearch}
                    onChange={e => setSkuSearch(e.target.value)}
                    placeholder="Search SKU or Inspection No…"
                    className="w-full h-7 pl-7 pr-2 text-[11px] border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white transition-colors"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex items-center border-t border-gray-100">
            {STAGE_TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => { setShowCombined(false); setActiveStageTab(key) }}
                className={`flex-1 px-3 py-2 text-xs font-bold border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap text-center
                  ${!showCombined && resultFilter === 'cancelled' ? 'opacity-40 pointer-events-none' : ''}
                  ${!showCombined && activeStageTab === key ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
              >
                {label}
              </button>
            ))}
            {/* Last tab, separate from Inline/Midline/Final entirely - not
                part of STAGE_TABS/activeStageTab/useSwipeTabs, since its
                content (past combined-document batches) has nothing to do
                with any one stage. */}
            <button
              type="button"
              onClick={() => setShowCombined(true)}
              className={`flex-1 px-3 py-2 text-xs font-bold border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap text-center
                ${showCombined ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              Combined Reports
            </button>
          </div>
          {/* Accepted/Partially Accepted/On Hold/Rejected/Cancelled - narrows
              whichever result the drawer's showing, on top of the Inline/
              Midline/Final tabs above. Cancelled isn't stage-scoped (see
              cancelledSkuGroups), so those tabs above are dimmed/inert while
              it's active.
              Desktop - unchanged single row, one flex-1 per chip. Hidden
              entirely on the Combined Reports tab - none of this applies to
              a list of past export batches. */}
          {!showCombined && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-2 border-t border-gray-100 bg-gray-50/60">
              {RESULT_FILTERS.map(({ key, label, activeClass }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setResultFilter(f => f === key ? null : key)}
                  className={`flex-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-center transition-colors cursor-pointer whitespace-nowrap
                    ${resultFilter === key ? activeClass : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-400'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {/* Mobile - a 2-column grid instead of one flex-1 row that ran
              past the drawer's edge (6 nowrap labels never fit one line at
              360-390px) - wraps onto as many rows as it needs instead. */}
          {!showCombined && (
            <div className="md:hidden grid grid-cols-2 gap-1.5 px-3 py-2 border-t border-gray-100 bg-gray-50/60">
              {RESULT_FILTERS.map(({ key, label, activeClass }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setResultFilter(f => f === key ? null : key)}
                  className={`px-2.5 py-1.5 rounded-full text-[10px] font-bold text-center transition-colors cursor-pointer whitespace-nowrap
                    ${resultFilter === key ? activeClass : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-400'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {showCombined ? (
            <CombinedReportsPanel
              batches={combinedBatches}
              getReportInfo={getReportInfo}
              error={combinedError || combinedDownloadError}
              downloadingBatchId={downloadingBatchId}
              onDownload={downloadCombinedBatch}
            />
          ) : (
          <>
          {/* Desktop - unchanged table. */}
          {/* overflow-x-auto, not overflow-hidden - the new Inspection No.
              column pushed this past the drawer's fixed width, which was
              clipping Export off the visible edge instead of letting it
              scroll into view. */}
          <div className="hidden md:block border border-gray-200 rounded-xl bg-white overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="px-4 py-1.5 w-8">
                    {visibleSkuGroups.length > 0 && (
                      <SkuCheckbox
                        checked={allSelected}
                        onToggle={() => onToggleSelectAllForPo({ skuGroups: visibleSkuGroups })}
                        label={allSelected ? 'Clear selected SKUs' : 'Select all SKUs'}
                      />
                    )}
                  </th>
                  <th className="px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">SKU</th>
                  <th className="px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">Order Qty</th>
                  <th className="px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap" title="Cumulative submitted/inspected quantity across every round at this stage">Sub. Qty</th>
                  <th className="px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Stage</th>
                  <th className="px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Result</th>
                  <th className="px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap" title="This round's own earlier result, before it was reopened and resubmitted as something else">Previous Result</th>
                  <th className="px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">Inspection No.</th>
                  <th className="px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">Submitted</th>
                  <th className="px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap" title="Multiple QAs can inspect different SKUs on the same PO">Inspector</th>
                  <th className="px-4 py-1.5 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wide">Export</th>
                </tr>
              </thead>
              <tbody>
                {visibleSkuGroups.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-xs text-gray-400 italic py-6 text-center">
                      {skuSearch.trim()
                        ? `No SKUs match "${skuSearch.trim()}".`
                        : resultFilter === 'cancelled'
                          ? 'No SKUs with a cancelled quantity on this PO.'
                          : !resultFilter
                            ? `No SKUs currently at ${STAGE_TABS.find(t => t.key === activeStageTab)?.label}.`
                            : `No ${RESULT_FILTERS.find(f => f.key === resultFilter)?.label.toLowerCase()} SKUs at ${STAGE_TABS.find(t => t.key === activeStageTab)?.label}.`}
                    </td>
                  </tr>
                )}
                {visibleSkuGroups.map(sg => (
                  <SkuRow
                    key={sg.rowKey ?? sg.skuKey}
                    sg={sg}
                    selected={selectedSkuKeys.has(String(sg.skuKey))}
                    onToggleSelect={() => onToggleSelect(sg.skuKey)}
                    onExport={() => onExportSku(group.poId, sg.skuKey)}
                    scheduleAssignments={scheduleAssignments}
                    singleQaName={singleQaName}
                    supersededByReportId={supersededByReportId}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile - one card per SKU instead of a min-w-[640px] table,
              which forced horizontal scroll regardless of the sheet's own
              width. Swipe left/right (see swipeStageTabs above) moves
              between Inline/Midline/Final on top of the tab buttons. */}
          <div {...swipeStageTabs} className="md:hidden space-y-1.5">
            {visibleSkuGroups.length === 0 && (
              <p className="text-xs text-gray-400 italic py-6 text-center">
                {skuSearch.trim()
                  ? `No SKUs match "${skuSearch.trim()}".`
                  : resultFilter === 'cancelled'
                    ? 'No SKUs with a cancelled quantity on this PO.'
                    : !resultFilter
                      ? `No SKUs currently at ${STAGE_TABS.find(t => t.key === activeStageTab)?.label}.`
                      : `No ${RESULT_FILTERS.find(f => f.key === resultFilter)?.label.toLowerCase()} SKUs at ${STAGE_TABS.find(t => t.key === activeStageTab)?.label}.`}
              </p>
            )}
            {visibleSkuGroups.map(sg => (
              <SkuCard
                key={sg.rowKey ?? sg.skuKey}
                sg={sg}
                selected={selectedSkuKeys.has(String(sg.skuKey))}
                selectMode={selectMode}
                onToggleSelect={onToggleSelect}
                onEnterSelectMode={enterSelectModeWith}
                onExport={() => onExportSku(group.poId, sg.skuKey)}
                scheduleAssignments={scheduleAssignments}
                singleQaName={singleQaName}
              />
            ))}
          </div>
          </>
          )}
        </div>

        {!showCombined && (
        <div className="bg-white border-t border-gray-200 flex-shrink-0 px-5 py-3">
          <button
            type="button"
            onClick={() => onExportPo(group.poId)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-gray-900 hover:bg-gray-700 transition-all cursor-pointer"
          >
            <ExportIcon />
            Export {group.skuGroups.some(sg => selectedSkuKeys.has(String(sg.skuKey))) ? 'Selected' : 'All'}
          </button>
        </div>
        )}
      </div>

      {calloutModal && (
        <CalloutModal
          po={{ id: group.poId, po_number: group.poNumber }}
          items={calloutItems.filter(it => calloutModal.itemIds.includes(it.po_line_item_id))}
          allItems={calloutItems}
          calloutType={calloutModal.type}
          calloutLabel={calloutModal.type === 'PPM_CALLOUT' ? 'PPM Callout' : 'Pilot Run Callout'}
          userName={orgMembership?.fullName}
          canComment={true}
          onClose={() => setCalloutModal(null)}
          onSubmitted={() => setCalloutModal(null)}
        />
      )}

      {docPreview && (
        <PiPreviewPanel
          url={docPreview.url}
          title={docPreview.label}
          offsetRightPx={900}
          onClose={() => setDocPreview(null)}
        />
      )}
    </>,
    document.body
  )
}
