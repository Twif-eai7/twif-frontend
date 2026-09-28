import { useState, useEffect, useRef } from 'react'
import { updatePoInspectionLevel, createInspectionReport, findInspectionReport, updateInspectionReport } from '../../../hooks/useInspectionReports'
import {
  STAGES, STEP_LABEL, getStage, getStageRollup, getWorstStageResult, isFinalized, isAcceptedOnlyDraft, rollupResult, defectTotals,
  ACCEPTED_RESULTS, RESULT_BADGE_CLASS, RESULT_LABEL, getNextActionableStage, StageDots, wasStageRejected, wasAnyStageRejected, STAGE_LABEL, hasAnySubmittedReport,
} from './stageStatus'
import { hasUnresolvedRejection, buildStageRows } from './stageBalance'
import { resolveSamplingPlan, INSPECTION_LEVELS } from '../../../lib/samplingPlan'
import AqlChartModal from '../AqlChartModal'
import CancelQuantityModal from './CancelQuantityModal'
import BulkSignoffModal from './BulkSignoffModal'
import { usePendingLineItemCancellations } from '../../../hooks/usePoLineItemCancellations'
import { useLongPress } from '../../../hooks/useLongPress'
import { useSwipeTabs } from '../../../hooks/useSwipeTabs'
import { publicUrl } from '../../orderManagement/poUtils'
import ImageLightbox from '../../ui/ImageLightbox'
import ExportChoiceBox from './ExportChoiceBox'

// Same abbreviations InspectionSchedule.jsx's own STAGE_ABBR already uses -
// short enough for the mobile Signoff buttons (see the tabs row below) to
// sit inline instead of needing a popover.
const STAGE_ABBR = { inline: 'IL', midline: 'ML', final: 'FN' }

// Same thumbnail treatment Item Master (StyleLibraryTab.jsx) already uses
// for the same skus.image_url column - kept as a small local copy here
// rather than exported/shared, matching this file's own convention of
// small local pieces (fmtQty, nowTimeString below) over cross-module UI
// exports for anything this size. Clicking a real image opens ImageLightbox
// (a placeholder box has nothing to enlarge, so it's not clickable).
function SkuThumb({ url, onClick }) {
  if (url) return (
    <img src={url} alt="" onClick={onClick}
      className="w-9 h-9 rounded-md object-cover border border-gray-200 flex-shrink-0 cursor-zoom-in" />
  )
  return (
    <div className="w-9 h-9 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300 flex-shrink-0">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    </div>
  )
}

