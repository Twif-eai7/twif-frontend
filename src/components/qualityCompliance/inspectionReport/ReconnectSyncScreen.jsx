import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { uploadToInspectionBucket } from '../../../lib/inspectionStorage'
import {
  createInspectionReport, findInspectionReport, updateInspectionReport, addPhotoRow, startReInspection, rejectLeftoverQuantity,
} from '../../../hooks/useInspectionReports'
import { bookFollowUpSchedule } from '../../../hooks/useInspectionSchedule'
import { calloutAlreadyPosted } from '../../../lib/calloutDedup'
import { getPendingCount, getQueueSummaryByPo, getDirtyDrafts, getDraftsPendingSubmit, getDraftsWithPendingPhotos } from '../../../lib/offlineDrafts'
import { attemptSyncSubmit, flushPendingPhotos, syncAllPendingCallouts, isSyncPausedForAuth, REPORT_NOT_FOUND } from '../../../lib/offlineSync'

// Page-level counterpart to InspectionForm.jsx's own per-wizard sync (Phases
// 2/3/5) - that one only ever runs while its own wizard is mounted, so a QA
// who inspected several SKUs across several POs offline and is now sitting
// back on the Scheduled POs list (the journey this screen exists for) has
// nothing else driving the sync forward. Mounted once, here, rather than
// per-wizard.
//
// createFn/updateFn are rebuilt generically from each draft's own
// poLineItemId/inspectionType/round (drafts carry these directly - see
// offlineDrafts.js's createDraft) rather than reusing InspectionForm's
// createReportRow, which closes over that component's own live props
// (userName, activeScheduleEntry, etc.) and can't run unmounted. This
// mirrors createReportRow's own logic (including its 23505 recovery path)
// but against the draft's own patch instead of a live form's state.
async function createFromDraft(draft, userName) {
  const { poLineItemId, inspectionType, round, patch } = draft
  const { data, error } = await createInspectionReport({
    po_line_item_id: poLineItemId, inspection_type: inspectionType, round: round ?? 1,
    ...patch, status: patch?.status || 'draft', created_by: userName, updated_by: userName,
  })
  if (error) {
    if (error.code === '23505') {
      const { data: existing, error: findErr } = await findInspectionReport({ po_line_item_id: poLineItemId, inspection_type: inspectionType, round: round ?? 1 })
      if (findErr) throw findErr
      if (existing) {
        // Same merge-not-discard fix as InspectionForm.jsx's own
        // createReportRow - a direct Save click racing this exact sync on
        // reconnect can each hold a genuinely different, newer patch, not
        // just a stale resend.
        const { error: mergeErr } = await updateInspectionReport(existing.id, patch, userName, { guardSubmitted: true })
        if (mergeErr) console.error('[ReconnectSyncScreen] merge onto existing report after 23505 failed:', mergeErr.message)
        return existing
      }
    }
    throw error
  }
  return data
}

// Resolves a PO (and, via it, a SKU's buyer_sku_ref) for a draft's
// `poLineItemId` from whichever PO list the caller already has loaded (the
// sidebar's own `pos` state, which carries each PO's `po_line_items`
// inline) - same data, no extra fetch.
function poForLineItem(pos, poLineItemId) {
  return pos?.find(p => p.po_line_items?.some(li => li.id === poLineItemId)) ?? null
}
function skuRefForLineItem(po, poLineItemId) {
  return po?.po_line_items?.find(li => li.id === poLineItemId)?.buyer_sku_ref ?? null
}

// One queued SKU, collapsed to its label by default - tapping it reveals
// the actual local `patch` object (pretty-printed JSON), not a paraphrase
// of it. This is deliberately the raw record, field names and all - the
// point is showing exactly what attemptSyncSubmit will hand to
// createFn/updateFn (offlineSync.js) and therefore exactly what lands in
// Supabase, not a friendlier summary that could itself say something
// slightly different from the truth.
function SkuQueueItem({ sku }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 bg-slate-100 hover:bg-slate-200 rounded px-2 py-1 text-left"
      >
        <span className="text-slate-600">{sku.label}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={`text-slate-400 flex-shrink-0 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <pre className="mt-1 bg-slate-900 text-slate-200 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(sku.patch, null, 2)}
          {sku.pendingSubmit && `\n\n// leftover-quantity action still queued:\n${JSON.stringify(sku.pendingSubmit, null, 2)}`}
        </pre>
      )}
    </div>
  )
}

