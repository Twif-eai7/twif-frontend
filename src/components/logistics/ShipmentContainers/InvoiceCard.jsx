import { useState, useRef } from 'react'
import { publicUrl, fmt$, fmtQty } from '../../orderManagement/poUtils'
import { supabase } from '../../../lib/supabase'
import { useMemberId } from '../../../stores/profileStore'
import { useShipmentContainerActions } from '../../../hooks/useShipmentContainerActions'
import { useShipmentRecording } from '../../../hooks/useShipmentRecording'
import InvoiceDetailsModal from './InvoiceDetailsModal'
import ConfirmModal from '../../ui/ConfirmModal'

const BL_BUCKET = 'shipment-bls'

function darkenColor(hex, percent) {
  let color = hex.startsWith('#') ? hex.slice(1) : hex
  if (color.length === 3) color = color.split('').map(c => c + c).join('')
  const num = parseInt(color.slice(0, 6), 16)
  let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff
  r = Math.max(0, Math.min(255, Math.floor(r * (1 - percent))))
  g = Math.max(0, Math.min(255, Math.floor(g * (1 - percent))))
  b = Math.max(0, Math.min(255, Math.floor(b * (1 - percent))))
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()
}

const FOLDER_COLOR = '#5227FF' // original color from the shared reference component

