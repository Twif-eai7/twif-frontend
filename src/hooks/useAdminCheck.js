import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

/**
 * useAdminCheck
 *
 * Verifies the current user is an owner or admin of an org
 * with type = 'merchant'. Redirects to /dashboard if not.
 *
 * Returns { isAdmin, checking }
 */
export function useAdminCheck() {
  const { session, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [isAdmin, setIsAdmin] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!session) {
      navigate('/auth', { replace: true })
      return
    }

    async function check() {
      if (!supabase) {
        navigate('/auth', { replace: true })
        setChecking(false)
        return
      }
      const { data } = await supabase
        .from('organization_members')
        .select('id, organizations!inner(type)')
        .eq('user_id', session.user.id)
        .in('role', ['admin', 'owner'])
        .eq('organizations.type', 'merchant')
        .or('department.eq.tech,department.is.null')
        .maybeSingle()

      if (!data) {
        navigate('/dashboard', { replace: true })
      } else {
        setIsAdmin(true)
      }
      setChecking(false)
    }

    check()
  }, [session, authLoading, navigate])

  return { isAdmin, checking }
}