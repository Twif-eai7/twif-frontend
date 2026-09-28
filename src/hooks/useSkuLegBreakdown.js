import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { titleCaseName } from '../utils/formatters'

// Individual po_shipment_leg rows behind one PO line item's "shipped" total
// on the Logistics MIS summary table — see sql/sku_leg_breakdown_rpc.sql.
// Fetched on demand (not on mount) since it's drawer content, not part of
// the main table's initial load.
export function useSkuLegBreakdown() {
  const [legs, setLegs] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchLegs = useCallback(async (lineItemId) => {
    if (!lineItemId) { setLegs([]); return }
    setLoading(true)

    const { data, error } = await supabase.rpc('get_sku_leg_breakdown', { p_line_item_id: lineItemId })

    setLoading(false)
    if (error) { console.error('[useSkuLegBreakdown] fetch error:', error.message); setLegs([]); return }

    setLegs((data || []).map(l => ({
      id: l.leg_id,
      shippedQuantity: l.shipped_quantity ?? 0,
      shippedValue: l.shipped_value ?? 0,
      shippedDate: l.shipped_date,
      reversed: l.reversed,
      reversedReason: l.reversed_reason,
      submittedBy: titleCaseName(l.submitted_by) ?? null,
      invoiceNumber: l.invoice_number,
      blNumber: l.bl_number,
      containerNumber: l.container_number,
    })))
  }, [])

  return { legs, loading, fetchLegs }
}
