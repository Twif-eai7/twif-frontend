import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useMemberId } from '../stores/profileStore'
import { useProfileStore } from '../stores/profileStore'

const API = import.meta.env.VITE_BACKEND_URL

const STATE = { idle: 'idle', loading: 'loading', success: 'success', error: 'error' }

export default function PLMAccessPage() {
  const [params]    = useSearchParams()
  const navigate    = useNavigate()
  const session     = useAuthStore(s => s.session)
  const authLoading = useAuthStore(s => s.loading)
  const profileFetched = useProfileStore(s => s.profileFetched)
  const memberId    = useMemberId()

  const [status,  setStatus]  = useState(STATE.idle)
  const [message, setMessage] = useState('')

  const token = params.get('token')

  useEffect(() => {
    // Wait for auth + profile to settle
    if (authLoading || (session && !profileFetched)) return
    if (!session || !token) return
    if (status !== STATE.idle) return

    // Profile loaded but no org membership yet — onboarding incomplete
    if (profileFetched && !memberId) {
      setStatus(STATE.error)
      setMessage('Please complete your account setup before accepting this invite.')
      return
    }

    setStatus(STATE.loading)

    fetch(`${API}/plm/workspace-invites/accept`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ token, memberId }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setStatus(STATE.error)
          setMessage(data.error)
          const dest = data.workspaceIds?.length
            ? '/plm'
            : data.workspaceId ? `/plm?workspace=${data.workspaceId}` : null
          if (dest) setTimeout(() => navigate(dest), 2000)
          return
        }
        setStatus(STATE.success)
        const dest = data.workspaceIds?.length
          ? '/plm'
          : `/plm?workspace=${data.workspaceId}`
        setTimeout(() => navigate(dest), 1200)
      })
      .catch(() => {
        setStatus(STATE.error)
        setMessage('Something went wrong. Please try the link again.')
      })
  }, [authLoading, session, profileFetched, memberId, token])

  // ── Not logged in ──
  if (!authLoading && !session) {
    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search)
    return (
      <Screen>
        <Logo />
        <div className="text-[15px] font-bold text-[#1A1A18] mb-2">Log in to accept your invite</div>
        <div className="text-[13px] text-black/50 mb-8">You need an account to access this workspace.</div>
        <Link
          to={`/auth?return_url=${returnUrl}`}
          className="inline-block px-6 py-3 bg-[#1A1A18] text-white text-[12px] font-bold uppercase tracking-[.08em] hover:opacity-80 transition-opacity"
        >
          Log in
        </Link>
      </Screen>
    )
  }

  // ── No token ──
  if (!token) {
    return (
      <Screen>
        <Logo />
        <div className="text-[15px] font-bold text-[#1A1A18] mb-2">Invalid invite link</div>
        <div className="text-[13px] text-black/50 mb-8">This link is missing a token. Please check the invite email.</div>
        <Link to="/dashboard" className="text-[12px] font-semibold text-black/40 hover:text-black underline">
          Go to dashboard
        </Link>
      </Screen>
    )
  }

  // ── Loading ──
  if (status === STATE.idle || status === STATE.loading) {
    return (
      <Screen>
        <Logo />
        <div className="flex items-center gap-2.5 mb-3">
          <span className="inline-block w-4 h-4 border-[1.5px] border-black/15 border-t-[#1A1A18] rounded-full animate-spin" />
          <span className="text-[14px] font-semibold text-[#1A1A18]">Accepting invite…</span>
        </div>
        <div className="text-[12px] text-black/40">This will only take a moment</div>
      </Screen>
    )
  }

  // ── Success ──
  if (status === STATE.success) {
    return (
      <Screen>
        <Logo />
        <div className="w-10 h-10 rounded-full bg-[#E6F2DC] flex items-center justify-center mb-5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D6A1F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div className="text-[15px] font-bold text-[#1A1A18] mb-2">Invite accepted!</div>
        <div className="text-[12px] text-black/45">Opening your workspaces…</div>
      </Screen>
    )
  }

  // ── Error ──
  return (
    <Screen>
      <Logo />
      <div className="w-10 h-10 rounded-full bg-[#FCEAEA] flex items-center justify-center mb-5">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7A1A1A" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </div>
      <div className="text-[15px] font-bold text-[#1A1A18] mb-2">Invite issue</div>
      <div className="text-[13px] text-black/50 mb-8 text-center max-w-xs leading-relaxed">{message}</div>
      <Link to="/dashboard" className="text-[12px] font-semibold text-black/40 hover:text-black underline">
        Go to dashboard
      </Link>
    </Screen>
  )
}

function Screen({ children }) {
  return (
    <div className="min-h-screen bg-[#F5F3EF] flex flex-col items-center justify-center px-4">
      <div className="bg-white border border-black/[.08] px-10 py-12 flex flex-col items-center text-center w-full max-w-sm">
        {children}
      </div>
    </div>
  )
}

function Logo() {
  return (
    <div className="mb-8">
      <div className="text-[28px] font-black uppercase tracking-tight text-[#1A1A18] leading-none">Pd-PLM</div>
      <div className="text-[9px] font-bold uppercase tracking-[.12em] text-black/35 mt-1">Workspace Invite</div>
    </div>
  )
}
