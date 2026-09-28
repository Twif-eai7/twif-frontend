import { supabase } from '../lib/supabase'
import { RESULT_LABEL, RESULT_BADGE_CLASS } from '../components/qualityCompliance/inspectionReport/stageStatus.jsx'

// Lightweight counterpart to useInspectionReportsForPo + stageStatus.jsx's
// getStage/getStageRollup, for call sites outside the Quality module that
// only need one SKU's Final-inspection standing (shipment planning's
// informational badge, Record Shipment's hard gate) — not every stage/round
// of every SKU on a PO.
//
// A SKU's Final can be inspected across multiple rounds (round 1 accepted 75
// of 150, round 2 covers the remaining 75) — the LATEST round's own verdict
// alone doesn't say how much quantity has actually cleared inspection so
// far, and a "previous batch" already marked Accepted shouldn't be read as
// covering units from a later, not-yet-inspected batch. So alongside the
// latest round (for the display verdict/label), this also sums
// accepted_quantity across every SUBMITTED round — same cumulative rule
// getStageRollup uses — as `cumulativeAccepted`, which is what gating
// actually keys off.
export async function fetchFinalInspectionStatuses(lineItemIds) {
  const ids = [...new Set(lineItemIds || [])].filter(Boolean)
  if (!ids.length) return {}

  const { data, error } = await supabase
    .from('inspection_reports')
    .select('po_line_item_id, status, inspection_result, round, accepted_quantity, submitted_at')
    .eq('inspection_type', 'final')
    .in('po_line_item_id', ids)
    // Descending so the first row kept per line item below is the latest round.
    .order('round', { ascending: false })

  if (error) {
    console.error('[fetchFinalInspectionStatuses] fetch error:', error.message)
    return {}
  }

  const rowsByLineItem = {}
  ;(data || []).forEach(r => {
    if (!rowsByLineItem[r.po_line_item_id]) rowsByLineItem[r.po_line_item_id] = []
    rowsByLineItem[r.po_line_item_id].push(r)
  })

  const byLineItem = {}
  Object.entries(rowsByLineItem).forEach(([lineItemId, rows]) => {
    const latest = rows[0]
    const cumulativeAccepted = rows
      .filter(r => r.status === 'submitted')
      .reduce((sum, r) => sum + (Number(r.accepted_quantity) || 0), 0)
    byLineItem[lineItemId] = { ...latest, cumulativeAccepted }
  })
  return byLineItem
}

export function finalInspectionLabel(report) {
  if (!report) return 'Not Inspected'
  const verdict = report.status !== 'submitted' ? 'In Progress' : (RESULT_LABEL[report.inspection_result] ?? report.inspection_result)
  // Only surface the number once there's a real submitted round behind it —
  // an in-progress draft's accepted_quantity (if any) isn't a real verdict
  // yet, same reasoning cumulativeAccepted itself only sums submitted rows.
  return report.cumulativeAccepted > 0 ? `${verdict} (${report.cumulativeAccepted})` : verdict
}

export function finalInspectionBadgeClass(report) {
  if (!report) return 'bg-gray-100 text-gray-500'
  if (report.status !== 'submitted') return 'bg-amber-100 text-amber-800'
  return RESULT_BADGE_CLASS[report.inspection_result] ?? 'bg-gray-100 text-gray-500'
}
