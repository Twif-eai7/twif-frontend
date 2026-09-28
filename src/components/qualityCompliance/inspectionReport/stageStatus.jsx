// Shared between PoInspectionComments.jsx's SKU list (dots) and
// InspectionReportEntry.jsx's stage buttons — both need the same read of
// "where is this SKU's inspection at" from the same `reports` array.
import { RESCHEDULING_RESULTS } from './resultGroups'
import { blockingBalance } from './stageBalance'

export const STAGES = [
  { key: 'inline', label: 'Inline' },
  { key: 'midline', label: 'Midline' },
  { key: 'final', label: 'Final' },
]
export const STAGE_LABEL = Object.fromEntries(STAGES.map(s => [s.key, s.label]))

// The 9 steps of InspectionForm's wizard — shared so the Activity Log panel
// can look up a step's display label (report.last_step) without duplicating
// this list.
export const STEPS = [
  { key: 'details',     label: 'Inspection Details' },
  { key: 'quantity',    label: 'Quantity Break-up' },
  { key: 'packaging',   label: 'Packaging Appearance' },
  { key: 'measurement', label: 'Measurements & Findings' },
  { key: 'barcodes',    label: 'Barcodes' },
  { key: 'onsite',      label: 'On-site Tests' },
  { key: 'workmanship', label: 'Workmanship' },
  { key: 'digitals',    label: 'Digitals' },
  { key: 'signoff',     label: 'Sign-off' },
  { key: 'preview',     label: 'QC Report Preview' },
]
export const STEP_LABEL = Object.fromEntries(STEPS.map(s => [s.key, s.label]))

// Returns the latest round's row for this stage — Inline/Midline only ever
// have one round, but Final can have more once a re-inspection starts a new
// one (the older round stays in `reports`, read-only, as history).
export function getStage(reports, lineItemId, stageKey) {
  const matches = reports.filter(r => r.po_line_item_id === lineItemId && r.inspection_type === stageKey)
  if (!matches.length) return null
  return matches.reduce((latest, r) => (r.round ?? 1) > (latest.round ?? 1) ? r : latest)
}

// Sums accepted_quantity/available_quantity across every SUBMITTED round of
// a stage for one line item - getStage only ever surfaces the single latest
// round, so a "round 1 accepted 75 of 150, round 2 covers the rest" SKU is
// otherwise invisible: only round 2's own 75 would show, never the true
// 150 total. Used to tell whether a SKU that currently reads "accepted"
// (via its latest round alone) has actually covered its full order across
// multiple rounds, or is still genuinely short - the read-side counterpart
// to InspectionForm.jsx handleSubmit's own `neverInspected` calc, which
// already does this same cumulative sum at submit time to decide whether to
// auto-book a follow-up.
// `uptoRound` scopes the sum to rounds submitted up to and including a
// specific round, instead of every round that exists today - needed when
// viewing/exporting ONE round's own report independently (e.g. via its own
// Inspection Number): round 1 of a 75/70/5-across-3-rounds SKU should read
// "75 of 150, still partial" even after rounds 2 and 3 eventually finish the
// order, not silently show "Accepted" just because the SKU is fully done
// *today*. Left at the default (every submitted round, no cutoff) for the
// summary/list views (sidebar, Overview table, Repository drawer) - those
// always key off the single latest round anyway, so "every round" and
// "every round up to the latest" are the same set there.
export function getStageRollup(reports, lineItemId, stageKey, uptoRound = Infinity) {
  const submitted = reports.filter(r =>
    r.po_line_item_id === lineItemId && r.inspection_type === stageKey && r.status === 'submitted' && (r.round ?? 1) <= uptoRound
  )
  return {
    cumulativeAccepted: submitted.reduce((sum, r) => sum + (Number(r.accepted_quantity) || 0), 0),
    cumulativeAvailable: submitted.reduce((sum, r) => sum + (Number(r.available_quantity) || 0), 0),
    roundCount: submitted.length,
  }
}

