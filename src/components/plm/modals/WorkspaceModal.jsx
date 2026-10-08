import React, { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react'
import SamplePOModal from './SamplePOModal'
import ImageEditorModal from './ImageEditorModal'
import CameraCaptureModal from './CameraCaptureModal'
import CaptureReviewModal from './CaptureReviewModal'
import { useSearchParams } from 'react-router-dom'
import { usePlmStore, STATUS_LABELS, STATUS_COLORS } from '../../../stores/plmStore'
import { useRole, useMemberId, useProfileHeader, useOrgDepartment, useOrgId } from '../../../stores/profileStore'
import { usePlmMasterKeyActive } from '../../../stores/plmMasterKeyStore'
import { useBuyerOrgs, useSupplierOrgs } from '../../../stores/orgsStore'
import { supabase } from '../../../lib/supabase'
import VideoCallButton from '../VideoCallButton'
import IncomingCallBanner from '../IncomingCallBanner'
import { fetchLiveRates, convertToUSD, FALLBACK_RATES } from '../../../utils/formatters'
import CourierSearchSelect from '../../logistics/CourierSearchSelect'
import { INTERNATIONAL_COURIERS } from '../../logistics/courierLogUtils'
import { normalizeAttachment, attachmentPreview, withFilePreview, revokeFilePreview, isAttachmentRemoved } from '../../../utils/plmAttachments'
import useVoiceRecorder from '../../../hooks/useVoiceRecorder'
import { BriefRow, IconMaterial, IconFinish, IconDimension, IconPrice, IconQty, IconNotes, IconShip, IconCalendar } from '../BriefFields'
import RichNoteEditor from '../RichNoteEditor'
import { deriveMasterCartons } from '../../../utils/plmSampleFindings'
import DOMPurify from 'dompurify'
import { monthBucketsOf, MonthGroup, computeWorkspaceScale } from '../plmMediaGroups'

// Shared between the rich-text ("Notes") composer's send-time sanitization and the comment
// renderer's render-time sanitization — both need to agree on exactly the same allowlist as
// the backend's sanitizeRichComment (routes/plm.js), or formatting a sender applied could get
// silently stripped for every viewer. img is restricted to this project's own storage origin
// (matching the backend's isOwnStorageUrl) — this is defense-in-depth, not the trust boundary;
// the backend re-sanitizes on receipt regardless of what the client already stripped.
// ALLOWED_URI_REGEXP (a per-call config option, not a global DOMPurify.addHook — hooks would
// leak into every other DOMPurify.sanitize() call anywhere in the app, including unrelated
// ones, since it's one shared module instance) restricts every URI-bearing attribute — src
// included — to this project's own Supabase storage. Matched structurally (any *.supabase.co
// project host + our bucket path) rather than against import.meta.env.VITE_SUPABASE_URL
// directly — an env-var read that resolves unexpectedly (trailing slash, timing, build
// config) previously fell back to a regex matching NOTHING, which silently stripped every
// inline image at send time with zero error shown, even though the image had genuinely
// uploaded fine. This is defense-in-depth, not the trust boundary; the backend's
// isOwnStorageUrl (which DOES check the real configured origin) re-sanitizes on receipt
// regardless of what the client already allowed through.
const RICH_HTML_SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'br', 'span', 'p', 'div', 'img'],
  ALLOWED_ATTR: ['style', 'src'],
  ALLOWED_URI_REGEXP: /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/npd\//,
}

// Widely-installed cross-platform (Windows/Mac/Linux) fonts for the Notes composer's font
// picker — anything not actually installed on the reader's device just silently falls back
// to their system default, so this sticks to genuinely common ones rather than anything
// exotic that would look inconsistent for others.
const RICH_FONT_OPTIONS = [
  'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Calibri', 'Segoe UI',
  'Times New Roman', 'Georgia', 'Garamond', 'Cambria', 'Palatino Linotype',
  'Courier New', 'Comic Sans MS', 'Impact',
]
const RICH_SIZE_OPTIONS = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '40px', '44px', '48px', '54px', '60px', '66px', '72px']

// Media (right) panel width — resizable by dragging its left edge, clamped to this range,
// last value remembered in localStorage. Default bumped up from the old fixed 240px.
const MEDIA_W_MIN = 240
const MEDIA_W_MAX = 520
const MEDIA_W_DEFAULT = 320

// Sample shipments are always sent via international courier, never sea/road freight — so the
// "ship mode" field is really "which courier company", reusing the same option list and search
// component as the International Courier Log for consistency. Each entry's URL builder plugs
// the tracking number into that courier's public tracking page so Tracking Ref can be a real link.
const COURIER_TRACK_URL = {
  'DHL':                (t) => `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(t)}&brand=DHL`,
  'UPS':                (t) => `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(t)}`,
  'FedEx International': (t) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`,
}

// npd2_sample_orders has a pre-existing CHECK constraint on ship_mode (npd2_sample_orders_ship_mode_check)
// from an earlier system, only allowing 'courier' | 'air' | 'container' — so the Air/Ship toggle's
// UI labels map to those lowercase DB values rather than storing "Air"/"Ship" directly.
const SHIP_MODE_DB = { Air: 'air', Ship: 'container' }

// Must match the backend's upload.array('files', N) cap in routes/plm.js
const MAX_ATTACHMENTS = 10

// Matches the currency options in the buyer brief's Target Price field (USD/GBP/EUR)
const CURRENCY_SYMBOLS = { USD: '$', GBP: '£', EUR: '€' }

// Label + brand color for a non-image file tile, based on its extension — matches each
// format's familiar real-world color (Adobe red for PDF, PowerPoint orange, Excel green, Word blue).
function fileKindMeta(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf') return { label: 'PDF', hex: '#DB4437' }
  if (['ppt', 'pptx'].includes(ext)) return { label: 'PPT', hex: '#D24726' }
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { label: 'XLS', hex: '#1D6F42' }
  if (['doc', 'docx'].includes(ext)) return { label: 'DOC', hex: '#2B579A' }
  return { label: ext ? ext.toUpperCase().slice(0, 4) : 'FILE', hex: '#5f6368' }
}

// A folded-corner document silhouette (the familiar "file" shape), colored per type, with
// the extension printed on a ribbon near the bottom — like Drive/Slack file previews.
function FileTypeIcon({ name }) {
  const { label, hex } = fileKindMeta(name)
  return (
    <svg width="46" height="58" viewBox="0 0 46 58" className="flex-shrink-0">
      <path d="M4 2h24l14 14v38a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill={hex} />
      <path d="M28 2l14 14H30a2 2 0 0 1-2-2V2z" fill="#ffffff" fillOpacity="0.55" />
      <rect x="2" y="38" width="42" height="16" rx="2" fill={hex} />
      <text x="23" y="49.5" textAnchor="middle" fontSize="10" fontWeight="800" fill="#ffffff" fontFamily="system-ui, sans-serif">{label}</text>
    </svg>
  )
}

// Shared by Comment's activity timestamps and the Media panel's per-image "uploaded at"
// tooltips — "HH:MM" for today, "D Mon HH:MM" otherwise.
function formatActivityDate(iso) {
  if (!iso) return ''
  const d     = new Date(iso)
  const today = new Date()
  const time  = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()
  if (isToday) return time
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${time}`
}

// Finds the milestone comment that pinned, edited, uploaded, or archived-as-rejected a
// given reference-media/sample image, by matching its URL against that comment's metadata
// (to/from/urls/rejectedUrls — see the various insertSystemComment2 call sites in
// routes/plm.js). Callers pull both the timestamp AND the actor (author_name/role) off of
// it, same as the Activity feed does. Only finds images touched by an action logged after
// that logging was added — older images have no comment to match against, so this can
// return null and both fields fall back to blank.
function findMediaMilestone(url, comments) {
  if (!url || !comments?.length) return null
  for (const cm of comments) {
    if (cm.type !== 'milestone') continue
    const meta = cm.metadata || {}
    const candidates = [meta.to, meta.from, ...(meta.urls || []), ...(meta.rejectedUrls || [])]
    if (candidates.includes(url)) return cm
  }
  return null
}

// Most-recent milestone that set `url` into ONE specific pin slot, identified by its own
// event name (product_image_set / buyer_brief_image_set / production_image_set — see the
// insertSystemComment2 call sites in routes/plm.js). Matches `metadata.to` exactly (the
// URL that was newly pinned) so a slot never picks up another slot's milestone just because
// they happen to hold the same image. Returns null when there's no such action logged.
function findPinMilestone(url, comments, events) {
  if (!url || !comments?.length) return null
  let best = null
  for (const cm of comments) {
    if (cm.type !== 'milestone') continue
    const meta = cm.metadata || {}
    if (!events.includes(meta.event) || meta.to !== url) continue
    if (!best || cm.created_at > best.created_at) best = cm
  }
  return best
}

// Shares one or more media URLs via the OS share sheet — used by both the lightbox's own
// Share button (a single image) and the Media panel's multi-select Share action (any mix of
// images/files a person has checked off). Tries to hand over the actual file(s) first so the
// receiving app (WhatsApp, Slack, email...) gets real attachments, not just links; falls back
// to sharing the URL(s) as text if the fetch fails (CORS) or the browser's share sheet won't
// take files, and finally to a clipboard copy on browsers with no Web Share API at all (most
// desktop browsers).
async function shareImages(urls, toast) {
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean)
  if (!list.length) return
  try {
    if (navigator.share) {
      try {
        const files = await Promise.all(list.map(async (url) => {
          const res = await fetch(url)
          const blob = await res.blob()
          const filename = url.split('/').pop()?.split('?')[0] || 'file'
          return new File([blob], filename, { type: blob.type || 'application/octet-stream' })
        }))
        if (navigator.canShare?.({ files })) {
          await navigator.share({ files })
          return
        }
      } catch { /* CORS/network failure fetching one of the files — share the link(s) instead */ }
      if (list.length === 1) await navigator.share({ url: list[0] })
      else await navigator.share({ text: list.join('\n') })
      return
    }
  } catch (err) {
    if (err?.name === 'AbortError') return // user dismissed the share sheet
  }
  navigator.clipboard?.writeText(list.join('\n'))
    .then(() => toast(list.length > 1 ? `${list.length} links copied to clipboard` : 'Link copied to clipboard'))
    .catch(() => toast('Could not share this'))
}

// Draggable column divider between the SKU Details / chat / Media panes. The two-line seam is
// the two facing panel borders; this adds an always-on ⟷ grip chip centred exactly on the
// seam. Rendered as a child of the grid wrapper (not the panels — those are `overflow-hidden`
// and would clip it) and positioned with an explicit x via `style`, then `-translate-x-1/2`
// to sit dead-centre on the gap.
function ResizeGrip({ style, onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      title="Drag to resize"
      style={style}
      className="absolute top-0 h-full w-5 -translate-x-1/2 cursor-col-resize flex items-center justify-center z-30 select-none group"
    >
      <div className="flex items-center justify-center w-4 h-9 rounded-full bg-white border border-black/30 shadow-sm text-black/50 group-hover:border-[#2563eb] group-hover:text-[#2563eb] transition-colors pointer-events-none">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 7 4 12 9 17" /><polyline points="15 7 20 12 15 17" />
        </svg>
      </div>
    </div>
  )
}

function Comment({ cm, onReply, onEditNote, openLightbox, scrollToMediaItem, handleMediaClickDebounced, isFirstUnread }) {
  const retryComment        = usePlmStore(s => s.retryComment)
  const removeFailedComment = usePlmStore(s => s.removeFailedComment)
  const editComment         = usePlmStore(s => s.editComment)
  const workspaceId         = usePlmStore(s => s.activeWorkspace?.id)
  const toast                = usePlmStore(s => s.toast)
  const myMemberId          = useMemberId()
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const isMilestone   = cm.type === 'milestone'
  const isFieldChange = cm.type === 'field_change'
  const role          = cm.role || 'buyer'
  // Guests aren't organization_members, so they never have an author_name — their given name
  // is denormalized onto metadata.guest_name instead (see routes/plm.js's group-guest routes).
  // Falling back to the bare role here is what showed a literal "guest" badge in the thread.
  const name          = cm.metadata?.guest_name || cm.author_name || role
  const date = (() => {
    return formatActivityDate(cm.created_at)
  })()
  const editedDate = cm.metadata?.edited_at ? formatActivityDate(cm.metadata.edited_at) : null

  // Edit affordance: only the author, only a real (plain-text) chat message that's actually
  // persisted. Rich-text ("Notes") messages are left out of v1 — they'd need the rich composer.
  const priorVersions = Array.isArray(cm.metadata?.edits) ? cm.metadata.edits : []
  const isRichNote  = cm.metadata?.format === 'html'
  const canEditThis = !isMilestone && !isFieldChange && cm.type === 'comment'
    && cm.author_member_id && cm.author_member_id === myMemberId
    && !cm._failed && !cm._uploading && !String(cm.id || '').startsWith('temp-')

  // Attachments queued for removal in this edit session — not sent until Save, so Cancel
  // (or Escape) can discard them with no server round-trip.
  const [pendingRemove, setPendingRemove] = useState(() => new Set())
  const toggleRemoveAttachment = (url) => setPendingRemove(prev => {
    const next = new Set(prev)
    next.has(url) ? next.delete(url) : next.add(url)
    return next
  })

  const onEditClick = () => { if (isRichNote) onEditNote?.(cm); else { setDraft(cm.body || ''); setPendingRemove(new Set()); setEditing(true) } }
  const cancelEdit = () => { setEditing(false); setPendingRemove(new Set()) }
  const saveEdit = async () => {
    // No `!text` bail — an attachment-only message (no caption) legitimately has an empty
    // draft, and a pure attachment-removal edit on it must still be allowed to save.
    const text = draft.trim()
    const bodyChanged = text !== (cm.body || '').trim()
    if (!bodyChanged && pendingRemove.size === 0) { cancelEdit(); return }
    const remainingAttachments = (cm.attachments || []).filter(a => a?.url && !a.removed && !pendingRemove.has(a.url))
    if (!text && remainingAttachments.length === 0) {
      toast?.('Message needs text or an attachment')
      return
    }
    setSavingEdit(true)
    try {
      await editComment(workspaceId, cm.id, text, [...pendingRemove])
      setEditing(false)
      setPendingRemove(new Set())
    } catch { /* editComment already toasts + reverts */ }
    finally { setSavingEdit(false) }
  }

  if (isMilestone) {
    const event = cm.metadata?.event

    if (event === 'video_call_started') return (
      <div className="flex items-center justify-center gap-2 py-2.5">
        <div className="flex-1 h-px bg-black/[.12]" />
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/[.06]">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1A1A18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7"/>
            <rect x="1" y="5" width="15" height="14" rx="2"/>
          </svg>
          <span className="text-[9px] font-bold uppercase tracking-[.06em] text-black">
            Video call started
            {cm.metadata?.started_by && (
              <span className="font-semibold normal-case tracking-normal text-[#1A1A18]"> by {cm.metadata.started_by}</span>
            )}
            {date && <span className="font-normal normal-case tracking-normal text-black"> · {date}</span>}
          </span>
        </div>
        <div className="flex-1 h-px bg-black/[.12]" />
      </div>
    )

    if (event === 'video_call_ended') return (
      <div className="flex items-center justify-center gap-2 py-2.5">
        <div className="flex-1 h-px bg-black/[.12]" />
        <span className="text-[9px] font-bold uppercase tracking-[.06em] px-2 py-0.5 rounded-full bg-black/[.06] text-black">
          Video call ended
          {date && <span className="font-normal normal-case tracking-normal text-black"> · {date}</span>}
        </span>
        <div className="flex-1 h-px bg-black/[.12]" />
      </div>
    )

    if (event === 'video_call_declined') return (
      <div className="flex items-center justify-center gap-2 py-2.5">
        <div className="flex-1 h-px bg-black/[.08]" />
        <span className="text-[9px] font-bold uppercase tracking-[.06em] px-3 py-1 rounded-full bg-black/[.04] text-black">
          Video call declined
        </span>
        <div className="flex-1 h-px bg-black/[.08]" />
      </div>
    )

    if (event === 'video_call_cancelled') return (
      <div className="flex items-center justify-center gap-2 py-2.5">
        <div className="flex-1 h-px bg-black/[.08]" />
        <span className="text-[9px] font-bold uppercase tracking-[.06em] px-3 py-1 rounded-full bg-black/[.04] text-black">
          Video call cancelled
        </span>
        <div className="flex-1 h-px bg-black/[.08]" />
      </div>
    )

    if (event === 'video_call_invited') return (
      <div className="flex items-center justify-center gap-2 py-2.5">
        <div className="flex-1 h-px bg-black/[.08]" />
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f5f0ff] border border-[#c4b5fd]/60">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <line x1="19" y1="8" x2="19" y2="14"/>
            <line x1="22" y1="11" x2="16" y2="11"/>
          </svg>
          <span className="text-[9px] font-bold uppercase tracking-[.06em] text-[#5b21b6]">
            Invited to join video call
            {cm.metadata?.invited_by && (
              <span className="font-normal"> by {cm.metadata.invited_by}</span>
            )}
            {cm.metadata?.invited_emails?.length > 0 && (
              <span className="font-normal"> · {cm.metadata.invited_emails.join(', ')}</span>
            )}
          </span>
        </div>
        <div className="flex-1 h-px bg-black/[.08]" />
      </div>
    )

    const actor = cm.metadata?.guest_name || cm.author_name || cm.role

    // Group Chat join: distinguish a self-join from being added by someone else.
    if (event === 'group_chat_joined' && cm.metadata?.added_by_name) {
      return (
        <div className="flex items-center justify-center gap-2 py-1">
          <div className="flex-1 h-px bg-black/[.12]" />
          <span className="text-[9px] font-bold uppercase tracking-[.06em] px-2 py-0.5 rounded-full bg-black/[.06] text-black flex items-center gap-1.5">
            <span className="font-semibold normal-case tracking-normal text-[#1A1A18]">{actor}</span>
            added to Group Chat by
            <span className="font-semibold normal-case tracking-normal text-[#1A1A18]">{cm.metadata.added_by_name}</span>
            {date && <span className="font-normal normal-case tracking-normal text-black">{date}</span>}
          </span>
          <div className="flex-1 h-px bg-black/[.12]" />
        </div>
      )
    }

    // Image-pin/edit milestones (buyer_brief_image_*, product_image_set, production_image_*,
    // reference_media_*, sample_images_updated) carry before/after URLs in metadata so the
    // "what it is now / what it was before" can actually be checked, not just who/when.
    const meta = cm.metadata || {}
    // sample_images_updated carries added/removed instead of urls/from/to — added images
    // show at full opacity (like "to"), removed ones faded (like "from").
    const addedRemoved = [
      ...(Array.isArray(meta.added)   ? meta.added.map(url => ({ url }))                : []),
      ...(Array.isArray(meta.removed) ? meta.removed.map(url => ({ url, faded: true })) : []),
    ]
    const totalUrls = Array.isArray(meta.urls) ? meta.urls.length : addedRemoved.length
    const thumbs = totalUrls
      ? (Array.isArray(meta.urls) ? meta.urls.slice(0, 4).map(url => ({ url })) : addedRemoved.slice(0, 4))
      : [meta.from && { url: meta.from, faded: true }, meta.to && { url: meta.to }].filter(Boolean)
    const moreCount = totalUrls > thumbs.length ? totalUrls - thumbs.length : 0

    return (
      <div className="flex flex-col items-center gap-1 py-1">
        <div className="flex items-center gap-2 w-full">
          <div className="flex-1 h-px bg-black/[.12]" />
          <span className="text-[9px] font-bold uppercase tracking-[.06em] px-2 py-0.5 rounded-full bg-black/[.06] text-black flex items-center gap-1.5">
            {cm.body}
            {actor && <span className="font-semibold normal-case tracking-normal text-[#1A1A18]">by {actor}</span>}
            {date && <span className="font-normal normal-case tracking-normal text-black">{date}</span>}
          </span>
          <div className="flex-1 h-px bg-black/[.12]" />
        </div>
        {thumbs.length > 0 && (
          <div className="flex items-center gap-1">
            {thumbs.map((t, i) => (
              <img
                key={i}
                src={t.url}
                alt=""
                title={`${t.faded ? 'Previous image' : 'Current image'} — double-click to find it in Reference Media`}
                onClick={e => {
                  e.stopPropagation()
                  handleMediaClickDebounced?.(() => openLightbox?.(thumbs.map(x => x.url), i))
                }}
                onDoubleClick={e => {
                  e.stopPropagation()
                  const found = scrollToMediaItem?.(t.url)
                  if (!found) {
                    toast?.(t.faded
                      ? 'This was the original image — it was since edited/replaced and is no longer in Reference Media'
                      : 'Image no longer available in Reference Media')
                  }
                }}
                className={`w-7 h-7 object-cover rounded border border-black cursor-zoom-in ${t.faded ? 'opacity-40' : ''}`}
              />
            ))}
            {moreCount > 0 && <span className="text-[8px] font-bold text-black">+{moreCount}</span>}
          </div>
        )}
      </div>
    )
  }

  if (isFieldChange) {
    const actor = cm.metadata?.guest_name || cm.author_name || cm.role
    return (
      <div className="flex items-center gap-1.5 py-0.5">
        <span className="text-black flex-shrink-0 text-[11px]">•</span>
        <span className="text-[10px] text-black flex-1">
          <span className="font-semibold">{actor}</span> {cm.body}
        </span>
        {date && <span className="text-[9px] text-black flex-shrink-0">{date}</span>}
      </div>
    )
  }

  if (cm.type === 'spec_summary') {
    const { extracted = {} } = cm.metadata || {}
    const filename = cm.body || cm.metadata?.filename
    const { additional = [] } = extracted
    const ALLOWED = ['qty of items', 'date created', 'notes']
    const allFields = additional
      .filter(a => ALLOWED.includes((a.label || '').toLowerCase()))
      .map(a => [a.label, a.value])
      .filter(([, v]) => v)

    return (
      <div className="rounded border border-black bg-[#FAFAF8] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-black bg-white">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1A1A18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-40 flex-shrink-0">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
          </svg>
          <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black flex-1 truncate">
            Spec Details{filename ? ` · ${filename}` : ''}
          </span>
          {date && <span className="text-[9px] text-black flex-shrink-0">{date}</span>}
        </div>

        {/* Fields */}
        {allFields.length > 0 ? (
          <div className="px-3 py-2 flex flex-col gap-1">
            {allFields.map(([label, value]) => (
              <div key={label} className="grid gap-2 text-[10px]" style={{ gridTemplateColumns: '90px 1fr' }}>
                <span className="text-[9px] font-semibold uppercase tracking-[.06em] text-black">{label}</span>
                <span className="text-[10px] font-medium text-[#1A1A18] break-words">{value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-3 py-2 text-[9px] text-black font-semibold uppercase tracking-[.05em]">No additional details extracted</p>
        )}
      </div>
    )
  }

  // Directional (border-l-*) so this only tints the left accent edge — a card also has a
  // plain border-black/[.08] on its other 3 sides now (to make each message read as its own
  // box), and a generic `border-COLOR` utility here would set border-color on all 4 sides,
  // silently overriding that gray outline depending on Tailwind's utility generation order.
  const BORDER = { buyer: 'border-l-[#7c3aed]', merchant: 'border-l-[#ea580c]', supplier: 'border-l-[#faad14]' }

  const scrollToOriginal = () => {
    if (!cm.quoted_id) return
    const el = document.getElementById(`comment-${cm.quoted_id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-[#7c3aed]/40')
    setTimeout(() => el.classList.remove('ring-2', 'ring-[#7c3aed]/40'), 1200)
  }

  return (
    <div id={`comment-${cm.id}`} className={`relative rounded-lg px-3 py-2.5 pr-9 group bg-white border-t border-b border-black/[.08] border-l-[3px] shadow-sm transition-shadow ${BORDER[role] || 'border-l-black'} ${isFirstUnread ? 'ring-2 ring-[#7c3aed]/40' : ''}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-black/10 text-black">{name}</span>
        <span className="text-[10px] text-black">{editedDate || date}</span>
        {editedDate && <span className="text-[9px] italic text-black">(edited)</span>}
      </div>
      {cm.quoted && (
        <div
          onClick={scrollToOriginal}
          className="flex items-center gap-2 px-2.5 py-1.5 mb-1.5 bg-black/[.04] border-l-2 border-[#7c3aed]/40 rounded-r cursor-pointer hover:bg-[#f5f0ff] hover:border-[#7c3aed] transition-colors"
        >
          {cm.quoted_thumbs?.length > 1 ? (
            <div className="flex items-center flex-shrink-0" style={{ width: `${20 + Math.min(cm.quoted_thumbs.length, 3) * 14}px` }}>
              {cm.quoted_thumbs.slice(0, 3).map((u, i) => (
                <img
                  key={i}
                  src={u}
                  alt=""
                  className="w-8 h-8 rounded object-cover border border-black bg-white"
                  style={{ marginLeft: i === 0 ? 0 : -18, zIndex: 3 - i }}
                />
              ))}
            </div>
          ) : cm.quoted_thumb && (
            <img src={cm.quoted_thumb} alt="" className="w-8 h-8 rounded object-cover border border-black flex-shrink-0" />
          )}
          <div className="min-w-0">
            {cm.quoted_author && <div className="text-[9px] font-bold text-[#7c3aed] mb-0.5">{cm.quoted_author}</div>}
            <div className="text-[11px] text-black truncate">{cm.quoted}</div>
          </div>
        </div>
      )}
      {(priorVersions.length > 0 || cm.body || editing) && (
        <div className="flex flex-col gap-1">
          {/* Superseded versions — struck through, oldest first, each stamped with when it
              went live (edits[0] = original send time, then one per edit). */}
          {priorVersions.map((ev, i) => (
            isRichNote
              ? <div key={i} className="flex flex-col gap-0.5">
                  <div
                    className="text-[12px] leading-relaxed break-words rich-comment-body line-through opacity-40"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(ev.body || '', RICH_HTML_SANITIZE_CONFIG) }}
                  />
                  {ev.at && <span className="text-[9px] text-black/30">{formatActivityDate(ev.at)}</span>}
                </div>
              : <div key={i} className="text-[12px] text-black/35 leading-relaxed whitespace-pre-line break-words">
                  <span className="line-through">{ev.body}</span>
                  {ev.at && <span className="ml-1.5 text-[9px] text-black/30">· {formatActivityDate(ev.at)}</span>}
                </div>
          ))}

          {editing ? (
            <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
              <textarea
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') cancelEdit()
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit() }
                }}
                className="text-[13px] text-[#1A1A18] leading-relaxed bg-white border border-black/25 rounded px-2 py-1.5 outline-none resize-y min-h-[52px] focus:border-black"
                rows={2}
              />
              <div className="flex items-center gap-2">
                <button type="button" disabled={savingEdit} onClick={saveEdit}
                  className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.05em] bg-[#1A1A18] text-white rounded cursor-pointer hover:opacity-80 disabled:opacity-50">
                  {savingEdit ? 'Saving…' : 'Save'}
                </button>
                <button type="button" disabled={savingEdit} onClick={cancelEdit}
                  className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.05em] border border-black/20 bg-white rounded cursor-pointer hover:bg-black/5">
                  Cancel
                </button>
                <span className="text-[9px] text-black/35">⌘/Ctrl+Enter to save · Esc to cancel</span>
              </div>
            </div>
          ) : cm.body ? (
            cm.metadata?.format === 'html'
              // Sanitized again here even though the backend already sanitized on write — render
              // time is the real point of exposure (every viewer's browser executes whatever this
              // produces), and a second, independent pass costs nothing against a comment that
              // somehow reached the client through a path that skipped the backend sanitizer.
              // Inline images are raw DOM nodes from dangerouslySetInnerHTML, not React elements —
              // they can't carry their own onClick prop, so clicks are caught via delegation on the
              // wrapping div instead (without this, an inline image just sat there un-openable).
              ? <div
                    className="text-[13px] text-[#1A1A18] leading-relaxed break-words rich-comment-body"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(cm.body, RICH_HTML_SANITIZE_CONFIG) }}
                    onClick={e => {
                      if (e.target.tagName !== 'IMG') return
                      const urls = [...e.currentTarget.querySelectorAll('img')].map(img => img.src)
                      handleMediaClickDebounced(() => openLightbox(urls, urls.indexOf(e.target.src), { editable: true }))
                    }}
                    onDoubleClick={e => {
                      if (e.target.tagName !== 'IMG') return
                      e.stopPropagation()
                      scrollToMediaItem?.(e.target.src)
                    }}
                  />
              : <div className="text-[13px] text-[#1A1A18] leading-relaxed whitespace-pre-line break-words">
                  {cm.body}
                </div>
          ) : null}
        </div>
      )}
      {cm.attachments?.length > 0 && (() => {
        const imgUrls = cm.attachments
          .map(raw => normalizeAttachment(raw))
          .filter(a => a.type.startsWith('image') || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(a.name))
          .map(a => a.url)
        return (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {cm.attachments.map((raw, i) => {
            const { url, name, type } = normalizeAttachment(raw)
            const isImg = type.startsWith('image') || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(name)
            const isAudio = type.startsWith('audio') || /\.(webm|m4a|ogg|mp3|wav)$/i.test(name)
            const isUploading = !!raw?.uploading
            // Permanently removed (server-confirmed) vs just queued for removal in this not-yet-saved
            // edit — both render faded/struck the same way, but only the queued one can be undone
            // by clicking the badge again before Save.
            const isRemoved = isAttachmentRemoved(raw)
            const isPending = editing && pendingRemove.has(url)
            const isGone    = isRemoved || isPending
            const RemoveBadge = () => !isRemoved && editing ? (
              <button type="button" onClick={e => { e.stopPropagation(); toggleRemoveAttachment(url) }}
                title={isPending ? 'Undo remove' : 'Remove from message'}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-black text-white text-[10px] leading-none flex items-center justify-center hover:bg-red-600 z-10">
                {isPending ? '↺' : '×'}
              </button>
            ) : null
            return isAudio
              ? (
                <div key={i} className={`relative flex items-center gap-1.5 ${isUploading ? 'opacity-50' : ''} ${isGone ? 'opacity-40 grayscale' : ''}`}>
                  {isUploading
                    ? <span className="w-2.5 h-2.5 border border-black border-t-black/70 rounded-full animate-spin flex-shrink-0" />
                    : <audio src={url} controls={!isGone} preload="none" className="h-8 max-w-[220px]" />
                  }
                  <RemoveBadge />
                </div>
              )
              : isImg
              ? (
                <div key={i} className="relative">
                  <img
                    src={url}
                    alt={name}
                    title={isUploading ? undefined : isGone ? 'Removed from message' : 'Click to open — double-click to find it in Media'}
                    onClick={isUploading || isGone ? undefined : e => {
                      e.stopPropagation()
                      handleMediaClickDebounced?.(() => openLightbox?.(imgUrls, imgUrls.indexOf(url), { editable: true }))
                    }}
                    onDoubleClick={isUploading || isGone ? undefined : e => {
                      e.stopPropagation()
                      scrollToMediaItem?.(url)
                    }}
                    className={`max-w-[110px] max-h-[85px] rounded object-cover border border-black ${isUploading ? 'opacity-50' : isGone ? 'opacity-40 grayscale cursor-default' : 'cursor-zoom-in'}`}
                  />
                  {isUploading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                      <span className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                      <span className="text-[7px] font-bold text-white bg-black/40 px-1 py-0.5 rounded-full tabular-nums">{cm._uploadPct ?? 0}%</span>
                    </div>
                  )}
                  {isGone && !isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[8px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded uppercase tracking-wide">Removed</span>
                    </div>
                  )}
                  <RemoveBadge />
                </div>
              )
              : (
                // No href — a real href fires the anchor's own navigation on the very first
                // click of a double-click, before the dblclick handler below ever runs, so
                // clicking twice would open the file twice instead of jumping to Media. Both
                // actions are dispatched manually through the same debounce every other
                // click-vs-double-click attachment on this page uses.
                <div key={i} className="relative">
                <a role="button" tabIndex={isUploading || isGone ? -1 : 0} rel="noreferrer"
                  title={isUploading ? undefined : isGone ? 'Removed from message' : 'Click to open — double-click to find it in Media'}
                  onClick={isUploading || isGone ? undefined : e => {
                    e.preventDefault(); e.stopPropagation()
                    handleMediaClickDebounced?.(() => window.open(url, '_blank', 'noopener,noreferrer'))
                  }}
                  onDoubleClick={isUploading || isGone ? undefined : e => { e.preventDefault(); e.stopPropagation(); scrollToMediaItem?.(url) }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-black/[.04] border border-black rounded text-[11px] text-[#1A1A18] hover:bg-black/[.08] transition-colors max-w-[200px] cursor-pointer ${isUploading || isGone ? 'pointer-events-none opacity-60' : ''}`}>
                  {isUploading
                    ? <span className="w-2.5 h-2.5 border border-black border-t-black/70 rounded-full animate-spin flex-shrink-0" />
                    : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-black">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
                      </svg>
                  }
                  <span className="truncate">{name}</span>
                </a>
                <RemoveBadge />
                </div>
              )
          })}
        </div>
        )
      })()}
      {cm._failed && (
        <div className="flex items-center gap-2 mt-1.5 text-[10px] font-semibold text-red-600">
          <span>Failed to send{cm._error ? `: ${cm._error}` : ''}</span>
          <button type="button" onClick={() => retryComment(workspaceId, cm.id)} className="underline cursor-pointer border-none bg-none p-0 text-red-600 hover:text-red-800">Retry</button>
          <button type="button" onClick={() => removeFailedComment(workspaceId, cm.id)} className="underline cursor-pointer border-none bg-none p-0 text-black hover:text-black">Remove</button>
        </div>
      )}
      <div className="absolute top-2 right-2 flex items-center gap-1">
        {canEditThis && !editing && (
          <button
            type="button"
            title="Edit message"
            onClick={onEditClick}
            className="w-6 h-6 rounded-full bg-white/90 border border-black flex items-center justify-center cursor-pointer text-black opacity-100 transition-all hover:bg-[#1A1A18] hover:text-white"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={() => onReply(cm)}
          className="w-6 h-6 rounded-full bg-white/90 border border-black flex items-center justify-center cursor-pointer text-black opacity-100 transition-all hover:bg-[#1A1A18] hover:text-white"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

function InviteForm({ label, fixedDomain = null, onInvite, onClose, accent = '#7c3aed', members = [], loadingMembers = false, totalOrgMemberCount = 0 }) {
  // Registered members of the buyer/vendor org — the backend only ever accepts an invite
  // email that already matches an organization_members row in that org (emailBelongsToOrg,
  // routes/plm.js), so this dropdown IS the actual set of valid invitees, not a convenience
  // shortcut. The manual email field below only ever applies when orgId itself can't be
  // resolved yet (no workspace/org linked to this SKU so far) — in that one case the backend
  // skips the membership check entirely, since there's no org to check membership against.
  // `members` is fetched by InviteRow (not here) and already excludes anyone with an
  // already-active invite on this workspace — InviteRow also hides the button that opens this
  // form at all once nothing's left, but `allAlreadyInvited` stays as a defensive fallback for
  // that same state in case this form is ever open when it happens (e.g. a stale render).
  const [selectedEmail, setSelectedEmail] = useState('')
  const [localPart, setLocalPart] = useState('')
  const [busy,      setBusy]      = useState(false)
  const [error,     setError]     = useState('')
  // Shareable accept-link for the invite just sent — shown once, right after creation (the
  // backend returns it only on that same response), so the merchant can copy/paste it
  // themselves if the email doesn't land (spam filter, wrong inbox, etc).
  const [sentLink, setSentLink] = useState(null)
  const [copied,   setCopied]   = useState(false)

  const allAlreadyInvited = !loadingMembers && totalOrgMemberCount > 0 && members.length === 0
  const invitableMembers = members
  const showDropdown = invitableMembers.length > 0
  const fullEmail = fixedDomain ? `${localPart}@${fixedDomain}` : localPart
  const localOk   = fixedDomain
    ? localPart.trim().length > 0 && !/[@\s]/.test(localPart)
    : isValidEmail(fullEmail)
  const canSend = showDropdown ? !!selectedEmail : localOk

  const handleSend = async () => {
    const email = showDropdown ? selectedEmail : fullEmail.trim()
    if (!canSend || !email) return
    setBusy(true)
    setError('')
    const result = await onInvite(email)
    setBusy(false)
    if (result?.ok) {
      setLocalPart(''); setSelectedEmail('')
      if (result.link) setSentLink(result.link)
      else onClose()
    }
    else if (result?.error) setError(result.error)
  }

  const copyLink = () => {
    navigator.clipboard?.writeText(sentLink)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
      .catch(() => {})
  }

  if (sentLink) {
    return (
      <div className="flex flex-col gap-1.5 ml-20">
        <div className="flex items-center gap-2 bg-black/[.03] border border-black/10 rounded px-2.5 py-1.5">
          <span className="flex-1 text-[10px] text-black truncate">{sentLink}</span>
          <button type="button" onClick={copyLink} className="text-[10px] font-bold uppercase text-[#1A1A18] hover:opacity-70 cursor-pointer border-none bg-none flex-shrink-0 whitespace-nowrap">
            {copied ? 'Copied' : 'Copy Link'}
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-black/50">Invite sent — share this link if they don't get the email.</span>
          <button type="button" onClick={onClose} className="text-[10px] font-bold uppercase text-[#1A1A18] hover:opacity-70 cursor-pointer border-none bg-none flex-shrink-0">Done</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 ml-20">
      <div className="flex items-center gap-1.5">
        {loadingMembers ? (
          <span className="flex-1 text-[11px] text-black/40 px-2 py-1">Loading registered {label.toLowerCase()}s…</span>
        ) : showDropdown ? (
          <select
            autoFocus
            value={selectedEmail}
            onChange={e => { setSelectedEmail(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            className={`flex-1 px-2 py-1 text-[12px] border-b bg-black/[.03] outline-none ${error ? 'border-red-400' : 'border-black'}`}
          >
            <option value="">Select {label.toLowerCase()}…</option>
            {invitableMembers.map(m => (
              <option key={m.id} value={m.email}>{m.full_name ? `${m.full_name} — ${m.email}` : m.email}</option>
            ))}
          </select>
        ) : allAlreadyInvited ? (
          <span className="flex-1 text-[11px] text-black/50 px-2 py-1">All registered {label.toLowerCase()}s are already in this workspace.</span>
        ) : fixedDomain ? (
          <div className={`flex flex-1 items-center border-b ${error ? 'border-red-400' : 'border-black'}`}>
            <input
              autoFocus
              value={localPart}
              onChange={e => { setLocalPart(e.target.value.replace(/[@\s]/g, '')); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="name"
              className="flex-1 px-2 py-1 text-[12px] bg-transparent outline-none min-w-0"
            />
            <span className="text-[12px] text-black pr-2 flex-shrink-0">@{fixedDomain}</span>
          </div>
        ) : (
          <input
            autoFocus
            type="email"
            value={localPart}
            onChange={e => { setLocalPart(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={`${label.toLowerCase()}@company.com`}
            className={`flex-1 px-2 py-1 text-[12px] border-b bg-black/[.03] outline-none ${error ? 'border-red-400' : 'border-black'}`}
          />
        )}
        {!allAlreadyInvited && (
          <button
            onClick={handleSend}
            disabled={busy || !canSend}
            className="px-3 py-1 text-[10px] font-bold uppercase rounded-xl text-white cursor-pointer disabled:opacity-40 hover:opacity-80 flex-shrink-0"
            style={{ backgroundColor: accent }}
          >
            {busy ? '…' : 'Send'}
          </button>
        )}
        <button onClick={onClose} className="text-black text-lg leading-none cursor-pointer border-none bg-none">×</button>
      </div>
      {error && (
        <span className="text-[10px] font-semibold text-red-500 leading-snug">{error}</span>
      )}
    </div>
  )
}

function InviteItem({ invite, onRevoke, onResend, onRevealLink, accent }) {
  const [revoking,     setRevoking]     = useState(false)
  const [resending,    setResending]    = useState(false)
  const [resendError,  setResendError]  = useState('')
  // Read-only lookup of the invite's EXISTING link (see plmStore's revealInviteLink) — never
  // mutates the invite, so revealing it repeatedly (or from a different workspace in the same
  // bulk batch) always returns the same token/link, unlike Resend which always mints a new one.
  const [revealing,    setRevealing]    = useState(false)
  const [revealData,   setRevealData]   = useState(null) // { link, workspaces } | null
  const [revealError,  setRevealError]  = useState('')
  const [copied,       setCopied]       = useState(false)
  const handleRevoke = async () => {
    setRevoking(true)
    try { await onRevoke() } catch (err) { setResendError(err.message) } finally { setRevoking(false) }
  }
  const handleResend = async () => {
    setResending(true)
    setResendError('')
    const result = await onResend(invite.email)
    setResending(false)
    if (result && !result.ok && result.error) setResendError(result.error)
  }
  const handleReveal = async () => {
    if (revealData) { setRevealData(null); return } // toggle closed
    setRevealing(true)
    setRevealError('')
    try {
      const result = await onRevealLink()
      setRevealData(result)
    } catch (err) { setRevealError(err.message) }
    finally { setRevealing(false) }
  }
  const copyLink = () => {
    navigator.clipboard?.writeText(revealData?.link)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
      .catch(() => {})
  }
  const otherWorkspaces = (revealData?.workspaces || []).filter(w => w.id !== invite.currentWorkspaceId)
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span className="text-[12px] text-[#1A1A18] font-medium break-all">{invite.name || invite.email}</span>
        {invite.name && <span className="text-[10px] text-black font-mono break-all">{invite.email}</span>}
        {invite.status === 'pending'  && <span className="text-[9px] font-bold uppercase tracking-[.06em] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">Pending</span>}
        {invite.status === 'accepted' && <span className="text-[9px] font-bold uppercase tracking-[.06em] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">Accepted</span>}
        {invite.status === 'expired'  && <span className="text-[9px] font-bold uppercase tracking-[.06em] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200">Expired</span>}
        {invite.status === 'pending' && onRevealLink && (
          <button
            onClick={handleReveal}
            disabled={revealing}
            title="Show the invite link — e.g. if it wasn't copied or the email didn't arrive"
            className="text-[11px] font-semibold border border-dashed border-black rounded-full px-3.5 py-1 cursor-pointer bg-transparent disabled:opacity-40 transition-colors"
            onMouseEnter={e => { e.currentTarget.style.color = accent; e.currentTarget.style.borderColor = accent }}
            onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.borderColor = '' }}
          >
            {revealing ? '…' : revealData ? 'Hide Link' : 'Reveal Link'}
          </button>
        )}
        {invite.status === 'expired' && onResend && (
          <button
            onClick={handleResend}
            disabled={resending}
            title="Resend invite"
            className="text-[11px] font-semibold border border-dashed border-black rounded-full px-3.5 py-1 cursor-pointer bg-transparent disabled:opacity-40 transition-colors"
            onMouseEnter={e => { e.currentTarget.style.color = accent; e.currentTarget.style.borderColor = accent }}
            onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.borderColor = '' }}
          >
            {resending ? '…' : 'Resend'}
          </button>
        )}
        {onRevoke && (
          <button
            onClick={handleRevoke}
            disabled={revoking}
            title="Revoke invite"
            className="text-[11px] font-semibold border border-dashed border-black rounded-full px-3.5 py-1 cursor-pointer bg-transparent disabled:opacity-40 transition-colors"
            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.borderColor = '' }}
          >
            {revoking ? '…' : 'Revoke'}
          </button>
        )}
      </div>
      {resendError && (
        <span className="w-full text-[10px] font-semibold text-red-500 leading-snug">{resendError}</span>
      )}
      {revealError && (
        <span className="w-full text-[10px] font-semibold text-red-500 leading-snug">{revealError}</span>
      )}
      {revealData && (
        <div className="flex flex-col gap-1.5 bg-black/[.03] border border-black/10 rounded px-2.5 py-2 w-full max-w-full">
          <span className="text-[10px] text-black break-all">{revealData.link}</span>
          {otherWorkspaces.length > 0 ? (
            <div className="flex flex-col gap-1 pt-1 border-t border-black/10">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-bold uppercase tracking-[.06em] text-amber-700">
                  Also joins {otherWorkspaces.length} other workspace{otherWorkspaces.length === 1 ? '' : 's'} on accept:
                </span>
                <button type="button" onClick={copyLink} className="text-[10px] font-bold uppercase text-[#1A1A18] hover:opacity-70 cursor-pointer border-none bg-none whitespace-nowrap flex-shrink-0">
                  {copied ? 'Copied' : 'Copy Link'}
                </button>
              </div>
              <div className="flex flex-col gap-0.5">
                {otherWorkspaces.map(w => (
                  <span key={w.id} className="text-[10px] text-black/70 truncate">
                    {w.skuCode || 'SKU'}{w.description ? ` — ${w.description}` : ''}
                  </span>
                ))}
              </div>
              <span className="text-[9px] text-black/50 leading-relaxed pt-0.5">
                This link was sent as one bulk invite, so accepting it joins all of these at once. For just this workspace, revoke this invite and send a separate one.
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-black/50 leading-relaxed">Joins only this workspace on accept.</span>
              <button type="button" onClick={copyLink} className="text-[10px] font-bold uppercase text-[#1A1A18] hover:opacity-70 cursor-pointer border-none bg-none whitespace-nowrap flex-shrink-0">
                {copied ? 'Copied' : 'Copy Link'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InviteRow({ label, invites = [], orgName, fixedDomain = null, orgId = null, orgDepartment = null, workspaceId = null, lockedMsg = null, onInvite, onRevoke, onRevealLink }) {
  const [open, setOpen] = useState(false)
  const accent      = label === 'Buyer' ? '#7c3aed' : label === 'QA' ? '#0891b2' : '#ea580c'
  // No cap on how many buyer/vendor/QA contacts can be invited per workspace.
  const canAddMore  = true
  const hasInvites  = invites.length > 0

  // Fetched here (not just inside InviteForm, which only mounts once "+ Invite another" is
  // clicked) so the button itself can be hidden in advance when every registered member is
  // already on this workspace — showing a dead-end button that just says "no one left" after
  // clicking is worse than not showing it at all.
  const fetchOrgMembers = usePlmStore(s => s.fetchOrgMembers)
  const [orgMembers, setOrgMembers] = useState([])
  const [loadingOrgMembers, setLoadingOrgMembers] = useState(!!orgId)
  useEffect(() => {
    if (!orgId) { setLoadingOrgMembers(false); return }
    let cancelled = false
    setLoadingOrgMembers(true)
    fetchOrgMembers(orgId, orgDepartment).then(list => { if (!cancelled) { setOrgMembers(list); setLoadingOrgMembers(false) } })
    return () => { cancelled = true }
  }, [orgId, orgDepartment, fetchOrgMembers])
  const excludeEmails = invites.filter(i => i.status !== 'revoked').map(i => i.email).filter(Boolean)
  const excludeSet = new Set(excludeEmails.map(e => e.toLowerCase()))
  const invitableOrgMembers = orgMembers.filter(m => !excludeSet.has((m.email || '').toLowerCase()))
  // Only a real "nothing left" state once members are actually known — an org with zero
  // registered members at all still falls through to manual email entry in InviteForm, so
  // that case must NOT hide the button (orgMembers.length > 0 guards exactly that).
  const allRegisteredAlreadyInvited = !loadingOrgMembers && orgMembers.length > 0 && invitableOrgMembers.length === 0

  return (
    <div className="flex flex-col gap-1.5 py-2.5 border-b border-black">
      <div className="flex items-start gap-4">
        <span className="text-[10px] font-bold uppercase tracking-[.1em] text-black w-16 flex-shrink-0 pt-0.5">{label}</span>

        {lockedMsg && !hasInvites ? (
          <div className="relative group flex items-center gap-1.5">
            <button type="button" disabled className="text-[11px] font-semibold text-black border border-dashed border-black rounded-full px-3.5 py-1 cursor-not-allowed bg-transparent">
              + Invite {label}
            </button>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-black flex-shrink-0">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <div className="absolute left-0 top-full mt-1.5 w-[200px] bg-[#1A1A18] text-white text-[10px] leading-relaxed px-2.5 py-1.5 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {lockedMsg}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1 flex-1">
            {orgName && (
              <span className="text-[10px] font-semibold text-black uppercase tracking-[.04em]">{orgName}</span>
            )}

            {hasInvites && (
              <div className="flex flex-col gap-1">
                {invites.map(inv => {
                  const isTimedOut = !inv.accepted_at && inv.expires_at && new Date(inv.expires_at) < new Date()
                  const isExpired  = inv.status === 'expired' || isTimedOut
                  return (
                    <InviteItem key={inv.id || inv.email} invite={{ ...inv, status: isExpired ? 'expired' : inv.status, currentWorkspaceId: workspaceId }} accent={accent}
                      onRevoke={onRevoke && (inv.status === 'pending' || isExpired) ? () => onRevoke(inv.id) : undefined}
                      onResend={onInvite && isExpired ? onInvite : undefined}
                      onRevealLink={onRevealLink && inv.status === 'pending' && !isExpired ? () => onRevealLink(inv.id) : undefined}
                    />
                  )
                })}
              </div>
            )}

            {canAddMore && !open && onInvite && allRegisteredAlreadyInvited && (
              <span className="text-[10px] text-black/50 mt-0.5">All registered {label.toLowerCase()}s are already in this workspace.</span>
            )}
            {canAddMore && !open && onInvite && !allRegisteredAlreadyInvited && (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-[11px] font-semibold text-[#1A1A18] border border-dashed border-black rounded-full px-3.5 py-1 cursor-pointer transition-colors bg-transparent self-start mt-0.5"
                onMouseEnter={e => { e.currentTarget.style.color = accent; e.currentTarget.style.borderColor = accent }}
                onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.borderColor = '' }}
              >
                {hasInvites ? '+ Invite another' : `+ Invite ${label}`}
              </button>
            )}
          </div>
        )}
      </div>

      {open && (
        <InviteForm label={label} fixedDomain={fixedDomain} onInvite={onInvite} onClose={() => setOpen(false)} accent={accent}
          members={invitableOrgMembers} loadingMembers={loadingOrgMembers} totalOrgMemberCount={orgMembers.length}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const label = STATUS_LABELS[status] || status
  const cls   = STATUS_COLORS[status] || 'bg-black/[.06] text-black'
  return (
    <span className={`text-[10px] font-bold uppercase tracking-[.06em] px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  )
}

function BriefField({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-[.1em] text-black">{label}</span>
      {children}
    </div>
  )
}

function BriefInput({ brief, field, setBrief, placeholder, readOnly = false }) {
  return (
    <input
      value={brief[field] || ''}
      onChange={e => !readOnly && setBrief(b => ({ ...b, [field]: e.target.value }))}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full border-b text-[12px] outline-none py-1 uppercase
        ${readOnly
          ? 'border-black bg-transparent text-black cursor-default select-none'
          : 'border-black bg-transparent placeholder:text-black/25'
        }`}
    />
  )
}

// Extracted out of WorkspaceModal's render body (was an IIFE invoked inline in JSX) so the
// click-debounce handler passed in as a prop doesn't count as "accessing a ref during render"
// to the react-hooks/refs lint rule — that rule treats anything reachable inside an
// immediately-invoked function expression used as a JSX child as still "during render," even
// when the ref access itself only happens inside a nested onClick closure. A real component
// boundary is the pattern it actually recognizes.
function MediaPanelContent({
  ws, comments, sku, isReadOnly, role, settingProductImg, setSettingProductImg,
  addingSampleImg, setAddingSampleImg,
  openLightbox, pinImage, setBriefErrors, toast, setSkuImageFromUrl,
  handleMediaClickDebounced, scrollToChatMessage, saveSampleFindings, queueSampleScroll,
}) {
  // Multi-select — lets someone check off several media tiles across any section (Spec, Kaptr,
  // Sample, chat attachments, etc.) and share them all in one native share-sheet call, instead
  // of opening and sharing each image one at a time. Local to this panel; resets whenever the
  // panel re-mounts (workspace switch) since there's no reason a selection should survive that.
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const toggleSelected = (u) => setSelected(prev => {
    const next = new Set(prev)
    next.has(u) ? next.delete(u) : next.add(u)
    return next
  })
  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()) }
  // Rendered as a full-tile overlay (not just a small corner checkbox) so it also intercepts
  // the tile's normal click-to-zoom/pin/etc. behavior while selecting — nothing here needs a
  // second explicit "disable other buttons" step. `disabled` covers tiles mid-upload, where the
  // URL may not be fetchable yet.
  // Every tile's own pin/set-as-sample/etc. buttons are hidden outright (each gated on
  // `!selectMode` at its own render site) rather than papered over with a wash here — a heavy
  // tint across the whole thumbnail made every photo look washed-out/disabled and cheap, and
  // still let the old buttons show through underneath it. With those buttons actually gone,
  // this only needs to show a plain corner checkbox, plus the same selected-ring treatment
  // already used elsewhere on these tiles (isApproved/isProductImg), for a consistent look.
  const selectOverlay = (u, disabled = false) => (!selectMode || disabled) ? null : (
    <div
      role="checkbox" aria-checked={selected.has(u)} title={selected.has(u) ? 'Deselect' : 'Select to share'}
      onClick={e => { e.stopPropagation(); toggleSelected(u) }}
      className="absolute inset-0 z-20 cursor-pointer"
    >
      {selected.has(u) && <div className="absolute inset-0 ring-2 ring-[#7c3aed] ring-inset rounded-sm bg-[#7c3aed]/10 pointer-events-none" />}
      <span className={`absolute top-1 right-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selected.has(u) ? 'bg-[#7c3aed] border-[#7c3aed]' : 'bg-white/90 border-black/30'}`}>
        {selected.has(u) && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
      </span>
    </div>
  )

  const specImagesAll = (ws?.reference_media || [])
    .map((img, i) => {
      const rejected  = !!img.rejected
      const edited    = !!img.edited
      const fromNotes = !!img.fromNotes
      // Original (non-rejected, non-edited, non-note) spec pages were all uploaded together
      // with the buyer's spec file at SKU creation — there's no per-image timestamp (or single
      // actor) for those, so the SKU's own created_at stands in and uploadedBy is left blank.
      // Rejected/edited/note entries instead look up the specific milestone comment (reject/
      // reopen/edit/note-image-added) that put them here, which carries both actor and timestamp.
      const milestone  = (rejected || edited || fromNotes) ? findMediaMilestone(img.url, comments) : null
      const uploadedAt = milestone ? milestone.created_at : (sku?.created_at || null)
      const uploadedBy = milestone ? (milestone.author_name || milestone.role) : null
      return { url: img.url, name: `spec-${img.pageIndex ?? i}`, label: 'Spec', key: `spec-${i}`, rejected, edited, fromNotes, uploadedAt, uploadedBy }
    })

  // Kaptr reference photos live on the SKU itself (npd2_catalog_skus.spec_images), so they
  // show here even before a workspace exists. Each carries its own remark caption.
  const kaptrImages = (() => {
    let raw = sku?.spec_images
    if (typeof raw === 'string') { try { raw = JSON.parse(raw) } catch { raw = [] } }
    if (!Array.isArray(raw)) return []
    return raw
      .filter(s => s && s.url)
      .map((s, i) => ({
        url: s.url,
        name: s.url.split('/').pop()?.split('?')[0] || `kaptr-${i}`,
        key: `kaptr-${i}`,
        remark: s.remark || null,
        uploadedAt: s.created_at || sku?.created_at || null,
      }))
  })()
  // Images saved via the crop/replace image editor are tagged `edited: true` on the
  // backend — keep them in their own section instead of mixing them into the
  // original uploaded spec pages, which is confusing since they're derived, not source.
  // Rejected entries (archived from a prior sample round) get their own "Previous Sample"
  // section too, instead of a per-tile badge mixed into Spec/Edited — mirrors how the
  // current round gets its own "Current Sample" section below.
  const specImages           = specImagesAll.filter(img => !img.edited && !img.rejected && !img.fromNotes)
  const editedImages         = specImagesAll.filter(img => img.edited && !img.rejected && !img.fromNotes)
  const previousSampleImages = specImagesAll.filter(img => img.rejected)
  // Images dropped into the Buyer Brief Notes editor — mirrored into reference_media
  // (fromNotes: true) by the backend so they land here too, not just inline in the note text.
  const notesImages          = specImagesAll.filter(img => img.fromNotes && !img.rejected)
  // All chat attachments, not just images — PDFs, spreadsheets, docs etc. now
  // show up here too (as a file tile) instead of only appearing in the chat thread.
  const chatAttachments = comments.filter(cm => cm.attachments?.length > 0).flatMap((cm) =>
    cm.attachments
      .filter(raw => !isAttachmentRemoved(raw))
      .map((raw, ai) => {
        const att = normalizeAttachment(raw)
        const isImg = att.type.startsWith('image') || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(att.name)
        return {
          ...att, isImg, uploading: !!raw?.uploading, label: cm.metadata?.guest_name || cm.author_name || cm.role, key: `${cm.id}-${ai}`, isSample: false,
          commentId: cm.id, commentRole: cm.role, commentChannel: cm.channel,
          uploadPct: cm._uploadPct, uploadedAt: cm.created_at,
        }
      })
  )
  // Rich-text ("Notes") comments carry their images inline inside `body` HTML rather than in
  // `attachments` — without this, anything sent as a note-with-image (as opposed to a plain
  // chat attachment) would never show up in the Media panel at all, only in the chat thread.
  const chatInlineImages = comments.filter(cm => cm.metadata?.format === 'html' && cm.body).flatMap((cm) =>
    [...cm.body.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m, ii) => ({
      url: m[1], name: m[1].split('/').pop()?.split('?')[0] || 'note-image', isImg: true, uploading: false,
      label: cm.metadata?.guest_name || cm.author_name || cm.role, key: `${cm.id}-inline-${ii}`, isSample: false,
      commentId: cm.id, commentRole: cm.role, commentChannel: cm.channel, uploadedAt: cm.created_at,
    }))
  )
  const sampleImages = (ws?.sampleOrder?.findings?.sample_images || [])
    .map((url, i) => {
      const milestone = findMediaMilestone(url, comments)
      return {
        url, name: url.split('/').pop()?.split('?')[0] || 'sample', key: `sample-${i}`, isSample: true,
        uploadedAt: milestone?.created_at || null,
        uploadedBy: milestone ? (milestone.author_name || milestone.role) : null,
      }
    })
  const allImages = [...specImages, ...kaptrImages, ...editedImages, ...notesImages, ...chatAttachments, ...chatInlineImages, ...sampleImages, ...previousSampleImages]

  if (!allImages.length) return (
    <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-black text-center py-8 leading-relaxed px-2">
      Images and files shared in comments will appear here
    </div>
  )

  const hasSampleImages         = sampleImages.length > 0
  const hasPreviousSampleImages = previousSampleImages.length > 0
  const hasSpecImages   = specImages.length > 0
  const hasKaptrImages  = kaptrImages.length > 0
  const hasEditedImages = editedImages.length > 0
  const hasNotesImages  = notesImages.length > 0
  const productImageUrl   = sku?.image_url || null
  const buyerBriefImageUrl = ws?.buyer_brief?.image_url || null
  const productionImageUrl = ws?.sampleOrder?.findings?.approved_image || null
  // When each slot was last set — matched by the pin action's OWN milestone event, not just
  // any milestone mentioning the URL. Two slots holding the same image (e.g. buyer brief ==
  // product image) would otherwise borrow each other's timestamp.
  // Product image: if it was never explicitly changed there's no milestone, so fall back to
  // the SKU's creation time — that's when its original image was set (same fallback the
  // "From Spec" tiles use). Buyer brief / production only ever exist via an explicit pin.
  const productPinnedAt    = findPinMilestone(productImageUrl,    comments, ['product_image_set'])?.created_at || sku?.created_at || null
  const buyerBriefPinnedAt = findPinMilestone(buyerBriefImageUrl, comments, ['buyer_brief_image_set'])?.created_at || null
  const productionPinnedAt = findPinMilestone(productionImageUrl, comments, ['production_image_set'])?.created_at || null
  return (
    <>
      {/* Select-to-share toolbar — lets someone check off tiles from any section below and
          share them together in one native share-sheet call. */}
      <div className="flex items-center justify-between gap-2 mb-2">
        {selectMode ? (
          <>
            <span className="text-[10px] font-bold uppercase tracking-[.06em] text-black">{selected.size} selected</span>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => shareImages(Array.from(selected), toast)} disabled={!selected.size}
                className="h-7 px-2.5 rounded-full bg-[#7c3aed] text-white text-[10px] font-bold uppercase tracking-[.04em] border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >Share</button>
              <button type="button" onClick={exitSelectMode}
                className="h-7 px-2.5 rounded-full bg-black/10 hover:bg-black/20 text-black text-[10px] font-bold uppercase tracking-[.04em] border-none cursor-pointer transition-colors"
              >Cancel</button>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => setSelectMode(true)}
            className="ml-auto h-7 px-2.5 flex items-center gap-1 rounded-full bg-black/10 hover:bg-black/20 text-black text-[10px] font-bold uppercase tracking-[.04em] border-none cursor-pointer transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Select to Share
          </button>
        )}
      </div>

      {/* ── Pinned: Product Info image + Buyer Brief image + Production sample image ── */}
      {(productImageUrl || buyerBriefImageUrl || productionImageUrl) && (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[8px] lg:text-[10px] font-bold uppercase tracking-[.1em] text-black flex-shrink-0">Pinned</span>
            <div className="flex-1 h-px bg-black/[.08]" />
          </div>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {productImageUrl && (
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="aspect-square bg-[#EDEAE4] overflow-hidden relative rounded-sm">
                  {selectOverlay(productImageUrl)}
                  <img src={productImageUrl} onClick={e => { e.stopPropagation(); openLightbox([productImageUrl], 0, { editable: true }) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                  <div className="absolute inset-0 ring-2 ring-[#2D6A1F] ring-inset rounded-sm pointer-events-none" />
                  <span className="absolute bottom-0 left-0 right-0 bg-[#2D6A1F]/90 text-white text-[7px] font-bold uppercase tracking-[.05em] text-center py-0.5">Product Image</span>
                </div>
                {productPinnedAt && (
                  <div className="text-[7px] lg:text-[10px] font-semibold text-black px-0.5 truncate text-center tabular-nums leading-tight">{formatActivityDate(productPinnedAt)}</div>
                )}
              </div>
            )}
            {buyerBriefImageUrl && (
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="aspect-square bg-[#EDEAE4] overflow-hidden relative rounded-sm">
                  {selectOverlay(buyerBriefImageUrl)}
                  <img src={buyerBriefImageUrl} onClick={e => { e.stopPropagation(); openLightbox([buyerBriefImageUrl], 0, { editable: true }) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                  <div className="absolute inset-0 ring-2 ring-[#7c3aed] ring-inset rounded-sm pointer-events-none" />
                  <span className="absolute bottom-0 left-0 right-0 bg-[#7c3aed]/90 text-white text-[7px] font-bold uppercase tracking-[.05em] text-center py-0.5">Buyer Brief</span>
                </div>
                {buyerBriefPinnedAt && (
                  <div className="text-[7px] lg:text-[10px] font-semibold text-black px-0.5 truncate text-center tabular-nums leading-tight">{formatActivityDate(buyerBriefPinnedAt)}</div>
                )}
              </div>
            )}
            {productionImageUrl && (
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="aspect-square bg-[#EDEAE4] overflow-hidden relative rounded-sm">
                  {selectOverlay(productionImageUrl)}
                  <img src={productionImageUrl} onClick={e => { e.stopPropagation(); openLightbox([productionImageUrl], 0, { editable: true }) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                  <div className="absolute inset-0 ring-2 ring-[#c2410c] ring-inset rounded-sm pointer-events-none" />
                  <span className="absolute bottom-0 left-0 right-0 bg-[#c2410c]/90 text-white text-[7px] font-bold uppercase tracking-[.05em] text-center py-0.5">Production</span>
                </div>
                {productionPinnedAt && (
                  <div className="text-[7px] lg:text-[10px] font-semibold text-black px-0.5 truncate text-center tabular-nums leading-tight">{formatActivityDate(productionPinnedAt)}</div>
                )}
              </div>
            )}
          </div>
        </>
      )}
      {hasSpecImages && (
        <>
          {(chatAttachments.length > 0 || hasSampleImages) && (
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex-1 h-px bg-black/[.08]" />
              <span className="text-[8px] lg:text-[10px] font-bold uppercase tracking-[.1em] text-black flex-shrink-0">From Spec {specImages.length}</span>
              <div className="flex-1 h-px bg-black/[.08]" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            {specImages.map(({ url, key, uploadedAt, uploadedBy }) => {
              const isApproved     = url === ws?.buyer_brief?.image_url
              const isProductImg   = url === sku?.image_url
              const isSettingThis  = settingProductImg === url
              // Once sample photos are what's needed (workspace in the sample stage), nobody's
              // re-pinning the product image anymore — swap that button for a tick that pulls
              // this reference-media photo straight into Current Sample instead, so it doesn't
              // have to be re-downloaded and re-uploaded. Reverts to the pin button if the brief
              // gets reopened (status back to 'active'), since editing may resume then.
              // ws.status only flips to 'sample' once the buyer accepts the sample (too late —
              // by then there's nothing left to pick). Gate on the sample order actually being
              // marked Ready instead, since that's when picking sample images is meaningful.
              const isSampleStage   = ws?.sampleOrder?.sample_status === 'ready'
              const isAlreadySample = (ws?.sampleOrder?.findings?.sample_images || []).includes(url)
              const isAddingThis    = addingSampleImg === url
              return (
                <div key={key} className="flex flex-col gap-0.5 min-w-0">
                <div data-media-url={url} className="aspect-square bg-[#EDEAE4] overflow-hidden relative group rounded-sm">
                  {selectOverlay(url)}
                  <img src={url} onClick={e => { e.stopPropagation(); openLightbox(specImages.map(img => img.url), specImages.findIndex(img => img.url === url), { editable: true }) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                  {isApproved    && <div className="absolute inset-0 ring-2 ring-[#7c3aed] ring-inset rounded-sm pointer-events-none" />}
                  {isProductImg  && <div className="absolute inset-0 ring-2 ring-[#2D6A1F] ring-inset rounded-sm pointer-events-none" />}
                  {uploadedBy && (
                    <span className="absolute bottom-1 left-1 right-1 text-[7px] font-extrabold px-1 py-0.5 uppercase bg-white/90 rounded-sm text-[#1A1A18] pointer-events-none truncate text-center">{uploadedBy}</span>
                  )}

                  {/* Pin as brief image — top-right, not for suppliers */}
                  {!selectMode && ws?.id && !isReadOnly && role !== 'supplier' && role !== 'qa' && (
                    <button type="button" title={isApproved ? 'Remove pin' : 'Pin as brief image'}
                      onClick={() => pinImage(ws.id, isApproved ? null : url)
                        .then(() => {
                          if (!isApproved) setBriefErrors(s => { const n = new Set(s); n.delete('image_url'); return n })
                          toast?.(isApproved ? 'Brief image removed' : 'Buyer brief image updated')
                        })
                        .catch(err => toast?.(err?.message || 'Failed to update brief image'))}
                      className={`absolute top-1 right-1 transition-opacity w-6 h-6 rounded-full flex items-center justify-center cursor-pointer border
                        ${isApproved
                          ? 'opacity-100 bg-[#7c3aed] border-[#7c3aed] text-white hover:bg-red-500 hover:border-red-500'
                          : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#7c3aed] hover:text-white hover:border-[#7c3aed]'}`}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/>
                      </svg>
                    </button>
                  )}

                  {selectMode ? null : isSampleStage ? (
                    /* Add as sample image — top-left, merchant only, once in the sample stage */
                    role === 'merchant' && ws?.sampleOrder?.id && !isReadOnly && ws?.sampleOrder?.sample_status !== 'dropped' && (
                      <button
                        type="button"
                        disabled={isAddingThis}
                        title={isAlreadySample ? 'Remove from Current Sample' : 'Add as sample image'}
                        onClick={async e => {
                          e.stopPropagation()
                          if (isAddingThis) return
                          setAddingSampleImg(url)
                          try {
                            const existing = ws.sampleOrder?.findings?.sample_images || []
                            const updated  = isAlreadySample ? existing.filter(u => u !== url) : [...existing, url]
                            await saveSampleFindings(ws.sampleOrder.id, ws.id, { sample_images: updated })
                            if (!isAlreadySample) queueSampleScroll(url)
                            toast?.(isAlreadySample ? 'Removed from Current Sample' : 'Added to Current Sample')
                          } catch (err) { toast?.(err?.message || 'Failed to update sample image') }
                          finally { setAddingSampleImg(null) }
                        }}
                        className={`absolute top-1 left-1 w-6 h-6 rounded-full flex items-center justify-center border cursor-pointer transition-all
                          ${isAlreadySample
                            ? 'opacity-100 bg-[#166534] border-[#166534] text-white hover:bg-red-500 hover:border-red-500'
                            : isAddingThis
                              ? 'opacity-100 bg-white/90 border-black text-black'
                              : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#166534] hover:text-white hover:border-[#166534]'}`}
                      >
                        {isAddingThis
                          ? <span className="w-2.5 h-2.5 border border-black border-t-black/70 rounded-full animate-spin" />
                          : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        }
                      </button>
                    )
                  ) : (
                    /* Set as Product Info image — top-left, merchant only */
                    role === 'merchant' && sku?.id && !isReadOnly && (
                      <button
                        type="button"
                        disabled={isSettingThis}
                        title={isProductImg ? 'Current product image' : 'Set as Product Info image'}
                        onClick={e => {
                          e.stopPropagation()
                          if (isProductImg || isSettingThis) return
                          setSettingProductImg(url)
                          setSkuImageFromUrl(sku.id, url, ws.id)
                            .then(() => toast?.('Product image updated'))
                            .catch(err => toast?.(err?.message || 'Failed to update image'))
                            .finally(() => setSettingProductImg(null))
                        }}
                        className={`absolute top-1 left-1 transition-opacity w-6 h-6 rounded-full flex items-center justify-center cursor-pointer border
                          ${isProductImg
                            ? 'opacity-100 bg-[#2D6A1F] border-[#2D6A1F] text-white cursor-default'
                            : isSettingThis
                              ? 'opacity-100 bg-white/90 border-black text-black'
                              : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#2D6A1F] hover:text-white hover:border-[#2D6A1F]'}`}
                      >
                        {isSettingThis
                          ? <span className="w-2.5 h-2.5 border border-black border-t-black/70 rounded-full animate-spin" />
                          : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                            </svg>
                        }
                      </button>
                    )
                  )}
                </div>
                {uploadedAt && (
                  <div className="text-[7px] lg:text-[10px] font-semibold text-black px-0.5 truncate text-center tabular-nums leading-tight">{formatActivityDate(uploadedAt)}</div>
                )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {hasKaptrImages && (
        <>
          <div className={`flex items-center gap-2 mb-1.5 ${hasSpecImages ? 'mt-3' : ''}`}>
            <div className="flex-1 h-px bg-black/[.08]" />
            <span className="text-[8px] lg:text-[10px] font-bold uppercase tracking-[.1em] text-black flex-shrink-0">Kaptr {kaptrImages.length}</span>
            <div className="flex-1 h-px bg-black/[.08]" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {kaptrImages.map(({ url, key, remark, uploadedAt }) => {
              const isApproved     = url === ws?.buyer_brief?.image_url
              const isProductImg   = url === sku?.image_url
              const isSettingThis  = settingProductImg === url
              // ws.status only flips to 'sample' once the buyer accepts the sample (too late —
              // by then there's nothing left to pick). Gate on the sample order actually being
              // marked Ready instead, since that's when picking sample images is meaningful.
              const isSampleStage   = ws?.sampleOrder?.sample_status === 'ready'
              const isAlreadySample = (ws?.sampleOrder?.findings?.sample_images || []).includes(url)
              const isAddingThis    = addingSampleImg === url
              return (
              <div key={key} className="flex flex-col gap-0.5 min-w-0">
                <div data-media-url={url} className="aspect-square bg-[#EDEAE4] overflow-hidden relative group rounded-sm">
                  {selectOverlay(url)}
                  <img src={url}
                    onClick={e => { e.stopPropagation(); openLightbox(kaptrImages.map(im => im.url), kaptrImages.findIndex(im => im.url === url), { editable: true }) }}
                    className="w-full h-full object-contain cursor-zoom-in" alt="" />
                  {isApproved    && <div className="absolute inset-0 ring-2 ring-[#7c3aed] ring-inset rounded-sm pointer-events-none" />}
                  {isProductImg  && <div className="absolute inset-0 ring-2 ring-[#2D6A1F] ring-inset rounded-sm pointer-events-none" />}
                  <span className="absolute bottom-1 left-1 right-1 text-[7px] font-extrabold px-1 py-0.5 uppercase bg-white/90 rounded-sm text-[#1A1A18] pointer-events-none truncate text-center">Kaptr</span>

                  {/* Pin as brief image — top-right, not for suppliers */}
                  {!selectMode && ws?.id && !isReadOnly && role !== 'supplier' && role !== 'qa' && (
                    <button type="button" title={isApproved ? 'Remove pin' : 'Pin as brief image'}
                      onClick={() => pinImage(ws.id, isApproved ? null : url)
                        .then(() => {
                          if (!isApproved) setBriefErrors(s => { const n = new Set(s); n.delete('image_url'); return n })
                          toast?.(isApproved ? 'Brief image removed' : 'Buyer brief image updated')
                        })
                        .catch(err => toast?.(err?.message || 'Failed to update brief image'))}
                      className={`absolute top-1 right-1 transition-opacity w-6 h-6 rounded-full flex items-center justify-center cursor-pointer border
                        ${isApproved
                          ? 'opacity-100 bg-[#7c3aed] border-[#7c3aed] text-white hover:bg-red-500 hover:border-red-500'
                          : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#7c3aed] hover:text-white hover:border-[#7c3aed]'}`}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/>
                      </svg>
                    </button>
                  )}

                  {selectMode ? null : isSampleStage ? (
                    /* Add as sample image — top-left, merchant only, once in the sample stage */
                    role === 'merchant' && ws?.sampleOrder?.id && !isReadOnly && ws?.sampleOrder?.sample_status !== 'dropped' && (
                      <button
                        type="button"
                        disabled={isAddingThis}
                        title={isAlreadySample ? 'Remove from Current Sample' : 'Add as sample image'}
                        onClick={async e => {
                          e.stopPropagation()
                          if (isAddingThis) return
                          setAddingSampleImg(url)
                          try {
                            const existing = ws.sampleOrder?.findings?.sample_images || []
                            const updated  = isAlreadySample ? existing.filter(u => u !== url) : [...existing, url]
                            await saveSampleFindings(ws.sampleOrder.id, ws.id, { sample_images: updated })
                            if (!isAlreadySample) queueSampleScroll(url)
                            toast?.(isAlreadySample ? 'Removed from Current Sample' : 'Added to Current Sample')
                          } catch (err) { toast?.(err?.message || 'Failed to update sample image') }
                          finally { setAddingSampleImg(null) }
                        }}
                        className={`absolute top-1 left-1 w-6 h-6 rounded-full flex items-center justify-center border cursor-pointer transition-all
                          ${isAlreadySample
                            ? 'opacity-100 bg-[#166534] border-[#166534] text-white hover:bg-red-500 hover:border-red-500'
                            : isAddingThis
                              ? 'opacity-100 bg-white/90 border-black text-black'
                              : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#166534] hover:text-white hover:border-[#166534]'}`}
                      >
                        {isAddingThis
                          ? <span className="w-2.5 h-2.5 border border-black border-t-black/70 rounded-full animate-spin" />
                          : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        }
                      </button>
                    )
                  ) : (
                    /* Set as Product Info image — top-left, merchant only */
                    role === 'merchant' && sku?.id && !isReadOnly && (
                      <button
                        type="button"
                        disabled={isSettingThis}
                        title={isProductImg ? 'Current product image' : 'Set as Product Info image'}
                        onClick={e => {
                          e.stopPropagation()
                          if (isProductImg || isSettingThis) return
                          setSettingProductImg(url)
                          setSkuImageFromUrl(sku.id, url, ws.id)
                            .then(() => toast?.('Product image updated'))
                            .catch(err => toast?.(err?.message || 'Failed to update image'))
                            .finally(() => setSettingProductImg(null))
                        }}
                        className={`absolute top-1 left-1 transition-opacity w-6 h-6 rounded-full flex items-center justify-center cursor-pointer border
                          ${isProductImg
                            ? 'opacity-100 bg-[#2D6A1F] border-[#2D6A1F] text-white cursor-default'
                            : isSettingThis
                              ? 'opacity-100 bg-white/90 border-black text-black'
                              : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#2D6A1F] hover:text-white hover:border-[#2D6A1F]'}`}
                      >
                        {isSettingThis
                          ? <span className="w-2.5 h-2.5 border border-black border-t-black/70 rounded-full animate-spin" />
                          : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                            </svg>
                        }
                      </button>
                    )
                  )}
                </div>
                {remark && (
                  <div className="text-[8px] lg:text-[9px] text-black/70 px-0.5 leading-tight break-words line-clamp-3">{remark}</div>
                )}
                {uploadedAt && (
                  <div className="text-[7px] lg:text-[10px] font-semibold text-black px-0.5 truncate text-center tabular-nums leading-tight">{formatActivityDate(uploadedAt)}</div>
                )}
              </div>
              )
            })}
          </div>
        </>
      )}

      {hasEditedImages && (
        <>
          <div className={`flex items-center gap-2 mb-1.5 ${hasSpecImages || hasKaptrImages ? 'mt-3' : ''}`}>
            <div className="flex-1 h-px bg-black/[.08]" />
            <span className="text-[8px] lg:text-[10px] font-bold uppercase tracking-[.1em] text-black flex-shrink-0">Edited Images {editedImages.length}</span>
            <div className="flex-1 h-px bg-black/[.08]" />
          </div>
          {monthBucketsOf(editedImages).map((_mg, _gi) => (
          <MonthGroup key={_mg.key} label={_mg.label} count={_mg.items.length} defaultOpen={_gi === 0}>
          <div className="grid grid-cols-2 gap-1.5">
            {_mg.items.map(({ url, key, uploadedAt, uploadedBy }) => {
              const isApproved     = url === ws?.buyer_brief?.image_url
              const isProductImg   = url === sku?.image_url
              const isSettingThis  = settingProductImg === url
              // ws.status only flips to 'sample' once the buyer accepts the sample (too late —
              // by then there's nothing left to pick). Gate on the sample order actually being
              // marked Ready instead, since that's when picking sample images is meaningful.
              const isSampleStage   = ws?.sampleOrder?.sample_status === 'ready'
              const isAlreadySample = (ws?.sampleOrder?.findings?.sample_images || []).includes(url)
              const isAddingThis    = addingSampleImg === url
              return (
                <div key={key} className="flex flex-col gap-0.5 min-w-0">
                <div data-media-url={url} className="aspect-square bg-[#EDEAE4] overflow-hidden relative group rounded-sm">
                  {selectOverlay(url)}
                  <img src={url} onClick={e => { e.stopPropagation(); openLightbox(editedImages.map(img => img.url), editedImages.findIndex(img => img.url === url), { editable: true }) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                  {isApproved    && <div className="absolute inset-0 ring-2 ring-[#7c3aed] ring-inset rounded-sm pointer-events-none" />}
                  {isProductImg  && <div className="absolute inset-0 ring-2 ring-[#2D6A1F] ring-inset rounded-sm pointer-events-none" />}
                  {uploadedBy && (
                    <span className="absolute bottom-1 left-1 right-1 text-[7px] font-extrabold px-1 py-0.5 uppercase bg-white/90 rounded-sm text-[#1A1A18] pointer-events-none truncate text-center">{uploadedBy}</span>
                  )}

                  {/* Pin as brief image — top-right, not for suppliers */}
                  {!selectMode && ws?.id && !isReadOnly && role !== 'supplier' && role !== 'qa' && (
                    <button type="button" title={isApproved ? 'Remove pin' : 'Pin as brief image'}
                      onClick={() => pinImage(ws.id, isApproved ? null : url)
                        .then(() => {
                          if (!isApproved) setBriefErrors(s => { const n = new Set(s); n.delete('image_url'); return n })
                          toast?.(isApproved ? 'Brief image removed' : 'Buyer brief image updated')
                        })
                        .catch(err => toast?.(err?.message || 'Failed to update brief image'))}
                      className={`absolute top-1 right-1 transition-opacity w-6 h-6 rounded-full flex items-center justify-center cursor-pointer border
                        ${isApproved
                          ? 'opacity-100 bg-[#7c3aed] border-[#7c3aed] text-white hover:bg-red-500 hover:border-red-500'
                          : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#7c3aed] hover:text-white hover:border-[#7c3aed]'}`}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/>
                      </svg>
                    </button>
                  )}

                  {selectMode ? null : isSampleStage ? (
                    /* Add as sample image — top-left, merchant only, once in the sample stage */
                    role === 'merchant' && ws?.sampleOrder?.id && !isReadOnly && ws?.sampleOrder?.sample_status !== 'dropped' && (
                      <button
                        type="button"
                        disabled={isAddingThis}
                        title={isAlreadySample ? 'Remove from Current Sample' : 'Add as sample image'}
                        onClick={async e => {
                          e.stopPropagation()
                          if (isAddingThis) return
                          setAddingSampleImg(url)
                          try {
                            const existing = ws.sampleOrder?.findings?.sample_images || []
                            const updated  = isAlreadySample ? existing.filter(u => u !== url) : [...existing, url]
                            await saveSampleFindings(ws.sampleOrder.id, ws.id, { sample_images: updated })
                            if (!isAlreadySample) queueSampleScroll(url)
                            toast?.(isAlreadySample ? 'Removed from Current Sample' : 'Added to Current Sample')
                          } catch (err) { toast?.(err?.message || 'Failed to update sample image') }
                          finally { setAddingSampleImg(null) }
                        }}
                        className={`absolute top-1 left-1 w-6 h-6 rounded-full flex items-center justify-center border cursor-pointer transition-all
                          ${isAlreadySample
                            ? 'opacity-100 bg-[#166534] border-[#166534] text-white hover:bg-red-500 hover:border-red-500'
                            : isAddingThis
                              ? 'opacity-100 bg-white/90 border-black text-black'
                              : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#166534] hover:text-white hover:border-[#166534]'}`}
                      >
                        {isAddingThis
                          ? <span className="w-2.5 h-2.5 border border-black border-t-black/70 rounded-full animate-spin" />
                          : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        }
                      </button>
                    )
                  ) : (
                    /* Set as Product Info image — top-left, merchant only */
                    role === 'merchant' && sku?.id && !isReadOnly && (
                      <button
                        type="button"
                        disabled={isSettingThis}
                        title={isProductImg ? 'Current product image' : 'Set as Product Info image'}
                        onClick={e => {
                          e.stopPropagation()
                          if (isProductImg || isSettingThis) return
                          setSettingProductImg(url)
                          setSkuImageFromUrl(sku.id, url, ws.id)
                            .then(() => toast?.('Product image updated'))
                            .catch(err => toast?.(err?.message || 'Failed to update image'))
                            .finally(() => setSettingProductImg(null))
                        }}
                        className={`absolute top-1 left-1 transition-opacity w-6 h-6 rounded-full flex items-center justify-center cursor-pointer border
                          ${isProductImg
                            ? 'opacity-100 bg-[#2D6A1F] border-[#2D6A1F] text-white cursor-default'
                            : isSettingThis
                              ? 'opacity-100 bg-white/90 border-black text-black'
                              : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#2D6A1F] hover:text-white hover:border-[#2D6A1F]'}`}
                      >
                        {isSettingThis
                          ? <span className="w-2.5 h-2.5 border border-black border-t-black/70 rounded-full animate-spin" />
                          : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                            </svg>
                        }
                      </button>
                    )
                  )}
                </div>
                {uploadedAt && (
                  <div className="text-[7px] lg:text-[10px] font-semibold text-black px-0.5 truncate text-center tabular-nums leading-tight">{formatActivityDate(uploadedAt)}</div>
                )}
                </div>
              )
            })}
          </div>
          </MonthGroup>
          ))}
        </>
      )}

      {hasNotesImages && (
        <>
          <div className={`flex items-center gap-2 mb-1.5 ${hasSpecImages || hasKaptrImages || hasEditedImages ? 'mt-3' : ''}`}>
            <div className="flex-1 h-px bg-black/[.08]" />
            <span className="text-[8px] lg:text-[10px] font-bold uppercase tracking-[.1em] text-black flex-shrink-0">From Notes {notesImages.length}</span>
            <div className="flex-1 h-px bg-black/[.08]" />
          </div>
          {monthBucketsOf(notesImages).map((_mg, _gi) => (
          <MonthGroup key={_mg.key} label={_mg.label} count={_mg.items.length} defaultOpen={_gi === 0}>
          <div className="grid grid-cols-2 gap-1.5">
            {_mg.items.map(({ url, key, uploadedAt, uploadedBy }) => {
              const isApproved     = url === ws?.buyer_brief?.image_url
              const isProductImg   = url === sku?.image_url
              const isSettingThis  = settingProductImg === url
              // ws.status only flips to 'sample' once the buyer accepts the sample (too late —
              // by then there's nothing left to pick). Gate on the sample order actually being
              // marked Ready instead, since that's when picking sample images is meaningful.
              const isSampleStage   = ws?.sampleOrder?.sample_status === 'ready'
              const isAlreadySample = (ws?.sampleOrder?.findings?.sample_images || []).includes(url)
              const isAddingThis    = addingSampleImg === url
              return (
                <div key={key} className="flex flex-col gap-0.5 min-w-0">
                <div data-media-url={url} className="aspect-square bg-[#EDEAE4] overflow-hidden relative group rounded-sm">
                  {selectOverlay(url)}
                  <img src={url} onClick={e => { e.stopPropagation(); openLightbox(notesImages.map(img => img.url), notesImages.findIndex(img => img.url === url), { editable: true }) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                  {isApproved    && <div className="absolute inset-0 ring-2 ring-[#7c3aed] ring-inset rounded-sm pointer-events-none" />}
                  {isProductImg  && <div className="absolute inset-0 ring-2 ring-[#2D6A1F] ring-inset rounded-sm pointer-events-none" />}
                  {uploadedBy && (
                    <span className="absolute bottom-1 left-1 right-1 text-[7px] font-extrabold px-1 py-0.5 uppercase bg-white/90 rounded-sm text-[#1A1A18] pointer-events-none truncate text-center">{uploadedBy}</span>
                  )}

                  {/* Pin as brief image — top-right, not for suppliers */}
                  {!selectMode && ws?.id && !isReadOnly && role !== 'supplier' && role !== 'qa' && (
                    <button type="button" title={isApproved ? 'Remove pin' : 'Pin as brief image'}
                      onClick={() => pinImage(ws.id, isApproved ? null : url)
                        .then(() => {
                          if (!isApproved) setBriefErrors(s => { const n = new Set(s); n.delete('image_url'); return n })
                          toast?.(isApproved ? 'Brief image removed' : 'Buyer brief image updated')
                        })
                        .catch(err => toast?.(err?.message || 'Failed to update brief image'))}
                      className={`absolute top-1 right-1 transition-opacity w-6 h-6 rounded-full flex items-center justify-center cursor-pointer border
                        ${isApproved
                          ? 'opacity-100 bg-[#7c3aed] border-[#7c3aed] text-white hover:bg-red-500 hover:border-red-500'
                          : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#7c3aed] hover:text-white hover:border-[#7c3aed]'}`}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/>
                      </svg>
                    </button>
                  )}

                  {selectMode ? null : isSampleStage ? (
                    /* Add as sample image — top-left, merchant only, once in the sample stage */
                    role === 'merchant' && ws?.sampleOrder?.id && !isReadOnly && ws?.sampleOrder?.sample_status !== 'dropped' && (
                      <button
                        type="button"
                        disabled={isAddingThis}
                        title={isAlreadySample ? 'Remove from Current Sample' : 'Add as sample image'}
                        onClick={async e => {
                          e.stopPropagation()
                          if (isAddingThis) return
                          setAddingSampleImg(url)
                          try {
                            const existing = ws.sampleOrder?.findings?.sample_images || []
                            const updated  = isAlreadySample ? existing.filter(u => u !== url) : [...existing, url]
                            await saveSampleFindings(ws.sampleOrder.id, ws.id, { sample_images: updated })
                            if (!isAlreadySample) queueSampleScroll(url)
                            toast?.(isAlreadySample ? 'Removed from Current Sample' : 'Added to Current Sample')
                          } catch (err) { toast?.(err?.message || 'Failed to update sample image') }
                          finally { setAddingSampleImg(null) }
                        }}
                        className={`absolute top-1 left-1 w-6 h-6 rounded-full flex items-center justify-center border cursor-pointer transition-all
                          ${isAlreadySample
                            ? 'opacity-100 bg-[#166534] border-[#166534] text-white hover:bg-red-500 hover:border-red-500'
                            : isAddingThis
                              ? 'opacity-100 bg-white/90 border-black text-black'
                              : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#166534] hover:text-white hover:border-[#166534]'}`}
                      >
                        {isAddingThis
                          ? <span className="w-2.5 h-2.5 border border-black border-t-black/70 rounded-full animate-spin" />
                          : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        }
                      </button>
                    )
                  ) : (
                    /* Set as Product Info image — top-left, merchant only */
                    role === 'merchant' && sku?.id && !isReadOnly && (
                      <button
                        type="button"
                        disabled={isSettingThis}
                        title={isProductImg ? 'Current product image' : 'Set as Product Info image'}
                        onClick={e => {
                          e.stopPropagation()
                          if (isProductImg || isSettingThis) return
                          setSettingProductImg(url)
                          setSkuImageFromUrl(sku.id, url, ws.id)
                            .then(() => toast?.('Product image updated'))
                            .catch(err => toast?.(err?.message || 'Failed to update image'))
                            .finally(() => setSettingProductImg(null))
                        }}
                        className={`absolute top-1 left-1 transition-opacity w-6 h-6 rounded-full flex items-center justify-center cursor-pointer border
                          ${isProductImg
                            ? 'opacity-100 bg-[#2D6A1F] border-[#2D6A1F] text-white cursor-default'
                            : isSettingThis
                              ? 'opacity-100 bg-white/90 border-black text-black'
                              : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#2D6A1F] hover:text-white hover:border-[#2D6A1F]'}`}
                      >
                        {isSettingThis
                          ? <span className="w-2.5 h-2.5 border border-black border-t-black/70 rounded-full animate-spin" />
                          : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                            </svg>
                        }
                      </button>
                    )
                  )}
                </div>
                {uploadedAt && (
                  <div className="text-[7px] lg:text-[10px] font-semibold text-black px-0.5 truncate text-center tabular-nums leading-tight">{formatActivityDate(uploadedAt)}</div>
                )}
                </div>
              )
            })}
          </div>
          </MonthGroup>
          ))}
        </>
      )}

      {(chatAttachments.length > 0 || chatInlineImages.length > 0) && (() => {
        // Split by channel instead of one flat "From Chat" bucket. Only the merchant actually
        // juggles 3 separate audiences (buyer/vendor/group) at once, so only the merchant needs
        // Buyer Chat/Vendor Chat spelled out — a buyer or supplier only ever has one direct
        // conversation (nobody else can talk to them there), so labeling it "Buyer Chat" would
        // read like they're being told who they are; it stays generic "From Chat" for them,
        // with "Group Chat" broken out separately since that's a genuinely different audience.
        // Each role only ever receives comments for channels it can see (filtered server-side
        // in resolveCommentRole/filterCommentsForRole), so this just groups what's already been
        // scoped to them — a buyer never sees a "Vendor Chat"/vendor bucket at all, etc.
        const directTitle = role === 'merchant' ? 'Buyer Chat' : 'From Chat'
        const vendorTitle = role === 'merchant' ? 'Vendor Chat' : 'From Chat'
        const chatMediaAll = [...chatAttachments, ...chatInlineImages]
        const CHANNEL_GROUPS = [
          { gkey: 'buyer',  title: directTitle, items: chatMediaAll.filter(a => a.commentChannel === 'buyer' || !a.commentChannel) },
          { gkey: 'vendor', title: vendorTitle, items: chatMediaAll.filter(a => a.commentChannel === 'vendor' || a.commentChannel === 'supplier') },
          { gkey: 'group',  title: 'Group Chat',  items: chatMediaAll.filter(a => a.commentChannel === 'group') },
        ].filter(g => g.items.length > 0)

        return CHANNEL_GROUPS.map(({ gkey, title, items }) => {
        const chatSlice = items
        const chatImagesOnly = chatSlice.filter(a => a.isImg)
        return (
        <div key={gkey}>
        <div className="flex items-center gap-2 mt-3 mb-1.5">
          <div className="flex-1 h-px bg-black/[.08]" />
          <span className="text-[8px] lg:text-[10px] font-bold uppercase tracking-[.1em] text-black flex-shrink-0">{title} {items.length}</span>
          <div className="flex-1 h-px bg-black/[.08]" />
        </div>
        {monthBucketsOf(chatSlice).map((_mg, _gi) => (
        <MonthGroup key={_mg.key} label={_mg.label} count={_mg.items.length} defaultOpen={_gi === 0}>
        <div className="grid grid-cols-2 gap-1.5">
          {_mg.items.map(({ url, name, isImg, label, key, uploading, commentId, commentRole, commentChannel, uploadPct, uploadedAt }) => {
            const isApproved    = isImg && url && url === ws?.buyer_brief?.image_url
            const isProductImg  = isImg && url && url === sku?.image_url
            const isSettingThis = settingProductImg === url
            // ws.status only flips to 'sample' once the buyer accepts the sample (too late —
            // by then there's nothing left to pick). Gate on the sample order actually being
            // marked Ready instead, since that's when picking sample images is meaningful.
            const isSampleStage   = ws?.sampleOrder?.sample_status === 'ready'
            const isAlreadySample = (ws?.sampleOrder?.findings?.sample_images || []).includes(url)
            const isAddingThis    = addingSampleImg === url
            const sharedTitle   = 'Double-click to jump to this message in chat'

            const timeCaption = uploadedAt ? formatActivityDate(uploadedAt) : ''

            if (!isImg) {
              return (
                <div key={key} className="flex flex-col gap-0.5 min-w-0">
                <div className="aspect-square bg-[#EDEAE4] overflow-hidden relative group rounded-sm" title={sharedTitle}>
                  {selectOverlay(url, uploading)}
                  <a
                    href={uploading ? undefined : url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => {
                      if (uploading) return
                      e.preventDefault()
                      e.stopPropagation()
                      // Wait to see if a second click follows (double-click = jump to chat) before opening.
                      handleMediaClickDebounced(() => window.open(url, '_blank', 'noopener,noreferrer'))
                    }}
                    onDoubleClick={e => { e.preventDefault(); e.stopPropagation(); scrollToChatMessage({ commentId, commentRole, commentChannel }) }}
                    className={`w-full h-full flex flex-col items-center justify-center gap-1.5 px-2 no-underline ${uploading ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <FileTypeIcon name={name} />
                    <span className="text-[9px] text-black no-underline text-center leading-tight line-clamp-2 break-all">{name}</span>
                  </a>
                  {uploading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/20">
                      <span className="w-5 h-5 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                      <span className="text-[8px] font-bold text-white bg-black/40 px-1.5 py-0.5 rounded-full tabular-nums">{uploadPct ?? 0}%</span>
                    </div>
                  )}
                  {label && !uploading && (
                    <span className="absolute bottom-1 left-1 right-1 text-[7px] font-extrabold px-1 py-0.5 uppercase bg-white/90 rounded-sm text-[#1A1A18] truncate text-center pointer-events-none">{label}</span>
                  )}
                </div>
                {!uploading && timeCaption && (
                  <div className="text-[7px] lg:text-[10px] font-semibold text-black px-0.5 truncate text-center tabular-nums leading-tight">{timeCaption}</div>
                )}
                </div>
              )
            }

            return (
              <div key={key} className="flex flex-col gap-0.5 min-w-0">
              <div data-media-url={url} className="aspect-square bg-[#EDEAE4] overflow-hidden relative group rounded-sm" title={sharedTitle}>
                {selectOverlay(url, uploading)}
                <img
                  src={url}
                  onClick={e => {
                    if (uploading) return
                    e.stopPropagation()
                    // Delay the zoom just long enough to see if a second click follows (double-click = jump to chat instead)
                    handleMediaClickDebounced(() => openLightbox(chatImagesOnly.map(img => img.url), chatImagesOnly.findIndex(img => img.url === url), { editable: true }))
                  }}
                  onDoubleClick={e => { e.stopPropagation(); scrollToChatMessage({ commentId, commentRole, commentChannel }) }}
                  className={`w-full h-full object-contain ${uploading ? '' : 'cursor-zoom-in'}`}
                  alt=""
                />
                {uploading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/20">
                    <span className="w-5 h-5 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                    <span className="text-[8px] font-bold text-white bg-black/40 px-1.5 py-0.5 rounded-full tabular-nums">{uploadPct ?? 0}%</span>
                  </div>
                )}
                {isApproved && <div className="absolute inset-0 ring-2 ring-[#7c3aed] ring-inset rounded-sm pointer-events-none" />}
                {isProductImg && <div className="absolute inset-0 ring-2 ring-[#2D6A1F] ring-inset rounded-sm pointer-events-none" />}
                {label && !uploading && (
                  <span className="absolute bottom-1 left-1 right-1 text-[7px] font-extrabold px-1 py-0.5 uppercase bg-white/90 rounded-sm text-[#1A1A18] truncate text-center pointer-events-none">{label}</span>
                )}
                {!selectMode && ws?.id && !isReadOnly && !uploading && role !== 'supplier' && role !== 'qa' && (
                  <button type="button" title={isApproved ? 'Remove approval' : 'Set as approved product'}
                    onClick={() => pinImage(ws.id, isApproved ? null : url)
                      .then(() => {
                        if (!isApproved) setBriefErrors(s => { const n = new Set(s); n.delete('image_url'); return n })
                        toast?.(isApproved ? 'Brief image removed' : 'Buyer brief image updated')
                      })
                      .catch(err => toast?.(err?.message || 'Failed to update brief image'))}
                    className={`absolute top-1 right-1 transition-opacity w-6 h-6 rounded-full flex items-center justify-center cursor-pointer border
                      ${isApproved
                        ? 'opacity-100 bg-[#7c3aed] border-[#7c3aed] text-white hover:bg-red-500 hover:border-red-500'
                        : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#7c3aed] hover:text-white hover:border-[#7c3aed]'}`}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/>
                    </svg>
                  </button>
                )}

                {selectMode ? null : isSampleStage ? (
                  /* Add as sample image — top-left, merchant only, once in the sample stage */
                  role === 'merchant' && ws?.sampleOrder?.id && !isReadOnly && !uploading && ws?.sampleOrder?.sample_status !== 'dropped' && (
                    <button
                      type="button"
                      disabled={isAddingThis}
                      title={isAlreadySample ? 'Remove from Current Sample' : 'Add as sample image'}
                      onClick={async e => {
                        e.stopPropagation()
                        if (isAddingThis) return
                        setAddingSampleImg(url)
                        try {
                          const existing = ws.sampleOrder?.findings?.sample_images || []
                          const updated  = isAlreadySample ? existing.filter(u => u !== url) : [...existing, url]
                          await saveSampleFindings(ws.sampleOrder.id, ws.id, { sample_images: updated })
                          if (!isAlreadySample) queueSampleScroll(url)
                          toast?.(isAlreadySample ? 'Removed from Current Sample' : 'Added to Current Sample')
                        } catch (err) { toast?.(err?.message || 'Failed to update sample image') }
                        finally { setAddingSampleImg(null) }
                      }}
                      className={`absolute top-1 left-1 w-6 h-6 rounded-full flex items-center justify-center border cursor-pointer transition-all
                        ${isAlreadySample
                          ? 'opacity-100 bg-[#166534] border-[#166534] text-white hover:bg-red-500 hover:border-red-500'
                          : isAddingThis
                            ? 'opacity-100 bg-white/90 border-black text-black'
                            : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#166534] hover:text-white hover:border-[#166534]'}`}
                    >
                      {isAddingThis
                        ? <span className="w-2.5 h-2.5 border border-black border-t-black/70 rounded-full animate-spin" />
                        : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      }
                    </button>
                  )
                ) : (
                  /* Set as Product Info image — top-left, merchant only */
                  role === 'merchant' && sku?.id && !isReadOnly && !uploading && (
                    <button
                      type="button"
                      disabled={isSettingThis}
                      title={isProductImg ? 'Current product image' : 'Set as Product Info image'}
                      onClick={e => {
                        e.stopPropagation()
                        if (isProductImg || isSettingThis) return
                        setSettingProductImg(url)
                        setSkuImageFromUrl(sku.id, url, ws.id)
                          .then(() => toast?.('Product image updated'))
                          .catch(err => toast?.(err?.message || 'Failed to update image'))
                          .finally(() => setSettingProductImg(null))
                      }}
                      className={`absolute top-1 left-1 transition-opacity w-6 h-6 rounded-full flex items-center justify-center cursor-pointer border
                        ${isProductImg
                          ? 'opacity-100 bg-[#2D6A1F] border-[#2D6A1F] text-white cursor-default'
                          : isSettingThis
                            ? 'opacity-100 bg-white/90 border-black text-black'
                            : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#2D6A1F] hover:text-white hover:border-[#2D6A1F]'}`}
                    >
                      {isSettingThis
                        ? <span className="w-2.5 h-2.5 border border-black border-t-black/70 rounded-full animate-spin" />
                        : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                          </svg>
                      }
                    </button>
                  )
                )}
              </div>
              {!uploading && timeCaption && (
                <div className="text-[7px] lg:text-[10px] font-semibold text-black px-0.5 truncate text-center tabular-nums leading-tight">{timeCaption}</div>
              )}
              </div>
            )
          })}
        </div>
        </MonthGroup>
        ))}
        </div>
        )
        })
      })()}

      {hasPreviousSampleImages && (
        <>
          <div className="flex items-center gap-2 mt-3 mb-1.5">
            <div className="flex-1 h-px bg-black/[.08]" />
            <span className="text-[8px] lg:text-[10px] font-bold uppercase tracking-[.1em] text-black flex-shrink-0">Previous Sample {previousSampleImages.length}</span>
            <div className="flex-1 h-px bg-black/[.08]" />
          </div>
          {monthBucketsOf(previousSampleImages).map((_mg, _gi) => (
          <MonthGroup key={_mg.key} label={_mg.label} count={_mg.items.length} defaultOpen={_gi === 0}>
          <div className="grid grid-cols-2 gap-1.5">
            {_mg.items.map(({ url, key, uploadedAt, uploadedBy }) => {
              const isApproved     = url === ws?.buyer_brief?.image_url
              const isProductImg   = url === sku?.image_url
              const isSettingThis  = settingProductImg === url
              return (
                <div key={key} className="flex flex-col gap-0.5 min-w-0">
                <div data-media-url={url} className="aspect-square bg-[#EDEAE4] overflow-hidden relative group rounded-sm">
                  {selectOverlay(url)}
                  <img src={url} onClick={e => { e.stopPropagation(); openLightbox(previousSampleImages.map(img => img.url), previousSampleImages.findIndex(img => img.url === url), { editable: true }) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                  {isApproved    && <div className="absolute inset-0 ring-2 ring-[#7c3aed] ring-inset rounded-sm pointer-events-none" />}
                  {isProductImg  && <div className="absolute inset-0 ring-2 ring-[#2D6A1F] ring-inset rounded-sm pointer-events-none" />}
                  {uploadedBy && (
                    <span className="absolute bottom-1 left-1 right-1 text-[7px] font-extrabold px-1 py-0.5 uppercase bg-white/90 rounded-sm text-[#1A1A18] pointer-events-none truncate text-center">{uploadedBy}</span>
                  )}

                  {/* Pin as brief image — top-right, not for suppliers */}
                  {!selectMode && ws?.id && !isReadOnly && role !== 'supplier' && role !== 'qa' && (
                    <button type="button" title={isApproved ? 'Remove pin' : 'Pin as brief image'}
                      onClick={() => pinImage(ws.id, isApproved ? null : url)
                        .then(() => {
                          if (!isApproved) setBriefErrors(s => { const n = new Set(s); n.delete('image_url'); return n })
                          toast?.(isApproved ? 'Brief image removed' : 'Buyer brief image updated')
                        })
                        .catch(err => toast?.(err?.message || 'Failed to update brief image'))}
                      className={`absolute top-1 right-1 transition-opacity w-6 h-6 rounded-full flex items-center justify-center cursor-pointer border
                        ${isApproved
                          ? 'opacity-100 bg-[#7c3aed] border-[#7c3aed] text-white hover:bg-red-500 hover:border-red-500'
                          : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#7c3aed] hover:text-white hover:border-[#7c3aed]'}`}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/>
                      </svg>
                    </button>
                  )}

                  {/* Set as Product Info image — top-left, merchant only */}
                  {!selectMode && role === 'merchant' && sku?.id && !isReadOnly && (
                    <button
                      type="button"
                      disabled={isSettingThis}
                      title={isProductImg ? 'Current product image' : 'Set as Product Info image'}
                      onClick={e => {
                        e.stopPropagation()
                        if (isProductImg || isSettingThis) return
                        setSettingProductImg(url)
                        setSkuImageFromUrl(sku.id, url, ws.id)
                          .then(() => toast?.('Product image updated'))
                          .catch(err => toast?.(err?.message || 'Failed to update image'))
                          .finally(() => setSettingProductImg(null))
                      }}
                      className={`absolute top-1 left-1 transition-opacity w-6 h-6 rounded-full flex items-center justify-center cursor-pointer border
                        ${isProductImg
                          ? 'opacity-100 bg-[#2D6A1F] border-[#2D6A1F] text-white cursor-default'
                          : isSettingThis
                            ? 'opacity-100 bg-white/90 border-black text-black'
                            : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#2D6A1F] hover:text-white hover:border-[#2D6A1F]'}`}
                    >
                      {isSettingThis
                        ? <span className="w-2.5 h-2.5 border border-black border-t-black/70 rounded-full animate-spin" />
                        : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                          </svg>
                      }
                    </button>
                  )}
                </div>
                {uploadedAt && (
                  <div className="text-[7px] lg:text-[10px] font-semibold text-black px-0.5 truncate text-center tabular-nums leading-tight">{formatActivityDate(uploadedAt)}</div>
                )}
                </div>
              )
            })}
          </div>
          </MonthGroup>
          ))}
        </>
      )}

      {hasSampleImages && (
        <>
          <div className="flex items-center gap-2 mt-3 mb-1.5">
            <div className="flex-1 h-px bg-black/[.08]" />
            <span className="text-[8px] lg:text-[10px] font-bold uppercase tracking-[.1em] text-black flex-shrink-0">Current Sample {sampleImages.length}</span>
            <div className="flex-1 h-px bg-black/[.08]" />
          </div>
          {!ws?.sampleOrder?.findings?.approved_image && (
            <div className="text-[9px] text-black font-medium leading-relaxed mb-1.5 px-0.5">
              Tap the checkmark on a photo below again to set it as the main sample image.
            </div>
          )}
          {monthBucketsOf(sampleImages).map((_mg, _gi) => (
          <MonthGroup key={_mg.key} label={_mg.label} count={_mg.items.length} defaultOpen={_gi === 0}>
          <div className="grid grid-cols-2 gap-1.5">
            {_mg.items.map(({ url, key, uploadedAt, uploadedBy }) => {
              const isApprovedSku = url === ws?.sampleOrder?.findings?.approved_image
              // Re-picking the production image from here (not just the Sample tab
              // grid) saves immediately via saveSampleFindings — there's no separate
              // "Save Findings" step for this one field, so both sides see the change
              // right away without either side needing to resubmit the whole form. Both
              // merchant and buyer can pick it (unlike the measurement fields, which stay
              // merchant-only) since it's just "which photo represents this," not a finding.
              const canPick = !selectMode && (role === 'merchant' || role === 'buyer') && !isReadOnly && ws?.sampleOrder?.sample_status !== 'dropped'
              return (
                <div key={key} className="flex flex-col gap-0.5 min-w-0">
                <div data-media-url={url} data-sample-slot={url} className="aspect-square bg-[#EDEAE4] overflow-hidden relative rounded-sm group">
                  {selectOverlay(url)}
                  <img src={url} onClick={e => { e.stopPropagation(); openLightbox(sampleImages.map(img => img.url), sampleImages.findIndex(img => img.url === url), { editable: true, isSample: true }) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                  {isApprovedSku && <div className="absolute inset-0 ring-2 ring-[#c2410c] ring-inset rounded-sm pointer-events-none" />}
                  {isApprovedSku && (
                    <span className="absolute top-1 right-1 text-[7px] font-extrabold px-1 py-0.5 uppercase bg-[#ffedd5] rounded-sm text-[#c2410c]">Production</span>
                  )}
                  {canPick && (
                    <button
                      title={isApprovedSku ? 'Unset production image' : 'Set as production image'}
                      onClick={async e => {
                        e.stopPropagation()
                        try {
                          await saveSampleFindings(ws.sampleOrder.id, ws.id, { approved_image: isApprovedSku ? null : url })
                        } catch (err) { toast(err.message) }
                      }}
                      className={`absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center border cursor-pointer transition-all
                        ${isApprovedSku
                          ? 'opacity-100 bg-[#c2410c] border-[#c2410c] text-white hover:bg-red-500 hover:border-red-500'
                          : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#c2410c] hover:text-white hover:border-[#c2410c]'}`}
                    >
                      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                  )}
                  {uploadedBy && (
                    <span className="absolute bottom-1 left-1 right-1 text-[7px] font-extrabold px-1 py-0.5 uppercase bg-white/90 rounded-sm text-[#1A1A18] truncate text-center pointer-events-none">{uploadedBy}</span>
                  )}
                </div>
                {uploadedAt && (
                  <div className="text-[7px] lg:text-[10px] font-semibold text-black px-0.5 truncate text-center tabular-nums leading-tight">{formatActivityDate(uploadedAt)}</div>
                )}
                </div>
              )
            })}
          </div>
          </MonthGroup>
          ))}
        </>
      )}
    </>
  )
}

export default function WorkspaceModal() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeSku        = usePlmStore(s => s.activeSku)
  const initialTab       = usePlmStore(s => s.initialTab)
  const activeWorkspace  = usePlmStore(s => s.activeWorkspace)
  const activeWorkspaceId = usePlmStore(s => s.activeWorkspaceId)
  const workspaceLoading = usePlmStore(s => s.workspaceLoading)
  const closeWorkspace   = usePlmStore(s => s.closeWorkspace)
  const sendComment      = usePlmStore(s => s.sendComment)
  const editComment      = usePlmStore(s => s.editComment)
  const sendInvite          = usePlmStore(s => s.sendInvite)
  const addWorkspaceInvite  = usePlmStore(s => s.addWorkspaceInvite)
  const openWorkspace     = usePlmStore(s => s.openWorkspace)
  const pinImage            = usePlmStore(s => s.pinImage)
  const setSkuImageFromUrl  = usePlmStore(s => s.setSkuImageFromUrl)
  const saveReferenceMediaEdit = usePlmStore(s => s.saveReferenceMediaEdit)
  const saveBrief           = usePlmStore(s => s.saveBrief)
  const approveWorkspace      = usePlmStore(s => s.approveWorkspace)
  const requestRevision       = usePlmStore(s => s.requestRevision)
  const acceptSample          = usePlmStore(s => s.acceptSample)
  const updateSampleOrder     = usePlmStore(s => s.updateSampleOrder)
  const setHoldDropStatus     = usePlmStore(s => s.setHoldDropStatus)
  const bulkSetWorkspaceStatus = usePlmStore(s => s.bulkSetWorkspaceStatus)
  const saveSampleFindings    = usePlmStore(s => s.saveSampleFindings)
  const fetchSampleVersions   = usePlmStore(s => s.fetchSampleVersions)
  const uploadSampleImages    = usePlmStore(s => s.uploadSampleImages)
  const uploadInlineImage     = usePlmStore(s => s.uploadInlineImage)
  const deleteInlineImage     = usePlmStore(s => s.deleteInlineImage)
  const updateVendorSkuRef    = usePlmStore(s => s.updateVendorSkuRef)
  const generateVendorSkuRefAction = usePlmStore(s => s.generateVendorSkuRef)
  const revokeInvite          = usePlmStore(s => s.revokeInvite)
  const revealInviteLink      = usePlmStore(s => s.revealInviteLink)
  const setGroupChatMembers   = usePlmStore(s => s.setGroupChatMembers)
  const toast                 = usePlmStore(s => s.toast)
  const orgRole          = (useRole() || 'buyer').toLowerCase()
  const orgDepartment    = useOrgDepartment()
  // A QA-department merchant member never gets full merchant access — org type alone
  // (useRole()) can't tell them apart from merchandising staff, so department overrides here,
  // same as usePLMCatalog.js's catalog-level scoping. Deliberately NOT scoped to "does this
  // specific workspace have my accepted qa invite" — a qa-dept member should never fall back
  // to full 'merchant' access just because they navigated to a workspace some other way (a
  // shared link, etc.); every qa-dept member is always 'qa' everywhere in PLM. The ~35 existing
  // role === 'merchant'/'buyer'/'supplier' allow-gates below all correctly exclude 'qa' for
  // free since none of them match it — only chatTabs and the Media panel need new explicit
  // 'qa' handling (see below).
  const role             = (orgRole === 'merchant' && orgDepartment === 'qa') ? 'qa' : orgRole
  // Only ever read while role === 'merchant' (the QA InviteRow only renders then), so this is
  // safely the merchant's own org — the org a QA invitee must belong to (see backend's
  // emailBelongsToQaDept), never a buyer/supplier org.
  const myOrgId          = useOrgId()
  const masterKeyActive  = usePlmMasterKeyActive()
  const memberId         = useMemberId()
  const profileHeader    = useProfileHeader()
  const buyerOrgs        = useBuyerOrgs()
  const supplierOrgs     = useSupplierOrgs()

  const [text,      setText]      = useState('')
  // When set, the Notes composer is editing an existing rich-text message instead of
  // composing a new one — Send becomes "Save" and targets this comment id via editComment.
  const [editingNote, setEditingNote] = useState(null)  // { id } | null
  const composerRef = useRef(null)
  // Rich-text ("Notes") composer — a separate contentEditable surface, not a controlled React
  // input. Setting innerHTML reactively on every keystroke would fight the browser's own
  // selection/cursor and reset it mid-type, so this is intentionally uncontrolled: format
  // commands run via document.execCommand on whatever's currently selected, and the HTML is
  // only read out (richComposerRef.current.innerHTML) at send time.
  const [richMode, setRichMode] = useState(false)
  // Purely for the Send button's disabled state — contentEditable isn't a controlled input,
  // so there's nothing else tracking whether it currently has any real content.
  const [richHasContent, setRichHasContent] = useState(false)
  // Maximize is purely a CSS/positioning toggle on the SAME wrapper — position:fixed pulls it
  // out of the normal document flow visually without moving it in the React tree, so the
  // contentEditable never unmounts/remounts and its content (which lives in real DOM, not
  // React state) is never at risk of being lost by toggling this.
  const [richMaximized, setRichMaximized] = useState(false)
  // Which formats are active AT THE CURSOR right now — drives the toolbar buttons' pressed/
  // highlighted state, so e.g. Bold visibly stays "on" while the cursor sits inside bold text.
  // Without this there was no way to tell a format had actually been applied short of looking
  // at the text itself.
  const [richActiveFormats, setRichActiveFormats] = useState({})
  // Font/size/color controls remember the LAST value picked, rather than resetting to a blank
  // placeholder after every use — a select showing "Font" right after you just chose "Georgia"
  // reads as if the pick didn't take, even when it did.
  const [richFontFamily, setRichFontFamily] = useState('')
  const [richFontSize, setRichFontSize] = useState('')
  const [richTextColor, setRichTextColor] = useState('#000000')
  const [richHighlightColor, setRichHighlightColor] = useState('#ffff00')
  // Font/size use a custom popover instead of a native <select> — a native select's dropdown
  // is rendered by the OS on mobile (iOS shows a wheel picker, Android a full-screen list),
  // completely outside CSS control, so "show ~5 then scroll" isn't achievable with a real
  // select at all. Only one of these two is ever open at a time.
  const [richOpenMenu, setRichOpenMenu] = useState(null) // 'font' | 'size' | 'case' | 'bulletStyle' | 'bulletSize' | null
  const richFontMenuRef = useRef(null)
  const richSizeMenuRef = useRef(null)
  const richCaseMenuRef = useRef(null)
  const richBulletStyleMenuRef = useRef(null)
  const richBulletSizeMenuRef = useRef(null)
  const richMenuRefs = { font: richFontMenuRef, size: richSizeMenuRef, case: richCaseMenuRef, bulletStyle: richBulletStyleMenuRef, bulletSize: richBulletSizeMenuRef }
  useEffect(() => {
    if (!richOpenMenu) return
    const onDocMouseDown = (e) => {
      const ref = richMenuRefs[richOpenMenu]
      if (ref?.current && !ref.current.contains(e.target)) setRichOpenMenu(null)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
    // richMenuRefs intentionally omitted — it's a plain object literal recreated every render,
    // but its values (the useRef objects themselves) are stable; adding it here would just
    // rebind this listener on every render for no behavioral difference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [richOpenMenu])
  // Inline images uploaded into THIS draft note but not yet sent — kept so they can be
  // deleted from storage if the note is closed/discarded, rather than orphaning the file.
  // Cleared (without deleting) once the note is actually sent, since the images are then
  // genuinely part of a saved message.
  const [richInlineImagePaths, setRichInlineImagePaths] = useState([])
  const [uploadingInlineImage, setUploadingInlineImage] = useState(false)
  // Set true while the user is dragging an already-inserted <img> WITHIN the note to reposition
  // it — the composer's outer wrapper has its own onDrop (for external files/Reference Media
  // drags), which would otherwise catch this same bubbled drop event, block the browser's
  // native "move this node here" behavior, and re-attach the dragged image as a brand-new
  // attachment instead of letting it move.
  const richInternalDragRef = useRef(false)
  const richComposerRef = useRef(null)
  const [replyTo,   setReplyTo]   = useState(null)
  const [tabState,  setTabState]  = useState({ wsId: null, tab: 'details' })
  // QA's tab list is Group Chat only — defaulting to 'buyer' left them on a tab that doesn't exist for them.
  const [chatTab,   setChatTab]   = useState(() => role === 'qa' ? 'group' : 'buyer')
  // Tabs the viewer has actually switched to during this open — their unread badge (below)
  // clears the moment they land on it, same as Slack/WhatsApp marking a thread read on open
  // rather than requiring a full scroll-through. Reset per-workspace so re-opening later
  // (a fresh set of is_unread flags on that workspace's own comments) starts every tab unread again.
  const [viewedTabs, setViewedTabs] = useState(() => new Set())
  // Separate from viewedTabs (which clears a tab's badge the instant you switch to it) — the
  // in-thread "New messages" divider is meant to stay visible until you've actually scrolled
  // all the way down to the latest message in that tab, not just glanced at the tab.
  const [dividerDismissedTabs, setDividerDismissedTabs] = useState(() => new Set())
  const [groupPickerOpen, setGroupPickerOpen] = useState(false)
  const [pendingMemberToggle, setPendingMemberToggle] = useState(null) // { id, name, adding } | null
  const [savingGroupMembers, setSavingGroupMembers] = useState(false)
  const [leftWidth, setLeftWidth] = useState(620)
  // Media panel is user-resizable (drag its left edge) and the last width is remembered
  // per browser. Wider default than before so the Pinned tiles aren't clipped.
  const [mediaWidth, setMediaWidth] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem('plm.ws.mediaWidth'), 10)
      if (v >= MEDIA_W_MIN && v <= MEDIA_W_MAX) return v
    } catch { /* private mode / blocked storage — fall through to default */ }
    return MEDIA_W_DEFAULT
  })
  const mediaDragRef = useRef({ active: false, startX: 0, startW: 0, latest: 0 })
  const [brief, setBrief] = useState({
    buyer_ref: '', description: '', material: '', weight: '', dimensions: '',
    finish: '', color: '', unit_price: '', currency: 'USD', unit_qty: '', notes: '',
  })
  const [notesEditing, setNotesEditing] = useState(false)
  // Read-only note rendering defaults to a compact chip (thumbnail + text) so a note with an
  // inline image doesn't push the Save Brief button down the panel; expanding shows the full
  // formatted note (images at full width, lists, etc). Resets to collapsed whenever the note
  // content itself changes (new SKU/workspace, or a fresh save) rather than staying stuck open.
  const [notesExpanded, setNotesExpanded] = useState(false)
  const descriptionRef = useRef(null)
  // Pristine snapshot of brief as-loaded — lets handleSaveBrief send only the fields this
  // user actually edited, instead of the whole object (which would silently clobber another
  // concurrent editor's already-saved changes to fields this user never touched).
  const originalBriefRef = useRef({})
  // Tracks which workspace the brief was last seeded for, so a live buyer_brief change on
  // the SAME workspace (e.g. pinning an image, which patches only image_url) can be told
  // apart from actually switching to a different workspace/SKU.
  const briefSeededForRef = useRef(null)
  // What's actually persisted in buyer_brief right now (no catalog-attribute fallback) —
  // handleSaveBrief diffs against this, not originalBriefRef (which includes the fallback
  // and is only for the pin-image/live-update merge logic above).
  const savedBriefRef = useRef({})
  const [editingVendorRef, setEditingVendorRef] = useState(false)
  const [vendorSkuRef,     setVendorSkuRef]     = useState('')
  const [savingVendorRef,  setSavingVendorRef]  = useState(false)
  const [generatingVendorRef, setGeneratingVendorRef] = useState(false)
  const [savingBrief,    setSavingBrief]    = useState(false)
  const [generatingRef,  setGeneratingRef]  = useState(false)
  const [briefErrors, setBriefErrors] = useState(new Set())
  const [pendingFiles, setPendingFiles] = useState([])
  const [chatDragActive, setChatDragActive] = useState(false)
  const [sampleReadyDate,     setSampleReadyDate]     = useState('')
  const [sampleNotes,         setSampleNotes]         = useState('')
  const [savingSampleNotes,   setSavingSampleNotes]   = useState(false)
  const [qaComments,          setQaComments]          = useState('')
  const [savingQaComments,    setSavingQaComments]    = useState(false)
  const [shipping,          setShipping]          = useState({})
  const [savingShipping,    setSavingShipping]    = useState(false)
  const [statusBarCollapsed,  setStatusBarCollapsed]  = useState(false)
  const [sampleVersions,      setSampleVersions]      = useState([])   // past dropped/rejected rounds, for "View Previous Findings"
  const [selectedVersionId,   setSelectedVersionId]   = useState('')   // '' = current round
  const [revisionNote,        setRevisionNote]        = useState('')
  const [showRevisionInput,   setShowRevisionInput]   = useState(false)
  const [submittingRevision,  setSubmittingRevision]  = useState(false)
  const [acceptingWs,         setAcceptingWs]         = useState(false)
  const [showSamplePO,        setShowSamplePO]        = useState(false)
  const [findings,          setFindings]          = useState({})
  // Pristine snapshot of findings as-loaded — same purpose as originalBriefRef: lets
  // handleSaveFindings send only the sub-fields actually edited, not the whole object.
  const originalFindingsRef = useRef({})
  const [savingFindings,    setSavingFindings]    = useState(false)
  const [uploadingImages,   setUploadingImages]   = useState(false)
  const [dimUnit,           setDimUnit]           = useState('cm')
  const [weightUnit,        setWeightUnit]        = useState('kg')
  const findingsImageRef  = useRef(null)
  const findingsFolderRef = useRef(null)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [approveQty,       setApproveQty]       = useState('')
  const [approvePrice,     setApprovePrice]     = useState('')
  const [approvingWs,      setApprovingWs]      = useState(false)
  const [holdDropAction,   setHoldDropAction]   = useState(null)  // { status, note }
  const [submittingHoldDrop, setSubmittingHoldDrop] = useState(false)
  const [wsHoldRejectAction,      setWsHoldRejectAction]      = useState(null)  // { status: 'on_hold'|'rejected'|'active', note? }
  const [submittingWsHoldReject,  setSubmittingWsHoldReject]  = useState(false)
  const [lightbox, setLightbox] = useState(null)  // { images: string[], index: number, editable?: boolean } | null
  const [editingRefImage, setEditingRefImage] = useState(null) // { url } | null — reference-media image currently open in ImageEditorModal
  const [settingProductImg, setSettingProductImg] = useState(null) // URL currently being uploaded as product image
  const [addingSampleImg,   setAddingSampleImg]   = useState(null) // URL currently being added to Current Sample from reference media
  const [showStageHint, setShowStageHint] = useState(false) // manual toggle for the stage-info tooltip, for touch devices without hover
  const [lbZoom,   setLbZoom]   = useState(1)
  const [lbPan,    setLbPan]    = useState({ x: 0, y: 0 })
  const lbDragRef  = useRef(null) // { startX, startY, panX, panY, moved }
  const lbHoldRef  = useRef(null) // interval id for hold-to-zoom
  const threadRef  = useRef(null)
  const fileRef    = useRef(null)
  const dragRef    = useRef({ active: false, startX: 0, startW: 0 })
  const [pendingScrollId, setPendingScrollId] = useState(null) // comment id to scroll the chat thread to once its tab is visible
  const scrolledIdRef = useRef(null) // last id the scroll effect below already handled — avoids re-running via setState-in-effect
  const unreadJumpCheckedRef = useRef(null) // ws.id this open's initial unread-jump check already ran for — avoids re-scrolling on every re-render
  const prevCommentsLenRef = useRef(0) // last comments.length the scroll effect below actually acted on — lets it tell "genuinely new message" apart from "re-ran for an unrelated reason"
  const scrollDismissArmedRef = useRef(false) // false during a jump-to-unread's own smooth-scroll settle window, so its intermediate scroll events can't prematurely dismiss the divider
  const mediaClickTimerRef = useRef(null) // discriminates single-click (zoom) from double-click (jump to chat) on reference-media thumbnails
  const sampleScrollTimerRef = useRef(null) // debounces the "jump to what I just added" scroll below

  // Single-vs-double-click debounce for reference-media thumbnails, shared by both the
  // "jump to chat" file tile and image tile below. Defined here (top-level, via useCallback)
  // rather than inline inside the deeply-nested Media panel JSX so the ref read/write happens
  // in a plainly-recognized event-handler callback, not buried inside nested render closures.
  const handleMediaClickDebounced = useCallback((action) => {
    if (mediaClickTimerRef.current) {
      clearTimeout(mediaClickTimerRef.current)
      mediaClickTimerRef.current = null
      return
    }
    mediaClickTimerRef.current = setTimeout(() => {
      action()
      mediaClickTimerRef.current = null
    }, 220)
  }, [])

  // After ticking a photo into Current Sample, wait to see if another add follows right
  // behind it (people often tick several in a row) and only then scroll to it — so the view
  // doesn't jump mid-selection. Each new add pushes the timer back out, so it only fires 5s
  // after the LAST addition in a burst. Same top-level-useCallback reasoning as
  // handleMediaClickDebounced above — keeps the ref access out of nested render closures.
  const queueSampleScroll = useCallback((url) => {
    if (sampleScrollTimerRef.current) clearTimeout(sampleScrollTimerRef.current)
    sampleScrollTimerRef.current = setTimeout(() => {
      const el = document.querySelector(`[data-sample-slot="${url}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('ring-2', 'ring-[#c2410c]/50')
        setTimeout(() => el.classList.remove('ring-2', 'ring-[#c2410c]/50'), 1500)
      }
      sampleScrollTimerRef.current = null
    }, 5000)
  }, [])

  // Below this width the 3-pane grid (details / activity / media) can't fit side by side —
  // stack into a single pane switched by a tab bar instead (tablets, small laptops).
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024)
  const [mobilePanel, setMobilePanel] = useState('details') // 'details' | 'activity' | 'media' — only used when isNarrow
  // Phone-only: below this width even a single stacked pane is too tight for the SKU Details
  // image-beside-fields layout, so it stacks further. Tablets (≥640px) keep the side-by-side
  // layout, which already fit fine there.
  const [isPhone, setIsPhone] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const onChange = (e) => setIsNarrow(e.matches)
    mq.addEventListener('change', onChange)
    const mqP = window.matchMedia('(max-width: 639px)')
    const onChangeP = (e) => setIsPhone(e.matches)
    mqP.addEventListener('change', onChangeP)
    return () => { mq.removeEventListener('change', onChange); mqP.removeEventListener('change', onChangeP) }
  }, [])

  // Auto-shrink the modal on smaller desktop screens so it doesn't feel over-zoomed at 100%.
  const [wsScale, setWsScale] = useState(computeWorkspaceScale)
  useEffect(() => {
    const onResize = () => setWsScale(computeWorkspaceScale())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onDragStart = (e) => {
    dragRef.current = { active: true, startX: e.clientX, startW: leftWidth }
    const onMove = (e) => {
      if (!dragRef.current.active) return
      const delta = e.clientX - dragRef.current.startX
      setLeftWidth(Math.min(750, Math.max(500, dragRef.current.startW + delta)))
    }
    const onUp = () => {
      dragRef.current.active = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Media panel resize — handle sits on the panel's LEFT edge, so dragging left (negative
  // delta) widens it. Persisted on mouse-up so it survives reopen / reload.
  const onMediaDragStart = (e) => {
    mediaDragRef.current = { active: true, startX: e.clientX, startW: mediaWidth, latest: mediaWidth }
    const onMove = (ev) => {
      if (!mediaDragRef.current.active) return
      const delta = ev.clientX - mediaDragRef.current.startX
      const next = Math.min(MEDIA_W_MAX, Math.max(MEDIA_W_MIN, mediaDragRef.current.startW - delta))
      mediaDragRef.current.latest = next
      setMediaWidth(next)
    }
    const onUp = () => {
      mediaDragRef.current.active = false
      try { localStorage.setItem('plm.ws.mediaWidth', String(mediaDragRef.current.latest)) } catch { /* storage blocked */ }
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleShareImage = () => shareImages(lightbox?.images?.[lightbox.index], toast)
  const handleShareAllImages = () => shareImages(lightbox?.images, toast)

  const clampZoom = z => Math.min(5, Math.max(0.1, Math.round(z * 100) / 100))
  const openLightbox = (images, index = 0, { editable = false, isSample = false } = {}) => {
    setLightbox({ images: Array.isArray(images) ? images.filter(Boolean) : [images].filter(Boolean), index, editable, isSample })
    setLbZoom(1)
    setLbPan({ x: 0, y: 0 })
  }

  // Jumps to an image tile in the Reference Media panel by URL (each tile carries
  // data-media-url). Returns whether it was found — used by activity-comment thumbnails
  // to fall back to a toast when the URL no longer lives anywhere (e.g. it was overwritten
  // in-place by a "replace" edit, so only the milestone comment still has that old URL).
  const scrollToMediaItem = (url) => {
    if (!url) return false
    const el = document.querySelector(`[data-media-url="${url}"]`)
    if (!el) return false
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-[#7c3aed]/40')
    setTimeout(() => el.classList.remove('ring-2', 'ring-[#7c3aed]/40'), 1200)
    return true
  }

  useEffect(() => {
    if (!lightbox) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [!!lightbox])

  useEffect(() => {
    if (!lightbox) return
    const handler = (e) => {
      if (e.key === 'Escape') { setLightbox(null); setLbZoom(1); setLbPan({ x: 0, y: 0 }) }
      if (e.key === 'ArrowRight') { setLightbox(l => l ? { ...l, index: (l.index + 1) % l.images.length } : l); setLbZoom(1); setLbPan({ x: 0, y: 0 }) }
      if (e.key === 'ArrowLeft')  { setLightbox(l => l ? { ...l, index: (l.index - 1 + l.images.length) % l.images.length } : l); setLbZoom(1); setLbPan({ x: 0, y: 0 }) }
      if (e.key === 'ArrowUp')    { e.preventDefault(); setLbZoom(z => clampZoom(z + 0.05)) }
      if (e.key === 'ArrowDown')  { e.preventDefault(); setLbZoom(z => { const n = clampZoom(z - 0.05); if (n <= 1) setLbPan({ x: 0, y: 0 }); return n }) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightbox])

  // Double-clicking a reference-media thumbnail jumps the chat thread to the message
  // it was shared in — switch tabs first (merchants see buyer/vendor tabs separately),
  // then scroll once that comment is actually in the DOM.
  const scrollToChatMessage = ({ commentId, commentRole, commentChannel }) => {
    if (!commentId) return
    const targetTab = commentChannel === 'group' ? 'group'
      : commentRole === 'buyer' ? 'buyer'
      : commentRole === 'supplier' ? 'vendor'
      : (commentChannel === 'vendor' || commentChannel === 'supplier') ? 'vendor' : 'buyer'
    setChatTab(targetTab)
    setPendingScrollId(commentId)
    // Landing here — whether via this jump or the unread auto-scroll below — counts as
    // reading that tab, clearing its unread badge.
    setViewedTabs(prev => prev.has(targetTab) ? prev : new Set(prev).add(targetTab))
  }

  useEffect(() => {
    if (!pendingScrollId || scrolledIdRef.current === pendingScrollId) return
    const el = document.getElementById(`comment-${pendingScrollId}`)
    if (!el) return
    scrolledIdRef.current = pendingScrollId
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-[#7c3aed]/40')
    setTimeout(() => el.classList.remove('ring-2', 'ring-[#7c3aed]/40'), 1200)
  }, [pendingScrollId, chatTab])

  const ws  = activeWorkspace
  const sku = activeSku
  const isReadOnly = sku?.is_read_only === true

  // Draft persistence — closing the workspace, refreshing, or losing connectivity mid-note
  // must NOT lose what could be a lot of typed work, so every edit is mirrored to localStorage
  // (keyed per workspace+channel) rather than living only in the DOM/React state. Explicitly
  // turning notes off via the notebook button is the one thing that still discards it (see
  // handleToggleRichMode) — that's a deliberate "throw this away", not an accident.
  const richDraftKey = ws?.id && chatTab ? `plm-note-draft:${ws.id}:${chatTab}` : null
  // `overrides` lets a caller pass just-updated values explicitly — React state updates are
  // async, so e.g. calling this right after setRichFontFamily(newFont) would otherwise still
  // see the stale pre-update value from this render's closure. Persists the toolbar's font/
  // size/color picks too, not just the note content — otherwise the text itself restores
  // correctly on reopen (it's baked into the saved HTML) but the toolbar's own "currently
  // selected" indicators reset to defaults, since those are separate state nothing else reads.
  const saveRichDraft = (overrides = {}) => {
    // While editing an existing note the composer holds that note's content, not a
    // new-message draft — persisting it here would resurrect it as a phantom draft (and
    // reopen Notes) after the edit is saved. See handleEditNote / the restore effect below.
    if (!richDraftKey || editingNote) return
    try {
      const html = richComposerRef.current?.innerHTML || ''
      if (!html || html === '<br>') { localStorage.removeItem(richDraftKey); return }
      localStorage.setItem(richDraftKey, JSON.stringify({
        html,
        imagePaths: overrides.imagePaths ?? richInlineImagePaths,
        fontFamily: overrides.fontFamily ?? richFontFamily,
        fontSize: overrides.fontSize ?? richFontSize,
        textColor: overrides.textColor ?? richTextColor,
        highlightColor: overrides.highlightColor ?? richHighlightColor,
      }))
    } catch { /* localStorage unavailable (private browsing) or quota exceeded — draft just won't survive, not fatal */ }
  }
  // Checks for a saved draft whenever the workspace/channel is resolved — NOT gated on notes
  // already being open. richMode resets to false on every fresh mount (reopening a workspace,
  // or a page refresh), so gating this on richMode meant a real saved draft would sit in
  // localStorage correctly, but nothing ever looked for it — the panel just stayed closed and
  // it read as "lost" even though the data was fine. If a draft exists, this now reopens notes
  // automatically to show it; if notes is already open and switching workspace/tab lands on
  // one with no draft, it just clears the box (same as before).
  useEffect(() => {
    // Never touch the composer while an in-place note edit is in progress — its content is
    // the note being edited, not a draft to restore/clear.
    if (!richDraftKey || editingNote) return
    let draft = null
    try { draft = JSON.parse(localStorage.getItem(richDraftKey) || 'null') } catch { /* ignored */ }
    if (!draft && !richMode) return
    if (richComposerRef.current) richComposerRef.current.innerHTML = draft?.html || ''
    setRichInlineImagePaths(draft?.imagePaths || [])
    setRichHasContent(!!richComposerRef.current?.textContent?.trim())
    setRichActiveFormats({})
    setRichFontFamily(draft?.fontFamily || '')
    setRichFontSize(draft?.fontSize || '')
    setRichTextColor(draft?.textColor || '#000000')
    setRichHighlightColor(draft?.highlightColor || '#ffff00')
    if (draft) setRichMode(true)
  }, [richDraftKey, richMode, editingNote])

  // PLM Super Admin console grant (npd2_workspace_permissions) — additive on top of the
  // existing role/is_read_only model: a member with no grant here behaves exactly as
  // before; a grant only ever unlocks comment/edit, never removes access.
  const [myCapability, setMyCapability] = useState(null)
  useEffect(() => {
    if (!ws?.id || !memberId) { setMyCapability(null); return }
    let cancelled = false
    supabase.from('npd2_workspace_permissions').select('capability')
      .eq('workspace_id', ws.id).eq('member_id', memberId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setMyCapability(data?.capability || null) })
    return () => { cancelled = true }
  }, [ws?.id, memberId])
  const hasCommentGrant = myCapability === 'comment' || myCapability === 'edit'
  const hasEditGrant = myCapability === 'edit'
  const supplierOrgDomain = supplierOrgs.find(o => o.id === (ws?.supplier_org_id || sku?.supplier_org_id))?.domain || null
  const buyerOrgId       = ws?.buyer_org_id || sku?.upload_buyer_org_id || null
  const buyerOrgDomain   = buyerOrgs.find(o => o.id === buyerOrgId)?.domain || null

  // Keep the URL's `workspace` param in sync so a page refresh reopens the
  // same workspace instead of dropping back to the SKU grid (usePLMCatalog
  // restores from this param on mount). Skip the sync entirely while a
  // workspace fetch is in flight — activeWorkspace is null during that
  // window even though activeWorkspaceId is already set, so acting on it
  // would strip the param before the fetch has a chance to finish.
  useEffect(() => {
    if (workspaceLoading) return
    const current = searchParams.get('workspace')
    if (ws?.id) {
      if (current !== ws.id) {
        const p = new URLSearchParams(searchParams)
        p.set('workspace', ws.id)
        // Push (not replace) only for the "grid -> workspace" transition (current was empty)
        // — that's the one step the phone/browser back button needs an actual history entry
        // for, so it lands back on the bare grid instead of skipping straight past it to
        // wherever the tab was before /plm entirely (e.g. the dashboard) — replace never
        // leaves anything for back to land on. Switching directly from one open workspace to
        // another still replaces, so casually browsing SKU cards doesn't pile up a long chain
        // of entries to back out of.
        setSearchParams(p, { replace: !!current })
      }
    } else if (current && !activeWorkspaceId) {
      const p = new URLSearchParams(searchParams)
      p.delete('workspace')
      setSearchParams(p, { replace: true })
    }
  }, [ws?.id, workspaceLoading, activeWorkspaceId])

  // Tracks whether the URL has been OBSERVED (in a committed render) to actually carry this
  // workspace's id — only flips true once the push effect's setSearchParams call above has
  // really landed. This is deliberately not derived inline (e.g. `current === ws?.id`) because
  // the close-effect below needs to distinguish two states that otherwise look identical for
  // one render: "the URL never had this workspace yet, the push above just hasn't landed" vs.
  // "the URL used to have it and a physical back navigation just cleared it". A ref that only
  // ever gets set from an effect (never read-and-written in the same pass as the push) can't
  // observe its own effect's not-yet-committed update, so it can only be true once a separate,
  // later commit actually saw the synced URL.
  const urlSyncedWithWsRef = useRef(false)
  useEffect(() => {
    if (ws?.id && searchParams.get('workspace') === ws.id) urlSyncedWithWsRef.current = true
    else if (!ws?.id) urlSyncedWithWsRef.current = false
  }, [ws?.id, searchParams])

  // This is what actually closes the workspace's own UI/state to match the URL when the
  // `workspace` param disappears because the user physically pressed the phone/browser back
  // button (a POP navigation the app didn't initiate), rather than only via the in-app
  // Back/close controls — those already clear the store state AND the URL together in one go,
  // so by the time they'd re-run this, activeWorkspaceId is already null and this is a no-op.
  //
  // The urlSyncedWithWsRef check above is load-bearing: without it, this effect can't tell
  // "the user pressed back" apart from "we just opened a workspace and the push-history effect
  // above hasn't landed its setSearchParams yet" — both look identical for one render:
  // workspaceLoading just went false, activeWorkspaceId is set, and searchParams still has no
  // `workspace` param. Without the ref, this effect would race the push effect on every single
  // open, misreading "not synced yet" as "back was pressed" and calling closeWorkspace() —
  // which nulls activeWorkspaceId right before usePLMCatalog's `?workspace=` effect reads it,
  // so that effect's staleness guard fails and it reopens the very workspace that was just
  // wrongly closed. That's the open → spinner → content → spinner-again loop seen on mobile.
  useEffect(() => {
    if (workspaceLoading) return
    if (!urlSyncedWithWsRef.current) return
    if (!searchParams.get('workspace') && activeWorkspaceId) {
      closeWorkspace()
    }
  }, [searchParams, workspaceLoading, activeWorkspaceId, closeWorkspace])

  useEffect(() => {
    if (!ws) return
    const saved = ws.buyer_brief || {}
    // Helper: use saved value if present, otherwise fall back to SKU attribute
    const fill = (savedVal, skuVal) => savedVal?.toString().trim() ? savedVal : (skuVal?.toString().trim() || '')
    // Legacy free-text `dimensions` column is rarely populated (Edit Attributes
    // only writes length/width/height/measurement) — try it first, then fall
    // back to computing L × W × H so edits made in Edit Attributes still prefill.
    const l = sku?.length || ws?.length
    const w = sku?.width  || ws?.width
    const h = sku?.height || ws?.height
    const unit = sku?.measurement || ws?.measurement || 'cm'
    const computedDims = [l, w, h].filter(Boolean).length ? `${l || '?'} × ${w || '?'} × ${h || '?'} ${unit}` : ''
    // Rich SKU note (npd2_catalog_skus.notes) — surfaced in the brief even before a workspace
    // exists (the backend copies it into buyer_brief.notes when the workspace is created).
    const skuNoteHtml = typeof sku?.notes === 'string' ? sku.notes : (sku?.notes?.html || '')
    const seeded = {
      buyer_ref:     ws.buyer_ref || '',
      description:   fill(saved.description,   sku?.description  || ws.description),
      material:      fill(saved.material,       sku?.material     || ws.material),
      finish:        fill(saved.finish,         sku?.finish       || ws.finish),
      weight:        fill(saved.weight,         sku?.weight       || ws?.weight),
      dimensions:    fill(saved.dimensions,     (sku?.dimensions || ws.dimensions) || computedDims),
      unit_price:    saved.unit_price    || '',
      currency:      saved.currency      || 'USD',
      unit_qty:      saved.unit_qty      || '',
      notes:         saved.notes ?? saved.quality_notes ?? skuNoteHtml ?? '',   // 'quality_notes' = pre-rename key; fall back to the SKU note pre-workspace
      color:         saved.color         || '',
    }
    // Same shape as `seeded` but WITHOUT the catalog-attribute fallback for
    // description/material/finish/weight/dimensions — i.e. what's actually persisted in
    // buyer_brief right now. handleSaveBrief diffs against this (not `seeded`) so a field
    // that's only showing because of the fallback still gets captured on the next real save,
    // instead of looking "filled" in this modal forever while staying null in the database
    // (and therefore blank on the SKU card, which has no such fallback).
    savedBriefRef.current = {
      buyer_ref:     ws.buyer_ref || '',
      description:   saved.description   || '',
      material:      saved.material      || '',
      finish:        saved.finish        || '',
      weight:        saved.weight        || '',
      dimensions:    saved.dimensions    || '',
      unit_price:    saved.unit_price    || '',
      currency:      saved.currency      || 'USD',
      unit_qty:      saved.unit_qty      || '',
      notes:         saved.notes ?? saved.quality_notes ?? '',
      color:         saved.color         || '',
    }
    // Switching workspace/SKU: always take the fresh seed. Staying on the same workspace
    // (this effect re-firing only because buyer_brief changed — e.g. pinning an image, which
    // patches just image_url, or a co-buyer saving a field this user never touched): keep
    // whatever this user has typed but not yet saved, and only refresh fields they haven't
    // touched — one field changing shouldn't blow away another field's unsaved edit.
    if (briefSeededForRef.current === ws.id) {
      const prevOriginal = originalBriefRef.current
      setBrief(prev => {
        const merged = {}
        for (const key of Object.keys(seeded)) {
          const isDirty = prev[key] !== prevOriginal[key]
          merged[key] = isDirty ? prev[key] : seeded[key]
        }
        return merged
      })
    } else {
      setBrief(seeded)
      setNotesExpanded(false)
    }
    briefSeededForRef.current = ws.id
    originalBriefRef.current = seeded
  }, [ws?.id, ws?.buyer_brief, ws?.buyer_ref])

  useEffect(() => {
    setVendorSkuRef(sku?.vendor_sku_ref || '')
  }, [sku?.id, sku?.vendor_sku_ref])

  // For merchants: when a SKU is opened via card click (no workspace yet),
  // auto-load the most recent workspace for that SKU if one exists
  const defaultTabForStatus = (status) => {
    // 'sample'/'sample_shipped'/'production' only happens once the buyer has actually
    // accepted — at that point the Shipping tab is the one that matters, since sampling
    // itself is done.
    if (['sample', 'sample_shipped', 'production'].includes(status)) return 'shipping'
    if (status === 'approved') return 'sample'
    // Product Info + Buyer Brief are one 'details' tab now — nothing lands on a separate one.
    return 'details'
  }
  const activeTab = (() => {
    const raw = tabState.wsId === (ws?.id ?? sku?.workspace_id)
      ? tabState.tab
      : defaultTabForStatus(ws?.status ?? sku?.workspace_status)
    // Normalize any pre-merge value still sitting in state.
    return raw === 'product' || raw === 'buyer' ? 'details' : raw
  })()
  const setActiveTab = (tab) => setTabState({ wsId: ws?.id ?? sku?.workspace_id, tab })

  // Summary Mode's "Open" button sets initialTab (e.g. 'shipping') so it lands directly on
  // the relevant tab instead of wherever defaultTabForStatus would otherwise pick. Applied
  // once per open — cleared right after so a later plain card-click open isn't affected.
  useEffect(() => {
    if (!initialTab || !(sku?.workspace_id || ws?.id)) return
    setTabState({ wsId: ws?.id ?? sku.workspace_id, tab: initialTab })
    usePlmStore.setState({ initialTab: null }, false, 'plm/clearInitialTab')
  }, [initialTab, sku?.workspace_id, ws?.id])

  // Description textarea auto-grows to fit its content — otherwise long text (especially
  // long unbroken strings) gets scroll-cropped inside the fixed rows={2} box. Re-runs when
  // switching into the buyer tab too, since the textarea is unmounted while on other tabs.
  useLayoutEffect(() => {
    const el = descriptionRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [brief.description, activeTab])

  // Auto-switch tab on status transitions (invited→active→approved etc.)
  useEffect(() => {
    if (!ws?.id || !ws?.status) return
    // Once the buyer has accepted (sample/production), the shipping tab is the actually
    // relevant one to land on. 'approved' (pre-accept) still goes to Sample, since that's
    // where the merchant fills in findings/shares images for review.
    const next = ['sample', 'sample_shipped', 'production'].includes(ws.status) ? 'shipping'
      : ws.status === 'approved' ? 'sample'
      : ws.status === 'active' ? 'details' : null
    if (!next) return
    setTabState(prev => {
      if (prev.wsId !== ws.id || prev.tab === next) return prev
      return { wsId: ws.id, tab: next }
    })
  }, [ws?.status, ws?.id])

  useEffect(() => {
    setSampleReadyDate(ws?.sampleOrder?.target_ready_date?.slice(0, 10) || '')
    setSampleNotes(ws?.sampleOrder?.additional_notes || '')
    setQaComments(ws?.sampleOrder?.qa_comments || '')
    const rawFindings = ws?.sampleOrder?.findings || {}
    // Only synthesize master_cartons from old flat fields when real data actually exists —
    // never inject a blank placeholder array into a brand-new/empty sample order's findings.
    // The visibility gate below (line ~3621, "Findings shown when ready/dropped/has data")
    // checks Object.keys(findings).some(...) to decide whether ANYTHING has been entered yet;
    // a blank master_cartons array is still a truthy value, so seeding one unconditionally
    // made that check always true and showed the findings section immediately for every
    // sample, before Ready — the render path already falls back to a blank single row via
    // deriveMasterCartons(viewFindings) purely for display, so nothing here needs to.
    const seededFindings = (Array.isArray(rawFindings.master_cartons) && rawFindings.master_cartons.length) || rawFindings.master_l || rawFindings.master_w || rawFindings.master_h || rawFindings.master_qty || rawFindings.master_pack_weight_kg
      ? { ...rawFindings, master_cartons: deriveMasterCartons(rawFindings) }
      : rawFindings
    setFindings(seededFindings)
    originalFindingsRef.current = seededFindings
    setShipping({
      ship_mode:       ws?.sampleOrder?.ship_mode       || '',
      courier_company: ws?.sampleOrder?.courier_company || '',
      tracking_ref:    ws?.sampleOrder?.tracking_ref    || '',
      etd:             ws?.sampleOrder?.etd?.slice(0, 10) || '',
      eta:             ws?.sampleOrder?.eta?.slice(0, 10) || '',
      container_no:    ws?.sampleOrder?.container_no    || '',
      vessel_no:       ws?.sampleOrder?.vessel_no       || '',
    })
  }, [ws?.sampleOrder])

  useEffect(() => {
    setSelectedVersionId('')
    setSampleVersions([])
    if (!ws?.id || !ws?.sampleOrder?.id) return
    fetchSampleVersions(ws.id).then(setSampleVersions).catch(() => {})
    // ws?.status is included so a realtime workspace_status broadcast (e.g. the other
    // party clicking "Reopen Brief") re-fetches versions here too — reopening a brief
    // reuses the same sample order id, so that dependency alone never changes, and
    // without this the receiving side only picked up the new round after a full refresh.
  }, [ws?.id, ws?.sampleOrder?.id, ws?.status, fetchSampleVersions])

  // Total CBM across every master carton — a product split across N cartons (each its own
  // L×W×H, since they don't have to be the same size) sums to one combined figure rather
  // than each carton showing its own CBM. Findings L/W/H are always stored in centimeters
  // regardless of the CM/IN display toggle (dimUnit) — the toggle only converts what's shown
  // in the input, toCm() always converts back before the value ever reaches findings — so the
  // divisor must always be the cm³→m³ factor. It used to key off sku?.measurement/ws?.measurement,
  // which is the catalog SKU's own spec-sheet unit (unrelated to how findings are entered) and
  // would silently inflate CBM by ~16.4x for any SKU whose spec happened to be recorded in inches.
  useEffect(() => {
    const cartons = findings.master_cartons || []
    let total = 0
    let hasAny = false
    for (const c of cartons) {
      const l = parseFloat(c?.l), w = parseFloat(c?.w), h = parseFloat(c?.h), qty = parseFloat(c?.qty) || 1
      if (!l || !w || !h) continue
      hasAny = true
      total += (l * w * h * qty) / 1_000_000
    }
    if (!hasAny) return
    setFindings(f => ({ ...f, cbm: total.toFixed(4) }))
  }, [findings.master_cartons])

  useEffect(() => {
    if (!sku?.id || ws || workspaceLoading || role !== 'merchant') return
    supabase
      .from('npd2_workspaces')
      .select('id')
      .eq('catalog_sku_id', sku.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data?.id) openWorkspace(data.id, sku, { silent: true }) })
  }, [sku?.id])

  const displayName = sku?.description || ws?.description || ws?.auto_code || sku?.auto_code || 'Product'
  const autoCode    = sku?.auto_code   || ws?.auto_code   || 'Workspace'
  const category    = sku?.category   || ws?.category    || null
  const season      = sku?.season     || ws?.season      || null

  const comments = ws?.npd_comments || []
  // Rough total for the Media panel badge — reference media (spec/edited/previous-sample all
  // live in this one array), every chat attachment (images and files, both show as tiles there),
  // and the current round's sample images. Approximate, not a mirror of MediaPanelContent's
  // exact per-section filtering, but close enough for a count badge.
  const mediaCount = (ws?.reference_media?.length || 0)
    + comments.reduce((n, cm) => n + (cm.attachments?.length || 0), 0)
    + comments.reduce((n, cm) => n + (cm.metadata?.format === 'html' && cm.body ? (cm.body.match(/<img\b/g) || []).length : 0), 0)
    + (ws?.sampleOrder?.findings?.sample_images?.length || 0)
  const isSystemComment = c => c.type === 'milestone' || c.type === 'field_change' || c.type === 'spec_summary'
  // A video call isn't buyer- or vendor- or group-specific — whoever's in the workspace can be
  // in it. The backend logs the start/end milestones with no channel, so they'd otherwise only
  // ever land in Buyer/Vendor Activity even when the call was started from the Group Chat tab.
  // Surface them in whichever thread is being viewed instead.
  const isSharedCallMilestone = c => c.type === 'milestone' && ['video_call_started', 'video_call_ended'].includes(c.metadata?.event)
  // The "Buyer/Vendor joined the workspace" milestone (event: invite_accepted) is only the
  // viewer's own side's business — a buyer shouldn't see "Vendor joined" and vice-versa. The
  // milestone carries accepted_role ('buyer' | 'supplier'/'vendor'); merchant sees both.
  const hidesOtherSideJoin = (c, viewerSide) => {
    if (c.metadata?.event !== 'invite_accepted' || !c.metadata?.accepted_role) return false
    const joinSide = c.metadata.accepted_role === 'buyer' ? 'buyer' : 'vendor'
    return joinSide !== viewerSide
  }
  // channel !== 'group' guard: without it, a buyer's/supplier's own Group Chat comments (and
  // the "joined Group Chat" milestone, which carries the joiner's own role) matched the bare
  // role checks below regardless of channel, so they leaked into Buyer/Vendor Activity too —
  // group-channel comments belong to groupComments only. Mirrors the same fix in the backend's
  // filterCommentsForRole (routes/plm.js).
  const buyerComments  = comments.filter(c => !hidesOtherSideJoin(c, 'buyer')  && (isSharedCallMilestone(c) || (c.channel !== 'group' && (c.type === 'spec_summary' || c.role === 'buyer' || (c.role === 'merchant' && (c.channel === 'buyer' || isSystemComment(c)))))))
  const vendorComments = comments.filter(c => !hidesOtherSideJoin(c, 'vendor') && (isSharedCallMilestone(c) || (c.channel !== 'group' && (c.role === 'supplier' || (c.role === 'merchant' && (c.channel === 'vendor' || c.channel === 'supplier'))))))
  const groupComments  = comments.filter(c => c.channel === 'group' || isSharedCallMilestone(c))

  // Everyone the merchant can choose to include in the Group Chat tab — the primary buyer/
  // supplier plus any accepted co-buyer/co-supplier invites (multi-invite).
  const groupChatCandidates = [
    ...(ws?.buyer_member_id ? [{ id: ws.buyer_member_id, name: ws.buyer_name || ws.buyer_email || 'Buyer', side: 'buyer' }] : []),
    ...(ws?.buyer_invites || []).filter(i => i.status === 'accepted' && i.member_id && i.member_id !== ws?.buyer_member_id)
      .map(i => ({ id: i.member_id, name: i.name || i.email || 'Buyer', side: 'buyer' })),
    ...(ws?.supplier_member_id ? [{ id: ws.supplier_member_id, name: ws.supplier_name || ws.supplier_email || 'Supplier', side: 'supplier' }] : []),
    ...(ws?.supplier_invites || []).filter(i => i.status === 'accepted' && i.member_id && i.member_id !== ws?.supplier_member_id)
      .map(i => ({ id: i.member_id, name: i.name || i.email || 'Supplier', side: 'supplier' })),
  ]
  const groupChatMemberIds = ws?.group_chat_member_ids || []
  const inGroupChat = groupChatMemberIds.includes(memberId)
  const allGroupChatCandidateIds = groupChatCandidates.map(c => c.id)
  const allInGroupChat = allGroupChatCandidateIds.length > 0 && allGroupChatCandidateIds.every(id => groupChatMemberIds.includes(id))

  // Tabs visible per role — the merchant always has Group Chat; a buyer/supplier sees it on
  // any active workspace and can join it themselves from the tab (they don't have to wait to
  // be added). Until they join, the tab just shows an empty thread + a Join button.
  const canSeeGroupChat = role === 'merchant' || role === 'qa' || (!!ws?.id && ws?.status !== 'invited')
  const chatTabs = role === 'merchant'
    ? [['buyer', 'Buyer Activity', buyerComments.length], ['vendor', 'Vendor Activity', vendorComments.length], ['group', 'Group Chat', groupComments.length]]
    // QA gets Group Chat only — never Buyer/Vendor Activity, no exception.
    : role === 'qa'
      ? [['group', 'Group Chat', groupComments.length]]
      : role === 'buyer'
        ? [['buyer', 'Activity', buyerComments.length], ...(canSeeGroupChat ? [['group', 'Group Chat', groupComments.length]] : [])]
        : [['vendor', 'Activity', vendorComments.length], ...(canSeeGroupChat ? [['group', 'Group Chat', groupComments.length]] : [])]

  // Which tab(s) actually have something the viewer hasn't read yet, and exactly which message
  // to land on — both driven off `is_unread`, computed server-side per comment (routes/plm.js,
  // GET .../comments) from that viewer's own workspace_last_seen row, read (never written) as
  // part of that same request so it can never race with the "mark as seen" write that follows
  // it. This stays put for the life of the open (the flag is baked into each comment object, not
  // re-derived from a client-held cutoff) so each tab's badge persists until the viewer actually
  // switches to that specific tab (tracked via viewedTabs), not just until the initial
  // auto-scroll fires once.
  const isUnreadEntry = (c) => !!c.is_unread
  const unreadByTab = {
    buyer:  viewedTabs.has('buyer')  ? 0 : buyerComments.filter(isUnreadEntry).length,
    vendor: viewedTabs.has('vendor') ? 0 : vendorComments.filter(isUnreadEntry).length,
    group:  viewedTabs.has('group')  ? 0 : groupComments.filter(isUnreadEntry).length,
  }
  // The id of the earliest unread message in each channel — used to drop an in-thread "New
  // messages" divider right above it (see dividerDismissedTabs below for when it goes away).
  // Works identically for whichever role is viewing (buyer, supplier or merchant) since it's
  // all driven off that viewer's own workspace_last_seen row, not a merchant-only concept.
  const earliestUnread = (list) => list.filter(isUnreadEntry).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0]
  const firstUnreadIdByTab = {
    buyer:  earliestUnread(buyerComments)?.id  || null,
    vendor: earliestUnread(vendorComments)?.id || null,
    group:  earliestUnread(groupComments)?.id  || null,
  }

  // Switches to a tab AND, if it still has an undismissed unread divider, jumps straight to
  // that message — otherwise a manual tab click would just land wherever the browser happens
  // to reset scroll for the newly-rendered content (usually the top, not the actual unread
  // boundary), and marking the tab "viewed" on click would silently clear its red badge
  // without the viewer ever actually having seen the new message.
  const jumpToTab = (t) => {
    setChatTab(t)
    setViewedTabs(prev => prev.has(t) ? prev : new Set(prev).add(t))
    const targetId = firstUnreadIdByTab[t]
    if (targetId && !dividerDismissedTabs.has(t)) {
      scrolledIdRef.current = null   // force a fresh scroll even if this id was jumped to before
      setPendingScrollId(targetId)
    }
  }

  // Shared by the thread's onScroll handler AND the delayed check below — dismisses the current
  // tab's divider/highlight once the viewer is within ~40px of the bottom. `ignoreArm` bypasses
  // the arming delay below — used only by the "nothing to scroll to at all" fallback timer,
  // which must fire regardless of whether a scroll animation is or isn't in flight.
  const dismissDividerIfAtBottom = ({ ignoreArm = false } = {}) => {
    const el = threadRef.current
    if (!el || dividerDismissedTabs.has(chatTab)) return
    if (!ignoreArm && !scrollDismissArmedRef.current) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) {
      setDividerDismissedTabs(prev => new Set(prev).add(chatTab))
    }
  }
  // jumpToTab's scrollIntoView({behavior:'smooth'}) fires a stream of intermediate `scroll`
  // events as the browser animates toward the target — if that target happens to sit near the
  // end of the tab's content, the animation can briefly cross the "within 40px of bottom"
  // threshold mid-flight, and the onScroll handler below would dismiss the divider almost
  // instantly, well before the animation even finishes. Arming scroll-triggered dismissal only
  // after a short delay lets that animation settle first; genuine user scrolling shortly after
  // still dismisses normally. Separately, the 5s fallback (ignoreArm: true) handles the case
  // where the first-unread message is already the LAST message — nothing to scroll to at all,
  // so a scroll-only check would never fire and the divider would linger forever; this instead
  // gives the viewer a real 5s to notice/read it before auto-clearing.
  useEffect(() => {
    scrollDismissArmedRef.current = false
    const armId = setTimeout(() => { scrollDismissArmedRef.current = true }, 1200)
    const fallbackId = setTimeout(() => dismissDividerIfAtBottom({ ignoreArm: true }), 5000)
    return () => { clearTimeout(armId); clearTimeout(fallbackId) }
    // dismissDividerIfAtBottom is intentionally excluded — it's a new function reference every
    // render, and including it would reset these timers on every unrelated re-render,
    // potentially never letting either delay actually elapse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatTab, ws?.id])

  // Reset per-workspace — a different workspace means different is_unread flags on its own
  // comments, so every tab should start unread again rather than inheriting the previous
  // workspace's reads. Deliberately NOT keyed on chatTab — marking a tab "viewed" happens
  // explicitly (tab click, scrollToChatMessage, or the "nothing unread" fallback below), never
  // just because it was the default tab shown before an auto-switch could move away from it.
  useEffect(() => { setViewedTabs(new Set()); setDividerDismissedTabs(new Set()); prevCommentsLenRef.current = 0 }, [ws?.id])

  // On the one open this workspace load belongs to, jump straight to the first message the
  // viewer never read instead of always landing on the latest one. Merged with the default
  // "scroll to bottom" behavior (moved out of its own separate effect below) into one
  // atomic decision per render — two effects coordinating through a ref meant that if the
  // first one ever failed to run to completion for any reason, the second stayed
  // permanently blocked too, since its guard depended on a ref only the first effect set.
  useEffect(() => {
    if (!threadRef.current) return
    if (ws?.id && unreadJumpCheckedRef.current !== ws.id) {
      if (!comments.length) return
      unreadJumpCheckedRef.current = ws.id
      const firstUnread = [...buyerComments, ...vendorComments, ...groupComments]
        .filter(isUnreadEntry)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0]
      if (firstUnread) {
        scrollToChatMessage({ commentId: firstUnread.id, commentRole: firstUnread.role, commentChannel: firstUnread.channel })
        prevCommentsLenRef.current = comments.length
        return
      }
      // Nothing unread at all — the default tab isn't going anywhere, and it's what's on
      // screen right now, so treat it as read, then fall through to the normal bottom-scroll.
      setViewedTabs(prev => prev.has(chatTab) ? prev : new Set(prev).add(chatTab))
    }
    // Only auto-scroll to bottom when a genuinely NEW comment arrived (length grew) — not on
    // every render this effect happens to re-run for. buyerComments/vendorComments/groupComments
    // are plain .filter() calls in the component body, so they (and isUnreadEntry) get a new
    // reference on literally every render regardless of content; deliberately NOT depending on
    // them (only on comments.length + chatTab + ws?.id) is what keeps this effect from firing —
    // and blindly jumping to the bottom — on every unrelated re-render, which previously kept
    // undoing the unread-jump's smooth scrollIntoView moments after it ran.
    if (comments.length > prevCommentsLenRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
    prevCommentsLenRef.current = comments.length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws?.id, comments.length, chatTab])

  // Which comments to show for current tab
  const visibleComments = chatTab === 'group'
    ? groupComments
    : role === 'merchant'
      ? (chatTab === 'buyer' ? buyerComments : vendorComments)
      : role === 'buyer' ? buyerComments : vendorComments

  // Placeholder text for message input
  const chatPlaceholder = chatTab === 'group'
    ? 'Message the group…'
    : role === 'merchant'
      ? `Message ${chatTab}…`
      : 'Write a message…'

  // Default "jump to bottom" is now handled inside the unread-scroll effect above (merged
  // into one effect so the two behaviors can never get out of sync with each other).

  // If the Group Chat tab itself disappears (workspace went back to 'invited', etc.) while a
  // buyer/supplier is sitting on it, snap them back to their own Activity tab. Being on the
  // group tab without having joined yet is fine — that shows the Join prompt.
  useEffect(() => {
    if (role !== 'merchant' && chatTab === 'group' && !canSeeGroupChat) {
      setChatTab(role === 'buyer' ? 'buyer' : 'vendor')
    }
  }, [role, chatTab, canSeeGroupChat])

  const chatLocked = !hasCommentGrant && (
    isReadOnly || !ws?.id || ws?.status === 'invited'
    || (role === 'supplier' && memberId !== ws?.supplier_member_id && !ws?.extra_supplier_member_ids?.includes(memberId))
    || (chatTab === 'group' && role !== 'merchant' && !inGroupChat)
  )

  // Asks first, inline in the app's own card style (matches the Hold/Drop confirm elsewhere in
  // this modal) — a plain checkbox here made a stray double-click silently add then re-remove
  // (or vice versa) someone from Group Chat with no visible feedback either way. Also blocked
  // while a previous toggle is still saving — the checkbox gave no loading feedback, so a user
  // unsure their first click registered could fire a second overlapping request that raced the
  // first one's read-then-write and produced two "joined" milestones for the same member.
  const requestGroupChatMemberToggle = (candidateId, candidateName) => {
    if (!ws?.id || savingGroupMembers) return
    const adding = !groupChatMemberIds.includes(candidateId)
    setPendingMemberToggle({ id: candidateId, name: candidateName, adding })
  }

  // "Everyone" checkbox — add all candidate buyer/supplier contacts to Group Chat in one go
  // (or clear them all). Same confirm step as a single toggle.
  const requestToggleAllGroupChat = () => {
    if (!ws?.id || savingGroupMembers || !allGroupChatCandidateIds.length) return
    setPendingMemberToggle({ all: true, adding: !allInGroupChat, name: 'everyone' })
  }

  const confirmGroupChatMemberToggle = () => {
    if (!ws?.id || !pendingMemberToggle || savingGroupMembers) return
    const { id, adding, all } = pendingMemberToggle
    const next = all
      ? (adding
          ? [...new Set([...groupChatMemberIds, ...allGroupChatCandidateIds])]
          : groupChatMemberIds.filter(mid => !allGroupChatCandidateIds.includes(mid)))
      : (adding
          ? [...groupChatMemberIds, id]
          : groupChatMemberIds.filter(mid => mid !== id))
    setPendingMemberToggle(null)
    setSavingGroupMembers(true)
    setGroupChatMembers(ws.id, next)
      .catch(err => toast(err.message))
      .finally(() => setSavingGroupMembers(false))
  }

  // Buyer/supplier self-joins the Group Chat from its tab — no merchant action needed.
  const handleJoinGroupChat = () => {
    if (!ws?.id || savingGroupMembers || inGroupChat || !memberId) return
    setSavingGroupMembers(true)
    setGroupChatMembers(ws.id, [...groupChatMemberIds, memberId])
      .catch(err => toast(err.message))
      .finally(() => setSavingGroupMembers(false))
  }

  const handleGroupManageToggle = () => {
    setPendingMemberToggle(null)
    setGroupPickerOpen(v => !v)
  }

  // Notebook/"Notes" composer toggle — switches the plain textarea for a bigger contentEditable
  // surface with a formatting toolbar. styleWithCSS makes execCommand output <span style="...">
  // instead of legacy tags (<b>, <font>) for most commands, matching the span+style allowlist
  // both the frontend sanitizer (below) and backend (sanitizeRichComment) expect.
  const handleToggleRichMode = () => {
    setRichMode(v => {
      const next = !v
      if (next) requestAnimationFrame(() => {
        try { document.execCommand('styleWithCSS', false, true) } catch { /* unsupported */ }
        richComposerRef.current?.focus()
      })
      else {
        setEditingNote(null)
        if (richComposerRef.current) richComposerRef.current.innerHTML = ''
        setRichHasContent(false); setRichActiveFormats({})
        setRichFontFamily(''); setRichFontSize(''); setRichTextColor('#000000'); setRichHighlightColor('#ffff00')
        // Explicitly discarding the note — any images already uploaded into it (immediate-on-
        // insert, see insertInlineImages) were never actually sent, so delete them rather than
        // leaving them orphaned in storage. Also clears the localStorage draft — unlike
        // closing the workspace/refreshing, this is a deliberate "throw this away".
        if (richInlineImagePaths.length && ws?.id) {
          richInlineImagePaths.forEach(path => deleteInlineImage(ws.id, path).catch(() => {}))
        }
        setRichInlineImagePaths([])
        if (richDraftKey) { try { localStorage.removeItem(richDraftKey) } catch { /* ignored */ } }
      }
      return next
    })
  }

  // Opens the Notes composer to edit an existing rich-text message: rich mode on, the note's
  // current HTML (text + inline images) loaded in, Send turns into "Save". New images inserted
  // during the edit that then get cancelled will orphan in storage — acceptable for now.
  const handleEditNote = useCallback((cm) => {
    setReplyTo(null)
    setEditingNote({ id: cm.id })
    setRichMode(true)
    if (isNarrow) setMobilePanel('activity')
    requestAnimationFrame(() => {
      try { document.execCommand('styleWithCSS', false, true) } catch { /* unsupported */ }
      if (richComposerRef.current) {
        richComposerRef.current.innerHTML = cm.body || ''
        setRichHasContent(true)
        richComposerRef.current.focus()
      }
    })
  }, [isNarrow])

  const cancelEditNote = () => {
    setEditingNote(null)
    if (richComposerRef.current) richComposerRef.current.innerHTML = ''
    setRichHasContent(false)
    setRichActiveFormats({})
    if (richDraftKey) { try { localStorage.removeItem(richDraftKey) } catch { /* ignored */ } }
    setRichMode(false)
  }

  // <select>/<input type=color> steal focus the instant they're interacted with, which
  // collapses whatever text selection was made inside the contentEditable — by the time their
  // onChange fires, window.getSelection() no longer points at what the user actually selected.
  // Buttons don't have this problem (onMouseDown preventDefault keeps focus in the editor), so
  // only the font/color controls below need this save-before/restore-after dance.
  const savedRichRangeRef = useRef(null)
  const saveRichSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && richComposerRef.current?.contains(sel.anchorNode)) {
      savedRichRangeRef.current = sel.getRangeAt(0).cloneRange()
    }
  }
  const restoreRichSelection = () => {
    if (!savedRichRangeRef.current) return
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(savedRichRangeRef.current)
  }
  // Relying only on onMouseDown to catch the selection right as a font/color control is
  // tapped is timing-fragile on touch devices — mobile browsers often clear the native
  // selection as soon as the finger lifts, before a synthetic mousedown fires, so the first
  // tap on Font/Color silently applied to nothing (confirmed: re-selecting the same text and
  // trying again worked, since that re-selection landed inside the same narrow window this
  // effect now removes the need for). Continuously mirrors any real selection made inside the
  // note into savedRichRangeRef while richMode is open, so it's always current by the time any
  // toolbar control fires, regardless of exact tap/event timing.
  useEffect(() => {
    if (!richMode) return
    const onSelectionChange = () => saveRichSelection()
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [richMode])

  // fontSize/fontFamily skip execCommand entirely — execCommand('fontSize') only accepts the
  // legacy 1-7 <font size> scale, not real px, so those two wrap the current selection in a
  // <span style="..."> by hand instead. No-ops when nothing is selected (matches how a normal
  // rich editor's size/font pickers only affect selected text, not the whole box).
  const wrapRichSelection = (styleProp, value) => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    if (!richComposerRef.current?.contains(range.commonAncestorContainer)) return
    const span = document.createElement('span')
    span.style[styleProp] = value
    try {
      range.surroundContents(span)
    } catch {
      // surroundContents throws when the selection's edges don't line up with element
      // boundaries (e.g. spans across a bold/italic run) — extract+reinsert works for those too.
      const frag = range.extractContents()
      span.appendChild(frag)
      range.insertNode(span)
    }
    sel.removeAllRanges()
    const newRange = document.createRange()
    newRange.selectNodeContents(span)
    sel.addRange(newRange)
  }

  // mode: 'upper' | 'lower' | 'sentence' (only the very first letter of the whole selection
  // capitalized, everything else lowercased — not Title Case). Rewrites each selected text
  // node's characters IN PLACE (via cloneContents' fragment) rather than replacing the
  // selection with plain text, so any bold/italic/color formatting already on that text
  // survives the transform untouched — only the letters themselves change.
  const transformSelectionCase = (mode) => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { toast('Select some text first'); return }
    const range = sel.getRangeAt(0)
    if (!richComposerRef.current?.contains(range.commonAncestorContainer)) return

    const frag = range.cloneContents()
    const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT)
    let node, seenFirstAlpha = false
    while ((node = walker.nextNode())) {
      if (mode === 'upper') node.nodeValue = node.nodeValue.toUpperCase()
      else if (mode === 'lower') node.nodeValue = node.nodeValue.toLowerCase()
      else if (mode === 'sentence') {
        let v = node.nodeValue.toLowerCase()
        if (!seenFirstAlpha) {
          const m = v.match(/[a-zA-Z]/)
          if (m) { v = v.slice(0, m.index) + v[m.index].toUpperCase() + v.slice(m.index + 1); seenFirstAlpha = true }
        }
        node.nodeValue = v
      }
    }

    range.deleteContents()
    range.insertNode(frag)
    sel.removeAllRanges()
    range.collapse(false)
    sel.addRange(range)
    setRichOpenMenu(null)
    saveRichDraft()
  }

  // Strips ALL formatting from the selection down to plain text — deliberately replaces the
  // whole selected range wholesale (not just each text node's style) rather than trying to
  // surgically unwrap spans, because that also cleans up "ghost" formatting: e.g. an empty
  // line that inherited a huge font-size from whatever was typed before it, which has no
  // visible characters to select/backspace over and is otherwise nearly impossible to remove.
  // Selecting past it and clicking this replaces the whole range (formatted spans, empty
  // oversized lines, everything) with just its own plain text.
  const clearRichFormatting = () => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { toast('Select some text first'); return }
    const range = sel.getRangeAt(0)
    if (!richComposerRef.current?.contains(range.commonAncestorContainer)) return
    const text = range.toString()
    range.deleteContents()
    const textNode = document.createTextNode(text)
    range.insertNode(textNode)
    sel.removeAllRanges()
    const newRange = document.createRange()
    newRange.setStartAfter(textNode)
    newRange.collapse(true)
    sel.addRange(newRange)
    updateRichActiveFormats()
    saveRichDraft()
  }

  // Bullet shape (disc/circle/square) is set directly on the <ul>, not via execCommand — there
  // is no native command for it (insertUnorderedList only ever produces the default disc), and
  // execCommand('insertUnorderedList') TOGGLES the list, so calling it again on an existing
  // list would remove it rather than restyle it. 'decimal' is the one exception — that's a
  // genuinely different list type (<ol>), which does have its own real execCommand.
  const setBulletStyle = (type) => {
    if (type === 'decimal') { applyRichFormat('insertOrderedList'); setRichOpenMenu(null); return }
    richComposerRef.current?.focus()
    const findUl = () => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return null
      let node = sel.getRangeAt(0).commonAncestorContainer
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement
      return node?.closest?.('ul') || null
    }
    let ul = findUl()
    if (!ul) {
      document.execCommand('insertUnorderedList')
      ul = findUl()
    }
    if (ul) { ul.style.listStyleType = type; saveRichDraft() }
    else toast('Click inside some text first')
    setRichOpenMenu(null)
  }

  // Bullet marker size follows the <li>'s OWN font-size, not any span nested inside it (that's
  // why making the text itself bigger via the Size picker never visibly grew the dot) — so this
  // targets the closest <li> ancestor of the cursor directly, independent of the text's own size.
  const setBulletSize = (px) => {
    richComposerRef.current?.focus()
    const sel = window.getSelection()
    let li = null
    if (sel && sel.rangeCount > 0) {
      let node = sel.getRangeAt(0).commonAncestorContainer
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement
      li = node?.closest?.('li') || null
    }
    if (!li || !richComposerRef.current?.contains(li)) { toast('Click inside a bulleted list item first'); setRichOpenMenu(null); return }
    li.style.fontSize = px
    saveRichDraft()
    setRichOpenMenu(null)
  }

  // queryCommandState reflects what's true at the current cursor/selection right now — e.g.
  // true for 'bold' the instant the cursor sits inside a bold run, not just right after
  // clicking the Bold button. Wrapped in try/catch since it throws on an unsupported command
  // (fontSize/fontName aren't real execCommand state — those two are the manual span-wrap
  // path, so they're intentionally left out of this check).
  const updateRichActiveFormats = () => {
    try {
      setRichActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      })
    } catch { /* queryCommandState unsupported */ }
  }

  const applyRichFormat = (command, value = null) => {
    richComposerRef.current?.focus()
    if (command === 'fontSize') { wrapRichSelection('fontSize', value); return }
    if (command === 'fontName') { wrapRichSelection('fontFamily', value); return }
    document.execCommand(command, false, value)
    updateRichActiveFormats()
  }

  // Uploads immediately (see uploadInlineImage) and drops the image in as a real <img> exactly
  // where the cursor was — restoreRichSelection first since opening the file picker/camera in
  // between click and upload-completing has, in practice, already stolen focus/selection from
  // the contentEditable by the time this runs.
  const insertInlineImages = async (files) => {
    if (!ws?.id) { toast('No workspace open — could not attach image'); return }
    const images = files.filter(f => f.type?.startsWith('image/'))
    if (images.length < files.length) toast('Only images can be inserted into a note — non-image files were skipped')
    if (!images.length) return
    setUploadingInlineImage(true)
    let paths = richInlineImagePaths
    try {
      for (const file of images) {
        const result = await uploadInlineImage(ws.id, file)
        if (!result?.url) { toast(`Upload succeeded but returned no image URL for "${file.name}" — nothing was inserted`); continue }
        paths = [...paths, result.path]
        setRichInlineImagePaths(paths)

        // Inserted via direct DOM Range manipulation, NOT document.execCommand('insertHTML',...)
        // — execCommand proved unreliable here in practice (confirmed by real sends where the
        // upload succeeded but the image never actually landed in the note), which lines up
        // with execCommand being a deprecated API with known inconsistent behavior across
        // browsers/contexts. Building the <img> element and inserting it into a Range directly
        // is the same technique wrapRichSelection already uses for font-size/family, and
        // doesn't depend on execCommand's editing-context/undo-stack machinery at all.
        richComposerRef.current?.focus()
        restoreRichSelection()
        let liveSel = window.getSelection()
        let hasValidRange = liveSel && liveSel.rangeCount > 0 && richComposerRef.current?.contains(liveSel.getRangeAt(0).commonAncestorContainer)
        if (!hasValidRange && richComposerRef.current) {
          const endRange = document.createRange()
          endRange.selectNodeContents(richComposerRef.current)
          endRange.collapse(false)
          liveSel?.removeAllRanges()
          liveSel?.addRange(endRange)
        }
        liveSel = window.getSelection()
        if (liveSel && liveSel.rangeCount > 0 && richComposerRef.current) {
          const range = liveSel.getRangeAt(0)
          // A real, explicit width — not max-width — is what actually renders at 220px.
          // max-width alone (the original approach) let the browser size the element by its
          // natural/intrinsic resolution first when combined with resize:both, which for any
          // normal photo (often 800px+ wide) blew straight past the composer/modal's own
          // bounds regardless of what the max-width cap said. resize:both + overflow:hidden
          // still gives a native browser drag handle to grow/shrink it afterward — the
          // sanitizer (frontend RICH_HTML_SANITIZE_CONFIG and backend sanitizeRichComment)
          // allows width/height/resize/overflow specifically so a manual resize survives being
          // sent, not just snap back to default the moment it's saved.
          const img = document.createElement('img')
          img.src = result.url
          img.style.width = '220px'
          img.style.height = 'auto'
          img.style.resize = 'both'
          img.style.overflow = 'hidden'
          range.deleteContents()
          range.insertNode(img)
          range.setStartAfter(img)
          range.collapse(true)
          liveSel.removeAllRanges()
          liveSel.addRange(range)
        } else {
          // richComposerRef itself isn't there for some reason — genuinely nothing to insert
          // into, surface it rather than silently losing an already-uploaded image again.
          toast('Could not place the image — try clicking into the note first')
        }
        saveRichSelection()
        setRichHasContent(true)
        saveRichDraft(paths)
      }
    } catch (err) {
      toast(err.message)
    } finally {
      setUploadingInlineImage(false)
    }
  }

  const handleSend = () => {
    if (editingNote) {
      if (chatLocked) return
      const html = richComposerRef.current?.innerHTML || ''
      const sanitized = DOMPurify.sanitize(html, RICH_HTML_SANITIZE_CONFIG)
      const plain = richComposerRef.current?.textContent?.trim() || ''
      if (!plain && !/<img\b/.test(sanitized)) { toast('Message can’t be empty'); return }
      editComment(ws.id, editingNote.id, sanitized).catch(err => toast(err.message))
      setEditingNote(null)
      if (richComposerRef.current) richComposerRef.current.innerHTML = ''
      setRichHasContent(false)
      setRichActiveFormats({})
      setRichInlineImagePaths([])
      if (richDraftKey) { try { localStorage.removeItem(richDraftKey) } catch { /* ignored */ } }
      setRichMode(false)
      return
    }
    if (richMode) {
      const html = richComposerRef.current?.innerHTML || ''
      const plainText = richComposerRef.current?.textContent?.trim() || ''
      // textContent is blind to inline <img> nodes — a note that's an image with no typed
      // caption has empty plainText, which used to make this guard treat it as empty and
      // silently no-op the whole send (image visibly sitting in the composer, Send did nothing).
      const hasInlineImage = /<img\b/.test(html)
      if ((!plainText && !hasInlineImage && pendingFiles.length === 0) || chatLocked) return
      // Frontend sanitization is defense-in-depth, not the trust boundary — the backend
      // (sanitizeRichComment, routes/plm.js) re-sanitizes on receipt regardless, since a
      // request can always bypass the browser entirely.
      const sanitized = DOMPurify.sanitize(html, RICH_HTML_SANITIZE_CONFIG)
      // Catches sanitization silently dropping an image that was genuinely in the note right
      // before sending (e.g. an ALLOWED_URI_REGEXP mismatch) — this exact failure mode already
      // happened once with no visible error, so warn explicitly rather than let it send a
      // message quietly missing content the sender thought was there.
      const imgCountBefore = (html.match(/<img\b/g) || []).length
      const imgCountAfter  = (sanitized.match(/<img\b/g) || []).length
      if (imgCountAfter < imgCountBefore) {
        toast(`${imgCountBefore - imgCountAfter} image(s) were removed during sending — they didn't pass validation. Sending the rest without them.`)
      }
      const files = pendingFiles
      let reply = null
      if (replyTo) {
        const { text, thumbUrl, thumbUrls } = attachmentPreview(replyTo)
        reply = { ...replyTo, body: text, quoted_thumb: thumbUrl, quoted_thumbs: thumbUrls }
      }
      if (richComposerRef.current) richComposerRef.current.innerHTML = ''
      setRichHasContent(false)
      setRichActiveFormats({})
      // Not deleted here — these images are now genuinely part of a message being sent, unlike
      // the discard path (handleToggleRichMode) which deletes them since nothing was ever sent.
      setRichInlineImagePaths([])
      if (richDraftKey) { try { localStorage.removeItem(richDraftKey) } catch { /* ignored */ } }
      // Notes mode itself stays open for the next note (matches how it already behaves), but
      // the maximized panel specifically collapses back to the small composer after a send —
      // "compose one, minimize" reads better than the panel staying full-screen indefinitely.
      setRichMaximized(false)
      setPendingFiles([])
      files.forEach(revokeFilePreview)
      setReplyTo(null)
      sendComment(ws.id, sanitized, chatTab === 'vendor' ? 'supplier' : chatTab, files, reply, 'html')
        .catch(err => toast(err.message))
      return
    }
    if ((!text.trim() && pendingFiles.length === 0) || chatLocked) return
    const body = text.trim()
    const files = pendingFiles
    // Fall back to a readable stand-in (filename, or a thumbnail for a single image) when
    // replying to an attachment-only comment — sendComment only forwards `.body`/`.quoted_thumb`
    // into the quoted bubble, so an empty body here would otherwise render as a blank quote box.
    let reply = null
    if (replyTo) {
      const { text, thumbUrl, thumbUrls } = attachmentPreview(replyTo)
      reply = { ...replyTo, body: text, quoted_thumb: thumbUrl, quoted_thumbs: thumbUrls }
    }
    // Clear the composer immediately so the user can keep chatting — the
    // message renders optimistically and files upload in the background.
    setText('')
    setPendingFiles([])
    files.forEach(revokeFilePreview)
    setReplyTo(null)
    sendComment(ws.id, body, chatTab === 'vendor' ? 'supplier' : chatTab, files, reply)
      .catch(err => toast(err.message))
  }

  // Reply click needs to actually land the user somewhere they can type: on mobile the chat
  // thread is its own tab (mobilePanel), so a reply triggered while viewing Media/Details
  // would otherwise show the quote banner on a composer the user can't currently see. Focus
  // is deferred a frame so it fires after the reply banner/tab switch has actually rendered.
  const handleReplyClick = useCallback((cm) => {
    setReplyTo(cm)
    if (isNarrow) setMobilePanel('activity')
    requestAnimationFrame(() => composerRef.current?.focus())
  }, [isNarrow])

  // Auto-grow the composer to fit its content (capped by CSS max-height + scroll)
  // so a longer message wraps into view instead of scrolling sideways in a
  // single-line box, where it's hard to review before hitting send.
  useLayoutEffect(() => {
    if (composerRef.current) {
      const el = composerRef.current
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [text])

  const handleSaveBrief = async () => {
    if (!ws?.id) return true

    // Only send fields this user actually changed since the brief was loaded — not the whole
    // object — so a concurrent editor's already-saved changes elsewhere in the brief (buyer,
    // co-buyers, or a paired merchant can all edit it) get merged instead of overwritten.
    const changed = {}
    for (const key of Object.keys(brief)) {
      if (brief[key] !== savedBriefRef.current[key]) changed[key] = brief[key]
    }
    if (!Object.keys(changed).length) return true

    setSavingBrief(true)
    try {
      // Snapshot a USD reference value alongside the brief price, at today's rate — this is
      // just a reference figure for the brief stage; the real freeze happens at approval time.
      if ((changed.unit_price !== undefined || changed.currency !== undefined) && brief.unit_price) {
        const rates = await fetchLiveRates().catch(() => FALLBACK_RATES)
        changed.amount_usd = convertToUSD(parseFloat(brief.unit_price), brief.currency || 'USD', rates)
      }
      await saveBrief(ws.id, changed)
      return true
    } catch (err) {
      toast(err.message)
      return false
    } finally {
      setSavingBrief(false)
    }
  }

  const handleGenerateBuyerRef = async () => {
    const orgId = buyerOrgId
    if (!orgId) return
    setGeneratingRef(true)
    try {
      const { data: org } = await supabase
        .from('organizations').select('prefix').eq('id', orgId).single()
      if (!org?.prefix) { toast('No prefix configured for your organisation'); return }
      const prefix = org.prefix.trim().toUpperCase()
      const year   = String(new Date().getFullYear()).slice(-2)
      let ref
      // Keep generating until we find one not already used
      while (true) {
        const num = String(Math.floor(1 + Math.random() * 99999)).padStart(5, '0')
        ref = `${prefix}${num}${year}`
        const { data: existing } = await supabase
          .from('npd2_workspaces').select('id').eq('buyer_ref', ref).maybeSingle()
        if (!existing) break
      }
      setBrief(b => ({ ...b, buyer_ref: ref }))
    } catch (err) {
      toast(err.message)
    } finally {
      setGeneratingRef(false)
    }
  }

  // Server-side (see routes/plm.js: POST /catalog-skus/:id/vendor-ref/generate) — only the
  // backend can reserve a candidate ref in memory before its DB check completes, closing the
  // race window between two concurrent "Auto" clicks on different SKUs picking the same ref.
  const handleGenerateVendorRef = async () => {
    if (!sku?.id || !ws?.id) return
    setGeneratingVendorRef(true)
    try {
      const ref = await generateVendorSkuRefAction(sku.id, ws.id)
      if (ref) setVendorSkuRef(ref)
    } catch (err) {
      toast(err.message)
    } finally {
      setGeneratingVendorRef(false)
    }
  }

  // A workspace put on hold / rejected AFTER it already had a sample order (e.g. holding it
  // mid-sample, or rejecting it post-approval) must stay locked — otherwise re-editing the
  // price/qty and hitting "Proceed to Sample" again collides with the still-existing sample
  // order on the backend ("Sample order already exists"). Pre-approval hold/reject (no sample
  // order yet) still unlocks the brief as before, since there's nothing to collide with.
  const briefLocked = !hasEditGrant && (isReadOnly || role === 'supplier' || role === 'qa')
    || ['approved', 'sample', 'sample_shipped', 'production'].includes(ws?.status)
    || (['on_hold', 'rejected'].includes(ws?.status) && !!ws?.sampleOrder)
  // briefLocked is true for a vendor viewer at ANY stage (they never edit the buyer's brief,
  // by design) — the "approved to sample" wording is only actually accurate once the
  // workspace has genuinely progressed that far. Showing it unconditionally (e.g. to a vendor
  // on a merely 'active' workspace, nothing approved yet) claimed something false happened.
  const briefLockedForApproval = ['approved', 'sample', 'sample_shipped', 'production'].includes(ws?.status)
    || (['on_hold', 'rejected'].includes(ws?.status) && !!ws?.sampleOrder)

  const handleSaveVendorSkuRef = async () => {
    if (!sku?.id || !ws?.id) return
    setSavingVendorRef(true)
    try {
      await updateVendorSkuRef(sku.id, vendorSkuRef, ws.id)
      setEditingVendorRef(false)
    } catch (err) {
      toast(err.message)
    } finally {
      setSavingVendorRef(false)
    }
  }

  const handleApproveToSample = async () => {
    const required = ['description', 'color', 'material', 'unit_price', 'unit_qty', 'buyer_ref']
    const errors = new Set(required.filter(f => !brief[f]?.toString().trim()))
    if (!ws?.buyer_brief?.image_url) errors.add('image_url')
    if (errors.size > 0) {
      setBriefErrors(errors)
      setActiveTab('details')
      return
    }
    setBriefErrors(new Set())
    // The backend's approve check reads buyer_ref (and the rest of the brief) straight off
    // the DB row, not off what's typed here — e.g. a freshly-generated ref or an edited field
    // that was never explicitly "Saved" would pass this local check but still get rejected
    // server-side. Persist first so approval always sees what the merchant just confirmed.
    const saved = await handleSaveBrief()
    if (!saved) return
    setApproveQty(brief.unit_qty || '')
    setApprovePrice(brief.unit_price || '')
    setShowApproveModal(true)
  }

  const handleWsHoldReject = async () => {
    if (!wsHoldRejectAction || submittingWsHoldReject || !ws?.id) return
    setSubmittingWsHoldReject(true)
    try {
      await bulkSetWorkspaceStatus([ws.id], wsHoldRejectAction.status, wsHoldRejectAction.note?.trim() || undefined)
      setWsHoldRejectAction(null)
    } catch (err) {
      toast(err.message)
    } finally {
      setSubmittingWsHoldReject(false)
    }
  }

  const handleConfirmApprove = async () => {
    if (!approveQty || !approvePrice || approvingWs) return
    setApprovingWs(true)
    try {
      // This is the permanent freeze point: whatever currency/USD value is true right now
      // becomes locked on the sample order forever, independent of later brief edits.
      const confirmedCurrency = brief.currency || 'USD'
      const rates = await fetchLiveRates().catch(() => FALLBACK_RATES)
      const confirmedAmountUsd = convertToUSD(parseFloat(approvePrice), confirmedCurrency, rates)
      await approveWorkspace(ws.id, { confirmedPrice: approvePrice, confirmedQty: approveQty, confirmedCurrency, confirmedAmountUsd })
      setShowApproveModal(false)
    } catch (err) {
      toast(err.message)
    } finally {
      setApprovingWs(false)
    }
  }

  const addPendingFiles = useCallback((files) => {
    if (!files.length) return
    setPendingFiles(prev => {
      const room = MAX_ATTACHMENTS - prev.length
      if (room <= 0) {
        toast(`You can attach up to ${MAX_ATTACHMENTS} files per message`)
        return prev
      }
      if (files.length > room) toast(`Only ${room} more file${room === 1 ? '' : 's'} can be attached (max ${MAX_ATTACHMENTS} per message)`)
      return [...prev, ...files.slice(0, room).map(withFilePreview)]
    })
  }, [toast])

  // Voice messages reuse the same pendingFiles/upload pipeline as any other attachment —
  // recording just produces a File that gets pushed in like a picked/captured one, so no
  // separate send path or backend support is needed.
  const { isRecording: isRecordingVoice, seconds: voiceRecordSecs, start: startVoiceRecording, finish: finishVoiceRecording, cancel: cancelVoiceRecording } = useVoiceRecorder({
    onRecorded: file => addPendingFiles([file]),
    onError: msg => toast(msg),
  })

  const handleFileChange = useCallback((e) => {
    const files = Array.from(e.target.files || [])
    // In rich mode the paperclip inserts images directly into the note at the cursor (upload-
    // immediately, see insertInlineImages) instead of adding them as separate attachments —
    // non-image files (pdf/doc/xls) still go through the normal attachment flow either way,
    // since there's no way to "insert" a PDF inline into formatted text.
    if (richMode) {
      const images = files.filter(f => f.type?.startsWith('image/'))
      const rest   = files.filter(f => !f.type?.startsWith('image/'))
      if (images.length) insertInlineImages(images)
      if (rest.length) addPendingFiles(rest)
    } else {
      addPendingFiles(files)
    }
    e.target.value = ''
  }, [addPendingFiles, richMode, insertInlineImages])

  // Camera capture flow, bulk-first: live camera (getUserMedia, CameraCaptureModal) stays open
  // across as many shots as wanted -> "Done" hands off to a review grid (CaptureReviewModal)
  // where each shot can be edited (ImageEditorModal, reused as-is), dropped, or left as-is ->
  // "Attach" pushes whatever's left into the composer in one go. A real getUserMedia feed
  // (rather than a file input's capture="environment", whose behavior varies wildly by
  // browser/OS) works the same way on a phone's camera and a laptop's webcam alike.
  const [cameraOpen,     setCameraOpen]     = useState(false)
  const [captureBatch,   setCaptureBatch]   = useState([]) // [{ id, file, blobUrl, edited }]
  const [editingCaptureId, setEditingCaptureId] = useState(null)

  const handleShutter = useCallback((file) => {
    setCaptureBatch(prev => [...prev, { id: `${Date.now()}-${prev.length}`, file, blobUrl: URL.createObjectURL(file), edited: false }])
  }, [])
  const handleCameraDone = useCallback(() => setCameraOpen(false), [])

  const removeCaptured = useCallback((id) => {
    setCaptureBatch(prev => {
      const item = prev.find(p => p.id === id)
      if (item) URL.revokeObjectURL(item.blobUrl)
      return prev.filter(p => p.id !== id)
    })
  }, [])
  // Replace: overwrites the original shot in place with the edited version.
  const saveEditedCaptureReplace = useCallback((blob) => {
    setCaptureBatch(prev => prev.map(p => {
      if (p.id !== editingCaptureId) return p
      URL.revokeObjectURL(p.blobUrl)
      const editedFile = new File([blob], p.file.name || `photo-${Date.now()}.png`, { type: 'image/png' })
      return { id: p.id, file: editedFile, blobUrl: URL.createObjectURL(editedFile), edited: true }
    }))
    setEditingCaptureId(null)
  }, [editingCaptureId])
  // Save as copy: keeps the original shot untouched and adds the edit as an extra photo —
  // both end up in the batch and get attached, same idea as "Save as Copy" on reference media.
  const saveEditedCaptureCopy = useCallback((blob) => {
    setCaptureBatch(prev => {
      const editedFile = new File([blob], `photo-${Date.now()}-edited.png`, { type: 'image/png' })
      return [...prev, { id: `${Date.now()}-copy`, file: editedFile, blobUrl: URL.createObjectURL(editedFile), edited: true }]
    })
    setEditingCaptureId(null)
  }, [])
  const attachCaptureBatch = useCallback(() => {
    // Same rich-mode branch as handleFileChange above — camera shots are always images, so
    // this one's unconditional.
    if (richMode) insertInlineImages(captureBatch.map(p => p.file))
    else addPendingFiles(captureBatch.map(p => p.file))
    captureBatch.forEach(p => URL.revokeObjectURL(p.blobUrl))
    setCaptureBatch([])
  }, [captureBatch, addPendingFiles, richMode, insertInlineImages])
  const discardCaptureBatch = useCallback(() => {
    captureBatch.forEach(p => URL.revokeObjectURL(p.blobUrl))
    setCaptureBatch([])
  }, [captureBatch])

  // Splits picked/pasted/dropped files between inline-insert (images, in rich mode) and the
  // regular attachment pipeline (everything else, or any file at all outside rich mode).
  const addComposerFiles = (files) => {
    if (richMode) {
      const images = files.filter(f => f.type?.startsWith('image/'))
      const rest = files.filter(f => !f.type?.startsWith('image/'))
      if (images.length) insertInlineImages(images)
      if (rest.length) addPendingFiles(rest)
    } else {
      addPendingFiles(files)
    }
  }

  // Lets a user paste a copied file (e.g. from Windows Explorer) or a screenshot
  // straight into the composer, same as clicking the attach button.
  const handleComposerPaste = useCallback((e) => {
    const files = Array.from(e.clipboardData?.files || [])
    if (!files.length) return
    e.preventDefault()
    addComposerFiles(files)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addPendingFiles, richMode])

  // Drag-and-drop onto the composer — same target as paste/the attach button. Skipped entirely
  // while richInternalDragRef is set (see its declaration) — that's an already-inserted note
  // image being repositioned, not an external file/Reference Media drag, and must be left to
  // the browser's own native contentEditable drag-and-drop instead of being intercepted here.
  const handleComposerDragOver = useCallback((e) => {
    if (chatLocked || richInternalDragRef.current) return
    e.preventDefault()
    setChatDragActive(true)
  }, [chatLocked])

  const handleComposerDragLeave = useCallback((e) => {
    if (richInternalDragRef.current) return
    e.preventDefault()
    setChatDragActive(false)
  }, [])

  const handleComposerDrop = useCallback(async (e) => {
    if (richInternalDragRef.current) { richInternalDragRef.current = false; return }
    e.preventDefault()
    setChatDragActive(false)
    if (chatLocked) return
    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length) { addComposerFiles(files); return }
    // Dragging an in-page <img> (e.g. a Reference Media thumbnail) carries no File — browsers
    // hand back its src as text/uri-list instead, so fetch that URL ourselves and turn it into
    // a File the same way a picked/dropped file would be.
    const url = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain')
    if (!url || !/^https?:\/\//i.test(url)) return
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('fetch failed')
      const blob = await res.blob()
      const name = url.split('/').pop()?.split('?')[0] || 'image'
      addComposerFiles([new File([blob], name, { type: blob.type || 'image/jpeg' })])
    } catch {
      toast('Could not attach that image')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatLocked, addPendingFiles, toast, richMode])

  // Media panel / lightbox → chat as a tap action. HTML5 drag-and-drop doesn't fire on
  // touch, so on phones/tablets there was no way to get a reference image into the
  // composer; this runs the same fetch-URL-into-a-File path the drop handler uses, then
  // (on the stacked mobile layout) flips to the Activity pane so the pending attachment
  // is visible. Nothing is sent — the user still writes a message and hits send.
  const handleAttachUrlToChat = useCallback(async (url) => {
    if (chatLocked) { toast('This chat is locked'); return }
    if (!url || !/^https?:\/\//i.test(url)) return
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('fetch failed')
      const blob = await res.blob()
      const name = url.split('/').pop()?.split('?')[0] || 'image'
      addComposerFiles([new File([blob], name, { type: blob.type || 'image/jpeg' })])
      if (isNarrow) setMobilePanel('activity')
      toast(richMode ? 'Inserted into your note' : 'Added to chat — write a message and send')
    } catch {
      toast('Could not attach that image')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatLocked, addPendingFiles, toast, isNarrow, richMode])

  const INVITE_MESSAGES = {
    already_accepted: 'This person has already accepted an invite to this workspace.',
    already_sent:     'An invite is already pending for this email.',
    org_mismatch:     "This email doesn't belong to the organization this SKU belongs to.",
  }

  const handleInviteBuyer = async (email) => {
    if (!sku?.id) return { ok: false }
    if (ws?.id) {
      try {
        const result = await addWorkspaceInvite(ws.id, email, 'buyer', buyerOrgId || ws.buyer_org_id || undefined)
        if (result?.status && INVITE_MESSAGES[result.status]) return { ok: false, error: INVITE_MESSAGES[result.status] }
        return { ok: true, link: result?.link }
      } catch (err) { return { ok: false, error: err.message } }
    } else {
      try {
        const result = await sendInvite(sku.id, email, undefined, memberId, { buyerOrgId: buyerOrgId || undefined, supplierOrgId: sku.supplier_org_id || undefined })
        if (result?.workspace?.id) openWorkspace(result.workspace.id, sku)
        return { ok: true, link: result?.buyerLink }
      } catch (err) { return { ok: false, error: err.message } }
    }
  }

  const handleInviteVendor = async (email) => {
    if (!ws?.id) return { ok: false }
    try {
      const result = await addWorkspaceInvite(ws.id, email, 'supplier', ws.supplier_org_id || undefined)
      if (result?.status && INVITE_MESSAGES[result.status]) return { ok: false, error: INVITE_MESSAGES[result.status] }
      return { ok: true, link: result?.link }
    } catch (err) { return { ok: false, error: err.message } }
  }

  // No orgId needed — the backend resolves the merchant's own org server-side and requires
  // department 'qa' there (see POST /sku-workspaces/:id/invite's role==='qa' branch).
  const handleInviteQa = async (email) => {
    if (!ws?.id) return { ok: false }
    try {
      const result = await addWorkspaceInvite(ws.id, email, 'qa')
      if (result?.status && INVITE_MESSAGES[result.status]) return { ok: false, error: INVITE_MESSAGES[result.status] }
      return { ok: true, link: result?.link }
    } catch (err) { return { ok: false, error: err.message } }
  }

  const createdDate = ws?.created_at
    ? new Date(ws.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  // Most recent status-change milestone (Approved to Sample, Sample Ready, Sample Accepted,
  // etc.) — excludes video-call milestones, which aren't status transitions. Shown next to
  // "Created" so it's always visible which stage the workspace last moved into, and when.
  const lastStatusMilestone = (() => {
    const milestones = (ws?.npd_comments || [])
      .filter(c => c.type === 'milestone' && c.metadata?.event && !c.metadata.event.startsWith('video_call'))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const latest = milestones[0]
    if (!latest) return null
    const d = new Date(latest.created_at)
    const when = `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    return { label: latest.body, when }
  })()

  const hint = (() => {
    const status      = ws?.status
    const sampleSt    = ws?.sampleOrder?.sample_status
    const briefSaved  = !!ws?.buyer_brief
    const buyerJoined = !!ws?.buyer_member_id
    const buyerInvited = !!ws?.buyer_email

    if (role === 'merchant') {
      if (!ws || !buyerInvited)
        return { title: 'Activate workspace', body: 'Use the Invite Buyer button in the Product Info section to bring a buyer into this workspace. Once they join, you can collaborate on briefs and move to sampling.' }
      if (status === 'invited' && !buyerJoined)
        return { title: 'Waiting for buyer', body: 'Invite sent — the buyer needs to accept the invite and set up their account. They\'ll receive an email with a link to join.' }
      if (status === 'active' && activeTab === 'details' && !briefSaved)
        return { title: 'Buyer is in', body: 'The buyer has joined. Ask them to fill in their brief in the Buyer Brief section below — you can monitor their requirements there.' }
      if (status === 'active' && activeTab === 'details')
        return { title: 'Review the brief', body: 'Review the buyer\'s requirements in the Buyer Brief section. The buyer will click "Proceed to Sample" when they\'re ready — you\'ll then see a Sample tab appear.' }
      if (activeTab === 'shipping')
        return { title: 'Fill in shipping details', body: 'Pick Air or Ship as the mode — both need ETD and ETA; Air also needs Courier Company and Tracking Ref, Ship also needs Container No and Vessel No. You can switch modes any time — every change is logged in the activity feed.' }
      if (status === 'approved' && sampleSt === 'ready')
        return { title: 'Share a main sample image', body: 'Share the sample image — upload a file/folder, or pick one already in the Media section — and set it as the main sample image, then add your QA comments. Once both are done, the buyer can review and either Accept or Reopen the brief. After they accept, you can fill in the remaining sample findings and the Shipping tab details.' }
      if (status === 'approved')
        return { title: 'Buyer approved — create sample', body: 'Head to the Sample tab and set a target ready date so the buyer knows when to expect the sample. Update the status to "Ready" once it\'s prepared.' }
      if (status === 'sample' && sampleSt === 'in_process')
        return { title: 'Sample in progress', body: 'Once the sample is physically ready, update the status to "Ready" — the buyer will be notified to review it and can then accept or request a revision.' }
      if (status === 'sample' && sampleSt === 'on_hold')
        return { title: 'Sample on hold', body: 'The sample is on hold. Update the status when you\'re ready to continue.' }
      if (status === 'sample')
        return { title: 'Buyer accepted — finish the details', body: 'The buyer has accepted this sample. Fill in QA comments and the remaining sample findings, then head to the Shipping tab to record how it\'s moving.' }
      if (status === 'sample_shipped')
        return { title: 'Sample shipped', body: 'Shipping details are complete and this sample is on its way. Keep tracking updated on the Shipping tab, or create the Sample PO from here once it arrives.' }
      if (status === 'on_hold')
        return { title: 'Workspace on hold', body: 'This workspace is paused. Update the sample status when you\'re ready to resume.' }
      if (status === 'production')
        return { title: 'In production', body: 'The buyer accepted the sample — this SKU is now in production. Keep the Shipping tab updated (mode, courier/tracking or container/vessel, plus ETD/ETA) as the order actually moves.' }
      return null
    }

    if (role === 'buyer') {
      if (status === 'invited' || (status === 'active' && activeTab === 'details' && !briefSaved))
        return { title: 'Start with your brief', body: 'Fill in your design requirements in the Buyer Brief section below and click Save Brief. You\'ll need to save before you can proceed to sample.' }
      if (status === 'active' && activeTab === 'details' && briefSaved)
        return { title: 'Brief saved — ready to proceed?', body: 'Your brief is saved. When you\'re happy with all requirements, click "Proceed to Sample" in the top bar to move forward to sampling.' }
      if (activeTab === 'shipping')
        return { title: 'Shipping details', body: 'Track this sample\'s shipment here — courier company and tracking reference plus expected departure (ETD)/arrival (ETA) for air shipments, or container/vessel numbers plus ETD/ETA for sea shipments. Only the merchant can edit these; you see them read-only.' }
      if (status === 'approved' && sampleSt === 'ready')
        return { title: 'Sample ready — waiting on the merchant', body: 'The merchant has marked the sample ready and is sharing a main sample image plus QA comments. As soon as both are set, Accept Sample and Reopen Brief buttons appear here — accept if you\'re happy, or reopen to send feedback.' }
      if (status === 'approved')
        return { title: 'Approval confirmed', body: 'You\'ve approved this product for sampling. The merchant is now preparing a sample — you\'ll see a target ready date here once it\'s set.' }
      if (status === 'sample' && sampleSt === 'on_hold')
        return { title: 'On hold', body: 'This workspace is currently on hold. Reach out to the merchant for an update.' }
      if (status === 'sample')
        return { title: 'You accepted this sample', body: 'The merchant is now finishing QA comments and the remaining sample findings, then filling in shipping details. Check the Shipping tab for courier/tracking updates as it moves.' }
      if (status === 'sample_shipped')
        return { title: 'Sample shipped', body: 'Your sample is on its way — check the Shipping tab for courier/tracking details as it moves.' }
      if (status === 'on_hold')
        return { title: 'On hold', body: 'This workspace is currently on hold. Reach out to the merchant for an update.' }
      if (status === 'production')
        return { title: 'In production', body: 'You accepted the sample — this SKU is now confirmed for production. Check the Shipping tab for courier/tracking updates as it moves.' }
      return null
    }

    return null
  })()

  return (
    <div className="ws-modal-root fixed inset-0 z-[1000] flex flex-col bg-white font-sans text-[#1A1A18] text-[13px] overflow-hidden">
      {/* Uniform hover/press feedback for every button in the workspace modal — mirrors the
          scale-up-on-hover / scale-down-on-click behavior added to ImageEditorModal, without
          having to hand-edit every button's className across this large file. */}
      <style>{`
        .ws-modal-root button:not(:disabled) {
          transition: transform 0.12s ease;
        }
        .ws-modal-root button:not(:disabled):hover {
          transform: scale(1.04);
        }
        .ws-modal-root button:not(:disabled):active {
          transform: scale(0.96);
        }
      `}</style>

      {/* Auto-scale wrapper — holds the header + 3-pane body. Overlays (lightbox, confirm
          modals, Sample PO) stay OUTSIDE this so they always cover the real viewport. */}
      <div
        className="ws-modal-scale flex flex-col"
        data-scaled={wsScale === 1 ? undefined : '1'}
        style={wsScale === 1 ? undefined : { '--ws-scale': wsScale }}
      >

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-x-2 sm:gap-x-3 gap-y-1.5 px-2 sm:px-5 py-2 sm:py-2.5 border-b border-black flex-shrink-0">
        {/* Left: SKU | Buyer Ref | Vendor + hint */}
        <div className="flex items-center flex-wrap gap-2 sm:gap-3">
        <div className="flex items-center flex-nowrap sm:flex-wrap divide-x divide-black/[.12]">
          <div className="pr-1.5 sm:pr-5">
            <div className="text-[9px] font-bold uppercase tracking-[.1em] text-black mb-0.5 whitespace-nowrap">TWIF SKU</div>
            <div className="text-[12px] sm:text-[13px] font-extrabold font-mono text-[#1A1A18]">{autoCode}</div>
          </div>
          {role !== 'buyer' && (
            <div className="px-1.5 sm:px-5">
              <div className="text-[9px] font-bold uppercase tracking-[.1em] text-black mb-0.5 whitespace-nowrap">Buyer Ref</div>
              <div className="text-[13px] font-bold text-[#1A1A18]" title="Edit this in the Buyer Brief section of SKU Details">
                {brief.buyer_ref || ws?.buyer_ref || '—'}
              </div>
            </div>
          )}
          <div className="px-1.5 sm:px-5">
            <div className="flex items-center gap-1.5 mb-0.5">
              <div className="text-[9px] font-bold uppercase tracking-[.1em] text-black whitespace-nowrap">Vendor Stock #</div>
              {(role === 'merchant' || role === 'supplier') && !isReadOnly && !vendorSkuRef && (ws?.supplier_org_id || sku?.supplier_org_id) && (
                <button
                  type="button"
                  onClick={handleGenerateVendorRef}
                  disabled={generatingVendorRef}
                  className="text-[8px] font-bold uppercase tracking-[.06em] px-1.5 py-0.5 border border-[#6d28d9]/40 text-[#6d28d9] hover:bg-[#6d28d9]/10 transition-colors disabled:opacity-40"
                >
                  {generatingVendorRef ? '…' : 'Auto'}
                </button>
              )}
            </div>
            {editingVendorRef ? (
              <input
                autoFocus
                value={vendorSkuRef}
                onChange={e => setVendorSkuRef(e.target.value)}
                onBlur={handleSaveVendorSkuRef}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveVendorSkuRef(); if (e.key === 'Escape') { setVendorSkuRef(sku?.vendor_sku_ref || ''); setEditingVendorRef(false) } }}
                disabled={savingVendorRef}
                className="text-[13px] font-bold text-[#1A1A18] bg-transparent border-b border-black outline-none w-28"
              />
            ) : (
              <div
                onClick={() => (role === 'merchant' || role === 'supplier') && !isReadOnly && setEditingVendorRef(true)}
                className={`text-[13px] font-bold text-[#1A1A18] ${(role === 'merchant' || role === 'supplier') && !isReadOnly ? 'cursor-text hover:opacity-60' : ''}`}
                title={(role === 'merchant' || role === 'supplier') && !isReadOnly ? 'Click to edit' : undefined}
              >
                {vendorSkuRef || '—'}
              </div>
            )}
          </div>
          {ws?.status && (
            <div className="px-1.5 sm:px-5">
              <div className="text-[9px] font-bold uppercase tracking-[.1em] text-black mb-0.5 whitespace-nowrap">Status</div>
              <div className="flex items-center gap-1.5">
                <StatusBadge status={ws.status} />
                {/* Phone: the stage-hint 'i' rides next to Status here instead of wrapping to
                    its own line below the SKU columns. */}
                {hint && isPhone && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowStageHint(v => !v)}
                      className="flex items-center justify-center cursor-pointer border-none bg-none text-amber-400 p-0"
                      aria-label="Stage info"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 18" }}>info</span>
                    </button>
                    <div className={`absolute right-0 top-full mt-2 w-64 bg-[#1A1A18] text-white rounded-lg shadow-xl z-50 p-4 transition-opacity
                      ${showStageHint ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'}`}>
                      <span className="text-[11px] font-extrabold uppercase tracking-[.06em] text-amber-400 block mb-2">{hint.title}</span>
                      <p className="text-[12px] text-white/70 leading-relaxed">{hint.body}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {hint && !isPhone && (
          <div className="relative group flex items-center gap-1.5">
            <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-[.04em] whitespace-nowrap">Info</span>
            <button
              type="button"
              onClick={() => setShowStageHint(v => !v)}
              className="flex items-center justify-center transition-all cursor-pointer border-none bg-none text-amber-400 group-hover:text-amber-500"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}>info</span>
            </button>
            <div className={`absolute left-0 top-full mt-2 w-72 bg-[#1A1A18] text-white rounded-lg shadow-xl z-50 p-4 transition-opacity
              ${showStageHint ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible'}`}>
              <span className="text-[11px] font-extrabold uppercase tracking-[.06em] text-amber-400 block mb-2">{hint.title}</span>
              <p className="text-[12px] text-white/70 leading-relaxed">{hint.body}</p>
            </div>
          </div>
        )}
        </div>

        {/* Right: hold/reject/resume, approve, created, close.
            On phones these shrink to one compact row (short labels, tight padding) so the
            status bar barely eats any height and the work area below gets the space. */}
        <div className={`flex items-center flex-wrap ${isPhone ? 'w-full gap-1.5' : 'gap-2 sm:gap-4'}`}>
          {ws && role !== 'supplier' && role !== 'qa' && ['on_hold', 'rejected'].includes(ws.status) && (
            <div className={`relative ${isPhone ? 'flex-1' : ''}`}>
              <button
                type="button"
                onClick={() => setWsHoldRejectAction({ status: 'active' })}
                className={`text-[10px] font-extrabold uppercase tracking-[.06em] border border-black text-black hover:border-[#166534] hover:text-[#166534] cursor-pointer whitespace-nowrap rounded-sm bg-white ${isPhone ? 'w-full px-2 py-1' : 'px-2.5 sm:px-3 py-1.5 sm:py-2'}`}
              >
                Continue
              </button>

              {wsHoldRejectAction && (
                <div className="absolute left-0 top-full mt-2 w-64 bg-white border border-black rounded-md shadow-xl z-20 p-3 flex flex-col gap-3">
                  <div className="text-[11px] font-semibold text-[#1A1A18] leading-snug">
                    Are you sure you want to continue this workspace back to active?
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleWsHoldReject}
                      disabled={submittingWsHoldReject}
                      className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.06em] rounded cursor-pointer border-none disabled:opacity-40 bg-[#166534] text-white"
                    >
                      {submittingWsHoldReject ? 'Saving…' : 'Yes, Confirm'}
                    </button>
                    <button
                      onClick={() => setWsHoldRejectAction(null)}
                      className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[.06em] text-black hover:text-black border-none bg-none cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {ws && !isReadOnly && role !== 'supplier' && role !== 'qa' && !['on_hold', 'rejected'].includes(ws.status) && (
            <div className="relative">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setWsHoldRejectAction({ status: 'on_hold' })}
                  className={`text-[10px] font-extrabold uppercase tracking-[.06em] border border-[#F0B429] text-[#8C3A00] bg-[#FFE8D0] hover:bg-[#FFDCB0] cursor-pointer whitespace-nowrap rounded-sm ${isPhone ? 'px-2 py-1' : 'px-2.5 sm:px-3 py-1.5 sm:py-2'}`}
                >
                  {isPhone ? 'Hold' : 'On Hold'}
                </button>
                <button
                  type="button"
                  onClick={() => setWsHoldRejectAction({ status: 'rejected' })}
                  className={`text-[10px] font-extrabold uppercase tracking-[.06em] border border-[#E57373] text-[#7A1A1A] bg-[#FCEAEA] hover:bg-[#FADBDB] cursor-pointer whitespace-nowrap rounded-sm ${isPhone ? 'px-2 py-1' : 'px-2.5 sm:px-3 py-1.5 sm:py-2'}`}
                >
                  {isPhone ? 'Drop' : 'Drop SKU'}
                </button>
              </div>

              {wsHoldRejectAction && (
                <div className="absolute left-0 top-full mt-2 w-72 bg-white border border-black rounded-md shadow-xl z-20 p-3 flex flex-col gap-3">
                  <div className="text-[11px] font-semibold text-[#1A1A18] leading-snug">
                    Are you sure you want to {wsHoldRejectAction.status === 'on_hold' ? 'mark this workspace on hold' : 'drop this SKU'}?
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="text-[9px] font-bold uppercase tracking-[.08em] text-black">
                      Reason <span className="text-black font-normal normal-case tracking-normal">(optional)</span>
                    </div>
                    <textarea
                      value={wsHoldRejectAction.note || ''}
                      onChange={e => setWsHoldRejectAction(a => ({ ...a, note: e.target.value }))}
                      placeholder="Add a note…"
                      rows={2}
                      className="w-full border border-black rounded px-2.5 py-1.5 text-[11px] text-[#1A1A18] bg-white outline-none resize-none focus:border-black"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleWsHoldReject}
                      disabled={submittingWsHoldReject}
                      className={`px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.06em] rounded cursor-pointer border-none disabled:opacity-40
                        ${wsHoldRejectAction.status === 'on_hold' ? 'bg-[#ebd911] text-[#1A1A18]' : 'bg-[#f12d2d] text-white'}`}
                    >
                      {submittingWsHoldReject ? 'Saving…' : 'Yes, Confirm'}
                    </button>
                    <button
                      onClick={() => setWsHoldRejectAction(null)}
                      className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[.06em] text-black hover:text-black border-none bg-none cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {ws && !briefLocked && (
            <button onClick={handleApproveToSample} className={`text-[10px] font-extrabold uppercase tracking-[.06em] bg-[#1A1A18] text-white cursor-pointer hover:opacity-80 flex items-center gap-1.5 whitespace-nowrap rounded-sm ${isPhone ? 'flex-1 justify-center px-2 py-1' : 'px-3 sm:px-4 py-1.5 sm:py-2'}`}>
              {isPhone ? 'Sample' : 'Proceed to Sample'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          )}
          {createdDate && (
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-[11px] text-black">Created {createdDate}</span>
              {lastStatusMilestone && (
                <span className="text-[10px] text-black">{lastStatusMilestone.label} — {lastStatusMilestone.when}</span>
              )}
            </div>
          )}
          <button
            onClick={() => { closeWorkspace(); const p = new URLSearchParams(searchParams); p.delete('workspace'); setSearchParams(p, { replace: true }) }}
            // ml-auto on mobile only — this row wraps once the other buttons (Continue/Hold/
            // Drop/Approve to Sample) fill the first line, and Back being last in the DOM but
            // with no right-alignment of its own just left it sitting at the LEFT edge of
            // whatever new row it wrapped onto, easy to miss/mistake for a stray button.
            className={`text-[10px] border border-neutral-600 font-extrabold uppercase tracking-[.06em] bg-white text-black hover:bg-neutral-100 cursor-pointer flex items-center gap-1.5 whitespace-nowrap rounded-sm ${isPhone ? 'ml-auto px-2 py-1' : 'px-3 sm:px-4 py-1.5 sm:py-2'}`}
          >
            <span className="sm:hidden">Back</span>
            <span className="hidden sm:inline">Back to Skus Cards</span>
          </button>
        </div>
      </div>

      {workspaceLoading ? (
        <div className="flex-1 flex items-center justify-center text-[10px] font-bold uppercase tracking-[.1em] text-black">
          <span className="inline-block w-4 h-4 border-[1.5px] border-black border-t-black rounded-full animate-spin mr-2" />
          Loading…
        </div>
      ) : (
        <>
          {/* Mobile/tablet pane switcher — panels stack below 1024px, this picks which one shows.
              No `bg-white` on the active tab: the modal root is already white so it added nothing
              visually, but at the workspace's fractional `zoom` it pixel-snapped over the border
              line above the active tab, making that segment look missing. */}
          {isNarrow && (
            <div className="flex border-b border-black flex-shrink-0">
              {[['details', 'Details'], ['activity', 'Activity'], ['media', 'Media', mediaCount]].map(([k, label, count]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMobilePanel(k)}
                  className={`flex-1 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[.06em] cursor-pointer transition-colors border-b-2
                    ${mobilePanel === k ? 'border-[#7c3aed] text-[#1A1A18]' : 'border-transparent text-black hover:text-black'}`}
                >
                  {label}{count != null ? ` ${count}` : ''}
                </button>
              ))}
            </div>
          )}
        <div
          className={`flex flex-1 min-h-0 overflow-hidden relative ${isNarrow ? 'flex-col' : ''}`}
          style={isNarrow ? undefined : { display: 'grid', gridTemplateColumns: `${leftWidth}px 1fr ${mediaWidth}px`, columnGap: '6px' }}
        >
          {/* Column resize grips — centred on each seam. Live here (outside the overflow-hidden
              panes) so the chip never gets clipped; x is the middle of the 6px column gap. */}
          {!isNarrow && (
            <>
              <ResizeGrip onMouseDown={onDragStart} style={{ left: leftWidth + 3 }} />
              <ResizeGrip onMouseDown={onMediaDragStart} style={{ left: `calc(100% - ${mediaWidth + 3}px)` }} />
            </>
          )}

          {/* ── Left panel ── */}
          <div className={`flex-col overflow-hidden relative ${isNarrow ? (mobilePanel === 'details' ? 'flex flex-1 w-full' : 'hidden') : 'flex border-r border-gray-400'}`}>
            {/* Tab switcher — fixed h-11 matches the chat tab row and the media panel header
                so all three header rows' bottom borders land on the same line across columns */}
            <div className="h-11 flex border-b border-black flex-shrink-0">
              {[
              ['details', 'SKU Details'],
              ...(['approved','sample','sample_shipped','production'].includes(ws?.status) ? [['sample', 'Sample']] : []),
              // Shipping only shows once the buyer has actually accepted the sample
              // (sample/sample_shipped/production status) — that's when shipping actually needs to start.
              ...(['sample', 'sample_shipped', 'production'].includes(ws?.status) ? [['shipping', 'Shipping']] : []),
            ].map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveTab(t)}
                  className={`h-full flex items-center justify-center px-4 text-[10px] font-bold uppercase tracking-[.06em] cursor-pointer transition-colors flex-1 border-b-2
                    ${activeTab === t ? 'border-[#7c3aed] text-[#1A1A18] bg-white' : 'border-transparent text-black bg-transparent hover:text-black'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={`flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-4 ${isPhone ? 'p-3' : 'p-4'}`}>
              {!ws && sku && (workspaceLoading || sku.workspace_id) ? (
                <div className="flex flex-col gap-4 animate-pulse">
                  <div className="flex gap-4">
                    <div className="w-[240px] h-[240px] flex-shrink-0 bg-black/[.06] rounded" />
                    <div className="flex flex-col gap-3 flex-1 pt-1">
                      <div className="h-4 bg-black/[.06] rounded w-3/4" />
                      <div className="h-3 bg-black/[.06] rounded w-1/2" />
                      <div className="h-3 bg-black/[.06] rounded w-2/3" />
                      <div className="h-3 bg-black/[.06] rounded w-1/3" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {[1,2,3,4].map(i => <div key={i} className="h-8 bg-black/[.04] rounded" />)}
                  </div>
                </div>
              ) : activeTab === 'details' ? (
                <>
                  <div className="text-[10px] font-bold uppercase tracking-[.1em] text-black">Product Info</div>
                  {/* Image + participants — side by side on desktop/tablet, stacked only on
                      phones so the invite rows get the full pane width instead of a squeezed
                      column. Tablets kept the side-by-side layout, which fit fine there. */}
                  <div className={isPhone ? 'flex flex-col gap-4' : 'flex gap-4'}>
                    {/* Image */}
                    <div className={`bg-[#EDEAE4] overflow-hidden flex items-center justify-center ${isPhone ? 'w-full max-w-[280px] aspect-square self-center' : 'w-[240px] h-[240px] flex-shrink-0'}`}>
                      {sku?.image_url || ws?.image_url
                        ? <img src={sku?.image_url || ws?.image_url} alt={autoCode} onClick={e => { e.stopPropagation(); openLightbox([sku?.image_url || ws?.image_url]) }} className="w-full h-full object-cover cursor-zoom-in" />
                        : <div className="w-12 h-12 bg-black/[.08] rounded" />
                      }
                    </div>

                    {/* Description + details */}
                    <div className="flex flex-col gap-3 flex-1 min-w-0">
                      {/* Title */}
                      <div className="text-[15px] font-extrabold uppercase leading-tight tracking-[.01em]">{displayName}</div>

                      {/* Badges — category + season only. Buyer / vendor org names are shown
                          next to their invite rows below, no need to repeat them here. */}
                      <div className="flex gap-1.5 flex-wrap">
                        {category && <span className="text-[9px] font-bold px-2 py-0.5 bg-[#e8f0ff] text-[#3b5bdb] uppercase tracking-[.06em] rounded-full">{category}</span>}
                        {season && <span className="text-[9px] font-bold px-2 py-0.5 bg-[#f3e8ff] text-[#6d28d9] uppercase tracking-[.06em] rounded-full">{season}</span>}
                      </div>

                      {/* Participants — merchant invites the buyer/vendor here; buyer & supplier
                          see who else is on the workspace. (Replaces the old spec grid — those
                          fields live as editable rows in the Buyer Brief section below.) */}
                      <div className="flex flex-col">
                        {/* Full access (creator OR a paired peer merchant via merchant_access_pairs)
                        can invite — only the admin's cross-member read-only view is blocked. */}
                    {role === 'merchant' && !isReadOnly && <>
                      <InviteRow label="Buyer"  invites={ws?.buyer_invites    || []} orgName={ws?.buyer_org_name    || sku?.upload_buyer_org_name} fixedDomain={buyerOrgDomain}    orgId={buyerOrgId}                                  workspaceId={ws?.id} onInvite={handleInviteBuyer}  onRevoke={ws?.id ? (inviteId) => revokeInvite(ws.id, inviteId) : undefined} onRevealLink={ws?.id ? (inviteId) => revealInviteLink(ws.id, inviteId) : undefined} />
                      <InviteRow label="Vendor" invites={ws?.supplier_invites || []} orgName={ws?.supplier_org_name || sku?.supplier}                fixedDomain={supplierOrgDomain} orgId={ws?.supplier_org_id || sku?.supplier_org_id} workspaceId={ws?.id} onInvite={handleInviteVendor} onRevoke={ws?.id ? (inviteId) => revokeInvite(ws.id, inviteId) : undefined} onRevealLink={ws?.id ? (inviteId) => revealInviteLink(ws.id, inviteId) : undefined} lockedMsg={!ws?.buyer_member_id ? (ws?.buyer_invites?.length ? 'Waiting for buyer to accept before you can invite a vendor' : 'Invite a buyer first to activate the workspace') : null} />
                      {/* QA — internal merchant-org colleagues only (department 'qa'), Group
                          Chat + read-only access. No fixedDomain (not email-domain scoped like
                          buyer/vendor) and no lockedMsg (doesn't wait on buyer/vendor activation
                          — can be invited at any workspace stage). */}
                      <InviteRow label="QA" invites={ws?.qa_invites || []} orgName={null} orgId={myOrgId} orgDepartment="qa" workspaceId={ws?.id} onInvite={handleInviteQa} onRevoke={ws?.id ? (inviteId) => revokeInvite(ws.id, inviteId) : undefined} onRevealLink={ws?.id ? (inviteId) => revealInviteLink(ws.id, inviteId) : undefined} />
                    </>}
                    {/* Read-only "who's involved" summary — the read-only merchant view
                        (owner) above, AND the QA role, which never gets the editable
                        InviteRow section at all (that's merchant-only) but should still be
                        able to see who the merchant/buyer/vendor actually are. No onInvite/
                        onRevoke/onRevealLink passed to InviteRow here — it renders in pure
                        display mode with no interactive controls either way. */}
                    {((role === 'merchant' && isReadOnly) || role === 'qa') && ws?.id && (
                      <>
                        {/* Merchant is always known once a workspace exists — shown first so a
                            read-only viewer (owner) sees who actually owns this workspace, not
                            just who's been invited into it. */}
                        {ws?.merchant_name && (
                          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap py-2.5 border-b border-black min-w-0"><span className="text-[10px] font-bold uppercase tracking-[.1em] text-black w-16 flex-shrink-0">Merchant</span><span className="text-[12px] text-[#1A1A18] font-medium break-words min-w-0">{ws.merchant_name}</span>{ws.merchant_email && <span className="text-[10px] text-black font-mono break-all min-w-0">{ws.merchant_email}</span>}</div>
                        )}
                        {(ws?.buyer_invites?.length > 0)
                          ? <InviteRow label="Buyer"  invites={ws.buyer_invites}    orgName={ws?.buyer_org_name    || sku?.upload_buyer_org_name} />
                          : ws?.buyer_email && <div className="flex items-center gap-x-4 gap-y-1 flex-wrap py-2.5 border-b border-black min-w-0"><span className="text-[10px] font-bold uppercase tracking-[.1em] text-black w-16 flex-shrink-0">Buyer</span><span className="text-[12px] text-[#1A1A18] font-medium break-words min-w-0">{ws.buyer_name || ws.buyer_email}</span>{ws.buyer_name && <span className="text-[10px] text-black font-mono break-all min-w-0">{ws.buyer_email}</span>}{ws?.buyer_org_name && <span className="text-[10px] text-black">{ws.buyer_org_name}</span>}</div>
                        }
                        {(ws?.supplier_invites?.length > 0)
                          ? <InviteRow label="Vendor" invites={ws.supplier_invites} orgName={ws?.supplier_org_name || sku?.supplier} />
                          : ws?.supplier_email && <div className="flex items-center gap-x-4 gap-y-1 flex-wrap py-2.5 border-b border-black min-w-0"><span className="text-[10px] font-bold uppercase tracking-[.1em] text-black w-16 flex-shrink-0">Vendor</span><span className="text-[12px] text-[#1A1A18] font-medium break-words min-w-0">{ws.supplier_name || ws.supplier_email}</span>{ws.supplier_name && <span className="text-[10px] text-black font-mono break-all min-w-0">{ws.supplier_email}</span>}{ws?.supplier_org_name && <span className="text-[10px] text-black">{ws.supplier_org_name}</span>}</div>
                        }
                        {/* QA row: interactive for a QA viewer themselves (the one deliberate
                            exception — a QA member can invite/revoke/reveal-link for OTHER QA
                            members, nothing else), plain display for the merchant's read-only
                            view. Same handlers the merchant's own QA InviteRow above uses —
                            the backend now permits an actorRole==='qa' caller sending/revoking
                            a role==='qa' invite specifically. */}
                        {role === 'qa'
                          ? <InviteRow label="QA" invites={ws?.qa_invites || []} orgName={null} orgId={myOrgId} orgDepartment="qa" workspaceId={ws?.id} onInvite={handleInviteQa} onRevoke={ws?.id ? (inviteId) => revokeInvite(ws.id, inviteId) : undefined} onRevealLink={ws?.id ? (inviteId) => revealInviteLink(ws.id, inviteId) : undefined} />
                          : ws?.qa_invites?.length > 0 && <InviteRow label="QA" invites={ws.qa_invites} orgName={null} />
                        }
                        {role === 'merchant' && !ws?.buyer_invites?.length && !ws?.buyer_email && !ws?.supplier_invites?.length && !ws?.supplier_email && !ws?.qa_invites?.length && (
                          <div className="text-[10px] text-black/40 py-2.5 border-b border-black">No buyer, vendor, or QA invited yet.</div>
                        )}
                      </>
                    )}

                    {/* Unit price */}
                    {/* <div className="flex items-center gap-x-4 gap-y-1 flex-wrap py-2.5 border-b border-black min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-[.1em] text-black w-16 flex-shrink-0">Unit Price ($)</span>
                      <input
                        placeholder="Enter Price"
                        className="flex-1 text-[12px] font-medium text-[#1A1A18] bg-transparent border-none outline-none placeholder:text-black/25"
                      />
                    </div> */}
                  </div>

                  {/* Buyer view: merchant who invited + this workspace's buyer + co-buyers */}
                  {(role === 'buyer' || masterKeyActive) && ws?.id && (
                    <div className="flex flex-col">
                      {(ws?.merchant_name || ws?.merchant_email) && (
                        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap py-2.5 border-b border-black min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-black w-16 flex-shrink-0">From</span>
                          <span className="text-[12px] text-[#1A1A18] font-medium break-words min-w-0">{ws.merchant_name || ws.merchant_email}</span>
                          {ws.merchant_name && <span className="text-[10px] text-black font-mono break-all min-w-0">{ws.merchant_email}</span>}
                        </div>
                      )}
                      {(ws?.buyer_name || ws?.buyer_email || ws?.buyer_org_name) && (
                        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap py-2.5 border-b border-black min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-black w-16 flex-shrink-0">Buyer</span>
                          <span className="text-[12px] text-[#1A1A18] font-medium break-words min-w-0">{ws.buyer_name || ws.buyer_email}</span>
                          {ws.buyer_name && <span className="text-[10px] text-black font-mono break-all min-w-0">{ws.buyer_email}</span>}
                          {ws?.buyer_org_name && <span className="text-[10px] text-black">{ws.buyer_org_name}</span>}
                        </div>
                      )}
                      {(() => {
                        // Exclude the current viewer specifically — not just the workspace's primary
                        // buyer — so a co-buyer viewing their own workspace doesn't see themselves
                        // listed back in their own "Co-Buyers" row.
                        const coBuyers = (ws?.buyer_invites || []).filter(i => i.status === 'accepted' && i.member_id !== memberId)
                        if (!coBuyers.length) return null
                        return (
                          <div className="flex items-start gap-4 py-2.5 border-b border-black">
                            <span className="text-[10px] font-bold uppercase tracking-[.1em] text-black w-16 flex-shrink-0 pt-0.5">Co-Buyers</span>
                            <div className="flex flex-col gap-1">
                              {coBuyers.map(inv => (
                                <div key={inv.id} className="flex items-center gap-2">
                                  <span className="text-[12px] text-[#1A1A18] font-medium break-words min-w-0">{inv.name || inv.email}</span>
                                  {inv.name && <span className="text-[10px] text-black font-mono break-all min-w-0">{inv.email}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {/* Supplier view: merchant who invited + own vendor org */}
                  {(role === 'supplier' || masterKeyActive) && ws?.id && (
                    <div className="flex flex-col">
                      {(ws?.merchant_name || ws?.merchant_email) && (
                        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap py-2.5 border-b border-black min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-black w-16 flex-shrink-0">From</span>
                          <span className="text-[12px] text-[#1A1A18] font-medium break-words min-w-0">{ws.merchant_name || ws.merchant_email}</span>
                          {ws.merchant_name && <span className="text-[10px] text-black font-mono break-all min-w-0">{ws.merchant_email}</span>}
                        </div>
                      )}
                      {(ws?.supplier_name || ws?.supplier_email || ws?.supplier_org_name) && (
                        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap py-2.5 border-b border-black min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-black w-16 flex-shrink-0">Vendor</span>
                          <span className="text-[12px] text-[#1A1A18] font-medium break-words min-w-0">{ws.supplier_name || ws.supplier_email}</span>
                          {ws.supplier_name && <span className="text-[10px] text-black font-mono break-all min-w-0">{ws.supplier_email}</span>}
                          {ws?.supplier_org_name && <span className="text-[10px] text-black">{ws.supplier_org_name}</span>}
                        </div>
                      )}
                    </div>
                  )}
                    </div>{/* /right column */}
                  </div>{/* /image + participants row */}

                  {/* Notice — shown only when no buyer invited yet and not read-only */}
                  {role === 'merchant' && !isReadOnly && !ws?.buyer_email && !ws?.buyer_member_id && (
                    <div className="border-l-[3px] border-black bg-black/[.03] px-3 py-2.5 rounded-r">
                      <div className="text-[9px] font-extrabold uppercase tracking-[.08em] text-black mb-1">Activate Workspace</div>
                      <div className="text-[11px] text-black leading-relaxed">
                        Invite a buyer to activate the workspace — once a buyer joins, you'll be able to collaborate on briefs and manage samples together.
                      </div>
                    </div>
                  )}

                  {/* ── Buyer Brief section ── */}
                  <div className="text-[10px] font-bold uppercase tracking-[.1em] text-black pt-3 mt-1 border-t border-black/10">{role === 'buyer' ? 'My Brief' : 'Buyer Brief'}</div>
                  <div className="flex flex-col gap-4">

                  {/* Brief reminder */}
                  {role === 'buyer' && !briefLocked && (
                    <div className="border-l-[3px] border-[#7c3aed] bg-[#f5f0ff] px-3 py-2.5 rounded-r">
                      <div className="text-[9px] font-extrabold uppercase tracking-[.08em] text-[#6d28d9] mb-1">Before you approve</div>
                      <div className="text-[11px] text-[#4c1d95] leading-relaxed">
                        Fill in your product requirements here so the vendor knows exactly what you need.
                      </div>
                    </div>
                  )}

                  {/* Top: image + ref + description */}
                  <div className={isPhone ? 'flex flex-col gap-3' : 'flex gap-4'}>
                    <div className={`bg-white overflow-hidden rounded flex items-center justify-center ${isPhone ? 'w-full max-w-[240px] aspect-square self-center' : 'flex-shrink-0 w-[200px] h-[200px]'} ${briefErrors.has('image_url') ? 'ring-2 ring-red-400' : ''}`}>
                      {ws?.buyer_brief?.image_url
                        ? <img src={ws.buyer_brief.image_url} onClick={e => { e.stopPropagation(); openLightbox([ws.buyer_brief.image_url]) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                        : <div className={`text-[9px] font-semibold uppercase tracking-[.05em] text-center px-4 leading-relaxed ${briefErrors.has('image_url') ? 'text-red-400' : 'text-black'}`}>
                            Pin a reference<br/>from media drawer
                            {briefErrors.has('image_url') && <div className="mt-1 font-normal normal-case">required</div>}
                          </div>
                      }
                    </div>

                    {/* Buyer Reference / Description / Colour — previously three different label
                        sizes (10/12/11px) and three different value treatments (an 18px-bold
                        borderless input, a plain textarea, an underlined input), so they read
                        as inconsistent even though they're all just "a labeled field" like
                        everything in the row list below. Unified to one label size/weight and
                        one value size, and every field now gets the same border-b instead of
                        some having it, one having a plain divider, and one having neither. */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1 pt-1">
                      {role !== 'supplier' && role !== 'qa' && (
                        <>
                          <div className="flex items-center justify-between mb-0.5">
                            <div className={`text-[10px] font-bold uppercase tracking-[.08em] ${briefErrors.has('buyer_ref') ? 'text-red-500' : 'text-[#6d28d9]'}`}>
                              {role === 'buyer' ? 'My Reference *' : 'Buyer Reference *'}
                              {briefErrors.has('buyer_ref') && <span className="ml-1 text-[10px] font-normal text-red-400 normal-case">required</span>}
                            </div>
                            {!briefLocked && !brief.buyer_ref && buyerOrgId && (
                              <button
                                type="button"
                                onClick={handleGenerateBuyerRef}
                                disabled={generatingRef}
                                className="text-[8px] font-bold uppercase tracking-[.06em] px-1.5 py-0.5 border border-[#6d28d9]/40 text-[#6d28d9] hover:bg-[#6d28d9]/10 transition-colors disabled:opacity-40"
                              >
                                {generatingRef ? '…' : 'Auto'}
                              </button>
                            )}
                          </div>
                          <input
                            value={brief.buyer_ref}
                            onChange={e => { if (briefLocked) return; setBrief(b => ({ ...b, buyer_ref: e.target.value })); setBriefErrors(s => { const n = new Set(s); n.delete('buyer_ref'); return n }) }}
                            readOnly={briefLocked}
                            placeholder="Your internal SKU / ref code"
                            className={`text-[13px] font-semibold text-[#1A1A18] bg-transparent outline-none placeholder:text-black/25 placeholder:font-normal w-full mb-2 border-b pb-0.5
                              ${briefErrors.has('buyer_ref') ? 'border-red-300 placeholder:text-red-300' : 'border-black'}
                              ${briefLocked ? 'cursor-default' : ''}`}
                          />
                        </>
                      )}
                      <div className={`text-[10px] font-bold uppercase tracking-[.08em] mb-0.5 ${briefErrors.has('description') ? 'text-red-500' : 'text-black'}`}>
                        Description{briefErrors.has('description') && <span className="ml-1 text-[10px] font-normal text-red-400 normal-case">required</span>}
                      </div>
                      <textarea
                        ref={descriptionRef}
                        value={brief.description}
                        onChange={e => { if (briefLocked) return; setBrief(b => ({ ...b, description: e.target.value })); setBriefErrors(s => { const n = new Set(s); n.delete('description'); return n }) }}
                        readOnly={briefLocked}
                        placeholder="What are you looking for?"
                        // min-h-[40px] (~2 lines) was clamping the box to that height even for
                        // one short word — the auto-grow effect (descriptionRef) sets an exact
                        // style.height off scrollHeight, but a CSS min-height always wins over a
                        // smaller explicit height, so it visibly floated well above the border
                        // no matter how little text there was. ~1 line is still a sane floor for
                        // the empty/placeholder state without reserving space nothing needs.
                        className={`text-[13px] uppercase text-[#1A1A18] bg-transparent outline-none resize-none leading-relaxed placeholder:text-black/25 placeholder:normal-case w-full min-w-0 rounded overflow-hidden min-h-[22px] mb-2 border-b pb-0.5 ${briefErrors.has('description') ? 'border-red-300 placeholder:text-red-300' : 'border-black'} ${briefLocked ? 'cursor-default' : ''}`}
                        rows={1}
                      />
                      <div className={`text-[10px] font-bold uppercase tracking-[.08em] mb-0.5 ${briefErrors.has('color') ? 'text-red-500' : 'text-black'}`}>
                        Colour{briefErrors.has('color') && <span className="ml-1 text-[10px] font-normal text-red-400 normal-case">required</span>}
                      </div>
                      <input
                        value={brief.color}
                        onChange={e => { if (briefLocked) return; setBrief(b => ({ ...b, color: e.target.value })); setBriefErrors(s => { const n = new Set(s); n.delete('color'); return n }) }}
                        readOnly={briefLocked}
                        placeholder="e.g. Terracotta, Off-white…"
                        className={`text-[13px] uppercase text-[#1A1A18] bg-transparent outline-none w-full placeholder:text-black/25 placeholder:normal-case border-b pb-0.5
                          ${briefErrors.has('color') ? 'border-red-300 placeholder:text-red-300' : 'border-black'}
                          ${briefLocked ? 'cursor-default text-black' : ''}`}
                      />
                    </div>
                  </div>

                  {/* ClickUp-style field rows */}
                  <div className="flex flex-col -mx-2">
                    {(() => {
                      const clearErr = (f) => setBriefErrors(s => { const n = new Set(s); n.delete(f); return n })
                      return (<>
                        <BriefRow icon={<IconMaterial />}  label="Material"        brief={brief} field="material"      setBrief={setBrief} placeholder="Empty"                  readOnly={briefLocked} hasError={briefErrors.has('material')}   onClearError={clearErr} multiline valueUppercase />
                        <BriefRow icon={<IconDimension />} label="Dimensions"      brief={brief} field="dimensions"    setBrief={setBrief} placeholder="e.g. 30×20×15 cm or 25–35 cm" readOnly={briefLocked} uppercase={false} />
                        <BriefRow icon={<IconQty />}       label="Weight"          brief={brief} field="weight"        setBrief={setBrief} placeholder="Optional"               readOnly={briefLocked} type="number"
                          after={<span className="text-[11px] text-black ml-0.5">kg</span>}
                        />
                        <BriefRow icon={<IconFinish />}    label="Finish"          brief={brief} field="finish"        setBrief={setBrief} placeholder="Optional"               readOnly={briefLocked} multiline valueUppercase />
                        {(() => {
                          const origPrice = sku?.original_price ?? ws?.original_price
                          if (origPrice == null || origPrice === '') return null
                          const origCur = sku?.original_currency || ws?.original_currency || 'USD'
                          return (
                            <div className="flex items-start gap-2 px-2 py-1.5 rounded-md">
                              <div className="flex items-center gap-2 w-[162px] flex-shrink-0 pt-0.5">
                                <span className="text-black" style={{ flexShrink: 0 }}><IconPrice /></span>
                                <span className="text-[12px] font-bold truncate uppercase text-black">Price</span>
                              </div>
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-[13px] text-[#1A1A18]">{(CURRENCY_SYMBOLS[origCur] || origCur || '$')}{origPrice}</span>
                              </div>
                            </div>
                          )
                        })()}
                        <BriefRow icon={<IconPrice />} label="Target Price" brief={brief} field="unit_price" setBrief={setBrief} placeholder="Empty" readOnly={briefLocked || role === 'supplier'} hasError={briefErrors.has('unit_price')} onClearError={clearErr} type="number" step="0.01"
                          after={
                            // sm: and up keeps the exact original markup/classes untouched
                            // (mobile only, by request) — zero risk of shifting anything on a
                            // wider screen. On mobile, `after` now holds ONLY the currency
                            // select; "Approved Price" moved to its own full row below instead
                            // of being squeezed in beside it — wrapping it inline still looked
                            // cramped/badly grouped with the select right next to it.
                            <>
                              <select
                                value={brief.currency || 'USD'}
                                onChange={e => setBrief(b => ({ ...b, currency: e.target.value }))}
                                disabled={briefLocked || role === 'supplier'}
                                className="sm:hidden w-16 text-[13px] leading-[1.2] text-[#1A1A18] bg-transparent border-b border-black outline-none cursor-pointer hover:text-black disabled:cursor-default"
                              >
                                {['USD','GBP','EUR'].map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                              <div className="hidden sm:grid sm:grid-cols-[64px_1fr] items-center gap-1 w-full">
                                <select
                                  value={brief.currency || 'USD'}
                                  onChange={e => setBrief(b => ({ ...b, currency: e.target.value }))}
                                  disabled={briefLocked || role === 'supplier'}
                                  className="w-16 text-[13px] leading-[1.2] text-[#1A1A18] bg-transparent border-b border-black outline-none cursor-pointer hover:text-black disabled:cursor-default"
                                >
                                  {['USD','GBP','EUR'].map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                {ws?.sampleOrder?.confirmed_price != null && (
                                  <span className="ml-10 grid grid-cols-[96px_1fr] gap-4 items-center whitespace-nowrap">
                                    <span className="text-[12px] font-bold uppercase text-[#1A1A18]">Approved Price</span>
                                    <span className="text-[13px] text-[#1A1A18]">{CURRENCY_SYMBOLS[ws.sampleOrder.currency || brief.currency] || ws.sampleOrder.currency || brief.currency || '$'}{ws.sampleOrder.confirmed_price}</span>
                                  </span>
                                )}
                              </div>
                            </>
                          }
                        />
                        {/* Mobile-only "Approved Price" row — see note above. Same plain
                            icon/label/value pattern as the static "Price" row above, not the
                            badge this was before — it should read as just another field in the
                            list, not a visually distinct callout. */}
                        {ws?.sampleOrder?.confirmed_price != null && (
                          <div className="sm:hidden flex items-start gap-2 px-2 py-1.5 rounded-md">
                            <div className="flex items-center gap-2 w-[162px] flex-shrink-0 pt-0.5">
                              <span className="text-black" style={{ flexShrink: 0 }}><IconPrice /></span>
                              <span className="text-[12px] font-bold truncate uppercase text-black">Approved Price</span>
                            </div>
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-[13px] text-[#1A1A18]">{CURRENCY_SYMBOLS[ws.sampleOrder.currency || brief.currency] || ws.sampleOrder.currency || brief.currency || '$'}{ws.sampleOrder.confirmed_price}</span>
                            </div>
                          </div>
                        )}
                        <BriefRow icon={<IconQty />}       label="Unit Qty"        brief={brief} field="unit_qty"      setBrief={setBrief} placeholder="Empty"                  readOnly={briefLocked} hasError={briefErrors.has('unit_qty')}   onClearError={clearErr} type="number" step="1"
                          after={
                            ws?.sampleOrder?.confirmed_qty != null && (
                              <div className="hidden sm:grid sm:grid-cols-[64px_1fr] items-center gap-1 w-full">
                                <span aria-hidden="true" />
                                <span className="ml-10 grid grid-cols-[96px_1fr] gap-4 items-center whitespace-nowrap">
                                  <span className="text-[12px] font-bold uppercase text-[#1A1A18]">Approved Qty</span>
                                  <span className="text-[13px] text-[#1A1A18]">{ws.sampleOrder.confirmed_qty}</span>
                                </span>
                              </div>
                            )
                          }
                        />
                        {/* Mobile-only "Approved Qty" row — see note above Target Price. */}
                        {ws?.sampleOrder?.confirmed_qty != null && (
                          <div className="sm:hidden flex items-start gap-2 px-2 py-1.5 rounded-md">
                            <div className="flex items-center gap-2 w-[162px] flex-shrink-0 pt-0.5">
                              <span className="text-black" style={{ flexShrink: 0 }}><IconQty /></span>
                              <span className="text-[12px] font-bold truncate uppercase text-black">Approved Qty</span>
                            </div>
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-[13px] text-[#1A1A18]">{ws.sampleOrder.confirmed_qty}</span>
                            </div>
                          </div>
                        )}
                        {/* Notes — rich note (formatted text + inline images), same editor as
                            chat notes. Renders read-only HTML until you click Edit. Value =
                            brief.notes, falling back to the SKU's own note before a workspace
                            exists (backend copies it into buyer_brief.notes on workspace create).
                            The "Save Brief" button below persists edits. */}
                        {(() => {
                          const notesValue = brief.notes
                            || (typeof sku?.notes === 'string' ? sku.notes : (sku?.notes?.html || ''))
                          // A tag OR a bare entity (&nbsp; from a trailing space in the editor)
                          // means this is note HTML — route it to the sanitize/render branch so
                          // the browser decodes the entity instead of printing it literally.
                          const notesIsHtml = /<[a-z][\s\S]*>/i.test(notesValue) || /&[a-z#0-9]+;/i.test(notesValue)
                          // Compact-chip preview for the collapsed ("brief") state: every inline
                          // image (not just the first) as small stacked thumbnails + the plain-text
                          // content, so a note with a photo (or several) doesn't blow up the panel
                          // height by default.
                          const notesImgSrcs = notesIsHtml
                            ? Array.from(notesValue.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)).map(m => m[1])
                            : []
                          const notesPreviewText = notesIsHtml
                            ? notesValue.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
                            : notesValue
                          // The chip below always reflects the last SAVED note — a draft from a
                          // previous Hide lives only in localStorage and can genuinely differ,
                          // so flag it instead of leaving that mismatch as a silent surprise.
                          let hasPendingNoteDraft = false
                          if (ws?.id) {
                            try {
                              const raw = localStorage.getItem(`plm_note_draft_ws:${ws.id}`)
                              const draft = raw ? JSON.parse(raw) : null
                              hasPendingNoteDraft = !!draft?.html && draft.html !== (notesValue || '')
                            } catch { /* ignored — localStorage/JSON failures just mean no badge */ }
                          }
                          return (
                        <div className="flex items-start gap-2 px-2 py-1.5">
                          <div className="flex items-center gap-2 w-[162px] flex-shrink-0 pt-0.5">
                            <span className="text-black" style={{ flexShrink: 0 }}><IconNotes /></span>
                            <span className="text-[12px] font-bold uppercase text-black truncate">Notes</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            {hasPendingNoteDraft && !notesEditing && (
                              <div className="mb-1 text-[9px] font-bold uppercase tracking-[.05em] text-[#8a6d1a]">● Unsaved draft — differs from what's shown below</div>
                            )}
                            {notesEditing && !briefLocked && ws?.id ? (
                              <RichNoteEditor
                                initialHtml={notesValue}
                                // Same gap as Edit Attributes' Notes editor had — Hide (without
                                // clicking Done) discarded whatever was typed/inserted since
                                // opening. RichNoteEditor's own localStorage draft mechanism
                                // just needed connecting here too.
                                draftKey={ws?.id ? `plm_note_draft_ws:${ws.id}` : null}
                                clearOnSend={false}
                                sendLabel="Done"
                                showTag={false}
                                onHide={() => setNotesEditing(false)}
                                uploadImage={file => uploadInlineImage(ws?.id, file).then(r => r.url)}
                                onSend={({ html }) => { setBrief(b => ({ ...b, notes: html })); setNotesEditing(false) }}
                              />
                            ) : notesValue && !notesExpanded ? (
                              <button type="button" onClick={() => setNotesExpanded(true)}
                                className="group/notes-chip flex max-w-full items-center gap-1.5 rounded-full border border-[#e5e5e0] bg-[#f7f7f5] py-1 pl-1 pr-3 text-left hover:bg-[#efefec] cursor-pointer">
                                {notesImgSrcs.length > 0 && (
                                  <span className="flex flex-shrink-0 -space-x-2">
                                    {notesImgSrcs.slice(0, 2).map((src, i) => (
                                      <img key={i} src={src} alt=""
                                        className="h-6 w-6 rounded-full border border-white object-cover"
                                        style={{ zIndex: 2 - i }} />
                                    ))}
                                    {notesImgSrcs.length > 2 && (
                                      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white bg-black/10 text-[9px] font-bold text-black">
                                        +{notesImgSrcs.length - 2}
                                      </span>
                                    )}
                                  </span>
                                )}
                                <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[.04em] text-[#1A1A18]">
                                  {notesPreviewText || 'Note'}
                                </span>
                              </button>
                            ) : (
                              <div className="group/notes relative">
                                {/* "Show brief" moved up here (was at the bottom, after the full
                                    note content) — on a long note with an image, that meant
                                    scrolling past everything just to find the button to
                                    collapse it back, easy to miss entirely. */}
                                {notesValue && (
                                  <div className="flex justify-end mb-1">
                                    <button type="button" onClick={() => setNotesExpanded(false)}
                                      className="text-[10px] font-bold uppercase tracking-[.06em] text-white bg-[#1A1A18] px-2 py-1 rounded-sm border-none hover:opacity-80 cursor-pointer">
                                      Show brief
                                    </button>
                                  </div>
                                )}
                                {notesValue && (notesIsHtml
                                  ? <div className="text-[13px] text-[#1A1A18] leading-relaxed break-words [&_img]:max-w-full [&_img]:rounded-md [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(notesValue, RICH_HTML_SANITIZE_CONFIG) }} />
                                  : <div className="text-[13px] text-[#1A1A18] leading-relaxed break-words whitespace-pre-wrap">{notesValue}</div>)}
                                {!briefLocked && ws?.id && (
                                  <div className="mt-1 flex items-center gap-3">
                                    <button type="button" onClick={() => setNotesEditing(true)}
                                      className="text-[10px] font-bold uppercase tracking-[.06em] text-[#7c3aed] hover:underline cursor-pointer">
                                      {notesValue ? 'Edit note' : '+ Add note'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                          )
                        })()}
                      </>)
                    })()}
                  </div>

                  {/* Save */}
                  {isReadOnly ? (
                    <div className="flex items-center justify-center gap-2 py-2.5 border border-black rounded-sm text-[11px] font-bold uppercase tracking-[.1em] text-black">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      Read only — admin view
                    </div>
                  ) : briefLocked ? (
                    <div className="flex items-center justify-center gap-2 py-2.5 border border-black rounded-sm text-[11px] font-bold uppercase tracking-[.1em] text-black">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      {briefLockedForApproval ? 'Brief locked — approved to sample' : 'Brief locked — vendor view'}
                    </div>
                  ) : !ws?.id ? (
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-[#fffbeb] border border-amber-200 rounded text-[11px] text-amber-800 leading-relaxed">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-px text-amber-500">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <span className="min-w-0">No workspace yet — edit these on the SKU card via <strong className="font-semibold">Edit Attributes</strong>. They seed the brief once it&apos;s created.</span>
                    </div>
                  ) : (
                    <button
                      onClick={handleSaveBrief}
                      disabled={savingBrief}
                      className="w-full py-2.5 bg-[#1A1A18] text-white text-[11px] font-extrabold uppercase tracking-[.1em] cursor-pointer hover:opacity-80 disabled:opacity-40 rounded-sm"
                    >
                      {savingBrief ? 'Saving…' : 'Save Brief'}
                    </button>
                  )}

                  {/* Workspace exists but brief never saved — fields still show product-info fallbacks */}
                  {ws?.id && !ws?.buyer_brief && (
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-[#fffbeb] border border-amber-200 rounded text-[11px] text-amber-800 leading-relaxed">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-px text-amber-500">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <span className="min-w-0">Fields are pre-filled from the product info. Edit them to match your design requirements and click <strong className="font-semibold">Save Brief</strong> to confirm.</span>
                    </div>
                  )}
                  </div>{/* /Buyer Brief section */}
                </>
              ) : null}

              {/* ── Sample tab ── */}
              {activeTab === 'sample' && (() => {
                const so = ws?.sampleOrder
                if (!so) return (
                  <div className="flex-1 flex items-center justify-center text-[11px] font-bold uppercase tracking-[.1em] text-black">
                    No sample order found
                  </div>
                )

                const SAMPLE_STATUSES = [
                  { key: 'in_process', label: 'In Development', shortLabel: 'Development', color: 'bg-[#fff3e0] text-[#e65100] border-[#e65100]' },
                  { key: 'ready',      label: 'Ready',      shortLabel: 'Ready',   color: 'bg-[#dcfce7] text-[#166534] border-[#166534]' },
                  { key: 'on_hold',    label: 'On Hold',    shortLabel: 'Hold',    color: 'bg-[#fef2f2] text-[#991b1b] border-[#991b1b]' },
                  { key: 'dropped',    label: 'Dropped',    shortLabel: 'Dropped', color: 'bg-[#f1f5f9] text-[#475569] border-[#475569]' },
                ]

                const handleStatusChange = (newStatus) => {
                  if (so.sample_status === newStatus) return
                  if (newStatus === 'ready' && !so.target_ready_date) {
                    toast('Set a target ready date before marking the sample ready')
                    return
                  }
                  if (newStatus === 'on_hold' || newStatus === 'dropped') {
                    setHoldDropAction({ status: newStatus, note: '' })
                    return
                  }
                  const wasDropped = so.sample_status === 'dropped'
                  const statusUpdate = { sample_status: newStatus }
                  // Stamp the actual ready date the moment the sample is marked Ready, so the
                  // Shipping tab has a real "when did this actually get ready" timestamp instead
                  // of relying on the merchant to fill it in separately.
                  if (newStatus === 'ready' && !so.actual_ready_date) {
                    statusUpdate.actual_ready_date = new Date().toISOString().slice(0, 10)
                  }
                  updateSampleOrder(so.id, ws.id, statusUpdate)
                    .then(() => {
                      // Resuming from dropped snapshots the old findings into a new version
                      // server-side — refetch so the "View Previous Findings" dropdown picks it up.
                      if (wasDropped && newStatus === 'in_process') {
                        fetchSampleVersions(ws.id).then(setSampleVersions).catch(() => {})
                      }
                    })
                    .catch(err => toast(err.message))
                }

                const handleHoldDrop = async () => {
                  if (!holdDropAction || submittingHoldDrop) return
                  setSubmittingHoldDrop(true)
                  try {
                    await setHoldDropStatus(so.id, ws.id, holdDropAction.status, holdDropAction.note)
                    setHoldDropAction(null)
                  } catch (err) {
                    toast(err.message)
                  } finally {
                    setSubmittingHoldDrop(false)
                  }
                }

                const handleReadyDateChange = async (val) => {
                  try { await updateSampleOrder(so.id, ws.id, { target_ready_date: val || null }) }
                  catch (err) { toast(err.message) }
                }

                // Master Weight (per carton) is the only optional field — everything else must
                // be filled before findings can be saved, so an incomplete/empty record never
                // gets stored. Master Qty/L/W/H are validated per-carton below instead of as
                // flat fields, since a product can now ship across several cartons.
                const REQUIRED_FINDING_FIELDS = [
                  ['actual_weight', 'Actual Sample Weight (Net)'], ['actual_l', 'Actual Length'], ['actual_w', 'Actual Width'], ['actual_h', 'Actual Height'],
                  ['inner_qty', 'Inner Qty'], ['inner_l', 'Inner Length'], ['inner_w', 'Inner Width'], ['inner_h', 'Inner Height'],
                  ['cbm', 'CBM'],
                ]
                const handleSaveFindings = async () => {
                  if (!findings.sample_images?.length) {
                    toast('Upload at least one sample image before saving findings')
                    return
                  }
                  const missing = REQUIRED_FINDING_FIELDS.filter(([f]) => findings[f] == null || findings[f] === '')
                  const cartons = findings.master_cartons || []
                  const incompleteCarton = !cartons.length || cartons.some(c => !c?.qty || !c?.l || !c?.w || !c?.h)
                  if (missing.length || incompleteCarton) {
                    const missingLabels = missing.map(([, l]) => l)
                    if (incompleteCarton) missingLabels.push('Master Carton details (Qty/L/W/H for every carton)')
                    toast(`Fill in all sample finding details before saving (Master Sample Weight is optional) — missing: ${missingLabels.join(', ')}`)
                    return
                  }
                  // Only send sub-fields actually changed since load — the backend merges this
                  // patch into whatever's currently saved, so another editor's already-saved
                  // findings changes (e.g. a paired merchant) aren't silently reverted.
                  const changedFindings = {}
                  for (const key of Object.keys(findings)) {
                    if (JSON.stringify(findings[key]) !== JSON.stringify(originalFindingsRef.current[key])) {
                      changedFindings[key] = findings[key]
                    }
                  }
                  if (!Object.keys(changedFindings).length) return

                  setSavingFindings(true)
                  try { await saveSampleFindings(so.id, ws.id, changedFindings, { dim: dimUnit, weight: weightUnit }) }
                  catch (err) { toast(err.message) }
                  finally { setSavingFindings(false) }
                }

                const handleImageUpload = async (e) => {
                  const files = Array.from(e.target.files || [])
                  if (!files.length) return
                  setUploadingImages(true)
                  try {
                    await uploadSampleImages(so.id, ws.id, files)
                  } catch (err) { toast(err.message) }
                  finally { setUploadingImages(false); e.target.value = '' }
                }

                const isReady   = so.sample_status === 'ready'
                const isDropped = so.sample_status === 'dropped'
                const currentStatus = SAMPLE_STATUSES.find(s => s.key === so.sample_status)

                // Viewing a past round via the dropdown, or the current round after it's been
                // dropped, is always read-only — editing/uploading only applies to a live round.
                const viewingVersion = selectedVersionId
                  ? sampleVersions.find(v => String(v.version) === selectedVersionId)
                  : null
                const viewFindings    = viewingVersion ? (viewingVersion.findings_json || {}) : findings
                // Vendor knows the real carton dimensions/weights firsthand (they're the one
                // packing and shipping the sample), so they can enter findings too — not just
                // the merchant. Safe to allow here: SKUCard.jsx already blocks a supplier from
                // ever opening a workspace they aren't the accepted/invited vendor for, so
                // reaching this component with role === 'supplier' already implies real access.
                const findingsLocked  = (role !== 'merchant' && role !== 'supplier' && role !== 'qa') || isReadOnly || isDropped || !!viewingVersion
                // Additional Notes is a shared note field (not a findings value), so both
                // merchant and buyer can write to it — only lock it for read-only/dropped/
                // past-version views, not by role.
                const notesLocked     = isReadOnly || isDropped || !!viewingVersion

                return (
                  <div className="flex flex-col gap-5">
                    {/* Status bar */}
                    <div className="flex flex-col gap-2">
                    <div className="flex-1 min-w-0">
                    {(role !== 'merchant' || isReadOnly || ['sample', 'sample_shipped'].includes(ws?.status)) ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-[.08em] text-black">Sample Status</span>
                        <span className="text-[10px] text-black">·</span>
                        <span className={`text-[10px] font-extrabold uppercase tracking-[.06em] px-2.5  rounded-full border ${currentStatus?.color || 'bg-black/[.06] text-black border-transparent'}`}>
                          {currentStatus?.label || so.sample_status || '—'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-[.08em] text-black flex-shrink-0">Sample Status</span>
                        {statusBarCollapsed ? (
                          <>
                            <span className="text-[10px] text-black">·</span>
                            <span className={`text-[10px] font-extrabold uppercase tracking-[.06em] px-2.5 py-0.5 rounded-full border ${currentStatus?.color || 'bg-black/[.06] text-black border-transparent'}`}>
                              {currentStatus?.label || so.sample_status || '—'}
                            </span>
                          </>
                        ) : (
                          <div className={`flex items-center flex-1 ${isPhone ? 'gap-1 flex-nowrap' : 'gap-1.5 flex-wrap'}`}>
                            {SAMPLE_STATUSES.map(({ key, label, shortLabel, color }) => {
                              const locked = key === 'ready' && !so.target_ready_date
                              return (
                              <button
                                key={key}
                                onClick={() => handleStatusChange(key)}
                                disabled={locked}
                                title={locked ? 'Set a target ready date first' : undefined}
                                className={`font-extrabold uppercase rounded-full border transition-all whitespace-nowrap
                                  ${isPhone ? 'px-1.5 py-0.5 text-[8px] tracking-[.02em]' : 'px-3 py-0.5 text-[10px] tracking-[.06em]'}
                                  ${locked ? 'cursor-not-allowed opacity-30' : 'cursor-pointer'}
                                  ${so.sample_status === key
                                    ? `${color} opacity-100`
                                    : 'bg-transparent border-black text-black hover:border-black hover:text-black'}`}
                              >
                                {isPhone ? shortLabel : label}
                              </button>
                            )})}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setStatusBarCollapsed(c => !c)}
                          className="flex-shrink-0 ml-auto text-black hover:text-black cursor-pointer border-none bg-none transition-colors"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points={statusBarCollapsed ? '6 9 12 15 18 9' : '18 15 12 9 6 15'}/>
                          </svg>
                        </button>
                      </div>
                    )}
                    </div>

                    {/* View Previous Findings — lets both roles look back at findings from a
                        round that was later dropped/rejected, once a new round has actually
                        started. While still dropped, "Current" would just be a duplicate of
                        the same round shown in the dropdown — the read-only banner below
                        already shows that data directly, so there's nothing to pick between. */}
                    {sampleVersions.length > 0 && !isDropped && (
                      <div className="flex justify-end">
                        <select
                          value={selectedVersionId}
                          onChange={e => setSelectedVersionId(e.target.value)}
                          className="flex-shrink-0 text-[9px] font-bold uppercase tracking-[.06em] border border-black rounded-full px-2 py-1 bg-white text-black outline-none cursor-pointer max-w-[160px]"
                        >
                          <option value="">Current</option>
                          {sampleVersions.map(v => (
                            <option key={v.version} value={v.version}>
                              Round {v.version} — {new Date(v.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    </div>

                    {/* ── On Hold / Dropped reason input ── */}
                    {holdDropAction && (
                      <div className="flex flex-col gap-2 px-1">
                        <div className="text-[10px] font-bold uppercase tracking-[.08em] text-black">
                          {holdDropAction.status === 'on_hold' ? 'Reason for Hold' : 'Reason for Drop'}
                          <span className="text-black font-normal normal-case tracking-normal ml-1">(optional)</span>
                        </div>
                        <textarea
                          value={holdDropAction.note}
                          onChange={e => setHoldDropAction(a => ({ ...a, note: e.target.value }))}
                          placeholder="Add a note…"
                          rows={2}
                          className="w-full border border-black rounded px-3 py-2 text-[12px] text-[#1A1A18] bg-white outline-none resize-none focus:border-black"
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleHoldDrop}
                            disabled={submittingHoldDrop}
                            className={`px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-[.06em] rounded text-white cursor-pointer border-none disabled:opacity-40
                              ${holdDropAction.status === 'on_hold' ? 'bg-[#991b1b]' : 'bg-[#475569]'}`}
                          >
                            {submittingHoldDrop ? 'Saving…' : `Mark ${holdDropAction.status === 'on_hold' ? 'On Hold' : 'Dropped'}`}
                          </button>
                          <button
                            onClick={() => setHoldDropAction(null)}
                            className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.06em] text-black hover:text-black border-none bg-none cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                         {/* ── Findings (shown when ready, dropped, viewing a past round, or has data) ── */}
                    {(viewingVersion || isReady || isDropped || findings.sample_images?.length > 0 || Object.keys(findings).some(k => k !== 'sample_images' && k !== 'approved_image' && findings[k])) && (
                      <>
                        <div className="h-px bg-black/[.07]" />

                        {isDropped && !viewingVersion && (
                          <div className="text-[11px] text-black font-medium bg-black/[.03] border border-black/10 rounded px-3 py-2.5 leading-relaxed">
                            This round was dropped/rejected — findings below are read-only.{' '}
                            {role === 'merchant' && !isReadOnly && 'Set status back to "In Development" to start a new round.'}
                          </div>
                        )}
                        {viewingVersion && (
                          <div className="text-[11px] text-black font-medium bg-black/[.03] border border-black/10 rounded px-3 py-2.5 leading-relaxed">
                            Viewing Round {viewingVersion.version} (read-only) — switch the dropdown above back to "Current" to resume editing.
                          </div>
                        )}

                        {/* Hidden file inputs */}
                        {role === 'merchant' && !isReadOnly && !findingsLocked && <>
                          <input ref={findingsImageRef}  type="file" multiple accept="image/*" onChange={handleImageUpload} className="hidden" />
                          <input ref={findingsFolderRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" {...{ webkitdirectory: '' }} />
                        </>}

                        {/* Two-column layout: image left, fields right — stacked on mobile
                            (flex-col), side-by-side from sm: up. Without this, the fixed 200px
                            image column left almost no room for the fields column (Confirmed
                            Detail/Buyer Ref/Additional Notes) next to it on a narrow screen. */}
                        <div className="flex flex-col sm:flex-row gap-4">

                          {/* Left: approved image or dropzone */}
                          <div className="w-full max-w-[200px] mx-auto sm:mx-0 sm:w-[200px] sm:flex-shrink-0 flex flex-col gap-2">
                            <div
                              className="w-full aspect-square sm:w-[200px] sm:h-[200px] bg-white overflow-hidden rounded flex items-center justify-center relative group"
                              onClick={() => !findingsLocked && !viewFindings.approved_image && findingsImageRef.current?.click()}
                            >
                              {viewFindings.approved_image ? (
                                <img src={viewFindings.approved_image} onClick={e => { e.stopPropagation(); openLightbox([viewFindings.approved_image, ...(viewFindings.sample_images || []).filter(u => u !== viewFindings.approved_image)]) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                              ) : !findingsLocked ? (
                                <div className="flex flex-col items-center gap-2 text-black cursor-pointer select-none px-4 text-center">
                                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                                  </svg>
                                  <span className="text-[10px] font-semibold uppercase tracking-[.06em] leading-relaxed">Upload sample images</span>
                                </div>
                              ) : (
                                <div className="text-[10px] text-black font-semibold uppercase tracking-[.05em] text-center px-4 leading-relaxed">No image uploaded</div>
                              )}
                            </div>
                            {!findingsLocked && (
                              <div className="flex gap-1.5">
                                <button onClick={() => findingsImageRef.current?.click()} disabled={uploadingImages}
                                  className="flex-1 py-1 text-[9px] font-bold uppercase tracking-[.06em] border border-black rounded text-black hover:border-black hover:text-black cursor-pointer bg-transparent disabled:opacity-40 transition-colors">
                                  {uploadingImages ? 'Uploading…' : 'Files'}
                                </button>
                                <button onClick={() => findingsFolderRef.current?.click()} disabled={uploadingImages}
                                  className="flex-1 py-1 text-[9px] font-bold uppercase tracking-[.06em] border border-black rounded text-black hover:border-black hover:text-black cursor-pointer bg-transparent disabled:opacity-40 transition-colors">
                                  Folder
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Right: confirmed details only — when viewing a past round, show
                              that round's own confirmed price/qty/currency/buyer ref (snapshotted
                              into findings_json under underscore-prefixed keys) instead of the
                              live sample order's, so switching rounds actually shows what changed. */}
                          <div className="flex-1 min-w-0 flex flex-col gap-3 pt-0.5">
                            {(() => {
                              const vf = viewingVersion?.findings_json
                              const dispPrice = vf ? vf._confirmed_price : so.confirmed_price
                              const dispQty   = vf ? vf._confirmed_qty   : so.confirmed_qty
                              const dispCur   = vf ? vf._currency        : so.currency
                              return [[`Approved Price (${CURRENCY_SYMBOLS[dispCur || brief.currency] || dispCur || brief.currency || '$'})`, dispPrice], ['Approved Sample Qty', dispQty]]
                                .filter(([, v]) => v != null).map(([label, val]) => (
                                  <div key={label}>
                                    <div className="text-[9px] font-bold uppercase tracking-[.08em] text-black mb-0.5">{label}</div>
                                    <div className="text-[13px] font-bold text-[#1A1A18]">{val}</div>
                                  </div>
                                ))
                            })()}

                            {/* Sample Observation — a plain top-level column on npd2_sample_orders
                                (qa_comments), not part of the findings jsonb. Not snapshotted per
                                round like findings, so it's only shown for the live/current round. */}
                            {!viewingVersion && (
                              <div className="flex flex-col gap-2 pt-1 border-t border-black/[.07] mt-1">
                                <div className="text-[9px] font-bold uppercase tracking-[.08em] text-black">Sample Observation</div>
                                {findingsLocked ? (
                                  so.qa_comments && (
                                    <div>
                                      <div className="text-[9px] font-bold uppercase tracking-[.08em] text-black mb-0.5">QA Comments</div>
                                      <div className="text-[13px] text-[#1A1A18] leading-relaxed whitespace-pre-line">{so.qa_comments}</div>
                                    </div>
                                  )
                                ) : (
                                  <div className="flex flex-col gap-1.5">
                                    <div className="text-[9px] font-bold uppercase tracking-[.08em] text-black mb-0.5">QA Comments</div>
                                    <textarea
                                      value={qaComments}
                                      onChange={e => setQaComments(e.target.value)}
                                      placeholder="Quality observations about this sample…"
                                      rows={3}
                                      className="text-[13px] text-[#1A1A18] bg-transparent border border-black rounded p-2 outline-none resize-none placeholder:text-black/25 focus:border-black transition-colors"
                                    />
                                    <button
                                      onClick={async () => {
                                        const val = qaComments.trim()
                                        setSavingQaComments(true)
                                        try { await updateSampleOrder(so.id, ws.id, { qa_comments: val || null }) }
                                        catch (err) { toast(err.message) }
                                        finally { setSavingQaComments(false) }
                                      }}
                                      disabled={savingQaComments || qaComments.trim() === (so.qa_comments || '').trim()}
                                      className="self-start px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-white rounded-sm cursor-pointer hover:opacity-80 disabled:opacity-30"
                                    >
                                      {savingQaComments ? 'Saving…' : 'Save'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Finding fields — BriefRow style, below the image row. Order: Inner
                            Qty, Master Qty (per carton), Inner Dimension, Actual Dimension,
                            Master Dimension (per carton), Actual Sample Weight (NET), Master
                            Sample Weight GROSS (per carton), Total CBM. NET/GROSS only labels
                            the weight fields — that's the real logistics distinction (product
                            weight vs packed weight); dimensions don't carry it since "net/gross
                            dimensions" isn't a standard packing-list convention the way weight
                            is. Grouped by measurement type rather than by carton, per how this
                            is read on a packing sheet. */}
                        {(() => {
                          const toCm   = (v) => v ? (parseFloat(v) * 2.54).toFixed(2) : ''
                          const toDisp = (v) => (v && dimUnit === 'in') ? (parseFloat(v) / 2.54).toFixed(2) : (v || '')
                          // Same conversion pattern as toCm/toDisp above, for weight — findings always
                          // stores kg regardless of what unit was typed, exactly like dimensions always
                          // store cm. Without this, a value typed while "lb" was selected would previously
                          // just get saved as-is and silently mislabeled kg (the bug this toggle fixes).
                          const toKgW   = (v) => v ? (parseFloat(v) * 0.453592).toFixed(3) : ''
                          const toDispW = (v) => (v && weightUnit === 'lb') ? (parseFloat(v) / 0.453592).toFixed(2) : (v || '')
                          const cartons = viewFindings.master_cartons?.length ? viewFindings.master_cartons : deriveMasterCartons(viewFindings)
                          const multi = cartons.length > 1

                          const setCartonCount = (n) => {
                            n = Math.max(1, parseInt(n) || 1)
                            setFindings(f => {
                              const current = f.master_cartons?.length ? f.master_cartons : cartons
                              const next = n > current.length
                                ? [...current, ...Array.from({ length: n - current.length }, () => ({ qty: '', l: '', w: '', h: '', weight: '' }))]
                                : current.slice(0, n)
                              return { ...f, master_cartons: next }
                            })
                          }
                          const setCartonField = (idx, key, value) => {
                            setFindings(f => {
                              const list = [...(f.master_cartons?.length ? f.master_cartons : cartons)]
                              list[idx] = { ...list[idx], [key]: value }
                              return { ...f, master_cartons: list }
                            })
                          }

                          // Fixed-width label column on every breakpoint (172px phone / 220px
                          // desktop) so the value always starts at the same x position — that's
                          // what makes the label-to-value spacing read as equal row to row. The
                          // row itself never wraps (flex-nowrap): a long label wraps onto a second
                          // line *inside its own column* instead of dragging the value down with
                          // it, so the input/L-W-H group always stays vertically centered next to
                          // the label, however tall that label ends up being.
                          const qtyRow = (label, value, onChange) => (
                            <div key={label} className={`flex flex-nowrap items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${findingsLocked ? '' : 'hover:bg-black/[.04]'}`}>
                              <div className="flex items-center gap-2 w-[172px] sm:w-[220px] flex-shrink-0">
                                <span className="text-black"><IconQty /></span>
                                <span className="text-[12px] font-medium text-black/60">{label}</span>
                              </div>
                              {findingsLocked
                                ? <span className="text-[13px] text-[#1A1A18] flex-shrink-0">{value || <span className="text-black">—</span>}</span>
                                : <input type="number" step="1" min="0" value={value ?? ''} onChange={e => onChange(e.target.value)}
                                    placeholder="pcs"
                                    className="w-20 flex-shrink-0 text-[13px] text-[#1A1A18] spinner-always-visible bg-white outline-none border border-black/20 rounded px-1.5 py-0.5 focus:border-black placeholder:text-black/20" />
                              }
                            </div>
                          )

                          const dimRow = (label, l, w, h, onL, onW, onH) => (
                            <div key={label} className={`flex flex-nowrap items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${findingsLocked ? '' : 'hover:bg-black/[.04]'}`}>
                              <div className="flex items-center gap-2 w-[172px] sm:w-[220px] flex-shrink-0">
                                <span className="text-black"><IconDimension /></span>
                                <span className="text-[12px] font-medium text-black/60">{label}</span>
                              </div>
                              <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
                                {[['L', l, onL], ['W', w, onW], ['H', h, onH]].map(([axis, val, onCh]) => (
                                  <div key={axis} className="flex items-center gap-1">
                                    <span className="text-[10px] font-bold text-black/50">{axis}</span>
                                    {findingsLocked
                                      ? <span className="text-[13px] text-[#1A1A18] w-9 sm:w-10 text-center">{toDisp(val) || <span className="text-black">—</span>}</span>
                                      : <input type="number" step="0.5" min="0"
                                          value={toDisp(val)}
                                          onChange={e => { const v = e.target.value; onCh(dimUnit === 'in' ? toCm(v) : v) }}
                                          placeholder="0"
                                          className="w-10 sm:w-[4.5rem] text-[13px] text-[#1A1A18] spinner-always-visible bg-white outline-none border border-black/20 rounded px-1 sm:px-1.5 py-0.5 focus:border-black placeholder:text-black/20" />
                                    }
                                  </div>
                                ))}
                                <span className="text-[11px] text-black ml-0.5">{dimUnit}</span>
                              </div>
                            </div>
                          )

                          const weightRow = (label, value, onChange, placeholder = '0.0') => (
                            <div key={label} className={`flex flex-nowrap items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${findingsLocked ? '' : 'hover:bg-black/[.04]'}`}>
                              <div className="flex items-center gap-2 w-[172px] sm:w-[220px] flex-shrink-0">
                                <span className="text-black"><IconQty /></span>
                                <span className="text-[12px] font-medium text-black/60">{label}</span>
                              </div>
                              {findingsLocked
                                ? <span className="text-[13px] text-[#1A1A18] flex-shrink-0">{toDispW(value) || <span className="text-black">—</span>}</span>
                                : <input type="number" step="0.1" min="0" value={toDispW(value)}
                                    onChange={e => { const v = e.target.value; onChange(weightUnit === 'lb' ? toKgW(v) : v) }}
                                    placeholder={placeholder}
                                    className="w-20 flex-shrink-0 text-[13px] text-[#1A1A18] spinner-always-visible bg-white outline-none border border-black/20 rounded px-1.5 py-0.5 focus:border-black placeholder:text-black/20" />
                              }
                              <span className="text-[11px] text-black ml-0.5 flex-shrink-0">{weightUnit}</span>
                            </div>
                          )

                          return (
                            <div className="flex flex-col -mx-2">
                              <div className="flex items-center justify-end gap-2 px-2 pb-1">
                                <div className="flex items-center rounded-full border border-black overflow-hidden">
                                  {['cm', 'in'].map(u => (
                                    <button key={u} type="button" onClick={() => setDimUnit(u)}
                                      className={`px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[.06em] cursor-pointer border-none transition-colors
                                        ${dimUnit === u ? 'bg-[#1A1A18] text-white' : 'bg-transparent text-black hover:text-black'}`}
                                    >{u}</button>
                                  ))}
                                </div>
                                <div className="flex items-center rounded-full border border-black overflow-hidden">
                                  {['kg', 'lb'].map(u => (
                                    <button key={u} type="button" onClick={() => setWeightUnit(u)}
                                      className={`px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[.06em] cursor-pointer border-none transition-colors
                                        ${weightUnit === u ? 'bg-[#1A1A18] text-white' : 'bg-transparent text-black hover:text-black'}`}
                                    >{u}</button>
                                  ))}
                                </div>
                              </div>

                              {/* Number of cartons — resizes the 3 "per carton" sections below. Deliberately
                                  styled apart from every other findings row (carton-shaped icon, tinted card,
                                  +/- stepper) since this one field controls how many rows the rest of the
                                  section renders, not just another value to record. */}
                              <div className={`flex items-center gap-3 mx-2 mb-2 mt-0.5 px-3 py-2 rounded-md border border-black/15 bg-black/[.025]`}>
                                <span className="text-black flex-shrink-0">
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M3 8.5L12 4l9 4.5-9 4.5-9-4.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                                    <path d="M3 8.5V16l9 4.5 9-4.5V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                                    <path d="M12 13v7.5M3 8.5 12 13l9-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                                  </svg>
                                </span>
                                <span className="text-[12px] font-semibold text-black flex-1">Number of Cartons / Boxes</span>
                                {findingsLocked
                                  ? <span className="text-[14px] font-semibold text-black">{cartons.length}</span>
                                  : <div className="flex items-center gap-1.5 flex-shrink-0">
                                      <button type="button" onClick={() => setCartonCount(Math.max(1, cartons.length - 1))}
                                        disabled={cartons.length <= 1}
                                        className="w-6 h-6 flex items-center justify-center rounded-md border border-black/20 bg-white text-black text-[15px] leading-none cursor-pointer hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed">−</button>
                                      <span className="w-7 text-center text-[14px] font-semibold text-black">{cartons.length}</span>
                                      <button type="button" onClick={() => setCartonCount(cartons.length + 1)}
                                        className="w-6 h-6 flex items-center justify-center rounded-md border border-black/20 bg-white text-black text-[15px] leading-none cursor-pointer hover:bg-black/5">+</button>
                                    </div>
                                }
                              </div>

                              {/* 1. Inner Quantity */}
                              {qtyRow('Inner Quantity', viewFindings.inner_qty, v => setFindings(f => ({ ...f, inner_qty: v })))}

                              {/* 2. Master Quantity — per carton */}
                              {cartons.map((c, i) => qtyRow(multi ? `Master Qty — Carton ${i + 1}` : 'Master Quantity', c.qty, v => setCartonField(i, 'qty', v)))}

                              {/* 3. Inner Dimension */}
                              {dimRow('Inner Dimension', viewFindings.inner_l, viewFindings.inner_w, viewFindings.inner_h,
                                v => setFindings(f => ({ ...f, inner_l: v })), v => setFindings(f => ({ ...f, inner_w: v })), v => setFindings(f => ({ ...f, inner_h: v })))}

                              {/* 4. Actual Dimension */}
                              {dimRow('Actual Dimension', viewFindings.actual_l, viewFindings.actual_w, viewFindings.actual_h,
                                v => setFindings(f => ({ ...f, actual_l: v })), v => setFindings(f => ({ ...f, actual_w: v })), v => setFindings(f => ({ ...f, actual_h: v })))}

                              {/* 5. Master Dimension — per carton */}
                              {cartons.map((c, i) => dimRow(multi ? `Master Dimension — Carton ${i + 1}` : 'Master Dimension',
                                c.l, c.w, c.h, v => setCartonField(i, 'l', v), v => setCartonField(i, 'w', v), v => setCartonField(i, 'h', v)))}

                              {/* 6. Inner Pack Weight — the only measurement type (qty/dims/weight) that was
                                  missing its weight field; optional like Master Sample Weight since not every
                                  product's inner pack is weighed separately from the item itself. */}
                              {weightRow('Inner Pack Weight', viewFindings.inner_weight, v => setFindings(f => ({ ...f, inner_weight: v })), 'Optional')}

                              {/* 7. Actual Sample Weight (NET) */}
                              {weightRow('Actual Sample Weight (NET)', viewFindings.actual_weight, v => setFindings(f => ({ ...f, actual_weight: v })))}

                              {/* 8. Master Sample Weight (GROSS) — per carton */}
                              {cartons.map((c, i) => weightRow(multi ? `Master Sample Weight (GROSS) — Carton ${i + 1}` : 'Master Sample Weight (GROSS)',
                                c.weight, v => setCartonField(i, 'weight', v), 'Optional'))}

                              <BriefRow icon={<IconDimension />} label="Total CBM (m³)" brief={viewFindings} field="cbm" setBrief={setFindings} placeholder="0.000" readOnly={findingsLocked} type="number" step="0.001" />
                            </div>
                          )
                        })()}

                        {/* Additional sample images grid — hidden once approved image is set */}
                        {viewFindings.sample_images?.length > 0 && !viewFindings.approved_image && (
                          <div className="grid grid-cols-4 gap-1.5">
                            {viewFindings.sample_images.map((url, i) => {
                              const isApproved = url === viewFindings.approved_image
                              return (
                                <div key={i} className="aspect-square bg-[#EDEAE4] overflow-hidden rounded relative group">
                                  <img src={url} onClick={e => { e.stopPropagation(); openLightbox(viewFindings.sample_images, i) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                                  {isApproved && <div className="absolute inset-0 ring-2 ring-[#7c3aed] ring-inset rounded pointer-events-none" />}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* Save findings */}
                        {!findingsLocked && (
                          <button onClick={handleSaveFindings} disabled={savingFindings}
                            className="w-full py-2.5 bg-[#1A1A18] text-white text-[11px] font-extrabold uppercase tracking-[.1em] cursor-pointer hover:opacity-80 disabled:opacity-40 rounded-sm">
                            {savingFindings ? 'Saving…' : 'Save Findings'}
                          </button>
                        )}

                        {/* Create Sample PO — shown once sample is accepted */}
                        {role === 'merchant' && !isReadOnly && ['sample', 'sample_shipped'].includes(ws.status) && (
                          <button
                            onClick={() => setShowSamplePO(true)}
                            className="w-full py-2.5 border border-[#166534] text-[#166534] text-[11px] font-extrabold uppercase tracking-[.1em] cursor-pointer hover:bg-[#166534] hover:text-white transition-colors rounded-sm bg-transparent"
                          >
                            Create Sample PO
                          </button>
                        )}

                        {/* Buyer decision — Accept or Request Revision */}
                        {(role === 'buyer' || masterKeyActive) && isReady && ws.status === 'approved' && (
                          <div className="flex flex-col gap-2 pt-1">
                            {/* Buyer can only act once the merchant has actually picked a main
                                sample image AND left a QA observation for this round —
                                otherwise there's nothing concrete to judge Accept/Reopen
                                against, even though the status has been flipped to "Ready". */}
                            {!so.findings?.approved_image || !so.qa_comments?.trim() ? (
                              <div className="text-[11px] text-black font-medium bg-black/[.03] border border-black/10 rounded px-3 py-2.5 leading-relaxed">
                                Waiting for the merchant to select a main sample image and add QA comments before you can accept or reopen the brief.
                              </div>
                            ) : (
                            <div className="flex gap-2">
                              <button
                                onClick={async () => {
                                  setAcceptingWs(true)
                                  try {
                                    await acceptSample(ws.id)
                                    // The auto-switch effect (keyed on ws.status) already does this
                                    // once the store update re-renders — this is a direct, immediate
                                    // trigger for the person who just clicked Accept, so it doesn't
                                    // depend on effect timing on top of the store update landing.
                                    setActiveTab('shipping')
                                  }
                                  catch (err) { toast(err.message) }
                                  finally { setAcceptingWs(false) }
                                }}
                                disabled={acceptingWs}
                                className="flex-1 py-2 text-[11px] font-extrabold uppercase tracking-[.06em] bg-[#166534] text-white rounded-sm cursor-pointer hover:opacity-80 disabled:opacity-40"
                              >
                                {acceptingWs ? 'Accepting…' : 'Accept Sample'}
                              </button>
                              <button
                                onClick={() => { setShowRevisionInput(v => !v); setRevisionNote('') }}
                                className="flex-1 py-2 text-[11px] font-extrabold uppercase tracking-[.06em] border border-black text-black rounded-sm cursor-pointer hover:border-black hover:text-black transition-colors bg-transparent"
                              >
                                Reopen Brief
                              </button>
                            </div>
                            )}

                            {showRevisionInput && (
                              <div className="flex flex-col gap-2">
                                <textarea
                                  value={revisionNote}
                                  onChange={e => setRevisionNote(e.target.value)}
                                  placeholder="What needs to change in the brief? (optional)"
                                  rows={2}
                                  autoFocus
                                  className="text-[13px] text-[#1A1A18] bg-transparent border border-black rounded p-2.5 outline-none resize-none placeholder:text-black/25 focus:border-black transition-colors"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={async () => {
                                      setSubmittingRevision(true)
                                      try {
                                        await requestRevision(ws.id, revisionNote.trim())
                                        setShowRevisionInput(false)
                                        setRevisionNote('')
                                      } catch (err) { toast(err.message) }
                                      finally { setSubmittingRevision(false) }
                                    }}
                                    disabled={submittingRevision}
                                    className="flex-1 py-2 text-[11px] font-extrabold uppercase tracking-[.06em] bg-[#1A1A18] text-white rounded-sm cursor-pointer hover:opacity-80 disabled:opacity-40"
                                  >
                                    {submittingRevision ? 'Sending…' : 'Confirm Roll Back'}
                                  </button>
                                  <button
                                    onClick={() => { setShowRevisionInput(false); setRevisionNote('') }}
                                    className="px-4 py-2 text-[11px] font-bold text-black hover:text-black cursor-pointer border-none bg-none transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* Ready date */}
                    {!isReady && <>
                      <div className="flex flex-col gap-2">
                        <div className="text-[10px] font-bold uppercase tracking-[.08em] text-black">Sample Ready Date</div>
                        {role === 'merchant' && !isReadOnly ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={sampleReadyDate}
                              onChange={e => setSampleReadyDate(e.target.value)}
                              className="border-b-2 border-[#1A1A18] py-1 text-[15px] font-bold text-[#1A1A18] bg-transparent outline-none w-[160px]"
                            />
                            <button
                              onClick={() => handleReadyDateChange(sampleReadyDate)}
                              disabled={!sampleReadyDate || sampleReadyDate === (so.target_ready_date?.slice(0, 10) || '')}
                              className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-white rounded-sm cursor-pointer hover:opacity-80 disabled:opacity-30"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <div className="text-[15px] font-bold text-[#1A1A18]">
                            {so.target_ready_date
                              ? new Date(so.target_ready_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                              : <span className="text-black font-normal text-[13px]">Not set yet</span>}
                          </div>
                        )}
                      </div>

                      <div className="h-px bg-black/[.07]" />

                      {/* Confirmed details — show the picked round's snapshotted buyer ref when
                          viewing a past round, not the live sample order's (same reasoning as
                          the price/qty block above). Rounds snapshotted before this field
                          existed just show nothing here rather than the wrong (current) value. */}
                      {(viewingVersion ? viewingVersion.findings_json?._buyer_ref : so.buyer_ref) != null && (
                        <div className="flex flex-col gap-3">
                          <div className="text-[10px] font-bold uppercase tracking-[.08em] text-black">Confirmed Detail</div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                            <div>
                              <div className="text-[9px] font-bold uppercase tracking-[.08em] text-black mb-0.5">Buyer Ref</div>
                              <div className="text-[13px] font-bold text-[#1A1A18]">{viewingVersion ? viewingVersion.findings_json?._buyer_ref : so.buyer_ref}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>}



                    {!isReady && <>
                      {(role === 'merchant' || role === 'buyer') && !notesLocked && (
                        <div className="flex flex-col gap-2">
                          <div className="text-[10px] font-bold uppercase tracking-[.08em] text-black">Additional Notes</div>
                          <textarea
                            value={sampleNotes}
                            onChange={e => setSampleNotes(e.target.value)}
                            placeholder="Any notes about sample development…"
                            rows={3}
                            className="text-[13px] text-[#1A1A18] bg-transparent border border-black rounded p-2.5 outline-none resize-none placeholder:text-black/25 focus:border-black transition-colors"
                          />
                          <button
                            onClick={async () => {
                              const val = sampleNotes.trim()
                              setSavingSampleNotes(true)
                              try { await updateSampleOrder(so.id, ws.id, { additional_notes: val || null }) }
                              catch (err) { toast(err.message) }
                              finally { setSavingSampleNotes(false) }
                            }}
                            disabled={savingSampleNotes || sampleNotes.trim() === (so.additional_notes || '').trim()}
                            className="self-start px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-white rounded-sm cursor-pointer hover:opacity-80 disabled:opacity-30"
                          >
                            {savingSampleNotes ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      )}
                      {(role === 'supplier' || notesLocked) && so.additional_notes && (
                        <div className="flex flex-col gap-1.5">
                          <div className="text-[10px] font-bold uppercase tracking-[.08em] text-black">Notes</div>
                          <div className="text-[13px] text-[#1A1A18] leading-relaxed whitespace-pre-line">{so.additional_notes}</div>
                        </div>
                      )}
                    </>}


                  </div>
                )
              })()}

              {/* ── Shipping tab ── */}
              {activeTab === 'shipping' && (() => {
                const so = ws?.sampleOrder
                if (!so) return (
                  <div className="flex-1 flex items-center justify-center text-[11px] font-bold uppercase tracking-[.1em] text-black">
                    No sample order found
                  </div>
                )
                const shippingLocked = role !== 'merchant' || isReadOnly
                const soShipping = {
                  ship_mode:       so.ship_mode       || '',
                  courier_company: so.courier_company || '',
                  tracking_ref:    so.tracking_ref    || '',
                  etd:             so.etd?.slice(0, 10) || '',
                  eta:             so.eta?.slice(0, 10) || '',
                  container_no:    so.container_no    || '',
                  vessel_no:       so.vessel_no       || '',
                }

                const handleSaveShipping = async () => {
                  const changed = {}
                  for (const key of Object.keys(shipping)) {
                    if ((shipping[key] || '') !== (soShipping[key] || '')) {
                      changed[key] = shipping[key] || null
                    }
                  }
                  if (!Object.keys(changed).length) return
                  setSavingShipping(true)
                  try { await updateSampleOrder(so.id, ws.id, changed) }
                  catch (err) { toast(err.message) }
                  finally { setSavingShipping(false) }
                }
                const shippingChanged = Object.keys(shipping).some(
                  k => (shipping[k] || '') !== (soShipping[k] || '')
                )

                // Unlike BriefRow (click-to-edit), these fields render a real input/date box
                // up front — shipping details are filled in one sitting, so there's no benefit
                // to hiding the input behind a click, and "Empty" placeholders were confusing
                // when there was nothing to click into.
                const shipRow = (icon, label, field, type = 'text', placeholder) => (
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
                    <div className="flex items-center gap-2 w-[162px] flex-shrink-0">
                      <span className="text-black">{icon}</span>
                      <span className="text-[12px] font-bold text-black">{label}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      {shippingLocked ? (
                        <span className="text-[13px] text-[#1A1A18]">
                          {shipping[field] || <span className="text-black">—</span>}
                        </span>
                      ) : (
                        <input
                          type={type}
                          value={shipping[field] || ''}
                          onChange={e => setShipping(s => ({ ...s, [field]: e.target.value }))}
                          placeholder={placeholder}
                          className={`w-full text-[13px] text-[#1A1A18] bg-transparent outline-none border-b ${modeAccent.border} focus:border-black pb-0.5 placeholder:text-black/25 placeholder:font-normal`}
                        />
                      )}
                    </div>
                  </div>
                )

                // Tracking Ref becomes a real link once both a courier company and a tracking
                // number are present — samples always move via international courier, never a
                // freight forwarder we'd have to look up manually, so every company in the list
                // has a known public tracking URL to build against.
                const trackingUrlFor = (t) => t && COURIER_TRACK_URL[shipping.courier_company]
                  ? COURIER_TRACK_URL[shipping.courier_company](t)
                  : null

                // Air = green, Ship = blue, running through the mode toggle, the field
                // underlines below, and the Save button — so the whole tab visibly reflects
                // which transport mode is active. Neutral black when no mode is picked yet.
                const modeAccent =
                  shipping.ship_mode === 'air' ? { bg: 'bg-[#166534]', border: 'border-[#166534]' } :
                  shipping.ship_mode === 'container' ? { bg: 'bg-[#1d4ed8]', border: 'border-[#1d4ed8]' } :
                  { bg: 'bg-[#1A1A18]', border: 'border-black/20' }

                // Switching modes after fields are filled in used to be locked out (to avoid
                // silently orphaning the other mode's saved data) — but every field change is
                // already logged in the activity feed, so there's no need to block it; just
                // switch modes and re-fill/save the new one.
                const toggleDisabled = shippingLocked

                return (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col -mx-2">
                      {/* Mode — Air vs Ship decides which fields below are relevant. Saved as
                          the mapped lowercase 'air'/'container' string into ship_mode — see
                          SHIP_MODE_DB above for why. */}
                      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
                        <div className="flex items-center gap-2 w-[162px] flex-shrink-0">
                          <span className="text-black"><IconShip /></span>
                          <span className="text-[12px] font-bold text-black">Mode</span>
                        </div>
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          {/* Same toggle UI for both roles — buyers just can't click it (disabled
                              below), so the tab shows what mode's been picked (or "neither yet")
                              instead of a bare "—" that looks broken/empty while unset. */}
                          <div className={`flex items-center rounded-full border border-black divide-x divide-black overflow-hidden w-fit ${toggleDisabled ? 'opacity-60' : ''}`}>
                            {['Air', 'Ship'].map(m => (
                              <button key={m} type="button"
                                disabled={toggleDisabled}
                                onClick={() => setShipping(s => ({ ...s, ship_mode: SHIP_MODE_DB[m] }))}
                                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-[.06em] transition-colors
                                  ${toggleDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}
                                  ${shipping.ship_mode === SHIP_MODE_DB[m]
                                    ? `${m === 'Air' ? 'bg-[#166534]' : 'bg-[#1d4ed8]'} text-white`
                                    : 'bg-transparent text-black hover:text-black'}`}
                              >{m}</button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {shipping.ship_mode === 'air' && (
                        <>
                          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
                            <div className="flex items-center gap-2 w-[162px] flex-shrink-0">
                              <span className="text-black"><IconShip /></span>
                              <span className="text-[12px] font-bold text-black">Courier Company</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              {shippingLocked ? (
                                <span className="text-[13px] text-[#1A1A18]">
                                  {shipping.courier_company || <span className="text-black">—</span>}
                                </span>
                              ) : (
                                <CourierSearchSelect
                                  value={shipping.courier_company}
                                  onChange={val => setShipping(s => ({ ...s, courier_company: val }))}
                                  options={INTERNATIONAL_COURIERS}
                                  placeholder="Search courier…"
                                />
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
                            <div className="flex items-center gap-2 w-[162px] flex-shrink-0">
                              <span className="text-black"><IconQty /></span>
                              <span className="text-[12px] font-bold text-black">Tracking Ref</span>
                            </div>
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              {shippingLocked ? (
                                trackingUrlFor(shipping.tracking_ref) ? (
                                  <a href={trackingUrlFor(shipping.tracking_ref)} target="_blank" rel="noreferrer"
                                    className="text-[13px] text-[#7c3aed] underline underline-offset-2 hover:text-[#6d28d9]">
                                    {shipping.tracking_ref}
                                  </a>
                                ) : (
                                  <span className="text-[13px] text-[#1A1A18]">{shipping.tracking_ref || <span className="text-black">—</span>}</span>
                                )
                              ) : (
                                <>
                                  <input
                                    type="text"
                                    value={shipping.tracking_ref || ''}
                                    onChange={e => setShipping(s => ({ ...s, tracking_ref: e.target.value }))}
                                    placeholder="Tracking / AWB number"
                                    className={`flex-1 min-w-0 text-[13px] text-[#1A1A18] bg-transparent outline-none border-b ${modeAccent.border} focus:border-black pb-0.5 placeholder:text-black/25 placeholder:font-normal`}
                                  />
                                  {trackingUrlFor(shipping.tracking_ref) && (
                                    <a href={trackingUrlFor(shipping.tracking_ref)} target="_blank" rel="noreferrer"
                                      title="Open tracking page" className="flex-shrink-0 text-[#7c3aed] hover:text-[#6d28d9]">
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                                      </svg>
                                    </a>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {shipRow(<IconCalendar />, 'ETD', 'etd', 'date')}
                          {shipRow(<IconCalendar />, 'ETA', 'eta', 'date')}
                        </>
                      )}

                      {shipping.ship_mode === 'container' && (
                        <>
                          {shipRow(<IconShip />, 'Container No', 'container_no')}
                          {shipRow(<IconShip />, 'Vessel No',    'vessel_no')}
                          {shipRow(<IconCalendar />, 'ETD', 'etd', 'date')}
                          {shipRow(<IconCalendar />, 'ETA', 'eta', 'date')}
                        </>
                      )}
                    </div>
                    {!shippingLocked && (
                      <button
                        onClick={handleSaveShipping}
                        disabled={savingShipping || !shippingChanged}
                        className={`py-2.5 text-[11px] font-extrabold uppercase tracking-[.06em] ${modeAccent.bg} text-white rounded-sm cursor-pointer hover:opacity-80 disabled:opacity-30`}
                      >
                        {savingShipping ? 'Saving…' : 'Save Shipping Details'}
                      </button>
                    )}
                  </div>
                )
              })()}

            </div>
          </div>

          {/* ── Center: chat ── */}
          <div className={`border-x border-gray-400 flex-col min-w-0 overflow-hidden ${isNarrow ? (mobilePanel === 'activity' ? 'flex flex-1 w-full' : 'hidden') : 'flex'}`}>
            {/* Chat tab switcher + video call — Video Call always stays on this row, pinned
                right; tabs scroll under it instead of wrapping/overlapping when the center
                column gets squeezed (e.g. laptop widths). */}
            <div className="h-11 flex items-center justify-between gap-1 border-b border-black flex-shrink-0 px-1">
              <div className="flex overflow-x-auto scrollbar-hide min-w-0">
                {chatTabs.map(([t, label, count]) => (
                  <div
                    key={t}
                    className={`flex items-center flex-shrink-0 border-b-2 ${chatTab === t ? 'border-[#7c3aed]' : 'border-transparent'}`}
                  >
                    <button
                      type="button"
                      onClick={() => jumpToTab(t)}
                      className={`px-2.5 sm:px-4 py-2.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-[.06em] cursor-pointer transition-colors flex items-center gap-1 sm:gap-1.5 whitespace-nowrap border-none bg-transparent
                        ${chatTab === t ? 'text-[#1A1A18]' : 'text-black hover:text-black'}`}
                    >
                      {label}
                      <span className={`text-[9px] font-extrabold ${chatTab === t ? 'text-[#1A1A18]' : 'text-black'}`}>{count}</span>
                      {unreadByTab[t] > 0 && (
                        <span
                          title={`${unreadByTab[t]} unread`}
                          className="min-w-[14px] h-3.5 px-1 rounded-full bg-red-600 text-white text-[8px] font-extrabold flex items-center justify-center leading-none"
                        >
                          {unreadByTab[t]}
                        </span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mr-2 flex-shrink-0">
                {ws && (
                  <VideoCallButton
                    workspaceId={ws.id}
                    memberId={memberId}
                    userName={profileHeader?.name || role}
                  />
                )}
              </div>
            </div>

            {/* Group Chat management — its own row, only while that tab is active, so it never
                fights the tab strip or Video Call for space. One "Manage" popover for every
                role: the internal buyer/supplier include-toggle stays merchant-only inside it,
                while the account-free guest invite section underneath is available to any
                current participant (merchant/buyer/supplier alike). */}
            {chatTab === 'group' && (
              <div className="flex justify-end items-center border-b border-black flex-shrink-0 px-2 py-1.5">
                <div className="relative">
                  <button
                    type="button"
                    onClick={handleGroupManageToggle}
                    className="px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[.06em] border border-black rounded-sm text-black hover:bg-neutral-100 cursor-pointer bg-white whitespace-nowrap"
                  >
                    {`Manage (${groupChatMemberIds.length})`}
                  </button>
                  {groupPickerOpen && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-black rounded-md shadow-xl z-30 p-3 flex flex-col gap-2">
                      {/* Any participant (merchant / buyer / vendor) can include other buyer &
                          supplier contacts in Group Chat — not merchant-only. Read-only admin
                          view still can't edit. */}
                      {!isReadOnly && (
                        <>
                          <span className="text-[9px] font-bold uppercase tracking-[.06em] text-black">Include in Group Chat</span>
                          {!groupChatCandidates.length ? (
                            <span className="text-[11px] text-black/60 py-1">No buyer or supplier has joined this workspace yet.</span>
                          ) : (
                            <>
                              <label className="flex items-center gap-2 text-[11px] font-bold text-[#1A1A18] cursor-pointer py-0.5 pb-1.5 border-b border-black/[.08]">
                                <input
                                  type="checkbox"
                                  checked={allInGroupChat}
                                  disabled={savingGroupMembers}
                                  onChange={requestToggleAllGroupChat}
                                />
                                <span className="flex-1">Everyone</span>
                              </label>
                              {groupChatCandidates.map(c => (
                                <label key={c.id} className="flex items-center gap-2 text-[11px] text-[#1A1A18] cursor-pointer py-0.5">
                                  <input
                                    type="checkbox"
                                    checked={groupChatMemberIds.includes(c.id)}
                                    disabled={savingGroupMembers}
                                    onChange={() => requestGroupChatMemberToggle(c.id, c.name)}
                                  />
                                  <span className="flex-1 truncate">{c.name}</span>
                                  <span className="text-[9px] uppercase tracking-[.06em] text-black/60">{c.side}</span>
                                </label>
                              ))}
                            </>
                          )}
                          <div className="flex items-center gap-2 mt-1 mb-0.5">
                            <div className="flex-1 h-px bg-black/[.08]" />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {ws && (
              <IncomingCallBanner
                workspaceId={ws.id}
                memberId={memberId}
                userName={profileHeader?.name || role}
              />
            )}

            {/* Messages */}
            <div
              ref={threadRef}
              onScroll={() => dismissDividerIfAtBottom()}
              className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-3 p-4 min-h-0"
            >
              {visibleComments.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-[11px] font-bold uppercase tracking-[.1em] text-black">No activity yet — start the conversation</div>
                </div>
              ) : (
                visibleComments.map((cm, i) => (
                  <React.Fragment key={i}>
                    {!dividerDismissedTabs.has(chatTab) && cm.id === firstUnreadIdByTab[chatTab] && (
                      <div className="flex items-center gap-2 my-1" role="separator">
                        <div className="flex-1 h-px bg-red-500/40" />
                        <span className="text-[9px] font-extrabold uppercase tracking-[.08em] text-red-600">New messages</span>
                        <div className="flex-1 h-px bg-red-500/40" />
                      </div>
                    )}
                    <Comment cm={cm} onReply={handleReplyClick} onEditNote={handleEditNote} openLightbox={openLightbox} scrollToMediaItem={scrollToMediaItem} handleMediaClickDebounced={handleMediaClickDebounced}
                      isFirstUnread={!dividerDismissedTabs.has(chatTab) && cm.id === firstUnreadIdByTab[chatTab]} />
                  </React.Fragment>
                ))
              )}
            </div>

            {chatTab === 'group' && role !== 'merchant' && !inGroupChat ? (
              <div className="flex-shrink-0 border-t border-black bg-[#f5f0ff] px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[11px] text-[#4c1d95] leading-snug">
                  {groupComments.some(c => c.type === 'comment')
                    ? 'You\'ve left this Group Chat — the messages and media from while you were in it are read-only. Rejoin to post again.'
                    : 'You\'re not in this Group Chat yet — join to read and post messages.'}
                </span>
                <button
                  type="button"
                  onClick={handleJoinGroupChat}
                  disabled={savingGroupMembers}
                  className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.06em] rounded-sm bg-[#7c3aed] text-white cursor-pointer hover:opacity-85 disabled:opacity-40 whitespace-nowrap flex-shrink-0"
                >
                  {savingGroupMembers ? 'Joining…' : (groupComments.some(c => c.type === 'comment') ? 'Rejoin' : 'Join Group Chat')}
                </button>
              </div>
            ) : (
            <>
            {/* Message composer */}
            <div
              className={`relative border-t border-black flex-shrink-0 bg-[#fafafa] ${chatDragActive ? 'bg-[#f5f0ff]' : ''}`}
              onDragOver={handleComposerDragOver}
              onDragLeave={handleComposerDragLeave}
              onDrop={handleComposerDrop}
            >
              {chatDragActive && (
                <div className="absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-[#7c3aed] bg-[#f5f0ff]/90 pointer-events-none">
                  <span className="text-[11px] font-bold uppercase tracking-[.1em] text-[#7c3aed]">Drop files to attach</span>
                </div>
              )}
              {editingNote && (
                <div className="flex items-center gap-2 px-4 py-2 border-t border-[#ea580c]/25 bg-[#fff4ec]">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  <div className="flex-1 min-w-0 text-[11px] font-semibold text-[#9a3412]">Editing message — Send to save your changes</div>
                  <button onClick={cancelEditNote} className="border-none bg-none text-black hover:text-black cursor-pointer text-base leading-none flex-shrink-0">×</button>
                </div>
              )}
              {replyTo && (() => {
                const { text, thumbUrl, thumbUrls } = attachmentPreview(replyTo)
                return (
                  <div className="flex items-center gap-2 px-4 py-2 border-t border-[#7c3aed]/20 bg-[#f5f0ff]">
                    {thumbUrls.length > 1 ? (
                      // Small overlapping stack instead of one thumbnail — this is composed
                      // live from replyTo.attachments, which is only available before the reply
                      // is actually sent (see attachmentPreview's thumbUrls doc comment).
                      <div className="flex items-center flex-shrink-0" style={{ width: `${20 + Math.min(thumbUrls.length, 3) * 14}px` }}>
                        {thumbUrls.slice(0, 3).map((u, i) => (
                          <img
                            key={i}
                            src={u}
                            alt=""
                            className="w-8 h-8 rounded object-cover border border-black bg-white"
                            style={{ marginLeft: i === 0 ? 0 : -18, zIndex: 3 - i }}
                          />
                        ))}
                      </div>
                    ) : thumbUrl ? (
                      <img src={thumbUrl} alt="" className="w-8 h-8 rounded object-cover border border-black flex-shrink-0" />
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                        <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
                      </svg>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-bold text-[#7c3aed] truncate">{replyTo.author_name || replyTo.role}</div>
                      <div className="text-[11px] text-black truncate">{text}</div>
                    </div>
                    <button onClick={() => setReplyTo(null)} className="border-none bg-none text-black hover:text-black cursor-pointer text-base leading-none flex-shrink-0">×</button>
                  </div>
                )
              })()}
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 pt-2">
                  {pendingFiles.map((f, i) => f._previewUrl ? (
                    <div key={i} className="relative w-11 h-11 flex-shrink-0">
                      <img src={f._previewUrl} alt="" className="w-11 h-11 rounded-lg object-cover border border-[#c4b5fd]" />
                      <button type="button" onClick={() => { revokeFilePreview(f); setPendingFiles(p => p.filter((_, j) => j !== i)) }} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#1A1A18] text-white flex items-center justify-center text-[10px] leading-none border-none cursor-pointer hover:bg-red-500">×</button>
                    </div>
                  ) : f.type?.startsWith('audio') && f._audioPreviewUrl ? (
                    <div key={i} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 bg-[#f0ebff] border border-[#c4b5fd] rounded-full text-[10px] text-[#6d28d9] font-medium">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      </svg>
                      <audio src={f._audioPreviewUrl} controls preload="metadata" className="h-7 w-[180px]" />
                      <button type="button" onClick={() => { revokeFilePreview(f); setPendingFiles(p => p.filter((_, j) => j !== i)) }} className="flex-shrink-0 text-[#7c3aed] hover:text-red-500 border-none bg-none cursor-pointer leading-none">×</button>
                    </div>
                  ) : (
                    <div key={i} className="flex items-center gap-1 px-2 py-1 bg-[#f0ebff] border border-[#c4b5fd] rounded-full text-[10px] text-[#6d28d9] font-medium max-w-[140px]">
                      <span className="truncate">{f.name}</span>
                      <button type="button" onClick={() => { revokeFilePreview(f); setPendingFiles(p => p.filter((_, j) => j !== i)) }} className="flex-shrink-0 text-[#7c3aed] hover:text-red-500 border-none bg-none cursor-pointer leading-none">×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 px-4 py-3">
                <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={handleFileChange} className="hidden" />
                <button
                  type="button"
                  title={richMode && uploadingInlineImage ? 'Uploading…' : undefined}
                  onClick={() => { if (richMode) saveRichSelection(); fileRef.current?.click() }}
                  disabled={chatLocked || isRecordingVoice || (richMode && uploadingInlineImage)}
                  className="text-black hover:text-[#7c3aed] cursor-pointer border-none bg-none flex-shrink-0 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                </button>
                <button
                  type="button"
                  title={richMode && uploadingInlineImage ? 'Uploading…' : 'Take a photo'}
                  onClick={() => { if (richMode) saveRichSelection(); setCameraOpen(true) }}
                  disabled={chatLocked || isRecordingVoice || (richMode && uploadingInlineImage)}
                  className="text-black hover:text-[#7c3aed] cursor-pointer border-none bg-none flex-shrink-0 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </button>
                {isRecordingVoice ? (
                  <div className="flex-1 min-w-0 flex items-center gap-2 border rounded-lg bg-white border-black/20 px-3.5 py-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                    <span className="text-[12px] font-semibold text-[#1A1A18] tabular-nums flex-shrink-0">
                      {String(Math.floor(voiceRecordSecs / 60)).padStart(1, '0')}:{String(voiceRecordSecs % 60).padStart(2, '0')}
                    </span>
                    <span className="text-[11px] text-black/50 flex-1 truncate">Recording voice message…</span>
                    <button type="button" onClick={cancelVoiceRecording} title="Cancel" className="flex-shrink-0 text-black/50 hover:text-red-600 border-none bg-none cursor-pointer leading-none text-base">×</button>
                  </div>
                ) : richMode ? (
                  <>
                  {richMaximized && <div className="fixed inset-0 z-[65] bg-black/40" onClick={() => setRichMaximized(false)} />}
                  <div className={richMaximized
                    ? 'fixed inset-4 sm:inset-10 z-[70] flex flex-col border border-black rounded-lg bg-white shadow-2xl'
                    : `flex-1 min-w-0 flex flex-col border rounded-lg bg-white overflow-hidden ${chatLocked ? 'border-black/10 bg-black/[.03]' : 'border-black/20 focus-within:border-black'}`}
                  >
                    {/* Buttons sized 32px (up from an initial 24px) — small enough to fit several
                        in a row but closer to a workable touch target on phone/tablet than 24px,
                        which is below the ~44px Apple/Google guideline for tappable controls. */}
                    <div className="flex items-center flex-wrap gap-0.5 px-1.5 py-1 border-b border-black/10 bg-black/[.02]">
                      <button type="button" title={richMaximized ? 'Minimize' : 'Maximize'}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => setRichMaximized(v => !v)}
                        className="w-8 h-8 flex items-center justify-center rounded text-black hover:bg-black/10 border-none bg-transparent cursor-pointer"
                      >
                        {richMaximized ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>
                          </svg>
                        )}
                      </button>
                      <div className="w-px h-5 bg-black/15 mx-0.5" />
                      {[['bold', 'B', 'font-bold'], ['italic', 'I', 'italic'], ['underline', 'U', 'underline']].map(([cmd, label, cls]) => (
                        <button key={cmd} type="button" title={cmd}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => applyRichFormat(cmd)}
                          disabled={chatLocked}
                          className={`w-8 h-8 flex items-center justify-center rounded text-[13px] ${cls} border-none cursor-pointer disabled:opacity-30 ${richActiveFormats[cmd] ? 'bg-[#7c3aed]/15 text-[#7c3aed]' : 'bg-transparent text-black hover:bg-black/10'}`}
                        >{label}</button>
                      ))}
                      {/* Click = quick-toggle the default bullet (same as before). The small
                          caret opens shape options (Disc/Circle/Square/Numbered) instead. */}
                      <div ref={richBulletStyleMenuRef} className="relative flex items-center">
                        <button type="button" title="Bulleted list"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => applyRichFormat('insertUnorderedList')}
                          disabled={chatLocked}
                          className={`w-7 h-8 flex items-center justify-center rounded-l border-none cursor-pointer disabled:opacity-30 ${richActiveFormats.insertUnorderedList ? 'bg-[#7c3aed]/15 text-[#7c3aed]' : 'bg-transparent text-black hover:bg-black/10'}`}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
                            <circle cx="4" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.3" fill="currentColor" stroke="none"/>
                          </svg>
                        </button>
                        <button type="button" title="Bullet shape"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => setRichOpenMenu(v => v === 'bulletStyle' ? null : 'bulletStyle')}
                          disabled={chatLocked}
                          className="w-6 h-8 flex items-center justify-center rounded-r border-none cursor-pointer disabled:opacity-30 bg-transparent text-black hover:bg-black/10"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M6 9l6 6 6-6z"/></svg>
                        </button>
                        {richOpenMenu === 'bulletStyle' && (
                          // stopPropagation here (and on the other 4 popovers below) — the
                          // document-level "click outside to close" listener otherwise treats
                          // some scrollbar interactions as happening outside the popover (the
                          // event target for a native scrollbar click doesn't always fall
                          // inside the element it belongs to, browser-dependent), which was
                          // closing the menu mid-scroll and reading as the whole thing flickering.
                          <div onMouseDown={e => e.stopPropagation()} className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 w-32 bg-white border border-black/15 rounded shadow-lg">
                            {[['disc', '• Disc'], ['circle', '○ Circle'], ['square', '▪ Square'], ['"➤ "', '➤ Arrow'], ['decimal', '1. Numbered']].map(([type, label]) => (
                              <button key={type} type="button" onMouseDown={e => e.preventDefault()} onClick={() => setBulletStyle(type)}
                                className="block w-full text-left text-[12px] px-2.5 py-1.5 cursor-pointer border-none bg-transparent hover:bg-black/[.06]">{label}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div ref={richBulletSizeMenuRef} className="relative">
                        <button type="button" title="Bullet size"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => setRichOpenMenu(v => v === 'bulletSize' ? null : 'bulletSize')}
                          disabled={chatLocked}
                          className="w-8 h-8 flex items-center justify-center rounded border-none cursor-pointer disabled:opacity-30 bg-transparent text-black hover:bg-black/10"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="10" y1="7" x2="20" y2="7"/><line x1="10" y1="17" x2="20" y2="17"/>
                            <circle cx="4" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="17" r="2.2" fill="currentColor" stroke="none"/>
                          </svg>
                        </button>
                        {richOpenMenu === 'bulletSize' && (
                          <div onMouseDown={e => e.stopPropagation()} className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 w-20 max-h-[164px] overflow-y-auto overflow-x-hidden bg-white border border-black/15 rounded shadow-lg">
                            {['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '40px'].map(s => (
                              <button key={s} type="button" onMouseDown={e => e.preventDefault()} onClick={() => setBulletSize(s)}
                                className="block w-full text-left text-[12px] px-2.5 py-1.5 cursor-pointer border-none bg-transparent hover:bg-black/[.06]">{s}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="w-px h-5 bg-black/15 mx-0.5" />
                      {/* Change case — operates on the current text selection, same as the font/
                          size pickers below. Rewrites letters in place so any bold/italic/color
                          already applied to that text survives untouched. */}
                      <div ref={richCaseMenuRef} className="relative">
                        <button type="button" title="Change case"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => setRichOpenMenu(v => v === 'case' ? null : 'case')}
                          disabled={chatLocked}
                          className="w-8 h-8 flex items-center justify-center rounded text-[11px] font-bold border-none cursor-pointer disabled:opacity-30 bg-transparent text-black hover:bg-black/10"
                        >Aa</button>
                        {richOpenMenu === 'case' && (
                          <div onMouseDown={e => e.stopPropagation()} className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 w-40 bg-white border border-black/15 rounded shadow-lg">
                            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => transformSelectionCase('upper')}
                              className="block w-full text-left text-[12px] px-2.5 py-1.5 cursor-pointer border-none bg-transparent hover:bg-black/[.06]">UPPERCASE</button>
                            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => transformSelectionCase('lower')}
                              className="block w-full text-left text-[12px] px-2.5 py-1.5 cursor-pointer border-none bg-transparent hover:bg-black/[.06]">lowercase</button>
                            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => transformSelectionCase('sentence')}
                              className="block w-full text-left text-[12px] px-2.5 py-1.5 cursor-pointer border-none bg-transparent hover:bg-black/[.06]">Sentence case</button>
                          </div>
                        )}
                      </div>
                      <button type="button" title="Clear formatting — select text (or an oversized empty line) first"
                        onMouseDown={e => e.preventDefault()}
                        onClick={clearRichFormatting}
                        disabled={chatLocked}
                        className="w-8 h-8 flex items-center justify-center rounded border-none cursor-pointer disabled:opacity-30 bg-transparent text-black hover:bg-black/10"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 20H9L4 15a2 2 0 0 1 0-2.8l7.5-7.5a2 2 0 0 1 2.8 0l5.5 5.5a2 2 0 0 1 0 2.8L13 20"/>
                          <line x1="6" y1="11" x2="14" y2="19"/>
                        </svg>
                      </button>
                      <div className="w-px h-5 bg-black/15 mx-0.5" />
                      <label title={`Text color: ${richTextColor}`} className="w-8 h-8 flex flex-col items-center justify-center rounded hover:bg-black/10 cursor-pointer relative">
                        <span className="text-[12px] font-bold leading-none" style={{ color: richTextColor }}>A</span>
                        <span className="w-4 h-[3px] rounded-full mt-0.5" style={{ backgroundColor: richTextColor }} />
                        <input type="color" disabled={chatLocked} value={richTextColor}
                          onMouseDown={saveRichSelection}
                          onChange={e => { restoreRichSelection(); applyRichFormat('foreColor', e.target.value); setRichTextColor(e.target.value); saveRichDraft({ textColor: e.target.value }) }}
                          className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed" />
                      </label>
                      <label title={`Highlight color: ${richHighlightColor}`} className="w-8 h-8 flex items-center justify-center rounded hover:bg-black/10 cursor-pointer relative">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill={richHighlightColor} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 11l6-6 4 4-6 6z"/><path d="M4 20l4-1 8-8-3-3-8 8z"/>
                        </svg>
                        <input type="color" disabled={chatLocked} value={richHighlightColor}
                          onMouseDown={saveRichSelection}
                          onChange={e => { restoreRichSelection(); applyRichFormat('hiliteColor', e.target.value); setRichHighlightColor(e.target.value); saveRichDraft({ highlightColor: e.target.value }) }}
                          className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed" />
                      </label>
                      <div className="w-px h-5 bg-black/15 mx-0.5" />
                      {/* Custom popover, not a native <select> — on mobile a native select's dropdown
                          is rendered entirely by the OS (iOS wheel picker, Android full-screen list),
                          so "show ~5 then scroll" can't be done with a real select at all. This gives
                          identical, controllable behavior on every device. */}
                      <div ref={richFontMenuRef} className="relative">
                        <button type="button" disabled={chatLocked}
                          onMouseDown={saveRichSelection}
                          onClick={() => setRichOpenMenu(v => v === 'font' ? null : 'font')}
                          className="text-[11px] border border-black/15 rounded px-1.5 py-1.5 bg-white text-black outline-none cursor-pointer disabled:opacity-30 whitespace-nowrap"
                          style={richFontFamily ? { fontFamily: richFontFamily } : undefined}
                        >{richFontFamily || 'Font'}</button>
                        {richOpenMenu === 'font' && (
                          <div onMouseDown={e => e.stopPropagation()} className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 w-40 max-h-[164px] overflow-y-auto overflow-x-hidden bg-white border border-black/15 rounded shadow-lg">
                            {RICH_FONT_OPTIONS.map(f => (
                              <button key={f} type="button"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => { restoreRichSelection(); applyRichFormat('fontName', f); setRichFontFamily(f); saveRichDraft({ fontFamily: f }); setRichOpenMenu(null) }}
                                style={{ fontFamily: f }}
                                className={`block w-full text-left text-[12px] px-2.5 py-1.5 cursor-pointer border-none bg-transparent hover:bg-black/[.06] ${richFontFamily === f ? 'bg-black/[.06] font-semibold' : ''}`}
                              >{f}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div ref={richSizeMenuRef} className="relative">
                        <button type="button" disabled={chatLocked}
                          onMouseDown={saveRichSelection}
                          onClick={() => setRichOpenMenu(v => v === 'size' ? null : 'size')}
                          className="text-[11px] border border-black/15 rounded px-1.5 py-1.5 bg-white text-black outline-none cursor-pointer disabled:opacity-30 whitespace-nowrap"
                        >{richFontSize || 'Size'}</button>
                        {richOpenMenu === 'size' && (
                          <div onMouseDown={e => e.stopPropagation()} className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 w-20 max-h-[164px] overflow-y-auto overflow-x-hidden bg-white border border-black/15 rounded shadow-lg">
                            {RICH_SIZE_OPTIONS.map(s => (
                              <button key={s} type="button"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => { restoreRichSelection(); applyRichFormat('fontSize', s); setRichFontSize(s); saveRichDraft({ fontSize: s }); setRichOpenMenu(null) }}
                                className={`block w-full text-left text-[12px] px-2.5 py-1.5 cursor-pointer border-none bg-transparent hover:bg-black/[.06] ${richFontSize === s ? 'bg-black/[.06] font-semibold' : ''}`}
                              >{s}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="ml-auto pl-1.5 text-[9px] font-bold uppercase tracking-[.08em] text-black select-none whitespace-nowrap">Notes</span>
                    </div>
                    <div
                      ref={richComposerRef}
                      contentEditable={!chatLocked}
                      suppressContentEditableWarning
                      // Plain Enter must stay a normal newline/next-bullet here — unlike the
                      // plain-text composer, a note is exactly where someone types multiple
                      // lines or bullet points, so Enter-to-send would fight the one thing this
                      // editor exists for. Ctrl/Cmd+Enter sends instead, same convention most
                      // multi-line composers (Slack, Notion, etc.) use for this exact conflict.
                      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend() } }}
                      // Flags a drag that started on one of this note's own <img> elements, so
                      // the composer wrapper's onDrop (external files/Reference Media) knows to
                      // step aside and let the browser natively move the node within the editor
                      // instead of intercepting it as a new attachment.
                      onDragStart={e => { if (e.target.tagName === 'IMG') richInternalDragRef.current = true }}
                      onDragEnd={() => { richInternalDragRef.current = false }}
                      onKeyUp={updateRichActiveFormats}
                      onMouseUp={updateRichActiveFormats}
                      onFocus={updateRichActiveFormats}
                      onInput={e => { setRichHasContent(!!e.currentTarget.textContent?.trim()); updateRichActiveFormats(); saveRichDraft() }}
                      onPaste={handleComposerPaste}
                      data-placeholder="Write your note… (Ctrl/Cmd+Enter to send)"
                      // The desktop default (110-256px) left almost no room for chat history above
                      // it on a phone-height viewport — shrunk on mobile/tablet so the composer
                      // stops crowding out previous/upcoming messages. Maximize (a full-panel
                      // overlay, not this inline box) is the better fit for a longer note there
                      // anyway, so this only needs to stay small at rest.
                      className={`rich-composer-editable overflow-y-auto px-3.5 py-2.5 text-[13px] text-[#1A1A18] outline-none leading-relaxed ${richMaximized ? 'flex-1' : isPhone ? 'min-h-[56px] max-h-[110px]' : isNarrow ? 'min-h-[70px] max-h-[150px]' : 'min-h-[110px] max-h-64'}`}
                    />
                    {/* Maximized panel is position:fixed over everything, including the row below
                        that normally holds Attach/Camera/Send — those become unreachable behind
                        it, so this footer duplicates just those 3 actions while maximized. */}
                    {richMaximized && (
                      <div className="flex items-center gap-2 px-3 py-2 border-t border-black/10 bg-black/[.02]">
                        <button type="button" title="Attach image" onClick={() => { saveRichSelection(); fileRef.current?.click() }}
                          className="text-black hover:text-[#7c3aed] cursor-pointer border-none bg-none flex-shrink-0 transition-colors">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                          </svg>
                        </button>
                        <button type="button" title="Take a photo" onClick={() => { saveRichSelection(); setCameraOpen(true) }}
                          className="text-black hover:text-[#7c3aed] cursor-pointer border-none bg-none flex-shrink-0 transition-colors">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                            <circle cx="12" cy="13" r="4"/>
                          </svg>
                        </button>
                        <div className="flex-1" />
                        <button type="button" onClick={handleSend}
                          title={editingNote ? 'Save changes' : 'Send'}
                          disabled={!richHasContent || chatLocked}
                          className="w-8 h-8 rounded-full bg-[#7c3aed] border-none flex items-center justify-center cursor-pointer hover:opacity-80 disabled:opacity-30 flex-shrink-0">
                          {editingNote
                            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            : <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/></svg>
                          }
                        </button>
                      </div>
                    )}
                  </div>
                  </>
                ) : (
                  <div className={`flex-1 min-w-0 flex items-center border rounded-lg bg-white transition-colors ${chatLocked ? 'border-black/10 bg-black/[.03]' : 'border-black/20 focus-within:border-black'}`}>
                    <textarea
                      ref={composerRef}
                      value={text}
                      onChange={e => setText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                      onPaste={handleComposerPaste}
                      placeholder={chatPlaceholder}
                      disabled={chatLocked}
                      rows={1}
                      className="scrollbar-hide w-full min-w-0 border-none bg-transparent text-[13px] outline-none text-[#1A1A18] placeholder:text-black/40 disabled:cursor-not-allowed resize-none leading-relaxed px-3.5 py-2 max-h-32 overflow-y-auto"
                    />
                  </div>
                )}
                <button
                  type="button"
                  title={richMode ? 'Close notes' : 'Write a formatted note'}
                  onClick={handleToggleRichMode}
                  disabled={chatLocked || isRecordingVoice}
                  className={`w-7 h-7 flex items-center justify-center rounded-full cursor-pointer border-none flex-shrink-0 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none ${richMode ? 'bg-[#7c3aed] text-white hover:opacity-85' : 'bg-none text-black hover:text-[#7c3aed]'}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                    <line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/>
                  </svg>
                </button>
                <button
                  type="button"
                  title={isRecordingVoice ? 'Stop recording' : 'Record a voice message'}
                  onClick={isRecordingVoice ? finishVoiceRecording : startVoiceRecording}
                  disabled={chatLocked || (!isRecordingVoice && pendingFiles.length >= MAX_ATTACHMENTS)}
                  className={`w-8 h-8 rounded-full border-none flex items-center justify-center cursor-pointer flex-shrink-0 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none ${isRecordingVoice ? 'bg-red-500 hover:opacity-80' : 'bg-black/[.06] text-black hover:bg-[#7c3aed] hover:text-white'}`}
                >
                  {isRecordingVoice ? (
                    <span className="w-2.5 h-2.5 rounded-sm bg-white" />
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                  )}
                </button>
                <button
                  onClick={handleSend}
                  disabled={((richMode ? !richHasContent : !text.trim()) && pendingFiles.length === 0) || chatLocked || isRecordingVoice}
                  className="w-8 h-8 rounded-full bg-[#7c3aed] border-none flex items-center justify-center cursor-pointer hover:opacity-80 disabled:opacity-30 flex-shrink-0"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
                    <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
                  </svg>
                </button>
              </div>
            </div>
            </>
            )}
          </div>

          {/* ── Right: reference media ── */}
          <div className={`bg-[#F5F3EF] flex-col overflow-hidden relative ${isNarrow ? (mobilePanel === 'media' ? 'flex flex-1 w-full' : 'hidden') : 'flex border-l border-gray-400'}`} style={{ minWidth: 0 }}>
            <div className="h-11 flex items-center justify-center gap-1.5 px-4 border-b border-black flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-black">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <span className="text-[9px] font-bold uppercase tracking-[.1em] text-black">Media {mediaCount}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <MediaPanelContent
                ws={ws} comments={comments} sku={sku} isReadOnly={isReadOnly} role={role}
                settingProductImg={settingProductImg} setSettingProductImg={setSettingProductImg}
                addingSampleImg={addingSampleImg} setAddingSampleImg={setAddingSampleImg}
                openLightbox={openLightbox} pinImage={pinImage} setBriefErrors={setBriefErrors} toast={toast}
                setSkuImageFromUrl={setSkuImageFromUrl} handleMediaClickDebounced={handleMediaClickDebounced}
                scrollToChatMessage={scrollToChatMessage} saveSampleFindings={saveSampleFindings}
                queueSampleScroll={queueSampleScroll}
              />
            </div>
          </div>
        </div>
        </>
      )}
      </div>{/* /auto-scale wrapper */}

      {/* ── Sample PO modal ── */}
      {showSamplePO && ws?.id && (
        <SamplePOModal
          workspaceIds={[ws.id]}
          onClose={() => setShowSamplePO(false)}
          onCreated={() => setShowSamplePO(false)}
        />
      )}

      {/* ── Image lightbox ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[1020] flex items-center justify-center bg-[#f0eeeb]"
        >
          {/* Edit Image — only for images opened from the Reference Media panel, not suppliers,
              and never for a read-only viewer (e.g. an admin viewing another merchant's
              workspace via "READ ONLY — ADMIN VIEW"). Previously only checked
              lightbox.editable + role, so a read-only viewer could still open the full editor
              and save changes to a workspace/SKU they don't own. */}
          {lightbox.editable && role !== 'supplier' && !isReadOnly && (
            <div className="absolute top-4 left-4" style={{ zIndex: 1030 }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => {
                  const url = lightbox.images[lightbox.index]
                  setEditingRefImage({ url, isSample: lightbox.isSample })
                  setLightbox(null)
                }}
                className="flex items-center gap-1.5 h-9 px-3 rounded-full bg-black/10 hover:bg-black/20 text-black text-[11px] font-bold uppercase tracking-[.04em] cursor-pointer border-none transition-colors"
                title="Edit image"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                Edit Image
              </button>
            </div>
          )}

          {/* Attach to Chat — works on touch (unlike dragging a thumbnail onto the composer).
              Adds the image as a pending attachment; the user still writes a message + sends. */}
          {!chatLocked && (
            <div className="absolute bottom-4 left-4" style={{ zIndex: 1030 }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => { handleAttachUrlToChat(lightbox.images[lightbox.index]); setLightbox(null); setLbZoom(1); setLbPan({ x: 0, y: 0 }) }}
                className="flex items-center gap-1.5 h-9 px-3 rounded-full bg-black/10 hover:bg-black/20 text-black text-[11px] font-bold uppercase tracking-[.04em] cursor-pointer border-none transition-colors"
                title="Attach this image to the chat"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                Attach to Chat
              </button>
            </div>
          )}

          {/* Image — click to cycle zoom, drag to pan */}
          <div
            className="flex items-center justify-center"
            style={{ width: '90vw', height: '90vh', overflow: 'hidden', clipPath: 'inset(0)', isolation: 'isolate' }}
          >
            <img
              key={lightbox.images[lightbox.index]}
              src={lightbox.images[lightbox.index]}
              alt=""
              draggable={false}
              onMouseDown={e => {
                e.stopPropagation()
                lbDragRef.current = { startX: e.clientX, startY: e.clientY, panX: lbPan.x, panY: lbPan.y, moved: false }
              }}
              onMouseMove={e => {
                if (!lbDragRef.current) return
                const dx = e.clientX - lbDragRef.current.startX
                const dy = e.clientY - lbDragRef.current.startY
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                  lbDragRef.current.moved = true
                  setLbPan({ x: lbDragRef.current.panX + dx, y: lbDragRef.current.panY + dy })
                }
              }}
              onMouseUp={e => { e.stopPropagation(); lbDragRef.current = null }}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation() }}
              onMouseLeave={() => { lbDragRef.current = null }}
              onClick={e => e.stopPropagation()}
              style={{
                display: 'block',
                maxWidth: '85vw',
                maxHeight: '85vh',
                objectFit: 'contain',
                transform: `translate(${lbPan.x}px, ${lbPan.y}px) scale(${lbZoom})`,
                transformOrigin: 'center center',
                cursor: lbZoom > 1 ? 'grab' : 'default',
                userSelect: 'none',
              }}
            />
          </div>

          {/* Dot indicators */}
          {lightbox.images.length > 1 && (
            <div className="absolute bottom-5 left-0 right-0 flex justify-center gap-2" style={{ zIndex: 1030 }} onClick={e => e.stopPropagation()}>
              {lightbox.images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setLightbox(l => ({ ...l, index: i })); setLbZoom(1); setLbPan({ x: 0, y: 0 }) }}
                  className={`w-2 h-2 rounded-full border-none cursor-pointer transition-all ${i === lightbox.index ? 'bg-black scale-125' : 'bg-black/25 hover:bg-black/50'}`}
                />
              ))}
            </div>
          )}

          {/* Controls — absolute within the full-viewport backdrop */}
          <div className="absolute top-4 right-4 flex items-center gap-2" style={{ zIndex: 1030 }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-0 rounded-full bg-black/10 overflow-hidden">
              <button
                onMouseDown={e => { e.stopPropagation(); const step = () => setLbZoom(z => { const n = clampZoom(z - 0.05); if (n <= 1) setLbPan({ x: 0, y: 0 }); return n }); step(); lbHoldRef.current = setInterval(step, 120) }}
                onMouseUp={() => { clearInterval(lbHoldRef.current) }}
                onMouseLeave={() => { clearInterval(lbHoldRef.current) }}
                onClick={e => e.stopPropagation()}
                className="w-7 h-7 flex items-center justify-center hover:bg-black/10 text-black hover:text-black text-base font-bold cursor-pointer border-none bg-transparent transition-colors select-none"
                title="Zoom out −5%"
              >−</button>
              <span
                onClick={e => { e.stopPropagation(); setLbZoom(1); setLbPan({ x: 0, y: 0 }) }}
                className="text-[11px] font-bold text-black tabular-nums px-1 cursor-pointer select-none"
                title="Click to reset"
              >{Math.round(lbZoom * 100)}%</span>
              <button
                onMouseDown={e => { e.stopPropagation(); const step = () => setLbZoom(z => clampZoom(z + 0.05)); step(); lbHoldRef.current = setInterval(step, 120) }}
                onMouseUp={() => { clearInterval(lbHoldRef.current) }}
                onMouseLeave={() => { clearInterval(lbHoldRef.current) }}
                onClick={e => e.stopPropagation()}
                className="w-7 h-7 flex items-center justify-center hover:bg-black/10 text-black hover:text-black text-base font-bold cursor-pointer border-none bg-transparent transition-colors select-none"
                title="Zoom in +5%"
              >+</button>
            </div>
            <div className="w-px h-5 bg-black/20" />
            <button
              onClick={handleShareImage}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-black cursor-pointer border-none transition-colors"
              title="Share this image"
            ><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>
            {/* Share All — only worth showing once there's more than one image to bundle into
                one native share (the per-image Share button above already covers a single one) */}
            {lightbox.images.length > 1 && (
              <button
                onClick={handleShareAllImages}
                className="h-9 px-3 flex items-center gap-1.5 rounded-full bg-black/10 hover:bg-black/20 text-black text-[11px] font-bold uppercase tracking-[.04em] cursor-pointer border-none transition-colors"
                title={`Share all ${lightbox.images.length} images`}
              ><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>All ({lightbox.images.length})</button>
            )}
            <div className="w-px h-5 bg-black/20" />
            <button
              onClick={() => { setLightbox(null); setLbZoom(1); setLbPan({ x: 0, y: 0 }) }}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-black cursor-pointer border-none transition-colors"
              title="Close (Esc)"
            ><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>

          {/* Left arrow (rendered after image) */}
          {lightbox.images.length > 1 && (
            <button
              onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: (l.index - 1 + l.images.length) % l.images.length })); setLbZoom(1); setLbPan({ x: 0, y: 0 }) }}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-black cursor-pointer border-none transition-colors"
              style={{ zIndex: 1030 }}
              title="Previous"
            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
          )}

          {/* Right arrow (rendered after image) */}
          {lightbox.images.length > 1 && (
            <button
              onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: (l.index + 1) % l.images.length })); setLbZoom(1); setLbPan({ x: 0, y: 0 }) }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-black cursor-pointer border-none transition-colors"
              style={{ zIndex: 1030 }}
              title="Next"
            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
          )}
        </div>
      )}

      {/* ── Live camera capture — stays open across multiple shots ── */}
      {cameraOpen && (
        <CameraCaptureModal
          onCapture={handleShutter}
          onDone={handleCameraDone}
          shotCount={captureBatch.length}
        />
      )}

      {/* ── Review grid after a camera session — edit/remove any shot, then attach the rest ── */}
      {!cameraOpen && captureBatch.length > 0 && (
        <CaptureReviewModal
          items={captureBatch}
          onEdit={setEditingCaptureId}
          onRemove={removeCaptured}
          onRetakeMore={() => setCameraOpen(true)}
          onDiscardAll={discardCaptureBatch}
          onAttach={attachCaptureBatch}
        />
      )}

      {/* ── Editing one photo from the review grid — renders on top of it (same z-index, later in DOM) ── */}
      {editingCaptureId && (() => {
        const item = captureBatch.find(p => p.id === editingCaptureId)
        return item ? (
          <ImageEditorModal
            imageUrl={item.blobUrl}
            toast={toast}
            onClose={() => setEditingCaptureId(null)}
            onSaveAsCopy={saveEditedCaptureCopy}
            onSaveReplace={saveEditedCaptureReplace}
          />
        ) : null
      })()}

      {/* ── Reference-media / sample image editor ── */}
      {editingRefImage && ws?.id && (
        editingRefImage.isSample ? (
          // Sample images live on the sample order's findings, not reference_media — there's
          // no matching entry to overwrite there, so only "Save as Copy" makes sense here.
          <ImageEditorModal
            imageUrl={editingRefImage.url}
            toast={toast}
            onClose={() => setEditingRefImage(null)}
            onSaveAsCopy={async (blob) => {
              if (!ws?.sampleOrder?.id) { toast?.('No sample order found', true); return }
              const file = new File([blob], `edited-${Date.now()}.png`, { type: 'image/png' })
              await uploadSampleImages(ws.sampleOrder.id, ws.id, [file])
              toast?.('Saved as a new sample image')
            }}
            copyOnlyReason="Sample images can't be replaced in place — your edit will be saved as a new sample image instead."
          />
        ) : role === 'qa' ? (
          <ImageEditorModal
            imageUrl={editingRefImage.url}
            toast={toast}
            onClose={() => setEditingRefImage(null)}
            onSaveAsCopy={async (blob) => {
              await saveReferenceMediaEdit(ws.id, blob, { mode: 'copy' })
              toast?.('Saved as a new image in Reference Media')
            }}
            copyOnlyReason="QA reviewers can't edit the original image — your edit is saved as a new copy in Reference Media instead."
          />
        ) : (
          <ImageEditorModal
            imageUrl={editingRefImage.url}
            toast={toast}
            onClose={() => setEditingRefImage(null)}
            onSaveAsCopy={async (blob) => {
              await saveReferenceMediaEdit(ws.id, blob, { mode: 'copy' })
              toast?.('Saved as a new image in Reference Media')
            }}
            onSaveReplace={async (blob) => {
              const res = await saveReferenceMediaEdit(ws.id, blob, { mode: 'replace', replaceUrl: editingRefImage.url })
              toast?.(res.replaced ? 'Image replaced' : 'Saved as a new copy — the original is pinned elsewhere and can\'t be overwritten')
            }}
            replaceDisabled={editingRefImage.url === ws?.buyer_brief?.image_url || editingRefImage.url === sku?.image_url}
            replaceDisabledReason="This image is pinned as the buyer brief or product image, so edits are always saved as a new copy."
          />
        )
      )}

      {/* ── Approve-to-sample confirmation modal ── */}
      {/* ── Group Chat member add/remove confirmation ── */}
      {pendingMemberToggle && (
        <div className="fixed inset-0 z-[1010] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white w-[380px] rounded-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[.1em] text-black mb-0.5">Confirm Action</div>
                <div className="text-[15px] font-extrabold text-[#1A1A18] tracking-tight">
                  {pendingMemberToggle.adding
                    ? (pendingMemberToggle.all ? 'Add everyone to Group Chat' : 'Add to Group Chat')
                    : (pendingMemberToggle.all ? 'Remove everyone from Group Chat' : 'Remove from Group Chat')}
                </div>
              </div>
              <button
                onClick={() => setPendingMemberToggle(null)}
                className="text-black hover:text-black text-xl leading-none cursor-pointer border-none bg-none"
              >×</button>
            </div>
            <div className="px-5 py-4 text-[12px] text-[#1A1A18] leading-relaxed">
              {pendingMemberToggle.all
                ? (pendingMemberToggle.adding
                    ? <>Add <span className="font-bold">all {allGroupChatCandidateIds.length} buyer &amp; supplier contacts</span> to this workspace's Group Chat?</>
                    : <>Remove <span className="font-bold">all buyer &amp; supplier contacts</span> from this workspace's Group Chat?</>)
                : pendingMemberToggle.adding
                  ? <>Add <span className="font-bold">{pendingMemberToggle.name}</span> to this workspace's Group Chat?</>
                  : <>Remove <span className="font-bold">{pendingMemberToggle.name}</span> from this workspace's Group Chat?</>}
            </div>
            <div className="flex items-center gap-2 px-5 pb-5">
              <button
                type="button"
                onClick={confirmGroupChatMemberToggle}
                className={`px-4 py-2 text-[11px] font-extrabold uppercase tracking-[.06em] rounded-sm cursor-pointer border-none hover:opacity-85
                  ${pendingMemberToggle.adding ? 'bg-black text-white' : 'bg-[#f12d2d] text-white'}`}
              >
                Yes, Confirm
              </button>
              <button
                type="button"
                onClick={() => setPendingMemberToggle(null)}
                className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] text-black hover:text-black border border-black/20 rounded-sm bg-white cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showApproveModal && (
        <div className="fixed inset-0 z-[1010] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white w-[460px] rounded-md shadow-2xl flex flex-col overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-black">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[.1em] text-black mb-0.5">Confirm Action</div>
                <div className="text-[15px] font-extrabold text-[#1A1A18] tracking-tight">Proceed to Sample</div>
              </div>
              <button
                onClick={() => setShowApproveModal(false)}
                className="text-black hover:text-black text-xl leading-none cursor-pointer border-none bg-none"
              >×</button>
            </div>

            {/* Brief summary */}
            <div className="px-5 py-4 flex flex-col gap-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[.08em] text-black mb-0.5">Brief Summary</div>
              {[
                ['Description', brief.description],
                ['Colour',      brief.color],
                ['Material',    brief.material],
                ['Dimensions',  brief.dimensions],
                ['Weight',      brief.weight ? `${brief.weight} kg` : ''],
                ['Finish', brief.finish]
              ].filter(([, v]) => v).map(([label, val]) => (
                <div key={label} className="flex gap-3">
                  <span className="text-[11px] text-black w-24 flex-shrink-0">{label}</span>
                  <span className="text-[12px] font-semibold text-[#1A1A18] flex-1">{val}</span>
                </div>
              ))}
            </div>

            <div className="h-px bg-black/[.07] mx-5" />

            {/* Editable fields */}
            <div className="px-5 py-4 flex flex-col gap-3">
              <div className="text-[10px] font-bold uppercase tracking-[.08em] text-black mb-0.5">Sample Order Details</div>
              <div className="flex gap-4">
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-[.08em] text-black">Approved Sample Qty <span className="text-red-400">*</span></label>
                  <input
                    type="number"
                    min="1"
                    value={approveQty}
                    onChange={e => setApproveQty(e.target.value)}
                    placeholder="e.g. 2"
                    className="border-b-2 border-[#1A1A18] py-1.5 text-[14px] font-bold text-[#1A1A18] bg-transparent outline-none w-full placeholder:text-black/20 placeholder:font-normal spinner-always-visible"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-[.08em] text-black">Approved Price ({CURRENCY_SYMBOLS[brief.currency] || brief.currency || '$'}) <span className="text-red-400">*</span></label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={approvePrice}
                    onChange={e => setApprovePrice(e.target.value)}
                    placeholder="e.g. 12.50"
                    className="border-b-2 border-[#1A1A18] py-1.5 text-[14px] font-bold text-[#1A1A18] bg-transparent outline-none w-full placeholder:text-black/20 placeholder:font-normal spinner-always-visible"
                  />
                </div>
              </div>
              <p className="text-[11px] text-black leading-relaxed">
                <span className="font-semibold text-black">{approveQty || '—'}</span> sample unit{approveQty !== '1' ? 's' : ''} will be developed at a target price of{' '}
                <span className="font-semibold text-black">{CURRENCY_SYMBOLS[brief.currency] || brief.currency || '$'}{approvePrice || '—'}</span> per unit. The brief will be locked after confirmation.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-black bg-black/[.02]">
              <button
                onClick={() => setShowApproveModal(false)}
                className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] text-black hover:text-black cursor-pointer border-none bg-none transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmApprove}
                disabled={!approveQty || !approvePrice || approvingWs}
                className="px-5 py-2 text-[11px] font-extrabold uppercase tracking-[.06em] bg-[#1A1A18] text-white rounded-sm cursor-pointer hover:opacity-80 disabled:opacity-40 flex items-center gap-2"
              >
                {approvingWs ? (
                  <>
                    <span className="inline-block w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />
                    Approving…
                  </>
                ) : (
                  <>
                    Confirm
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
