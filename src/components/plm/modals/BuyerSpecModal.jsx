import { useState, useRef, useEffect, useCallback } from 'react'
import { usePlmStore, SEASONS } from '../../../stores/plmStore'
import { useOrgsLoading } from '../../../stores/orgsStore'
import { useMemberId } from '../../../stores/profileStore'
import { useAuthStore } from '../../../stores/authStore'
import { supabase } from '../../../lib/supabase'
import SearchableSelect from '../../ui/SearchableSelect'
import { resolveBuyerOrgsForMember, resolveSupplierOrgsForBuyer } from '../../../lib/poQueries'

// file.status: 'queued' | 'uploading' | 'done' | 'error'

const API_BASE = import.meta.env.VITE_BACKEND_URL
const SELECT_CLS = 'px-2.5 py-1.5 border border-black/[.18] rounded-md text-[13px] bg-white outline-none w-full disabled:opacity-50'

async function pollUntilDone(uploadId) {
  const MAX_WAIT_MS = 5 * 60 * 1000
  const startedAt  = Date.now()
  while (true) {
    await new Promise(r => setTimeout(r, 3000))
    const r = await fetch(`${API_BASE}/plm/catalog/upload-status/${uploadId}`, {
      headers: { Authorization: `Bearer ${useAuthStore.getState().session?.access_token}` },
    })
    const data = await r.json()
    const { upload, skus } = data
    if (upload.status === 'done')  return skus || []
    if (upload.status === 'error') throw new Error(upload.error_message || 'Processing failed')
    if (Date.now() - startedAt > MAX_WAIT_MS) throw new Error('Processing timed out')
  }
}

function MinimiseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}
function ExpandIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
      <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  )
}

