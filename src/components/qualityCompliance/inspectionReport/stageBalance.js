// Pure quantity rules for the Inline -> Midline -> Final gate and the stage tables.
// A plain module (no JSX) so the lock, the stage tables, bulk Accept and the tests
// share one definition.
//
// Rule: the next stage stays locked until the whole ORDER quantity of a stage is
// resolved - cumulative accepted (all submitted rounds of that stage) plus the
// approved cancelled quantity must cover the order (order 51: Inline accepts 1,
// the 50 must be accepted in another round or cancelled before Midline opens).

// Stages whose earliest submitted round was submitted BEFORE this moment are
// grandfathered (never re-locked); set to the deploy time of this rule.
export const STAGE_BALANCE_RULE_FROM = '2026-09-21T11:44:00Z'

const ACCEPTED = ['accepted', 'partially_accepted', 'accepted_with_deviations']

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Units one round counts as accepted: its own accepted_quantity, or - for an
// accepted-ish round that never recorded one (older reports) - its available
// quantity. Rounds that are not accepted-ish (rejected, plan aborted, on hold,
// feedback) count 0.
export function roundAcceptedQty(r) {
  if (!r || r.status !== 'submitted' || !ACCEPTED.includes(r.inspection_result)) return 0
  if (r.accepted_quantity != null && r.accepted_quantity !== '') return num(r.accepted_quantity)
  return num(r.available_quantity)
}

// Order minus approved cancellations, or null when the order is unknown.
export function orderAfterCancellation(lineItem) {
  if (!lineItem || lineItem.quantity_ordered == null) return null
  return Math.max(0, num(lineItem.quantity_ordered) - num(lineItem.cancelled_quantity))
}

export function submittedRounds(reports, lineItemId, stageKey) {
  return (reports || [])
    .filter(r => r.po_line_item_id === lineItemId && r.inspection_type === stageKey && r.status === 'submitted')
    .sort((a, b) => (a.round ?? 1) - (b.round ?? 1))
}

// Units of the stage's order still unresolved (not accepted, not cancelled).
// null when the order quantity is unknown.
export function stageBalance(reports, lineItem, stageKey) {
  const order = orderAfterCancellation(lineItem)
  if (order == null) return null
  const accepted = submittedRounds(reports, lineItem.id, stageKey).reduce((sum, r) => sum + roundAcceptedQty(r), 0)
  return Math.max(0, order - accepted)
}

// Running balance shown on a stage table row: order after cancellation minus
// everything accepted up to and including `round`.
export function runningShort(reports, lineItem, stageKey, round) {
  const order = orderAfterCancellation(lineItem)
  if (order == null) return null
  const accepted = submittedRounds(reports, lineItem.id, stageKey)
    .filter(r => (r.round ?? 1) <= (round ?? 1))
    .reduce((sum, r) => sum + roundAcceptedQty(r), 0)
  return Math.max(0, order - accepted)
}

// True when the balance rule applies to this stage of this SKU: only stages whose
// EARLIEST submitted round was submitted on/after the rule start. Older stages
// (and reports with no submitted_at) are grandfathered, and a later round never
// changes that.
export function balanceRuleApplies(reports, lineItemId, stageKey) {
  const first = submittedRounds(reports, lineItemId, stageKey)[0]
  if (!first?.submitted_at) return false
  const t = new Date(first.submitted_at).getTime()
  return !Number.isNaN(t) && t >= new Date(STAGE_BALANCE_RULE_FROM).getTime()
}

// Unresolved units that keep the NEXT stage locked, or 0. Only meaningful for
// the prerequisite stage; needs the line item (order + cancelled quantity).
export function blockingBalance(reports, lineItem, prereqStageKey) {
  if (!lineItem || !balanceRuleApplies(reports, lineItem.id, prereqStageKey)) return 0
  return stageBalance(reports, lineItem, prereqStageKey) || 0
}

// Rejected on ANY stage and not yet resolved: the latest submitted round of a
// stage is Rejected, or a submitted Rejected round has no later submitted
// accepted-ish round. Plan Aborted / On Hold are deliberately not rejections.
export function hasUnresolvedRejection(reports, lineItemId) {
  for (const stageKey of ['inline', 'midline', 'final']) {
    const subs = submittedRounds(reports, lineItemId, stageKey)
    let lastRejected = -1
    subs.forEach((r, i) => { if (r.inspection_result === 'rejected') lastRejected = i })
    if (lastRejected === -1) continue
    if (!subs.slice(lastRejected + 1).some(r => ACCEPTED.includes(r.inspection_result))) return true
  }
  return false
}

