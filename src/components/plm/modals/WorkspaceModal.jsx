import React, { useEffect, useState, useRef, useCallback } from 'react'
import SamplePOModal from './SamplePOModal'
import ImageEditorModal from './ImageEditorModal'
import { useSearchParams } from 'react-router-dom'
import { usePlmStore, STATUS_LABELS, STATUS_COLORS } from '../../../stores/plmStore'
import { useRole, useMemberId, useProfileHeader } from '../../../stores/profileStore'
import { useBuyerOrgs, useSupplierOrgs } from '../../../stores/orgsStore'
import { supabase } from '../../../lib/supabase'
import VideoCallButton from '../VideoCallButton'
import IncomingCallBanner from '../IncomingCallBanner'
import { fetchLiveRates, convertToUSD, FALLBACK_RATES } from '../../../utils/formatters'

// Must match the backend's upload.array('files', N) cap in routes/plm.js
const MAX_ATTACHMENTS = 10

// Matches the currency options in the buyer brief's Target Price field (USD/GBP/EUR)
const CURRENCY_SYMBOLS = { USD: '$', GBP: '£', EUR: '€' }

// Normalises attachments stored in any of three formats:
//   1. Plain URL string (old backend)
//   2. Stringified JSON string e.g. '{"url":"...","name":"...","type":"..."}' (text[] column)
//   3. Proper { url, name, type } object (jsonb column, new backend)
function normAtt(a) {
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

// A comment with only attachments (no text) has an empty body — replying to one used to
// produce a reply whose quote preview was silently blank (both in the composer's "replying
// to…" banner and in the sent message's quoted bubble), since both only ever read `.body`.
// This derives a readable stand-in for attachment-only comments: the filename (or "N
// attachments"), plus a thumbnail URL when the (single) attachment is an image.
function replyQuoteMeta(cm) {
  if (cm?.body?.trim()) return { text: cm.body, thumbUrl: null }
  const atts = cm?.attachments || []
  if (!atts.length) return { text: '', thumbUrl: null }
  const first = normAtt(atts[0])
  const isImg = first.type.startsWith('image') || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(first.name)
  if (atts.length === 1) return { text: isImg ? (first.name || 'Photo') : `📎 ${first.name || 'File'}`, thumbUrl: isImg ? first.url : null }
  return { text: `📎 ${atts.length} attachments`, thumbUrl: null }
}

function Comment({ cm, onReply }) {
  const retryComment        = usePlmStore(s => s.retryComment)
  const removeFailedComment = usePlmStore(s => s.removeFailedComment)
  const workspaceId         = usePlmStore(s => s.activeWorkspace?.id)
  const isMilestone   = cm.type === 'milestone'
  const isFieldChange = cm.type === 'field_change'
  const role          = cm.role || 'buyer'
  const date = (() => {
    if (!cm.created_at) return ''
    const d     = new Date(cm.created_at)
    const today = new Date()
    const time  = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()
    if (isToday) return time
    return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${time}`
  })()

  if (isMilestone) {
    const event = cm.metadata?.event

    if (event === 'video_call_started') return (
      <div className="flex items-center justify-center gap-2 py-2.5">
        <div className="flex-1 h-px bg-black/[.08]" />
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/[.04]">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1A1A18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
            <polygon points="23 7 16 12 23 17 23 7"/>
            <rect x="1" y="5" width="15" height="14" rx="2"/>
          </svg>
          <span className="text-[9px] font-bold uppercase tracking-[.06em] text-black">
            Video call started
            {cm.metadata?.started_by && (
              <span className="font-normal"> by {cm.metadata.started_by}</span>
            )}
          </span>
        </div>
        <div className="flex-1 h-px bg-black/[.08]" />
      </div>
    )

    if (event === 'video_call_ended') return (
      <div className="flex items-center justify-center gap-2 py-2.5">
        <div className="flex-1 h-px bg-black/[.08]" />
        <span className="text-[9px] font-bold uppercase tracking-[.06em] px-3 py-1 rounded-full bg-black/[.04] text-black">
          Video call ended
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

    const actor = cm.author_name || cm.role
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="flex-1 h-px bg-black/[.12]" />
        <span className="text-[9px] font-bold uppercase tracking-[.06em] px-2 py-0.5 rounded-full bg-black/[.06] text-black flex items-center gap-1.5">
          {cm.body}
          {actor && <span className="font-semibold normal-case tracking-normal text-[#1A1A18]">by {actor}</span>}
          {date && <span className="font-normal normal-case tracking-normal text-black">{date}</span>}
        </span>
        <div className="flex-1 h-px bg-black/[.12]" />
      </div>
    )
  }

  if (isFieldChange) {
    const actor = cm.author_name || cm.role
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

  const BORDER = { buyer: 'border-[#7c3aed]', merchant: 'border-[#ea580c]', supplier: 'border-[#faad14]' }

  const scrollToOriginal = () => {
    if (!cm.quoted_id) return
    const el = document.getElementById(`comment-${cm.quoted_id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-[#7c3aed]/40')
    setTimeout(() => el.classList.remove('ring-2', 'ring-[#7c3aed]/40'), 1200)
  }

  return (
    <div id={`comment-${cm.id}`} className={`relative rounded-r-lg px-3 py-2.5 pr-9 group bg-white border-l-[3px] transition-shadow ${BORDER[role] || 'border-black'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-black/10 text-black">{cm.author_name || role}</span>
        <span className="text-[10px] text-black">{date}</span>
      </div>
      {cm.quoted && (
        <div
          onClick={scrollToOriginal}
          className="flex items-center gap-2 px-2.5 py-1.5 mb-1.5 bg-black/[.04] border-l-2 border-[#7c3aed]/40 rounded-r cursor-pointer hover:bg-[#f5f0ff] hover:border-[#7c3aed] transition-colors"
        >
          {cm.quoted_thumb && (
            <img src={cm.quoted_thumb} alt="" className="w-8 h-8 rounded object-cover border border-black flex-shrink-0" />
          )}
          <div className="min-w-0">
            {cm.quoted_author && <div className="text-[9px] font-bold text-[#7c3aed] mb-0.5">{cm.quoted_author}</div>}
            <div className="text-[11px] text-black truncate">{cm.quoted}</div>
          </div>
        </div>
      )}
      {cm.body && <div className="text-[13px] text-[#1A1A18] leading-relaxed whitespace-pre-line">{cm.body}</div>}
      {cm.attachments?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {cm.attachments.map((raw, i) => {
            const { url, name, type } = normAtt(raw)
            const isImg = type.startsWith('image') || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(name)
            const isUploading = !!raw?.uploading
            return isImg
              ? (
                <div key={i} className="relative">
                  <img src={url} alt={name} className={`max-w-[110px] max-h-[85px] rounded object-cover border border-black ${isUploading ? 'opacity-50' : ''}`} />
                  {isUploading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                      <span className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                      <span className="text-[7px] font-bold text-white bg-black/40 px-1 py-0.5 rounded-full tabular-nums">{cm._uploadPct ?? 0}%</span>
                    </div>
                  )}
                </div>
              )
              : (
                <a key={i} href={isUploading ? undefined : url} target="_blank" rel="noreferrer"
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-black/[.04] border border-black rounded text-[11px] text-[#1A1A18] hover:bg-black/[.08] transition-colors max-w-[200px] ${isUploading ? 'pointer-events-none opacity-60' : ''}`}>
                  {isUploading
                    ? <span className="w-2.5 h-2.5 border border-black border-t-black/70 rounded-full animate-spin flex-shrink-0" />
                    : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-black">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
                      </svg>
                  }
                  <span className="truncate">{name}</span>
                </a>
              )
          })}
        </div>
      )}
      {cm._failed && (
        <div className="flex items-center gap-2 mt-1.5 text-[10px] font-semibold text-red-600">
          <span>Failed to send{cm._error ? `: ${cm._error}` : ''}</span>
          <button type="button" onClick={() => retryComment(workspaceId, cm.id)} className="underline cursor-pointer border-none bg-none p-0 text-red-600 hover:text-red-800">Retry</button>
          <button type="button" onClick={() => removeFailedComment(workspaceId, cm.id)} className="underline cursor-pointer border-none bg-none p-0 text-black hover:text-black">Remove</button>
        </div>
      )}
      <button
        type="button"
        onClick={() => onReply(cm)}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/90 border border-black flex items-center justify-center cursor-pointer text-black opacity-0 group-hover:opacity-100 transition-all hover:bg-[#1A1A18] hover:text-white"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
        </svg>
      </button>
    </div>
  )
}

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

const INVITE_MAX = 4

