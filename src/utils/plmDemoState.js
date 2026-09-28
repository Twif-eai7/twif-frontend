// Local-only sandbox state for the "Demo SKU" walkthrough (tech department only).
// Nothing here ever touches the backend — everything lives in localStorage so tech
// staff can freely click through the whole PLM workspace flow without side effects
// on real SKUs/orgs.

const STORAGE_KEY = 'jng_plm_demo_workspace_v10'

// Forward order of the main workspace stages. Undo walks backward through this list
// one step at a time. A freshly created workspace starts 'inactive' (no buyer invited
// yet) — inviting the buyer moves it to 'invited', and them accepting moves it to
// 'active', matching the real system's pre-onboarding statuses (STATUS_LABELS in
// plmStore.js already defines 'inactive'/'invited' for this). Sample-order sub-status
// (in_process/ready/on_hold/dropped) and shipping details move independently of this
// within the "sample" stage — see workspace_status vs sample_status below.
export const STAGE_ORDER = ['inactive', 'invited', 'active', 'approved', 'sample']

// Which shipping fields must all be filled for a given mode before the "Shipping
// Details Filled" milestone fires — mirrors SHIP_MODE_FIELDS in the real backend
// (routes/plm.js PATCH /sku-sample-orders/:id).
const SHIP_MODE_FIELDS = {
  air:       ['courier_company', 'tracking_ref', 'etd', 'eta'],
  container: ['container_no', 'vessel_no', 'etd', 'eta'],
}

export function defaultDemoState() {
  const now = new Date().toISOString()
  return {
    createdAt: now,
    sku: {
      auto_code: 'DEMO-0001',
      image_url: '/demo/demo-sku.png',
      description: 'Natural Live-Edge Wooden Serving Board with Handle',
      category: 'Kitchenware',
      season: 'SS26',
      material: 'Acacia Wood, Leather Cord',
      dimensions: '46 × 18 × 2 cm',
      weight: '0.9',
      finish: 'Natural Oiled',
      buyer_org: 'Nordic Home Co.',
      vendor_org: 'Artisan Wood Works',
      vendor_sku_ref: 'AWW-ACB-014',
    },
    // 'inactive' | 'invited' | 'active' | 'approved' | 'sample' | 'on_hold' | 'rejected'.
    // Starts 'inactive' until the buyer is invited (-> 'invited') and accepts (-> 'active').
    // It later flips to 'sample' once the buyer accepts the sample (acceptSample below) —
    // while a sample order is being worked on (in_process/ready) the workspace itself
    // stays 'approved', matching the real app so the Shipping tab doesn't appear early.
    workspace_status: 'inactive',
    // The stage to restore when "Continue" is clicked after an On Hold/Drop SKU —
    // only ever set while workspace_status is 'on_hold' or 'rejected'.
    preHoldStatus: null,
    // null until "Proceed to Sample" creates the sample order, then
    // 'in_process' | 'ready' | 'on_hold' | 'dropped'.
    sample_status: null,
    target_ready_date: '',
    actual_ready_date: '',
    buyer_brief: {
      description: 'Natural live-edge wooden serving board with handle',
      color: 'Natural Walnut',
      material: 'Acacia Wood, Leather Cord',
      dimensions: '46 × 18 × 2 cm',
      weight: '0.9',
      finish: 'Natural Oiled',
      quality_notes: 'Select properly dried, defect-free hardwood; maintain precise shape and dimensions; ensure smooth splinter-free sanding.',
      target_price: '14.50',
      currency: 'USD',
      unit_qty: '8',
      buyer_ref: 'BRK-ACACIA-01',
    },
    // Tracks whether the current buyer_brief edits have been confirmed via the
    // "Save Brief" button yet — drives the amber "fields are pre-filled" notice,
    // matching the real Buyer Brief tab's unsaved-state hint.
    briefSaved: false,
    // What was actually persisted last time Save Brief was clicked (starts equal to
    // the pre-filled defaults) — diffed against on every save so only fields the user
    // actually touched get logged, matching the real per-field change log.
    buyerBriefSnapshot: {
      description: 'Natural live-edge wooden serving board with handle',
      color: 'Natural Walnut',
      material: 'Acacia Wood, Leather Cord',
      dimensions: '46 × 18 × 2 cm',
      weight: '0.9',
      finish: 'Natural Oiled',
      quality_notes: 'Select properly dried, defect-free hardwood; maintain precise shape and dimensions; ensure smooth splinter-free sanding.',
      target_price: '14.50',
      currency: 'USD',
      unit_qty: '8',
      buyer_ref: 'BRK-ACACIA-01',
    },
    approved_price: null,
    approved_currency: null,
    approved_qty: null,
    // Set once "Proceed to PO" is confirmed from the sample_shipped stage — unlike
    // approved_qty (locked in at Proceed to Sample, alongside price), this only ever
    // carries a quantity: the PO step re-confirms how many units to produce without
    // reopening price negotiation.
    po_qty: null,
    qa_comments: '',
    additional_notes: '',
    sample_findings: {
      sample_images: [],
      approved_image: null,
      actual_weight: '', actual_l: '', actual_w: '', actual_h: '',
      inner_qty: '', inner_l: '', inner_w: '', inner_h: '',
      master_qty: '', master_l: '', master_w: '', master_h: '',
      master_pack_weight_kg: '', cbm: '',
    },
    shipping: {
      ship_mode: '', // '' | 'air' | 'container'
      courier_company: '',
      tracking_ref: '',
      container_no: '',
      vessel_no: '',
      etd: '',
      eta: '',
    },
    // Stack of prior top-level snapshots, pushed right before every forward stage
    // transition. Undo pops the top entry and restores it.
    history: [],
    // A single chronological feed — chat messages and stage/field-change milestones
    // interleaved, oldest first — mirrors how the real workspace posts system
    // milestones into the same activity thread as buyer/merchant messages. Message
    // entries may carry `attachments: [{ url, name }]` — every url is a data: URL
    // captured from a local file picker, never uploaded anywhere.
    chat: [
      { id: `${Date.now()}_seed`, ts: now, type: 'milestone', label: 'Workspace created', detail: 'Stage: Inactive' },
    ],
    // Separate demo-only thread shown under the "Vendor Activity" tab — mirrors the shape
    // of `chat` above (milestone + message entries), just never mixed into the buyer-facing
    // feed. Starts empty; the vendor "joins the conversation" (see acceptInvite/saveBrief
    // below) only once they've actually accepted their invite, not before.
    vendorChat: [],
    // The only thing "pinned" in this simplified demo is the Buyer Brief reference
    // image — set by pinning an image attached in chat, same as the real Media drawer.
    media: {
      buyerBriefImage: null,
    },
    // Dummy extra invites sent from the Product Info tab — purely decorative, no
    // email is ever sent, they just sit as "Pending" chips like the real InviteRow.
    invites: { buyer: [], vendor: [] },
  }
}

