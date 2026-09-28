import { useState, useRef, useEffect } from 'react'
import { STATUS_LABELS, STATUS_COLORS } from '../../../stores/plmStore'
import { monthBucketsOf, MonthGroup, computeWorkspaceScale } from '../plmMediaGroups'
import CourierSearchSelect from '../../logistics/CourierSearchSelect'
import { INTERNATIONAL_COURIERS } from '../../logistics/courierLogUtils'
import CameraCaptureModal from './CameraCaptureModal'
import useVoiceRecorder from '../../../hooks/useVoiceRecorder'
import {
  undoStage, logActivity, addChatMessage, addVendorChatMessage, pinToBuyerBrief, saveBrief as saveBriefState,
  holdWorkspace, dropWorkspace, continueWorkspace, addInvite, revokeInvite, acceptInvite, defaultDemoState,
  confirmProceedToSample as confirmProceedToSampleState,
  confirmProceedToPO as confirmProceedToPOState,
  setTargetReadyDate as setTargetReadyDateState, setSampleStatus as setSampleStatusState,
  addSampleImages as addSampleImagesState, toggleApprovedImage as toggleApprovedImageState,
  toggleSampleImage as toggleSampleImageState,
  saveQaComments as saveQaCommentsState, saveAdditionalNotes as saveAdditionalNotesState, saveFindings as saveFindingsState,
  acceptSample as acceptSampleState, reopenBrief as reopenBriefState, saveShipping as saveShippingState,
} from '../../../utils/plmDemoState'

// Same public tracking-URL builders as the real WorkspaceModal's Shipping tab.
const COURIER_TRACK_URL = {
  'DHL':                 (t) => `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(t)}&brand=DHL`,
  'UPS':                 (t) => `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(t)}`,
  'FedEx International': (t) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`,
}

const CURRENCY_SYMBOLS = { USD: '$', GBP: '£', EUR: '€' }

// Hint text depends on both workspace_status and the sample sub-status, so it's
// computed from state rather than a static per-status lookup.
function getStageHint(state) {
  const status = state.workspace_status
  if (status === 'inactive') {
    return { title: 'Invite the buyer', body: 'Invite the buyer from the Product Info section of SKU Details. Once they accept the invite, the workspace becomes Active and you can fill in the buyer brief.' }
  }
  if (status === 'invited') {
    return { title: 'Waiting on the buyer', body: 'The buyer has been invited but hasn\'t accepted yet. Click "Accepted" next to their invite to simulate them accepting (or Revoke to cancel it).' }
  }
  if (status === 'active') {
    return state.briefSaved
      ? { title: 'Brief saved — ready to proceed?', body: 'Your brief is saved. When you\'re happy with all requirements, click Proceed to Sample in the top bar.' }
      : { title: 'Save your brief first', body: 'Fill in all your requirements and click Save Brief at the bottom. Once saved, Proceed to Sample in the top bar will be ready to use.' }
  }
  if (status === 'approved') {
    const ss = state.sample_status
    if (!ss) return { title: 'Approved — ready for sample', body: 'Click Proceed to Sample in the top bar to create the sample order and move into the Sample stage.' }
    if (ss === 'in_process') return { title: 'Sample in development', body: 'Upload sample images, tick one in the Media panel as the main sample image, add QA comments, then mark the sample Ready once it matches the brief.' }
    if (ss === 'on_hold') return { title: 'Sample on hold', body: 'Switch the status back to In Development in the Sample tab to resume work.' }
    if (ss === 'dropped') return { title: 'Sample dropped', body: 'Switch the status back to In Development in the Sample tab to start a new round.' }
    if (ss === 'ready') {
      return (!state.sample_findings.approved_image || !state.qa_comments?.trim())
        ? { title: 'Share a main sample image', body: 'Tick one of the uploaded photos in the Media panel as the main sample image, and add QA comments in the Sample tab. Once both are set, you can Accept Sample or Reopen Brief.' }
        : { title: 'Ready to accept', body: 'A main sample image and QA comments are set. Click Accept Sample to move to shipping, or Reopen Brief to send it back for another round.' }
    }
  }
  if (status === 'sample') {
    return { title: 'Sample accepted — finish the details', body: 'Fill in the remaining sample findings, then head to the Shipping tab to record how it\'s moving (Air or Ship).' }
  }
  if (status === 'sample_shipped') {
    return { title: 'Sample shipped', body: 'Shipping details are complete and this sample is on its way. Keep tracking updated on the Shipping tab, then click Proceed to PO in the top bar once you\'re ready to confirm the production quantity.' }
  }
  if (status === 'production') {
    return { title: 'Approved to PO', body: `Production quantity confirmed at ${state.po_qty || '—'} units. This SKU has moved into production.` }
  }
  if (status === 'on_hold') return { title: 'Workspace on hold', body: 'Click Continue to resume this workspace from where it was paused.' }
  if (status === 'rejected') return { title: 'SKU dropped', body: 'Click Continue to bring this workspace back into the active flow.' }
  return null
}

const REQUIRED_BRIEF_FIELDS = ['description', 'color', 'material', 'target_price', 'unit_qty']

function StatusBadge({ status }) {
  const label = STATUS_LABELS[status] || status
  const cls   = STATUS_COLORS[status] || 'bg-black/[.07] text-[#1A1A18]'
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-[.06em] ${cls}`}>{label}</span>
}

// Auto-grows a textarea to fit its content so longer answers wrap and stay fully
// visible instead of scroll-cropping inside a fixed one-line box.
function autoGrow(e) {
  e.target.style.height = 'auto'
  e.target.style.height = `${e.target.scrollHeight}px`
}

// Compact icon+label+value row used for the secondary brief fields (Material, Dimensions, …),
// matching the real Buyer Brief tab's inline-editable attribute rows. `multiline` fields
// (Material, Finish, Quality Notes) use an auto-growing textarea instead of a single-line
// input, same as the real BriefRow, so longer values wrap onto multiple lines.
function AttrField({ icon, label, value, onChange, disabled, placeholder = 'Empty', suffix, multiline = false }) {
  return (
    <div className={`flex items-start gap-2 px-2 py-1.5 rounded-md ${!disabled ? 'hover:bg-black/[.04]' : ''}`}>
      <div className="flex items-center gap-2 w-[150px] flex-shrink-0 pt-0.5">
        <span className="text-black flex-shrink-0">{icon}</span>
        <span className="text-[12px] font-bold uppercase text-black truncate">{label}</span>
      </div>
      {multiline ? (
        <textarea
          value={value ?? ''}
          disabled={disabled}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onInput={autoGrow}
          rows={1}
          className={`flex-1 min-w-0 bg-transparent text-[13px] outline-none resize-none leading-relaxed overflow-hidden ${disabled ? 'text-black/50 cursor-not-allowed' : 'text-[#1A1A18] placeholder:text-black/30'}`}
        />
      ) : (
        <input
          value={value ?? ''}
          disabled={disabled}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          className={`flex-1 min-w-0 bg-transparent text-[13px] outline-none ${disabled ? 'text-black/50 cursor-not-allowed' : 'text-[#1A1A18] placeholder:text-black/30'}`}
        />
      )}
      {suffix}
    </div>
  )
}

