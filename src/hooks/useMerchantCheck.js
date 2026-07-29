import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

/**
 * useMerchantCheck
 * Verifies the current user belongs to an org with type = 'merchant'.
 * Any role (owner, admin, member) is allowed — all merchant org users
 * get access to the merchant dashboard.
 * Redirects to /dashboard if not a merchant org user.
 *
 * Returns { isMerchant, checking, orgId }
 */
export function useMerchantCheck() {
  const { session, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [isMerchant, setIsMerchant] = useState(false)
  const [checking, setChecking] = useState(true)
  const [orgId, setOrgId] = useState(null)

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
        .select('id, role, organizations!inner(id, type)')
        .eq('user_id', session.user.id)
        .eq('organizations.type', 'merchant')
        .maybeSingle()

      if (!data) {
        navigate('/dashboard', { replace: true })
      } else {
        setIsMerchant(true)
        setOrgId(data.organizations?.id || null)
      }
      setChecking(false)
    }

    check()
  }, [session, authLoading, navigate])

  return { isMerchant, checking, orgId }
}