// The most recent submitted+rejected round for a stage, independent of
// whether a newer (still-draft) round now exists - unlike getStage, this
// deliberately looks past the latest round so a SKU whose rejected Final
// already started a fresh round (see InspectionForm.jsx's submit handler)
// still reads as "was rejected" for history/badging purposes, even though
// getStage itself now points at the fresh draft round.
// Plan Aborted and On Hold are handled exactly like Rejected: submitting one
// closes that round and books a fresh round (see InspectionForm.jsx's submit
// handler), so they count here too - but only once a LATER round of the same
// stage exists. An older Plan Aborted/On Hold report that never got a next
// round (submitted before this rule) was not rescheduled, so it must not read
// as such.
export function wasStageRejected(reports, lineItemId, stageKey) {
  const stageReports = reports.filter(r => r.po_line_item_id === lineItemId && r.inspection_type === stageKey)
  const rejectedRounds = stageReports.filter(r =>
    r.status === 'submitted' && (
      r.inspection_result === 'rejected'
      || (RESCHEDULING_RESULTS.includes(r.inspection_result) && stageReports.some(o => (o.round ?? 1) > (r.round ?? 1)))
    )
  )
  if (!rejectedRounds.length) return null
  return rejectedRounds.reduce((latest, r) => (r.round ?? 1) > (latest.round ?? 1) ? r : latest)
}

// Same idea as wasStageRejected, but across all three stages at once - a
// rejection auto-books its own fresh round at WHICHEVER stage it happened on
// (InspectionForm.jsx's submit handler, no longer Final-only), so the
// sidebar's Rejected/Re-Scheduled card split and the Overview table's
// SKU-name badge need to know "was any stage of this SKU ever rejected",
// not just Final. Picks the single most recently rejected stage when more
// than one exists (submitted_at, falling back to round if that's ever
// missing/equal) - one badge per SKU, not one per stage.
export function wasAnyStageRejected(reports, lineItemId) {
  const rejectedByStage = STAGES.map(({ key }) => wasStageRejected(reports, lineItemId, key)).filter(Boolean)
  if (!rejectedByStage.length) return null
  return rejectedByStage.reduce((latest, r) => {
    const rTime = r.submitted_at ? new Date(r.submitted_at).getTime() : 0
    const latestTime = latest.submitted_at ? new Date(latest.submitted_at).getTime() : 0
    return rTime !== latestTime ? (rTime > latestTime ? r : latest) : ((r.round ?? 1) > (latest.round ?? 1) ? r : latest)
  })
}

// The most recent SUBMITTED round for a stage, independent of whether a
// newer (still-draft) round now exists on top of it - the general-purpose
// counterpart to wasStageRejected above, which only looks past the latest
// round for a rejected result. A Final that was submitted "Partially
// Accepted" (say) and then had a fresh draft round opened on top of it (a
// leftover-quantity re-inspection, a Rework re-open, etc.) still has a real,
// sendable submitted report - getStage alone would miss it since it only
// ever returns the single latest round, submitted or not.
export function mostRecentSubmittedRound(reports, lineItemId, stageKey) {
  const submittedRounds = reports.filter(r =>
    r.po_line_item_id === lineItemId && r.inspection_type === stageKey && r.status === 'submitted'
  )
  if (!submittedRounds.length) return null
  return submittedRounds.reduce((latest, r) => (r.round ?? 1) > (latest.round ?? 1) ? r : latest)
}

// A SKU's Final stage being submitted WITH A REAL VERDICT freezes all 3
// stages, even ones that were never started or left in draft. Submitting
// Final with a workflow state (Plan Aborted/On Hold) instead doesn't freeze
// anything - it's not an actual outcome yet, so Inline/Midline/Final all
// stay open until Final gets its real verdict. Reads only the LATEST Final
// round - a rejected Final that already started a fresh round (see
// InspectionForm.jsx's submit handler) must read as "not finalized" again,
// even though an older round is still sitting in `reports` as history.
export function isFinalized(reports, lineItemId) {
  const final = getStage(reports, lineItemId, 'final')
  return final?.status === 'submitted' && VERDICT_RESULTS.includes(final.inspection_result)
}

