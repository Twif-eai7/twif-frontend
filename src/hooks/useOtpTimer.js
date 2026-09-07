import { useState, useEffect, useCallback } from 'react'
import { supabase, supabaseConfigMessage } from '../lib/supabase'
import { sendAuthOtp } from '../lib/authOtp'

const RESEND_DELAY = 60 // seconds

export function useOTPTimer(email, mode, redirectPath = '/auth') {
  const [secondsLeft, setSecondsLeft] = useState(RESEND_DELAY)
  const [canResend, setCanResend] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendError, setResendError] = useState('')

  useEffect(() => {
    if (secondsLeft <= 0) {
      setCanResend(true)
      return
    }
    const t = setTimeout(() => setSecondsLeft(v => v - 1), 1000)
    return () => clearTimeout(t)
  }, [secondsLeft])

  const resend = useCallback(async () => {
    if (!canResend || resending) return
    if (!supabase) {
      setResendError(supabaseConfigMessage)
      return
    }
    setResending(true)
    setResendError('')
    try {
      await sendAuthOtp(email, {
        shouldCreateUser: mode === 'signup',
        path: redirectPath,
      })
      setSecondsLeft(RESEND_DELAY)
      setCanResend(false)
    } catch (err) {
      setResendError(err.message || 'Failed to resend. Please try again.')
    } finally {
      setResending(false)
    }
  }, [canResend, resending, email, mode, redirectPath])

  return { secondsLeft, canResend, resending, resendError, resend }
}