import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { AuthShell, AuthLogo } from '../../components/auth'
import { Button, Input, Alert } from '../../components/ui'
import { useEmailAuth } from '../../hooks/useEmailAuth'
import { useAuth } from '../../hooks/useAuth'
import { useProfileStore } from '../../stores/profileStore'

const MODES = {
  login: {
    tab: 'Sign in',
    heading: 'Welcome back',
    subtitle: "Enter your email and we'll send you a sign-in code.",
    emailLabel: 'Email address',
    emailHint: '',
    submitLabel: 'Continue with email',
    footerQuestion: "Don't have an account?",
    footerAction: 'Request access',
    footerTarget: 'signup',
  },
  signup: {
    tab: 'Request access',
    heading: 'Request access',
    subtitle: "Enter your work email to get started. We'll verify it before setting up your account.",
    emailLabel: 'Work email',
    emailHint: "Use your company email — it's used to find your organisation.",
    submitLabel: 'Continue',
    footerQuestion: 'Already have an account?',
    footerAction: 'Sign in',
    footerTarget: 'login',
  },
}

export default function AuthPage({ forcedRole }) {
  const { state } = useLocation()
  const [mode, setMode] = useState('login')
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

    // Honour return_url if present (e.g. from PLM invite accept flow)
    const returnUrl = searchParams.get('return_url')
    if (returnUrl) {
      navigate(returnUrl, { replace: true })
      return
    }

    // Vendor entrance uses its own dedicated onboarding route so the role
    // survives even if state gets dropped along the way (e.g. a stale
    // session bypassing the normal OTP → onboarding chain).
    const onboardingPath = forcedRole === 'supplier' ? '/auth/vendor/onboarding_vendor' : '/onboarding'

    // Not yet submitted onboarding form
    if (!portalUser || !portalUser.onboarding_completed) {
      navigate(onboardingPath, { state: { email: user?.email, forcedRole }, replace: true })
      return
    }

    // Submitted but pending org approval
    if (!orgMembership) {
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
  // Vendor entrance gets its own dedicated OTP route (see App.jsx) so the
  // role is baked into the URL instead of relying on history state alone.
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
  const logoSuffix = roleLabel && (mode === 'signup' ? `New ${roleLabel} Registration` : roleLabel)

  return (
    <AuthShell>
      <AuthLogo suffix={logoSuffix || undefined} />

      {/* Form — fades when switching mode */}
      <div
        className="transition-opacity duration-150"
        style={{ opacity: animating ? 0 : 1 }}
      >
        <h1
          className="text-stone-900 mb-1.5"
          style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 22, fontWeight: 400 }}
        >
          {config.heading}
        </h1>
        <p className="text-sm text-stone-500 leading-relaxed mb-6">
          {config.subtitle}
        </p>

        {error && <Alert type="error">{error}</Alert>}

        <form onSubmit={handleSubmit} noValidate>
          <Input
            label={config.emailLabel}
            required
            type="email"
            placeholder="you@company.com"
            value={email}
            hint={config.emailHint}
            onChange={e => { setEmail(e.target.value); clearError() }}
            autoComplete="email"
            autoFocus
          />
          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={loading}
            className="mt-1 py-3"
          >
            {config.submitLabel}
          </Button>
        </form>

        <p className="text-center text-sm text-stone-500 mt-6">
          {config.footerQuestion}{' '}
          <button
            type="button"
            onClick={() => switchMode(config.footerTarget)}
            className="text-stone-900 font-medium border-b border-stone-300 hover:border-stone-900 pb-px transition-colors"
          >
            {config.footerAction}
          </button>
        </p>
      </div>
    </AuthShell>
  )
}