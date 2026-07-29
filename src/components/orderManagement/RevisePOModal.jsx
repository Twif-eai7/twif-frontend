import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { usePOActions } from '../../hooks/usePOActions'
import { FALLBACK_RATES, convertToUSD, fetchLiveRates } from '../../utils/formatters'

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

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{children}</p>
  )
}

function FileZone({ file, onFile, onClear, label }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const formatSize = (bytes) => {
    if (!bytes) return ''
    const kb = bytes / 1024
    return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
  }

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) onFile(f)
  }

  if (file) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500 flex-shrink-0">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="text-xs font-medium text-gray-800 flex-1 truncate">{file.name}</span>
        <span className="text-xs text-gray-400 flex-shrink-0">{formatSize(file.size)}</span>
        <button type="button" onClick={onClear}
          className="ml-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
      className={`flex flex-col items-center justify-center gap-2 px-4 py-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors
        ${dragging ? 'border-gray-900 bg-gray-50' : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-white'}`}>
      <input ref={inputRef} type="file" className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx"
        onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]) }} />
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-gray-400">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <span className="text-sm font-medium text-gray-600">{label ?? 'Click to upload or drag and drop'}</span>
      <span className="text-xs text-gray-400">PDF, DOC, DOCX, XLS, XLSX · max 10 MB</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RevisePOModal({ po, onClose, onSuccess }) {
  const { revisePO } = usePOActions()

  const [poDate,    setPoDate]    = useState('')
  const [poNumber,  setPoNumber]  = useState('')
  const [quantity,  setQuantity]  = useState('')
  const [amount,    setAmount]    = useState('')
  const [currency,  setCurrency]  = useState('USD')
  const [piDate,    setPiDate]    = useState('')
  const [exFactory, setExFactory] = useState('')
  const [poFile,            setPoFile]            = useState(null)
  const [piFile,            setPiFile]            = useState(null)
  const [productDetailsFile, setProductDetailsFile] = useState(null)

  const [rates,  setRates]  = useState(FALLBACK_RATES)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    if (!po) return
    setPoDate(po.po_received_date ?? '')
    setPoNumber(po.po_number ?? '')
    setQuantity(po.quantity_ordered != null ? String(po.quantity_ordered) : '')
    setAmount(po.amount != null ? String(po.amount) : '')
    setCurrency(po.currency ?? 'USD')
    setPiDate(po.pi_received_date ?? '')
    setExFactory(po.ex_factory_date ?? '')
    setPoFile(null)
    setPiFile(null)
    setProductDetailsFile(null)
    setError('')
    fetchLiveRates().then(setRates)
  }, [po?.id])

  if (!po) return null

  const canSubmit = poFile && piFile && !saving

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      await revisePO(po.id, {
        poReceivedDate: poDate,
        poNumber,
        currency,
        quantity,
        value:     amount,
        amountUsd: convertToUSD(parseFloat(amount), currency, rates),
        piReceivedDate: piDate,
        exFactoryDate:  exFactory,
        poFile,
        piFile,
        productDetailsFile: productDetailsFile || null,
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save revision. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[110] bg-black/40" onClick={!saving ? onClose : undefined} />

      {/* Modal card */}
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col pointer-events-auto">

          {/* Header */}
          <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 flex-shrink-0
            bg-gradient-to-r from-gray-50 to-white rounded-t-2xl">
            <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center text-white flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900">Revise Confirmed PO</h2>
              <p className="text-xs text-gray-500 mt-0.5">Update PO or PI details after confirmation — all changes are versioned</p>
            </div>
            <button type="button" onClick={!saving ? onClose : undefined}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-black transition-colors flex-shrink-0 cursor-pointer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Warning banner */}
          <div className="flex items-center gap-2 px-6 py-2.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-800 flex-shrink-0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Both PO and PI documents are required for revision. All changes are versioned.
          </div>

          {/* Scrollable form body */}
          <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">

            {/* ── PO Details ── */}
            <SectionLabel>PO Details</SectionLabel>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Buyer">
                <div className={`${inputCls} bg-gray-50 cursor-not-allowed text-gray-500`}>{po.buyer_name || '—'}</div>
              </Field>
              <Field label="Supplier">
                <div className={`${inputCls} bg-gray-50 cursor-not-allowed text-gray-500`}>{po.supplier_name || '—'}</div>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="PO Received Date">
                <input type="date" value={poDate} onChange={e => setPoDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="PO Number">
                <input type="text" value={poNumber} onChange={e => setPoNumber(e.target.value)}
                  placeholder="Enter PO number" className={inputCls} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Quantity">
                <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)}
                  placeholder="e.g. 500" className={inputCls} />
              </Field>
              <Field label="Value">
                <div className="flex gap-2">
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="0.00" step="0.01" className={`${inputCls} flex-1`} />
                  <div className="relative flex-shrink-0">
                    <select value={currency} onChange={e => setCurrency(e.target.value)}
                      className={`${inputCls} w-24 appearance-none pr-7`}>
                      <option>USD</option><option>EUR</option><option>GBP</option><option>INR</option>
                    </select>
                    <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                  </div>
                </div>
                {currency !== 'USD' && amount && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    ≈ ${convertToUSD(parseFloat(amount) || 0, currency, rates).toLocaleString()} USD
                  </p>
                )}
              </Field>
            </div>

            <Field label="PO Document" required>
              <FileZone file={poFile} onFile={setPoFile} onClear={() => setPoFile(null)} label="Upload revised PO document" />
            </Field>

            <div className="border-t border-dashed border-gray-200" />

            {/* ── PI Details ── */}
            <SectionLabel>PI Details</SectionLabel>

            <div className="grid grid-cols-2 gap-4">
              <Field label="PI Received Date">
                <input type="date" value={piDate} onChange={e => setPiDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Ex-Factory Date">
                <input type="date" value={exFactory} onChange={e => setExFactory(e.target.value)} className={inputCls} />
              </Field>
            </div>

            <Field label="PI Document" required>
              <FileZone file={piFile} onFile={setPiFile} onClear={() => setPiFile(null)} label="Upload revised PI document" />
            </Field>

            <Field label="Product Details" optional>
              <FileZone file={productDetailsFile} onFile={setProductDetailsFile} onClear={() => setProductDetailsFile(null)} label="Upload product details document" />
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
              Discard
            </button>
            <button type="submit" form="" disabled={!canSubmit} onClick={handleSubmit}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {saving
                ? <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
              }
              {saving ? 'Saving…' : 'Save Revision'}
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body
  )
}
