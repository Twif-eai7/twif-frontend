import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { titleCaseName } from '../utils/formatters'

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
          id, container_id, primary_vendor_org_id, invoice_number, invoice_date, invoice_value, cbm,
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
      const { data: legs } = await supabase
        .from('po_shipment_leg')
        .select(`
          id, shipment_invoice_id, po_line_item_id, shipped_quantity, shipped_date, delete_meta, edit_history,
          submitted_by:organization_members!po_shipment_leg_created_by_fkey ( full_name )
        `)
        .in('shipment_invoice_id', invoiceIds)

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

    setLoading(false)

    setContainer({
      ...data,
      buyer_name: titleCaseName(data.buyer?.display_name) ?? null,
      invoices: (data.invoices || []).filter(inv => !inv.delete_meta).map(inv => ({
        ...inv,
        primary_vendor_name: titleCaseName(inv.primary_vendor?.display_name) ?? null,
        legsByLineItem: legsByInvoice[inv.id] ?? {},
        legRowsByLineItem: legRowsByInvoice[inv.id] ?? {},
        pos: (inv.shipment_invoice_pos || [])
          .map(sip => sip.po)
          .filter(Boolean)
          .map(po => ({
            ...po,
            actual_vendor_id: po.buyer_supplier_links?.supplier?.id ?? null,
            actual_vendor_name: titleCaseName(po.buyer_supplier_links?.supplier?.display_name) ?? null,
          })),
      })),
    })
  }, [])

  useEffect(() => { fetchDetail(containerId) }, [containerId, fetchDetail])

  return { container, loading, refetch: () => fetchDetail(containerId) }
}
