import { useState, useEffect, useRef } from 'react'
import { usePlmStore } from '../../../stores/plmStore'
import { useAuthStore } from '../../../stores/authStore'
import { useMemberId } from '../../../stores/profileStore'
import { useSkuCache } from '../../../hooks/useSkuCache'
import { resolveBuyerOrgsForMember } from '../../../lib/poQueries'
import CategorySelectField from '../CategorySelectField'
import BuyerSkuField from '../BuyerSkuField'
import ImageEditorModal from './ImageEditorModal'
import RichNoteEditor from '../RichNoteEditor'
import { notePlainText, extractImageUrls } from '../richNote'
import { saveFormDraftDebounced, loadFormDraft, clearFormDraft } from '../../../utils/formDraft'

const BASIC_FIELDS = ['description', 'material', 'finish', 'weight', 'l', 'w', 'h', 'measurement', 'tempSkuRef', 'original_price', 'original_currency']
const LABELS = { description: 'Description', material: 'Material', finish: 'Finish', weight: 'Weight (kg)', l: 'L', w: 'W', h: 'H' }

function initEdit(s) {
  return {
    description:     s.description       || '',
    material:        s.material          || '',
    finish:          s.finish            || '',
    weight:          s.weight            != null ? String(s.weight) : '',
    l:               s.length            != null ? String(s.length) : '',
    w:               s.width             != null ? String(s.width)  : '',
    h:               s.height            != null ? String(s.height) : '',
    measurement:     s.measurement       || 'cm',
    categoryId:      s.category_id       || null,
    categoryName:    s.category          || null,
    productionSkuId: s.production_sku_id || null,
    buyerSkuRef:     s.buyer_sku_ref  || '',
    tempSkuRef:      s.temp_sku_ref   || '',
    original_price:    s.original_price != null ? String(s.original_price) : '',
    original_currency: s.original_currency || 'USD',
    notesHtml:   s.notes?.html || '',
    specImages:  Array.isArray(s.notes?.images) ? s.notes.images
                 : (Array.isArray(s.spec_images) ? s.spec_images.map(x => x?.url).filter(Boolean) : []),
  }
}