// True once a SKU has ANY submitted report at all, any stage/round - used
// alongside "still actively scheduled" / "finalized" to decide whether a SKU
// stays visible in the Overview table and sidebar list. A SKU whose Inline
// and Midline are both done (satisfying those entries, so they drop out of
// skuScheduleInfo) but whose Final hasn't been scheduled yet is neither
// "scheduled" nor "finalized" - without this check it fell through both
// filters and vanished from the PO entirely, even though it has real,
// frozen (submitted) inspection history that should stay visible.
export function hasAnySubmittedReport(reports, lineItemId) {
  return reports.some(r => r.po_line_item_id === lineItemId && r.status === 'submitted')
}

// This SKU's currently-reworkable stage, if any - whichever of Final/
// Midline/Inline (checked furthest-first) has a submitted, accepted-ish
// latest round. Backs the Rework request flow (InspectionReportEntry.jsx's
// Rework button, ReworkRequestModal.jsx): only a stage that's actually
// locked behind an accepted verdict is worth requesting a redo of - a
// rejected stage already gets its own automatic reinspection with no
// approval needed (see InspectionForm.jsx's submit handler), and a stage
// that's still draft/unsubmitted is just directly editable already.
export function getReworkableStage(reports, lineItemId) {
  for (const stage of ['final', 'midline', 'inline']) {
    const report = getStage(reports, lineItemId, stage)
    if (report?.status === 'submitted' && ACCEPTED_RESULTS.includes(report.inspection_result)) {
      return { inspection_type: stage, round: report.round ?? 1, report_id: report.id }
    }
  }
  return null
}

// A Final report can exist purely to hold this SKU's Overview-table Accepted
// number (InspectionReportEntry.jsx's saveAcceptedValue writes
// accepted_quantity onto a bare draft row, creating one if none exists yet)
// with no actual Final inspection ever opened. `last_step` is only ever set
// by the wizard's own save path (InspectionForm.jsx's persistOrCreate), so
// its absence is a clean signal that nothing beyond the accepted number has
// happened — draft/in-progress indicators should read that as "not started",
// not "Draft", so entering a number doesn't make the SKU look mid-inspection.
export function isAcceptedOnlyDraft(report) {
  return report?.status === 'draft' && report.last_step == null
}

// Roll a jsonb check group ({rowKey: {result}}) into one verdict.
// Deliberately reads Object.values() rather than importing the row-key
// constants — the group's shape can grow (e.g. On-site went 4 -> 22 rows)
// without this needing to change.
// Returns 'fail' | 'pass' | 'na' | null, where null means "nothing recorded
// yet" — kept distinct from 'na' ("explicitly marked N/A") on purpose.
// Rows explicitly marked `performed: 'no'` (On-site Tests only — the other
// groups never set this key, so the filter is a no-op for them) don't count
// toward the rollup even if they still carry a stale result from before
// being opted out — a test that wasn't run shouldn't flip the SKU's verdict.
export function rollupResult(group) {
  const results = Object.values(group || {})
    .filter(v => v?.performed !== 'no')
    .map(v => v?.result)
    .filter(Boolean)
  if (!results.length) return null
  if (results.includes('fail')) return 'fail'
  if (results.includes('pass')) return 'pass'
  return 'na'
}

export function defectTotals(report) {
  return (report?.inspection_report_defects ?? []).reduce((a, d) => ({
    critical: a.critical + Number(d.critical_count || 0),
    major:    a.major    + Number(d.major_count   || 0),
    minor:    a.minor    + Number(d.minor_count   || 0),
  }), { critical: 0, major: 0, minor: 0 })
}