export default function ReconnectSyncScreen({ pos, userName }) {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [groups, setGroups] = useState([]) // [{ poNumber, skus: string[], calloutCount }]
  const [authStuck, setAuthStuck] = useState(false)
  const [syncError, setSyncError] = useState(null)
  const runningRef = useRef(false)
  // Mirrors `visible` for refresh() to read - refresh is called from a
  // setInterval/online-listener set up once (deps [pos]), so a plain closure
  // over `visible` state would go stale between renders; the ref always has
  // the current value.
  const visibleRef = useRef(false)
  useEffect(() => { visibleRef.current = visible })
  // The pending count as of the last time the QA explicitly dismissed the
  // screen (null when nothing's been dismissed yet) - lets refresh() tell
  // "still the same backlog I already closed" apart from "something new
  // got queued since", instead of force-reopening on every 10s poll just
  // because the count is still nonzero.
  const dismissedAtCountRef = useRef(null)
  // True once this component's mount effect has run its own first check -
  // that first run is allowed to freshly open the screen for a real backlog
  // left over from before page load, but the same effect also re-runs every
  // time [pos] gets a new reference (happens on many unrelated state changes
  // elsewhere, not just a true mount) - later re-runs must behave like the
  // quiet poll, not the initial check.
  const hasMountedRef = useRef(false)
  // Bumped at the start of every refresh() call, checked before that same
  // call applies any of its results - refresh() has two awaits
  // (getPendingCount, then getQueueSummaryByPo), and it's triggered from
  // several independent places (mount, the 'online' listener, the 10s
  // poll, and this effect re-running on every `pos` reference change) with
  // no sequencing between them. Two overlapping calls can resolve their
  // awaits out of order, so without this guard, one call's fresher
  // pendingCount could land next to a DIFFERENT, older call's groups (or
  // vice versa) - real bug seen live: the header read "4 changes ready to
  // sync" while the body read "Nothing left to sync" at the same time,
  // because two overlapping refresh() runs each wrote only part of the
  // combined state. Whichever call is the most recently STARTED always
  // wins; any earlier call still in flight abandons its result entirely
  // once a newer one has started, rather than let the two interleave.
  const refreshTokenRef = useRef(0)

  // Wrapped in its own try/catch - this runs unattended on a 10s timer plus
  // every `online` event, with no user action to blame a failure on, so an
  // unexpected IndexedDB/read error here must not become an uncaught
  // rejection repeating on every tick (that actually happened once already -
  // see getDirtyDrafts'/getPendingCount's own fix in offlineDrafts.js for
  // the root cause that surfaced this).
  // `allowShow=false` (used by the periodic timer below) updates the
  // pending-count badge/content but never newly pops the screen open -
  // real bug found live: a genuine online edit sitting locally unsaved for
  // more than 10s (completely normal - nobody saves every keystroke) has a
  // nonzero pendingCount too, and the timer used to treat that exactly like
  // a reconnect, opening "You're back online" for someone who was never
  // offline. Only a genuine `online` event (a real reconnect) or this
  // component's own first mount (catching a backlog left over from BEFORE
  // this page load) may newly reveal it now.
  const refresh = async (allowShow = true) => {
    const token = ++refreshTokenRef.current
    try {
      const count = await getPendingCount()
      if (token !== refreshTokenRef.current) return // superseded by a newer refresh() call - abandon, don't apply a stale count
      setPendingCount(count)
      if (!navigator.onLine) { setVisible(false); return } // genuinely offline again - nothing to show
      if (!allowShow && !visibleRef.current) return // quiet poll - don't open it, just not right now
      if (count === 0) {
        // Only skip showing anything if it isn't already up. Once the
        // screen IS open, a count reaching 0 (e.g. a sync just finished)
        // must not make it vanish on its own on the next 10s tick - the QA
        // asked to see it finish and close it themselves, not have it
        // disappear out from under them mid-read.
        if (visibleRef.current) setGroups([])
        return
      }
      // Was explicitly dismissed, and the backlog hasn't grown since - stay
      // closed. Without this check, Dismiss only ever closed the screen for
      // however long until the next 10s poll, which found the same
      // still-unsynced count it already knew about and force-reopened it -
      // "clicking Dismiss didn't actually dismiss anything."
      if (dismissedAtCountRef.current != null && count <= dismissedAtCountRef.current) return
      const { drafts, callouts } = await getQueueSummaryByPo()
      if (token !== refreshTokenRef.current) return // superseded again during this second await - same reasoning as above
      const byPo = new Map()
      for (const d of drafts) {
        const po = poForLineItem(pos, d.poLineItemId)
        const key = po?.po_number || d.poLineItemId
        const g = byPo.get(key) || { poNumber: po?.po_number || 'Unknown PO', skus: [], calloutCount: 0 }
        const skuRef = skuRefForLineItem(po, d.poLineItemId) || d.poLineItemId
        // The exact local record this sync will send - `patch` is the same
        // JSON object attemptSyncSubmit hands straight to createFn/updateFn
        // (offlineSync.js), so showing it here (not a paraphrase of it) is
        // literally "what's about to be written to Supabase", not a summary
        // that could itself drift from the truth.
        g.skus.push({
          label: `${skuRef} (${d.inspectionType}${d.pendingSubmit ? ' · submitted' : ''})`,
          patch: d.patch,
          pendingSubmit: d.pendingSubmit ?? null,
        })
        byPo.set(key, g)
      }
      for (const c of callouts) {
        const key = c.poNumber || c.poId
        const g = byPo.get(key) || { poNumber: c.poNumber || 'Unknown PO', skus: [], calloutCount: 0, callouts: [] }
        g.calloutCount += 1
        g.callouts ??= []
        g.callouts.push({ type: c.calloutType, text: c.text, photoCount: c.photoBlobs?.length ?? 0 })
        byPo.set(key, g)
      }
      setGroups(Array.from(byPo.values()))
      setDismissed(false)
      setVisible(true)
    } catch (err) {
      console.error('[ReconnectSyncScreen] refresh failed:', err.message)
    }
  }

  useEffect(() => {
    // Deferred (setTimeout 0) rather than called directly - `refresh` sets
    // state after its own awaits, and calling it synchronously at the top
    // of the effect body trips react-hooks/set-state-in-effect the same
    // way a direct setState call would.
    //
    // This whole effect is keyed on [pos] below, and `pos` (the PO list in
    // PoInspectionComments.jsx) gets a new array reference often - every
    // patch to any PO's own state, not just a genuine list refetch. Real bug
    // found live: the "initial" check used to call refresh() with its
    // default (allowed-to-show) behavior on EVERY one of those re-runs, not
    // just the component's true first mount - so simply continuing to edit
    // a form online (which patches `pos` elsewhere) could make this
    // "initial" check re-fire and pop the screen open, the exact same
    // "opened without a real reconnect" bug the periodic-timer fix below
    // was for, just via a different trigger. hasMountedRef distinguishes
    // "this component's genuine first mount" (allowed to show - it may be
    // catching a real backlog left over from before this page loaded) from
    // "pos merely changed reference again" (quiet, same as the timer).
    const isFirstRun = !hasMountedRef.current
    hasMountedRef.current = true
    const initial = setTimeout(() => refresh(isFirstRun), 0)
    const onOnline = () => refresh() // a genuine reconnect - always allowed to show
    window.addEventListener('online', onOnline)
    const timer = setInterval(() => refresh(false), 10000) // quiet poll only - see refresh's own doc comment for why this must not open the screen on its own
    return () => { clearTimeout(initial); window.removeEventListener('online', onOnline); clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos])

  // Explicit action only, per the user's own request - this used to
  // auto-start the moment the screen appeared, which meant a page refresh
  // (a fresh mount, re-running the initial `refresh()` above) looked like
  // "it's syncing again" every single time even when nothing new had
  // happened, with no visibility into whether the PREVIOUS attempt actually
  // succeeded or silently kept failing. Now it only runs when the QA taps
  // Sync Now, and a failure stays visible (syncError) instead of quietly
  // retrying forever with no explanation.
  const runSync = async () => {
    if (runningRef.current) return
    runningRef.current = true
    setSyncing(true)
    setAuthStuck(false)
    setSyncError(null)
    try {
      // Dirty drafts (a base patch still owed) and pending-submit drafts (the
      // base patch already landed on an earlier tick, but the leftover-
      // quantity replay - reschedule/reject - hasn't finished yet) are two
      // overlapping-but-different sets - a draft can be in either, or both.
      // attemptSyncSubmit handles both in one call (it's a strict superset
      // of attemptSync - a plain draft with no pendingSubmit just returns
      // once its base patch syncs), so every target here goes through it
      // uniformly rather than branching per draft.
      const dirty = await getDirtyDrafts()
      const stillPendingSubmit = await getDraftsPendingSubmit()
      // A draft with a still-unuploaded photo but nothing else outstanding
      // (dirty: false, no pendingSubmit) falls through both sets above -
      // real bug found live: addPendingPhoto never marks its draft dirty,
      // so a photo taken while online sat stuck in the local queue forever,
      // permanently blocking Submit ("still has changes syncing") since
      // nothing ever called flushPendingPhotos for it. Routing it through
      // attemptSyncSubmit here is harmless even though there's no real
      // patch to sync (attemptSync's own !dirty branch just returns the
      // draft's existing serverReportId untouched) - it's only here so the
      // serverReportId that comes back can feed flushPendingPhotos below.
      const withPendingPhotos = await getDraftsWithPendingPhotos()
      const seen = new Set()
      const targets = [...dirty, ...stillPendingSubmit, ...withPendingPhotos].filter(d => (seen.has(d.draftId) ? false : (seen.add(d.draftId), true)))
      const failures = []
      for (const draft of targets) {
        const res = await attemptSyncSubmit(draft.draftId, {
          createFn: (patch) => createFromDraft({ ...draft, patch }, userName),
          updateFn: (id, patch) => updateInspectionReport(id, patch, userName, { guardSubmitted: true }).then(({ data, error }) => {
            if (error) throw error
            // See InspectionForm.jsx's identical check - maybeSingle()
            // returns { data: null, error: null } for a zero-row match,
            // which attemptSync needs turned into a REPORT_NOT_FOUND throw
            // to avoid discarding this draft's queued edits.
            if (!data) { const e = new Error('Report no longer exists'); e.code = REPORT_NOT_FOUND; throw e }
          }),
          bookFollowUpFn: (info) => bookFollowUpSchedule({
            poId: info.poId, inspectionType: info.inspectionType, lineItemId: info.lineItemId,
            followUpQty: info.followUpQty, remaining: info.remaining, neverInspected: info.neverInspected,
            acceptedQty: info.acceptedQty, rejected: info.rejected, activeEntryScheduledQty: info.activeEntryScheduledQty,
            quantityOrdered: info.quantityOrdered, assignedQaId: info.assignedQaId,
          }),
          startReInspectionFn: (args) => startReInspection(args),
          rejectLeftoverFn: (args) => rejectLeftoverQuantity(args),
        })
        if (res.error) failures.push(res.error)
        if (res.serverReportId) {
          await flushPendingPhotos(draft.draftId, res.serverReportId, {
            uploadFn: uploadToInspectionBucket,
            addPhotoRowFn: (row) => addPhotoRow(row).then(({ error }) => { if (error) throw error }),
          })
        }
      }
      const calloutResults = await syncAllPendingCallouts({
        uploadFn: uploadToInspectionBucket,
        insertCommentsFn: (rows) => supabase.from('po_comments').insert(rows).select('id').then(({ data, error }) => { if (error) throw error; return data }),
        insertPhotoRowsFn: (rows) => supabase.from('po_comment_photos').insert(rows).then(({ error }) => { if (error) throw error }),
        alreadyPostedFn: calloutAlreadyPosted,
      })
      calloutResults.forEach(r => { if (r.error) failures.push(r.error) })
      // Surfaced instead of silently retrying next time with no explanation -
      // exactly what made the sync screen reappear on every reload look like
      // it was doing nothing: it WAS retrying, the same failure just kept
      // happening quietly. isAuthError's own case is handled separately
      // below (authStuck), so this is specifically for a genuine, non-auth
      // failure (RLS, a bad column, a network blip that outlasted the
      // attempt).
      if (failures.length && !isSyncPausedForAuth()) {
        setSyncError(failures[0].message || 'Sync failed - tap Sync Now to retry.')
      }
      // Tells any still-open InspectionForm/CalloutModal instance this sync
      // just happened, purely so it can refresh its own local
      // display (pick up a new localId, re-show a callout as posted) -
      // neither listener makes a write off this, it's read-only.
      window.dispatchEvent(new Event('offline-sync-completed'))
      // A clean Sync Now (nothing failed, session still valid) that
      // actually emptied the queue closes itself - the "stay open until the
      // QA closes it" rule from before is about not vanishing out from under
      // someone WHILE something is still pending or mid-read, not about a
      // genuinely finished sync still demanding a separate Dismiss click
      // every single time. Checked with a fresh read (not the `pendingCount`
      // state var, which won't reflect this tick's result until the next
      // render) so this can't close on a stale/optimistic count.
      if (!failures.length && !isSyncPausedForAuth()) {
        const finalCount = await getPendingCount()
        if (finalCount === 0) { setVisible(false); setDismissed(false); return }
      }
    } finally {
      runningRef.current = false
      setSyncing(false)
      if (isSyncPausedForAuth()) setAuthStuck(true)
      await refresh()
    }
  }

  // Records the count as of this explicit close - refresh()'s own check
  // above compares against this, so the next 10s poll only reopens the
  // screen if the backlog actually grew, not just because it's still
  // nonzero (the same old items don't count as "new").
  const dismiss = () => {
    dismissedAtCountRef.current = pendingCount
    setDismissed(true)
  }

  if (!visible || dismissed) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="relative border-b border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={dismiss}
            title="Close"
            className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <h2 className="text-base font-semibold text-slate-900 pr-8">
            {authStuck ? 'Sign in to finish syncing' : "You're back online"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {authStuck
              ? 'Your session expired while offline. Sign in again to sync your offline inspections.'
              : `${pendingCount} change${pendingCount === 1 ? '' : 's'} from your offline inspections ${syncing ? 'are syncing' : 'are ready to sync'}.`}
          </p>
          {syncError && !syncing && (
            <p className="mt-1.5 text-xs text-red-600">{syncError}</p>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto px-5 py-3">
          {groups.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing left to sync.</p>
          ) : (
            <ul className="space-y-3">
              {groups.map((g) => (
                <li key={g.poNumber}>
                  <div className="text-sm font-medium text-slate-700">PO {g.poNumber}</div>
                  {g.skus.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {g.skus.map((sku, i) => <SkuQueueItem key={i} sku={sku} />)}
                    </div>
                  )}
                  {g.callouts?.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {g.callouts.map((c, i) => (
                        <div key={i} className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                          <span className="font-semibold text-amber-700">{c.type}</span>
                          {c.text && <p className="text-slate-600 mt-0.5 whitespace-pre-wrap">{c.text}</p>}
                          {c.photoCount > 0 && <p className="text-slate-400 mt-0.5">{c.photoCount} photo{c.photoCount === 1 ? '' : 's'}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Dismiss
          </button>
          {!authStuck && (
            <button
              type="button"
              onClick={runSync}
              disabled={syncing}
              className="rounded-md px-4 py-1.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-700 disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : syncError ? 'Retry Sync' : 'Sync Now'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
