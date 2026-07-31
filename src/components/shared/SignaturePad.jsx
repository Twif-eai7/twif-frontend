import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'

const MODES = [
  { key: 'type', label: 'Type' },
  { key: 'draw', label: 'Draw' },
  { key: 'upload', label: 'Upload' },
]

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 // 2MB

/**
 * Reusable Type / Draw / Upload signature capture — fully controlled, no
 * assumptions about who's signing. Used by both the vendor onboarding NDA
 * step and the Twif admin signature-settings screen.
 */
export default function SignaturePad({
  mode,
  onModeChange,
  typedValue,
  onTypedChange,
  imageValue,
  onImageChange,
  typedPlaceholder = 'Full legal name',
}) {
  const sigRef = useRef(null)
  const [uploadError, setUploadError] = useState('')
  const [drawConfirmed, setDrawConfirmed] = useState(false)

  function switchMode(next) {
    if (next === mode) return
    onModeChange(next)
    setUploadError('')
    // Values from unselected modes are simply ignored by callers when they submit
    // (they scope by the current mode) — no need to clear them here, and clearing
    // would be actively wrong for callers that reuse a value across modes (e.g. the
    // admin signature form binds the typed value to the same "Name" field shown
    // regardless of mode).
  }

  function handleDrawEnd() {
    setDrawConfirmed(false)
    if (!sigRef.current || sigRef.current.isEmpty()) {
      onImageChange('')
      return
    }
    try {
      onImageChange(sigRef.current.getTrimmedCanvas().toDataURL('image/png'))
    } catch {
      // Trimming (whitespace crop) can fail in some environments — fall back
      // to the untrimmed canvas rather than silently losing the signature.
      onImageChange(sigRef.current.getCanvas().toDataURL('image/png'))
    }
  }

  function handleClearDraw() {
    sigRef.current?.clear()
    onImageChange('')
    setDrawConfirmed(false)
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    setUploadError('')

    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload an image file')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('Image must be under 2MB')
      return
    }

    const reader = new FileReader()
    reader.onload = () => onImageChange(reader.result)
    reader.onerror = () => setUploadError('Could not read that file — please try again')
    reader.readAsDataURL(file)
  }

  return (
    <div>
      <div className="flex w-full mb-4">
        {MODES.map(m => (
          <button
            key={m.key}
            type="button"
            onClick={() => switchMode(m.key)}
            className={`
              flex-1 text-center text-xs font-medium pb-1.5 border-b-2 transition-colors duration-150
              ${mode === m.key ? 'border-stone-900 text-stone-900' : 'border-stone-200 text-stone-400 hover:text-stone-600'}
            `}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'type' && (
        <div>
          <input
            type="text"
            placeholder={typedPlaceholder}
            value={typedValue}
            onChange={e => onTypedChange(e.target.value)}
            className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300 mb-2"
          />
          {typedValue.trim() && (
            <div
              className="px-3.5 py-3 border border-stone-200 rounded-xl bg-stone-50 text-stone-900 text-2xl"
              style={{ fontFamily: "'Dancing Script', cursive" }}
            >
              {typedValue}
            </div>
          )}
        </div>
      )}

      {mode === 'draw' && (
        <div>
          <div className="border border-stone-200 rounded-xl bg-white overflow-hidden mb-2">
            <SignatureCanvas
              ref={sigRef}
              penColor="#1c1917"
              canvasProps={{ className: 'w-full', style: { width: '100%', height: 160 } }}
              onEnd={handleDrawEnd}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClearDraw}
              className="text-xs text-stone-500 hover:text-stone-800 transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setDrawConfirmed(true)}
              disabled={!imageValue}
              className="text-xs font-medium text-stone-700 hover:text-stone-900 disabled:text-stone-300 disabled:cursor-not-allowed transition-colors"
            >
              Done
            </button>
            {drawConfirmed && imageValue && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="m2 6 2.5 2.5 5.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Signature saved
              </span>
            )}
          </div>
        </div>
      )}

      {mode === 'upload' && (
        <div>
          <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-stone-300 rounded-xl py-6 cursor-pointer hover:border-stone-400 hover:bg-stone-50 transition-colors">
            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            <span className="text-xs text-stone-500">Click to upload a signature image</span>
            <span className="text-[11px] text-stone-400">PNG or JPG, up to 2MB</span>
          </label>
          {uploadError && <p className="text-xs text-red-600 mt-1.5">{uploadError}</p>}
          {imageValue && (
            <div className="mt-2 flex items-center gap-3 border border-stone-200 rounded-xl p-2.5">
              <img src={imageValue} alt="Uploaded signature" className="h-12 object-contain" />
              <button
                type="button"
                onClick={() => onImageChange('')}
                className="text-xs text-stone-500 hover:text-stone-800 transition-colors ml-auto"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
