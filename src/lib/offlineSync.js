// Offline-first inspection wizard - Phase 2 (JSON-patch sync) + Phase 3
// (photo sync) + Phase 5 (session-expiry-safe sync). Turns a dirty local
// draft / a staged local photo / a queued callout (see offlineDrafts.js)
// into the real Supabase writes their respective callers used to make
// directly and inline.
import { getDraft, setDraftServerReportId, clearMissingServerReport, markDraftSynced, getDirtyDrafts, getDraftsPendingSubmit, clearPendingSubmit, getPendingPhotosForDraft, removePendingPhoto, getAllPendingCallouts, removePendingCallout } from './offlineDrafts'
import { supabase } from './supabase'

// One in-flight sync per draftId at a time - prevents two overlapping
// attempts (e.g. a periodic timer tick landing mid-flight of an autosave-
// triggered attempt) from both trying to create the same row, or an older
// in-flight patch clobbering a newer one that was queued after it started.
const inFlight = new Set()

// ── Phase 5 - session-expiry-safe sync ──────────────────────────────────────
// A QA offline for hours may have their Supabase session's refresh token
// expire before they're able to sync. Retrying an expired-session write
// every 10s forever is both useless (it can't possibly succeed until
// they've logged back in) and noisy - this pauses ALL sync attempts
// module-wide the moment one is recognized, rather than tracking it per
// draft/photo/callout, since an expired session blocks every write
// equally regardless of which queue it came from.
let authPaused = false
export function isSyncPausedForAuth() { return authPaused }

// Distinguishes "the session is the problem" from a generic network/server
// failure - a Postgrest/Storage 401, Postgrest's JWT-specific PGRST301, or
// a message naming the JWT/token/session directly. Deliberately loose
// (message-matching, not just status codes) since Storage and Postgrest
// don't always shape their errors identically.
function isAuthError(err) {
  if (!err) return false
  if (err.status === 401 || err.statusCode === 401 || err.statusCode === '401') return true
  if (err.code === 'PGRST301') return true
  return /jwt|token|session|not authenticated|unauthorized/i.test(err.message || '')
}

// Subscribes once (module load) to Supabase's own auth state - resumes
// every paused queue automatically the moment a real session exists again
// (a fresh login, or supabase-js's own token refresh succeeding), no
// action needed from whichever component happens to be mounted at the
// time. Nothing in IndexedDB is ever touched here - pausing/resuming only
// ever affects whether a network attempt is even tried, never the queued
// data itself.
if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (session && authPaused) authPaused = false
  })
}

// Distinguishes "the row this draft thinks it owns is gone server-side"
// (another device/admin deleted it while this draft sat offline) from a
// generic network/server failure. `updateFn` implementations are expected
// to throw an error with this code when their update matches zero rows -
// PostgREST itself returns 200 with an empty result for that case, not an
// error, so callers have to check row-presence themselves and signal it
// this way (see updateInspectionReport call sites in InspectionForm.jsx /
// ReconnectSyncScreen.jsx).
export const REPORT_NOT_FOUND = 'REPORT_NOT_FOUND'

// PLAN OFFLINE (on hold) - COMMENTED OUT. Replay guard, written but not
// shipped: offline is on hold until it is planned properly, so this module is
// left exactly as it was. Restore this block AND the matching one in
// attemptSync's update branch (below) together when offline is planned.
// Purpose: a plain draft replay must never write inspection_result / status /
// submitted_at onto a report that is already submitted on the server (a stale
// local draft once turned an On Hold report into Accepted).
//
// // The fields a plain draft replay is never allowed to write onto an existing
// // report - see attemptSync's update branch.
// const PROTECTED_REPLAY_FIELDS = ['inspection_result', 'status', 'submitted_at']
// function omitResultFields(patch) {
//   if (!patch) return patch
//   const next = { ...patch }
//   for (const key of PROTECTED_REPLAY_FIELDS) delete next[key]
//   return next
// }
// // True when the server row is already submitted - or when that cannot be
// // determined (a read error), so an unreadable status never lets a stale
// // replay overwrite a submitted result.
// async function serverReportIsSubmitted(id) {
//   const { data, error } = await supabase.from('inspection_reports').select('status').eq('id', id).maybeSingle()
//   if (error) return true
//   return data?.status === 'submitted'
// }

