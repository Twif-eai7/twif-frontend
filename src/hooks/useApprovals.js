import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'

const BASE = import.meta.env.VITE_BACKEND_URL

/**
 * useApprovals
 * Fetches all pending join_requests (member + claim types)
 * and pending organisations.
 * Exposes approve/reject actions for both.
 */
export function useApprovals() {
  const { session } = useAuth()

  const [requests, setRequests] = useState([])   // join_requests
  const [pendingOrgs, setPendingOrgs] = useState([]) // portal-created orgs
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [acting, setActing] = useState(null) // { id, action: 'approve'|'reject' } of row being acted on

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.access_token}`,
  }

  const fetchAll = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      const [reqRes, orgRes] = await Promise.all([
        fetch(`${BASE}/org-customers/join-requests/pending`, { headers }),
        fetch(`${BASE}/org-customers/orgs/pending`, { headers }),
      ])
      const [reqData, orgData] = await Promise.all([reqRes.json(), orgRes.json()])
      if (!reqRes.ok) throw new Error(reqData.error || 'Failed to fetch requests')
      if (!orgRes.ok) throw new Error(orgData.error || 'Failed to fetch orgs')
      setRequests(reqData.data || [])
      setPendingOrgs(orgData.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Approve a join_request (member or claim)
  const approveRequest = useCallback(async (id) => {
    setActing({ id, action: 'approve' })
    try {
      const res = await fetch(`${BASE}/org-customers/join-request/${id}/approve`, {
        method: 'PATCH', headers,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to approve')
      setRequests(prev => prev.filter(r => r.id !== id))
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    } finally {
      setActing(null)
    }
  }, [session])

  // Reject a join_request (member or claim)
  const rejectRequest = useCallback(async (id, reason = '') => {
    setActing({ id, action: 'reject' })
    try {
      const res = await fetch(`${BASE}/org-customers/join-request/${id}/reject`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reject')
      setRequests(prev => prev.filter(r => r.id !== id))
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    } finally {
      setActing(null)
    }
  }, [session])

  // Approve a pending org (portal-created new org)
  const approveOrg = useCallback(async (id) => {
    setActing({ id, action: 'approve' })
    try {
      const res = await fetch(`${BASE}/org-customers/orgs/${id}/approve`, {
        method: 'PATCH', headers,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to approve org')
      setPendingOrgs(prev => prev.filter(o => o.id !== id))
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    } finally {
      setActing(null)
    }
  }, [session])

  // Reject a pending org
  const rejectOrg = useCallback(async (id, reason = '') => {
    setActing({ id, action: 'reject' })
    try {
      const res = await fetch(`${BASE}/org-customers/orgs/${id}/reject`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reject org')
      setPendingOrgs(prev => prev.filter(o => o.id !== id))
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    } finally {
      setActing(null)
    }
  }, [session])

  // Fetch the dry-run NDA preview PDF for a pending org — returns a blob URL
  const previewOrgPdf = useCallback(async (id) => {
    try {
      const res = await fetch(`${BASE}/org-customers/orgs/${id}/nda-preview`, { headers })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to generate preview')
      }
      const blob = await res.blob()
      return { success: true, url: URL.createObjectURL(blob) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [session])

  // Step 1: admin confirms they've reviewed the preview
  const verifyOrg = useCallback(async (id) => {
    setActing({ id, action: 'verify' })
    try {
      const res = await fetch(`${BASE}/org-customers/orgs/${id}/verify`, { method: 'PATCH', headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to verify')
      setPendingOrgs(prev => prev.map(o => o.id === id ? { ...o, nda_verified_at: new Date().toISOString() } : o))
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    } finally {
      setActing(null)
    }
  }, [session])

  // Step 2: admin countersigns — signature captured fresh for this approval
  const signOrg = useCallback(async (id, signaturePayload) => {
    setActing({ id, action: 'sign' })
    try {
      const res = await fetch(`${BASE}/org-customers/orgs/${id}/sign`, {
        method: 'PATCH', headers,
        body: JSON.stringify(signaturePayload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to sign')
      setPendingOrgs(prev => prev.map(o => o.id === id ? { ...o, jng_signed_at: new Date().toISOString() } : o))
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    } finally {
      setActing(null)
    }
  }, [session])

  return {
    requests,
    pendingOrgs,
    loading,
    error,
    acting,
    refresh: fetchAll,
    approveRequest,
    rejectRequest,
    approveOrg,
    rejectOrg,
    previewOrgPdf,
    verifyOrg,
    signOrg,
  }
}