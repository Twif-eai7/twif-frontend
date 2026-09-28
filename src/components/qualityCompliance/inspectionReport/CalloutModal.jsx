import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../../lib/supabase'
import { uploadToInspectionBucket, getInspectionFileUrl, removeFromInspectionBucket } from '../../../lib/inspectionStorage'
import { CameraCaptureModal } from './InspectionForm'
import ImageLightbox from '../../ui/ImageLightbox'
import PhotoGalleryModal from '../../ui/PhotoGalleryModal'
import { downloadImages } from '../../../lib/downloadImages'
import { useSendMailStore } from '../../../stores/sendMailStore'
import { addPendingCallout, getPendingCalloutsForPo } from '../../../lib/offlineDrafts'
import { PLAN_OFFLINE_ENABLED } from '../../../lib/planOffline'

function Spinner({ size = 'w-4 h-4' }) {
  return (
    <svg className={`${size} animate-spin text-gray-400`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

const MAX_VISIBLE_PHOTOS = 5

// A batch of attached photos (pending or already-posted) shown as a
// compact "uploaded" strip rather than an ever-growing wall of images -
// selecting/posting a big batch (dozens of files) stayed the same small
// size as one or two, with the rest folded behind a "+N" tile. Clicking a
// visible thumbnail opens the full ImageLightbox (single-image pager);
// clicking the "+N" tile instead opens PhotoGalleryModal - the whole set,
// selectable and downloadable, not just viewable one at a time.
function PhotoStrip({ images, onOpen, onOpenAll, onRemove }) {
  const overflow = images.length - MAX_VISIBLE_PHOTOS
  const visible = overflow > 0 ? images.slice(0, MAX_VISIBLE_PHOTOS) : images
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((img, i) => (
        <div key={img.key} className="relative w-12 h-12 rounded-md overflow-hidden border border-gray-200 flex-shrink-0 group">
          <img src={img.src} alt="" onClick={() => onOpen(i)} className="w-full h-full object-cover cursor-zoom-in" />
          {onRemove && (
            <button type="button" onClick={() => onRemove(img.key)}
              className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center rounded-bl bg-black/60 text-white">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
        </div>
      ))}
      {overflow > 0 && (
        <button type="button" onClick={onOpenAll}
          className="w-12 h-12 rounded-md border border-gray-200 bg-gray-900/80 hover:bg-gray-900 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors">
          +{overflow}
        </button>
      )}
    </div>
  )
}

// A generalized, multi-SKU sibling of SkuCommentsModal.jsx - same
// po_comments table, list+textarea+Post UI, and card styling, but scoped
// to N checked SKUs at once (one submit synced to all of them) instead of
// a single SKU/PO thread, and driven by a `calloutType` discriminator
// ('PPM_CALLOUT' / 'PILOT_RUN_CALLOUT') instead of the hardcoded
// 'QA_INSPECTION' SkuCommentsModal uses. po_comments has no CHECK
// constraint on comment_type (confirmed live) and no denormalized sku_ref
// column, so each entry is tagged with its SKU via the `items` prop's
// po_line_item_id -> sku_ref map rather than a join.
export default function CalloutModal({ po, items, allItems, calloutType, calloutLabel, userName, canComment, viewOnlyMessage, onClose, onSubmitted }) {
  // The full SKU list the SKUs drawer offers - falls back to `items` (the caller's initial
  // selection) if a caller doesn't pass every SKU on the PO, so the drawer still shows something
  // rather than nothing.
  const allSkus = allItems || items
  // Which SKUs this callout is for - seeded once from `items` (whatever the caller opened the
  // modal with, checked SKUs or none) and from then on ONLY ever changed by the user, here in the
  // SKUs drawer below. The caller's own `items` prop is deliberately never read again after this -
  // it is a starting point, not something that can silently override the user's choice mid-session.
  const [selectedIds, setSelectedIds] = useState(() => new Set(items.map(i => i.po_line_item_id)))
  const [skusOpen, setSkusOpen] = useState(false)
  const [skuSearch, setSkuSearch] = useState('')
  const visibleSkus = useMemo(() => {
    const q = skuSearch.trim().toLowerCase()
    return q ? allSkus.filter(it => (it.sku_ref || '').toLowerCase().includes(q)) : allSkus
  }, [allSkus, skuSearch])
  const toggleSku = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const allSkusChecked = allSkus.length > 0 && selectedIds.size === allSkus.length
  const selectAllSkus = () => setSelectedIds(allSkusChecked ? new Set() : new Set(allSkus.map(it => it.po_line_item_id)))
  const selectedItems = useMemo(() => allSkus.filter(it => selectedIds.has(it.po_line_item_id)), [allSkus, selectedIds])
  const [callouts, setCallouts] = useState([])
  const [loading, setLoading]   = useState(false)
  const [text, setText]         = useState('')
  const [posting, setPosting]   = useState(false)
  const [postError, setPostError] = useState(null)
  // Staged locally (not uploaded yet) - a callout's po_comments rows don't
  // exist until Post is clicked, unlike Digitals' PhotoGrid which uploads
  // immediately because a report row already exists to attach to. Staging
  // here avoids orphaned storage objects if the user picks a photo then
  // closes without posting.
  const [pendingPhotos, setPendingPhotos] = useState([]) // [{ file, previewUrl }]
  const [showCamera, setShowCamera] = useState(false)
  const [lightbox, setLightbox] = useState(null) // { images, startIndex } | null
  const [downloadingKey, setDownloadingKey] = useState(null) // which posted callout's photos are zipping right now
  const [gallery, setGallery] = useState(null) // images | null - the "+N" tile's selectable download view
  // Delete - a two-step affair (confirm bar first) so a stray tap on the
  // cross can't silently wipe out a whole multi-SKU entry. confirmDeleteKey
  // is which group is showing its "Delete this entry?" bar; deletingKey is
  // which one is actually in flight.
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null)
  const [deletingKey, setDeletingKey] = useState(null)
  // Edit - swaps one group's card into an editable form in place. Since a
  // grouped entry is really N po_comments rows (one per SKU, see
  // groupedCallouts below), saving writes the text to all of them and keeps
  // every row's photo set in sync rather than editing just the first row.
  const [editingKey, setEditingKey] = useState(null)
  const [editText, setEditText] = useState('')
  const [editKeepPhotoIds, setEditKeepPhotoIds] = useState(() => new Set()) // existing po_comment_photos ids to keep
  const [editNewPhotos, setEditNewPhotos] = useState([]) // [{ file, previewUrl }] staged to add
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState(null)
  // Callouts posted while offline, staged in IndexedDB and not yet synced
  // (see offlineDrafts.js's pendingCallouts store) - shown merged into the
  // list below with a "queued" marker instead of silently disappearing
  // until the background sync engine gets to them.
  const [pendingCallouts, setPendingCallouts] = useState([])
  const refreshPendingCallouts = () => {
    getPendingCalloutsForPo(po.id).then(setPendingCallouts).catch(() => {})
  }

  // Base filename for a downloaded photo/zip - e.g. "PPM_CALLOUT-300285".
  const zipBaseName = `${calloutType}-${po.po_number || po.id}`

  // A primitive string, not the `selectedItems`/`allSkus` arrays themselves - a caller that
  // rebuilds its item arrays fresh every render (a plain .map(), no useMemo) still passes a new
  // array *reference* each time even when its actual content is unchanged; keying off this string
  // instead means React's by-value comparison correctly treats "same set of SKUs" as "same
  // dependency" regardless of whether the caller bothered to memoize its own prop, or the user is
  // just toggling checkboxes in the SKUs drawer below - this is what actually stops fetchCallouts
  // from re-running (and flashing "Loading…") on every unrelated re-render.
  const itemsKey = [...selectedIds].sort().join(',')
  // Built from the FULL SKU list, not just the current selection - a callout already shown in the
  // list below must still resolve its SKU tag correctly even after that SKU is unticked here.
  const allSkusKey = allSkus.map(i => i.po_line_item_id).sort().join(',')
  const skuRefById = useMemo(() => new Map(allSkus.map(i => [i.po_line_item_id, i.sku_ref])), [allSkusKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const lineItemIds = useMemo(() => [...selectedIds], [itemsKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // One post to several SKUs at once inserts one po_comments row per SKU (submit()'s own `rows`,
  // same text/photos on each - po_comments has no "one row, many SKUs" shape). Shown here as ONE
  // entry with every SKU it covers, not one repeated row per SKU: grouped by whatever a single
  // Post click actually shares - same author, same text and the same instant (one INSERT
  // statement, so Postgres' now() is identical across every row it creates). A callout that
  // genuinely differs in any of those (posted separately) still gets its own row, as before.
  const groupedCallouts = useMemo(() => {
    const byKey = new Map()
    for (const c of callouts) {
      const key = `${c.created_by}|${c.comment}|${c.created_at}`
      let group = byKey.get(key)
      if (!group) {
        group = { key, ids: [], created_by: c.created_by, created_at: c.created_at, comment: c.comment, po_comment_photos: c.po_comment_photos, skuRefs: [] }
        byKey.set(key, group)
      }
      group.ids.push(c.id)
      group.skuRefs.push(skuRefById.get(c.line_item_id) || 'SKU')
    }
    return [...byKey.values()]
  }, [callouts, skuRefById])
  // Queued-offline callouts relevant to THIS modal's stage/SKU selection -
  // pendingCallouts itself holds every un-synced callout for the whole PO
  // (any calloutType, any SKU subset), not just this one.
  // Nothing ticked in the SKUs drawer (the default state, since selection is never guessed any
  // more) means "show me every callout on this PO", not "show me nothing" - a post made a moment
  // ago (or by someone else) must never look like it vanished just because the drawer reset back
  // to empty on reopen. Only actually filters to specific SKUs once the user has picked some.
  const relevantPending = useMemo(
    () => pendingCallouts.filter(c => c.calloutType === calloutType && (!lineItemIds.length || c.itemIds.some(id => lineItemIds.includes(id)))),
    [pendingCallouts, calloutType, lineItemIds]
  )

  const fetchCallouts = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('po_comments')
      .select('id, line_item_id, comment, created_by, created_at, po_comment_photos(id, storage_path)')
      .eq('po_id', po.id)
      .eq('comment_type', calloutType)
    if (lineItemIds.length) query = query.in('line_item_id', lineItemIds)
    const { data } = await query.order('created_at', { ascending: true })
    setLoading(false)
    setCallouts(data || [])
  }, [po.id, calloutType, lineItemIds])

  useEffect(() => { fetchCallouts() }, [fetchCallouts])

  useEffect(() => { refreshPendingCallouts() }, [po.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // No automatic network sync here anymore - explicit user request: nothing
  // should post to Supabase without the QA choosing to, via the "Sync Now"
  // button on ReconnectSyncScreen.jsx (which already sweeps every queued
  // callout app-wide, this modal's included, using the exact same
  // syncAllPendingCallouts call this effect used to fire on its own timer).
  // What's left is purely local: once that button's sync finishes, it
  // broadcasts 'offline-sync-completed' so this modal (if still open) can
  // refresh its own lists and show the callout as posted, without itself
  // making the write.
  useEffect(() => {
    const onSyncCompleted = () => { refreshPendingCallouts(); fetchCallouts() }
    window.addEventListener('offline-sync-completed', onSyncCompleted)
    return () => window.removeEventListener('offline-sync-completed', onSyncCompleted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Revoke every staged preview URL on unmount so a closed-without-posting
  // modal doesn't leak blob: URLs.
  useEffect(() => () => { pendingPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl)) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { editNewPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl)) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Per-callout Send Mail - same shared confirm-dialog UX
  // InspectionReportEntry.jsx's own toolbar Send Mail button uses (queued
  // through useSendMailStore, rendered once at the app-shell layer so it
  // survives regardless of which modal triggered it), just scoped to this
  // one callout record's own recipients/content instead of a batch of
  // inspection reports - callouts have no report/PDF to attach, so the
  // backend route sends the callout's text only (see callout-notify route).
  const sendCalloutMail = (calloutId) => {
    useSendMailStore.getState().requestSend({
      previewRequest: {
        url: `${import.meta.env.VITE_BACKEND_URL}/inspection-schedule/callout-notify/preview`,
        body: { calloutId },
      },
      buildSendRequests: (selectedEmails) => [{
        url: `${import.meta.env.VITE_BACKEND_URL}/inspection-schedule/callout-notify`,
        body: { calloutId, selectedEmails },
      }],
    })
  }

  const startEdit = (g) => {
    setConfirmDeleteKey(null)
    setEditError(null)
    setEditingKey(g.key)
    setEditText(g.comment || '')
    setEditKeepPhotoIds(new Set((g.po_comment_photos || []).map(p => p.id)))
    setEditNewPhotos([])
  }
  const cancelEdit = () => {
    editNewPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl))
    setEditingKey(null)
    setEditNewPhotos([])
    setEditError(null)
  }
  const toggleKeepPhoto = (id) => setEditKeepPhotoIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const addEditFiles = (files) => {
    const next = files.map(file => ({ file, previewUrl: URL.createObjectURL(file) }))
    setEditNewPhotos(prev => [...prev, ...next])
  }
  const removeEditNewPhoto = (previewUrl) => {
    setEditNewPhotos(prev => prev.filter(p => {
      if (p.previewUrl === previewUrl) { URL.revokeObjectURL(p.previewUrl); return false }
      return true
    }))
  }

  // Saves an edited group. All of a group's po_comments rows (one per SKU
  // it was posted for) get the same updated text, matching how they were
  // created together as one row-per-SKU batch - editing the entry edits it
  // for every SKU it covers, not just one row.
  const saveEdit = async (g) => {
    // Same rule submit() already enforces for a brand-new post - an entry
    // can't be saved down to nothing (no text, no photos left).
    if (!editText.trim() && editKeepPhotoIds.size === 0 && editNewPhotos.length === 0) {
      setEditError('Add some text or keep at least one photo before saving.')
      return
    }
    setEditSaving(true)
    setEditError(null)
    try {
      const { error: textErr } = await supabase.from('po_comments').update({ comment: editText.trim() }).in('id', g.ids)
      if (textErr) throw textErr

      // Removed photos: g.po_comment_photos only reflects one representative
      // row's photo set (see groupedCallouts), but every row in the group
      // was given its own copy of each photo at post time (same
      // storage_path, different comment_id) - so a removal has to match by
      // storage_path across every id in the group, not just delete one row.
      const removedPaths = (g.po_comment_photos || [])
        .filter(p => !editKeepPhotoIds.has(p.id))
        .map(p => p.storage_path)
      if (removedPaths.length) {
        const { error: removeErr } = await supabase.from('po_comment_photos')
          .delete().in('comment_id', g.ids).in('storage_path', removedPaths)
        if (removeErr) throw removeErr
        // DB rows for every SKU's copy are gone - the underlying objects
        // (one per distinct path, shared across the group's rows) can go too.
        await removeFromInspectionBucket(removedPaths)
      }

      // New photos: uploaded once, then given to every row in the group -
      // same fan-out submit() already does for a brand-new post.
      if (editNewPhotos.length) {
        const uploadedPaths = []
        for (const { file } of editNewPhotos) {
          uploadedPaths.push(await uploadToInspectionBucket(file, `callouts/${calloutType.toLowerCase()}/${po.id}`))
        }
        const photoRows = g.ids.flatMap(id => uploadedPaths.map(storage_path => ({ comment_id: id, storage_path })))
        const { error: addErr } = await supabase.from('po_comment_photos').insert(photoRows)
        if (addErr) throw addErr
      }

      editNewPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl))
      setEditingKey(null)
      setEditNewPhotos([])
      setEditSaving(false)
      fetchCallouts()
    } catch (err) {
      setEditSaving(false)
      setEditError(err?.message ? `Could not save: ${err.message}` : 'Could not save this edit. Check your connection and try again.')
    }
  }

  // Deletes every row a group represents (all SKUs that one Post covered),
  // since the UI shows them as a single entry - not a per-SKU removal.
  const deleteGroup = async (g) => {
    setDeletingKey(g.key)
    try {
      const { error: photoErr } = await supabase.from('po_comment_photos').delete().in('comment_id', g.ids)
      if (photoErr) throw photoErr
      const { error } = await supabase.from('po_comments').delete().in('id', g.ids)
      if (error) throw error
      await removeFromInspectionBucket((g.po_comment_photos || []).map(p => p.storage_path))
      setCallouts(prev => prev.filter(c => !g.ids.includes(c.id)))
      setConfirmDeleteKey(null)
    } catch {
      // Leave the confirm bar up so the user can see it didn't go through
      // and try again, rather than silently pretending it worked.
    } finally {
      setDeletingKey(null)
    }
  }

  const addPendingFiles = (files) => {
    const next = files.map(file => ({ file, previewUrl: URL.createObjectURL(file) }))
    setPendingPhotos(prev => [...prev, ...next])
  }
  const removePendingPhoto = (previewUrl) => {
    setPendingPhotos(prev => prev.filter(p => {
      if (p.previewUrl === previewUrl) { URL.revokeObjectURL(p.previewUrl); return false }
      return true
    }))
  }

  // Queues this callout locally instead of posting it - offline (or a
  // genuine network failure below), same as the online path this replaces
  // is meant to have already tried and failed. Shares the finishing steps
  // (clear the form, revoke preview URLs) with the online success path,
  // just skips the network calls themselves.
  const queueOffline = async () => {
    await addPendingCallout({
      calloutId: crypto.randomUUID(), poId: po.id, poNumber: po.po_number, calloutType,
      itemIds: selectedItems.map(i => i.po_line_item_id), skuRefById: Object.fromEntries(skuRefById),
      text: text.trim(), photoBlobs: pendingPhotos.map(p => p.file), createdBy: userName,
    })
    refreshPendingCallouts()
  }

  const submit = async () => {
    if ((!text.trim() && !pendingPhotos.length) || !selectedItems.length) return
    setPosting(true)
    setPostError(null)

    // PLAN OFFLINE (disabled): nothing is queued locally - keep the text and
    // photos in the form so the user can post once they are back online.
    if (!PLAN_OFFLINE_ENABLED && !navigator.onLine) {
      setPosting(false)
      setPostError("You're offline. Connect to the internet to post this callout.")
      return
    }

    if (!navigator.onLine) {
      await queueOffline()
      setPosting(false)
      setText('')
      pendingPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl))
      setPendingPhotos([])
      onSubmitted?.()
      return
    }

    try {
      // Each upload tried independently - one bad file (network blip, a huge
      // phone photo) shouldn't drop the rest of the batch, same resilience
      // PhotoGrid.handleFiles already uses for Digitals.
      const uploadFailures = []
      const uploadedPaths = []
      for (const { file } of pendingPhotos) {
        try {
          uploadedPaths.push(await uploadToInspectionBucket(file, `callouts/${calloutType.toLowerCase()}/${po.id}`))
        } catch (err) {
          uploadFailures.push(err?.message || 'Upload failed')
        }
      }

      // One row per selected SKU, same text - "synced" to every checked SKU
      // in a single action, matching po_comments' existing per-SKU-row shape
      // rather than bundling the selection into one jsonb-array row.
      const rows = selectedItems.map(({ po_line_item_id }) => ({
        po_id: po.id, line_item_id: po_line_item_id,
        comment_type: calloutType, comment: text.trim(), created_by: userName,
      }))
      const { data: inserted, error } = await supabase.from('po_comments').insert(rows).select('id')
      if (error) throw error

      // Every selected SKU's new callout row gets every successfully-uploaded
      // photo - mirrors how the text already syncs to all of them in one
      // action, not just the first row.
      if (uploadedPaths.length && inserted?.length) {
        const photoRows = inserted.flatMap(({ id }) => uploadedPaths.map(storage_path => ({ comment_id: id, storage_path })))
        const { error: photoErr } = await supabase.from('po_comment_photos').insert(photoRows)
        if (photoErr) uploadFailures.push(photoErr.message)
      }

      setPosting(false)
      setPostError(uploadFailures.length ? uploadFailures.join('; ') : null)
      setText('')
      pendingPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl))
      setPendingPhotos([])
      fetchCallouts()
      onSubmitted?.()
    } catch (err) {
      // PLAN OFFLINE (disabled): no local queue - the post genuinely failed,
      // so say so and keep the form filled for a retry.
      if (!PLAN_OFFLINE_ENABLED) {
        setPosting(false)
        setPostError(err?.message ? `Could not post the callout: ${err.message}` : 'Could not post the callout. Check your connection and try again.')
        return
      }
      // navigator.onLine said we had a connection but the actual request
      // still failed (flaky signal, DNS blip, etc.) - queue it the same
      // way the upfront offline check above does, rather than surfacing a
      // scary error for something that'll just sync automatically anyway.
      await queueOffline()
      setPosting(false)
      setText('')
      pendingPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl))
      setPendingPhotos([])
      onSubmitted?.()
    }
  }

  // Portaled to document.body - this modal is opened both from
  // InspectionReportEntry.jsx's PO-overview toolbar and from inside the
  // Inspection wizard's own slide-in panel (RepositoryPoDrawer.jsx's
  // view-only usage sits in a similar animated panel). That panel animates
  // via a CSS transform, which creates a new containing block for any
  // `position: fixed` descendant - without a portal, this modal gets
  // clipped to the wizard panel's own box instead of the real viewport,
  // squeezing its footer (Post/Upload/Take Photo) out of view entirely.
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Fixed height on desktop (sm:h-[88vh], not max-height) - stays this
          large regardless of how little content is in it yet, matching the
          big-workspace look rather than shrinking down to a small card
          around a short "No callouts yet" message. Mobile gets a genuine
          cap instead (max-h-[85vh], bottom-sheet convention) - a fixed 88vh
          on a short phone, or with the keyboard open while typing a
          callout, was a real overflow risk with nothing to scroll it back
          into view. */}
      <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] sm:h-[88vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-900 truncate">{calloutLabel}</div>
            <div className="text-xs text-gray-500 mt-0.5 truncate">
              PO {po.po_number} · {selectedItems.length} SKU{selectedItems.length !== 1 ? 's' : ''} selected
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Callout list */}
        <div className="overflow-y-auto px-5 py-4 flex-1">
          {loading && (
            <div className="flex items-center gap-2 py-2">
              <Spinner size="w-3.5 h-3.5" />
              <span className="text-xs text-gray-400">Loading…</span>
            </div>
          )}

          {!loading && callouts.length === 0 && relevantPending.length === 0 && (
            <p className="text-xs text-gray-400">
              No {calloutLabel.toLowerCase()}s yet {lineItemIds.length ? 'for the selected SKUs' : 'on this PO'}.
            </p>
          )}

          {/* Queued offline (see src/lib/offlineDrafts.js's pendingCallouts
              store) - shown ahead of the real, already-synced list so a QA
              who just posted several offline can see they all landed,
              instead of the queue looking like it silently swallowed them
              until the next reconnect. */}
          {relevantPending.length > 0 && (
            <div className="space-y-2.5 mb-2.5">
              {relevantPending.map(c => (
                <div key={c.calloutId} className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="w-7 h-7 rounded-full bg-amber-400 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {c.createdBy?.charAt(0)?.toUpperCase() ?? 'Q'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-800">{c.createdBy}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                        Queued - not yet synced
                      </span>
                    </div>
                    {c.text && <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap leading-relaxed">{c.text}</p>}
                    {c.photoBlobs?.length > 0 && (
                      <p className="text-[11px] text-gray-500 mt-1">{c.photoBlobs.length} photo{c.photoBlobs.length !== 1 ? 's' : ''} attached</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && callouts.length > 0 && (
            <div className="space-y-2.5">
              {groupedCallouts.map(g => (
                <div key={g.key} className="flex items-start gap-2.5 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl">
                  <div className="w-7 h-7 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {g.created_by?.charAt(0)?.toUpperCase() ?? 'Q'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-800">{g.created_by}</span>
                      {/* One post to several SKUs at once shows every one of its SKU tags here,
                          not a separate repeated row per SKU - see groupedCallouts above. */}
                      {g.skuRefs.map((ref, i) => (
                        <span key={`${g.key}-${ref}-${i}`} className="text-[10px] font-semibold text-gray-500 bg-gray-200 rounded px-1.5 py-0.5">
                          {ref}
                        </span>
                      ))}
                      <span className="text-[10px] text-gray-400">
                        {new Date(g.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        {' · '}
                        {new Date(g.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {editingKey === g.key ? (
                      <div className="mt-1.5 space-y-2">
                        <textarea
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          rows={3}
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 resize-none bg-white"
                        />
                        {(g.po_comment_photos?.length > 0 || editNewPhotos.length > 0) && (
                          <div className="flex flex-wrap gap-1.5">
                            {g.po_comment_photos?.map(p => {
                              const kept = editKeepPhotoIds.has(p.id)
                              return (
                                <div key={p.id} className={`relative w-12 h-12 rounded-md overflow-hidden border flex-shrink-0 ${kept ? 'border-gray-200' : 'border-red-300 opacity-40'}`}>
                                  <img src={getInspectionFileUrl(p.storage_path)} alt="" className="w-full h-full object-cover" />
                                  <button type="button" onClick={() => toggleKeepPhoto(p.id)}
                                    title={kept ? 'Remove this photo' : 'Keep this photo'}
                                    className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center rounded-bl bg-black/60 text-white">
                                    {kept ? (
                                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                    ) : (
                                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M3 12l6 6 12-12" /></svg>
                                    )}
                                  </button>
                                </div>
                              )
                            })}
                            {editNewPhotos.map(p => (
                              <div key={p.previewUrl} className="relative w-12 h-12 rounded-md overflow-hidden border border-gray-200 flex-shrink-0">
                                <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
                                <button type="button" onClick={() => removeEditNewPhoto(p.previewUrl)}
                                  className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center rounded-bl bg-black/60 text-white">
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-dashed border-gray-300 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors text-[11px] text-gray-500">
                          <input type="file" accept="image/*" multiple className="hidden" onChange={e => { addEditFiles(Array.from(e.target.files || [])); e.target.value = '' }} />
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                          Add photo
                        </label>
                        {editError && <p className="text-xs text-red-500">{editError}</p>}
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => saveEdit(g)} disabled={editSaving}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40 transition-colors">
                            {editSaving && <Spinner size="w-3 h-3" />}
                            {editSaving ? 'Saving…' : 'Save'}
                          </button>
                          <button type="button" onClick={cancelEdit} disabled={editSaving}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {g.comment && <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap leading-relaxed">{g.comment}</p>}
                        {g.po_comment_photos?.length > 0 && (
                          <div className="mt-1.5">
                            <PhotoStrip
                              images={g.po_comment_photos.map(p => ({ key: p.id, src: getInspectionFileUrl(p.storage_path) }))}
                              onOpen={i => setLightbox({ images: g.po_comment_photos.map(p => getInspectionFileUrl(p.storage_path)), startIndex: i })}
                              onOpenAll={() => setGallery(g.po_comment_photos.map(p => ({ key: p.id, src: getInspectionFileUrl(p.storage_path) })))}
                            />
                          </div>
                        )}
                        {confirmDeleteKey === g.key && (
                          <div className="mt-1.5 flex items-center gap-2 px-2.5 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                            <span className="text-[11px] text-red-700 font-medium">Delete this entry?</span>
                            <button type="button" onClick={() => deleteGroup(g)} disabled={deletingKey === g.key}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-600 text-[10px] font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                              {deletingKey === g.key && <Spinner size="w-3 h-3" />}
                              {deletingKey === g.key ? 'Deleting…' : 'Delete'}
                            </button>
                            <button type="button" onClick={() => setConfirmDeleteKey(null)} disabled={deletingKey === g.key}
                              className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 transition-colors">
                              Cancel
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {editingKey !== g.key && (
                    <div className="flex-shrink-0 flex items-start gap-1.5">
                      {g.po_comment_photos?.length > 0 && (
                        <button
                          type="button"
                          title="Download this callout's photos"
                          disabled={downloadingKey === g.key}
                          onClick={async () => {
                            setDownloadingKey(g.key)
                            try {
                              await downloadImages(
                                g.po_comment_photos.map(p => ({ key: p.id, src: getInspectionFileUrl(p.storage_path) })),
                                `${calloutType}-${po.po_number || po.id}-${g.skuRefs.join('-')}`
                              )
                            } finally {
                              setDownloadingKey(null)
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 bg-white text-[10px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {downloadingKey === g.key ? <Spinner size="w-3 h-3" /> : (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                          )}
                          {downloadingKey === g.key ? 'Zipping…' : 'Download Images'}
                        </button>
                      )}
                      {/* Notifies about one row's own recipients/content (the backend route is
                          per-callout); sends for the first SKU in the group - expanding it to
                          notify for every SKU in a multi-SKU group is a separate follow-up. */}
                      <button type="button" onClick={() => sendCalloutMail(g.ids[0])} title="Send Mail"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 bg-white text-[10px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22 6 12 13 2 6" />
                        </svg>
                        Send Mail
                      </button>
                      {canComment && (
                        <>
                          <button type="button" onClick={() => startEdit(g)} title="Edit"
                            className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-gray-200 bg-white text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors cursor-pointer">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteKey(g.key)} title="Delete"
                            className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-gray-200 bg-white text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SKUs drawer - which SKUs this callout is for, always here and always changeable, no
            matter what the caller opened the modal with (ticked SKUs, or none at all). The bar
            sits right above the compose form; opening it slides a checklist panel UP in its place,
            taking space from the callout list above (which keeps its own scroll) rather than
            growing the modal past the screen. */}
        <div className="flex-shrink-0 border-t border-gray-100 px-5 py-2">
          <button
            type="button"
            onClick={() => setSkusOpen(v => !v)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              SKUs
              <span className="text-gray-400 font-normal">· {selectedItems.length} selected</span>
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              className={`text-gray-400 transition-transform ${skusOpen ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {skusOpen && (
            <div className="pt-2.5 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="relative flex-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={skuSearch}
                    onChange={e => setSkuSearch(e.target.value)}
                    placeholder="Search SKU…"
                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 bg-gray-50 focus:bg-white transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={selectAllSkus}
                  className="flex-shrink-0 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
                >
                  {allSkusChecked ? 'Clear all' : 'Select all'}
                </button>
              </div>
              {/* Horizontal toggle pills, not a vertical checklist - a tap/click toggles the SKU
                  directly, several at once, without a separate checkbox target. */}
              <div className="max-h-40 overflow-y-auto flex flex-wrap gap-1.5 content-start">
                {allSkus.length === 0 && (
                  <p className="w-full text-xs text-gray-400 text-center py-4">No SKUs on this PO.</p>
                )}
                {allSkus.length > 0 && visibleSkus.length === 0 && (
                  <p className="w-full text-xs text-gray-400 text-center py-4">No SKU matches “{skuSearch}”.</p>
                )}
                {visibleSkus.map(it => {
                  const checked = selectedIds.has(it.po_line_item_id)
                  return (
                    <button
                      key={it.po_line_item_id}
                      type="button"
                      onClick={() => toggleSku(it.po_line_item_id)}
                      aria-pressed={checked}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap
                        ${checked ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'}`}
                    >
                      {it.sku_ref || '-'}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Form */}
        <div className="flex-shrink-0 px-5 pt-2 pb-4 border-t border-gray-100">
          {canComment ? (
            <div className="space-y-2">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
                }}
                placeholder={`Add a ${calloutLabel.toLowerCase()} for ${selectedItems.length} selected SKU${selectedItems.length !== 1 ? 's' : ''}…`}
                rows={3}
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 resize-none"
              />

              {pendingPhotos.length > 0 && (
                <PhotoStrip
                  images={pendingPhotos.map(p => ({ key: p.previewUrl, src: p.previewUrl }))}
                  onOpen={i => setLightbox({ images: pendingPhotos.map(p => p.previewUrl), startIndex: i })}
                  onOpenAll={() => setGallery(pendingPhotos.map(p => ({ key: p.previewUrl, src: p.previewUrl })))}
                  onRemove={removePendingPhoto}
                />
              )}

              <div className="flex gap-2">
                <label className="flex-1 flex items-center justify-center gap-1.5 border-2 border-dashed border-gray-300 rounded-lg py-2 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors text-[11px] text-gray-500">
                  <input type="file" accept="image/*" multiple className="hidden" onChange={e => { addPendingFiles(Array.from(e.target.files || [])); e.target.value = '' }} />
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                  Upload
                </label>
                <button type="button" onClick={() => setShowCamera(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 border-2 border-dashed border-gray-300 rounded-lg py-2 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors text-[11px] text-gray-500">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                  Take Photo
                </button>
              </div>

              {postError && <p className="text-xs text-red-500">{postError}</p>}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-400 truncate">
                  As <span className="font-semibold text-gray-600">{userName}</span>
                </span>
                <button
                  type="button"
                  onClick={submit}
                  disabled={(!text.trim() && !pendingPhotos.length) || posting || !selectedItems.length}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  {posting && <Spinner size="w-3 h-3" />}
                  {posting ? 'Posting…' : 'Post'}
                </button>
              </div>
              {showCamera && (
                <CameraCaptureModal
                  onClose={() => setShowCamera(false)}
                  onCapture={file => { setShowCamera(false); addPendingFiles([file]) }}
                />
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">
              {viewOnlyMessage || 'View only — only QA and Tech members can post.'}
            </p>
          )}
        </div>

      </div>
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          startIndex={lightbox.startIndex}
          onClose={() => setLightbox(null)}
        />
      )}
      {gallery && (
        <PhotoGalleryModal
          images={gallery}
          title={calloutLabel}
          zipBaseName={zipBaseName}
          onClose={() => setGallery(null)}
        />
      )}
    </div>,
    document.body
  )
}
