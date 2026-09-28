// The Overview's bulk Accept button decides what it may do with each SKU here.
// A plain module (not stageStatus.jsx) on purpose: pure rules with no JSX, so
// the button, its confirmation and any check script share one definition.
import { ACCEPTED_RESULTS } from './stageStatus'
import { RESCHEDULING_RESULTS } from './resultGroups'

// Results the button may CONVERT to Accepted on an already-submitted report:
// only the two "not decided yet" states the user explicitly whitelisted.
// Rejected and Feedback in Progress (and any legacy value) are never
// overwritten by that button - it used to overwrite anything not yet
// accepted, which silently turned real Rejected reports into Accepted.
export const ACCEPT_OVERWRITABLE_RESULTS = ['plan_aborted', 'on_hold']

// Results whose closed round books a fresh re-inspection round (Rejected, and
// now Plan Aborted / On Hold too). A draft round sitting on top of one of these
// is a re-inspection nobody has done yet, so bulk Accept must not accept it.
export const REINSPECT_RESULTS = ['rejected', ...RESCHEDULING_RESULTS]

// What the bulk Accept button should do with ONE SKU's report at one stage.
//   create            no report yet - create one already Accepted
//   accept_draft      an in-progress draft - accept it (as before)
//   accept_overwrite  submitted but Plan Aborted / On Hold - convert to Accepted
//   done              already accepted-ish - not this button's job
//   skip              must NOT be touched; `reason` says why
// `rejectedEarlier` is supplied by the caller - true when the newest
// submitted round below this draft was Rejected. A draft that is a later round
// following a rejection is a re-inspection still waiting to happen, so
// accepting it would accept a SKU nobody re-inspected.
export function classifyAcceptAction(report, { rejectedEarlier = false } = {}) {
  if (!report) return { action: 'create' }
  if (report.status !== 'submitted') {
    if ((report.round ?? 1) > 1 && rejectedEarlier) return { action: 'skip', reason: 'reinspection_pending' }
    return { action: 'accept_draft' }
  }
  const result = report.inspection_result
  if (ACCEPTED_RESULTS.includes(result)) return { action: 'done' }
  if (ACCEPT_OVERWRITABLE_RESULTS.includes(result)) return { action: 'accept_overwrite' }
  if (result === 'feedback_inprogress') return { action: 'skip', reason: 'feedback_inprogress' }
  if (result === 'rejected') return { action: 'skip', reason: 'rejected' }
  return { action: 'skip', reason: 'unknown_result' }
}

// Plain-words label for a skip reason, used in the bulk Accept result note.
export const ACCEPT_SKIP_REASON_LABEL = {
  reinspection_pending: 'Re-inspection pending',
  feedback_inprogress: 'Feedback in Progress',
  rejected: 'Rejected',
  unknown_result: 'Unrecognised result',
  already_accepted: 'Already accepted (changed since the page loaded)',
  balance_pending: 'Earlier stage still has unresolved quantity',
  locked: 'Earlier stage not accepted yet',
}
