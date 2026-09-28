import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'

const BASE = import.meta.env.VITE_BACKEND_URL

// Lists workspaces the current member has been granted view/comment/edit on via the
// PLM Security console — without this, a grant alone doesn't surface anywhere in the
// recipient's normal PLM view (catalog fetch never checks npd2_workspace_permissions).
export function usePLMMyGrants() {
  const { session } = useAuth()
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${BASE}/plm/my-permission-grants`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch shared workspaces')
      setGrants(data.grants || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => { refresh() }, [refresh])

  return { grants, loading, error, refresh }
}
