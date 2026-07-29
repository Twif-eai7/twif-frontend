import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useMemberId } from '../stores/profileStore'
import { titleCaseName } from '../utils/formatters'

// The current member's own not-yet-grouped PO shipment plans (still 'draft',
// or the now-vestigial 'pending' from before grouping moved to drafts) —
// feeds MyShipmentPlansDrawer.jsx, where a merchant can edit CBM, withdraw,
// or select several to group. Fully private until the resulting group is
// explicitly confirmed (see useMyGroups.js / confirmGroup).
export function useMyShipmentPlans() {
  const memberId = useMemberId()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchPlans = useCallback(async () => {
    if (!memberId) { setPlans([]); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('po_shipment_plans')
      .select(`
        id, po_id, cbm, status, planned_on,
        po:purchase_orders (
          po_number,
          buyer_supplier_links (
            buyer_org_id,
            supplier_org_id,
            supplier:organizations!buyer_supplier_links_supplier_org_id_fkey ( display_name ),
            buyer:organizations!buyer_supplier_links_buyer_org_id_fkey ( display_name )
          )
        )
      `)
      .eq('planned_by', memberId)
      .in('status', ['draft', 'pending'])
      .order('planned_on', { ascending: false })

    setLoading(false)
    if (error) { console.error('[useMyShipmentPlans] fetch error:', error.message); return }
    setPlans((data || []).map(p => ({
      ...p,
      po_number: p.po?.po_number ?? null,
      buyer_org_id: p.po?.buyer_supplier_links?.buyer_org_id ?? null,
      supplier_org_id: p.po?.buyer_supplier_links?.supplier_org_id ?? null,
      vendor_name: titleCaseName(p.po?.buyer_supplier_links?.supplier?.display_name) ?? null,
      buyer_name: titleCaseName(p.po?.buyer_supplier_links?.buyer?.display_name) ?? null,
    })))
  }, [memberId])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  return { plans, loading, refetch: fetchPlans }
}
