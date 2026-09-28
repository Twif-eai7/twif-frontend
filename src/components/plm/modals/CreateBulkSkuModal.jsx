import { useState, useRef, useCallback, useEffect } from 'react'
import { usePlmStore, SEASONS } from '../../../stores/plmStore'
import { useBuyerOrgs, useSupplierOrgs, useOrgsLoading } from '../../../stores/orgsStore'
import { useProfileStore, useMemberId } from '../../../stores/profileStore'
import { useSkuCache } from '../../../hooks/useSkuCache'
import { resolveBuyerOrgsForMember, resolveSupplierOrgsForBuyer, resolveBuyerOrgsForSupplier } from '../../../lib/poQueries'
import SearchableSelect from '../../ui/SearchableSelect'
import CategorySelectField from '../CategorySelectField'
import BuyerSkuField from '../BuyerSkuField'
import ImageEditorModal from './ImageEditorModal'
import CameraCaptureModal from './CameraCaptureModal'
import RichNoteEditor from '../RichNoteEditor'
import { notePlainText, extractImageUrls } from '../richNote'

const emptyFields = () => ({
  categoryId:      null,
  categoryName:    null,
  buyerSkuRef:     '',
  tempSkuRef:      '',
  productionSkuId: null,
  description:     '',
  material:        '',
  finish:          '',
  weight:          '',
  l: '', w: '', h: '',
  measurement:     'cm',
  originalPrice:    '',
  originalCurrency: 'USD',
  notesHtml:       '',    // rich-text note for this SKU (→ npd2_catalog_skus.notes)
  specImages:      [],     // inline note image URLs (→ npd2_catalog_skus.spec_images, origin 'kaptr')
})