// Attempts to sync one draft. `createFn(patch)` must resolve to
// `{ id, round }` on success (matches createInspectionReport's own return
// shape) or throw; `updateFn(serverReportId, patch)` must throw on
// failure, using `{ code: REPORT_NOT_FOUND }` specifically when the update
// matched no rows. Both are passed in by the caller (InspectionForm.jsx)
// rather than imported here, so this module has no dependency on
// useInspectionReports.js's exact call signature (created_by/status/
// fulfilled_schedule_id etc. are InspectionForm.jsx's own concern to build
// into `patch` before calling this).
//
// Returns `{ synced: boolean, serverReportId, error }` - never throws; a
// network/server failure just leaves the draft's `dirty`/`pendingCreate`
// flags untouched for the next attempt (online event, periodic timer, or
// the next autosave tick all call this the same way).
export async function attemptSync(draftId, { createFn, updateFn }) {
  if (authPaused || inFlight.has(draftId)) return { synced: false, serverReportId: null, error: null }
  const draft = await getDraft(draftId)
  if (!draft || !draft.dirty) return { synced: false, serverReportId: draft?.serverReportId ?? null, error: null }
  if (!draft.serverReportId && !draft.pendingCreate) {
    // Nothing to do yet - this SKU has local edits but the user hasn't
    // taken the explicit "Save" action that would create the row. Not an
    // error, just not this draft's turn.
    return { synced: false, serverReportId: null, error: null }
  }
  inFlight.add(draftId)
  try {
    // Re-read the draft's patch at send time (not what was true when this
    // attempt started) - if the user kept typing while a previous attempt
    // was in flight, this picks up the latest state instead of a stale one.
    const fresh = await getDraft(draftId)
    if (!fresh || !fresh.dirty) return { synced: false, serverReportId: fresh?.serverReportId ?? null, error: null }
    let serverReportId = fresh.serverReportId
    if (!serverReportId) {
      const { id } = await createFn(fresh.patch)
      serverReportId = id
      await setDraftServerReportId(draftId, serverReportId)
    } else {
      // PLAN OFFLINE (on hold) - replay guard COMMENTED OUT (see the block
      // near the top of this file). Restore together with the helpers:
      //
      // // A plain draft replay (one that is NOT a deliberate offline Submit) must
      // // never carry a result/status onto a report that already exists on the
      // // server. Only a patch that itself says status 'submitted' (a real
      // // offline Submit, recorded by InspectionForm.handleSubmit) may write them.
      // // Stripped only when the server report is ALREADY submitted; if the
      // // status cannot be read, stripping is the safe default (fail closed).
      // const patch = fresh.patch?.status !== 'submitted' && await serverReportIsSubmitted(serverReportId)
      //   ? omitResultFields(fresh.patch)
      //   : fresh.patch
      // await updateFn(serverReportId, patch)
      try {
        await updateFn(serverReportId, fresh.patch)
      } catch (err) {
        if (err?.code === REPORT_NOT_FOUND) {
          // The report this draft was updating no longer exists server-side.
          // Resetting to pendingCreate (draft stays dirty) makes the *next*
          // sync attempt take the createFn branch above instead of quietly
          // "succeeding" against nothing - without this, markDraftSynced
          // below would have discarded the user's queued edits for good.
          await clearMissingServerReport(draftId)
          return { synced: false, serverReportId: null, error: err }
        }
        throw err
      }
    }
    await markDraftSynced(draftId)
    return { synced: true, serverReportId, error: null }
  } catch (err) {
    if (isAuthError(err)) authPaused = true
    return { synced: false, serverReportId: draft.serverReportId ?? null, error: err }
  } finally {
    inFlight.delete(draftId)
  }
}