// Rows for a stage table / card list: one row per SUBMITTED round of each SKU, plus the
// latest round when it is still open (in progress) or a bare placeholder ("not
// started": a draft nobody has opened, no last_step). A SKU with no report at this
// stage is not listed (as before). `short` is the running balance (order after
// cancellation minus everything accepted up to that round); a not-started row has none.
// Shared by the desktop table and the phone cards so they can never disagree.
export function buildStageRows(po, reports, stageKey, visibleTodaySkuIds) {
  const rows = []
  const items = [...(po?.po_line_items ?? [])].sort((a, b) =>
    (a.buyer_sku_ref || '').localeCompare(b.buyer_sku_ref || '', undefined, { numeric: true, sensitivity: 'base' }))
  for (const li of items) {
    const all = (reports || [])
      .filter(r => r.po_line_item_id === li.id && r.inspection_type === stageKey)
      .sort((a, b) => (a.round ?? 1) - (b.round ?? 1))
    if (!all.length) continue
    const submitted = all.filter(r => r.status === 'submitted')
    // Listed when scheduled for today, or when any round of this stage is already submitted.
    if (!visibleTodaySkuIds?.has(li.id) && !submitted.length) continue
    const latest = all[all.length - 1]
    const shown = latest.status === 'submitted' ? submitted : [...submitted, latest]
    for (const report of shown) {
      const isLatest = report.id === latest.id
      const notStarted = report.status !== 'submitted' && report.last_step == null
      rows.push({
        key: report.id,
        li,
        report,
        round: report.round ?? 1,
        isLatest,
        notStarted,
        short: notStarted ? null : runningShort(reports, li, stageKey, report.round),
      })
    }
  }
  return rows
}

// Accepted units of a stage's OTHER submitted rounds (everything except `excludeReportId`, the round
// being edited or submitted right now).
export function acceptedInOtherRounds(reports, lineItemId, stageKey, excludeReportId = null) {
  return submittedRounds(reports, lineItemId, stageKey)
    .filter(r => r.id !== excludeReportId)
    .reduce((sum, r) => sum + roundAcceptedQty(r), 0)
}

// The most Available Qty the next round of a stage may have: what is still unresolved of the order
// (order after cancellation minus what the other rounds accepted). Order 100, Round 1 accepted 70 ->
// Round 2 may have 30. When nothing is left unresolved (a redo of an already covered batch) the full
// order comes back, as before.
export function roundAvailableCap(reports, lineItem, stageKey, excludeReportId = null) {
  const order = orderAfterCancellation(lineItem)
  if (order == null) return null
  const unresolved = order - acceptedInOtherRounds(reports, lineItem.id, stageKey, excludeReportId)
  return unresolved > 0 ? unresolved : order
}

// Units of the order still neither accepted nor cancelled once THIS round is accepted with
// `acceptedQty` (order 100, other rounds accepted 0, this round accepts 70 -> 30). This is the
// "what do you want to do with the rest" quantity, whatever the Available Qty or the schedule say.
export function leftoverAfterAccept({ order, priorAcceptedQty, acceptedQty }) {
  if (order == null || acceptedQty == null) return 0
  return Math.max(0, order - (priorAcceptedQty || 0) - acceptedQty)
}

// What is left over when a round is submitted, and how the leftover screen should be sized.
//   accepted-ish verdict with a typed Accepted Qty -> followUpQty = order (after cancellation) minus the
//     units other rounds accepted minus this round's Accepted Qty, whatever the Available Qty or the
//     schedule say (order 100, Accepted 70 -> 30).
//   any other verdict (Rejected, blank Accepted Qty) -> the earlier formulas, unchanged: `remaining` from
//     the covering schedule entry, `neverInspected` from Available vs the order.
// `neverInspected` now measures against the order AFTER cancellation. Returns { remaining, neverInspected,
// followUpQty, acceptedQty } (acceptedQty is what the schedule note / leftover payload show).
export function computeSubmitFollowUp({
  order = null, priorAcceptedQty = 0, priorAvailableQty = 0, acceptedRaw = null, availableRaw = null,
  scheduledQty = null, covers = false, verdict = false, acceptedVerdict = false, rejected = false,
}) {
  let remaining = 0
  let acceptedQty = 0
  if (covers && scheduledQty != null && verdict) {
    acceptedQty = acceptedRaw ?? 0
    remaining = Math.max(0, rejected
      ? scheduledQty
      : acceptedRaw != null
        ? scheduledQty - acceptedRaw
        : acceptedVerdict ? 0 : scheduledQty)
  }
  let neverInspected = 0
  if (verdict && order != null && availableRaw != null) {
    neverInspected = Math.max(0, order - (priorAvailableQty + availableRaw))
  }
  let followUpQty = remaining + neverInspected
  if (acceptedVerdict && !rejected && order != null && acceptedRaw != null) {
    acceptedQty = acceptedRaw
    followUpQty = leftoverAfterAccept({ order, priorAcceptedQty, acceptedQty: acceptedRaw })
    remaining = Math.max(0, followUpQty - neverInspected)
    // Units cannot be both "never presented" and more than the leftover.
    neverInspected = Math.min(neverInspected, followUpQty)
  }
  return { remaining, neverInspected, followUpQty, acceptedQty }
}
