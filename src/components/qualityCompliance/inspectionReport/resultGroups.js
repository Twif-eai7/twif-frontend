// Results whose submitted round books a fresh re-inspection round, besides
// Rejected: Plan Aborted and On Hold are rescheduled exactly like a rejection.
// A plain module (no JSX) so stageStatus.jsx, the form and the classifier share
// one definition without a circular import.
export const RESCHEDULING_RESULTS = ['plan_aborted', 'on_hold']

// True when a submitted report "closed" its round for rescheduling purposes:
// Rejected always; Plan Aborted / On Hold only once a LATER round of the same
// stage exists (an older one with no next round was never rescheduled).
// `siblings` is any list of reports that includes the later round if present.
export function closedForReinspection(report, siblings) {
  if (!report || report.status !== 'submitted') return false
  if (report.inspection_result === 'rejected') return true
  if (!RESCHEDULING_RESULTS.includes(report.inspection_result)) return false
  return (siblings ?? []).some(o =>
    o.po_line_item_id === report.po_line_item_id && o.inspection_type === report.inspection_type && (o.round ?? 1) > (report.round ?? 1)
  )
}