// "kaptr — snap it. tag it. it's live." wordmark shown in the header when the modal
// is opened from the Kaptr nav entry point (newOnly).
function KaptrWordmark() {
  return (
    <span className="flex flex-col leading-none">
      <span className="text-[20px] font-black tracking-[-.02em] text-black lowercase">kaptr</span>
      <span className="text-[10px] font-semibold text-[#C0442E] mt-0.5">snap it. tag it. it&apos;s live.</span>
    </span>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
// newOnly: hide the "Existing Production SKU" choice and force mode='new' — used by the
// Kaptr entry point, where the only purpose is capturing brand-new SKUs.
export default function CreateBulkSkuModal({ onClose, newOnly = false }) {
  const createSkusBulk = usePlmStore(s => s.createSkusBulk)
  const role           = usePlmStore(s => s.role)
  const buyerList      = useBuyerOrgs()
  const supplierList   = useSupplierOrgs()
  const orgsLoading    = useOrgsLoading()
  const orgMembership  = useProfileStore(s => s.orgMembership)
  const memberId       = useMemberId()
  const { getSkus, invalidate } = useSkuCache()

  const [mode,             setMode]             = useState('new')   // 'new' | 'existing'
  const [step,             setStep]             = useState(1)
  const [images,           setImages]           = useState([])
  const [editingImageIdx,  setEditingImageIdx]  = useState(null)
  const [cameraOpen,       setCameraOpen]       = useState(false)
  const [camShots,         setCamShots]         = useState(0)   // shots this camera session, for the modal's counter
  const [notesIdx,         setNotesIdx]         = useState(null) // which image's Notes editor is open
  const uploadNoteImage = usePlmStore(s => s.uploadNoteImage)
  const [dragging,       setDragging]       = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [season,         setSeason]         = useState('')
  const [supplier,       setSupplier]       = useState(null)   // { id, name }
  const [buyer,               setBuyer]               = useState(null)   // { id, name }
  const [cascadedSuppliers,   setCascadedSuppliers]   = useState([])
  const [suppCascadeLoading,  setSuppCascadeLoading]  = useState(false)
  const [productionSkus, setProductionSkus] = useState([])
  const [skusLoading,    setSkusLoading]    = useState(false)
  const [supplierBuyerOrgs, setSupplierBuyerOrgs] = useState([]) // buyers THIS vendor org actually works with
  const [errors,         setErrors]         = useState({ supplier: false, buyer: false, buyerSkuRefs: new Set(), saveError: null })

  useEffect(() => {
    if (role === 'supplier' && orgMembership?.orgId) {
      setSupplier({ id: orgMembership.orgId, name: orgMembership.orgDisplayName || orgMembership.orgName || 'My Organisation' })
    }
  }, [role, orgMembership])

  useEffect(() => {
    if (buyerList.length === 1 && !buyer) setBuyer(buyerList[0])
  }, [buyerList])

  // Vendor uploads previously had no buyer field at all here — scoped to buyers this
  // vendor org actually has an active buyer_supplier_links relationship with (same source
  // as CatalogUploadModal.jsx's identical fix), not every buyer in the system.
  useEffect(() => {
    if (role !== 'supplier' || !orgMembership?.orgId) return
    resolveBuyerOrgsForSupplier(orgMembership.orgId).then(orgs => {
      setSupplierBuyerOrgs(orgs)
      if (orgs.length === 1) setBuyer(orgs[0])
    })
  }, [role, orgMembership?.orgId])

  useEffect(() => {
    if (!buyer?.id || !memberId || role === 'supplier') return
    setSupplier(null)
    setCascadedSuppliers([])
    setSuppCascadeLoading(true)
    resolveSupplierOrgsForBuyer(memberId, buyer.id)
      .then(orgs => {
        setCascadedSuppliers(orgs)
        if (orgs.length === 1) setSupplier(orgs[0])
      })
      .finally(() => setSuppCascadeLoading(false))
  }, [buyer?.id, memberId, role])

  // Load production SKUs once when reaching step 2
  useEffect(() => {
    if (step !== 2 || !memberId || productionSkus.length) return
    setSkusLoading(true)
    resolveBuyerOrgsForMember(memberId).then(async (orgs) => {
      const results = await Promise.all(orgs.map(o => getSkus(o.id)))
      const merged = Object.values(
        results.flat().reduce((acc, s) => { acc[s.id] = s; return acc }, {})
      )
      setProductionSkus(merged)
      setSkusLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, memberId])

  // Per-image attributes: { [index]: fields }
  const [edits, setEdits] = useState({})

  const fileRef   = useRef(null)
  const folderRef = useRef(null)

  useEffect(() => {
    if (folderRef.current) folderRef.current.setAttribute('webkitdirectory', '')
  }, [])

  const getFields = (i)       => edits[i] || emptyFields()
  const setField  = (i, k, v) => setEdits(prev => ({ ...prev, [i]: { ...(prev[i] || emptyFields()), [k]: v } }))
  const setFields = (i, patch) => setEdits(prev => ({ ...prev, [i]: { ...(prev[i] || emptyFields()), ...patch } }))

  const handleFiles = (files) => {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!imgs.length) return
    setImages(prev => [...prev, ...imgs.map(file => ({ file, preview: URL.createObjectURL(file) }))])
  }

  // Each camera shot is just another image in the batch — same shape handleFiles produces,
  // so the rest of the flow (edit, attributes, createSkusBulk) needs no changes.
  const handleCameraShot = (file) => {
    setImages(prev => [...prev, { file, preview: URL.createObjectURL(file) }])
    setCamShots(n => n + 1)
  }
  const openCamera  = () => { setCamShots(0); setCameraOpen(true) }
  const closeCamera = () => setCameraOpen(false)

  useEffect(() => () => { images.forEach(img => URL.revokeObjectURL(img.preview)) }, [])

  const removeImage = (idx) => {
    URL.revokeObjectURL(images[idx].preview)
    setImages(prev => prev.filter((_, i) => i !== idx))
    setEdits(prev => {
      const next = {}
      Object.entries(prev).forEach(([k, v]) => {
        const ki = parseInt(k)
        if (ki < idx)      next[ki]     = v
        else if (ki > idx) next[ki - 1] = v
      })
      return next
    })
  }

  const onDrop = useCallback(e => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [])

  useEffect(() => {
    const handlePaste = (e) => {
      // A paste while focused inside a SKU's own Notes editor (RichNoteEditor) is that
      // editor's own onPaste to handle — inserting it inline into the note. Without this
      // check, this global listener fired for the SAME paste regardless of where it actually
      // happened, and ALSO added the same image as a brand-new SKU card. document.activeElement
      // (not e.target) since a paste's target can land on a text node inside the editable div,
      // which has no .closest — the focused element itself is always the div.
      if (document.activeElement?.closest?.('.rich-note-editable')) return
      const imgs = Array.from(e.clipboardData?.items || []).filter(i => i.type.startsWith('image/'))
      if (imgs.length) handleFiles(imgs.map(i => i.getAsFile()))
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [])

  const clearBuyerSkuRefError = (i) => {
    setErrors(prev => {
      if (!prev.buyerSkuRefs.has(i)) return prev
      const next = new Set(prev.buyerSkuRefs)
      next.delete(i)
      return { ...prev, buyerSkuRefs: next }
    })
  }

  const handleBulkEditorSave = (blob) => {
    const idx = editingImageIdx
    setEditingImageIdx(null)
    const newPreview = URL.createObjectURL(blob)
    setImages(prev => prev.map((img, i) => {
      if (i !== idx) return img
      URL.revokeObjectURL(img.preview)
      return { ...img, file: new File([blob], img.file.name, { type: 'image/png' }), preview: newPreview }
    }))
  }

  const handleSave = async () => {
    const newErrors = { supplier: false, buyer: false, buyerSkuRefs: new Set(), saveError: null }
    if (!supplier?.id) newErrors.supplier = true
    if (!buyer?.id) newErrors.buyer = true
    if (mode === 'existing') {
      images.forEach((_, i) => {
        const f = getFields(i)
        if (!f.buyerSkuRef?.trim() && !f.tempSkuRef?.trim()) newErrors.buyerSkuRefs.add(i)
      })
    }
    if (newErrors.supplier || newErrors.buyer || newErrors.buyerSkuRefs.size > 0) { setErrors(newErrors); return }
    setSaving(true)
    try {
      const attributesPerImage = images.map((_, i) => getFields(i))
      await createSkusBulk(images, attributesPerImage, { season, supplierOrgId: supplier.id, supplier: supplier.name, mode, buyerOrgId: buyer?.id })
      // PO Drawer's line-item SKU autocomplete caches this buyer's SKU list for
      // the whole tab session — without dropping it here, a SKU created through
      // this modal stays invisible there until a full page reload.
      if (buyer?.id) invalidate(buyer.id)
      onClose()
    } catch (err) {
      setErrors(prev => ({ ...prev, saveError: err.message }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40">
      <div className="bg-white w-full max-w-5xl mx-2 sm:mx-4 flex flex-col max-h-[92vh] sm:max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-black/10 flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {newOnly
              ? <KaptrWordmark />
              : <span className="text-[13px] font-bold uppercase tracking-[.06em]">Create SKUs in Bulk</span>}
            {step === 2 && (
              <span className="text-[12px] text-black/50">{images.length} image{images.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <button onClick={onClose} className="text-black/40 hover:text-black text-lg leading-none cursor-pointer border-none bg-transparent">×</button>
        </div>

        {step === 1 ? (
          <>
            {/* Step 1 — select images */}
            <div className="flex-1 flex flex-col p-4 sm:p-6 gap-5 overflow-y-auto">

              {/* Mode picker — "Existing Production SKU" links a batch to already-shipped
                  production records via a real PO; only merchants do that linking, so vendors
                  never get the option and stay on 'new' (the modal's default). Hidden entirely
                  for the Kaptr entry point (newOnly). */}
              {!newOnly && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-[.08em] text-black/50">SKU Type</span>
                  <div className="flex border border-black/15 overflow-hidden self-start">
                    {(role === 'supplier' ? [['new', 'New SKU']] : [['new', 'New SKU'], ['existing', 'Existing Production SKU']]).map(([val, label]) => (
                      <button key={val} type="button" onClick={() => setMode(val)}
                        className={`px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] cursor-pointer border-none transition-colors ${mode === val ? 'bg-[#1A1A18] text-white' : 'bg-white text-black/45 hover:bg-black/5'}`}
                      >{label}</button>
                    ))}
                  </div>
                  {mode === 'existing' && (
                    <p className="text-[10px] text-black/45">Buyer SKU Ref will be required for each image — used to link to the production record.</p>
                  )}
                </div>
              )}

              {/* Camera | Upload — two equal tiles split by a divider. Upload also takes
                  drag-drop / paste anywhere in the box. */}
              <div
                className={`flex rounded-lg border-2 overflow-hidden transition-colors ${dragging ? 'border-black bg-black/[.03]' : 'border-black/15'}`}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <button type="button" onClick={openCamera}
                  className="flex-1 flex flex-col items-center justify-center gap-3 py-12 cursor-pointer bg-transparent hover:bg-black/[.03] transition-colors"
                >
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#1A1A18" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  <span className="text-[12px] font-bold uppercase tracking-[.06em]">Camera</span>
                  <span className="text-[10px] text-black/40 -mt-1.5">snap it at the fair</span>
                </button>

                <div className="w-px self-stretch bg-black/15 my-8 flex-shrink-0" />

                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex-1 flex flex-col items-center justify-center gap-3 py-12 cursor-pointer bg-transparent hover:bg-black/[.03] transition-colors"
                >
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#1A1A18" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span className="text-[12px] font-bold uppercase tracking-[.06em]">Upload</span>
                  <span className="text-[10px] text-black/40 -mt-1.5">drop · paste · click</span>
                </button>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={e => handleFiles(e.target.files)} />
              </div>

              <div className="flex justify-center">
                <button type="button"
                  className="text-[10px] font-semibold uppercase tracking-[.06em] text-black/40 hover:text-black/70 cursor-pointer transition-colors"
                  onClick={() => folderRef.current?.click()}
                >
                  or select a whole folder
                </button>
                <input ref={folderRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={e => handleFiles(e.target.files)} />
              </div>

              {images.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[.07em] text-black/50 mb-2">
                    {images.length} image{images.length !== 1 ? 's' : ''} selected
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {images.map((img, i) => (
                      <div key={i} className="relative w-16 h-16 flex-shrink-0">
                        <img src={img.preview} alt={img.file.name} className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removeImage(i)}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-[#1A1A18] text-white text-[10px] rounded-full flex items-center justify-center cursor-pointer border-none leading-none"
                        >×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 sm:gap-3 px-3 sm:px-5 py-3 border-t border-black/10 flex-shrink-0">
              <button onClick={onClose} className="px-3 sm:px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] border border-black/20 bg-white cursor-pointer hover:bg-black/5">
                Cancel
              </button>
              <button onClick={() => setStep(2)} disabled={!images.length}
                className="px-3 sm:px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-[#F5F3EF] cursor-pointer hover:opacity-80 disabled:opacity-50 whitespace-nowrap"
              >
                Next — Fill Attributes
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Step 2 — attributes */}

            {/* Per-image cards — the "Apply to all" batch settings scroll with the form
                (rather than sitting in a fixed header) so they don't eat the viewport on
                mobile once you start filling per-SKU details lower down. */}
            <div className="overflow-y-auto p-4 sm:p-5 flex flex-col gap-3 flex-1">

            {/* Shared: buyer + vendor + season — a fluid grid so the three sit on one row
                from tablet up (each taking an equal share) and stack cleanly on phones,
                instead of wrapping Season onto its own half-empty line. */}
            <div className="pb-3 mb-1 border-b border-black/10 flex flex-col sm:flex-row sm:items-end gap-x-4 gap-y-2">
              <span className="text-[10px] font-bold uppercase tracking-[.07em] text-black/40 self-start sm:self-center shrink-0 sm:pb-1.5">Apply to all:</span>
              <div className={`grid grid-cols-1 gap-3 flex-1 min-w-0 ${role === 'supplier' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
                {(() => {
                  const buyerOptions = role === 'supplier' ? supplierBuyerOrgs : buyerList
                  return (
                    <div className="flex flex-col gap-1 min-w-0">
                      <label className={`text-[11px] font-semibold uppercase tracking-[.06em] ${errors.buyer ? 'text-red-500' : 'text-black/80'}`}>Buyer *</label>
                      <SearchableSelect
                        options={buyerOptions.map(b => ({ value: b.id, label: b.name }))}
                        value={buyer?.id || ''}
                        onChange={id => {
                          setBuyer(buyerOptions.find(b => b.id === id) || null)
                          if (errors.buyer) setErrors(prev => ({ ...prev, buyer: false }))
                        }}
                        placeholder={buyerOptions.length ? 'Select buyer…' : role === 'supplier' ? 'No buyers linked to your organisation yet' : 'No buyers assigned'}
                        disabled={orgsLoading || !buyerOptions.length}
                        triggerClassName={`px-2.5 py-1.5 border rounded-md text-[13px] bg-white outline-none w-full disabled:opacity-50 ${errors.buyer ? 'border-red-500' : 'border-black/[.18]'}`}
                        dropdownClassName="border border-black/[.15] rounded-md mt-0.5"
                      />
                      {errors.buyer && <span className="text-[9px] font-semibold text-red-500 uppercase tracking-[.04em]">Fill in the required field(s)</span>}
                    </div>
                  )
                })()}
                {role !== 'supplier' && (
                  <div className="flex flex-col gap-1 min-w-0">
                    <label className={`text-[11px] font-semibold uppercase tracking-[.06em] ${errors.supplier ? 'text-red-500' : 'text-black/80'}`}>Vendor *</label>
                    <SearchableSelect
                      options={(buyerList.length > 0 ? cascadedSuppliers : supplierList).map(s => ({ value: s.id, label: s.name }))}
                      value={supplier?.id || ''}
                      onChange={id => {
                        const list = buyerList.length > 0 ? cascadedSuppliers : supplierList
                        setSupplier(list.find(s => s.id === id) || null)
                        if (errors.supplier) setErrors(prev => ({ ...prev, supplier: false }))
                      }}
                      placeholder={suppCascadeLoading ? 'Loading vendors…' : buyerList.length > 0 && !buyer ? 'Select buyer first…' : 'Select vendor…'}
                      disabled={orgsLoading || suppCascadeLoading || (buyerList.length > 0 && !buyer)}
                      loading={suppCascadeLoading}
                      triggerClassName={`px-2.5 py-1.5 border rounded-md text-[13px] bg-white outline-none w-full disabled:opacity-50 ${errors.supplier ? 'border-red-500' : 'border-black/[.18]'}`}
                      dropdownClassName="border border-black/[.15] rounded-md mt-0.5"
                    />
                    {errors.supplier && <span className="text-[9px] font-semibold text-red-500 uppercase tracking-[.04em]">Fill in the required field(s)</span>}
                  </div>
                )}
                <div className="flex flex-col gap-1 min-w-0">
                  <label className="text-[11px] font-semibold uppercase tracking-[.06em] text-black/80">Season</label>
                  <select
                    className="px-2.5 py-1.5 border border-black/[.18] rounded-md text-[13px] bg-white outline-none w-full"
                    value={season}
                    onChange={e => setSeason(e.target.value)}
                  >
                    <option value="">Select season…</option>
                    {SEASONS.filter(s => mode === 'existing' || s !== 'OLD').map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              {skusLoading && (
                <span className="text-[10px] text-black/30 shrink-0 sm:self-center sm:pb-1.5">Loading production SKUs…</span>
              )}
            </div>

            {/* Per-image cards */}
            {images.map((img, i) => {
                const f = getFields(i)
                return (
                  <div key={i} className="border border-black/10 flex flex-col sm:flex-row">
                    {/* Image — full-width band on narrow, fixed square + side-by-side fields on wider. */}
                    <div className="bg-white flex-shrink-0 relative group/img overflow-hidden self-stretch w-full h-64 sm:w-[300px] sm:h-auto sm:min-h-[300px]">
                      <img src={img.preview} alt={img.file.name} className="absolute inset-0 w-full h-full object-contain" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => setEditingImageIdx(i)}
                          className="flex flex-col items-center gap-1.5 bg-black/50 hover:bg-black/70 px-4 py-3 rounded transition-colors cursor-pointer border-none"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                          <span className="text-[10px] font-bold uppercase tracking-[.07em] text-white">Edit Image</span>
                        </button>
                      </div>
                    </div>

                    {/* Fields */}
                    <div className="flex-1 p-3 flex flex-col gap-1.5 border-t sm:border-t-0 sm:border-l border-black/10 min-w-0" style={{ alignContent: 'start' }}>
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-[.08em] text-black/40 font-mono truncate min-w-0">
                          {img.file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          title="Remove"
                          className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-black/30 hover:text-red-500 hover:bg-red-50 cursor-pointer border-none bg-transparent transition-colors"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      </div>

                      {/* Buyer SKU Ref — required in existing mode unless temp ref is provided */}
                      {mode === 'existing' && (
                        <div className="flex flex-col gap-0.5">
                          <BuyerSkuField
                            value={f.buyerSkuRef}
                            productionSkus={productionSkus}
                            onChange={patch => { setFields(i, patch); clearBuyerSkuRefError(i) }}
                            required={!f.tempSkuRef?.trim()}
                            error={errors.buyerSkuRefs.has(i)}
                          />
                          {errors.buyerSkuRefs.has(i) && (
                            <span className="text-[9px] font-semibold text-red-500 uppercase tracking-[.04em]">Fill in the required field(s)</span>
                          )}
                        </div>
                      )}

                      {/* Temp buyer ref — only when not yet linked to production SKU */}
                      {mode === 'existing' && !f.productionSkuId && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-bold uppercase tracking-[.07em] text-amber-600">Temp Buyer Ref</span>
                          <input
                            className="px-2 py-1.5 border-b border-amber-300 text-[12px] outline-none uppercase focus:border-amber-500"
                            value={f.tempSkuRef}
                            onChange={e => { setField(i, 'tempSkuRef', e.target.value); clearBuyerSkuRefError(i) }}
                            placeholder="e.g. CS-26-AW-78"
                          />
                        </div>
                      )}

                      {/* Category */}
                      <CategorySelectField
                        onChange={(id, name) => setFields(i, { categoryId: id, categoryName: name })}
                      />

                      {/* Description */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Description</span>
                        <input
                          className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none uppercase focus:border-black/60"
                          value={f.description}
                          onChange={e => setField(i, 'description', e.target.value)}
                          placeholder="Description"
                        />
                      </div>

                      {/* Material + Finish */}
                      <div className="grid grid-cols-2 gap-2">
                        {['material', 'finish'].map(fk => (
                          <div key={fk} className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">
                              {fk.charAt(0).toUpperCase() + fk.slice(1)}
                            </span>
                            <input
                              className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none uppercase focus:border-black/60"
                              value={f[fk]}
                              onChange={e => setField(i, fk, e.target.value)}
                              placeholder={fk.charAt(0).toUpperCase() + fk.slice(1)}
                            />
                          </div>
                        ))}
                      </div>

                      {/* Weight + L + W + H + Unit */}
                      <div className="flex gap-2 items-end">
                        <div className="flex flex-col gap-0.5 flex-1">
                          <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Weight (kg)</span>
                          <input type="number" step="0.1"
                            className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none focus:border-black/60 w-full"
                            value={f.weight} onChange={e => setField(i, 'weight', e.target.value)} placeholder="0" />
                        </div>
                        {['l', 'w', 'h'].map(fk => (
                          <div key={fk} className="flex flex-col gap-0.5 flex-1">
                            <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">
                              {fk.toUpperCase()} ({f.measurement})
                            </span>
                            <input type="number" step="0.1"
                              className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none focus:border-black/60 w-full"
                              value={f[fk]} onChange={e => setField(i, fk, e.target.value)} placeholder="0" />
                          </div>
                        ))}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Unit</span>
                          <div className="flex border border-black/20 overflow-hidden">
                            {['cm', 'in'].map(u => (
                              <button key={u} type="button" onClick={() => setField(i, 'measurement', u)}
                                className={`px-2 py-1.5 text-[11px] font-bold uppercase cursor-pointer border-none ${f.measurement === u ? 'bg-[#1A1A18] text-white' : 'bg-white text-black/50 hover:bg-black/5'}`}
                              >{u}</button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Original Price + currency — optional */}
                      <div className="flex gap-2 items-end">
                        <div className="flex flex-col gap-0.5 w-1/4">
                          <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Original Price</span>
                          <input type="number" step="0.01" min="0"
                            className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none focus:border-black/60 w-full"
                            value={f.originalPrice} onChange={e => setField(i, 'originalPrice', e.target.value)} placeholder="0" />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Currency</span>
                          <select
                            className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none focus:border-black/60"
                            value={f.originalCurrency} onChange={e => setField(i, 'originalCurrency', e.target.value)}
                          >
                            {['USD', 'GBP', 'EUR'].map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Notes — rich note for this SKU. Images added inside the note also
                          save as spec images (origin 'kaptr') and show in Media. */}
                      <div className="flex flex-col gap-0.5 pt-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Notes</span>
                        {notesIdx === i ? (
                          <RichNoteEditor
                            initialHtml={f.notesHtml}
                            // Hide (without clicking Save note) used to just discard whatever
                            // had been typed/inserted since opening — RichNoteEditor already
                            // has a full localStorage draft mechanism built in, it just was
                            // never connected here. Keyed by index (these images have no
                            // stable id pre-creation) — fine for the "reopen after Hide within
                            // this same session" case this is actually for; cleared once Save
                            // note commits it.
                            draftKey={`plm_note_draft_create:${i}`}
                            placeholder="Reference notes for this SKU… add photos with the camera / clip"
                            sendLabel="Save note"
                            defaultMaximized
                            onHide={() => setNotesIdx(null)}
                            uploadImage={file => uploadNoteImage(file).then(r => r.url)}
                            onSend={({ html, images }) => {
                              setFields(i, { notesHtml: html, specImages: images })
                              setNotesIdx(null)
                            }}
                          />
                        ) : (() => {
                          const noteImgs = f.specImages?.length ? f.specImages : extractImageUrls(f.notesHtml)
                          // Same reasoning as BulkEditModal's identical block — this row always
                          // shows the last SAVED note; a draft from a previous Hide lives only
                          // in localStorage and can genuinely differ, so flag it instead of
                          // leaving that mismatch as a silent surprise on next open.
                          let hasPendingDraft = false
                          try {
                            const raw = localStorage.getItem(`plm_note_draft_create:${i}`)
                            const draft = raw ? JSON.parse(raw) : null
                            hasPendingDraft = !!draft?.html && draft.html !== (f.notesHtml || '')
                          } catch { /* ignored — localStorage/JSON failures just mean no badge */ }
                          return (
                          <button type="button" onClick={() => setNotesIdx(i)}
                            className="text-left px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] hover:border-black/60 transition-colors">
                            {hasPendingDraft && (
                              <span className="block mb-1 text-[9px] font-bold uppercase tracking-[.05em] text-[#8a6d1a]">● Unsaved draft — differs from what's shown below</span>
                            )}
                            {f.notesHtml
                              ? <span className="flex items-start gap-1.5" title="Edit note">
                                  {noteImgs.length > 0 && (
                                    <span className="flex gap-1 flex-shrink-0">
                                      {noteImgs.slice(0, 3).map((url, k) => (
                                        <img key={k} src={url} alt="" className="w-8 h-8 object-cover rounded-sm border border-black/10" />
                                      ))}
                                      {noteImgs.length > 3 && (
                                        <span className="text-[9px] font-semibold text-black/40 self-center">+{noteImgs.length - 3}</span>
                                      )}
                                    </span>
                                  )}
                                  <span className="text-black/70 line-clamp-2 break-words min-w-0">{notePlainText(f.notesHtml).slice(0, 140) || (noteImgs.length ? '(note with images)' : '(empty note)')}</span>
                                </span>
                              : (hasPendingDraft
                                  ? <span className="text-black/35">(unsaved draft — click to review)</span>
                                  : <span className="text-black/35">+ Add notes</span>)}
                          </button>
                          )
                        })()}
                        {f.notesHtml && (f.specImages?.length > 0) && (
                          <span className="text-[9px] text-black/40 mt-0.5">{f.specImages.length} spec image{f.specImages.length === 1 ? '' : 's'} → Media</span>
                        )}
                      </div>

                      {/* Production SKU indicator */}
                      {f.productionSkuId && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600 flex-shrink-0">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span className="text-[9px] font-bold uppercase tracking-[.06em] text-emerald-700">Linked to production SKU</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 px-3 sm:px-5 py-3 border-t border-black/10 flex-shrink-0">
              {errors.saveError && (
                <span className="order-first w-full text-[10px] font-semibold text-red-500 uppercase tracking-[.04em]">{errors.saveError}</span>
              )}
              <button onClick={() => setStep(1)}
                className="px-3 sm:px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] border border-black/20 bg-white cursor-pointer hover:bg-black/5"
              >
                ← Back
              </button>
              <div className="flex items-center gap-2 sm:gap-3">
                <button onClick={onClose} className="px-3 sm:px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] border border-black/20 bg-white cursor-pointer hover:bg-black/5">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="px-3 sm:px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-[#F5F3EF] cursor-pointer hover:opacity-80 disabled:opacity-50 whitespace-nowrap"
                >
                  {saving ? 'Creating…' : `Create ${images.length} SKU${images.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {editingImageIdx !== null && images[editingImageIdx] && (
        <ImageEditorModal
          imageUrl={images[editingImageIdx].preview}
          onSave={handleBulkEditorSave}
          onClose={() => setEditingImageIdx(null)}
          toast={usePlmStore.getState().toast}
        />
      )}

      {cameraOpen && (
        <CameraCaptureModal
          onCapture={handleCameraShot}
          onDone={closeCamera}
          shotCount={camShots}
        />
      )}
    </div>
  )
}