// Merges a saved (possibly older-shaped) state with today's default shape so that
// adding a new field to defaultDemoState() later can never crash an existing user's
// saved localStorage state — every nested object gets its missing keys backfilled.
function withDefaults(parsed) {
  const base = defaultDemoState()
  if (!parsed || typeof parsed !== 'object') return base
  return {
    ...base,
    ...parsed,
    sku:                { ...base.sku, ...parsed.sku },
    buyer_brief:        { ...base.buyer_brief, ...parsed.buyer_brief },
    buyerBriefSnapshot: { ...base.buyerBriefSnapshot, ...parsed.buyerBriefSnapshot },
    sample_findings:    { ...base.sample_findings, ...parsed.sample_findings },
    shipping:           { ...base.shipping, ...parsed.shipping },
    media:              { ...base.media, ...parsed.media },
    invites:            { ...base.invites, ...parsed.invites },
    history:            Array.isArray(parsed.history) ? parsed.history : base.history,
    chat:               Array.isArray(parsed.chat) && parsed.chat.length ? parsed.chat : base.chat,
    vendorChat:         Array.isArray(parsed.vendorChat) && parsed.vendorChat.length ? parsed.vendorChat : base.vendorChat,
  }
}

export function loadDemoState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultDemoState()
    return withDefaults(JSON.parse(raw))
  } catch {
    return defaultDemoState()
  }
}

export function saveDemoState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage unavailable — demo simply won't persist across reloads
  }
}

export function resetDemoState() {
  const fresh = defaultDemoState()
  saveDemoState(fresh)
  return fresh
}

// Milestones and field_change entries mirror into BOTH the Buyer and Vendor activity
// threads — matches the real app, where a merchant's system comments show up in every
// channel (isSystemComment check), not just the one the merchant happened to be viewing.
// Direct typed messages (addChatMessage/addVendorChatMessage below) stay one-way, though —
// those are genuinely per-channel conversation, not a status update everyone should see.
function appendActivity(state, entries) {
  return { ...state, chat: [...state.chat, ...entries], vendorChat: [...state.vendorChat, ...entries] }
}

