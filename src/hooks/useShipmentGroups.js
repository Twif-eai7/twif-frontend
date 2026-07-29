import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { titleCaseName } from '../utils/formatters'

function groupStatus(inv) {
  // container_id checked first — a Save'd (never formally raised) invoice
  // can still be booked, and once booked it should always read "Booked",
  // not fall back to "Not Raised" just because invoice_raised_at is null.
  if (inv.container_id) return 'booked'
  if (!inv.invoice_raised_at) return 'group'
  return 'raised'
}

// Logistics Stage-2: every CONFIRMED shipment_invoices row for a buyer,
// spanning all three lifecycle states (bare group / raised-unbooked /
// booked) — a row is distinguished purely by which columns are still null.
// See sql/po_shipment_plans.sql for the full state-machine rationale.
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
        id, invoice_number, invoice_raised_at, invoice_date, invoice_value, invoice_currency, cbm, container_id, created_on,
        primary_vendor_org_id, payment_status, payment_term, tracking_details,
        discount, additional_charges, invoice_file_path, packing_list_file_path,
        primary_vendor:organizations!shipment_invoices_primary_vendor_org_id_fkey ( display_name ),
        shipment_invoice_pos (
          po:purchase_orders (
            id, po_number,
            buyer_supplier_links!inner (
              supplier:organizations!buyer_supplier_links_supplier_org_id_fkey ( id, display_name )
            )
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
      // Actual vendor is derived live from each PO's own supplier relationship
      // (never from the invoice's primary_vendor_org_id) — a PO can piggyback
      // onto another vendor's invoice, same convention as ContainerDetail.
      const pos = (inv.shipment_invoice_pos || []).map(sip => sip.po).filter(Boolean).map(po => ({
        ...po,
        actual_vendor_id: po.buyer_supplier_links?.supplier?.id ?? null,
        actual_vendor_name: titleCaseName(po.buyer_supplier_links?.supplier?.display_name) ?? null,
      }))
      return {
        ...inv,
        status: groupStatus(inv),
        primary_vendor_name: titleCaseName(inv.primary_vendor?.display_name) ?? null,
        pos,
        po_numbers: pos.map(po => po.po_number).filter(Boolean),
      }
    }))
  }, [buyerOrgId])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  return { groups, loading, refetch: fetchGroups }
}
