import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { AuthSplitLayout, AuthEmailField, AuthGradientButton } from '../../components/auth'
import { Alert } from '../../components/ui'
import { useEmailAuth } from '../../hooks/useEmailAuth'
import { useAuth } from '../../hooks/useAuth'
import { isOrgLive, useProfileStore } from '../../stores/profileStore'

const MODES = {
  login: {
    heading: 'Sign in',
    emailPlaceholder: 'Email or ID',
    submitLabel: 'Sign in',
    footerQuestion: "Don't have an account?",
    footerAction: 'Request access',
    footerTarget: 'signup',
  },
  signup: {
    heading: 'Request access',
    emailPlaceholder: 'Work email',
    submitLabel: 'Continue',
    footerQuestion: 'Already have an account?',
    footerAction: 'Sign in',
    footerTarget: 'login',
  },
}

export default function AuthPage({ forcedRole, defaultMode = 'login' }) {
  const { state } = useLocation()
  const [mode, setMode] = useState(defaultMode)
  const [animating, setAnimating] = useState(false)
  const [email, setEmail] = useState(state?.email || '')

  const { session, loading: authLoading, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const profileFetched = useProfileStore((s) => s.profileFetched)
  const portalUser     = useProfileStore((s) => s.portalUser)
  const orgMembership  = useProfileStore((s) => s.orgMembership)

  useEffect(() => {
    if (authLoading || !session) return
    if (!profileFetched) return

    const returnUrl = searchParams.get('return_url')
    if (returnUrl) {
      navigate(returnUrl, { replace: true })
      return
    }

    const onboardingPath = forcedRole === 'supplier' ? '/auth/vendor/onboarding_vendor' : '/onboarding'

    if (!portalUser || !portalUser.onboarding_completed) {
      navigate(onboardingPath, { state: { email: user?.email, forcedRole }, replace: true })
      return
    }

    if (!isOrgLive(orgMembership)) {
      navigate(onboardingPath, { state: { email: user?.email, pendingReview: true, forcedRole }, replace: true })
      return
    }

    const orgType = orgMembership?.orgType
    const role = orgMembership?.role

    if (orgType === 'merchant') {
      navigate(
        ['admin', 'owner'].includes(role) ? '/admin/approvals' : '/merchant-dashboard',
        { replace: true }
      )
    } else {
      navigate('/dashboard', { replace: true })
    }
  }, [session, authLoading, profileFetched, portalUser, orgMembership, user, navigate, searchParams, forcedRole])

  const returnUrl = searchParams.get('return_url')
  const otpPath = forcedRole === 'supplier' ? '/auth/vendor/verify-otp' : '/verify-otp'
  const { submit, loading, error, clearError } = useEmailAuth(mode, returnUrl, forcedRole, otpPath)

  const config = MODES[mode]

  function switchMode(next) {
    if (next === mode || animating) return
    setAnimating(true)
    clearError()
    setEmail('')
    setTimeout(() => {
      setMode(next)
      setAnimating(false)
    }, 180)
  }

  function handleSubmit(e) {
    e.preventDefault()
    submit(email)
  }

  const roleLabel = forcedRole === 'buyer' ? 'Buyer' : forcedRole === 'supplier' ? 'Vendor' : null
  const panelHeading = roleLabel && mode === 'signup'
    ? `New ${roleLabel} registration`
    : roleLabel || null

  return (
    <AuthSplitLayout mode={mode}>
      <div
        className="transition-opacity duration-150"
        style={{ opacity: animating ? 0 : 1 }}
      >
        <h2 className="text-center text-sm font-bold tracking-[0.18em] text-[#4d68f0] uppercase mb-8">
          {config.heading}
        </h2>

        {panelHeading && (
          <p className="text-center text-xs text-[#64748b] -mt-5 mb-6">{panelHeading}</p>
        )}

        {error && <Alert type="error">{error}</Alert>}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <AuthEmailField
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearError() }}
            placeholder={config.emailPlaceholder}
            autoFocus
            disabled={loading}
          />

          <p className="text-xs text-[#94a3b8] px-1">
            {mode === 'login'
              ? "We'll email you a one-time sign-in code — no password needed."
              : "Use your company email — we'll verify it before setting up your account."}
          </p>

          <div className="pt-2">
            <AuthGradientButton loading={loading}>
              {config.submitLabel}
            </AuthGradientButton>
          </div>
        </form>

        <p className="text-center text-sm text-[#64748b] mt-6">
          {config.footerQuestion}{' '}
          <button
            type="button"
            onClick={() => switchMode(config.footerTarget)}
            className="text-[#4d68f0] font-medium hover:underline"
          >
            {config.footerAction}
          </button>
        </p>
      </div>
    </AuthSplitLayout>
  )
}