export default function BulkEditModal({ skus, role, onClose, isFromUpload, mode = 'new' }) {
  const patchSkus    = usePlmStore(s => s.patchSkus)
  const deleteSkus   = usePlmStore(s => s.deleteSkus)
  const uploadNoteImage = usePlmStore(s => s.uploadNoteImage)
  const toast        = usePlmStore(s => s.toast)
  const allCatalogSkus = usePlmStore(s => s.skus)
  const memberId     = useMemberId()

  // Map of productionSkuId → auto_code for catalog SKUs outside the current editing batch
  const editingIds = new Set(skus.map(s => s.id))
  const usedProductionSkuMap = {}
  allCatalogSkus.forEach(s => {
    if (!editingIds.has(s.id) && s.production_sku_id)
      usedProductionSkuMap[s.production_sku_id] = s.auto_code || s.id
  })
  const { getSkus } = useSkuCache()

  const [saving,          setSaving]          = useState(false)
  const [deletedIds,      setDeletedIds]      = useState(() => new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deletingId,      setDeletingId]      = useState(null)
  const [productionSkus,  setProductionSkus]  = useState([])
  const [errors,          setErrors]          = useState({ buyerSkuRefs: new Set(), imageUpload: {}, deleteError: {}, saveError: null })

  // Draft autosave — nothing here is saved server-side until Save is clicked, so an accidental
  // reload (or crash/tab close) used to silently discard whatever had been typed, including
  // Notes text and any images added to it (attach or camera — both upload immediately on
  // insert, so by the time an image is in notesHtml it's already a real URL, not a blob, and
  // restores from the draft exactly like any other text field). Keyed by the exact set of SKU
  // ids being edited (+ mode) so it only ever restores into the matching editing session.
  const draftKey = `plm_bulkedit_draft:${mode}:${skus.map(s => s.id).sort().join(',')}`
  // Set once inside the useState initializer below (runs exactly once, on mount) rather than
  // read from localStorage again here — a plain useRef(loadFormDraft(...)) argument gets
  // re-evaluated on every render even though only the first one is ever used.
  const restoredDraftRef = useRef(false)
  const [edits, setEdits] = useState(() => {
    const draft = loadFormDraft(draftKey)
    const fresh = Object.fromEntries(skus.map(s => [s.id, initEdit(s)]))
    // Only trust the draft if it has an entry for every SKU currently being edited — a partial
    // match (stale draft from a differently-sized batch that happens to share a key prefix)
    // falls back to fresh instead of silently dropping fields for SKUs it doesn't cover.
    if (draft && skus.every(s => draft[s.id])) { restoredDraftRef.current = true; return draft }
    return fresh
  })
  useEffect(() => {
    if (restoredDraftRef.current) toast?.('Restored your unsaved changes from before')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    saveFormDraftDebounced(draftKey, edits)
  }, [draftKey, edits])
  // Closing (X / Cancel / Skip, or a successful Save) is the one deliberate "I'm done with this"
  // signal — clears the draft so it doesn't reappear next time these SKUs are opened for editing.
  // A raw page refresh never reaches this at all, which is exactly the case the draft exists for.
  const closeAndClearDraft = () => { clearFormDraft(draftKey); onClose() }
  const [imageUrls,   setImageUrls]   = useState(() =>
    Object.fromEntries(skus.map(s => [s.id, s.image_url || null]))
  )
  const [uploadingId,     setUploadingId]     = useState(null)
  const [notesIdx,        setNotesIdx]        = useState(null)  // sku.id whose Notes editor is open
  const [editingImageSku, setEditingImageSku] = useState(null) // { id, url, revokeUrl? }
  const pickFileRef    = useRef(null)
  const pickFileSkuId  = useRef(null)

  useEffect(() => {
    if (!memberId) return
    resolveBuyerOrgsForMember(memberId).then(async (orgs) => {
      const results = await Promise.all(orgs.map(o => getSkus(o.id)))
      const merged = Object.values(
        results.flat().reduce((acc, s) => { acc[s.id] = s; return acc }, {})
      )
      setProductionSkus(merged)
    })
  }, [memberId])

  const setField  = (id, field, val) =>
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }))
  const setFields = (id, patch) =>
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const handlePickFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file || !pickFileSkuId.current) return
    e.target.value = ''
    const url = URL.createObjectURL(file)
    setEditingImageSku({ id: pickFileSkuId.current, url, revokeUrl: url })
    pickFileSkuId.current = null
  }

  const handleEditorSave = async (blob) => {
    const { id, revokeUrl } = editingImageSku
    setEditingImageSku(null)
    if (revokeUrl) URL.revokeObjectURL(revokeUrl)
    setUploadingId(id)
    setErrors(prev => { const { [id]: _, ...rest } = prev.imageUpload; return { ...prev, imageUpload: rest } })
    try {
      const session = useAuthStore.getState().session
      const fd = new FormData()
      fd.append('image', blob, `sku-${id}-${Date.now()}.png`)
      fd.append('role', role)
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/plm/catalog/skus/${id}/image`,
        { method: 'PATCH', headers: { Authorization: `Bearer ${session?.access_token}` }, body: fd }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setImageUrls(prev => ({ ...prev, [id]: json.image_url }))
      usePlmStore.setState(s => ({
        skus: s.skus.map(sk => sk.id === id ? { ...sk, image_url: `${json.image_url}?t=${Date.now()}` } : sk)
      }))
      toast?.('Image saved!')
    } catch (err) {
      setErrors(prev => ({ ...prev, imageUpload: { ...prev.imageUpload, [id]: err.message } }))
    } finally {
      setUploadingId(null)
    }
  }

  const handleDeleteSku = async (id) => {
    setDeletingId(id)
    const attempt = async () => {
      await deleteSkus([id], role)
      setDeletedIds(prev => new Set([...prev, id]))
      setConfirmDeleteId(null)
      toast?.('SKU deleted')
    }
    try {
      await attempt()
    } catch (err) {
      if (err.message === 'Failed to fetch') {
        try {
          await new Promise(r => setTimeout(r, 1200))
          await attempt()
        } catch (retryErr) {
          setErrors(prev => ({ ...prev, deleteError: { ...prev.deleteError, [id]: retryErr.message } }))
        }
      } else {
        setErrors(prev => ({ ...prev, deleteError: { ...prev.deleteError, [id]: err.message } }))
      }
    } finally {
      setDeletingId(null)
    }
  }

  const handleSave = async () => {
    const patches = skus
      .filter(s => !deletedIds.has(s.id))
      .map(s => {
        const fields = edits[s.id]
        const orig   = initEdit(s)
        const changed =
          BASIC_FIELDS.some(f => (fields[f] || '') !== (orig[f] || '')) ||
          fields.categoryId      !== orig.categoryId ||
          fields.productionSkuId !== orig.productionSkuId ||
          (fields.notesHtml || '') !== (orig.notesHtml || '')
        return changed ? { id: s.id, fields } : null
      })
      .filter(Boolean)

    if (mode === 'existing') {
      const missingIds = new Set(
        visibleSkus
          .filter(s => !edits[s.id]?.buyerSkuRef?.trim() && !edits[s.id]?.tempSkuRef?.trim())
          .map(s => s.id)
      )
      if (missingIds.size > 0) { setErrors(prev => ({ ...prev, buyerSkuRefs: missingIds })); return }
    }
    if (!patches.length) { closeAndClearDraft(); return }
    setSaving(true)
    try {
      await patchSkus(patches)
      closeAndClearDraft()
    } catch (err) {
      setErrors(prev => ({ ...prev, saveError: err.message }))
    } finally {
      setSaving(false)
    }
  }

  const visibleSkus = skus
    .filter(s => !deletedIds.has(s.id))
    .sort((a, b) => {
      const aPos = a.sort_position ?? null
      const bPos = b.sort_position ?? null
      if (aPos !== null && bPos !== null) return aPos - bPos
      if (aPos !== null) return -1
      if (bPos !== null) return 1
      const aSlide = a.slide_index ?? null
      const bSlide = b.slide_index ?? null
      if (aSlide !== null && bSlide !== null) return aSlide - bSlide
      return new Date(b.created_at) - new Date(a.created_at)
    })

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40">
      <div className="bg-white w-full max-w-5xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/10 flex-shrink-0">
          <div>
            <span className="text-[13px] font-bold uppercase tracking-[.06em]">Edit attributes</span>
            <span className="text-[12px] text-black/50 ml-2">{visibleSkus.length} SKU{visibleSkus.length === 1 ? '' : 's'}</span>
          </div>
          <button onClick={closeAndClearDraft} className="text-black/40 hover:text-black text-lg leading-none cursor-pointer border-none bg-none">×</button>
        </div>

        {/* Hidden file input for adding new images */}
        <input ref={pickFileRef} type="file" accept="image/*" className="hidden" onChange={handlePickFileChange} />

        {/* Cards */}
        <div className="overflow-y-auto p-5 flex flex-col gap-2.5">
          {/* Apply category to all — lives inside the scrolling region (not fixed header
              chrome above it) so a deep cascading pick (which can now run 4+ stacked rows
              tall on a narrow screen) scrolls away with everything else instead of
              permanently pinning at the top and eating most of the modal's height. */}
          <div className="border border-black/10 px-3.5 py-2.5 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-[.07em] text-black/40 flex-shrink-0">Category for all:</span>
            <div className="flex-1 min-w-[180px] max-w-xs">
              <CategorySelectField
                hideLabel
                onChange={(id, name) => {
                  if (!id) return
                  setEdits(prev => {
                    const next = { ...prev }
                    visibleSkus.forEach(s => { next[s.id] = { ...next[s.id], categoryId: id, categoryName: name } })
                    return next
                  })
                }}
              />
            </div>
            <span className="text-[9px] text-black/30 font-semibold uppercase tracking-[.04em]">optional — overrides per-SKU</span>
          </div>
          {visibleSkus.map(sku => {
            const e = edits[sku.id]
            return (
              <div key={sku.id} className="border border-black/10 flex flex-col sm:flex-row">
                {/* Image — fixed square on desktop, full-width band on narrow screens so the
                    fields column keeps a usable width instead of being crushed. */}
                <div className="bg-white flex-shrink-0 relative group/img overflow-hidden w-full h-64 sm:w-[300px] sm:h-[300px]">
                  {uploadingId === sku.id ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/50">Saving…</span>
                    </div>
                  ) : imageUrls[sku.id] ? (
                    <>
                      <img src={imageUrls[sku.id]} alt={sku.auto_code} className="absolute inset-0 w-full h-full object-contain" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => setEditingImageSku({ id: sku.id, url: imageUrls[sku.id] })}
                          className="flex flex-col items-center gap-1.5 bg-black/50 hover:bg-black/70 px-4 py-3 rounded transition-colors cursor-pointer border-none"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                          <span className="text-[10px] font-bold uppercase tracking-[.07em] text-white">Edit Image</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { pickFileSkuId.current = sku.id; pickFileRef.current?.click() }}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-2 hover:opacity-60 transition-opacity cursor-pointer border-none bg-transparent w-full"
                    >
                      <div className="w-10 h-10 bg-black/[.08] rounded-sm flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A1A18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="17 8 12 3 7 8"/>
                          <line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/40">Add Image</span>
                    </button>
                  )}
                </div>

                {/* Fields */}
                <div className="flex-1 p-3 flex flex-col gap-1.5 border-t sm:border-t-0 sm:border-l border-black/10 min-w-0">
                  {/* SKU code + delete button */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-[.08em] text-black/70 font-mono">
                      {sku.auto_code}
                    </span>
                    {isFromUpload && confirmDeleteId === sku.id ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-[.06em] text-red-600">Delete permanently?</span>
                          <button
                            onClick={() => handleDeleteSku(sku.id)}
                            disabled={deletingId === sku.id}
                            className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.06em] bg-red-600 text-white cursor-pointer hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            {deletingId === sku.id && <div className="w-2.5 h-2.5 border border-white/50 border-t-white rounded-full animate-spin" />}
                            {deletingId === sku.id ? 'Deleting…' : 'Delete'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={deletingId === sku.id}
                            className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.06em] border border-black/20 bg-white cursor-pointer hover:bg-black/5 disabled:opacity-50"
                          >Cancel</button>
                        </div>
                        {errors.deleteError[sku.id] && (
                          <span className="text-[9px] font-semibold text-red-500 uppercase tracking-[.04em]">{errors.deleteError[sku.id]}</span>
                        )}
                      </div>
                    ) : isFromUpload ? (
                      <button
                        onClick={() => setConfirmDeleteId(sku.id)}
                        title="Remove SKU"
                        className="w-6 h-6 flex items-center justify-center text-black/30 hover:text-red-500 hover:bg-red-50 cursor-pointer border-none bg-transparent transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                    ) : null}
                  </div>

                  {/* Image upload error */}
                  {errors.imageUpload[sku.id] && (
                    <span className="text-[9px] font-semibold text-red-500 uppercase tracking-[.04em] -mt-0.5">{errors.imageUpload[sku.id]}</span>
                  )}

                  {/* Buyer SKU ref — required in existing mode */}
                  {(mode === 'existing' || !isFromUpload) && (() => {
                    const linkedProdSku = e.productionSkuId ? productionSkus.find(s => s.id === e.productionSkuId) : null
                    const effectiveBuyerRef = e.buyerSkuRef || linkedProdSku?.buyer_sku_ref || ''
                    return (
                      <>
                        <div className="flex flex-col gap-0.5">
                          <BuyerSkuField
                            value={effectiveBuyerRef}
                            productionSkus={productionSkus}
                            onChange={patch => {
                              setFields(sku.id, patch)
                              if (errors.buyerSkuRefs.has(sku.id)) setErrors(prev => {
                                const next = new Set(prev.buyerSkuRefs)
                                next.delete(sku.id)
                                return { ...prev, buyerSkuRefs: next }
                              })
                            }}
                            required={!e.tempSkuRef?.trim()}
                            error={errors.buyerSkuRefs.has(sku.id)}
                          />
                          {errors.buyerSkuRefs.has(sku.id) && (
                            <span className="text-[9px] font-semibold text-red-500 uppercase tracking-[.04em]">Fill in the required field(s)</span>
                          )}
                          {e.productionSkuId && usedProductionSkuMap[e.productionSkuId] && (
                            <span className="text-[9px] font-semibold text-amber-600 uppercase tracking-[.04em]">
                              Already linked to {usedProductionSkuMap[e.productionSkuId]} — saving will create a duplicate
                            </span>
                          )}
                        </div>
                        {e.productionSkuId && (
                          <div className="flex items-center gap-1.5">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600 flex-shrink-0">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span className="text-[9px] font-bold uppercase tracking-[.06em] text-emerald-700">
                              Linked to production SKU{linkedProdSku?.buyer_sku_ref ? ` — ${linkedProdSku.buyer_sku_ref}` : ''}
                            </span>
                          </div>
                        )}
                      </>
                    )
                  })()}

                  {/* Temp buyer ref — for unlinked buyer codes */}
                  {!e.productionSkuId && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-bold uppercase tracking-[.07em] text-amber-600">Temp Buyer Ref</span>
                      <input
                        className="px-2 py-1.5 border-b border-amber-300 text-[12px] outline-none uppercase focus:border-amber-500"
                        value={e.tempSkuRef}
                        onChange={ev => setField(sku.id, 'tempSkuRef', ev.target.value)}
                        placeholder="e.g. CS-26-AW-78"
                      />
                    </div>
                  )}

                  {/* Category */}
                  <CategorySelectField
                    initialCategoryId={sku.category_id}
                    onChange={(id, name) => setFields(sku.id, { categoryId: id, categoryName: name })}
                  />

                  {/* Description */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Description</span>
                    <input
                      className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none uppercase focus:border-black/60"
                      value={e.description}
                      onChange={ev => setField(sku.id, 'description', ev.target.value)}
                      placeholder="Description"
                    />
                  </div>

                  {/* Finish + Material */}
                  <div className="grid grid-cols-2 gap-2">
                    {['finish', 'material'].map(f => (
                      <div key={f} className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">{LABELS[f]}</span>
                        <input
                          className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none uppercase focus:border-black/60"
                          value={e[f]}
                          onChange={ev => setField(sku.id, f, ev.target.value)}
                          placeholder={LABELS[f]}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Weight + L + W + H + Unit */}
                  <div className="flex gap-2 items-end">
                    <div className="flex flex-col gap-0.5 flex-1">
                      <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Weight (kg)</span>
                      <input
                        className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none focus:border-black/60 w-full"
                        value={e.weight}
                        onChange={ev => setField(sku.id, 'weight', ev.target.value)}
                        placeholder="0"
                      />
                    </div>
                    {['l', 'w', 'h'].map(f => (
                      <div key={f} className="flex flex-col gap-0.5 flex-1">
                        <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">
                          {LABELS[f]} ({e.measurement || 'cm'})
                        </span>
                        <input
                          className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none focus:border-black/60 w-full"
                          value={e[f]}
                          onChange={ev => setField(sku.id, f, ev.target.value)}
                          placeholder="0"
                        />
                      </div>
                    ))}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Unit</span>
                      <div className="flex border border-black/20 overflow-hidden">
                        {['cm', 'in'].map(u => (
                          <button key={u} type="button" onClick={() => setField(sku.id, 'measurement', u)}
                            className={`px-2 py-1.5 text-[11px] font-bold uppercase cursor-pointer border-none ${(e.measurement || 'cm') === u ? 'bg-[#1A1A18] text-white' : 'bg-white text-black/50 hover:bg-black/5'}`}
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
                        value={e.original_price}
                        onChange={ev => setField(sku.id, 'original_price', ev.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Currency</span>
                      <select
                        className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none focus:border-black/60"
                        value={e.original_currency || 'USD'}
                        onChange={ev => setField(sku.id, 'original_currency', ev.target.value)}
                      >
                        {['USD', 'GBP', 'EUR'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Notes — rich note for this SKU. Images added inside the note also save
                      as spec images (origin 'kaptr') and show in Media. */}
                  <div className="flex flex-col gap-0.5 pt-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Notes</span>
                    {notesIdx === sku.id ? (
                      <RichNoteEditor
                        initialHtml={e.notesHtml}
                        // Hide (without clicking Save note) used to just discard whatever had
                        // been typed/inserted since opening — RichNoteEditor already has a full
                        // localStorage draft mechanism built in, it just was never connected
                        // here. Cleared automatically once Save note actually commits it.
                        draftKey={`plm_note_draft:${sku.id}`}
                        sendLabel="Save note"
                        defaultMaximized
                        onHide={() => setNotesIdx(null)}
                        placeholder="Reference notes for this SKU… add photos with the camera / clip"
                        uploadImage={file => uploadNoteImage(file).then(r => r.url)}
                        onSend={({ html, images }) => {
                          setFields(sku.id, { notesHtml: html, specImages: images })
                          setNotesIdx(null)
                        }}
                      />
                    ) : (() => {
                      const noteImgs = e.specImages?.length ? e.specImages : extractImageUrls(e.notesHtml)
                      // This row always shows the last SAVED note — a draft from a previous
                      // Hide (see RichNoteEditor's draftKey) lives only in localStorage and
                      // can genuinely differ from what's shown here (different image, missing
                      // text, etc.), so a plain read of it here to flag that mismatch instead
                      // of leaving it as a silent surprise the next time this note is opened.
                      let hasPendingDraft = false
                      try {
                        const raw = localStorage.getItem(`plm_note_draft:${sku.id}`)
                        const draft = raw ? JSON.parse(raw) : null
                        hasPendingDraft = !!draft?.html && draft.html !== (e.notesHtml || '')
                      } catch { /* ignored — localStorage/JSON failures just mean no badge */ }
                      return (
                      <button type="button" onClick={() => setNotesIdx(sku.id)}
                        className="text-left px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] hover:border-black/60 transition-colors">
                        {hasPendingDraft && (
                          <span className="block mb-1 text-[9px] font-bold uppercase tracking-[.05em] text-[#8a6d1a]">● Unsaved draft — differs from what's shown below</span>
                        )}
                        {e.notesHtml
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
                              <span className="text-black/70 line-clamp-2 break-words min-w-0">{notePlainText(e.notesHtml).slice(0, 140) || (noteImgs.length ? '(note with images)' : '(empty note)')}</span>
                            </span>
                          : (hasPendingDraft
                              ? <span className="text-black/35">(unsaved draft — click to review)</span>
                              : <span className="text-black/35">+ Add notes</span>)}
                      </button>
                      )
                    })()}
                    {e.notesHtml && (e.specImages?.length > 0) && (
                      <span className="text-[9px] text-black/40 mt-0.5">{e.specImages.length} spec image{e.specImages.length === 1 ? '' : 's'} → Media</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-black/10 flex-shrink-0">
          {errors.saveError && (
            <span className="text-[10px] font-semibold text-red-500 uppercase tracking-[.04em] mr-auto">{errors.saveError}</span>
          )}
          <button onClick={closeAndClearDraft} className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] border border-black/20 bg-white cursor-pointer hover:bg-black/5">
            {isFromUpload ? 'Skip for now' : 'Cancel'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-[#F5F3EF] cursor-pointer hover:opacity-80 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save attributes'}
          </button>
        </div>
      </div>

      {editingImageSku && (
        <ImageEditorModal
          imageUrl={editingImageSku.url}
          onSave={handleEditorSave}
          onClose={() => {
            if (editingImageSku.revokeUrl) URL.revokeObjectURL(editingImageSku.revokeUrl)
            setEditingImageSku(null)
          }}
          toast={toast}
        />
      )}
    </div>
  )
}
