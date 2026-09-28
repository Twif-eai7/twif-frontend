import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { useRole, useProfileStore } from '../../../stores/profileStore'
import { Spinner } from '../../../components/ui/Spinner'

const BASE = import.meta.env.VITE_BACKEND_URL

const DocIcon = () => (
  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
)

const DownloadIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2v8M4.5 7 8 10.5 11.5 7M3 13h10" />
  </svg>
)

export default function SignedAgreementSection() {
  const role = useRole()
  const { session } = useAuth()
  const orgName = useProfileStore((s) => s.orgMembership?.orgDisplayName) || 'organisation'

  const [url, setUrl] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const urlRef = useRef(null)

  useEffect(() => {
    const token = session?.access_token
    if (!token) return
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`${BASE}/org-customers/my-nda`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.error || 'Failed to load your agreement')
        }
        return res.blob()
      })
      .then((blob) => {
        if (cancelled) return
        const u = URL.createObjectURL(blob)
        urlRef.current = u
        setUrl(u)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [session])

  function handleDownload() {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `${orgName.replace(/[^\w.\- ]+/g, '').trim() || 'organisation'} - NDA.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // Suppliers only. `role` is briefly null while the profile loads.
  if (role && role !== 'Supplier') return <Navigate to="/dashboard" replace />

  return (
    <div className="space-y-4 mt-10">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center flex-shrink-0">
            <DocIcon />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">Signed Agreement</h2>
            <p className="text-xs text-slate-400 mt-0.5">Your non-disclosure agreement with Twif Technologies</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!url}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-40"
        >
          <DownloadIcon />
          Download
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center gap-3 py-24 text-slate-400 text-sm">
            <Spinner light={false} size="w-5 h-5" /> Loading your agreement…
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-col items-center py-24 gap-2 text-center px-6">
            <p className="text-sm text-red-500 font-medium">{error}</p>
            <p className="text-xs text-slate-400">If this seems wrong, contact your Twif merchandiser.</p>
          </div>
        )}
        {!loading && !error && url && (
          <iframe
            src={`${url}#toolbar=0&navpanes=0&scrollbar=0`}
            title="Signed agreement"
            className="w-full min-h-[80vh] border-0"
          />
        )}
      </div>
    </div>
  )
}
