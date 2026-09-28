import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { useUiStore } from '../../../stores/uiStore'
import {
  useSkuMasterData,
  createInspectionReport, findInspectionReport, updateInspectionReport, updateInspectionReportStatus,
  addInspectionReportLog, fetchLatestStageReport, acceptReportGuarded, startReInspection,
} from '../../../hooks/useInspectionReports'
import { createSchedule, updateSchedule, updateScheduleStatus, fetchPoScheduleEntries, bookFollowUpSchedule } from '../../../hooks/useInspectionSchedule'
import { blockingBalance, orderAfterCancellation } from './stageBalance'
import InspectionForm, { PhotoGrid } from './InspectionForm'
import PoSkuSummary from './PoSkuSummary'
import InspectionActivityLog from './InspectionActivityLog'
import ConfirmModal from '../../ui/ConfirmModal'
import CancelQuantityModal from './CancelQuantityModal'
import InspectLaterModal from './InspectLaterModal'
import { usePendingLineItemCancellations } from '../../../hooks/usePoLineItemCancellations'
import { useSendMailStore } from '../../../stores/sendMailStore'
import {
  STAGES, STAGE_LABEL, getStage, isFinalized, isAcceptedOnlyDraft, RESULT_BADGE_CLASS, RESULT_LABEL,
  ACCEPTED_RESULTS, VERDICT_RESULTS, RESULTS_REQUIRING_REMARK, INSPECTION_RESULT_OPTIONS,
  getLockInfo, getNextActionableStage, StageButton, wasAnyStageRejected, getReworkableStage, mostRecentSubmittedRound,
} from './stageStatus'
import { classifyAcceptAction, ACCEPT_OVERWRITABLE_RESULTS, ACCEPT_SKIP_REASON_LABEL, REINSPECT_RESULTS } from './acceptClassifier'
import ReworkRequestModal from './ReworkRequestModal'
import CalloutModal from './CalloutModal'
import MobileBulkActionSheet from './MobileBulkActionSheet'
import PhotoGalleryModal from '../../ui/PhotoGalleryModal'
import { sortPhotosInSequence } from '../../../lib/photoSequence'
import { getInspectionFileUrl } from '../../../lib/inspectionStorage'
import ExportChoiceBox from './ExportChoiceBox'

