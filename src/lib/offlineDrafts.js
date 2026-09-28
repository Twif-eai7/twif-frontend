// Offline-first inspection wizard - Phase 1 (local-first draft identity).
// See the approved plan for the full 5-phase design; this module is just the
// IndexedDB-backed draft store itself - InspectionForm.jsx's own autosave/
// flush logic is rewired to read/write through this in a later phase, not
// yet in this file.
//
// One IndexedDB database (`twif-offline-inspection`), two object stores:
//   - `drafts`: one row per (po_line_item_id, inspection_type, round) - the
//     JSON `patch` InspectionForm.jsx's own buildFullPatch() already
//     produces, plus enough identity to resume the same draft (not create a
//     duplicate) after a reload while still offline, and `serverReportId`
//     (null until the first successful sync creates the real
//     inspection_reports row - see the sync engine in offlineSync.js).
//   - `pendingPhotos`: one row per captured/picked photo not yet uploaded -
//     see Phase 3 of the plan. Not used by this module directly; declared
//     here so both stores share one DB-open/version-upgrade path instead of
//     two separate IndexedDB connections racing each other.
import { openDB } from 'idb'

const DB_NAME = 'twif-offline-inspection'
const DB_VERSION = 4
const DRAFTS_STORE = 'drafts'
const PHOTOS_STORE = 'pendingPhotos'
const CALLOUTS_STORE = 'pendingCallouts'
const PO_LIST_STORE = 'cachedPoList'
const PO_DETAIL_STORE = 'cachedPoDetail'
const SKU_MASTER_STORE = 'cachedSkuMaster'

let dbPromise = null

