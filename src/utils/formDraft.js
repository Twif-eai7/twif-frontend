// Shared localStorage draft persistence for PLM form modals (Edit Attributes, Create SKU,
// Bulk Create, Catalog Upload) — none of these save anything until the user explicitly hits
// Save/Create, so an accidental page reload (or a crash/tab close) used to silently discard
// whatever had been typed. Each modal owns its own draft key (usually derived from the set of
// SKU ids it's editing) and just calls these three functions; this file only handles the
// storage mechanics (JSON, staleness, quota/private-mode failures) so each modal doesn't have
// to reimplement them.

const MAX_AGE_MS = 24 * 60 * 60 * 1000 // drafts older than a day are treated as abandoned, not restored

/** Debounced save — call on every edit; wrap the actual write in a timer at the call site
 *  (see saveFormDraftDebounced) so fast typing doesn't hit localStorage on every keystroke. */
export function saveFormDraft(key, data) {
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }))
  } catch { /* quota exceeded / private mode — draft-saving is a convenience, never fatal */ }
}

// One shared debounce timer per key so rapid edits (typing) don't write on every keystroke,
// while still saving quickly enough that a refresh moments later doesn't lose the latest change.
const debounceTimers = new Map()
export function saveFormDraftDebounced(key, data, delayMs = 600) {
  if (!key) return
  clearTimeout(debounceTimers.get(key))
  debounceTimers.set(key, setTimeout(() => saveFormDraft(key, data), delayMs))
}

/** Returns the saved data, or null if there's no draft, it's corrupt, or it's older than
 *  maxAgeMs (default 24h) — an old abandoned draft reappearing days later would be more
 *  confusing than helpful. */
export function loadFormDraft(key, maxAgeMs = MAX_AGE_MS) {
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) return null
    if (Date.now() - (parsed.ts || 0) > maxAgeMs) { clearFormDraft(key); return null }
    return parsed.data
  } catch { return null }
}

export function clearFormDraft(key) {
  if (!key) return
  clearTimeout(debounceTimers.get(key))
  debounceTimers.delete(key)
  try { localStorage.removeItem(key) } catch { /* ignored */ }
}
