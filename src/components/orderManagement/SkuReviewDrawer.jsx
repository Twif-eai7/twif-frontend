import { useState, useRef, useEffect, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { useSkuImport } from '../../hooks/useSkuImport'
import CategorySelectField from '../plm/CategorySelectField'
import MaterialSelectField from './MaterialSelectField'
import PiPreviewPanel from './PiPreviewPanel'
import { publicUrl } from './poUtils'
import { FIELD_GROUPS } from './skuFieldGroups'

// This drawer's own fixed width (max-w-2xl) — PiPreviewPanel sits to the
// left of it, offset by this many px so the two never overlap. Fixed here
// (unlike PoDrawer's drawerWidthPx) since this drawer's width never varies.
const DRAWER_WIDTH_PX = 672

const NUMERIC_FIELDS = new Set([
  'base_price', 'weight_kg', 'length', 'breadth', 'height', 'padding_cm',
  'inner_pack_length', 'inner_pack_breadth', 'inner_pack_height', 'inner_pack_qty', 'inner_pack_weight_kg', 'inner_pack_cbm',
  'master_pack_length', 'master_pack_breadth', 'master_pack_height', 'master_pack_qty', 'master_pack_weight_kg',
  'item_cbm', 'master_pack_cbm', 'units_per_20ft', 'units_per_40ft', 'units_per_40hq',
])

const REQUIRED_FIELDS = ['buyer_sku_ref', 'description', 'base_price']

// One measurement/weight unit choice applies across item, inner pack, and
// master pack — not picked per-section — so these drive all three columns
// on save rather than being separate fields in FIELD_GROUPS.
const MEASURE_UNIT_KEYS = ['item_measure_unit', 'inner_pack_measure_unit', 'master_pack_measure_unit']
const WEIGHT_UNIT_KEYS  = ['item_weight_unit', 'inner_pack_weight_unit', 'master_pack_weight_unit']
const CM_PER_INCH = 2.54

// weight_kg / inner_pack_weight_kg / master_pack_weight_kg are always stored
// in kg regardless of which unit the reviewer enters in — the *_weight_unit
// columns just remember which unit they last worked in, purely to redisplay
// the same numbers on reopen; they never change what's actually stored.
const WEIGHT_KG_KEYS = ['weight_kg', 'inner_pack_weight_kg', 'master_pack_weight_kg']
const KG_PER_LB = 0.45359237
const toKg  = (v, unit) => (unit === 'lbs' ? v * KG_PER_LB : v)
const fromKg = (v, unit) => (unit === 'lbs' ? v / KG_PER_LB : v)
const round3 = v => Math.round(v * 1000) / 1000
// CBM (m³) is legitimately tiny for small cartons — round3 would show 0.
const round6 = v => Math.round(v * 1_000_000) / 1_000_000

// A stored 0 still counts as "not yet given a real value" — otherwise a SKU
// saved with e.g. item_cbm=0 could never auto-derive again.
function cbmNeedsDerivation(row, cbmKey) {
  const raw = row.confirmed?.[cbmKey] ?? row.needsConfirm?.[cbmKey]
  if (raw === undefined || raw === null || String(raw).trim() === '') return true
  const n = parseFloat(raw)
  return Number.isNaN(n) || n === 0
}

const CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP']

// These three groups are laid out column-major (see skuFieldGroups.js's field
// order for each) — qty/weight/barcode in column one, length/breadth/height
// in column two — rather than the default row-major 2-column flow.
const COLUMN_MAJOR_GROUPS = new Set(['Weight & Dimensions', 'Inner Pack', 'Master Pack'])

function tierOf(row, key) {
  if (row.confirmed?.[key] !== undefined && row.confirmed[key] !== null) return 'confirmed'
  if (row.needsConfirm?.[key] !== undefined) return 'flagged'
  if (row.needsInput && key in row.needsInput) return 'required'
  return 'empty'
}

function TierBadge({ tier }) {
  if (tier === 'confirmed') return <span className="text-[10px] font-medium text-emerald-600">Auto-filled</span>
  if (tier === 'flagged')   return <span className="text-[10px] font-medium text-amber-600">Please verify</span>
  if (tier === 'required')  return <span className="text-[10px] font-medium text-red-500">Required — missing</span>
  return null
}

// Rotates whatever's currently showing (a freshly picked file's object URL,
// or a remote publicUrl for an untouched existing/auto-parsed image) by 90°
// via canvas, and resolves a PNG blob — same "always re-encode as PNG on
// edit" choice PLM's ImageEditorModal already makes, rather than juggling
// per-format re-compression.
function rotateImage(srcUrl, degrees) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const swap = degrees % 180 !== 0
      const canvas = document.createElement('canvas')
      canvas.width = swap ? img.height : img.width
      canvas.height = swap ? img.width : img.height
      const ctx = canvas.getContext('2d')
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((degrees * Math.PI) / 180)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not process this image')), 'image/png')
    }
    img.onerror = () => reject(new Error('Could not load this image to rotate it'))
    img.src = srcUrl
  })
}

