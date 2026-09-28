// Rich-text ("Notes") comment bodies are HTML. Anywhere one is shown as a plain-text
// one-liner (activity log, floating dock, reply/quote preview) it must have BOTH its tags
// stripped AND its entities decoded — a regex-only strip leaves "&nbsp;"/"&amp;" showing raw.
// Parsed with DOMParser (an inert document) rather than a detached div's innerHTML, so an
// <img> in the note never triggers a speculative network fetch just to build a text preview.
// An image-only note yields '' here — callers fall back to a "Photo" / thumbnail preview.
export function htmlToPlainText(html) {
  if (!html) return ''
  // Break at block-level boundaries first, else text either side of a </li>, </p>, <br> etc.
  // collapses together ("Make it plain" + "GOOD" -> "Make it plainGOOD").
  const spaced = html.replace(/<br\s*\/?>|<\/(p|div|li|ul|ol|h[1-6]|tr|blockquote|pre)\s*>/gi, ' $& ')
  let text
  if (typeof DOMParser !== 'undefined') {
    text = new DOMParser().parseFromString(spaced, 'text/html').body.textContent || ''
  } else {
    text = spaced.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
  }
  return text.replace(/\s+/g, ' ').trim()
}

// Normalises attachments stored in any of three formats:
//   1. Plain URL string (old backend)
//   2. Stringified JSON string e.g. '{"url":"...","name":"...","type":"..."}' (text[] column)
//   3. Proper { url, name, type } object (jsonb column, new backend)
export function normalizeAttachment(a) {
  if (typeof a === 'string') {
    // Try parsing as JSON first (text[] column serialises objects as strings)
    try {
      const p = JSON.parse(a)
      if (p?.url) return { url: p.url, name: p.name || p.url.split('/').pop()?.split('?')[0] || 'file', type: p.type || '' }
    } catch {
      // not JSON — fall through to plain URL string handling below
    }
    // Plain URL string fallback
    const name = a.split('/').pop()?.split('?')[0] || 'file'
    const isImg = /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(name)
    return { url: a, name, type: isImg ? 'image/unknown' : 'application/octet-stream' }
  }
  return { url: a.url || '', name: a.name || a.url?.split('/').pop()?.split('?')[0] || 'file', type: a.type || '' }
}

export function isImageAttachment(att) {
  return att.type.startsWith('image') || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(att.name)
}

// `removed`/`removedAt` (soft-delete flags for an edited-out attachment) live on the same
// raw entry normalizeAttachment strips away — a plain URL string never carries them, and a
// JSON-stringified entry needs parsing first. These two let call sites check/read them without
// caring which of the three raw shapes above they're looking at.
function parseAttachmentRaw(a) {
  if (typeof a !== 'string') return a || {}
  try { return JSON.parse(a) || {} } catch { return {} }
}
export function isAttachmentRemoved(a) {
  return !!parseAttachmentRaw(a).removed
}
export function getAttachmentUrl(a) {
  return typeof a === 'string' ? (parseAttachmentRaw(a).url || a) : (a?.url || '')
}

// Composer "pending file" chips (WorkspaceModal.jsx) show a filename
// pill before a file has actually been sent — an attached image should preview as a thumbnail
// there instead of just its filename. Stashes the object URL directly on the File instance
// (files are only ever read, never cloned, before upload) so it's created once per file rather
// than on every render. Call revokeFilePreview once the file leaves pendingFiles (removed or
// sent) — the in-thread bubble creates its own separate preview URL, so this one is done by then.
export function withFilePreview(file) {
  if (file.type?.startsWith('image/') && !file._previewUrl) {
    try { file._previewUrl = URL.createObjectURL(file) } catch { /* unsupported — falls back to filename text */ }
  }
  // Voice messages get their own object URL so the composer can offer playback before
  // send — kept separate from _previewUrl since that one drives the image-thumbnail branch.
  if (file.type?.startsWith('audio/') && !file._audioPreviewUrl) {
    try { file._audioPreviewUrl = URL.createObjectURL(file) } catch { /* unsupported — falls back to filename text */ }
  }
  return file
}

export function revokeFilePreview(file) {
  if (file?._previewUrl) URL.revokeObjectURL(file._previewUrl)
  if (file?._audioPreviewUrl) URL.revokeObjectURL(file._audioPreviewUrl)
}

// A comment with only attachments (no text) has an empty body. Derives a readable stand-in —
// a generic label (never the raw filename, which is whatever the uploader's device happened
// to call it and carries no meaning to anyone else), plus a thumbnail URL — for anywhere a
// comment is shown as a one-line summary (Activity Log, reply/quote preview). The thumbnail
// is always the first IMAGE attachment's URL when one exists, even with several attachments —
// a quote/reply preview with no visual at all (just "N attachments") forces scrolling up to
// the original message just to see what's being referred to, which defeats the point of a preview.
//
// thumbUrls (plural) additionally carries up to 4 image URLs for callers that can show a small
// strip instead of one thumbnail — currently only the composer's live reply banner does this
// (WorkspaceModal.jsx), since that's the one place with direct access to the full attachment
// list; once a reply is actually sent, only a single quoted_thumb gets persisted, so the
// in-thread quote box still shows just one image (thumbUrl) — a deliberate, smaller-scope choice.
export function attachmentPreview(cm) {
  // A rich-text ("Notes") body is HTML, not plain text — returning it verbatim showed the raw
  // markup (e.g. "<ul><li><img src=...") in the reply/quote banner instead of a readable
  // preview. Strip tags for the text stand-in and pull the first inline <img> as the thumbnail,
  // same as the plain-attachment case below does for a real file attachment.
  if (cm?.metadata?.format === 'html' && cm?.body) {
    const imgUrls = [...cm.body.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1])
    const plain = htmlToPlainText(cm.body)
    // A note sent with only a regular file attachment (paperclip, not an inline image) and no
    // typed text can still leave the contentEditable's HTML non-empty (a stray "<br>" etc.) —
    // falling through to the attachment-based preview below instead of returning a blank one.
    if (plain || imgUrls.length) return { text: plain || 'Photo', thumbUrl: imgUrls[0] || null, thumbUrls: imgUrls.slice(0, 4) }
  } else if (cm?.body?.trim()) {
    return { text: cm.body, thumbUrl: null, thumbUrls: [] }
  }
  const atts = cm?.attachments || []
  if (!atts.length) return { text: '', thumbUrl: null, thumbUrls: [] }
  const normalized = atts.map(normalizeAttachment)
  const images = normalized.filter(isImageAttachment)
  if (atts.length === 1) {
    const isImg = isImageAttachment(normalized[0])
    const isAudio = !isImg && (normalized[0].type?.startsWith('audio') || /\.(webm|m4a|ogg|mp3|wav)$/i.test(normalized[0].name || ''))
    const url = isImg ? normalized[0].url : null
    const text = isImg ? 'Photo' : isAudio ? '🎤 Voice message' : `📎 ${normalized[0].name || 'File'}`
    return { text, thumbUrl: url, thumbUrls: url ? [url] : [] }
  }
  return { text: `📎 ${atts.length} attachments`, thumbUrl: images[0]?.url || null, thumbUrls: images.slice(0, 4).map(i => i.url) }
}
