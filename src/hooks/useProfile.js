import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase' // Ensure you have your supabase client initialized
import { useAuth } from './useAuth'

export function useProfile({ limit = 50, offset = 0, role = '' } = {}) {
  const {session} = useAuth()
  const [members, setMembers] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchMembers = useCallback(async () => {
    if (!session || !supabase) return

    setLoading(true)
    setError(null)

    try {
      // 1. Start the query on your table (assuming 'org_customers' is the table name)
      let query = supabase
        .from('org_customers')
        .select('*', { count: 'exact' }) // count: 'exact' gives us the total row count
        .range(offset, offset + limit - 1) // Supabase range is inclusive

      // 2. Apply conditional filters
      if (role) {
        query = query.eq('role', role)
      }

      const { data, error: supabaseError, count } = await query

      if (supabaseError) throw supabaseError

      setMembers(data || [])
      setTotal(count || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [session, limit, offset, role])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  return { members, total, loading, error, refresh: fetchMembers }
}