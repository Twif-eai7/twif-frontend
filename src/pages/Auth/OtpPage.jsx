import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase, supabaseConfigMessage } from '../../lib/supabase'
import { AuthSplitLayout } from '../../components/auth'
import { OTPInput, Alert, Spinner } from '../../components/ui'
import { useOTPTimer } from '../../hooks/useOtpTimer'
import { usePortalUser } from '../../hooks/usePortalUser'

const OTP_LENGTH = 8

export default function OTPPage({ forcedRole: routeForcedRole }) {
  const navigate = useNavigate()
  const { state } = useLocation()
  const { email, mode, returnUrl, forcedRole: stateForcedRole } = state || {}
  const forcedRole = routeForcedRole || stateForcedRole

  const [verifiedUser, setVerifiedUser] = useState(null)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  const { onboardingCompleted, loading: portalLoading } = usePortalUser(verifiedUser)
  const { secondsLeft, canResend, resending, resendError, resend } = useOTPTimer(
    email,
    mode,
    forcedRole === 'supplier' ? '/auth/vendor' : '/auth',
  )

  const authPath = forcedRole === 'supplier' ? '/auth/vendor' : forcedRole === 'buyer' ? '/auth/buyer' : '/auth'

  useEffect(() => {
    if (!email) navigate(authPath, { replace: true })
  }, [email, navigate, authPath])

  useEffect(() => {
    if (!verifiedUser || onboardingCompleted === null) return

    if (mode === 'signup' || !onboardingCompleted) {
      const onboardingPath = forcedRole === 'supplier' ? '/auth/vendor/onboarding_vendor' : '/onboarding'
      navigate(onboardingPath, { state: { email, userId: verifiedUser.id, returnUrl, forcedRole } })
      return
    }

    if (returnUrl) {
      navigate(returnUrl, { replace: true })
      return
    }

    async function routeByOrg() {
      if (!supabase) return
      const { data } = await supabase
        .from('organization_members')
        .select('role, organizations!inner(type, status)')
        .eq('user_id', verifiedUser.id)
        .maybeSingle()

      const orgType = data?.organizations?.type
      const orgStatus = data?.organizations?.status
      const role    = data?.role

      if (orgStatus === 'pending' || orgStatus === 'rejected' || orgStatus === 'suspended') {
        const onboardingPath = forcedRole === 'supplier' ? '/auth/vendor/onboarding_vendor' : '/onboarding'
        navigate(onboardingPath, { state: { email, pendingReview: true, forcedRole }, replace: true })
        return
      }

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
      <AuthSplitLayout mode="otp">
        <Alert type="error">{supabaseConfigMessage}</Alert>
      </AuthSplitLayout>
    )
  }

  const busy = verifying || portalLoading

  return (
    <AuthSplitLayout mode="otp">
      <h2 className="text-center text-sm font-bold tracking-[0.18em] text-[#4d68f0] uppercase mb-3">
        Verify code
      </h2>
      <p className="text-center text-sm text-[#64748b] leading-relaxed mb-6">
        We sent an {OTP_LENGTH}-digit code to{' '}
        <strong className="text-[#0f172a] font-medium">{email}</strong>
      </p>

      {(error || resendError) && (
        <Alert type="error">{error || resendError}</Alert>
      )}

      <OTPInput length={OTP_LENGTH} onComplete={handleComplete} hasError={!!error} disabled={busy} />

      {busy && (
        <div className="flex justify-center mb-4">
          <Spinner light={false} size="w-5 h-5" />
        </div>
      )}

      <div className="text-center text-sm text-[#64748b] mt-2">
        {canResend ? (
          <span>
            Didn't receive it?{' '}
            <button
              type="button"
              onClick={resend}
              disabled={resending || busy}
              className="text-[#4d68f0] font-medium hover:underline disabled:opacity-50"
            >
              {resending ? 'Sending…' : 'Resend code'}
            </button>
          </span>
        ) : (
          <span>
            Resend code in <strong className="text-[#0f172a]">{secondsLeft}s</strong>
          </span>
        )}
      </div>

      <div className="text-center mt-5">
        <button
          type="button"
          onClick={() => navigate(authPath)}
          className="text-sm text-[#94a3b8] hover:text-[#475569] transition-colors"
        >
          ← Use a different email
        </button>
      </div>
    </AuthSplitLayout>
  )
}
