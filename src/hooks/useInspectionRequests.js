import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useInspectionRequests() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('inspection_requests')
      .select(`
        id, request_no, po_id, po_number, vendor_name, buyer_name,
        inspection_type, ship_date, inspection_request_date, created_at,
        purchase_orders(po_number)
      `)
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setRequests(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return { requests, loading, error, refresh: load }
}

export async function createInspectionRequest(payload) {
  return supabase.from('inspection_requests').insert(payload).select().single()
}

export async function addRequestAttachment(row) {
  return supabase.from('inspection_request_attachments').insert(row).select().single()
}

export async function deleteRequestAttachment(id) {
  return supabase.from('inspection_request_attachments').delete().eq('id', id)
}
