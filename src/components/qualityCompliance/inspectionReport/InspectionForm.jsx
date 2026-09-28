import { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import JSZip from 'jszip'
import SignaturePad from '../../shared/SignaturePad'
import { uploadToInspectionBucket, getInspectionFileUrl } from '../../../lib/inspectionStorage'
import {
  useInspectionReportDetail, useSkuMasterData,
  createInspectionReport, findInspectionReport, updateInspectionReport,
  addDefectRow, updateDefectRow, deleteDefectRow,
  addPhotoRow, updatePhotoRow, deletePhotoRow,
  addInspectionReportLog, startReInspection, rejectLeftoverQuantity, sumSubmittedAvailableQty, sumSubmittedAcceptedQty, fetchReportResultState,
} from '../../../hooks/useInspectionReports'
import { STEPS, STAGES, getStage, INSPECTION_RESULT_OPTIONS, VERDICT_RESULTS, RESULTS_REQUIRING_REMARK, RESULT_BADGE_CLASS, RESULT_LABEL, ACCEPTED_RESULTS, getLockInfo, getNextActionableStage, StageButton, isFinalized } from './stageStatus'
import { RESCHEDULING_RESULTS } from './resultGroups'
import { roundAvailableCap, orderAfterCancellation, computeSubmitFollowUp, acceptedInOtherRounds } from './stageBalance'
import { resolveSamplingPlan, resolveSamplingPlanBySampleSize } from '../../../lib/samplingPlan'
import { bookFollowUpSchedule as bookFollowUpScheduleStandalone, isPlaceholderAssignment } from '../../../hooks/useInspectionSchedule'
import ScrollNav from '../../shared/ScrollNav'
import ImageLightbox from '../../ui/ImageLightbox'
import CancelQuantityModal from './CancelQuantityModal'
import ExportChoiceBox from './ExportChoiceBox'
import { ensureDraft, ensureDraftAndUpdatePatch, updateDraftPatch, setDraftServerReportId, markPendingCreate, markPendingSubmit, markDraftSynced, addPendingPhoto, getPendingPhotosForDraft, removePendingPhoto, getPendingCount, getDraft } from '../../../lib/offlineDrafts'
import { attemptSync, flushPendingPhotos, isSyncPausedForAuth, REPORT_NOT_FOUND } from '../../../lib/offlineSync'
import { PLAN_OFFLINE_ENABLED } from '../../../lib/planOffline'
import { sortPhotosInSequence, sortFilesInSequence } from '../../../lib/photoSequence'

// PLAN OFFLINE (disabled): shown instead of staging a photo/callout locally.
function offlineOffMessage(action, reportId) {
  if (!navigator.onLine) return `You're offline. Connect to the internet to ${action}.`
  if (!reportId) return `Press Save once first, then ${action}.`
  return `Could not ${action}. Check your connection and try again.`
}

const PACKAGING_ROWS   = [['master_packing', 'Master Packing'], ['inner_packing', 'Inner Packing'], ['unit_packing', 'Unit Packing'], ['shipping_mark', 'Shipping Mark']]
const MEASUREMENT_ROWS = [['master', 'Master'], ['inner', 'Inner'], ['unit', 'Product']]
const BARCODE_ROWS     = [['master', 'Master'], ['inner', 'Inner'], ['unit', 'Product']]
const ONSITE_ROWS = [
  ['chemical_test', 'Chemical Test'],
  ['colour_fastness_to_rubbing', 'Colour Fastness To Rubbing'],
  ['continuity_test', 'Continuity Test'],
  ['dimensional_check', 'Dimensional Check'],
  ['distortion_test', 'Distortion Test'],
  ['drop_test', 'Drop Test'],
  ['fitting_test', 'Fitting Test'],
  ['functional_test', 'Functional Test'],
  ['hanging_test', 'Hanging Test'],
  ['hardness_test', 'Hardness Test'],
  ['harp_test', 'Harp Test'],
  ['high_voltage_test', 'High Voltage Test'],
  ['impact_test', 'Impact Test'],
  ['leakage_test', 'Leakage Test'],
  ['load_capacity_test', 'Load Capacity Test'],
  ['moisture_content_carton', 'Moisture Content Carton'],
  ['moisture_content_product', 'Moisture Content Product'],
  ['polarity_test', 'Polarity Test'],
  ['pull_test', 'Pull Test'],
  ['radiation_test', 'Radiation Test'],
  ['scratch_test', 'Scratch Test'],
  ['stability_test', 'Stability Test'],
  ['tape_test_on_product', 'Tape Test on Product'],
  ['tilt_test', 'Tilt Test'],
  ['torque_test', 'Torque Test'],
  ['wobbling_test', 'Wobbling Test'],
]

function num(v) { return v === '' || v == null ? null : Number(v) }
// AQL sample size for the Quantity Break-up step's own Available Quantity -
// separate from the wizard's `effectiveSamplingPlan` (which is keyed off the
// PO's Order Quantity and drives Workmanship/On-site/Packaging seeding and
// the Ac/Re verdict thresholds). This one only feeds Inspection Quantity, so
// editing Available Quantity here never touches those other, PO-level plans.
function inspectionQtyForAvailable(availableQty, inspectionLevel) {
  const plan = resolveSamplingPlan({ lotSize: availableQty, inspectionLevel })
  return plan ? plan.sampleSize : ''
}
function fmtQty(n) { return n != null ? Number(n).toLocaleString() : '-' }
function fmtDateTime(d) {
  if (!d) return '-'
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Spinner({ size = 'w-4 h-4' }) {
  return (
    <svg className={`${size} animate-spin text-gray-400`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

// All 10 steps render stacked as sections on one scrollable page (see the
// wizard's return below) rather than one-at-a-time behind Prev/Next - this
// just gives each one a consistent numbered heading + a scroll anchor so the
// sidebar/mobile step nav can jump straight to it.
// `onHover(stepIdx | null)` previews which section the mouse is over in the
// Steps nav (a light highlight, doesn't touch `step`); `onActivate(stepIdx)`
// fires on any click landing inside the section and commits it as the
// working step (the strong black highlight), so the sidebar tracks wherever
// the inspector is actually clicked into, not just where they last
// deliberately navigated. `index` (the 1-based display number) doubles as
// the section's identity - every call site passes the same two handlers.
function SectionBlock({ index, label, id, onHover, onActivate, action, children }) {
  const stepIdx = index - 1
  return (
    <section
      id={id}
      className="scroll-mt-4"
      onMouseEnter={() => onHover(stepIdx)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onActivate(stepIdx)}
    >
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
        <span className="text-[11px] font-bold text-gray-400">{index}.</span>
        <span className="text-xs font-bold text-gray-900 uppercase tracking-wide">{label}</span>
        {action && <span className="ml-auto" onClick={e => e.stopPropagation()}>{action}</span>}
      </div>
      {children}
    </section>
  )
}

// Sanitizes a filename component down to something every OS accepts -
// strips path-breaking/reserved characters, collapses whitespace.
function sanitizeFileNamePart(s) {
  return String(s || '').trim().replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// Fetches every photo in a Digitals gallery and bundles them into one zip,
// named PO-SKU-VENDOR per the inspector's request - lets them grab the full
// set for a SKU in one click instead of saving each image individually.
async function downloadPhotosAsZip(photos, { poNumber, skuRef, vendorName }) {
  const zip = new JSZip()
  const base = [poNumber, skuRef, vendorName].map(sanitizeFileNamePart).filter(Boolean).join('-') || 'inspection-photos'
  await Promise.all(sortPhotosInSequence(photos).map(async (p, i) => {
    const url = getInspectionFileUrl(p.storage_path)
    const res = await fetch(url)
    const blob = await res.blob()
    const ext = (p.storage_path?.split('.').pop() || 'jpg').toLowerCase()
    zip.file(`${base}-${i + 1}.${ext}`, blob)
  }))
  const content = await zip.generateAsync({ type: 'blob' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(content)
  link.download = `${base}.zip`
  link.click()
  URL.revokeObjectURL(link.href)
}

function DownloadAllPhotosButton({ photos, poNumber, skuRef, vendorName }) {
  const [downloading, setDownloading] = useState(false)
  if (!photos?.length) return null
  const handleClick = async () => {
    setDownloading(true)
    try {
      await downloadPhotosAsZip(photos, { poNumber, skuRef, vendorName })
    } finally {
      setDownloading(false)
    }
  }
  return (
    <button type="button" onClick={handleClick} disabled={downloading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
      {downloading ? 'Zipping…' : 'Download All'}
    </button>
  )
}

function Field({ label, action, children }) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5">
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</label>
        {action}
      </div>
      {children}
    </div>
  )
}
// Stamps the field with the current wall-clock time, down to the second,
// instead of the inspector reading a watch and typing it in by hand.
function nowTimeString() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function NowTimeButton({ label, onSetNow, disabled }) {
  if (disabled) return null
  return (
    <button
      type="button"
      onClick={onSetNow}
      title={`Stamp ${label} with the current time`}
      className="inline-flex items-center justify-center w-5 h-5 text-gray-400 hover:text-gray-900 transition-colors"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-blink">
        <line x1="10" y1="2" x2="14" y2="2" /><line x1="12" y1="14" x2="15" y2="11" /><circle cx="12" cy="14" r="8" />
      </svg>
    </button>
  )
}
function ClearFieldButton({ label, value, onClear, disabled }) {
  if (disabled || !value) return null
  return (
    <button
      type="button"
      onClick={onClear}
      title={`Clear ${label}`}
      className="inline-flex items-center justify-center w-3.5 h-3.5 text-gray-400 hover:text-red-600 transition-colors"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  )
}
const INPUT_CLASS = 'w-full text-sm px-3 py-2 border border-gray-200 rounded-lg shadow-sm transition-colors focus:outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 hover:border-gray-300 disabled:shadow-none disabled:bg-gray-50 disabled:text-gray-400 disabled:hover:border-gray-200'
function TInput({ value, onChange, disabled, placeholder, type = 'text', className = '' }) {
  return (
    <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={placeholder}
      className={`${INPUT_CLASS} ${className}`} />
  )
}
function TArea({ value, onChange, disabled, rows = 3, placeholder }) {
  return (
    <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} disabled={disabled} rows={rows} placeholder={placeholder}
      className={`${INPUT_CLASS} resize-none`} />
  )
}
// Minimal Bold/Italic/Underline editor — stores its value as a small HTML
// fragment rather than plain text (the only way those three actually mean
// anything). Uncontrolled on purpose: contentEditable fights a value prop
// that re-syncs on every keystroke (it resets the cursor position), so the
// DOM is only overwritten when `value` changes for a reason other than this
// element's own typing (report hydration, switching SKUs) — tracked via the
// last HTML this component itself emitted.
function RichTextArea({ value, onChange, disabled, placeholder }) {
  const ref = useRef(null)
  const lastEmitted = useRef(value ?? '')

  useEffect(() => {
    if (!ref.current) return
    if ((value ?? '') === lastEmitted.current) return
    ref.current.innerHTML = value || ''
    lastEmitted.current = value ?? ''
  }, [value])

  const format = (command) => {
    ref.current?.focus()
    document.execCommand(command)
    lastEmitted.current = ref.current?.innerHTML ?? ''
    onChange(lastEmitted.current)
  }

  const toolbarBtn = (command, label, style) => (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={e => e.preventDefault()}   // keep focus/selection in the editor
      onClick={() => format(command)}
      title={label}
      className="w-6 h-6 flex items-center justify-center rounded text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      style={style}
    >
      {label}
    </button>
  )

  return (
    <div className={`w-full text-sm border rounded-lg shadow-sm transition-colors overflow-hidden
      ${disabled ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-gray-300 focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900/10'}`}>
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-gray-100 bg-gray-50">
        {toolbarBtn('bold', 'B', { fontWeight: 700 })}
        {toolbarBtn('italic', 'I', { fontStyle: 'italic' })}
        {toolbarBtn('underline', 'U', { textDecoration: 'underline' })}
      </div>
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={e => { lastEmitted.current = e.currentTarget.innerHTML; onChange(lastEmitted.current) }}
        data-placeholder={placeholder}
        className={`min-h-[72px] px-3 py-2 text-sm outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 ${disabled ? 'text-gray-400' : ''}`}
      />
    </div>
  )
}
function TSelect({ value, onChange, disabled, options, placeholder = 'Select…' }) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)} disabled={disabled}
      className={`${INPUT_CLASS} bg-white`}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
function ReadOnlyValue({ value }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-gray-600 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg truncate">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-300 flex-shrink-0">
        <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      <span className="truncate">{value || '-'}</span>
    </div>
  )
}

const INSPECTION_TYPE_LABEL = { inline: 'Inline', midline: 'Midline', final: 'Final' }

// ── Step 1 — Inspection Details ──────────────────────────────────────────────
function DetailsStep({ lineItem, sku, category, inspectionType, value, onChange, disabled, assignedQaName }) {
  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Particulars</span>
          <span className="text-[11px] font-normal text-gray-400">from product master · read-only</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Customer Ref#"><ReadOnlyValue value={lineItem.buyer_sku_ref} /></Field>
          <Field label="Department"><ReadOnlyValue value={category?.name} /></Field>
          <div className="sm:col-span-2">
            <Field label="Product Description"><ReadOnlyValue value={sku?.description} /></Field>
          </div>
          <Field label="Product Color"><ReadOnlyValue value={sku?.sku_variant} /></Field>
          <Field label="Base Material">
            <ReadOnlyValue value={[
              sku?.primary_material?.label || sku?.primary_base_material,
              sku?.secondary_material?.label || sku?.secondary_base_material,
            ].filter(Boolean).join(', ')} />
          </Field>
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Inspection Details</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Inspector Name">
            <ReadOnlyValue value={value.inspector_name || assignedQaName} />
          </Field>
          <Field label="Type of Inspection">
            <ReadOnlyValue value={INSPECTION_TYPE_LABEL[inspectionType]} />
          </Field>
          {/* Inspection Date, Vendor Representative Name, Arrival, Start and Complete Time are
              MANUAL entry only: nothing here is filled in automatically (no today/now default,
              nothing carried over from another SKU or stage). The "now" stamp buttons are a
              deliberate click by the inspector. */}
          <Field label="Inspection Date" action={<ClearFieldButton label="Inspection Date" value={value.inspection_date} disabled={disabled} onClear={() => onChange({ ...value, inspection_date: '' })} />}>
            <TInput type="date" value={value.inspection_date} onChange={v => onChange({ ...value, inspection_date: v })} disabled={disabled} />
          </Field>
          <Field label="Vendor Representative Name" action={<ClearFieldButton label="Vendor Representative Name" value={value.contact} disabled={disabled} onClear={() => onChange({ ...value, contact: '' })} />}>
            <TInput value={value.contact} onChange={v => onChange({ ...value, contact: v })} disabled={disabled} />
          </Field>
          <Field label="Arrival Time" action={<>
            <NowTimeButton label="Arrival Time" disabled={disabled} onSetNow={() => onChange({ ...value, arrival_time: nowTimeString() })} />
            <ClearFieldButton label="Arrival Time" value={value.arrival_time} disabled={disabled} onClear={() => onChange({ ...value, arrival_time: '' })} />
          </>}>
            <TInput value={value.arrival_time} onChange={v => onChange({ ...value, arrival_time: v })} disabled={disabled} placeholder="e.g. 10:00:00" />
          </Field>
          <Field label="Start Time" action={<>
            <NowTimeButton label="Start Time" disabled={disabled} onSetNow={() => onChange({ ...value, start_time: nowTimeString() })} />
            <ClearFieldButton label="Start Time" value={value.start_time} disabled={disabled} onClear={() => onChange({ ...value, start_time: '' })} />
          </>}>
            <TInput value={value.start_time} onChange={v => onChange({ ...value, start_time: v })} disabled={disabled} placeholder="e.g. 10:10:00" />
          </Field>
          <Field label="Complete Time" action={<>
            <NowTimeButton label="Complete Time" disabled={disabled} onSetNow={() => onChange({ ...value, complete_time: nowTimeString() })} />
            <ClearFieldButton label="Complete Time" value={value.complete_time} disabled={disabled} onClear={() => onChange({ ...value, complete_time: '' })} />
          </>}>
            <TInput value={value.complete_time} onChange={v => onChange({ ...value, complete_time: v })} disabled={disabled} placeholder="e.g. 18:50:00" />
          </Field>
        </div>
      </div>
    </div>
  )
}

// Explicit, immediate "save this now" button for a single field - Available
// Qty and Accepted Qty specifically (see QuantityStep below), the two the
// inspector flagged as needing a confidence check that an edit actually
// landed, rather than waiting on the periodic autosave tick or scrolling up
// to the header Save button. `saveStatus` is the same saving/saved/error
// state the header indicator already shows - reused here so this button's
// own label reflects the real save cycle instead of a separate, possibly
// out-of-sync "did it save" guess.
function FieldSaveButton({ onSaveNow, saveStatus, disabled }) {
  if (disabled) return null
  const label = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Retry' : 'Save'
  return (
    <button
      type="button"
      onClick={onSaveNow}
      disabled={saveStatus === 'saving'}
      title="Save this field now"
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide transition-colors cursor-pointer disabled:cursor-not-allowed
        ${saveStatus === 'error' ? 'text-red-600 hover:bg-red-50' : saveStatus === 'saved' ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'}`}
    >
      {saveStatus === 'saved' && (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><polyline points="20 6 9 17 4 12" /></svg>
      )}
      {label}
    </button>
  )
}

// ── Step 2 — Quantity Break-up ───────────────────────────────────────────────
function QuantityStep({ lineItem, value, onChange, disabled, inspectionLevel, maxAvailableQty, onSaveNow, saveStatus }) {
  // Available Quantity drives Inspection Quantity - every edit re-derives the
  // AQL sample size for that lot size and overwrites it, rather than only
  // seeding it once. Inspection Quantity itself stays a normal editable field
  // underneath that, in case the inspector needs to nudge it afterward.
  // Clamped to maxAvailableQty (the order quantity minus every OTHER already-
  // submitted round's own Available Qty at this stage) - a follow-up round
  // opened to cover a 75-unit leftover can't be typed back up past 75, since
  // the other 75 was already accounted for by an earlier round.
  const setAvailableQuantity = (v) => {
    const clamped = maxAvailableQty != null && v !== '' && !Number.isNaN(Number(v)) && Number(v) > maxAvailableQty
      ? String(maxAvailableQty) : v
    onChange({ ...value, available_quantity: clamped, inspected_qty: inspectionQtyForAvailable(clamped, inspectionLevel) })
  }
  const isCapped = maxAvailableQty != null && lineItem.quantity_ordered != null && maxAvailableQty < (orderAfterCancellation(lineItem) ?? lineItem.quantity_ordered)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Order Quantity"><ReadOnlyValue value={fmtQty(lineItem.quantity_ordered)} /></Field>
        {/* Editable, unlike Order Quantity - seeded from the SKU's Balance but
            correctable to whatever was actually available on-site, and saved
            with this report only (never writes back to the SKU's real
            Balance shown elsewhere). */}
        <Field label="Available Qty" action={<FieldSaveButton onSaveNow={onSaveNow} saveStatus={saveStatus} disabled={disabled} />}>
          <TInput type="number" value={value.available_quantity} onChange={setAvailableQuantity} disabled={disabled} />
          {isCapped && (
            <div className="text-[10px] text-amber-600 mt-1">
              Capped at {maxAvailableQty} - {Math.max(0, (orderAfterCancellation(lineItem) ?? lineItem.quantity_ordered) - maxAvailableQty)} already accepted in earlier rounds.
            </div>
          )}
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Follows Available Quantity's AQL sample size automatically (see
            setAvailableQuantity above) rather than a fixed one-time seed -
            the inspector can still adjust it by hand afterward if needed. */}
        <Field label="Inspection Quantity">
          <TInput type="number" value={value.inspected_qty} onChange={v => onChange({ ...value, inspected_qty: v })} disabled={disabled} />
        </Field>
        <Field label="Accepted Qty" action={<FieldSaveButton onSaveNow={onSaveNow} saveStatus={saveStatus} disabled={disabled} />}>
          {/* Defaults to Available Qty - flags in red the moment the
              inspector actually changes it away from that default, so a
              shortfall (or any other correction) stands out at a glance. */}
          <TInput type="number" value={value.accepted_quantity} onChange={v => onChange({ ...value, accepted_quantity: v })} disabled={disabled}
            className={value.accepted_quantity !== '' && value.accepted_quantity != null && value.available_quantity !== '' && value.available_quantity != null
              && Number(value.accepted_quantity) !== Number(value.available_quantity) ? 'text-red-600 font-semibold' : ''} />
        </Field>
        <Field label="Carton Available">
          <TInput type="number" value={value.carton_available} onChange={v => onChange({ ...value, carton_available: v })} disabled={disabled} />
        </Field>
      </div>
    </div>
  )
}

// ── Step 3 — Packaging Appearance ────────────────────────────────────────────
// One photo per row, stored as a storage path directly inside this row's own
// slice of the packaging_appearance jsonb (row.photo_path) - no separate
// table needed, it just rides along with sample_size/result through the
// same autosave/Save-checkpoint path already saving those. Upload still
// needs somewhere to put the file, so it's gated on reportId existing
// (this SKU having been saved at least once), same gate Digitals' own photo
// upload already applies for the same reason.
// Human label shown atop a photo in the Digitals gallery, derived from the
// machine `step_key` prefix (e.g. 'packaging:master_packing' -> 'Packaging
// Appearance') - one shared vocabulary between every step's upload cell and
// the gallery that ends up displaying all of them together.
const STEP_KEY_LABEL = {
  packaging:   'Packaging Appearance',
  measurement: 'Measurements & Findings',
  defects:     'Defects',
}

