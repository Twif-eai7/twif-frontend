import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useProfileStore } from '../../stores/profileStore'
import { useSkuImport } from '../../hooks/useSkuImport'
import PoSearchField from './PoSearchField'

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

// PO-first, no file — the "Create SKUs" entry point for the (common in
// practice) case where there's no vendor sheet to parse from. SKUs are only
// ever created for an existing PO, so buyer/vendor are derived from the
// chosen PO rather than picked independently (see PoSearchField.jsx).
// Creates an empty batch + one blank row, then hands off straight into the
// review drawer via onCreated. `prefill` (PO already known from a PO drawer
// entry point) locks the PO field instead of requiring a search — same
// treatment SkuImportUploadModal gives it.
export default function SkuCreateModal({ open, onClose, onCreated, prefill }) {
  const { orgMembership } = useProfileStore()
  const memberId = orgMembership?.memberId
  const { createManualBatch, addManualRow } = useSkuImport()

  const [selectedPo, setSelectedPo] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState(null)

  useEffect(() => {
    if (!open) { setSelectedPo(null); setError(null); setSubmitting(false) }
  }, [open])

  const po = prefill
    ? { id: prefill.poId, poNumber: prefill.poNumber, buyerOrgId: prefill.buyerOrgId, buyerName: prefill.buyerName, vendorId: prefill.vendorId, vendorName: prefill.vendorName }
    : selectedPo

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting || !po?.buyerOrgId || !po?.vendorId) return
    setError(null)
    setSubmitting(true)
    try {
      const batch = await createManualBatch({ buyerOrgId: po.buyerOrgId, vendorId: po.vendorId, poId: po.id, uploadedBy: memberId })
      const row   = await addManualRow(batch.id, 0)

      onCreated({
        batchId:    batch.id,
        sheetUsed:  null,
        fileName:   null,
        buyerOrgId: po.buyerOrgId,
        buyerName:  po.buyerName,
        vendorId:   po.vendorId,
        vendorName: po.vendorName,
        poId:       po.id,
        poNumber:   po.poNumber,
        rows: [{
          rowId:        row.id,
          status:       row.status,
          confirmed:    row.confirmed,
          needsConfirm: row.needs_confirm,
          needsInput:   row.needs_input,
        }],
      })
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[110] bg-black/40" />
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col pointer-events-auto">

          <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 flex-shrink-0
            bg-gradient-to-r from-gray-50 to-white rounded-t-2xl">
            <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center text-white flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900">Create SKUs</h2>
              <p className="text-xs text-gray-500 mt-0.5">No vendor sheet needed — fill in details yourself</p>
            </div>
            <button type="button" onClick={!submitting ? onClose : undefined}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-black transition-colors flex-shrink-0 cursor-pointer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
            <PoSearchField value={po} onChange={setSelectedPo} locked={!!prefill} />

            {po && (
              <Field label="Buyer → Vendor">
                <div className="text-sm text-gray-700">{po.buyerName || '—'} → {po.vendorName || '—'}</div>
              </Field>
            )}

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}
          </form>

          <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-gray-100 flex-shrink-0">
            <button type="button" onClick={onClose} disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              Cancel
            </button>
            <button type="submit" onClick={handleSubmit} disabled={submitting || !po?.buyerOrgId || !po?.vendorId}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {submitting && <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>}
              {submitting ? 'Creating…' : 'Start Creating SKUs'}
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body
  )
}