// Square drag/drop dropzone + preview, one photo per SKU. Kept deliberately
// simple (no crop/edit step like PLM's ImageEditorModal) — this is a quick
// reference photo for production SKUs, not a styled catalog shot.
function ImageField({ preview, onFile, onRemove, onRotate, rotating }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) onFile(file)
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Image</label>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]) }} />
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`relative w-32 h-32 rounded-xl border-2 border-dashed overflow-hidden transition-colors
          ${preview ? (dragging ? 'border-gray-900' : 'border-transparent') : dragging ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}
      >
        {preview ? (
          <>
            <img src={preview} alt="SKU" className="absolute inset-0 w-full h-full object-cover" />
            {/* Replace — a photo the parser already picked up, or one attached
                earlier, is still just a default, not locked in */}
            <button type="button" onClick={() => inputRef.current?.click()} title="Replace image"
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white bg-black/0 hover:bg-black/50 opacity-0 hover:opacity-100 transition-all cursor-pointer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-[9px] font-semibold">Replace</span>
            </button>
            <button type="button" onClick={onRemove} title="Remove image"
              className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors cursor-pointer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <button type="button" onClick={onRotate} disabled={rotating} title="Rotate 90°"
              className="absolute top-1 left-1 w-6 h-6 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed">
              {rotating ? (
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 12a9 9 0 1 1 3 6.7" /><polyline points="3 17 3 21 7 21" />
                </svg>
              )}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-gray-400 cursor-pointer">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-[10px] font-semibold">Add photo</span>
          </button>
        )}
      </div>
    </div>
  )
}

// `weightUnit` is the unit these values should be *displayed* in — the
// underlying weight_kg columns are always kg, so if the reviewer last
// worked in lbs, the stored kg number is converted back to lbs here for
// the field to show what they'd actually recognize.
function initValues(row, weightUnit) {
  const values = {}
  FIELD_GROUPS.forEach(g => g.fields.forEach(([key]) => {
    const v = row.confirmed?.[key] ?? row.needsConfirm?.[key] ?? null
    if (v === null || v === undefined) { values[key] = ''; return }
    values[key] = WEIGHT_KG_KEYS.includes(key) ? String(round3(fromKg(Number(v), weightUnit))) : String(v)
  }))
  return values
}

// Three ways this drawer can save, decided by what's passed in:
// - `directSkuId` set (Item Master's Edit flow) → update_sku_direct, no
//   sku_import_rows/batch involved.
// - `row.rowId` set, no `directSkuId` (SKU Import's review flow) → confirmRow,
//   keyed on the staging row.
// - Neither (PO Drawer's inline "+ Create new SKU") → create_sku_direct, a
//   brand new SKU with no staging row or batch at all.
export default function SkuReviewDrawer({ row, buyerOrgId, vendorId, memberId, onClose, onSaved, directSkuId, piFileUrl, productDetailsFileUrl, poFileUrl, nested }) {
  const { confirmRow, updateSkuDirect, createSkuDirect, uploadSkuImage } = useSkuImport()
  const isEdit = row.status === 'confirmed'
  // Which reference doc (if any) is currently shown alongside this drawer —
  // 'pi' | 'productDetails' | 'po' | null. Only one at a time, same toggle
  // pattern PoDrawer's own "View PI" button already uses.
  const [previewDoc, setPreviewDoc] = useState(null)
  // Computed up front (not via useState's lazy initializer) so initValues
  // can use it below — weight_kg-family values need to be displayed in
  // whichever unit was last used, not the raw stored kg number.
  const initialWeightUnit = WEIGHT_UNIT_KEYS.map(k => row.confirmed?.[k]).find(Boolean) || 'kg'
  const [values, setValues]         = useState(() => initValues(row, initialWeightUnit))
  const [categoryId, setCategoryId] = useState(row.confirmed?.category_id || null)
  const [currency, setCurrency]     = useState(row.confirmed?.currency || 'USD')
  const [primaryMaterialId, setPrimaryMaterialId]     = useState(row.confirmed?.primary_base_material_id || null)
  const [secondaryMaterialId, setSecondaryMaterialId] = useState(row.confirmed?.secondary_base_material_id || null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState(null)
  const [missing, setMissing]       = useState(new Set())

  // A single toggle each for measurement/weight unit — whichever of the
  // three per-section columns already has a value wins (they're always
  // written in lockstep by this form), defaulting to cm/kg for a brand new SKU.
  const [measureUnit, setMeasureUnit] = useState(() =>
    MEASURE_UNIT_KEYS.map(k => row.confirmed?.[k]).find(Boolean) || 'cm')
  const [weightUnit, setWeightUnit] = useState(initialWeightUnit)

  // Switching the toggle re-displays the same real quantity in the new
  // unit — 23 kg becomes ~50.7 lbs, not "23" silently reinterpreted as lbs.
  // Saving always converts whatever's on screen back to kg regardless.
  const handleWeightUnitChange = (newUnit) => {
    if (newUnit === weightUnit) return
    setValues(prev => {
      const next = { ...prev }
      WEIGHT_KG_KEYS.forEach(k => {
        const raw = parseFloat(prev[k])
        if (Number.isNaN(raw)) return
        next[k] = String(round3(fromKg(toKg(raw, weightUnit), newUnit)))
      })
      return next
    })
    setWeightUnit(newUnit)
  }

  const [autoItemCbm, setAutoItemCbm] = useState(() => cbmNeedsDerivation(row, 'item_cbm'))
  const [autoInnerCbm, setAutoInnerCbm] = useState(() => cbmNeedsDerivation(row, 'inner_pack_cbm'))
  const [autoMasterCbm, setAutoMasterCbm] = useState(() => cbmNeedsDerivation(row, 'master_pack_cbm'))

  useEffect(() => {
    if (!autoItemCbm) return
    const l = parseFloat(values.length), b = parseFloat(values.breadth), h = parseFloat(values.height)
    if (Number.isNaN(l) || Number.isNaN(b) || Number.isNaN(h)) return
    const toCm = v => (measureUnit === 'in' ? v * CM_PER_INCH : v)
    const rounded = String(round6((toCm(l) * toCm(b) * toCm(h)) / 1_000_000))
    setValues(prev => (prev.item_cbm === rounded ? prev : { ...prev, item_cbm: rounded }))
  }, [values.length, values.breadth, values.height, measureUnit, autoItemCbm])

  useEffect(() => {
    if (!autoInnerCbm) return
    const l = parseFloat(values.inner_pack_length), b = parseFloat(values.inner_pack_breadth), h = parseFloat(values.inner_pack_height)
    if (Number.isNaN(l) || Number.isNaN(b) || Number.isNaN(h)) return
    const toCm = v => (measureUnit === 'in' ? v * CM_PER_INCH : v)
    const rounded = String(round6((toCm(l) * toCm(b) * toCm(h)) / 1_000_000))
    setValues(prev => (prev.inner_pack_cbm === rounded ? prev : { ...prev, inner_pack_cbm: rounded }))
  }, [values.inner_pack_length, values.inner_pack_breadth, values.inner_pack_height, measureUnit, autoInnerCbm])

  useEffect(() => {
    if (!autoMasterCbm) return
    const l = parseFloat(values.master_pack_length), b = parseFloat(values.master_pack_breadth), h = parseFloat(values.master_pack_height)
    if (Number.isNaN(l) || Number.isNaN(b) || Number.isNaN(h)) return
    const toCm = v => (measureUnit === 'in' ? v * CM_PER_INCH : v)
    const rounded = String(round6((toCm(l) * toCm(b) * toCm(h)) / 1_000_000))
    setValues(prev => (prev.master_pack_cbm === rounded ? prev : { ...prev, master_pack_cbm: rounded }))
  }, [values.master_pack_length, values.master_pack_breadth, values.master_pack_height, measureUnit, autoMasterCbm])

  // imageFile: a newly picked file pending upload (uploaded on Save, not on
  // pick, so cancelling the drawer doesn't leave orphaned storage objects).
  // imageRef: the value that will end up on skus.image_url — either the
  // existing ref (untouched), or null once explicitly removed.
  const [imageFile, setImageFile]     = useState(null)
  const [imageRef, setImageRef]       = useState(row.confirmed?.image_url || null)
  const [imagePreview, setImagePreview] = useState(() => row.confirmed?.image_url ? publicUrl(row.confirmed.image_url) : null)
  const [rotating, setRotating]       = useState(false)
  const [imageError, setImageError]   = useState(null)

  const handleImageFile = (file) => {
    if (imageFile && imagePreview) URL.revokeObjectURL(imagePreview)
    setImageError(null)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }
  const handleRemoveImage = () => {
    if (imageFile && imagePreview) URL.revokeObjectURL(imagePreview)
    setImageError(null)
    setImageFile(null)
    setImageRef(null)
    setImagePreview(null)
  }
  // Rotating an untouched existing/auto-parsed image (imageFile still null)
  // effectively "picks" the rotated result as the new pending file — same
  // upload-on-save path a manual replace takes, just sourced from a canvas
  // blob instead of a file input.
  const handleRotateImage = async () => {
    if (!imagePreview || rotating) return
    setRotating(true)
    setImageError(null)
    try {
      const blob = await rotateImage(imagePreview, 90)
      const rotatedFile = new File([blob], `rotated-${Date.now()}.png`, { type: 'image/png' })
      if (imageFile && imagePreview) URL.revokeObjectURL(imagePreview)
      setImageFile(rotatedFile)
      setImagePreview(URL.createObjectURL(rotatedFile))
    } catch (err) {
      setImageError(err.message || 'Could not rotate this image')
    } finally {
      setRotating(false)
    }
  }

  const setField = (key, val) => {
    setValues(prev => ({ ...prev, [key]: val }))
    // Typing into a CBM field directly overrides the L/B/H math for that field.
    if (key === 'item_cbm') setAutoItemCbm(false)
    if (key === 'inner_pack_cbm') setAutoInnerCbm(false)
    if (key === 'master_pack_cbm') setAutoMasterCbm(false)
    // Clear this field's "missing" flag the moment it's filled in, rather
    // than leaving the red border/message up until the next Save click.
    if (missing.has(key) && String(val ?? '').trim()) {
      setMissing(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  const handleSave = async () => {
    if (saving) return
    setError(null)

    const stillMissing = new Set(
      REQUIRED_FIELDS.filter(f => !String(values[f] ?? '').trim())
    )
    if (stillMissing.size > 0) {
      setMissing(stillMissing)
      return
    }
    setMissing(new Set())

    const fields = {}
    FIELD_GROUPS.forEach(g => g.fields.forEach(([key]) => {
      const raw = values[key]
      if (raw === '' || raw === null || raw === undefined) { fields[key] = null; return }
      fields[key] = NUMERIC_FIELDS.has(key) ? parseFloat(raw) : raw
    }))
    fields.primary_base_material_id   = primaryMaterialId
    fields.secondary_base_material_id = secondaryMaterialId
    fields.currency = currency
    MEASURE_UNIT_KEYS.forEach(k => { fields[k] = measureUnit })
    WEIGHT_UNIT_KEYS.forEach(k => { fields[k] = weightUnit })
    // weight_kg columns are always stored in kg — whatever's on screen right
    // now is in `weightUnit`, so convert it back before it hits the DB.
    WEIGHT_KG_KEYS.forEach(k => {
      if (fields[k] != null) fields[k] = round3(toKg(fields[k], weightUnit))
    })

    setSaving(true)
    try {
      // Only uploads if a new file was picked this session — an untouched
      // existing image, or an explicit removal, both skip straight to the
      // ref already sitting in imageRef.
      fields.image_url = imageFile ? await uploadSkuImage(imageFile, buyerOrgId, values.buyer_sku_ref, values.colour) : imageRef
      let skuId
      if (directSkuId) {
        await updateSkuDirect(directSkuId, { updatedBy: memberId, categoryId, fields })
        skuId = directSkuId
      } else if (row.rowId) {
        skuId = await confirmRow(row.rowId, { createdBy: memberId, vendorId, buyerOrgId, categoryId, fields })
      } else {
        skuId = await createSkuDirect({ createdBy: memberId, vendorId, buyerOrgId, categoryId, fields })
      }
      onSaved(row.rowId, skuId, fields, categoryId)
    } catch (err) {
      setError(err.message || 'Could not save this SKU. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <>
      {/* PO Drawer's own "+ Create SKU" flows pass `nested` — no backdrop, so
          PO Drawer (and its PI preview) stay visible/usable behind this
          panel instead of being fully obscured by a second dimming overlay.
          No click-outside-to-close in that case; the X/Cancel buttons cover it. */}
      {!nested && <div className="fixed inset-0 z-[130] bg-black/40" onClick={!saving ? onClose : undefined} />}
      <div className="fixed inset-y-0 right-0 z-[140] w-full max-w-2xl bg-white shadow-2xl flex flex-col">

        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 flex-shrink-0 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900">{isEdit ? 'Edit SKU' : 'Review SKU'}</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {values.buyer_sku_ref || values.description || 'Unreviewed row'}
            </p>
          </div>
          {piFileUrl && (
            <button type="button" onClick={() => setPreviewDoc(d => d === 'pi' ? null : 'pi')}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 bg-white text-[10px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0 cursor-pointer">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />
              </svg>
              {previewDoc === 'pi' ? 'Hide PI' : 'View PI'}
            </button>
          )}
          {productDetailsFileUrl && productDetailsFileUrl !== piFileUrl && (
            <button type="button" onClick={() => setPreviewDoc(d => d === 'productDetails' ? null : 'productDetails')}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 bg-white text-[10px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0 cursor-pointer">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />
              </svg>
              {previewDoc === 'productDetails' ? 'Hide Sheet' : 'View Sheet'}
            </button>
          )}
          {poFileUrl && (
            <button type="button" onClick={() => setPreviewDoc(d => d === 'po' ? null : 'po')}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 bg-white text-[10px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0 cursor-pointer">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />
              </svg>
              {previewDoc === 'po' ? 'Hide PO' : 'View PO'}
            </button>
          )}
          <button type="button" onClick={!saving ? onClose : undefined}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-black transition-colors flex-shrink-0 cursor-pointer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div>
              <ImageField preview={imagePreview} onFile={handleImageFile} onRemove={handleRemoveImage}
                onRotate={handleRotateImage} rotating={rotating} />
              {imageError && <p className="mt-1.5 text-[11px] text-red-600 max-w-[128px]">{imageError}</p>}
            </div>
            <div className="flex-1 min-w-0 w-full">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Category</label>
              <CategorySelectField hideLabel stacked initialCategoryId={categoryId} onChange={(id) => setCategoryId(id)} />
            </div>
          </div>

          {FIELD_GROUPS.map(group => (
            <Fragment key={group.title}>
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">{group.title}</h3>
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${COLUMN_MAJOR_GROUPS.has(group.title) ? 'sm:grid-flow-col sm:grid-rows-3' : ''}`}>
                {group.fields.map(([key, label]) => {
                  const parsedTier = tierOf(row, key)
                  // "Required — missing" reflects the original parsed row, not
                  // what's currently typed — once the field actually has a
                  // value, the badge should clear instead of staying stuck.
                  const hasValue = String(values[key] ?? '').trim() !== ''
                  const tier = parsedTier === 'required' && hasValue ? null : parsedTier
                  const isRequired = REQUIRED_FIELDS.includes(key)
                  const showError = missing.has(key)
                  // Pricing's lone base_price field gets a Currency select as
                  // a companion (added separately below), so it shouldn't
                  // claim the full row the way an actually-solo field
                  // (e.g. Packing's packing_material) should.
                  const soloField = group.fields.length === 1 && group.title !== 'Pricing'
                  return (
                    <div key={key} className={soloField ? 'col-span-2' : ''}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-gray-700">
                          {label}{isRequired && <span className="text-red-500 ml-0.5">*</span>}
                        </label>
                        {!isEdit && <TierBadge tier={tier} />}
                      </div>
                      <input
                        type={NUMERIC_FIELDS.has(key) ? 'number' : 'text'}
                        step={NUMERIC_FIELDS.has(key) ? 'any' : undefined}
                        value={values[key]}
                        onChange={e => setField(key, e.target.value)}
                        className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-colors
                          ${showError ? 'border-red-400' : tier === 'flagged' ? 'border-amber-300' : 'border-gray-200'}`}
                      />
                      {/* weight_kg is what actually gets saved — this just
                          proves the conversion is happening, since the field
                          itself always displays in the current weightUnit. */}
                      {WEIGHT_KG_KEYS.includes(key) && weightUnit === 'lbs' && values[key] !== '' && !Number.isNaN(parseFloat(values[key])) && (
                        <p className="mt-1 text-[10px] text-gray-400">≈ {round3(toKg(parseFloat(values[key]), 'lbs'))} kg</p>
                      )}
                    </div>
                  )
                })}
                {group.title === 'Identification' && (
                  <>
                    <MaterialSelectField label="Primary Material" value={primaryMaterialId} onChange={setPrimaryMaterialId}
                      legacyText={row.confirmed?.primary_base_material || row.needsConfirm?.primary_base_material} />
                    <MaterialSelectField label="Secondary Material" value={secondaryMaterialId} onChange={setSecondaryMaterialId}
                      legacyText={row.confirmed?.secondary_base_material} />
                  </>
                )}
                {group.title === 'Pricing' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Currency</label>
                    <select value={currency} onChange={e => setCurrency(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-colors cursor-pointer">
                      {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
            {/* Applies to item, inner pack & master pack dimensions/weight
                alike — shown once, right after Pricing and before those
                groups start, so it reads as governing everything below it. */}
            {group.title === 'Pricing' && (
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Units</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Weight Unit</label>
                    <select value={weightUnit} onChange={e => handleWeightUnitChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-colors cursor-pointer">
                      <option value="kg">kg</option>
                      <option value="lbs">lbs</option>
                    </select>
                    <p className="mt-1 text-[10px] text-gray-400">Applies to item, inner pack &amp; master pack weight</p>
                  </div>
                   <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Measurement Unit</label>
                    <select value={measureUnit} onChange={e => setMeasureUnit(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-colors cursor-pointer">
                      <option value="cm">cm</option>
                      <option value="in">in</option>
                    </select>
                    <p className="mt-1 text-[10px] text-gray-400">Applies to item, inner pack &amp; master pack dimensions</p>
                  </div>
                </div>
              </div>
            )}
            </Fragment>
          ))}

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 flex-wrap px-6 py-3 border-t border-gray-100 flex-shrink-0">
          {missing.size > 0 && (
            <span className="text-xs font-medium text-red-500 mr-auto w-full sm:w-auto">Fill in the required field(s) above</span>
          )}
          <button type="button" onClick={onClose} disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {saving && <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>}
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Confirm & Save'}
          </button>
        </div>
      </div>

      {previewDoc === 'pi' && (
        <PiPreviewPanel url={publicUrl(piFileUrl)} offsetRightPx={DRAWER_WIDTH_PX} title="PI Document" onClose={() => setPreviewDoc(null)} />
      )}
      {previewDoc === 'productDetails' && (
        <PiPreviewPanel url={publicUrl(productDetailsFileUrl)} offsetRightPx={DRAWER_WIDTH_PX} title="Product Sheet" onClose={() => setPreviewDoc(null)} />
      )}
      {previewDoc === 'po' && (
        <PiPreviewPanel url={publicUrl(poFileUrl)} offsetRightPx={DRAWER_WIDTH_PX} title="PO Document" onClose={() => setPreviewDoc(null)} />
      )}
    </>,
    document.body
  )
}