// A canned reply into ONLY the vendor thread — simulates the vendor actually reading and
// reacting to what just happened, so Vendor Activity feels like a live conversation rather
// than a silent mirror of Buyer Activity's milestones. Never posted before the vendor has
// actually accepted their invite (see acceptInvite/saveBrief below).
function vendorSays(state, body) {
  const msg = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ts: new Date().toISOString(), type: 'message', author: 'Artisan Wood Works', body, attachments: [] }
  return { ...state, vendorChat: [...state.vendorChat, msg] }
}

export function logActivity(state, label, detail) {
  const entry = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ts: new Date().toISOString(), type: 'milestone', label, detail }
  return appendActivity(state, [entry])
}

function fieldChange(body) {
  return { id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ts: new Date().toISOString(), type: 'field_change', author: 'You', body }
}

// Snapshot of everything an undo step should be able to restore.
function snapshotTopLevel(state) {
  return {
    workspace_status: state.workspace_status,
    sample_status: state.sample_status,
    target_ready_date: state.target_ready_date,
    actual_ready_date: state.actual_ready_date,
    approved_price: state.approved_price,
    approved_currency: state.approved_currency,
    approved_qty: state.approved_qty,
    po_qty: state.po_qty,
    qa_comments: state.qa_comments,
    additional_notes: state.additional_notes,
    sample_findings: state.sample_findings,
    shipping: state.shipping,
  }
}

export function pushHistory(state) {
  return { ...state, history: [...state.history, snapshotTopLevel(state)] }
}

export function addChatMessage(state, body, attachments = []) {
  const trimmed = (body || '').trim()
  if (!trimmed && attachments.length === 0) return state
  const msg = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ts: new Date().toISOString(),
    type: 'message',
    author: 'You',
    body: trimmed,
    attachments,
  }
  return { ...state, chat: [...state.chat, msg] }
}

export function addVendorChatMessage(state, body, attachments = []) {
  const trimmed = (body || '').trim()
  if (!trimmed && attachments.length === 0) return state
  const msg = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ts: new Date().toISOString(),
    type: 'message',
    author: 'You',
    body: trimmed,
    attachments,
  }
  return { ...state, vendorChat: [...state.vendorChat, msg] }
}

const BRIEF_FIELD_LABELS = {
  buyer_ref: 'buyer reference', description: 'description', color: 'colour', material: 'material',
  dimensions: 'dimensions', weight: 'weight', finish: 'finish', quality_notes: 'quality notes',
  target_price: 'target price', currency: 'currency', unit_qty: 'unit qty',
}

// Diffs buyer_brief against what was last saved and logs one field_change entry per
// field the user actually touched — matching the real app's "Loke set X to Y" log —
// instead of one generic "brief saved" line no matter which fields changed.
export function saveBrief(state) {
  const prev = state.buyerBriefSnapshot || {}
  const changed = Object.entries(state.buyer_brief).filter(([k, v]) => (prev[k] ?? '') !== (v ?? ''))
  const entries = changed.length
    ? changed.map(([k, v]) => fieldChange(`set ${BRIEF_FIELD_LABELS[k] || k} to "${v || '—'}"`))
    : [fieldChange('saved the buyer brief — no changes')]
  let next = appendActivity({ ...state, briefSaved: true, buyerBriefSnapshot: { ...state.buyer_brief } }, entries)
  // Vendor "reads" the updated brief and chimes in — only once they've actually joined
  // the workspace, and only for a real edit (not the no-op "no changes" save).
  const vendorJoined = state.invites.vendor.some(i => i.status === 'accepted')
  if (vendorJoined && changed.length) {
    next = vendorSays(next, 'Thanks for the update — noted, adjusting on our end to match.')
  }
  return next
}

// Pins a chat-attached image as the Buyer Brief reference image — the only pin
// action this demo supports, matching the "pin from Media to Buyer Brief" flow.
export function pinToBuyerBrief(state, url) {
  const pinned = { ...state, media: { ...state.media, buyerBriefImage: url } }
  return logActivity(pinned, 'Buyer Brief Image Set', 'Pinned from chat')
}

