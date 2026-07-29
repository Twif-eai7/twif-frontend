import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function usePendingOtifIds() {
  const [pendingIds, setPendingIds] = useState(new Set())

  const fetchPendingOtifIds = useCallback(async () => {
    const { data, error } = await supabase
      .from('otif_exceptions')
      .select('po_id')
      .eq('status', 'pending')

    if (error) { console.error('Failed to fetch pending OTIF ids:', error.message); return }
    setPendingIds(new Set((data || []).map(r => r.po_id)))
  }, [])

  return { pendingIds, fetchPendingOtifIds }
}
