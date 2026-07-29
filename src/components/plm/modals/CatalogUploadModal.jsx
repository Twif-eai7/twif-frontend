import { useState, useRef, useEffect } from 'react'
import { usePlmStore, SEASONS } from '../../../stores/plmStore'
import { useSupplierOrgs, useOrgsLoading } from '../../../stores/orgsStore'
import { useMemberId, useProfileStore } from '../../../stores/profileStore'
import { useAuthStore } from '../../../stores/authStore'
import SearchableSelect from '../../ui/SearchableSelect'
import { resolveBuyerOrgsForMember, resolveSupplierOrgsForBuyer } from '../../../lib/poQueries'

const SELECT_CLS = 'px-2.5 py-1.5 border border-black/[.18] rounded-md text-[13px] bg-white outline-none w-full disabled:opacity-50'

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

export default function CatalogUploadModal({ role, onClose, onDone }) {
  const [mode,         setMode]         = useState('new')
  const [supplier,     setSupplier]     = useState(null)
  const [season,       setSeason]       = useState('AW26')
  const [dragging,     setDragging]     = useState(false)
  const [status,       setStatus]       = useState(null)
  const [progress,     setProgress]     = useState(0)
  const [message,      setMessage]      = useState('')
  const [createdSkus,  setCreatedSkus]  = useState([])
  const [buyer,              setBuyer]              = useState(null)
  const [buyerOrgs,          setBuyerOrgs]          = useState([])
  const [cascadedSuppliers,  setCascadedSuppliers]  = useState([])
  const [suppCascadeLoading, setSuppCascadeLoading] = useState(false)
  const [supplierError,      setSupplierError]      = useState(false)
  const [fileTypeError,      setFileTypeError]      = useState(false)
  const [minimized,          setMinimized]          = useState(false)
  const [justCompleted,      setJustCompleted]      = useState(false)

  const prevDoneRef = useRef(false)
  const fileRef     = useRef(null)

  const uploadCatalog  = usePlmStore(s => s.uploadCatalog)
  const addSkus        = usePlmStore(s => s.addSkus)
  const supplierList   = useSupplierOrgs()
  const suppLoading    = useOrgsLoading()
  const memberId       = useMemberId()
  const orgMembership  = useProfileStore(s => s.orgMembership)

  const orgDisplayName = orgMembership?.orgDisplayName
  const orgName        = orgMembership?.orgName
  const orgId          = orgMembership?.orgId

  const isActive = status !== null && status !== 'done' && status !== 'error'
  const isDone   = status === 'done'
  const isError  = status === 'error'

  useEffect(() => {
    if (role === 'supplier' && orgId) {
      setSupplier({ id: orgId, name: orgDisplayName || orgName || 'My Organisation' })
    }
  }, [role, orgId, orgDisplayName, orgName])

  useEffect(() => {
    if (!memberId || role === 'supplier') return
    resolveBuyerOrgsForMember(memberId).then(orgs => {
      setBuyerOrgs(orgs)
      if (orgs.length === 1) setBuyer(orgs[0])
    })
  }, [memberId, role])

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

  useEffect(() => {
    const nowDone = isDone || isError
    if (nowDone && !prevDoneRef.current && minimized) {
      setJustCompleted(true)
      const t = setTimeout(() => setJustCompleted(false), 5000)
      return () => clearTimeout(t)
    }
    prevDoneRef.current = nowDone
  }, [isDone, isError, minimized])

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) runUpload(file)
  }

  const runUpload = async (file) => {
    if (!supplier?.id) { setSupplierError(true); return }
    if (!/\.(pptx|pdf)$/i.test(file.name)) { setFileTypeError(true); return }
    setSupplierError(false)
    setFileTypeError(false)

    setStatus('uploading')
    setProgress(10)
    setMessage('Uploading file…')

    try {
      const fd = new FormData()
      fd.append('catalogFile', file)
      fd.append('supplierOrgId', supplier.id)
      fd.append('season', season)
      fd.append('memberId', memberId)
      fd.append('skuSource', mode)
      if (buyer?.id) fd.append('buyerOrgId', buyer.id)
      if (role === 'supplier') fd.append('isSupplierUpload', 'true')

      const result   = await uploadCatalog(fd)
      const uploadId = result.uploadId
      if (!uploadId) throw new Error('No uploadId returned')

      setMessage('Processing slides…')
      setProgress(20)

      await new Promise((resolve, reject) => {
        const MAX_WAIT_MS = 10 * 60 * 1000
        const startedAt   = Date.now()

        const interval = setInterval(async () => {
          try {
            const API_BASE = import.meta.env.VITE_BACKEND_URL
            const r    = await fetch(`${API_BASE}/plm/catalog/upload-status/${uploadId}`, {
              headers: { Authorization: `Bearer ${useAuthStore.getState().session?.access_token}` }
            })
            const data = await r.json()
            const { upload, skus } = data

            const total     = upload.total_slides || 1
            const processed = upload.slides_processed || 0
            const pct       = Math.min(20 + Math.round((processed / total) * 75), 95)
            setProgress(pct)
            setMessage(
              upload.status === 'processing' ? `Processing slide ${processed} of ${total}…`
              : upload.status === 'queued'   ? 'Enhancing images and extracting text…'
              : upload.status === 'done'     ? `Done — ${upload.sku_count} SKUs extracted`
              : `Status: ${upload.status}`
            )

            if (upload.status === 'done') {
              clearInterval(interval)
              setProgress(100)
              const normalizedSkus = (skus || [])
                .map(s => ({
                  ...s,
                  supplier:             s.supplier             || supplier?.name || '',
                  season:               s.season               || season,
                  supplier_org_id:      s.supplier_org_id      || supplier?.id  || null,
                  created_by_member_id: s.created_by_member_id || memberId      || null,
                }))
                .sort((a, b) => (a.slide_index ?? 999) - (b.slide_index ?? 999))
              setCreatedSkus(normalizedSkus)
              addSkus(normalizedSkus)
              setStatus('done')
              resolve()
            } else if (upload.status === 'error') {
              clearInterval(interval)
              reject(new Error(upload.error_message || 'Worker failed'))
            } else if (Date.now() - startedAt > MAX_WAIT_MS) {
              clearInterval(interval)
              reject(new Error('Worker timed out — please try again'))
            }
          } catch (err) {
            clearInterval(interval)
            reject(err)
          }
        }, 4000)
      })

    } catch (err) {
      setStatus('error')
      const msg = err.message === 'Failed to fetch'
        ? 'Could not reach the server — check your network connection, or contact support if the issue persists.'
        : 'Upload failed: ' + err.message
      setMessage(msg)
    }
  }

  const miniStatus = isActive
    ? (message || 'Processing…')
    : isDone
      ? `${createdSkus.length} SKU${createdSkus.length !== 1 ? 's' : ''} created`
      : isError
        ? 'Upload failed'
        : 'Ready to upload'

  // ── Minimised pill ────────────────────────────────────────────────────────────
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
          : isDone
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={justCompleted ? '#2D6A1F' : '#1A1A18'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            : isError
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1A1A18" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        }
      </div>

      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-[11px] font-bold uppercase tracking-[.07em] text-[#1A1A18]">Upload Vendor Catalog</span>
        <span className={`text-[9px] font-semibold uppercase tracking-[.05em] truncate transition-colors ${justCompleted ? 'text-[#2D6A1F]' : 'text-black/45'}`}>
          {miniStatus}
        </span>
        {isActive && (
          <div className="mt-1 h-0.5 bg-black/10 overflow-hidden rounded-full w-full">
            <div className="h-full bg-[#1A1A18] transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0 ml-1">
        <button
          type="button"
          title="Expand"
          onClick={e => { e.stopPropagation(); setMinimized(false) }}
          className="w-6 h-6 flex items-center justify-center text-black/40 hover:text-black hover:bg-black/[.06] rounded cursor-pointer"
        >
          <ExpandIcon />
        </button>
        <button
          type="button"
          title="Close"
          onClick={e => { e.stopPropagation(); onClose() }}
          disabled={isActive}
          className="w-6 h-6 flex items-center justify-center text-black/30 hover:text-black hover:bg-black/[.06] rounded cursor-pointer disabled:opacity-20 disabled:cursor-default text-[15px] leading-none"
        >
          ×
        </button>
      </div>

      {justCompleted && (
        <span className="pointer-events-none absolute inset-0 border-2 border-[#2D6A1F] animate-ping opacity-20" />
      )}
    </div>
  )

  return (
    <>
      {MiniWidget}

      <div className={`fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 ${minimized ? 'hidden' : ''}`}>
        <div className="bg-white w-full max-w-lg mx-4 flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/10">
            <span className="text-[13px] font-bold uppercase tracking-[.06em]">Upload vendor catalog</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMinimized(true)}
                title="Minimise"
                className="w-6 h-6 flex items-center justify-center text-black/35 hover:text-black hover:bg-black/[.06] rounded cursor-pointer"
              >
                <MinimiseIcon />
              </button>
              <button
                onClick={onClose}
                disabled={isActive}
                title="Close"
                className="w-6 h-6 flex items-center justify-center text-black/35 hover:text-black hover:bg-black/[.06] rounded cursor-pointer disabled:opacity-25 disabled:cursor-default text-[17px] leading-none"
              >
                ×
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-5 flex flex-col gap-4">

            {/* Mode picker */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[.06em] text-black/80">SKU Type</span>
              <div className="flex border border-black/15 overflow-hidden self-start">
                {[['new', 'New SKU'], ['existing', 'Existing Production SKU']].map(([val, label]) => (
                  <button key={val} type="button"
                    disabled={!!status}
                    onClick={() => setMode(val)}
                    className={`px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] cursor-pointer border-none transition-colors disabled:cursor-default ${mode === val ? 'bg-[#1A1A18] text-white' : 'bg-white text-black/45 hover:bg-black/5 disabled:hover:bg-white'}`}
                  >{label}</button>
                ))}
              </div>
              {mode === 'existing' && !status && (
                <p className="text-[10px] text-black/45">After upload you'll be able to set the Buyer SKU Ref for each extracted SKU.</p>
              )}
            </div>

            {/* Row 1: Buyer + Vendor (cascading) */}
            {role !== 'supplier' && (
              <div className={`grid gap-3 ${buyerOrgs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {buyerOrgs.length > 1 && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-[.06em] text-black/80">Buyer</label>
                    <SearchableSelect
                      options={buyerOrgs.map(b => ({ value: b.id, label: b.name }))}
                      value={buyer?.id || ''}
                      onChange={id => setBuyer(buyerOrgs.find(b => b.id === id) || null)}
                      placeholder="Select buyer…"
                      disabled={!!status}
                      triggerClassName={SELECT_CLS}
                      dropdownClassName="border border-black/[.15] rounded-md mt-0.5"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className={`text-[11px] font-semibold uppercase tracking-[.06em] ${supplierError ? 'text-red-500' : 'text-black/80'}`}>Vendor *</label>
                  <SearchableSelect
                    options={(buyerOrgs.length ? cascadedSuppliers : supplierList).map(s => ({ value: s.id, label: s.name }))}
                    value={supplier?.id || ''}
                    onChange={id => {
                      const list = buyerOrgs.length ? cascadedSuppliers : supplierList
                      setSupplier(list.find(s => s.id === id) || null)
                      setSupplierError(false)
                    }}
                    placeholder={suppCascadeLoading ? 'Loading vendors…' : buyerOrgs.length && !buyer ? 'Select buyer first…' : 'Select vendor…'}
                    disabled={suppLoading || suppCascadeLoading || (buyerOrgs.length > 0 && !buyer) || !!status}
                    loading={suppLoading || suppCascadeLoading}
                    triggerClassName={`px-2.5 py-1.5 border rounded-md text-[13px] bg-white outline-none w-full disabled:opacity-50 ${supplierError ? 'border-red-500' : 'border-black/[.18]'}`}
                    dropdownClassName="border border-black/[.15] rounded-md mt-0.5"
                  />
                  {supplierError && <span className="text-[9px] font-semibold text-red-500 uppercase tracking-[.04em]">Fill in the required field(s)</span>}
                </div>
              </div>
            )}

            {/* Row 2: Season */}
            <div className={role === 'supplier' ? 'grid grid-cols-1 gap-3' : ''}>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-[.06em] text-black/80">Season *</label>
                <select className={SELECT_CLS} value={season} onChange={e => setSeason(e.target.value)}>
                  {SEASONS.filter(s => mode === 'existing' || s !== 'OLD').map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Drop zone */}
            {fileTypeError && (
              <p className="text-[9px] font-semibold text-red-500 uppercase tracking-[.04em] -mb-2">Only .pptx and .pdf files are supported</p>
            )}
            {status === null && (
              <div
                className={`border border-dashed border-black/20 p-8 text-center cursor-pointer transition-all bg-[#F5F3EF] ${dragging ? 'bg-[#EDEAE4] border-black/70' : 'hover:bg-[#EDEAE4]'}`}
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
                <div className="text-[11px] font-bold uppercase tracking-[.06em] text-[#1A1A18] mb-1">Drop .pptx or .pdf here</div>
                <div className="text-[10px] text-black/70 uppercase tracking-[.04em] font-semibold">or click to browse · max 50MB</div>
                <input ref={fileRef} type="file" accept=".pptx,.pdf" className="hidden" onChange={e => { if (e.target.files[0]) { runUpload(e.target.files[0]); e.target.value = '' } }} />
              </div>
            )}

            {/* Progress */}
            {status && status !== null && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[.06em] mb-1.5">{message}</div>
                <div className="h-0.5 bg-black/10 overflow-hidden">
                  <div className={`h-full transition-[width] duration-300 ${isError ? 'bg-red-500' : 'bg-[#1A1A18]'}`} style={{ width: `${progress}%` }} />
                </div>
                {isDone && (
                  <div className="mt-2 max-h-48 overflow-y-auto flex flex-col gap-0.5">
                    {createdSkus.map(s => (
                      <div key={s.id} className="flex items-center gap-2.5 px-2.5 py-1.5 bg-black/[.04] text-[11px]">
                        <span className="flex-1 font-mono text-[10px] font-semibold uppercase tracking-[.04em]">{s.auto_code}</span>
                        <span className="text-[10px] text-[#2D6A1F] font-bold uppercase tracking-[.06em]">✓ Created</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-5 py-3 border-t border-black/10">
            <button onClick={onClose} disabled={isActive} className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] border border-black/20 bg-white cursor-pointer hover:bg-black/5 disabled:opacity-40 disabled:cursor-default">
              {isDone ? 'Close' : 'Cancel'}
            </button>
            {isDone && (
              <button
                onClick={() => onDone(createdSkus, mode)}
                className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-[#F5F3EF] cursor-pointer hover:opacity-80"
              >
                Fill in attributes →
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
