import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useProfileStore } from '../stores/profileStore'
import { resolveBuyerOrgsForMember } from '../lib/poQueries'
import { titleCaseName } from '../utils/formatters'

// Same visibility rule as useBuyerOptions.js.
function canSeeAll(role, dept) {
  return role === 'admin' || role === 'owner' || dept === 'tech'
}

function invoiceStatus(inv) {
  // container_id checked first — see the matching comment in useShipmentGroups.js.
  if (inv.container_id) return 'booked'
  if (!inv.invoice_raised_at) return 'group'
  return 'raised'
}

// Cross-buyer visibility for logistics: every CONFIRMED shipment_invoices
// row across every buyer this member can see, spanning all three lifecycle
// states (not raised / raised-unbooked / booked). Bare, still-being-assembled
// plans and groups the merchant hasn't confirmed yet (see
// sql/group_confirmation.sql) never appear here — that's the entire purpose
// of confirmed_at: logistics only finds out once the merchant says it's ready.
export function usePendingWorkOverview() {
  const { orgMembership } = useProfileStore()
  const role = orgMembership?.role
  const dept = orgMembership?.department
  const memberId = orgMembership?.memberId

  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!role) return
    setLoading(true)

    const buyerIds = canSeeAll(role, dept)
      ? null
      : (await resolveBuyerOrgsForMember(memberId)).map(b => b.id)

    if (buyerIds && buyerIds.length === 0) {
      setInvoices([])
      setLoading(false)
      return
    }

    let invoiceQuery = supabase
      .from('shipment_invoices')
      .select(`
        id, invoice_number, invoice_raised_at, container_id, cbm, created_on, buyer_org_id,
        buyer:organizations!shipment_invoices_buyer_org_id_fkey ( display_name ),
        shipment_invoice_pos (
          po:purchase_orders (
            po_number,
            buyer_supplier_links (
              supplier:organizations!buyer_supplier_links_supplier_org_id_fkey ( display_name )
            )
          )
        )
      `)
      .not('confirmed_at', 'is', null)
      .is('delete_meta', null)
      // id as a secondary sort — same tie-stability reasoning as useShipmentGroups.js
      .order('created_on', { ascending: true })
      .order('id', { ascending: true })
    if (buyerIds) invoiceQuery = invoiceQuery.in('buyer_org_id', buyerIds)

    const { data, error } = await invoiceQuery

    setLoading(false)
    if (error) { console.error('[usePendingWorkOverview] fetch error:', error.message); return }

    setInvoices((data || []).map(inv => {
      const pos = (inv.shipment_invoice_pos || []).map(sip => sip.po).filter(Boolean)
      return {
        id: inv.id,
        status: invoiceStatus(inv),
        buyer_org_id: inv.buyer_org_id,
        buyer_name: titleCaseName(inv.buyer?.display_name) ?? null,
        cbm: inv.cbm,
        date: inv.created_on,
        po_numbers: pos.map(po => po.po_number).filter(Boolean),
        vendor_names: [...new Set(pos.map(po => titleCaseName(po.buyer_supplier_links?.supplier?.display_name)).filter(Boolean))],
      }
    }))
  }, [role, dept, memberId])

  useEffect(() => { fetchAll() }, [fetchAll])

  return { invoices, loading, refetch: fetchAll }
}
