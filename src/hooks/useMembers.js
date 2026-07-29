import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'

const BASE = import.meta.env.VITE_BACKEND_URL

export function useMembers({ limit = 50, offset = 0, role = '' } = {}) {
  const { session } = useAuth()
  const [members, setMembers] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchMembers = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit, offset })
      if (role) params.set('role', role)
      const res = await fetch(`${BASE}/org-customers/all?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch members')
      setMembers(data.data?.members || [])
      setTotal(data.data?.pageInfo?.total || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [session, limit, offset, role])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  return { members, total, loading, error, refresh: fetchMembers }
}