function InviteForm({ label, fixedDomain = null, onInvite, onClose, accent = '#7c3aed' }) {
  const [localPart, setLocalPart] = useState('')
  const [busy,      setBusy]      = useState(false)
  const [error,     setError]     = useState('')

  const fullEmail = fixedDomain ? `${localPart}@${fixedDomain}` : localPart
  const localOk   = fixedDomain
    ? localPart.trim().length > 0 && !/[@\s]/.test(localPart)
    : isValidEmail(fullEmail)

  const handleSend = async () => {
    if (!localOk) return
    setBusy(true)
    setError('')
    const result = await onInvite(fullEmail.trim())
    setBusy(false)
    if (result?.ok) { setLocalPart(''); onClose() }
    else if (result?.error) setError(result.error)
  }

  return (
    <div className="flex flex-col gap-1.5 ml-20">
      <div className="flex items-center gap-1.5">
        {fixedDomain ? (
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
        <button
          onClick={handleSend}
          disabled={busy || !localOk}
          className="px-3 py-1 text-[10px] font-bold uppercase rounded-xl text-white cursor-pointer disabled:opacity-40 hover:opacity-80 flex-shrink-0"
          style={{ backgroundColor: accent }}
        >
          {busy ? '…' : 'Send'}
        </button>
        <button onClick={onClose} className="text-black text-lg leading-none cursor-pointer border-none bg-none">×</button>
      </div>
      {error && (
        <span className="text-[10px] font-semibold text-red-500 leading-snug">{error}</span>
      )}
    </div>
  )
}

function InviteItem({ invite, onRevoke, onResend, accent }) {
  const [revoking,     setRevoking]     = useState(false)
  const [resending,    setResending]    = useState(false)
  const [resendError,  setResendError]  = useState('')
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
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[12px] text-[#1A1A18] font-medium">{invite.name || invite.email}</span>
      {invite.name && <span className="text-[10px] text-black font-mono">{invite.email}</span>}
      {invite.status === 'pending'  && <span className="text-[9px] font-bold uppercase tracking-[.06em] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">Pending</span>}
      {invite.status === 'accepted' && <span className="text-[9px] font-bold uppercase tracking-[.06em] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">Accepted</span>}
      {invite.status === 'expired'  && <span className="text-[9px] font-bold uppercase tracking-[.06em] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200">Expired</span>}
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
      {resendError && (
        <span className="w-full text-[10px] font-semibold text-red-500 leading-snug">{resendError}</span>
      )}
    </div>
  )
}

function InviteRow({ label, invites = [], orgName, fixedDomain = null, lockedMsg = null, onInvite, onRevoke }) {
  const [open, setOpen] = useState(false)
  const accent      = label === 'Buyer' ? '#7c3aed' : '#ea580c'
  const canAddMore  = invites.length < INVITE_MAX
  const hasInvites  = invites.length > 0

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
            {hasInvites && (
              <div className="flex flex-col gap-1">
                {invites.map(inv => {
                  const isTimedOut = !inv.accepted_at && inv.expires_at && new Date(inv.expires_at) < new Date()
                  const isExpired  = inv.status === 'expired' || isTimedOut
                  return (
                    <InviteItem key={inv.id || inv.email} invite={{ ...inv, status: isExpired ? 'expired' : inv.status }} accent={accent}
                      onRevoke={onRevoke && (inv.status === 'pending' || isExpired) ? () => onRevoke(inv.id) : undefined}
                      onResend={onInvite && isExpired ? onInvite : undefined}
                    />
                  )
                })}
              </div>
            )}

            {!hasInvites && orgName && (
              <span className="text-[10px] text-black">{orgName}</span>
            )}

            {canAddMore && !open && onInvite && (
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

            {!canAddMore && (
              <span className="text-[9px] font-semibold uppercase tracking-[.04em] text-black mt-0.5">Max {INVITE_MAX} invites reached</span>
            )}
          </div>
        )}
      </div>

      {open && (
        <InviteForm label={label} fixedDomain={fixedDomain} onInvite={onInvite} onClose={() => setOpen(false)} accent={accent} />
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

const IconMaterial  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
const IconFinish    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>
const IconDimension = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M9 3v18"/></svg>
const IconPrice     = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
const IconQty       = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="1"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
const IconNotes     = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>

function BriefRow({ icon, label, brief, field, setBrief, placeholder, readOnly = false, multiline = false, hasError = false, onClearError, type = 'text', step, after, uppercase = true }) {
  const [editing, setEditing] = useState(false)
  const afterRef = useRef(null)
  const val = brief[field] || ''
  const handleChange = (v) => { setBrief(b => ({ ...b, [field]: v })); if (onClearError) onClearError(field) }

  return (
    <div
      className={`flex items-start gap-2 px-2 py-1.5 rounded-md group transition-colors
        ${!readOnly ? 'hover:bg-black/[.04] cursor-pointer' : ''}
        ${hasError ? 'bg-red-50/60' : ''}`}
      onClick={() => !readOnly && !editing && setEditing(true)}
    >
      <div className="flex items-center gap-2 w-[140px] flex-shrink-0 pt-0.5">
        <span className={hasError ? 'text-red-400' : 'text-black'} style={{flexShrink:0}}>{icon}</span>
        <span className={`text-[12px] font-bold truncate ${uppercase ? 'uppercase' : ''} ${hasError ? 'text-red-500' : 'text-black'}`}>{label}</span>
        {hasError && <span className="w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />}
      </div>
      <div className={`flex items-center gap-2 min-w-0 ${after ? 'flex-1' : 'contents'}`}>
        {editing && !readOnly ? (
          multiline ? (
            <textarea
              autoFocus
              value={val}
              onChange={e => handleChange(e.target.value)}
              onBlur={e => { if (afterRef.current?.contains(e.relatedTarget)) return; setEditing(false) }}
              className="flex-1 text-[13px] text-[#1A1A18] bg-transparent outline-none resize-none leading-relaxed min-h-[60px]"
              rows={3}
            />
          ) : (
            <input
              autoFocus
              type={type}
              step={type === 'number' ? (step ?? '0.1') : undefined}
              min={type === 'number' ? '0' : undefined}
              value={val}
              onChange={e => handleChange(e.target.value)}
              onBlur={e => { if (afterRef.current?.contains(e.relatedTarget)) return; setEditing(false) }}
              onKeyDown={e => e.key === 'Enter' && setEditing(false)}
              className="flex-1 text-[13px] text-[#1A1A18] bg-transparent outline-none"
            />
          )
        ) : (
          <span className={`text-[13px] ${after ? 'min-w-[40px] flex-shrink-0 whitespace-nowrap' : 'flex-1'} ${val ? 'text-[#1A1A18]' : 'text-black'}`}>
            {val || placeholder}
          </span>
        )}
        {after && <div ref={afterRef} className="flex-1 flex-shrink-0" onClick={e => e.stopPropagation()}>{after}</div>}
      </div>
    </div>
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
  openLightbox, pinImage, setBriefErrors, toast, setSkuImageFromUrl,
  handleMediaClickDebounced, scrollToChatMessage, saveSampleFindings,
}) {
  const specImagesAll = (ws?.reference_media || [])
    .map((img, i) => ({ url: img.url, name: `spec-${img.pageIndex ?? i}`, label: 'Spec', key: `spec-${i}`, rejected: !!img.rejected, edited: !!img.edited }))
  // Images saved via the crop/replace image editor are tagged `edited: true` on the
  // backend — keep them in their own section instead of mixing them into the
  // original uploaded spec pages, which is confusing since they're derived, not source.
  const specImages   = specImagesAll.filter(img => !img.edited)
  const editedImages = specImagesAll.filter(img => img.edited)
  // All chat attachments, not just images — PDFs, spreadsheets, docs etc. now
  // show up here too (as a file tile) instead of only appearing in the chat thread.
  const chatAttachments = comments.filter(cm => cm.attachments?.length > 0).flatMap((cm) =>
    cm.attachments
      .map((raw, ai) => {
        const att = normAtt(raw)
        const isImg = att.type.startsWith('image') || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(att.name)
        return {
          ...att, isImg, uploading: !!raw?.uploading, label: cm.author_name || cm.role, key: `${cm.id}-${ai}`, isSample: false,
          commentId: cm.id, commentRole: cm.role, commentChannel: cm.channel,
          uploadPct: cm._uploadPct,
        }
      })
  )
  const sampleImages = (ws?.sampleOrder?.findings?.sample_images || [])
    .map((url, i) => ({ url, name: url.split('/').pop()?.split('?')[0] || 'sample', label: '', key: `sample-${i}`, isSample: true }))
  const allImages = [...specImages, ...editedImages, ...chatAttachments, ...sampleImages]

  if (!allImages.length) return (
    <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-black text-center py-8 leading-relaxed px-2">
      Images and files shared in comments will appear here
    </div>
  )

  const hasSampleImages = sampleImages.length > 0
  const hasSpecImages   = specImages.length > 0
  const hasEditedImages = editedImages.length > 0
  const productImageUrl   = sku?.image_url || null
  const buyerBriefImageUrl = ws?.buyer_brief?.image_url || null
  const productionImageUrl = ws?.sampleOrder?.findings?.approved_image || null
  return (
    <>
      {/* ── Pinned: Product Info image + Buyer Brief image + Production sample image ── */}
      {(productImageUrl || buyerBriefImageUrl || productionImageUrl) && (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[8px] font-bold uppercase tracking-[.1em] text-black flex-shrink-0">Pinned</span>
            <div className="flex-1 h-px bg-black/[.08]" />
          </div>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {productImageUrl && (
              <div className="aspect-square bg-[#EDEAE4] overflow-hidden relative rounded-sm">
                <img src={productImageUrl} onClick={e => { e.stopPropagation(); openLightbox([productImageUrl]) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                <div className="absolute inset-0 ring-2 ring-[#2D6A1F] ring-inset rounded-sm pointer-events-none" />
                <span className="absolute bottom-0 left-0 right-0 bg-[#2D6A1F]/90 text-white text-[7px] font-bold uppercase tracking-[.05em] text-center py-0.5">Product Image</span>
              </div>
            )}
            {buyerBriefImageUrl && (
              <div className="aspect-square bg-[#EDEAE4] overflow-hidden relative rounded-sm">
                <img src={buyerBriefImageUrl} onClick={e => { e.stopPropagation(); openLightbox([buyerBriefImageUrl]) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                <div className="absolute inset-0 ring-2 ring-[#7c3aed] ring-inset rounded-sm pointer-events-none" />
                <span className="absolute bottom-0 left-0 right-0 bg-[#7c3aed]/90 text-white text-[7px] font-bold uppercase tracking-[.05em] text-center py-0.5">Buyer Brief</span>
              </div>
            )}
            {productionImageUrl && (
              <div className="aspect-square bg-[#EDEAE4] overflow-hidden relative rounded-sm">
                <img src={productionImageUrl} onClick={e => { e.stopPropagation(); openLightbox([productionImageUrl]) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                <div className="absolute inset-0 ring-2 ring-[#c2410c] ring-inset rounded-sm pointer-events-none" />
                <span className="absolute bottom-0 left-0 right-0 bg-[#c2410c]/90 text-white text-[7px] font-bold uppercase tracking-[.05em] text-center py-0.5">Production</span>
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
              <span className="text-[8px] font-bold uppercase tracking-[.1em] text-black flex-shrink-0">From Spec</span>
              <div className="flex-1 h-px bg-black/[.08]" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            {specImages.map(({ url, key, rejected }) => {
              const isApproved     = url === ws?.buyer_brief?.image_url
              const isProductImg   = url === sku?.image_url
              const isSettingThis  = settingProductImg === url
              return (
                <div key={key} className="aspect-square bg-[#EDEAE4] overflow-hidden relative group rounded-sm">
                  <img src={url} onClick={e => { e.stopPropagation(); openLightbox(specImages.map(img => img.url), specImages.findIndex(img => img.url === url), { editable: true }) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                  {isApproved    && <div className="absolute inset-0 ring-2 ring-[#7c3aed] ring-inset rounded-sm pointer-events-none" />}
                  {isProductImg  && <div className="absolute inset-0 ring-2 ring-[#2D6A1F] ring-inset rounded-sm pointer-events-none" />}
                  {rejected && (
                    <span className="absolute bottom-1 left-1 text-[7px] font-extrabold px-1 py-0.5 uppercase bg-red-100 rounded-sm text-red-700 pointer-events-none">Rejected</span>
                  )}

                  {/* Pin as brief image — top-right, not for suppliers */}
                  {ws?.id && !isReadOnly && role !== 'supplier' && (
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
                          : 'opacity-0 group-hover:opacity-100 bg-white/90 border-black text-black hover:bg-[#7c3aed] hover:text-white hover:border-[#7c3aed]'}`}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/>
                      </svg>
                    </button>
                  )}

                  {/* Set as Product Info image — top-left, merchant only */}
                  {role === 'merchant' && sku?.id && !isReadOnly && (
                    <button
                      type="button"
                      disabled={isSettingThis}
                      title={isProductImg ? 'Current product image' : 'Set as Product Info image'}
                      onClick={e => {
                        e.stopPropagation()
                        if (isProductImg || isSettingThis) return
                        setSettingProductImg(url)
                        setSkuImageFromUrl(sku.id, url)
                          .then(() => toast?.('Product image updated'))
                          .catch(err => toast?.(err?.message || 'Failed to update image'))
                          .finally(() => setSettingProductImg(null))
                      }}
                      className={`absolute top-1 left-1 transition-opacity w-6 h-6 rounded-full flex items-center justify-center cursor-pointer border
                        ${isProductImg
                          ? 'opacity-100 bg-[#2D6A1F] border-[#2D6A1F] text-white cursor-default'
                          : isSettingThis
                            ? 'opacity-100 bg-white/90 border-black text-black'
                            : 'opacity-0 group-hover:opacity-100 bg-white/90 border-black text-black hover:bg-[#2D6A1F] hover:text-white hover:border-[#2D6A1F]'}`}
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
              )
            })}
          </div>
        </>
      )}

      {hasEditedImages && (
        <>
          <div className={`flex items-center gap-2 mb-1.5 ${hasSpecImages ? 'mt-3' : ''}`}>
            <div className="flex-1 h-px bg-black/[.08]" />
            <span className="text-[8px] font-bold uppercase tracking-[.1em] text-black flex-shrink-0">Edited Images</span>
            <div className="flex-1 h-px bg-black/[.08]" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {editedImages.map(({ url, key, rejected }) => {
              const isApproved     = url === ws?.buyer_brief?.image_url
              const isProductImg   = url === sku?.image_url
              const isSettingThis  = settingProductImg === url
              return (
                <div key={key} className="aspect-square bg-[#EDEAE4] overflow-hidden relative group rounded-sm">
                  <img src={url} onClick={e => { e.stopPropagation(); openLightbox(editedImages.map(img => img.url), editedImages.findIndex(img => img.url === url), { editable: true }) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                  {isApproved    && <div className="absolute inset-0 ring-2 ring-[#7c3aed] ring-inset rounded-sm pointer-events-none" />}
                  {isProductImg  && <div className="absolute inset-0 ring-2 ring-[#2D6A1F] ring-inset rounded-sm pointer-events-none" />}
                  {rejected && (
                    <span className="absolute bottom-1 left-1 text-[7px] font-extrabold px-1 py-0.5 uppercase bg-red-100 rounded-sm text-red-700 pointer-events-none">Rejected</span>
                  )}

                  {/* Pin as brief image — top-right, not for suppliers */}
                  {ws?.id && !isReadOnly && role !== 'supplier' && (
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
                          : 'opacity-0 group-hover:opacity-100 bg-white/90 border-black text-black hover:bg-[#7c3aed] hover:text-white hover:border-[#7c3aed]'}`}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/>
                      </svg>
                    </button>
                  )}

                  {/* Set as Product Info image — top-left, merchant only */}
                  {role === 'merchant' && sku?.id && !isReadOnly && (
                    <button
                      type="button"
                      disabled={isSettingThis}
                      title={isProductImg ? 'Current product image' : 'Set as Product Info image'}
                      onClick={e => {
                        e.stopPropagation()
                        if (isProductImg || isSettingThis) return
                        setSettingProductImg(url)
                        setSkuImageFromUrl(sku.id, url)
                          .then(() => toast?.('Product image updated'))
                          .catch(err => toast?.(err?.message || 'Failed to update image'))
                          .finally(() => setSettingProductImg(null))
                      }}
                      className={`absolute top-1 left-1 transition-opacity w-6 h-6 rounded-full flex items-center justify-center cursor-pointer border
                        ${isProductImg
                          ? 'opacity-100 bg-[#2D6A1F] border-[#2D6A1F] text-white cursor-default'
                          : isSettingThis
                            ? 'opacity-100 bg-white/90 border-black text-black'
                            : 'opacity-0 group-hover:opacity-100 bg-white/90 border-black text-black hover:bg-[#2D6A1F] hover:text-white hover:border-[#2D6A1F]'}`}
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
              )
            })}
          </div>
        </>
      )}

      {chatAttachments.length > 0 && (
        <>
          {(hasSpecImages || hasEditedImages) && (
            <div className="flex items-center gap-2 mt-3 mb-1.5">
              <div className="flex-1 h-px bg-black/[.08]" />
              <span className="text-[8px] font-bold uppercase tracking-[.1em] text-black flex-shrink-0">From Chat</span>
              <div className="flex-1 h-px bg-black/[.08]" />
            </div>
          )}
        </>
      )}
      {chatAttachments.length > 0 && (() => {
        const chatSlice = chatAttachments.slice(0, 24)
        const chatImagesOnly = chatSlice.filter(a => a.isImg)
        return (
        <div className="grid grid-cols-2 gap-1.5">
          {chatSlice.map(({ url, name, isImg, label, key, uploading, commentId, commentRole, commentChannel, uploadPct }) => {
            const isApproved = isImg && url && url === ws?.buyer_brief?.image_url

            if (!isImg) {
              return (
                <div key={key} className="aspect-square bg-[#EDEAE4] overflow-hidden relative group rounded-sm" title="Double-click to jump to this message in chat">
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
                    <span className="absolute bottom-1 left-1 text-[7px] font-extrabold px-1 py-0.5 uppercase bg-white/90 rounded-sm text-[#1A1A18] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">{label}</span>
                  )}
                </div>
              )
            }

            return (
              <div key={key} className="aspect-square bg-[#EDEAE4] overflow-hidden relative group rounded-sm" title="Double-click to jump to this message in chat">
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
                {label && !uploading && (
                  <span className="absolute bottom-1 left-1 text-[7px] font-extrabold px-1 py-0.5 uppercase bg-white/90 rounded-sm text-[#1A1A18] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">{label}</span>
                )}
                {ws?.id && !isReadOnly && !uploading && role !== 'supplier' && (
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
                        : 'opacity-0 group-hover:opacity-100 bg-white/90 border-black text-black hover:bg-[#7c3aed] hover:text-white hover:border-[#7c3aed]'}`}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/>
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
        </div>
        )
      })()}

      {hasSampleImages && (
        <>
          <div className="flex items-center gap-2 mt-3 mb-1.5">
            <div className="flex-1 h-px bg-black/[.08]" />
            <span className="text-[8px] font-bold uppercase tracking-[.1em] text-black flex-shrink-0">Sample Images</span>
            <div className="flex-1 h-px bg-black/[.08]" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {sampleImages.map(({ url, key }) => {
              const isApprovedSku = url === ws?.sampleOrder?.findings?.approved_image
              // Re-picking the production image from here (not just the Sample tab
              // grid) saves immediately via saveSampleFindings — there's no separate
              // "Save Findings" step for this one field, so both sides see the change
              // right away without either side needing to resubmit the whole form. Both
              // merchant and buyer can pick it (unlike the measurement fields, which stay
              // merchant-only) since it's just "which photo represents this," not a finding.
              const canPick = (role === 'merchant' || role === 'buyer') && !isReadOnly && ws?.sampleOrder?.sample_status !== 'dropped'
              return (
                <div key={key} className="aspect-square bg-[#EDEAE4] overflow-hidden relative rounded-sm group">
                  <img src={url} onClick={e => { e.stopPropagation(); openLightbox(sampleImages.map(img => img.url), sampleImages.findIndex(img => img.url === url), { editable: true, isSample: true }) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                  {isApprovedSku && <div className="absolute inset-0 ring-2 ring-[#c2410c] ring-inset rounded-sm pointer-events-none" />}
                  {isApprovedSku && (
                    <span className="absolute bottom-1 left-1 text-[7px] font-extrabold px-1 py-0.5 uppercase bg-[#ffedd5] rounded-sm text-[#c2410c]">Production</span>
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
                      className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center border cursor-pointer transition-all
                        ${isApprovedSku
                          ? 'opacity-100 bg-[#c2410c] border-[#c2410c] text-white hover:bg-red-500 hover:border-red-500'
                          : 'opacity-0 group-hover:opacity-100 bg-white/90 border-black text-black hover:bg-[#c2410c] hover:text-white hover:border-[#c2410c]'}`}
                    >
                      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

export default function WorkspaceModal() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeSku        = usePlmStore(s => s.activeSku)
  const activeWorkspace  = usePlmStore(s => s.activeWorkspace)
  const activeWorkspaceId = usePlmStore(s => s.activeWorkspaceId)
  const workspaceLoading = usePlmStore(s => s.workspaceLoading)
  const closeWorkspace   = usePlmStore(s => s.closeWorkspace)
  const sendComment      = usePlmStore(s => s.sendComment)
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
  const rejectSample          = usePlmStore(s => s.rejectSample)
  const updateSampleOrder     = usePlmStore(s => s.updateSampleOrder)
  const setHoldDropStatus     = usePlmStore(s => s.setHoldDropStatus)
  const bulkSetWorkspaceStatus = usePlmStore(s => s.bulkSetWorkspaceStatus)
  const saveSampleFindings    = usePlmStore(s => s.saveSampleFindings)
  const fetchSampleVersions   = usePlmStore(s => s.fetchSampleVersions)
  const uploadSampleImages    = usePlmStore(s => s.uploadSampleImages)
  const updateVendorSkuRef    = usePlmStore(s => s.updateVendorSkuRef)
  const revokeInvite          = usePlmStore(s => s.revokeInvite)
  const toast                 = usePlmStore(s => s.toast)
  const role             = (useRole() || 'buyer').toLowerCase()
  const memberId         = useMemberId()
  const profileHeader    = useProfileHeader()
  const buyerOrgs        = useBuyerOrgs()
  const supplierOrgs     = useSupplierOrgs()

  const [text,      setText]      = useState('')
  const [replyTo,   setReplyTo]   = useState(null)
  const [tabState,  setTabState]  = useState({ wsId: null, tab: 'product' })
  const [chatTab,   setChatTab]   = useState('buyer')
  const [leftWidth, setLeftWidth] = useState(620)
  const [brief, setBrief] = useState({
    buyer_ref: '', description: '', material: '', weight: '', dimensions: '',
    finish: '', color: '', unit_price: '', currency: 'USD', unit_qty: '', quality_notes: '',
  })
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
  const [savingBrief,    setSavingBrief]    = useState(false)
  const [generatingRef,  setGeneratingRef]  = useState(false)
  const [briefErrors, setBriefErrors] = useState(new Set())
  const [pendingFiles, setPendingFiles] = useState([])
  const [chatDragActive, setChatDragActive] = useState(false)
  const [sampleReadyDate,     setSampleReadyDate]     = useState('')
  const [sampleNotes,         setSampleNotes]         = useState('')
  const [savingSampleNotes,   setSavingSampleNotes]   = useState(false)
  const [statusBarCollapsed,  setStatusBarCollapsed]  = useState(false)
  const [sampleVersions,      setSampleVersions]      = useState([])   // past dropped/rejected rounds, for "View Previous Findings"
  const [selectedVersionId,   setSelectedVersionId]   = useState('')   // '' = current round
  const [revisionNote,        setRevisionNote]        = useState('')
  const [showRevisionInput,   setShowRevisionInput]   = useState(false)
  const [submittingRevision,  setSubmittingRevision]  = useState(false)
  const [acceptingWs,         setAcceptingWs]         = useState(false)
  const [rejectNote,          setRejectNote]          = useState('')
  const [showRejectInput,     setShowRejectInput]     = useState(false)
  const [submittingReject,    setSubmittingReject]    = useState(false)
  const [showSamplePO,        setShowSamplePO]        = useState(false)
  const [findings,          setFindings]          = useState({})
  // Pristine snapshot of findings as-loaded — same purpose as originalBriefRef: lets
  // handleSaveFindings send only the sub-fields actually edited, not the whole object.
  const originalFindingsRef = useRef({})
  const [savingFindings,    setSavingFindings]    = useState(false)
  const [uploadingImages,   setUploadingImages]   = useState(false)
  const [dimUnit,           setDimUnit]           = useState('cm')
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
  const [lbZoom,   setLbZoom]   = useState(1)
  const [lbPan,    setLbPan]    = useState({ x: 0, y: 0 })
  const lbDragRef  = useRef(null) // { startX, startY, panX, panY, moved }
  const lbHoldRef  = useRef(null) // interval id for hold-to-zoom
  const threadRef  = useRef(null)
  const fileRef    = useRef(null)
  const dragRef    = useRef({ active: false, startX: 0, startW: 0 })
  const [pendingScrollId, setPendingScrollId] = useState(null) // comment id to scroll the chat thread to once its tab is visible
  const scrolledIdRef = useRef(null) // last id the scroll effect below already handled — avoids re-running via setState-in-effect
  const mediaClickTimerRef = useRef(null) // discriminates single-click (zoom) from double-click (jump to chat) on reference-media thumbnails

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

  // Below this width the 3-pane grid (details / activity / media) can't fit side by side —
  // stack into a single pane switched by a tab bar instead (tablets, small laptops).
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024)
  const [mobilePanel, setMobilePanel] = useState('details') // 'details' | 'activity' | 'media' — only used when isNarrow
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const onChange = (e) => setIsNarrow(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
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

  const clampZoom = z => Math.min(5, Math.max(0.1, Math.round(z * 100) / 100))
  const openLightbox = (images, index = 0, { editable = false, isSample = false } = {}) => {
    setLightbox({ images: Array.isArray(images) ? images.filter(Boolean) : [images].filter(Boolean), index, editable, isSample })
    setLbZoom(1)
    setLbPan({ x: 0, y: 0 })
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
    const targetTab = commentRole === 'buyer' ? 'buyer'
      : commentRole === 'supplier' ? 'vendor'
      : (commentChannel === 'vendor' || commentChannel === 'supplier') ? 'vendor' : 'buyer'
    setChatTab(targetTab)
    setPendingScrollId(commentId)
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
        setSearchParams(p, { replace: true })
      }
    } else if (current && !activeWorkspaceId) {
      const p = new URLSearchParams(searchParams)
      p.delete('workspace')
      setSearchParams(p, { replace: true })
    }
  }, [ws?.id, workspaceLoading, activeWorkspaceId])

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
      quality_notes: saved.quality_notes || '',
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
      quality_notes: saved.quality_notes || '',
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
    if (['approved', 'sample', 'production'].includes(status)) return 'sample'
    if (status === 'active') return 'buyer'
    return 'product'
  }
  const activeTab = tabState.wsId === (ws?.id ?? sku?.workspace_id)
    ? tabState.tab
    : defaultTabForStatus(ws?.status ?? sku?.workspace_status)
  const setActiveTab = (tab) => setTabState({ wsId: ws?.id ?? sku?.workspace_id, tab })

  // Auto-switch tab on status transitions (invited→active→approved etc.)
  useEffect(() => {
    if (!ws?.id || !ws?.status) return
    const next = ['approved', 'sample', 'production'].includes(ws.status)
      ? 'sample'
      : ws.status === 'active' ? 'buyer' : null
    if (!next) return
    setTabState(prev => {
      if (prev.wsId !== ws.id || prev.tab === next) return prev
      return { wsId: ws.id, tab: next }
    })
  }, [ws?.status, ws?.id])

  useEffect(() => {
    setSampleReadyDate(ws?.sampleOrder?.target_ready_date?.slice(0, 10) || '')
    setSampleNotes(ws?.sampleOrder?.additional_notes || '')
    const seededFindings = ws?.sampleOrder?.findings || {}
    setFindings(seededFindings)
    originalFindingsRef.current = seededFindings
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

  useEffect(() => {
    const l   = parseFloat(findings.master_l)
    const w   = parseFloat(findings.master_w)
    const h   = parseFloat(findings.master_h)
    const qty = parseFloat(findings.master_qty) || 1
    if (!l || !w || !h) return
    const unit      = sku?.measurement || ws?.measurement || 'cm'
    const divisor   = unit === 'in' ? 61023.744 : 1_000_000
    const cbm = (l * w * h * qty / divisor).toFixed(4)
    setFindings(f => ({ ...f, cbm }))
  }, [findings.master_l, findings.master_w, findings.master_h, findings.master_qty, sku?.measurement, ws?.measurement])

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
  const supplier    = sku?.supplier    || ws?.supplier    || '—'
  const category    = sku?.category   || ws?.category    || null
  const season      = sku?.season     || ws?.season      || null

  const comments = ws?.npd_comments || []
  const isSystemComment = c => c.type === 'milestone' || c.type === 'field_change' || c.type === 'spec_summary'
  const buyerComments  = comments.filter(c => c.type === 'spec_summary' || c.role === 'buyer' || (c.role === 'merchant' && (c.channel === 'buyer' || isSystemComment(c))))
  const vendorComments = comments.filter(c => c.role === 'supplier' || (c.role === 'merchant' && (c.channel === 'vendor' || c.channel === 'supplier')))

  // Tabs visible per role
  const chatTabs = role === 'merchant'
    ? [['buyer', 'Buyer Activity', buyerComments.length], ['vendor', 'Vendor Activity', vendorComments.length]]
    : role === 'buyer'
      ? [['buyer', 'Activity', buyerComments.length]]
      : [['vendor', 'Activity', vendorComments.length]]

  // Which comments to show for current tab
  const visibleComments = role === 'merchant'
    ? (chatTab === 'buyer' ? buyerComments : vendorComments)
    : role === 'buyer' ? buyerComments : vendorComments

  // Placeholder text for message input
  const chatPlaceholder = role === 'merchant'
    ? `Message ${chatTab}…`
    : 'Write a message…'

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [comments.length])

  const chatLocked = isReadOnly || !ws?.id || ws?.status === 'invited'
    || (role === 'supplier' && memberId !== ws?.supplier_member_id && !ws?.extra_supplier_member_ids?.includes(memberId))

  const handleSend = () => {
    if ((!text.trim() && pendingFiles.length === 0) || chatLocked) return
    const body = text.trim()
    const files = pendingFiles
    // Fall back to a readable stand-in (filename, or a thumbnail for a single image) when
    // replying to an attachment-only comment — sendComment only forwards `.body`/`.quoted_thumb`
    // into the quoted bubble, so an empty body here would otherwise render as a blank quote box.
    let reply = null
    if (replyTo) {
      const { text, thumbUrl } = replyQuoteMeta(replyTo)
      reply = { ...replyTo, body: text, quoted_thumb: thumbUrl }
    }
    // Clear the composer immediately so the user can keep chatting — the
    // message renders optimistically and files upload in the background.
    setText('')
    setPendingFiles([])
    setReplyTo(null)
    sendComment(ws.id, body, chatTab === 'vendor' ? 'supplier' : chatTab, files, reply)
      .catch(err => toast(err.message))
  }

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
    const orgId = ws?.buyer_org_id
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

  // A workspace put on hold / rejected AFTER it already had a sample order (e.g. holding it
  // mid-sample, or rejecting it post-approval) must stay locked — otherwise re-editing the
  // price/qty and hitting "Proceed to Sample" again collides with the still-existing sample
  // order on the backend ("Sample order already exists"). Pre-approval hold/reject (no sample
  // order yet) still unlocks the brief as before, since there's nothing to collide with.
  const briefLocked = isReadOnly || role === 'supplier'
    || ['approved', 'sample', 'production'].includes(ws?.status)
    || (['on_hold', 'rejected'].includes(ws?.status) && !!ws?.sampleOrder)

  const handleSaveVendorSkuRef = async () => {
    if (!sku?.id) return
    setSavingVendorRef(true)
    try {
      await updateVendorSkuRef(sku.id, vendorSkuRef)
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
      setActiveTab('buyer')
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
      return [...prev, ...files.slice(0, room)]
    })
  }, [toast])

  const handleFileChange = useCallback((e) => {
    addPendingFiles(Array.from(e.target.files || []))
    e.target.value = ''
  }, [addPendingFiles])

  // Lets a user paste a copied file (e.g. from Windows Explorer) or a screenshot
  // straight into the composer, same as clicking the attach button.
  const handleComposerPaste = useCallback((e) => {
    const files = Array.from(e.clipboardData?.files || [])
    if (!files.length) return
    e.preventDefault()
    addPendingFiles(files)
  }, [addPendingFiles])

  // Drag-and-drop onto the composer — same target as paste/the attach button.
  const handleComposerDragOver = useCallback((e) => {
    if (chatLocked) return
    e.preventDefault()
    setChatDragActive(true)
  }, [chatLocked])

  const handleComposerDragLeave = useCallback((e) => {
    e.preventDefault()
    setChatDragActive(false)
  }, [])

  const handleComposerDrop = useCallback((e) => {
    e.preventDefault()
    setChatDragActive(false)
    if (chatLocked) return
    addPendingFiles(Array.from(e.dataTransfer?.files || []))
  }, [chatLocked, addPendingFiles])

  const INVITE_MESSAGES = {
    already_accepted: 'This person has already accepted an invite to this workspace.',
    already_sent:     'An invite is already pending for this email.',
    limit_exceeded:   `Maximum ${INVITE_MAX} invites allowed per role for this workspace.`,
  }

  const handleInviteBuyer = async (email) => {
    if (!sku?.id) return { ok: false }
    if (ws?.id) {
      try {
        const result = await addWorkspaceInvite(ws.id, email, 'buyer', buyerOrgId || ws.buyer_org_id || undefined)
        if (result?.status && INVITE_MESSAGES[result.status]) return { ok: false, error: INVITE_MESSAGES[result.status] }
        return { ok: true }
      } catch (err) { return { ok: false, error: err.message } }
    } else {
      try {
        const result = await sendInvite(sku.id, email, undefined, memberId, { buyerOrgId: buyerOrgId || undefined, supplierOrgId: sku.supplier_org_id || undefined })
        if (result?.workspace?.id) openWorkspace(result.workspace.id, sku)
        return { ok: true }
      } catch (err) { return { ok: false, error: err.message } }
    }
  }

  const handleInviteVendor = async (email) => {
    if (!ws?.id) return { ok: false }
    try {
      const result = await addWorkspaceInvite(ws.id, email, 'supplier', ws.supplier_org_id || undefined)
      if (result?.status && INVITE_MESSAGES[result.status]) return { ok: false, error: INVITE_MESSAGES[result.status] }
      return { ok: true }
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
        return { title: 'Activate workspace', body: 'Use the Invite Buyer button on the Product tab to bring a buyer into this workspace. Once they join, you can collaborate on briefs and move to sampling.' }
      if (status === 'invited' && !buyerJoined)
        return { title: 'Waiting for buyer', body: 'Invite sent — the buyer needs to accept the invite and set up their account. They\'ll receive an email with a link to join.' }
      if (status === 'active' && activeTab === 'product')
        return { title: 'Buyer is in', body: 'The buyer has joined. Ask them to fill in their brief on the Buyer Brief tab. You can monitor their requirements there.' }
      if (status === 'active' && activeTab === 'buyer')
        return { title: 'Review the brief', body: 'Review the buyer\'s requirements here. The buyer will click "Proceed to Sample" when they\'re ready — you\'ll then see a Sample tab appear.' }
      if (status === 'approved' && sampleSt === 'ready')
        return { title: 'Sample marked ready — add findings', body: 'Upload sample images and fill in the findings: Actual Weight, Actual L×W×H, Inner Qty, Inner L×W×H, Master Qty, Master L×W×H, Master Weight, and CBM. The buyer needs these details before they can review and accept the sample.' }
      if (status === 'approved')
        return { title: 'Buyer approved — create sample', body: 'Head to the Sample tab and set a target ready date so the buyer knows when to expect the sample. Update the status to "Ready" once it\'s prepared.' }
      if (status === 'sample' && sampleSt === 'in_process')
        return { title: 'Sample in progress', body: 'Once the sample is physically ready, update the status to "Ready" — the buyer will be notified to review it and can then accept or request a revision.' }
      if (status === 'sample' && sampleSt === 'ready')
        return { title: 'Waiting for buyer review', body: 'You\'ve marked the sample as ready. The buyer will review the findings and either accept or request a revision.' }
      if (status === 'sample' && sampleSt === 'on_hold')
        return { title: 'Sample on hold', body: 'The sample is on hold. Update the status when you\'re ready to continue.' }
      if (status === 'on_hold')
        return { title: 'Workspace on hold', body: 'This workspace is paused. Update the sample status when you\'re ready to resume.' }
      if (status === 'production')
        return { title: 'In production', body: 'The buyer accepted the sample — this SKU is now in production. No further action needed in the workspace.' }
      return null
    }

    if (role === 'buyer') {
      if (status === 'invited' || (status === 'active' && activeTab === 'product'))
        return { title: 'Start with your brief', body: 'Switch to the "My Brief" tab, fill in your design requirements, and click Save Brief. You\'ll need to save before you can proceed to sample.' }
      if (status === 'active' && activeTab === 'buyer' && !briefSaved)
        return { title: 'Save your brief first', body: 'Fill in all your requirements and click Save Brief at the bottom. Once saved, the "Proceed to Sample" button in the top bar will be ready to use.' }
      if (status === 'active' && activeTab === 'buyer' && briefSaved)
        return { title: 'Brief saved — ready to proceed?', body: 'Your brief is saved. When you\'re happy with all requirements, click "Proceed to Sample" in the top bar to move forward to sampling.' }
      if (status === 'approved')
        return { title: 'Approval confirmed', body: 'You\'ve approved this product for sampling. The merchant is now preparing a sample — you\'ll see a target ready date here once it\'s set.' }
      if (status === 'sample' && sampleSt === 'in_process')
        return { title: 'Sample in progress', body: 'The merchant is preparing your sample. Check back when the status changes to "Ready" — you\'ll then be able to review the findings and accept or request changes.' }
      if (status === 'sample' && sampleSt === 'ready')
        return { title: 'Sample is ready!', body: 'Review the sample findings below. If you\'re happy, click Accept Sample. If changes are needed, use Request Revision to send feedback to the merchant.' }
      if (status === 'on_hold' || (status === 'sample' && sampleSt === 'on_hold'))
        return { title: 'On hold', body: 'This workspace is currently on hold. Reach out to the merchant for an update.' }
      if (status === 'production')
        return { title: 'In production', body: 'You accepted the sample — this SKU is now confirmed for production.' }
      return null
    }

    return null
  })()

  return (
    <div className="ws-modal-root fixed inset-0 z-[1000] flex flex-col bg-white font-sans text-[#1A1A18] text-[13px]">
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

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-2 px-3 sm:px-5 py-2.5 border-b border-black flex-shrink-0">
        {/* Left: SKU | Buyer Ref | Vendor + hint */}
        <div className="flex items-center flex-wrap gap-3">
        <div className="flex items-center flex-wrap divide-x divide-black/[.12]">
          <div className="pr-5">
            <div className="text-[9px] font-bold uppercase tracking-[.1em] text-black mb-0.5">TWIF SKU</div>
            <div className="text-[13px] font-extrabold font-mono text-[#1A1A18]">{autoCode}</div>
          </div>
          {role !== 'buyer' && (
            <div className="px-5">
              <div className="text-[9px] font-bold uppercase tracking-[.1em] text-black mb-0.5">Buyer Ref</div>
              <div className="text-[13px] font-bold text-[#1A1A18]" title="Edit this on the Buyer Brief tab">
                {brief.buyer_ref || ws?.buyer_ref || '—'}
              </div>
            </div>
          )}
          <div className="px-5">
            <div className="text-[9px] font-bold uppercase tracking-[.1em] text-black mb-0.5">Vendor Stock #</div>
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
            <div className="px-5">
              <div className="text-[9px] font-bold uppercase tracking-[.1em] text-black mb-0.5">Status</div>
              <StatusBadge status={ws.status} />
            </div>
          )}
        </div>
        {hint && (
          <div className="relative group flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-[.04em] whitespace-nowrap">Info</span>
            <button
              type="button"
              className="flex items-center justify-center transition-all cursor-pointer border-none bg-none text-amber-400 group-hover:text-amber-500"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}>info</span>
            </button>
            <div className="absolute left-0 top-full mt-2 w-72 bg-[#1A1A18] text-white rounded-lg shadow-xl z-50 p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity pointer-events-none">
              <span className="text-[11px] font-extrabold uppercase tracking-[.06em] text-amber-400 block mb-2">{hint.title}</span>
              <p className="text-[12px] text-white/70 leading-relaxed">{hint.body}</p>
            </div>
          </div>
        )}
        </div>

        {/* Right: hold/reject/resume, approve, created, close */}
        <div className="flex items-center flex-wrap gap-2 sm:gap-4">
          {ws && role !== 'supplier' && ['on_hold', 'rejected'].includes(ws.status) && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setWsHoldRejectAction({ status: 'active' })}
                className="px-2.5 sm:px-3 py-2 text-[10px] font-extrabold uppercase tracking-[.06em] border border-black text-black hover:border-[#166534] hover:text-[#166534] cursor-pointer whitespace-nowrap rounded-sm bg-white"
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
          {ws && !isReadOnly && role !== 'supplier' && !['on_hold', 'rejected'].includes(ws.status) && (
            <div className="relative">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setWsHoldRejectAction({ status: 'on_hold' })}
                  className="px-2.5 sm:px-3 py-2 text-[10px] font-extrabold uppercase tracking-[.06em] border border-[#F0B429] text-[#8C3A00] bg-[#FFE8D0] hover:bg-[#FFDCB0] cursor-pointer whitespace-nowrap rounded-sm"
                >
                  On Hold
                </button>
                <button
                  type="button"
                  onClick={() => setWsHoldRejectAction({ status: 'rejected' })}
                  className="px-2.5 sm:px-3 py-2 text-[10px] font-extrabold uppercase tracking-[.06em] border border-[#E57373] text-[#7A1A1A] bg-[#FCEAEA] hover:bg-[#FADBDB] cursor-pointer whitespace-nowrap rounded-sm"
                >
                  Reject
                </button>
              </div>

              {wsHoldRejectAction && (
                <div className="absolute left-0 top-full mt-2 w-72 bg-white border border-black rounded-md shadow-xl z-20 p-3 flex flex-col gap-3">
                  <div className="text-[11px] font-semibold text-[#1A1A18] leading-snug">
                    Are you sure you want to {wsHoldRejectAction.status === 'on_hold' ? 'mark this workspace on hold' : 'reject this workspace'}?
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
            <button onClick={handleApproveToSample} className="px-3 sm:px-4 py-2 text-[10px] font-extrabold uppercase tracking-[.06em] bg-[#1A1A18] text-white cursor-pointer hover:opacity-80 flex items-center gap-1.5 whitespace-nowrap rounded-sm">
              Proceed to Sample
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
            className="px-3 sm:px-4 py-2 text-[10px] border border-neutral-600 font-extrabold uppercase tracking-[.06em] bg-white text-black hover:bg-neutral-100 cursor-pointer  flex items-center gap-1.5 whitespace-nowrap rounded-sm"
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
          {/* Mobile/tablet pane switcher — panels stack below 1024px, this picks which one shows */}
          {isNarrow && (
            <div className="flex border-b border-black flex-shrink-0">
              {[['details', 'Details'], ['activity', 'Activity'], ['media', 'Media']].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMobilePanel(k)}
                  className={`flex-1 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[.06em] cursor-pointer transition-colors border-b-2
                    ${mobilePanel === k ? 'border-[#7c3aed] text-[#1A1A18] bg-white' : 'border-transparent text-black bg-transparent hover:text-black'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        <div
          className={`flex flex-1 min-h-0 overflow-hidden ${isNarrow ? 'flex-col' : ''}`}
          style={isNarrow ? undefined : { display: 'grid', gridTemplateColumns: `${leftWidth}px 1fr 240px` }}
        >

          {/* ── Left panel ── */}
          <div className={`flex-col overflow-hidden relative ${isNarrow ? (mobilePanel === 'details' ? 'flex flex-1 w-full' : 'hidden') : 'flex'}`}>
            {/* Tab switcher — fixed h-11 matches the chat tab row and the media panel header
                so all three header rows' bottom borders land on the same line across columns */}
            <div className="h-11 flex border-b border-black flex-shrink-0">
              {[
              ['product', 'Product Info'],
              ['buyer',   role === 'buyer' ? 'MY BRIEF' : 'BUYER BRIEF'],
              ...(['approved','sample','production'].includes(ws?.status) ? [['sample', 'Sample']] : []),
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

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
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
              ) : activeTab === 'product' ? (
                <>
                  {/* Image + details side by side */}
                  <div className="flex gap-4">
                    {/* Image 300×300 */}
                    <div className="bg-[#EDEAE4] w-[240px] h-[240px] flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {sku?.image_url || ws?.image_url
                        ? <img src={sku?.image_url || ws?.image_url} alt={autoCode} onClick={e => { e.stopPropagation(); openLightbox([sku?.image_url || ws?.image_url]) }} className="w-full h-full object-cover cursor-zoom-in" />
                        : <div className="w-12 h-12 bg-black/[.08] rounded" />
                      }
                    </div>

                    {/* Description + details */}
                    <div className="flex flex-col gap-3 flex-1 min-w-0">
                      {/* Title */}
                      <div className="text-[15px] font-extrabold uppercase leading-tight tracking-[.01em]">{displayName}</div>

                      {/* Badges */}
                      <div className="flex gap-1.5 flex-wrap">
                        {category && <span className="text-[9px] font-bold px-2 py-0.5 bg-[#e8f0ff] text-[#3b5bdb] uppercase tracking-[.06em] rounded-full">{category}</span>}
                        {supplier !== '—' && <span className="text-[9px] font-bold px-2 py-0.5 bg-[#fff3e0] text-[#e65100] uppercase tracking-[.06em] rounded-full">{supplier}</span>}
                        {season && <span className="text-[9px] font-bold px-2 py-0.5 bg-[#f3e8ff] text-[#6d28d9] uppercase tracking-[.06em] rounded-full">{season}</span>}
                      </div>

                      {/* Attributes */}
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        {[
                          ['Material',   sku?.material   || ws?.material],
                          ['Weight',     (sku?.weight || ws?.weight) ? `${sku?.weight || ws?.weight} kg` : null],
                          ['Dimensions', (() => {
                            const l = sku?.length || ws?.length
                            const w = sku?.width  || ws?.width
                            const h = sku?.height || ws?.height
                            const unit = sku?.measurement || ws?.measurement || 'cm'
                            if (l || w || h) return [l, w, h].filter(Boolean).join(' × ') + ` ${unit}`
                            return sku?.dimensions || ws?.dimensions
                          })()],
                          ['Finish',     sku?.finish     || ws?.finish],
                        ].filter(([, v]) => v).map(([label, val]) => (
                          <div key={label}>
                            <div className="text-[9px] font-bold uppercase tracking-[.08em] text-black mb-0.5">{label}</div>
                            <div className="text-[11px] font-bold uppercase text-[#1A1A18]">{val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Invite rows (merchant only) + unit price + notice */}
                  <div className="flex flex-col">
                    {/* Full access (creator OR a paired peer merchant via merchant_access_pairs)
                        can invite — only the admin's cross-member read-only view is blocked. */}
                    {role === 'merchant' && !isReadOnly && <>
                      <InviteRow label="Buyer"  invites={ws?.buyer_invites    || []} orgName={ws?.buyer_org_name    || sku?.upload_buyer_org_name} fixedDomain={buyerOrgDomain}    onInvite={handleInviteBuyer}  onRevoke={ws?.id ? (inviteId) => revokeInvite(ws.id, inviteId) : undefined} />
                      <InviteRow label="Vendor" invites={ws?.supplier_invites || []} orgName={ws?.supplier_org_name || sku?.supplier}                fixedDomain={supplierOrgDomain} onInvite={handleInviteVendor} onRevoke={ws?.id ? (inviteId) => revokeInvite(ws.id, inviteId) : undefined} lockedMsg={!ws?.buyer_member_id ? (ws?.buyer_invites?.length ? 'Waiting for buyer to accept before you can invite a vendor' : 'Invite a buyer first to activate the workspace') : null} />
                    </>}
                    {role === 'merchant' && isReadOnly && (ws?.buyer_invites?.length || ws?.supplier_invites?.length || ws?.buyer_email || ws?.supplier_email) && (
                      <>
                        {(ws?.buyer_invites?.length > 0)
                          ? <InviteRow label="Buyer"  invites={ws.buyer_invites}    orgName={ws?.buyer_org_name    || sku?.upload_buyer_org_name} />
                          : ws?.buyer_email && <div className="flex items-center gap-4 py-2.5 border-b border-black"><span className="text-[10px] font-bold uppercase tracking-[.1em] text-black w-16 flex-shrink-0">Buyer</span><span className="text-[12px] text-[#1A1A18] font-medium">{ws.buyer_name || ws.buyer_email}</span>{ws.buyer_name && <span className="text-[10px] text-black font-mono">{ws.buyer_email}</span>}{ws?.buyer_org_name && <span className="text-[10px] text-black">{ws.buyer_org_name}</span>}</div>
                        }
                        {(ws?.supplier_invites?.length > 0)
                          ? <InviteRow label="Vendor" invites={ws.supplier_invites} orgName={ws?.supplier_org_name || sku?.supplier} />
                          : ws?.supplier_email && <div className="flex items-center gap-4 py-2.5 border-b border-black"><span className="text-[10px] font-bold uppercase tracking-[.1em] text-black w-16 flex-shrink-0">Vendor</span><span className="text-[12px] text-[#1A1A18] font-medium">{ws.supplier_name || ws.supplier_email}</span>{ws.supplier_name && <span className="text-[10px] text-black font-mono">{ws.supplier_email}</span>}{ws?.supplier_org_name && <span className="text-[10px] text-black">{ws.supplier_org_name}</span>}</div>
                        }
                      </>
                    )}

                    {/* Unit price */}
                    {/* <div className="flex items-center gap-4 py-2.5 border-b border-black">
                      <span className="text-[10px] font-bold uppercase tracking-[.1em] text-black w-16 flex-shrink-0">Unit Price ($)</span>
                      <input
                        placeholder="Enter Price"
                        className="flex-1 text-[12px] font-medium text-[#1A1A18] bg-transparent border-none outline-none placeholder:text-black/25"
                      />
                    </div> */}
                  </div>

                  {/* Buyer view: merchant who invited + co-buyers */}
                  {role === 'buyer' && ws?.id && (
                    <div className="flex flex-col">
                      {(ws?.merchant_name || ws?.merchant_email) && (
                        <div className="flex items-center gap-4 py-2.5 border-b border-black">
                          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-black w-16 flex-shrink-0">From</span>
                          <span className="text-[12px] text-[#1A1A18] font-medium">{ws.merchant_name || ws.merchant_email}</span>
                          {ws.merchant_name && <span className="text-[10px] text-black font-mono">{ws.merchant_email}</span>}
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
                                  <span className="text-[12px] text-[#1A1A18] font-medium">{inv.name || inv.email}</span>
                                  {inv.name && <span className="text-[10px] text-black font-mono">{inv.email}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {/* Supplier view: merchant who invited + own vendor org */}
                  {role === 'supplier' && ws?.id && (
                    <div className="flex flex-col">
                      {(ws?.merchant_name || ws?.merchant_email) && (
                        <div className="flex items-center gap-4 py-2.5 border-b border-black">
                          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-black w-16 flex-shrink-0">From</span>
                          <span className="text-[12px] text-[#1A1A18] font-medium">{ws.merchant_name || ws.merchant_email}</span>
                          {ws.merchant_name && <span className="text-[10px] text-black font-mono">{ws.merchant_email}</span>}
                        </div>
                      )}
                      {(ws?.supplier_name || ws?.supplier_email || ws?.supplier_org_name) && (
                        <div className="flex items-center gap-4 py-2.5 border-b border-black">
                          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-black w-16 flex-shrink-0">Vendor</span>
                          <span className="text-[12px] text-[#1A1A18] font-medium">{ws.supplier_name || ws.supplier_email}</span>
                          {ws.supplier_name && <span className="text-[10px] text-black font-mono">{ws.supplier_email}</span>}
                          {ws?.supplier_org_name && <span className="text-[10px] text-black">{ws.supplier_org_name}</span>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notice — shown only when no buyer invited yet and not read-only */}
                  {role === 'merchant' && !isReadOnly && !ws?.buyer_email && !ws?.buyer_member_id && (
                    <div className="border-l-[3px] border-black bg-black/[.03] px-3 py-2.5 rounded-r">
                      <div className="text-[9px] font-extrabold uppercase tracking-[.08em] text-black mb-1">Activate Workspace</div>
                      <div className="text-[11px] text-black leading-relaxed">
                        Invite a buyer to activate the workspace — once a buyer joins, you'll be able to collaborate on briefs and manage samples together.
                      </div>
                    </div>
                  )}
                </>
              ) : activeTab === 'buyer' ? (
                /* Buyer brief */
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
                  <div className="flex gap-4">
                    <div className={`flex-shrink-0 w-[200px] h-[200px] bg-white overflow-hidden rounded flex items-center justify-center ${briefErrors.has('image_url') ? 'ring-2 ring-red-400' : ''}`}>
                      {ws?.buyer_brief?.image_url
                        ? <img src={ws.buyer_brief.image_url} onClick={e => { e.stopPropagation(); openLightbox([ws.buyer_brief.image_url]) }} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                        : <div className={`text-[9px] font-semibold uppercase tracking-[.05em] text-center px-4 leading-relaxed ${briefErrors.has('image_url') ? 'text-red-400' : 'text-black'}`}>
                            Pin a reference<br/>from media drawer
                            {briefErrors.has('image_url') && <div className="mt-1 font-normal normal-case">required</div>}
                          </div>
                      }
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col gap-1 pt-1">
                      {role !== 'supplier' && (
                        <>
                          <div className="flex items-center justify-between mb-0.5">
                            <div className={`text-[10px] font-bold uppercase tracking-[.08em] ${briefErrors.has('buyer_ref') ? 'text-red-500' : 'text-[#6d28d9]'}`}>
                              {role === 'buyer' ? 'My Reference *' : 'Buyer Reference *'}
                              {briefErrors.has('buyer_ref') && <span className="ml-1 text-[10px] font-normal text-red-400 normal-case">required</span>}
                            </div>
                            {!briefLocked && !brief.buyer_ref && ws?.buyer_org_id && (
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
                            className={`text-[18px] font-bold text-[#1A1A18] bg-transparent outline-none placeholder:text-black/20 placeholder:font-normal w-full mb-2 ${briefLocked ? 'cursor-default' : ''} ${briefErrors.has('buyer_ref') ? 'placeholder:text-red-300' : ''}`}
                          />
                          <div className="h-px bg-black/[.08] mb-2" />
                        </>
                      )}
                      <div className={`text-[12px] font-bold uppercase tracking-[.08em] mb-0.5 ${briefErrors.has('description') ? 'text-red-500' : 'text-black'}`}>
                        Description{briefErrors.has('description') && <span className="ml-1 text-[10px] font-normal text-red-400">required</span>}
                      </div>
                      <textarea
                        value={brief.description}
                        onChange={e => { if (briefLocked) return; setBrief(b => ({ ...b, description: e.target.value })); setBriefErrors(s => { const n = new Set(s); n.delete('description'); return n }) }}
                        readOnly={briefLocked}
                        placeholder="What are you looking for?"
                        className={`flex-1 text-[13px] text-[#1A1A18] bg-transparent outline-none resize-none leading-relaxed placeholder:text-black/25 w-full rounded ${briefErrors.has('description') ? 'placeholder:text-red-300' : ''} ${briefLocked ? 'cursor-default' : ''}`}
                        rows={2}
                      />
                      <div className="h-px bg-black/[.06] my-1" />
                      <div className={`text-[11px] font-bold uppercase tracking-[.06em] mb-0.5 ${briefErrors.has('color') ? 'text-red-500' : 'text-black'}`}>
                        Colour{briefErrors.has('color') && <span className="ml-1 text-[10px] font-normal text-red-400">required</span>}
                      </div>
                      <input
                        value={brief.color}
                        onChange={e => { if (briefLocked) return; setBrief(b => ({ ...b, color: e.target.value })); setBriefErrors(s => { const n = new Set(s); n.delete('color'); return n }) }}
                        readOnly={briefLocked}
                        placeholder="e.g. Terracotta, Off-white…"
                        className={`text-[13px] text-[#1A1A18] bg-transparent outline-none w-full placeholder:text-black/25 border-b pb-0.5
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
                        <BriefRow icon={<IconMaterial />}  label="Material"        brief={brief} field="material"      setBrief={setBrief} placeholder="Empty"                  readOnly={briefLocked} hasError={briefErrors.has('material')}   onClearError={clearErr} />
                        <BriefRow icon={<IconDimension />} label="Dimensions"      brief={brief} field="dimensions"    setBrief={setBrief} placeholder="e.g. 30×20×15 cm or 25–35 cm" readOnly={briefLocked} uppercase={false} />
                        <BriefRow icon={<IconQty />}       label="Weight (kg)"     brief={brief} field="weight"        setBrief={setBrief} placeholder="Optional"               readOnly={briefLocked} type="number" />
                        <BriefRow icon={<IconFinish />}    label="Finish"          brief={brief} field="finish"        setBrief={setBrief} placeholder="Optional"               readOnly={briefLocked} />
                        <BriefRow icon={<IconPrice />} label="Target Price" brief={brief} field="unit_price" setBrief={setBrief} placeholder="Empty" readOnly={briefLocked || role === 'supplier'} hasError={briefErrors.has('unit_price')} onClearError={clearErr} type="number" step="0.01"
                          after={
                            <div className="grid grid-cols-[48px_1fr] items-center gap-1 w-full">
                              <select
                                value={brief.currency || 'USD'}
                                onChange={e => setBrief(b => ({ ...b, currency: e.target.value }))}
                                disabled={briefLocked || role === 'supplier'}
                                className="w-12 text-[13px] leading-[1.2] text-[#1A1A18] bg-transparent border-b border-black outline-none cursor-pointer hover:text-black disabled:cursor-default"
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
                          }
                        />
                        <BriefRow icon={<IconQty />}       label="Unit Qty"        brief={brief} field="unit_qty"      setBrief={setBrief} placeholder="Empty"                  readOnly={briefLocked} hasError={briefErrors.has('unit_qty')}   onClearError={clearErr} type="number" step="1"
                          after={
                            ws?.sampleOrder?.confirmed_qty != null && (
                              <div className="grid grid-cols-[48px_1fr] items-center gap-1 w-full">
                                <span aria-hidden="true" />
                                <span className="ml-10 grid grid-cols-[96px_1fr] gap-4 items-center whitespace-nowrap">
                                  <span className="text-[12px] font-bold uppercase text-[#1A1A18]">Approved Qty</span>
                                  <span className="text-[13px] text-[#1A1A18]">{ws.sampleOrder.confirmed_qty}</span>
                                </span>
                              </div>
                            )
                          }
                        />
                        <BriefRow icon={<IconNotes />}     label="Quality Notes"   brief={brief} field="quality_notes" setBrief={setBrief} placeholder="Any quality requirements…" multiline readOnly={briefLocked} uppercase={false} />
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
                      Brief locked — approved to sample
                    </div>
                  ) : (
                    <button
                      onClick={handleSaveBrief}
                      disabled={savingBrief || !ws?.id}
                      className="w-full py-2.5 bg-[#1A1A18] text-white text-[11px] font-extrabold uppercase tracking-[.1em] cursor-pointer hover:opacity-80 disabled:opacity-40 rounded-sm"
                    >
                      {savingBrief ? 'Saving…' : 'Save Brief'}
                    </button>
                  )}

                  {/* Show only when brief hasn't been saved yet (fields are pre-filled from product info) */}
                  {!ws?.buyer_brief && (
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-[#fffbeb] border border-amber-200 rounded text-[11px] text-amber-800 leading-relaxed">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-px text-amber-500">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      Fields are pre-filled from the product info. Edit them to match your design requirements and click <strong className="font-semibold">Save Brief</strong> to confirm.
                    </div>
                  )}
                </div>
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
                  { key: 'in_process', label: 'In Process', color: 'bg-[#fff3e0] text-[#e65100] border-[#e65100]' },
                  { key: 'ready',      label: 'Ready',      color: 'bg-[#dcfce7] text-[#166534] border-[#166534]' },
                  { key: 'on_hold',    label: 'On Hold',    color: 'bg-[#fef2f2] text-[#991b1b] border-[#991b1b]' },
                  { key: 'dropped',    label: 'Dropped',    color: 'bg-[#f1f5f9] text-[#475569] border-[#475569]' },
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
                  updateSampleOrder(so.id, ws.id, { sample_status: newStatus })
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

                // Master Weight is the only optional field — everything else must be filled
                // before findings can be saved, so an incomplete/empty record never gets stored.
                const REQUIRED_FINDING_FIELDS = [
                  ['actual_weight', 'Actual Weight'], ['actual_l', 'Actual Length'], ['actual_w', 'Actual Width'], ['actual_h', 'Actual Height'],
                  ['inner_qty', 'Inner Qty'], ['inner_l', 'Inner Length'], ['inner_w', 'Inner Width'], ['inner_h', 'Inner Height'],
                  ['master_qty', 'Master Qty'], ['master_l', 'Master Length'], ['master_w', 'Master Width'], ['master_h', 'Master Height'],
                  ['cbm', 'CBM'],
                ]
                const handleSaveFindings = async () => {
                  if (!findings.sample_images?.length) {
                    toast('Upload at least one sample image before saving findings')
                    return
                  }
                  const missing = REQUIRED_FINDING_FIELDS.filter(([f]) => findings[f] == null || findings[f] === '')
                  if (missing.length) {
                    toast(`Fill in all sample finding details before saving (Master Weight is optional) — missing: ${missing.map(([, l]) => l).join(', ')}`)
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
                  try { await saveSampleFindings(so.id, ws.id, changedFindings) }
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
                const findingsLocked  = role !== 'merchant' || isReadOnly || isDropped || !!viewingVersion
                // Additional Notes is a shared note field (not a findings value), so both
                // merchant and buyer can write to it — only lock it for read-only/dropped/
                // past-version views, not by role.
                const notesLocked     = isReadOnly || isDropped || !!viewingVersion

                return (
                  <div className="flex flex-col gap-5">
                    {/* Status bar */}
                    <div className="flex flex-col gap-2">
                    <div className="flex-1 min-w-0">
                    {(role !== 'merchant' || isReadOnly || ws?.status === 'sample') ? (
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
                          <div className="flex items-center gap-1.5 flex-wrap flex-1">
                            {SAMPLE_STATUSES.map(({ key, label, color }) => {
                              const locked = key === 'ready' && !so.target_ready_date
                              return (
                              <button
                                key={key}
                                onClick={() => handleStatusChange(key)}
                                disabled={locked}
                                title={locked ? 'Set a target ready date first' : undefined}
                                className={`px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-[.06em] rounded-full border transition-all
                                  ${locked ? 'cursor-not-allowed opacity-30' : 'cursor-pointer'}
                                  ${so.sample_status === key
                                    ? `${color} opacity-100`
                                    : 'bg-transparent border-black text-black hover:border-black hover:text-black'}`}
                              >
                                {label}
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
                            {role === 'merchant' && !isReadOnly && 'Set status back to "In Process" to start a new round.'}
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

                        {/* Two-column layout: image left, fields right */}
                        <div className="flex gap-4">

                          {/* Left: approved image or dropzone */}
                          <div className="flex-shrink-0 w-[200px] flex flex-col gap-2">
                            <div
                              className="w-[200px] h-[200px] bg-[#EDEAE4] overflow-hidden rounded flex items-center justify-center relative group"
                              onClick={() => !findingsLocked && !viewFindings.approved_image && findingsImageRef.current?.click()}
                            >
                              {viewFindings.approved_image ? (
                                <img src={viewFindings.approved_image} onClick={e => { e.stopPropagation(); openLightbox([viewFindings.approved_image, ...(viewFindings.sample_images || []).filter(u => u !== viewFindings.approved_image)]) }} className="w-full h-full object-cover cursor-zoom-in" alt="" />
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
                              const dispRef   = vf ? vf._buyer_ref       : so.buyer_ref
                              return [[`Approved Price (${CURRENCY_SYMBOLS[dispCur || brief.currency] || dispCur || brief.currency || '$'})`, dispPrice], ['Approved Sample Qty', dispQty], ['Buyer Ref', dispRef]]
                                .filter(([, v]) => v != null).map(([label, val]) => (
                                  <div key={label}>
                                    <div className="text-[9px] font-bold uppercase tracking-[.08em] text-black mb-0.5">{label}</div>
                                    <div className="text-[13px] font-bold text-[#1A1A18]">{val}</div>
                                  </div>
                                ))
                            })()}
                          </div>
                        </div>

                        {/* Finding fields — BriefRow style, below the image row */}
                        {(() => {
                          const toCm   = (v) => v ? (parseFloat(v) * 2.54).toFixed(2) : ''
                          const toDisp = (v) => (v && dimUnit === 'in') ? (parseFloat(v) / 2.54).toFixed(2) : (v || '')
                          const dimRow = (prefix, label) => (
                            <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${findingsLocked ? '' : 'hover:bg-black/[.04]'}`}>
                              <div className="flex items-center gap-2 w-[140px] flex-shrink-0">
                                <span className="text-black"><IconDimension /></span>
                                <span className="text-[12px] font-bold text-black">{label}</span>
                              </div>
                              <div className="flex items-center gap-1 flex-1">
                                {[`${prefix}_l`, `${prefix}_w`, `${prefix}_h`].map((fk, i) => (
                                  <div key={fk} className="flex items-center gap-1">
                                    {i > 0 && <span className="text-[11px] text-black">×</span>}
                                    {findingsLocked
                                      ? <span className="text-[13px] text-[#1A1A18] w-10 text-center">{toDisp(viewFindings[fk]) || <span className="text-black">—</span>}</span>
                                      : <input type="number" step="0.5" min="0"
                                          value={toDisp(viewFindings[fk])}
                                          onChange={e => { const v = e.target.value; setFindings(f => ({ ...f, [fk]: dimUnit === 'in' ? toCm(v) : v })) }}
                                          placeholder="0"
                                          className="w-16 text-[13px] text-[#1A1A18] bg-transparent outline-none text-center border-b border-transparent focus:border-black placeholder:text-black/20" />
                                    }
                                  </div>
                                ))}
                                <span className="text-[11px] text-black ml-0.5">{dimUnit}</span>
                              </div>
                            </div>
                          )
                          return (
                            <div className="flex flex-col -mx-2">
                              <div className="flex items-center justify-end px-2 pb-1">
                                <div className="flex items-center rounded-full border border-black overflow-hidden">
                                  {['cm', 'in'].map(u => (
                                    <button key={u} type="button" onClick={() => setDimUnit(u)}
                                      className={`px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[.06em] cursor-pointer border-none transition-colors
                                        ${dimUnit === u ? 'bg-[#1A1A18] text-white' : 'bg-transparent text-black hover:text-black'}`}
                                    >{u}</button>
                                  ))}
                                </div>
                              </div>
                              <BriefRow icon={<IconQty />}       label="Actual Weight" brief={viewFindings} field="actual_weight" setBrief={setFindings} placeholder="kg"    readOnly={findingsLocked} type="number" step="0.1" />
                              {dimRow('actual', 'Actual L×W×H')}
                              <BriefRow icon={<IconQty />}       label="Inner Qty"     brief={viewFindings} field="inner_qty"     setBrief={setFindings} placeholder="pcs"   readOnly={findingsLocked} type="number" step="1" />
                              {dimRow('inner', 'Inner L×W×H')}
                              <BriefRow icon={<IconQty />}       label="Master Qty"         brief={viewFindings} field="master_qty"           setBrief={setFindings} placeholder="pcs"     readOnly={findingsLocked} type="number" step="1" />
                              {dimRow('master', 'Master L×W×H')}
                              <BriefRow icon={<IconQty />}       label="Master Weight (kg)" brief={viewFindings} field="master_pack_weight_kg" setBrief={setFindings} placeholder="Optional" readOnly={findingsLocked} type="number" step="0.1" />
                              <BriefRow icon={<IconDimension />} label="CBM (m³)"           brief={viewFindings} field="cbm"                  setBrief={setFindings} placeholder="0.000"   readOnly={findingsLocked} type="number" step="0.001" />
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
                                  <img src={url} onClick={e => { e.stopPropagation(); openLightbox(viewFindings.sample_images, i) }} className="w-full h-full object-cover cursor-zoom-in" alt="" />
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
                        {role === 'merchant' && !isReadOnly && ws.status === 'sample' && (
                          <button
                            onClick={() => setShowSamplePO(true)}
                            className="w-full py-2.5 border border-[#166534] text-[#166534] text-[11px] font-extrabold uppercase tracking-[.1em] cursor-pointer hover:bg-[#166534] hover:text-white transition-colors rounded-sm bg-transparent"
                          >
                            Create Sample PO
                          </button>
                        )}

                        {/* Buyer decision — Accept or Request Revision */}
                        {role === 'buyer' && isReady && ws.status === 'approved' && (
                          <div className="flex flex-col gap-2 pt-1">
                            {/* Buyer can only act once the merchant has actually shared photos of
                                the current round — otherwise there's nothing to judge Accept/Reject/
                                Reopen against, even though the status has been flipped to "Ready". */}
                            {!so.findings?.sample_images?.length ? (
                              <div className="text-[11px] text-black font-medium bg-black/[.03] border border-black/10 rounded px-3 py-2.5 leading-relaxed">
                                Waiting for the merchant to share sample photos before you can accept, reject, or reopen the brief.
                              </div>
                            ) : (
                            <div className="flex gap-2">
                              <button
                                onClick={async () => {
                                  setAcceptingWs(true)
                                  try { await acceptSample(ws.id) }
                                  catch (err) { toast(err.message) }
                                  finally { setAcceptingWs(false) }
                                }}
                                disabled={acceptingWs}
                                className="flex-1 py-2 text-[11px] font-extrabold uppercase tracking-[.06em] bg-[#166534] text-white rounded-sm cursor-pointer hover:opacity-80 disabled:opacity-40"
                              >
                                {acceptingWs ? 'Accepting…' : 'Accept'}
                              </button>
                              <button
                                onClick={() => { setShowRejectInput(v => !v); setShowRevisionInput(false); setRejectNote('') }}
                                className={`flex-1 py-2 text-[11px] font-extrabold uppercase tracking-[.06em] border rounded-sm cursor-pointer transition-colors bg-transparent
                                  ${showRejectInput ? 'border-red-300 text-red-500' : 'border-black text-black hover:border-red-300 hover:text-red-500'}`}
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => { setShowRevisionInput(v => !v); setShowRejectInput(false); setRevisionNote('') }}
                                className="flex-1 py-2 text-[11px] font-extrabold uppercase tracking-[.06em] border border-black text-black rounded-sm cursor-pointer hover:border-black hover:text-black transition-colors bg-transparent"
                              >
                                Reopen Brief
                              </button>
                            </div>
                            )}

                            {showRejectInput && (
                              <div className="flex flex-col gap-2">
                                <textarea
                                  value={rejectNote}
                                  onChange={e => setRejectNote(e.target.value)}
                                  placeholder="What's wrong with this sample? (optional)"
                                  rows={2}
                                  autoFocus
                                  className="text-[13px] text-[#1A1A18] bg-transparent border border-red-200 rounded p-2.5 outline-none resize-none placeholder:text-black/25 focus:border-red-300 transition-colors"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={async () => {
                                      setSubmittingReject(true)
                                      try {
                                        await rejectSample(ws.id, rejectNote.trim())
                                        setShowRejectInput(false)
                                        setRejectNote('')
                                      } catch (err) { toast(err.message) }
                                      finally { setSubmittingReject(false) }
                                    }}
                                    disabled={submittingReject}
                                    className="flex-1 py-2 text-[11px] font-extrabold uppercase tracking-[.06em] bg-red-600 text-white rounded-sm cursor-pointer hover:opacity-80 disabled:opacity-40"
                                  >
                                    {submittingReject ? 'Rejecting…' : 'Confirm Reject'}
                                  </button>
                                  <button
                                    onClick={() => { setShowRejectInput(false); setRejectNote('') }}
                                    className="px-4 py-2 text-[11px] font-bold text-black hover:text-black cursor-pointer border-none bg-none transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
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
                        <div className="text-[10px] font-bold uppercase tracking-[.08em] text-black">Target Ready Date</div>
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

            </div>

            {/* Drag handle — desktop only, meaningless once panels stack */}
            {!isNarrow && (
              <div
                onMouseDown={onDragStart}
                className="absolute top-0 -right-1 w-3 h-full cursor-col-resize flex items-center justify-center z-20 select-none group"
              >
                <div className="w-px h-full bg-gray-400 group-hover:bg-[#7c3aed] transition-colors" />
                <div className="absolute flex flex-col gap-[3px] pointer-events-none">
                  {[0,1,2].map(i => <div key={i} className="w-[3px] h-[3px] rounded-full bg-gray-400 group-hover:bg-[#7c3aed]" />)}
                </div>
              </div>
            )}
          </div>

          {/* ── Center: chat ── */}
          <div className={`border-r border-gray-400 flex-col min-w-0 overflow-hidden ${isNarrow ? (mobilePanel === 'activity' ? 'flex flex-1 w-full' : 'hidden') : 'flex'}`}>
            {/* Chat tab switcher + approve button */}
            <div className="h-11 flex items-center justify-between border-b border-black flex-shrink-0 px-1">
              <div className="flex">
                {chatTabs.map(([t, label, count]) => (
                  <div
                    key={t}
                    className={`flex items-center border-b-2 ${chatTab === t ? 'border-[#7c3aed]' : 'border-transparent'}`}
                  >
                    <button
                      type="button"
                      onClick={() => setChatTab(t)}
                      className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-[.06em] cursor-pointer transition-colors flex items-center gap-1.5 border-none bg-transparent
                        ${chatTab === t ? 'text-[#1A1A18]' : 'text-black hover:text-black'}`}
                    >
                      {label}
                      <span className={`text-[9px] font-extrabold ${chatTab === t ? 'text-[#1A1A18]' : 'text-black'}`}>{count}</span>
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mr-2">
                {ws && (
                  <VideoCallButton
                    workspaceId={ws.id}
                    memberId={memberId}
                    userName={profileHeader?.name || role}
                  />
                )}
              </div>
            </div>

            {ws && (
              <IncomingCallBanner
                workspaceId={ws.id}
                memberId={memberId}
                userName={profileHeader?.name || role}
              />
            )}

            {/* Messages */}
            <div ref={threadRef} className="flex-1 overflow-y-auto flex flex-col gap-2 p-4 min-h-0">
              {visibleComments.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-[11px] font-bold uppercase tracking-[.1em] text-black">No activity yet — start the conversation</div>
                </div>
              ) : (
                visibleComments.map((cm, i) => <Comment key={i} cm={cm} onReply={setReplyTo} />)
              )}
            </div>

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
              {replyTo && (() => {
                const { text, thumbUrl } = replyQuoteMeta(replyTo)
                return (
                  <div className="flex items-center gap-2 px-4 py-2 border-t border-[#7c3aed]/20 bg-[#f5f0ff]">
                    {thumbUrl ? (
                      <img src={thumbUrl} alt="" className="w-8 h-8 rounded object-cover border border-black flex-shrink-0" />
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                        <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
                      </svg>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] font-bold text-[#7c3aed] mr-1.5">{replyTo.author_name || replyTo.role}</span>
                      <span className="text-[11px] text-black truncate">{text}</span>
                    </div>
                    <button onClick={() => setReplyTo(null)} className="border-none bg-none text-black hover:text-black cursor-pointer text-base leading-none flex-shrink-0">×</button>
                  </div>
                )
              })()}
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 pt-2">
                  {pendingFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-1 px-2 py-1 bg-[#f0ebff] border border-[#c4b5fd] rounded-full text-[10px] text-[#6d28d9] font-medium max-w-[140px]">
                      <span className="truncate">{f.name}</span>
                      <button type="button" onClick={() => setPendingFiles(p => p.filter((_, j) => j !== i))} className="flex-shrink-0 text-[#7c3aed] hover:text-red-500 border-none bg-none cursor-pointer leading-none">×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 px-4 py-3">
                <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={handleFileChange} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={chatLocked}
                  className="text-black hover:text-[#7c3aed] cursor-pointer border-none bg-none flex-shrink-0 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                </button>
                <input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  onPaste={handleComposerPaste}
                  placeholder={chatPlaceholder}
                  disabled={chatLocked}
                  className="flex-1 border-none bg-transparent text-[13px] outline-none text-[#1A1A18] placeholder:text-black/25 disabled:cursor-not-allowed"
                />
                <button
                  onClick={handleSend}
                  disabled={(!text.trim() && pendingFiles.length === 0) || chatLocked}
                  className="w-8 h-8 rounded-full bg-[#7c3aed] border-none flex items-center justify-center cursor-pointer hover:opacity-80 disabled:opacity-30 flex-shrink-0"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
                    <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* ── Right: reference media ── */}
          <div className={`bg-[#F5F3EF] flex-col overflow-hidden ${isNarrow ? (mobilePanel === 'media' ? 'flex flex-1 w-full' : 'hidden') : 'flex'}`} style={{ minWidth: 0 }}>
            <div className="h-11 flex items-center justify-center gap-1.5 px-4 border-b border-black flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-black">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <span className="text-[9px] font-bold uppercase tracking-[.1em] text-black">Media</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <MediaPanelContent
                ws={ws} comments={comments} sku={sku} isReadOnly={isReadOnly} role={role}
                settingProductImg={settingProductImg} setSettingProductImg={setSettingProductImg}
                openLightbox={openLightbox} pinImage={pinImage} setBriefErrors={setBriefErrors} toast={toast}
                setSkuImageFromUrl={setSkuImageFromUrl} handleMediaClickDebounced={handleMediaClickDebounced}
                scrollToChatMessage={scrollToChatMessage} saveSampleFindings={saveSampleFindings}
              />
            </div>
          </div>
        </div>
        </>
      )}

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
          {/* Edit Image — only for images opened from the Reference Media panel, not suppliers */}
          {lightbox.editable && role !== 'supplier' && (
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
                    className="border-b-2 border-[#1A1A18] py-1.5 text-[14px] font-bold text-[#1A1A18] bg-transparent outline-none w-full placeholder:text-black/20 placeholder:font-normal"
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
                    className="border-b-2 border-[#1A1A18] py-1.5 text-[14px] font-bold text-[#1A1A18] bg-transparent outline-none w-full placeholder:text-black/20 placeholder:font-normal"
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
