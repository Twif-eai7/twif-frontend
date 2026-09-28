import { supabase } from '../lib/supabase'

// A PO can now hold more than one simultaneously-active shipment plan
// (batched shipments), so a SKU's real "still plannable" ceiling is its
// balance_quantity minus whatever's already sitting in another plan that
// hasn't actually shipped yet — not the raw balance alone, or two plans
// could each independently claim the same units.
//
// draft/pending plans always count in full (they can't have shipped
// anything — a plan only gets a shipment_invoice_id once grouped, and legs
// can only be recorded against an invoice). A grouped plan's claim, though,
// has to be netted against whatever's actually been shipped under its own
// invoice: po_shipment_plans never transitions past 'grouped' even after
// the goods physically ship, so a grouped plan whose quantity has already
// been fully realized in po_shipment_leg must stop counting as "committed"
// — otherwise, once shipped, balance_quantity drops (via the DB rollup
// trigger) AND the stale grouped claim would still be subtracted from it,
// double-counting the same units and permanently locking out replanning of
// what's genuinely left. 'cancelled' plans never count.
//
// Fetches broad and reduces in JS (matching this codebase's established
// convention — useInvoiceLegReconciliation.js, usePendingWorkOverview.js —
// rather than relying on PostgREST's nested-embed-filter syntax) since
// there's no existing precedent for the latter in this codebase.
export async function fetchCommittedPlanQuantities(lineItemIds, excludePlanId = null) {
  const ids = [...new Set(lineItemIds || [])].filter(Boolean)
  if (!ids.length) return {}

  const [{ data: planLines, error: planErr }, { data: legs, error: legErr }] = await Promise.all([
    supabase
      .from('po_shipment_plan_line_items')
      .select('po_line_item_id, quantity, plan:po_shipment_plans ( id, status, shipment_invoice_id )')
      .in('po_line_item_id', ids),
    supabase
      .from('po_shipment_leg')
      .select('po_line_item_id, shipment_invoice_id, shipped_quantity')
      .in('po_line_item_id', ids)
      .is('delete_meta', null)
      .not('shipment_invoice_id', 'is', null),
  ])

  if (planErr || legErr) {
    console.error('[fetchCommittedPlanQuantities] fetch error:', planErr?.message || legErr?.message)
    return {}
  }

  // shipped-so-far, per (line item, invoice) — only grouped plans need this,
  // to net a stale claim against what its own invoice already shipped.
  const shippedByLineInvoice = {}
  ;(legs || []).forEach(leg => {
    const key = `${leg.po_line_item_id}:${leg.shipment_invoice_id}`
    shippedByLineInvoice[key] = (shippedByLineInvoice[key] || 0) + (Number(leg.shipped_quantity) || 0)
  })

  const committed = {}
  ;(planLines || []).forEach(row => {
    const plan = row.plan
    if (!plan || !['draft', 'pending', 'grouped'].includes(plan.status)) return
    if (excludePlanId && plan.id === excludePlanId) return

    const qty = Number(row.quantity) || 0
    let outstanding = qty
    if (plan.status === 'grouped' && plan.shipment_invoice_id) {
      const shipped = shippedByLineInvoice[`${row.po_line_item_id}:${plan.shipment_invoice_id}`] || 0
      outstanding = Math.max(0, qty - shipped)
    }
    committed[row.po_line_item_id] = (committed[row.po_line_item_id] || 0) + outstanding
  })
  return committed
}
