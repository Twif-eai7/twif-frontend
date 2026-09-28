import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { titleCaseName } from '../utils/formatters'
import { fetchFinalInspectionStatuses } from '../utils/finalInspectionStatus'

// Fetches one container's invoices -> POs (actual vendor derived live from
// the PO's own supplier relationship, never from the invoice) -> line items.
// Legs are fetched in a second explicit query scoped to the invoice IDs —
// avoids relying on PostgREST FK traversal, and bypasses the RLS gap that
// would block a global po_shipment_leg SELECT.
export function useShipmentContainerDetail(containerId) {
  const [container, setContainer] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchDetail = useCallback(async (id) => {
    if (!id) { setContainer(null); return }
    setLoading(true)

    const { data, error } = await supabase
      .from('shipment_containers')
      .select(`
        id, container_number, flight_vessel, etd, eta, forwarder, container_type, port_of_loading, booking_date, buyer_org_id,
        buyer:organizations!shipment_containers_buyer_org_id_fkey ( display_name ),
        invoices:shipment_invoices (
          id, container_id, primary_vendor_org_id, invoice_number, invoice_date, invoice_value, invoice_currency, additional_charges, cbm, status,
          payment_status, payment_term, tracking_details, invoice_raised_at,
          bl_number, number_of_cartons, bl_file_path, bl_uploaded_at, invoice_file_path, packing_list_file_path, delete_meta,
          primary_vendor:organizations!shipment_invoices_primary_vendor_org_id_fkey ( display_name ),
          shipment_invoice_pos (
            po:purchase_orders (
              id, po_number,
              buyer_supplier_links!inner (
                supplier:organizations!buyer_supplier_links_supplier_org_id_fkey ( id, display_name )
              ),
              po_line_items (
                id, buyer_sku_ref, sku_variant, quantity_ordered, unit_price, order_value_usd,
                shipped_quantity, shipped_value_usd, balance_quantity, balance_value_usd,
                cancelled_quantity, status, target_date
              )
            )
          )
        )
      `)
      .eq('id', id)
      // The nested invoices embed has no ORDER BY of its own otherwise, so
      // Postgres falls back to physical scan order — which an UPDATE can
      // reshuffle (the new row version doesn't always land back in the same
      // page). id as a secondary sort for the same tie-stability reasoning
      // as useShipmentGroups.js.
      .order('created_on', { foreignTable: 'invoices', ascending: true })
      .order('id', { foreignTable: 'invoices', ascending: true })
      .single()

    if (error) {
      setLoading(false)
      console.error('[useShipmentContainerDetail] fetch error:', error.message)
      return
    }

    // Fetch legs scoped to this container's invoice IDs only.
    // Requires the "merchant members can view po_shipment_leg" SELECT policy
    // in shipment_containers_rls.sql to be applied in Supabase.
    const invoiceIds = (data.invoices || []).map(inv => inv.id)
    const legsByInvoice = {}      // legsByInvoice[invId][liId] = active (non-reversed) summed qty
    const legRowsByInvoice = {}   // legRowsByInvoice[invId][liId] = [{ id, shipped_quantity, shipped_date, submitted_by, reversed }]

    if (invoiceIds.length) {
      const { data: legs, error: legsError } = await supabase
        .from('po_shipment_leg')
        .select(`
          id, shipment_invoice_id, po_line_item_id, shipped_quantity, shipped_date, delete_meta, edit_history,
          submitted_by:organization_members!po_shipment_leg_created_by_fkey ( full_name )
        `)
        .in('shipment_invoice_id', invoiceIds)

      // Unlike every other query in this hook, this one never checked its
      // own error — a bad embedded-relationship alias or an RLS gap would
      // silently leave every "Shipped this invoice" figure at zero with no
      // trace of why.
      if (legsError) console.error('[useShipmentContainerDetail] legs fetch error:', legsError.message)

      ;(legs || []).forEach(leg => {
        const invId = leg.shipment_invoice_id
        const liId  = leg.po_line_item_id
        const reversed = !!leg.delete_meta

        if (!reversed) {
          if (!legsByInvoice[invId]) legsByInvoice[invId] = {}
          legsByInvoice[invId][liId] = (legsByInvoice[invId][liId] ?? 0) + (leg.shipped_quantity ?? 0)
        }

        if (!legRowsByInvoice[invId]) legRowsByInvoice[invId] = {}
        if (!legRowsByInvoice[invId][liId]) legRowsByInvoice[invId][liId] = []
        legRowsByInvoice[invId][liId].push({
          id: leg.id,
          shipped_quantity: leg.shipped_quantity,
          shipped_date: leg.shipped_date,
          submitted_by: titleCaseName(leg.submitted_by?.full_name) ?? null,
          reversed,
          reversed_reason: leg.delete_meta?.reason ?? null,
          edit_count: (leg.edit_history ?? []).length,
          last_edit_reason: (leg.edit_history ?? []).length
            ? leg.edit_history[leg.edit_history.length - 1].reason
            : null,
        })
      })
    }

    // Which SKUs the merchant actually planned for each (invoice, PO) pair,
    // and how much of each — PlanShipmentModal lets them plan a subset of a
    // PO's line items (and a specific quantity per line), but
    // po.po_line_items above returns every line item ever raised on the PO
    // at its full ordered/balance figures. po_shipment_plans.shipment_invoice_id
    // pins a plan to the specific invoice it was grouped into (set by both
    // create_shipment_plan_group and the "add PO to an existing group" path
    // in useInvoiceDetailsForm.js), so joining through it — not just po_id —
    // is what scopes this correctly per invoice rather than per PO globally.
    // The create_shipment_plan_group guard added alongside multi-plan-per-PO
    // support keeps this to at most one plan per (invoice, po) pair, so a
    // plain Map (not a summed total) is enough per line item.
    const plannedQtyByKey = {} // `${invoiceId}:${poId}` -> Map(po_line_item_id -> quantity)
    if (invoiceIds.length) {
      const { data: plans, error: plansError } = await supabase
        .from('po_shipment_plans')
        .select('po_id, shipment_invoice_id, po_shipment_plan_line_items ( po_line_item_id, quantity )')
        .in('shipment_invoice_id', invoiceIds)

      if (plansError) console.error('[useShipmentContainerDetail] plans fetch error:', plansError.message)

      ;(plans || []).forEach(plan => {
        const key = `${plan.shipment_invoice_id}:${plan.po_id}`
        if (!plannedQtyByKey[key]) plannedQtyByKey[key] = new Map()
        ;(plan.po_shipment_plan_line_items || []).forEach(pli =>
          plannedQtyByKey[key].set(pli.po_line_item_id, (plannedQtyByKey[key].get(pli.po_line_item_id) || 0) + (Number(pli.quantity) || 0)))
      })
    }

    // Final-inspection verdict per line item — Record Shipment is the one
    // place in the reversed shipment flow that actually gates on this
    // (shipment PLANNING deliberately doesn't); the wizard needs it on every
    // line item across every invoice's POs, not just the ones already
    // planned/scoped above.
    const allLineItemIds = (data.invoices || [])
      .flatMap(inv => inv.shipment_invoice_pos || [])
      .flatMap(sip => sip.po?.po_line_items || [])
      .map(li => li.id)
    const finalInspectionByLineItem = await fetchFinalInspectionStatuses(allLineItemIds)

    setLoading(false)

    setContainer({
      ...data,
      buyer_name: titleCaseName(data.buyer?.display_name) ?? null,
      invoices: (data.invoices || []).filter(inv => !inv.delete_meta).map(inv => {
        const pos = (inv.shipment_invoice_pos || [])
          .map(sip => sip.po)
          .filter(Boolean)
          .map(po => {
            const plannedQty = plannedQtyByKey[`${inv.id}:${po.id}`]
            // No plan found for this PO in this invoice (legacy data from
            // before plan-level SKU tracking existed) falls back to every
            // line item rather than silently hiding the whole PO.
            const lineItems = (plannedQty?.size
              ? (po.po_line_items || []).filter(li => plannedQty.has(li.id))
              : (po.po_line_items || [])
            ).map(li => {
              const finalInspection = finalInspectionByLineItem[li.id] ?? null
              // What's actually still shippable per inspection: cumulative
              // Final-accepted quantity (across every submitted round) minus
              // what's already gone out — NOT just "did the latest round read
              // Accepted", which says nothing about how much quantity that
              // verdict actually covers (see fetchFinalInspectionStatuses).
              const finalInspectionShippableQty = Math.max(0, (finalInspection?.cumulativeAccepted || 0) - (li.shipped_quantity || 0))
              // What the merchant actually planned for this SKU — used to
              // prefill the Record Shipment wizard's qty field (still
              // editable; logistics may have to ship a different amount).
              const plannedQuantity = plannedQty?.get(li.id) ?? null
              return { ...li, finalInspection, finalInspectionShippableQty, plannedQuantity }
            })
            return {
              ...po,
              actual_vendor_id: po.buyer_supplier_links?.supplier?.id ?? null,
              actual_vendor_name: titleCaseName(po.buyer_supplier_links?.supplier?.display_name) ?? null,
              po_line_items: lineItems,
              value: lineItems.reduce((sum, li) => sum + (Number(li.balance_value_usd) || 0), 0),
            }
          })
        return {
          ...inv,
          primary_vendor_name: titleCaseName(inv.primary_vendor?.display_name) ?? null,
          legsByLineItem: legsByInvoice[inv.id] ?? {},
          legRowsByLineItem: legRowsByInvoice[inv.id] ?? {},
          pos,
          // Same balance-value figure PendingWorkOverview.jsx's Value column
          // and InvoiceGroupsPane.jsx's own calculated_value show — an
          // invoice can still be unraised (invoice_value null) even once
          // booked (see useShipmentGroups.js), so the Containers-tab Edit
          // Invoice modal needs this prefill too, not just the Invoices tab.
          calculated_value: pos.reduce((sum, po) => sum + (Number(po.value) || 0), 0),
        }
      }),
    })
  }, [])

  useEffect(() => { fetchDetail(containerId) }, [containerId, fetchDetail])

  return { container, loading, refetch: () => fetchDetail(containerId) }
}