// Dummy version of the real InviteRow — "+ Invite Buyer/Vendor" dashed pill, an inline
// email form, and pending-invite chips. Nothing is ever sent; submitting just adds a
// local "Pending" chip and logs a milestone, matching the real UI without any backend call.
function DummyInviteRow({ label, accent, orgName, invites, open, onOpen, onClose, onAdd, onRevoke, onAccept, onWatchVideo }) {
  const [email, setEmail] = useState('')

  const submit = () => {
    if (!email.trim()) return
    onAdd(email)
    setEmail('')
    onClose()
  }

  return (
    <div className="flex flex-col gap-1.5 py-2.5 border-b border-black">
      <div className="flex items-start gap-4">
        <span className="text-[10px] font-bold uppercase tracking-[.1em] text-black w-16 flex-shrink-0 pt-0.5">{label}</span>
        <div className="flex flex-col gap-1.5 flex-1">
          {orgName && <span className="text-[12px] text-[#1A1A18] font-medium">{orgName}</span>}

          {invites.map(inv => (
            <div key={inv.id} className="flex items-center gap-2">
              <span className="text-[10px] text-[#1A1A18]">{inv.email}</span>
              {inv.status === 'accepted' ? (
                <span className="text-[8px] font-bold uppercase tracking-[.05em] px-1.5 py-0.5 rounded-full bg-[#dcfce7] text-[#166534]">Accepted</span>
              ) : (
                <span className="text-[8px] font-bold uppercase tracking-[.05em] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending</span>
              )}
              <button type="button" onClick={() => onRevoke(inv.id)} className="text-[9px] font-semibold text-black/40 hover:text-red-600 cursor-pointer">Revoke</button>
              {inv.status !== 'accepted' && onAccept && (
                <button type="button" onClick={() => onAccept(inv.id)} className="text-[9px] font-bold uppercase tracking-[.04em] text-[#166534] hover:text-[#0e4a26] cursor-pointer">Accepted</button>
              )}
              {onWatchVideo && (
                <button
                  type="button"
                  onClick={onWatchVideo}
                  title={`Watch ${label.toLowerCase()} workflow tutorial`}
                  className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[.04em] text-[#2D8CFF] hover:text-[#1a6fd4] cursor-pointer"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                  Tutorial
                </button>
              )}
            </div>
          ))}

          {!open ? (
            <button
              type="button"
              onClick={onOpen}
              className="text-[11px] font-semibold text-[#1A1A18] border border-dashed border-black rounded-full px-3.5 py-1 cursor-pointer transition-colors bg-transparent self-start mt-0.5"
              onMouseEnter={e => { e.currentTarget.style.color = accent; e.currentTarget.style.borderColor = accent }}
              onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.borderColor = '' }}
            >
              {orgName || invites.length ? '+ Invite another' : `+ Invite ${label}`}
            </button>
          ) : (
            <div className="flex items-center gap-2 mt-0.5">
              <input
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose() }}
                placeholder="name@company.com"
                className="border-b border-black/30 bg-transparent text-[11px] outline-none py-0.5 focus:border-black"
              />
              <button type="button" onClick={submit} className="text-[10px] font-bold uppercase tracking-[.06em] px-2 py-1 rounded-sm cursor-pointer text-white" style={{ background: accent }}>Send</button>
              <button type="button" onClick={onClose} className="text-black text-[14px] leading-none cursor-pointer border-none bg-none">×</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatCreatedDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatChatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

const DETAIL_TABS_BASE = [
  ['details', 'SKU Details'],
]

const MOBILE_PANELS = [
  ['details', 'Details'],
  ['activity', 'Activity'],
  ['media', 'Media'],
]

const AttrIcons = {
  material: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>,
  dimensions: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M9 21V9"/></svg>,
  weight: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="7" width="16" height="14" rx="2"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>,
  finish: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>,
  price: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5a2.5 2.5 0 0 1 2.5-1 2.5 2.5 0 0 1 0 5 2.5 2.5 0 0 0 0 5 2.5 2.5 0 0 0 2.5-1"/></svg>,
  qty: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="4" width="14" height="17" rx="1"/><path d="M9 2h6v3H9z"/></svg>,
  notes: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6"/></svg>,
}

export default function DemoWorkspaceModal({ state, onChange, onClose }) {
  const [tab, setTab] = useState('details')
  const [chatTab, setChatTab] = useState('buyer')
  const [mobilePanel, setMobilePanel] = useState('details')
  const [chatInput, setChatInput] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState([]) // { name, url, type }[]
  const [cameraOpen, setCameraOpen] = useState(false)
  const [holdDropAction, setHoldDropAction] = useState(null) // { status: 'on_hold'|'rejected', note }
  const [showHint, setShowHint] = useState(false)
  const [inviteFormOpen, setInviteFormOpen] = useState(null) // 'buyer' | 'vendor' | null
  const [lightbox, setLightbox] = useState(null) // { images: string[], index: number } | null
  const [callActive, setCallActive] = useState(false)
  const attachInputRef = useRef(null)

  // Proceed-to-Sample confirm modal
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [approveQty, setApproveQty] = useState('')
  const [approvePrice, setApprovePrice] = useState('')

  // Proceed-to-PO confirm modal — quantity only, no price (already locked at Proceed to Sample)
  const [showProceedToPOModal, setShowProceedToPOModal] = useState(false)
  const [poQty, setPoQty] = useState('')

  // Sample tab local state
  const [dimUnit, setDimUnit] = useState('cm')
  const [qaDraft, setQaDraft] = useState(state.qa_comments || '')
  const [notesDraft, setNotesDraft] = useState(state.additional_notes || '')

  // Auto-shrink on smaller desktop screens, same as WorkspaceModal.
  const [wsScale, setWsScale] = useState(computeWorkspaceScale)
  useEffect(() => {
    const onResize = () => setWsScale(computeWorkspaceScale())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // Measurement fields only — sample_images/approved_image are mutated directly on the
  // global state via their own handlers (Media panel ticks, Sample tab upload), so they
  // must never be round-tripped through this draft or Save Findings would overwrite the
  // live values with a stale copy from whenever the draft was last initialized.
  const [findingsDraft, setFindingsDraft] = useState(() => {
    const { sample_images: _si, approved_image: _ai, ...measurements } = state.sample_findings
    return measurements
  })
  const [targetReadyDraft, setTargetReadyDraft] = useState(state.target_ready_date || '')
  const [showReopenInput, setShowReopenInput] = useState(false)
  const [reopenNote, setReopenNote] = useState('')
  const findingsImageRef = useRef(null)

  // Shipping tab local state
  const [shippingDraft, setShippingDraft] = useState(() => ({ ...state.shipping }))

  // Auto-scroll the activity feed to the latest entry whenever a new message/milestone/
  // field_change lands, or when switching between the Buyer/Vendor activity tabs.
  const chatScrollRef = useRef(null)
  useEffect(() => {
    const el = chatScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.chat.length, state.vendorChat.length, chatTab])

  // Auto-computes CBM from the master carton dimensions (always stored in cm) whenever
  // one of them changes — matches the real Sample tab's formula (master_l × master_w ×
  // master_h × master_qty / 1e6). Applied at the point of change rather than in a
  // useEffect, so it's a single synchronous update instead of a second render pass.
  const setFindingsField = (patch) => {
    setFindingsDraft(f => {
      const next = { ...f, ...patch }
      const l = parseFloat(next.master_l), w = parseFloat(next.master_w), h = parseFloat(next.master_h)
      const qty = parseFloat(next.master_qty) || 1
      if (l && w && h) next.cbm = ((l * w * h * qty) / 1_000_000).toFixed(4)
      return next
    })
  }

  const status = state.workspace_status
  const canUndo = state.history.length > 0

  const chatImages = state.chat
    .filter(m => m.type === 'message' && m.attachments?.length)
    .flatMap(m => m.attachments.map(a => ({ ...a, from: m.author, ts: m.ts })))

  const detailTabs = [
    ...DETAIL_TABS_BASE,
    ...(['approved', 'sample', 'sample_shipped'].includes(status) ? [['sample', 'Sample']] : []),
    ...(['sample', 'sample_shipped'].includes(status) ? [['shipping', 'Shipping']] : []),
  ]

  const update = (fn) => onChange(fn(state))

  const setBriefField = (key, val) => update(s => ({ ...s, briefSaved: false, buyer_brief: { ...s.buyer_brief, [key]: val } }))

  const briefIncomplete = REQUIRED_BRIEF_FIELDS.some(k => !state.buyer_brief[k])

  // Local stand-in for the real Auto button, which asks the backend for the buyer
  // org's prefix + a not-yet-used sequence number — here it's derived from the demo
  // buyer org's initials, matching the same PREFIX + 5-digit number + 2-digit year shape.
  const generateBuyerRef = () => {
    const prefix = state.sku.buyer_org.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 4) || 'BRK'
    const num = String(Math.floor(1 + Math.random() * 99999)).padStart(5, '0')
    const year = String(new Date().getFullYear()).slice(-2)
    setBriefField('buyer_ref', `${prefix}${num}${year}`)
  }

  const saveBrief = () => {
    update(s => saveBriefState(s))
  }

  // Opens the confirm modal instead of transitioning right away — matches the real
  // "Proceed to Sample" flow, which lets the merchant review/edit qty & price before
  // the workspace is approved and the sample order is created in one shot.
  const openProceedToSample = () => {
    if (briefIncomplete || !state.briefSaved) return
    setApproveQty(state.buyer_brief.unit_qty || '')
    setApprovePrice(state.buyer_brief.target_price || '')
    setShowApproveModal(true)
  }

  const handleConfirmProceedToSample = () => {
    if (!approveQty || !approvePrice) return
    update(s => confirmProceedToSampleState(s, approveQty, approvePrice))
    setShowApproveModal(false)
    setTab('sample')
  }

  // Same "open a confirm modal instead of transitioning right away" pattern as Proceed
  // to Sample above, but quantity only — price was already locked in back then.
  const openProceedToPO = () => {
    if (status !== 'sample_shipped') return
    setPoQty(state.po_qty || state.approved_qty || '')
    setShowProceedToPOModal(true)
  }

  const handleConfirmProceedToPO = () => {
    if (!poQty) return
    update(s => confirmProceedToPOState(s, poQty))
    setShowProceedToPOModal(false)
  }

  const handleSaveTargetReadyDate = () => update(s => setTargetReadyDateState(s, targetReadyDraft))

  const handleSampleStatusChange = (key) => update(s => setSampleStatusState(s, key))

  const handleFindingsImagePick = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    const urls = await Promise.all(files.map(f => readFileAsDataUrl(f)))
    update(s => addSampleImagesState(s, urls))
  }

  const handleToggleApprovedImage = (url) => update(s => toggleApprovedImageState(s, url))
  const handleToggleSampleImage = (url) => update(s => toggleSampleImageState(s, url))

  const handleSaveQaComments = () => update(s => saveQaCommentsState(s, qaDraft))
  const handleSaveAdditionalNotes = () => update(s => saveAdditionalNotesState(s, notesDraft))

  const handleSaveFindings = () => update(s => saveFindingsState(s, findingsDraft))

  const handleAcceptSample = () => {
    update(s => acceptSampleState(s))
    setTab('shipping')
  }

  const handleReopenBrief = () => {
    update(s => reopenBriefState(s, reopenNote.trim()))
    setShowReopenInput(false)
    setReopenNote('')
  }

  const handleSaveShipping = () => update(s => saveShippingState(s, shippingDraft))

  // Local drafts (qaDraft, findingsDraft, shippingDraft, etc.) only ever sync from state
  // once, at mount — typing shouldn't get clobbered by every render. But Undo is a genuine
  // external reset, so it must force all of them back in sync here, or the visible inputs
  // keep showing whatever was typed/filled before Undo even though the underlying state
  // (correctly) reverted.
  const handleUndo = () => {
    const next = undoStage(state)
    update(() => next)
    setShippingDraft({ ...next.shipping })
    const { sample_images: _si, approved_image: _ai, ...measurements } = next.sample_findings
    setFindingsDraft(measurements)
    setQaDraft(next.qa_comments || '')
    setNotesDraft(next.additional_notes || '')
    setTargetReadyDraft(next.target_ready_date || '')
  }

  const confirmHoldDrop = () => {
    if (!holdDropAction) return
    update(s => holdDropAction.status === 'on_hold' ? holdWorkspace(s, holdDropAction.note) : dropWorkspace(s, holdDropAction.note))
    setHoldDropAction(null)
  }

  const handleContinue = () => update(s => continueWorkspace(s))

  const toggleVideoCall = () => {
    const next = !callActive
    setCallActive(next)
    update(s => logActivity(s, next ? 'Video call started' : 'Video call ended'))
  }

  const handleReset = () => {
    if (!window.confirm('Reset this demo workspace back to its starting state? All local changes, chat and media will be cleared.')) return
    const fresh = defaultDemoState()
    onChange(fresh)
    setTab('details')
    setMobilePanel('details')
    setPendingAttachments([])
    setQaDraft('')
    setNotesDraft('')
    const { sample_images: _si, approved_image: _ai, ...freshMeasurements } = fresh.sample_findings
    setFindingsDraft(freshMeasurements)
    setTargetReadyDraft('')
    setShippingDraft({ ...fresh.shipping })
    setShowReopenInput(false)
    setReopenNote('')
  }

  const handleAttachPick = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    const withUrls = await Promise.all(files.map(async f => ({ name: f.name, type: f.type, url: await readFileAsDataUrl(f) })))
    setPendingAttachments(prev => [...prev, ...withUrls])
  }

  const removePendingAttachment = (idx) => setPendingAttachments(prev => prev.filter((_, i) => i !== idx))

  const handleCameraCapture = async (file) => {
    const url = await readFileAsDataUrl(file)
    setPendingAttachments(prev => [...prev, { name: file.name, type: file.type, url }])
  }

  // Voice messages reuse the same pendingAttachments/sendChat pipeline as picked or captured
  // images — recording just produces a File that gets converted to a data URL like any other.
  const { isRecording: isRecordingVoice, seconds: voiceRecordSecs, start: startVoiceRecording, finish: finishVoiceRecording, cancel: cancelVoiceRecording } = useVoiceRecorder({
    onRecorded: async file => {
      const url = await readFileAsDataUrl(file)
      setPendingAttachments(prev => [...prev, { name: file.name, type: file.type, url }])
    },
  })

  const sendChat = () => {
    if (!chatInput.trim() && pendingAttachments.length === 0) return
    update(s => chatTab === 'vendor' ? addVendorChatMessage(s, chatInput, pendingAttachments) : addChatMessage(s, chatInput, pendingAttachments))
    setChatInput('')
    setPendingAttachments([])
  }

  const handlePinToBrief = (url) => update(s => pinToBuyerBrief(s, url))

  const openLightbox = (images, index = 0) => setLightbox({ images: images.filter(Boolean), index })

  useEffect(() => {
    if (!lightbox) return
    const onKey = e => {
      if (e.key === 'Escape') setLightbox(null)
      if (e.key === 'ArrowRight') setLightbox(l => l ? { ...l, index: (l.index + 1) % l.images.length } : l)
      if (e.key === 'ArrowLeft') setLightbox(l => l ? { ...l, index: (l.index - 1 + l.images.length) % l.images.length } : l)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  const handleAddInvite = (role, email) => update(s => addInvite(s, role, email))
  const handleRevokeInvite = (role, id) => update(s => revokeInvite(s, role, id))
  const handleAcceptInvite = (role, id) => update(s => acceptInvite(s, role, id))

  const panelClass = (key) => `flex flex-col overflow-hidden ${mobilePanel === key ? 'flex' : 'hidden'} lg:flex`

  const primaryAction = (() => {
    if (status === 'active') return { label: 'Proceed to Sample', onClick: openProceedToSample, disabled: briefIncomplete || !state.briefSaved }
    if (status === 'sample_shipped') return { label: 'Proceed to PO', onClick: openProceedToPO, disabled: false }
    return null
  })()

  const stageHint = getStageHint(state)

  return (
    <div className="ws-demo-modal-root fixed inset-0 z-[1000] flex flex-col bg-white font-sans text-[#1A1A18] text-[13px] overflow-hidden">
      <style>{`
        .ws-demo-modal-root button:not(:disabled) { transition: transform 0.12s ease; }
        .ws-demo-modal-root button:not(:disabled):hover { transform: scale(1.03); }
        .ws-demo-modal-root button:not(:disabled):active { transform: scale(0.97); }
      `}</style>

      <div
        className="ws-modal-scale flex flex-col"
        data-scaled={wsScale === 1 ? undefined : '1'}
        style={wsScale === 1 ? undefined : { '--ws-scale': wsScale }}
      >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-2 px-3 sm:px-5 py-2.5 border-b border-black flex-shrink-0">
        <div className="flex items-center flex-wrap gap-3">
          <div className="flex items-center flex-wrap divide-x divide-black/[.12]">
            <div className="pr-5">
              <div className="text-[9px] font-bold uppercase tracking-[.1em] text-black mb-0.5">TWIF SKU</div>
              <div className="text-[13px] font-extrabold font-mono text-[#1A1A18]">{state.sku.auto_code}</div>
            </div>
            <div className="px-5">
              <div className="text-[9px] font-bold uppercase tracking-[.1em] text-black mb-0.5">Buyer Ref</div>
              <div className="text-[13px] font-bold text-[#1A1A18]">{state.buyer_brief.buyer_ref || '—'}</div>
            </div>
            <div className="px-5">
              <div className="text-[9px] font-bold uppercase tracking-[.1em] text-black mb-0.5">Vendor Stock #</div>
              <div className="text-[13px] font-bold text-[#1A1A18]">{state.sku.vendor_sku_ref || '—'}</div>
            </div>
            <div className="px-5">
              <div className="text-[9px] font-bold uppercase tracking-[.1em] text-black mb-0.5">Status</div>
              <StatusBadge status={status} />
            </div>
          </div>

          {stageHint && (
            <div className="relative group flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-[.04em] whitespace-nowrap">Info</span>
              <button
                type="button"
                onClick={() => setShowHint(v => !v)}
                className="flex items-center justify-center transition-all cursor-pointer border-none bg-none text-amber-400 group-hover:text-amber-500"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}>info</span>
              </button>
              <div className={`absolute left-0 top-full mt-2 w-72 bg-[#1A1A18] text-white rounded-lg shadow-xl z-50 p-4 transition-opacity
                ${showHint ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible'}`}>
                <span className="text-[11px] font-extrabold uppercase tracking-[.06em] text-amber-400 block mb-2">{stageHint.title}</span>
                <p className="text-[12px] text-white/70 leading-relaxed">{stageHint.body}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {['on_hold', 'rejected'].includes(status) ? (
            <button
              type="button"
              onClick={handleContinue}
              className="px-2.5 sm:px-3 py-2 text-[10px] font-extrabold uppercase tracking-[.06em] border border-black text-black hover:border-[#166534] hover:text-[#166534] cursor-pointer whitespace-nowrap rounded-sm bg-white"
            >
              Continue
            </button>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setHoldDropAction({ status: 'on_hold', note: '' })}
                  className="px-2.5 sm:px-3 py-2 text-[10px] font-extrabold uppercase tracking-[.06em] border border-[#F0B429] text-[#8C3A00] bg-[#FFE8D0] hover:bg-[#FFDCB0] cursor-pointer whitespace-nowrap rounded-sm"
                >
                  On Hold
                </button>
                <button
                  type="button"
                  onClick={() => setHoldDropAction({ status: 'rejected', note: '' })}
                  className="px-2.5 sm:px-3 py-2 text-[10px] font-extrabold uppercase tracking-[.06em] border border-[#E57373] text-[#7A1A1A] bg-[#FCEAEA] hover:bg-[#FADBDB] cursor-pointer whitespace-nowrap rounded-sm"
                >
                  Drop SKU
                </button>
              </div>

              {holdDropAction && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-black rounded-md shadow-xl z-20 p-3 flex flex-col gap-3">
                  <div className="text-[11px] font-semibold text-[#1A1A18] leading-snug">
                    Are you sure you want to {holdDropAction.status === 'on_hold' ? 'mark this workspace on hold' : 'drop this SKU'}?
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="text-[9px] font-bold uppercase tracking-[.08em] text-black">
                      Reason <span className="text-black font-normal normal-case tracking-normal">(optional)</span>
                    </div>
                    <textarea
                      value={holdDropAction.note}
                      onChange={e => setHoldDropAction(a => ({ ...a, note: e.target.value }))}
                      placeholder="Add a note…"
                      rows={2}
                      className="w-full border border-black rounded px-2.5 py-1.5 text-[11px] text-[#1A1A18] bg-white outline-none resize-none focus:border-black"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={confirmHoldDrop}
                      className={`px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.06em] rounded cursor-pointer border-none
                        ${holdDropAction.status === 'on_hold' ? 'bg-[#ebd911] text-[#1A1A18]' : 'bg-[#f12d2d] text-white'}`}
                    >
                      Yes, Confirm
                    </button>
                    <button onClick={() => setHoldDropAction(null)} className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[.06em] text-black hover:text-black border-none bg-none cursor-pointer">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {primaryAction && !['on_hold', 'rejected'].includes(status) && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
              title={primaryAction.disabled && status === 'active' ? (briefIncomplete ? 'Fill in the required brief fields first' : 'Save the brief first') : undefined}
              className={`px-3 sm:px-4 py-2 text-[10px] font-extrabold uppercase tracking-[.06em] flex items-center gap-1.5 whitespace-nowrap rounded-sm
                ${primaryAction.disabled ? 'bg-black/10 text-black/30 cursor-not-allowed' : 'bg-[#1A1A18] text-white cursor-pointer hover:opacity-80'}`}
            >
              {primaryAction.label}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          )}
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="text-[11px] text-black">Created {formatCreatedDate(state.createdAt)}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 sm:px-4 py-2 text-[10px] border border-neutral-600 font-extrabold uppercase tracking-[.06em] bg-white text-black hover:bg-neutral-100 cursor-pointer flex items-center gap-1.5 whitespace-nowrap rounded-sm"
          >
            <span className="sm:hidden">Back</span>
            <span className="hidden sm:inline">Back to SKUs Cards</span>
          </button>
        </div>
      </div>

      {/* Mobile panel switcher */}
      <div className="flex border-b border-black flex-shrink-0 lg:hidden">
        {MOBILE_PANELS.map(([k, label]) => (
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

      {/* Body — Details | Activity | Media, same as the real workspace's 3-column layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden flex-col lg:flex-row">

        {/* Left: detail tabs */}
        <div className={`${panelClass('details')} flex-1 min-w-0 lg:border-r border-black`}>
          <div className="h-11 flex border-b border-black flex-shrink-0">
            {detailTabs.map(([t, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`h-full flex items-center justify-center px-4 text-[10px] font-bold uppercase tracking-[.06em] cursor-pointer transition-colors flex-1 border-b-2
                  ${tab === t ? 'border-[#7c3aed] text-[#1A1A18] bg-white' : 'border-transparent text-black bg-transparent hover:text-black'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4">
            {tab === 'details' && (
              <>
                <div className="text-[10px] font-bold uppercase tracking-[.1em] text-black">Product Info</div>
                <div className="flex flex-col sm:flex-row gap-5">
                  <div className="bg-white w-full sm:w-[200px] h-[200px] flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {state.sku.image_url
                      ? <img src={state.sku.image_url} alt={state.sku.description} onClick={() => openLightbox([state.sku.image_url])} className="w-full h-full object-contain cursor-zoom-in" />
                      : <div className="w-12 h-12 bg-black/[.08] rounded" />
                    }
                  </div>
                  <div className="flex flex-col gap-3 flex-1 min-w-0">
                    <div className="text-[15px] font-extrabold uppercase leading-tight tracking-[.01em]">{state.sku.description}</div>
                    <div className="flex gap-1.5 flex-wrap">
                      <span className="text-[9px] font-bold px-2 py-0.5 bg-[#e8f0ff] text-[#3b5bdb] uppercase tracking-[.06em] rounded-full">{state.sku.category}</span>
                      <span className="text-[9px] font-bold px-2 py-0.5 bg-[#f3e8ff] text-[#6d28d9] uppercase tracking-[.06em] rounded-full">{state.sku.season}</span>
                    </div>
                    {/* Participants — invite the buyer/vendor here. (Replaces the old spec grid;
                        those values live as editable rows in the Buyer Brief section below.) */}
                    <div className="flex flex-col mt-1">
                      <DummyInviteRow
                    label="Buyer" accent="#7c3aed" orgName={state.sku.buyer_org}
                    invites={state.invites.buyer}
                    open={inviteFormOpen === 'buyer'}
                    onOpen={() => setInviteFormOpen('buyer')}
                    onClose={() => setInviteFormOpen(null)}
                    onAdd={email => handleAddInvite('buyer', email)}
                    onRevoke={id => handleRevokeInvite('buyer', id)}
                    onAccept={id => handleAcceptInvite('buyer', id)}
                  />
                  <DummyInviteRow
                    label="Vendor" accent="#ea580c" orgName={state.sku.vendor_org}
                    invites={state.invites.vendor}
                    open={inviteFormOpen === 'vendor'}
                    onOpen={() => setInviteFormOpen('vendor')}
                    onClose={() => setInviteFormOpen(null)}
                    onAdd={email => handleAddInvite('vendor', email)}
                    onRevoke={id => handleRevokeInvite('vendor', id)}
                    onAccept={id => handleAcceptInvite('vendor', id)}
                  />
                    </div>{/* /participants */}
                  </div>{/* /right col */}
                </div>{/* /image + participants row */}

                {/* ── Buyer Brief section ── */}
                <div className="text-[10px] font-bold uppercase tracking-[.1em] text-black pt-3 mt-1 border-t border-black/10">Buyer Brief</div>
                <div className="flex flex-col gap-5">
                <div className="flex flex-col sm:flex-row gap-5">
                  <div className="w-full sm:w-[200px] h-[200px] flex-shrink-0 flex flex-col gap-2">
                    <div className="w-full h-full bg-white border border-dashed border-black/20 flex items-center justify-center overflow-hidden">
                      {state.media.buyerBriefImage ? (
                        <img src={state.media.buyerBriefImage} alt="Buyer brief reference" onClick={() => openLightbox([state.media.buyerBriefImage])} className="w-full h-full object-contain cursor-zoom-in" />
                      ) : (
                        <span className="text-[9px] font-bold uppercase tracking-[.06em] text-black/35 text-center px-3 leading-relaxed">Pin a reference from Media drawer</span>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold uppercase tracking-[.08em] text-[#6d28d9]">Buyer Reference *</span>
                        {status === 'active' && (
                          <button
                            type="button"
                            onClick={generateBuyerRef}
                            title="Auto-generate a buyer reference"
                            className="text-[9px] font-bold uppercase tracking-[.06em] text-[#6d28d9] bg-[#f3e8ff] px-1.5 py-0.5 rounded-sm cursor-pointer hover:bg-[#e9d8fd]"
                          >
                            Auto
                          </button>
                        )}
                      </div>
                      <input
                        value={state.buyer_brief.buyer_ref}
                        disabled={status !== 'active'}
                        placeholder="Your internal SKU / ref code"
                        onChange={e => setBriefField('buyer_ref', e.target.value)}
                        className={`border-b border-black/15 bg-transparent py-1.5 text-[18px] font-bold outline-none ${status !== 'active' ? 'text-black/40 cursor-not-allowed' : 'text-[#1A1A18] focus:border-black placeholder:text-black/25 placeholder:font-normal placeholder:text-[13px]'}`}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-[.1em] text-black">Description</span>
                      <textarea
                        value={state.buyer_brief.description}
                        disabled={status !== 'active'}
                        placeholder="What are you looking for?"
                        onChange={e => setBriefField('description', e.target.value)}
                        onInput={autoGrow}
                        rows={1}
                        className={`border-b border-black/15 bg-transparent py-1.5 text-[13px] outline-none resize-none leading-relaxed overflow-hidden ${status !== 'active' ? 'text-black/50 cursor-not-allowed' : 'text-[#1A1A18] focus:border-black placeholder:text-black/25'}`}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-[.1em] text-black">Colour</span>
                      <input
                        value={state.buyer_brief.color}
                        disabled={status !== 'active'}
                        placeholder="e.g. Terracotta, Off-white…"
                        onChange={e => setBriefField('color', e.target.value)}
                        className={`border-b border-black/15 bg-transparent py-1.5 text-[13px] outline-none ${status !== 'active' ? 'text-black/50 cursor-not-allowed' : 'text-[#1A1A18] focus:border-black placeholder:text-black/25'}`}
                      />
                    </div>
                  </div>
                </div>

                {/* Attribute rows break out to the full tab width below the image, matching the real Buyer Brief tab */}
                <div className="flex flex-col">
                  <AttrField icon={AttrIcons.material} label="Material" value={state.buyer_brief.material} onChange={v => setBriefField('material', v)} disabled={status !== 'active'} multiline />
                  <AttrField icon={AttrIcons.dimensions} label="Dimensions" value={state.buyer_brief.dimensions} onChange={v => setBriefField('dimensions', v)} disabled={status !== 'active'} placeholder="e.g. 30×20×15 cm" />
                  <AttrField icon={AttrIcons.weight} label="Weight (kg)" value={state.buyer_brief.weight} onChange={v => setBriefField('weight', v)} disabled={status !== 'active'} placeholder="Optional" />
                  <AttrField icon={AttrIcons.finish} label="Finish" value={state.buyer_brief.finish} onChange={v => setBriefField('finish', v)} disabled={status !== 'active'} placeholder="Optional" multiline />
                  <AttrField
                    icon={AttrIcons.price} label="Target Price" value={state.buyer_brief.target_price} onChange={v => setBriefField('target_price', v)} disabled={status !== 'active'}
                    suffix={
                      <select
                        value={state.buyer_brief.currency}
                        disabled={status !== 'active'}
                        onChange={e => setBriefField('currency', e.target.value)}
                        className="text-[10px] font-bold uppercase text-black/60 bg-transparent outline-none cursor-pointer flex-shrink-0"
                      >
                        {['USD', 'GBP', 'EUR'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    }
                  />
                  <AttrField icon={AttrIcons.qty} label="Unit Qty" value={state.buyer_brief.unit_qty} onChange={v => setBriefField('unit_qty', v)} disabled={status !== 'active'} />
                  <AttrField icon={AttrIcons.notes} label="Quality Notes" value={state.buyer_brief.quality_notes} onChange={v => setBriefField('quality_notes', v)} disabled={status !== 'active'} placeholder="Any quality requirements…" multiline />
                </div>

                {status === 'active' ? (
                  <>
                    <button
                      type="button"
                      onClick={saveBrief}
                      className="w-full py-2.5 text-[11px] font-extrabold uppercase tracking-[.06em] rounded-sm bg-[#1A1A18] text-white hover:opacity-85 cursor-pointer"
                    >
                      Save Brief
                    </button>

                    {!state.briefSaved && (
                      <div className="flex items-start gap-2 border-l-[3px] border-amber-400 bg-amber-50 px-3 py-2.5 rounded-r">
                        <span className="text-amber-500 flex-shrink-0 mt-0.5">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
                        </span>
                        <span className="text-[11px] text-amber-800 leading-relaxed">
                          Fields are pre-filled from the product info. Edit them to match your design requirements and click <strong>Save Brief</strong> to confirm.
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-start gap-2 border-l-[3px] border-black/25 bg-black/[.03] px-3 py-2.5 rounded-r">
                    <span className="text-black/40 flex-shrink-0 mt-0.5">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="4" y="10" width="16" height="10" rx="1.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                    </span>
                    <span className="text-[11px] text-black/55 leading-relaxed">
                      Buyer brief is locked once approved to sample. Click <strong>Undo</strong> in the header to step back to Active and edit it again.
                    </span>
                  </div>
                )}
                </div>{/* /Buyer Brief section */}

                {/* Local-demo-only controls, tucked out of the way rather than in the header */}
                <div className="mt-auto pt-6 flex items-center gap-2 justify-start">
                  <button
                    type="button"
                    title="Reset this demo workspace to its starting state"
                    onClick={handleReset}
                    className="px-2.5 py-1.5 text-[9px] border border-black/30 font-bold uppercase tracking-[.06em] bg-white text-black/60 hover:bg-neutral-100 cursor-pointer whitespace-nowrap rounded-sm"
                  >
                    Reset Demo
                  </button>
                  <button
                    type="button"
                    title={canUndo ? 'Undo last stage change' : 'Nothing to undo'}
                    disabled={!canUndo}
                    onClick={handleUndo}
                    className={`px-2.5 py-1.5 text-[9px] border font-bold uppercase tracking-[.06em] whitespace-nowrap rounded-sm
                      ${canUndo ? 'border-black/30 text-black/60 bg-white cursor-pointer hover:bg-neutral-100' : 'border-black/10 text-black/25 cursor-not-allowed'}`}
                  >
                    Undo
                  </button>
                </div>
              </>
            )}

            {tab === 'sample' && (
              !['approved', 'sample', 'sample_shipped'].includes(status) ? (
                <div className="text-[11px] text-black/40">Sample details unlock once the workspace reaches the Approved stage.</div>
              ) : !state.sample_status ? (
                <div className="text-[11px] text-black/40">No sample order yet — click <strong>Proceed to Sample</strong> in the top bar to create one.</div>
              ) : (() => {
                const SAMPLE_STATUSES = [
                  { key: 'in_process', label: 'In Development', color: 'bg-[#fff3e0] text-[#e65100] border-[#e65100]' },
                  { key: 'ready',      label: 'Ready',           color: 'bg-[#dcfce7] text-[#166534] border-[#166534]' },
                  { key: 'on_hold',    label: 'On Hold',         color: 'bg-[#fef2f2] text-[#991b1b] border-[#991b1b]' },
                  { key: 'dropped',    label: 'Dropped',         color: 'bg-[#f1f5f9] text-[#475569] border-[#475569]' },
                ]
                const isReady = state.sample_status === 'ready'
                const isDropped = state.sample_status === 'dropped'
                const findingsLocked = isDropped
                const findings = state.sample_findings
                const canAccept = status === 'approved' && isReady
                const gateReady = !!findings.approved_image && !!state.qa_comments?.trim()
                // Sample image / findings / QA comments stay hidden until the sample is
                // actually marked Ready (or dropped, or already has data) — matching the
                // real Sample tab, which doesn't reveal this section on a fresh in-development
                // sample order either.
                const hasFindingsData = findings.sample_images.length > 0 || [
                  'actual_weight', 'actual_l', 'actual_w', 'actual_h',
                  'inner_qty', 'inner_l', 'inner_w', 'inner_h',
                  'master_qty', 'master_l', 'master_w', 'master_h',
                  'master_pack_weight_kg', 'cbm',
                ].some(k => findings[k])
                const showFindings = isReady || isDropped || hasFindingsData

                const toCm   = v => v ? (parseFloat(v) * 2.54).toFixed(2) : ''
                const toDisp = v => (v && dimUnit === 'in') ? (parseFloat(v) / 2.54).toFixed(2) : (v || '')
                const setDim = (fk, v) => setFindingsField({ [fk]: dimUnit === 'in' ? toCm(v) : v })
                const dimRow = (prefix, label) => (
                  <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${!findingsLocked ? 'hover:bg-black/[.04]' : ''}`}>
                    <div className="flex items-center gap-2 w-[140px] flex-shrink-0">
                      <span className="text-black">{AttrIcons.dimensions}</span>
                      <span className="text-[12px] font-bold text-black">{label}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-1">
                      {[`${prefix}_l`, `${prefix}_w`, `${prefix}_h`].map((fk, i) => (
                        <div key={fk} className="flex items-center gap-1">
                          {i > 0 && <span className="text-[11px] text-black">×</span>}
                          {findingsLocked
                            ? <span className="text-[13px] text-[#1A1A18] w-10 text-center">{toDisp(findingsDraft[fk]) || <span className="text-black">—</span>}</span>
                            : <input type="number" step="0.5" min="0" value={toDisp(findingsDraft[fk])} onChange={e => setDim(fk, e.target.value)} placeholder="0"
                                className="w-16 text-[13px] text-[#1A1A18] bg-transparent outline-none text-center border-b border-transparent focus:border-black placeholder:text-black/20" />}
                        </div>
                      ))}
                      <span className="text-[11px] text-black ml-0.5">{dimUnit}</span>
                    </div>
                  </div>
                )
                const numRow = (label, field, placeholder = '0') => (
                  <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${!findingsLocked ? 'hover:bg-black/[.04]' : ''}`}>
                    <div className="flex items-center gap-2 w-[140px] flex-shrink-0">
                      <span className="text-black">{AttrIcons.qty}</span>
                      <span className="text-[12px] font-bold text-black">{label}</span>
                    </div>
                    <div className="flex-1">
                      {findingsLocked
                        ? <span className="text-[13px] text-[#1A1A18]">{findingsDraft[field] || <span className="text-black">—</span>}</span>
                        : <input type="number" step={field === 'cbm' ? '0.001' : field.includes('qty') ? '1' : '0.1'} value={findingsDraft[field] || ''}
                            onChange={e => setFindingsField({ [field]: e.target.value })} placeholder={placeholder}
                            className="w-full text-[13px] text-[#1A1A18] bg-transparent outline-none border-b border-black/15 focus:border-black py-1" />}
                    </div>
                  </div>
                )

                return (
                  <div className="flex flex-col gap-5">
                    {/* Status pills */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-[.08em] text-black flex-shrink-0">Sample Status</span>
                      {SAMPLE_STATUSES.map(({ key, label, color }) => {
                        const locked = key === 'ready' && !state.target_ready_date
                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={locked}
                            title={locked ? 'Set a target ready date first' : undefined}
                            onClick={() => handleSampleStatusChange(key)}
                            className={`px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-[.06em] rounded-full border transition-all
                              ${locked ? 'cursor-not-allowed opacity-30' : 'cursor-pointer'}
                              ${state.sample_status === key ? `${color} opacity-100` : 'bg-transparent border-black text-black hover:border-black'}`}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>

                    <div className="h-px bg-black/[.07]" />

                    {isDropped && (
                      <div className="text-[11px] text-black font-medium bg-black/[.03] border border-black/10 rounded px-3 py-2.5 leading-relaxed">
                        This round was dropped — findings below are read-only. Switch status back to "In Development" to start a new round.
                      </div>
                    )}

                    {!showFindings && (
                      <div className="text-[11px] text-black/50 leading-relaxed">
                        Tick a photo in the Media panel (From Spec / From Chat) to add it as a sample image, or mark the sample Ready, to start recording findings and QA comments.
                      </div>
                    )}

                    {showFindings && <>
                    {/* Image + confirmed details */}
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-[200px] flex flex-col gap-2">
                        <div
                          className="w-[200px] h-[200px] bg-white overflow-hidden rounded flex items-center justify-center relative"
                          onClick={() => !findingsLocked && !findings.approved_image && findingsImageRef.current?.click()}
                        >
                          {findings.approved_image ? (
                            <img
                              src={findings.approved_image}
                              onClick={e => { e.stopPropagation(); openLightbox([findings.approved_image, ...findings.sample_images.filter(u => u !== findings.approved_image)]) }}
                              className="w-full h-full object-contain cursor-zoom-in" alt=""
                            />
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
                          <>
                            <input ref={findingsImageRef} type="file" multiple accept="image/*" className="hidden" onChange={handleFindingsImagePick} />
                            <button
                              onClick={() => findingsImageRef.current?.click()}
                              className="py-1 text-[9px] font-bold uppercase tracking-[.06em] border border-black rounded text-black hover:text-black cursor-pointer bg-transparent transition-colors"
                            >
                              Upload Images
                            </button>
                          </>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col gap-3 pt-0.5">
                        {[[`Approved Price (${CURRENCY_SYMBOLS[state.approved_currency] || '$'})`, state.approved_price], ['Approved Sample Qty', state.approved_qty]]
                          .filter(([, v]) => v != null && v !== '').map(([label, val]) => (
                            <div key={label}>
                              <div className="text-[9px] font-bold uppercase tracking-[.08em] text-black mb-0.5">{label}</div>
                              <div className="text-[13px] font-bold text-[#1A1A18]">{val}</div>
                            </div>
                          ))}

                        <div className="flex flex-col gap-2 pt-1 border-t border-black/[.07] mt-1">
                          <div className="text-[9px] font-bold uppercase tracking-[.08em] text-black">Sample Observation</div>
                          {findingsLocked ? (
                            state.qa_comments && (
                              <div>
                                <div className="text-[9px] font-bold uppercase tracking-[.08em] text-black mb-0.5">QA Comments</div>
                                <div className="text-[13px] text-[#1A1A18] leading-relaxed whitespace-pre-line">{state.qa_comments}</div>
                              </div>
                            )
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              <div className="text-[9px] font-bold uppercase tracking-[.08em] text-black mb-0.5">QA Comments</div>
                              <textarea
                                value={qaDraft}
                                onChange={e => setQaDraft(e.target.value)}
                                placeholder="Quality observations about this sample…"
                                rows={3}
                                className="text-[13px] text-[#1A1A18] bg-transparent border border-black rounded p-2 outline-none resize-none placeholder:text-black/25 focus:border-black transition-colors"
                              />
                              <button
                                onClick={handleSaveQaComments}
                                disabled={qaDraft.trim() === (state.qa_comments || '').trim()}
                                className="self-start px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-white rounded-sm cursor-pointer hover:opacity-80 disabled:opacity-30"
                              >
                                Save
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Measurement fields */}
                    <div className="flex flex-col -mx-2">
                      <div className="flex items-center justify-end px-2 pb-1">
                        <div className="flex items-center rounded-full border border-black overflow-hidden">
                          {['cm', 'in'].map(u => (
                            <button
                              key={u} type="button" onClick={() => setDimUnit(u)}
                              className={`px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[.06em] cursor-pointer border-none transition-colors ${dimUnit === u ? 'bg-[#1A1A18] text-white' : 'bg-transparent text-black hover:text-black'}`}
                            >
                              {u}
                            </button>
                          ))}
                        </div>
                      </div>
                      {numRow('Actual Weight (kg)', 'actual_weight', '0.0')}
                      {dimRow('actual', 'Actual L×W×H')}
                      {numRow('Inner Qty', 'inner_qty', 'pcs')}
                      {dimRow('inner', 'Inner L×W×H')}
                      {numRow('Master Qty', 'master_qty', 'pcs')}
                      {dimRow('master', 'Master L×W×H')}
                      {numRow('Master Weight (kg)', 'master_pack_weight_kg', 'Optional')}
                      {numRow('CBM (m³)', 'cbm', '0.000')}
                    </div>

                    {/* Additional images grid — hidden once the main sample image is set */}
                    {findings.sample_images.length > 0 && !findings.approved_image && (
                      <div className="grid grid-cols-4 gap-1.5">
                        {findings.sample_images.map((url, i) => (
                          <div key={i} className="aspect-square bg-[#EDEAE4] overflow-hidden rounded relative">
                            <img src={url} onClick={() => openLightbox(findings.sample_images, i)} className="w-full h-full object-contain cursor-zoom-in" alt="" />
                          </div>
                        ))}
                      </div>
                    )}

                    {!findingsLocked && (
                      <button
                        onClick={handleSaveFindings}
                        className="w-full py-2.5 bg-[#1A1A18] text-white text-[11px] font-extrabold uppercase tracking-[.1em] cursor-pointer hover:opacity-80 rounded-sm"
                      >
                        Save Findings
                      </button>
                    )}
                    </>}

                    {/* Ready date */}
                    {!isReady && (
                      <div className="flex flex-col gap-2">
                        <div className="text-[10px] font-bold uppercase tracking-[.08em] text-black">Sample Ready Date</div>
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={targetReadyDraft}
                            onChange={e => setTargetReadyDraft(e.target.value)}
                            className="border-b-2 border-[#1A1A18] py-1 text-[15px] font-bold text-[#1A1A18] bg-transparent outline-none w-[160px]"
                          />
                          <button
                            onClick={handleSaveTargetReadyDate}
                            disabled={!targetReadyDraft || targetReadyDraft === state.target_ready_date}
                            className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-white rounded-sm cursor-pointer hover:opacity-80 disabled:opacity-30"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Additional Notes — a shared note field, visible whenever the sample
                        isn't marked Ready yet, independent of whether findings data exists. */}
                    {!isReady && (
                      <div className="flex flex-col gap-2">
                        <div className="text-[10px] font-bold uppercase tracking-[.08em] text-black">Additional Notes</div>
                        <textarea
                          value={notesDraft}
                          onChange={e => setNotesDraft(e.target.value)}
                          placeholder="Any notes about sample development…"
                          rows={3}
                          className="text-[13px] text-[#1A1A18] bg-transparent border border-black rounded p-2.5 outline-none resize-none placeholder:text-black/25 focus:border-black transition-colors"
                        />
                        <button
                          onClick={handleSaveAdditionalNotes}
                          disabled={notesDraft.trim() === (state.additional_notes || '').trim()}
                          className="self-start px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-white rounded-sm cursor-pointer hover:opacity-80 disabled:opacity-30"
                        >
                          Save
                        </button>
                      </div>
                    )}

                    {/* Buyer decision — Accept or Reopen */}
                    {canAccept && (
                      <div className="flex flex-col gap-2 pt-1">
                        {!gateReady ? (
                          <div className="text-[11px] text-black font-medium bg-black/[.03] border border-black/10 rounded px-3 py-2.5 leading-relaxed">
                            Set a main sample image (tick it in the Media panel) and add QA comments before you can accept or reopen the brief.
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={handleAcceptSample}
                              className="flex-1 py-2 text-[11px] font-extrabold uppercase tracking-[.06em] bg-[#166534] text-white rounded-sm cursor-pointer hover:opacity-80"
                            >
                              Accept Sample
                            </button>
                            <button
                              onClick={() => setShowReopenInput(v => !v)}
                              className="flex-1 py-2 text-[11px] font-extrabold uppercase tracking-[.06em] border border-black text-black rounded-sm cursor-pointer hover:text-black transition-colors bg-transparent"
                            >
                              Reopen Brief
                            </button>
                          </div>
                        )}
                        {showReopenInput && (
                          <div className="flex flex-col gap-2">
                            <textarea
                              value={reopenNote}
                              onChange={e => setReopenNote(e.target.value)}
                              placeholder="What needs to change? (optional)"
                              rows={2}
                              autoFocus
                              className="text-[13px] text-[#1A1A18] bg-transparent border border-black rounded p-2.5 outline-none resize-none placeholder:text-black/25 focus:border-black transition-colors"
                            />
                            <button
                              onClick={handleReopenBrief}
                              className="self-start px-4 py-2 text-[11px] font-extrabold uppercase tracking-[.06em] bg-[#1A1A18] text-white rounded-sm cursor-pointer hover:opacity-80"
                            >
                              Confirm Reopen
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {status === 'sample' && (
                      <div className="text-[11px] text-[#166534] font-semibold bg-[#dcfce7] border border-[#166534]/30 rounded px-3 py-2.5 leading-relaxed">
                        Sample accepted — head to the Shipping tab to record how it's moving.
                      </div>
                    )}
                    {status === 'sample_shipped' && (
                      <div className="text-[11px] text-[#1d4ed8] font-semibold bg-[#dbeafe] border border-[#1d4ed8]/30 rounded px-3 py-2.5 leading-relaxed">
                        Sample shipped — see the Shipping tab for tracking details.
                      </div>
                    )}
                  </div>
                )
              })()
            )}

            {tab === 'shipping' && ['sample', 'sample_shipped'].includes(status) && (() => {
              const shipping = shippingDraft
              const soShipping = state.shipping
              const changed = Object.keys(shipping).some(k => (shipping[k] || '') !== (soShipping[k] || ''))
              const modeAccent =
                shipping.ship_mode === 'air' ? { bg: 'bg-[#166534]', border: 'border-[#166534]' } :
                shipping.ship_mode === 'container' ? { bg: 'bg-[#1d4ed8]', border: 'border-[#1d4ed8]' } :
                { bg: 'bg-[#1A1A18]', border: 'border-black/20' }
              const trackingUrlFor = (t) => t && COURIER_TRACK_URL[shipping.courier_company]
                ? COURIER_TRACK_URL[shipping.courier_company](t)
                : null
              const shipRow = (label, field, type = 'text', placeholder) => (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
                  <div className="flex items-center gap-2 w-[162px] flex-shrink-0">
                    <span className="text-black">{AttrIcons.dimensions}</span>
                    <span className="text-[12px] font-bold text-black">{label}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      type={type}
                      value={shipping[field] || ''}
                      onChange={e => setShippingDraft(s => ({ ...s, [field]: e.target.value }))}
                      placeholder={placeholder}
                      className={`w-full text-[13px] text-[#1A1A18] bg-transparent outline-none border-b ${modeAccent.border} focus:border-black pb-0.5 placeholder:text-black/25 placeholder:font-normal`}
                    />
                  </div>
                </div>
              )

              return (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col -mx-2">
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
                      <div className="flex items-center gap-2 w-[162px] flex-shrink-0">
                        <span className="text-black">{AttrIcons.dimensions}</span>
                        <span className="text-[12px] font-bold text-black">Mode</span>
                      </div>
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <div className="flex items-center rounded-full border border-black divide-x divide-black overflow-hidden w-fit">
                          {['Air', 'Ship'].map(m => {
                            const dbVal = m === 'Air' ? 'air' : 'container'
                            return (
                              <button
                                key={m} type="button"
                                onClick={() => setShippingDraft(s => ({ ...s, ship_mode: dbVal }))}
                                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-[.06em] cursor-pointer transition-colors
                                  ${shipping.ship_mode === dbVal ? `${m === 'Air' ? 'bg-[#166534]' : 'bg-[#1d4ed8]'} text-white` : 'bg-transparent text-black hover:text-black'}`}
                              >
                                {m}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {shipping.ship_mode === 'air' && (
                      <>
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
                          <div className="flex items-center gap-2 w-[162px] flex-shrink-0">
                            <span className="text-black">{AttrIcons.dimensions}</span>
                            <span className="text-[12px] font-bold text-black">Courier Company</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <CourierSearchSelect
                              value={shipping.courier_company}
                              onChange={val => setShippingDraft(s => ({ ...s, courier_company: val }))}
                              options={INTERNATIONAL_COURIERS}
                              placeholder="Search courier…"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
                          <div className="flex items-center gap-2 w-[162px] flex-shrink-0">
                            <span className="text-black">{AttrIcons.qty}</span>
                            <span className="text-[12px] font-bold text-black">Tracking Ref</span>
                          </div>
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <input
                              type="text"
                              value={shipping.tracking_ref || ''}
                              onChange={e => setShippingDraft(s => ({ ...s, tracking_ref: e.target.value }))}
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
                          </div>
                        </div>

                        {shipRow('ETD', 'etd', 'date')}
                        {shipRow('ETA', 'eta', 'date')}
                      </>
                    )}

                    {shipping.ship_mode === 'container' && (
                      <>
                        {shipRow('Container No', 'container_no')}
                        {shipRow('Vessel No', 'vessel_no')}
                        {shipRow('ETD', 'etd', 'date')}
                        {shipRow('ETA', 'eta', 'date')}
                      </>
                    )}
                  </div>

                  <button
                    onClick={handleSaveShipping}
                    disabled={!changed}
                    className={`py-2.5 text-[11px] font-extrabold uppercase tracking-[.06em] ${modeAccent.bg} text-white rounded-sm cursor-pointer hover:opacity-80 disabled:opacity-30`}
                  >
                    Save Shipping Details
                  </button>
                </div>
              )
            })()}
          </div>
        </div>

        {/* Middle: Buyer/Vendor Activity */}
        <div className={`${panelClass('activity')} flex-1 min-w-0 lg:border-r border-black`}>
          <div className="h-11 flex items-center border-b border-black flex-shrink-0">
            {[['buyer', `Buyer Activity ${state.chat.length}`], ['vendor', `Vendor Activity ${state.vendorChat.length}`]].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setChatTab(k)}
                className={`h-full flex items-center justify-center px-4 text-[10px] font-bold uppercase tracking-[.06em] cursor-pointer transition-colors flex-1 border-b-2
                  ${chatTab === k ? 'border-[#7c3aed] text-[#1A1A18] bg-white' : 'border-transparent text-black bg-transparent hover:text-black'}`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={toggleVideoCall}
              title="Demo only — no real call is started"
              className={`hidden md:flex relative items-center gap-1.5 mx-3 px-3.5 py-2 rounded-lg font-bold uppercase tracking-[.05em] text-[10px] transition-all border-none text-white shadow-sm flex-shrink-0
                ${callActive
                  ? 'bg-gradient-to-r from-[#1a6fd4] to-[#0e5ec4] cursor-pointer shadow-md ring-2 ring-[#2D8CFF]/40'
                  : 'bg-gradient-to-r from-[#4dabff] to-[#2D8CFF] hover:from-[#3da0ff] hover:to-[#2681eb] cursor-pointer hover:shadow-md'}`}
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
              <span className="whitespace-nowrap">{callActive ? 'In call' : 'Video call'}</span>
            </button>
          </div>

          {(() => {
            const activeMessages = chatTab === 'vendor' ? state.vendorChat : state.chat
            return (
            <>
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                {activeMessages.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-[11px] font-semibold text-black/40 uppercase tracking-[.04em] text-center">No activity yet — start the conversation</div>
                ) : activeMessages.map(m => (
                  m.type === 'milestone' ? (
                    <div key={m.id} className="flex flex-col items-center gap-1 py-1">
                      <div className="flex items-center gap-2 w-full">
                        <div className="flex-1 h-px bg-black/[.12]" />
                        <span className="text-[9px] font-bold uppercase tracking-[.06em] px-2 py-0.5 rounded-full bg-black/[.06] text-black flex items-center gap-1.5 whitespace-nowrap">
                          {m.label}
                          {m.detail && <span className="font-semibold normal-case tracking-normal text-[#1A1A18]">{m.detail}</span>}
                          <span className="font-normal normal-case tracking-normal text-black">{formatChatTime(m.ts)}</span>
                        </span>
                        <div className="flex-1 h-px bg-black/[.12]" />
                      </div>
                    </div>
                  ) : m.type === 'field_change' ? (
                    <div key={m.id} className="flex items-center gap-1.5 py-0.5">
                      <span className="text-black flex-shrink-0 text-[11px]">•</span>
                      <span className="text-[10px] text-black flex-1">
                        <span className="font-semibold">{m.author}</span> {m.body}
                      </span>
                      <span className="text-[9px] text-black flex-shrink-0">{formatChatTime(m.ts)}</span>
                    </div>
                  ) : (
                    <div key={m.id} className="relative rounded-r-lg px-3 py-2.5 bg-white border-l-[3px] border-[#ea580c]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-black/10 text-black">{m.author}</span>
                        <span className="text-[10px] text-black">{formatChatTime(m.ts)}</span>
                      </div>
                      {m.body && <div className="text-[13px] text-[#1A1A18] leading-relaxed whitespace-pre-line">{m.body}</div>}
                      {m.attachments?.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap mt-1.5">
                          {m.attachments.map((a, i) => (
                            a.type?.startsWith('audio')
                              ? <audio key={i} src={a.url} controls preload="none" className="h-8 max-w-[220px]" />
                              : <img key={i} src={a.url} alt={a.name} className="max-w-[110px] max-h-[85px] rounded object-contain border border-black" />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                ))}
              </div>
              {pendingAttachments.length > 0 && (
                <div className="flex gap-1.5 flex-wrap px-3 pt-2 border-t border-black/10 flex-shrink-0">
                  {pendingAttachments.map((a, i) => (
                    a.type?.startsWith('audio') ? (
                      <div key={i} className="flex items-center gap-1 pl-2 pr-1 py-1 bg-[#f0ebff] border border-[#c4b5fd] rounded-full text-[10px] text-[#6d28d9] font-medium">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        </svg>
                        <span>Voice message</span>
                        <button type="button" onClick={() => removePendingAttachment(i)} className="flex-shrink-0 text-[#7c3aed] hover:text-red-500 border-none bg-none cursor-pointer leading-none">×</button>
                      </div>
                    ) : (
                      <div key={i} className="relative">
                        <img src={a.url} alt={a.name} className="w-10 h-10 object-contain rounded border border-black/15" />
                        <button
                          type="button"
                          onClick={() => removePendingAttachment(i)}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center bg-black text-white rounded-full cursor-pointer"
                        >
                          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/></svg>
                        </button>
                      </div>
                    )
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 p-3 border-t border-black flex-shrink-0">
                <button
                  type="button"
                  title="Attach images"
                  onClick={() => attachInputRef.current?.click()}
                  className="flex items-center justify-center w-8 h-8 flex-shrink-0 text-black/50 hover:text-black cursor-pointer"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                </button>
                <input ref={attachInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAttachPick} />
                <button
                  type="button"
                  title="Take a photo"
                  onClick={() => setCameraOpen(true)}
                  disabled={isRecordingVoice}
                  className="flex items-center justify-center w-8 h-8 flex-shrink-0 text-black/50 hover:text-black cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </button>
                {isRecordingVoice ? (
                  <div className="flex-1 flex items-center gap-2 border border-black/20 rounded-sm px-2.5 py-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                    <span className="text-[11px] font-semibold text-[#1A1A18] tabular-nums flex-shrink-0">
                      {String(Math.floor(voiceRecordSecs / 60)).padStart(1, '0')}:{String(voiceRecordSecs % 60).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] text-black/50 flex-1 truncate">Recording voice message…</span>
                    <button type="button" onClick={cancelVoiceRecording} title="Cancel" className="flex-shrink-0 text-black/50 hover:text-red-600 border-none bg-none cursor-pointer leading-none text-sm">×</button>
                  </div>
                ) : (
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendChat() }}
                    placeholder={chatTab === 'vendor' ? 'Message vendor…' : 'Message buyer…'}
                    className="flex-1 border border-black/20 rounded-sm px-2.5 py-1.5 text-[11px] outline-none focus:border-black transition-colors"
                  />
                )}
                <button
                  type="button"
                  title={isRecordingVoice ? 'Stop recording' : 'Record a voice message'}
                  onClick={isRecordingVoice ? finishVoiceRecording : startVoiceRecording}
                  className={`w-7 h-7 rounded-full border-none flex items-center justify-center cursor-pointer flex-shrink-0 transition-colors ${isRecordingVoice ? 'bg-red-500 hover:opacity-80' : 'bg-black/[.06] text-black/50 hover:bg-black hover:text-white'}`}
                >
                  {isRecordingVoice ? (
                    <span className="w-2.5 h-2.5 rounded-sm bg-white" />
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={sendChat}
                  disabled={(!chatInput.trim() && pendingAttachments.length === 0) || isRecordingVoice}
                  className={`px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.06em] rounded-sm
                    ${(chatInput.trim() || pendingAttachments.length > 0) && !isRecordingVoice ? 'bg-black text-white cursor-pointer hover:opacity-85' : 'bg-black/10 text-black/30 cursor-not-allowed'}`}
                >
                  Send
                </button>
              </div>
              {cameraOpen && (
                <CameraCaptureModal
                  onCapture={handleCameraCapture}
                  onDone={() => setCameraOpen(false)}
                />
              )}
            </>
            )
          })()}
        </div>

        {/* Right: Media */}
        <div className={`${panelClass('media')} w-full lg:w-[260px] flex-shrink-0 bg-[#F5F3EF]`}>
          <div className="h-11 flex items-center justify-center gap-1.5 px-4 border-b border-black flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-black">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span className="text-[9px] font-bold uppercase tracking-[.1em] text-black">Media {2 + (state.media.buyerBriefImage ? 1 : 0) + state.sample_findings.sample_images.length}</span>
          </div>
          <div className="overflow-y-auto flex-1 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[8px] font-bold uppercase tracking-[.1em] text-black flex-shrink-0">Pinned</span>
              <div className="flex-1 h-px bg-black/[.08]" />
            </div>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              <div className="aspect-square bg-[#EDEAE4] overflow-hidden relative rounded-sm">
                <img
                  src={state.sku.image_url}
                  alt="Product"
                  onClick={() => openLightbox([state.sku.image_url])}
                  className="w-full h-full object-contain cursor-zoom-in"
                />
                <div className="absolute inset-0 ring-2 ring-[#2D6A1F] ring-inset rounded-sm pointer-events-none" />
                <span className="absolute bottom-0 left-0 right-0 bg-[#2D6A1F]/90 text-white text-[7px] font-bold uppercase tracking-[.05em] text-center py-0.5">Product Image</span>
              </div>
              <div className="aspect-square bg-[#EDEAE4] overflow-hidden relative rounded-sm">
                {state.media.buyerBriefImage ? (
                  <>
                    <img
                      src={state.media.buyerBriefImage}
                      alt="Buyer brief"
                      onClick={() => openLightbox([state.media.buyerBriefImage])}
                      className="w-full h-full object-contain cursor-zoom-in"
                    />
                    <div className="absolute inset-0 ring-2 ring-[#7c3aed] ring-inset rounded-sm pointer-events-none" />
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-[8px] font-bold uppercase tracking-[.05em] text-black/30 text-center px-2">Not pinned</span>
                  </div>
                )}
                <span className="absolute bottom-0 left-0 right-0 bg-[#7c3aed]/90 text-white text-[7px] font-bold uppercase tracking-[.05em] text-center py-0.5">Buyer Brief</span>
              </div>
            </div>

            {/* From Spec — the product image also lives here (as it does in the real
                Media panel's reference_media list), so it can be pinned as the Buyer
                Brief image directly, not just images shared in chat. */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[8px] font-bold uppercase tracking-[.1em] text-black flex-shrink-0">From Spec 1</span>
              <div className="flex-1 h-px bg-black/[.08]" />
            </div>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {(() => {
                const isPinned = state.sku.image_url === state.media.buyerBriefImage
                const isSample = state.sample_findings.sample_images.includes(state.sku.image_url)
                return (
                  <div className="aspect-square bg-[#EDEAE4] overflow-hidden relative group rounded-sm">
                    <img
                      src={state.sku.image_url}
                      alt="Product spec"
                      onClick={() => openLightbox([state.sku.image_url])}
                      className="w-full h-full object-contain cursor-zoom-in"
                    />
                    {isPinned && <div className="absolute inset-0 ring-2 ring-[#7c3aed] ring-inset rounded-sm pointer-events-none" />}
                    {/* Add to sample — only relevant once a sample order exists (merchant only, matching the real flow) */}
                    {state.sample_status && (
                      <button
                        type="button"
                        title={isSample ? 'Remove from Current Sample' : 'Add as sample image'}
                        onClick={() => handleToggleSampleImage(state.sku.image_url)}
                        className={`absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center border cursor-pointer transition-all
                          ${isSample
                            ? 'opacity-100 bg-[#c2410c] border-[#c2410c] text-white hover:bg-red-500 hover:border-red-500'
                            : 'opacity-0 group-hover:opacity-100 bg-white/90 border-black text-black hover:bg-[#c2410c] hover:text-white hover:border-[#c2410c]'}`}
                      >
                        <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </button>
                    )}
                    <button
                      type="button"
                      title={isPinned ? 'Pinned to Buyer Brief' : 'Set as Buyer Brief image'}
                      onClick={() => handlePinToBrief(state.sku.image_url)}
                      className={`absolute top-1 right-1 transition-opacity w-6 h-6 rounded-full flex items-center justify-center cursor-pointer border
                        ${isPinned
                          ? 'opacity-100 bg-[#7c3aed] border-[#7c3aed] text-white'
                          : 'opacity-0 group-hover:opacity-100 bg-white/90 border-black/20 text-[#7c3aed]'}`}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v6M5 9l7-7 7 7M6 12l1.5 9h9L18 12"/></svg>
                    </button>
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[7px] font-bold uppercase tracking-[.05em] text-center py-0.5 pointer-events-none">Spec</span>
                  </div>
                )
              })()}
            </div>

            {chatImages.length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[8px] font-bold uppercase tracking-[.1em] text-black flex-shrink-0">From Chat {chatImages.length}</span>
                  <div className="flex-1 h-px bg-black/[.08]" />
                </div>
                {monthBucketsOf(chatImages).map((_mg, _gi) => (
                <MonthGroup key={_mg.key} label={_mg.label} count={_mg.items.length} defaultOpen={_gi === 0}>
                <div className="grid grid-cols-2 gap-1.5">
                  {_mg.items.map((img, i) => {
                  const isPinned = img.url === state.media.buyerBriefImage
                  const isSample = state.sample_findings.sample_images.includes(img.url)
                  return (
                    <div key={img.url || i} className="flex flex-col gap-0.5 min-w-0">
                      <div className="aspect-square bg-[#EDEAE4] overflow-hidden relative group rounded-sm">
                        <img
                          src={img.url}
                          alt={img.name}
                          onClick={() => openLightbox(chatImages.map(c => c.url), chatImages.indexOf(img))}
                          className="w-full h-full object-contain cursor-zoom-in"
                        />
                        {isPinned && <div className="absolute inset-0 ring-2 ring-[#7c3aed] ring-inset rounded-sm pointer-events-none" />}
                        <span className="absolute bottom-1 left-1 right-1 text-[7px] font-extrabold px-1 py-0.5 uppercase bg-white/90 rounded-sm text-[#1A1A18] truncate text-center pointer-events-none">{img.from}</span>
                        {state.sample_status && (
                          <button
                            type="button"
                            title={isSample ? 'Remove from Current Sample' : 'Add as sample image'}
                            onClick={() => handleToggleSampleImage(img.url)}
                            className={`absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center border cursor-pointer transition-all
                              ${isSample
                                ? 'opacity-100 bg-[#c2410c] border-[#c2410c] text-white hover:bg-red-500 hover:border-red-500'
                                : 'opacity-0 group-hover:opacity-100 bg-white/90 border-black text-black hover:bg-[#c2410c] hover:text-white hover:border-[#c2410c]'}`}
                          >
                            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </button>
                        )}
                        <button
                          type="button"
                          title={isPinned ? 'Pinned to Buyer Brief' : 'Set as Buyer Brief image'}
                          onClick={() => handlePinToBrief(img.url)}
                          className={`absolute top-1 right-1 transition-opacity w-6 h-6 rounded-full flex items-center justify-center cursor-pointer border
                            ${isPinned
                              ? 'opacity-100 bg-[#7c3aed] border-[#7c3aed] text-white'
                              : 'opacity-0 group-hover:opacity-100 bg-white/90 border-black/20 text-[#7c3aed]'}`}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v6M5 9l7-7 7 7M6 12l1.5 9h9L18 12"/></svg>
                        </button>
                      </div>
                      <div className="text-[7px] font-semibold text-black px-0.5 truncate text-center tabular-nums leading-tight">{formatChatTime(img.ts)}</div>
                    </div>
                  )
                  })}
                </div>
                </MonthGroup>
                ))}
              </>
            )}

            {state.sample_findings.sample_images.length > 0 && (
              <>
                <div className="flex items-center gap-2 mt-3 mb-1.5">
                  <span className="text-[8px] font-bold uppercase tracking-[.1em] text-black flex-shrink-0">Current Sample {state.sample_findings.sample_images.length}</span>
                  <div className="flex-1 h-px bg-black/[.08]" />
                </div>
                {!state.sample_findings.approved_image && (
                  <div className="text-[9px] text-black font-medium leading-relaxed mb-1.5 px-0.5">
                    Tap the checkmark on a photo below to set it as the main sample image.
                  </div>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  {state.sample_findings.sample_images.map((url, i) => {
                    const isApproved = url === state.sample_findings.approved_image
                    return (
                      <div key={i} className="aspect-square bg-[#EDEAE4] overflow-hidden relative rounded-sm group">
                        <img
                          src={url}
                          onClick={() => openLightbox(state.sample_findings.sample_images, i)}
                          className="w-full h-full object-contain cursor-zoom-in"
                          alt=""
                        />
                        {isApproved && <div className="absolute inset-0 ring-2 ring-[#c2410c] ring-inset rounded-sm pointer-events-none" />}
                        {isApproved && (
                          <span className="absolute top-1 right-1 text-[7px] font-extrabold px-1 py-0.5 uppercase bg-[#ffedd5] rounded-sm text-[#c2410c]">Production</span>
                        )}
                        <button
                          type="button"
                          title={isApproved ? 'Unset production image' : 'Set as production image'}
                          onClick={() => handleToggleApprovedImage(url)}
                          className={`absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center border cursor-pointer transition-all
                            ${isApproved
                              ? 'opacity-100 bg-[#c2410c] border-[#c2410c] text-white hover:bg-red-500 hover:border-red-500'
                              : 'opacity-100 bg-white/90 border-black text-black hover:bg-[#c2410c] hover:text-white hover:border-[#c2410c]'}`}
                        >
                          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      </div>{/* /ws-modal-scale */}

      {/* Proceed-to-Sample confirmation modal */}
      {showApproveModal && (
        <div className="fixed inset-0 z-[1010] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white w-[460px] rounded-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[.1em] text-black mb-0.5">Confirm Action</div>
                <div className="text-[15px] font-extrabold text-[#1A1A18] tracking-tight">Proceed to Sample</div>
              </div>
              <button onClick={() => setShowApproveModal(false)} className="text-black hover:text-black text-xl leading-none cursor-pointer border-none bg-none">×</button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[.08em] text-black mb-0.5">Brief Summary</div>
              {[
                ['Description', state.buyer_brief.description],
                ['Colour',      state.buyer_brief.color],
                ['Material',    state.buyer_brief.material],
                ['Dimensions',  state.buyer_brief.dimensions],
                ['Weight',      state.buyer_brief.weight ? `${state.buyer_brief.weight} kg` : ''],
                ['Finish',      state.buyer_brief.finish],
              ].filter(([, v]) => v).map(([label, val]) => (
                <div key={label} className="flex gap-3">
                  <span className="text-[11px] text-black w-24 flex-shrink-0">{label}</span>
                  <span className="text-[12px] font-semibold text-[#1A1A18] flex-1">{val}</span>
                </div>
              ))}
            </div>

            <div className="h-px bg-black/[.07] mx-5" />

            <div className="px-5 py-4 flex flex-col gap-3">
              <div className="text-[10px] font-bold uppercase tracking-[.08em] text-black mb-0.5">Sample Order Details</div>
              <div className="flex gap-4">
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-[.08em] text-black">Approved Sample Qty <span className="text-red-400">*</span></label>
                  <input
                    type="number" min="1" value={approveQty} onChange={e => setApproveQty(e.target.value)} placeholder="e.g. 2"
                    className="border-b-2 border-[#1A1A18] py-1.5 text-[14px] font-bold text-[#1A1A18] bg-transparent outline-none w-full placeholder:text-black/20 placeholder:font-normal"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-[.08em] text-black">
                    Approved Price ({CURRENCY_SYMBOLS[state.buyer_brief.currency] || state.buyer_brief.currency || '$'}) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number" min="0" step="0.01" value={approvePrice} onChange={e => setApprovePrice(e.target.value)} placeholder="e.g. 12.50"
                    className="border-b-2 border-[#1A1A18] py-1.5 text-[14px] font-bold text-[#1A1A18] bg-transparent outline-none w-full placeholder:text-black/20 placeholder:font-normal"
                  />
                </div>
              </div>
              <p className="text-[11px] text-black leading-relaxed">
                <span className="font-semibold text-black">{approveQty || '—'}</span> sample unit{approveQty !== '1' ? 's' : ''} will be developed at a target price of{' '}
                <span className="font-semibold text-black">{CURRENCY_SYMBOLS[state.buyer_brief.currency] || state.buyer_brief.currency || '$'}{approvePrice || '—'}</span> per unit. The brief will be locked after confirmation.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-black bg-black/[.02]">
              <button onClick={() => setShowApproveModal(false)} className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] text-black hover:text-black cursor-pointer border-none bg-none transition-colors">
                Cancel
              </button>
              <button
                onClick={handleConfirmProceedToSample}
                disabled={!approveQty || !approvePrice}
                className="px-5 py-2 text-[11px] font-extrabold uppercase tracking-[.06em] bg-[#1A1A18] text-white rounded-sm cursor-pointer hover:opacity-80 disabled:opacity-40"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proceed-to-PO confirmation modal — quantity only, price was already locked in at Proceed to Sample */}
      {showProceedToPOModal && (
        <div className="fixed inset-0 z-[1010] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white w-[460px] rounded-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[.1em] text-black mb-0.5">Confirm Action</div>
                <div className="text-[15px] font-extrabold text-[#1A1A18] tracking-tight">Proceed to PO</div>
              </div>
              <button onClick={() => setShowProceedToPOModal(false)} className="text-black hover:text-black text-xl leading-none cursor-pointer border-none bg-none">×</button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[.08em] text-black mb-0.5">Sample Order Summary</div>
              {[
                ['Approved Sample Qty', state.approved_qty],
                ['Approved Price', state.approved_price ? `${CURRENCY_SYMBOLS[state.approved_currency] || state.approved_currency || '$'}${state.approved_price}` : ''],
              ].filter(([, v]) => v).map(([label, val]) => (
                <div key={label} className="flex gap-3">
                  <span className="text-[11px] text-black w-40 flex-shrink-0">{label}</span>
                  <span className="text-[12px] font-semibold text-[#1A1A18] flex-1">{val}</span>
                </div>
              ))}
            </div>

            <div className="h-px bg-black/[.07] mx-5" />

            <div className="px-5 py-4 flex flex-col gap-3">
              <div className="text-[10px] font-bold uppercase tracking-[.08em] text-black mb-0.5">Production Order Details</div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-[.08em] text-black">Production Qty <span className="text-red-400">*</span></label>
                <input
                  type="number" min="1" value={poQty} onChange={e => setPoQty(e.target.value)} placeholder="e.g. 500"
                  className="border-b-2 border-[#1A1A18] py-1.5 text-[14px] font-bold text-[#1A1A18] bg-transparent outline-none w-full placeholder:text-black/20 placeholder:font-normal"
                />
              </div>
              <p className="text-[11px] text-black leading-relaxed">
                <span className="font-semibold text-black">{poQty || '—'}</span> unit{poQty !== '1' ? 's' : ''} will be confirmed for production at the price already approved for this sample.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-black bg-black/[.02]">
              <button onClick={() => setShowProceedToPOModal(false)} className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] text-black hover:text-black cursor-pointer border-none bg-none transition-colors">
                Cancel
              </button>
              <button
                onClick={handleConfirmProceedToPO}
                disabled={!poQty}
                className="px-5 py-2 text-[11px] font-extrabold uppercase tracking-[.06em] bg-[#1A1A18] text-white rounded-sm cursor-pointer hover:opacity-80 disabled:opacity-40"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[1020] flex items-center justify-center bg-[#f0eeeb]" onClick={() => setLightbox(null)}>
          <img
            key={lightbox.images[lightbox.index]}
            src={lightbox.images[lightbox.index]}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '85vw', maxHeight: '85vh', objectFit: 'contain' }}
          />

          {lightbox.images.length > 1 && (
            <div className="absolute bottom-5 left-0 right-0 flex justify-center gap-2" onClick={e => e.stopPropagation()}>
              {lightbox.images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setLightbox(l => ({ ...l, index: i }))}
                  className={`w-2 h-2 rounded-full border-none cursor-pointer transition-all ${i === lightbox.index ? 'bg-black scale-125' : 'bg-black/25 hover:bg-black/50'}`}
                />
              ))}
            </div>
          )}

          {lightbox.images.length > 1 && (
            <>
              <button
                onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: (l.index - 1 + l.images.length) % l.images.length })) }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-black cursor-pointer border-none"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <button
                onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: (l.index + 1) % l.images.length })) }}
                className="absolute right-16 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-black cursor-pointer border-none"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </>
          )}

          <button
            onClick={() => setLightbox(null)}
            title="Close (Esc)"
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-black cursor-pointer border-none"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}
    </div>
  )
}
