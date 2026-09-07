import { supabase, supabaseConfigMessage } from './supabase'

/**
 * Send an email OTP via the backend (code only — no confirm/magic link).
 * Falls back to Supabase signInWithOtp if this backend route is not deployed yet.
 */
export async function sendAuthOtp(email, { shouldCreateUser = false, path = '/auth' } = {}) {
  const normalised = String(email || '').trim().toLowerCase()
  if (!normalised) throw new Error('Email is required')

  const backend = import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, '')
  if (backend) {
    try {
      const res = await fetch(`${backend}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalised, shouldCreateUser: !!shouldCreateUser }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) return
      // 404 with a JSON error is "no account". Plain 404 means the route is not deployed yet.
      if (res.status === 404 && data.error) throw new Error(data.error)
      if (res.status !== 404) {
        throw new Error(data.error || 'Could not send the verification code.')
      }
    } catch (err) {
      if (err instanceof TypeError) {
        // Network failure — try Supabase below
      } else if (err.message && !/failed to fetch|network/i.test(err.message)) {
        throw err
      }
    }
  }

  if (!supabase) throw new Error(supabaseConfigMessage)
  const { otpEmailOptions } = await import('./authRedirect')
  const { error } = await supabase.auth.signInWithOtp({
    email: normalised,
    options: otpEmailOptions({ shouldCreateUser: !!shouldCreateUser, path }),
  })
  if (error) {
    const otpMsg = typeof error.message === 'string' ? error.message : ''
    if (
      !shouldCreateUser &&
      (otpMsg.toLowerCase().includes('not found') ||
        otpMsg.toLowerCase().includes('signups not allowed'))
    ) {
      throw new Error('No account found with that email. Try requesting access instead.')
    }
    throw error
  }
}

export async function verifyEmailOtp(email, token) {
  if (!supabase) throw new Error(supabaseConfigMessage)
  const types = ['magiclink', 'email', 'signup']
  let lastError = null
  for (const type of types) {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type })
    if (!error) return data
    lastError = error
  }
  throw lastError || new Error('Verification failed. Please try again.')
}
