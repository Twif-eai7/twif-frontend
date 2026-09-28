import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

const API_BASE = import.meta.env.VITE_BACKEND_URL

// Pending (not yet approved/rejected) quantity-cancellation requests, keyed
// by po_line_item_id - same "which rows are still open" shape as
// usePendingOtifIds.js, filtered to this feature's exception_type (the two
// share one table, see supabase/migrations/20260824_extend_otif_exceptions_for_cancellations.sql).
export function usePendingLineItemCancellations() {
  const fetchPendingCancellations = async (lineItemIds) => {
    if (!lineItemIds?.length) return new Map()
    const { data, error } = await supabase
      .from('otif_exceptions')
      .select('id, line_item_id, requested_quantity, reason, comment, proof_url, reported_by, created_at')
      .eq('exception_type', 'quantity_cancellation')
      .eq('status', 'pending')
      .in('line_item_id', lineItemIds)
    if (error) { console.error('Failed to fetch pending cancellations:', error.message); return new Map() }
    return new Map((data || []).map(r => [r.line_item_id, r]))
  }
  return { fetchPendingCancellations }
}

// Submits a new cancellation request with its proof photo - same
// FormData + Bearer-token shape as usePOActions.js's reportOtifException,
// hitting the sibling backend route (shopify-backend/routes/purchaseOrders.js).
export async function requestQuantityCancellation(lineItemId, { quantity, reason, comment, proofImage }) {
  const session = useAuthStore.getState().session
  const fd = new FormData()
  fd.append('requestedQuantity', quantity)
  fd.append('reason', reason)
  fd.append('comment', comment || '')
  fd.append('proofImage', proofImage)
  const res = await fetch(`${API_BASE}/purchase-orders/quantity-cancellation/${lineItemId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token}` },
    body: fd,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}