// Finishes an offline-queued Submit - the base report patch (already
// carrying `status: 'submitted'`/`submitted_at`, folded in by
// InspectionForm.jsx's handleSubmit exactly like any other patch field) goes
// through the *same* attemptSync create/update path any dirty draft uses;
// what's left is the leftover-quantity decision the inspector made in person
// (see offlineDrafts.js's markPendingSubmit) - its DB effects (booking a
// follow-up schedule entry, starting a new inspection round, or writing off
// a rejection) couldn't happen at submit-click time offline, so they're
// replayed here once reconnected.
//
// `bookFollowUpFn(info)` mirrors bookFollowUpSchedule (useInspectionSchedule.js)
// and must resolve to a schedule entry id or null; `startReInspectionFn(args)`
// and `rejectLeftoverFn(args)` mirror startReInspection/rejectLeftoverQuantity
// (useInspectionReports.js) and must resolve to `{ data, error }` - both
// already have 23505-duplicate recovery built in, so a retried replay after
// a partial failure can't double-book a round or double-write a rejection.
// Same caller-supplied-function shape as attemptSync/flushPendingPhotos, for
// the same reason - no dependency on either hook module's exact signature
// here.
export async function attemptSyncSubmit(draftId, { createFn, updateFn, bookFollowUpFn, startReInspectionFn, rejectLeftoverFn }) {
  const base = await attemptSync(draftId, { createFn, updateFn })
  if (base.error) return { synced: false, serverReportId: base.serverReportId, error: base.error } // base patch itself hasn't landed yet - nothing to replay against
  const draft = await getDraft(draftId)
  if (!draft?.serverReportId) return { synced: false, serverReportId: null, error: null } // shouldn't happen once base.error is clear, but nothing to act on regardless
  if (!draft.pendingSubmit) return { synced: true, serverReportId: draft.serverReportId, error: null } // plain draft, or already finished on an earlier tick
  if (authPaused) return { synced: false, serverReportId: draft.serverReportId, error: null }
  const info = draft.pendingSubmit
  try {
    if (info.leftoverChoice === 'reschedule') {
      const resolvedEntryId = await bookFollowUpFn(info)
      const { error } = await startReInspectionFn({
        po_line_item_id: info.lineItemId, inspection_type: info.inspectionType, next_round: info.round + 1,
        actor_name: info.actorName,
        reason: info.rejected ? `Auto re-inspection: previous ${info.inspectionType} rejected` : 'Auto re-inspection: quantity not fully covered',
        fulfilled_schedule_id: resolvedEntryId,
      })
      if (error) throw error
    } else if (info.leftoverChoice === 'reject') {
      const { error } = await rejectLeftoverFn({
        po_line_item_id: info.lineItemId, inspection_type: info.inspectionType, next_round: info.round + 1,
        actor_name: info.actorName, quantity: info.leftoverQty ?? info.followUpQty,
      })
      if (error) throw error
      // The inspected portion's own rejection (if any) still needs its own
      // fresh round to redo - deliberately a second round (round+2), not
      // conflated with the leftover's reject-round above. Mirrors
      // InspectionForm.jsx's resolveLeftoverChoice exactly.
      if (info.rejected) {
        const { error: err2 } = await startReInspectionFn({
          po_line_item_id: info.lineItemId, inspection_type: info.inspectionType, next_round: info.round + 2,
          actor_name: info.actorName, reason: `Auto re-inspection: previous ${info.inspectionType} rejected`, fulfilled_schedule_id: null,
        })
        if (err2) throw err2
      }
    } else if (info.leftoverChoice === 'simple_reinspect') {
      // No leftover at all (followUpQty === 0) but the verdict itself was a
      // genuine rejection - still needs its own fresh round, same as
      // handleSubmit's own non-leftover rejected branch (InspectionForm.jsx).
      const { error } = await startReInspectionFn({
        po_line_item_id: info.lineItemId, inspection_type: info.inspectionType, next_round: info.round + 1,
        actor_name: info.actorName, reason: `Auto re-inspection: previous ${info.inspectionType} rejected`, fulfilled_schedule_id: null,
      })
      if (error) throw error
    }
    await clearPendingSubmit(draftId)
    return { synced: true, serverReportId: draft.serverReportId, error: null }
  } catch (err) {
    if (isAuthError(err)) authPaused = true
    return { synced: false, serverReportId: draft.serverReportId, error: err }
  }
}

// Sweeps every draft with a pending submit action still outstanding - the
// page-level counterpart to syncAllDirtyDrafts below, run by the reconnect
// sync screen. A draft can be `dirty: false` (its base patch already synced
// a tick ago) while `pendingSubmit` is still set (its leftover action failed
// or hasn't been attempted yet), so this sweeps a different set than
// getDirtyDrafts - both need to run, not just one.
export async function syncAllPendingSubmits({ createFn, updateFn, bookFollowUpFn, startReInspectionFn, rejectLeftoverFn }) {
  const pending = await getDraftsPendingSubmit()
  const results = []
  for (const draft of pending) {
    results.push(await attemptSyncSubmit(draft.draftId, { createFn, updateFn, bookFollowUpFn, startReInspectionFn, rejectLeftoverFn }))
  }
  return results
}

// Sweeps every dirty draft across the whole app (not just the SKU
// currently open in the wizard) - used by the `online` event listener and
// the periodic timer, both of which have no single draftId in mind. The
// currently-open SKU's own draft also gets synced this way in addition to
// its own autosave-tick-triggered attemptSync call, which is harmless -
// attemptSync's inFlight guard just makes the second call a no-op if the
// first is still running.
export async function syncAllDirtyDrafts({ createFn, updateFn }) {
  const dirty = await getDirtyDrafts()
  const results = []
  for (const draft of dirty) {
    results.push(await attemptSync(draft.draftId, { createFn, updateFn }))
  }
  return results
}

const photoInFlight = new Set()

