// PLAN OFFLINE - master switch. Offline mode is SWITCHED OFF (2026-09-19)
// until it is planned properly. Every gated block elsewhere is tagged
// "PLAN OFFLINE" so `grep -rn "PLAN OFFLINE" src` finds all of them.
//
// With this false the app behaves online-only:
//  - nothing new is written to IndexedDB: no local drafts, no staged photos,
//    no queued callouts, no cached PO list / PO detail / SKU master
//  - no rehydrating stale local drafts over server data
//  - no "Download for Offline", no offline dots or "showing offline data" notes
//  - saving, submitting, uploading photos and posting callouts while offline
//    show a clear "you're offline, connect to continue" message instead of
//    silently queueing
//
// What deliberately STAYS on (drain-only): the reconnect "Sync Now" screen and
// the sync engine (offlineSync.js / offlineDrafts.js reads). Devices may still
// hold offline work created before this switch was flipped (e.g. a QA with 49
// unsynced changes). Switching the sync-out off too would strand that data, so
// it keeps flowing to the server until every device is drained. Remove the
// drain only after confirming nothing is left pending on any device.
export const PLAN_OFFLINE_ENABLED = false
