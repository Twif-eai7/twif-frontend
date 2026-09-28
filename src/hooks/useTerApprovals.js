import { useState, useEffect, useCallback } from 'react'
import { fetchAllRequests, updateRequestStatus } from './useTechEnhancementRequests'

/**
 * useTerApprovals
 * Queue of Tech Enhancement Requests still open (status 'submitted' or
 * 'accepted') for the TER approver to stage forward. Three actions: approve
 * (-> accepted), mark done (-> done), decline (-> declined). Declined and
 * done requests both drop out of this queue.
 */
export function useTerApprovals() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [acting, setActing] = useState(null) // { id, action: 'approve'|'done'|'decline' }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await fetchAllRequests()
      if (fetchError) throw fetchError
      setRequests((data || []).filter(r => r.status !== 'done' && r.status !== 'declined'))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const setStatus = useCallback(async (id, action, status) => {
    setActing({ id, action })
    try {
      const { error: updateError } = await updateRequestStatus(id, { status })
      if (updateError) throw updateError
      await fetchAll()
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message || 'Update failed' }
    } finally {
      setActing(null)
    }
  }, [fetchAll])

  const approveTer = useCallback((id) => setStatus(id, 'approve', 'accepted'), [setStatus])
  const markDone = useCallback((id) => setStatus(id, 'done', 'done'), [setStatus])
  const declineTer = useCallback((id) => setStatus(id, 'decline', 'declined'), [setStatus])

  return { requests, loading, error, acting, approveTer, markDone, declineTer }
}