// Merchant confirms the "Proceed to Sample" modal — this is a single combined step
// (matching the real handleConfirmApprove): the workspace moves to Approved AND the
// sample order is created together, with the qty/price locked in as confirmed on the
// sample order. workspace_status only becomes 'sample' once the buyer accepts below,
// which is also when the Shipping tab first appears.
export function confirmProceedToSample(state, qty, price) {
  const withHistory = pushHistory(state)
  const approved = {
    ...withHistory,
    workspace_status: 'approved',
    approved_price: price,
    approved_currency: state.buyer_brief.currency,
    approved_qty: qty,
    sample_status: 'in_process',
  }
  const withApproveLog = logActivity(approved, 'Approved to Sample', `Price ${state.buyer_brief.currency} ${price} · Qty ${qty}`)
  return logActivity(withApproveLog, 'Sample order created', 'Stage: In Development')
}

// The frontend handler itself is silent, but the real backend's PATCH endpoint logs a
// field_change for target_ready_date on every save (it's in the generic `logFields` list
// in routes/plm.js) — so this still needs its own entry here to match what actually shows
// up in the activity feed.
export function setTargetReadyDate(state, val) {
  const trimmed = val || ''
  if (trimmed === (state.target_ready_date || '')) return state
  return appendActivity({ ...state, target_ready_date: trimmed }, [fieldChange(`set target ready date to "${trimmed || '—'}"`)])
}

const SAMPLE_STATUS_LABEL = { in_process: 'In Development', ready: 'Ready', on_hold: 'On Hold', dropped: 'Dropped' }

export function setSampleStatus(state, newStatus) {
  if (state.sample_status === newStatus) return state
  if (newStatus === 'ready' && !state.target_ready_date) return state
  const update = { sample_status: newStatus }
  // Stamp the actual ready date the moment the sample is marked Ready, so the
  // Shipping tab has a real "when did this actually get ready" timestamp instead
  // of relying on the merchant to fill it in separately.
  if (newStatus === 'ready' && !state.actual_ready_date) {
    update.actual_ready_date = new Date().toISOString().slice(0, 10)
  }
  return logActivity({ ...state, ...update }, `Sample Marked ${SAMPLE_STATUS_LABEL[newStatus]}`)
}

export function addSampleImages(state, urls) {
  if (!urls?.length) return state
  const withImages = {
    ...state,
    sample_findings: { ...state.sample_findings, sample_images: [...state.sample_findings.sample_images, ...urls] },
  }
  return logActivity(withImages, 'Sample Images Updated')
}

// Ticking a Spec/Chat photo in the Media panel adds (or removes) it from the sample's
// working set of photos — this is how sample_images gets its first entries in the real
// app too, via the "Add as sample image" tick on reference/chat media, not the Sample
// tab's own upload box (which only appears once there's already at least one photo).
export function toggleSampleImage(state, url) {
  const isMember = state.sample_findings.sample_images.includes(url)
  const images = isMember
    ? state.sample_findings.sample_images.filter(u => u !== url)
    : [...state.sample_findings.sample_images, url]
  // Unsetting the approved/production image if it's the one being removed.
  const approved_image = (isMember && state.sample_findings.approved_image === url) ? null : state.sample_findings.approved_image
  const next = { ...state, sample_findings: { ...state.sample_findings, sample_images: images, approved_image } }
  return logActivity(next, isMember ? 'Removed from Current Sample' : 'Added to Current Sample')
}

// Ticking a thumbnail toggles it as the main/"production" sample image — tapping an
// already-approved one unsets it, matching the real Media-panel tick behaviour.
export function toggleApprovedImage(state, url) {
  const isApproved = state.sample_findings.approved_image === url
  const next = {
    ...state,
    sample_findings: { ...state.sample_findings, approved_image: isApproved ? null : url },
  }
  return logActivity(next, isApproved ? 'Production Image Unset' : 'Production Image Set')
}

export function saveQaComments(state, val) {
  const trimmed = (val || '').trim()
  if (trimmed === (state.qa_comments || '').trim()) return state
  return appendActivity({ ...state, qa_comments: trimmed }, [fieldChange(`set QA comments to "${trimmed || '—'}"`)])
}

// Additional Notes is a shared note field (not part of findings) — visible whenever the
// sample isn't marked Ready yet, independent of whether findings data exists, matching
// the real Sample tab.
export function saveAdditionalNotes(state, val) {
  const trimmed = (val || '').trim()
  if (trimmed === (state.additional_notes || '').trim()) return state
  return appendActivity({ ...state, additional_notes: trimmed }, [fieldChange(`set additional notes to "${trimmed || '—'}"`)])
}

const FINDING_SINGLE_LABELS = {
  actual_weight: 'actual weight', inner_qty: 'inner qty', master_qty: 'master qty',
  master_pack_weight_kg: 'master weight', cbm: 'CBM',
}