export default function BuyerSpecModal({ onClose }) {
  const [files,               setFiles]               = useState([])
  const [buyer,               setBuyer]               = useState(null)
  const [buyerOrgs,           setBuyerOrgs]           = useState([])
  const [supplier,            setSupplier]            = useState(null)
  const [cascadedSuppliers,   setCascadedSuppliers]   = useState([])
  const [suppCascadeLoading,  setSuppCascadeLoading]  = useState(false)
  const [season,              setSeason]              = useState('AW26')
  const [dragging,            setDragging]            = useState(false)
  const [running,             setRunning]             = useState(false)
  const [buyerError,          setBuyerError]          = useState(false)
  const [supplierError,       setSupplierError]       = useState(false)
  const [typeError,           setTypeError]           = useState(false)

  // Per-file image selection
  const [selectedByFileId,       setSelectedByFileId]       = useState({})
  const [selectionSavedByFileId, setSelectionSavedByFileId] = useState({})
  const [savingByFileId,         setSavingByFileId]         = useState({})
  const [saveError,              setSaveError]              = useState(null)

  // Active tab in the image review panel
  const [activeReviewFileId, setActiveReviewFileId] = useState(null)

  // Minimise
  const [minimized,     setMinimized]     = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)
  const prevAllDoneRef  = useRef(false)

  const filesRef   = useRef([])
  const contextRef = useRef({})
  const fileRef    = useRef(null)

  const uploadBuyerSpec    = usePlmStore(s => s.uploadBuyerSpec)
  const addSkus            = usePlmStore(s => s.addSkus)
  const pruneSpecImages = usePlmStore(s => s.pruneSpecImages)
  const openWorkspace   = usePlmStore(s => s.openWorkspace)
  const memberId           = useMemberId()
  const suppLoading        = useOrgsLoading()

  useEffect(() => { filesRef.current = files }, [files])
  useEffect(() => { contextRef.current = { buyer, supplier, season, memberId } }, [buyer, supplier, season, memberId])

  useEffect(() => {
    if (!memberId) return
    resolveBuyerOrgsForMember(memberId).then(orgs => {
      setBuyerOrgs(orgs)
      if (orgs.length === 1) setBuyer(orgs[0])
    })
  }, [memberId])

  useEffect(() => {
    if (!buyer?.id || !memberId) return
    setSupplier(null)
    setCascadedSuppliers([])
    setSuppCascadeLoading(true)
    resolveSupplierOrgsForBuyer(memberId, buyer.id)
      .then(orgs => { setCascadedSuppliers(orgs); if (orgs.length === 1) setSupplier(orgs[0]) })
      .finally(() => setSuppCascadeLoading(false))
  }, [buyer?.id, memberId])

  useEffect(() => {
    if (!running || !files.length) return
    if (files.every(f => f.status === 'done' || f.status === 'error')) setRunning(false)
  }, [files, running])

  // Initialise image selection defaults when a file finishes
  useEffect(() => {
    const doneWithImages = files.filter(f => f.status === 'done' && f.specImages?.length > 0)
    if (!doneWithImages.length) return
    setSelectedByFileId(prev => {
      const next = { ...prev }
      for (const f of doneWithImages) {
        if (!next[f.id]) next[f.id] = new Set(f.specImages.map(img => img.url))
      }
      return next
    })
  }, [files])

  // Auto-select first pending tab when review files change
  const filesWithImages = files.filter(f => f.status === 'done' && f.specImages?.length > 0)
  useEffect(() => {
    if (filesWithImages.length === 0) return
    const isValid = activeReviewFileId && filesWithImages.find(f => f.id === activeReviewFileId)
    if (!isValid) {
      const firstPending = filesWithImages.find(f => !selectionSavedByFileId[f.id])
      setActiveReviewFileId(firstPending?.id || filesWithImages[0].id)
    }
  }, [filesWithImages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Notify when all uploads complete while minimised
  const allDone = files.length > 0 && files.every(f => f.status === 'done' || f.status === 'error')
  useEffect(() => {
    if (allDone && !prevAllDoneRef.current && minimized) {
      setJustCompleted(true)
      const t = setTimeout(() => setJustCompleted(false), 5000)
      return () => clearTimeout(t)
    }
    prevAllDoneRef.current = allDone
  }, [allDone, minimized])

  const uploadFile = useCallback(async (fileEntry) => {
    const { buyer, supplier, season, memberId } = contextRef.current
    try {
      setFiles(prev => prev.map(f => f.id === fileEntry.id ? { ...f, status: 'uploading', message: 'Uploading…' } : f))
      const fd = new FormData()
      fd.append('files', fileEntry.file)
      fd.append('buyerOrgId', buyer.id)
      fd.append('supplierOrgId', supplier.id)
      fd.append('season', season)
      fd.append('memberId', memberId)

      const result   = await uploadBuyerSpec(fd)
      const uploadId = result.uploads?.[0]?.uploadId
      if (!uploadId) throw new Error('No upload ID returned')

      setFiles(prev => prev.map(f => f.id === fileEntry.id ? { ...f, message: 'Extracting images…' } : f))
      const skus = await pollUntilDone(uploadId)
      const sku  = skus?.[0]

      if (sku) {
        addSkus([{
          ...sku,
          supplier:             sku.supplier             || supplier?.name || '',
          season:               sku.season               || season,
          supplier_org_id:      sku.supplier_org_id      || supplier?.id  || null,
          created_by_member_id: sku.created_by_member_id || memberId      || null,
          upload_buyer_org_id:  buyer?.id                                 || null,
        }])
      }

      let workspaceId = null
      let specImages  = []
      if (sku?.id) {
        const { data: ws } = await supabase
          .from('npd2_workspaces')
          .select('id, reference_media')
          .eq('catalog_sku_id', sku.id)
          .single()
        if (ws) { workspaceId = ws.id; specImages = ws.reference_media || [] }
      }

      setFiles(prev => prev.map(f => f.id === fileEntry.id
        ? { ...f, status: 'done', message: '', workspaceId, skuId: sku?.id || null, specImages }
        : f
      ))
    } catch (err) {
      const msg = err.message === 'Failed to fetch' ? 'Server unreachable' : (err.message || 'Upload failed')
      setFiles(prev => prev.map(f => f.id === fileEntry.id ? { ...f, status: 'error', message: msg } : f))
    }
  }, [uploadBuyerSpec, addSkus])

  const addFiles = (incoming) => {
    let hasInvalid = false
    const valid = []
    for (const f of incoming) {
      if (!/\.pdf$/i.test(f.name)) { hasInvalid = true; continue }
      valid.push({ id: crypto.randomUUID(), file: f, status: 'queued', message: '', workspaceId: null, skuId: null, specImages: [] })
    }
    setTypeError(hasInvalid)
    if (valid.length) setFiles(prev => [...prev, ...valid])
  }

  const removeFile = (id) => setFiles(prev => prev.filter(f => f.id !== id))
  const handleDrop = (e) => { e.preventDefault(); setDragging(false); addFiles([...e.dataTransfer.files]) }

  const runUploads = () => {
    let valid = true
    if (!buyer?.id)    { setBuyerError(true);    valid = false }
    if (!supplier?.id) { setSupplierError(true); valid = false }
    if (!valid) return
    setBuyerError(false); setSupplierError(false)
    setRunning(true)
    filesRef.current.filter(f => f.status === 'queued').forEach(f => uploadFile(f))
  }

  const toggleRefImage   = (fileId, url) => setSelectedByFileId(prev => {
    const set = new Set(prev[fileId] || [])
    if (set.has(url)) set.delete(url); else set.add(url)
    return { ...prev, [fileId]: set }
  })
  const selectAllForFile = (fileId, urls) => setSelectedByFileId(prev => ({ ...prev, [fileId]: new Set(urls) }))
  const clearAllForFile  = (fileId)       => setSelectedByFileId(prev => ({ ...prev, [fileId]: new Set() }))

  // Advance to the next file that still needs review
  const advanceToNextPending = (currentFileId) => {
    const pending = filesWithImages.filter(f => f.id !== currentFileId && !selectionSavedByFileId[f.id])
    if (pending.length > 0) setActiveReviewFileId(pending[0].id)
  }

  const skipSelectionForFile = (f) => {
    setSelectionSavedByFileId(prev => ({ ...prev, [f.id]: true }))
    advanceToNextPending(f.id)
  }

  const saveSelectionForFile = async (f) => {
    setSavingByFileId(prev => ({ ...prev, [f.id]: true }))
    setSaveError(null)
    try {
      if (f.workspaceId) {
        const keepUrls = [...(selectedByFileId[f.id] || new Set())]
        await pruneSpecImages(f.workspaceId, keepUrls)
        setFiles(prev => prev.map(fi => fi.id === f.id
          ? { ...fi, specImages: fi.specImages.filter(img => keepUrls.includes(img.url)) }
          : fi
        ))
      }
      setSelectionSavedByFileId(prev => ({ ...prev, [f.id]: true }))
      advanceToNextPending(f.id)
    } catch (err) {
      setSaveError(err.message || 'Failed to save — please try again')
    } finally {
      setSavingByFileId(prev => ({ ...prev, [f.id]: false }))
    }
  }

  const queuedCount       = files.filter(f => f.status === 'queued').length
  const doneCount         = files.filter(f => f.status === 'done').length
  const errorCount        = files.filter(f => f.status === 'error').length
  const isActive          = running || files.some(f => f.status === 'uploading')
  const filesNeedingReview = filesWithImages.filter(f => !selectionSavedByFileId[f.id])
  const hasImageReview    = filesNeedingReview.length > 0
  const selectionSaved    = filesWithImages.length > 0 && filesNeedingReview.length === 0
  const fileReadyToOpen   = (f) => f.workspaceId && (!f.specImages?.length || selectionSavedByFileId[f.id])

  const activeFile = files.find(f => f.status === 'uploading')
  const miniStatusLine = isActive
    ? (activeFile?.message || 'Processing…')
    : allDone
      ? errorCount > 0
        ? `${doneCount} done · ${errorCount} failed`
        : hasImageReview
          ? `Review images — ${filesNeedingReview.length} of ${filesWithImages.length} remaining`
          : selectionSaved ? 'All done' : `${doneCount} spec${doneCount !== 1 ? 's' : ''} processed`
      : `${queuedCount} spec${queuedCount !== 1 ? 's' : ''} queued`

  // The file whose images are shown in the review panel
  const reviewFile = filesWithImages.find(f => f.id === activeReviewFileId) || null

  // ── Minimised pill ───────────────────────────────────────────────────────────
  const MiniWidget = minimized && (
    <div
      onClick={() => setMinimized(false)}
      className={`fixed bottom-5 right-5 z-[1001] cursor-pointer select-none
        flex items-center gap-3 px-4 py-3 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.14)]
        border transition-all duration-300
        ${justCompleted
          ? 'border-[#2D6A1F] shadow-[0_4px_20px_rgba(45,106,31,0.25)]'
          : 'border-black/[.12] hover:border-black/25'
        }`}
      style={{ minWidth: 260 }}
    >
      <div className="flex-shrink-0">
        {isActive
          ? <span className="block w-4 h-4 border-2 border-black/15 border-t-black/70 rounded-full animate-spin" />
          : allDone && errorCount === 0
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={justCompleted ? '#2D6A1F' : '#1A1A18'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            : errorCount > 0
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1A1A18" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        }
      </div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-[11px] font-bold uppercase tracking-[.07em] text-[#1A1A18]">Upload Buyer Spec</span>
        <span className={`text-[9px] font-semibold uppercase tracking-[.05em] truncate transition-colors ${justCompleted ? 'text-[#2D6A1F]' : 'text-black/45'}`}>
          {miniStatusLine}
        </span>
      </div>
      {files.length > 0 && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {files.map(f => (
            <span key={f.id} className={`block rounded-full transition-colors ${
              f.status === 'done'      ? 'w-1.5 h-1.5 bg-[#2D6A1F]' :
              f.status === 'error'     ? 'w-1.5 h-1.5 bg-red-400' :
              f.status === 'uploading' ? 'w-2 h-2 bg-[#1A1A18]' :
              'w-1.5 h-1.5 bg-black/20'
            }`} />
          ))}
        </div>
      )}
      <div className="flex items-center gap-1 flex-shrink-0 ml-1">
        <button type="button" title="Expand"
          onClick={e => { e.stopPropagation(); setMinimized(false) }}
          className="w-6 h-6 flex items-center justify-center text-black/40 hover:text-black hover:bg-black/[.06] rounded cursor-pointer">
          <ExpandIcon />
        </button>
        <button type="button" title="Close"
          onClick={e => { e.stopPropagation(); onClose() }}
          disabled={isActive}
          className="w-6 h-6 flex items-center justify-center text-black/30 hover:text-black hover:bg-black/[.06] rounded cursor-pointer disabled:opacity-20 disabled:cursor-default text-[15px] leading-none">
          ×
        </button>
      </div>
      {justCompleted && (
        <span className="pointer-events-none absolute inset-0 border-2 border-[#2D6A1F] animate-ping opacity-20" />
      )}
    </div>
  )

  // ── Main modal ───────────────────────────────────────────────────────────────
  return (
    <>
      {MiniWidget}

      <div className={`fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 ${minimized ? 'hidden' : ''}`}>
        <div className="bg-white w-full max-w-xl mx-4 flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/10 flex-shrink-0">
            <span className="text-[13px] font-bold uppercase tracking-[.06em]">Upload Buyer Spec</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setMinimized(true)} title="Minimise"
                className="w-6 h-6 flex items-center justify-center text-black/35 hover:text-black hover:bg-black/[.06] rounded cursor-pointer">
                <MinimiseIcon />
              </button>
              <button onClick={onClose} disabled={isActive} title="Close"
                className="w-6 h-6 flex items-center justify-center text-black/35 hover:text-black hover:bg-black/[.06] rounded cursor-pointer disabled:opacity-25 disabled:cursor-default text-[17px] leading-none">
                ×
              </button>
            </div>
          </div>

          {/* Body — scrollable */}
          <div className="flex flex-col min-h-0 overflow-y-auto">
            <div className="p-5 flex flex-col gap-4">

              {/* Buyer + Vendor */}
              <div className={`grid gap-3 ${buyerOrgs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {buyerOrgs.length > 1 && (
                  <div className="flex flex-col gap-1">
                    <label className={`text-[11px] font-semibold uppercase tracking-[.06em] ${buyerError ? 'text-red-500' : 'text-black/80'}`}>Buyer *</label>
                    <SearchableSelect
                      options={buyerOrgs.map(b => ({ value: b.id, label: b.name }))}
                      value={buyer?.id || ''}
                      onChange={id => { setBuyer(buyerOrgs.find(b => b.id === id) || null); setBuyerError(false) }}
                      placeholder="Select buyer…"
                      disabled={isActive}
                      triggerClassName={`px-2.5 py-1.5 border rounded-md text-[13px] bg-white outline-none w-full disabled:opacity-50 ${buyerError ? 'border-red-500' : 'border-black/[.18]'}`}
                      dropdownClassName="border border-black/[.15] rounded-md mt-0.5"
                    />
                    {buyerError && <span className="text-[9px] font-semibold text-red-500 uppercase tracking-[.04em]">Select a buyer</span>}
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className={`text-[11px] font-semibold uppercase tracking-[.06em] ${supplierError ? 'text-red-500' : 'text-black/80'}`}>Vendor *</label>
                  <SearchableSelect
                    options={cascadedSuppliers.map(s => ({ value: s.id, label: s.name }))}
                    value={supplier?.id || ''}
                    onChange={id => { setSupplier(cascadedSuppliers.find(s => s.id === id) || null); setSupplierError(false) }}
                    placeholder={suppCascadeLoading ? 'Loading vendors…' : !buyer ? 'Select buyer first…' : 'Select vendor…'}
                    disabled={suppLoading || suppCascadeLoading || !buyer || isActive}
                    loading={suppLoading || suppCascadeLoading}
                    triggerClassName={`px-2.5 py-1.5 border rounded-md text-[13px] bg-white outline-none w-full disabled:opacity-50 ${supplierError ? 'border-red-500' : 'border-black/[.18]'}`}
                    dropdownClassName="border border-black/[.15] rounded-md mt-0.5"
                  />
                  {supplierError && <span className="text-[9px] font-semibold text-red-500 uppercase tracking-[.04em]">Select a vendor</span>}
                </div>
              </div>

              {/* Season */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-[.06em] text-black/80">Season *</label>
                <select className={SELECT_CLS} value={season} onChange={e => setSeason(e.target.value)} disabled={isActive}>
                  {SEASONS.filter(s => s !== 'OLD').map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              {/* Drop zone */}
              {typeError && <p className="text-[9px] font-semibold text-red-500 uppercase tracking-[.04em] -mb-2">Only .pdf files are supported</p>}
              {!allDone && (
                <div
                  className={`border border-dashed border-black/20 p-8 text-center transition-all bg-[#F5F3EF] ${isActive ? 'pointer-events-none opacity-40' : 'cursor-pointer hover:bg-[#EDEAE4]'} ${dragging ? 'bg-[#EDEAE4] border-black/70' : ''}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                >
                  <div className="w-8 h-8 bg-black/[.07] flex items-center justify-center mx-auto mb-3">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M9 12V4M6 7l3-3 3 3" stroke="#5f5e5a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M3 14h12" stroke="#5f5e5a" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-[.06em] text-[#1A1A18] mb-1">Drop PDF files here</div>
                  <div className="text-[10px] text-black/70 uppercase tracking-[.04em] font-semibold">or click to browse · one PDF per SKU</div>
                  <input ref={fileRef} type="file" accept=".pdf" multiple className="hidden"
                    onChange={e => { if (e.target.files.length) { addFiles([...e.target.files]); e.target.value = '' } }} />
                </div>
              )}

              {/* File list */}
              {files.length > 0 && (
                <div className="flex flex-col gap-1">
                  {files.map(f => (
                    <div key={f.id} className="flex items-center gap-2.5 px-2.5 py-1.5 bg-black/[.04]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-black/35 flex-shrink-0">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span className="flex-1 text-[11px] font-mono font-semibold truncate text-[#1A1A18]">{f.file.name}</span>
                      {f.status === 'queued' && !isActive && (
                        <button onClick={() => removeFile(f.id)} className="text-black/30 hover:text-black/60 text-sm leading-none cursor-pointer flex-shrink-0">×</button>
                      )}
                      {f.status === 'queued' && isActive && (
                        <span className="text-[9px] font-bold uppercase tracking-[.06em] text-black/30 flex-shrink-0">Queued</span>
                      )}
                      {(f.status === 'uploading' || f.status === 'confirming') && (
                        <span className="flex items-center gap-1.5 flex-shrink-0">
                          {f.message && <span className="text-[9px] font-semibold text-black/40 uppercase tracking-[.05em]">{f.message}</span>}
                          <span className="inline-block w-3 h-3 border border-black/20 border-t-black/80 rounded-full animate-spin" />
                        </span>
                      )}
                      {f.status === 'done' && (
                        <span className="flex items-center gap-2 flex-shrink-0">
                          {selectionSavedByFileId[f.id]
                            ? <span className="text-[10px] font-bold text-[#2D6A1F] uppercase tracking-[.06em]">✓ Done</span>
                            : f.specImages?.length > 0
                              ? <span className="text-[9px] font-bold text-amber-600 uppercase tracking-[.05em]">● Review</span>
                              : <span className="text-[10px] font-bold text-[#2D6A1F] uppercase tracking-[.06em]">✓ Done</span>
                          }
                          {fileReadyToOpen(f) && (
                            <button type="button"
                              onClick={() => { const sku = usePlmStore.getState().skus.find(s => s.id === f.skuId); openWorkspace(f.workspaceId, sku || null); setMinimized(true) }}
                              className="text-[9px] font-bold uppercase tracking-[.04em] px-2 py-0.5 border border-black/20 text-black/50 hover:text-black hover:border-black/50 cursor-pointer transition-colors">
                              Open →
                            </button>
                          )}
                        </span>
                      )}
                      {f.status === 'error' && (
                        <span className="text-[10px] font-bold text-red-500 uppercase tracking-[.04em] flex-shrink-0 max-w-[160px] text-right truncate" title={f.message}>✗ {f.message}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* All done, no images */}
              {allDone && !filesWithImages.length && (
                <p className="text-[10px] text-black/45 font-semibold leading-relaxed">
                  SKU cards added. Open a workspace to pin product and brief images from the Reference Media drawer.
                </p>
              )}
            </div>

            {/* ── Image review panel (tabbed, fixed below file list) ─────────────── */}
            {filesWithImages.length > 0 && (
              <div className="border-t border-black/10 flex flex-col">

                {/* Tab strip */}
                <div className="flex items-center gap-0 border-b border-black/[.08] px-4 overflow-x-auto flex-shrink-0 bg-[#FAFAF9]">
                  <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/35 pr-3 flex-shrink-0">Images</span>
                  {filesWithImages.map((f, i) => {
                    const saved    = selectionSavedByFileId[f.id]
                    const isActive = activeReviewFileId === f.id
                    return (
                      <button key={f.id} type="button"
                        onClick={() => setActiveReviewFileId(f.id)}
                        title={f.file.name}
                        className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-[.05em] whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer flex-shrink-0 ${
                          isActive
                            ? 'border-[#1A1A18] text-[#1A1A18]'
                            : 'border-transparent text-black/35 hover:text-black/60 hover:border-black/20'
                        }`}>
                        {saved
                          ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#2D6A1F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          : <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-amber-400' : 'bg-amber-300'}`} />
                        }
                        Spec {i + 1}
                      </button>
                    )
                  })}
                </div>

                {/* Panel content */}
                {reviewFile && (
                  <div className="px-5 py-4 flex flex-col gap-4">
                    {/* File name */}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-mono font-semibold text-black/40 truncate">{reviewFile.file.name}</span>
                      {selectionSavedByFileId[reviewFile.id] && (
                        <span className="text-[9px] font-bold text-[#2D6A1F] uppercase tracking-[.05em] flex-shrink-0">✓ Confirmed</span>
                      )}
                    </div>

                    {selectionSavedByFileId[reviewFile.id] ? (
                      /* Already done — show summary only; Open → is in the file row */
                      <div className="flex flex-col items-center gap-2 py-5">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D6A1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        <p className="text-[11px] font-semibold text-black/50 text-center">Images confirmed — use the <span className="font-bold text-black/70">Open →</span> button in the file list above.</p>
                      </div>
                    ) : (() => {
                      const allUrls    = reviewFile.specImages.map(img => img.url)
                      const refSel     = selectedByFileId[reviewFile.id] || new Set()
                      const allRefSel  = allUrls.every(u => refSel.has(u))
                      const noneRefSel = allUrls.every(u => !refSel.has(u))
                      const isSaving   = savingByFileId[reviewFile.id]

                      return (
                        <>
                          {/* Reference media */}
                          <div className="flex flex-col gap-1.5">
                            {/* Explanatory note */}
                            <div className="flex gap-2 px-3 py-2.5 bg-[#F5F3EF] border border-black/[.08]">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1A1A18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-px opacity-50"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/></svg>
                              <p className="text-[10px] font-semibold text-black/60 leading-relaxed">
                                These images were extracted from your PDF. <span className="text-[#1A1A18]">Selected images</span> are saved to the workspace's Reference Media sidebar — visible to you and your buyer for spec review. <span className="text-[#1A1A18]">Deselected images</span> are removed and won't appear in the workspace. You can also set a product image from inside the workspace.
                              </p>
                            </div>

                            <div className="flex items-center justify-between gap-2 mt-1">
                              <span className="text-[10px] font-bold uppercase tracking-[.06em] text-[#1A1A18]">Select Reference Images</span>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button type="button" onClick={() => selectAllForFile(reviewFile.id, allUrls)} disabled={allRefSel}
                                  className="text-[9px] font-bold uppercase tracking-[.04em] px-2 py-0.5 border border-black/15 text-black/50 hover:text-black hover:border-black/40 disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors">All</button>
                                <button type="button" onClick={() => clearAllForFile(reviewFile.id)} disabled={noneRefSel}
                                  className="text-[9px] font-bold uppercase tracking-[.04em] px-2 py-0.5 border border-black/15 text-black/50 hover:text-black hover:border-black/40 disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors">None</button>
                                <span className="text-[9px] font-semibold text-black/35 ml-0.5">{refSel.size}/{reviewFile.specImages.length}</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-5 gap-1.5">
                              {reviewFile.specImages.map(img => {
                                const isSel = refSel.has(img.url)
                                return (
                                  <button key={img.url} type="button" onClick={() => toggleRefImage(reviewFile.id, img.url)}
                                    className={`relative aspect-square bg-[#EDEAE4] overflow-hidden cursor-pointer transition-all outline-none ${isSel ? 'ring-2 ring-[#1A1A18] ring-offset-1' : 'opacity-30 hover:opacity-55'}`}>
                                    <img src={img.url} alt="" className="w-full h-full object-contain" />
                                    {isSel && (
                                      <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-[#1A1A18] rounded-full flex items-center justify-center">
                                        <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                      </div>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {/* Actions */}
                          {saveError && (
                            <p className="text-[9px] font-semibold text-red-500 uppercase tracking-[.04em]">{saveError}</p>
                          )}
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[9px] font-semibold text-black/35 uppercase tracking-[.04em]">
                              {filesNeedingReview.length} of {filesWithImages.length} spec{filesWithImages.length !== 1 ? 's' : ''} remaining
                            </span>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => skipSelectionForFile(reviewFile)} disabled={isSaving}
                                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.06em] border border-black/20 bg-white cursor-pointer hover:bg-black/5 disabled:opacity-40 disabled:cursor-default">
                                Skip
                              </button>
                              <button type="button" onClick={() => saveSelectionForFile(reviewFile)} disabled={isSaving}
                                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-[#F5F3EF] cursor-pointer hover:opacity-80 disabled:opacity-40 disabled:cursor-default">
                                {isSaving ? 'Saving…' : 'Confirm Selection'}
                              </button>
                            </div>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-5 py-3 border-t border-black/10 flex-shrink-0">
            <button onClick={onClose} disabled={isActive}
              className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] border border-black/20 bg-white cursor-pointer hover:bg-black/5 disabled:opacity-40 disabled:cursor-default">
              {allDone ? 'Close' : 'Cancel'}
            </button>

            {!allDone && (
              <button onClick={runUploads} disabled={!queuedCount || isActive}
                className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-[#F5F3EF] cursor-pointer hover:opacity-80 disabled:opacity-40 disabled:cursor-default">
                {isActive ? 'Processing…' : `Upload ${queuedCount} Spec${queuedCount !== 1 ? 's' : ''}`}
              </button>
            )}

          </div>

        </div>
      </div>
    </>
  )
}
