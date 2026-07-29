import { useState, useRef, useCallback, useEffect } from 'react'
import { usePlmStore, SEASONS } from '../../../stores/plmStore'
import { useBuyerOrgs, useSupplierOrgs, useOrgsLoading } from '../../../stores/orgsStore'
import { useProfileStore, useMemberId } from '../../../stores/profileStore'
import { useSkuCache } from '../../../hooks/useSkuCache'
import { resolveBuyerOrgsForMember, resolveSupplierOrgsForBuyer } from '../../../lib/poQueries'
import SearchableSelect from '../../ui/SearchableSelect'
import CategorySelectField from '../CategorySelectField'
import BuyerSkuField from '../BuyerSkuField'
import ImageEditorModal from './ImageEditorModal'

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
})

// ── Main modal ────────────────────────────────────────────────────────────────
export default function CreateBulkSkuModal({ onClose }) {
  const createSkusBulk = usePlmStore(s => s.createSkusBulk)
  const role           = usePlmStore(s => s.role)
  const buyerList      = useBuyerOrgs()
  const supplierList   = useSupplierOrgs()
  const orgsLoading    = useOrgsLoading()
  const orgMembership  = useProfileStore(s => s.orgMembership)
  const memberId       = useMemberId()
  const { getSkus }    = useSkuCache()

  const [mode,             setMode]             = useState('new')   // 'new' | 'existing'
  const [step,             setStep]             = useState(1)
  const [images,           setImages]           = useState([])
  const [editingImageIdx,  setEditingImageIdx]  = useState(null)
  const [dragging,       setDragging]       = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [season,         setSeason]         = useState('')
  const [supplier,       setSupplier]       = useState(null)   // { id, name }
  const [buyer,               setBuyer]               = useState(null)   // { id, name }
  const [cascadedSuppliers,   setCascadedSuppliers]   = useState([])
  const [suppCascadeLoading,  setSuppCascadeLoading]  = useState(false)
  const [productionSkus, setProductionSkus] = useState([])
  const [skusLoading,    setSkusLoading]    = useState(false)
  const [errors,         setErrors]         = useState({ supplier: false, buyerSkuRefs: new Set(), saveError: null })

  useEffect(() => {
    if (role === 'supplier' && orgMembership?.orgId) {
      setSupplier({ id: orgMembership.orgId, name: orgMembership.orgDisplayName || orgMembership.orgName || 'My Organisation' })
    }
  }, [role, orgMembership])

  useEffect(() => {
    if (buyerList.length === 1 && !buyer) setBuyer(buyerList[0])
  }, [buyerList])

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
    const newErrors = { supplier: false, buyerSkuRefs: new Set(), saveError: null }
    if (!supplier?.id) newErrors.supplier = true
    if (mode === 'existing') {
      images.forEach((_, i) => {
        const f = getFields(i)
        if (!f.buyerSkuRef?.trim() && !f.tempSkuRef?.trim()) newErrors.buyerSkuRefs.add(i)
      })
    }
    if (newErrors.supplier || newErrors.buyerSkuRefs.size > 0) { setErrors(newErrors); return }
    setSaving(true)
    try {
      const attributesPerImage = images.map((_, i) => getFields(i))
      await createSkusBulk(images, attributesPerImage, { season, supplierOrgId: supplier.id, supplier: supplier.name, mode, buyerOrgId: buyer?.id })
      onClose()
    } catch (err) {
      setErrors(prev => ({ ...prev, saveError: err.message }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40">
      <div className="bg-white w-full max-w-5xl mx-4 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-bold uppercase tracking-[.06em]">Create SKUs in Bulk</span>
            {step === 2 && (
              <span className="text-[12px] text-black/50">{images.length} image{images.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <button onClick={onClose} className="text-black/40 hover:text-black text-lg leading-none cursor-pointer border-none bg-transparent">×</button>
        </div>

        {step === 1 ? (
          <>
            {/* Step 1 — select images */}
            <div className="flex-1 flex flex-col p-6 gap-5 overflow-y-auto">

              {/* Mode picker */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[.08em] text-black/50">SKU Type</span>
                <div className="flex border border-black/15 overflow-hidden self-start">
                  {[['new', 'New SKU'], ['existing', 'Existing Production SKU']].map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setMode(val)}
                      className={`px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] cursor-pointer border-none transition-colors ${mode === val ? 'bg-[#1A1A18] text-white' : 'bg-white text-black/45 hover:bg-black/5'}`}
                    >{label}</button>
                  ))}
                </div>
                {mode === 'existing' && (
                  <p className="text-[10px] text-black/45">Buyer SKU Ref will be required for each image — used to link to the production record.</p>
                )}
              </div>

              <div
                className={`border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-4 py-14 cursor-pointer transition-colors ${dragging ? 'border-black bg-black/[.03]' : 'border-black/20 hover:border-black/40'}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-black/20">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                  <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div className="text-center">
                  <div className="text-[12px] font-bold uppercase tracking-[.06em]">Drop or paste images</div>
                  <div className="text-[11px] text-black/40 mt-1">or click to select · Ctrl+V to paste</div>
                </div>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={e => handleFiles(e.target.files)} />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-black/10" />
                <span className="text-[10px] text-black/30 uppercase tracking-[.05em]">or</span>
                <div className="flex-1 border-t border-black/10" />
              </div>

              <div className="flex justify-center">
                <button type="button"
                  className="px-5 py-2 text-[11px] font-bold uppercase tracking-[.06em] border border-black/20 bg-white cursor-pointer hover:bg-black/5"
                  onClick={() => folderRef.current?.click()}
                >
                  Select a folder
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

            <div className="flex justify-end gap-3 px-5 py-3 border-t border-black/10 flex-shrink-0">
              <button onClick={onClose} className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] border border-black/20 bg-white cursor-pointer hover:bg-black/5">
                Cancel
              </button>
              <button onClick={() => setStep(2)} disabled={!images.length}
                className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-[#F5F3EF] cursor-pointer hover:opacity-80 disabled:opacity-50"
              >
                Next — Fill Attributes
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Step 2 — attributes */}

            {/* Shared: vendor + season */}
            <div className="px-5 py-3 border-b border-black/10 flex-shrink-0 flex items-end gap-4">
              <span className="text-[10px] font-bold uppercase tracking-[.07em] text-black/40 self-center mr-1">Apply to all:</span>
              {buyerList.length > 0 && (
                <div className="flex flex-col gap-1 w-52">
                  <label className="text-[11px] font-semibold uppercase tracking-[.06em] text-black/80">Buyer</label>
                  <SearchableSelect
                    options={buyerList.map(b => ({ value: b.id, label: b.name }))}
                    value={buyer?.id || ''}
                    onChange={id => setBuyer(buyerList.find(b => b.id === id) || null)}
                    placeholder="Select buyer…"
                    disabled={orgsLoading}
                    triggerClassName="px-2.5 py-1.5 border border-black/[.18] rounded-md text-[13px] bg-white outline-none w-full disabled:opacity-50"
                    dropdownClassName="border border-black/[.15] rounded-md mt-0.5"
                  />
                </div>
              )}
              {role !== 'supplier' && (
                <div className="flex flex-col gap-1 w-58">
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
              <div className="flex flex-col gap-1 w-36">
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
              {skusLoading && (
                <span className="text-[10px] text-black/30 self-center ml-auto">Loading production SKUs…</span>
              )}
            </div>

            {/* Per-image cards */}
            <div className="overflow-y-auto p-5 flex flex-col gap-3 flex-1">
              {images.map((img, i) => {
                const f = getFields(i)
                return (
                  <div key={i} className="border border-black/10 flex" style={{ minHeight: 300 }}>
                    {/* Image — panel stretches with card (beige fills); image itself natural size, not h-full */}
                    <div className="bg-[#EDEAE4] flex-shrink-0 relative group/img overflow-hidden self-stretch" style={{ width: 300, minHeight: 300 }}>
                      <img src={img.preview} alt={img.file.name} className="absolute inset-0 w-full h-full object-cover" />
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
                    <div className="flex-1 p-3 flex flex-col gap-1.5 border-l border-black/10 min-w-0" style={{ alignContent: 'start' }}>
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

            <div className="flex items-center justify-between px-5 py-3 border-t border-black/10 flex-shrink-0">
              <button onClick={() => setStep(1)}
                className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] border border-black/20 bg-white cursor-pointer hover:bg-black/5"
              >
                ← Back
              </button>
              <div className="flex items-center gap-3">
                {errors.saveError && (
                  <span className="text-[10px] font-semibold text-red-500 uppercase tracking-[.04em]">{errors.saveError}</span>
                )}
                <button onClick={onClose} className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] border border-black/20 bg-white cursor-pointer hover:bg-black/5">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-[#F5F3EF] cursor-pointer hover:opacity-80 disabled:opacity-50"
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
    </div>
  )
}
