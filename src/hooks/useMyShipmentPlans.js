import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useProfileStore } from '../stores/profileStore'
import { titleCaseName } from '../utils/formatters'

// Broader than usePendingWorkOverview.js's canSeeAll (admin/owner/tech) —
// logistics also gets full cross-planner visibility here, not just its own
// buyer-scoped plans, since logistics needs to see every pending group
// regardless of who created or last updated it. Needed because
// ungrouping/removing a PO reverts its plan to 'draft' under whatever
// planned_by it already had (see useShipmentContainerActions.js's
// ungroupPlans) — a plan that was just fully team-visible as part of a
// confirmed group shouldn't become findable by only its original planner
// the moment it's reverted.
function canSeeAllPlans(role, dept) {
  return role === 'admin' || role === 'owner' || dept === 'tech' || dept === 'logistics'
}

// Not-yet-grouped PO shipment plans (still 'draft', or the now-vestigial
// 'pending' from before grouping moved to drafts) — feeds
// MyShipmentPlansDrawer.jsx, where a merchant can edit per-SKU quantities,
// withdraw, or select several to group. Each plan's `lines` (from
// po_shipment_plan_line_items) is what PlanShipmentModal.jsx originally
// collected and what EditPlanModal.jsx edits — cbm is always derived from
// these, never typed directly. Scoped to the current member's own plans —
// private until the resulting group is explicitly confirmed (see
// useMyGroups.js / confirmGroup) — except for admin/owner/tech, who see
// every planner's plans (canSeeAllPlans above).
export function useMyShipmentPlans() {
  const { orgMembership } = useProfileStore()
  const memberId = orgMembership?.memberId
  const role = orgMembership?.role
  const dept = orgMembership?.department
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchPlans = useCallback(async () => {
    if (!memberId) { setPlans([]); return }
    setLoading(true)
    let query = supabase
      .from('po_shipment_plans')
      .select(`
        id, po_id, cbm, status, planned_on, planned_by,
        po:purchase_orders (
          po_number,
          buyer_supplier_links (
            buyer_org_id,
            supplier_org_id,
            supplier:organizations!buyer_supplier_links_supplier_org_id_fkey ( display_name ),
            buyer:organizations!buyer_supplier_links_buyer_org_id_fkey ( display_name )
          )
        ),
        po_shipment_plan_line_items (
          id, po_line_item_id, quantity, cbm,
          po_line_item:po_line_items ( buyer_sku_ref, sku_variant )
        )
      `)
      .in('status', ['draft', 'pending'])
      .order('planned_on', { ascending: false })
    if (!canSeeAllPlans(role, dept)) query = query.eq('planned_by', memberId)

    const { data, error } = await query

    setLoading(false)
    if (error) { console.error('[useMyShipmentPlans] fetch error:', error.message); return }
    setPlans((data || []).map(p => ({
      ...p,
      po_number: p.po?.po_number ?? null,
      buyer_org_id: p.po?.buyer_supplier_links?.buyer_org_id ?? null,
      supplier_org_id: p.po?.buyer_supplier_links?.supplier_org_id ?? null,
      vendor_name: titleCaseName(p.po?.buyer_supplier_links?.supplier?.display_name) ?? null,
      buyer_name: titleCaseName(p.po?.buyer_supplier_links?.buyer?.display_name) ?? null,
      lines: (p.po_shipment_plan_line_items || []).map(l => ({
        id: l.id,
        po_line_item_id: l.po_line_item_id,
        quantity: l.quantity,
        cbm: l.cbm,
        buyer_sku_ref: l.po_line_item?.buyer_sku_ref ?? null,
        sku_variant: l.po_line_item?.sku_variant ?? null,
      })),
    })))
  }, [memberId, role, dept])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  return { plans, loading, refetch: fetchPlans }
}
