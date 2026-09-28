import { useState } from 'react'
import { createInspectionReport, findInspectionReport, updateInspectionReport } from '../../../hooks/useInspectionReports'
import { getStage, STAGE_LABEL } from './stageStatus'
import SignaturePad from '../../shared/SignaturePad'

// Same signer pair InspectionForm.jsx's Sign-off step (step 9) captures per
// report - reused here so one Vendor Rep / QA Auditor signature can be
// applied to every SKU currently in progress at a stage in one action,
// instead of re-entering (or re-drawing) it once per SKU.
const SIGNERS = [
  { key: 'vendor_rep', label: 'Vendor Representative' },
  { key: 'quality_process_auditor', label: 'Quality Process Auditor' },
]

// Runs `fn` over `items` with at most `limit` in flight at once - same
// worker-pool pattern InspectionReportEntry.jsx and exportInspectionReportPdf.js
// already each keep their own copy of, rather than a shared util.
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

// Opened from PoSkuSummary.jsx's per-stage tab bar (Inline/Midline/Final) -
// `stageKey` is whichever tab is active. Every SKU in scope is eligible,
// regardless of whether this stage is scheduled/not-started, in-progress,
// or already submitted/accepted - signing off is deliberately independent
// of stage status. This is safe because it's narrow: the patch sent to
// updateInspectionReport/createInspectionReport only ever carries the two
// signer name/signature fields (see submit() below), never
// status/inspection_result/submitted_at, so signing (or re-signing) can
// never silently start, reopen, or change a report's verdict - strictly
// the signature, nothing else.
// `checkedSkuIds` - the same Overview-table tick-box selection the Accept/
// Export buttons already scope to - narrows this to just the ticked SKUs
// when any are ticked. Real bug found live: this used to always apply to
// every eligible SKU on the whole PO regardless of what was checked, so
// ticking a handful of SKUs and clicking Signoff still silently signed
// every other untouched SKU on the PO too. An empty selection (nothing
// ticked) keeps the original PO-wide behavior - Signoff stays usable as a
// one-click "sign everyone left" action when that's genuinely what's
// wanted, not force a selection first.
export default function BulkSignoffModal({ po, reports, stageKey, userName, checkedSkuIds, onClose, onSaved }) {
  const [signoff, setSignoff] = useState({
    vendor_rep_name: '', vendor_rep_signature: '',
    quality_process_auditor_name: '', quality_process_auditor_signature: '',
  })
  const [sigModes, setSigModes] = useState({ vendor_rep: 'type', quality_process_auditor: 'type' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const stageLabel = STAGE_LABEL[stageKey] || stageKey
  const allLineItems = po.po_line_items ?? []
  const lineItems = checkedSkuIds?.size > 0
    ? allLineItems.filter(li => checkedSkuIds.has(li.id))
    : allLineItems
  const eligible = lineItems.map(li => ({ li, report: getStage(reports, li.id, stageKey) }))

  const anySignerFilled = signoff.vendor_rep_name.trim() || signoff.quality_process_auditor_name.trim()

  const submit = async () => {
    if (!anySignerFilled || eligible.length === 0) return
    setSubmitting(true)
    setError(null)

    // Only a signer that was actually filled in here gets included in the
    // patch - leaving the other signer's key out entirely (not sent as
    // null) so an already-filled individual value on some report (e.g. a
    // QA who'd already signed their own copy before this ran) is never
    // clobbered by a blank bulk value.
    const patch = {}
    if (signoff.vendor_rep_name.trim()) {
      patch.vendor_rep_name = signoff.vendor_rep_name.trim()
      patch.vendor_rep_signature = signoff.vendor_rep_signature || null
    }
    if (signoff.quality_process_auditor_name.trim()) {
      patch.quality_process_auditor_name = signoff.quality_process_auditor_name.trim()
      patch.quality_process_auditor_signature = signoff.quality_process_auditor_signature || null
    }

    // A SKU that hasn't started this stage yet has no report row to update -
    // create one, same create-or-recover pattern InspectionForm.jsx's own
    // persistOrCreate/POQuickSetFields' writeFields already use (a 23505
    // unique-violation means another request created it first; re-find it
    // and update instead of erroring out).
    const results = await mapWithConcurrency(eligible, 5, async ({ li, report }) => {
      if (report) return updateInspectionReport(report.id, patch, userName)
      const created = await createInspectionReport({
        po_line_item_id: li.id, inspection_type: stageKey, round: 1, status: 'draft',
        ...patch, created_by: userName, updated_by: userName,
      })
      if (created.error?.code === '23505') {
        const { data: existing } = await findInspectionReport({ po_line_item_id: li.id, inspection_type: stageKey, round: 1 })
        if (existing) return updateInspectionReport(existing.id, patch, userName)
      }
      return created
    })
    setSubmitting(false)
    const failed = results.filter(r => r.error)
    if (failed.length) { setError(`${failed.length} of ${eligible.length} failed to save. Try again.`); return }
    onSaved?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={submitting ? undefined : onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <span className="text-sm font-bold text-gray-900">Signoff - {stageLabel}</span>
          <button type="button" onClick={submitting ? undefined : onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer disabled:opacity-40"
            disabled={submitting}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div>
            <p className="text-xs text-gray-500">
              Applies to <span className="font-semibold text-gray-800">{eligible.length} SKU{eligible.length === 1 ? '' : 's'}</span>
              {checkedSkuIds?.size > 0 ? ' of your selected SKUs' : ''} at {stageLabel}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {eligible.map(({ li }) => (
                <span key={li.id} className="text-[10px] font-bold text-gray-600 bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5">
                  {li.buyer_sku_ref || li.id}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {SIGNERS.map(({ key, label }) => {
              const nameField = `${key}_name`
              const sigField = `${key}_signature`
              const stored = signoff[sigField] || ''
              const isImage = stored.startsWith('data:')
              return (
                <div key={key}>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</label>
                  <input
                    value={signoff[nameField] || ''}
                    disabled={submitting}
                    placeholder="Name"
                    onChange={e => setSignoff(prev => ({ ...prev, [nameField]: e.target.value }))}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg mb-2 disabled:bg-gray-50 focus:outline-none focus:border-gray-900"
                  />
                  <SignaturePad
                    mode={sigModes[key]}
                    onModeChange={m => setSigModes(prev => ({ ...prev, [key]: m }))}
                    typedValue={isImage ? '' : stored}
                    onTypedChange={v => setSignoff(prev => ({ ...prev, [sigField]: v }))}
                    imageValue={isImage ? stored : ''}
                    onImageChange={v => setSignoff(prev => ({ ...prev, [sigField]: v }))}
                    typedPlaceholder="Full name"
                  />
                </div>
              )
            })}
          </div>

          <p className="text-[11px] text-gray-400">
            This saves the signature onto each SKU's {stageLabel} report only - it never changes status, submission, or Overall Result, whether the report is scheduled, in progress, or already submitted.
          </p>

          {error && <p className="text-[11px] text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
          <button
            type="button" onClick={submit}
            disabled={submitting || !anySignerFilled || eligible.length === 0}
            className="w-full px-4 py-2.5 rounded-lg text-xs font-bold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Saving…' : `Apply to ${eligible.length} SKU${eligible.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
