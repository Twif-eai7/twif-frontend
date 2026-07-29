import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase, supabaseConfigMessage } from '../../lib/supabase'
import { AuthShell, AuthLogo } from '../../components/auth'
import { OTPInput, Alert, Spinner } from '../../components/ui'
import { useOTPTimer } from '../../hooks/useOtpTimer'
import { usePortalUser } from '../../hooks/usePortalUser'


export default function OTPPage({ forcedRole: routeForcedRole }) {
  const navigate = useNavigate()
  const { state } = useLocation()
  const { email, mode, returnUrl, forcedRole: stateForcedRole } = state || {}
  // Route prop wins — the vendor entrance's dedicated /auth/vendor/verify-otp
  // route always knows its role, regardless of whether state carried it.
  const forcedRole = routeForcedRole || stateForcedRole
  const logoSuffix = forcedRole === 'buyer' ? 'Buyer' : forcedRole === 'supplier' ? 'Vendor' : undefined
  // The dedicated /auth/vendor/verify-otp route drops "Portal" for a shorter header.
  const logoLabel = forcedRole === 'supplier' ? 'Twif - Vendor' : undefined

  const [verifiedUser, setVerifiedUser] = useState(null)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  // Hook owns portal_users row creation + onboarding status fetch.
  // Only activates once verifiedUser is set (after OTP succeeds).
  const { onboardingCompleted, loading: portalLoading } = usePortalUser(verifiedUser)

  const { secondsLeft, canResend, resending, resendError, resend } = useOTPTimer(email, mode)

  // Guard — no email means someone hit /verify-otp directly
  useEffect(() => {
    if (!email) navigate(forcedRole === 'supplier' ? '/auth/vendor' : forcedRole === 'buyer' ? '/auth/buyer' : '/auth', { replace: true })
  }, [email, navigate, forcedRole])

  // Once the hook has fetched onboarding status, redirect to the right place
  useEffect(() => {
    if (!verifiedUser || onboardingCompleted === null) return

    if (mode === 'signup' || !onboardingCompleted) {
      const onboardingPath = forcedRole === 'supplier' ? '/auth/vendor/onboarding_vendor' : '/onboarding'
      navigate(onboardingPath, { state: { email, userId: verifiedUser.id, returnUrl, forcedRole } })
      return
    }

    // Honour return_url if present (e.g. from PLM invite accept flow)
    if (returnUrl) {
      navigate(returnUrl, { replace: true })
      return
    }

    // Onboarding done — check org type to route to the right dashboard
    async function routeByOrg() {
      if (!supabase) return
      const { data } = await supabase
        .from('organization_members')
        .select('role, organizations!inner(type)')
        .eq('user_id', verifiedUser.id)
        .maybeSingle()

      const orgType = data?.organizations?.type
      const role    = data?.role

      if (orgType === 'merchant') {
        navigate(
          ['admin', 'owner'].includes(role) ? '/admin/approvals' : '/merchant-dashboard',
          { replace: true }
        )
      } else {
        navigate('/dashboard', { replace: true })
      }
    }

    routeByOrg()
  }, [verifiedUser, onboardingCompleted, mode, email, navigate, returnUrl, forcedRole])

  async function handleComplete(code) {
    setError('')
    setVerifying(true)
    if (!supabase) {
      setError(supabaseConfigMessage)
      setVerifying(false)
      return
    }
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      })
      if (verifyError) throw verifyError
      // Setting verifiedUser triggers usePortalUser, which upserts the row
      // and fetches onboarding_completed. The useEffect above then redirects.
      setVerifiedUser(data.user)
    } catch (err) {
      const msg = err.message?.toLowerCase() || ''
      setError(
        msg.includes('expired') || msg.includes('invalid')
          ? 'Incorrect or expired code. Please try again.'
          : err.message || 'Verification failed. Please try again.'
      )
      setVerifying(false)
    }
  }

  if (!email) return null

  if (!supabase) {
    return (
      <AuthShell>
        <AuthLogo suffix={logoSuffix} label={logoLabel} />
        <Alert type="error">{supabaseConfigMessage}</Alert>
        <button
          type="button"
          onClick={() => navigate('/auth', { replace: true })}
          className="text-sm text-stone-600 hover:text-stone-900"
        >
          ← Back to sign in
        </button>
      </AuthShell>
    )
  }

  const busy = verifying || portalLoading

  return (
    <AuthShell>
      <AuthLogo suffix={logoSuffix} label={logoLabel} />

      <h1
        className="text-stone-900 mb-1.5"
        style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 22, fontWeight: 400 }}
      >
        Check your email
      </h1>
      <p className="text-sm text-stone-500 leading-relaxed mb-6">
        We sent a 6-digit code to{' '}
        <strong className="text-stone-800 font-medium">{email}</strong>.
        Enter it below to {mode === 'signup' ? 'continue' : 'sign in'}.
      </p>

      {(error || resendError) && (
        <Alert type="error">{error || resendError}</Alert>
      )}

      <OTPInput length={6} onComplete={handleComplete} hasError={!!error} disabled={busy} />

      {busy && (
        <div className="flex justify-center mb-4">
          <Spinner light={false} size="w-5 h-5" />
        </div>
      )}

      <div className="text-center text-sm text-stone-500 mt-2">
        {canResend ? (
          <span>
            Didn't receive it?{' '}
            <button
              type="button"
              onClick={resend}
              disabled={resending || busy}
              className="text-stone-900 font-medium border-b border-stone-300 hover:border-stone-900 pb-px transition-colors disabled:opacity-50"
            >
              {resending ? 'Sending…' : 'Resend code'}
            </button>
          </span>
        ) : (
          <span>
            Resend code in <strong className="text-stone-800">{secondsLeft}s</strong>
          </span>
        )}
      </div>

      <div className="text-center mt-5">
        <button
          type="button"
          onClick={() => navigate(forcedRole === 'supplier' ? '/auth/vendor' : forcedRole === 'buyer' ? '/auth/buyer' : '/auth')}
          className="text-sm text-stone-400 hover:text-stone-700 transition-colors"
        >
          ← Use a different email
        </button>
      </div>
    </AuthShell>
  )
}