// L×W×H triplets are edited/shown as one row each in the UI, so they're collapsed into
// a single "set Actual L×W×H to 1 × 1 × 1" line instead of three separate ones — matches
// the real backend's routes/plm.js PATCH /sku-sample-orders/:id (SINGLE_FIELDS vs
// DIM_GROUPS), which logs 8 lines per save (5 singles + 3 dimension rows), not 13.
const FINDING_DIM_GROUPS = [
  { prefix: 'actual', label: 'Actual L×W×H' },
  { prefix: 'inner',  label: 'Inner L×W×H' },
  { prefix: 'master', label: 'Master L×W×H' },
]

export function saveFindings(state, patch) {
  const prev = state.sample_findings
  const entries = []

  for (const [field, label] of Object.entries(FINDING_SINGLE_LABELS)) {
    if (!(field in patch)) continue
    const oldVal = prev[field] || ''
    const newVal = patch[field] || ''
    if (oldVal !== newVal) entries.push(fieldChange(`set ${label} to "${newVal || '—'}"`))
  }

  for (const { prefix, label } of FINDING_DIM_GROUPS) {
    const keys = [`${prefix}_l`, `${prefix}_w`, `${prefix}_h`]
    if (!keys.some(k => k in patch)) continue
    const oldVals = keys.map(k => prev[k] || '')
    const newVals = keys.map(k => patch[k] || '')
    if (oldVals.every((v, i) => v === newVals[i])) continue
    const fmt = vals => vals.some(v => v !== '') ? vals.map(v => v || '—').join(' × ') : '—'
    entries.push(fieldChange(`set ${label} to "${fmt(newVals)}"`))
  }

  if (!entries.length) return state
  return appendActivity({ ...state, sample_findings: { ...prev, ...patch } }, entries)
}

// Buyer accepts the sample — this is the moment workspace_status becomes 'sample'
// and the Shipping tab appears, matching the real acceptSample store action.
export function acceptSample(state) {
  const withHistory = pushHistory(state)
  return logActivity({ ...withHistory, workspace_status: 'sample' }, 'Sample Accepted', 'Ready for shipping details')
}

// Buyer sends the brief back for another round — sample_status drops back to
// in_process so the merchant can re-upload/re-fill findings.
export function reopenBrief(state, note) {
  const reopened = { ...state, sample_status: 'in_process' }
  return logActivity(reopened, 'Brief Reopened', note || undefined)
}

const SHIP_FIELD_LABELS = {
  ship_mode: 'ship mode', courier_company: 'courier company', tracking_ref: 'tracking ref',
  container_no: 'container no', vessel_no: 'vessel no',
  etd: 'ETD', eta: 'ETA',
}

// Diffs + saves shipping fields, then fires the "Shipping Details Filled" milestone
// the moment every field for the currently-chosen mode is present — mirrors the
// backend's PATCH /sku-sample-orders/:id logic in routes/plm.js.
export function saveShipping(state, patch) {
  const prevShipping = state.shipping
  const merged = { ...prevShipping, ...patch }
  const changed = Object.entries(patch).filter(([k, v]) => (prevShipping[k] || '') !== (v || ''))
  if (!changed.length) return state
  const entries = changed.map(([k, v]) => fieldChange(`set ${SHIP_FIELD_LABELS[k] || k} to "${v || '—'}"`))
  let next = appendActivity({ ...state, shipping: merged }, entries)

  const fields = SHIP_MODE_FIELDS[merged.ship_mode]
  if (fields) {
    const isCompleteNow = fields.every(f => !!merged[f])
    const wasCompleteBefore = prevShipping.ship_mode === merged.ship_mode && fields.every(f => !!prevShipping[f])
    if (isCompleteNow && !wasCompleteBefore) {
      next = logActivity(next, 'Shipping Details Filled', merged.ship_mode === 'air' ? 'Air' : 'Ship')
      // Mirrors the real backend: workspace moves out of 'sample' into 'sample_shipped'
      // the moment shipping details are first complete — only from 'sample' so this never
      // clobbers a paused (on_hold/rejected) or already-further-along workspace. Snapshots
      // from the PRE-merge `state` (not `next`, which already has the just-filled shipping
      // fields) so Undo restores the shipping fields/mode back to how they were before this
      // save too, not just the workspace_status — otherwise Undo "succeeds" on status alone
      // but leaves every filled field and the Air/Ship toggle exactly as they were.
      if (next.workspace_status === 'sample') {
        next = { ...next, workspace_status: 'sample_shipped', history: [...state.history, snapshotTopLevel(state)] }
      }
    }
  }
  return next
}

