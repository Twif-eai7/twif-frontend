import { useState, useEffect } from 'react'
import { STAGES, STEP_LABEL, getStage, RESULT_LABEL, RESULT_BADGE_CLASS } from './stageStatus'
import { fetchSubmittedResultLogs } from '../../../hooks/useInspectionReports'

function fmtDate(d) {
  if (!d) return '-'
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateTime(d) {
  if (!d) return '-'
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Present on every row, but only ever active once that stage is submitted —
// a submitted stage is a locked historical record, so downloading its PDF is
// the one action left to offer instead of an edit.
function DownloadButton({ enabled, downloading, onClick }) {
  return (
    <button
      type="button"
      disabled={!enabled || downloading}
      onClick={e => { e.stopPropagation(); onClick() }}
      title={enabled ? 'Download PDF' : 'Available once this stage is submitted'}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold whitespace-nowrap transition-colors
        ${enabled
          ? 'border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          : 'border-gray-100 text-gray-300 cursor-not-allowed'}`}
    >
      {downloading ? (
        <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      )}
      {downloading ? 'Exporting…' : 'Export PDF'}
    </button>
  )
}

// One live row per stage (Inline/Midline/Final) — not a growing event list.
// Each row reflects the CURRENT state of that stage's latest round: status,
// which of the 9 form steps was last touched, and who last saved it and
// when. Once a stage is submitted it's permanently locked — no edit action
// here, only a download of its PDF. Full historical detail (every past
// submit/re-inspection) lives in the separate History modal instead — this
// panel is a live status view, not an audit trail.
export default function InspectionActivityLog({ lineItemId, reports, onOpenReport, po, skuMasterById }) {
  const [downloadingKey, setDownloadingKey] = useState(null)

  // Every 'submitted' event this SKU's reports ever carried a result for
  // (see addInspectionReportLog/fetchSubmittedResultLogs) - the only place
  // a same-round in-place resubmit's earlier result (e.g. "Plan Aborted"
  // before it got reopened and Accepted) still exists at all, since that
  // resubmit overwrites inspection_reports.inspection_result directly with
  // nothing else keeping the old value. Keyed by report_id below to find
  // what a given row's OWN report was previously submitted as.
  const [submittedLogs, setSubmittedLogs] = useState([])
  useEffect(() => {
    let cancelled = false
    fetchSubmittedResultLogs(lineItemId).then(({ data }) => { if (!cancelled) setSubmittedLogs(data) })
    return () => { cancelled = true }
  }, [lineItemId])

  // One live row per stage (the current latest round, as before), plus a
  // read-only history row for every EARLIER round of that same stage,
  // whatever its own status/result - a fresh round can start on top of an
  // older one for more than one reason (an auto re-inspection after a
  // rejection, a Rework-approved redo, a leftover-quantity follow-up), and
  // getStage only ever surfaces the latest round, so any of those older
  // ones used to vanish from this panel entirely the moment a newer round
  // existed. Was rejected-only at first, but a Rework redo's own earlier
  // (accepted) round is just as real a piece of history and was going
  // missing the same way. These history rows are always a real past round,
  // so InspectionForm already renders a submitted one locked/read-only when
  // opened (same isLocked check any other submitted+verdict round gets) -
  // nothing new needed there for those; an unsubmitted (draft) older round
  // can really only happen for a stray/abandoned draft, and opens exactly
  // like any other draft would.
  const rows = STAGES
    .flatMap(({ key, label }) => {
      const latest = getStage(reports, lineItemId, key)
      if (!latest) return []
      const history = reports
        .filter(r => r.po_line_item_id === lineItemId && r.inspection_type === key && r.id !== latest.id)
        .sort((a, b) => (b.round ?? 1) - (a.round ?? 1))
      return [
        { key, label, report: latest, historical: false },
        ...history.map(report => ({ key, label, report, historical: true })),
      ]
    })
    .sort((a, b) => new Date(b.report.updated_at || b.report.created_at) - new Date(a.report.updated_at || a.report.created_at))

  // Distinct results this exact report was submitted with BEFORE its
  // current one, most recent first, deduped by result value - a repeated
  // resubmit with the identical result (a typo fix, still Accepted both
  // times) isn't a verdict change and shouldn't show as fake history.
  function supersededResults(report) {
    const seen = new Set([report.inspection_result])
    const out = []
    for (let i = submittedLogs.length - 1; i >= 0; i--) {
      const log = submittedLogs[i]
      if (log.report_id !== report.id || !log.result || seen.has(log.result)) continue
      seen.add(log.result)
      out.push(log)
    }
    return out
  }

  const handleDownload = async (key, report) => {
    if (report.status !== 'submitted' || downloadingKey) return
    setDownloadingKey(key)
    try {
      // Phase 3 - built server-side now (see inspectionReportPdfApi.js).
      const { fetchInspectionReportPdf, downloadBlob } = await import('../../../lib/inspectionReportPdfApi')
      const { blob, filename } = await fetchInspectionReportPdf(po.id, [report.id], { mode: 'final' })
      downloadBlob(blob, filename)
    } catch (err) {
      console.error('[InspectionActivityLog] PDF export failed:', err.message)
    } finally {
      setDownloadingKey(null)
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg">
      <div className="px-3 py-2 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wide">
        Activity Log
      </div>
      <div className="p-2 space-y-1.5">
        {rows.length === 0 && <p className="text-xs text-gray-400 px-1 py-2">No activity recorded yet.</p>}
        {rows.map(({ key, label, report, historical }) => {
          const submitted = report.status === 'submitted'
          const rowKey = `${key}-${report.id}`
          // Red only for a historical round that was actually rejected -
          // history rows now cover every reason a fresh round can exist
          // (Rework redo, leftover follow-up, auto re-inspection after a
          // rejection), not just rejections, so an accepted-but-superseded
          // round reads as neutral "Superseded" instead of a false alarm.
          const wasRejected = historical && submitted && report.inspection_result === 'rejected'
          const superseded = submitted ? supersededResults(report) : []
          return (
            <div key={rowKey}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onOpenReport?.(key, report.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenReport?.(key, report.id) } }}
              className={`w-full flex items-start justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer transition-colors
                ${wasRejected ? 'bg-red-50/60 hover:bg-red-50' : historical ? 'bg-gray-100/70 hover:bg-gray-100' : 'bg-gray-50 hover:bg-gray-100'}`}
            >
              <div className="min-w-0">
                {historical && (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    className={`inline-block mr-1 -mt-0.5 ${wasRejected ? 'text-red-400' : 'text-gray-400'}`}>
                    <rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                )}
                <span className="font-semibold text-gray-700">
                  {label}{report.round > 1 ? ` · Round ${report.round}` : ''}
                </span>
                {' · '}
                <span className="text-gray-600">
                  {submitted ? `Submitted · ${fmtDate(report.submitted_at)}` : `In progress · ${STEP_LABEL[report.last_step] || 'Just started'}`}
                </span>
                {submitted && report.inspection_result && (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${RESULT_BADGE_CLASS[report.inspection_result]}`}>
                    {RESULT_LABEL[report.inspection_result] || report.inspection_result}
                  </span>
                )}
                {historical && (
                  <span className={`ml-1.5 text-[10px] font-medium ${wasRejected ? 'text-red-400' : 'text-gray-400'}`}>
                    Superseded · view only
                  </span>
                )}
                <div className="text-gray-400 mt-0.5">
                  {report.updated_by || report.created_by || '-'} · {fmtDateTime(report.updated_at || report.created_at)}
                </div>
              </div>
              <DownloadButton
                enabled={submitted}
                downloading={downloadingKey === rowKey}
                onClick={() => handleDownload(rowKey, report)}
              />
            </div>
            {/* A prior result THIS SAME report/round was once submitted
                with, before an in-place resubmit overwrote it - not a
                separate round (no report_id of its own to open or export),
                just the one fact worth keeping: it happened. See
                addInspectionReportLog's own result param doc. */}
            {superseded.map(log => (
              <div key={`${rowKey}-was-${log.result}-${log.created_at}`}
                className="w-full flex items-start gap-2 px-2.5 py-1.5 mt-1 rounded-lg text-[11px] bg-gray-100/50">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="inline-block mr-1 -mt-0.5 text-gray-400 flex-shrink-0">
                  <rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                <div className="min-w-0 text-gray-500">
                  Was
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${RESULT_BADGE_CLASS[log.result]}`}>
                    {RESULT_LABEL[log.result] || log.result}
                  </span>
                  <div className="text-gray-400 mt-0.5">{log.actor_name || '-'} · {fmtDateTime(log.created_at)}</div>
                </div>
              </div>
            ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
