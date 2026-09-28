import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { titleCaseName } from '../utils/formatters'
import { sumByCurrency } from '../components/orderManagement/poUtils'

// shipment_invoices.status is now a plain manually-set column (see
// sql/shipment_invoice_manual_status.sql) — logistics sets it explicitly from
// PendingWorkOverview.jsx's dropdown, rather than the app deriving it from
// invoice_raised_at/container_id (that auto-resolution proved unreliable
// once a container was actually involved). 'not_raised' keeps the 'group'
// key this file's actionLabel/isGroupComplete/GroupDetailsForm already key
// off of, so nothing else here needs to change.
function statusKeyFromDb(dbStatus) {
  return dbStatus === 'not_raised' ? 'group' : dbStatus
}

// Logistics Stage-2: every CONFIRMED shipment_invoices row for a buyer,
// spanning every manually-set status (not_raised / raised / booking_pending /
// do_carting_awaited / booked). See sql/po_shipment_plans.sql for the
// original state-machine rationale and sql/shipment_invoice_manual_status.sql
// for why the status itself is now a plain column instead of derived.
// Unconfirmed groups (the merchant is still assembling them, hasn't hit
// "Confirm" yet) never show up here — that's the whole point of
// confirmed_at (sql/group_confirmation.sql): logistics only sees a group
// once the merchant says it's ready.
export function useShipmentGroups(buyerOrgId) {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchGroups = useCallback(async () => {
    if (!buyerOrgId) { setGroups([]); return }
    setLoading(true)

    const { data, error } = await supabase
      .from('shipment_invoices')
      .select(`
        id, invoice_number, invoice_raised_at, invoice_date, invoice_value, invoice_currency, cbm, container_id, created_on, status,
        primary_vendor_org_id, payment_status, payment_term, tracking_details,
        additional_charges, invoice_file_path, packing_list_file_path,
        primary_vendor:organizations!shipment_invoices_primary_vendor_org_id_fkey ( display_name ),
        container:shipment_containers ( container_number ),
        shipment_invoice_pos (
          po:purchase_orders (
            id, po_number, currency, amount, amount_usd,
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
      .eq('buyer_org_id', buyerOrgId)
      .not('confirmed_at', 'is', null)
      .is('delete_meta', null)
      // id as a secondary sort — created_on alone has no tiebreaker, and
      // Postgres doesn't guarantee stable order for ties (editing a row
      // writes a new version that can shift where it lands among ties).
      .order('created_on', { ascending: false })
      .order('id', { ascending: true })

    setLoading(false)
    if (error) { console.error('[useShipmentGroups] fetch error:', error.message); return }

    setGroups((data || []).map(inv => {
      // Same po_shipment_plans -> po_shipment_plan_line_items join used by
      // useMyGroups.js/usePendingWorkOverview.js — lets each PO's SKU
      // breakdown show on the invoice list card instead of just its number.
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
      // Actual vendor is derived live from each PO's own supplier relationship
      // (never from the invoice's primary_vendor_org_id) — a PO can piggyback
      // onto another vendor's invoice, same convention as ContainerDetail.
      const pos = (inv.shipment_invoice_pos || []).map(sip => sip.po).filter(Boolean).map(po => {
        const currency = po.currency || 'USD'
        // Same figure usePendingWorkOverview.js sums for its Value column —
        // this plan's own quantity × the SKU's unit_price, shown in the PO's
        // own currency now rather than converted to USD. Not the line's
        // overall remaining balance value, which doesn't scale down for a
        // plan that only covers part of that balance (a partial shipment/batch).
        const lines = (linesByPoId[po.id] ?? []).map(l => ({
          ...l,
          currency,
          value: l.unit_price != null ? l.quantity * l.unit_price : null,
        }))
        return {
          ...po,
          actual_vendor_id: po.buyer_supplier_links?.supplier?.id ?? null,
          actual_vendor_name: titleCaseName(po.buyer_supplier_links?.supplier?.display_name) ?? null,
          currency,
          value: lines.reduce((sum, l) => sum + (Number(l.value) || 0), 0),
          lines,
        }
      })
      // A single-currency invoice (every PO booked the same way — the
      // common case) can still sum straight to one meaningful number, now
      // in that shared currency instead of USD. A mixed-currency invoice
      // has no single meaningful total, so calculated_value stays null
      // (leaves the Invoice Value field blank for manual entry) rather than
      // silently summing unlike currencies into a nonsense figure.
      const poCurrencies = new Set(pos.map(po => po.currency))
      const singleCurrency = poCurrencies.size === 1 ? [...poCurrencies][0] : null
      return {
        ...inv,
        status: statusKeyFromDb(inv.status),
        container_number: inv.container?.container_number ?? null,
        primary_vendor_name: titleCaseName(inv.primary_vendor?.display_name) ?? null,
        pos,
        po_numbers: pos.map(po => po.po_number).filter(Boolean),
        // Feeds the "Invoice Value" field's default prefill (and currency
        // default) in useInvoiceDetailsForm.js.
        calculated_value: singleCurrency != null ? pos.reduce((sum, po) => sum + (Number(po.value) || 0), 0) : null,
        calculated_value_currency: singleCurrency,
        // Per-currency subtotals for list-card display, same convention as
        // usePendingWorkOverview.js/useInvoiceLegReconciliation.js.
        valueByCurrency: sumByCurrency(pos.map(po => ({ currency: po.currency, value: po.value }))),
      }
    }))
  }, [buyerOrgId])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  return { groups, loading, refetch: fetchGroups }
}
