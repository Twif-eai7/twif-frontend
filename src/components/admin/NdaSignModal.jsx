import { useEffect, useState } from 'react'
import SignaturePad from '../shared/SignaturePad'
import { MODE_TO_STORAGE, STORAGE_TO_MODE } from '../../lib/signatureMode'
import { Spinner } from '../ui/Spinner'

const BASE = import.meta.env.VITE_BACKEND_URL

/**
 * Countersignature capture for a single approval — deliberately not tied to
 * the signing admin's saved default. Prefills from their own Signature
 * Settings as a convenience starting point, but whatever's submitted here is
 * what gets embedded in this specific org's executed NDA.
 */
export function NdaSignModal({ orgName, session, onSubmit, onCancel, submitting, error }) {
  const [signatoryName, setSignatoryName] = useState('')
  const [designation, setDesignation] = useState('')
  const [mode, setMode] = useState('type')
  const [typedValue, setTypedValue] = useState('')
  const [imageValue, setImageValue] = useState('')
  const [loadingDefault, setLoadingDefault] = useState(true)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (!session) return
    fetch(`${BASE}/org-customers/admin-signature`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setSignatoryName(d.data.full_name || '')
          setDesignation(d.data.designation || '')
          setMode(STORAGE_TO_MODE[d.data.signature_type] || 'type')
          if (d.data.signature_type === 'typed') setTypedValue(d.data.full_name || '')
          else setImageValue(d.data.signature_image || '')
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDefault(false))
  }, [session])

  function handleSubmit() {
    if (!signatoryName.trim()) return setLocalError('Signatory name is required')
    if (mode === 'type' && !typedValue.trim()) return setLocalError('Please type your signature')
    if ((mode === 'draw' || mode === 'upload') && !imageValue) {
      return setLocalError(mode === 'draw' ? 'Please draw your signature' : 'Please upload your signature')
    }
    setLocalError('')
    onSubmit({
      signatory_name: signatoryName,
      designation,
      signature_type: MODE_TO_STORAGE[mode],
      ...(mode === 'type' ? { signature_name: typedValue } : { signature_image: imageValue }),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-medium text-stone-900 mb-1">Countersign — {orgName}</h3>
        <p className="text-sm text-stone-500 mb-4">This signature will be embedded in the executed NDA sent to both parties.</p>

        {(localError || error) && (
          <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {localError || error}
          </div>
        )}

        {loadingDefault ? (
          <div className="flex justify-center py-8"><Spinner light={false} size="w-5 h-5" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1.5">
                  Signatory name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text" value={signatoryName} onChange={e => setSignatoryName(e.target.value)}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1.5">Designation</label>
                <input
                  type="text" value={designation} onChange={e => setDesignation(e.target.value)}
                  placeholder="e.g. COO"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
            </div>

            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              Signature <span className="text-red-500">*</span>
            </label>
            <SignaturePad
              mode={mode} onModeChange={setMode}
              typedValue={typedValue} onTypedChange={setTypedValue}
              imageValue={imageValue} onImageChange={setImageValue}
              typedPlaceholder="Full name as it should appear"
            />
          </>
        )}

        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-stone-600 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || loadingDefault}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-stone-900 rounded-lg hover:bg-stone-800 transition-colors disabled:opacity-50"
          >
            {submitting && <Spinner size="w-3 h-3" light />}
            Sign
          </button>
        </div>
      </div>
    </div>
  )
}