// Merchant confirms the "Proceed to PO" modal, once the sample has shipped — quantity
// only, unlike Proceed to Sample, since price was already locked in back then and
// isn't renegotiated at the PO step.
export function confirmProceedToPO(state, qty) {
  const withHistory = pushHistory(state)
  const next = { ...withHistory, workspace_status: 'production', po_qty: qty }
  return logActivity(next, 'Approved to PO', `Qty ${qty}`)
}

export function holdWorkspace(state, note) {
  const held = { ...state, preHoldStatus: state.workspace_status, workspace_status: 'on_hold' }
  return logActivity(held, 'Workspace On Hold', note || undefined)
}

export function dropWorkspace(state, note) {
  const dropped = { ...state, preHoldStatus: state.workspace_status, workspace_status: 'rejected' }
  return logActivity(dropped, 'SKU Dropped', note || undefined)
}

export function continueWorkspace(state) {
  const restored = { ...state, workspace_status: state.preHoldStatus || 'active', preHoldStatus: null }
  return logActivity(restored, 'Workspace Resumed', `Back to ${restored.workspace_status.replace(/_/g, ' ')}`)
}

const ROLE_LABEL = { buyer: 'Buyer', vendor: 'Vendor' }

// Adds a dummy pending invite chip under the Buyer/Vendor row — never sends anything,
// just mirrors the real InviteRow's "+ Invite Buyer/Vendor" flow locally. Inviting the
// buyer while the workspace is still 'inactive' moves it to 'invited', matching the
// real system's pre-onboarding statuses.
export function addInvite(state, role, email) {
  const trimmed = (email || '').trim()
  if (!trimmed) return state
  const invite = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, email: trimmed, status: 'pending' }
  let next = { ...state, invites: { ...state.invites, [role]: [...state.invites[role], invite] } }
  if (role === 'buyer' && next.workspace_status === 'inactive') {
    next = { ...next, workspace_status: 'invited' }
  }
  return logActivity(next, `${ROLE_LABEL[role]} Invited`, trimmed)
}

// Simulates the invited party clicking accept — flips their chip to "Accepted" and,
// for the buyer, moves the workspace from 'invited' to 'active' so the brief unlocks.
export function acceptInvite(state, role, id) {
  const invite = state.invites[role].find(i => i.id === id)
  if (!invite || invite.status === 'accepted') return state
  const updatedInvites = { ...state.invites, [role]: state.invites[role].map(i => i.id === id ? { ...i, status: 'accepted' } : i) }
  let next = { ...state, invites: updatedInvites }
  if (role === 'buyer' && next.workspace_status === 'invited') {
    next = { ...next, workspace_status: 'active' }
  }
  next = logActivity(next, `${ROLE_LABEL[role]} Accepted Invite`, invite.email)
  // Vendor opens with a first reaction to the brief already sitting there, and gets a
  // quick reply — kicks off the Vendor Activity thread the moment they've actually
  // joined, rather than showing a canned exchange that predates them accepting anything.
  if (role === 'vendor') {
    next = vendorSays(next, 'Thanks for sharing the brief — acacia and leather cord both in stock, we can start on this shape right away.')
    next = { ...next, vendorChat: [...next.vendorChat, { id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ts: new Date().toISOString(), type: 'message', author: 'You', body: 'Great — please keep the live edge natural, no filler on the grain gaps.', attachments: [] }] }
  }
  return next
}

export function revokeInvite(state, role, id) {
  const invite = state.invites[role].find(i => i.id === id)
  const remaining = state.invites[role].filter(i => i.id !== id)
  let next = { ...state, invites: { ...state.invites, [role]: remaining } }
  // No buyer invites left while still waiting on acceptance — drop back to Inactive.
  if (role === 'buyer' && next.workspace_status === 'invited' && remaining.length === 0) {
    next = { ...next, workspace_status: 'inactive' }
  }
  return logActivity(next, `${ROLE_LABEL[role]} Invite Revoked`, invite?.email)
}

export function undoStage(state) {
  if (state.history.length === 0) return state
  const prev = state.history[state.history.length - 1]
  const restored = {
    ...state,
    ...prev,
    history: state.history.slice(0, -1),
  }
  return logActivity(restored, 'Undo', `Reverted to stage: ${prev.workspace_status}`)
}
