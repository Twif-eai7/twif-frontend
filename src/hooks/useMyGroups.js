import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useProfileStore } from '../stores/profileStore'
import { resolveBuyerOrgsForMember } from '../lib/poQueries'
import { titleCaseName } from '../utils/formatters'
import { sumByCurrency } from '../components/orderManagement/poUtils'

// The current member's own groups, across every buyer they have access to —
// feeds MyShipmentPlansDrawer.jsx's "My Groups" section, including the
// "Booked" tab. Grouping is merchandising-only (logistics has zero edit
// rights on composition), but a booked group still stays visible here
// read-only rather than disappearing once it's done — a merchant losing
// track of where their own PO ended up was worse than a permanently-locked
// card. A group can be Save'd (placeholder invoice_number), formally Raised,
// or fully Booked and still show up here — see sql/invoice_raised_at.sql /
// sql/shipment_containers.sql. `status` is the same manually-set column
// logistics edits from PendingWorkOverview.jsx (see
// sql/shipment_invoice_manual_status.sql) — the drawer's Confirmed-tab badge
// and the Confirmed/Booked tab split both key off it directly rather than
// container_id, so a group only moves to the Booked tab once logistics has
// actually marked it booked, not merely once a container gets attached.
// container_number still comes along for the Booked-tab card's own display —
// see isContainerNumberConfirmed in formatters.js; a container's number is
// often left as its "TBA" placeholder until the real one is known.
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
        id, cbm, created_on, buyer_org_id, primary_vendor_org_id, confirmed_at, invoice_raised_at, container_id, status,
        buyer:organizations!shipment_invoices_buyer_org_id_fkey ( display_name ),
        primary_vendor:organizations!shipment_invoices_primary_vendor_org_id_fkey ( display_name ),
        container:shipment_containers ( container_number ),
        shipment_invoice_pos (
          po:purchase_orders (
            id, po_number, currency,
            buyer_supplier_links!inner (
              supplier:organizations!buyer_supplier_links_supplier_org_id_fkey ( id, display_name )
            )
          )
        ),
        po_shipment_plans (
          po_id, cbm,
          po_shipment_plan_line_items (
            id, po_line_item_id, quantity, cbm,
            po_line_item:po_line_items ( buyer_sku_ref, sku_variant, unit_price )
          )
        )
      `)
      .in('buyer_org_id', buyerIds)
      .is('delete_meta', null)
      // id as a secondary sort — same tie-stability reasoning as useShipmentGroups.js
      .order('created_on', { ascending: false })
      .order('id', { ascending: true })

    setLoading(false)
    if (error) { console.error('[useMyGroups] fetch error:', error.message); return }

    setGroups((data || []).map(inv => {
      const cbmByPoId = Object.fromEntries((inv.po_shipment_plans || []).map(p => [p.po_id, p.cbm]))
      const linesByPoId = Object.fromEntries((inv.po_shipment_plans || []).map(p => [
        p.po_id,
        (p.po_shipment_plan_line_items || []).map(l => ({
          id: l.id,
          po_line_item_id: l.po_line_item_id,
          quantity: l.quantity,
          cbm: l.cbm,
          unit_price: l.po_line_item?.unit_price ?? null,
          buyer_sku_ref: l.po_line_item?.buyer_sku_ref ?? null,
          sku_variant: l.po_line_item?.sku_variant ?? null,
        })),
      ]))
      const pos = (inv.shipment_invoice_pos || []).map(sip => sip.po).filter(Boolean).map(po => {
        const currency = po.currency || 'USD'
        // Same quantity × unit_price convention as useShipmentGroups.js —
        // shown in the PO's own currency, not converted to USD.
        const lines = (linesByPoId[po.id] ?? []).map(l => ({
          ...l,
          currency,
          value: l.unit_price != null ? l.quantity * l.unit_price : null,
        }))
        return {
          ...po,
          actual_vendor_id: po.buyer_supplier_links?.supplier?.id ?? null,
          actual_vendor_name: titleCaseName(po.buyer_supplier_links?.supplier?.display_name) ?? null,
          cbm: cbmByPoId[po.id] ?? null,
          currency,
          value: lines.reduce((sum, l) => sum + (Number(l.value) || 0), 0),
          lines,
        }
      })
      return {
        ...inv,
        buyer_name: titleCaseName(inv.buyer?.display_name) ?? null,
        primary_vendor_name: titleCaseName(inv.primary_vendor?.display_name) ?? null,
        container_number: inv.container?.container_number ?? null,
        pos,
        po_numbers: pos.map(po => po.po_number).filter(Boolean),
        // Per-currency subtotals for the group's total card — a group can
        // combine POs booked in different currencies, so there's no single
        // meaningful total without converting (same convention as
        // usePendingWorkOverview.js/useShipmentGroups.js).
        valueByCurrency: sumByCurrency(pos.map(po => ({ currency: po.currency, value: po.value }))),
      }
    }))
  }, [memberId])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  return { groups, loading, refetch: fetchGroups }
}
