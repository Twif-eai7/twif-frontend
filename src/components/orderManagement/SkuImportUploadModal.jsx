import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useProfileStore } from '../../stores/profileStore'
import { useSkuImport } from '../../hooks/useSkuImport'
import PoSearchField from './PoSearchField'

const labelCls = 'block text-xs font-semibold text-gray-700 mb-1.5'

function Field({ label, required, children }) {
  return (
    <div>
      <label className={labelCls}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function FileZone({ file, onFile, onClear }) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept=".xlsx,.xls"
        className="hidden" onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]) }} />

      {!file && (
        <div
          onClick={() => inputRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-2 px-4 py-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors
            ${drag ? 'border-gray-900 bg-gray-50' : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-white'}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-gray-400">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span className="text-sm font-medium text-gray-600">Click to upload or drag and drop</span>
          <span className="text-xs text-gray-400">XLSX, XLS · max 20 MB</span>
        </div>
      )}

      {file && (
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500 flex-shrink-0">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="text-xs font-medium text-gray-800 flex-1 truncate">{file.name}</span>
          <span className="text-xs text-gray-400 flex-shrink-0">{formatFileSize(file.size)}</span>
          <button type="button" onClick={onClear}
            className="ml-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
// PO-first (see PoSearchField.jsx) — SKUs are only ever created for an
// existing PO, so buyer/vendor are derived from the chosen PO rather than a
// manual cascade. Upload is two steps: the backend (POST /skus/import) only
// parses the sheet and returns rows — createBatch() then persists that
// parsed batch into sku_import_batches/rows so the review can survive a
// reload (see sql/sku_import.sql).
export default function SkuImportUploadModal({ open, onClose, onUploaded, prefill }) {
  const { orgMembership } = useProfileStore()
  const memberId = orgMembership?.memberId
  const { importSkuSheet, createBatch } = useSkuImport()

  const [selectedPo, setSelectedPo] = useState(null)
  const [file, setFile]             = useState(null)

  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState(null)
  const [fetchingFile, setFetchingFile] = useState(false)
  const [fetchFileError, setFetchFileError] = useState(null)

  const po = prefill
    ? { id: prefill.poId, poNumber: prefill.poNumber, buyerOrgId: prefill.buyerOrgId, buyerName: prefill.buyerName, vendorId: prefill.vendorId, vendorName: prefill.vendorName }
    : selectedPo

  // Prefilled path: auto-fetch the PO's already-uploaded product details
  // file so the merchant isn't re-uploading the same document they just
  // attached to the PI. Buyer/vendor/PO come from `prefill` directly above.
  useEffect(() => {
    if (!open || !prefill?.fileUrl) return
    setFetchingFile(true)
    setFetchFileError(null)
    fetch(prefill.fileUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.blob()
      })
      .then(blob => {
        const tail = prefill.fileUrl.split('/').pop().split('?')[0]
        const name = decodeURIComponent(tail || 'product-details')
        setFile(new File([blob], name, { type: blob.type || 'application/octet-stream' }))
      })
      .catch(err => setFetchFileError(`Could not auto-load the attached file (${err.message}) — please attach it manually.`))
      .finally(() => setFetchingFile(false))
  }, [open, prefill])

  useEffect(() => {
    if (!open) {
      setSelectedPo(null); setFile(null)
      setError(null); setSubmitting(false)
      setFetchingFile(false); setFetchFileError(null)
    }
  }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!po?.buyerOrgId || !po?.vendorId || !file) return
    setError(null)
    setSubmitting(true)
    try {
      const parsed = await importSkuSheet({ file, vendorId: po.vendorId, buyerOrgId: po.buyerOrgId })

      const { batch, rows } = await createBatch({
        buyerOrgId: po.buyerOrgId,
        vendorId:   po.vendorId,
        poId:       po.id,
        fileName:   file.name,
        sheetUsed:  parsed.sheet_used,
        uploadedBy: memberId,
        rows: parsed.rows || [],
      })

      onUploaded({
        batchId:    batch.id,
        sheetUsed:  batch.sheet_used,
        fileName:   batch.file_name,
        buyerOrgId: po.buyerOrgId,
        buyerName:  po.buyerName,
        vendorId:   po.vendorId,
        vendorName: po.vendorName,
        poId:       po.id,
        poNumber:   po.poNumber,
        rows: rows.map(r => ({
          rowId:        r.id,
          status:       r.status,
          confirmed:    r.confirmed,
          needsConfirm: r.needs_confirm,
          needsInput:   r.needs_input,
          skuId:        r.sku_id,
        })),
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
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col pointer-events-auto">

          <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 flex-shrink-0
            bg-gradient-to-r from-gray-50 to-white rounded-t-2xl">
            <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center text-white flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900">Upload Product Sheet</h2>
              <p className="text-xs text-gray-500 mt-0.5">Import production SKUs from a vendor's Excel sheet</p>
            </div>
            <button type="button" onClick={!submitting ? onClose : undefined}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-black transition-colors flex-shrink-0 cursor-pointer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">

            <PoSearchField value={po} onChange={setSelectedPo} locked={!!prefill} />

            {po && (
              <Field label="Buyer → Vendor">
                <div className="text-sm text-gray-700">{po.buyerName || '—'} → {po.vendorName || '—'}</div>
              </Field>
            )}

            <Field label="Product Sheet" required>
              {fetchingFile ? (
                <div className="flex items-center gap-2.5 px-4 py-8 border-2 border-dashed border-gray-200 rounded-xl justify-center text-sm text-gray-500">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  Fetching product details file from the PO…
                </div>
              ) : (
                <FileZone file={file} onFile={setFile} onClear={() => setFile(null)} />
              )}
              {fetchFileError && (
                <p className="text-[11px] text-amber-600 mt-1.5">{fetchFileError}</p>
              )}
            </Field>

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
            <button type="submit" onClick={handleSubmit} disabled={submitting || fetchingFile || !po?.buyerOrgId || !po?.vendorId || !file}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {submitting && <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>}
              {submitting ? 'Parsing & saving…' : 'Upload & Parse'}
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body
  )
}
