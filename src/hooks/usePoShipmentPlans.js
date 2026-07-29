import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useMemberId } from '../stores/profileStore'

// Merchant-side CRUD for the PO planning stage — the first step of the
// reversed shipment flow (PO -> planned -> grouped -> raised -> booked).
export function usePoShipmentPlans() {
  const memberId = useMemberId()

  // New plans start as 'draft' — private to the merchant. Grouping (see
  // useShipmentContainerActions.js's createGroupFromPlans) operates
  // directly on drafts now; visibility to logistics is a group-level
  // "Confirm" action (confirmGroup), not a per-plan one, so there's no
  // separate confirm step here anymore.
  const createPlans = useCallback(async (items) => {
    if (!items?.length) return
    const rows = items.map(({ po_id, cbm }) => ({ po_id, cbm, planned_by: memberId, status: 'draft' }))
    const { error } = await supabase.from('po_shipment_plans').insert(rows)
    if (error) throw error
  }, [memberId])

  const updatePlanCbm = useCallback(async (planId, cbm) => {
    const { error } = await supabase
      .from('po_shipment_plans')
      .update({ cbm, updated_on: new Date().toISOString(), updated_by: memberId })
      .eq('id', planId)
    if (error) throw error
  }, [memberId])

  const withdrawPlan = useCallback(async (planId) => {
    const { error } = await supabase
      .from('po_shipment_plans')
      .update({ status: 'cancelled', updated_on: new Date().toISOString(), updated_by: memberId })
      .eq('id', planId)
    if (error) throw error
  }, [memberId])

  return { createPlans, updatePlanCbm, withdrawPlan }
}

// Which PO ids currently have an active (draft, pending, or grouped) plan —
// used to badge/disable already-planned rows in PoRecord.jsx. A PO already
// sitting in a group (not yet raised) still shouldn't be re-planned, same as
// one that's only a draft or still pending confirmation.
// Fetched on demand (mirrors usePendingOtifIds.js), not tied to a specific id
// list, since the visible PO page changes independently.
export function usePendingShipmentPlanIds() {
  const [pendingPoIds, setPendingPoIds] = useState(new Set())

  const fetchPendingShipmentPlanIds = useCallback(async () => {
    const { data, error } = await supabase
      .from('po_shipment_plans')
      .select('po_id')
      .in('status', ['draft', 'pending', 'grouped'])

    if (error) { console.error('[usePendingShipmentPlanIds] fetch error:', error.message); return }
    setPendingPoIds(new Set((data || []).map(r => r.po_id)))
  }, [])

  return { pendingPoIds, fetchPendingShipmentPlanIds }
}