// Lazily opens (and upgrades) the shared DB connection - safe to call from
// many places; idb/openDB itself dedupes concurrent opens of the same
// name+version, this just avoids re-invoking openDB() on every call.
function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
          const store = db.createObjectStore(DRAFTS_STORE, { keyPath: 'draftId' })
          // Resuming the same SKU/stage/round's draft (not duplicating it)
          // is the whole point of this store - this is the lookup index
          // draftKeyFor()/getDraftByKey() below actually use.
          store.createIndex('byKey', ['poLineItemId', 'inspectionType', 'round'], { unique: true })
          store.createIndex('byDirty', 'dirty')
        }
        if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
          const photoStore = db.createObjectStore(PHOTOS_STORE, { keyPath: 'photoId' })
          photoStore.createIndex('byDraft', 'draftId')
        }
        if (!db.objectStoreNames.contains(CALLOUTS_STORE)) {
          db.createObjectStore(CALLOUTS_STORE, { keyPath: 'calloutId' })
        }
        if (!db.objectStoreNames.contains(PO_LIST_STORE)) {
          db.createObjectStore(PO_LIST_STORE, { keyPath: 'scopeKey' })
        }
        if (!db.objectStoreNames.contains(PO_DETAIL_STORE)) {
          db.createObjectStore(PO_DETAIL_STORE, { keyPath: 'poId' })
        }
        if (!db.objectStoreNames.contains(SKU_MASTER_STORE)) {
          db.createObjectStore(SKU_MASTER_STORE, { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

// Serializes every read-modify-write on ONE draft record behind a per-
// draftId promise chain - every mutator below (updateDraftPatch,
// markPendingCreate, setDraftServerReportId, etc.) reads the current record
// then writes a new one back, and without this, two calls for the same
// draftId firing close together (most plausibly InspectionForm.jsx's own
// local-durability effect re-running on back-to-back field edits, each
// kicking off its own independent `ensureDraft().then(() => updateDraftPatch(
// draftId, buildFullPatch()))` chain with no ordering guarantee between
// them) can interleave: both read the same "before" state, and whichever
// call's write happens to land LAST wins outright - even if it started
// first and is now the STALER of the two. Concretely, two remarks added a
// moment apart could each queue their own write of the full form snapshot
// as of when they fired, and the earlier (missing the second remark) write
// finishing after the later one would silently erase it. This queue makes
// same-draft writes commit strictly in the order they were called, not
// whatever order their underlying IndexedDB requests happen to settle in.
const draftWriteQueues = new Map()
function withDraftLock(draftId, fn) {
  const ahead = draftWriteQueues.get(draftId) ?? Promise.resolve()
  const run = ahead.catch(() => {}).then(fn)
  draftWriteQueues.set(draftId, run.catch(() => {}))
  return run
}

// Stable natural key for a draft - a SKU can only have one draft per
// (stage, round) at a time, same identity InspectionForm.jsx already keys
// its own report lookups by (getStage()/mostRecentSubmittedRound() etc.).
function draftKey(poLineItemId, inspectionType, round) {
  return [poLineItemId, inspectionType, round ?? 1]
}

// Finds this SKU/stage/round's existing draft, if any - called once when
// the wizard opens for a SKU, before deciding whether to mint a new
// draftId. Returns null if this exact draft was never started locally
// (e.g. a report that already exists server-side and was never edited
// offline on this device).
export async function getDraftByKey(poLineItemId, inspectionType, round) {
  const db = await getDb()
  return (await db.getFromIndex(DRAFTS_STORE, 'byKey', draftKey(poLineItemId, inspectionType, round))) ?? null
}

export async function getDraft(draftId) {
  const db = await getDb()
  return (await db.get(DRAFTS_STORE, draftId)) ?? null
}

// Creates a brand-new local draft - draftId is caller-supplied
// (crypto.randomUUID(), same convention InspectionForm.jsx already uses
// for other client-generated ids) so the caller can start referencing it
// (e.g. for photo capture) in the same tick, before this write resolves.
export async function createDraft({ draftId, poLineItemId, inspectionType, round, serverReportId = null, patch = {} }) {
  const db = await getDb()
  const record = {
    draftId,
    poLineItemId,
    inspectionType,
    round: round ?? 1,
    serverReportId,
    patch,
    updatedAt: Date.now(),
    dirty: false,
    // True once the user has taken an explicit "Save" action for a draft
    // that has no serverReportId yet - mirrors InspectionForm.jsx's own
    // existing rule that only an explicit action creates the report row,
    // never a passive autosave tick (so a stray keystroke on a form nobody
    // meant to fill in doesn't leave a near-empty draft behind). The sync
    // engine only ever attempts a CREATE for a draft with this set.
    pendingCreate: false,
  }
  await db.put(DRAFTS_STORE, record)
  return record
}

// Ensures a local draft row exists for this key without overwriting one
// that's already there (e.g. from a previous offline session) - the
// idempotent "make sure I have somewhere to write" call InspectionForm.jsx
// makes on first edit, instead of unconditionally creating on every mount.
export async function ensureDraft({ draftId, poLineItemId, inspectionType, round, serverReportId = null }) {
  const existing = await getDraft(draftId)
  if (existing) return existing
  return createDraft({ draftId, poLineItemId, inspectionType, round, serverReportId })
}

// Combines ensureDraft + updateDraftPatch into ONE call that's itself
// wrapped in withDraftLock, for callers (InspectionForm.jsx's local-
// durability effect) that used to chain `ensureDraft(...).then(() =>
// updateDraftPatch(draftId, patch))` - two separate calls with an `await`
// gap between them. That gap was a real bug: withDraftLock only serializes
// calls to updateDraftPatch itself, in whatever order they actually reach
// it - and ensureDraft's own resolve time isn't guaranteed to preserve the
// order its callers were originally triggered in (a later, newer edit's
// ensureDraft can resolve before an earlier, staler edit's), so the STALE
// patch could end up enqueued LAST and win, silently overwriting a field
// (e.g. a remark just added) with the value from before it existed. Calling
// this single function synchronously in the effect (instead of splitting
// ensure-then-write across an awaited `.then()`) means the lock is acquired
// in true call order, not resolve order.
export async function ensureDraftAndUpdatePatch({ draftId, poLineItemId, inspectionType, round, serverReportId, patch }) {
  return withDraftLock(draftId, async () => {
    const db = await getDb()
    const tx = db.transaction(DRAFTS_STORE, 'readwrite')
    let existing = await tx.store.get(draftId)
    if (!existing) {
      existing = {
        draftId, poLineItemId, inspectionType, round: round ?? 1, serverReportId: serverReportId ?? null,
        patch: {}, updatedAt: Date.now(), dirty: false, pendingCreate: false,
      }
    }
    const record = { ...existing, patch: { ...existing.patch, ...patch }, updatedAt: Date.now(), dirty: true }
    await tx.store.put(record)
    await tx.done
    return record
  })
}

// Marks that the user took an explicit Save action for a draft with no
// server row yet - see the `pendingCreate` field comment on createDraft
// above. Idempotent; safe to call on every explicit Save click.
export async function markPendingCreate(draftId) {
  return withDraftLock(draftId, async () => {
    const db = await getDb()
    const existing = await db.get(DRAFTS_STORE, draftId)
    if (!existing) return null
    const record = { ...existing, pendingCreate: true, dirty: true, updatedAt: Date.now() }
    await db.put(DRAFTS_STORE, record)
    return record
  })
}

// Merges `patchUpdate` into the draft's stored patch (shallow merge, same
// semantics as InspectionForm.jsx's own setDetails(prev => ({...prev, ...}))
// pattern) and marks it dirty for the sync engine to pick up. Never touches
// serverReportId - only setDraftServerReportId (below) does, and only the
// sync engine calls that, after a real create actually succeeds.
export async function updateDraftPatch(draftId, patchUpdate) {
  return withDraftLock(draftId, async () => {
    const db = await getDb()
    const tx = db.transaction(DRAFTS_STORE, 'readwrite')
    const existing = await tx.store.get(draftId)
    if (!existing) { await tx.done; return null }
    const record = { ...existing, patch: { ...existing.patch, ...patchUpdate }, updatedAt: Date.now(), dirty: true }
    await tx.store.put(record)
    await tx.done
    return record
  })
}

// Called by the sync engine only, once createInspectionReport() actually
// succeeds for this draft - from this point on, further syncs for this
// draft go through updateInspectionReport(serverReportId, ...) instead of
// trying to create it again.
export async function setDraftServerReportId(draftId, serverReportId) {
  return withDraftLock(draftId, async () => {
    const db = await getDb()
    const existing = await db.get(DRAFTS_STORE, draftId)
    if (!existing) return null
    // pendingCreate cleared - the row now exists, so from here on the sync
    // engine only ever attempts UPDATE for this draft, never CREATE again.
    const record = { ...existing, serverReportId, pendingCreate: false, updatedAt: Date.now() }
    await db.put(DRAFTS_STORE, record)
    return record
  })
}

// Called by the sync engine only, when an UPDATE against this draft's
// serverReportId matches zero rows - the report was deleted server-side
// (another device, an admin) while this draft still had queued offline
// edits. Deliberately NOT the same as setDraftServerReportId(draftId, null)
// above: that also clears `pendingCreate`, which would leave this draft
// with neither a serverReportId nor pendingCreate set - exactly the state
// attemptSync treats as "no explicit Save yet, not this draft's turn" -
// silently stranding it forever. Here `pendingCreate` is force-set back to
// true (and `dirty` stays true) so the very next sync attempt takes the
// createFn branch and makes a fresh row instead of losing the edits.
export async function clearMissingServerReport(draftId) {
  return withDraftLock(draftId, async () => {
    const db = await getDb()
    const existing = await db.get(DRAFTS_STORE, draftId)
    if (!existing) return null
    const record = { ...existing, serverReportId: null, pendingCreate: true, dirty: true, updatedAt: Date.now() }
    await db.put(DRAFTS_STORE, record)
    return record
  })
}

// Called by the sync engine only, after a patch has actually been written
// to Supabase successfully - clears `dirty` so this draft isn't re-sent
// next tick. Does NOT delete the draft record itself (it stays as the
// resumable local copy of "what this device last knew"), only flips the
// flag a fresh edit would set back to true.
export async function markDraftSynced(draftId) {
  return withDraftLock(draftId, async () => {
    const db = await getDb()
    const existing = await db.get(DRAFTS_STORE, draftId)
    if (!existing) return null
    const record = { ...existing, dirty: false }
    await db.put(DRAFTS_STORE, record)
    return record
  })
}

// Every draft the sync engine still owes a write to - polled on each sync
// trigger (online event / periodic timer / autosave tick) rather than kept
// as reactive state, since IndexedDB has no native change subscription.
//
// Filters the full table client-side rather than querying the `byDirty`
// index with the literal boolean `true` - IndexedDB keys can only be a
// number/date/string/binary/array, never a boolean, so that query has
// always thrown "The parameter is not a valid key" (a DataError, silently
// swallowed everywhere this was called with its own .catch - until
// ReconnectSyncScreen's periodic refresh() started calling getPendingCount()
// without one, which is what surfaced it as a repeating uncaught rejection).
// The index itself (`store.createIndex('byDirty', 'dirty')`, offlineDrafts.js
// db-upgrade above) is harmless to leave in place - just nothing queries it
// anymore. Table sizes here are small (one row per SKU/stage/round on this
// device), so a full scan is not a real cost.
export async function getDirtyDrafts() {
  const db = await getDb()
  const all = await db.getAll(DRAFTS_STORE)
  return all.filter(d => d.dirty)
}

export async function getAllDrafts() {
  const db = await getDb()
  return db.getAll(DRAFTS_STORE)
}

// ── Pending submit (offline Submit, not just Save) ──────────────────────────
// A draft's `patch` already carries `status: 'submitted'`/`submitted_at` once
// InspectionForm.jsx's handleSubmit runs offline (folded straight into the
// same patch object Save already uses - see updateDraftPatch above), so the
// base report row syncs through the exact same create/update path as any
// other draft. `pendingSubmit` is the one thing that path doesn't cover: the
// leftover-quantity decision (Reschedule/Reject) the inspector made in
// person, whose DB effects (booking a follow-up schedule entry / starting a
// new inspection round / writing off a rejection) still need to actually
// happen once reconnected - see offlineSync.js's attemptSyncSubmit.
export async function markPendingSubmit(draftId, submitInfo) {
  return withDraftLock(draftId, async () => {
    const db = await getDb()
    const existing = await db.get(DRAFTS_STORE, draftId)
    if (!existing) return null
    const record = { ...existing, pendingSubmit: submitInfo, updatedAt: Date.now() }
    await db.put(DRAFTS_STORE, record)
    return record
  })
}

// Called by the sync engine only, once attemptSyncSubmit's leftover-action
// replay has actually landed - clears the flag so a later sync tick doesn't
// redo it (the base patch's own `dirty` flag is what markDraftSynced already
// governs; this is a separate, second thing to finish for a submitted draft).
export async function clearPendingSubmit(draftId) {
  return withDraftLock(draftId, async () => {
    const db = await getDb()
    const existing = await db.get(DRAFTS_STORE, draftId)
    if (!existing) return null
    const record = { ...existing, pendingSubmit: null, updatedAt: Date.now() }
    await db.put(DRAFTS_STORE, record)
    return record
  })
}

// Every draft still owed a leftover-action replay - swept alongside
// getDirtyDrafts() by the reconnect sync screen/background sync, since a
// draft can finish syncing its base patch (dirty: false) while its
// pendingSubmit action is still outstanding (or fails and needs a retry).
export async function getDraftsPendingSubmit() {
  const db = await getDb()
  const all = await db.getAll(DRAFTS_STORE)
  return all.filter(d => d.pendingSubmit)
}

// ── Pending photos (Phase 3 - offline photo capture) ────────────────────────
// A photo captured/picked while offline (or before this draft's report row
// exists yet - RowPhotoCell/PhotoGrid used to disable capture entirely
// until reportId existed) is stored here instead of uploaded immediately.
// `blob` is the raw File/Blob - IndexedDB stores binary data natively, no
// base64 encoding needed. `stepKey` distinguishes which of Packaging/
// Measurement/Defects/Digitals row this belongs to (RowPhotoCell's own
// convention), null for Digitals/PhotoGrid's bulk uploads which have no
// per-row concept.

// draftId's own format is always `${poLineItemId}:${inspectionType}:${round}`
// (see InspectionForm.jsx) - a stable composite key, so it can be parsed
// back into its identity fields from the string alone when only the
// draftId is available (self-healing an orphaned photo record below).
// Returns null for anything that doesn't match the expected shape, rather
// than guessing.
function parseDraftId(draftId) {
  const parts = String(draftId ?? '').split(':')
  if (parts.length !== 3) return null
  const [poLineItemId, inspectionType, roundStr] = parts
  const round = Number(roundStr)
  if (!poLineItemId || !inspectionType || !Number.isFinite(round)) return null
  return { poLineItemId, inspectionType, round }
}

// One photo, staged locally - photoId is caller-supplied
// (crypto.randomUUID()) so the caller can render it immediately via
// URL.createObjectURL(blob) in the same tick, before this write resolves.
// Ensures the owning draft row exists first - a real bug found live: both
// call sites of this function (RowPhotoCell/PhotoGrid in InspectionForm.jsx)
// could be the very first thing that ever touches this draft (a photo taken
// before any other Save), and neither one guaranteed a draft record existed
// first. A photo queued with no matching draft row is permanently invisible
// to the sync engine (flushPendingPhotos needs a draft to find a
// serverReportId to upload against) while still inflating getPendingCount(),
// producing exactly "N changes ready to sync" next to "Nothing left to
// sync" on every reload, with no way to ever clear it. Enforced here, the
// one place every pending photo gets created, instead of trusted to each
// caller's own discipline.
export async function addPendingPhoto({ photoId, draftId, stepKey = null, blob, fileName = null }) {
  const db = await getDb()
  const existingDraft = await db.get(DRAFTS_STORE, draftId)
  if (!existingDraft) {
    const parsed = parseDraftId(draftId)
    if (parsed) await createDraft({ draftId, ...parsed, serverReportId: null })
  }
  const record = { photoId, draftId, stepKey, blob, fileName, createdAt: Date.now() }
  await db.put(PHOTOS_STORE, record)
  return record
}

export async function getPendingPhotosForDraft(draftId) {
  const db = await getDb()
  return db.getAllFromIndex(PHOTOS_STORE, 'byDraft', draftId)
}

// Every draft that has at least one still-unuploaded photo, even one whose
// own patch is otherwise clean (dirty: false) - real bug found live:
// addPendingPhoto used to never mark the owning draft dirty (now fixed
// above to at least guarantee the draft row exists), so a photo taken while
// online (nothing else about the form changed) was invisible to
// getDirtyDrafts()/getDraftsPendingSubmit() - neither the reconnect
// screen's "Sync Now" nor anything else ever called flushPendingPhotos for
// it. Also self-heals any photo queued BEFORE that fix existed (already
// sitting orphaned in a user's local IndexedDB) by recreating its draft row
// from the photo's own draftId the same way, so an already-stuck photo
// becomes syncable too instead of needing every affected user to somehow
// manually clear it. Swept alongside getDirtyDrafts()/
// getDraftsPendingSubmit() in the sync engine's own target list so a
// photo-only draft is no longer invisible to it.
export async function getDraftsWithPendingPhotos() {
  const db = await getDb()
  const allPhotos = await db.getAll(PHOTOS_STORE)
  const draftIds = [...new Set(allPhotos.map(p => p.draftId))]
  const drafts = await Promise.all(draftIds.map(async id => {
    const existing = await db.get(DRAFTS_STORE, id)
    if (existing) return existing
    const parsed = parseDraftId(id)
    return parsed ? createDraft({ draftId: id, ...parsed, serverReportId: null }) : null
  }))
  return drafts.filter(Boolean)
}

// Called by the sync engine only, once a pending photo has actually
// uploaded to Storage and its inspection_report_photos row has been
// inserted successfully.
export async function removePendingPhoto(photoId) {
  const db = await getDb()
  await db.delete(PHOTOS_STORE, photoId)
}

// ── Pending callouts (Phase 3 continued - offline PPM/Pilot Run Callouts) ──
// Unlike inspection drafts, a callout has no "create then update" ordering
// to worry about - CalloutModal's own submit() is a single one-shot
// insert (po_comments rows, plus po_comment_photos if there were photos),
// with no report row or other prerequisite to wait on. So this only ever
// needs ONE local record per un-posted callout, synced in one shot once
// there's a network to send it over - no separate "pending photos" split
// the way inspection reports needed (photos there could only upload once
// their OWN report row existed; a callout's photos have nothing to wait
// on beyond the callout's own SKUs already being known up front).
export async function addPendingCallout({ calloutId, poId, poNumber, calloutType, itemIds, skuRefById, text, photoBlobs, createdBy }) {
  const db = await getDb()
  const record = { calloutId, poId, poNumber, calloutType, itemIds, skuRefById, text, photoBlobs, createdBy, createdAt: Date.now() }
  await db.put(CALLOUTS_STORE, record)
  return record
}

export async function getAllPendingCallouts() {
  const db = await getDb()
  return db.getAll(CALLOUTS_STORE)
}

// Every pending callout for one PO - CalloutModal only ever needs its own
// PO's queued callouts (to show "N queued offline" / merge into its own
// list), not the whole app's.
export async function getPendingCalloutsForPo(poId) {
  const db = await getDb()
  return (await db.getAll(CALLOUTS_STORE)).filter(c => c.poId === poId)
}

// Called by the sync engine only, once a pending callout has actually
// posted successfully (its po_comments/po_comment_photos rows exist).
export async function removePendingCallout(calloutId) {
  const db = await getDb()
  await db.delete(CALLOUTS_STORE, calloutId)
}

// ── App-wide offline status (Phase 4 - status indicator) ────────────────────
// One combined tally across the whole app, not just whichever SKU's wizard
// happens to be open - a QA who's been offline for a while may have queued
// changes across several SKUs (and callouts) at once, and the indicator's
// whole point is to say "here's everything still waiting", not just this
// one screen's own count.
export async function getPendingCount() {
  const db = await getDb()
  const [allDrafts, allPhotos, allCallouts] = await Promise.all([
    db.getAll(DRAFTS_STORE),
    db.getAll(PHOTOS_STORE),
    db.getAll(CALLOUTS_STORE),
  ])
  // A draft whose base patch already synced (dirty: false) but whose
  // leftover-quantity replay is still outstanding (pendingSubmit set) isn't
  // caught by a plain dirty check - it still counts as something owed.
  const owed = allDrafts.filter(d => d.dirty || d.pendingSubmit).length
  return owed + allPhotos.length + allCallouts.length
}

// Everything queued (drafts with a real save intent, or already synced-once
// but still dirty, plus every pending callout) grouped by PO - the shape
// the reconnect sync screen needs to say "PO 131870 - 3 SKUs" instead of a
// bare count. Deliberately includes every draft with SOME saved intent
// (dirty OR pendingCreate OR already has a serverReportId), not just
// `getDirtyDrafts()` - a draft that's mid-sync (dirty just cleared by one
// tick but its photos haven't flushed yet) should still show up here so
// the screen doesn't look done while photos are still trickling in.
export async function getQueueSummaryByPo() {
  const db = await getDb()
  const [allDrafts, allCallouts, draftsWithPhotos] = await Promise.all([
    db.getAll(DRAFTS_STORE),
    db.getAll(CALLOUTS_STORE),
    // Reuses the same self-healing lookup the sync engine's own target list
    // uses (see its doc comment) rather than a plain draftId membership
    // check against allDrafts - a photo queued before its draft row existed
    // (or before the addPendingPhoto fix that now guarantees one) wouldn't
    // be caught by checking allDrafts alone, since there'd be no matching
    // row to find there yet; this recreates it first, so it isn't just
    // "swept up" here but by the sync engine that actually gets it fixed.
    getDraftsWithPendingPhotos(),
  ])
  const draftIdsWithPhotos = new Set(draftsWithPhotos.map(d => d.draftId))
  const byId = new Map(allDrafts.map(d => [d.draftId, d]))
  for (const d of draftsWithPhotos) if (!byId.has(d.draftId)) byId.set(d.draftId, d)
  // Also includes a draft whose only outstanding thing is a still-unuploaded
  // photo (dirty/pendingCreate/pendingSubmit all false) - this comment
  // already described the intent ("photos haven't flushed yet" should
  // still show up here), the filter itself just didn't implement it for a
  // draft with no OTHER outstanding change.
  const relevantDrafts = [...byId.values()].filter(d => d.dirty || d.pendingCreate || d.pendingSubmit || draftIdsWithPhotos.has(d.draftId))
  // Grouping by PO itself happens in the caller (ReconnectSyncScreen) - a
  // draft only knows its own poLineItemId, not which PO that line item
  // belongs to; resolving that needs the cached PO list's po_line_items,
  // which this module has no reason to duplicate here.
  return { drafts: relevantDrafts, callouts: allCallouts }
}

// ── Cached PO list (choose-a-PO offline) ────────────────────────────────────
// `scopeKey` is a stable signature of WHO is asking (isRestricted/
// scheduleRestrictEmail/memberId) - different users legitimately see
// different lists, so this can't be one global cache entry. Caller (
// PoInspectionComments.jsx) builds the same scopeKey it already computes
// those three values from.
export async function setCachedPoList(scopeKey, pos) {
  const db = await getDb()
  await db.put(PO_LIST_STORE, { scopeKey, pos, fetchedAt: Date.now() })
}

export async function getCachedPoList(scopeKey) {
  const db = await getDb()
  return (await db.get(PO_LIST_STORE, scopeKey)) ?? null
}

// ── Cached PO detail (open-a-PO offline) ────────────────────────────────────
// One entry per PO actually opened while online - `inspectionReports`/
// `scheduleEntries` are the exact shapes useInspectionReportsForPo's
// `reports` and fetchPoScheduleEntries's `entries` already return, cached
// verbatim so the offline read-path is a drop-in swap for the online one,
// not a different shape the rest of PoInspectionComments.jsx has to
// special-case.
export async function setCachedPoDetail(poId, { inspectionReports, scheduleEntries }) {
  const db = await getDb()
  await db.put(PO_DETAIL_STORE, { poId, inspectionReports, scheduleEntries, fetchedAt: Date.now() })
}

export async function getCachedPoDetail(poId) {
  const db = await getDb()
  return (await db.get(PO_DETAIL_STORE, poId)) ?? null
}

// Every PO id with a cached detail entry - powers the "available offline"
// badge on each sidebar row (a Set for O(1) `.has()` per row instead of
// re-querying IndexedDB per row).
export async function getCachedPoDetailIds() {
  const db = await getDb()
  return new Set(await db.getAllKeys(PO_DETAIL_STORE))
}

// ── Cached SKU master data ───────────────────────────────────────────────────
// useSkuMasterData (useInspectionReports.js) had no offline fallback at all
// until this store existed - a SKU's dimensions/materials/barcodes/category
// come from the `skus` table, not from inspection_reports, so cachedPoDetail
// above never covered it. Keyed by sku id (not po id) since the same SKU can
// appear on multiple POs and only needs caching once.
export async function setCachedSkuMasterMany(skuRows) {
  const db = await getDb()
  const tx = db.transaction(SKU_MASTER_STORE, 'readwrite')
  await Promise.all((skuRows ?? []).map(s => tx.store.put(s)))
  await tx.done
}

export async function getCachedSkuMasterMany(skuIds) {
  const db = await getDb()
  const tx = db.transaction(SKU_MASTER_STORE, 'readonly')
  const rows = await Promise.all((skuIds ?? []).map(id => tx.store.get(id)))
  await tx.done
  return rows.filter(Boolean)
}
