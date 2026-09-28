// Shared config for the rich-text "Notes" editor — used by RichNoteEditor and by anything
// that renders a saved note. Kept in one place so the send-time sanitizer, the render-time
// sanitizer, and the backend's sanitizeRichComment (routes/plm.js) can't drift apart.

export const RICH_HTML_SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'br', 'span', 'p', 'div', 'img'],
  ALLOWED_ATTR: ['style', 'src'],
  // Any *.supabase.co project host + our public npd bucket path. Structural match, not an
  // env-var read (which historically resolved wrong and silently stripped every image).
  ALLOWED_URI_REGEXP: /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/npd\//,
}

// Widely-installed cross-platform fonts — anything not on the reader's device silently falls
// back to their system default.
export const RICH_FONT_OPTIONS = [
  'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Calibri', 'Segoe UI',
  'Times New Roman', 'Georgia', 'Garamond', 'Cambria', 'Palatino Linotype',
  'Courier New', 'Comic Sans MS', 'Impact',
]

export const RICH_SIZE_OPTIONS = [
  '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px',
  '36px', '40px', '44px', '48px', '54px', '60px', '66px', '72px',
]

// Pull every <img src> out of a note's HTML — used to mirror inline note images into a
// SKU's spec_images so they surface in the Media panel.
export function extractImageUrls(html) {
  if (!html) return []
  const out = []
  const re = /<img[^>]+src=["']([^"']+)["']/gi
  let m
  while ((m = re.exec(html))) out.push(m[1])
  return out
}

// True when a note's HTML has real content (text or an image), not just an empty <br>.
export function noteHasContent(html) {
  if (!html) return false
  const stripped = html.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/gi, '').replace(/<[^>]+>/g, '').trim()
  return stripped.length > 0 || /<img/i.test(html)
}

// Plain-text preview of a note's HTML — strips tags AND decodes entities (&nbsp;, &amp;, …)
// so collapsed previews never render a raw "&nbsp;". Single implementation lives in
// utils/plmAttachments (shared with the activity log / dock / reply previews).
export { htmlToPlainText as notePlainText } from '../../utils/plmAttachments'