// Same folder silhouette + hover-peek as the reference Folder component
// (flap skews open on hover, papers nudge up underneath it) — kept as-is
// since that's the part that reads as polished, not gimmicky, and it's
// purely decorative (pointer-events-none) so it never competes for clicks.
// Clicking the folder opens a plain, non-overlapping list of real document
// links below it — the reference's stacked/rotated papers looked nice but
// overlapped enough that only the topmost one was ever actually clickable;
// a real list has no such trap and only docs that actually exist are shown.
function DocFolder({ docs, uploadSlot, uploadInputRef }) {
  const [open, setOpen] = useState(false)
  if (docs.length === 0 && !uploadSlot) return null

  const folderBack = darkenColor(FOLDER_COLOR, 0.08)
  const paperShades = [darkenColor('#ffffff', 0.1), darkenColor('#ffffff', 0.05), '#ffffff']
  const summary = docs.length > 0
    ? `${docs.length} document${docs.length > 1 ? 's' : ''}`
    : 'Upload a document'

  return (
    <div className="relative flex-shrink-0">
      <div
        className={`group relative transition-transform duration-200 ease-in cursor-pointer ${!open ? 'hover:-translate-y-1' : ''}`}
        style={{ width: 24, height: 24, transform: open ? 'translateY(-3px)' : undefined }}
        onClick={() => setOpen(o => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) } }}
        aria-expanded={open}
        aria-label={open ? 'Hide documents' : `Show ${summary}`}
        title={open ? 'Hide documents' : summary}
      >
        <div className="relative w-full h-full" style={{ backgroundColor: folderBack, borderRadius: '2px 5px 5px 5px' }}>
          <span className="absolute z-0 bottom-full left-0 w-2 h-[3px]" style={{ backgroundColor: folderBack, borderRadius: '2px 2px 0 0' }} />
          {docs.map((doc, i) => (
            <div
              key={doc.label}
              className={`absolute z-20 bottom-[10%] left-1/2 pointer-events-none transition-all duration-300 ease-in-out shadow-sm
                -translate-x-1/2 ${open ? '' : 'translate-y-[10%] group-hover:translate-y-0'}`}
              style={{
                width: i === 0 ? '70%' : i === 1 ? '80%' : '90%',
                height: open ? '30%' : (i === 0 ? '80%' : i === 1 ? '70%' : '60%'),
                backgroundColor: paperShades[i] ?? '#fff',
                borderRadius: '3px',
              }}
            />
          ))}
          <div
            className={`absolute z-30 w-full h-full origin-bottom transition-all duration-300 ease-in-out
              ${!open ? 'group-hover:[transform:skew(15deg)_scaleY(0.6)]' : ''}`}
            style={{ backgroundColor: FOLDER_COLOR, borderRadius: '2px 5px 5px 5px', ...(open && { transform: 'skew(15deg) scaleY(0.6)' }) }}
          />
          <div
            className={`absolute z-30 w-full h-full origin-bottom transition-all duration-300 ease-in-out
              ${!open ? 'group-hover:[transform:skew(-15deg)_scaleY(0.6)]' : ''}`}
            style={{ backgroundColor: FOLDER_COLOR, borderRadius: '2px 5px 5px 5px', ...(open && { transform: 'skew(-15deg) scaleY(0.6)' }) }}
          />
        </div>
      </div>

      {open && (
        <div className="absolute z-40 top-full right-0 mt-1.5 w-28 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden py-0.5">
          {docs.map(doc => (
            <a key={doc.label} href={doc.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0 text-gray-400">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="truncate">{doc.label}</span>
            </a>
          ))}
          {uploadSlot && (
            <>
              <input ref={uploadInputRef} type="file" accept={uploadSlot.accept} className="hidden"
                onChange={e => { if (e.target.files[0]) uploadSlot.onUpload(e.target.files[0]) }} />
              <button type="button" onClick={() => uploadInputRef.current.click()} disabled={uploadSlot.uploading}
                className={`flex items-center gap-1 w-full px-2 py-1.5 text-[10px] font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 cursor-pointer disabled:cursor-default transition-colors text-left
                  ${docs.length > 0 ? 'border-t border-gray-100' : ''}`}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0 text-gray-400">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span className="truncate">{uploadSlot.uploading ? 'Uploading…' : uploadSlot.label}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Shared visual primitives ──────────────────────────────────────────────────
const STATUS_STYLE = {
  open:      { strip: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-800' },
  shipped:   { strip: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800' },
  cancelled: { strip: 'bg-red-400',     badge: 'bg-red-100 text-red-700' },
  confirmed: { strip: 'bg-blue-400',    badge: 'bg-blue-100 text-blue-800' },
}
function statusStyle(s) {
  return STATUS_STYLE[s?.toLowerCase()] ?? { strip: 'bg-gray-300', badge: 'bg-gray-100 text-gray-600' }
}
function ShipProgress({ ordered, shipped }) {
  if (!ordered) return null
  const pct = Math.min(100, Math.round(((shipped ?? 0) / ordered) * 100))
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-800 whitespace-nowrap flex-shrink-0">{pct}% shipped</span>
    </div>
  )
}

// Compact 2-row wizard entry — status strip + SKU + progress on row 1,
// balance + labeled qty input on row 2. No 3-col grid: this is entry mode,
// not a dashboard view.
function WizardLineItem({ li, qty, onChange }) {
  const { strip, badge } = statusStyle(li.status)
  const ordered  = li.quantity_ordered ?? 0
  const shipped  = li.shipped_quantity ?? 0
  const balance  = li.balance_quantity ?? 0
  const pct      = ordered ? Math.min(100, Math.round((shipped / ordered) * 100)) : 0

  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
      <div className={`w-1 flex-shrink-0 ${strip}`} />
      <div className="flex-1 px-3 py-2 space-y-1.5">

        {/* Row 1: SKU · variant · badge · progress */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-900 truncate">{li.buyer_sku_ref || '—'}</span>
          {li.sku_variant && <span className="text-[11px] text-gray-600 truncate">{li.sku_variant}</span>}
          <span className={`inline-block px-1.5 py-px rounded-full text-[9px] font-semibold whitespace-nowrap flex-shrink-0 ${badge}`}>
            {li.status || '—'}
          </span>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <div className="flex-1 h-1 bg-gray-300 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-gray-900 whitespace-nowrap flex-shrink-0">{pct}%</span>
          </div>
        </div>

        {/* Row 2: balance info + qty input */}
        {(() => {
          const qtyNum = Number(qty)
          const isOver = qty !== '' && qtyNum > balance
          const isNeg  = qty !== '' && qtyNum < 0
          const hasErr = isOver || isNeg
          return (
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-900 flex-shrink-0">
                  Balance: <span className="font-semibold text-gray-700">{fmtQty(balance)}</span>
                </span>
                <input
                  type="number"
                  min="1"
                  max={balance}
                  value={qty}
                  onChange={e => onChange(e.target.value)}
                  placeholder="Enter Qty to ship"
                  className={`flex-1 min-w-0 px-2.5 py-1 text-xs border rounded-lg focus:outline-none placeholder:text-gray-400 transition-colors
                    ${hasErr ? 'border-red-400 focus:border-red-500 bg-red-50' : 'border-gray-200 focus:border-gray-900'}`}
                />
              </div>
              {hasErr && (
                <p className="text-[10px] text-red-500 pl-0.5">
                  {isNeg ? 'Quantity cannot be negative' : `Cannot exceed balance of ${fmtQty(balance)}`}
                </p>
              )}
            </div>
          )
        })()}

      </div>
    </div>
  )
}

// Compact drag-drop zone for the BL step
function BlDropzone({ file, onFile }) {
  const ref = useRef(null)
  const [drag, setDrag] = useState(false)
  return (
    <>
      <input ref={ref} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
        className="hidden" onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]) }} />
      {file ? (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-xs text-gray-700">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-gray-500">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="flex-1 truncate">{file.name}</span>
          <button type="button" onClick={() => onFile(null)} className="text-gray-400 hover:text-red-400 flex-shrink-0 cursor-pointer">×</button>
        </div>
      ) : (
        <div
          onClick={() => ref.current.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
          className={`flex flex-col items-center gap-1.5 py-5 border-2 border-dashed rounded-xl cursor-pointer text-center transition-colors
            ${drag ? 'border-gray-500 bg-gray-50 text-gray-700' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-gray-500">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span className="text-xs font-medium">Drop or click to upload Bill of Lading</span>
          <span className="text-[10px] text-gray-500">PDF, DOC, image</span>
        </div>
      )}
    </>
  )
}

export default function InvoiceCard({ invoice, canManage, buyerOrgId, onShipmentRecorded, onInvoiceUpdated, onInvoiceDeleted, onPoRemoved }) {
  const memberId = useMemberId()
  const { updateInvoice, reverseShipmentLeg, editShipmentLeg } = useShipmentContainerActions()
  const pos = invoice.pos ?? []

  // Uploaded docs (BL doc, commercial invoice, packing list) — only the
  // ones that actually exist, fed into DocFolder below.
  const folderDocs = [
    invoice.bl_file_path && { label: 'BL Doc', url: publicUrl(`${BL_BUCKET}::${invoice.bl_file_path}`) },
    invoice.invoice_file_path && { label: 'Invoice', url: publicUrl(`${BL_BUCKET}::${invoice.invoice_file_path}`) },
    invoice.packing_list_file_path && { label: 'Packing List', url: publicUrl(`${BL_BUCKET}::${invoice.packing_list_file_path}`) },
  ].filter(Boolean)

  // ── Edit / remove-from-container state ────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false)
  const [showRemoveModal, setShowRemoveModal] = useState(false)
  const [removingInvoice, setRemovingInvoice] = useState(false)

  // Reversed legs are soft-deleted, never removed — collapsed behind a
  // per-line-item toggle by default so a few corrections don't bury the
  // active legs under a growing pile of strikethrough history.
  const [expandedReversals, setExpandedReversals] = useState({})
  const toggleReversals = (liId) => setExpandedReversals(prev => ({ ...prev, [liId]: !prev[liId] }))

  // Gate: can only remove from the container if neither a shipment leg nor a
  // BL number has been recorded against this invoice yet. Checked
  // separately (not just hasLegs) as a defensive measure — bl_number is
  // only ever set alongside legs through the current recording wizard, but
  // legacy/ERP-synced data could have one without the other.
  const hasLegs = Object.values(invoice.legsByLineItem ?? {}).some(q => q > 0)
  const canRemoveFromContainer = !hasLegs && !invoice.bl_number

  // Unbooks the invoice from this container — the invoice itself, its BL,
  // and its composition are untouched, so it just goes back to the "raised,
  // unbooked" list and can be attached elsewhere (or back here) later. This
  // used to be a full soft-delete of the invoice, which was wrong: it made
  // the invoice vanish everywhere, not just leave this container.
  const handleRemoveInvoice = async () => {
    setRemovingInvoice(true)
    try {
      await updateInvoice(invoice.id, { container_id: null })
      setShowRemoveModal(false)
      onInvoiceDeleted?.()
    } catch (err) {
      console.error('[InvoiceCard] remove error:', err?.message)
    } finally {
      setRemovingInvoice(false)
    }
  }

  // ── Reverse a mistaken leg entry — soft-delete, DB rollup recomputes
  // balances/status and auto-reopens the PO if this drops it below
  // fully-shipped. A reason is mandatory (enforced server-side too) — this
  // undoes a rollup and can silently reopen a "closed" PO, so it shouldn't
  // be a single unexplained click.
  const [reverseTargetLegId, setReverseTargetLegId] = useState(null)
  const [reverseReason, setReverseReason] = useState('')
  const [reversingLegId, setReversingLegId] = useState(null)
  const [reverseError, setReverseError] = useState(null)

  const openReverseModal = (legId) => {
    setReverseTargetLegId(legId)
    setReverseReason('')
    setReverseError(null)
  }

  const handleReverseLeg = async () => {
    const legId = reverseTargetLegId
    setReversingLegId(legId)
    setReverseError(null)
    try {
      await reverseShipmentLeg(legId, reverseReason)
      setReverseTargetLegId(null)
      onShipmentRecorded?.()
    } catch (err) {
      setReverseError(err.message || 'Failed to reverse leg')
    } finally {
      setReversingLegId(null)
    }
  }

  // ── Edit a mistaken quantity in place — the common "right leg, wrong
  // number" correction. Unlike reverse, this is one atomic action: there's
  // no window where the leg is reversed and nothing has been re-recorded in
  // its place. Reason mandatory here too (enforced server-side).
  const [editTargetLeg, setEditTargetLeg] = useState(null)
  const [editQuantity, setEditQuantity] = useState('')
  const [editReason, setEditReason] = useState('')
  const [editingLegId, setEditingLegId] = useState(null)
  const [editError, setEditError] = useState(null)

  const openEditModal = (leg) => {
    setEditTargetLeg(leg)
    setEditQuantity(String(leg.shipped_quantity ?? ''))
    setEditReason('')
    setEditError(null)
  }

  const handleEditLeg = async () => {
    const legId = editTargetLeg.id
    setEditingLegId(legId)
    setEditError(null)
    try {
      await editShipmentLeg(legId, Number(editQuantity), editReason)
      setEditTargetLeg(null)
      onShipmentRecorded?.()
    } catch (err) {
      setEditError(err.message || 'Failed to edit leg')
    } finally {
      setEditingLegId(null)
    }
  }

  // ── Recording wizard — all state and logic in dedicated hook ─────────────
  const {
    recording, startRecording, cancelRecording,
    step, setStep,
    legs, setLeg,
    blNumber, setBlNumber,
    cartons, setCartons,
    isBlStep, currentPo, existingBl,
    submitting, error,
    handleSubmit,
    totalLegsEntered, hasBalanceError, poHasLegs, canSubmit,
  } = useShipmentRecording(invoice, pos, onShipmentRecorded)

  // Filter for the current step's line-item list — resets whenever the
  // active PO changes so a stale filter from the last PO doesn't make the
  // new one's list look empty. Adjusted during render (React's recommended
  // pattern for this) rather than an effect, which would cause an extra
  // render with the stale filter still applied for one frame.
  const [lineItemSearch, setLineItemSearch] = useState('')
  const [searchedPoId, setSearchedPoId] = useState(currentPo?.id)
  if (currentPo?.id !== searchedPoId) {
    setSearchedPoId(currentPo?.id)
    setLineItemSearch('')
  }

  // ── Separate BL file upload (independent of recording) ────────────────────
  const [uploadingBlFile, setUploadingBlFile] = useState(false)
  const blFileRef = useRef(null)

  const handleBlFileUpload = async (file) => {
    if (!file) return
    setUploadingBlFile(true)
    try {
      const { uploadToShipmentBucket } = await import('../../../lib/shipmentStorage')
      const path = await uploadToShipmentBucket(file, `${invoice.container_id}/${invoice.id}`)
      const { error: err } = await supabase
        .from('shipment_invoices')
        .update({ bl_file_path: path, bl_uploaded_at: new Date().toISOString(), bl_uploaded_by: memberId })
        .eq('id', invoice.id)
      if (err) throw err
      onShipmentRecorded?.()
    } catch (e) { console.error('[InvoiceCard] BL file upload error:', e?.message) }
    finally { setUploadingBlFile(false) }
  }

  // Which PO pill is expanded (shows its line items inline below the pills row)
  const [expandedPoId, setExpandedPoId] = useState(null)
  const togglePoPill = (poId) => setExpandedPoId(prev => prev === poId ? null : poId)

  // Search for the expanded PO's line-item list — same reasoning/pattern as
  // the wizard's search box, adjusted during render rather than an effect
  // so switching POs doesn't leave a stale filter behind.
  const [poLineItemSearch, setPoLineItemSearch] = useState('')
  const [searchedExpandedPoId, setSearchedExpandedPoId] = useState(expandedPoId)
  if (expandedPoId !== searchedExpandedPoId) {
    setSearchedExpandedPoId(expandedPoId)
    setPoLineItemSearch('')
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl bg-white shadow-sm"
      style={{ border: `1px solid ${FOLDER_COLOR}33`, borderLeft: `3px solid ${FOLDER_COLOR}` }}>
      {/* Header — always visible, toggle collapses non-recording expanded view.
          Top accent (not left) — left is already "selected" in the
          container/invoice-group sidebars on this same screen, a top stripe
          reads as "card type" instead of colliding with that. Same color as
          the doc folder, so the two blue/violet accents in this card agree. */}
      <div className="px-4 py-3 space-y-2.5">
        {/* Row 1: identity (vendor name is the card's title — everything
            that's actually data, incl. invoice # and date, moved into the
            labeled facts row below) + folder/edit/remove actions. */}
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-bold text-gray-900 truncate min-w-0">{invoice.primary_vendor_name || '—'}</span>
          {!recording && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <DocFolder
                docs={folderDocs}
                uploadInputRef={blFileRef}
                uploadSlot={invoice.bl_number && !invoice.bl_file_path && canManage ? {
                  label: 'Upload BL Doc',
                  accept: '.pdf,.doc,.docx,.xls,.xlsx,image/*',
                  uploading: uploadingBlFile,
                  onUpload: handleBlFileUpload,
                } : null}
              />
              {canManage && (
                <>
                  <button type="button" onClick={() => setShowEditModal(true)}
                    className="w-6 h-6 flex items-center justify-center cursor-pointer rounded hover:bg-gray-100 text-gray-600 hover:text-black transition-colors" title="Edit invoice">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  {/* Remove only shown when no legs and no BL number recorded */}
                  {canRemoveFromContainer && (
                    <button type="button" onClick={() => setShowRemoveModal(true)}
                      className="w-6 h-6 flex items-center justify-center cursor-pointer rounded hover:bg-amber-50 text-gray-600 hover:text-amber-600 transition-colors" title="Remove from container">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Row 2: labeled facts. Invoice # and date live here now instead of
            unlabeled inline text in the title row — this app and its
            workflow are new to most users, so every field should say what
            it is rather than assuming it's obvious from position alone. */}
        <div className="flex items-start gap-4 flex-wrap">
          {invoice.invoice_number && (
            <div>
              <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Invoice</div>
              <div className="text-[11px] font-semibold text-gray-800">{invoice.invoice_number}</div>
            </div>
          )}
          {invoice.invoice_date && (
            <div>
              <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Date</div>
              <div className="text-[11px] font-semibold text-gray-800">{invoice.invoice_date}</div>
            </div>
          )}
          {invoice.invoice_value != null && (
            <div>
              <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Value</div>
              <div className="text-[11px] font-semibold text-gray-800">{fmt$(invoice.invoice_value)}</div>
            </div>
          )}
          {invoice.cbm != null && (
            <div>
              <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">CBM</div>
              <div className="text-[11px] font-semibold text-gray-800">{invoice.cbm}</div>
            </div>
          )}
          {invoice.payment_status && (
            <div>
              <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Status</div>
              <div className="text-[11px] font-semibold text-gray-800">{invoice.payment_status}</div>
            </div>
          )}
          {invoice.payment_term && (
            <div>
              <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Term</div>
              <div className="text-[11px] font-semibold text-gray-800">{invoice.payment_term}</div>
            </div>
          )}
          {/* BL # folded in as a plain labeled fact like the others — it used
              to be a standalone pill on its own line, which read as a
              different kind of thing instead of just another field. */}
          {!recording && invoice.bl_number && (
            <div>
              <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">BL No.</div>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="flex-shrink-0">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {invoice.bl_number}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Remove-from-container confirmation modal */}
      <ConfirmModal
        open={showRemoveModal}
        title="Remove from container?"
        message={`This will unbook invoice ${invoice.invoice_number || ''} from this container. The invoice itself, its BL, and its PO composition are unaffected — it goes back to the raised, unbooked list and can be attached elsewhere (or back here) later.`}
        onConfirm={handleRemoveInvoice}
        onClose={() => setShowRemoveModal(false)}
        loading={removingInvoice}
      />

      {/* Reverse-leg confirmation — reason mandatory, this undoes a rollup
          and can silently reopen a "closed" PO. For a genuinely invalid
          entry (wrong line item/invoice) — use Edit below for a wrong
          quantity on an otherwise-correct leg. */}
      <ConfirmModal
        open={!!reverseTargetLegId}
        title="Reverse this shipment leg?"
        message="This soft-deletes the leg and recomputes the line item's shipped/balance — if it drops the PO below fully-shipped, the PO reopens automatically."
        warning={reverseError}
        confirmLabel="Reverse"
        loadingLabel="Reversing…"
        reason={reverseReason}
        onReasonChange={setReverseReason}
        reasonLabel="Reason for reversal"
        reasonPlaceholder="e.g. this leg shouldn't have been recorded at all"
        onConfirm={handleReverseLeg}
        onClose={() => setReverseTargetLegId(null)}
        loading={reversingLegId === reverseTargetLegId}
      />

      {/* Edit-leg confirmation — the common "right leg, wrong number" fix.
          One atomic action, so there's no window where the quantity is
          missing/reversed with nothing recorded in its place. */}
      <ConfirmModal
        open={!!editTargetLeg}
        title="Edit shipped quantity?"
        message="This corrects the quantity in place — the over-ship guard and balance/status rollup both re-run automatically, same as for a new entry."
        warning={editError}
        tone="neutral"
        confirmLabel="Save"
        loadingLabel="Saving…"
        quantity={editQuantity}
        onQuantityChange={setEditQuantity}
        quantityLabel="Shipped quantity"
        reason={editReason}
        onReasonChange={setEditReason}
        reasonLabel="Reason for edit"
        reasonPlaceholder="e.g. wrong quantity entered"
        onConfirm={handleEditLeg}
        onClose={() => setEditTargetLeg(null)}
        loading={editingLegId === editTargetLeg?.id}
      />

      {/* PO pills + clickable line-item expansion */}
      {!recording && (
        <div className="px-4 pb-3 space-y-2">
          {/* Pills row */}
          <div className="flex items-center gap-2 flex-wrap">
            {pos.map(po => (
              <button
                key={po.id}
                type="button"
                onClick={() => togglePoPill(po.id)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors
                  ${expandedPoId === po.id
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {po.po_number}
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  className={`transition-transform ${expandedPoId === po.id ? 'rotate-180' : ''}`}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            ))}
            {canManage && (
              <button type="button" onClick={startRecording}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer text-[11px] font-semibold transition-colors ml-auto
                  ${invoice.bl_number
                    ? 'border border-gray-300 text-gray-600 hover:border-gray-500 hover:text-gray-900'
                    : 'bg-black text-white hover:bg-neutral-800'}`}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {invoice.bl_number ? 'Add Legs' : 'Record Shipment'}
              </button>
            )}
            {!invoice.bl_number && !canManage && (
              <span className="text-[11px] text-gray-500 ml-auto">No BL recorded</span>
            )}
          </div>

          {/* Expanded line items for the active PO pill */}
          {expandedPoId && (() => {
            const activePo = pos.find(p => p.id === expandedPoId)
            if (!activePo) return null
            const allLineItems = activePo.po_line_items ?? []
            const term = poLineItemSearch.trim().toLowerCase()
            const lineItems = term
              ? allLineItems.filter(li =>
                  li.buyer_sku_ref?.toLowerCase().includes(term) ||
                  li.sku_variant?.toLowerCase().includes(term))
              : allLineItems
            return (
              <div className="space-y-2 pt-1">
                {allLineItems.length >= 6 && (
                  <div className="relative max-w-[200px]">
                    <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600 pointer-events-none"
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      value={poLineItemSearch}
                      onChange={e => setPoLineItemSearch(e.target.value)}
                      placeholder="Search SKU…"
                      className="w-full pl-6 pr-2 py-1 text-[11px] border border-gray-300 rounded-md focus:outline-none focus:border-gray-900 placeholder:text-gray-500 transition-colors"
                    />
                  </div>
                )}
                {allLineItems.length === 0 ? (
                  <p className="text-[11px] text-gray-500">No line items on this PO</p>
                ) : lineItems.length === 0 ? (
                  <p className="text-[11px] text-gray-500">No line items match "{poLineItemSearch}"</p>
                ) : (
                  lineItems.map(li => {
                    const invoiceQty   = invoice.legsByLineItem?.[li.id] ?? 0
                    const invoiceValue = invoiceQty * (li.unit_price ?? 0)
                    const allLegs      = invoice.legRowsByLineItem?.[li.id] ?? []
                    const activeLegs   = allLegs.filter(l => !l.reversed)
                    const reversedLegs = allLegs.filter(l => l.reversed)
                    const reversalsOpen = !!expandedReversals[li.id]
                    const renderLeg = leg => (
                      <div key={leg.id}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[11px] ${leg.reversed ? 'bg-red-50/70' : 'bg-gray-50'}`}>
                        <div className={`min-w-0 ${leg.reversed ? 'text-red-300' : 'text-gray-600'}`}>
                          <div className={leg.reversed ? 'line-through' : ''}>
                            <span className="font-semibold">{fmtQty(leg.shipped_quantity)} qty</span>
                            {' · '}{leg.shipped_date ? new Date(leg.shipped_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                            {leg.submitted_by && ` · ${leg.submitted_by}`}
                          </div>
                          {leg.reversed && leg.reversed_reason && (
                            <div className="text-[10px] text-red-400 mt-0.5">Reason: {leg.reversed_reason}</div>
                          )}
                          {!leg.reversed && leg.edit_count > 0 && (
                            <div className="text-[10px] text-gray-500 mt-0.5" title={leg.last_edit_reason ? `Latest reason: ${leg.last_edit_reason}` : undefined}>
                              Edited {leg.edit_count > 1 ? `${leg.edit_count}×` : ''} · {leg.last_edit_reason}
                            </div>
                          )}
                        </div>
                        {leg.reversed ? (
                          <span className="flex-shrink-0 text-[9px] font-bold text-red-400 uppercase tracking-wide">Reversed</span>
                        ) : canManage ? (
                          <div className="flex-shrink-0 flex items-center gap-1">
                            <button type="button" onClick={() => openEditModal(leg)} disabled={editingLegId === leg.id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 border border-gray-200 text-gray-600 text-[10px] font-bold hover:bg-gray-200 hover:border-gray-300 disabled:opacity-50 cursor-pointer disabled:cursor-default transition-colors">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                              Edit
                            </button>
                            <button type="button" onClick={() => openReverseModal(leg.id)} disabled={reversingLegId === leg.id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 border border-red-200 text-red-600 text-[10px] font-bold hover:bg-red-100 hover:border-red-300 disabled:opacity-50 cursor-pointer disabled:cursor-default transition-colors">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                              </svg>
                              {reversingLegId === leg.id ? 'Reversing…' : 'Reverse'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )
                    return (
                      <div key={li.id} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-900 truncate flex-1">
                            {li.buyer_sku_ref}
                            {li.sku_variant && (
                              <span className="text-gray-600 font-normal ml-1">· {li.sku_variant}</span>
                            )}
                          </span>
                          {activePo.actual_vendor_name && activePo.actual_vendor_name !== invoice.primary_vendor_name && (
                            <span className="text-[10px] text-gray-600 flex-shrink-0 italic">{activePo.actual_vendor_name}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between px-2.5 py-1.5 bg-gray-50 rounded-lg">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Ordered</span>
                          <span className="text-xs font-semibold text-gray-900">
                            {fmtQty(li.quantity_ordered)} qty · {fmt$(li.order_value_usd)}
                          </span>
                        </div>

                        {/* Shipment Legs — header carries this invoice's shipped
                            total (used to be a separate "This Invoice" card;
                            merged in since it's just the sum of the legs below). */}
                        <div className={`rounded-lg overflow-hidden ${invoiceQty > 0 ? 'bg-emerald-50/60' : 'bg-gray-50'}`}>
                          <div className="flex items-center justify-between px-2.5 py-1.5">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Shipped this invoice</span>
                            {invoiceQty > 0 ? (
                              <span className="text-xs font-semibold text-emerald-800">{fmtQty(invoiceQty)} qty · {fmt$(invoiceValue)}</span>
                            ) : (
                              <span className="text-[10px] text-gray-600 italic">Not shipped</span>
                            )}
                          </div>
                          {(activeLegs.length > 0 || reversedLegs.length > 0) && (
                          <div className="px-2 pb-2 space-y-1">
                            {activeLegs.map(renderLeg)}
                            {reversedLegs.length > 0 && (
                              <>
                                <button type="button" onClick={() => toggleReversals(li.id)}
                                  className="flex items-center gap-1 text-[10px] font-semibold text-gray-600 hover:text-gray-800 cursor-pointer transition-colors pt-0.5">
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                    className={`transition-transform ${reversalsOpen ? 'rotate-180' : ''}`}>
                                    <polyline points="6 9 12 15 18 9" />
                                  </svg>
                                  {reversedLegs.length} reversed — {reversalsOpen ? 'Hide' : 'Show'}
                                </button>
                                {reversalsOpen && reversedLegs.map(renderLeg)}
                              </>
                            )}
                          </div>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Edit invoice modal */}
      <InvoiceDetailsModal
        open={showEditModal}
        buyerOrgId={buyerOrgId}
        invoiceGroup={invoice}
        onClose={() => setShowEditModal(false)}
        onUpdated={() => { setShowEditModal(false); onInvoiceUpdated?.() }}
      />

      {/* ── Step wizard (recording mode) ──────────────────────────────────── */}
      {recording && (
        <div className="border-t border-gray-100 px-4 pt-3 pb-4 space-y-3">
          {/* Step pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {pos.map((po, i) => {
              const hasLegs = poHasLegs(po)
              const isActive = i === step
              const isVisited = i < step
              return (
                <button
                  key={po.id}
                  type="button"
                  onClick={() => setStep(i)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors
                    ${isActive
                      ? 'bg-gray-900 text-white'
                      : hasLegs
                        ? 'bg-emerald-100 text-emerald-800'
                        : isVisited
                          ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {hasLegs && !isActive && <span className="mr-0.5">✓</span>}PO {po.po_number}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setStep(pos.length)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors
                ${isBlStep
                  ? 'bg-gray-900 text-white'
                  : (blNumber.trim() || existingBl)
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {(blNumber.trim() || existingBl) && !isBlStep && <span className="mr-0.5">✓</span>}BL Number
            </button>
          </div>

          {/* Step content */}
          {!isBlStep && currentPo && (() => {
            const allLineItems = currentPo.po_line_items ?? []
            const term = lineItemSearch.trim().toLowerCase()
            const lineItems = term
              ? allLineItems.filter(li =>
                  li.buyer_sku_ref?.toLowerCase().includes(term) ||
                  li.sku_variant?.toLowerCase().includes(term))
              : allLineItems

            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                    {currentPo.actual_vendor_name || 'Vendor'} · {currentPo.po_number}
                  </div>
                  {allLineItems.length > 6 && (
                    <div className="relative flex-1 max-w-[160px]">
                      <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600 pointer-events-none"
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        type="text"
                        value={lineItemSearch}
                        onChange={e => setLineItemSearch(e.target.value)}
                        placeholder="Search SKU…"
                        className="w-full pl-6 pr-2 py-1 text-[11px] border border-gray-300 rounded-md focus:outline-none focus:border-gray-900 placeholder:text-gray-500 transition-colors"
                      />
                    </div>
                  )}
                </div>
                {allLineItems.length === 0 ? (
                  <p className="text-xs text-gray-500">No line items on this PO</p>
                ) : lineItems.length === 0 ? (
                  <p className="text-xs text-gray-500">No line items match "{lineItemSearch}"</p>
                ) : (
                  lineItems.map(li => (
                    <WizardLineItem
                      key={li.id}
                      li={li}
                      qty={legs[li.id] ?? ''}
                      onChange={v => setLeg(li.id, v)}
                    />
                  ))
                )}
              </div>
            )
          })()}

          {isBlStep && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {/* BL Number — wider */}
                <div className="col-span-2">
                  <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                    BL Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={blNumber}
                    onChange={e => setBlNumber(e.target.value)}
                    placeholder="e.g. MSCUAB123456"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 placeholder:text-gray-400"
                    autoFocus
                  />
                  {existingBl && existingBl !== blNumber && (
                    <p className="text-[10px] text-amber-600 mt-1">This will update the existing BL number ({existingBl}).</p>
                  )}
                  {existingBl && existingBl === blNumber && (
                    <p className="text-[10px] text-emerald-600 mt-1">BL number already recorded — adding more legs.</p>
                  )}
                </div>
                {/* No. of Cartons */}
                <div>
                  <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                    No. of Cartons
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={cartons}
                    onChange={e => setCartons(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 placeholder:text-gray-400"
                  />
                </div>
              </div>
              {totalLegsEntered === 0 && (
                <p className="text-[10px] text-amber-600">No leg quantities entered — fill in at least one PO step before submitting.</p>
              )}
            </div>
          )}

          {error && <p className="text-[11px] text-red-500">{error}</p>}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-1 border-t border-gray-100">
            {step === 0 ? (
              <button type="button" onClick={cancelRecording}
                className="inline-flex items-center px-3 py-1.5 rounded-lg border border-red-200 text-[11px] font-medium text-red-500 hover:border-red-400 hover:text-red-600 cursor-pointer transition-colors">
                Cancel
              </button>
            ) : (
              <button type="button" onClick={() => setStep(s => s - 1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900 cursor-pointer transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back
              </button>
            )}

            {!isBlStep ? (
              <button type="button" onClick={() => setStep(s => s + 1)}
                disabled={hasBalanceError}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-900 text-xs font-semibold text-gray-900 hover:bg-gray-900 hover:text-white disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors">
                Next
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ) : (
              <button type="button" onClick={handleSubmit}
                disabled={!canSubmit || totalLegsEntered === 0}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors">
                {submitting && (
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                )}
                {submitting ? 'Submitting…' : 'Submit Shipment'}
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

