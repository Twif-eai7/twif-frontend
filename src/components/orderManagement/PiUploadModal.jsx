import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { usePOActions } from '../../hooks/usePOActions'
import { FALLBACK_RATES, convertToUSD, fetchLiveRates } from '../../utils/formatters'

// File drop-zone
function FileZone({ file, onFile, onClear }) {
  const inputRef = useRef(null)
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

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false)
    pick(e.dataTransfer.files?.[0])
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
          className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 transition-colors flex-shrink-0 ml-3">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-2.5 px-6 py-5 sm:py-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors
        ${dragging ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-gray-50 hover:border-gray-400 hover:bg-white'}`}>
      <input ref={inputRef} type="file" className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx"
        onChange={e => pick(e.target.files?.[0])} />
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <div className="text-center">
        <p className="text-xs font-semibold text-gray-700">Click to upload or drag and drop</p>
        <p className="text-[11px] text-gray-400 mt-0.5">PDF, DOC, DOCX, XLS, XLSX · Max 10 MB</p>
      </div>
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-colors placeholder:text-gray-400'
const labelCls = 'block text-xs font-semibold text-gray-700 mb-1.5'

function Field({ label, required, optional, children }) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {optional && <span className="text-gray-400 font-normal ml-1">(optional)</span>}
      </label>
      {children}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PiUploadModal({ po, onClose, onSuccess }) {
  const { uploadPI } = usePOActions()

  const [piReceivedDate, setPiReceivedDate] = useState('')
  const [exFactoryDate,  setExFactoryDate]  = useState('')
  const [quantity,       setQuantity]       = useState('')
  const [value,          setValue]          = useState('')
  const [currency,       setCurrency]       = useState('USD')
  const [file,           setFile]           = useState(null)
  const [detailsFile,    setDetailsFile]    = useState(null)
  const [rates,          setRates]          = useState(FALLBACK_RATES)
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')

  useEffect(() => {
    if (!po) return
    setPiReceivedDate('')
    setExFactoryDate(po.ex_factory_date ?? '')
    setQuantity('')
    setValue('')
    setCurrency('USD')
    setFile(null)
    setDetailsFile(null)
    setError('')
    fetchLiveRates().then(setRates)
  }, [po?.id])

  if (!po) return null

  const canSubmit = piReceivedDate && exFactoryDate && file && !saving

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      const payload = { piReceivedDate, exFactoryDate, file }
      if (detailsFile) payload.productDetailsFile = detailsFile
      if (quantity) payload.quantity = parseInt(quantity, 10)
      if (value)    { payload.value = value; payload.currency = currency; payload.amountUsd = convertToUSD(parseFloat(value), currency, rates) }
      await uploadPI(po.id, payload)
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[110] bg-black/40" />

      {/* Modal card */}
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col pointer-events-auto">

          {/* Header */}
          <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 flex-shrink-0
            bg-gradient-to-r from-gray-50 to-white rounded-t-2xl">
            <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center text-white flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900">Daily PI Record</h2>
              <p className="text-xs text-gray-500 mt-0.5">Upload proforma invoice documentation</p>
            </div>
            <button type="button" onClick={!saving ? onClose : undefined}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-black transition-colors flex-shrink-0 cursor-pointer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Scrollable form body */}
          <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">

            {/* Read-only context */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Buyer">
                <div className={`${inputCls} bg-gray-50 cursor-not-allowed text-gray-500`}>{po.buyer_name || '—'}</div>
              </Field>
              <Field label="PO Received Date">
                <div className={`${inputCls} bg-gray-50 cursor-not-allowed text-gray-500`}>{po.po_received_date || '—'}</div>
              </Field>
            </div>
            <Field label="PO Number">
              <div className={`${inputCls} bg-gray-50 cursor-not-allowed text-gray-500`}>{po.po_number || '—'}</div>
            </Field>

            {/* Editable dates */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="PI Received Date" required>
                <input type="date" value={piReceivedDate} onChange={e => setPiReceivedDate(e.target.value)}
                  required className={inputCls} />
              </Field>
              <Field label="Ex-Factory Date" required>
                <input type="date" value={exFactoryDate} onChange={e => setExFactoryDate(e.target.value)}
                  required className={inputCls} />
              </Field>
            </div>

            {/* Optional quantity + value */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Quantity" optional>
                <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)}
                  placeholder="e.g. 500" min="1" className={inputCls} />
              </Field>
              <Field label="Value" optional>
                <div className="flex gap-2">
                  <input type="number" value={value} onChange={e => setValue(e.target.value)}
                    placeholder="0.00" min="0" step="0.01" className={`${inputCls} flex-1`} />
                  <div className="relative flex-shrink-0">
                    <select value={currency} onChange={e => setCurrency(e.target.value)}
                      className={`${inputCls} w-24 appearance-none pr-7`}>
                      <option>USD</option><option>EUR</option><option>GBP</option><option>INR</option>
                    </select>
                    <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                  </div>
                </div>
                {currency !== 'USD' && value && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    ≈ ${convertToUSD(parseFloat(value) || 0, currency, rates).toLocaleString()} USD
                  </p>
                )}
              </Field>
            </div>

            {/* File */}
            <Field label="PI Document" required>
              <FileZone file={file} onFile={setFile} onClear={() => setFile(null)} />
            </Field>

            {/* Product Details (optional) */}
            <Field label="Product Details" optional>
              <FileZone file={detailsFile} onFile={setDetailsFile} onClear={() => setDetailsFile(null)} />
            </Field>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}
          </form>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-gray-100 flex-shrink-0">
            <button type="button" onClick={onClose} disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              Cancel
            </button>
            <button type="submit" form="" disabled={!canSubmit} onClick={handleSubmit}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {saving
                ? <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
              }
              {saving ? 'Uploading…' : 'Submit PI Record'}
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body
  )
}
