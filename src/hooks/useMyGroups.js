import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useProfileStore } from '../stores/profileStore'
import { resolveBuyerOrgsForMember } from '../lib/poQueries'
import { titleCaseName } from '../utils/formatters'

// The current member's own not-yet-booked groups, across every buyer they
// have access to — feeds MyShipmentPlansDrawer.jsx's "My Groups" section.
// Grouping is merchandising-only now (logistics has zero edit rights on
// composition), so only groups still open for editing (container_id IS
// NULL) are relevant here — once booked, editing moves entirely to
// logistics. A group can be Save'd (placeholder invoice_number) or even
// formally Raised and still show up here, right up until it's physically
// booked into a container — see sql/invoice_raised_at.sql.
export function useMyGroups() {
  const { orgMembership } = useProfileStore()
  const memberId = orgMembership?.memberId

  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchGroups = useCallback(async () => {
    if (!memberId) { setGroups([]); return }
    setLoading(true)

    const buyerIds = (await resolveBuyerOrgsForMember(memberId)).map(b => b.id)
    if (buyerIds.length === 0) { setGroups([]); setLoading(false); return }

    const { data, error } = await supabase
      .from('shipment_invoices')
      .select(`
        id, cbm, created_on, buyer_org_id, primary_vendor_org_id, confirmed_at,
        buyer:organizations!shipment_invoices_buyer_org_id_fkey ( display_name ),
        primary_vendor:organizations!shipment_invoices_primary_vendor_org_id_fkey ( display_name ),
        shipment_invoice_pos (
          po:purchase_orders (
            id, po_number,
            buyer_supplier_links!inner (
              supplier:organizations!buyer_supplier_links_supplier_org_id_fkey ( id, display_name )
            )
          )
        ),
        po_shipment_plans ( po_id, cbm )
      `)
      .in('buyer_org_id', buyerIds)
      .is('container_id', null)
      .is('delete_meta', null)
      // id as a secondary sort — same tie-stability reasoning as useShipmentGroups.js
      .order('created_on', { ascending: false })
      .order('id', { ascending: true })

    setLoading(false)
    if (error) { console.error('[useMyGroups] fetch error:', error.message); return }

    setGroups((data || []).map(inv => {
      const cbmByPoId = Object.fromEntries((inv.po_shipment_plans || []).map(p => [p.po_id, p.cbm]))
      const pos = (inv.shipment_invoice_pos || []).map(sip => sip.po).filter(Boolean).map(po => ({
        ...po,
        actual_vendor_id: po.buyer_supplier_links?.supplier?.id ?? null,
        actual_vendor_name: titleCaseName(po.buyer_supplier_links?.supplier?.display_name) ?? null,
        cbm: cbmByPoId[po.id] ?? null,
      }))
      return {
        ...inv,
        buyer_name: titleCaseName(inv.buyer?.display_name) ?? null,
        primary_vendor_name: titleCaseName(inv.primary_vendor?.display_name) ?? null,
        pos,
        po_numbers: pos.map(po => po.po_number).filter(Boolean),
      }
    }))
  }, [memberId])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  return { groups, loading, refetch: fetchGroups }
}
