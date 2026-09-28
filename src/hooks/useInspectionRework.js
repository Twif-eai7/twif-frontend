import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Best-effort notification - never blocks or fails the caller's own action
// (the request/approve/reject write already succeeded by the time this
// fires), same "a flaky network call must never block the action the user
// just completed" rule InspectionScheduleForm.jsx's own notify call follows.
function notifyRework(requestId, action) {
  fetch(`${import.meta.env.VITE_BACKEND_URL}/inspection-schedule/rework-notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, action }),
  }).catch(err => console.error('[useInspectionRework] notify failed:', err.message))
}

// Every rework_request row for a PO, newest first - powers both the admin
// review badge/panel (filtered to status==='pending' by the caller) and any
// "past requests" history view.
export function useReworkRequestsForPo(poId) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!poId) { setRequests([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('inspection_rework_requests')
      .select('*')
      .eq('po_id', poId)
      .order('requested_at', { ascending: false })
    setLoading(false)
    if (error) { console.error('[useReworkRequestsForPo]', error.message); return }
    setRequests(data || [])
  }, [poId])

  useEffect(() => { load() }, [load])

  return { requests, loading, refresh: load }
}

// Every rework_request row across every PO, newest first, with the parent
// PO's number/buyer/vendor/vendor-region joined in - powers the global
// "Rework Requests" button on the Scheduled POs overview page (as opposed to
// useReworkRequestsForPo above, which is scoped to one already-open PO and
// has no need to carry any of this since the page it's used on already
// shows exactly one PO's own header). Vendor region is state+country off the
// supplier org, same "region" concept QcReportsSummary.jsx's own
// vendorRegionByName builds from organizations - no separate region column.
// Not filtered to status==='pending' here - same as useReworkRequestsForPo,
// that's left to the caller/modal so its History tab still has rows to show
// (an all-pending-only fetch would leave History empty).
export function useAllPendingReworkRequests(enabled) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!enabled) { setRequests([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('inspection_rework_requests')
      .select(`
        *,
        purchase_orders (
          po_number,
          buyer_supplier_links!inner(
            buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(display_name),
            supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(display_name, state, country)
          )
        )
      `)
      .order('requested_at', { ascending: false })
    setLoading(false)
    if (error) { console.error('[useAllPendingReworkRequests]', error.message); return }
    setRequests((data || []).map(r => {
      const po = r.purchase_orders
      const link = Array.isArray(po?.buyer_supplier_links) ? po.buyer_supplier_links[0] : po?.buyer_supplier_links
      return {
        ...r,
        po_number: po?.po_number ?? null,
        buyer_name: link?.buyer?.display_name ?? null,
        vendor_name: link?.supplier?.display_name ?? null,
        vendor_region: [link?.supplier?.state, link?.supplier?.country].filter(Boolean).join(', ') || null,
      }
    }))
  }, [enabled])

  useEffect(() => { load() }, [load])

  return { requests, loading, refresh: load }
}

// One request can cover several checked SKUs at once - `items` is
// [{ po_line_item_id, inspection_type, round, report_id }, ...], one entry
// per SKU, capturing exactly which submitted report (stage + round) is
// being reworked so approval later knows precisely what to reset even if
// something else about the SKU changes in the meantime.
export async function submitReworkRequest({ poId, items, reason, requestedBy, requestedByEmail, requestedByMemberId }) {
  const { data, error } = await supabase
    .from('inspection_rework_requests')
    .insert({
      po_id: poId,
      items,
      reason,
      requested_by: requestedBy,
      requested_by_email: requestedByEmail,
      requested_by_member_id: requestedByMemberId,
    })
    .select().single()
  if (error) return { data: null, error }
  notifyRework(data.id, 'requested')
  return { data, error: null }
}

// The multi-effect part (fresh draft round + audit log + a new schedule
// entry, per SKU in the batch) all happens inside the approve_inspection_rework
// Postgres function (see the migration) - one RPC call so a partial failure
// partway through a multi-SKU batch can't leave some SKUs reset and others
// not.
export async function approveReworkRequest({ requestId, reviewedBy, reviewedByEmail }) {
  const { error } = await supabase.rpc('approve_inspection_rework', {
    p_request_id: requestId,
    p_reviewed_by: reviewedBy,
    p_reviewed_by_email: reviewedByEmail,
  })
  if (error) return { error }
  notifyRework(requestId, 'approved')
  return { error: null }
}

export async function rejectReworkRequest({ requestId, reviewedBy, reviewedByEmail, reviewNote }) {
  const { error } = await supabase
    .from('inspection_rework_requests')
    .update({ status: 'rejected', reviewed_by: reviewedBy, reviewed_by_email: reviewedByEmail, reviewed_at: new Date().toISOString(), review_note: reviewNote || null })
    .eq('id', requestId)
    .eq('status', 'pending') // never overwrite an already-reviewed request
  if (error) return { error }
  notifyRework(requestId, 'rejected')
  return { error: null }
}
