import { useState } from 'react'
import { approveReworkRequest, rejectReworkRequest } from '../../../hooks/useInspectionRework'
import { STAGE_LABEL } from './stageStatus'

const STATUS_BADGE = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border-red-200',
}
const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }

// Translates the raw errors approve_inspection_rework (the Postgres RPC -
// see supabase/migrations/20260909_copy_report_data_on_rework_approval.sql)
// can actually throw into something a non-technical reviewer can act on,
// instead of a bare constraint-name/SQL string. Falls back to a plain
// generic message for anything unrecognized - never shows raw Postgres text.
function friendlyReworkError(message) {
  const msg = message || ''
  if (msg.includes('duplicate key') && msg.includes('inspection_reports_po_line_item_id_inspection_type_round_key')) {
    return 'This SKU already has a newer round on record - it looks like it was already reworked or re-inspected since this request was filed. Refresh the page and check its current status before trying again.'
  }
  if (msg.includes('is not pending')) {
    return 'This request was already reviewed (approved or rejected) - someone else may have just acted on it. Refresh the page to see the current status.'
  }
  return 'Something went wrong and this could not be completed. Please try again, and let Tech know if it keeps happening.'
}

// Opened from PoInspectionComments.jsx's header badge (QA admins only) -
// `requests` is every inspection_rework_requests row for this PO, regardless
// of status. Pending view lists just the ones needing a decision (approve
// resets each item's stage to a fresh draft round + new schedule entry, via
// the approve_inspection_rework RPC; reject just closes the request out with
// a note, no data changes) one at a time; History is a read-only look back
// at every request ever made on this PO, whatever its outcome.
//
// Also reused, global-mode, from the Scheduled POs overview page (no PO open
// yet): there `poId` is omitted, `requests` spans every PO (each row already
// carrying its own `po_number` from useAllPendingReworkRequests) and
// `lineItems` is empty - each request's own PO number is shown as a badge so
// it's still clear which PO a given card belongs to, and downloads resolve
// the PO to fetch per-request off `req.po_id` instead of one shared poId.
export default function ReworkReviewModal({ poId, requests, lineItems, userName, userEmail, onClose, onReviewed }) {
  const [view, setView] = useState('pending') // 'pending' | 'history'
  const [busyId, setBusyId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  // Which item's report is currently being fetched for download - keyed by
  // report_id, since that's what a request item actually captures (see
  // downloadItemReport below).
  const [downloadingReportId, setDownloadingReportId] = useState(null)

  const pendingRequests = requests.filter(r => r.status === 'pending')
  const shown = view === 'pending' ? pendingRequests : requests

  // Fallback for requests submitted before `sku_ref` was captured on each
  // item - resolves the SKU label from the PO's own line items instead of
  // falling back all the way to the raw po_line_item_id UUID.
  const skuRefById = new Map((lineItems || []).map(li => [li.id, li.buyer_sku_ref]))

  const fmtDate = (iso) => {
    if (!iso) return '-'
    try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }
    catch { return iso }
  }

  const approve = async (req) => {
    setBusyId(req.id)
    setError(null)
    const { error: err } = await approveReworkRequest({ requestId: req.id, reviewedBy: userName, reviewedByEmail: userEmail })
    setBusyId(null)
    if (err) { setError(friendlyReworkError(err.message)); return }
    onReviewed?.()
  }

  const confirmReject = async (req) => {
    if (!note.trim()) { setError('Please add a note explaining the rejection.'); return }
    setBusyId(req.id)
    setError(null)
    const { error: err } = await rejectReworkRequest({ requestId: req.id, reviewedBy: userName, reviewedByEmail: userEmail, reviewNote: note.trim() })
    setBusyId(null)
    if (err) { setError(friendlyReworkError(err.message)); return }
    setRejectingId(null)
    setNote('')
    onReviewed?.()
  }

  // Downloads the exact report that prompted this item's rework request -
  // its captured report_id (the submitted round at request time), not
  // whatever round is currently open post-approval, so the history stays a
  // faithful record of what was actually flagged. Same PO-object shape
  // QcRepositoryPanel.jsx's own openExport builds for exportInspectionReportPdf
  // (buyer/supplier flattened onto the PO, po_line_items carried alongside
  // for it to resolve the SKU from), just scoped to this one report instead
  // of a whole PO's worth.
  const downloadItemReport = async (item, req) => {
    if (!item.report_id) return
    // Global mode has no single shared poId - each request carries its own
    // po_id instead (see the file-level comment above).
    const targetPoId = poId || req?.po_id
    if (!targetPoId) return
    setDownloadingReportId(item.report_id)
    setError(null)
    try {
      // Phase 3 - built server-side now (see inspectionReportPdfApi.js);
      // the server resolves the report/PO/SKU data itself from just
      // poId + reportIds, so the client-side fetches this used to need are
      // gone entirely.
      const { fetchInspectionReportPdf, downloadBlob } = await import('../../../lib/inspectionReportPdfApi')
      const { blob, filename } = await fetchInspectionReportPdf(targetPoId, [item.report_id], { mode: 'final' })
      downloadBlob(blob, filename)
    } catch (err) {
      setError(err.message || 'Failed to download report')
    } finally {
      setDownloadingReportId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <span className="text-sm font-bold text-gray-900">Rework Requests</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setView(v => v === 'pending' ? 'history' : 'pending')}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              {view === 'pending' ? `History (${requests.length})` : `← Pending (${pendingRequests.length})`}
            </button>
            <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto">
          {shown.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">
              {view === 'pending' ? 'No pending rework requests.' : 'No rework requests for this PO yet.'}
            </p>
          )}

          {shown.map(req => (
            <div key={req.id} className={`border rounded-lg px-3 py-2.5 flex flex-col gap-2 ${req.status === 'pending' ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200 bg-gray-50/60'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-800 flex items-center gap-1.5 min-w-0">
                  {/* PO number badge - global mode only (per-PO mode already has
                      exactly one PO in view, so it'd be redundant there). */}
                  {!poId && req.po_number && (
                    <span className="flex-shrink-0 text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
                      PO {req.po_number}
                    </span>
                  )}
                  <span className="truncate">{req.requested_by}</span>
                </span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${STATUS_BADGE[req.status] || STATUS_BADGE.pending}`}>
                    {STATUS_LABEL[req.status] || req.status}
                  </span>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{fmtDate(req.requested_at)}</span>
                </div>
              </div>

              {/* Buyer/Vendor/Region - global mode only, same reasoning as the
                  PO number badge above. */}
              {!poId && (req.buyer_name || req.vendor_name || req.vendor_region) && (
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-gray-500">
                  {req.buyer_name && <span>{req.buyer_name}</span>}
                  {req.buyer_name && (req.vendor_name || req.vendor_region) && <span className="text-gray-300">·</span>}
                  {req.vendor_name && <span className="font-semibold text-gray-600">{req.vendor_name}</span>}
                  {req.vendor_region && <span className="text-gray-400">({req.vendor_region})</span>}
                </div>
              )}

              <div className="flex flex-wrap gap-1">
                {(req.items || []).map((it, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-white border border-amber-200 rounded px-1.5 py-0.5">
                    {it.sku_ref || skuRefById.get(it.po_line_item_id) || it.po_line_item_id} · {STAGE_LABEL[it.inspection_type] || it.inspection_type}
                    {it.report_id && (
                      <button
                        type="button"
                        onClick={() => downloadItemReport(it, req)}
                        disabled={downloadingReportId === it.report_id}
                        title="Download the report that was rejected/reworked"
                        className="w-3.5 h-3.5 inline-flex items-center justify-center rounded text-amber-500 hover:text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-wait"
                      >
                        {downloadingReportId === it.report_id ? (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="animate-spin">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
                          </svg>
                        ) : (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        )}
                      </button>
                    )}
                  </span>
                ))}
              </div>

              <p className="text-xs text-gray-700 bg-white border border-gray-100 rounded-lg px-2.5 py-1.5">{req.reason}</p>

              {req.status !== 'pending' && (
                <div className="text-[11px] text-gray-500 flex flex-col gap-0.5">
                  <span>{STATUS_LABEL[req.status]} by <span className="font-semibold text-gray-700">{req.reviewed_by || '-'}</span> · {fmtDate(req.reviewed_at)}</span>
                  {req.review_note && (
                    <span className="text-gray-600 bg-white border border-gray-100 rounded-lg px-2.5 py-1.5 mt-0.5">{req.review_note}</span>
                  )}
                </div>
              )}

              {req.status === 'pending' && (rejectingId === req.id ? (
                <div className="flex flex-col gap-1.5">
                  <textarea
                    rows={2} value={note} onChange={e => { setNote(e.target.value); setError(null) }}
                    placeholder="Why is this rework request being rejected?"
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 resize-none focus:outline-none focus:border-gray-900"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => { setRejectingId(null); setNote(''); setError(null) }} disabled={busyId === req.id}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors cursor-pointer disabled:opacity-40">
                      Cancel
                    </button>
                    <button type="button" onClick={() => confirmReject(req)} disabled={busyId === req.id}
                      className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors cursor-pointer">
                      {busyId === req.id ? 'Saving…' : 'Confirm reject'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-2">
                  <button type="button" disabled={busyId === req.id} onClick={() => { setRejectingId(req.id); setNote(''); setError(null) }}
                    className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors cursor-pointer">
                    Reject
                  </button>
                  <button type="button" disabled={busyId === req.id} onClick={() => approve(req)}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer">
                    {busyId === req.id ? 'Saving…' : 'Approve'}
                  </button>
                </div>
              ))}
            </div>
          ))}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-xs text-red-600">{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