// Full label set for every Overall Result value the legacy system ever
// wrote, kept independent of the selectable dropdown options below so a
// report already saved with a now-retired value (Making a Plan/Plan Ready/
// Feedback Inprogress/Resubmit) still displays its real label everywhere
// (Activity Log, PDF export, PO/QC summaries) instead of falling back to
// the raw db value.
export const RESULT_LABEL = {
  making_a_plan:            'Making a Plan',
  plan_ready:               'Plan Ready',
  plan_aborted:             'Plan Aborted',
  feedback_inprogress:      'Feedback in Progress',
  accepted:                 'Accepted',
  partially_accepted:       'Partially Accepted',
  accepted_with_deviations: 'Accepted with deviations',
  rejected:                 'Rejected',
  resubmit:                 'Resubmit',
  on_hold:                  'On Hold',
}

// The Overall Result dropdown's selectable options (Sign-off step) - the
// legacy Making a Plan/Plan Ready/Resubmit workflow states are no longer
// offered for new picks, but their labels/badges above and below are kept
// so existing reports already saved with one of them keep displaying
// correctly. Feedback in Progress (db value feedback_inprogress) WAS
// retired the same way, but is reinstated here deliberately - unlike the
// others, it's a live pick again, not just a historical display value:
// submitting it sets status='submitted' but (like Plan Aborted/On Hold)
// leaves the report editable, since it stays out of VERDICT_RESULTS below.
export const INSPECTION_RESULT_OPTIONS = [
  { value: 'plan_aborted',             label: 'Plan Aborted' },
  { value: 'accepted',                 label: 'Accepted' },
  { value: 'partially_accepted',       label: 'Partially Accepted' },
  { value: 'accepted_with_deviations', label: 'Accepted with deviations' },
  { value: 'rejected',                 label: 'Rejected' },
  { value: 'on_hold',                  label: 'On Hold' },
  { value: 'feedback_inprogress',      label: 'Feedback in Progress' },
]

// Values that count as a final quality verdict, required before Submit.
export const VERDICT_RESULTS = ['accepted', 'partially_accepted', 'accepted_with_deviations', 'rejected']
// Verdicts that count as "accepted" for KPI/progress purposes.
export const ACCEPTED_RESULTS = ['accepted', 'partially_accepted', 'accepted_with_deviations']

// Anything short of a clean Accepted needs a remark explaining why — the
// inspector's reasoning is the whole point of picking one of these instead
// of Accepted. Plain 'accepted' and the pre-decision workflow states
// (Making a Plan / Plan Ready) are exempt.
export const RESULTS_REQUIRING_REMARK = ['partially_accepted', 'accepted_with_deviations', 'rejected', 'resubmit', 'on_hold', 'feedback_inprogress']

// Badge coloring for all 10 Overall Result values: emerald for the 3
// accepted-ish verdicts, red for rejected, gray for the genuinely-retired
// historical-only states, amber for the other in-process workflow states,
// and blue specifically for Feedback in Progress - a live pick (unlike its
// gray neighbors here) that means "needs a QA to come back to it," so it
// gets a color that reads as distinct from both "retired" and "on hold."
export const RESULT_BADGE_CLASS = {
  accepted:                 'bg-emerald-100 text-emerald-800',
  partially_accepted:       'bg-emerald-100 text-emerald-800',
  accepted_with_deviations: 'bg-emerald-100 text-emerald-800',
  rejected:                 'bg-red-100 text-red-700',
  making_a_plan:            'bg-gray-100 text-gray-600',
  plan_ready:               'bg-gray-100 text-gray-600',
  feedback_inprogress:      'bg-blue-100 text-blue-800',
  plan_aborted:             'bg-amber-100 text-amber-800',
  resubmit:                 'bg-amber-100 text-amber-800',
  on_hold:                  'bg-amber-100 text-amber-800',
}

