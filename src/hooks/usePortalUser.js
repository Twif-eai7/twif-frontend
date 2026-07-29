import { useState, useEffect, useCallback } from 'react'
import { supabase, supabaseConfigMessage } from '../lib/supabase'

/**
 * usePortalUser
 *
 * Single responsibility: own the portal_users row for the current user.
 *
 * - Upserts the row as soon as a user is passed in (called right after
 *   OTP verification succeeds, when we first have a confirmed user object)
 * - Reads onboarding_completed so the page can decide where to redirect
 * - Exposes markOnboardingComplete() so OnboardingPage can call it on finish
 *
 * Usage in OTPPage:
 *   const { onboardingCompleted, loading } = usePortalUser(user)
 *
 * Usage in OnboardingPage:
 *   const { markOnboardingComplete } = usePortalUser(user)
 */
export function usePortalUser(user) {
  const [onboardingCompleted, setOnboardingCompleted] = useState(null) // null = not yet fetched
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user?.id || !user?.email) return

    let cancelled = false

    async function ensureAndFetch() {
      setLoading(true)
      setError(null)

      if (!supabase) {
        setError(supabaseConfigMessage)
        setLoading(false)
        return
      }

      try {
        // 1. Upsert — creates the row on first sign-in, no-op on subsequent calls
        const { error: upsertError } = await supabase
          .from('portal_users')
          .upsert(
            { id: user.id, email: user.email },
            { onConflict: 'id', ignoreDuplicates: true }
          )

        if (upsertError) throw upsertError

        // 2. Fetch the current onboarding status
        const { data, error: fetchError } = await supabase
          .from('portal_users')
          .select('onboarding_completed')
          .eq('id', user.id)
          .single()

        if (fetchError) throw fetchError
        if (!cancelled) setOnboardingCompleted(data.onboarding_completed)

      } catch (err) {
        console.warn('usePortalUser error:', err.message)
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    ensureAndFetch()
    return () => { cancelled = true }
  }, [user?.id, user?.email])

  // Called by OnboardingPage after org creation or join request succeeds
  const markOnboardingComplete = useCallback(async () => {
    if (!user?.id) return
    if (onboardingCompleted) return  // already done, avoid redundant DB write
    if (!supabase) throw new Error(supabaseConfigMessage)
    const { error } = await supabase
      .from('portal_users')
      .update({ onboarding_completed: true })
      .eq('id', user.id)

    if (error) {
      console.warn('markOnboardingComplete error:', error.message)
      throw error // let the caller handle it
    }
    setOnboardingCompleted(true)
  }, [user?.id, onboardingCompleted])

  return { onboardingCompleted, loading, error, markOnboardingComplete }
}