import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useProfileStore } from '../stores/profileStore'
import { resolveBuyerOrgsForMember } from '../lib/poQueries'
import { titleCaseName } from '../utils/formatters'
import { impliedRateFor, sumByCurrency } from '../components/orderManagement/poUtils'

// Same visibility rule as usePendingWorkOverview.js/useBuyerOptions.js.
function canSeeAll(role, dept) {
  return role === 'admin' || role === 'owner' || dept === 'tech'
}

// Reconciliation view: every non-deleted shipment_invoices row across every
// buyer this member can see, each with its planned SKU quantities/values
// (po_shipment_plan_line_items — what merchandising said would ship) set
// against what's actually been recorded shipped (po_shipment_leg — what
// logistics actually entered in the Record Shipment wizard). Deliberately
// NOT gated on confirmed_at the way logistics-facing views are — a bare,
// still-being-assembled group is exactly the kind of row a finance
// reconciliation should still be able to see (0 shipped vs 0 planned is a
// legitimate, uninteresting row, not one to hide).
export function useInvoiceLegReconciliation() {
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
        id, invoice_number, invoice_date, status, created_on, buyer_org_id,
        invoice_value, invoice_value_usd, invoice_currency, cbm, bl_number,
        buyer:organizations!shipment_invoices_buyer_org_id_fkey ( display_name ),
        container:shipment_containers ( etd ),
        shipment_invoice_pos (
          po:purchase_orders (
            id, po_number, amount, currency, amount_usd,
            buyer_supplier_links (
              supplier:organizations!buyer_supplier_links_supplier_org_id_fkey ( display_name )
            )
          )
        ),
        po_shipment_plans (
          po_id,
          po_shipment_plan_line_items (
            id, po_line_item_id, quantity,
            po_line_item:po_line_items ( buyer_sku_ref, sku_variant, quantity_ordered, order_value_usd, unit_price )
          )
        )
      `)
      .is('delete_meta', null)
      // id as a secondary sort — same tie-stability reasoning as useShipmentGroups.js
      .order('created_on', { ascending: false })
      .order('id', { ascending: true })
    if (buyerIds) invoiceQuery = invoiceQuery.in('buyer_org_id', buyerIds)

    const { data, error } = await invoiceQuery
    if (error) { console.error('[useInvoiceLegReconciliation] fetch error:', error.message); setLoading(false); return }

    // Legs fetched separately and scoped by invoice id — same approach
    // useShipmentContainerDetail.js uses (embedding po_shipment_leg directly
    // needs a known FK constraint name; a flat scoped query is the tested,
    // working path, including the RLS policy it already depends on).
    const invoiceIds = (data || []).map(inv => inv.id)
    const shippedByInvoiceLine = {} // `${invoiceId}:${lineItemId}` -> shipped qty (active legs only)
    // A line can ship across several legs on different dates (partial
    // shipments) — same "latest leg's own date" convention
    // sql/sku_summary_rpc_reconciled.sql uses, since there's no single
    // correct date for a partially-shipped line otherwise.
    const shippedDateByInvoiceLine = {} // `${invoiceId}:${lineItemId}` -> latest leg's shipped_date
    if (invoiceIds.length) {
      const { data: legs, error: legsError } = await supabase
        .from('po_shipment_leg')
        .select('shipment_invoice_id, po_line_item_id, shipped_quantity, shipped_date, delete_meta')
        .in('shipment_invoice_id', invoiceIds)
      if (legsError) console.error('[useInvoiceLegReconciliation] legs fetch error:', legsError.message)
      ;(legs || []).forEach(leg => {
        if (leg.delete_meta) return // reversed legs never counted as actually shipped
        const key = `${leg.shipment_invoice_id}:${leg.po_line_item_id}`
        shippedByInvoiceLine[key] = (shippedByInvoiceLine[key] || 0) + (leg.shipped_quantity || 0)
        if (leg.shipped_date && (!shippedDateByInvoiceLine[key] || leg.shipped_date > shippedDateByInvoiceLine[key])) {
          shippedDateByInvoiceLine[key] = leg.shipped_date
        }
      })
    }

    setInvoices((data || []).map(inv => {
      const planLinesByPoId = Object.fromEntries((inv.po_shipment_plans || []).map(p => [p.po_id, p.po_shipment_plan_line_items || []]))

      const pos = (inv.shipment_invoice_pos || []).map(sip => sip.po).filter(Boolean).map(po => {
        const currency = po.currency || 'USD'
        // unit_price is already in the PO's own currency — shown as-is now
        // instead of converted to USD, so it's just the real booked number,
        // never a live/implied rate drifting from it. order_value_usd/rate
        // is only a fallback for the rare line missing unit_price, reverse-
        // converted back to the PO's currency (it was itself derived via
        // that same rate, so this recovers the original number exactly for
        // a USD PO — rate is always 1 — and as closely as the implied rate
        // allows otherwise).
        const rate = impliedRateFor(po)
        const lines = (planLinesByPoId[po.id] ?? []).map(l => {
          const li = l.po_line_item || {}
          const perUnit = li.unit_price != null
            ? li.unit_price
            : (li.quantity_ordered && rate ? (li.order_value_usd ?? 0) / li.quantity_ordered / rate : null)
          const plannedQty = l.quantity ?? 0
          const key = `${inv.id}:${l.po_line_item_id}`
          const shippedQty = shippedByInvoiceLine[key] || 0
          const orderQty = li.quantity_ordered ?? 0
          return {
            id: l.id,
            po_line_item_id: l.po_line_item_id,
            buyer_sku_ref: li.buyer_sku_ref ?? null,
            sku_variant: li.sku_variant ?? null,
            orderQty,
            plannedQty,
            // Order - Planned — how much of the PO's ordered quantity hasn't
            // been allocated to a shipment plan yet, NOT order - shipped
            // (po_line_items.balance_quantity elsewhere means the latter).
            // Floored at 0 — an over-planned line (planned > ordered) has no
            // negative "remaining to plan", just none left.
            balanceQty: Math.max(orderQty - plannedQty, 0),
            shippedQty,
            shippedDate: shippedDateByInvoiceLine[key] ?? null,
            currency,
            plannedValue: perUnit != null ? plannedQty * perUnit : null,
            shippedValue: perUnit != null ? shippedQty * perUnit : null,
          }
        })
        return {
          id: po.id,
          po_number: po.po_number,
          vendor_name: titleCaseName(po.buyer_supplier_links?.supplier?.display_name) ?? null,
          currency,
          lines,
        }
      })

      const allLines = pos.flatMap(po => po.lines)
      const plannedQty = allLines.reduce((s, l) => s + l.plannedQty, 0)
      const shippedQty = allLines.reduce((s, l) => s + l.shippedQty, 0)
      // Per-currency subtotals, not one summed number — an invoice can
      // combine POs booked in different currencies, and there's no
      // meaningful single total across those without converting (which is
      // exactly what showing original currency is trying to avoid).
      const plannedValueByCurrency = sumByCurrency(allLines.map(l => ({ currency: l.currency, value: l.plannedValue })))
      const shippedValueByCurrency = sumByCurrency(allLines.map(l => ({ currency: l.currency, value: l.shippedValue })))

      return {
        id: inv.id,
        invoice_number: inv.invoice_number,
        status: inv.status,
        bl_number: inv.bl_number,
        buyer_org_id: inv.buyer_org_id,
        buyer_name: titleCaseName(inv.buyer?.display_name) ?? null,
        // Falls back to created_on for a not-yet-raised invoice, which has
        // no invoice_date of its own yet.
        date: inv.invoice_date || inv.created_on,
        // Only set once this invoice is actually booked into a container —
        // null for every not_raised/raised/booking_pending row, which is
        // most of this table most of the time.
        etd: inv.container?.etd ?? null,
        declaredValue: inv.invoice_value,
        declaredValueUsd: inv.invoice_value_usd,
        declaredCurrency: inv.invoice_currency,
        declaredCbm: inv.cbm,
        pos,
        po_numbers: pos.map(po => po.po_number).filter(Boolean),
        vendor_names: [...new Set(pos.map(po => po.vendor_name).filter(Boolean))],
        plannedQty,
        shippedQty,
        plannedValueByCurrency,
        shippedValueByCurrency,
      }
    }))
    setLoading(false)
  }, [role, dept, memberId])

  useEffect(() => { fetchAll() }, [fetchAll])

  return { invoices, loading, refetch: fetchAll }
}
