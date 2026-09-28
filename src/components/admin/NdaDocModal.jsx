import { useEffect, useRef, useState } from 'react'
import { Spinner } from '../ui/Spinner'

const BASE = import.meta.env.VITE_BACKEND_URL

/**
 * Preview a supplier org's NDA / application PDF (generated live from current
 * data) with a Download action. Read-only — no verify/approve side effects.
 */
export function NdaDocModal({ orgId, orgName, accessToken, onClose }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const urlRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${BASE}/org-customers/orgs/${orgId}/nda-preview`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async res => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.error || 'Failed to generate PDF')
        }
        return res.blob()
      })
      .then(blob => {
        if (cancelled) return
        const u = URL.createObjectURL(blob)
        urlRef.current = u
        setUrl(u)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [orgId, accessToken])

  function handleDownload() {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `${(orgName || 'organisation').replace(/[^\w.\- ]+/g, '').trim()} - NDA.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-8">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xl w-full max-w-3xl h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <div>
            <h3 className="text-base font-medium text-stone-900">NDA - {orgName}</h3>
            <p className="text-xs text-stone-500 mt-0.5">Preview of the document before you download it.</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 transition-colors" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="m3 3 10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 bg-stone-100">
          {loading ? (
            <div className="h-full flex items-center justify-center"><Spinner light={false} size="w-6 h-6" /></div>
          ) : error ? (
            <div className="h-full flex items-center justify-center text-sm text-red-600 px-6 text-center">{error}</div>
          ) : (
            <iframe src={url} title="NDA preview" className="w-full h-full border-0" />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-stone-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-stone-600 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors">
            Close
          </button>
          <button
            onClick={handleDownload}
            disabled={loading || !!error}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-stone-900 rounded-lg hover:bg-stone-800 transition-colors disabled:opacity-50"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v8M4.5 7 8 10.5 11.5 7M3 13h10" />
            </svg>
            Download
          </button>
        </div>
      </div>
    </div>
  )
}