// One photo per (step, row), stored in the same `inspection_report_photos`
// table the Digitals gallery already reads - tagged with `step_key` so it
// shows up there too, labeled by which step it was taken on. Reused by
// Packaging, Measurements, and Defects row cells; disabled until `reportId`
// exists (report saved at least once), same gate Digitals' own upload uses.
// draftId/pendingPhotos/onPendingChanged (offline Phase 3) - a photo staged
// while offline (or before `reportId` exists at all, which used to disable
// capture outright) lives in IndexedDB (see offlineDrafts.js) until the
// background sync engine can actually upload it - see the "queued" badge
// below and InspectionForm's own photo-sync effect.
function RowPhotoCell({ reportId, stepKey, photos, disabled, onChanged, draftId, pendingPhotos, onPendingChanged }) {
  const [uploading, setUploading] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const existing = (photos || []).find(p => p.step_key === stepKey)
  const pending = !existing ? (pendingPhotos || []).find(p => p.stepKey === stepKey) : null

  const handleUpload = async (file) => {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      if (!reportId) throw new Error('offline')
      const path = await uploadToInspectionBucket(file, `${reportId}/misc`)
      const { error } = await addPhotoRow({ report_id: reportId, storage_path: path, step_key: stepKey })
      if (error) throw error
      onChanged?.()
    } catch {
      // PLAN OFFLINE (disabled): no local staging - tell the user why instead.
      if (!PLAN_OFFLINE_ENABLED) {
        setUploadError(offlineOffMessage('add photos', reportId))
        return
      }
      // No report row yet, or the upload attempt itself failed (most
      // likely no connectivity) - stage it locally instead of losing the
      // photo outright. The background sync effect picks this up once a
      // report row exists and there's a network to send it over.
      try {
        await addPendingPhoto({ photoId: crypto.randomUUID(), draftId, stepKey, blob: file, fileName: file.name })
        onPendingChanged?.()
      } catch (queueErr) {
        setUploadError(queueErr?.message || 'Could not save photo')
      }
    } finally {
      setUploading(false)
    }
  }
  const handleRemove = async () => {
    if (!existing) return
    await deletePhotoRow(existing.id)
    onChanged?.()
  }
  const handleRemovePending = async () => {
    if (!pending) return
    await removePendingPhoto(pending.photoId)
    onPendingChanged?.()
  }

  if (existing) {
    return (
      <div className="relative w-9 h-9 mx-auto group">
        <img
          src={getInspectionFileUrl(existing.storage_path)}
          alt=""
          onClick={() => setLightboxOpen(true)}
          className="w-9 h-9 rounded-md object-cover border border-gray-200 cursor-zoom-in"
        />
        {!disabled && (
          <button
            type="button"
            onClick={handleRemove}
            title="Remove photo"
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
        {lightboxOpen && (
          <ImageLightbox
            images={[getInspectionFileUrl(existing.storage_path)]}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </div>
    )
  }

  // Staged locally, not yet synced - same photo the QA already took, just
  // rendered from the local Blob (URL.createObjectURL) instead of Storage
  // since it hasn't uploaded yet. Removable the same way a synced photo is.
  if (pending) {
    return (
      <div className="relative w-9 h-9 mx-auto group">
        <img src={URL.createObjectURL(pending.blob)} alt="" className="w-9 h-9 rounded-md object-cover border border-amber-300" />
        <span title="Not yet synced - will upload automatically once back online" className="absolute -bottom-1 -left-1 w-3 h-3 rounded-full bg-amber-400 border border-white" />
        {!disabled && (
          <button
            type="button"
            onClick={handleRemovePending}
            title="Remove photo"
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="relative w-9 h-9 mx-auto">
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => setShowCamera(true)}
          title={uploadError || 'Take a photo'}
          className={`w-9 h-9 flex items-center justify-center rounded-md border border-dashed transition-colors
            ${uploadError ? 'border-red-300 text-red-500' : disabled ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 cursor-pointer'}`}
        >
          {uploading ? <Spinner size="w-3.5 h-3.5" /> : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
            </svg>
          )}
        </button>
        {uploadError && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />}
      </div>
      {showCamera && (
        <CameraCaptureModal
          onClose={() => setShowCamera(false)}
          onCapture={file => { setShowCamera(false); handleUpload(file) }}
        />
      )}
    </>
  )
}

function PackagingStep({ value, onChange, disabled, reportId, photos, onChanged, draftId, pendingPhotos, onPendingChanged }) {
  const setRow = (key, field, v) => onChange({ ...value, [key]: { ...(value[key] || {}), [field]: v } })
  return (
    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
      {PACKAGING_ROWS.map(([key, label]) => {
        const row = value[key] || {}
        const sampleInput = (
          <input placeholder="Sample size e.g. A (2)" value={row.sample_size || ''} onChange={e => onChange({ ...value, [key]: { ...(value[key] || {}), sample_size: e.target.value, manual: true } })} disabled={disabled}
            className="text-xs px-2 py-1.5 border border-gray-200 rounded-md disabled:bg-gray-50 w-full" />
        )
        const resultSelect = (
          <select value={row.result || 'pass'} onChange={e => setRow(key, 'result', e.target.value)} disabled={disabled}
            className="text-xs px-2 py-1.5 border border-gray-200 rounded-md bg-white disabled:bg-gray-50 w-full">
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
            <option value="na">N/A</option>
          </select>
        )
        const photoCell = <RowPhotoCell reportId={reportId} stepKey={`packaging:${key}`} photos={photos} disabled={disabled} onChanged={onChanged} draftId={draftId} pendingPhotos={pendingPhotos} onPendingChanged={onPendingChanged} />
        return (
          <div key={key}>
            {/* Below sm: a stacked mini-card (label, sample size, result,
                photo - each its own row) instead of the desktop grid - the
                1.2fr/1.4fr/1.4fr/auto column template is asymmetric with no
                sane single-column CSS fallback (an inline style can't be
                conditioned by a Tailwind breakpoint), so this is a genuine
                second layout, not just an added breakpoint class on the
                same grid. */}
            <div className="sm:hidden flex flex-col gap-1.5 px-3 py-2.5">
              <span className="text-xs font-semibold text-gray-700">{label}</span>
              {sampleInput}
              <div className="flex items-center gap-2">
                {resultSelect}
                {photoCell}
              </div>
            </div>
            <div className="hidden sm:grid gap-3 items-center px-3 py-2.5" style={{ gridTemplateColumns: '1.2fr 1.4fr 1.4fr auto' }}>
              <span className="text-xs font-semibold text-gray-700">{label}</span>
              {sampleInput}
              {resultSelect}
              {photoCell}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Step 4 — Measurement (spec from skus, findings entered here) ────────────
function specForMeasurementRow(sku, key) {
  if (!sku) return {}
  if (key === 'master') return { l: sku.master_pack_length, b: sku.master_pack_breadth, h: sku.master_pack_height, wt: sku.master_pack_weight_kg, qty: sku.master_pack_qty }
  if (key === 'inner') return { l: sku.inner_pack_length, b: sku.inner_pack_breadth, h: sku.inner_pack_height, wt: sku.inner_pack_weight_kg, qty: sku.inner_pack_qty }
  return { l: sku.length, b: sku.breadth, h: sku.height, wt: sku.weight_kg, qty: null }
}
// L/B/H and Wt are always entered and stored in cm/kg (master_pack_length
// etc. carry no unit suffix, but master_pack_weight_kg does, and real SKU
// data confirms cm - a 36x95x46 master carton is plausible, the same
// numbers in inches would not be). These two just convert the stored cm/kg
// value to/from whichever unit MeasurementStep's per-row toggle below is
// currently showing - purely a display concern, nothing they touch is ever
// written back except through fromDisplayUnit converting back to cm/kg
// first.
const CM_PER_IN = 2.54
const KG_PER_LB = 0.45359237
function toDisplayUnit(value, unit, kind) {
  if (value === '' || value == null) return value
  const n = Number(value)
  if (Number.isNaN(n)) return value
  // Stored unit (cm / kg): show exactly what is stored - no rounding, so a
  // value like 0.005 kg is never cut to 2 decimals.
  const isConverted = (kind === 'length' && unit === 'in') || (kind === 'weight' && unit === 'lbs')
  if (!isConverted) return value
  const converted = kind === 'length' ? n / CM_PER_IN : n / KG_PER_LB
  return Math.round(converted * 1e6) / 1e6
}
function fromDisplayUnit(value, unit, kind) {
  if (value === '' || value == null) return value
  const n = Number(value)
  if (Number.isNaN(n)) return value
  if (kind === 'length' && unit === 'in') return n * CM_PER_IN
  if (kind === 'weight' && unit === 'lbs') return n * KG_PER_LB
  // Stored unit: keep the text exactly as typed ("0.005", "0.0", "12."), so
  // any number of decimals is allowed and a trailing point is not eaten.
  return value
}
// Two-segment pill toggle (e.g. CM | IN) - active segment dark, matches the
// compact control style already used elsewhere in this step (Pass/Fail
// select, photo icon button).
function UnitToggle({ value, options, onChange, disabled }) {
  return (
    <div className="inline-flex rounded-md border border-gray-200 overflow-hidden flex-shrink-0">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => onChange(key)}
          className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors cursor-pointer disabled:cursor-not-allowed
            ${value === key ? 'bg-gray-900 text-white' : 'bg-white text-gray-400 hover:text-gray-600'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
// Fills any row still missing findings from the product master's spec —
// pure and idempotent so it's safe to call from both the report-hydration
// effect and the standalone "sku loaded late" effect below without either
// one clobbering what the other already set. Never touches a row that
// already has data (saved or previously seeded), and never runs once a
// report is locked (a blank field on a historical record should stay blank).
function seedMeasurementFromSpec(rows, sku, isLocked) {
  if (isLocked || !sku) return rows
  let next = rows
  let changed = false
  MEASUREMENT_ROWS.forEach(([key]) => {
    if (next[key] && Object.keys(next[key]).length) return
    const spec = specForMeasurementRow(sku, key)
    if (spec.l == null && spec.b == null && spec.h == null && spec.wt == null && spec.qty == null) return
    if (!changed) { next = { ...rows }; changed = true }
    next[key] = { l: spec.l ?? '', b: spec.b ?? '', h: spec.h ?? '', wt: spec.wt ?? '', qty: spec.qty ?? '' }
  })
  return next
}
// Same "default to Pass" idea as seedPackagingResultDefaults, for the two
// other steps with a bare Result dropdown - most checks pass, so requiring
// every row to be touched just to confirm the obvious was pure friction.
function seedMeasurementResultDefaults(rows, isLocked) {
  if (isLocked) return rows
  let next = rows
  let changed = false
  MEASUREMENT_ROWS.forEach(([key]) => {
    if (next[key]?.result) return
    if (!changed) { next = { ...rows }; changed = true }
    next[key] = { ...(next[key] || {}), result: 'pass' }
  })
  return next
}
function seedBarcodeResultDefaults(rows, isLocked) {
  if (isLocked) return rows
  let next = rows
  let changed = false
  BARCODE_ROWS.forEach(([key]) => {
    if (next[key]?.result) return
    if (!changed) { next = { ...rows }; changed = true }
    next[key] = { ...(next[key] || {}), result: 'pass' }
  })
  return next
}
// Same idempotent-merge shape as above, for the two other groups the AQL
// sampling plan feeds: the plan's sample size is drawn once per SKU and
// reused everywhere a "Sample Size" field appears (Packaging, On-site,
// Workmanship) — one physical sample, checked several different ways.
// Unlike the result-default seeds below, this one still fills in on a
// locked/submitted report: Sample Size is a deterministic value computed
// from the SKU's own quantity and the PO's inspection level, not a judgment
// call an inspector made - a blank one on an old submitted row just means it
// predates this auto-fill, not that "no sample size" was ever the real
// answer. Still only fills a row that's genuinely empty, so it can never
// overwrite something actually recorded.
// Packaging Appearance sample size comes from a SPECIAL inspection level (S-1 to S-4, S-1 by default)
// picked in the section header, sized from the round's Available Qty. The chosen level is stored inside
// packaging_appearance under a reserved key (no database change); reports made before this option have
// sample sizes but no level and are left exactly as they were until a level is picked.
const PACKAGING_LEVELS = ['S-1', 'S-2', 'S-3', 'S-4']
const PACKAGING_LEVEL_KEY = '__level'
const packagingLevelOf = (rows) => rows?.[PACKAGING_LEVEL_KEY]?.value || ''
function packagingSizeString(level, lot) {
  const plan = resolveSamplingPlan({ lotSize: lot, inspectionLevel: level })
  return plan ? `${plan.codeLetter} (${plan.sampleSize})` : ''
}
// Sets the level and recalculates ALL four rows (a hand-typed size is replaced too).
function applyPackagingLevel(rows, level, lot) {
  const size = packagingSizeString(level, lot)
  const next = { ...rows, [PACKAGING_LEVEL_KEY]: { value: level } }
  PACKAGING_ROWS.forEach(([key]) => {
    const { manual: _manual, ...row } = next[key] || {}
    next[key] = size ? { ...row, sample_size: size } : row
  })
  return next
}
// Packaging rows default to Pass rather than an unset "Result…" placeholder -
// most packaging checks pass, and requiring every row to be touched just to
// confirm the obvious was pure friction. Same idempotent-merge shape as the
// two seed functions above: only fills a row that has nothing recorded yet.
function seedPackagingResultDefaults(rows, isLocked) {
  if (isLocked) return rows
  let next = rows
  let changed = false
  PACKAGING_ROWS.forEach(([key]) => {
    if (next[key]?.result) return
    if (!changed) { next = { ...rows }; changed = true }
    next[key] = { ...(next[key] || {}), result: 'pass' }
  })
  return next
}
function seedOnsiteFromPlan(rows, isLocked) {
  if (isLocked) return rows
  let next = rows
  let changed = false
  ONSITE_ROWS.forEach(([key]) => {
    const existing = next[key] || {}
    // A row with nothing recorded at all defaults to "not performed" — most
    // of the 22 tests don't apply to any given SKU, so starting everything
    // active meant opting every irrelevant row out by hand instead of just
    // opting the relevant few in. A row that already has real data (from
    // before this default existed) keeps its own unset/blank rendering —
    // never retroactively marked "No" out from under recorded history.
    // Doesn't seed inspection_level/sample_size (removed from the UI — that's
    // one PO-wide value already shown once in the SKU header, not something
    // worth duplicating into all 22 rows of every report).
    const isUntouched = existing.performed == null && !existing.result && !existing.remarks
    if (!isUntouched) return
    if (!changed) { next = { ...rows }; changed = true }
    next[key] = { ...existing, performed: 'no' }
  })
  return next
}
// The direct answer to "calculate pass/fail from the AQL chart": compares
// this SKU's own logged defect totals against the sampling plan's Ac
// numbers. Returns null when there's no plan to compare against — no plan
// means no traceable basis for a verdict, so none is suggested. `defects` is
// summed independently here (not reused from DefectTable, whose totals are
// private local state) from the same `inspection_report_defects` rows.
function computeAqlVerdict(defects, plan) {
  if (!plan) return null
  const totals = (defects || []).reduce((a, d) => ({
    critical: a.critical + Number(d.critical_count || 0),
    major: a.major + Number(d.major_count || 0),
    minor: a.minor + Number(d.minor_count || 0),
  }), { critical: 0, major: 0, minor: 0 })
  const breaches = []
  if (totals.critical > plan.critical.ac) breaches.push(`Critical ${totals.critical} exceeds Ac ${plan.critical.ac}`)
  if (plan.major && totals.major > plan.major.ac) breaches.push(`Major ${totals.major} exceeds Ac ${plan.major.ac}`)
  if (plan.minor && totals.minor > plan.minor.ac) breaches.push(`Minor ${totals.minor} exceeds Ac ${plan.minor.ac}`)
  return { result: breaches.length ? 'rejected' : 'accepted', breaches, totals }
}

// True the moment any single check anywhere on this SKU's current round is
// marked Fail - a barcode, a packaging row, a measurement row, an on-site
// test (skipped/"No" rows don't count, matching rollupResult's convention),
// or the workmanship AQL verdict itself. Drives blocking a clean "Accepted"
// on Sign-off below; the actual failing checks still show wherever they were
// entered; this is just what stops "Accepted" from papering over them.
function hasAnyFailedCheck({ barcodes, packaging, measurement, onsite, aqlVerdict }) {
  const anyFail = (group) => Object.values(group || {}).some(row => row?.result === 'fail')
  return (
    anyFail(barcodes) ||
    anyFail(packaging) ||
    anyFail(measurement) ||
    Object.values(onsite || {}).some(row => row?.performed !== 'no' && row?.result === 'fail') ||
    aqlVerdict?.result === 'rejected'
  )
}

const LENGTH_UNIT_OPTIONS = [['cm', 'CM'], ['in', 'IN']]
const WEIGHT_UNIT_OPTIONS = [['kg', 'KG'], ['lbs', 'LBS']]

function MeasurementStep({ sku, value, onChange, disabled, reportId, photos, onChanged, draftId, pendingPhotos, onPendingChanged }) {
  const setRow = (key, field, v) => onChange({ ...value, [key]: { ...(value[key] || {}), [field]: v } })
  // Display-only, independent per row (Master/Inner/Product each remember
  // their own choice) - never touches `value`/onChange, so what's actually
  // stored (and eventually submitted/exported) stays in cm/kg no matter
  // what's toggled here. See toDisplayUnit/fromDisplayUnit above.
  const [units, setUnits] = useState({}) // { [rowKey]: { length: 'cm'|'in', weight: 'kg'|'lbs' } }
  const setRowUnit = (key, kind, unit) => setUnits(prev => ({ ...prev, [key]: { ...(prev[key] || { length: 'cm', weight: 'kg' }), [kind]: unit } }))
  return (
    <div className="space-y-4">
      {MEASUREMENT_ROWS.map(([key, label]) => {
        const spec = specForMeasurementRow(sku, key)
        const row = value[key] || {}
        const rowUnits = units[key] || { length: 'cm', weight: 'kg' }
        return (
          <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-3 justify-between">
              <span className="text-xs font-bold text-gray-700">{label}</span>
              <div className="flex items-center gap-2">
                <select value={row.result || 'pass'} onChange={e => setRow(key, 'result', e.target.value)} disabled={disabled}
                  className="text-xs px-2 py-1 border border-gray-200 rounded-md bg-white disabled:bg-gray-50">
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                  <option value="na">N/A</option>
                </select>
                <RowPhotoCell reportId={reportId} stepKey={`measurement:${key}`} photos={photos} disabled={disabled} onChanged={onChanged} draftId={draftId} pendingPhotos={pendingPhotos} onPendingChanged={onPendingChanged} />
              </div>
            </div>
            {/* Below sm: the 4 grid-cols-5 rows (unit toggles / labels /
                spec / findings) collapse to a 2-up grid of self-contained
                field cards (label + spec + finding input together per
                field) instead - 5 numeric inputs abreast was the single
                narrowest-phone risk in this whole wizard. Same L, B, H, Wt,
                Qty order, just read top-to-bottom in pairs instead of left-
                to-right in one line. Desktop (hidden sm:block below) is
                untouched. */}
            <div className="sm:hidden px-3 py-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <UnitToggle value={rowUnits.length} options={LENGTH_UNIT_OPTIONS} onChange={u => setRowUnit(key, 'length', u)} />
                <UnitToggle value={rowUnits.weight} options={WEIGHT_UNIT_OPTIONS} onChange={u => setRowUnit(key, 'weight', u)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {['l', 'b', 'h', 'wt', 'qty'].map(f => {
                  const deviates = spec[f] != null && row[f] !== '' && row[f] != null && Number(row[f]) !== Number(spec[f])
                  const kind = f === 'wt' ? 'weight' : f === 'qty' ? null : 'length'
                  const unit = kind === 'length' ? rowUnits.length : kind === 'weight' ? rowUnits.weight : null
                  const displayValue = kind ? toDisplayUnit(row[f], unit, kind) : row[f]
                  const specDisplay = kind ? (toDisplayUnit(spec[f], unit, kind) ?? '-') : (spec[f] ?? '-')
                  return (
                    <div key={f} className="border border-gray-100 rounded-md p-2">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                        {f.toUpperCase()} {unit ? `(${unit})` : ''}
                      </div>
                      <div className="text-[10px] text-gray-400 mb-1">Spec: {specDisplay}</div>
                      <input type="number" step="any" value={displayValue ?? ''}
                        onChange={e => setRow(key, f, kind ? fromDisplayUnit(e.target.value, unit, kind) : e.target.value)}
                        disabled={disabled} placeholder="Finding"
                        className={`w-full text-xs px-2 py-1.5 border rounded-md disabled:bg-gray-50 ${deviates ? 'border-red-300 text-red-600 font-semibold' : 'border-gray-200'}`} />
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="hidden sm:block">
              <div className="px-3 pt-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Specification (from product master)</div>
              <div className="grid grid-cols-5 gap-2 px-3 pt-1.5">
                <div className="col-span-3"><UnitToggle value={rowUnits.length} options={LENGTH_UNIT_OPTIONS} onChange={u => setRowUnit(key, 'length', u)} /></div>
                <div><UnitToggle value={rowUnits.weight} options={WEIGHT_UNIT_OPTIONS} onChange={u => setRowUnit(key, 'weight', u)} /></div>
                <div />
              </div>
              <div className="grid grid-cols-5 gap-2 px-3 py-1 text-[10px] text-gray-400 font-semibold uppercase">
                <span>L ({rowUnits.length})</span><span>B ({rowUnits.length})</span><span>H ({rowUnits.length})</span><span>Wt ({rowUnits.weight})</span><span>Qty</span>
              </div>
              <div className="grid grid-cols-5 gap-2 px-3 pb-3 text-xs text-gray-600">
                <span>{toDisplayUnit(spec.l, rowUnits.length, 'length') ?? '-'}</span>
                <span>{toDisplayUnit(spec.b, rowUnits.length, 'length') ?? '-'}</span>
                <span>{toDisplayUnit(spec.h, rowUnits.length, 'length') ?? '-'}</span>
                <span>{toDisplayUnit(spec.wt, rowUnits.weight, 'weight') ?? '-'}</span>
                <span>{spec.qty ?? '-'}</span>
              </div>
              <div className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Findings (measured on-site)</div>
              <div className="grid grid-cols-5 gap-2 px-3 pb-3 pt-1">
                {['l', 'b', 'h', 'wt', 'qty'].map(f => {
                  // Flags a finding that drifted from spec so it's obvious at a
                  // glance - only once both sides have a real number, so an
                  // empty/not-yet-measured field never reads as a mismatch.
                  // Both sides are compared in their stored cm/kg form, so this
                  // stays correct regardless of which unit is being displayed.
                  const deviates = spec[f] != null && row[f] !== '' && row[f] != null && Number(row[f]) !== Number(spec[f])
                  const kind = f === 'wt' ? 'weight' : f === 'qty' ? null : 'length'
                  const unit = kind === 'length' ? rowUnits.length : kind === 'weight' ? rowUnits.weight : null
                  const displayValue = kind ? toDisplayUnit(row[f], unit, kind) : row[f]
                  return (
                    <input key={f} type="number" step="any" value={displayValue ?? ''}
                      onChange={e => setRow(key, f, kind ? fromDisplayUnit(e.target.value, unit, kind) : e.target.value)}
                      disabled={disabled} placeholder={kind ? `${f.toUpperCase()} (${unit})` : f.toUpperCase()}
                      className={`text-xs px-2 py-1.5 border rounded-md disabled:bg-gray-50 ${deviates ? 'border-red-300 text-red-600 font-semibold' : 'border-gray-200'}`} />
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Step 5 — Barcodes (spec from skus, result entered here) ─────────────────
function specBarcodeForRow(sku, key) {
  if (!sku) return null
  if (key === 'master') return sku.master_pack_barcode
  if (key === 'inner') return sku.inner_pack_barcode
  return sku.item_barcode
}
function BarcodeStep({ sku, value, onChange, disabled }) {
  const setRow = (key, field, v) => onChange({ ...value, [key]: { ...(value[key] || {}), [field]: v } })
  return (
    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
      {BARCODE_ROWS.map(([key, label]) => {
        const spec = specBarcodeForRow(sku, key)
        const row = value[key] || {}
        // Below sm: label+spec (a natural pair - spec is *about* that
        // label) stay on one line, then the result select gets its own
        // full-width line beneath - 2 visual rows instead of 3 squeezed
        // columns. Desktop's 3-col row is unchanged (sm:grid).
        return (
          <div key={key} className="flex flex-col gap-2 sm:grid sm:grid-cols-3 sm:gap-3 sm:items-center px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-gray-700">{label}</div>
              <div className="text-[11px] text-gray-400 mt-0.5 truncate">{spec || 'No barcode on record'}</div>
            </div>
            <span className="hidden sm:inline text-[11px] text-gray-400">Specification (from product master)</span>
            <select value={row.result || 'pass'} onChange={e => setRow(key, 'result', e.target.value)} disabled={disabled}
              className="text-xs px-2 py-1.5 border border-gray-200 rounded-md bg-white disabled:bg-gray-50 w-full sm:w-auto">
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="na">N/A</option>
            </select>
          </div>
        )
      })}
    </div>
  )
}

// ── Step 6 — On-site Tests ────────────────────────────────────────────────────
// Not every one of the 22 tests applies to every product category, and
// there's no category→applicable-tests mapping anywhere in the system to
// infer it from — so the inspector marks each row directly instead. "No"
// only disables/dims Level/Sample/Result (nothing is cleared), so flipping
// back to Yes restores whatever was already typed.
// Progressive disclosure - 25 tests is a lot to dump on screen at once when
// most SKUs only care about a handful. Show More walks 3 -> 8 -> all; Show
// Less walks the exact same stops backward (8 -> 3), rather than jumping
// straight back to 3, so collapsing feels like undoing the expansion.
const ONSITE_INITIAL_VISIBLE = 3
const ONSITE_EXPANDED_VISIBLE = 8

function OnsiteStep({ value, onChange, disabled }) {
  const setRow = (key, field, v) => onChange({ ...value, [key]: { ...(value[key] || {}), [field]: v } })
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(ONSITE_INITIAL_VISIBLE)
  const q = search.trim().toLowerCase()
  const rows = q ? ONSITE_ROWS.filter(([, label]) => label.toLowerCase().includes(q)) : ONSITE_ROWS

  // A fresh search always starts collapsed again rather than carrying over
  // whatever expansion level the unfiltered list happened to be at. Adjusted
  // during render (React's documented pattern for "reset state when an input
  // changes") rather than in an effect, so it never paints a stale frame
  // still showing the old query's expansion level.
  const [prevQuery, setPrevQuery] = useState(q)
  if (prevQuery !== q) {
    setPrevQuery(q)
    setVisibleCount(ONSITE_INITIAL_VISIBLE)
  }

  const visibleRows = rows.slice(0, visibleCount)
  const showMore = visibleCount < rows.length
  const showLess = visibleCount > ONSITE_INITIAL_VISIBLE
  const expandRows = () => setVisibleCount(prev => (prev < ONSITE_EXPANDED_VISIBLE ? ONSITE_EXPANDED_VISIBLE : rows.length))
  const collapseRows = () => setVisibleCount(prev => (prev > ONSITE_EXPANDED_VISIBLE ? ONSITE_EXPANDED_VISIBLE : ONSITE_INITIAL_VISIBLE))

  return (
    <div className="space-y-2">
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tests…"
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
        />
      </div>
      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
      {rows.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-6">No tests match “{search}”</p>
      )}
      {visibleRows.map(([key, label]) => {
        const row = value[key] || {}
        const notPerformed = row.performed === 'no'
        const fieldsDisabled = disabled || notPerformed
        const yesNoToggle = (
          <div className="flex items-center gap-1">
            {['yes', 'no'].map(v => (
              <button key={v} type="button" disabled={disabled}
                onClick={() => onChange({ ...value, [key]: { ...row, performed: v, result: v === 'yes' ? (row.result || 'pass') : row.result } })}
                title="Was this test performed for this SKU?"
                className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border transition-colors
                  ${row.performed === v
                    ? (v === 'yes' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-gray-500 text-white border-gray-500')
                    : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                {v}
              </button>
            ))}
          </div>
        )
        const resultSelect = (
          <select value={row.result || ''} onChange={e => setRow(key, 'result', e.target.value)} disabled={fieldsDisabled}
            className="text-xs px-2 py-1.5 border border-gray-200 rounded-md bg-white disabled:bg-gray-50 disabled:opacity-50 w-full">
            <option value="">Result…</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
          </select>
        )
        const remarksInput = (
          <input placeholder="Remarks" value={row.remarks || ''} onChange={e => setRow(key, 'remarks', e.target.value)} disabled={fieldsDisabled}
            className="text-xs px-2 py-1.5 border border-gray-200 rounded-md disabled:bg-gray-50 disabled:opacity-50 w-full" />
        )
        return (
          <div key={key}>
            {/* Below sm: same stacked-mini-card treatment as PackagingStep's
                rows - label, then Yes/No, then Result, then Remarks, each
                its own line instead of 4 asymmetric columns. */}
            <div className="sm:hidden flex flex-col gap-1.5 px-3 py-2.5">
              <span className="text-xs font-semibold text-gray-700">{label}</span>
              {yesNoToggle}
              {resultSelect}
              {remarksInput}
            </div>
            <div className="hidden sm:grid gap-3 items-center px-3 py-2.5" style={{ gridTemplateColumns: '1.4fr 0.8fr 1fr 1.4fr' }}>
              <span className="text-xs font-semibold text-gray-700">{label}</span>
              {yesNoToggle}
              {resultSelect}
              {remarksInput}
            </div>
          </div>
        )
      })}
      </div>
      {(showMore || showLess) && (
        <div className="flex items-center justify-center gap-3 pt-1">
          {showMore && (
            <button type="button" onClick={expandRows}
              className="text-xs font-semibold text-gray-500 hover:text-gray-900 inline-flex items-center gap-1 transition-colors cursor-pointer">
              Show more
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
          )}
          {showMore && showLess && <span className="text-gray-300">·</span>}
          {showLess && (
            <button type="button" onClick={collapseRows}
              className="text-xs font-semibold text-gray-500 hover:text-gray-900 inline-flex items-center gap-1 transition-colors cursor-pointer">
              Show less
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15" /></svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Swipe a row left to reveal a Delete action underneath, tap it to confirm -
// the native Mail-app pattern for deleting a list item, on top of (not
// instead of) the row's own explicit Delete button below for anyone who
// doesn't discover the swipe. Deliberately reveal-then-tap rather than
// delete-the-instant-the-swipe-clears-a-threshold - an accidental fast
// swipe on defect data (findings someone already typed in) shouldn't be
// one motion away from being gone with no confirm step. Touch-only
// (`pointerType === 'touch'`), same reasoning as this file's other
// gestures - a desktop mouse-drag isn't this gesture.
const SWIPE_REVEAL_PX = 76
function useSwipeReveal({ disabled }) {
  const [offset, setOffset] = useState(0)   // 0 (closed) .. -SWIPE_REVEAL_PX (open)
  const startXRef = useRef(null)
  const openedAtStartRef = useRef(false)   // was it already open when this drag began
  const draggingRef = useRef(false)
  const offsetRef = useRef(0)   // mirrors `offset`, read in onPointerUp to avoid a stale closure
  const handlers = disabled ? {} : {
    onPointerDown: (e) => {
      if (e.pointerType !== 'touch') return
      startXRef.current = e.clientX
      openedAtStartRef.current = offsetRef.current === -SWIPE_REVEAL_PX
      draggingRef.current = true
    },
    onPointerMove: (e) => {
      if (!draggingRef.current || startXRef.current == null) return
      const base = openedAtStartRef.current ? -SWIPE_REVEAL_PX : 0
      const next = Math.max(-SWIPE_REVEAL_PX, Math.min(0, base + (e.clientX - startXRef.current)))
      offsetRef.current = next
      setOffset(next)
    },
    onPointerUp: () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      const next = offsetRef.current < -SWIPE_REVEAL_PX / 2 ? -SWIPE_REVEAL_PX : 0
      offsetRef.current = next
      setOffset(next)
    },
    onPointerCancel: () => { draggingRef.current = false; offsetRef.current = 0; setOffset(0) },
  }
  const close = () => { offsetRef.current = 0; setOffset(0) }
  return { offset, handlers, close }
}

function DefectCard({ r, disabled, edit, commit, remove, reportId, photos, onPhotosChanged, draftId, pendingPhotos, onPendingChanged }) {
  const { offset, handlers, close } = useSwipeReveal({ disabled })
  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Revealed delete action, sits underneath, only reachable once the
          card above has been swiped left off of it. */}
      {!disabled && (
        <button
          type="button"
          onClick={() => { close(); remove(r.id) }}
          className="absolute inset-y-0 right-0 w-[76px] flex items-center justify-center bg-red-500 text-white text-[11px] font-bold cursor-pointer"
        >
          Delete
        </button>
      )}
      <div
        {...handlers}
        style={{ transform: `translateX(${offset}px)`, transition: offset === 0 || offset === -SWIPE_REVEAL_PX ? 'transform 0.15s ease-out' : 'none' }}
        className="relative bg-white border border-gray-200 rounded-lg p-3 space-y-2"
      >
        <input value={r.defect_description || ''} disabled={disabled} placeholder="Defect description"
          onChange={e => edit(r.id, 'defect_description', e.target.value)}
          onBlur={e => commit(r.id, 'defect_description', e.target.value)}
          className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md disabled:bg-gray-50 font-semibold text-gray-700" />
        <div className="grid grid-cols-3 gap-2">
          {[['critical_count', 'Critical'], ['major_count', 'Major'], ['minor_count', 'Minor']].map(([f, label]) => (
            <div key={f}>
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</div>
              <input type="number" min="0" value={r[f] ?? 0} disabled={disabled}
                onChange={e => edit(r.id, f, e.target.value)}
                onBlur={e => commit(r.id, f, Number(e.target.value) || 0)}
                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md text-center disabled:bg-gray-50" />
            </div>
          ))}
        </div>
        <input value={r.remarks || ''} disabled={disabled} placeholder="Remarks"
          onChange={e => edit(r.id, 'remarks', e.target.value)}
          onBlur={e => commit(r.id, 'remarks', e.target.value)}
          className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md disabled:bg-gray-50" />
        <div className="flex items-center justify-between">
          <RowPhotoCell reportId={reportId} stepKey={`defects:${r.id}`} photos={photos} disabled={disabled} onChanged={onPhotosChanged} draftId={draftId} pendingPhotos={pendingPhotos} onPendingChanged={onPendingChanged} />
          {!disabled && (
            <button type="button" onClick={() => remove(r.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Step 7 — Workmanship / Defects ───────────────────────────────────────────
function DefectTable({ reportId, defects, disabled, onChanged, photos, onPhotosChanged, draftId, pendingPhotos, onPendingChanged }) {
  const [rows, setRows] = useState(defects || [])
  useEffect(() => setRows(defects || []), [defects])

  const add = async () => {
    const { data, error } = await addDefectRow({ report_id: reportId, defect_description: '', critical_count: 0, major_count: 0, minor_count: 0 })
    if (!error) { setRows(prev => [...prev, data]); onChanged?.() }
  }
  const edit = (id, field, value) => setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)))
  const commit = async (id, field, value) => { await updateDefectRow(id, { [field]: value }); onChanged?.() }
  const remove = async (id) => { await deleteDefectRow(id); setRows(prev => prev.filter(r => r.id !== id)); onChanged?.() }

  const totals = rows.reduce((acc, r) => ({
    critical: acc.critical + Number(r.critical_count || 0),
    major:    acc.major    + Number(r.major_count || 0),
    minor:    acc.minor    + Number(r.minor_count || 0),
  }), { critical: 0, major: 0, minor: 0 })

  return (
    <div className="space-y-2">
      {/* Mobile: one DefectCard per row instead of the table's horizontal
          scroll - typing into a mid-horizontal-scroll input is genuinely
          awkward (the field can be half off-screen while focused, and
          mobile browsers' scroll-into-view-on-focus fights a manually
          scrolled ancestor). Every add/edit/commit/remove handler below is
          reused verbatim - this is purely a presentation change. */}
      <div className="sm:hidden space-y-2">
        {rows.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6 border border-gray-200 rounded-lg">No defects recorded</p>
        )}
        {rows.map(r => (
          <DefectCard
            key={r.id}
            r={r}
            disabled={disabled}
            edit={edit}
            commit={commit}
            remove={remove}
            reportId={reportId}
            photos={photos}
            onPhotosChanged={onPhotosChanged}
            draftId={draftId}
            pendingPhotos={pendingPhotos}
            onPendingChanged={onPendingChanged}
          />
        ))}
        {rows.length > 0 && (
          <div className="flex items-center justify-between px-1 pt-1 text-[11px] font-bold text-gray-500">
            <span>Total</span>
            <span>{totals.critical}C · {totals.major}M · {totals.minor}mi</span>
          </div>
        )}
      </div>
      <div className="hidden sm:block border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-xs min-w-[480px]">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-[10px] uppercase tracking-wide">
              <th className="text-left px-3 py-2 font-bold">Defect</th>
              <th className="px-2 py-2 font-bold w-16">Critical</th>
              <th className="px-2 py-2 font-bold w-16">Major</th>
              <th className="px-2 py-2 font-bold w-16">Minor</th>
              <th className="text-left px-3 py-2 font-bold">Remarks</th>
              <th className="w-12" />
              {!disabled && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-3 py-1.5">
                  <input value={r.defect_description || ''} disabled={disabled}
                    onChange={e => edit(r.id, 'defect_description', e.target.value)}
                    onBlur={e => commit(r.id, 'defect_description', e.target.value)}
                    className="w-full text-xs px-2 py-1 border border-gray-200 rounded disabled:bg-gray-50" />
                </td>
                {['critical_count', 'major_count', 'minor_count'].map(f => (
                  <td key={f} className="px-2 py-1.5">
                    <input type="number" min="0" value={r[f] ?? 0} disabled={disabled}
                      onChange={e => edit(r.id, f, e.target.value)}
                      onBlur={e => commit(r.id, f, Number(e.target.value) || 0)}
                      className="w-full text-xs px-2 py-1 border border-gray-200 rounded text-center disabled:bg-gray-50" />
                  </td>
                ))}
                <td className="px-3 py-1.5">
                  <input value={r.remarks || ''} disabled={disabled}
                    onChange={e => edit(r.id, 'remarks', e.target.value)}
                    onBlur={e => commit(r.id, 'remarks', e.target.value)}
                    className="w-full text-xs px-2 py-1 border border-gray-200 rounded disabled:bg-gray-50" />
                </td>
                <td className="px-2 py-1.5">
                  <RowPhotoCell reportId={reportId} stepKey={`defects:${r.id}`} photos={photos} disabled={disabled} onChanged={onPhotosChanged} draftId={draftId} pendingPhotos={pendingPhotos} onPendingChanged={onPendingChanged} />
                </td>
                {!disabled && (
                  <td className="px-2 py-1.5 text-center">
                    <button type="button" onClick={() => remove(r.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={disabled ? 6 : 7} className="px-3 py-4 text-center text-gray-400 text-xs">No defects recorded</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 font-bold text-gray-700">
              <td className="px-3 py-2">Total</td>
              <td className="px-2 py-2 text-center">{totals.critical}</td>
              <td className="px-2 py-2 text-center">{totals.major}</td>
              <td className="px-2 py-2 text-center">{totals.minor}</td>
              <td colSpan={disabled ? 2 : 3}></td>
            </tr>
          </tfoot>
        </table>
      </div>
      {!disabled && (
        <button type="button" onClick={add} className="text-xs font-semibold text-gray-600 hover:text-gray-900 inline-flex items-center gap-1">
          + Add defect
        </button>
      )}
    </div>
  )
}

// Inspection Level / Sample Size are governed by the PO-wide sampling plan
// (see src/lib/samplingPlan.js) once one is set: they get computed once and
// locked, rather than re-typed per SKU. A field that already carries a value
// (computed-then-saved, or manually entered before this feature existed)
// always displays as-is and locked; only an empty field falls back to manual
// entry, and only when no PO-level plan is set for this SKU's lot size.
// AQL Critical/Major/Minor are a fixed org policy (0 / 2.5 / 4.0) and are
// always locked, independent of whether a sampling plan resolves.
function WorkmanshipStep({ value, onChange, disabled, reportId, defects, onChanged, plan, aqlVerdict, photos, onPhotosChanged, draftId, pendingPhotos, onPendingChanged }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Inspection Level">
          {value.workmanship_inspection_level ? (
            <ReadOnlyValue value={value.workmanship_inspection_level} />
          ) : (
            <TSelect value={value.workmanship_inspection_level} onChange={v => onChange({ ...value, workmanship_inspection_level: v })} disabled={disabled}
              options={[{ value: 'G-I', label: 'G-I' }, { value: 'G-II', label: 'G-II' }, { value: 'G-III', label: 'G-III' }, { value: 'S-1', label: 'S-1' }, { value: 'S-2', label: 'S-2' }, { value: 'S-3', label: 'S-3' }, { value: 'S-4', label: 'S-4' }]} />
          )}
        </Field>
        <Field label="Sample Size">
          {value.workmanship_sample_size ? (
            <ReadOnlyValue value={value.workmanship_sample_size} />
          ) : (
            <TInput value={value.workmanship_sample_size} onChange={v => onChange({ ...value, workmanship_sample_size: v })} disabled={disabled} placeholder="e.g. F(20)" />
          )}
        </Field>
        <Field label="AQL Critical"><ReadOnlyValue value={value.aql_critical} /></Field>
        <Field label="AQL Major"><ReadOnlyValue value={value.aql_major} /></Field>
        <Field label="AQL Minor"><ReadOnlyValue value={value.aql_minor} /></Field>
      </div>
      {!value.workmanship_inspection_level && !plan && (
        <p className="text-[11px] text-gray-400">No inspection plan set for this PO - Inspection Level/Sample Size need manual entry until one is set.</p>
      )}
      {plan && (
        <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 space-y-1">
          <div>
            <span className="font-bold text-gray-600">Ac/Re reference: </span>
            Critical {plan.critical.ac}/{plan.critical.re}
            {plan.major && <> · Major {plan.major.ac}/{plan.major.re}</>}
            {plan.minor && <> · Minor {plan.minor.ac}/{plan.minor.re}</>}
          </div>
          {aqlVerdict && (
            <div className={aqlVerdict.result === 'rejected' ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
              AQL result: {aqlVerdict.result === 'rejected' ? 'Reject' : 'Accept'}
              {aqlVerdict.breaches.length > 0 && <> — {aqlVerdict.breaches.join('; ')}</>}
            </div>
          )}
        </div>
      )}
      <Field label="QC Observation"><RichTextArea value={value.workmanship_remarks} onChange={v => onChange({ ...value, workmanship_remarks: v })} disabled={disabled} /></Field>
      <div>
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Defects</div>
        {plan && (
          <div className="mb-2 text-[11px] text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 leading-relaxed">
            <span className="font-semibold text-gray-700">AQL allowance</span> for {Number(plan.sampleSize).toLocaleString()} inspected units:
            {' '}up to <b>{plan.critical.ac}</b> Critical{plan.major && <>, <b>{plan.major.ac}</b> Major</>}{plan.minor && <>, <b>{plan.minor.ac}</b> Minor</>} can be accepted.
          </div>
        )}
        {reportId ? (
          <DefectTable reportId={reportId} defects={defects} disabled={disabled} onChanged={onChanged} photos={photos} onPhotosChanged={onPhotosChanged}
            draftId={draftId} pendingPhotos={pendingPhotos} onPendingChanged={onPendingChanged} />
        ) : (
          <p className="text-xs text-gray-400">Save the inspection first to enable defect tracking.</p>
        )}
      </div>
    </div>
  )
}

// ── Step 8 — Digitals ─────────────────────────────────────────────────────────
// The `capture` attribute on a file input is only a hint mobile browsers
// honor — on desktop it just falls back to the same file picker as Upload.
// A real live camera view needs getUserMedia + a <video> feed, which works
// uniformly on both desktop (webcam) and mobile (rear camera via facingMode).
export function CameraCaptureModal({ onCapture, onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  // Tap-to-focus, like a phone's native camera app. Real hardware focus
  // control over getUserMedia is Chrome/Android-only in practice (iOS
  // Safari has no API for it at all - it always auto-focuses on its own,
  // with no override) - applyConstraints below is wrapped so it silently
  // no-ops everywhere else, but the tap ring itself always shows, so
  // there's still visible feedback even on devices where the actual focus
  // point can't be steered.
  const [focusRing, setFocusRing] = useState(null)   // null | { x, y, key, small }
  const focusRingTimersRef = useRef([])
  const handleTapFocus = (e) => {
    const video = videoRef.current
    const track = streamRef.current?.getVideoTracks?.()[0]
    if (!video) return
    const rect = video.getBoundingClientRect()
    const xPct = (e.clientX - rect.left) / rect.width
    const yPct = (e.clientY - rect.top) / rect.height
    focusRingTimersRef.current.forEach(clearTimeout)
    const key = Date.now()
    setFocusRing({ x: e.clientX - rect.left, y: e.clientY - rect.top, key, small: false })
    // Two-phase CSS transition (not a @keyframes animation, which would
    // need registering in the Tailwind config for a one-off effect) -
    // shrink+fade starts a beat after mount, then the ring is cleared once
    // that transition finishes.
    focusRingTimersRef.current = [
      setTimeout(() => setFocusRing(r => (r?.key === key ? { ...r, small: true } : r)), 30),
      setTimeout(() => setFocusRing(r => (r?.key === key ? null : r)), 630),
    ]
    if (track && xPct >= 0 && xPct <= 1 && yPct >= 0 && yPct <= 1) {
      const caps = track.getCapabilities?.() || {}
      const advanced = []
      if (caps.pointsOfInterest) advanced.push({ pointsOfInterest: [{ x: xPct, y: yPct }] })
      if (Array.isArray(caps.focusMode) && caps.focusMode.includes('single-shot')) advanced.push({ focusMode: 'single-shot' })
      if (advanced.length) track.applyConstraints({ advanced }).catch(() => {})
    }
  }
  useEffect(() => () => focusRingTimersRef.current.forEach(clearTimeout), [])

  // Without a history entry of its own, this modal is invisible to
  // back-navigation - any device's swipe-back/hardware-back/browser-back
  // gesture instead navigates the page underneath it, leaving the camera
  // overlay (and its live stream) stuck on top with no way out except the
  // small X. Pushing a state on mount makes that gesture pop this state
  // first; popstate then closes the modal like the X would. If the modal
  // instead closes some other way (X, backdrop, a successful capture), the
  // pushed entry is consumed with history.back() so it doesn't leave a
  // dangling "phantom" back-stack entry for a later, unrelated back press to
  // hit. Plain History API - no device/browser-specific branching.
  //
  // pushedRef/popTimerRef exist specifically for React StrictMode (enabled
  // app-wide, see main.jsx): it double-invokes this effect synchronously on
  // mount (mount -> cleanup -> mount again) as a dev-only check. Without
  // these guards, the FIRST pass's cleanup calls history.back() - its
  // popstate event lands asynchronously, after the SECOND pass's listener
  // is already attached, so it's misread as a real back-navigation and
  // closes the modal an instant after it (re)opens (confirmed bug: modal
  // flashing open for a fraction of a second then vanishing). Refs survive
  // the double-invoke (only effects re-run, not refs), so: only push once
  // ever (pushedRef), and defer the actual back() by a tick (popTimerRef) -
  // a synchronous remount (StrictMode's second pass) cancels the pending
  // pop before it fires; only a genuine final unmount lets it through.
  const pushedRef = useRef(false)
  const popTimerRef = useRef(null)
  useEffect(() => {
    if (!pushedRef.current) {
      window.history.pushState({ cameraModal: true }, '')
      pushedRef.current = true
    }
    if (popTimerRef.current) { clearTimeout(popTimerRef.current); popTimerRef.current = null }
    let poppedByUser = false
    const handlePopState = () => { poppedByUser = true; onClose() }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      if (poppedByUser) return
      popTimerRef.current = setTimeout(() => {
        popTimerRef.current = null
        if (pushedRef.current) { pushedRef.current = false; window.history.back() }
      }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Same StrictMode double-invoke problem the history-push effect below
  // already guards against (mount -> cleanup -> mount, synchronous, in dev)
  // - without a guard here, it calls getUserMedia() TWICE in the same tick.
  // On most devices/cameras the second call just quietly wins once the
  // first's stream gets stopped on resolution, but on some hardware/driver
  // combinations two near-simultaneous open requests to the same physical
  // camera genuinely collide and one fails outright with "Device in use"
  // (confirmed live). acquireStartedRef/releaseTimerRef mirror
  // pushedRef/popTimerRef's exact pattern: only ever call getUserMedia
  // once per real mount, and defer the actual release/reset by a tick so a
  // synchronous StrictMode remount cancels it before the camera is ever
  // actually released or re-requested.
  const acquireStartedRef = useRef(false)
  const streamCancelledRef = useRef(false)
  const releaseTimerRef = useRef(null)
  useEffect(() => {
    if (releaseTimerRef.current) { clearTimeout(releaseTimerRef.current); releaseTimerRef.current = null }
    streamCancelledRef.current = false
    if (!acquireStartedRef.current) {
      acquireStartedRef.current = true
      // No resolution constraint here defaulted to whatever low resolution a
      // given camera (especially a laptop webcam) happens to pick on its own -
      // often well under 1MP, which then gets stretched to fill a much larger
      // grid tile, reading as blur. `ideal` is a soft preference, not a hard
      // requirement, so devices that can't reach 1080p still connect fine at
      // whatever their best resolution is instead of failing outright.
      navigator.mediaDevices?.getUserMedia?.({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })
        .then(stream => {
          if (streamCancelledRef.current) { stream.getTracks().forEach(t => t.stop()); return }
          streamRef.current = stream
          if (videoRef.current) videoRef.current.srcObject = stream
          setReady(true)
        })
        .catch(err => setError(err?.message || 'Could not access the camera. Check your browser/device permissions.'))
    }
    return () => {
      releaseTimerRef.current = setTimeout(() => {
        releaseTimerRef.current = null
        streamCancelledRef.current = true
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        acquireStartedRef.current = false
      }, 0)
    }
  }, [])

  const capture = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      if (blob) onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.92)
  }

  // No vh/dvh-based height anywhere here on purpose - a previous version
  // capped this modal's box at max-h-[92dvh], centered inside a padded
  // overlay, which still failed on a real Android tablet (confirmed live:
  // dvh isn't reliably supported/applied on every tablet browser, and once
  // that cap silently doesn't take effect, there's nothing left stopping
  // the box from growing past the real screen, pushing the header AND
  // shutter button off both edges with no way to reach either). This
  // version fills the fixed overlay directly instead - flex-col against
  // `fixed inset-0`'s own real, browser-computed box, not a calculated
  // length in some viewport unit that a given browser may or may not
  // honor. The header and shutter-button footer are flex-shrink-0, so they
  // always get the space they need on any screen size/orientation; the
  // video area (flex-1 min-h-0) just takes whatever's left.
  // Portaled to document.body - this full-screen capture surface is invoked
  // from deep inside step components (RowPhotoCell, itself nested many
  // levels inside the wizard's own scrollable panels), so without a portal
  // it's at risk of being clipped/mis-positioned the moment any ancestor
  // between here and the document root gains a CSS transform (the exact bug
  // class already fixed for other modals across this app, e.g.
  // InspectionScheduleForm.jsx's own comment on this) - it just hasn't been
  // hit live yet for this one.
  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4 bg-white border-b border-gray-100 flex-shrink-0">
        <span className="text-sm sm:text-base font-bold text-gray-900">Take Photo</span>
        <button type="button" onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <div className="relative bg-black flex-1 min-h-0 flex items-center justify-center">
        {error ? (
          <p className="text-sm text-red-400 px-6 text-center">{error}</p>
        ) : (
          // object-contain letterboxed the feed with black bars whenever the
          // camera's actual stream aspect ratio didn't match the full-screen
          // viewfinder's own shape (common on tablets - the requested ideal
          // 1920x1080 landscape stream isn't always what the hardware
          // actually delivers). object-cover fills the viewfinder completely
          // instead, cropping any excess rather than letterboxing it - the
          // standard trade-off a full-bleed camera view makes (same choice
          // any phone camera app's own viewfinder makes).
          //
          // absolute+inset-0 instead of w-full/h-full - confirmed live on a
          // real Android tablet that w-full/h-full (percentage sizing off
          // the flex parent) still left the <video> element's own rendered
          // box short of the parent's actual size in one axis depending on
          // orientation (portrait: bars left/right; landscape: bars top/
          // bottom - the axis that came up short flipped with orientation,
          // but never went away), even with object-cover correctly set -
          // some Android WebView/tablet browser builds don't reliably
          // resolve a <video>'s percentage height/width against a flex
          // parent's computed (not explicit) size. Absolute positioning
          // against the `relative` parent right below resolves against its
          // real box in every browser engine, no flex-percentage ambiguity
          // left for object-cover to ever be undermined by.
          <video ref={videoRef} autoPlay playsInline muted onClick={handleTapFocus} className="absolute inset-0 w-full h-full object-cover cursor-crosshair" />
        )}
        {focusRing && (
          <div
            key={focusRing.key}
            className={`absolute rounded-full border-2 border-white/90 pointer-events-none transition-all duration-500 ease-out ${focusRing.small ? 'w-10 h-10 -ml-5 -mt-5 opacity-0' : 'w-20 h-20 -ml-10 -mt-10 opacity-100'}`}
            style={{ left: focusRing.x, top: focusRing.y }}
          />
        )}
      </div>
      {/* Tablet/desktop (sm and up): the shutter floats over the bottom of the
          live view so the picture fills the whole screen down to the bottom
          edge; below sm (phones) the white footer bar is unchanged. */}
      <div className="flex items-center justify-center px-5 py-4 bg-white border-t border-gray-100 flex-shrink-0 sm:absolute sm:bottom-0 sm:inset-x-0 sm:py-5 sm:bg-transparent sm:border-t-0 sm:pointer-events-none">
        <button type="button" onClick={capture} disabled={!ready || !!error} title="Capture"
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-gray-900 bg-white hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors sm:pointer-events-auto sm:border-white sm:bg-white/25 sm:hover:bg-white/45 sm:shadow-lg" />
      </div>
    </div>,
    document.body
  )
}

// Exported for reuse by InspectionReportEntry.jsx's bulk-accept photo gate —
// same upload mechanism (storage bucket + inspection_report_photos row),
// just invoked from a plain SKU list instead of the wizard's Digitals step.
export const PhotoGrid = forwardRef(function PhotoGrid({ reportId, photos, disabled, onChanged, onSelectStateChange, draftId, pendingPhotos, onPendingChanged }, ref) {
  const [rows, setRows] = useState(photos || [])
  const [uploading, setUploading] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  useEffect(() => setRows(photos || []), [photos])
  // Digitals' own pending photos - offlineDrafts.js's pendingPhotos store is
  // shared with RowPhotoCell (Packaging/Measurement/Defects rows), which
  // tag theirs with a real stepKey; Digitals photos aren't tied to any one
  // row, so they're the ones with stepKey: null.
  const pendingRows = (pendingPhotos || []).filter(p => p.stepKey == null)
  // One merged list so select/delete/lightbox all operate over both kinds
  // uniformly - `kind` distinguishes a real inspection_report_photos row
  // (deletable via deletePhotoRow, has a caption) from a locally-staged one
  // (deletable via removePendingPhoto, no caption - there's no DB row yet
  // to attach one to). IDs don't collide across the two (server UUIDs vs
  // client-generated photoIds), so one Set of selected ids works for both.
  const merged = [
    ...sortPhotosInSequence(rows).map(p => ({ kind: 'synced', id: p.id, url: getInspectionFileUrl(p.storage_path), stepLabel: p.step_key ? (STEP_KEY_LABEL[p.step_key.split(':')[0]] || p.step_key) : null, caption: p.caption })),
    ...pendingRows.map(p => ({ kind: 'pending', id: p.photoId, url: URL.createObjectURL(p.blob) })),
  ]

  // Bulk-select mode - "Select"/"Delete (n)" live in the Digitals section's
  // header action slot (a sibling of this grid, not a child), so the mode/
  // selection itself is exposed upward via onSelectStateChange + an
  // imperative ref instead of owned by whatever renders that header.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  useEffect(() => { onSelectStateChange?.({ selectMode, count: selectedIds.size, total: merged.length }) }, [selectMode, selectedIds, merged.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggleSelected = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  useImperativeHandle(ref, () => ({
    toggleSelectMode: () => setSelectMode(v => {
      if (v) setSelectedIds(new Set())
      return !v
    }),
    toggleSelectAll: () => setSelectedIds(prev => (prev.size === merged.length ? new Set() : new Set(merged.map(r => r.id)))),
    deleteSelected: async () => {
      const ids = [...selectedIds]
      if (!ids.length) return
      const syncedIds = ids.filter(id => rows.some(r => r.id === id))
      const pendingIds = ids.filter(id => pendingRows.some(p => p.photoId === id))
      await Promise.all([
        ...syncedIds.map(id => deletePhotoRow(id)),
        ...pendingIds.map(id => removePendingPhoto(id)),
      ])
      setRows(prev => prev.filter(r => !syncedIds.includes(r.id)))
      setSelectedIds(new Set())
      setSelectMode(false)
      if (syncedIds.length) onChanged?.()
      if (pendingIds.length) onPendingChanged?.()
    },
  }))

  // Each file is handled independently so one failure (bad network, a
  // storage/RLS rejection) doesn't silently swallow the rest of the batch —
  // previously an unhandled rejection here meant a failed photo just never
  // appeared, with no indication anything had gone wrong. No report row
  // yet, or the upload itself fails (most likely no connectivity), stages
  // the file locally instead - same fallback RowPhotoCell.handleUpload uses.
  const handleFiles = async (files) => {
    if (!files?.length) return
    setUploading(true)
    setUploadError(null)
    let queuedAny = false
    for (const file of sortFilesInSequence(files)) {
      try {
        if (!reportId) throw new Error('offline')
        const path = await uploadToInspectionBucket(file, `${reportId}/photos`)
        const { data, error } = await addPhotoRow({ report_id: reportId, storage_path: path })
        if (error) throw error
        setRows(prev => sortPhotosInSequence([...prev, data]))
      } catch {
        // PLAN OFFLINE (disabled): no local staging - tell the user why instead.
        if (!PLAN_OFFLINE_ENABLED) {
          setUploadError(offlineOffMessage('add photos', reportId))
          continue
        }
        try {
          await addPendingPhoto({ photoId: crypto.randomUUID(), draftId, stepKey: null, blob: file, fileName: file.name })
          queuedAny = true
        } catch (queueErr) {
          setUploadError(queueErr?.message || 'Could not save photo')
        }
      }
    }
    onChanged?.()
    if (queuedAny) onPendingChanged?.()
    setUploading(false)
  }
  const remove = async (id) => { await deletePhotoRow(id); setRows(prev => prev.filter(r => r.id !== id)); onChanged?.() }
  const removePending = async (id) => { await removePendingPhoto(id); onPendingChanged?.() }
  const editCaption = (id, caption) => setRows(prev => prev.map(r => (r.id === id ? { ...r, caption } : r)))
  const commitCaption = async (id, caption) => { await updatePhotoRow(id, { caption }); onChanged?.() }

  return (
    <div className="space-y-3">
      {merged.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {merged.map(p => (
            <div key={p.id} className={`rounded-lg overflow-hidden border bg-gray-50 group ${p.kind === 'pending' ? 'border-amber-300' : 'border-gray-200'}`}>
              <div
                className={`relative aspect-square ${!disabled && selectMode ? 'cursor-pointer' : 'cursor-zoom-in'}`}
                onClick={() => {
                  if (!disabled && selectMode) toggleSelected(p.id)
                  else setLightboxIndex(merged.findIndex(r => r.id === p.id))
                }}
              >
                <img src={p.url} alt="" className="w-full h-full object-cover" />
                {p.stepLabel && (
                  <span className="absolute top-0 left-0 right-0 px-1.5 py-1 text-[9px] font-bold text-white bg-black/55 truncate">
                    {p.stepLabel}
                  </span>
                )}
                {p.kind === 'pending' && (
                  <span title="Not yet synced - will upload automatically once back online"
                    className="absolute bottom-1 left-1 w-3 h-3 rounded-full bg-amber-400 border border-white" />
                )}
                {!disabled && selectMode && (
                  <span className={`absolute top-1 left-1 sm:top-1.5 sm:left-1.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 flex items-center justify-center
                    ${selectedIds.has(p.id) ? 'bg-gray-900 border-gray-900' : 'bg-white/80 border-gray-300'}`}>
                    {selectedIds.has(p.id) && <svg className="w-2.5 h-2.5 sm:w-[11px] sm:h-[11px]" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
                  </span>
                )}
                {!disabled && !selectMode && (
                  <button type="button" onClick={e => { e.stopPropagation(); p.kind === 'pending' ? removePending(p.id) : remove(p.id) }}
                    className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 w-6 h-6 sm:w-11 sm:h-11 flex items-center justify-center rounded-full bg-black/60 text-white">
                    <svg className="w-3 h-3 sm:w-[22px] sm:h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                )}
              </div>
              {/* No caption field for a pending photo - there's no DB row
                  yet for updatePhotoRow to write it to; it becomes
                  available once this photo actually syncs. */}
              {p.kind === 'synced' ? (
                <input
                  type="text"
                  placeholder="Remarks"
                  value={p.caption || ''}
                  disabled={disabled}
                  onChange={e => editCaption(p.id, e.target.value)}
                  onBlur={e => commitCaption(p.id, e.target.value)}
                  className="w-full text-[11px] px-2 py-1.5 border-t border-gray-200 bg-white disabled:bg-gray-50 disabled:opacity-50 focus:outline-none focus:bg-gray-50"
                />
              ) : (
                <div className="w-full text-[10px] px-2 py-1.5 border-t border-amber-200 bg-amber-50 text-amber-700 font-semibold">Queued</div>
              )}
            </div>
          ))}
        </div>
      )}
      {!disabled && !selectMode && (
        <div className="flex gap-2">
          <label className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg py-4 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors text-xs text-gray-500">
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => handleFiles(Array.from(e.target.files || []))} />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            {uploading ? 'Uploading…' : 'Upload'}
          </label>
          <button type="button" onClick={() => setShowCamera(true)}
            className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg py-4 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors text-xs text-gray-500">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
            {uploading ? 'Uploading…' : 'Take Photo'}
          </button>
        </div>
      )}
      {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
      {showCamera && (
        <CameraCaptureModal
          onClose={() => setShowCamera(false)}
          onCapture={file => { setShowCamera(false); handleFiles([file]) }}
        />
      )}
      {lightboxIndex != null && (
        <ImageLightbox
          images={merged.map(r => r.url)}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
})

// ── Step 9 — Sign-off ─────────────────────────────────────────────────────────
const SIGNERS = [
  { key: 'vendor_rep', label: 'Vendor Representative' },
  { key: 'quality_process_auditor', label: 'Quality Process Auditor' },
]

function SignOffStep({ value, onChange, attachments, onUploadAttachment, onRemoveAttachment, reportId, disabled, newRemark, setNewRemark, sigModes, setSigModes, blockAccepted }) {
  const addRemark = () => {
    if (!newRemark.trim()) return
    onChange({ ...value, remarks: [...value.remarks, newRemark.trim()] })
    setNewRemark('')
  }
  const removeRemark = (i) => onChange({ ...value, remarks: value.remarks.filter((_, idx) => idx !== i) })
  const editRemark = (i, text) => onChange({ ...value, remarks: value.remarks.map((r, idx) => idx === i ? text : r) })
  const remarkRequired = RESULTS_REQUIRING_REMARK.includes(value.inspection_result)
  const remarkMissing = remarkRequired && value.remarks.length === 0
  // A failed check anywhere on this SKU rules out a clean "Accepted" outcome
  // - Partially Accepted / Accepted with deviations / Rejected and the
  // workflow states all stay available, since those are exactly the honest
  // ways to record a result that isn't a clean pass.
  const resultOptions = blockAccepted ? INSPECTION_RESULT_OPTIONS.filter(o => o.value !== 'accepted') : INSPECTION_RESULT_OPTIONS

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Overall Result</label>
        <div className="flex items-center gap-2">
          <TSelect value={value.inspection_result} onChange={v => onChange({ ...value, inspection_result: v })} disabled={disabled}
            options={resultOptions} />
          {value.inspection_result && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${RESULT_BADGE_CLASS[value.inspection_result]}`}>
              {RESULT_LABEL[value.inspection_result] || value.inspection_result}
            </span>
          )}
        </div>
        {blockAccepted && !disabled && (
          <p className="text-[11px] text-amber-600 mt-1.5">A check failed somewhere on this SKU, so a clean "Accepted" isn't offered - pick the outcome that actually reflects it.</p>
        )}
      </div>

      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Remarks{remarkRequired && <span className="text-red-500 normal-case tracking-normal font-semibold"> · required — explain this result</span>}
        </label>
        {remarkMissing && (
          <p className="text-xs text-red-600 mb-2">Add a remark explaining why this result isn't a clean Accepted.</p>
        )}
        <div className="space-y-1.5 mb-2">
          {value.remarks.map((r, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">
              <span className="flex-shrink-0 text-gray-400">{i + 1}.</span>
              {disabled ? (
                <span className="flex-1">{r}</span>
              ) : (
                <input
                  value={r}
                  onChange={e => editRemark(i, e.target.value)}
                  className="flex-1 bg-transparent focus:outline-none focus:bg-white rounded px-1 -mx-1"
                />
              )}
              {!disabled && (
                <button type="button" onClick={() => removeRemark(i)} className="text-gray-300 hover:text-red-500 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
        {!disabled && (
          <div className="flex gap-2">
            <input value={newRemark} onChange={e => setNewRemark(e.target.value)} placeholder="Add a remark…"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRemark() } }}
              className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900" />
            <button type="button" onClick={addRemark} className="px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 transition-colors">Add</button>
          </div>
        )}
      </div>

      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Attachments</label>
        <div className="space-y-1.5 mb-2">
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">
              <span className="flex-1 truncate">{a.name}</span>
              {!disabled && (
                <button type="button" onClick={() => onRemoveAttachment(i)} className="text-gray-300 hover:text-red-500 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
        {!disabled && (
          reportId ? (
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="file" multiple className="hidden" onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) onUploadAttachment(files) }} />
              + Upload attachment
            </label>
          ) : <p className="text-xs text-gray-400">Save the inspection first to enable attachments.</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {SIGNERS.map(({ key, label }) => {
          const nameField = `${key}_name`
          const sigField  = `${key}_signature`
          const stored  = value[sigField] || ''
          const isImage = stored.startsWith('data:')
          return (
            <div key={key}>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</label>
              <input value={value[nameField] || ''} disabled={disabled} placeholder="Name"
                onChange={e => {
                  onChange({ ...value, [nameField]: e.target.value })
                  // Vendor Representative here is the same person Inspection
                  // Details' own "Vendor Representative Name" field asks for -
                  // mirror it there too instead of making the inspector type
                  // the same name twice, whichever step they happen to fill first.
                }}
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg mb-2 disabled:bg-gray-50 focus:outline-none focus:border-gray-900" />
              {disabled ? (
                stored
                  ? (isImage
                    ? <img src={stored} alt="" className="h-12 object-contain" />
                    : <p className="text-lg text-gray-900" style={{ fontFamily: "'Dancing Script', cursive" }}>{stored}</p>)
                  : <p className="text-xs text-gray-400">No signature</p>
              ) : (
                <SignaturePad
                  mode={sigModes[key]}
                  onModeChange={m => setSigModes(prev => ({ ...prev, [key]: m }))}
                  typedValue={isImage ? '' : stored}
                  onTypedChange={v => onChange({ ...value, [sigField]: v })}
                  imageValue={isImage ? stored : ''}
                  onImageChange={v => onChange({ ...value, [sigField]: v })}
                  typedPlaceholder="Full name"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Exact preview of the PDF this report would export as - built server-side
// now (Phase 3, see inspectionReportPdfApi.js) so what's shown here is
// byte-for-byte what "Download PDF" produces. No longer auto-generated on
// open: Preview is real server-side work (still has to fetch every
// original photo before it can downscale one), so Download stays reachable
// on its own via the choice box below instead of waiting behind it - same
// reasoning as ExportPicker's own choice box in InspectionReportEntry.jsx.
function PreviewStep({ po, report }) {
  const [state, setState] = useState({ loading: false, url: null, error: null, showChoice: !!report?.id })
  const [downloading, setDownloading] = useState(false)
  const urlRef = useRef(null)

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  const handlePreview = async () => {
    setState(s => ({ ...s, loading: true, error: null, showChoice: false }))
    try {
      const { fetchInspectionReportPdf } = await import('../../../lib/inspectionReportPdfApi')
      const { blob } = await fetchInspectionReportPdf(po.id, [report.id], { mode: 'preview' })
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setState({ loading: false, url, error: null, showChoice: false })
    } catch (err) {
      setState({ loading: false, url: null, error: err.message || 'Failed to generate preview', showChoice: false })
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const { fetchInspectionReportPdf, downloadBlob } = await import('../../../lib/inspectionReportPdfApi')
      const { blob, filename } = await fetchInspectionReportPdf(po.id, [report.id], { mode: 'final' })
      downloadBlob(blob, filename)
    } catch (err) {
      setState(s => ({ ...s, error: err.message || 'Failed to download report' }))
    } finally {
      setDownloading(false)
    }
  }

  if (!report?.id) {
    return <p className="text-sm text-gray-400">Save at least one step before previewing the report.</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-400">Exact preview of the PDF this report will export as.</p>
        {!state.showChoice && (
          <button type="button" onClick={handleDownload} disabled={downloading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black disabled:opacity-50 transition-colors">
            {downloading && <Spinner size="w-3.5 h-3.5" />}
            {downloading ? 'Downloading…' : 'Download PDF'}
          </button>
        )}
      </div>
      <p className="text-xs font-bold text-red-600 mb-3">*TO EDIT THE FIELDS PLEASE REFER TO THE ABOVE STEPS*</p>
      {state.showChoice && (
        <ExportChoiceBox disabled={downloading} onPreview={handlePreview} onDownload={handleDownload} />
      )}
      {state.loading && <div className="flex items-center justify-center h-[75vh]"><Spinner /></div>}
      {state.error && <p className="text-xs text-red-500">{state.error}</p>}
      {state.url && <iframe src={state.url} title="QC Report Preview" className="w-full h-[75vh] border border-gray-200 rounded-lg" />}
    </div>
  )
}

// Shown at submit time whenever a genuine leftover quantity exists (some of
// the SKU's order was never covered by this round - either "remaining" from
// a short-accepted/rejected schedule entry, or "neverInspected" units that
// were never even presented) - instead of silently auto-booking a follow-up
// inspection every time, the inspector gets a real choice. `onChoose`
// receives 'reschedule' | 'cancel' | 'reject'.
function LeftoverQuantityModal({ quantity, onChoose, onClose, choosing }) {
  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={choosing ? undefined : onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="text-sm font-bold text-gray-900">{quantity} unit{quantity !== 1 ? 's' : ''} leftover</div>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            This much of the order wasn't covered by this inspection. What should happen to it?
          </p>
        </div>
        <div className="p-3 space-y-2">
          <button
            type="button"
            disabled={choosing}
            onClick={() => onChoose('reschedule')}
            className="w-full text-left px-3.5 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <div className="text-xs font-bold text-gray-900">Reschedule</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Book a follow-up inspection for the leftover quantity - today's default behavior.</div>
          </button>
          <button
            type="button"
            disabled={choosing}
            onClick={() => onChoose('cancel')}
            className="w-full text-left px-3.5 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <div className="text-xs font-bold text-gray-900">Cancel this quantity</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Request cancelling the leftover from the order - goes through the usual approval before it's final.</div>
          </button>
          <button
            type="button"
            disabled={choosing}
            onClick={() => onChoose('reject')}
            className="w-full text-left px-3.5 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <div className="text-xs font-bold text-gray-900">Reject this quantity</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Marks the leftover as rejected without a physical inspection - no follow-up visit needed.</div>
          </button>
        </div>
        {choosing && (
          <div className="px-5 pb-4 flex items-center gap-2 text-xs text-gray-400">
            <Spinner size="w-3.5 h-3.5" /> Applying…
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

// Shown every time Submit Inspection is clicked, before anything is saved or
// any follow-up round is booked - a submit has real downstream effects (it
// records the verdict and, on a rejection, books the next round), so a
// mis-click or a repeat click needs one explicit confirmation. Spells out
// which PO/SKU/stage/result is about to go in, and lists the earlier
// submitted rounds at this same stage so a second identical submit is
// visibly a repeat rather than something to click through on autopilot.
function SubmitConfirmModal({ poNumber, skuRef, stageLabel, round, result, priorRounds, alreadySubmitted, submitting, onConfirm, onCancel }) {
  const resultLabel = RESULT_LABEL[result] || result
  const confirmClass = result === 'rejected' ? 'bg-red-600 hover:bg-red-700'
    : ACCEPTED_RESULTS.includes(result) ? 'bg-emerald-600 hover:bg-emerald-700'
    : 'bg-gray-900 hover:bg-gray-700'
  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={submitting ? undefined : onCancel} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="text-sm font-bold text-gray-900">Submit this inspection?</div>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            PO <span className="font-semibold text-gray-800">{poNumber || '-'}</span> · SKU <span className="font-semibold text-gray-800">{skuRef || '-'}</span>
            <br />
            {stageLabel} · Round {round}
          </p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            Will be submitted as
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${RESULT_BADGE_CLASS[result] || 'bg-gray-100 text-gray-700'}`}>{resultLabel}</span>
          </div>
          {result === 'rejected' && (
            <p className="text-[11px] text-gray-500 leading-relaxed">
              A rejection reschedules the next round automatically. You do not need to submit it again.
            </p>
          )}
          {RESCHEDULING_RESULTS.includes(result) && (
            <p className="text-[11px] text-gray-500 leading-relaxed">
              {resultLabel} closes this round and reschedules the next round automatically. To accept it later, inspect it again in the new round.
            </p>
          )}
          {alreadySubmitted && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800 leading-relaxed">
              This round was already submitted on {fmtDateTime(alreadySubmitted.submitted_at)} as {RESULT_LABEL[alreadySubmitted.result] || alreadySubmitted.result || 'a workflow state'}. Submitting again replaces that result.
            </div>
          )}
          {priorRounds.length > 0 && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-[11px] text-gray-600 leading-relaxed">
              <div className="font-semibold text-gray-700 mb-0.5">Earlier {stageLabel} rounds on this SKU</div>
              {priorRounds.map(r => (
                <div key={r.id}>Round {r.round ?? 1} · {RESULT_LABEL[r.inspection_result] || r.inspection_result || '-'} · {fmtDateTime(r.submitted_at)}</div>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 pb-4 flex items-center justify-end gap-2">
          <button type="button" disabled={submitting} onClick={onCancel}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors cursor-pointer">
            Cancel
          </button>
          <button type="button" disabled={submitting} onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40 transition-colors cursor-pointer ${confirmClass}`}>
            Yes, submit as {resultLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Main wizard ────────────────────────────────────────────────────────────────
export default function InspectionForm({ lineItem, reportId: initialReportId, inspectionType, initialStep, onStepChange, locked, userName, memberId, canManage, onClose, stepNavContainer, closeWizardToken, stageSwitchToken, onStageFlushed, poInspectionLevel, reports, scheduleByStage, po, onSwitchStage, refresh }) {
  const [localId, setLocalId] = useState(initialReportId)
  // Self-heals if this SKU/stage's report already exists in `reports`
  // (fetched PO-wide by the parent) but wasn't known yet when this wizard
  // opened — e.g. a refresh landing here before that fetch had resolved.
  // Without this, a null initialReportId from that race is permanent: the
  // parent's restore effect that supplies it only ever runs once.
  useEffect(() => {
    if (localId || !reports?.length) return
    const existing = getStage(reports, lineItem.id, inspectionType)
    if (existing?.id) setLocalId(existing.id)
  }, [localId, reports, lineItem.id, inspectionType])
  const { report, loading: reportLoading, refresh: refreshReport } = useInspectionReportDetail(localId)
  const { skuMasterById, loading: skuLoading } = useSkuMasterData([lineItem.sku_id])
  const sku = skuMasterById[lineItem.sku_id]
  const category = sku?.categories
  // The schedule entry this report is fulfilling, if any (used to link a
  // newly-created report row via fulfilled_schedule_id, and to auto-schedule
  // any shortfall on submit) - scheduleByStage (PoInspectionComments.jsx's
  // getScheduleEntryForSku) already only returns an entry that covers this
  // exact SKU (either by name, or by being a whole-PO entry with no
  // line_items subset), so activeEntryCoversSku just reflects whether one
  // was found at all.
  const activeScheduleEntry = scheduleByStage?.(inspectionType, lineItem.id)
  const activeEntryCoversSku = !!activeScheduleEntry
  const activeEntryScheduledQty = activeEntryCoversSku
    ? (activeScheduleEntry.line_items?.find(x => x.id === lineItem.id)?.quantity ?? lineItem.quantity_ordered)
    : null
  // Ceiling for Available Qty on THIS round. getStageRollup only sums
  // SUBMITTED rounds, so a fresh draft round (this one, before its own
  // first save) is naturally excluded - no need to exclude it by id.
  //
  // A genuine leftover (order minus what every OTHER submitted round at
  // this stage already recorded as available, minus whatever's been
  // approved-cancelled off this SKU's order entirely) caps this round to
  // just that amount - a follow-up round opened to cover 75 of a 150 order
  // can't default to or be typed back up to the full order again, and
  // neither can an approved cancellation's units (CancelQuantityModal's
  // pipeline, apply_line_item_cancellation) still be typed in as if they
  // were never removed from the order. Round 1 of any stage with no
  // cancellation has no other submitted rounds yet, so this is just
  // quantity_ordered - the common single-round case is unaffected.
  //
  // Once prior rounds already cover the FULL (post-cancellation) order,
  // there's nothing genuinely "leftover" left to cap against - a fresh
  // round in that situation can only be a redo of the SAME already-covered
  // batch (a Rework-approved round, or a rejected stage's own
  // re-inspection), not a hunt for units nobody's seen yet. Capping that
  // redo down to 0 would wipe out Available/Accepted Qty (and by extension
  // the rework copy-forward's own values) for no reason - the redo gets the
  // full (still cancellation-adjusted) order ceiling back instead, same as
  // a brand-new round 1 would.
  // What is still unresolved of the order: order after cancellation minus the units the OTHER rounds of this
  // stage accepted (order 100, Round 1 accepted 70 -> Round 2 may have 30). The round being edited is
  // excluded so re-opening it never shrinks its own cap; when nothing is unresolved (a redo of an already
  // covered batch) the full order comes back.
  // While the report is still loading its own id is unknown, so no cap yet (it would count this very round).
  const maxAvailableQty = (localId && !report)
    ? orderAfterCancellation(lineItem)
    : roundAvailableCap(reports, lineItem, inspectionType, report?.id ?? null)
  // The AQL sampling plan (code letter, sample size, Accept/Reject
  // thresholds) is keyed off THIS round's actual available quantity
  // (maxAvailableQty above), not the SKU's full historical order quantity -
  // used to be lineItem.quantity_ordered unconditionally, which broke down
  // physically for a leftover/follow-up round: a 300-unit order with 192
  // already covered by an earlier round has only 108 units left to inspect,
  // but the old lot size still pulled a 216-unit sample plan out of AQL's
  // table for 300 - more than the batch physically sitting there. Falls
  // back to quantity_ordered only when maxAvailableQty itself couldn't be
  // computed (quantity_ordered missing entirely), matching maxAvailableQty's
  // own null case.
  //
  // Memoized so this stays reference-stable across renders when the inputs
  // haven't changed — resolveSamplingPlan builds a fresh object every call,
  // and it sits in the hydration effect's deps below; an unmemoized new
  // reference on every render would re-fire that effect after every render
  // (including the one from a user's own edit), silently reverting the
  // just-made change back to the last-saved value.
  const samplingPlan = useMemo(
    () => resolveSamplingPlan({ lotSize: maxAvailableQty ?? lineItem.quantity_ordered, inspectionLevel: poInspectionLevel }),
    [maxAvailableQty, lineItem.quantity_ordered, poInspectionLevel]
  )
  // The sample size shown next to the code letter always comes from the AQL chart (letter E = 13); the
  // quantity the schedule entry was booked for is NOT substituted into it (that produced "E (10)").
  const effectiveSamplingPlan = samplingPlan
  // Inspector Name is always whoever's actually assigned to inspect THIS
  // SKU's stage - never the logged-in user filling in the form on their
  // behalf (even an admin/tech member reviewing or entering data for
  // someone else), and never a different SKU's QA either. A PO can carry
  // more than one concurrent, non-cancelled entry for the same stage (a
  // stage split off to a different QA for just the still-open SKUs, or a
  // Rework-approved SKU getting its own fresh entry) - scheduleByStage
  // resolves the latest-dated entry among only the ones that actually cover
  // THIS SKU, so a newer entry scoped to other SKUs on the same stage can
  // never misattribute this one to a QA never assigned to it. Left blank
  // ('-' via ReadOnlyValue) when no entry covers this SKU at all, rather
  // than guessing - same reasoning as not falling back to userName. A schedule entry booked at a
  // LATER stage also covers every stage below it down to Inline (the same visit) - e.g. Final
  // scheduled with QA X means Inline, Midline and Final all show X, even though only Final has its
  // own entry - so this looks at the current stage first, then walks forward toward Final until it
  // finds one that covers this SKU. Never looks backward: an Inline-only assignment never reaches
  // Midline/Final.
  const qaSourceStage = STAGES
    .slice(STAGES.findIndex(s => s.key === inspectionType))
    .find(({ key }) => (key === inspectionType ? activeEntryCoversSku : !!scheduleByStage?.(key, lineItem.id)))
  const qaSourceEntry = qaSourceStage
    ? (qaSourceStage.key === inspectionType ? activeScheduleEntry : scheduleByStage?.(qaSourceStage.key, lineItem.id))
    : undefined
  // A schedule entry created to satisfy the NOT NULL assigned_qa_id column
  // (a real person as a stand-in, not a genuine assignment - see
  // isPlaceholderAssignment's own comment) never counts as "who's assigned"
  // here - Inspector Name stays blank, same as when no entry covers this SKU
  // at all, until a lead genuinely schedules/reassigns it to someone.
  const assignedQaName = isPlaceholderAssignment(qaSourceEntry) ? undefined : qaSourceEntry?.organization_members?.full_name
  // Ship Via carries forward from the most relevant earlier report for this SKU: this same
  // stage's immediately prior round first (a re-inspection), then walking backward through
  // Inline -> Midline -> Final. Inspection Date, Vendor Rep, Arrival, Start and Complete are
  // NOT carried: those are manual entry only.
  const carryForwardSource = useMemo(() => {
    const hasCarryableFields = r => r.ship_via
    const round = report?.round ?? 1
    const all = reports || []
    if (round > 1) {
      const prevRound = all.find(r => r.po_line_item_id === lineItem.id && r.inspection_type === inspectionType && (r.round ?? 1) === round - 1)
      if (prevRound && hasCarryableFields(prevRound)) return prevRound
    }
    const order = STAGES.map(s => s.key)
    const idx = order.indexOf(inspectionType)
    for (let i = idx - 1; i >= 0; i--) {
      const prior = getStage(all, lineItem.id, order[i])
      if (prior && hasCarryableFields(prior)) return prior
    }
    return null
  }, [reports, report?.round, lineItem.id, inspectionType])

  // All 10 sections render stacked on one page now (see the return below) -
  // `step` no longer gates which one is visible, it's just "the working
  // step" for last_step/autosave and for the strong (black) highlight in the
  // sidebar's Steps nav. Bumped on mount (from initialStep, for a
  // direct-to-section deep link), by the two checkpoint Save buttons, and by
  // clicking anywhere inside a section (see SectionBlock's onActivate below).
  const [step, setStep] = useState(() => {
    const idx = STEPS.findIndex(s => s.key === initialStep)
    return idx >= 0 ? idx : 0
  })
  // Which section the mouse is currently over - a lighter preview highlight
  // in the Steps nav, separate from `step`'s "committed" one. Cleared (not
  // just left stale) on mouse-leave so it never outlives the hover itself.
  const [hoveredStepIndex, setHoveredStepIndex] = useState(null)
  // Digitals' "Select"/"Delete (n)" controls live in the section header
  // (a sibling of PhotoGrid, not a child) - photoGridRef exposes
  // toggleSelectMode/deleteSelected imperatively, photoSelectState mirrors
  // PhotoGrid's own select-mode/count back up so the header buttons know
  // what to show.
  const photoGridRef = useRef(null)
  const [photoSelectState, setPhotoSelectState] = useState({ selectMode: false, count: 0, total: 0 })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveStatus, setSaveStatus] = useState('idle')   // idle | pending | saving | saved | error
  const [scrollBoxEl, setScrollBoxEl] = useState(null)
  // Offline status (Phase 4) - app-wide, not just this SKU's own queue
  // (see offlineDrafts.js's getPendingCount) - a QA who's been offline a
  // while may have queued changes across several SKUs/callouts at once.
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  // Phase 5 - true once the sync engine has hit an expired/invalid session
  // and paused every queue until a fresh login resumes it (see
  // offlineSync.js's isSyncPausedForAuth) - distinct from plain offline,
  // since re-connecting alone won't fix this, only logging back in will.
  const [authPausedForSync, setAuthPausedForSync] = useState(false)
  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline) }
  }, [])
  // Whether an edit is waiting to be persisted, and whether a save request is
  // currently in flight - refs rather than state since they're only read
  // inside the 1.5s tick/flushAutosave, never rendered directly (saveStatus
  // is the state that actually drives the UI).
  const autosaveDirtyRef = useRef(false)
  const autosaveInFlightRef = useRef(false)
  const skipNextAutosaveRef = useRef(true)   // don't autosave on initial mount / hydration
  // Offline-first local draft (see src/lib/offlineDrafts.js) - a stable key
  // for this exact SKU/stage/round independent of whether a server
  // inspection_reports row exists yet (localId can be null for a long
  // time, e.g. an inspector working with no signal at all). round defaults
  // to 1 before `report` loads - same assumption persistOrCreate's own
  // 23505 recovery lookup below already makes for a brand-new draft.
  const draftId = `${lineItem.id}:${inspectionType}:${report?.round ?? 1}`
  // Separate skip-on-mount flag from skipNextAutosaveRef above - sharing
  // one ref between two effects that both guard "don't run on mount" would
  // let whichever effect's cleanup/mount order runs first silently consume
  // the flag before the other gets to check it (the exact bug already hit
  // once this session with two auto-default effects in
  // InspectionScheduleForm.jsx sharing a ref - see that file's own
  // skipInitialStageAutoDefault comment).
  //
  // Still single-consume (skips exactly the write-back effect's next
  // firing, same role as skipNextAutosaveRef below) - but now paired with
  // localHydratedRef just below, which is what actually blocks writes
  // during mount. Two real bugs were found here via live repros before
  // landing on this shape:
  // 1. A single-consume flag ALONE only protected the FIRST of several
  //    mount-time writes (details/quantity seeded from props,
  //    packaging/measurement/workmanship seeded from sampling-plan
  //    defaults, etc. each fire their own effect) - the 2nd/3rd still wrote
  //    blank `remarks` (and everything else not yet restored), overwriting
  //    whatever this draft's IndexedDB record already had from before a
  //    reload. localHydratedRef fixes this: it blocks EVERY write until
  //    rehydration has actually run.
  // 2. Opening the write-back gate in the SAME tick rehydration sets state
  //    (the first fix's initial shape) let that state-setting's own
  //    resulting render write through as a REAL write - marking the draft
  //    dirty again immediately after a clean sync, even when the restored
  //    content was byte-identical to what the server already had ("Sync
  //    Now, reload, it's back" with nothing actually changed). Keeping
  //    skipLocalQueueRef itself untouched by rehydration (still `true`
  //    until the write-back effect's own single-consume check clears it)
  //    fixes this: rehydration's own render is treated the same as any
  //    other "not a user edit" hydration, not a fresh dirty edit.
  const skipLocalQueueRef = useRef(true)
  // Blocks the write-back effect entirely until local-draft rehydration has
  // actually run once for this draftId (found data and restored it, or
  // confirmed there was nothing to restore) - see point 1 above.
  const localHydratedRef = useRef(false)
  // Always-current copy of `report` for async callbacks that outlive the
  // render that created them. The local-draft rehydration effect below runs
  // once per draftId (at mount, when `report` is still null - it loads over
  // the network) and its getDraft().then() callback closes over THAT render's
  // `report`, so a plain `report?.status` check inside it always saw null and
  // the "server-authoritative once submitted" guard never actually applied.
  // Updated in an effect (not during render) to satisfy the hooks lint rules.
  const reportRef = useRef(report)
  useEffect(() => { reportRef.current = report }, [report])
  // The serialized patch this component itself last successfully wrote (or
  // restored via rehydration) - the write-back effect below compares
  // against this, not just its own dependency array, so a "change" that's
  // actually a no-op (same content, new object reference) never re-marks
  // the draft dirty. See the write-back effect's own comment.
  const lastWrittenPatchRef = useRef(null)
  // Debounce timer for the online auto-save below - a fresh edit reschedules
  // it rather than firing a request per keystroke.
  const autosaveTimerRef = useRef(null)
  // The save that is running right now (one at a time, shared by autosave, the header Save and the
  // flush on close), the latest render's save helpers (so a follow-up pass and the unmount save never
  // use a stale closure) and the "close anyway" flag after a failed flush.
  const savePromiseRef = useRef(null)
  const latestApiRef = useRef({})
  const flushRef = useRef(null)
  const closeAnywayRef = useRef(false)

  // Photos staged locally for this draft, not yet uploaded (Phase 3 -
  // offline photo capture) - loaded from IndexedDB rather than kept purely
  // as write-only state, since RowPhotoCell/PhotoGrid need to actually
  // render them (via URL.createObjectURL) while they wait to sync.
  const [pendingPhotos, setPendingPhotos] = useState([])
  const refreshPendingPhotos = () => {
    getPendingPhotosForDraft(draftId).then(setPendingPhotos).catch(() => {})
  }
  useEffect(() => {
    getPendingPhotosForDraft(draftId).then(setPendingPhotos).catch(() => {})
  }, [draftId])

  const [details, setDetails]         = useState(() => ({
    inspector_name: assignedQaName || '',
    arrival_time: '',
    start_time: '',
    complete_time: '',
    contact: '',
    inspection_date: '',
  }))
  const [quantity, setQuantity]       = useState(() => {
    // Both start seeded rather than blank: Available Quantity from the SKU's
    // real Balance (the inspector corrects it if what's actually on-site
    // differs), Inspection Quantity from the AQL sample size that Available
    // Quantity resolves to - same rule QuantityStep's setAvailableQuantity
    // applies on every subsequent edit, just run once here for the initial
    // value. Capped to maxAvailableQty when that's the stricter number - a
    // follow-up round (see the auto-reschedule mechanism further below)
    // should default to what's actually still outstanding (e.g. 75), not
    // the SKU's Balance (150, unchanged since Balance isn't decremented
    // per-inspection in this codebase).
    const rawSeed = lineItem.balance_quantity ?? maxAvailableQty ?? ''
    const availableQuantity = maxAvailableQty != null && rawSeed !== '' ? Math.min(Number(rawSeed), maxAvailableQty) : rawSeed
    return {
      ship_via: carryForwardSource?.ship_via || '',
      available_quantity: availableQuantity,
      inspected_qty: inspectionQtyForAvailable(availableQuantity, poInspectionLevel),
      // Defaults to Available Qty (the inspector edits it down if a
      // shortfall is actually found) rather than starting blank - matches
      // Inspection Quantity's own "seed from Available Qty" convention above.
      accepted_quantity: availableQuantity, carton_available: '',
    }
  })
  const [packaging, setPackaging]     = useState(() => seedPackagingResultDefaults(applyPackagingLevel({}, 'S-1', maxAvailableQty ?? lineItem.quantity_ordered), false))
  const [measurement, setMeasurement] = useState(() => seedMeasurementResultDefaults(seedMeasurementFromSpec({}, sku, false), false))
  const [barcodes, setBarcodes]       = useState(() => seedBarcodeResultDefaults({}, false))
  const [onsite, setOnsite]           = useState(() => seedOnsiteFromPlan({}, false))
  const [workmanship, setWorkmanship] = useState(() => ({
    workmanship_inspection_level: poInspectionLevel || '',
    workmanship_sample_size: effectiveSamplingPlan ? `${effectiveSamplingPlan.codeLetter} (${effectiveSamplingPlan.sampleSize})` : '',
    aql_critical: '0', aql_major: '2.5', aql_minor: '4.0', workmanship_remarks: '',
  }))
  const [signoff, setSignoff]         = useState({
    remarks: [], inspection_result: '',
    vendor_rep_name: '', vendor_rep_signature: '',
    quality_process_auditor_name: '', quality_process_auditor_signature: '',
    quality_resource_name: userName || '', quality_resource_signature: '',
  })
  const [attachments, setAttachments] = useState([])
  const [newRemark, setNewRemark]     = useState('')
  const [sigModes, setSigModes]       = useState({ vendor_rep: 'type', quality_process_auditor: 'type', quality_resource: 'type' })

  // Local-draft rehydration - restores THIS device's own prior local edits
  // for this exact draftId (typed offline, possibly never synced) into form
  // state on mount, before anything can write blank defaults over them.
  // `report` (the hydration effect right below this one) only ever reflects
  // the server's last-known state - for a SKU that's been edited offline
  // and never synced, or edited further offline after an earlier sync,
  // `report` has nothing newer to offer, so it was never going to restore
  // this. Runs once per draftId; every state slice falls back to whatever
  // was already computed for it (seeded defaults, report-derived values)
  // for any field the stored patch doesn't have an opinion on, rather than
  // blanking fields the patch happens to be missing.
  useEffect(() => {
    let cancelled = false
    // PLAN OFFLINE (disabled): never restore a local draft over what the
    // server has (a stale one was behind a real On Hold -> Accepted flip). The
    // write gate is simply opened so online autosave keeps working as normal.
    if (!PLAN_OFFLINE_ENABLED) { localHydratedRef.current = true; return }
    localHydratedRef.current = false
    getDraft(draftId).then(draft => {
      if (cancelled) return
      // This rehydration's own setState calls below aren't a user edit -
      // same reasoning/pattern as the report-based hydration effect further
      // down (skipNextAutosaveRef). Missing here was the actual bug: without
      // it, the render THIS effect's own setSignoff/etc below causes was the
      // one the online-autosave effect saw with localHydratedRef already
      // true (set at the end of this same callback), so it mistook restoring
      // a draft for a genuine edit and silently pushed it back to the server
      // ~1.5s later - see the inspection_result gate just below for the
      // other half of the same real incident (a stale local draft with
      // 'accepted' clobbering a report that was put 'on_hold' by someone
      // else in the meantime, then auto-saved right back as Accepted with
      // no user action at all).
      skipNextAutosaveRef.current = true
      const patch = draft?.patch
      if (patch && Object.keys(patch).length > 0) {
        // Baseline for the write-back effect's own no-op check - the
        // already-stored patch is what buildFullPatch() should reproduce
        // exactly once every slice below has actually applied, so treating
        // it as "last written" now means a same-content recomputation right
        // after (from this rehydration or any other effect) correctly
        // no-ops instead of re-marking dirty. `last_step` excluded here too,
        // matching the write-back effect's own comparison - see its comment.
        {
          const { last_step: _lastStep, ...comparableStored } = patch
          lastWrittenPatchRef.current = JSON.stringify(comparableStored)
        }
        setDetails(prev => ({
          inspector_name: patch.inspector_name ?? prev.inspector_name,
          arrival_time: patch.arrival_time ?? prev.arrival_time,
          start_time: patch.start_time ?? prev.start_time,
          complete_time: patch.complete_time ?? prev.complete_time,
          contact: patch.contact ?? prev.contact,
          inspection_date: patch.inspection_date ?? prev.inspection_date,
        }))
        setQuantity(prev => ({
          ship_via: patch.ship_via ?? prev.ship_via,
          available_quantity: patch.available_quantity ?? prev.available_quantity,
          inspected_qty: patch.inspected_qty ?? prev.inspected_qty,
          accepted_quantity: patch.accepted_quantity ?? prev.accepted_quantity,
          carton_available: patch.carton_available ?? prev.carton_available,
        }))
        if (patch.packaging_appearance) setPackaging(patch.packaging_appearance)
        if (patch.packaging_measurement_findings) setMeasurement(patch.packaging_measurement_findings)
        if (patch.barcode_results) setBarcodes(patch.barcode_results)
        if (patch.onsite_tests) setOnsite(patch.onsite_tests)
        setWorkmanship(prev => ({
          workmanship_inspection_level: patch.workmanship_inspection_level ?? prev.workmanship_inspection_level,
          workmanship_sample_size: patch.workmanship_sample_size ?? prev.workmanship_sample_size,
          aql_critical: patch.aql_critical ?? prev.aql_critical,
          aql_major: patch.aql_major ?? prev.aql_major,
          aql_minor: patch.aql_minor ?? prev.aql_minor,
          workmanship_remarks: patch.workmanship_remarks ?? prev.workmanship_remarks,
        }))
        setSignoff(prev => ({
          remarks: patch.remarks ?? prev.remarks,
          // Once the report is actually submitted, its inspection_result is
          // a real, server-recorded verdict (Accepted/On Hold/Rejected/...),
          // not just a draft-in-progress value - a local draft predating
          // that submission (e.g. typed before a Final got put On Hold by
          // someone else) is stale and must not silently override it. Only
          // trusted while the report is still genuinely a draft (not yet
          // submitted), which is exactly when this field legitimately
          // holds unsynced offline typing that's newer than the server.
          inspection_result: reportRef.current?.status === 'submitted' ? prev.inspection_result : (patch.inspection_result ?? prev.inspection_result),
          vendor_rep_name: patch.vendor_rep_name ?? prev.vendor_rep_name,
          vendor_rep_signature: patch.vendor_rep_signature ?? prev.vendor_rep_signature,
          quality_process_auditor_name: patch.quality_process_auditor_name ?? prev.quality_process_auditor_name,
          quality_process_auditor_signature: patch.quality_process_auditor_signature ?? prev.quality_process_auditor_signature,
          quality_resource_name: patch.quality_resource_name ?? prev.quality_resource_name,
          quality_resource_signature: patch.quality_resource_signature ?? prev.quality_resource_signature,
        }))
      }
      // Marks rehydration itself done, but deliberately does NOT open the
      // write-back gate (skipLocalQueueRef) here - that was the second half
      // of this same bug, found via a live repro: opening it in this same
      // tick let the write-back effect's very next firing (triggered by the
      // setState calls just above, even when they restore byte-identical
      // content) go through as a real write, marking the draft dirty again
      // immediately after a successful sync - "Sync Now, reload, it's back"
      // with nothing having actually changed. localHydratedRef only lifts
      // the "block every write" gate; skipLocalQueueRef (already `true`,
      // untouched here) still separately skips exactly the ONE write-back
      // render this rehydration itself causes, same role skipNextAutosaveRef
      // already plays for the report-based hydration effect below - only a
      // genuine EDIT after this point should ever mark it dirty again.
      localHydratedRef.current = true
    }).catch(() => { localHydratedRef.current = true }) // don't leave the gate stuck shut on a read failure
    return () => { cancelled = true }
    // Runs once per draftId only. The report's status is read through
    // reportRef (always current) rather than listed as a dependency, so a
    // report refresh never re-fires this rehydration.
  }, [draftId])

  // Hard hydration - a full, unconditional overwrite of every field's local
  // state from `report`. This is only actually correct the moment this
  // mounted instance's underlying report ROW genuinely changes identity (a
  // brand-new draft just got its first id, or - staying on the same
  // mounted SKU/stage instance - the round bumped via a reject/reschedule)
  // - never merely because the `report` object got a new reference with
  // the SAME id, which is exactly what happens on every ~1.5s autosave
  // round-trip once flushAutosave's refreshReport() lands. Keying this
  // effect on the OBJECT (the previous behavior, via a bare `report`
  // dependency) meant every single autosave echo re-derived every field
  // from its own last-saved copy and silently overwrote whatever had been
  // typed since - the root cause of Available Qty/Accepted Qty/the time
  // fields all seeming to randomly reset while the inspector was actively
  // editing them. Keying on `report?.id` (a primitive) instead means this
  // only fires on a genuine identity change; sku/carryForwardSource/
  // maxAvailableQty/etc. are still read fresh from the current closure
  // when it DOES fire (correct - a real hydration should use the latest
  // values), they just no longer independently trigger a re-fire on their
  // own. The two small effects right after this one cover the "a
  // dependency loaded/changed later and a couple of fields need to catch
  // up" cases this used to also handle, without the full-overwrite risk.
  useEffect(() => {
    if (!report) return
    skipNextAutosaveRef.current = true   // this hydration isn't a user edit — don't autosave it back
    // A blank field on an already-locked historical record must stay blank —
    // never backfill a computed value onto a submitted report just because a
    // field happens to be empty; only reports still being worked on prefill.
    // A submitted-but-non-verdict result (Plan Aborted/On Hold) stays
    // editable (see `disabled` below), so it still counts as "in progress"
    // here too, not locked.
    const isLocked = (report.status === 'submitted' && VERDICT_RESULTS.includes(report.inspection_result)) || !!locked
    setDetails({
      // Unlike the other fields below, this one is never user-editable
      // (always rendered read-only) - there's no "what the user actually
      // typed" to preserve on an in-progress report, so it should always
      // track the current assignment rather than freeze whatever it
      // happened to default to on an earlier save (e.g. before this field
      // read from the schedule's assigned QA at all). Only once actually
      // locked does it freeze to the real historical value. (Also kept
      // live afterward by its own small effect below, independent of this
      // one, in case the assignment changes without the report itself
      // changing identity.)
      inspector_name: isLocked ? (report.inspector_name || '') : (assignedQaName || ''),
      // Arrival/Start/Complete/Contact/Inspection Date: exactly what was saved on THIS report,
      // never carried over from another SKU or stage (manual entry only).
      arrival_time: report.arrival_time || '',
      start_time: report.start_time || '',
      complete_time: report.complete_time || '',
      contact: report.contact || '',
      inspection_date: report.inspection_date || '',
    })
    {
      // report.available_quantity (a real saved value) is never overridden
      // here - only the blank-field default gets the maxAvailableQty cap,
      // same reasoning as the initial useState seed above.
      const blankSeed = lineItem.balance_quantity ?? maxAvailableQty ?? ''
      const cappedBlankSeed = maxAvailableQty != null && blankSeed !== '' ? Math.min(Number(blankSeed), maxAvailableQty) : blankSeed
      const availableQuantity = report.available_quantity ?? (isLocked ? '' : cappedBlankSeed)
      setQuantity({
        ship_via: report.ship_via || (isLocked ? '' : (carryForwardSource?.ship_via || '')),
        available_quantity: availableQuantity,
        inspected_qty: report.inspected_qty ?? (isLocked ? '' : inspectionQtyForAvailable(availableQuantity, poInspectionLevel)),
        accepted_quantity: report.accepted_quantity ?? (isLocked ? '' : availableQuantity),
        carton_available: report.carton_available ?? '',
      })
    }
    {
      // A saved level (or sizes made before levels existed) is kept as is; only a report with no packaging
      // sample sizes at all yet starts on S-1.
      const saved = report.packaging_appearance || {}
      const hasSizes = PACKAGING_ROWS.some(([key]) => saved[key]?.sample_size)
      const lotNow = num(report.available_quantity) > 0 ? num(report.available_quantity) : (maxAvailableQty ?? lineItem.quantity_ordered)
      const start = (!isLocked && !packagingLevelOf(saved) && !hasSizes) ? applyPackagingLevel(saved, 'S-1', lotNow) : saved
      setPackaging(seedPackagingResultDefaults(start, isLocked))
    }
    setMeasurement(seedMeasurementResultDefaults(seedMeasurementFromSpec(report.packaging_measurement_findings || {}, sku, isLocked), isLocked))
    setBarcodes(seedBarcodeResultDefaults(report.barcode_results || {}, isLocked))
    setOnsite(seedOnsiteFromPlan(report.onsite_tests || {}, isLocked))
    // Inspection Level and Sample Size are deterministic (the PO's own
    // inspection_level, and the AQL plan derived from quantity + level) -
    // same reasoning as seedPackagingSampleSize above, they fill in
    // regardless of isLocked, unlike AQL Critical/Major/Minor's siblings
    // just below which already do this unconditionally too. (Also kept
    // caught-up afterward by its own small effect below.)
    setWorkmanship({
      workmanship_inspection_level: report.workmanship_inspection_level || poInspectionLevel || '',
      workmanship_sample_size: report.workmanship_sample_size || (effectiveSamplingPlan ? `${effectiveSamplingPlan.codeLetter} (${effectiveSamplingPlan.sampleSize})` : ''),
      aql_critical: report.aql_critical ?? '0',
      aql_major: report.aql_major ?? '2.5',
      aql_minor: report.aql_minor ?? '4.0',
      workmanship_remarks: report.workmanship_remarks || '',
    })
    setSignoff({
      remarks: report.remarks || [],
      inspection_result: report.inspection_result || '',
      vendor_rep_name: report.vendor_rep_name || '',
      vendor_rep_signature: report.vendor_rep_signature || '',
      quality_process_auditor_name: report.quality_process_auditor_name || '',
      quality_process_auditor_signature: report.quality_process_auditor_signature || '',
      quality_resource_name: report.quality_resource_name || (isLocked ? '' : (userName || '')),
      quality_resource_signature: report.quality_resource_signature || '',
    })
    setAttachments(report.attachments || [])
    // Deliberately keyed on report?.id only - see this effect's own comment
    // above for why the other 10 values are read fresh from the closure
    // instead of also being listed as triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id])

  // Inspector Name keeps tracking the live schedule assignment while the
  // report isn't locked (by design - see the hard-hydration effect's own
  // comment on this field), independent of report identity changing -
  // e.g. a re-assignment lands without this SKU/stage's report itself
  // changing. Merge-safe (only touches this one field, only when it's
  // actually different) rather than a full re-hydration.
  useEffect(() => {
    const isLocked = (report?.status === 'submitted' && VERDICT_RESULTS.includes(report?.inspection_result)) || !!locked
    if (isLocked) return
    const next = assignedQaName || ''
    setDetails(prev => (prev.inspector_name === next ? prev : { ...prev, inspector_name: next }))
  }, [assignedQaName, report?.status, report?.inspection_result, locked])

  // Workmanship's Inspection Level/Sample Size are deterministic values
  // computed from the PO's inspection_level and the AQL sampling plan, not
  // something the inspector types - if either loads/changes after this
  // report's already hydrated, these two catch up on their own. Merge-safe
  // (`prev.field ||`, same idempotent convention seedPackagingSampleSize
  // etc. already use) - never overwrites a value once it's actually set.
  useEffect(() => {
    setWorkmanship(prev => {
      const level = prev.workmanship_inspection_level || poInspectionLevel || ''
      const sampleSize = prev.workmanship_sample_size || (effectiveSamplingPlan ? `${effectiveSamplingPlan.codeLetter} (${effectiveSamplingPlan.sampleSize})` : '')
      if (level === prev.workmanship_inspection_level && sampleSize === prev.workmanship_sample_size) return prev
      return { ...prev, workmanship_inspection_level: level, workmanship_sample_size: sampleSize }
    })
  }, [poInspectionLevel, effectiveSamplingPlan])

  // Once submitted with a genuine final verdict (Accepted/Partially Accepted/
  // Accepted with deviations/Rejected), a report is permanently locked - no
  // edit path back in. Submitting with a workflow state instead (Plan
  // Aborted/On Hold) does NOT freeze it - those are provisional, not a real
  // outcome yet, so the inspector can return and set the actual verdict
  // later. That later real submit still runs the normal Submit flow (same
  // notification email, same everything) since the report never left the
  // "still open" state in the first place.
  // A Plan Aborted/On Hold that already has a LATER round of this stage is
  // closed history (submitting it booked that next round, exactly like a
  // Rejected one), so it is read-only too. One with no later round (submitted
  // before this rule) stays editable as before.
  const supersededByLaterRound = report?.status === 'submitted'
    && RESCHEDULING_RESULTS.includes(report?.inspection_result)
    && (reports ?? []).some(r => r.po_line_item_id === report.po_line_item_id && r.inspection_type === report.inspection_type && (r.round ?? 1) > (report.round ?? 1))
  const disabled = !canManage || (report?.status === 'submitted' && VERDICT_RESULTS.includes(report?.inspection_result)) || supersededByLaterRound || !!locked

  // Self-heals the two prefills that depend on data loaded asynchronously
  // (sku master, sibling reports) for a brand-new report with no saved row
  // yet — the lazy useState initializers above only run once at mount, so if
  // sku/reports are still loading at that instant they'd otherwise never get
  // a second chance to seed. Once `report` exists, the hydration effect above
  // takes over (it re-runs on `sku`/`carryForwardSource` changing too).
  useEffect(() => {
    if (report) return
    setMeasurement(prev => seedMeasurementFromSpec(prev, sku, false))
  }, [report, sku])
  useEffect(() => {
    if (report) return
    setQuantity(prev => (prev.ship_via ? prev : { ...prev, ship_via: carryForwardSource?.ship_via || '' }))
  }, [report, carryForwardSource])

  // What the AQL chart implies from this SKU's own logged defects — a
  // suggestion for Overall Result, never a lock. Only ever writes into a
  // still-empty field, and never on a locked report (nothing left to suggest
  // into once it's already been decided and submitted).
  // The AQL limits (Ac/Re) follow the INSPECTION Quantity - the sample actually
  // examined - not the Available Qty: allowed defects depend on how many units
  // were inspected. Inspection Quantity tracks Available Qty's standard sample
  // size by default and can be edited; a quantity between two standard sample
  // sizes takes the stricter, smaller one. Before any Inspection Quantity
  // exists the round's own lot-based plan is used, as before. Drives the
  // Defects hint, the Ac/Re reference and the Accept/Reject result together.
  const aqlLot = num(quantity.inspected_qty) > 0 ? num(quantity.inspected_qty) : null
  const aqlPlan = useMemo(
    () => (aqlLot != null ? resolveSamplingPlanBySampleSize(aqlLot) : null) ?? samplingPlan,
    [aqlLot, samplingPlan]
  )
  const aqlVerdict = computeAqlVerdict(report?.inspection_report_defects, aqlPlan)
  // Workmanship Sample Size = the plan actually used for the AQL limits (letter and its chart size), kept in
  // step with the Inspection Quantity while the report is editable; a locked report keeps what it saved.
  const workmanshipSampleSize = (!disabled && aqlPlan) ? `${aqlPlan.codeLetter} (${aqlPlan.sampleSize})` : workmanship.workmanship_sample_size
  const workmanshipView = { ...workmanship, workmanship_sample_size: workmanshipSampleSize }
  // Packaging sample sizes follow the chosen S level and the Available Qty while editable; a box the
  // inspector typed over by hand (manual) keeps its text until the level is changed again.
  const packagingLevel = packagingLevelOf(packaging)
  const packagingLot = num(quantity.available_quantity) > 0 ? num(quantity.available_quantity) : (maxAvailableQty ?? lineItem.quantity_ordered)
  const packagingView = useMemo(() => {
    if (disabled || !packagingLevel) return packaging
    const size = packagingSizeString(packagingLevel, packagingLot)
    if (!size) return packaging
    let next = packaging
    PACKAGING_ROWS.forEach(([key]) => {
      const row = packaging[key] || {}
      if (row.manual || row.sample_size === size) return
      if (next === packaging) next = { ...packaging }
      next[key] = { ...row, sample_size: size }
    })
    return next
  }, [packaging, packagingLevel, packagingLot, disabled])
  const autoSuggestedResultRef = useRef(null)
  // Nothing anywhere on this SKU is allowed to read as "Accepted" once a
  // check has failed - this gates both the suggestion below and the actual
  // option list Sign-off renders (see blockAccepted on SignOffStep).
  const anyFailed = hasAnyFailedCheck({ barcodes, packaging, measurement, onsite, aqlVerdict })
  useEffect(() => {
    if (disabled) return
    if (anyFailed) {
      // Already-selected "Accepted" stops being valid the moment something
      // fails (e.g. a barcode gets marked Fail after Sign-off was filled in)
      // - cleared so the inspector has to actively pick an outcome that
      // accounts for the failure instead of leaving a stale Accepted in place.
      setSignoff(prev => (prev.inspection_result === 'accepted' ? { ...prev, inspection_result: '' } : prev))
      return
    }
    if (!aqlVerdict) return
    // Fills the result when it is empty, and also re-fills it when the value in
    // there is still the one THIS effect suggested earlier (so typing an
    // Available Qty digit by digit cannot leave a stale suggestion behind). A
    // result the inspector picked themselves is never overwritten.
    setSignoff(prev => {
      if (prev.inspection_result && prev.inspection_result !== autoSuggestedResultRef.current) return prev
      autoSuggestedResultRef.current = aqlVerdict.result
      return prev.inspection_result === aqlVerdict.result ? prev : { ...prev, inspection_result: aqlVerdict.result }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aqlVerdict?.result, disabled, anyFailed])

  // `includeResult` - once a report is already submitted (On Hold / Feedback
  // in Progress / Plan Aborted stay editable), its recorded result may change
  // ONLY through an explicit Submit, never as a side effect of an autosave, a
  // checkpoint Save, or the offline write-back queue. Every one of those
  // funnels through here, so leaving inspection_result out of their patches
  // is the single choke point that closes the whole class of "a stale value
  // silently flipped a submitted report" bugs (a stale local draft, stale
  // state, an old open tab) regardless of where the stale value came from -
  // a real incident had On Hold silently become Accepted with no Submit
  // click at all. handleSubmit passes includeResult: true, since recording
  // the result is the entire point of a Submit.
  // The result rides along only for a brand-new form (no server row yet) or when the
  // report is LOADED and still a draft (reportRef,
  // never the render's `report`, which is null while loading and stale inside timers):
  // a blank not-yet-hydrated form must never write a result onto an existing report.
  const buildFullPatch = (stepOverride = step, { includeResult = !localId || (!!reportRef.current && reportRef.current.status !== 'submitted') } = {}) => ({
    inspector_name: details.inspector_name || null,
    inspection_type: inspectionType,
    arrival_time: details.arrival_time || null,
    start_time: details.start_time || null,
    complete_time: details.complete_time || null,
    contact: details.contact || null,
    inspection_date: details.inspection_date || null,
    ship_via: quantity.ship_via || null,
    available_quantity: num(quantity.available_quantity),
    inspected_qty: num(quantity.inspected_qty),
    accepted_quantity: num(quantity.accepted_quantity),
    carton_available: num(quantity.carton_available),
    packaging_appearance: packagingView,
    packaging_measurement_findings: measurement,
    barcode_results: barcodes,
    onsite_tests: onsite,
    workmanship_inspection_level: workmanship.workmanship_inspection_level || null,
    workmanship_sample_size: workmanshipSampleSize || null,
    aql_critical: num(workmanship.aql_critical),
    aql_major: num(workmanship.aql_major),
    aql_minor: num(workmanship.aql_minor),
    workmanship_remarks: workmanship.workmanship_remarks || null,
    remarks: signoff.remarks,
    ...(includeResult ? { inspection_result: signoff.inspection_result || null } : {}),
    vendor_rep_name: signoff.vendor_rep_name || null,
    vendor_rep_signature: signoff.vendor_rep_signature || null,
    quality_process_auditor_name: signoff.quality_process_auditor_name || null,
    quality_process_auditor_signature: signoff.quality_process_auditor_signature || null,
    quality_resource_name: signoff.quality_resource_name || null,
    quality_resource_signature: signoff.quality_resource_signature || null,
    last_step: STEPS[stepOverride].key,
  })

  // Extracted out of persistOrCreate so the offline sync engine's own
  // background create attempts (see the effect below) share this EXACT
  // logic - including the 23505 recovery path and the one-time
  // draft_saved log - instead of a second, drifting copy of it.
  const createReportRow = async (patch) => {
    const { data, error } = await createInspectionReport({
      po_line_item_id: lineItem.id, ...patch, status: 'draft', created_by: userName, updated_by: userName,
      fulfilled_schedule_id: activeEntryCoversSku ? activeScheduleEntry.id : null,
    })
    if (error) {
      // A report for this exact (SKU, stage, round) can already exist from
      // an earlier session that this component's `reports` list hadn't
      // picked up yet (stale/out-of-sync fetch), so `localId` looked empty
      // when it shouldn't have. Recover by switching to the existing row
      // instead of surfacing a raw constraint-violation error — the
      // hydration effect above loads its real saved data once `localId`
      // changes, rather than this in-progress (mostly blank) local state
      // clobbering whatever was already saved there. Also the same safety
      // net that makes it harmless if the offline sync engine's own retry
      // ever raced an earlier attempt that actually landed server-side
      // despite looking like it failed (e.g. a timeout after the insert
      // committed) - the unique constraint on (po_line_item_id,
      // inspection_type, round) rejects the duplicate, and this recovers.
      if (error.code === '23505') {
        const { data: existing, error: findErr } = await findInspectionReport({ po_line_item_id: lineItem.id, inspection_type: inspectionType, round: 1 })
        if (findErr) throw findErr
        if (existing) {
          // Adopt the existing row's id, but don't silently drop THIS call's
          // own patch - the two concurrent creators (typically the
          // background sync engine racing a direct Save/Submit click right
          // after reconnecting, both trying to create the very first row for
          // a SKU that was entirely offline until now) can each be holding a
          // genuinely different snapshot of the form, not just a stale
          // resend of the same data. Applying this patch as an UPDATE on top
          // of whichever row won the create race merges both instead of the
          // loser's edits (e.g. a second remark added moments after the
          // winner's own patch was captured) vanishing outright.
          const { error: mergeErr } = await updateInspectionReport(existing.id, patch, userName, { guardSubmitted: true })
          if (mergeErr) console.error('[InspectionForm] merge onto existing report after 23505 failed:', mergeErr.message)
          return existing
        }
      }
      throw error
    }
    // This branch only ever runs once per report (autosave never creates a
    // row — see the comment below), so this naturally logs exactly one
    // "first draft save" event, not one per keystroke.
    addInspectionReportLog({
      report_id: data.id, po_line_item_id: lineItem.id, inspection_type: inspectionType, round: data.round ?? 1,
      event_type: 'draft_saved', actor_name: userName,
    }).then(({ error: logError }) => { if (logError) console.error('[InspectionForm] draft_saved log failed:', logError.message) })
      // This log call is reachable from the background-sync effect's 10s
      // timer (createFn: createReportRow), not just a direct Save click - a
      // rejected request here (not just a returned {error}) would otherwise
      // be an uncaught rejection repeating every 10s, same class of bug
      // already fixed once in ReconnectSyncScreen's refresh().
      .catch(err => console.error('[InspectionForm] draft_saved log request failed:', err.message))
    return data
  }

  const persistOrCreate = async (patch) => {
    // Fast-fail instead of letting a live create/update attempt hang or
    // slow-fail against a dead connection (an OS-level WiFi-off can take
    // several seconds to surface as a real network error, unlike DevTools'
    // instant "offline" simulation) - every caller here (saveFieldNow,
    // handleSave) already has its own catch-block fallback that queues the
    // edit locally exactly like this, so throwing immediately just gets
    // there without a stuck "Saving…" indicator in between.
    if (!navigator.onLine) { const e = new Error('offline'); e.code = 'OFFLINE'; throw e }
    if (!localId) {
      const data = await createReportRow(patch)
      setLocalId(data.id)
      setDraftServerReportId(draftId, data.id).catch(() => {})
      return data.id
    }
    const { error, skipped } = await updateInspectionReport(localId, patch, userName, { guardSubmitted: true })
    if (error) throw error
    // The report was submitted (locked) by the time this write ran - nothing was
    // changed, so never report it as saved.
    if (skipped) throw new Error('This report is already submitted, so this save was not applied. Reopen it to see the current version.')
    return localId
  }

  // Autosave (the periodic network flush this used to drive) is gone - see
  // the removed interval effect further below for why. `autosaveDirtyRef`
  // still gets set by the dirty-tracking effect and read by saveFieldNow/
  // handleSave (both explicit, user-triggered writes), so it's still live,
  // just no longer polled by a timer of its own.

  // Explicit "Save now" for a single field (Available Qty/Accepted Qty's own
  // buttons, see QuantityStep) - same persist+refresh as flushAutosave, just
  // triggered immediately on click instead of waiting up to 1.5s, and not
  // gated on autosaveDirtyRef (a deliberate click should always save,
  // whether or not the dirty-tracking effect has caught up yet) or on
  // `localId` already existing (a field edited before the very first save
  // still needs this to create the row, exactly like the header Save
  // button/handleSave already does via persistOrCreate).
  const LOCKED_VERDICT_RESULTS = ['accepted', 'partially_accepted', 'accepted_with_deviations', 'rejected']
  // Saves the form now. Returns a promise of { ok: true, skipped? } or { ok: false, error }.
  // One save runs at a time: a call made while another is running marks the form dirty again and
  // returns after that one, then runs a follow-up pass, so an edit made during a save is never lost.
  // Never writes from a form whose report has not loaded yet, nor onto a locked verdict report.
  const saveFieldNow = () => {
    if (savePromiseRef.current) {
      autosaveDirtyRef.current = true
      return savePromiseRef.current
        .catch(() => ({ ok: false }))
        .then(prev => (prev?.ok === false ? prev : (autosaveDirtyRef.current && !savePromiseRef.current ? saveFieldNow() : { ok: true, skipped: 'coalesced' })))
    }
    const run = (async () => {
      let result = { ok: true, skipped: 'nothing' }
      for (let pass = 0; pass < 5; pass++) {
        const api = latestApiRef.current
        const latest = reportRef.current
        if (api.localId && !latest) { autosaveDirtyRef.current = false; return { ok: true, skipped: 'not_loaded' } }
        if (latest?.status === 'submitted' && LOCKED_VERDICT_RESULTS.includes(latest.inspection_result)) { autosaveDirtyRef.current = false; return { ok: true, skipped: 'locked' } }
        if (api.disabled) { autosaveDirtyRef.current = false; return { ok: true, skipped: 'disabled' } }
        autosaveDirtyRef.current = false
        setSaveStatus('saving')
        try {
          await api.persistOrCreate(api.buildFullPatch())
          setSaveStatus('saved')
          closeAnywayRef.current = false
          api.refreshReport()
          markDraftSynced(draftId).catch(() => {})
          result = { ok: true, skipped: null }
        } catch (err) {
          // PLAN OFFLINE (disabled): offline is a real failure now - nothing is
          // queued locally, so say so plainly and keep the edit marked unsaved.
          if (!PLAN_OFFLINE_ENABLED) {
            setSaveStatus('error')
            setSaveError(err.code === 'OFFLINE' ? "You're offline. Connect to the internet to save." : (err.message || 'Failed to save'))
            autosaveDirtyRef.current = true
            return { ok: false, error: err }
          }
          // Same offline/genuine-failure split as flushAutosave above - offline
          // isn't really a failure here either, just queued for later.
          if (err.code !== 'OFFLINE') {
            setSaveStatus('error')
            setSaveError(err.message || 'Failed to save')
          } else {
            setSaveStatus('pending')
          }
          autosaveDirtyRef.current = true
          // No report row yet and the network attempt above just failed: this click IS the
          // explicit "save intent" the offline queue needs (see offlineDrafts.js).
          if (!api.localId) {
            ensureDraft({ draftId, poLineItemId: lineItem.id, inspectionType, round: report?.round ?? 1, serverReportId: api.localId })
              .then(() => markPendingCreate(draftId))
              .catch(() => {})
          }
          return { ok: false, error: err }
        }
        if (!autosaveDirtyRef.current) return result
      }
      return result
    })().finally(() => { if (savePromiseRef.current === run) savePromiseRef.current = null })
    savePromiseRef.current = run
    return run
  }

  // Saves whatever is still pending before the wizard closes or switches stage. { ok: false } only
  // when a real save failed (then the caller must not close); "nothing to save", "not loaded yet" and
  // "locked" are all fine to leave on.
  const flushPendingSave = async () => {
    if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null }
    // The dirty flag is set whenever an edit arms the timer (and when offline, with no timer), so it
    // is the one truth for "something is unsaved"; the running save's own follow-up pass may clear it.
    if (savePromiseRef.current) await savePromiseRef.current.catch(() => null)
    if (!autosaveDirtyRef.current) return { ok: true, skipped: 'nothing' }
    const result = await saveFieldNow()
    return result?.ok === false ? result : { ok: true }
  }

  // Marks the form dirty - the write itself happens on the next 1.5s tick
  // below, not here, so a burst of keystrokes doesn't fire a request per
  // character.
  useEffect(() => {
    if (skipNextAutosaveRef.current) { skipNextAutosaveRef.current = false; return }
    // Also skip the render local-draft rehydration's own setState calls
    // cause (see localHydratedRef's doc comment) - otherwise restoring saved
    // data on mount would immediately look like a fresh edit and schedule an
    // auto-save of data that's already on the server.
    if (!localHydratedRef.current) return
    if (disabled || !localId) return
    autosaveDirtyRef.current = true
    closeAnywayRef.current = false
    setSaveStatus('pending')
    // Debounced online auto-save - explicit user request: while connected,
    // an edit shouldn't need a manual Save click (or the reconnect screen's
    // Sync Now) just to stop showing as "pending" - that machinery is for a
    // genuine offline gap, not for "haven't clicked Save yet" while online.
    // Debounced (not the old fixed-interval flushAutosave this file used to
    // have) so a burst of keystrokes fires one request after a pause in
    // typing, not one per tick; funnels through saveFieldNow, so a
    // connection drop between scheduling and firing still falls back to the
    // offline queue exactly like a manual Save click would.
    if (navigator.onLine) {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = setTimeout(() => {
        autosaveTimerRef.current = null
        saveFieldNow()
      }, 1500)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details, quantity, packaging, measurement, barcodes, onsite, workmanship, signoff, packagingView, workmanshipSampleSize])

  // Latest render's helpers for the shared save loop and the unmount save.
  useEffect(() => {
    latestApiRef.current = { buildFullPatch, persistOrCreate, refreshReport, disabled, localId }
    flushRef.current = flushPendingSave
  })
  // A parent can swap the SKU or stage without going through close (its own key/route change):
  // on unmount, save whatever is still pending (best effort, nothing to show on a gone form).
  useEffect(() => () => {
    const hadTimer = !!autosaveTimerRef.current
    if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null }
    if (hadTimer || autosaveDirtyRef.current) flushRef.current?.().catch(() => {})
  }, [])
  // Refreshing or closing the tab with an unsaved edit: ask the browser to confirm (SPA navigation
  // is covered by the unmount save above).
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (autosaveDirtyRef.current || autosaveTimerRef.current || savePromiseRef.current) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])
  // A pending autosave must not survive the form turning read-only (the report
  // finishing loading as a submitted verdict, or being locked).
  useEffect(() => {
    if (disabled && autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null }
  }, [disabled])

  // Offline-first local durability (see src/lib/offlineDrafts.js) - unlike
  // the dirty-tracking effect just above (which only marks the form dirty
  // for the *network* autosave once a report row already exists), this one
  // runs regardless of localId, so an inspector's typing survives a reload
  // or a dead connection even before their first explicit Save. Deliberately
  // does NOT create a server row and does NOT set autosaveDirtyRef/
  // pendingCreate itself - that stays an explicit action's job (handleSave/
  // saveFieldNow), same "a stray keystroke never leaves a draft row behind"
  // rule this file already followed before this change; this only changes
  // WHERE the in-between state lives (IndexedDB, not nowhere) while it
  // waits for that explicit action.
  useEffect(() => {
    // PLAN OFFLINE (disabled): never write a local draft to IndexedDB.
    if (!PLAN_OFFLINE_ENABLED) return
    // Two-stage gate - see skipLocalQueueRef/localHydratedRef's own doc
    // comments (right after the useState declarations above) for the two
    // separate bugs this combination fixes. Blocked entirely until
    // rehydration has run once; even then, skips exactly the one render
    // rehydration's own state-setting causes, same as skipNextAutosaveRef
    // does for the report-based hydration effect further below.
    if (!localHydratedRef.current) return
    if (skipLocalQueueRef.current) { skipLocalQueueRef.current = false; return }
    if (disabled) return
    // Value comparison, not just "did a dependency's object reference
    // change" - the real, general fix behind the two fixes above. Several
    // OTHER effects in this file (e.g. keeping `details.inspector_name` in
    // sync with the current schedule assignment) legitimately do the same
    // `setX(prev => ({ ...prev, field: value }))` pattern this effect's own
    // deps watch - that always produces a NEW object even when `value` is
    // identical to what was already there, which would otherwise re-mark
    // this draft dirty (and eventually re-queue a real sync) for a "change"
    // that never actually happened content-wise. Comparing the serialized
    // patch against the last one this effect itself successfully wrote
    // catches ALL such no-op triggers in one place, regardless of which
    // effect caused them, instead of chasing each one individually.
    const patch = buildFullPatch()
    // `last_step` is excluded from the comparison (though still written
    // through as part of the full patch below) - confirmed via a live
    // repro: it's the ONE field that changes just from navigating around
    // the app after a clean sync (which step/stage was last viewed), not
    // from any real edit, and was the exact cause of the sync popup
    // reappearing on its own with nothing actually changed. It's UI
    // bookkeeping (shown in the Activity Log), not inspection data worth a
    // sync notification on its own - it still rides along correctly
    // whenever some OTHER real field change triggers a genuine write.
    const { last_step: _lastStep, ...comparablePatch } = patch
    const serialized = JSON.stringify(comparablePatch)
    if (serialized === lastWrittenPatchRef.current) return
    // TEMPORARY diagnostic (round 2) - remove once confirmed. last_step is
    // already excluded above, so if this still fires, something ELSE is
    // genuinely differing - this shows exactly what.
    if (lastWrittenPatchRef.current) {
      const prev = JSON.parse(lastWrittenPatchRef.current)
      const changed = Object.keys(comparablePatch).filter(k => JSON.stringify(comparablePatch[k]) !== JSON.stringify(prev[k]))
      console.log('[write-back v2] differs, keys:', changed, changed.map(k => ({ key: k, prev: prev[k], next: comparablePatch[k] })))
    } else {
      console.log('[write-back v2] no baseline yet (first write this mount)')
    }
    // ensureDraftAndUpdatePatch (not the old ensureDraft().then(() =>
    // updateDraftPatch(...)) two-step) - see its own doc comment in
    // offlineDrafts.js: splitting "make sure the draft row exists" and "write
    // this patch" across an awaited gap let a later edit's write land before
    // an earlier, now-stale edit's, silently reverting a just-added field
    // (a remark, most visibly). Calling the combined, single-locked function
    // synchronously here keeps every write's queue position matching the
    // exact order its triggering edit happened in.
    ensureDraftAndUpdatePatch({
      draftId, poLineItemId: lineItem.id, inspectionType, round: report?.round ?? 1, serverReportId: localId,
      patch,
    }).then(() => { lastWrittenPatchRef.current = serialized })
      .catch(err => console.error('[InspectionForm] local draft queue failed:', err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details, quantity, packaging, measurement, barcodes, onsite, workmanship, signoff])

  // Background sync (see src/lib/offlineSync.js) - picks up whatever the
  // local-durability effect above queued once there's actually a network
  // to send it over, independent of this SKU's wizard still being open
  // (an `online` event can fire while the inspector's moved on to another
  // SKU, or even another tab). Only ever attempts a CREATE for a draft
  // that's marked pendingCreate (an explicit Save was clicked while
  // offline - see handleSave/saveFieldNow below) - a draft with only
  // passive local edits and no explicit save intent is correctly left
  // alone by attemptSync itself (see its own doc comment), so this timer
  // firing constantly is harmless, not a background auto-create loop.
  // Routed through a ref (same pattern as flushAutosaveRef below), kept in
  // sync on every render rather than only when [draftId, disabled, localId]
  // change - createFn/updateFn close over `userName` and (via createReportRow)
  // `activeEntryCoversSku`/`activeScheduleEntry`, neither of which was in
  // this effect's own deps array. Without the ref, the `online` listener/10s
  // timer set up on an earlier render kept calling that render's stale
  // closure - e.g. a background create firing after activeScheduleEntry
  // changed would have written the OLD fulfilled_schedule_id into the new
  // report row.
  const runSyncRef = useRef(() => {})
  useEffect(() => {
    runSyncRef.current = disabled ? async () => {} : async () => {
      const res = await attemptSync(draftId, {
        createFn: createReportRow,
        updateFn: (id, patch) => updateInspectionReport(id, patch, userName, { guardSubmitted: true }).then(({ data, error }) => {
          if (error) throw error
          // maybeSingle() returns { data: null, error: null } when the
          // update matched zero rows (report deleted server-side while
          // this draft sat offline) - PostgREST itself never surfaces that
          // as an error, so it has to be checked explicitly here.
          if (!data) { const e = new Error('Report no longer exists'); e.code = REPORT_NOT_FOUND; throw e }
        }),
      })
        .catch(() => null) // best-effort - the next trigger (online/timer/autosave tick) retries
      const resolvedReportId = res?.serverReportId || localId
      if (res?.synced && res.serverReportId && !localId) { setLocalId(res.serverReportId); refreshReport() }
      // Photos (Phase 3) - can only upload once this draft actually has a
      // server report row, so this naturally runs a tick behind the create
      // above the first time, then keeps retrying any still-queued photos
      // (a network drop mid-upload, etc.) on every later trigger.
      if (resolvedReportId) {
        const { uploaded } = await flushPendingPhotos(draftId, resolvedReportId, {
          uploadFn: uploadToInspectionBucket,
          addPhotoRowFn: (row) => addPhotoRow(row).then(({ error }) => { if (error) throw error }),
        }).catch(() => ({ uploaded: 0 }))
        if (uploaded > 0) { refreshPendingPhotos(); refreshReport() }
      }
    }
  })
  // No longer wired to an `online` listener or a timer - explicit user
  // request: nothing here should write to Supabase without the QA choosing
  // to, via the "Sync Now" button on ReconnectSyncScreen.jsx (which sweeps
  // every dirty/pending-submit draft app-wide, this one included, so the
  // actual sync still happens - just only on that click, never on its own).
  // What's left here is purely local: once that button's sync finishes, it
  // broadcasts 'offline-sync-completed' so a wizard that's still open on the
  // SKU it just synced can pick up its new `localId`/refresh its report
  // WITHOUT itself making the write - if this draft wasn't part of that
  // sync (still dirty, or nothing changed), the read below just finds
  // nothing new and no-ops.
  useEffect(() => {
    const onSyncCompleted = async () => {
      if (disabled || localId) return // already has a server row, or this SKU is locked - nothing to pick up
      const draft = await getDraft(draftId).catch(() => null)
      if (draft?.serverReportId) { setLocalId(draft.serverReportId); refreshReport() }
    }
    window.addEventListener('offline-sync-completed', onSyncCompleted)
    return () => window.removeEventListener('offline-sync-completed', onSyncCompleted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, disabled, localId])

  // App-wide pending count for the header indicator below - deliberately
  // its own effect, not folded into the sync effect above, since that one
  // is gated on `disabled` (a locked/submitted report shouldn't try to
  // sync itself) but the indicator should still show what's queued
  // elsewhere in the app even while looking at a locked report.
  useEffect(() => {
    const refresh = () => {
      getPendingCount().then(setPendingCount).catch(() => {})
      setAuthPausedForSync(isSyncPausedForAuth())
    }
    refresh()
    window.addEventListener('online', refresh)
    const timer = setInterval(refresh, 10000)
    return () => { window.removeEventListener('online', refresh); clearInterval(timer) }
  }, [pendingPhotos, saveStatus])

  // The old flushAutosave 1.5s interval (removed earlier - see its own
  // removal note in git history) fired unconditionally on a timer,
  // regardless of whether anything had actually changed, and kept firing
  // the instant `navigator.onLine` flipped true again, bypassing every
  // other auto-sync disable made elsewhere in this codebase at the time. Its
  // debounced replacement lives in the dirty-tracking effect above instead:
  // gated on an actual edit happening (the effect's own dependency array),
  // on being online, and on already having a server row - a brand new
  // report's very first save still requires an explicit Save/Submit click,
  // same as before. The local-durability effect below (IndexedDB only, no
  // network) still keeps every keystroke safe independently of either path.

  // `checkpointIndex` defaults to whichever section is currently active
  // (the header Save button's case) but can be passed explicitly - recorded
  // as last_step so progress ("In progress · On-site Tests" in the Activity
  // Log) reflects the section actually reached.
  const handleSave = async (checkpointIndex = step) => {
    // Same gate as saveFieldNow: no write until the report has loaded.
    if (localId && !reportRef.current) { setSaveError('Still loading this report. Try again in a moment.'); return }
    // One save at a time: let a running autosave finish first, and stop a pending timer
    // (this Save writes the whole form right now).
    if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null }
    if (savePromiseRef.current) await savePromiseRef.current.catch(() => null)
    autosaveDirtyRef.current = false
    autosaveInFlightRef.current = true
    setSaveError(null)
    setSaving(true)
    setSaveStatus('saving')
    // Registered as THE running save, so an autosave tick or a close waits for it (and a follow-up
    // pass picks up any edit made meanwhile) instead of writing at the same time.
    const run = (async () => {
    try {
      await persistOrCreate(buildFullPatch(checkpointIndex))
      setStep(checkpointIndex)
      onStepChange?.(STEPS[checkpointIndex].key)
      setSaveStatus('saved')
      closeAnywayRef.current = false
      refreshReport()
      markDraftSynced(draftId).catch(() => {})
      return { ok: true }
    } catch (err) {
      if (!PLAN_OFFLINE_ENABLED && err.code === 'OFFLINE') {
        // PLAN OFFLINE (disabled): no local queue - don't advance, say why.
        setSaveError("You're offline. Connect to the internet to save.")
        setSaveStatus('error')
        autosaveDirtyRef.current = true   // still unsaved: close/switch must not treat it as saved
        return { ok: false, error: err }
      } else if (err.code !== 'OFFLINE') {
        setSaveError(err.message || 'Failed to save')
        setSaveStatus('error')
        autosaveDirtyRef.current = true
        return { ok: false, error: err }
      } else {
        // Offline isn't a real failure - queue the checkpoint's own patch
        // locally (buildFullPatch(checkpointIndex) may carry a different
        // `last_step` than whatever the passive local-durability effect last
        // wrote) and still advance the step/scroll position. Blocking that
        // on a live connection - the previous behavior - is exactly what
        // made moving between steps while offline feel stuck: goToStep
        // awaits this same function before its own scrollIntoView.
        setSaveStatus('pending')
        if (!localId) {
          await ensureDraft({ draftId, poLineItemId: lineItem.id, inspectionType, round: report?.round ?? 1, serverReportId: null })
          await markPendingCreate(draftId)
        }
        await updateDraftPatch(draftId, buildFullPatch(checkpointIndex))
        setStep(checkpointIndex)
        onStepChange?.(STEPS[checkpointIndex].key)
      }
    } finally {
      setSaving(false)
      autosaveInFlightRef.current = false
    }
    })().finally(() => { if (savePromiseRef.current === run) savePromiseRef.current = null })
    savePromiseRef.current = run
    await run
  }

  // Scrolls to that section instead of switching a "current step" view - all
  // ten are already on the page (see the return below). No longer flushes
  // autosave first (that used to be a live network write on every step
  // click whenever a report already existed online) - the local-durability
  // effect above already guarantees nothing here is lost, and per the
  // no-automatic-network-writes rule this file now follows throughout, a
  // step click shouldn't silently push to Supabase either.
  const goToStep = async (i) => {
    setStep(i)
    onStepChange?.(STEPS[i].key)
    scrollBoxEl?.querySelector(`#step-section-${STEPS[i].key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Fired by SectionBlock's onActivate - any click landing inside a section
  // commits it as the working step. No scroll (already there) and no
  // autosave flush (this isn't "leaving" anything, unlike goToStep's
  // deliberate jump), just the sidebar highlight + last_step following along.
  const activateStep = (i) => {
    if (i === step) return
    setStep(i)
    onStepChange?.(STEPS[i].key)
  }

  // Deep-link support: a shortcut elsewhere (e.g. the Overview grid's
  // Digitals cell) opens this wizard with a specific initialStep - since
  // every section is already on the page, "opening to a step" now means
  // scrolling straight to it once mounted, instead of hiding the others.
  useEffect(() => {
    if (!initialStep || !scrollBoxEl) return
    scrollBoxEl.querySelector(`#step-section-${initialStep}`)?.scrollIntoView({ block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollBoxEl])

  // Same reasoning as goToStep above - no longer flushes autosave (a live
  // write) on close, just closes; local durability already covers it.
  const handleClose = async () => {
    // After a failed save the user can leave anyway by closing a second time.
    if (closeAnywayRef.current) { closeAnywayRef.current = false; onClose(); return }
    const flushed = await flushPendingSave()
    if (flushed.ok === false) {
      closeAnywayRef.current = true
      setSaveError('Could not save your latest changes. Close again to leave without saving them.')
      return
    }
    onClose()
  }

  // The header's outer "X" (PoInspectionComments.jsx) lives outside this
  // component entirely — it asks for a close by bumping this token instead
  // of ripping the wizard away, so the close still goes through the same
  // flush-pending-autosave path as the in-wizard back arrow. Compares
  // against the last-seen value rather than a "have I run yet" boolean —
  // under StrictMode's dev-mode double-invocation of mount effects, a
  // boolean flag gets flipped by the first invocation and wrongly reads as
  // "already ran" on the second, firing a close the instant the wizard
  // opens. Comparing values instead is safe: both mount invocations see the
  // same (unchanged) value and correctly skip.
  const lastCloseTokenRef = useRef(closeWizardToken)
  useEffect(() => {
    if (lastCloseTokenRef.current === closeWizardToken) return
    lastCloseTokenRef.current = closeWizardToken
    handleClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeWizardToken])

  // Same idea as closeWizardToken above, but for switching to a different
  // stage chip (Inline/Midline/Final) instead of closing the wizard
  // entirely - InspectionReportEntry.jsx bumps this once the user clicks a
  // stage chip while one is already open, this instance flushes its own
  // pending autosave, then tells the parent it's safe to actually switch
  // (which changes this component's `key` there, remounting it fresh for
  // the new stage's report - see that file's `applyStageSwitch`).
  const lastStageSwitchTokenRef = useRef(stageSwitchToken)
  useEffect(() => {
    if (lastStageSwitchTokenRef.current === stageSwitchToken) return
    lastStageSwitchTokenRef.current = stageSwitchToken
    // Save first; switch only when that worked (on failure the parent drops the switch and this form
    // stays open showing the error).
    flushPendingSave().then(flushed => onStageFlushed?.(flushed.ok !== false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageSwitchToken])

  const handleUploadAttachment = async (files) => {
    if (!localId) return
    const list = Array.isArray(files) ? files : [files]
    const uploaded = []
    for (const file of list) {
      try {
        const path = await uploadToInspectionBucket(file, `${localId}/attachments`)
        uploaded.push({ name: file.name, path })
      } catch { /* skip failed file, continue with the rest */ }
    }
    if (!uploaded.length) return
    const next = [...attachments, ...uploaded]
    setAttachments(next)
    await updateInspectionReport(localId, { attachments: next }, userName)
    refreshReport()
  }
  const handleRemoveAttachment = async (idx) => {
    const next = attachments.filter((_, i) => i !== idx)
    setAttachments(next)
    if (localId) { await updateInspectionReport(localId, { attachments: next }, userName); refreshReport() }
  }

  // Books (or merges into) a follow-up schedule entry for `followUpQty` -
  // exactly the "Reschedule" leftover-quantity choice's implementation.
  // Thin wrapper supplying this component's own live props/state to the
  // standalone bookFollowUpSchedule (useInspectionSchedule.js) - extracted
  // there so offlineSync.js's attemptSyncSubmit can call the exact same
  // logic later, unmounted, for an offline-queued submit's replay.
  const bookFollowUpSchedule = ({ followUpQty, remaining, neverInspected, acceptedQty, rejected }) =>
    bookFollowUpScheduleStandalone({
      poId: po.id, inspectionType, lineItemId: lineItem.id, followUpQty, remaining, neverInspected, acceptedQty, rejected,
      activeEntryScheduledQty: activeEntryScheduledQty ?? orderAfterCancellation(lineItem), quantityOrdered: lineItem.quantity_ordered,
      assignedQaId: activeScheduleEntry?.assigned_qa_id ?? memberId,
    })

  // Leftover-quantity choice: when handleSubmit finds a genuine leftover
  // (followUpQty > 0), it pauses here (sets this instead of immediately
  // booking a follow-up) and shows LeftoverQuantityModal - resolveLeftoverChoice
  // below finishes the job once the inspector picks Reschedule/Cancel/Reject.
  // null the rest of the time (no prompt showing).
  const [leftoverPrompt, setLeftoverPrompt] = useState(null)
  const [leftoverChoosing, setLeftoverChoosing] = useState(false)
  const [showLeftoverCancelModal, setShowLeftoverCancelModal] = useState(false)
  // Confirmation shown on every Submit Inspection click (see
  // SubmitConfirmModal) - null when closed, otherwise the snapshot of what's
  // about to be submitted, taken at click time.
  const [submitConfirm, setSubmitConfirm] = useState(null)

  // Finishes a submit that was paused on the leftover-quantity prompt.
  // `rejected` here is the ORIGINAL verdict's own rejection (the inspected
  // portion failing Final) - independent of whatever the inspector just
  // picked for the leftover's disposition, and still always gets its own
  // fresh re-inspection round regardless of that choice (a genuine failed
  // verdict always needs a redo; only the never-inspected/short leftover's
  // fate changes based on the prompt).
  // `leftoverQty` is the part of followUpQty that actually needs the
  // inspector's decision. For a rejection it excludes the rejected units
  // themselves (`remaining`) - those are already covered by the automatic
  // re-inspection round every rejection books, so offering to also "reject"
  // them as leftover wrote the same units off twice (a phantom extra Rejected
  // round in the Activity Log next to the real one).
  const applyLeftoverChoice = async (choice, prompt) => {
    const { followUpQty, leftoverQty = followUpQty, remaining, neverInspected, acceptedQty, rejected, round } = prompt
    setLeftoverChoosing(true)
    try {
      // Offline: the base patch already queued (handleSubmit's offline
      // branch called updateDraftPatch before pausing here) - Reschedule/
      // Reject just record which leftover action is still owed, replayed by
      // attemptSyncSubmit once reconnected. "Cancel" routes through
      // CancelQuantityModal's own separate approval flow, not explored/
      // covered by this offline pass - stays online-only, same message
      // Submit itself used to always show.
      // PLAN OFFLINE (disabled): the connection dropped mid-submit - nothing is
      // queued, so keep the prompt open and let the user retry once online.
      if (!PLAN_OFFLINE_ENABLED && !navigator.onLine) {
        setLeftoverChoosing(false)
        setSaveError("You're offline. Connect to the internet, then choose again.")
        return
      }
      if (!navigator.onLine) {
        if (choice === 'cancel') {
          setLeftoverChoosing(false)
          setSaveError("Can't cancel a leftover quantity while offline - this needs a live connection. Everything else about this submit is already queued.")
          return
        }
        await markPendingSubmit(draftId, {
          leftoverChoice: choice, poId: po.id, lineItemId: lineItem.id, inspectionType, round,
          followUpQty, leftoverQty, remaining, neverInspected, acceptedQty, rejected, actorName: userName,
          quantityOrdered: lineItem.quantity_ordered, activeEntryScheduledQty: activeEntryScheduledQty ?? orderAfterCancellation(lineItem),
          assignedQaId: activeScheduleEntry?.assigned_qa_id ?? memberId,
        })
        setLeftoverPrompt(null)
        await refresh?.()
        onClose()
        return
      }
      if (choice === 'reschedule') {
        const resolvedEntryId = await bookFollowUpSchedule({ followUpQty, remaining, neverInspected, acceptedQty, rejected })
        const { error: roundErr } = await startReInspection({
          po_line_item_id: lineItem.id, inspection_type: inspectionType, next_round: round + 1,
          actor_name: userName,
          reason: rejected ? 'Auto re-inspection: previous Final rejected' : 'Auto re-inspection: quantity not fully covered',
          fulfilled_schedule_id: resolvedEntryId,
        })
        if (roundErr) console.error('[InspectionForm] auto re-inspection round failed:', roundErr.message)
      } else if (choice === 'cancel') {
        // Opens CancelQuantityModal instead of finishing here - that modal's
        // own onSubmitted (below) is what actually completes the submit
        // (still needs to handle a genuine `rejected` verdict's own
        // re-inspection round, same as every other branch).
        setLeftoverChoosing(false)
        setShowLeftoverCancelModal(true)
        return
      } else if (choice === 'reject') {
        const { error: rejectErr } = await rejectLeftoverQuantity({
          po_line_item_id: lineItem.id, inspection_type: inspectionType, next_round: round + 1,
          actor_name: userName, quantity: leftoverQty,
        })
        if (rejectErr) console.error('[InspectionForm] reject leftover quantity failed:', rejectErr.message)
        // The inspected portion's own rejection (if any) still needs its
        // own fresh round to redo - the leftover's reject-round above and
        // this one are deliberately two separate rounds (round+1, round+2)
        // rather than trying to conflate "leftover rejected" and "redo the
        // failed inspection" into a single row.
        if (rejected) {
          const { error: roundErr } = await startReInspection({
            po_line_item_id: lineItem.id, inspection_type: inspectionType, next_round: round + 2,
            actor_name: userName, reason: 'Auto re-inspection: previous Final rejected',
            fulfilled_schedule_id: null,
          })
          if (roundErr) console.error('[InspectionForm] auto re-inspection round failed:', roundErr.message)
        }
      }
      setLeftoverPrompt(null)
      await refresh?.()
      onClose()
    } finally {
      setLeftoverChoosing(false)
    }
  }
  const resolveLeftoverChoice = (choice) => (leftoverPrompt ? applyLeftoverChoice(choice, leftoverPrompt) : undefined)

  // The CancelQuantityModal path's own completion - mirrors resolveLeftoverChoice's
  // tail (still redo the inspected portion's own rejection if any, then
  // refresh + close) since "cancel" skipped straight to opening that modal
  // above instead of finishing inline.
  const finishAfterLeftoverCancelled = async () => {
    const prompt = leftoverPrompt
    setShowLeftoverCancelModal(false)
    setLeftoverPrompt(null)
    if (prompt?.rejected) {
      const { error: roundErr } = await startReInspection({
        po_line_item_id: lineItem.id, inspection_type: inspectionType, next_round: prompt.round + 1,
        actor_name: userName, reason: 'Auto re-inspection: previous Final rejected',
        fulfilled_schedule_id: null,
      })
      if (roundErr) console.error('[InspectionForm] auto re-inspection round failed:', roundErr.message)
    }
    await refresh?.()
    onClose()
  }

  const handleSubmit = async () => {
    // A pending or running autosave must finish before Submit writes, so an autosave can never land
    // after the submit (it would hit the now-locked report).
    if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null }
    if (savePromiseRef.current) await savePromiseRef.current.catch(() => null)
    // A workflow state (Plan Aborted / On Hold) can be submitted too - it
    // just doesn't freeze the report afterward (see `disabled` below), so
    // the inspector can come back and set the real verdict later without
    // starting a new round. Only a genuine final verdict freezes it and is
    // required before Submit is even shown as an option in most flows -
    // here Submit stays reachable for any picked result, verdict or not.
    if (!signoff.inspection_result) { setSaveError('Select an overall result before submitting.'); return }
    if (RESULTS_REQUIRING_REMARK.includes(signoff.inspection_result) && signoff.remarks.length === 0) {
      setSaveError('Add a remark explaining this result before submitting.'); return
    }
    // Gated on a genuine verdict, same as the auto-reschedule calc further
    // below - a workflow-state submit (Plan Aborted/On Hold/Feedback in
    // Progress) is provisional, not a real outcome yet, so it's fine for
    // Available Qty to still be unknown at that point. A real verdict
    // without it left every downstream number (Inspection Qty, Accepted
    // Qty, the auto-reschedule/rollup logic, the exported PDF) with nothing
    // to actually compare against - this is exactly the gap that produced
    // JNGREP649's blank Available/Inspected columns.
    if (VERDICT_RESULTS.includes(signoff.inspection_result) && num(quantity.available_quantity) == null) {
      setSaveError('Enter Available Qty before submitting a final result.'); return
    }
    // Submit's downstream effects (schedule fulfillment, auto-reschedule)
    // used to require a live connection outright - now the offline branch
    // below queues the exact same intent (base patch + leftover decision)
    // through the same draft/sync mechanism Save already uses, replayed by
    // attemptSyncSubmit (offlineSync.js) once reconnected. Checked fresh
    // (not off local `pendingPhotos` state, which react-batches and can lag
    // a tick behind an IndexedDB write) so the online branch can't proceed
    // on a stale read right after a photo was just captured.
    const isOnlineNow = navigator.onLine
    // PLAN OFFLINE (disabled): a submit is never queued locally - it needs a
    // live connection. Nothing is changed, so nothing can be half-submitted.
    if (!PLAN_OFFLINE_ENABLED && !isOnlineNow) {
      setSaveError("You're offline. Connect to the internet to submit this inspection.")
      return
    }
    if (isOnlineNow) {
      const freshDraft = await getDraft(draftId)
      const freshPendingPhotos = await getPendingPhotosForDraft(draftId)
      if (freshDraft?.dirty || freshDraft?.pendingCreate || freshPendingPhotos.length > 0) {
        setSaveError("Can't submit yet - this SKU still has changes syncing. Wait a moment and try again.")
        return
      }
    }
    // Submit-time conflict check, only for an ALREADY-submitted report (an On
    // Hold / Plan Aborted one still open for edits). Autosave never sends a
    // result for such a report, so if the server's result no longer matches
    // what this form loaded, someone else changed it meanwhile (for example a
    // bulk Accept from the Overview) - submitting now would silently write
    // the old value back over it. Drafts are skipped: their result changes on
    // this form's own autosave, which would look like a false conflict.
    if (isOnlineNow && localId && report?.status === 'submitted') {
      const { state: serverNow, error: stateErr } = await fetchReportResultState(localId)
      if (!stateErr && serverNow && serverNow.inspection_result !== report.inspection_result) {
        setSaveError(`This report was changed by someone else since you opened it (it is now ${RESULT_LABEL[serverNow.inspection_result] || serverNow.inspection_result || 'blank'}). Close and reopen it to see the latest, then submit again.`)
        refreshReport()
        return
      }
    }
    autosaveDirtyRef.current = false
    setSaveError(null)
    setSaving(true)
    try {
      // Complete Time marks when the inspection actually wrapped up - filled
      // in right here rather than left to the inspector to remember, unless
      // they already set it themselves. Written directly onto the patch (not
      // just via setDetails) so it's captured in this same save even though
      // the state update below wouldn't be visible until the next render.
      // Complete Time is manual entry only: left exactly as typed (blank stays blank).
      const completeTime = details.complete_time
      const round = report?.round ?? 1
      // status/submitted_at folded directly into the same patch object Save
      // already sends - both are real inspection_reports columns, so this
      // rides through persistOrCreate (online) or the local draft (offline)
      // for free, no separate call needed either way.
      // Was Final-only - a Midline/Inline submit with a Rejected verdict and
      // no leftover quantity (the inspected amount matched what was
      // scheduled, it just failed) silently closed out with no follow-up
      // round and nothing in the Activity Log, unlike Final's own rejected
      // path below. Any stage rejecting now books the same automatic
      // re-inspection round.
      const rejected = signoff.inspection_result === 'rejected'
      // Accepted Qty defaults to (and is often left equal to) Available Qty
      // from the Quantity step, entered before the inspector ever reaches
      // Sign-off - nothing forced it back to 0 if they then picked Rejected
      // without manually clearing it, so a rejected report could still carry
      // a nonzero Accepted Qty (visible on its PDF export) that contradicts
      // its own verdict. A genuine Rejected result always means nothing was
      // accepted, so this is enforced here rather than trusted to the field.
      const patch = {
        ...buildFullPatch(step, { includeResult: true }), complete_time: completeTime, status: 'submitted', submitted_at: new Date().toISOString(),
        ...(rejected ? { accepted_quantity: 0 } : {}),
      }

      // Two independent shortfall concepts feed the same follow-up booking
      // below:
      // 1. "remaining" - of what THIS SKU'S SCHEDULE ENTRY itself targeted,
      //    some was rejected or short-accepted (unchanged from before).
      // 2. "neverInspected" - of the SKU's true order quantity, some was
      //    never even presented for inspection at all (Available Qty came in
      //    under quantity_ordered) - regardless of whether a schedule entry
      //    covered this SKU, or what it targeted. This is what catches a
      //    submit like Order Qty 150 / Available Qty 75 with no covering
      //    entry at all, which "remaining" alone can never see.
      // Both gated on a real verdict - a workflow-state submit (Plan
      // Aborted/On Hold/Feedback in Progress) has no accepted_quantity
      // filled in and isn't accepted-ish either, so without this gate both
      // branches would fall through to "nothing accepted/available" and
      // auto-book a bogus full-quantity follow-up for a SKU that isn't
      // actually done - it's still open and being worked, not awaiting
      // re-inspection.
      // `remaining`, `acceptedQty` and `neverInspected` come from computeSubmitFollowUp below (after the
      // prior rounds' quantities are known).

      // "Prior submitted Available Qty at this stage" - online, a live query
      // (freshest possible number, unchanged from before). Offline, the same
      // aggregate computed from whatever `reports` this component already
      // has in memory (cache-backed - see PoInspectionComments.jsx), since
      // there's no connection to ask Supabase directly. Excludes this exact
      // round (this submission's own row, if it already exists from an
      // earlier online save) the same way excludeReportId did.
      let priorAvailable = 0
      if (isOnlineNow) {
        if (VERDICT_RESULTS.includes(signoff.inspection_result) && lineItem.quantity_ordered != null && num(quantity.available_quantity) != null) {
          const { total } = await sumSubmittedAvailableQty({
            po_line_item_id: lineItem.id, inspection_type: inspectionType, excludeReportId: localId,
          })
          priorAvailable = total
        }
      } else {
        priorAvailable = (reports ?? [])
          .filter(r => r.po_line_item_id === lineItem.id && r.inspection_type === inspectionType && r.status === 'submitted' && (localId ? r.id !== localId : r.round !== round))
          .reduce((sum, r) => sum + (Number(r.available_quantity) || 0), 0)
      }

      // Units of this stage the OTHER submitted rounds already accepted (fresh from the database), so the
      // leftover after THIS round is order minus those minus what this round accepts (order 100, accepted 70
      // -> 30), whatever the Available Qty or the schedule say. Only needed for an accepted-ish verdict with
      // a typed Accepted Qty; every other verdict keeps its earlier formulas inside computeSubmitFollowUp.
      const acceptedRawNow = num(quantity.accepted_quantity)
      const acceptedVerdictNow = ACCEPTED_RESULTS.includes(signoff.inspection_result)
      let priorAcceptedQty = 0
      if (acceptedVerdictNow && !rejected && acceptedRawNow != null) {
        if (isOnlineNow) {
          const { total } = await sumSubmittedAcceptedQty({
            po_line_item_id: lineItem.id, inspection_type: inspectionType, excludeReportId: localId,
          })
          priorAcceptedQty = total
        } else {
          priorAcceptedQty = acceptedInOtherRounds(reports ?? [], lineItem.id, inspectionType, localId)
        }
      }
      const orderNow = orderAfterCancellation(lineItem)
      const { remaining, neverInspected, followUpQty, acceptedQty } = computeSubmitFollowUp({
        order: orderNow, priorAcceptedQty, priorAvailableQty: priorAvailable,
        acceptedRaw: acceptedRawNow, availableRaw: num(quantity.available_quantity),
        scheduledQty: activeEntryScheduledQty, covers: activeEntryCoversSku,
        verdict: VERDICT_RESULTS.includes(signoff.inspection_result), acceptedVerdict: acceptedVerdictNow, rejected,
      })
      // Only units that genuinely need the inspector's decision are prompted
      // about. A rejection's own units (`remaining`) always just get
      // rescheduled - a rejection books its re-inspection automatically, one
      // per rejection, no matter how many times it repeats - so only
      // never-presented units (`neverInspected`) can trigger the prompt when
      // rejected. Non-rejected verdicts (e.g. a short Accepted) prompt on the
      // full followUpQty exactly as before.
      const leftoverQty = rejected ? neverInspected : followUpQty
      const leftoverInfo = { followUpQty, leftoverQty, remaining, neverInspected, acceptedQty, rejected, round }

      if (!isOnlineNow) {
        // Offline: queue the base patch (status/submitted_at already folded
        // in above) through the same local draft Save already uses, instead
        // of a live persistOrCreate/updateInspectionReportStatus call.
        if (!localId) {
          await ensureDraft({ draftId, poLineItemId: lineItem.id, inspectionType, round, serverReportId: null })
          await markPendingCreate(draftId)
        }
        await updateDraftPatch(draftId, patch)
        // Same three-way split as the online branch below (reschedule /
        // reject / a plain rejection with nothing left over / nothing at
        // all) - only the WHEN differs: online resolves it right now, live;
        // offline records which one it is and lets attemptSyncSubmit
        // (offlineSync.js) resolve it later, once reconnected. `null` means
        // "nothing to replay" - the base patch alone is the whole story.
        if (leftoverQty > 0) {
          setLeftoverPrompt(leftoverInfo)
          return
        }
        // A rejection whose only leftover is its own rejected units: no
        // choice to make, queue the same automatic reschedule Reschedule
        // would.
        if (followUpQty > 0) {
          await applyLeftoverChoice('reschedule', leftoverInfo)
          return
        }
        // Only a genuine rejection with nothing left over still owes a
        // replay (a fresh re-inspection round) - anything else is just the
        // base patch above, nothing more to flag.
        if (rejected) {
          await markPendingSubmit(draftId, {
            leftoverChoice: 'simple_reinspect',
            poId: po.id, lineItemId: lineItem.id, inspectionType, round, actorName: userName,
          })
        }
        await refresh?.()
        onClose()
        return
      }

      // Online - unchanged from before.
      const id = await persistOrCreate(patch)
      // Keep the loaded report in step with what was just written, so a
      // second Submit from this same open form (for example after picking a
      // different non-verdict state) is compared against the truth by the
      // submit-time conflict check above, not against the pre-submit copy.
      refreshReport()
      addInspectionReportLog({
        report_id: id, po_line_item_id: lineItem.id, inspection_type: inspectionType, round,
        event_type: 'submitted', actor_name: userName, result: patch.inspection_result,
      }).then(({ error: logError }) => { if (logError) console.error('[InspectionForm] submitted log failed:', logError.message) })
        .catch(err => console.error('[InspectionForm] submitted log request failed:', err.message))

      // No automatic notification email on submit anymore - the manual
      // "Send Mail" button (InspectionReportEntry.jsx) is now the only way
      // one goes out, so nothing here builds a PDF or queues a send.

      // A genuine leftover pauses here instead of silently auto-booking a
      // follow-up the way this used to always do - LeftoverQuantityModal
      // (rendered below) lets the inspector choose Reschedule/Cancel/Reject
      // instead. resolveLeftoverChoice/finishAfterLeftoverCancelled (defined
      // above) pick up from here once that choice is made - this function
      // returns without refreshing/closing so the wizard stays open behind
      // the prompt.
      if (leftoverQty > 0) {
        setLeftoverPrompt(leftoverInfo)
        return
      }
      // A rejection whose only leftover is its own rejected units: no choice
      // to make, reschedule automatically (exactly what picking Reschedule
      // does) instead of prompting.
      if (followUpQty > 0) {
        await applyLeftoverChoice('reschedule', leftoverInfo)
        return
      }

      // No leftover at all - only a genuine rejection (with nothing left
      // over to prompt about, e.g. a rejected entry whose own scheduled
      // quantity was already 0) still needs its own fresh re-inspection
      // round, same as before.
      // Plan Aborted / On Hold are rescheduled exactly like a rejection: this
      // round stays closed as submitted, and a fresh round is booked so the
      // SKU is inspected again and this record is never overwritten.
      const reschedules = RESCHEDULING_RESULTS.includes(signoff.inspection_result)
      if (rejected || reschedules) {
        const { error: roundErr } = await startReInspection({
          po_line_item_id: lineItem.id, inspection_type: inspectionType, next_round: round + 1,
          actor_name: userName, reason: `Auto re-inspection: previous ${inspectionType} ${rejected ? 'rejected' : (RESULT_LABEL[signoff.inspection_result] || signoff.inspection_result).toLowerCase()}`,
          fulfilled_schedule_id: null,
        })
        if (roundErr) console.error('[InspectionForm] auto re-inspection round failed:', roundErr.message)
      }

      // Refreshes the PO-wide reports/schedule-entries the sidebar reads -
      // without this, a SKU that just got rejected (and auto-rescheduled)
      // wouldn't show its new "Rejected"/"Re-Scheduled" cards until the page
      // was reloaded, even though this submit already changed both. Awaited
      // (not fire-and-forget) - onClose() below returns to the overview
      // screen, whose stage pills gate on this same `reports` prop to decide
      // what's still locked; closing before the refetch lands left a race
      // where clicking the stage that should have just unlocked (e.g.
      // Midline right after Inline's own submit) read stale data and
      // silently no-opped, with no visible change and no error at all.
      await refresh?.()

      onClose()
    } catch (err) {
      setSaveError(err.message || 'Failed to submit')
    } finally {
      setSaving(false)
    }
  }

  // Submit Inspection's click handler - opens SubmitConfirmModal instead of
  // submitting straight away. An incomplete form (no result picked, a missing
  // remark, no Available Qty) skips the popup and goes straight to
  // handleSubmit, which shows the exact inline error for whichever field is
  // missing - confirming something that's about to be rejected anyway would
  // just be noise.
  const requestSubmit = () => {
    if (saving) return
    const result = signoff.inspection_result
    const incomplete = !result
      || (RESULTS_REQUIRING_REMARK.includes(result) && signoff.remarks.length === 0)
      || (VERDICT_RESULTS.includes(result) && num(quantity.available_quantity) == null)
    if (incomplete) { handleSubmit(); return }
    const round = report?.round ?? 1
    setSubmitConfirm({
      result,
      round,
      priorRounds: (reports ?? [])
        .filter(r => r.po_line_item_id === lineItem.id && r.inspection_type === inspectionType && r.status === 'submitted' && (r.round ?? 1) !== round)
        .sort((a, b) => (a.round ?? 1) - (b.round ?? 1)),
      alreadySubmitted: report?.status === 'submitted'
        ? { result: report.inspection_result, submitted_at: report.submitted_at }
        : null,
    })
  }

  const showInitialSpinner = !!initialReportId && reportLoading && !report

  // Autosave already caps the unsaved window at 5s (see the periodic flush
  // effect above), so "Unsaved changes…" read as more alarming than the
  // actual risk - pending/saving/saved all read as "Saved" with the same
  // sync icon that spins for as long as that's genuinely true (pending =
  // dirty and waiting for the next 1.5s tick, saving = the request is
  // actually in flight) and settles to a static icon + "Saved" once it
  // lands - a real, live reflection of the autosave cycle above, not a
  // static label. error is its own distinct, honest state - a real failure
  // must still surface, not be papered over as "Saved".
  const SAVE_STATUS_LABEL = {
    pending: 'Saving…',
    saving:  'Saving…',
    saved:   'Saved',
    error:   'Failed to save',
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-900 truncate">{INSPECTION_TYPE_LABEL[inspectionType]} Inspection · {lineItem.buyer_sku_ref}</div>
            {!report && (
              <div className="text-xs text-gray-400 truncate mt-0.5">Not yet saved - click Save to start</div>
            )}
            {report && (report.updated_by || report.created_by) && (
              <div className="text-[11px] text-gray-400 truncate mt-1">
                Last edited by <span className="text-gray-500 font-medium">{report.updated_by || report.created_by}</span> · {fmtDateTime(report.updated_at || report.created_at)}
              </div>
            )}
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving}
              title="Save every step of this inspection now"
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-40 transition-colors flex-shrink-0"
            >
              Save
            </button>
          )}
          {/* Same Submit as the one at the end of Sign-off (same confirmation and checks), kept
              here too so it is reachable from anywhere on the long page. Tablet/desktop only. */}
          {!disabled && (
            <button
              type="button"
              onClick={requestSubmit}
              disabled={saving}
              title="Submit this inspection"
              className="hidden sm:inline-flex px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 transition-colors flex-shrink-0"
            >
              Submit Inspection
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Offline/sync status (Phase 4) - app-wide count (see
              getPendingCount), shown ahead of the per-SKU SAVE_STATUS_LABEL
              pill below. Same responsive text-hiding convention - the icon/
              dot alone still communicates state on a narrow phone, where
              the close button + Save button + this + the save pill are all
              competing for width against the truncating title. */}
          {/* Session expired mid-queue (Phase 5) - takes priority over the
              plain offline/syncing states below, since reconnecting alone
              won't fix this; only a fresh login will. Nothing queued is
              lost while this shows - it just stops retrying until signed
              back in (see offlineSync.js's isSyncPausedForAuth). */}
          {authPausedForSync && (
            <span title="Your session expired - log back in to sync your offline changes. Nothing has been lost." className="text-[11px] flex items-center gap-1.5 text-red-600 font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
              <span className="hidden sm:inline">Signed out{pendingCount > 0 ? ` · ${pendingCount} waiting to sync` : ''}</span>
            </span>
          )}
          {!authPausedForSync && !isOnline && (
            <span
              title={PLAN_OFFLINE_ENABLED
                ? "You're offline - changes are being saved on this device. Sync them from the reconnect screen (or Save/Submit) once you're back online."
                : "You're offline. Offline mode is switched off for now - connect to the internet to save, add photos or submit."}
              className="text-[11px] flex items-center gap-1.5 text-amber-600 font-semibold">
              <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
              <span className="hidden sm:inline">
                {PLAN_OFFLINE_ENABLED ? `Offline${pendingCount > 0 ? ` · ${pendingCount} queued` : ''}` : 'Offline · connect to save'}
              </span>
            </span>
          )}
          {/* Not "Syncing…" - nothing auto-syncs anymore (explicit
              Save/Submit, or the reconnect screen's Sync Now button, only).
              This is just saying something is queued and waiting, not that
              a background sync is actively running right now - the animated
              spin icon this used to have implied exactly that, misleadingly,
              for as long as an edit sits unsaved while online. */}
          {!authPausedForSync && isOnline && pendingCount > 0 && (
            <span title={`${pendingCount} change${pendingCount !== 1 ? 's' : ''} queued locally - not yet saved to the server`} className="text-[11px] flex items-center gap-1.5 text-blue-600 font-semibold">
              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
              <span className="hidden sm:inline">{pendingCount} pending</span>
            </span>
          )}
          {/* Suppressed while offline - the "Offline · N queued" pill above
              already says exactly this, more clearly. Without this, the two
              showed at once ("Offline · 1 queued" next to a permanently
              spinning "Saving…") - saveStatus stays 'pending' the whole time
              offline (nothing will flip it to 'saved' until a real sync
              happens), so that icon spun forever and read as stuck/broken
              even though nothing actually was. */}
          {!disabled && isOnline && SAVE_STATUS_LABEL[saveStatus] && (
            // Text hidden below sm: - close button + header Save button +
            // this indicator are all flex-shrink-0, competing with the title
            // (which only has truncation to absorb the squeeze) for a narrow
            // phone's width. The icon alone still communicates the state
            // (spinning vs. static) without costing that space.
            <span title={SAVE_STATUS_LABEL[saveStatus]} className={`text-[11px] flex items-center gap-1.5 ${saveStatus === 'error' ? 'text-red-500' : 'text-gray-400'}`}>
              {saveStatus !== 'error' && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                  className={saveStatus === 'pending' || saveStatus === 'saving' ? 'animate-spin' : ''}>
                  <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              )}
              {/* error has no icon above (a real failure must never be
                  reduced to an icon-only glyph nobody can read on a phone),
                  so only pending/saving/saved's text - already redundant
                  with their spinning/static icon - drops at this width. */}
              <span className={saveStatus === 'error' ? '' : 'hidden sm:inline'}>{SAVE_STATUS_LABEL[saveStatus]}</span>
            </span>
          )}
          {disabled && report?.status === 'submitted' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800">Submitted</span>
          )}
          {disabled && report?.status !== 'submitted' && !!locked && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-200 text-gray-600">Locked - Final submitted</span>
          )}
          {/* Reopening a report submitted with a workflow state (Plan
              Aborted/On Hold/Feedback in Progress) looks identical to a
              brand-new draft otherwise - disabled is false, so neither
              badge above renders. This flags that it already has a prior
              submission on it, without implying it's locked. */}
          {!disabled && report?.status === 'submitted' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800" title="Submitted with a non-final status — still open for edits">
              Submitted · Editable
            </span>
          )}
        </div>
      </div>

      {onSwitchStage && (
        // grid grid-cols-3 on mobile (not overflow-x-auto) - only 3 stage
        // buttons, short enough to sit side by side on any phone, same
        // no-horizontal-scroll fix already applied to this exact row's
        // sibling in InspectionReportEntry.jsx's own per-SKU header.
        <div className="flex-shrink-0 grid grid-cols-3 gap-2 sm:flex sm:items-center px-4 py-2.5 border-b border-gray-200 bg-white">
          {(() => {
            const nextStage = getNextActionableStage(reports, lineItem.id, lineItem)
            const finalized = isFinalized(reports, lineItem.id)
            return STAGES.map(({ key, label }) => {
              const { locked, lockedOn, balance: lockBalance } = getLockInfo(reports, lineItem.id, key, lineItem)
              return (
                <StageButton
                  key={key}
                  stageKey={key}
                  label={label}
                  report={getStage(reports, lineItem.id, key)}
                  finalized={finalized}
                  locked={locked}
                  lockedOn={lockedOn}
                  lockBalance={lockBalance}
                  isNext={key === nextStage}
                  onClick={onSwitchStage}
                />
              )
            })
          })()}
        </div>
      )}

      {showInitialSpinner ? (
        <div className="flex-1 flex items-center justify-center"><Spinner /></div>
      ) : (
        <div className="relative flex-1 min-h-0">
          <div ref={setScrollBoxEl} className="h-full overflow-y-auto p-4">
            {/* Mobile/tablet step picker — the "Steps" list in the sidebar
                (portaled via stepNavContainer below) lives in a panel that's
                hidden on narrower screens, so steps need a directly-accessible
                way to jump on phones and tablets. Wraps onto as many rows as
                it needs (no horizontal scroll) so every step stays visible/
                tappable at a glance instead of hidden behind a click or a
                scroll. All sections are already on the page below, so this
                jumps to (scrolls to) one rather than switching what's shown. */}
            <div className="lg:hidden mb-3 flex flex-wrap items-center gap-1.5">
              {STEPS.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => goToStep(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer
                    ${i === step ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {i + 1}. {s.label}
                </button>
              ))}
            </div>

            {stepNavContainer && createPortal(
              // Black = the working step (last clicked into, or a checkpoint
              // Save). A lighter gray previews whichever section the mouse is
              // currently hovering in the main panel, without displacing that
              // committed one - hovering the active step itself is a no-op
              // here since the `i === step` branch already wins.
              STEPS.map((s, i) => (
                <button key={s.key} type="button" onClick={() => goToStep(i)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors
                    ${i === step ? 'bg-gray-900 text-white' : i === hoveredStepIndex ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100'}`}>
                  {i + 1}. {s.label}
                </button>
              )),
              stepNavContainer
            )}

            {skuLoading && <p className="text-xs text-gray-400 mb-3">Loading product master data…</p>}
            {saveError && <p className="text-xs text-red-500 mb-4">{saveError}</p>}

            <div className="space-y-10">
              <SectionBlock index={1} label={STEPS[0].label} id="step-section-details" onHover={setHoveredStepIndex} onActivate={activateStep}>
                <DetailsStep lineItem={lineItem} sku={sku} category={category} inspectionType={inspectionType} value={details} onChange={setDetails} disabled={disabled} assignedQaName={assignedQaName} />
              </SectionBlock>

              <SectionBlock index={2} label={STEPS[1].label} id="step-section-quantity" onHover={setHoveredStepIndex} onActivate={activateStep}>
                <QuantityStep lineItem={lineItem} value={quantity} onChange={setQuantity} disabled={disabled} inspectionLevel={poInspectionLevel} maxAvailableQty={maxAvailableQty} onSaveNow={saveFieldNow} saveStatus={saveStatus} />
              </SectionBlock>

              <SectionBlock index={3} label={STEPS[2].label} id="step-section-packaging" onHover={setHoveredStepIndex} onActivate={activateStep}
                action={(
                  <div className="hidden md:flex items-center gap-1.5" title="Special inspection level used for the Packaging sample sizes (sized from the Available Qty)">
                    <span className="text-[11px] font-semibold text-gray-500">Sample level</span>
                    <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
                      {PACKAGING_LEVELS.map(l => (
                        <button
                          key={l}
                          type="button"
                          disabled={disabled}
                          onClick={() => setPackaging(prev => applyPackagingLevel(prev, l, packagingLot))}
                          className={`px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer disabled:cursor-not-allowed
                            ${packagingLevel === l ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                )}>
                <PackagingStep value={packagingView} onChange={setPackaging} disabled={disabled} reportId={localId} photos={report?.inspection_report_photos} onChanged={refreshReport}
                  draftId={draftId} pendingPhotos={pendingPhotos} onPendingChanged={refreshPendingPhotos} />
              </SectionBlock>

              <SectionBlock index={4} label={STEPS[3].label} id="step-section-measurement" onHover={setHoveredStepIndex} onActivate={activateStep}>
                <MeasurementStep sku={sku} value={measurement} onChange={setMeasurement} disabled={disabled} reportId={localId} photos={report?.inspection_report_photos} onChanged={refreshReport}
                  draftId={draftId} pendingPhotos={pendingPhotos} onPendingChanged={refreshPendingPhotos} />
              </SectionBlock>

              <SectionBlock index={5} label={STEPS[4].label} id="step-section-barcodes" onHover={setHoveredStepIndex} onActivate={activateStep}>
                <BarcodeStep sku={sku} value={barcodes} onChange={setBarcodes} disabled={disabled} />
              </SectionBlock>

              <SectionBlock index={6} label={STEPS[5].label} id="step-section-onsite" onHover={setHoveredStepIndex} onActivate={activateStep}>
                <OnsiteStep value={onsite} onChange={setOnsite} disabled={disabled} />
              </SectionBlock>

              <SectionBlock index={7} label={STEPS[6].label} id="step-section-workmanship" onHover={setHoveredStepIndex} onActivate={activateStep}>
                <WorkmanshipStep value={workmanshipView} onChange={setWorkmanship} disabled={disabled}
                  reportId={localId} defects={report?.inspection_report_defects} onChanged={refreshReport} plan={aqlPlan} aqlVerdict={aqlVerdict}
                  photos={report?.inspection_report_photos} onPhotosChanged={refreshReport}
                  draftId={draftId} pendingPhotos={pendingPhotos} onPendingChanged={refreshPendingPhotos} />
              </SectionBlock>

              <SectionBlock index={8} label={STEPS[7].label} id="step-section-digitals" onHover={setHoveredStepIndex} onActivate={activateStep}
                action={
                  <div className="flex items-center gap-2">
                    {photoSelectState.selectMode && (
                      <>
                        <button type="button" onClick={() => photoGridRef.current?.toggleSelectAll()}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                          {photoSelectState.count === photoSelectState.total ? 'Clear All' : 'Select All'}
                        </button>
                        <button type="button" onClick={() => photoGridRef.current?.deleteSelected()} disabled={photoSelectState.count === 0}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors">
                          Delete
                        </button>
                      </>
                    )}
                    {!disabled && (report?.inspection_report_photos?.length > 0 || pendingPhotos.some(p => p.stepKey == null)) && (
                      <button type="button" onClick={() => photoGridRef.current?.toggleSelectMode()}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                          ${photoSelectState.selectMode ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        {photoSelectState.selectMode ? 'Done' : 'Select'}
                      </button>
                    )}
                    <DownloadAllPhotosButton photos={report?.inspection_report_photos} poNumber={po?.po_number} skuRef={lineItem.buyer_sku_ref} vendorName={po?.supplier_name} />
                  </div>
                }>
                <PhotoGrid ref={photoGridRef} reportId={localId} photos={report?.inspection_report_photos} disabled={disabled} onChanged={refreshReport} onSelectStateChange={setPhotoSelectState}
                  draftId={draftId} pendingPhotos={pendingPhotos} onPendingChanged={refreshPendingPhotos} />
              </SectionBlock>

              <SectionBlock index={9} label={STEPS[8].label} id="step-section-signoff" onHover={setHoveredStepIndex} onActivate={activateStep}>
                <SignOffStep
                  value={signoff} onChange={setSignoff}
                  attachments={attachments} onUploadAttachment={handleUploadAttachment} onRemoveAttachment={handleRemoveAttachment}
                  reportId={localId} disabled={disabled}
                  newRemark={newRemark} setNewRemark={setNewRemark}
                  sigModes={sigModes} setSigModes={setSigModes}
                  blockAccepted={anyFailed}
                />
                {!disabled && (
                  <div className="flex items-center justify-end pt-5 mt-5 border-t border-gray-100">
                    <button type="button" onClick={requestSubmit} disabled={saving}
                      className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                      Submit Inspection
                    </button>
                  </div>
                )}
              </SectionBlock>

              <SectionBlock index={10} label={STEPS[9].label} id="step-section-preview" onHover={setHoveredStepIndex} onActivate={activateStep}>
                <PreviewStep po={po} report={report} />
              </SectionBlock>
            </div>
          </div>
          <ScrollNav scrollEl={scrollBoxEl} />
        </div>
      )}
      {submitConfirm && (
        <SubmitConfirmModal
          poNumber={po?.po_number}
          skuRef={lineItem.buyer_sku_ref}
          stageLabel={STAGES.find(s => s.key === inspectionType)?.label || inspectionType}
          round={submitConfirm.round}
          result={submitConfirm.result}
          priorRounds={submitConfirm.priorRounds}
          alreadySubmitted={submitConfirm.alreadySubmitted}
          submitting={saving}
          onCancel={() => setSubmitConfirm(null)}
          onConfirm={() => { setSubmitConfirm(null); handleSubmit() }}
        />
      )}
      {leftoverPrompt && !showLeftoverCancelModal && (
        <LeftoverQuantityModal
          quantity={leftoverPrompt.leftoverQty ?? leftoverPrompt.followUpQty}
          choosing={leftoverChoosing}
          onChoose={resolveLeftoverChoice}
          // Dismissing without picking defaults to Reschedule - today's
          // original always-auto-book behavior - rather than leaving the
          // submit stuck half-finished with no way out.
          onClose={() => resolveLeftoverChoice('reschedule')}
        />
      )}
      {showLeftoverCancelModal && leftoverPrompt && (
        <CancelQuantityModal
          lineItem={lineItem}
          defaultQuantity={leftoverPrompt.leftoverQty ?? leftoverPrompt.followUpQty}
          onClose={() => { setShowLeftoverCancelModal(false); setLeftoverPrompt(null) }}
          onSubmitted={finishAfterLeftoverCancelled}
        />
      )}
    </div>
  )
}