function fmtQty(n) { return n != null ? Number(n).toLocaleString() : '-' }
// Same shape as InspectionForm.jsx's own nowTimeString() - HH:MM:SS local time.
function nowTimeString() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function fmtDate(d) {
  if (!d) return '-'
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
// Numeric cells must tell "never recorded" apart from "recorded as zero" —
// `v || '-'` would wrongly collapse a real 0 into the empty state.
function numCell(v) { return v == null ? '-' : fmtQty(v) }

// useLongPress/useSwipeTabs moved to src/hooks/ (useLongPress.js/
// useSwipeTabs.js) so RepositoryPanel.jsx/RepositoryPoDrawer.jsx (QC
// Reports) can reuse the exact same gestures instead of a second copy -
// see those files for the full doc comments this used to carry.

function Spinner({ size = 'w-4 h-4' }) {
  return (
    <svg className={`${size} animate-spin text-gray-400`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

// Small floating card listing which SKUs make up a KPI's number — a chip
// grid rather than a plain browser tooltip, with a caret pointing back at
// the tile it belongs to.
function SkuHoverCard({ skus }) {
  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+10px)] z-30 w-60">
      <div className="absolute left-1/2 -translate-x-1/2 -top-[5px] w-2.5 h-2.5 bg-white border-t border-l border-gray-200 rotate-45" />
      <div className="relative bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
            {skus.length} SKU{skus.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="px-3 py-2.5 max-h-48 overflow-y-auto">
          {skus.length === 0 ? (
            <p className="text-[11px] text-gray-400 text-center py-1">None</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {skus.map(li => (
                <span key={li.id} className="px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-700 text-[10px] font-semibold">
                  {li.buyer_sku_ref || '-'}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// `skus` (line items contributing to this number) shown in a hover card —
// answers "which SKUs is this counting?" without leaving the summary.
function Kpi({ label, value, sub, accent, skus }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className="relative flex-1 min-w-[110px] px-3.5 py-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow"
      onMouseEnter={() => skus && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{label}</div>
      <div className={`text-xl font-extrabold mt-0.5 tracking-tight ${accent || 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5 font-medium">{sub}</div>}
      {skus && hovered && <SkuHoverCard skus={skus} />}
    </div>
  )
}

function ProgressKpi({ reports, lineItems }) {
  const counts = STAGES.map(({ key }) => ({
    key,
    submitted: lineItems.filter(li => getStage(reports, li.id, key)?.status === 'submitted').length,
  }))
  // Only Final's own verdict moves this bar; an Inline/Midline accept is
  // progress on that stage, not the SKU's overall inspection outcome yet.
  const acceptedCount = lineItems.filter(li => ACCEPTED_RESULTS.includes(getStage(reports, li.id, 'final')?.inspection_result)).length
  const total = lineItems.length || 1
  const segColors = { inline: 'bg-sky-400', midline: 'bg-indigo-400', final: 'bg-emerald-500' }
  return (
    <div className="flex-[2] min-w-[220px] px-3.5 py-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Inspection Progress</div>
        <div className="text-[10px] font-bold text-emerald-600">{acceptedCount} / {lineItems.length} accepted</div>
      </div>
      <div className="flex items-center gap-2 mt-2.5">
        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all" style={{ width: `${(acceptedCount / total) * 100}%` }} title={`Accepted: ${acceptedCount}`} />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2">
        {counts.map(({ key, submitted }) => (
          <div key={key} className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500">
            <span className={`w-1.5 h-1.5 rounded-full ${segColors[key]}`} />
            {STAGES.find(s => s.key === key).label} <span className="font-bold text-gray-700">{submitted}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// A small pencil glyph - shown only when a *signature* (drawn/uploaded
// image) was actually captured, not just a typed name. Signature "mode"
// (drawn vs uploaded) isn't persisted, so this can't distinguish the two -
// same limitation InspectionForm.jsx's own read path already has
// (stored.startsWith('data:')).
function SignedIcon({ title }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      className="text-emerald-600 flex-shrink-0">
      <title>{title}</title>
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

// Full name + signed indicator - Sign-off's Vendor Rep / QA Auditor fields,
// for the per-stage tables' own columns (see StageTable below).
function SignerCell({ name, signature }) {
  if (!name && !signature) return <span className="text-gray-300">-</span>
  const isImage = (signature || '').startsWith('data:')
  return (
    <span className="inline-flex items-center gap-1 justify-center">
      <span className="text-gray-700">{name || <span className="text-gray-400 italic">Unnamed</span>}</span>
      {isImage && <SignedIcon title="Signature captured" />}
    </span>
  )
}

function StageChip({ report, finalized, rejectedRound }) {
  // Compact Overview-table indicator - just the icon (with a tooltip
  // listing whichever names are present), not the full names themselves;
  // StageTable's SignerCell above is where the full detail lives.
  const hasSignoff = !!(report?.vendor_rep_name || report?.quality_process_auditor_name)
  const signoffTitle = hasSignoff
    ? [report.vendor_rep_name && `Vendor Rep: ${report.vendor_rep_name}`, report.quality_process_auditor_name && `QA Auditor: ${report.quality_process_auditor_name}`]
        .filter(Boolean).join(' · ')
    : ''

  if (report?.status === 'submitted') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 whitespace-nowrap">
        {fmtDate(report.submitted_at)}
        {hasSignoff && <SignedIcon title={signoffTitle} />}
      </span>
    )
  }
  if (finalized) {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 text-gray-400">-</span>
  }
  if (report?.status === 'draft' && !isAcceptedOnlyDraft(report)) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 ring-1 ring-amber-200">
        Draft
        {hasSignoff && <SignedIcon title={signoffTitle} />}
      </span>
    )
  }
  // A fresh, untouched round (isAcceptedOnlyDraft, no last_step yet) sitting
  // on top of an earlier ROUND of this SAME stage that was rejected - the
  // auto-booked re-inspection round (InspectionForm.jsx's submit handler)
  // before anyone has actually opened it. Reads as "Re-Scheduled" instead of
  // a bare "-", matching the SKU-name/sidebar badges for the same fact.
  if (rejectedRound) {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800 ring-1 ring-blue-200 whitespace-nowrap">Re-Scheduled</span>
  }
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 text-gray-400">-</span>
}

function Verdict({ result }) {
  if (result === 'pass') return <span className="text-[10px] font-bold text-emerald-600">PASS</span>
  if (result === 'fail') return <span className="text-[10px] font-bold text-red-600">FAIL</span>
  if (result === 'na') return <span className="text-[10px] font-medium text-gray-400">N/A</span>
  return <span className="text-[10px] text-gray-300">-</span>
}

function DefectCell({ n, color }) {
  if (!n) return <span className="text-gray-300">0</span>
  return <span className={`font-bold ${color}`}>{n}</span>
}

// One label/value row inside StageSkuCard's expanded "Details" section -
// declared at module scope (not inside StageSkuCard itself) so it isn't
// recreated on every render, same convention every other small piece in this
// file already follows. `onClick` is the jump-to-step handler, passed in
// rather than closed over.
function DetailRow({ label, value, onClick }) {
  return (
    <div onClick={onClick} className="flex items-center justify-between gap-2 cursor-pointer hover:text-gray-900 transition-colors">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-700">{value}</span>
    </div>
  )
}

// The column the user explicitly asked for: "did the inspector upload
// photos or not". A count of 0 on a started report is a gap, not a null —
// it gets its own amber treatment distinct from "-" (no report at all).
// Clicking it (when a report exists) jumps straight into that SKU's Digitals
// step instead of just selecting the SKU.
function DigitalsCell({ report, onClick }) {
  if (!report) return <span className="text-gray-300">-</span>
  const n = report.inspection_report_photos?.length ?? 0
  const colorClass = n === 0 ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
  return (
    <button
      type="button"
      title="Go to Digitals"
      onClick={e => { e.stopPropagation(); onClick?.() }}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${colorClass}`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="7" width="18" height="14" rx="2" /><circle cx="12" cy="14" r="3" /><path d="M8 7l1.5-3h5L16 7" /></svg>
      {n}
    </button>
  )
}

// The Overview table's per-row PDF button — same preview-before-download
// flow as InspectionReportEntry.jsx's ExportPicker (generate a blob, show it
// in an iframe, only actually download once the inspector confirms), just
// pre-scoped to this one row's SKU instead of a multi-SKU picker.
function RowPdfPreviewModal({ po, li, finalReport, onClose }) {
  const [previewUrl, setPreviewUrl] = useState(null)
  // Phase 3 - no longer auto-generated on open (Preview is real server-side
  // work, not instant - see ExportChoiceBox's own warning); the choice box
  // shows first, Download and Share both stay reachable even if Preview is
  // never touched.
  const [showChoice, setShowChoice] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(null)
  const urlRef = useRef(null)
  // Full-quality blob, lazily fetched once (by whichever of Download/Share
  // asks for it first) and reused by the other - see ensureFinalBlob below.
  const blobRef = useRef(null)
  const filenameRef = useRef(null)

  const [sharing, setSharing] = useState(false)
  // Native navigator.share (with the actual file) is tried first - only
  // once that's unavailable or fails for a reason other than the user
  // cancelling does this fall back to explicit WhatsApp/Email links, which
  // need the PDF to be somewhere it has a URL (mailto:/wa.me can't carry a
  // file attachment, only a link) - uploaded lazily and cached here so
  // reopening the fallback doesn't re-upload the same PDF.
  const [shareFallbackUrl, setShareFallbackUrl] = useState(null)
  const [shareFallbackOpen, setShareFallbackOpen] = useState(false)
  const [shareError, setShareError] = useState(null)

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  const handlePreview = async () => {
    setShowChoice(false)
    setGenerating(true)
    setError(null)
    try {
      const { fetchInspectionReportPdf } = await import('../../../lib/inspectionReportPdfApi')
      const { blob } = await fetchInspectionReportPdf(po.id, [finalReport.id], { mode: 'preview' })
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

  // Full-quality blob - this is what Share hands to navigator.share as the
  // actual delivered file, and what Download saves, so both reuse the same
  // fetch instead of generating it twice.
  const ensureFinalBlob = async () => {
    if (blobRef.current) return { blob: blobRef.current, filename: filenameRef.current }
    const { fetchInspectionReportPdf } = await import('../../../lib/inspectionReportPdfApi')
    const { blob, filename } = await fetchInspectionReportPdf(po.id, [finalReport.id], { mode: 'final' })
    blobRef.current = blob
    filenameRef.current = filename
    return { blob, filename }
  }

  const handleDownload = async () => {
    setShowChoice(false)
    setDownloading(true)
    setError(null)
    try {
      const { downloadBlob } = await import('../../../lib/inspectionReportPdfApi')
      const { blob, filename } = await ensureFinalBlob()
      downloadBlob(blob, filename)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to export PDF')
    } finally {
      setDownloading(false)
    }
  }

  // Uploads the already-generated blob once and caches the resulting public
  // URL - shared by both the fallback popover's links and Copy Link, so at
  // most one upload happens per modal open regardless of how many of those
  // get used.
  const resolveShareUrl = async () => {
    if (shareFallbackUrl) return shareFallbackUrl
    const { blob, filename } = await ensureFinalBlob()
    const { uploadInspectionReportPdf, getInspectionFileUrl } = await import('../../../lib/inspectionStorage')
    const path = await uploadInspectionReportPdf(blob, finalReport.id, filename)
    const url = getInspectionFileUrl(path)
    setShareFallbackUrl(url)
    return url
  }

  const handleShare = async () => {
    setShareError(null)
    setSharing(true)
    try {
      const { blob, filename } = await ensureFinalBlob()
      const file = new File([blob], filename || 'Inspection Report.pdf', { type: 'application/pdf' })
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `Inspection Report - PO ${po?.po_number || ''} - ${li.buyer_sku_ref}` })
          return
        } catch (err) {
          if (err?.name === 'AbortError') return // user closed the share sheet - not an error
          // fall through to the link-based fallback below
        }
      }
      await resolveShareUrl()
      setShareFallbackOpen(true)
    } catch (err) {
      setShareError(err.message || 'Could not share this report')
    } finally {
      setSharing(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      const url = await resolveShareUrl()
      await navigator.clipboard.writeText(url)
      setShareError(null)
    } catch (err) {
      setShareError(err.message || 'Could not copy the link')
    }
  }

  const shareMessage = `Inspection Report - PO ${po?.po_number || ''} - ${li.buyer_sku_ref}`

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="text-sm font-bold text-gray-900">Preview Inspection Report · {li.buyer_sku_ref}</div>
          <button type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {showChoice ? (
          <ExportChoiceBox disabled={generating || downloading} onPreview={handlePreview} onDownload={handleDownload} />
        ) : (
        <div className="flex-1 min-h-0 px-5 py-4">
          {generating ? (
            <div className="flex items-center justify-center h-full min-h-[65vh]"><Spinner /></div>
          ) : error ? (
            <p className="text-xs text-red-500 text-center py-10">{error}</p>
          ) : previewUrl ? (
            <iframe src={previewUrl} title="Inspection report preview" className="w-full h-full min-h-[65vh] border border-gray-200 rounded-lg" />
          ) : (
            <div className="flex items-center justify-center h-full min-h-[65vh] text-xs text-gray-400">Downloaded.</div>
          )}
        </div>
        )}
        <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 flex items-center gap-3 relative">
          {error && !generating && <span className="text-xs text-red-500">{error}</span>}
          {shareError && <span className="text-xs text-red-500">{shareError}</span>}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              disabled={sharing || generating || showChoice || !!error}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors flex-shrink-0"
            >
              {sharing ? (
                <Spinner size="w-3 h-3" />
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.6" y1="10.6" x2="15.4" y2="6.4" /><line x1="8.6" y1="13.4" x2="15.4" y2="17.6" />
                </svg>
              )}
              {sharing ? 'Sharing…' : 'Share'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading || generating || showChoice || !!error}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40 transition-colors flex-shrink-0"
            >
              {downloading && <Spinner size="w-3 h-3" />}
              {downloading ? 'Downloading…' : 'Download PDF'}
            </button>
          </div>
          {/* Explicit-channel fallback - only shown when the browser has no
              usable native share sheet for files. Anchored above the Share
              button rather than a full modal, since it's just 3 short
              actions. */}
          {shareFallbackOpen && (
            <>
              <div className="fixed inset-0 z-[205]" onClick={() => setShareFallbackOpen(false)} />
              <div className="absolute right-[124px] bottom-full mb-2 z-[210] bg-white rounded-lg shadow-xl border border-gray-200 py-1.5 w-44">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${shareMessage}\n${shareFallbackUrl || ''}`)}`}
                  target="_blank" rel="noopener noreferrer"
                  onClick={() => setShareFallbackOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  WhatsApp
                </a>
                <a
                  href={`mailto:?subject=${encodeURIComponent(shareMessage)}&body=${encodeURIComponent(`${shareMessage}\n${shareFallbackUrl || ''}`)}`}
                  onClick={() => setShareFallbackOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Email
                </a>
                <button
                  type="button"
                  onClick={() => { handleCopyLink(); setShareFallbackOpen(false) }}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Copy link
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function OverviewTable({
  po, reports, skuMasterById, onSelectLineItem, checkedSkuIds, onToggleChecked, onToggleAll, scheduledSkuIds, visibleTodaySkuIds,
  pendingCancellations, onOpenCancelModal, skuImageIndexById, onOpenLightbox, onOpenPdfPreview,
  // Accepted column is commented out below (for now) — these stay destructured
  // so uncommenting it later is a one-file change, not a re-threading job.
  // eslint-disable-next-line no-unused-vars
  acceptedEdits, onEditAccepted, onCommitAccepted, onToggleFillAccepted, onAcceptSelected, acceptedFilled, acceptedApplying,
}) {
  // Finalized SKUs are kept visible (not just "scheduled today") so they
  // can still be reviewed and picked for the manual Send Mail button - the
  // sidebar list already does the same union for the same reason
  // (PoInspectionComments.jsx's completedSkuIds/displayedLineItems).
  // hasAnySubmittedReport also keeps visible a SKU whose Inline/Midline are
  // both done (satisfying those schedule entries, so they drop out of
  // visibleTodaySkuIds) but whose Final hasn't been scheduled yet - such a
  // SKU is neither "scheduled" nor "finalized" and used to vanish from the
  // PO entirely despite having real, frozen inspection history.
  // Ascending by SKU ref, numeric-aware (see PoInspectionComments.jsx's
  // sidebar list for the same fix/reasoning) - same unsorted-query-order
  // issue applied here too.
  const rows = (po.po_line_items ?? [])
    .filter(li => visibleTodaySkuIds.has(li.id) || isFinalized(reports, li.id) || hasAnySubmittedReport(reports, li.id))
    .sort((a, b) => (a.buyer_sku_ref || '').localeCompare(b.buyer_sku_ref || '', undefined, { numeric: true, sensitivity: 'base' }))
  // Finalized rows are selectable (for Send Mail) even though they're
  // frozen from editing - "select all" considers every visible row, not
  // just the still-open ones.
  const selectableRows = rows
  const allChecked = selectableRows.length > 0 && selectableRows.every(li => checkedSkuIds.has(li.id))
  // skuImageIndexById/onOpenLightbox/onOpenPdfPreview (and the actual
  // ImageLightbox/RowPdfPreviewModal instances) now live one level up, in
  // PoSkuSummary - shared with SkuOverviewCard's own thumbnail/PDF button
  // rather than each view owning a separate ImageLightbox/preview-modal
  // instance over the same rows.

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* overflow-hidden on the outer div only clips corners to the rounded
          border - it was also the only overflow behavior on this table, so
          any column past the visible width (SUBMISSION, at this table's
          column count) was just cut off with no way to reach it. The actual
          scrolling lives on this inner wrapper instead. */}
      <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50/80 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
            <th className="px-3 py-2.5 w-8">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() => onToggleAll(selectableRows, allChecked)}
                title={allChecked ? 'Clear selection' : 'Select all'}
                className="w-3.5 h-3.5 accent-gray-900 cursor-pointer align-middle"
              />
            </th>
            <th className="px-3 py-2 w-9"></th>
            <th className="text-left px-3 py-2 font-bold">SKU</th>
            <th className="text-left px-3 py-2 font-bold">Description</th>
            <th className="text-left px-3 py-2 font-bold">Target</th>
            <th className="text-right px-3 py-2 font-bold">Order</th>
            <th className="text-right px-3 py-2 font-bold">Cancelled Qty</th>
            <th className="text-right px-3 py-2 font-bold">Balance</th>
            <th className="text-center px-2 py-2 font-bold">Sample Plan</th>
            {/* Accepted column — commented out for now, come back to this
                later. Reinstate by uncommenting this header cell and the
                matching body cell below; all the handlers behind it
                (acceptSelectedSkus, toggleFillAccepted, commitAcceptedEdit,
                the photo-gate modal) are left in place untouched.
            <th className="text-right px-2 py-2 font-bold">
              <div className="flex items-center justify-end gap-1">
                <input
                  type="checkbox"
                  checked={checkedSkuIds.size > 0 ? false : acceptedFilled}
                  disabled={acceptedApplying}
                  onChange={e => { e.stopPropagation(); checkedSkuIds.size > 0 ? onAcceptSelected(rows) : onToggleFillAccepted(rows) }}
                  onClick={e => e.stopPropagation()}
                  title={checkedSkuIds.size > 0
                    ? `Accept the ${checkedSkuIds.size} ticked SKU${checkedSkuIds.size !== 1 ? 's' : ''} — submits, freezes the row, requires a photo`
                    : acceptedFilled ? 'Uncheck to reset every open row to 0' : "Fill every open row's Accepted with its Balance"}
                  className="w-3 h-3 accent-gray-900 cursor-pointer normal-case disabled:opacity-50 transition-opacity duration-150"
                />
                <span>Accepted</span>
              </div>
            </th>
            */}
            <th className="text-center px-2 py-2 font-bold">Inline</th>
            <th className="text-center px-2 py-2 font-bold">Midline</th>
            <th className="text-center px-2 py-2 font-bold">Final</th>
            <th className="text-center px-3 py-2 font-bold">Result</th>
            <th className="text-center px-3 py-2 font-bold whitespace-nowrap">Inspection No.</th>
            <th className="text-center px-3 py-2 font-bold whitespace-nowrap">Submission Dt.</th>
            <th className="text-center px-2 py-2 font-bold w-10">PDF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(li => {
            const sku = skuMasterById[li.sku_id]
            const finalized = isFinalized(reports, li.id)
            const finalReport = getStage(reports, li.id, 'final')
            const passedFinal = ACCEPTED_RESULTS.includes(finalReport?.inspection_result)
            // Same "rejected round stays visible even once a fresh round has
            // reset things" reasoning as PoInspectionComments.jsx's sidebar
            // (SkuListRow) - looks past each stage's own latest round so a
            // SKU rejected (and auto-rescheduled) at ANY stage - not just
            // Final anymore - still shows both states here instead of a
            // single generic "Scheduled" tag.
            const rejectedStage = wasAnyStageRejected(reports, li.id)
            // Worst-stage verdict (rejected at any stage wins), not just
            // Final — drives the row accent + Result column below. `finalReport`
            // stays Final-specific for the things that are deliberately about
            // Final: submission date, PDF-export gating, freeze state.
            const worstResult = getWorstStageResult(reports, li.id)
            // Cumulative accepted/available across every submitted Final
            // round (not just finalReport's own single latest-round number)
            // vs. the SKU's true order quantity - a SKU whose latest Final
            // round reads "accepted" can still be short of the full order if
            // an earlier round only covered part of it (see
            // InspectionForm.jsx's auto-reschedule). Only meaningful when
            // the SKU isn't rejected (ACCEPTED_RESULTS gate below) - a
            // rejected worstResult keeps its own label untouched.
            const finalRollup = getStageRollup(reports, li.id, 'final')
            const finalCovered = finalRollup.cumulativeAccepted > 0 ? finalRollup.cumulativeAccepted : finalRollup.cumulativeAvailable
            const isPartial = ACCEPTED_RESULTS.includes(worstResult?.inspection_result) &&
              li.quantity_ordered != null && finalCovered > 0 && finalCovered < li.quantity_ordered
            const plan = resolveSamplingPlan({ lotSize: li.quantity_ordered, inspectionLevel: po.inspection_level })
            return (
              <tr
                key={li.id}
                onClick={() => onSelectLineItem?.(li)}
                className={`border-t border-gray-100 odd:bg-gray-50/40 hover:bg-sky-50/50 cursor-pointer transition-colors
                  ${ACCEPTED_RESULTS.includes(worstResult?.inspection_result) ? 'border-l-2 border-l-emerald-400' : ''}
                  ${worstResult?.inspection_result === 'rejected' ? 'border-l-2 border-l-red-400' : ''}`}
              >
                {/* Stop propagation so ticking a row doesn't also open that SKU.
                    Finalized rows stay checkable - frozen from editing, but
                    still pickable for the manual Send Mail button. */}
                <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={checkedSkuIds.has(li.id)}
                    onChange={() => onToggleChecked(li.id)}
                    className="w-3.5 h-3.5 accent-gray-900 cursor-pointer align-middle disabled:cursor-not-allowed disabled:opacity-40"
                  />
                </td>
                <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                  <SkuThumb
                    url={sku?.image_url ? publicUrl(sku.image_url) : null}
                    onClick={() => {
                      const idx = skuImageIndexById.get(li.id)
                      if (idx != null) onOpenLightbox(idx)
                    }}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="font-bold text-gray-900">
                    {li.buyer_sku_ref || '-'}
                    {rejectedStage && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-[1px] rounded-sm bg-red-50 text-red-700 text-[9px] font-bold leading-none align-middle ring-1 ring-red-200">
                        {RESULT_LABEL[rejectedStage.inspection_result] || 'Rejected'}{rejectedStage.inspection_type !== 'final' ? ` · ${STAGE_LABEL[rejectedStage.inspection_type]}` : ''} · R{rejectedStage.round ?? 1}
                      </span>
                    )}
                    {scheduledSkuIds?.has(li.id) && !ACCEPTED_RESULTS.includes(worstResult?.inspection_result) && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-[1px] rounded-sm bg-blue-50 text-blue-700 text-[9px] font-bold leading-none align-middle ring-1 ring-blue-200">
                        {rejectedStage ? 'Re-Scheduled' : 'Scheduled'}
                      </span>
                    )}
                  </div>
                  {li.sku_variant && <div className="text-[11px] text-gray-500">{li.sku_variant}</div>}
                </td>
                <td className="px-3 py-2 text-gray-600 max-w-[220px] truncate">{sku?.description || '-'}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(li.target_date)}</td>
                <td className="px-3 py-2 text-right text-gray-700">{numCell(li.quantity_ordered)}</td>
                <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => onOpenCancelModal(li)}
                    title={pendingCancellations.has(li.id) ? 'A cancellation request is already pending for this SKU' : "Request cancelling part of this SKU's order quantity"}
                    className="text-gray-700 hover:text-red-600 transition-colors"
                  >
                    {numCell(li.cancelled_quantity)}
                    {pendingCancellations.has(li.id) && (
                      <span className="ml-1 inline-flex items-center px-1.5 py-[1px] rounded-sm bg-amber-50 text-amber-700 text-[9px] font-bold leading-none align-middle ring-1 ring-amber-200">
                        Pending: {pendingCancellations.get(li.id).requested_quantity}
                      </span>
                    )}
                  </button>
                </td>
                <td className="px-3 py-2 text-right text-gray-700">{numCell(li.balance_quantity)}</td>
                <td className="px-2 py-2 text-center text-gray-600 whitespace-nowrap" title={plan ? `Ac/Re - Critical ${plan.critical.ac}/${plan.critical.re}${plan.major ? ` · Major ${plan.major.ac}/${plan.major.re}` : ''}${plan.minor ? ` · Minor ${plan.minor.ac}/${plan.minor.re}` : ''}` : ''}>
                  {plan ? `${plan.codeLetter} (${plan.sampleSize})` : '-'}
                </td>
                {/* Accepted cell — commented out to match the header above. */}
                {/*
                <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                  {finalized ? (
                    <span className="text-gray-700" title="Finalized - no longer editable">{numCell(finalReport?.accepted_quantity)}</span>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      value={acceptedEdits[li.id] ?? finalReport?.accepted_quantity ?? ''}
                      onChange={e => onEditAccepted(li.id, e.target.value)}
                      onBlur={() => onCommitAccepted(li.id)}
                      onWheel={e => e.currentTarget.blur()}
                      placeholder="-"
                      className="w-16 text-right text-xs px-1.5 py-1 border border-gray-200 rounded-md focus:outline-none focus:border-gray-900"
                    />
                  )}
                </td>
                */}
                {STAGES.map(({ key }) => (
                  <td key={key} className="px-2 py-2 text-center">
                    <StageChip report={getStage(reports, li.id, key)} finalized={finalized} rejectedRound={wasStageRejected(reports, li.id, key)} />
                  </td>
                ))}
                <td className="px-3 py-2 text-center">
                  {isPartial ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">
                      Partially Accepted
                    </span>
                  ) : worstResult?.inspection_result ? (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${RESULT_BADGE_CLASS[worstResult.inspection_result]}`}>
                      {RESULT_LABEL[worstResult.inspection_result] || worstResult.inspection_result}
                    </span>
                  ) : <span className="text-gray-300">-</span>}
                </td>
                {/* Same source row as the Result column (worstResult) - the
                    SKU's current/most-relevant report, not necessarily the
                    latest round of every stage. An earlier, now-superseded
                    round's own number is still reachable via search (the
                    sidebar's SKU search, or QC Reports' Inspection Number
                    search), just not shown as this row's primary number. */}
                <td className="px-3 py-2 text-center text-gray-500 whitespace-nowrap font-mono text-[11px]">{worstResult?.report_no || '-'}</td>
                <td className="px-3 py-2 text-center text-gray-500 whitespace-nowrap">{fmtDate(finalReport?.submitted_at)}</td>
                <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    disabled={!passedFinal}
                    onClick={() => onOpenPdfPreview({ li, finalReport })}
                    title={passedFinal ? 'Preview inspection report PDF' : 'Available once this SKU passes Final inspection'}
                    className={`w-6 h-6 inline-flex items-center justify-center rounded transition-colors
                      ${passedFinal ? 'text-gray-400 hover:text-gray-900 hover:bg-gray-200' : 'text-gray-200 cursor-not-allowed'}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                </td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={16} className="px-3 py-8 text-center text-gray-400">
                {scheduledSkuIds.size === 0
                  ? 'No SKUs scheduled on this PO yet.'
                  : 'All scheduled SKUs on this PO have been moved to a later inspection date.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  )
}

// Mobile substitute for OverviewTable - the sidebar's own SKU list is
// hidden below md once a PO is selected (PoInspectionComments.jsx), so this
// is the only way to browse SKUs on a phone. Built independently against the
// same per-row data OverviewTable already computes, rather than importing
// the sidebar's SkuListRow (that component is tightly coupled to
// PoInspectionComments.jsx's own local state - schedule info, card-key
// selection - reusing it here would mean threading a lot of unrelated
// context down; matches this session's convention of accepting
// presentational duplication across independent views).
function SkuOverviewCard({
  li, sku, reports, worstResult, isPartial, plan, selectMode, checked, onToggleChecked, onSelectLineItem, pending, onOpenCancelModal,
  onOpenLightbox, finalReport, passedFinal, onOpenPdfPreview, onEnterSelectMode,
}) {
  const skuDefects = reports
    .filter(r => r.po_line_item_id === li.id)
    .reduce((acc, r) => {
      const d = defectTotals(r)
      return { critical: acc.critical + d.critical, major: acc.major + d.major, minor: acc.minor + d.minor }
    }, { critical: 0, major: 0, minor: 0 })
  const totalDefects = skuDefects.critical + skuDefects.major + skuDefects.minor

  // Long-press enters select mode (with this card already checked) - only
  // wired up while NOT already in select mode, since once it's on, a plain
  // tap already toggles the checkbox immediately and doesn't need the
  // press-and-hold gesture (or its ~500ms delay) at all.
  const longPress = useLongPress({
    onLongPress: () => onEnterSelectMode?.(li.id),
    onClick: () => onSelectLineItem?.(li),
  })

  return (
    <button
      type="button"
      {...(selectMode ? { onClick: () => onToggleChecked(li.id) } : longPress)}
      className={`w-full text-left px-3.5 py-3 flex items-start gap-2.5 transition-colors cursor-pointer
        ${ACCEPTED_RESULTS.includes(worstResult?.inspection_result) ? 'border-l-2 border-l-emerald-400' : ''}
        ${worstResult?.inspection_result === 'rejected' ? 'border-l-2 border-l-red-400' : ''}`}
    >
      {selectMode && (
        // Finalized SKUs are genuinely selectable here (this card's own
        // onClick already toggles regardless of `finalized`) - no dimming,
        // since it's not actually disabled.
        <span className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center
          ${checked ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}>
          {checked && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
        </span>
      )}
      {/* Product thumbnail + PDF preview - both exist on the desktop
          OverviewTable row already (SkuThumb/the PDF icon button) and were
          silently missing here before this. Same shared ImageLightbox/
          RowPdfPreviewModal instance the table uses (owned by PoSkuSummary,
          passed down), not a second copy of either. */}
      <span onClick={e => e.stopPropagation()} className="flex-shrink-0 mt-0.5">
        <SkuThumb url={sku?.image_url ? publicUrl(sku.image_url) : null} onClick={onOpenLightbox} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-gray-900 truncate">{li.buyer_sku_ref || '-'}</span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isPartial ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">
                Partially Accepted
              </span>
            ) : worstResult?.inspection_result ? (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${RESULT_BADGE_CLASS[worstResult.inspection_result]}`}>
                {RESULT_LABEL[worstResult.inspection_result] || worstResult.inspection_result}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-400">Pending</span>
            )}
            {/* PDF preview - same passedFinal gate as OverviewTable's own
                column (only downloadable once Final has passed). A plain
                span (not a nested <button>) since this already sits inside
                the card's own outer <button>. */}
            <span
              role="button"
              tabIndex={passedFinal ? 0 : -1}
              onClick={e => { if (!passedFinal) return; e.stopPropagation(); onOpenPdfPreview({ li, finalReport }) }}
              onKeyDown={e => { if (!passedFinal) return; if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onOpenPdfPreview({ li, finalReport }) } }}
              title={passedFinal ? 'Preview inspection report PDF' : 'Available once this SKU passes Final inspection'}
              className={`w-5 h-5 inline-flex items-center justify-center rounded transition-colors
                ${passedFinal ? 'text-gray-400 hover:text-gray-900 hover:bg-gray-200 cursor-pointer' : 'text-gray-200'}`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </span>
          </div>
        </div>
        {sku?.description && <div className="text-[11px] text-gray-500 truncate mt-0.5">{sku.description}</div>}
        <div className="flex items-center gap-2.5 mt-1.5">
          <StageDots reports={reports} lineItemId={li.id} />
          <span className="text-[11px] text-gray-400">{plan ? `${plan.codeLetter} (${plan.sampleSize})` : '-'}</span>
          {totalDefects > 0 && (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
              {skuDefects.critical}C · {skuDefects.major}M · {skuDefects.minor}mi
            </span>
          )}
        </div>
        <div className="text-[11px] text-gray-400 mt-1 flex items-center flex-wrap gap-x-1">
          <span>Order {numCell(li.quantity_ordered)}</span>
          <span>·</span>
          {/* A real &lt;button&gt; can't nest inside the card's own outer
              &lt;button&gt; (invalid HTML) - a span with its own click handler
              (stopped from bubbling to the card) is the tap target instead. */}
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); onOpenCancelModal(li) }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onOpenCancelModal(li) } }}
            className="hover:text-red-600 transition-colors cursor-pointer"
          >
            Cancelled {numCell(li.cancelled_quantity)}
          </span>
          {pending && (
            <span className="inline-flex items-center px-1.5 py-[1px] rounded-sm bg-amber-50 text-amber-700 text-[9px] font-bold leading-none align-middle ring-1 ring-amber-200">
              Pending: {pending.requested_quantity}
            </span>
          )}
          <span>·</span>
          <span>Balance {numCell(li.balance_quantity)}</span>
          {worstResult?.report_no && (
            <>
              <span>·</span>
              <span className="font-mono">{worstResult.report_no}</span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

function SkuOverviewCardList({
  po, reports, skuMasterById, onSelectLineItem, checkedSkuIds, onToggleChecked, onToggleAll, scheduledSkuIds, visibleTodaySkuIds,
  selectMode, pendingCancellations, onOpenCancelModal, skuImageIndexById, onOpenLightbox, onOpenPdfPreview, onEnterSelectMode,
}) {
  // Same union as OverviewTable above - finalized SKUs stay visible/
  // selectable here too, for the manual Send Mail button.
  // Ascending by SKU ref, numeric-aware (see PoInspectionComments.jsx's
  // sidebar list for the same fix/reasoning) - same unsorted-query-order
  // issue applied here too.
  const rows = (po.po_line_items ?? [])
    .filter(li => visibleTodaySkuIds.has(li.id) || isFinalized(reports, li.id) || hasAnySubmittedReport(reports, li.id))
    .sort((a, b) => (a.buyer_sku_ref || '').localeCompare(b.buyer_sku_ref || '', undefined, { numeric: true, sensitivity: 'base' }))
  const selectableRows = rows
  const allChecked = selectableRows.length > 0 && selectableRows.every(li => checkedSkuIds.has(li.id))

  if (rows.length === 0) {
    return (
      <div className="border border-gray-200 rounded-xl bg-white px-3 py-8 text-center text-xs text-gray-400">
        {scheduledSkuIds.size === 0
          ? 'No SKUs scheduled on this PO yet.'
          : 'All scheduled SKUs on this PO have been moved to a later inspection date.'}
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
      {selectMode && (
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-gray-100 bg-gray-50/80">
          <span className="text-[11px] font-semibold text-gray-500">{checkedSkuIds.size} selected</span>
          <button type="button" onClick={() => onToggleAll(selectableRows, allChecked)} className="text-[11px] font-bold text-gray-700 cursor-pointer">
            {allChecked ? 'Clear all' : 'Select all'}
          </button>
        </div>
      )}
      <div className="divide-y divide-gray-100">
        {rows.map(li => {
          const sku = skuMasterById[li.sku_id]
          const worstResult = getWorstStageResult(reports, li.id)
          // Same cumulative-vs-order check as OverviewTable above - see its
          // own comment for why this isn't just finalReport's own number.
          const finalRollup = getStageRollup(reports, li.id, 'final')
          const finalCovered = finalRollup.cumulativeAccepted > 0 ? finalRollup.cumulativeAccepted : finalRollup.cumulativeAvailable
          const isPartial = ACCEPTED_RESULTS.includes(worstResult?.inspection_result) &&
            li.quantity_ordered != null && finalCovered > 0 && finalCovered < li.quantity_ordered
          const plan = resolveSamplingPlan({ lotSize: li.quantity_ordered, inspectionLevel: po.inspection_level })
          const finalReport = getStage(reports, li.id, 'final')
          const passedFinal = ACCEPTED_RESULTS.includes(finalReport?.inspection_result)
          return (
            <SkuOverviewCard
              key={li.id}
              li={li}
              sku={sku}
              reports={reports}
              worstResult={worstResult}
              isPartial={isPartial}
              plan={plan}
              selectMode={selectMode}
              checked={checkedSkuIds.has(li.id)}
              onToggleChecked={onToggleChecked}
              onSelectLineItem={onSelectLineItem}
              pending={pendingCancellations.get(li.id) || null}
              onOpenCancelModal={onOpenCancelModal}
              onOpenLightbox={() => {
                const idx = skuImageIndexById.get(li.id)
                if (idx != null) onOpenLightbox(idx)
              }}
              finalReport={finalReport}
              passedFinal={passedFinal}
              onOpenPdfPreview={onOpenPdfPreview}
              onEnterSelectMode={onEnterSelectMode}
            />
          )
        })}
      </div>
    </div>
  )
}

function StageTable({ po, reports, skuMasterById, stageKey, stageLabel, onSelectLineItem, onOpenStep, visibleTodaySkuIds }) {
  // One row per submitted round of each SKU, plus its open (or not-started) latest round -
  // see buildStageRows (stageBalance.js), shared with the phone cards. A SKU moved to a later
  // date via Inspect Later stays hidden unless a round of this stage is already submitted.
  const rows = buildStageRows(po, reports, stageKey, visibleTodaySkuIds)

  if (!rows.length) {
    return (
      <p className="text-xs text-gray-400 text-center py-10">
        No {stageLabel} inspections recorded yet for this PO.
      </p>
    )
  }

  const groupTh = (label, span) => (
    <th colSpan={span} className="text-center px-2 py-1.5 font-bold border-b border-gray-200 bg-gray-100 text-gray-500">{label}</th>
  )
  const th = (label, align = 'center') => (
    <th className={`text-${align} px-2 py-1.5 font-bold whitespace-nowrap`}>{label}</th>
  )

  return (
    <div className="border border-gray-200 rounded-lg overflow-auto max-h-[65vh]">
      <table className="text-xs border-collapse">
        <thead className="sticky top-0 z-10 bg-gray-50 text-gray-500 text-[10px] uppercase tracking-wide">
          <tr>
            <th rowSpan={2} className="sticky left-0 z-30 bg-gray-50 text-left px-3 py-1.5 font-bold border-r border-gray-200 min-w-[140px]">Item Ref</th>
            <th rowSpan={2} className="text-left px-3 py-1.5 font-bold min-w-[180px]">Description</th>
            <th rowSpan={2} className="text-center px-2 py-1.5 font-bold whitespace-nowrap">Round</th>
            <th rowSpan={2} className="text-left px-2 py-1.5 font-bold whitespace-nowrap">Target</th>
            <th rowSpan={2} className="text-left px-2 py-1.5 font-bold whitespace-nowrap">Ship Via</th>
            {groupTh('Quantity', 5)}
            {groupTh('Workmanship', 5)}
            {groupTh('Checks', 4)}
            {groupTh('More', 4)}
            {groupTh('Sign-off', 2)}
          </tr>
          <tr>
            {th('Order', 'right')}{th('Avail.', 'right')}{th('Insp.', 'right')}{th('Acc.', 'right')}{th('Short', 'right')}
            {th('Level')}{th('Sample')}{th('Crit.')}{th('Maj.')}{th('Min.')}
            {th('Pkg')}{th('Meas.')}{th('Barcode')}{th('Site')}
            {th('Cartons', 'right')}{th('Digitals')}{th('Status')}{th('Result')}
            {th('Vendor Rep')}{th('QA Auditor')}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, li, report, round, isLatest, notStarted, short }) => {
            const sku = skuMasterById[li.sku_id]
            const defects = defectTotals(report)
            // Every value here was written on a specific wizard step — clicking
            // it jumps straight there instead of just opening the SKU on
            // whatever step it last left off on, same shortcut the Digitals
            // cell already offered, now extended to every other step's data.
            const stepCell = (stepKey, className, content) => (
              <td
                className={`${className} cursor-pointer hover:bg-gray-100/70 transition-colors`}
                onClick={e => { e.stopPropagation(); onOpenStep?.(li, stageKey, report, stepKey) }}
                title={`Go to ${STEP_LABEL[stepKey]}`}
              >
                {content}
              </td>
            )
            return (
              <tr
                key={key}
                // The latest round opens the SKU as before; an older round opens exactly that round (read only).
                onClick={() => (isLatest ? onSelectLineItem?.(li) : onOpenStep?.(li, stageKey, report, 'signoff'))}
                className={`border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors group ${isLatest ? '' : 'opacity-70'}
                  ${ACCEPTED_RESULTS.includes(report.inspection_result) ? 'border-l-2 border-l-emerald-400' : ''}
                  ${report.inspection_result === 'rejected' ? 'border-l-2 border-l-red-400' : ''}`}
              >
                <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-3 py-2 border-r border-gray-100 whitespace-nowrap">
                  <div className="font-bold text-gray-900">{li.buyer_sku_ref || '-'}</div>
                  {li.sku_variant && <div className="text-[10px] text-gray-500">{li.sku_variant}</div>}
                </td>
                <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate">{sku?.description || '-'}</td>
                <td className="px-2 py-2 text-center whitespace-nowrap">
                  <span className="text-[10px] font-bold text-gray-500">R{round}</span>
                  {!isLatest && (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="inline-block ml-1 -mt-0.5 text-gray-400" aria-label="Earlier round, view only">
                      <rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  )}
                </td>
                <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{fmtDate(li.target_date)}</td>
                {stepCell('quantity', 'px-2 py-2 text-gray-500 whitespace-nowrap', report.ship_via || '-')}

                <td className="px-2 py-2 text-right text-gray-700">{numCell(li.quantity_ordered)}</td>
                {/* Was li.balance_quantity - the SKU's overall order
                    balance, same for every stage/round - not what this
                    specific report actually saved as its own Available Qty.
                    A Final round covering only the leftover from an earlier
                    stage (288 of a 500 order) showed the full 500 here
                    while Insp./Acc. right next to it correctly read this
                    same report's own real numbers - real bug, not a
                    seeding/default quirk. */}
                {stepCell('quantity', 'px-2 py-2 text-right text-gray-700', numCell(report.available_quantity))}
                {stepCell('quantity', 'px-2 py-2 text-right text-gray-700', numCell(report.inspected_qty))}
                {stepCell('quantity', 'px-2 py-2 text-right text-gray-700', numCell(report.accepted_quantity))}
                {stepCell('quantity', `px-2 py-2 text-right font-semibold ${short > 0 ? 'text-red-600' : 'text-gray-700'}`, numCell(short))}

                {stepCell('workmanship', 'px-2 py-2 text-gray-600 whitespace-nowrap', report.workmanship_inspection_level || '-')}
                {stepCell('workmanship', 'px-2 py-2 text-gray-600 whitespace-nowrap', report.workmanship_sample_size || '-')}
                {stepCell('workmanship', 'px-2 py-2 text-center', <DefectCell n={defects.critical} color="text-red-600" />)}
                {stepCell('workmanship', 'px-2 py-2 text-center', <DefectCell n={defects.major} color="text-amber-600" />)}
                {stepCell('workmanship', 'px-2 py-2 text-center', <DefectCell n={defects.minor} color="text-slate-500" />)}

                {stepCell('packaging', 'px-2 py-2 text-center', <Verdict result={rollupResult(report.packaging_appearance)} />)}
                {stepCell('measurement', 'px-2 py-2 text-center', <Verdict result={rollupResult(report.packaging_measurement_findings)} />)}
                {stepCell('barcodes', 'px-2 py-2 text-center', <Verdict result={rollupResult(report.barcode_results)} />)}
                {stepCell('onsite', 'px-2 py-2 text-center', <Verdict result={rollupResult(report.onsite_tests)} />)}

                {stepCell('quantity', 'px-2 py-2 text-right text-gray-700', numCell(report.carton_available))}
                <td className="px-2 py-2 text-center"><DigitalsCell report={report} onClick={() => onOpenStep?.(li, stageKey, report, 'digitals')} /></td>
                {stepCell('signoff', 'px-2 py-2 text-center', (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${notStarted ? 'bg-gray-100 text-gray-500' : report.status === 'submitted' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                    {notStarted ? 'Not started' : report.status}
                  </span>
                ))}
                {stepCell('signoff', 'px-2 py-2 text-center', (
                  report.inspection_result
                    ? <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${RESULT_BADGE_CLASS[report.inspection_result]}`}>{RESULT_LABEL[report.inspection_result] || report.inspection_result}</span>
                    : <span className="text-gray-300">-</span>
                ))}
                {stepCell('signoff', 'px-2 py-2 text-center', (
                  <SignerCell name={report.vendor_rep_name} signature={report.vendor_rep_signature} />
                ))}
                {stepCell('signoff', 'px-2 py-2 text-center', (
                  <SignerCell name={report.quality_process_auditor_name} signature={report.quality_process_auditor_signature} />
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Mobile substitute for StageTable - that table (20 data columns across
// Quantity/Workmanship/Checks/More/Sign-off groups) had no mobile treatment
// at all before this, rendering unconditionally regardless of viewport. This
// mirrors SkuOverviewCard's own always-visible-tier + collapsed-details
// pattern: SKU ref, Result/Status badge, defect trio, and Digitals count are
// always shown (the "is this SKU okay" glance); everything else sits behind
// a "Details" disclosure, grouped under the same headings the table's own
// column groups use - except Cartons/Digitals/Status/Result (the table's
// "More" group), which are folded into Quantity (Cartons) or the
// always-visible header (Digitals/Status/Result) instead of a 5th group,
// since duplicating them a second time inside "Details" would just repeat
// what's already on screen. Every value here is tappable exactly like
// StageTable's own stepCell cells - it jumps straight to that step in the
// wizard - just at row granularity instead of per-cell, since a card has no
// individual cells to click.
function StageSkuCard({ li, sku, report, stageKey, round = 1, isLatest = true, notStarted = false, short = null, onSelectLineItem, onOpenStep, selectMode, checked, onToggleChecked, onEnterSelectMode }) {
  const [expanded, setExpanded] = useState(false)
  const defects = defectTotals(report)
  const totalDefects = defects.critical + defects.major + defects.minor

  const jumpTo = (stepKey, e) => { e.stopPropagation(); onOpenStep?.(li, stageKey, report, stepKey) }
  // Same long-press-to-select gesture as SkuOverviewCard's own (see its
  // comment) - only active while not already in select mode.
  const longPress = useLongPress({
    onLongPress: () => onEnterSelectMode?.(li.id),
    // Latest round opens the SKU as before; an older round opens exactly that round (read only).
    onClick: () => (isLatest ? onSelectLineItem?.(li) : onOpenStep?.(li, stageKey, report, 'signoff')),
  })

  return (
    <div className={`border-b border-gray-100 last:border-b-0 ${isLatest ? '' : 'opacity-70'}
      ${ACCEPTED_RESULTS.includes(report.inspection_result) ? 'border-l-2 border-l-emerald-400' : ''}
      ${report.inspection_result === 'rejected' ? 'border-l-2 border-l-red-400' : ''}`}
    >
      <button
        type="button"
        {...(selectMode ? { onClick: () => onToggleChecked(li.id) } : longPress)}
        className="w-full text-left px-3.5 py-3 flex items-start gap-2.5 transition-colors cursor-pointer"
      >
        {selectMode && (
          <span className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center
            ${checked ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}>
            {checked && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-gray-900 truncate">
              {li.buyer_sku_ref || '-'}
              <span className="ml-1.5 text-[10px] font-bold text-gray-400 align-middle">R{round}{isLatest ? '' : ' · view only'}</span>
            </span>
            {report.inspection_result ? (
              <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${RESULT_BADGE_CLASS[report.inspection_result]}`}>
                {RESULT_LABEL[report.inspection_result] || report.inspection_result}
              </span>
            ) : (
              <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${notStarted ? 'bg-gray-100 text-gray-500' : report.status === 'submitted' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                {notStarted ? 'Not started' : report.status}
              </span>
            )}
          </div>
          {(li.sku_variant || sku?.description) && (
            <div className="text-[11px] text-gray-500 truncate mt-0.5">{li.sku_variant || sku?.description}</div>
          )}
          <div className="flex items-center gap-2.5 mt-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
            {totalDefects > 0 && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                {defects.critical}C · {defects.major}M · {defects.minor}mi
              </span>
            )}
            <DigitalsCell report={report} onClick={() => onOpenStep?.(li, stageKey, report, 'digitals')} />
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-center gap-1 px-3.5 py-1.5 text-[11px] font-semibold text-gray-400 hover:text-gray-700 border-t border-gray-50 cursor-pointer"
      >
        {expanded ? 'Hide details' : 'Details'}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {expanded && (
        <div className="px-3.5 pb-3 space-y-3 text-[11px]">
          <div>
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Quantity</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <DetailRow onClick={e => jumpTo('quantity', e)} label="Order" value={numCell(li.quantity_ordered)} />
              <DetailRow onClick={e => jumpTo('quantity', e)} label="Balance" value={numCell(li.balance_quantity)} />
              <DetailRow onClick={e => jumpTo('quantity', e)} label="Inspected" value={numCell(report.inspected_qty)} />
              <DetailRow onClick={e => jumpTo('quantity', e)} label="Accepted" value={numCell(report.accepted_quantity)} />
              <DetailRow onClick={e => jumpTo('quantity', e)} label="Short" value={<span className={short > 0 ? 'text-red-600 font-semibold' : ''}>{numCell(short)}</span>} />
              <DetailRow onClick={e => jumpTo('quantity', e)} label="Cartons" value={numCell(report.carton_available)} />
              <DetailRow onClick={e => jumpTo('quantity', e)} label="Ship Via" value={report.ship_via || '-'} />
            </div>
          </div>
          <div>
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Workmanship</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <DetailRow onClick={e => jumpTo('workmanship', e)} label="Level" value={report.workmanship_inspection_level || '-'} />
              <DetailRow onClick={e => jumpTo('workmanship', e)} label="Sample" value={report.workmanship_sample_size || '-'} />
              <DetailRow onClick={e => jumpTo('workmanship', e)} label="Critical" value={<DefectCell n={defects.critical} color="text-red-600" />} />
              <DetailRow onClick={e => jumpTo('workmanship', e)} label="Major" value={<DefectCell n={defects.major} color="text-amber-600" />} />
              <DetailRow onClick={e => jumpTo('workmanship', e)} label="Minor" value={<DefectCell n={defects.minor} color="text-slate-500" />} />
            </div>
          </div>
          <div>
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Checks</div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { stepKey: 'packaging', label: 'Pkg', result: rollupResult(report.packaging_appearance) },
                { stepKey: 'measurement', label: 'Meas.', result: rollupResult(report.packaging_measurement_findings) },
                { stepKey: 'barcodes', label: 'Barcode', result: rollupResult(report.barcode_results) },
                { stepKey: 'onsite', label: 'Site', result: rollupResult(report.onsite_tests) },
              ].map(c => (
                <div key={c.stepKey} onClick={e => jumpTo(c.stepKey, e)} className="flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-70 transition-opacity">
                  <span className="text-gray-400 text-[10px]">{c.label}</span>
                  <Verdict result={c.result} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Sign-off</div>
            <div className="space-y-1">
              <DetailRow onClick={e => jumpTo('signoff', e)} label="Vendor Rep" value={<SignerCell name={report.vendor_rep_name} signature={report.vendor_rep_signature} />} />
              <DetailRow onClick={e => jumpTo('signoff', e)} label="QA Auditor" value={<SignerCell name={report.quality_process_auditor_name} signature={report.quality_process_auditor_signature} />} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StageSkuCardList({
  po, reports, skuMasterById, stageKey, stageLabel, onSelectLineItem, onOpenStep, visibleTodaySkuIds,
  selectMode, checkedSkuIds, onToggleChecked, onToggleAll, onEnterSelectMode,
}) {
  // Same rows as the desktop table (buildStageRows): one card per submitted round plus the
  // open / not-started latest round, so the two layouts can never disagree.
  const rows = buildStageRows(po, reports, stageKey, visibleTodaySkuIds)

  if (!rows.length) {
    return (
      <p className="text-xs text-gray-400 text-center py-10">
        No {stageLabel} inspections recorded yet for this PO.
      </p>
    )
  }

  const allChecked = rows.length > 0 && rows.every(({ li }) => checkedSkuIds.has(li.id))

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
      {selectMode && (
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-gray-100 bg-gray-50/80">
          <span className="text-[11px] font-semibold text-gray-500">{checkedSkuIds.size} selected</span>
          <button type="button" onClick={() => onToggleAll([...new Map(rows.map(r => [r.li.id, r.li])).values()], allChecked)} className="text-[11px] font-bold text-gray-700 cursor-pointer">
            {allChecked ? 'Clear all' : 'Select all'}
          </button>
        </div>
      )}
      <div>
        {rows.map(({ key, li, report, round, isLatest, notStarted, short }) => (
          <StageSkuCard
            key={key}
            li={li}
            sku={skuMasterById[li.sku_id]}
            report={report}
            stageKey={stageKey}
            round={round}
            isLatest={isLatest}
            notStarted={notStarted}
            short={short}
            onSelectLineItem={onSelectLineItem}
            onOpenStep={onOpenStep}
            selectMode={selectMode}
            checked={checkedSkuIds.has(li.id)}
            onToggleChecked={onToggleChecked}
            onEnterSelectMode={onEnterSelectMode}
          />
        ))}
      </div>
    </div>
  )
}

// Sets Inspection Date/Arrival/Start/Complete Time for every SKU on the PO in
// one shot - each SKU still gets its own report row (there's no PO-level
// table for these fields), targeting whichever stage is next actionable for
// that SKU (falls back to Inline for a SKU with no report yet), same
// resolution InspectionReportEntry.jsx's own single-SKU QuickSetFields uses.
// Pre-filled from whichever report was touched most recently, purely for
// display continuity - editing here always writes to every SKU's own current
// stage, not just the one the displayed value came from.
function POQuickSetFields({ po, reports, userName, canManage, onSaved }) {
  const lineItems = po.po_line_items ?? []
  const seedReport = [...reports]
    .filter(r => r.inspection_date || r.contact || r.arrival_time || r.start_time || r.complete_time)
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))[0]

  // MANUAL entry only: nothing is defaulted to today/now and nothing is written until Save is
  // clicked. It only shows values that were really saved on this PO's reports.
  const initialValues = {
    inspection_date: seedReport?.inspection_date || '',
    arrival_time: seedReport?.arrival_time || '',
    start_time: seedReport?.start_time || '',
    complete_time: seedReport?.complete_time || '',
    contact: seedReport?.contact || '',
  }
  const [values, setValues] = useState(initialValues)
  // What's actually persisted right now - compared against `values` to know
  // whether there's anything unsaved (drives the Save button, same
  // dirty-tracking convention InspectionPlanBar's own Inspection Level field
  // just above already uses). Typing/clearing/stamping a field only ever
  // updates local `values`; nothing writes to the database until Save is
  // clicked, replacing the old per-field autosave-on-blur.
  const [lastSaved, setLastSaved] = useState(initialValues)
  const dirty = Object.keys(values).some(k => values[k] !== lastSaved[k])
  const [saving, setSaving] = useState(false)

  // Writes every key in `fields` to each SKU's own report in ONE create-or-
  // update call per SKU. Critical that this stays a single combined call
  // rather than one call per field: the auto-save-once effect below used to
  // fire 4 separate per-field writes in parallel, and since none of those
  // SKUs had a report row yet, all 4 raced to create the same
  // (po_line_item_id, inspection_type, round) row - only the winner's own
  // field actually landed in that insert, and every loser was supposed to
  // fall back to an update once it saw the 23505 conflict. That fallback
  // path turned out to be exactly the kind of thing worth not depending on
  // 4-way per-field - two fields (whichever lost their own race and didn't
  // reliably land the fallback update) would end up silently unset even
  // though this component's own `values` state still showed them as filled.
  // One combined write per SKU has nothing left to race.
  const writeFields = async (fields) => {
    await Promise.all(lineItems.map(async li => {
      // A SKU with nothing next-actionable is either brand new (target
      // Inline, the true starting point) or already finalized (target
      // Final, its current/last stage) - falling back to 'inline'
      // unconditionally meant editing this bar on an already-completed PO
      // silently wrote to each SKU's old Inline report instead of the
      // Final report that's actually current (and the only one most
      // exports/reads care about), so the edit never showed up anywhere.
      const targetStage = getNextActionableStage(reports, li.id, li) || (isFinalized(reports, li.id) ? 'final' : 'inline')
      const targetReport = getStage(reports, li.id, targetStage)
      if (targetReport) {
        await updateInspectionReport(targetReport.id, fields, userName)
        return
      }
      const { error } = await createInspectionReport({
        po_line_item_id: li.id, inspection_type: targetStage, round: 1, status: 'draft',
        ...fields, created_by: userName, updated_by: userName,
      })
      if (error?.code === '23505') {
        const { data: existing } = await findInspectionReport({ po_line_item_id: li.id, inspection_type: targetStage, round: 1 })
        if (existing) await updateInspectionReport(existing.id, fields, userName)
      }
    }))
  }
  const handleSave = async () => {
    setSaving(true)
    await writeFields(values)
    setSaving(false)
    setLastSaved(values)
    onSaved?.()
  }

  const fields = [
    { key: 'inspection_date', label: 'Insp. Date', type: 'date' },
    { key: 'arrival_time', label: 'Arrival', type: 'text', placeholder: '10:00:00', stampable: true },
    { key: 'start_time', label: 'Start', type: 'text', placeholder: '10:10:00', stampable: true },
    { key: 'complete_time', label: 'Complete', type: 'text', placeholder: '18:50:00', stampable: true },
    // Same field Inspection Details' own "Vendor Representative Name" reads
    // (report.contact) - setting it here applies it PO-wide in one shot,
    // same as the date/time fields, instead of typing it once per SKU.
    { key: 'contact', label: 'Vendor Rep', type: 'text', placeholder: 'Name', stampable: false },
  ]

  return (
    <div className="flex flex-wrap items-end gap-3">
      {fields.map(({ key, label, type, placeholder, stampable }) => (
        // Vendor Rep (a name, not a fixed-format date/time) sizes to its own
        // content instead of sharing the same 120px every date/time field
        // uses, or stretching to fill the whole remaining row - width
        // tracks the typed name's length (in ch, so it scales with the
        // actual font) between a sensible floor and ceiling.
        <label key={key} className="flex flex-col gap-1">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{label}</span>
          <div className="relative">
            <input
              type={type}
              value={values[key]}
              placeholder={placeholder}
              disabled={!canManage || saving}
              onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
              // +8ch buffer (not +4) - the clear "×" button sits inside via
              // pr-11 padding, and too small a buffer let it overlap the
              // tail end of a longer name instead of sitting clear of it.
              style={key === 'contact' ? { width: `${Math.min(Math.max((values.contact || placeholder || '').length + 8, 16), 44)}ch` } : undefined}
              className={`text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 disabled:bg-gray-50 disabled:text-gray-400 transition-[width] ${key === 'contact' ? '' : 'w-[120px]'} ${type === 'text' ? 'pr-11' : ''}`}
            />
            {type === 'text' && canManage && !saving && (
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {values[key] && (
                  <button
                    type="button"
                    onClick={() => setValues(prev => ({ ...prev, [key]: '' }))}
                    title={`Clear ${label}`}
                    className="inline-flex items-center justify-center w-3.5 h-3.5 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
                {stampable && (
                  <button
                    type="button"
                    onClick={() => setValues(prev => ({ ...prev, [key]: nowTimeString() }))}
                    title={`Stamp ${label} with the current time`}
                    className="inline-flex items-center justify-center w-4 h-4 text-gray-400 hover:text-gray-900 transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="10" y1="2" x2="14" y2="2" /><line x1="12" y1="14" x2="15" y2="11" /><circle cx="12" cy="14" r="8" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        </label>
      ))}
      {/* Manual save, not autosave-on-blur - typing/clearing/stamping any of
          these 5 fields only stages a local change; nothing is written to
          the database until this is clicked. Same dirty+Save convention
          InspectionPlanBar's own Inspection Level field above already uses. */}
      {canManage && dirty && (
        <button type="button" onClick={handleSave} disabled={saving}
          className="px-4 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-black disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Save'}
        </button>
      )}
    </div>
  )
}

// PO-wide Inspection Level, set once and applied to every SKU's sample-size
// computation (see src/lib/samplingPlan.js). Quality Level Major/Minor are
// fixed org policy (AQL 2.5 / AQL 4.0), shown alongside for reference, not
// editable, matching the legacy system's "Quality Level Major/Minor" fields.
function InspectionPlanBar({ po, canManage, onPoPatched, reports, userName, refresh }) {
  const [level, setLevel] = useState(po.inspection_level || 'G-II')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showAqlChart, setShowAqlChart] = useState(false)

  // Re-sync when a different PO is selected, or when this PO's saved level
  // changes (this component instance is reused across PO switches, no key
  // forces a remount). Adjusted during render rather than in an effect so the
  // select never paints one frame showing the previous PO's level.
  const [syncedFrom, setSyncedFrom] = useState(`${po.id}:${po.inspection_level || ''}`)
  const currentKey = `${po.id}:${po.inspection_level || ''}`
  if (syncedFrom !== currentKey) {
    setSyncedFrom(currentKey)
    setLevel(po.inspection_level || 'G-II')
  }

  const dirty = level !== (po.inspection_level || '')

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const { error: err } = await updatePoInspectionLevel(po.id, level)
    setSaving(false)
    if (err) { setError(err.message || 'Failed to save inspection plan'); return }
    onPoPatched?.({ inspection_level: level })
  }

  // A PO that's never had its level set yet gets the "G-II" default written
  // in immediately, instead of just showing it in the select and waiting for
  // someone to notice and click Save - once it's actually set (by this or a
  // manual save), this never fires again for the PO.
  const autoSavedLevelRef = useRef(null)
  useEffect(() => {
    if (!canManage || po.inspection_level || autoSavedLevelRef.current === po.id) return
    autoSavedLevelRef.current = po.id
    handleSave()
    // handleSave/level are stable in intent for this one-shot default write -
    // depending on them would re-run this on every keystroke in the select.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po.id, po.inspection_level, canManage])

  return (
    <div className="px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm">
      {/* Row 1 - PO-wide inspection plan (level + fixed AQL policy). */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
            Inspection Level
            <button
              type="button"
              onClick={() => setShowAqlChart(true)}
              title="Reference AQL charts"
              className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-orange-50 text-orange-500 hover:bg-orange-100 hover:text-orange-600 transition-colors cursor-pointer normal-case whitespace-nowrap"
            >
              AQL Chart
            </button>
          </div>
          {canManage ? (
            <select value={level} onChange={e => setLevel(e.target.value)}
              className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10">
              {INSPECTION_LEVELS.map(o => <option key={o.value} value={o.value}>{o.label} ({o.value})</option>)}
            </select>
          ) : (
            <div className="text-sm font-semibold text-gray-800 px-2.5 py-1.5">{po.inspection_level || '-'}</div>
          )}
        </div>
        <div>
          <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Quality Level - Major</div>
          <div className="text-sm font-semibold text-gray-800 px-2.5 py-1.5 bg-gray-50 border border-gray-100 rounded-lg">AQL 2.5</div>
        </div>
        <div>
          <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Quality Level - Minor</div>
          <div className="text-sm font-semibold text-gray-800 px-2.5 py-1.5 bg-gray-50 border border-gray-100 rounded-lg">AQL 4.0</div>
        </div>
        {canManage && dirty && (
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-4 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-black disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {/* Row 2 - per-inspection quick-set fields, own row (not squeezed onto
          row 1) so this always reads as two deliberate groups rather than an
          overflow wrap. */}
      <div className="mt-3.5 pt-3.5 border-t border-gray-100">
        <POQuickSetFields po={po} reports={reports || []} userName={userName} canManage={canManage} onSaved={refresh} />
      </div>

      {showAqlChart && <AqlChartModal onClose={() => setShowAqlChart(false)} />}
    </div>
  )
}

// Mobile version of InspectionPlanBar - collapsed behind a one-line summary
// by default instead of always pushing the SKU list below the fold. Now that
// Inspection Level and the date/time fields auto-fill on first load (see
// InspectionPlanBar/POQuickSetFields above), most visits need zero
// interaction with this bar - it reuses the exact same field set, just
// re-parented under a tap-to-expand wrapper rather than rebuilt.
function MobilePlanBar(props) {
  const [expanded, setExpanded] = useState(false)
  const { po } = props
  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left cursor-pointer"
      >
        <span className="text-xs font-semibold text-gray-700">
          Inspection Plan · <span className="text-gray-500">{po.inspection_level || 'G-II'}</span>
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {expanded && (
        <div className="px-3.5 pb-3.5 border-t border-gray-100 pt-3">
          <InspectionPlanBar {...props} />
        </div>
      )}
    </div>
  )
}

// Selection/isolate state and the SKU master data are owned by
// InspectionReportEntry and passed in — this component unmounts whenever a SKU
// is opened, so anything it owned itself would reset on every SKU round trip.
export default function PoSkuSummary({
  po, reports, loading, skuMasterById, skuLoading, onSelectLineItem, onOpenStep, canManage, onPoPatched, userName, refresh, onOpenComments,
  checkedSkuIds, onToggleChecked, onToggleAll, scheduledSkuIds, visibleTodaySkuIds,
  acceptedEdits, onEditAccepted, onCommitAccepted, onToggleFillAccepted, onAcceptSelected, acceptedFilled, acceptedApplying,
}) {
  const [tab, setTab] = useState('overview')   // overview | inline | midline | final
  // Declared here (ahead of the early-return checks below) rather than down
  // by where TABS is otherwise used near the return - useSwipeTabs is a
  // hook, and hooks can't be called after an early return without breaking
  // React's rules-of-hooks (the checks below return before this point on
  // some renders).
  const TABS = [
    { key: 'overview', label: 'Overview' },
    ...STAGES,
  ]
  const swipeTabs = useSwipeTabs({ order: TABS.map(t => t.key), activeKey: tab, onChange: setTab })
  // Mobile-only: OverviewTable's checkbox column doesn't exist on the card
  // list, so a tap normally navigates into the SKU - this toggles it to
  // instead toggle each card's checkbox, driving the same checkedSkuIds/
  // bulk-accept/Inspect Later flow the desktop table already uses. Governs
  // BOTH the Overview tab's SkuOverviewCardList and the per-stage
  // StageSkuCardList (not scoped to `tab` any more) - switching tabs while
  // mid-select shouldn't silently drop back to "tap navigates".
  const [selectMode, setSelectMode] = useState(false)
  // Long-press-to-select's entry point (see useLongPress above,
  // SkuOverviewCard/StageSkuCard's own use of it) - turns select mode on
  // AND checks the pressed card in one gesture, instead of a "Select"
  // button first + a second tap to actually check something.
  const enterSelectModeWith = (lineItemId) => { setSelectMode(true); onToggleChecked(lineItemId) }
  const lineItems = po.po_line_items ?? []

  // Owned here (not inside OverviewTable/SkuOverviewCardList) because the
  // desktop table and mobile card list are both always mounted at once -
  // hidden md:block / md:hidden just toggles which one is visible via CSS,
  // not which one renders - so a single shared fetch/modal instance avoids
  // duplicate queries and keeps both views in sync with each other.
  const { fetchPendingCancellations } = usePendingLineItemCancellations()
  const [cancelModalLi, setCancelModalLi] = useState(null)
  const [bulkSignoffStage, setBulkSignoffStage] = useState(null)   // null | 'inline' | 'midline' | 'final'
  const [pendingCancellations, setPendingCancellations] = useState(new Map())
  const lineItemIds = lineItems.map(li => li.id).join(',')
  const refreshPendingCancellations = () => fetchPendingCancellations(lineItems.map(li => li.id)).then(setPendingCancellations)
  useEffect(() => { refreshPendingCancellations() }, [lineItemIds]) // eslint-disable-line react-hooks/exhaustive-deps

  // Owned here too, for the same reason as pendingCancellations above - the
  // desktop OverviewTable and mobile SkuOverviewCardList are both always
  // mounted, so one shared ImageLightbox/RowPdfPreviewModal instance (rather
  // than each view separately owning its own copy of both) keeps them in
  // sync and avoids a second lightbox/preview stacking on top of the first
  // if both were ever somehow open at once.
  const [previewRow, setPreviewRow] = useState(null)   // null | { li, finalReport }
  const [lightboxIndex, setLightboxIndex] = useState(null)
  // Every visible row's own product photo, in row order - lets the lightbox
  // page through all of this PO's SKU images (not just the one clicked).
  // Matches OverviewTable's own "visibleTodaySkuIds OR finalized" row filter
  // exactly (same rows a viewer can actually see/click a thumbnail on,
  // whichever view is showing) - skuImageIndexById maps a row's line-item id
  // to its position in this (gapless) list, since rows with no image are
  // excluded entirely rather than leaving a hole a plain rows-index would land on.
  const skuImages = []
  const skuImageIndexById = new Map()
  for (const li of lineItems) {
    if (!(visibleTodaySkuIds.has(li.id) || isFinalized(reports, li.id) || hasAnySubmittedReport(reports, li.id))) continue
    const url = publicUrl(skuMasterById[li.sku_id]?.image_url)
    if (!url) continue
    skuImageIndexById.set(li.id, skuImages.length)
    skuImages.push(url)
  }

  if (!lineItems.length) {
    return <p className="text-xs text-gray-400 text-center py-10">No line items on this PO.</p>
  }
  if (loading || skuLoading) {
    return <div className="flex items-center justify-center py-10"><Spinner /></div>
  }

  // Matches OverviewTable's own row filter — the KPI should read the same
  // count as what's actually listed below it, not the PO's full SKU count
  // (a SKU moved to a later date via Inspect Later is still "Scheduled" in
  // the broader sense, but shouldn't inflate a count for a table it no
  // longer appears in).
  const scheduledLineItems = lineItems.filter(li => visibleTodaySkuIds.has(li.id))

  const acceptedSkus = lineItems.filter(li => ACCEPTED_RESULTS.includes(getWorstStageResult(reports, li.id)?.inspection_result))
  // Rejected on ANY stage and not yet resolved (getWorstStageResult only reads each
  // stage's latest round, so a Midline rejection that already has a new round read 0).
  const rejectedSkus = lineItems.filter(li => hasUnresolvedRejection(reports, li.id))

  const allDefects = reports.reduce((acc, r) => {
    const d = defectTotals(r)
    return { critical: acc.critical + d.critical, major: acc.major + d.major, minor: acc.minor + d.minor }
  }, { critical: 0, major: 0, minor: 0 })
  const totalDefects = allDefects.critical + allDefects.major + allDefects.minor
  const defectiveLineItemIds = new Set(
    reports.filter(r => { const d = defectTotals(r); return d.critical + d.major + d.minor > 0 }).map(r => r.po_line_item_id)
  )
  const defectSkus = lineItems.filter(li => defectiveLineItemIds.has(li.id))

  const totalPhotos = reports.reduce((n, r) => n + (r.inspection_report_photos?.length ?? 0), 0)
  // "Missing" means the SKU has zero photos anywhere on it - summed across
  // all its stage reports (Inline/Midline/Final), not "any single stage
  // report happens to have none". A SKU whose photos all live under one
  // stage (e.g. everything uploaded at Final) previously still got flagged
  // missing because Inline/Midline's own reports had 0 each.
  const missingPhotoSkuItems = lineItems.filter(li =>
    reports.filter(r => r.po_line_item_id === li.id).reduce((n, r) => n + (r.inspection_report_photos?.length ?? 0), 0) === 0
  )
  const missingPhotoSkus = missingPhotoSkuItems.length

  return (
    <div className="space-y-4">
      {/* KPI strip - Progress spans both mobile columns (display:contents
          drops the wrapper at md+ so it rejoins the flex row unchanged);
          the rest sit in a 2-column grid on mobile, a flex row at md+. */}
      <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2">
        <div className="col-span-2 md:contents"><ProgressKpi reports={reports} lineItems={lineItems} /></div>
        <Kpi label="Scheduled" value={scheduledLineItems.length} skus={scheduledLineItems} />
        <Kpi label="Accepted" value={acceptedSkus.length} accent="text-emerald-600" skus={acceptedSkus} />
        <Kpi label="Rejected" value={rejectedSkus.length} accent={rejectedSkus.length ? 'text-red-600' : undefined} skus={rejectedSkus} />
        <Kpi label="Open Defects" value={totalDefects} sub={`${allDefects.critical}C · ${allDefects.major}M · ${allDefects.minor}mi`} accent={totalDefects ? 'text-amber-600' : undefined} skus={defectSkus} />
        <Kpi label="Photos" value={totalPhotos} sub={missingPhotoSkus ? `${missingPhotoSkus} SKU${missingPhotoSkus !== 1 ? 's' : ''} missing` : 'All up to date'} accent={missingPhotoSkus ? 'text-amber-600' : 'text-emerald-600'} skus={missingPhotoSkuItems} />
      </div>

      <div className="hidden md:block">
        <InspectionPlanBar po={po} canManage={canManage} onPoPatched={onPoPatched} reports={reports} userName={userName} refresh={refresh} />
      </div>
      <div className="md:hidden">
        <MobilePlanBar po={po} canManage={canManage} onPoPatched={onPoPatched} reports={reports} userName={userName} refresh={refresh} />
      </div>

      {/* Tabs */}
      {/* Desktop - unchanged single row (plenty of width, never actually
          needs its own overflow-x-auto in practice, kept only as a
          defensive fallback it was already using before this). */}
      <div className="hidden md:flex items-center gap-1.5 overflow-x-auto">
        <div className="flex items-center gap-1 bg-gray-100/70 p-1 rounded-lg flex-shrink-0">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${tab === t.key ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:bg-white hover:text-gray-900'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Bulk Signoff - one button per stage, always visible regardless
            of which tab is currently active (not tied to `tab`), so any
            stage can be bulk signed-off without switching tabs first. */}
        {canManage && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {STAGES.map(s => (
              <button
                key={s.key}
                type="button"
                onClick={() => setBulkSignoffStage(s.key)}
                title={`Bulk signoff - ${s.label}`}
                className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-gray-500 bg-gray-100/70 hover:bg-gray-200 transition-colors whitespace-nowrap"
              >
                Signoff {s.label}
              </button>
            ))}
          </div>
        )}
        {/* Comments - relocated here from the page header, PO-wide (this
            table only renders with no SKU selected, so there's no per-SKU
            thread to route to from here) - sits right next to the tabs so
            it reads as "comment on what's shown here", not a page-wide action. */}
        <button
          type="button"
          onClick={onOpenComments}
          title="Comments for this PO"
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </button>
      </div>

      {/* Mobile - two full-width rows, never scrolls, instead of the
          desktop row's overflow-x-auto: 4 tabs get an even 4-up grid on
          their own row, everything else (Signoff, comments, Select) sits
          on a second row underneath. This is the actual fix for the "still
          shows a horizontal scrollbar on a phone" report - the desktop
          row's overflow-x-auto is a real fallback there (comfortably never
          triggers, plenty of width), but on a narrow phone with all of
          Overview/Inline/Midline/Final + Signoff + comments + Select
          competing for one line, it was genuinely triggering. */}
      <div className="md:hidden border border-gray-200 rounded-xl p-2.5 space-y-1.5 bg-white">
        <div className="grid grid-cols-4 gap-1 bg-gray-100/70 p-1 rounded-lg">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-1 py-1.5 rounded-md text-[11px] font-semibold transition-all truncate ${tab === t.key ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:bg-white hover:text-gray-900'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-1.5">
          {/* Mobile equivalent of the desktop Signoff-per-stage row above -
              a popover here used to drop down and cover the "Select all"
              row/first card right underneath it, with nowhere better to
              put it (opening it sideways would just run out of row width
              the moment "Select all"/comments/Done are also in this same
              row). Three short abbreviated buttons (STAGE_ABBR's own
              IL/ML/FN, same convention InspectionSchedule.jsx already
              uses) sidestep the popover entirely - short enough to sit
              inline with everything else in this row, no overlap, nothing
              to open/close. */}
          {canManage ? (
            <div className="flex items-center gap-1 flex-shrink-0">
              {STAGES.map(s => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setBulkSignoffStage(s.key)}
                  title={`Bulk signoff - ${s.label}`}
                  className="px-2 py-1.5 rounded-md text-xs font-bold text-gray-500 bg-gray-100/70 hover:bg-gray-200 transition-colors whitespace-nowrap"
                >
                  {STAGE_ABBR[s.key] || s.label}
                </button>
              ))}
            </div>
          ) : <span />}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={onOpenComments}
              title="Comments for this PO"
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </button>
            {/* Select mode - neither OverviewTable's checkbox column nor
                StageTable have a card-list equivalent, so this toggles what
                tapping a card does (navigate vs. check) instead. Governs
                both the Overview tab's SkuOverviewCardList and the
                per-stage StageSkuCardList (see their own checkedSkuIds/
                selectMode props below), so switching tabs while mid-select
                keeps working the way it started. Long-press on a card
                (SkuOverviewCard/StageSkuCard's own useLongPress) is the
                other, faster way into select mode - this button stays as
                the visible, discoverable one. */}
            <button
              type="button"
              onClick={() => setSelectMode(v => !v)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap
                ${selectMode ? 'bg-gray-900 text-white' : 'text-gray-500 bg-gray-100/70 hover:bg-gray-200'}`}
            >
              {selectMode ? 'Done' : 'Select'}
            </button>
          </div>
        </div>
      </div>

      {/* Swipe left/right anywhere in here to move a tab over - see
          useSwipeTabs' own comment. Wraps both the desktop table and mobile
          card branches below; harmless on desktop since the handlers only
          ever act on a touch pointer. */}
      <div {...swipeTabs}>
      {tab === 'overview' ? (
        <>
          <div className="hidden md:block">
            <OverviewTable
              po={po}
              reports={reports}
              skuMasterById={skuMasterById}
              onSelectLineItem={onSelectLineItem}
              checkedSkuIds={checkedSkuIds}
              onToggleChecked={onToggleChecked}
              onToggleAll={onToggleAll}
              scheduledSkuIds={scheduledSkuIds}
              visibleTodaySkuIds={visibleTodaySkuIds}
              acceptedEdits={acceptedEdits}
              onEditAccepted={onEditAccepted}
              onCommitAccepted={onCommitAccepted}
              onToggleFillAccepted={onToggleFillAccepted}
              onAcceptSelected={onAcceptSelected}
              acceptedFilled={acceptedFilled}
              acceptedApplying={acceptedApplying}
              pendingCancellations={pendingCancellations}
              onOpenCancelModal={setCancelModalLi}
              skuImageIndexById={skuImageIndexById}
              onOpenLightbox={setLightboxIndex}
              onOpenPdfPreview={setPreviewRow}
            />
          </div>
          <div className="md:hidden">
            <SkuOverviewCardList
              po={po}
              reports={reports}
              skuMasterById={skuMasterById}
              onSelectLineItem={onSelectLineItem}
              checkedSkuIds={checkedSkuIds}
              onToggleChecked={onToggleChecked}
              onToggleAll={onToggleAll}
              scheduledSkuIds={scheduledSkuIds}
              visibleTodaySkuIds={visibleTodaySkuIds}
              selectMode={selectMode}
              pendingCancellations={pendingCancellations}
              onOpenCancelModal={setCancelModalLi}
              skuImageIndexById={skuImageIndexById}
              onOpenLightbox={setLightboxIndex}
              onOpenPdfPreview={setPreviewRow}
              onEnterSelectMode={enterSelectModeWith}
            />
          </div>
        </>
      ) : (
        <>
          <div className="hidden md:block">
            <StageTable
              po={po}
              reports={reports}
              skuMasterById={skuMasterById}
              stageKey={tab}
              stageLabel={STAGES.find(s => s.key === tab)?.label}
              onSelectLineItem={onSelectLineItem}
              onOpenStep={onOpenStep}
              visibleTodaySkuIds={visibleTodaySkuIds}
            />
          </div>
          <div className="md:hidden">
            <StageSkuCardList
              po={po}
              reports={reports}
              skuMasterById={skuMasterById}
              stageKey={tab}
              stageLabel={STAGES.find(s => s.key === tab)?.label}
              onSelectLineItem={onSelectLineItem}
              onOpenStep={onOpenStep}
              visibleTodaySkuIds={visibleTodaySkuIds}
              selectMode={selectMode}
              checkedSkuIds={checkedSkuIds}
              onToggleChecked={onToggleChecked}
              onToggleAll={onToggleAll}
              onEnterSelectMode={enterSelectModeWith}
            />
          </div>
        </>
      )}
      </div>
      {cancelModalLi && (
        <CancelQuantityModal
          lineItem={cancelModalLi}
          pending={pendingCancellations.get(cancelModalLi.id) || null}
          onClose={() => setCancelModalLi(null)}
          onSubmitted={refreshPendingCancellations}
        />
      )}
      {bulkSignoffStage && (
        <BulkSignoffModal
          po={po}
          reports={reports}
          stageKey={bulkSignoffStage}
          userName={userName}
          checkedSkuIds={checkedSkuIds}
          onClose={() => setBulkSignoffStage(null)}
          onSaved={refresh}
        />
      )}
      {previewRow && (
        <RowPdfPreviewModal
          po={po}
          li={previewRow.li}
          finalReport={previewRow.finalReport}
          onClose={() => setPreviewRow(null)}
        />
      )}
      {lightboxIndex != null && (
        <ImageLightbox
          images={skuImages}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}
