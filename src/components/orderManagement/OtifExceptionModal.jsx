import { useState, useRef, useEffect } from 'react'

const MAX_COMMENT = 500

function ImageZone({ file, onFile, onClear }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState(null)

  const pick = (f) => {
    if (!f) return
    const ok = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(f.type) || /\.(jpe?g|png|gif|webp)$/i.test(f.name)
    if (!ok) { alert('Allowed image types: JPG, PNG, GIF, WEBP'); return }
    if (f.size > 10 * 1024 * 1024) { alert('Max file size: 10 MB'); return }
    setPreview(URL.createObjectURL(f))
    onFile(f)
  }

  const handleClear = () => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    onClear()
    if (inputRef.current) inputRef.current.value = ''
  }

  const onDrop = (e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]) }

  useEffect(() => {
    const handlePaste = (e) => {
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'))
      if (item) pick(item.getAsFile())
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [])

  if (file && preview) {
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
        <img src={preview} alt="Proof" className="w-full max-h-28 object-contain" />
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-100 bg-white">
          <span className="text-[11px] text-gray-600 truncate max-w-[200px]">{file.name}</span>
          <button type="button" onClick={handleClear}
            className="text-[11px] text-red-500 hover:text-red-700 transition-colors ml-2 flex-shrink-0 cursor-pointer">
            Remove
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors
        ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-gray-400 hover:bg-white'}`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" className="flex-shrink-0">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
      <div>
        <p className="text-xs text-gray-500">
          Drop, paste, or <span className="text-blue-600 font-medium">browse</span>
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">JPG, PNG, GIF, WEBP · max 10 MB · Ctrl+V to paste</p>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden"
        onChange={e => pick(e.target.files?.[0])} />
    </div>
  )
}

const OTIF_REASONS = [
  'Transport or logistics disruptions',
  'Port congestion or vessel delays',
  'Geopolitical situations',
  'Buyer pushed back',
  'Natural calamities',
  'Strikes or other force majeure events',
  'Other (please specify in comment)'
]

export default function OtifExceptionModal({ po, onClose, onSubmit }) {
  const [reason, setReason]                      = useState('')
  const [comment, setComment]                    = useState('')
  const [proofImage, setProofImage]              = useState(null)
  const [proposedExFactoryDate, setProposedDate] = useState('')
  const [loading, setLoading]                    = useState(false)
  const [error, setError]                        = useState('')

  if (!po) return null

  const handleSubmit = async () => {
    if (!proposedExFactoryDate) { setError('Please enter the proposed ex-factory date.'); return }
    if (!reason)                { setError('Please select a reason.'); return }
    if (!proofImage)            { setError('Please attach a proof image.'); return }
    if (!comment.trim())        { setError('Please enter a comment.'); return }
    setLoading(true)
    setError('')
    try {
      await onSubmit({ reason, comment: comment.trim(), proofImage, proposedExFactoryDate })
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to submit exception report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={loading ? undefined : onClose} />

      {/* max-h caps total height; body scrolls independently */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">

        {/* Header — fixed, never scrolls */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <span className="text-sm font-bold text-gray-900">Report OTIF Exception</span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5 ml-7">
              PO#{po.po_number} · {po.buyer_name}
            </div>
          </div>
          <button type="button" onClick={loading ? undefined : onClose} disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer disabled:opacity-40">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="px-4 py-3 flex flex-col gap-3 overflow-y-auto">

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="flex-shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-xs text-red-600">{error}</span>
            </div>
          )}

          {/* Reason */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              Reason <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <select value={reason} onChange={e => { setReason(e.target.value); setError('') }}
                className="w-full pl-2.5 pr-8 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 appearance-none bg-white focus:outline-none focus:border-gray-900 cursor-pointer">
                <option value="">Select a reason…</option>
                {OTIF_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 stroke-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
            </div>
          </div>

          {/* Current → proposed date */}
          <div className="flex items-end gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Current Ex-Factory</label>
              <div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500">
                {po.ex_factory_date || '—'}
              </div>
            </div>
            <svg className="w-3 h-3 text-gray-400 flex-shrink-0 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                Revised Date <span className="text-red-400">*</span>
              </label>
              <input type="date" value={proposedExFactoryDate}
                onChange={e => { setProposedDate(e.target.value); setError('') }}
                className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900" />
            </div>
          </div>

          {/* Proof image */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              Proof <span className="text-red-400">*</span>
            </label>
            <ImageZone file={proofImage} onFile={setProofImage} onClear={() => setProofImage(null)} />
          </div>

          {/* Comment */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              Comment <span className="text-red-400">*</span>
            </label>
            <textarea rows={2} maxLength={MAX_COMMENT} value={comment}
              onChange={e => { setComment(e.target.value); setError('') }}
              placeholder="Describe the OTIF exception…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 resize-none focus:outline-none focus:border-gray-900" />
            <div className="text-[10px] text-gray-400 text-right">{comment.length}/{MAX_COMMENT}</div>
          </div>
        </div>

        {/* Footer — fixed, never scrolls */}
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-gray-100 flex-shrink-0">
          <button type="button" onClick={loading ? undefined : onClose} disabled={loading}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors cursor-pointer disabled:opacity-40">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50 transition-colors cursor-pointer">
            {loading
              ? <><svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>Submitting…</>
              : 'Submit Exception'}
          </button>
        </div>

      </div>
    </div>
  )
}