// A SKU's overall verdict across all three stages: rejected at any stage
// wins (Inline/Midline/Final all count equally, matching QcReportsSummary's
// worstTone/kpis convention), but accepted only counts once Final itself is
// accepted - clearing Inline/Midline is just progress toward Final, not the
// SKU's actual outcome, so this returns null (no verdict yet) rather than an
// early stage's own accept while Final is still pending.
export function getWorstStageResult(reports, lineItemId) {
  const stageReports = STAGES.map(({ key }) => getStage(reports, lineItemId, key)).filter(Boolean)
  const rejected = stageReports.find(r => r.inspection_result === 'rejected')
  if (rejected) return rejected
  const final = stageReports.find(r => r.inspection_type === 'final')
  return final && ACCEPTED_RESULTS.includes(final.inspection_result) ? final : null
}

function fmtDate(d) {
  if (!d) return '-'
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Sequential gating — Midline can't open until Inline has an accepted
// verdict (accepted / partially accepted / accepted with deviations — any of
// ACCEPTED_RESULTS), Final can't open until Midline does. Submitted-but-
// rejected does NOT unlock the next stage — only an accepted-in-some-form
// result does. Independent of `isFinalized`, which instead freezes all three
// stages read-only once Final itself is submitted.
export const PREREQUISITE_STAGE = { midline: 'inline', final: 'midline' }
// A second rule sits on top (only when `lineItem` is supplied): the prerequisite
// stage's whole ORDER quantity must be resolved - cumulative accepted plus approved
// cancellations - so a partly accepted stage (1 of 51) keeps the next stage locked
// until the balance is accepted in another round or cancelled (see stageBalance.js;
// stages submitted before that rule started are grandfathered). `reason` says why
// it is locked: 'not_accepted' (today's rule) or 'balance' (with `balance` units).
export function getLockInfo(reports, lineItemId, stageKey, lineItem = null) {
  const prereq = PREREQUISITE_STAGE[stageKey]
  if (!prereq) return { locked: false, lockedOn: null, reason: null, balance: 0 }
  const prereqReport = getStage(reports, lineItemId, prereq)
  const accepted = prereqReport?.status === 'submitted' && ACCEPTED_RESULTS.includes(prereqReport?.inspection_result)
  if (!accepted) return { locked: true, lockedOn: STAGE_LABEL[prereq], reason: 'not_accepted', balance: 0 }
  const balance = blockingBalance(reports, lineItem, prereq)
  if (balance > 0) return { locked: true, lockedOn: STAGE_LABEL[prereq], reason: 'balance', balance }
  return { locked: false, lockedOn: STAGE_LABEL[prereq], reason: null, balance: 0 }
}

// The first stage (in Inline -> Midline -> Final order) that's unlocked and
// doesn't yet have a real verdict - whichever one the inspector should
// actually walk into next. Highlighted in the stage row so it's obvious at
// a glance instead of making them read all three statuses. A stage
// submitted with a workflow state (Plan Aborted/On Hold/Feedback in
// Progress) still counts as actionable - it's not a real outcome yet, so it
// should keep ringing as "up next" rather than silently looking done.
export function getNextActionableStage(reports, lineItemId, lineItem = null) {
  for (const { key } of STAGES) {
    if (getLockInfo(reports, lineItemId, key, lineItem).locked) continue
    const report = getStage(reports, lineItemId, key)
    if (report?.status === 'submitted' && VERDICT_RESULTS.includes(report.inspection_result)) continue
    return key
  }
  return null
}

// Shared by InspectionReportEntry.jsx's overview stage row and
// InspectionForm.jsx's own wizard header (see its stage-switcher), so
// switching stages from inside a wizard shows the identical lock/status
// styling as the overview page's row it's mirroring.
export function StageButton({ stageKey, label, report, finalized, locked, lockedOn, lockBalance = 0, isNext, onClick }) {
  let colorClass = 'bg-gray-50 border-gray-200 text-gray-500'
  let statusText = 'Not started'

  // Check the report's own status first — `finalized` only decides the
  // fallback for stages with no row at all. Otherwise an in-progress
  // re-inspection round on Final (report.status === 'draft', but the SKU is
  // still "finalized" because an earlier round was submitted) would wrongly
  // read as "Not submitted", the label meant for stages that were skipped.
  // `locked` only overrides the draft/finalized-fallback cases, never an
  // actually-submitted report — a stray draft row that shouldn't exist yet
  // (e.g. created out of sequence by something that skipped the gate below)
  // must never read as "In progress" while the stage is genuinely locked,
  // but a real submission stays shown with its date regardless of what the
  // prerequisite stage's *current* state happens to be.
  if (report?.status === 'submitted') {
    // A submitted, non-rejected report used to render green regardless of
    // whether the result was a real verdict - indistinguishable from an
    // actual Accepted stage. A workflow state (Plan Aborted/On Hold/
    // Feedback in Progress) gets its own blue "still needs a QA to come
    // back to it" styling instead.
    colorClass = report.inspection_result === 'rejected'
      ? 'bg-red-50 border-red-300 text-red-800'
      : ACCEPTED_RESULTS.includes(report.inspection_result)
        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
        : 'bg-blue-50 border-blue-300 text-blue-800'
    statusText = fmtDate(report.submitted_at)
  } else if (locked) {
    statusText = 'Locked'
  } else if (report?.status === 'draft' && !isAcceptedOnlyDraft(report)) {
    colorClass = 'bg-amber-50 border-amber-300 text-amber-800'
    statusText = stageKey === 'final' && finalized ? 'Re-inspecting' : 'In progress'
  } else if (finalized) {
    colorClass = 'bg-emerald-50 border-emerald-300 text-emerald-800'
    statusText = 'Not submitted'
  }

  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => onClick(stageKey, report)}
      title={locked
        ? (lockBalance > 0
          ? `${lockedOn} still has ${lockBalance} unresolved. Accept them in another round or cancel them before ${label}.`
          : `${lockedOn} must be accepted (or accepted with conditions) first`)
        : `${label} · ${statusText}${isNext ? ' - up next' : ''}`}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border whitespace-nowrap transition-colors
        ${locked ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80 cursor-pointer'} ${colorClass}
        ${isNext ? 'ring-1 ring-indigo-400' : ''}`}
    >
      {isNext && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />}
      {locked && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0">
          <rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      )}
      <span className="text-xs font-bold">{label}</span>
      <span className="text-[10px] opacity-80">· {statusText}</span>
    </button>
  )
}

// `forceRejectedStage` overrides one specific stage's dot to red regardless
// of the latest round's live status - for a sidebar card deliberately
// showing a SKU's past rejection as history (see PoInspectionComments.jsx's
// "Rejected" card), where that stage's live dot would otherwise already read
// as "not started" again once its re-inspection round exists. Any stage can
// be the rejected one now (InspectionForm.jsx's auto-reschedule is no
// longer Final-only), not just Final.
// `forcedResult` is that past round's own result: red for Rejected, blue for
// Plan Aborted / On Hold (same colours the live dots use).
export function StageDots({ reports, lineItemId, forceRejectedStage, forcedResult = 'rejected' }) {
  const finalized = isFinalized(reports, lineItemId)
  return (
    <div className="flex items-center gap-1">
      {STAGES.map(({ key, label }) => {
        const stage = getStage(reports, lineItemId, key)
        let dotClass = 'bg-gray-300'
        if (forceRejectedStage === key) dotClass = forcedResult === 'rejected' ? 'bg-red-500' : 'bg-blue-500'
        else if (stage?.status === 'submitted' && stage.inspection_result === 'rejected') dotClass = 'bg-red-500'
        // Submitted with a workflow state (Plan Aborted/On Hold/Feedback in
        // Progress) - not a real verdict, so it gets its own blue dot rather
        // than falling into the emerald "accepted" fallback just below.
        else if (stage?.status === 'submitted' && !VERDICT_RESULTS.includes(stage.inspection_result)) dotClass = 'bg-blue-500'
        else if (finalized || stage?.status === 'submitted') dotClass = 'bg-emerald-500'
        else if (stage?.status === 'draft' && !isAcceptedOnlyDraft(stage)) dotClass = 'bg-amber-400'
        return <span key={key} title={label} className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
      })}
    </div>
  )
}
