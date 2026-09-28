import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useProfileStore } from '../stores/profileStore'
import { resolveBuyerOrgsForMember } from '../lib/poQueries'
import { titleCaseName } from '../utils/formatters'
import { fetchFinalInspectionStatuses } from '../utils/finalInspectionStatus'
import { sumByCurrency } from '../components/orderManagement/poUtils'

// Same visibility rule as useBuyerOptions.js.
function canSeeAll(role, dept) {
  return role === 'admin' || role === 'owner' || dept === 'tech'
}

// shipment_invoices.status values map 1:1 onto the keys PendingWorkOverview.jsx's
// STATUS_OPTIONS/TYPE_BADGE already use — 'not_raised' keeps the older 'group'
// key so nothing else in that file needs touching.
function statusKeyFromDb(dbStatus) {
  return dbStatus === 'not_raised' ? 'group' : dbStatus
}
function statusDbFromKey(key) {
  return key === 'group' ? 'not_raised' : key
}

// Cross-buyer visibility for logistics: every CONFIRMED shipment_invoices
// row across every buyer this member can see, spanning all lifecycle states
// (not raised / raised-unbooked / booking awaited / booked). Bare, still-
// being-assembled plans and groups the merchant hasn't confirmed yet (see
// sql/group_confirmation.sql) never appear here — that's the entire purpose
// of confirmed_at: logistics only finds out once the merchant says it's
// ready. `status` itself is a plain manually-set column (see
// sql/shipment_invoice_manual_status.sql) — the app never derives or
// recomputes it from container_id/invoice_raised_at, since real-world
// booking timing doesn't map cleanly onto those columns; logistics sets it
// explicitly via the dropdown this hook's updateStatus feeds.
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
        id, invoice_number, status, container_id, created_on, buyer_org_id, cbm, invoice_raised_at,
        buyer:organizations!shipment_invoices_buyer_org_id_fkey ( display_name ),
        container:shipment_containers ( container_number ),
        shipment_invoice_pos (
          po:purchase_orders (
            id, po_number, currency, amount, amount_usd,
            buyer_supplier_links (
              supplier:organizations!buyer_supplier_links_supplier_org_id_fkey ( display_name )
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
      .not('confirmed_at', 'is', null)
      .is('delete_meta', null)
      // id as a secondary sort — same tie-stability reasoning as useShipmentGroups.js
      .order('created_on', { ascending: true })
      .order('id', { ascending: true })
    if (buyerIds) invoiceQuery = invoiceQuery.in('buyer_org_id', buyerIds)

    const { data, error } = await invoiceQuery

    if (error) { setLoading(false); console.error('[usePendingWorkOverview] fetch error:', error.message); return }

    // Final-inspection verdict per SKU — logistics needs to see this here
    // (before it even gets to Record Shipment, which is the one place it's
    // actually gated) since this is their landing view for what's coming up.
    const allLineItemIds = (data || [])
      .flatMap(inv => inv.po_shipment_plans || [])
      .flatMap(p => p.po_shipment_plan_line_items || [])
      .map(l => l.po_line_item_id)
    const finalInspectionByLineItem = await fetchFinalInspectionStatuses(allLineItemIds)

    setLoading(false)

    setInvoices((data || []).map(inv => {
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
          finalInspection: finalInspectionByLineItem[l.po_line_item_id] ?? null,
        })),
      ]))
      const pos = (inv.shipment_invoice_pos || []).map(sip => sip.po).filter(Boolean).map(po => {
        const currency = po.currency || 'USD'
        // This plan's own quantity × the SKU's unit_price — shown in the
        // PO's own currency now, not converted to USD, so it's the real
        // booked number rather than one that can drift with a live/implied
        // rate. Not the line's overall remaining balance value
        // (balance_quantity × unit_price), which doesn't scale down for a
        // plan that only covers part of that balance (a partial shipment/batch).
        const lines = (linesByPoId[po.id] ?? []).map(l => ({
          ...l,
          currency,
          value: l.unit_price != null ? l.quantity * l.unit_price : null,
        }))
        return {
          id: po.id,
          po_number: po.po_number,
          vendor_name: titleCaseName(po.buyer_supplier_links?.supplier?.display_name) ?? null,
          cbm: cbmByPoId[po.id] ?? null,
          currency,
          value: lines.reduce((sum, l) => sum + (Number(l.value) || 0), 0),
          lines,
        }
      })
      // Pre-raise, EditGroupInline keeps shipment_invoices.cbm forcibly in
      // sync with the sum of the group's own plan CBMs, so live-summing here
      // is equivalent and was just the historical way to get it. Once
      // raised, though, logistics can edit CBM directly (NewInvoiceRow.jsx)
      // — the stored column is the only place that edit lives, so it has to
      // be trusted from that point on instead of the (now stale) plan sum.
      const totalCbm = inv.invoice_raised_at ? (Number(inv.cbm) || 0) : pos.reduce((sum, po) => sum + (Number(po.cbm) || 0), 0)
      // Per-currency subtotals, not one summed number — an invoice can
      // combine POs booked in different currencies.
      const valueByCurrency = sumByCurrency(pos.map(po => ({ currency: po.currency, value: po.value })))
      return {
        id: inv.id,
        status: statusKeyFromDb(inv.status),
        // Whether there's an actual container record to jump to is still a
        // structural fact (container_id set via the real booking flow),
        // independent of what the manual status label currently says.
        isBooked: !!inv.container_id,
        container_id: inv.container_id,
        container_number: inv.container?.container_number ?? null,
        buyer_org_id: inv.buyer_org_id,
        buyer_name: titleCaseName(inv.buyer?.display_name) ?? null,
        cbm: totalCbm,
        valueByCurrency,
        date: inv.created_on,
        pos,
        po_numbers: pos.map(po => po.po_number).filter(Boolean),
        vendor_names: [...new Set(pos.map(po => po.vendor_name).filter(Boolean))],
      }
    }))
  }, [role, dept, memberId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const updateStatus = useCallback(async (invoiceId, statusKey) => {
    const { error } = await supabase.rpc('update_shipment_invoice_status', {
      p_invoice_id: invoiceId,
      p_status: statusDbFromKey(statusKey),
      p_updated_by: memberId,
    })
    if (error) throw error
  }, [memberId])

  return { invoices, loading, refetch: fetchAll, updateStatus }
}
