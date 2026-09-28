import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'

const BASE = import.meta.env.VITE_BACKEND_URL

export function useOrganisations({ limit = 50, offset = 0, type = '', status = '', search = '' } = {}) {
  const { session } = useAuth()
  const [orgs, setOrgs] = useState([])
  const [total, setTotal] = useState(0)
  // Table-wide counts by type/status — NOT derived from `orgs` above, which is only the
  // current page (`limit` rows). Filtering that page client-side undercounts anything
  // past the first page (e.g. showed "75 buyers" when the table actually had 103).
  const [counts, setCounts] = useState({ grandTotal: 0, buyers: 0, suppliers: 0, merchants: 0, active: 0, pending: 0, suspended: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchOrgs = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit, offset })
      if (type) params.set('type', type)
      if (status) params.set('status', status)
      if (search) params.set('search', search)
      const res = await fetch(
        `${BASE}/org-customers/orgs/all?${params}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch organisations')
      setOrgs(data.data?.orgs || [])
      setTotal(data.data?.pageInfo?.total || 0)
      if (data.data?.counts) setCounts(data.data.counts)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [session, limit, offset, type, status, search])

  useEffect(() => { fetchOrgs() }, [fetchOrgs])

  return { orgs, total, counts, loading, error, refresh: fetchOrgs }
}