function fmtDate(d) {
  if (!d) return '-'
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Same shape as InspectionForm.jsx's own nowTimeString() - HH:MM:SS local time.
function nowTimeString() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// Local date, not UTC — same convention as InspectionForm.jsx's own
// todayLocalISO(), matters for a scheduling comparison right at day boundaries.
function todayLocalISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// "Rejected: 900001262, 900001266; Feedback in Progress: 900003207" - the
// SKUs the bulk Accept button set aside, grouped by reason, with the refs
// capped so a large batch still reads as one line.
function summarizeAcceptSkips(items) {
  const byReason = new Map()
  for (const { li, reason } of items) {
    const label = ACCEPT_SKIP_REASON_LABEL[reason] || reason
    if (!byReason.has(label)) byReason.set(label, [])
    byReason.get(label).push(li.buyer_sku_ref || li.id)
  }
  return [...byReason.entries()]
    .map(([label, refs]) => `${label}: ${refs.slice(0, 6).join(', ')}${refs.length > 6 ? ` and ${refs.length - 6} more` : ''}`)
    .join('; ')
}

// Runs `fn` over `items` with at most `limit` in flight at once - used by
// Accept & Move to Final, which can otherwise fire dozens of report
// creates + submission emails at literally the same instant for a 30-40 SKU
// selection (each SKU touches up to 2 stages). Order-preserving.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function Spinner({ size = 'w-4 h-4' }) {
  return (
    <svg className={`${size} animate-spin text-gray-400`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

const STAGE_ORDER = { inline: 0, midline: 1, final: 2 }

// Highest-stage report per SKU: Final beats Midline beats Inline, so a SKU
// that's gone all the way only contributes its Final report, matching what
// QcReportsSummary's Generated Reports dropdown already shows per SKU. A
// rejected-then-reinspected SKU has two Final rounds tied on stage - the
// round tiebreaker picks the later one, so a rejected round 1 never wins
// out over the accepted round 2 just because it happened to come first in
// `submittedReports`' own array order.
function highestStagePerSkuIds(submittedReports) {
  const bestBySku = new Map()
  for (const r of submittedReports) {
    const stage = STAGE_ORDER[r.inspection_type] ?? -1
    const round = r.round ?? 1
    const cur = bestBySku.get(r.po_line_item_id)
    if (!cur || stage > cur.stage || (stage === cur.stage && round > cur.round)) {
      bestBySku.set(r.po_line_item_id, { stage, round, id: r.id })
    }
  }
  return new Set([...bestBySku.values()].map(v => v.id))
}

export function ExportPicker({ po, reports, checkedSkuIds, autoPreview, userName, onClose }) {
  // Only a submitted report is a real, exportable document — a draft has no
  // findings/verdict recorded yet (some aren't even real drafts, just a bare
  // placeholder holding a number, see isAcceptedOnlyDraft), so it never
  // belongs in this list at all, not even as an option to tick.
  const submittedReports = reports.filter(r => r.status === 'submitted')
  // Arriving here with SKUs already ticked in the Overview table pre-selects
  // just those SKUs' passed Final reports ("passed through final inspection"
  // is the point of that shortcut) - the full list still shows everything, so
  // it's a starting point to adjust, not a hidden filter like the old
  // skip-the-picker shortcut was. `autoPreview` (QC Reports' "Export" button)
  // instead pre-selects every SKU's own furthest stage and skips straight to
  // the preview below, no picking screen shown at all.
  const [selectedIds, setSelectedIds] = useState(() => {
    if (checkedSkuIds?.size) {
      const finals = [...checkedSkuIds]
        .map(id => getStage(reports, id, 'final'))
        .filter(r => r && r.status === 'submitted' && ACCEPTED_RESULTS.includes(r.inspection_result))
        .map(r => r.id)
      return new Set(finals)
    }
    if (autoPreview) return highestStagePerSkuIds(submittedReports)
    // Nothing pre-checked by default - the picker opened with no prior
    // Overview selection shouldn't dump every submitted report into the
    // export sight-unseen. Preview stays disabled until something is
    // actually ticked (see the button below, gated on selectedIds.size).
    return new Set()
  })
  const [error, setError] = useState(null)
  // Three phases now (Phase 3 - server-side generation): pick which reports
  // to bundle, then choose Preview or Download (showChoice - see
  // ExportChoiceBox), then either an iframe preview or a direct download.
  // Preview is no longer a mandatory gate in front of Download - both are
  // reachable straight from the choice box, since Preview is real
  // server-side work (still has to fetch every original photo before it
  // can downscale one) and a slow/failed preview must never block a user
  // who just wants the file.
  const [previewUrl, setPreviewUrl] = useState(null)
  const [showChoice, setShowChoice] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const urlRef = useRef(null)

  const toggle = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  // Inline/Midline/Final tabs (STAGES, shared with the stage-pill row
  // elsewhere) instead of one dropdown per SKU - lets picking "which Finals
  // do I want" scale the same way QC Reports' own stage tabs already do.
  // Only the grouping changes here; selectedIds/toggle/handlePreview/
  // handleDownload below are unchanged, and a selection made on one tab
  // stays selected when switching to another (the footer's count/Preview
  // always reflects everything ticked across all three tabs, not just the
  // active one). A SKU with more than one submitted round of the same stage
  // (rejected then re-inspected) still gets one row per round so both stay
  // individually selectable.
  const [activeExportTab, setActiveExportTab] = useState('inline')
  const [exportSkuSearch, setExportSkuSearch] = useState('')
  // Result filter (one at a time, click again to clear), same pills and rules as the QC
  // Reports drawer: Accepted covers every accepted-ish result, the others are exact
  // matches, and Cancelled = SKUs with an approved quantity cancellation.
  const [exportStatusFilter, setExportStatusFilter] = useState(null)
  const exportStatusPills = [...INSPECTION_RESULT_OPTIONS, { value: 'cancelled', label: 'Cancelled' }]
  const matchesExportStatus = (r) => {
    if (!exportStatusFilter) return true
    if (exportStatusFilter === 'cancelled') return (Number(po.po_line_items?.find(x => x.id === r.po_line_item_id)?.cancelled_quantity) || 0) > 0
    if (exportStatusFilter === 'accepted') return ACCEPTED_RESULTS.includes(r.inspection_result)
    return r.inspection_result === exportStatusFilter
  }
  const toggleMany = (reportIds) => setSelectedIds(prev => {
    const next = new Set(prev)
    const allSelected = reportIds.every(id => next.has(id))
    reportIds.forEach(id => (allSelected ? next.delete(id) : next.add(id)))
    return next
  })
  const reportsByStage = useMemo(() => {
    const byStage = { inline: [], midline: [], final: [] }
    for (const r of submittedReports) {
      if (byStage[r.inspection_type]) byStage[r.inspection_type].push(r)
    }
    for (const key of Object.keys(byStage)) {
      byStage[key].sort((a, b) => {
        const skuA = po.po_line_items?.find(x => x.id === a.po_line_item_id)?.buyer_sku_ref || ''
        const skuB = po.po_line_items?.find(x => x.id === b.po_line_item_id)?.buyer_sku_ref || ''
        return skuA.localeCompare(skuB) || (a.round ?? 1) - (b.round ?? 1)
      })
    }
    return byStage
  }, [submittedReports, po])
  // Filters the active tab's own list only - the tab badges above keep
  // showing each stage's real total regardless of the search text, same
  // convention as PoSkuSummary.jsx's Overview table search.
  // The status filter narrows every tab (counts included); the raw map above still
  // tells "nothing submitted on this stage" apart from "nothing matches the filter".
  const filteredReportsByStage = useMemo(() => {
    const out = {}
    for (const key of Object.keys(reportsByStage)) out[key] = reportsByStage[key].filter(matchesExportStatus)
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportsByStage, exportStatusFilter, po])
  const visibleTabReports = useMemo(() => {
    const q = exportSkuSearch.trim().toLowerCase()
    const tabReports = filteredReportsByStage[activeExportTab]
    if (!q) return tabReports
    return tabReports.filter(r => (po.po_line_items?.find(x => x.id === r.po_line_item_id)?.buyer_sku_ref || '').toLowerCase().includes(q))
  }, [filteredReportsByStage, activeExportTab, exportSkuSearch, po])
  const hiddenSelectedCount = exportStatusFilter ? submittedReports.filter(r => selectedIds.has(r.id) && !matchesExportStatus(r)).length : 0

  const selectedReports = reports.filter(r => selectedIds.has(r.id))
  const skuIds = selectedReports
    .map(r => po.po_line_items?.find(li => li.id === r.po_line_item_id)?.sku_id)
    .filter(Boolean)
  // skuMasterById itself is no longer used - the server resolves SKU data
  // now (Phase 3) - but loadingSkus still gates the Export button below.
  const { loading: loadingSkus } = useSkuMasterData(skuIds)

  // Every photo across whatever's currently ticked - same PhotoGalleryModal
  // (bulk zip download) PoInspectionComments/CalloutModal's own PhotoStrip
  // already uses for this, reused here rather than a second download path.
  const selectedPhotoImages = useMemo(() => selectedReports.flatMap(r =>
    sortPhotosInSequence(r.inspection_report_photos || []).map(p => ({ key: p.id, src: getInspectionFileUrl(p.storage_path) }))
  ), [selectedReports])
  const [showPhotoGallery, setShowPhotoGallery] = useState(false)

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  const handlePreview = async () => {
    if (!selectedReports.length) return
    setError(null)
    setGenerating(true)
    try {
      const { fetchInspectionReportPdf } = await import('../../../lib/inspectionReportPdfApi')
      const { blob } = await fetchInspectionReportPdf(po.id, selectedReports.map(r => r.id), { mode: 'preview', createdBy: userName })
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setPreviewUrl(url)
    } catch (err) {
      setError(err.message || 'Failed to generate preview')
    } finally {
      setGenerating(false)
    }
  }

  // Fires once, only for autoPreview (QC Reports' "Export" button): waits
  // for skuMasterById to finish loading then jumps straight to the
  // Preview/Download choice, so the picking screen never shows at all in
  // that mode.
  const autoPreviewFired = useRef(false)
  useEffect(() => {
    // Nothing submitted yet (e.g. a scheduled PO that hasn't actually been
    // inspected) skips this entirely - the empty-state branch in the
    // render handles that case instead, so there's nothing to fire here.
    if (!autoPreview || autoPreviewFired.current || loadingSkus || !submittedReports.length) return
    autoPreviewFired.current = true
    setShowChoice(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPreview, loadingSkus])

  const handleDownload = async () => {
    setDownloading(true)
    setError(null)
    try {
      const { fetchInspectionReportPdf, downloadBlob } = await import('../../../lib/inspectionReportPdfApi')
      const { blob, filename } = await fetchInspectionReportPdf(po.id, selectedReports.map(r => r.id), { mode: 'final', createdBy: userName })
      downloadBlob(blob, filename)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to export PDF')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-white rounded-xl shadow-2xl w-full flex flex-col
        ${previewUrl ? 'max-w-4xl max-h-[92vh]' : 'max-w-3xl max-h-[80vh]'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="text-sm font-bold text-gray-900">
            {previewUrl ? 'Preview Inspection Report' : 'Export Inspection Report'}
          </div>
          <button type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {showChoice ? (
          <>
            <ExportChoiceBox
              disabled={generating || downloading}
              onPreview={handlePreview}
              onDownload={handleDownload}
            />
            <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 flex items-center gap-3">
              {error && <span className="text-xs text-red-500">{error}</span>}
              {(generating || downloading) && <Spinner size="w-3 h-3" />}
              {!autoPreview && (
                <button type="button" onClick={() => setShowChoice(false)} className="text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors">
                  Back
                </button>
              )}
            </div>
          </>
        ) : previewUrl ? (
          <>
            <div className="flex-1 min-h-0 px-5 py-4">
              <iframe src={previewUrl} title="Inspection report preview" className="w-full h-full min-h-[65vh] border border-gray-200 rounded-lg" />
            </div>
            <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 flex items-center gap-3">
              {error && <span className="text-xs text-red-500">{error}</span>}
              <button type="button" onClick={() => setPreviewUrl(null)} className="text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors">
                Back
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                {downloading && <Spinner size="w-3 h-3" />}
                {downloading ? 'Downloading…' : 'Download PDF'}
              </button>
            </div>
          </>
        ) : autoPreview && !error && submittedReports.length === 0 ? (
          // Clicked from a calendar chip for a PO that's only scheduled -
          // nothing's actually been submitted yet, so there's no report to
          // generate a preview from. Without this the spinner below would
          // just spin forever, since handlePreview no-ops on an empty selection.
          <div className="flex-1 flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-300">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="text-sm font-semibold text-gray-500">No report generated yet</p>
            <p className="text-xs text-gray-400">This PO hasn't had any inspection submitted yet - there's nothing to export.</p>
          </div>
        ) : autoPreview && !error ? (
          // Waiting on skuMasterById before the effect above sets showChoice
          // - the picking screen below never shows in this mode, only this
          // spinner does, unless it errors out (then it falls through to
          // that screen so the user has some way to recover).
          <div className="flex-1 flex flex-col items-center justify-center gap-2 py-16 text-gray-400">
            <Spinner size="w-5 h-5" />
            <span className="text-xs font-semibold">Loading…</span>
          </div>
        ) : (
          <>
            {/* A draft has nothing worth exporting yet (no findings, no
                verdict — some are even bare placeholders that exist only to
                hold a number, see isAcceptedOnlyDraft) — only a submitted
                report is a real, exportable document. */}
            {submittedReports.length === 0 ? (
              <div className="px-5 py-4 flex-1">
                <p className="text-xs text-gray-400">No submitted inspections yet on this PO.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 px-5 pt-3 border-b border-gray-100 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    {STAGES.map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setActiveExportTab(key)}
                        className={`px-3 py-2 text-xs font-bold border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap
                          ${activeExportTab === key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                      >
                        {label} <span className="text-[10px] font-semibold text-gray-400">({filteredReportsByStage[key].length})</span>
                      </button>
                    ))}
                  </div>
                  <div className="relative flex-1 mb-2">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      value={exportSkuSearch}
                      onChange={e => setExportSkuSearch(e.target.value)}
                      placeholder="Search SKU"
                      className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 px-5 pt-3 flex-shrink-0">
                  {exportStatusPills.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setExportStatusFilter(prev => (prev === value ? null : value))}
                      className={`px-3 py-1 rounded-full border text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer
                        ${exportStatusFilter === value ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="overflow-y-auto px-5 py-4 flex-1 space-y-1.5">
                  {visibleTabReports.length === 0 ? (
                    <p className="text-xs text-gray-400">
                      {reportsByStage[activeExportTab].length === 0
                        ? `No submitted ${STAGE_LABEL[activeExportTab]} inspections on this PO.`
                        : filteredReportsByStage[activeExportTab].length === 0
                          ? `No ${exportStatusPills.find(p => p.value === exportStatusFilter)?.label || ''} reports on ${STAGE_LABEL[activeExportTab]}.`
                          : 'No SKU matches your search.'}
                    </p>
                  ) : (
                    <>
                      <label className="flex items-center gap-2.5 px-1 pb-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={visibleTabReports.every(r => selectedIds.has(r.id))}
                          ref={el => {
                            if (!el) return
                            const count = visibleTabReports.filter(r => selectedIds.has(r.id)).length
                            el.indeterminate = count > 0 && count < visibleTabReports.length
                          }}
                          onChange={() => toggleMany(visibleTabReports.map(r => r.id))}
                          className="w-4 h-4 flex-shrink-0"
                        />
                        <span className="text-[11px] font-semibold text-gray-500">Select all {STAGE_LABEL[activeExportTab]}</span>
                      </label>
                      {visibleTabReports.map(r => {
                        const li = po.po_line_items?.find(x => x.id === r.po_line_item_id)
                        return (
                          <label key={r.id} className="flex items-center gap-2.5 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                            <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggle(r.id)} className="w-4 h-4 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-gray-900 truncate">
                                {li?.buyer_sku_ref || '-'}
                                {(r.round ?? 1) > 1 && <span className="ml-1.5 text-[10px] font-semibold text-gray-400">Round {r.round}</span>}
                              </div>
                              {/* submitted_at, not inspection_date - the latter is a
                                  manually-entered field that can go untouched between
                                  rounds (a fresh re-inspection round reusing the prior
                                  round's date), so two genuinely different rounds could
                                  otherwise show the identical date here. submitted_at is
                                  a server timestamp set fresh on each round's own submit,
                                  matching the date the sidebar's own Rejected/Re-Scheduled
                                  cards already use. */}
                              <div className="text-[10px] text-gray-400 truncate">{r.inspector_name || 'Unassigned'} · {fmtDate(r.submitted_at)}</div>
                            </div>
                            <span className={`flex-shrink-0 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${RESULT_BADGE_CLASS[r.inspection_result] || 'bg-gray-100 text-gray-500'}`}>
                              {RESULT_LABEL[r.inspection_result] || 'Pending'}
                            </span>
                          </label>
                        )
                      })}
                    </>
                  )}
                </div>
              </>
            )}

            <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 flex items-center gap-3">
              {error && <span className="text-xs text-red-500">{error}</span>}
              {hiddenSelectedCount > 0 && (
                <span className="text-[11px] text-gray-400">{selectedIds.size} selected, {hiddenSelectedCount} hidden by the filter</span>
              )}
              <button
                type="button"
                onClick={() => setShowPhotoGallery(true)}
                disabled={!selectedPhotoImages.length}
                title={selectedIds.size ? `${selectedPhotoImages.length} photo${selectedPhotoImages.length !== 1 ? 's' : ''} across ${selectedIds.size} selected report${selectedIds.size !== 1 ? 's' : ''}` : 'Tick a report above first'}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                Download Images
              </button>
              <button
                type="button"
                onClick={() => setShowChoice(true)}
                disabled={!selectedIds.size || loadingSkus}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                {loadingSkus && <Spinner size="w-3 h-3" />}
                Export
              </button>
            </div>
          </>
        )}
      </div>
      {showPhotoGallery && (
        <PhotoGalleryModal
          images={selectedPhotoImages}
          title={`Photos - ${selectedIds.size} selected report${selectedIds.size !== 1 ? 's' : ''}`}
          zipBaseName={`${po.po_number || 'inspection'}-photos`}
          onClose={() => setShowPhotoGallery(false)}
        />
      )}
    </div>
  )
}

// Gates acceptSelectedSkus (below) on every target SKU having at least one
// photo somewhere in its own history (same rule applyBulkStatus already
// enforces) before it'll finalize them. Only the SKUs still missing one get
// an upload slot rendered; "Accept All" stays disabled until every target —
// not just the ones shown here — has a photo on record.
function BulkPhotoUploadModal({ targets, reports, onClose, onAccept, applying, refresh }) {
  const withStatus = targets.map(t => ({
    ...t,
    hasPhoto: reports.some(r => r.po_line_item_id === t.li.id && (r.inspection_report_photos?.length ?? 0) > 0),
  }))
  const pending = withStatus.filter(t => !t.hasPhoto)
  const allReady = pending.length === 0

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="text-sm font-bold text-gray-900">Upload a Photo to Accept</div>
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
        <p className="px-5 pt-3 text-xs text-gray-500">
          These SKUs need at least one photo before they can be accepted. Upload one for each to continue.
        </p>
        <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
          {pending.map(({ li, reportId }) => {
            const finalReport = reports.find(r => r.id === reportId)
            return (
              <div key={li.id} className="border border-gray-200 rounded-lg p-3">
                <div className="text-xs font-bold text-gray-800 mb-2">{li.buyer_sku_ref || '-'}</div>
                <PhotoGrid reportId={reportId} photos={finalReport?.inspection_report_photos} disabled={false} onChanged={refresh} />
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={!allReady || applying}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40 transition-colors cursor-pointer"
          >
            {applying ? 'Accepting…' : `Accept All (${targets.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}

// Lets Inspection Date/Arrival/Start/Complete Time be set for a SKU right
// from this page, without opening the wizard - targets whichever stage is
// next actionable (falls back to Inline for a SKU with no report at all
// yet), pre-filled from that stage's own saved values or, failing that,
// from a sibling stage's (same carry-forward the wizard itself uses). A
// field edit updates the target report directly if one already exists, or
// creates a bare draft row on first edit - InspectionForm.jsx's own
// carryForwardSource then picks these values up automatically once Midline/
// Final are opened later, so this is just an earlier entry point onto the
// same fields, not a separate place they're stored.
// The way out of a locked next stage: when Inline (or Midline) is submitted but part of
// the order is still unresolved (accepted 1 of 51 and the rest neither accepted nor
// cancelled) and no round is open, this starts the next round for exactly that
// balance, booked on a follow-up schedule like the Reschedule choice at submit. Cancel
// Qty (next to it) is the other way out. Never shown while a round is already open.
function BalanceRoundButton({ reports, lineItem, po, userName, memberId, scheduleByStage, canManage, onDone }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  if (!canManage) return null
  // Only for a stage whose latest round is submitted with an accepted-ish result (a
  // Rejected / Feedback / On Hold round has its own follow-up flow), on a SKU that is not
  // finalized and has not already moved on to a later stage.
  const target = isFinalized(reports, lineItem.id) ? null : ['inline', 'midline'].map(stage => {
    const latest = getStage(reports, lineItem.id, stage)
    if (!latest || latest.status !== 'submitted' || !ACCEPTED_RESULTS.includes(latest.inspection_result)) return null
    const laterStages = stage === 'inline' ? ['midline', 'final'] : ['final']
    if (laterStages.some(s => getStage(reports, lineItem.id, s))) return null
    const balance = blockingBalance(reports, lineItem, stage)
    return balance > 0 ? { stage, balance } : null
  }).find(Boolean)
  if (!target) return null
  const { stage, balance } = target
  const start = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      // Re-read: someone may already have opened the next round.
      const { report: fresh, error: readErr } = await fetchLatestStageReport(lineItem.id, stage)
      if (readErr) throw readErr
      if (fresh && fresh.status !== 'submitted') { onDone?.(); return }
      const entryId = await bookFollowUpSchedule({
        poId: po.id, inspectionType: stage, lineItemId: lineItem.id,
        followUpQty: balance, remaining: balance, neverInspected: 0,
        acceptedQty: Math.max(0, (orderAfterCancellation(lineItem) ?? 0) - balance), rejected: false,
        activeEntryScheduledQty: orderAfterCancellation(lineItem), quantityOrdered: lineItem.quantity_ordered,
        assignedQaId: scheduleByStage?.(stage, lineItem.id)?.assigned_qa_id ?? memberId,
      })
      // bookFollowUpSchedule returns null on failure: stop with a visible error instead of
      // creating a round with no schedule behind it.
      if (!entryId) throw new Error('Could not book the follow-up schedule. Nothing was started; try again.')
      const { error: roundErr } = await startReInspection({
        po_line_item_id: lineItem.id, inspection_type: stage, next_round: (fresh?.round ?? 1) + 1,
        actor_name: userName, reason: 'Balance not resolved: round started for the remaining quantity',
        fulfilled_schedule_id: entryId,
      })
      if (roundErr) throw roundErr
      onDone?.()
    } catch (err) {
      setError(err.message || 'Could not start the round')
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="inline-flex items-center gap-1.5 flex-shrink-0">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        title={`${STAGE_LABEL[stage]} still has ${balance} unresolved. Start a ${STAGE_LABEL[stage]} round for them, or use Cancel Qty.`}
        className="px-2.5 py-1.5 rounded-md text-[10px] font-bold text-amber-700 bg-amber-50 ring-1 ring-amber-200 hover:bg-amber-100 disabled:opacity-50 transition-colors whitespace-nowrap"
      >
        {busy ? 'Starting…' : `Start ${STAGE_LABEL[stage]} round for balance (${balance})`}
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </span>
  )
}

function QuickSetFields({ reports, lineItem, userName, disabled, onSaved }) {
  const targetStage = getNextActionableStage(reports, lineItem.id, lineItem) || 'inline'
  const targetReport = getStage(reports, lineItem.id, targetStage)
  // Shows only what THIS stage's own report has saved: nothing is inherited from another stage
  // (Insp. Date / Arrival / Start / Complete are manual entry).
  const seed = f => targetReport?.[f] || ''

  const idRef = useRef(targetReport?.id || null)
  useEffect(() => { idRef.current = targetReport?.id || null }, [targetReport?.id])

  const [values, setValues] = useState(() => ({
    inspection_date: seed('inspection_date'), arrival_time: seed('arrival_time'),
    start_time: seed('start_time'), complete_time: seed('complete_time'),
  }))
  useEffect(() => {
    setValues({
      inspection_date: seed('inspection_date'), arrival_time: seed('arrival_time'),
      start_time: seed('start_time'), complete_time: seed('complete_time'),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetReport?.id, lineItem.id])

  const commit = async (field, value) => {
    if (idRef.current) {
      await updateInspectionReport(idRef.current, { [field]: value }, userName)
    } else {
      const { data, error } = await createInspectionReport({
        po_line_item_id: lineItem.id, inspection_type: targetStage, round: 1, status: 'draft',
        [field]: value, created_by: userName, updated_by: userName,
      })
      if (error?.code === '23505') {
        // Same recovery as saveAcceptedValue above: another field's commit
        // (or something else) already created this stage's draft row a
        // moment before this one landed.
        const { data: existing } = await findInspectionReport({ po_line_item_id: lineItem.id, inspection_type: targetStage, round: 1 })
        if (existing) { idRef.current = existing.id; await updateInspectionReport(existing.id, { [field]: value }, userName) }
      } else if (!error && data) {
        idRef.current = data.id
      }
    }
    onSaved?.()
  }

  const fields = [
    { key: 'inspection_date', label: 'Insp. Date', type: 'date' },
    { key: 'arrival_time', label: 'Arrival', type: 'text', placeholder: '10:00:00' },
    { key: 'start_time', label: 'Start', type: 'text', placeholder: '10:10:00' },
    { key: 'complete_time', label: 'Complete', type: 'text', placeholder: '18:50:00' },
  ]

  return (
    // One shared layout, used by both this file's desktop row (hidden
    // md:flex, so only the md: classes below ever apply there) and mobile
    // stack (md:hidden, so only the un-prefixed default classes apply
    // there) - a 2x2 grid of full-width inputs on mobile instead of four
    // fixed w-[104px] inputs in one unwrapped row (~440px minimum, wider
    // than a 360-390px phone on its own regardless of the parent's own
    // wrap/stack fixes).
    <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 w-full md:flex md:items-end md:gap-2 md:ml-auto md:w-auto flex-shrink-0">
      {fields.map(({ key, label, type, placeholder }) => (
        <label key={key} className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">{label}</span>
          <div className="relative">
            <input
              type={type}
              value={values[key]}
              placeholder={placeholder}
              disabled={disabled}
              onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
              onBlur={e => commit(key, e.target.value)}
              className={`w-full md:w-[104px] text-[11px] px-1.5 py-1 border border-gray-200 rounded-md focus:outline-none focus:border-gray-900 disabled:bg-gray-50 disabled:text-gray-400 ${type === 'text' ? 'pr-11' : ''}`}
            />
            {type === 'text' && !disabled && (
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {values[key] && (
                  <button
                    type="button"
                    onClick={() => { setValues(prev => ({ ...prev, [key]: '' })); commit(key, '') }}
                    title={`Clear ${label}`}
                    className="inline-flex items-center justify-center w-3.5 h-3.5 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { const v = nowTimeString(); setValues(prev => ({ ...prev, [key]: v })); commit(key, v) }}
                  title={`Stamp ${label} with the current time`}
                  className="inline-flex items-center justify-center w-4 h-4 text-gray-400 hover:text-gray-900 transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="10" y1="2" x2="14" y2="2" /><line x1="12" y1="14" x2="15" y2="11" /><circle cx="12" cy="14" r="8" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </label>
      ))}
    </div>
  )
}

// The SKU list (with its per-SKU stage dots) lives in the left panel now
// (PoInspectionComments.jsx's SkuListRow) — this component only owns the
// per-SKU stage buttons + the PDF export picker. `reports`/`loading`/`refresh`
// are passed down from the parent so both places share one fetch.
export default function InspectionReportEntry({ po, selectedLineItem, onSelectLineItem, reports, loading, refresh, userName, userEmail, memberId, canManage, onWizardOpenChange, stepNavContainer, closeWizardToken, onPoPatched, scheduleByStage, scheduledSkuIds, visibleTodaySkuIds, viewingRejectedFinal, onOpenComments }) {
  // When the sidebar's "Rejected" card (not "Re-Scheduled") is the one
  // selected, the overview below should read as history - Final's own pill/
  // Activity Log row/result line all showing that old rejected round, not
  // the fresh round the reset already started. Filtering the rejected
  // round's later siblings out of the array handed to every render below is
  // enough: getStage/getLockInfo/InspectionActivityLog all already pick
  // "latest round" on their own, so they naturally resolve to the rejected
  // round once nothing newer is visible to them. The wizard itself (opened
  // by clicking a pill) still gets the real, unfiltered `reports` - only
  // this overview's own display is affected.
  const displayReports = useMemo(() => {
    if (!viewingRejectedFinal || !selectedLineItem) return reports
    // Not Final-only anymore (InspectionForm.jsx's auto-reschedule fires for
    // any stage's rejection) - whichever stage was actually rejected has its
    // own later rounds filtered out here, not always 'final'.
    const rejectedRound = wasAnyStageRejected(reports, selectedLineItem.id)
    if (!rejectedRound) return reports
    return reports.filter(r =>
      !(r.po_line_item_id === selectedLineItem.id && r.inspection_type === rejectedRound.inspection_type && (r.round ?? 1) > (rejectedRound.round ?? 1))
    )
  }, [reports, viewingRejectedFinal, selectedLineItem])
  const [activeStage, setActiveStage] = useState(null)   // null | { type, reportId, initialStep }
  // Switching stage chips (Inline/Midline/Final) must flush any pending
  // autosave on the currently mounted InspectionForm BEFORE tearing it down
  // (see the per-stage `key` below) - otherwise up to ~1.5s of unsaved edits
  // on the stage being left could be silently lost. Mirrors the exact
  // closeWizardToken pattern InspectionForm.jsx already uses for closing the
  // wizard entirely: bump a token, the mounted form's own effect flushes and
  // then calls back here once it's actually safe to switch.
  const pendingStageRef = useRef(null)
  const [stageSwitchToken, setStageSwitchToken] = useState(0)
  const [showCancelQtyModal, setShowCancelQtyModal] = useState(false)
  const [pendingCancellation, setPendingCancellation] = useState(null)
  const { fetchPendingCancellations } = usePendingLineItemCancellations()
  useEffect(() => {
    if (!selectedLineItem) { setPendingCancellation(null); return }
    let cancelled = false
    fetchPendingCancellations([selectedLineItem.id]).then(map => {
      if (!cancelled) setPendingCancellation(map.get(selectedLineItem.id) || null)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLineItem?.id])
  const [searchParams, setSearchParams] = useSearchParams()
  // Same store PoInspectionComments.jsx already persists PO/SKU selection
  // into, extended here with stage/step — the URL alone survives a refresh
  // but gets wiped switching to another sidebar tab and back (those links are
  // static hrefs), so the store is what restores it in that case.
  const poInspectionSelection = useUiStore(s => s.poInspectionSelection)
  const setPoInspectionSelection = useUiStore(s => s.setPoInspectionSelection)
  const [showExport, setShowExport] = useState(false)
  // Mobile-only: the no-SKU-selected toolbar's overflow-x-auto row of up to
  // 7 buttons becomes a compact Accept button + this sheet on mobile (see
  // MobileBulkActionSheet.jsx) - a horizontally-scrolling action row gives
  // no visual hint there's more to the right, exactly the "user shouldn't
  // struggle" case this was built to close.
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false)

  // Fetched once here for the PO's whole line-item set and passed down,
  // PoSkuSummary's tables, its per-row export, and the Activity Log's export
  // all read the same map instead of each firing their own identical query.
  const { skuMasterById, loading: skuLoading } = useSkuMasterData((po?.po_line_items ?? []).map(li => li.sku_id))

  // SKU selection lives here rather than in PoSkuSummary because that
  // component unmounts whenever a SKU is opened - state parked there would
  // silently reset on every SKU round trip.
  const [checkedSkuIds, setCheckedSkuIds] = useState(() => new Set())
  const [showReworkModal, setShowReworkModal]           = useState(false)
  // null | { type: 'PPM_CALLOUT' | 'PILOT_RUN_CALLOUT' } - `type` doubles as the
  // po_comments.comment_type it'll write. Opens the modal directly regardless of whether any SKU
  // is checked (checkedSkuIds) - CalloutModal's own SKUs drawer is where the selection is actually
  // made/changed, so the button is never disabled just because nothing happens to be checked.
  const [calloutModal, setCalloutModal]                 = useState(null)
  const [showInspectLater, setShowInspectLater]         = useState(false)
  const [inspectLaterApplying, setInspectLaterApplying] = useState(false)
  const [inspectLaterNote, setInspectLaterNote]         = useState(null)   // { tone: 'error', text }

  // Bulk status-setting from the Overview screen (Part 8): ticked SKUs, a
  // status picked from the same 10 options Sign-off uses, applied to all of
  // them at once instead of opening each SKU's wizard individually.
  const [bulkStatus, setBulkStatus]     = useState('')
  const [bulkApplying, setBulkApplying] = useState(false)
  const [bulkNote, setBulkNote]         = useState(null)   // { tone: 'error' | 'info', text }
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [bulkReason, setBulkReason]     = useState('')   // required when bulkStatus is anything short of Accepted

  // Overview's Accepted column — editable in place, saving immediately (no
  // separate Apply step). `acceptedEdits` only holds the live value of a cell
  // the user is currently typing into, so the input stays controlled/responsive;
  // it's cleared for a row the moment that row's save finishes. Same
  // get-or-create Final-draft path as bulk status above. A row already
  // finalized (submitted Final) is never touched by any of this — frozen,
  // same as its row-select checkbox already is.
  const [acceptedEdits, setAcceptedEdits]       = useState({})   // { [lineItemId]: rawValue }
  const [acceptedApplying, setAcceptedApplying] = useState(false)
  const [acceptedNote, setAcceptedNote]         = useState(null)
  const [acceptedFilled, setAcceptedFilled]     = useState(false)   // header checkbox's own toggle state
  const editAccepted = (lineItemId, value) => setAcceptedEdits(prev => ({ ...prev, [lineItemId]: value }))

  // Returns a result instead of setting acceptedNote itself — bulk fill runs
  // these in parallel, and each call setting shared state directly would let
  // whichever resolves last silently clobber an earlier one's error. Also
  // returns the resolved report id on success, so acceptSelectedSkus (below)
  // can reuse this same get-or-create/recover logic instead of duplicating
  // it, rather than just knowing the save happened.
  const saveAcceptedValue = async (lineItemId, rawValue) => {
    const label = po.po_line_items?.find(x => x.id === lineItemId)?.buyer_sku_ref || lineItemId
    // Same prerequisite gate openStage/openDigitals enforce for the wizard —
    // this column is a second, direct-write path to the exact same Final
    // report, so it needs the same guard or it becomes a way to create a
    // Final row (and have it read as "In progress" instead of "Locked")
    // before Midline has actually been accepted.
    const finalLock = getLockInfo(reports, lineItemId, 'final', po.po_line_items?.find(x => x.id === lineItemId))
    if (finalLock.locked) {
      return { ok: false, label, message: finalLock.reason === 'balance'
        ? `Midline still has ${finalLock.balance} unresolved. Accept them in another round or cancel them before Final can be recorded.`
        : 'Midline must be accepted (or accepted with conditions) before Final can be recorded.' }
    }
    const value = Number(rawValue)
    if (!Number.isFinite(value)) return { ok: true, reportId: getStage(reports, lineItemId, 'final')?.id ?? null }
    const finalReport = getStage(reports, lineItemId, 'final')

    if (finalReport) {
      const { data, error } = await updateInspectionReport(finalReport.id, { accepted_quantity: value }, userName)
      if (error) return { ok: false, label, message: error.message }
      if (data) return { ok: true, reportId: finalReport.id }
      // finalReport's row is gone (e.g. deleted directly in the DB) — our
      // stale `reports` list just hadn't picked that up yet. Fall through
      // and create a fresh one instead of leaving the edit unsaved.
    }

    const created = await createInspectionReport({
      po_line_item_id: lineItemId, inspection_type: 'final', status: 'draft',
      accepted_quantity: value, created_by: userName, updated_by: userName,
    })
    if (created.error?.code === '23505') {
      // Mirrors InspectionForm.jsx's persistOrCreate recovery: the unique
      // (po_line_item_id, inspection_type) hit means a Final report already
      // exists that our stale `reports` list just hadn't picked up yet.
      const { data: existing, error: findErr } = await findInspectionReport({ po_line_item_id: lineItemId, inspection_type: 'final', round: 1 })
      if (findErr) return { ok: false, label, message: findErr.message }
      if (existing) {
        const { error } = await updateInspectionReport(existing.id, { accepted_quantity: value }, userName)
        return error ? { ok: false, label, message: error.message } : { ok: true, reportId: existing.id }
      }
    }
    return created.error ? { ok: false, label, message: created.error.message } : { ok: true, reportId: created.data.id }
  }

  // Fired on blur after a manual edit — saves just that one row. A ticked
  // row goes through the same accept-and-finalize path the header checkbox
  // uses (see acceptSelectedSkus below) instead of just recording the number.
  const commitAcceptedEdit = async (lineItemId) => {
    if (!(lineItemId in acceptedEdits)) return
    if (checkedSkuIds.has(lineItemId)) {
      const li = po.po_line_items?.find(x => x.id === lineItemId)
      if (li) { await acceptSelectedSkus([li]); return }
    }
    const result = await saveAcceptedValue(lineItemId, acceptedEdits[lineItemId])
    setAcceptedEdits(prev => { const next = { ...prev }; delete next[lineItemId]; return next })
    setAcceptedNote(result.ok ? null : { tone: 'error', text: `${result.label}: ${result.message}` })
    refresh()
  }

  // The header checkbox — a real toggle: checking fills every open (not yet
  // finalized) visible row's Accepted with its Balance, unchecking resets
  // them all to 0. Both save immediately, in parallel (one round trip's
  // worth of latency instead of one per row, which is what made this feel
  // sluggish/glitchy as a sequential loop).
  const toggleFillAccepted = async (rows) => {
    const useBalance = !acceptedFilled
    setAcceptedFilled(useBalance)
    setAcceptedApplying(true)
    const targets = rows.filter(li => !isFinalized(reports, li.id))
    const results = await Promise.all(targets.map(li => saveAcceptedValue(li.id, useBalance ? (li.balance_quantity ?? 0) : 0)))
    setAcceptedApplying(false)
    refresh()
    const errors = results.filter(r => !r.ok)
    setAcceptedNote(errors.length ? { tone: 'error', text: errors.map(e => `${e.label}: ${e.message}`).join('; ') + '.' } : null)
  }

  // Ticking a SKU and putting a number in Accepted (either the header
  // bulk-fill or a single manual cell commit) submits a real Final-accepted
  // verdict instead of the plain-number-only save unticked rows get — same
  // end state as Overall Status -> Accepted -> Apply, just triggered from
  // this column. `acceptGate` holds the pending batch once a SKU turns out
  // to need a photo first; null the rest of the time.
  const [acceptGate, setAcceptGate] = useState(null)   // null | { targets: [{ li, reportId, acceptedQty }] }
  const [acceptApplying, setAcceptApplying] = useState(false)

  // Mirrors InspectionForm.jsx's handleSubmit (fulfilled_schedule_id +
  // shortfall reschedule) and applyBulkStatus's logging, just applied to a
  // batch already known to have their photo requirement satisfied.
  const finalizeAccepted = async (targets) => {
    setAcceptApplying(true)
    const results = await Promise.all(targets.map(async ({ li, reportId, acceptedQty }) => {
      // Resolved per-SKU, not once for the whole batch - a newer Final entry
      // scoped to other SKUs on the same stage must never get credited with
      // fulfilling this li's report just because it's the PO-wide latest.
      const activeScheduleEntry = scheduleByStage?.('final', li.id)
      const coversSku = !!activeScheduleEntry
      const { error } = await updateInspectionReport(reportId, {
        accepted_quantity: acceptedQty, inspection_result: 'accepted',
        fulfilled_schedule_id: coversSku ? activeScheduleEntry.id : null,
      }, userName)
      if (error) return { li, ok: false, message: error.message }
      const { error: statusErr } = await updateInspectionReportStatus(reportId, 'submitted')
      if (statusErr) return { li, ok: false, message: statusErr.message }
      addInspectionReportLog({
        report_id: reportId, po_line_item_id: li.id, inspection_type: 'final', round: 1,
        event_type: 'submitted', actor_name: userName, reason: 'Bulk-accepted from PO Overview', result: 'accepted',
      }).then(({ error: logError }) => { if (logError) console.error('[InspectionReportEntry] bulk accept log failed:', logError.message) })

      // Whatever this SKU's schedule entry expected but didn't get accepted
      // becomes a new entry for the shortfall, dated today — same rule
      // InspectionForm.jsx's own submit path already applies.
      if (coversSku) {
        const scheduledQty = activeScheduleEntry.line_items?.find(x => x.id === li.id)?.quantity ?? li.quantity_ordered
        const remaining = scheduledQty - acceptedQty
        if (remaining > 0) {
          const { error: scheduleError } = await createSchedule({
            po_id: po.id, inspection_type: 'final', scheduled_date: todayLocalISO(),
            assigned_qa_id: activeScheduleEntry.assigned_qa_id,
            line_items: [{ id: li.id, quantity: remaining }],
            notes: `Auto-scheduled: ${acceptedQty} of ${scheduledQty} accepted, ${remaining} remaining.`,
            created_by: 'System',
          })
          if (scheduleError) console.error('[InspectionReportEntry] auto-reschedule failed:', scheduleError.message)
        }
      }
      return { li, ok: true }
    }))
    setAcceptApplying(false)
    setAcceptGate(null)
    setCheckedSkuIds(prev => {
      const next = new Set(prev)
      results.forEach(r => { if (r.ok) next.delete(r.li.id) })
      return next
    })
    refresh()
    const errors = results.filter(r => !r.ok)
    setAcceptedNote(errors.length
      ? { tone: 'error', text: errors.map(e => `${e.li.buyer_sku_ref || e.li.id}: ${e.message}`).join('; ') + '.' }
      : null)
  }

  const acceptSelectedSkus = async (candidateRows) => {
    const picked = candidateRows.filter(li => checkedSkuIds.has(li.id) && !isFinalized(reports, li.id))
    // A submitted Plan Aborted Final is never silently turned into Accepted by
    // this button (it used to be: isFinalized() treats Plan Aborted as 'not
    // decided', so the report fell through and was overwritten). Skip and say so.
    const isAbortedFinal = li => { const f = getStage(reports, li.id, 'final'); return f?.status === 'submitted' && f.inspection_result === 'plan_aborted' }
    const abortedSkipped = picked.filter(isAbortedFinal)
    const targets = picked.filter(li => !isAbortedFinal(li))
    if (abortedSkipped.length) {
      setAcceptedNote({ tone: 'error', text: `Skipped ${abortedSkipped.length} Plan Aborted SKU${abortedSkipped.length !== 1 ? 's' : ''} (${abortedSkipped.map(li => li.buyer_sku_ref).join(', ')}): a Plan Aborted Final is not changed by Accept.` })
    }
    if (!targets.length) return
    setAcceptApplying(true)
    const prepared = await Promise.all(targets.map(async li => {
      const value = acceptedEdits[li.id] ?? li.balance_quantity ?? 0
      const result = await saveAcceptedValue(li.id, value)
      return result.ok
        ? { li, reportId: result.reportId, acceptedQty: Number(value) || 0, error: null }
        : { li, error: result }
    }))
    setAcceptedEdits(prev => {
      const next = { ...prev }
      targets.forEach(li => delete next[li.id])
      return next
    })
    const failed = prepared.filter(p => p.error)
    const ready = prepared.filter(p => !p.error)
    if (failed.length) {
      setAcceptedNote({ tone: 'error', text: failed.map(f => `${f.error.label}: ${f.error.message}`).join('; ') + '.' })
    }
    refresh()
    if (!ready.length) { setAcceptApplying(false); return }

    // At least one photo somewhere in the SKU's own history — same rule
    // applyBulkStatus already enforces for the Overall Status accept path.
    const needsPhoto = ready.some(({ li }) => !reports.some(r => r.po_line_item_id === li.id && (r.inspection_report_photos?.length ?? 0) > 0))
    setAcceptApplying(false)
    if (needsPhoto) { setAcceptGate({ targets: ready }); return }
    await finalizeAccepted(ready)
  }

  // "Accept & Move to Final" - bulk-accepts Inline AND Midline for every
  // checked SKU, so 30-40 SKUs already known-good can skip straight to
  // being actionable at Final without opening the wizard twice per SKU. A
  // stage already accepted is left alone (nothing to do); anything else -
  // no report yet, a draft, or a submitted-but-not-accepted verdict
  // (rejected/on hold) - gets forced to Accepted too. This is deliberate,
  // not a shortcut: the app's own prerequisite-gating rule (getLockInfo in
  // stageStatus.jsx) requires Inline accepted before Midline can even open,
  // so leaving Inline sitting un-accepted while Midline gets bulk-accepted
  // would produce a state the rest of the app treats as impossible - Midline
  // "done" with Inline still not. Skipping only-existing-report stages
  // (regardless of their result) was the original design here and produced
  // exactly that broken state in practice; this replaces it.
  // No photo-gate unlike finalizeAccepted's Final-only accept path above -
  // these are meant to run before any physical inspection ever happened, so
  // requiring a photo first would defeat the point.
  const [stageAcceptApplying, setStageAcceptApplying] = useState(false)
  const [stageAcceptNote, setStageAcceptNote] = useState(null)
  // Shown when the checked SKUs don't all need the same next stage (one
  // still needs Inline, another Midline) - a real modal rather than the
  // inline note above, since it needs to stop and be actively dismissed
  // rather than just sit as a passive status line.
  const [stageMismatchOpen, setStageMismatchOpen] = useState(false)
  // Pending batch waiting on the "convert On Hold / Plan Aborted to Accepted"
  // confirmation (see handleAccept) - null when no confirmation is showing.
  const [acceptConfirm, setAcceptConfirm] = useState(null)
  // Synchronous re-entrancy lock for the Accept batch. stageAcceptApplying
  // is state, so a fast double click can start a second run before the
  // re-render that disables the button; a ref closes that window (a second
  // run would otherwise book a duplicate shortfall schedule entry).
  const acceptRunningRef = useRef(false)

  // Manual "Send Mail" - unlike Accept, this never writes anything; it just
  // (re)sends the notification email for an existing submitted report at a
  // stage the user explicitly picks (see the dropdown below), independent
  // of where each SKU's own inspection currently stands.
  const [sendMailMenuOpen, setSendMailMenuOpen] = useState(false)
  const [sendMailMenuPos, setSendMailMenuPos] = useState(null) // { top, left } | null
  const [sendMailMissing, setSendMailMissing] = useState(null) // { stage, skus: string[] } | null
  const [sendMailBuilding, setSendMailBuilding] = useState(false) // building the combined PDF before the dialog opens
  const [sendMailPdfError, setSendMailPdfError] = useState(null) // { stage, message } | null - PDF build/upload failed after retry
  const sendMailMenuRef = useRef(null)   // wraps the trigger button - used to measure its position
  const sendMailPortalRef = useRef(null) // the portaled dropdown itself, rendered outside this ref's tree
  // Portaled to document.body (see the button JSX below) rather than
  // positioned absolute right here - this toolbar row scrolls horizontally
  // on narrow screens (overflow-x-auto), which per the CSS overflow spec
  // forces its overflow-y to auto too, so a plain absolute dropdown
  // extending below the row was getting silently clipped/invisible, not
  // actually not-opening (confirmed live: the state was toggling fine, the
  // menu just never became visible).
  useEffect(() => {
    if (!sendMailMenuOpen) return
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return
      if (e.type === 'mousedown' && (sendMailMenuRef.current?.contains(e.target) || sendMailPortalRef.current?.contains(e.target))) return
      setSendMailMenuOpen(false)
    }
    // A fixed-position portal doesn't track the trigger button moving under
    // it (e.g. this row's own horizontal scroll, or the page scrolling) -
    // simplest correct behavior is to just close it rather than chase a
    // moving target.
    const closeOnScroll = () => setSendMailMenuOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [sendMailMenuOpen])

  // Creates (or converts) one SKU/stage's report to Accepted. Re-reads the
  // latest report fresh from the database and re-classifies it right before
  // writing - the in-memory `reports` list can be stale (another tab may have
  // rejected this SKU an hour ago). It then either creates a new Accepted
  // report, or makes ONE guarded update (acceptReportGuarded) that only
  // matches while the report is still in the state that was classified.
  // It never overwrites Rejected / Feedback in Progress (classifyAcceptAction),
  // and never nulls out an existing fulfilled_schedule_id. Mirrors
  // InspectionForm.jsx's handleSubmit otherwise (submit -> log -> shortfall
  // reschedule); no email goes out - the manual "Send Mail" button below is
  // the only way one does.
  const acceptStageForSku = async (li, stage, { retried = false } = {}) => {
    const acceptedQty = li.balance_quantity ?? li.quantity_ordered ?? 0
    const activeScheduleEntry = scheduleByStage?.(stage, li.id)
    const coversSku = !!activeScheduleEntry

    // Hard stop (the classifier above only reports it): never create or accept a
    // stage report behind a locked prerequisite, including via the 23505 retry.
    if (stage !== 'inline') {
      const lock = getLockInfo(reports, li.id, stage, li)
      if (lock.locked) return { li, stage, ok: false, skipped: true, reason: lock.reason === 'balance' ? 'balance_pending' : 'locked' }
    }
    const { report: fresh, previousResult, error: readErr } = await fetchLatestStageReport(li.id, stage)
    if (readErr) return { li, stage, ok: false, message: readErr.message }
    const decision = classifyAcceptAction(fresh, { rejectedEarlier: REINSPECT_RESULTS.includes(previousResult) })
    if (decision.action === 'skip') return { li, stage, ok: false, skipped: true, reason: decision.reason }
    if (decision.action === 'done') return { li, stage, ok: false, skipped: true, reason: 'already_accepted' }

    let reportId
    let round = 1
    if (decision.action === 'create') {
      const created = await createInspectionReport({
        po_line_item_id: li.id, inspection_type: stage, status: 'draft',
        inspector_name: activeScheduleEntry?.organization_members?.full_name || userName,
        // Inspection Date / Arrival / Start / Complete stay blank: manual entry only.
        accepted_quantity: acceptedQty, inspection_result: 'accepted', last_step: 'preview',
        created_by: userName, updated_by: userName,
        fulfilled_schedule_id: coversSku ? activeScheduleEntry.id : null,
      })
      if (created.error) {
        // A unique-constraint hit means a report for this SKU/stage appeared
        // in the moment since the fresh read above. Run once more: that read
        // will now find it and classify it properly, so a Rejected report
        // found this way is never overwritten (the old recovery re-read only
        // its id, hardcoded round 1, and force-accepted whatever it found).
        if (created.error.code === '23505' && !retried) return acceptStageForSku(li, stage, { retried: true })
        return { li, stage, ok: false, message: created.error.message }
      }
      reportId = created.data.id
      round = created.data.round ?? 1
      const { error: statusErr } = await updateInspectionReportStatus(reportId, 'submitted')
      if (statusErr) return { li, stage, ok: false, message: statusErr.message }
    } else {
      const guarded = await acceptReportGuarded(
        fresh.id,
        { expectedStatus: fresh.status, expectedResults: decision.action === 'accept_overwrite' ? ACCEPT_OVERWRITABLE_RESULTS : null },
        { acceptedQuantity: acceptedQty, fulfilledScheduleId: coversSku ? activeScheduleEntry.id : null, actorName: userName },
      )
      if (guarded.error) return { li, stage, ok: false, message: guarded.error.message }
      if (guarded.conflict) return { li, stage, ok: false, conflict: true }
      reportId = fresh.id
      round = fresh.round ?? 1
    }
    addInspectionReportLog({
      report_id: reportId, po_line_item_id: li.id, inspection_type: stage, round,
      event_type: 'submitted', actor_name: userName, result: 'accepted',
      reason: decision.action === 'accept_overwrite'
        ? `Accept (bulk) - converted from ${RESULT_LABEL[fresh.inspection_result] || fresh.inspection_result}`
        : 'Accept (bulk)',
    }).then(({ error: logError }) => { if (logError) console.error('[InspectionReportEntry] accept-stage log failed:', logError.message) })

    // Shortfall reschedule - same rule finalizeAccepted/InspectionForm.jsx's
    // own submit handler already apply. Normally a no-op here since
    // acceptedQty is the SKU's full balance, but a schedule entry covering
    // less than that still leaves a real shortfall to re-book.
    if (coversSku) {
      const scheduledQty = activeScheduleEntry.line_items?.find(x => x.id === li.id)?.quantity ?? li.quantity_ordered
      const remaining = scheduledQty - acceptedQty
      if (remaining > 0) {
        const { error: scheduleError } = await createSchedule({
          po_id: po.id, inspection_type: stage, scheduled_date: todayLocalISO(),
          assigned_qa_id: activeScheduleEntry.assigned_qa_id,
          line_items: [{ id: li.id, quantity: remaining }],
          notes: `Auto-scheduled: ${acceptedQty} of ${scheduledQty} accepted, ${remaining} remaining.`,
          created_by: 'System',
        })
        if (scheduleError) console.error('[InspectionReportEntry] auto-reschedule failed:', scheduleError.message)
      }
    }

    // No automatic notification email on bulk-accept anymore - the manual
    // "Send Mail" button below is now the only way one goes out, so this no
    // longer builds/uploads a PDF attachment that nothing would consume.

    return { li, stage, ok: true, reportId, action: decision.action, previous: fresh?.inspection_result ?? null }
  }

  // The one stage this button would act on next for a SKU. Unlike
  // getNextActionableStage (stageStatus.jsx), this only ever looks at
  // Inline/Midline - Final has its own separate accept flow
  // (acceptSelectedSkus/finalizeAccepted above) - and returns null once both
  // are already accepted, meaning there's nothing left for this button to do
  // (the SKU is just waiting to be opened in Final some other way).
  // Returns { stage, action, reason } for the first stage that still needs
  // this button, or null when both are already accepted. The `action` comes
  // from classifyAcceptAction (stageStatus.jsx): a SKU whose stage is
  // Rejected / Feedback in Progress / a re-inspection waiting to happen gets
  // action 'skip' and BLOCKS the SKU right there - it must not fall through to
  // Midline, which stays locked behind an Inline that is not accepted.
  const getSkuAcceptStage = (lineItemId) => {
    for (const stage of ['inline', 'midline']) {
      const existing = getStage(reports, lineItemId, stage)
      // A later-round draft right after a REJECTED round is a re-inspection
      // still waiting to happen; a draft after an accepted round (a
      // reopened rework) is not.
      const previous = existing && existing.status !== 'submitted' && (existing.round ?? 1) > 1
        ? mostRecentSubmittedRound(reports, lineItemId, stage)
        : null
      const { action, reason } = classifyAcceptAction(existing, { rejectedEarlier: REINSPECT_RESULTS.includes(previous?.inspection_result) })
      if (action === 'done') continue
      // Midline behind an Inline whose order quantity is not fully accepted or
      // cancelled is locked (same rule as the stage buttons): skip and say why.
      if (stage !== 'inline') {
        const lock = getLockInfo(reports, lineItemId, stage, po.po_line_items?.find(x => x.id === lineItemId))
        if (lock.locked) return { stage, action: 'skip', reason: lock.reason === 'balance' ? 'balance_pending' : 'locked' }
      }
      return { stage, action, reason }
    }
    return null
  }

  const handleAccept = async (candidateRows) => {
    if (acceptRunningRef.current) return
    const targets = candidateRows.filter(li => checkedSkuIds.has(li.id))
    if (!targets.length) return

    // Classify each checked SKU by the single stage it actually needs next.
    // SKUs with nothing left (both Inline and Midline already accepted) are
    // counted as "done" rather than causing a mismatch, and SKUs the button
    // must not touch (Rejected, Feedback in Progress, re-inspection pending)
    // are set aside and listed in the result note.
    const classified = targets.map(li => ({ li, ...(getSkuAcceptStage(li.id) ?? {}) }))
    const skippedByState = classified.filter(c => c.stage && c.action === 'skip').map(c => ({ li: c.li, reason: c.reason }))
    const actionable = classified.filter(c => c.stage && c.action !== 'skip')
    const doneCount = classified.filter(c => !c.stage).length

    if (!actionable.length) {
      setStageAcceptNote({ tone: 'error', text: skippedByState.length
        ? `Nothing was accepted. Skipped ${skippedByState.length}: ${summarizeAcceptSkips(skippedByState)}.`
        : 'Every selected SKU already has Inline and Midline accepted - nothing to do.' })
      return
    }

    const stagesPresent = new Set(actionable.map(c => c.stage))
    if (stagesPresent.size > 1) {
      setStageMismatchOpen(true)
      return
    }

    const [stage] = stagesPresent
    const jobs = actionable.map(({ li, action }) => ({ li, action }))
    // Converting an already-submitted On Hold / Plan Aborted report overwrites
    // a recorded state, so it gets one explicit confirmation naming what will
    // change. A batch of only not-started / draft SKUs stays a single click.
    const held = { on_hold: 0, plan_aborted: 0 }
    for (const { li, action } of jobs) {
      if (action !== 'accept_overwrite') continue
      const r = getStage(reports, li.id, stage)?.inspection_result
      if (r in held) held[r] += 1
    }
    const batch = { stage, jobs, skippedByState, doneCount, held }
    if (held.on_hold + held.plan_aborted > 0) {
      setStageAcceptNote(null)
      setAcceptConfirm(batch)
      return
    }
    await runAccept(batch)
  }

  // Runs one classified Accept batch. Guarded by acceptRunningRef so a double
  // click (or the confirmation's own button plus a stray click) can never run
  // it twice - a second run would book a duplicate shortfall schedule entry.
  const runAccept = async ({ stage, jobs, skippedByState, doneCount }) => {
    if (acceptRunningRef.current) return
    acceptRunningRef.current = true
    setStageAcceptApplying(true)
    setStageAcceptNote(null)
    let results
    try {
      results = await mapWithConcurrency(jobs, 5, ({ li }) => acceptStageForSku(li, stage))
    } catch (err) {
      results = null
      setStageAcceptNote({ tone: 'error', text: `Accept stopped part-way: ${err?.message || 'unexpected error'}. Refresh to see what was saved.` })
    } finally {
      acceptRunningRef.current = false
      setStageAcceptApplying(false)
    }
    setCheckedSkuIds(new Set())
    refresh()
    if (!results) return

    // No automatic notification email on bulk-accept anymore - the manual
    // "Send Mail" button (handleSendMail below) is now the only way one
    // goes out for these SKUs.

    const ref = r => r.li.buyer_sku_ref || r.li.id
    const accepted = results.filter(r => r.ok)
    const conflicts = results.filter(r => r.conflict)
    // Re-classified at write time from a fresh read: something changed since
    // the list on screen was loaded, and the button declined to touch it.
    const changedSkips = results.filter(r => r.skipped).map(r => ({ li: r.li, reason: r.reason }))
    const errors = results.filter(r => !r.ok && !r.conflict && !r.skipped)

    const parts = []
    if (accepted.length) {
      const converted = accepted.filter(r => r.action === 'accept_overwrite').length
      parts.push(`Accepted ${STAGE_LABEL[stage]} for ${accepted.length} SKU${accepted.length !== 1 ? 's' : ''}`
        + (converted ? ` (${converted} converted from On Hold / Plan Aborted)` : '') + '.')
    }
    const allSkips = [...skippedByState, ...changedSkips]
    if (allSkips.length) parts.push(`Skipped ${allSkips.length}: ${summarizeAcceptSkips(allSkips)}.`)
    if (doneCount) parts.push(`${doneCount} already accepted at Inline and Midline.`)
    if (conflicts.length) parts.push(`${conflicts.length} changed by someone else while accepting, nothing was written for: ${conflicts.map(ref).join(', ')}. Refresh and try again.`)
    if (errors.length) parts.push(`${errors.length} failed: ${errors.map(e => `${ref(e)} (${e.message || 'error'})`).join(', ')}.`)
    setStageAcceptNote({
      tone: errors.length || conflicts.length || !accepted.length ? 'error' : 'success',
      text: parts.join(' ') || 'Nothing to do.',
    })
  }

  // Manual (re)send - unlike Accept, never writes anything; just resends the
  // notification for whichever stage's already-submitted report the user
  // picks, for every checked SKU. "Has a submitted report at this stage"
  // doesn't require it to be the SKU's *current* stage - re-sending an old
  // Inline notice for a SKU that's since reached Final still works, since
  // the whole point of the stage picker is letting the user choose freely.
  const handleSendMail = async (stage, { skipAttachment = false } = {}) => {
    const targets = (po.po_line_items ?? []).filter(li => checkedSkuIds.has(li.id))
    if (!targets.length) return

    const missing = []
    const reportIds = []
    for (const li of targets) {
      const report = getStage(reports, li.id, stage)
      if (report?.status === 'submitted') {
        reportIds.push(report.id)
      } else {
        // The latest round isn't submitted (e.g. a fresh draft opened by
        // Rework approval, a leftover-quantity re-inspection, or an auto
        // re-inspection) - fall back to the most recent submitted round for
        // this stage, whatever its verdict. That most recent submitted round
        // is real, sendable history even once a newer draft round has since
        // superseded it as "the latest" - this used to only check for a
        // rejected round specifically, which missed e.g. a submitted
        // "Partially Accepted" report once a fresh draft round opened on
        // top of it.
        const lastSubmitted = mostRecentSubmittedRound(reports, li.id, stage)
        if (lastSubmitted) reportIds.push(lastSubmitted.id)
        else missing.push(li.buyer_sku_ref || li.id)
      }
    }

    if (missing.length) {
      setSendMailMissing({ stage, skus: missing })
      return
    }

    // One combined PDF covering every selected report, uploaded once -
    // same exporter Export PDF already uses, just built for this batch. A
    // batch used to fire one email PER SKU (one POST per reportId, each
    // with its own attachment-less send) - one PO with several SKUs
    // checked read as a flood of near-identical emails. Built up front
    // (not lazily inside buildSendRequests, which only runs once the user
    // confirms) so it's already resolved the moment the dialog opens.
    // The report is the whole point of this email - a failed build/upload
    // used to be swallowed silently (logged to console only) and the email
    // still went out with no attachment and no way for the sender to even
    // know. Retried once (a transient network blip shouldn't need a human
    // to notice and re-click), and if it still fails, this now STOPS here
    // and asks the user rather than sending an attachment-less email
    // unannounced - `skipAttachment` (the "Send without attachment" escape
    // hatch on that prompt) is the only way past this without a PDF.
    // Photos embed at full original resolution now (no server/client-side
    // compression anywhere - see exportInspectionReportPdf.js), which makes
    // a photo-heavy multi-SKU batch's PDF easily exceed common email
    // attachment limits (Gmail and most providers cap around 20-25MB) - a
    // real case hit 65MB for just 4 SKUs. Rather than blocking the send
    // when that happens, the PDF still uploads (Supabase Storage has no
    // such limit) and `pdfDownloadUrl` - a public link to it - rides along
    // in the send request alongside `pdfStoragePath`, so the backend
    // template can offer a download link when it's too big to attach
    // outright. `pdfTooLargeToAttach` flags which case this is, so the
    // backend doesn't have to re-derive it from size itself.
    const MAX_ATTACHMENT_BYTES = 18 * 1024 * 1024
    let pdfStoragePath = null
    let pdfDownloadUrl = null
    let pdfTooLargeToAttach = false
    // True when the selection was too large for one PDF and got split into
    // a zip of part-PDFs instead (see exportSplitInspectionReportPdfs) -
    // sent to the backend so it names the attachment "....zip" rather than
    // hardcoding "....pdf" regardless of what's actually stored at
    // pdfStoragePath (shopify-backend routes/inspectionSchedule.js).
    let pdfIsZip = false
    if (!skipAttachment) {
      setSendMailBuilding(true)
      const selectedReports = reportIds.map(id => reports.find(r => r.id === id)).filter(Boolean)
      const buildAndUpload = async () => {
        // Phase 3 - built server-side now (see inspectionReportPdfApi.js),
        // mode 'final' since this attachment is what actually reaches the
        // recipient's inbox, a real delivery like a download, not a
        // look-then-close preview. The server resolves its own SKU/PO data
        // from just poId + reportIds, so this no longer needs
        // skuMasterById at all.
        //
        // fetchInspectionReportPdfLocation, deliberately NOT
        // fetchInspectionReportPdf - the server already uploads the built
        // file to Storage and hands back its path/url/size directly; this
        // only ever needs a place to point the email at, not the file
        // itself. Pulling a real batch's file (easily hundreds of MB - see
        // that function's own note) through the browser just to
        // immediately re-upload it elsewhere for the exact same reference
        // was real, reproduced dead weight - the actual cause of this still
        // failing on a real network even after the server-side generation
        // itself was proven working.
        const { fetchInspectionReportPdfLocation } = await import('../../../lib/inspectionReportPdfApi')
        const { url, path, size, isZip } = await fetchInspectionReportPdfLocation(po.id, selectedReports.map(r => r.id), { mode: 'final', createdBy: userName })
        return { path, url, tooLarge: size > MAX_ATTACHMENT_BYTES, isZip }
      }
      try {
        ({ path: pdfStoragePath, url: pdfDownloadUrl, tooLarge: pdfTooLargeToAttach, isZip: pdfIsZip } = await buildAndUpload())
      } catch (err) {
        console.error('[InspectionReportEntry] Send Mail PDF attachment failed, retrying once:', err.message)
        try {
          ({ path: pdfStoragePath, url: pdfDownloadUrl, tooLarge: pdfTooLargeToAttach, isZip: pdfIsZip } = await buildAndUpload())
        } catch (retryErr) {
          console.error('[InspectionReportEntry] Send Mail PDF attachment failed again:', retryErr.message)
          setSendMailBuilding(false)
          setSendMailPdfError({ stage, message: retryErr.message || 'Failed to build the report' })
          return
        }
      }
      setSendMailBuilding(false)
    }

    // "Submitted By" in the email should read as the QA who actually
    // inspected/submitted these reports, not whoever happens to click Send
    // Mail (could be a different admin sending on their behalf later) - pull
    // it off each submitted report's own inspector_name instead of userName.
    // Falls back to userName only if none of the batch's reports carry one.
    const inspectorNames = [...new Set(
      reportIds.map(id => reports.find(r => r.id === id)?.inspector_name).filter(Boolean)
    )]
    const submittedByName = inspectorNames.length ? inspectorNames.join(', ') : userName

    // One combined recipient-confirmation dialog AND one combined send for
    // the whole batch - every report here shares the same PO, so
    // recipients resolve identically regardless of which one previews
    // first. This is the *only* place an inspection notification email
    // fires now - wizard Submit and bulk Accept above no longer send one
    // automatically.
    useSendMailStore.getState().requestSend({
      previewRequest: {
        url: `${import.meta.env.VITE_BACKEND_URL}/inspection-schedule/report-submitted/preview`,
        body: { reportId: reportIds[0] },
      },
      buildSendRequests: (selectedEmails) => [{
        url: `${import.meta.env.VITE_BACKEND_URL}/inspection-schedule/report-submitted`,
        body: { reportIds, submittedByName, pdfStoragePath, pdfDownloadUrl, pdfTooLargeToAttach, pdfIsZip, selectedEmails },
      }],
      buildVendorContactRequest: (name, email) => ({
        url: `${import.meta.env.VITE_BACKEND_URL}/inspection-schedule/report-submitted/vendor-contact`,
        body: { reportId: reportIds[0], name, email, createdBy: userName },
      }),
      buildBuyerContactRequest: (name, email) => ({
        url: `${import.meta.env.VITE_BACKEND_URL}/inspection-schedule/report-submitted/buyer-contact`,
        body: { reportId: reportIds[0], name, email, createdBy: userName },
      }),
      buildLinkContactRequest: (name, email) => ({
        url: `${import.meta.env.VITE_BACKEND_URL}/inspection-schedule/report-submitted/link-contact`,
        body: { reportId: reportIds[0], name, email, createdBy: userName },
      }),
    })
  }

  // Splits every checked SKU off today's schedule onto newDate. "Affected" =
  // every non-cancelled entry that (a) covers at least one checked SKU and
  // (b) is due today-or-earlier (scheduled_date <= today) - i.e. is one of
  // the reasons that SKU is currently showing (see PoInspectionComments.jsx's
  // visibleTodaySkuIds). An entry already dated in the future is left alone.
  //
  // line_items shape mirrors the rest of this file's own scheduling calls
  // (see finalizeAccepted above / InspectionForm.jsx's submit handler):
  // {id, quantity} objects, with a null/empty array meaning "the whole PO".
  // An empty array is NOT distinct from null - every reader treats both the
  // same via `.length` truthiness - so an entry shrunk down to zero
  // remaining SKUs must be cancelled instead of given `line_items: []`,
  // which would silently revert it back to "whole PO" and re-cover every
  // other SKU on the PO.
  const inspectLater = async (newDate) => {
    const targetIds = new Set(checkedSkuIds)
    if (!targetIds.size || !newDate) return
    const today = todayLocalISO()
    // The modal's date input only hints min=tomorrow via the HTML `min`
    // attribute - not all browsers enforce that strictly, and it's trivial
    // to bypass. A newDate that isn't actually in the future would leave
    // the split SKUs immediately visible again (visibleTodaySkuIds is
    // date <= today), silently defeating the whole point of this action.
    if (newDate <= today) {
      setInspectLaterNote({ tone: 'error', text: 'Pick a date after today.' })
      return
    }
    setInspectLaterApplying(true)
    setInspectLaterNote(null)
    try {
      const allLineItems = po.po_line_items ?? []
      const { entries: poEntries, error: fetchErr } = await fetchPoScheduleEntries(po.id)
      if (fetchErr) throw new Error(fetchErr.message)

      const affected = (poEntries || []).filter(e =>
        e.status !== 'cancelled' && e.scheduled_date <= today &&
        (!e.line_items?.length || e.line_items.some(li => targetIds.has(li.id)))
      )

      // A finalized SKU's schedule was already consumed on acceptance, so
      // it has no active entry left to move - checking one is now possible
      // (Overview keeps finalized SKUs selectable, for Send Mail), but
      // without this guard the loop below would just do nothing and this
      // would still close/clear as if it worked, with no sign nothing
      // actually moved.
      if (!affected.length) {
        setInspectLaterNote({ tone: 'error', text: 'Selected SKUs have no active schedule to move - already finalized.' })
        return
      }

      // Tracks entries created/merged-into by this call so a PO with more
      // than one affected entry for the SAME stage (e.g. two separate
      // today-dated Final entries covering different SKUs) merges its
      // second split into the first split's new entry instead of creating a
      // sibling duplicate - poEntries was fetched once up front, so a
      // same-date entry created earlier in this very loop wouldn't
      // otherwise be visible to a later iteration.
      const newEntriesByStage = {}

      for (const entry of affected) {
        const currentLineItems = entry.line_items?.length
          ? entry.line_items
          : allLineItems.map(li => ({ id: li.id, quantity: li.quantity_ordered }))
        const movingLineItems    = currentLineItems.filter(li => targetIds.has(li.id))
        const remainingLineItems = currentLineItems.filter(li => !targetIds.has(li.id))
        if (!movingLineItems.length) continue

        if (remainingLineItems.length) {
          const { error: shrinkErr } = await updateSchedule(entry.id, { line_items: remainingLineItems })
          if (shrinkErr) throw new Error(shrinkErr.message)
        } else {
          const { error: cancelErr } = await updateScheduleStatus(entry.id, 'cancelled', 'Superseded: all SKUs moved via Inspect Later.')
          if (cancelErr) throw new Error(cancelErr.message)
        }

        // Merge into an already-existing entry for this exact PO/stage/date
        // (one someone scheduled by hand, or an earlier iteration of this
        // same split) instead of creating a second entry that would just
        // duplicate the same row in the Scheduled POs table - same rule
        // finalizeAccepted's own auto-reschedule already follows.
        const existingEntry = newEntriesByStage[entry.inspection_type]
          || poEntries.find(e => e.status !== 'cancelled' && e.inspection_type === entry.inspection_type && e.scheduled_date === newDate)

        if (existingEntry) {
          const nextLineItems = existingEntry.line_items?.length
            ? [...existingEntry.line_items.filter(li => !movingLineItems.some(m => m.id === li.id)), ...movingLineItems]
            : null   // null already means "whole PO" - these SKUs are already covered
          const { error: mergeErr } = await updateSchedule(existingEntry.id, { line_items: nextLineItems })
          if (mergeErr) throw new Error(mergeErr.message)
          newEntriesByStage[entry.inspection_type] = { ...existingEntry, line_items: nextLineItems }
        } else {
          const { data: created, error: createErr } = await createSchedule({
            po_id: po.id,
            inspection_type: entry.inspection_type,
            scheduled_date: newDate,
            assigned_qa_id: entry.assigned_qa_id,
            line_items: movingLineItems,
            notes: `Inspect Later: split from ${entry.scheduled_date} entry, ${movingLineItems.length} SKU${movingLineItems.length !== 1 ? 's' : ''} moved.`,
            created_by: userName, created_by_email: userEmail,
          })
          if (createErr) throw new Error(createErr.message)
          newEntriesByStage[entry.inspection_type] = created
        }
      }

      setCheckedSkuIds(new Set())
      setShowInspectLater(false)
      refresh()
    } catch (err) {
      setInspectLaterNote({ tone: 'error', text: err.message || 'Failed to reschedule' })
    } finally {
      setInspectLaterApplying(false)
    }
  }

  // Drop the selection (and any leftover bulk/accepted-save error banner —
  // neither auto-clears otherwise, so a failure on one PO would keep showing
  // after navigating to a completely different one) when a different PO is
  // loaded. Adjusted during render (React's documented pattern) rather than
  // in an effect, so the tables never paint a frame carrying the previous
  // PO's line-item ids.
  const [prevPoId, setPrevPoId] = useState(po?.id)
  if (prevPoId !== po?.id) {
    setPrevPoId(po?.id)
    setCheckedSkuIds(new Set())
    setBulkNote(null)
    setAcceptedNote(null)
    setStageAcceptNote(null)
    setStageMismatchOpen(false)
    setSendMailMenuOpen(false)
    setSendMailMissing(null)
  }

  const toggleChecked = (id) => setCheckedSkuIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const toggleAll = (rows, allChecked) => setCheckedSkuIds(allChecked ? new Set() : new Set(rows.map(li => li.id)))

  // Lets the sidebar (PoInspectionComments.jsx) know to swap its SKU list
  // for the active-SKU + step-nav slot while a stage wizard is open here.
  useEffect(() => {
    onWizardOpenChange?.(!!(activeStage && selectedLineItem))
  }, [activeStage, selectedLineItem, onWizardOpenChange])

  // Restores which stage wizard was open, and which step within it, so a
  // refresh or a switch to another sidebar tab and back lands right where the
  // user left off instead of the Overview / step 1. URL (?stage=&step=) wins
  // when present (refresh case); the store fills in when the URL was reset by
  // a static tab link. Waits on `reports` to finish loading since the report
  // row for that stage is looked up from it; only fires once per SKU (guarded
  // by `activeStage` being empty) so it never fights a wizard the user just
  // opened by hand.
  useEffect(() => {
    if (activeStage || !selectedLineItem || loading) return
    const urlSku = searchParams.get('sku')
    if (urlSku && urlSku !== selectedLineItem.id) return
    const stageParam = searchParams.get('stage') || poInspectionSelection?.stage
    if (!stageParam || !STAGES.some(s => s.key === stageParam)) return
    const stepParam = searchParams.get('step') || poInspectionSelection?.step || undefined
    // ?report= (from a QC Reports Inspection Number search) opens that EXACT
    // round, bypassing getStage's usual "latest round only" resolution - so
    // an older, now-superseded round is still reachable by its own number
    // even after a newer round exists. URL-only (not mirrored into
    // poInspectionSelection like stage/step) - a deep link is meant to be
    // used once, then it's deleted from the URL below same as a normal
    // visit; a later tab-switch-and-back falls through to the usual
    // latest-round lookup, which is the right default for every other entry
    // point (stage pills, Activity Log, etc. never set this param at all).
    const reportParam = searchParams.get('report')
    const explicitReport = reportParam ? reports.find(r => r.id === reportParam && r.po_line_item_id === selectedLineItem.id) : null
    const report = explicitReport || getStage(reports, selectedLineItem.id, stageParam)
    setActiveStage({ type: stageParam, reportId: report?.id ?? null, initialStep: stepParam })
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('stage', stageParam)
      if (stepParam) next.set('step', stepParam)
      next.delete('report')
      return next
    }, { replace: true })
  }, [activeStage, selectedLineItem, loading, reports, searchParams, poInspectionSelection, setSearchParams])

  const closeStage = () => {
    setActiveStage(null)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('stage')
      next.delete('step')
      return next
    }, { replace: true })
    setPoInspectionSelection(prev => (prev ? { ...prev, stage: null, step: null } : prev))
    refresh()
  }

  // Keeps the URL + store's remembered step in sync as the wizard's own step
  // state changes, so it's there to restore from on the next refresh/tab-switch.
  const handleStepChange = (stepKey) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('step', stepKey)
      return next
    }, { replace: true })
    setPoInspectionSelection(prev => (prev ? { ...prev, step: stepKey } : prev))
  }

  // PPM/Pilot Run Callouts apply to any checked SKU regardless of its
  // inspection state (unlike Rework, there's no report/wizard gating here -
  // PPM and Pilot Run are schedule-only stages with no report of their
  // own), so this is just the checked ids resolved to their sku_ref, no
  // filtering. Memoized - CalloutModal stays mounted while checked, and an
  // unmemoized array here got a new identity on every unrelated re-render
  // (e.g. switching Inline/Midline/Final tabs elsewhere on this same page),
  // which made the modal's own effects think its SKU selection had changed
  // and refetch/flash "Loading…" every time. Declared here, before the
  // `if (activeStage...)` early return just below - hooks can't be called
  // conditionally, and that branch returns before reaching the bottom of
  // this function on some renders.
  const calloutItems = useMemo(() => [...checkedSkuIds].map(id => {
    const li = (po.po_line_items ?? []).find(x => x.id === id)
    return { po_line_item_id: id, sku_ref: li?.buyer_sku_ref }
  }), [checkedSkuIds, po.po_line_items])
  // Every SKU on the PO (not just checked ones) - what CalloutModal's own SKUs drawer offers, so
  // the user can add/remove SKUs there regardless of what was ticked when the modal opened.
  const allSkuCalloutItems = useMemo(() => (po.po_line_items ?? []).map(li => ({ po_line_item_id: li.id, sku_ref: li.buyer_sku_ref })), [po.po_line_items])
  // Opens the modal directly - no separate "pick SKUs" screen. Whatever's ticked here (possibly
  // nothing) is just the modal's starting selection; the SKUs drawer inside it is where the user
  // actually settles the selection before posting.
  const openCallout = (type) => setCalloutModal({ type })

  if (activeStage && selectedLineItem) {
    return (
      <InspectionForm
        key={`${selectedLineItem.id}-${activeStage.type}`}
        lineItem={selectedLineItem}
        reportId={activeStage.reportId}
        inspectionType={activeStage.type}
        initialStep={activeStage.initialStep}
        onStepChange={handleStepChange}
        locked={isFinalized(reports, selectedLineItem.id)}
        userName={userName}
        memberId={memberId}
        canManage={canManage}
        onClose={closeStage}
        stepNavContainer={stepNavContainer}
        closeWizardToken={closeWizardToken}
        stageSwitchToken={stageSwitchToken}
        onStageFlushed={onStageFlushed}
        poInspectionLevel={po?.inspection_level}
        reports={reports}
        scheduleByStage={scheduleByStage}
        po={po}
        onSwitchStage={openStage}
        refresh={refresh}
      />
    )
  }

  // Function declaration (not `const`) so it's hoisted and usable above, in
  // the early-return `InspectionForm` branch that passes it down as
  // `onSwitchStage` - textually declared after that branch but needed inside it.
  function openStage(stageKey, report) {
    if (selectedLineItem && getLockInfo(reports, selectedLineItem.id, stageKey, selectedLineItem).locked) return
    const next = { type: stageKey, reportId: report?.id ?? null }
    // Nothing mounted yet (first open from the sidebar) - no autosave to
    // flush, switch immediately. Once a stage IS already open, route through
    // the flush-token path below instead so its pending edits aren't lost.
    if (!activeStage) { applyStageSwitch(next); return }
    pendingStageRef.current = next
    setStageSwitchToken(t => t + 1)
  }

  // Actually commits a stage switch - called directly above for the first
  // open, and by onStageFlushed below once the previously mounted
  // InspectionForm confirms its pending autosave has been flushed.
  function applyStageSwitch(next) {
    setActiveStage(next)
    setPoInspectionSelection(prev => (prev ? { ...prev, stage: next.type, step: null } : prev))
    setSearchParams(prev => {
      const p = new URLSearchParams(prev)
      p.set('stage', next.type)
      p.delete('step')
      return p
    }, { replace: true })
  }

  // `ok` is false when the open form could not save its pending edits: the switch is dropped and
  // the form stays open (it is already showing the error).
  function onStageFlushed(ok = true) {
    if (!pendingStageRef.current) return
    if (ok === false) { pendingStageRef.current = null; return }
    applyStageSwitch(pendingStageRef.current)
    pendingStageRef.current = null
  }

  // Bulk-apply a status to every ticked SKU. Reuses the existing Final-report
  // + isFinalized() freeze mechanism entirely, no new locking logic: a
  // verdict status marks that SKU's Final report `status: 'submitted'`
  // (which is already what "frozen" means everywhere else in this app),
  // while a workflow status just tags `inspection_result` and leaves it a
  // draft. Every verdict requires at least one photo somewhere in that SKU's
  // own history first (not necessarily on the Final row being created here,
  // requiring it there specifically would be an unusable catch-22, since a
  // brand-new Final report always starts with zero photos of its own).
  const applyBulkStatus = async () => {
    const isVerdict = VERDICT_RESULTS.includes(bulkStatus)
    const reasonRequired = RESULTS_REQUIRING_REMARK.includes(bulkStatus)
    const reason = bulkReason.trim()
    const checked = [...checkedSkuIds]
    const updated = []
    const skippedNoPhoto = []
    const skippedLocked = []
    const errors = []

    setBulkApplying(true)
    setBulkNote(null)
    for (const lineItemId of checked) {
      const li = po.po_line_items?.find(x => x.id === lineItemId)
      const label = li?.buyer_sku_ref || lineItemId

      // Same prerequisite gate the wizard enforces — this is a second,
      // direct-write path to the same Final report, so a SKU whose Midline
      // isn't accepted yet needs to be skipped here too, not just blocked
      // from the wizard's own Final button.
      if (getLockInfo(reports, lineItemId, 'final', li).locked) { skippedLocked.push(label); continue }

      if (isVerdict) {
        const hasPhoto = reports.some(r => r.po_line_item_id === lineItemId && (r.inspection_report_photos?.length ?? 0) > 0)
        if (!hasPhoto) { skippedNoPhoto.push(label); continue }
      }

      let finalReport = getStage(reports, lineItemId, 'final')
      if (!finalReport) {
        const { data, error } = await createInspectionReport({
          po_line_item_id: lineItemId, inspection_type: 'final', status: 'draft', created_by: userName,
        })
        if (error) { errors.push(`${label}: ${error.message}`); continue }
        finalReport = data
      }

      if (isVerdict) {
        const { error: statusErr } = await updateInspectionReportStatus(finalReport.id, 'submitted')
        if (statusErr) { errors.push(`${label}: ${statusErr.message}`); continue }
      }
      // The bulk reason is the same real justification Sign-off's Remarks
      // list collects per-SKU — recorded there too (not just the activity
      // log) so it shows up in the same place a manually-entered remark
      // would, and survives export/PDF the same way.
      const patch = { inspection_result: bulkStatus }
      if (reasonRequired && reason) patch.remarks = [...(finalReport.remarks || []), reason]
      const { error: patchErr } = await updateInspectionReport(finalReport.id, patch, userName)
      if (patchErr) { errors.push(`${label}: ${patchErr.message}`); continue }

      addInspectionReportLog({
        report_id: finalReport.id, po_line_item_id: lineItemId, inspection_type: 'final', round: finalReport.round ?? 1,
        event_type: isVerdict ? 'submitted' : 'edited', actor_name: userName,
        reason: reasonRequired
          ? `Bulk-applied from PO Overview: ${RESULT_LABEL[bulkStatus] || bulkStatus} — ${reason}`
          : `Bulk-applied from PO Overview: ${RESULT_LABEL[bulkStatus] || bulkStatus}`,
        result: bulkStatus,
      }).then(({ error: logError }) => { if (logError) console.error('[InspectionReportEntry] bulk status log failed:', logError.message) })

      updated.push(label)
    }

    setBulkApplying(false)
    setBulkReason('')
    setShowBulkConfirm(false)
    setCheckedSkuIds(new Set())
    setBulkStatus('')
    refresh()

    const parts = []
    if (updated.length) parts.push(`Updated ${updated.length} SKU${updated.length !== 1 ? 's' : ''}`)
    if (skippedNoPhoto.length) parts.push(`skipped ${skippedNoPhoto.length} with no photo on record (${skippedNoPhoto.join(', ')})`)
    if (skippedLocked.length) parts.push(`skipped ${skippedLocked.length} with Midline not yet accepted (${skippedLocked.join(', ')})`)
    if (errors.length) parts.push(`${errors.length} failed (${errors.join('; ')})`)
    setBulkNote(parts.length ? { tone: errors.length ? 'error' : 'info', text: parts.join('; ') + '.' } : null)
  }

  // From the PO summary grid's per-cell shortcuts (Digitals cell, and every
  // other step-cell in the Inline/Midline/Final tabs) — jump straight into
  // that SKU's stage wizard, on the exact step whichever value was clicked
  // actually came from, instead of making the inspector select the SKU and
  // then click through to it manually. Same prerequisite gate as openStage —
  // this shortcut shouldn't be a way to open a stage that's genuinely still
  // locked, even if a report row for it already exists (e.g. one created out
  // of sequence some other way).
  const openStep = (li, stageKey, report, stepKey) => {
    // An OLDER submitted round of a locked stage is history and stays viewable;
    // only the stage's own latest round follows the lock.
    const isOlderRound = report?.status === 'submitted' && getStage(reports, li.id, stageKey)?.id !== report.id
    if (!isOlderRound && getLockInfo(reports, li.id, stageKey, li).locked) return
    onSelectLineItem?.(li)
    setActiveStage({ type: stageKey, reportId: report?.id ?? null, initialStep: stepKey })
    // Sets both params explicitly (not just `stage`) since onSelectLineItem's
    // own URL write above and this one can race; each needs to be correct on
    // its own regardless of which one the browser applies last.
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('sku', li.id)
      next.set('stage', stageKey)
      return next
    }, { replace: true })
  }

  // Overview keeps a finalized SKU checkable (so it can still be picked for
  // Send Mail), but Accept/Inspect Later have nothing left to do once every
  // checked SKU is already finalized - both would just no-op with an error
  // note today; disabling them here is the proactive version of that same
  // check, not a new rule.
  const allCheckedFinalized = checkedSkuIds.size > 0 && [...checkedSkuIds].every(id => isFinalized(reports, id))

  // Rework only ever applies to a SKU with something actually locked behind
  // an accepted verdict (getReworkableStage returns null otherwise) - a
  // checked SKU that's never been submitted, or was rejected (already gets
  // its own automatic reinspection, no approval needed), just isn't
  // included here rather than blocking the whole batch.
  const reworkableCheckedItems = [...checkedSkuIds]
    .map(id => {
      const stage = getReworkableStage(reports, id)
      if (!stage) return null
      const li = (po.po_line_items ?? []).find(x => x.id === id)
      return { po_line_item_id: id, sku_ref: li?.buyer_sku_ref, ...stage }
    })
    .filter(Boolean)

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {/* flex-wrap - without it, the "Inspection Reports" label and the
          md:hidden mobile stack below (a w-full block) were forced to share
          one unbreakable row: the label collapsed the mobile block's own
          width budget instead of letting it drop to its own line, pushing
          the whole header into horizontal scroll even though that mobile
          stack is already built correctly. */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide flex-shrink-0">Inspection Reports</span>
        {selectedLineItem && !loading && (() => {
          const nextStage = viewingRejectedFinal ? null : getNextActionableStage(displayReports, selectedLineItem.id, selectedLineItem)
          // Shared between both layouts below - StageButton is presentational
          // (no internal state/API calls of its own), so reusing the same
          // computed array in both the desktop row and the mobile grid is
          // safe, unlike QuickSetFields (has its own live state/commits),
          // which is deliberately written out twice instead.
          const stageButtons = STAGES.map(({ key, label }) => {
            const { locked, lockedOn, balance: lockBalance } = getLockInfo(displayReports, selectedLineItem.id, key, selectedLineItem)
            return (
              <StageButton
                key={key}
                stageKey={key}
                label={label}
                report={getStage(displayReports, selectedLineItem.id, key)}
                finalized={isFinalized(displayReports, selectedLineItem.id)}
                locked={locked}
                lockedOn={lockedOn}
                lockBalance={lockBalance}
                isNext={key === nextStage}
                onClick={openStage}
              />
            )
          })
          return (
            <>
              {/* Desktop - unchanged: one overflow-x-auto row (stage pills +
                  QuickSetFields together don't fit at every desktop width;
                  this row scrolls on its own instead of forcing the whole
                  header/page into horizontal scroll). */}
              <div className="hidden md:flex items-center gap-2 min-w-0 flex-1 overflow-x-auto">
                {stageButtons}
                <BalanceRoundButton reports={reports} lineItem={selectedLineItem} po={po} userName={userName} memberId={memberId} scheduleByStage={scheduleByStage} canManage={canManage} onDone={refresh} />
                {/* Insp. Date / Arrival / Start / Complete are entered once for the whole PO in the Overview bar, so
                    they are no longer repeated here on tablet/desktop (the phone layout below keeps them). */}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setShowCancelQtyModal(true)}
                    title={pendingCancellation ? 'A cancellation request is already pending for this SKU' : 'Request cancelling part of this SKU\'s order quantity'}
                    className="ml-auto flex-shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 border border-red-200 bg-white hover:bg-red-50 hover:border-red-300 transition-colors"
                  >
                    {pendingCancellation ? 'Cancel Qty · Pending' : 'Cancel Qty'}
                    {selectedLineItem.cancelled_quantity > 0 && !pendingCancellation && ` (${selectedLineItem.cancelled_quantity})`}
                  </button>
                )}
              </div>
              {/* Mobile - restacked into two rows instead of one scrolling
                  row: the 3 stage pills 3-up (short enough to sit side by
                  side on any phone ≥360px), then QuickSetFields + Cancel
                  Qty on their own full-width row below. */}
              <div className="md:hidden w-full space-y-2">
                <div className="grid grid-cols-3 gap-1.5">{stageButtons}</div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <BalanceRoundButton reports={reports} lineItem={selectedLineItem} po={po} userName={userName} memberId={memberId} scheduleByStage={scheduleByStage} canManage={canManage} onDone={refresh} />
                  <QuickSetFields reports={reports} lineItem={selectedLineItem} userName={userName} disabled={!canManage} onSaved={refresh} />
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setShowCancelQtyModal(true)}
                      title={pendingCancellation ? 'A cancellation request is already pending for this SKU' : 'Request cancelling part of this SKU\'s order quantity'}
                      className="flex-shrink-0 px-2.5 py-1.5 rounded-md text-[10px] font-bold text-red-600 hover:bg-red-50 transition-colors"
                    >
                      {pendingCancellation ? 'Cancel Qty · Pending' : 'Cancel Qty'}
                      {selectedLineItem.cancelled_quantity > 0 && !pendingCancellation && ` (${selectedLineItem.cancelled_quantity})`}
                    </button>
                  )}
                </div>
              </div>
            </>
          )
        })()}
        {showCancelQtyModal && (
          <CancelQuantityModal
            lineItem={selectedLineItem}
            pending={pendingCancellation}
            onClose={() => setShowCancelQtyModal(false)}
            onSubmitted={() => { fetchPendingCancellations([selectedLineItem.id]).then(map => setPendingCancellation(map.get(selectedLineItem.id) || null)) }}
          />
        )}
        {!selectedLineItem && (
          // Desktop only (hidden md:flex) - min-w-0 + overflow-x-auto still
          // the fallback there for whatever doesn't fit one row at narrower
          // desktop widths. Mobile gets the compact bar + MobileBulkActionSheet
          // right after this block instead - a horizontally-scrolling row of
          // up to 7 buttons gave a phone user no visual hint there was more
          // to the right.
          <div className="hidden md:flex items-center gap-2 min-w-0 overflow-x-auto ml-auto">
            {/* Overall Status dropdown + Apply — commented out for now, come
                back to this later. Reinstate by uncommenting; applyBulkStatus/
                bulkStatus/showBulkConfirm and the ConfirmModal below are all
                left in place untouched.
            {canManage && (
              <>
                <select value={bulkStatus} onChange={e => { setBulkStatus(e.target.value); setBulkReason('') }} disabled={bulkApplying}
                  title="Overall Status - tick SKUs in the table, pick a status, then Apply"
                  className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white disabled:opacity-50 focus:outline-none focus:border-gray-900">
                  <option value="">Overall Status…</option>
                  {INSPECTION_RESULT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button
                  type="button"
                  disabled={!bulkStatus || checkedSkuIds.size === 0 || bulkApplying}
                  onClick={() => setShowBulkConfirm(true)}
                  title={checkedSkuIds.size > 0
                    ? `Apply to ${checkedSkuIds.size} selected SKU${checkedSkuIds.size !== 1 ? 's' : ''}`
                    : 'Tick at least one SKU in the table first'}
                  className="text-xs font-semibold text-white bg-gray-900 hover:bg-black inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {bulkApplying ? 'Applying…' : 'Apply'}
                </button>
              </>
            )}
            */}
            {canManage && (
              <button
                type="button"
                onClick={() => setShowReworkModal(true)}
                disabled={reworkableCheckedItems.length === 0}
                title={checkedSkuIds.size === 0
                  ? 'Tick at least one SKU in the table first'
                  : reworkableCheckedItems.length === 0
                    ? 'None of the selected SKUs have a submitted, accepted stage to rework'
                    : `Request permission to redo ${reworkableCheckedItems.length} selected SKU${reworkableCheckedItems.length !== 1 ? 's' : ''}' furthest accepted stage`}
                className="text-xs font-semibold text-amber-700 hover:text-amber-800 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 hover:bg-amber-50 disabled:opacity-40 transition-colors"
              >
                Rework
              </button>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => openCallout('PPM_CALLOUT')}
                title={checkedSkuIds.size === 0
                  ? 'Choose which SKUs this PPM callout is for'
                  : `Add a PPM callout note for ${checkedSkuIds.size} selected SKU${checkedSkuIds.size !== 1 ? 's' : ''}`}
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-800 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors"
              >
                PPM Callouts
              </button>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => openCallout('PILOT_RUN_CALLOUT')}
                title={checkedSkuIds.size === 0
                  ? 'Choose which SKUs this Pilot Run callout is for'
                  : `Add a Pilot Run callout note for ${checkedSkuIds.size} selected SKU${checkedSkuIds.size !== 1 ? 's' : ''}`}
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-800 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors"
              >
                Pilot Run Callouts
              </button>
            )}
            {canManage && (
              <div ref={sendMailMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    if (!sendMailMenuOpen) {
                      const rect = sendMailMenuRef.current?.getBoundingClientRect()
                      if (rect) setSendMailMenuPos({ top: rect.bottom + 4, left: rect.left })
                    }
                    setSendMailMenuOpen(o => !o)
                  }}
                  disabled={checkedSkuIds.size === 0 || sendMailBuilding}
                  title={checkedSkuIds.size > 0
                    ? `Send the inspection notification email for ${checkedSkuIds.size} selected SKU${checkedSkuIds.size !== 1 ? 's' : ''} - pick which stage's report to send`
                    : 'Tick at least one SKU in the table first'}
                  className="text-xs font-semibold text-gray-600 hover:text-gray-900 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  {sendMailBuilding ? 'Preparing…' : 'Send Mail'}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                {sendMailMenuOpen && sendMailMenuPos && createPortal(
                  <div
                    ref={sendMailPortalRef}
                    style={{ position: 'fixed', top: sendMailMenuPos.top, left: sendMailMenuPos.left }}
                    className="z-[220] bg-white rounded-lg border border-gray-200 shadow-lg py-1 w-32"
                  >
                    {STAGES.map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => { setSendMailMenuOpen(false); handleSendMail(key) }}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>,
                  document.body
                )}
              </div>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => setShowInspectLater(true)}
                disabled={checkedSkuIds.size === 0 || allCheckedFinalized}
                title={checkedSkuIds.size === 0
                  ? 'Tick at least one SKU in the table first'
                  : allCheckedFinalized
                    ? 'Selected SKUs are already finalized - nothing left to reschedule'
                    : `Move ${checkedSkuIds.size} selected SKU${checkedSkuIds.size !== 1 ? 's' : ''} to a later inspection date`}
                className="text-xs font-semibold text-gray-600 hover:text-gray-900 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Inspect Later
              </button>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => handleAccept(po.po_line_items ?? [])}
                disabled={checkedSkuIds.size === 0 || stageAcceptApplying || allCheckedFinalized}
                title={checkedSkuIds.size === 0
                  ? 'Tick at least one SKU in the table first'
                  : allCheckedFinalized
                    ? 'Selected SKUs are already finalized - nothing left to accept'
                    : `Accept the next stage (Inline or Midline) for ${checkedSkuIds.size} selected SKU${checkedSkuIds.size !== 1 ? 's' : ''}. Plan Aborted and On Hold are converted to Accepted; Rejected, Feedback in Progress and pending re-inspections are skipped. All accepted SKUs must need the same stage.`}
                className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
              >
                {stageAcceptApplying ? 'Accepting…' : 'Accept'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowExport(true)}
              title={checkedSkuIds.size > 0
                ? `Pre-selects the checked SKU${checkedSkuIds.size !== 1 ? 's' : ''}' passed Final reports - adjust before exporting`
                : 'Choose which inspections to export'}
              className="text-xs font-semibold text-gray-600 hover:text-gray-900 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Export
            </button>
          </div>
        )}
        {/* Mobile compact bar - Accept (the happy-path action) always
            visible, everything else behind "Actions" (badged with the
            checked count) opening MobileBulkActionSheet below. */}
        {!selectedLineItem && (
          <div className="md:hidden flex items-center gap-2 w-full">
            {canManage && (
              <button
                type="button"
                onClick={() => handleAccept(po.po_line_items ?? [])}
                disabled={checkedSkuIds.size === 0 || stageAcceptApplying || allCheckedFinalized}
                title="Accepts the next stage (Inline or Midline). Plan Aborted and On Hold are converted to Accepted; Rejected, Feedback in Progress and pending re-inspections are skipped."
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
              >
                {stageAcceptApplying ? 'Accepting…' : 'Accept'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileActionsOpen(true)}
              className="relative flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 bg-gray-100/70 hover:bg-gray-200 transition-colors"
            >
              Actions
              {checkedSkuIds.size > 0 && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-gray-900 text-white text-[10px] font-bold">
                  {checkedSkuIds.size}
                </span>
              )}
            </button>
          </div>
        )}
        {!selectedLineItem && inspectLaterNote && (
          <p className={`text-xs w-full ${inspectLaterNote.tone === 'error' ? 'text-red-600' : 'text-gray-500'}`}>{inspectLaterNote.text}</p>
        )}
      </div>

      {!selectedLineItem && bulkNote && (
        <p className={`text-xs mb-3 ${bulkNote.tone === 'error' ? 'text-red-600' : 'text-gray-500'}`}>{bulkNote.text}</p>
      )}
      {!selectedLineItem && acceptedNote && (
        <p className={`text-xs mb-3 ${acceptedNote.tone === 'error' ? 'text-red-600' : 'text-gray-500'}`}>{acceptedNote.text}</p>
      )}
      {!selectedLineItem && stageAcceptNote && (
        <p className={`text-xs mb-3 ${stageAcceptNote.tone === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{stageAcceptNote.text}</p>
      )}
      {stageMismatchOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[200] bg-black/40" onClick={() => setStageMismatchOpen(false)} />
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 pointer-events-auto">
              <h3 className="text-sm font-bold text-gray-900">Different stages selected</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Selected SKUs have different Stages. Please Select SKUs of Same Stage.
              </p>
              <div className="flex justify-end mt-4">
                <button
                  type="button"
                  onClick={() => setStageMismatchOpen(false)}
                  className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
      {/* Bulk Accept confirmation - only shown when the batch would convert
          already-submitted On Hold / Plan Aborted reports (see handleAccept). */}
      <ConfirmModal
        open={!!acceptConfirm}
        title={acceptConfirm
          ? `Convert to Accepted - ${acceptConfirm.held.on_hold + acceptConfirm.held.plan_aborted} SKU${acceptConfirm.held.on_hold + acceptConfirm.held.plan_aborted !== 1 ? 's' : ''}`
          : ''}
        message={acceptConfirm
          ? `${[
              acceptConfirm.held.on_hold ? `${acceptConfirm.held.on_hold} On Hold` : null,
              acceptConfirm.held.plan_aborted ? `${acceptConfirm.held.plan_aborted} Plan Aborted` : null,
            ].filter(Boolean).join(' and ')} at ${STAGE_LABEL[acceptConfirm.stage]} will become Accepted, which unlocks the next stage.`
            + (acceptConfirm.jobs.length > acceptConfirm.held.on_hold + acceptConfirm.held.plan_aborted
              ? ` ${acceptConfirm.jobs.length - acceptConfirm.held.on_hold - acceptConfirm.held.plan_aborted} other selected SKU${acceptConfirm.jobs.length - acceptConfirm.held.on_hold - acceptConfirm.held.plan_aborted !== 1 ? 's' : ''} will be accepted too.`
              : '')
          : ''}
        warning={acceptConfirm?.skippedByState.length
          ? `${acceptConfirm.skippedByState.length} will be skipped: ${summarizeAcceptSkips(acceptConfirm.skippedByState)}.`
          : undefined}
        confirmLabel="Convert and accept"
        loadingLabel="Accepting…"
        tone="neutral"
        loading={stageAcceptApplying}
        onClose={() => setAcceptConfirm(null)}
        onConfirm={async () => {
          const batch = acceptConfirm
          await runAccept(batch)
          setAcceptConfirm(null)
        }}
      />
      {sendMailMissing && createPortal(
        <>
          <div className="fixed inset-0 z-[200] bg-black/40" onClick={() => setSendMailMissing(null)} />
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 pointer-events-auto">
              <h3 className="text-sm font-bold text-gray-900">Nothing to send</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                {sendMailMissing.skus.join(', ')} {sendMailMissing.skus.length !== 1 ? 'have' : 'has'} no submitted {STAGE_LABEL[sendMailMissing.stage]} report yet.
              </p>
              <div className="flex justify-end mt-4">
                <button
                  type="button"
                  onClick={() => setSendMailMissing(null)}
                  className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
      {sendMailPdfError && createPortal(
        <>
          <div className="fixed inset-0 z-[200] bg-black/40" onClick={() => setSendMailPdfError(null)} />
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 pointer-events-auto">
              <h3 className="text-sm font-bold text-gray-900">Couldn't attach the report</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Building/uploading the PDF failed twice ({sendMailPdfError.message}). You can retry, or send the
                notification without the attachment.
              </p>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => { const stage = sendMailPdfError.stage; setSendMailPdfError(null); handleSendMail(stage, { skipAttachment: true }) }}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Send without attachment
                </button>
                <button
                  type="button"
                  onClick={() => { const stage = sendMailPdfError.stage; setSendMailPdfError(null); handleSendMail(stage) }}
                  className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
      {showBulkConfirm && (
        <ConfirmModal
          open={showBulkConfirm}
          title={`${RESULT_LABEL[bulkStatus] || bulkStatus} - ${checkedSkuIds.size} SKU${checkedSkuIds.size !== 1 ? 's' : ''}`}
          message={VERDICT_RESULTS.includes(bulkStatus)
            ? `This freezes the selected SKUs - their Inline, Midline, and Final steps all become read-only. Any without at least one photo on record will be skipped.`
            : `This tags the selected SKUs with "${RESULT_LABEL[bulkStatus] || bulkStatus}" - they stay fully editable.`}
          warning={VERDICT_RESULTS.includes(bulkStatus) ? 'Freezing can only be undone by starting a new re-inspection round per SKU.' : undefined}
          confirmLabel="Apply"
          tone={VERDICT_RESULTS.includes(bulkStatus) ? 'danger' : 'neutral'}
          loading={bulkApplying}
          // Same requirement Sign-off enforces per-SKU — anything short of a
          // clean Accepted needs a real reason, not just the auto-generated
          // "Bulk-applied from PO Overview" log line. Only passed at all when
          // required, since ConfirmModal treats onReasonChange's mere
          // presence as "this confirmation needs a reason".
          {...(RESULTS_REQUIRING_REMARK.includes(bulkStatus) ? {
            reason: bulkReason,
            onReasonChange: setBulkReason,
            reasonLabel: 'Reason',
            reasonPlaceholder: `Why "${RESULT_LABEL[bulkStatus] || bulkStatus}" for these SKUs?`,
          } : {})}
          onConfirm={applyBulkStatus}
          onClose={() => { setShowBulkConfirm(false); setBulkReason('') }}
        />
      )}

      {!selectedLineItem ? (
        <PoSkuSummary
          po={po}
          reports={reports}
          loading={loading}
          skuMasterById={skuMasterById}
          skuLoading={skuLoading}
          onSelectLineItem={onSelectLineItem}
          onOpenStep={openStep}
          canManage={canManage}
          onPoPatched={onPoPatched}
          userName={userName}
          refresh={refresh}
          onOpenComments={onOpenComments}
          checkedSkuIds={checkedSkuIds}
          onToggleChecked={toggleChecked}
          onToggleAll={toggleAll}
          scheduledSkuIds={scheduledSkuIds}
          visibleTodaySkuIds={visibleTodaySkuIds}
          acceptedEdits={acceptedEdits}
          onEditAccepted={editAccepted}
          onCommitAccepted={commitAcceptedEdit}
          onToggleFillAccepted={toggleFillAccepted}
          onAcceptSelected={acceptSelectedSkus}
          acceptedFilled={acceptedFilled}
          acceptedApplying={acceptedApplying || acceptApplying}
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          {(() => {
            const finalReport = getStage(displayReports, selectedLineItem.id, 'final')
            return finalReport?.inspection_result ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Final result:</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${RESULT_BADGE_CLASS[finalReport.inspection_result]}`}>
                  {RESULT_LABEL[finalReport.inspection_result] || finalReport.inspection_result}
                </span>
              </div>
            ) : null
          })()}
          <InspectionActivityLog
            lineItemId={selectedLineItem.id}
            reports={displayReports}
            onOpenReport={(type, reportId) => {
              setActiveStage({ type, reportId })
              setSearchParams(prev => {
                const next = new URLSearchParams(prev)
                next.set('stage', type)
                return next
              }, { replace: true })
            }}
            po={po}
            skuMasterById={skuMasterById}
          />
        </div>
      )}

      {showExport && (
        <ExportPicker po={po} reports={reports} checkedSkuIds={checkedSkuIds} userName={userName} onClose={() => setShowExport(false)} />
      )}

      {showInspectLater && (
        <InspectLaterModal
          count={checkedSkuIds.size}
          applying={inspectLaterApplying}
          error={inspectLaterNote?.tone === 'error' ? inspectLaterNote.text : null}
          onConfirm={inspectLater}
          onClose={() => { setShowInspectLater(false); setInspectLaterNote(null) }}
        />
      )}

      {showReworkModal && (
        <ReworkRequestModal
          po={po}
          items={reworkableCheckedItems}
          userName={userName}
          userEmail={userEmail}
          memberId={memberId}
          onClose={() => setShowReworkModal(false)}
          onSubmitted={() => setCheckedSkuIds(new Set())}
        />
      )}

      {calloutModal && (
        <CalloutModal
          po={po}
          items={calloutItems}
          allItems={allSkuCalloutItems}
          calloutType={calloutModal.type}
          calloutLabel={calloutModal.type === 'PPM_CALLOUT' ? 'PPM Callout' : 'Pilot Run Callout'}
          userName={userName}
          canComment={canManage}
          onClose={() => setCalloutModal(null)}
          onSubmitted={() => setCheckedSkuIds(new Set())}
        />
      )}

      {acceptGate && (
        <BulkPhotoUploadModal
          targets={acceptGate.targets}
          reports={reports}
          refresh={refresh}
          applying={acceptApplying}
          onClose={() => setAcceptGate(null)}
          onAccept={() => finalizeAccepted(acceptGate.targets)}
        />
      )}
      {/* Mobile-only - see the compact Accept/Actions bar above. Every
          action here reuses the exact same handler/disabled logic the
          desktop toolbar buttons do (canManage is already implicit in
          those buttons only existing in canManage's branch, so this sheet
          is only ever opened by a canManage user in the first place - the
          trigger button above isn't itself canManage-gated, matching the
          desktop row's own convention of Export PDF staying available to
          everyone while every other action requires canManage). */}
      {!selectedLineItem && (
        <MobileBulkActionSheet
          open={mobileActionsOpen}
          onClose={() => setMobileActionsOpen(false)}
          checkedCount={checkedSkuIds.size}
          onClearSelection={() => setCheckedSkuIds(new Set())}
          onAccept={() => { setMobileActionsOpen(false); handleAccept(po.po_line_items ?? []) }}
          acceptDisabled={checkedSkuIds.size === 0 || stageAcceptApplying || allCheckedFinalized}
          acceptLabel={stageAcceptApplying ? 'Accepting…' : 'Accept'}
          acceptDisabledReason={checkedSkuIds.size === 0
            ? 'Tick at least one SKU first'
            : allCheckedFinalized
              ? 'Selected SKUs are already finalized - nothing left to accept'
              : null}
          note={stageAcceptNote || bulkNote || acceptedNote}
          actions={canManage ? [
            {
              key: 'rework', label: 'Rework', tone: 'amber',
              onClick: () => { setMobileActionsOpen(false); setShowReworkModal(true) },
              disabled: reworkableCheckedItems.length === 0,
              disabledReason: checkedSkuIds.size === 0
                ? 'Tick at least one SKU first'
                : reworkableCheckedItems.length === 0
                  ? 'None of the selected SKUs have a submitted, accepted stage to rework'
                  : null,
            },
            {
              key: 'ppm', label: 'PPM Callouts', tone: 'indigo',
              onClick: () => { setMobileActionsOpen(false); setCalloutModal('PPM_CALLOUT') },
              disabled: checkedSkuIds.size === 0,
              disabledReason: checkedSkuIds.size === 0 ? 'Tick at least one SKU first' : null,
            },
            {
              key: 'pilot', label: 'Pilot Run Callouts', tone: 'indigo',
              onClick: () => { setMobileActionsOpen(false); setCalloutModal('PILOT_RUN_CALLOUT') },
              disabled: checkedSkuIds.size === 0,
              disabledReason: checkedSkuIds.size === 0 ? 'Tick at least one SKU first' : null,
            },
            // Send Mail's 3 stage sub-options shown inline as their own rows
            // (Send Mail - Inline / Midline / Final) rather than a nested
            // flyout menu inside the sheet - a menu-inside-a-sheet is exactly
            // the "user has to hunt for it" interaction this redesign is
            // meant to avoid.
            ...STAGES.map(({ key, label }) => ({
              key: `sendmail-${key}`,
              label: `Send Mail · ${label}`,
              onClick: () => { setMobileActionsOpen(false); handleSendMail(key) },
              disabled: checkedSkuIds.size === 0 || sendMailBuilding,
              disabledReason: checkedSkuIds.size === 0 ? 'Tick at least one SKU first' : null,
            })),
            {
              key: 'inspectlater', label: 'Inspect Later',
              onClick: () => { setMobileActionsOpen(false); setShowInspectLater(true) },
              disabled: checkedSkuIds.size === 0 || allCheckedFinalized,
              disabledReason: checkedSkuIds.size === 0
                ? 'Tick at least one SKU first'
                : allCheckedFinalized
                  ? 'Selected SKUs are already finalized - nothing left to reschedule'
                  : null,
            },
          ] : []}
          exportAction={{
            onClick: () => { setMobileActionsOpen(false); setShowExport(true) },
            sublabel: checkedSkuIds.size > 0 ? `${checkedSkuIds.size} selected` : 'Choose which to export',
          }}
        />
      )}
      {/* Persistent "N selected · Actions" pill - reachable from anywhere
          in PoSkuSummary's SKU list (Overview or any stage tab) without
          scrolling back up to this header, which can be well out of view
          once you've scrolled down a long card list with Select mode on.
          Mirrors InspectionSchedule.jsx's sticky-header-with-primary-action
          precedent, just anchored to the bottom since this is an action bar
          rather than a filter/search bar. Hidden while the sheet itself is
          open so there's never a duplicate trigger on screen at once. */}
      {!selectedLineItem && checkedSkuIds.size > 0 && !mobileActionsOpen && createPortal(
        <div className="md:hidden fixed inset-x-0 bottom-0 z-[190] px-4 pb-4 pointer-events-none">
          <button
            type="button"
            onClick={() => setMobileActionsOpen(true)}
            className="pointer-events-auto w-full max-w-lg mx-auto flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-gray-900 text-white shadow-2xl cursor-pointer"
          >
            <span className="text-xs font-semibold">{checkedSkuIds.size} SKU{checkedSkuIds.size !== 1 ? 's' : ''} selected</span>
            <span className="inline-flex items-center gap-1 text-xs font-bold">
              Actions
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 18l6-6-6-6" /></svg>
            </span>
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
