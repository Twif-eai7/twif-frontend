import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, supabaseConfigMessage } from '../lib/supabase'
import { isValidEmail } from '../utils/validators'

/**
 * useEmailAuth
 *
 * Single responsibility: send the OTP email via Supabase Auth.
 *
 * Usage in AuthPage:
 *   const { submit, loading, error, clearError } = useEmailAuth(mode)
 *   <form onSubmit={e => { e.preventDefault(); submit(email) }}>
 */
export function useEmailAuth(mode, returnUrl, forcedRole, otpPath = '/verify-otp') {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const clearError = useCallback(() => setError(''), [])

  const submit = useCallback(async (email) => {
    const normalised = email.toLowerCase().trim()

    if (!normalised) return setError('Email is required')
    if (!isValidEmail(normalised)) return setError('Please enter a valid email address')

    setError('')
    setLoading(true)

    if (!supabase) {
      setError(supabaseConfigMessage)
      setLoading(false)
      return
    }

    try {
      // Sign out any existing session before starting a new OTP flow.
      // This prevents stale sessions from bypassing OTP on the next page
      // or invalidating the new OTP due to session conflicts.
      await supabase.auth.signOut({ scope: 'local' })

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalised,
        options: { shouldCreateUser: mode === 'signup' },
      })

      if (otpError) {
        if (
          mode === 'login' &&
          (otpError.message.toLowerCase().includes('not found') ||
            otpError.message.toLowerCase().includes('signups not allowed'))
        ) {
          return setError('No account found with that email. Try requesting access instead.')
        }
        throw otpError
      }

      navigate(otpPath, { state: { email: normalised, mode, returnUrl, forcedRole }, replace: true })

    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [mode, navigate, returnUrl, forcedRole, otpPath])

  return { submit, loading, error, clearError }
}