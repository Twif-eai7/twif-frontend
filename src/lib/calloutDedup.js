// Duplicate-post guard for the offline callout queue - split out of
// CalloutModal.jsx (a component file) because a non-component named export
// living alongside a default component export breaks Fast Refresh
// (react-refresh/only-export-components). See offlineSync.js's
// syncOneCallout for the exact race this covers: CalloutModal.jsx's own
// submit() queues offline not just when genuinely offline, but also when
// navigator.onLine said there was a connection and the insert actually
// committed server-side, only for the response itself to be lost (a flaky
// signal, not a real failure) - that queued copy would otherwise get
// replayed and post the exact same text a second time.
import { supabase } from './supabase'

// po_comments has no unique constraint or idempotency key of its own, so
// this is a best-effort check: same PO/SKU-set/type/text/author, posted in
// roughly the last hour. False positives (someone genuinely posts the exact
// same text twice within an hour) just mean that second, legitimate post
// gets silently treated as a dup - a much smaller cost than the unbounded
// duplicate risk this replaces.
export async function calloutAlreadyPosted(callout) {
  const text = callout.text?.trim()
  if (!text) return false
  const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('po_comments')
    .select('id')
    .eq('po_id', callout.poId)
    .eq('comment_type', callout.calloutType)
    .eq('comment', text)
    .eq('created_by', callout.createdBy)
    .in('line_item_id', callout.itemIds)
    .gte('created_at', sinceIso)
    .limit(1)
  if (error) return false // a failed dedup check must not block a genuine post
  return (data?.length ?? 0) > 0
}
