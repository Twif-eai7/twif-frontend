import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'

const BASE = import.meta.env.VITE_BACKEND_URL

export function useOrganisations({ limit = 50, offset = 0 } = {}) {
  const { session } = useAuth()
  const [orgs, setOrgs] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchOrgs = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `${BASE}/org-customers/orgs/all?limit=${limit}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch organisations')
      setOrgs(data.data?.orgs || [])
      setTotal(data.data?.pageInfo?.total || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [session, limit, offset])

  useEffect(() => { fetchOrgs() }, [fetchOrgs])

  return { orgs, total, loading, error, refresh: fetchOrgs }
}