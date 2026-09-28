import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Distinct PO creator identities for a "Merchant" filter — same source
// PoRecord.jsx's Merchant filter uses (get_distinct_merchants RPC, matched
// against purchase_orders.created_by via ILIKE), so the two behave
// identically instead of drifting into two different ideas of "merchant".
export function useMerchantOptions(enabled) {
  const [merchants, setMerchants] = useState([])

  useEffect(() => {
    if (!enabled) { setMerchants([]); return }
    supabase.rpc('get_distinct_merchants').then(({ data, error }) => {
      if (error) { console.error('[useMerchantOptions] fetch error:', error.message); return }
      setMerchants([...new Set((data || []).map(r => r.created_by).filter(Boolean))].sort())
    })
  }, [enabled])

  return merchants
}