// Uploads every photo staged locally for this draft, once it actually has
// a serverReportId to attach them to - a photo can only sync after its own
// report row exists, so callers naturally run this after attemptSync
// (above) has resolved a create, not before. `uploadFn(blob, prefix)` must
// resolve to a storage path (matches uploadToInspectionBucket's own return
// shape) or throw; `addPhotoRowFn(row)` must throw on failure. Same
// caller-supplied-function shape as attemptSync, for the same reason (no
// dependency on inspectionStorage.js/useInspectionReports.js's exact
// signatures here).
export async function flushPendingPhotos(draftId, serverReportId, { uploadFn, addPhotoRowFn }) {
  if (authPaused || !serverReportId || photoInFlight.has(draftId)) return { uploaded: 0 }
  photoInFlight.add(draftId)
  try {
    const pending = await getPendingPhotosForDraft(draftId)
    let uploaded = 0
    for (const photo of pending) {
      try {
        const path = await uploadFn(photo.blob, `${serverReportId}/misc`)
        await addPhotoRowFn({ report_id: serverReportId, storage_path: path, step_key: photo.stepKey })
        await removePendingPhoto(photo.photoId)
        uploaded += 1
      } catch (err) {
        if (isAuthError(err)) { authPaused = true; break } // stop this batch too - every remaining photo would fail the same way
        // Leave this one photo queued - the next trigger retries it. One
        // photo's failure (e.g. a mid-batch connectivity drop) doesn't
        // block the rest of the batch, same "per-file try/catch" pattern
        // the Digitals step's own bulk upload already used before this.
      }
    }
    return { uploaded }
  } finally {
    photoInFlight.delete(draftId)
  }
}

const calloutInFlight = new Set()

// Posts one queued callout for real - same shape CalloutModal.jsx's own
// submit() already builds (one po_comments row per SKU, then
// po_comment_photos for every uploaded photo against every one of those
// rows), just replayed from the local record instead of from the modal's
// own live state. `uploadFn`/`insertCommentsFn`/`insertPhotoRowsFn` are
// caller-supplied (CalloutModal.jsx) for the same reason attemptSync's
// createFn/updateFn are - no dependency on the exact Supabase call shape
// here. `insertCommentsFn(rows)` must resolve to the inserted rows'
// `{ id }`s (matches `.insert(rows).select('id')`); `insertPhotoRowsFn`
// must throw on failure.
//
// `alreadyPostedFn(callout)` (optional) guards against the one real
// duplicate-post risk this queue has: CalloutModal.jsx's own submit()
// queues offline not just when genuinely offline, but also when
// `navigator.onLine` said there was a connection and the insert actually
// committed server-side, only for the response itself to be lost (a flaky
// signal, not a real failure) - that queued copy would otherwise get
// replayed here and post the exact same text a second time. po_comments has
// no unique constraint to catch this at the DB level, so callers pass a
// function that checks for a matching row already posted moments ago;
// when it resolves true, this treats the callout as already synced
// (clears the queue entry) instead of posting it again.
async function syncOneCallout(callout, { uploadFn, insertCommentsFn, insertPhotoRowsFn, alreadyPostedFn }) {
  if (authPaused || calloutInFlight.has(callout.calloutId)) return { synced: false }
  calloutInFlight.add(callout.calloutId)
  try {
    if (alreadyPostedFn) {
      const already = await alreadyPostedFn(callout).catch(() => false) // best-effort - a failed dedup check must not block a genuine post
      if (already) { await removePendingCallout(callout.calloutId); return { synced: true } }
    }
    const uploadedPaths = []
    for (const blob of callout.photoBlobs || []) {
      try { uploadedPaths.push(await uploadFn(blob, `callouts/${callout.calloutType.toLowerCase()}/${callout.poId}`)) }
      catch { /* one bad photo doesn't block the callout's own text/other photos - matches submit()'s own per-file try/catch */ }
    }
    const rows = callout.itemIds.map(po_line_item_id => ({
      po_id: callout.poId, line_item_id: po_line_item_id,
      comment_type: callout.calloutType, comment: callout.text, created_by: callout.createdBy,
    }))
    const inserted = await insertCommentsFn(rows)
    if (uploadedPaths.length && inserted?.length) {
      const photoRows = inserted.flatMap(({ id }) => uploadedPaths.map(storage_path => ({ comment_id: id, storage_path })))
      await insertPhotoRowsFn(photoRows)
    }
    await removePendingCallout(callout.calloutId)
    return { synced: true }
  } catch (err) {
    if (isAuthError(err)) authPaused = true
    return { synced: false, error: err }
  } finally {
    calloutInFlight.delete(callout.calloutId)
  }
}

// Sweeps every queued callout across the whole app - same `online`/timer
// triggers as syncAllDirtyDrafts, and just as harmless to call repeatedly
// (syncOneCallout's own in-flight guard no-ops an overlapping attempt).
export async function syncAllPendingCallouts({ uploadFn, insertCommentsFn, insertPhotoRowsFn, alreadyPostedFn }) {
  const pending = await getAllPendingCallouts()
  const results = []
  for (const callout of pending) {
    results.push(await syncOneCallout(callout, { uploadFn, insertCommentsFn, insertPhotoRowsFn, alreadyPostedFn }))
  }
  return results
}
