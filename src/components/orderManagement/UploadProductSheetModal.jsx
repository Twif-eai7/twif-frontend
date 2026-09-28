import { useState } from 'react'

// File drop-zone — same accepted types/size limit as PiUploadModal's own
// "Product Details" field (PDF/DOC/DOCX/XLS/XLSX, max 10 MB).
function FileZone({ file, onFile, onClear }) {
  const [dragging, setDragging] = useState(false)

  const formatSize = (bytes) => {
    if (!bytes) return ''
    const kb = bytes / 1024
    return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
  }

  const pick = (f) => {
    if (!f) return
    const ok = ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ].includes(f.type) || /\.(pdf|doc|docx|xls|xlsx)$/i.test(f.name)
    if (!ok) { alert('Allowed: PDF, DOC, DOCX, XLS, XLSX'); return }
    if (f.size > 10 * 1024 * 1024) { alert('Max file size: 10 MB'); return }
    onFile(f)
  }

  if (file) {
    return (
      <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-900 truncate">{file.name}</div>
            <div className="text-[11px] text-gray-500">{formatSize(file.size)}</div>
          </div>
        </div>
        <button type="button" onClick={onClear}
          className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 transition-colors flex-shrink-0 ml-3 cursor-pointer">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <label
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]) }}
      className={`flex flex-col items-center justify-center gap-2 px-4 py-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors
        ${dragging ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-gray-50 hover:border-gray-400 hover:bg-white'}`}>
      <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx"
        onChange={e => pick(e.target.files?.[0])} />
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <div className="text-center">
        <p className="text-xs font-semibold text-gray-700">Click to upload or drag and drop</p>
        <p className="text-[11px] text-gray-400 mt-0.5">PDF, DOC, DOCX, XLS, XLSX · Max 10 MB</p>
      </div>
    </label>
  )
}

// Standalone attach/replace for a PO's product details file — for when it
// wasn't provided during the original PI upload (PiUploadModal's own
// optional "Product Details" field). Uploading here fires the same
// product-details-uploaded webhook as any other change to that column, so
// the SKU review batch still gets created automatically.
export default function UploadProductSheetModal({ po, onClose, onUpload, onSuccess }) {
  const [file, setFile]       = useState(null)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  if (!po) return null

  const handleSubmit = async () => {
    if (!file) { setError('Please attach a file before submitting.'); return }
    setSaving(true)
    setError('')
    try {
      await onUpload(file)
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={!saving ? onClose : undefined} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="text-sm font-bold text-gray-900">Upload Product Sheet</div>
            <div className="text-xs text-gray-500 mt-0.5">
              PO#{po.po_number} · {po.buyer_name}
            </div>
          </div>
          <button type="button" onClick={!saving ? onClose : undefined}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-xs text-red-600">{error}</span>
            </div>
          )}
          <FileZone file={file} onFile={f => { setFile(f); setError('') }} onClear={() => setFile(null)} />
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button type="button" onClick={onClose} disabled={saving}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors cursor-pointer disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-50 transition-colors cursor-pointer">
            {saving ? 'Uploading…' : 'Upload'}
          </button>
        </div>

      </div>
    </div>
  )
}
