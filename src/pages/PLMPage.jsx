import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePlmStore } from '../stores/plmStore'
import { useOrgsInit } from '../stores/orgsStore'
import { useAuthStore } from '../stores/authStore'
import { usePLMCatalog }  from '../hooks/usePLMCatalog'
import { usePLMFiltered } from '../hooks/usePLMFiltered'
import { useProfileHeader, useAllowedModules } from '../stores/profileStore'
import { usePlmMasterKeyActive } from '../stores/plmMasterKeyStore'
import { loadFormDraft } from '../utils/formDraft'
import { UPLOAD_INFLIGHT_TTL_MS, uploadInflightKey } from '../utils/catalogUploadDraft'

import PLMTopBar           from '../components/plm/PLMTopBar'
import PLMSidebar          from '../components/plm/PLMSidebar'
import PLMFilterBar        from '../components/plm/PLMFilterBar'
import SKUGrid             from '../components/plm/SKUGrid'
import PLMBuyerSummary     from '../components/plm/PLMBuyerSummary'
import SelectionBar        from '../components/plm/SelectionBar'
import CatalogUploadModal  from '../components/plm/modals/CatalogUploadModal'
import BulkEditModal       from '../components/plm/modals/BulkEditModal'
import WorkspaceModal      from '../components/plm/modals/WorkspaceModal'
import SamplePOModal       from '../components/plm/modals/SamplePOModal'
import CreateBulkSkuModal  from '../components/plm/modals/CreateBulkSkuModal'
import DeleteConfirmModal      from '../components/plm/modals/DeleteConfirmModal'
import BulkWorkspaceModal     from '../components/plm/modals/BulkWorkspaceModal'
import BuyerSpecModal         from '../components/plm/modals/BuyerSpecModal'
import ImageEditorModal    from '../components/plm/modals/ImageEditorModal'

export default function PLMPage() {
  useOrgsInit()
  const { role, memberId } = usePLMCatalog()

  // Pre-warm the backend on mount so the first workspace action doesn't pay the cold-start tax
  useEffect(() => {
    fetch(`${import.meta.env.VITE_BACKEND_URL}/plm/ping`).catch(() => {})
  }, [])
  const { filteredSkus, skusForCounts, grouped, supplierOrder, seasonOptions, buyerOptions, supplierOptions, statusOptions, memberOptions, showMemberFilter, buyerContactOptions, supplierContactOptions } = usePLMFiltered()

  const filters         = usePlmStore(s => s.filters)
  const skus            = usePlmStore(s => s.skus)
  const loading         = usePlmStore(s => s.loading)
  const error           = usePlmStore(s => s.error)
  const selectedIds     = usePlmStore(s => s.selectedIds)
  const softDeleteSkus          = usePlmStore(s => s.softDeleteSkus)
  const bulkSetWorkspaceStatus  = usePlmStore(s => s.bulkSetWorkspaceStatus)
  const clearSelection  = usePlmStore(s => s.clearSelection)
  const deselectIds     = usePlmStore(s => s.deselectIds)
  const activeSku       = usePlmStore(s => s.activeSku)
  const activeWorkspaceId = usePlmStore(s => s.activeWorkspaceId)
  const openSkuPanel    = usePlmStore(s => s.openSkuPanel)
  const buyerSummaryMode = usePlmStore(s => s.buyerSummaryMode)
  const toggleBuyerSummaryMode = usePlmStore(s => s.toggleBuyerSummaryMode)
  const toastMsg        = usePlmStore(s => s.toastMsg)
  const toast           = usePlmStore(s => s.toast)
  const saveReferenceMediaEdit = usePlmStore(s => s.saveReferenceMediaEdit)
  const masterKeyActive = usePlmMasterKeyActive()

  const [uploadOpen,        setUploadOpen]        = useState(false)
  // Reopen the catalog-upload modal if one was still processing (worker still running
  // server-side) when the page was last reloaded — see uploadInflightKey in
  // CatalogUploadModal.jsx, which does the actual polling-reconnect once this mounts it.
  useEffect(() => {
    if (!memberId) return
    if (loadFormDraft(uploadInflightKey(memberId), UPLOAD_INFLIGHT_TTL_MS)) setUploadOpen(true)
  }, [memberId])
  const [buyerSpecOpen,     setBuyerSpecOpen]     = useState(false)
  const [bulkCreateOpen,  setBulkCreateOpen]  = useState(false)
  const [bulkCreateNewOnly, setBulkCreateNewOnly] = useState(false)  // Kaptr entry — hide the "existing SKU" choice

  // Same module/tab gate as the sidebar's Kaptr link (config/modules.js → 'npd' › 'kaptr'):
  // null allowed_modules = full access; otherwise the npd module must be present AND either
  // grant all tabs (null) or explicitly list 'kaptr'. Keeps a hidden user from deep-linking in.
  const allowedModules = useAllowedModules()
  const canKaptr = !allowedModules
    || (('npd' in allowedModules) && (allowedModules.npd === null
        || (Array.isArray(allowedModules.npd) && allowedModules.npd.includes('kaptr'))))

  // Kaptr nav link lands here with ?kaptr=1 — open the create modal in new-only mode, then
  // drop the param so a refresh / back doesn't reopen it.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get('kaptr') !== '1') return
    if (canKaptr) {
      // Syncing UI state to an inbound URL param, then clearing it — one-shot, self-limiting.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBulkCreateNewOnly(true)
      setBulkCreateOpen(true)
    }
    const p = new URLSearchParams(searchParams)
    p.delete('kaptr')
    setSearchParams(p, { replace: true })
  }, [searchParams, setSearchParams, canKaptr])
  const [editingImageSku,   setEditingImageSku]   = useState(null)
  const [editSkus,          setEditSkus]          = useState(null)
  const [isFromUpload,      setIsFromUpload]      = useState(false)
  const [uploadMode,        setUploadMode]        = useState('new')
  const [samplePOIds,       setSamplePOIds]       = useState(null)
  const [deleteConfirmOpen,   setDeleteConfirmOpen]   = useState(false)
  const [bulkWorkspaceOpen,   setBulkWorkspaceOpen]   = useState(false)

  // Determine if selected SKUs can form a sample PO (merchant role, all sample status, same supplier)
  const samplePODisabledReason = useMemo(() => {
    if (role !== 'merchant' || selectedIds.size === 0) return null
    const selected = skus.filter(s => selectedIds.has(s.id))
    if (selected.some(s => s.workspace_status !== 'sample' || !s.workspace_id))
      return 'Finish sampling to create a PO'
    const supplierOrgIds = new Set(selected.map(s => s.supplier_org_id).filter(Boolean))
    if (supplierOrgIds.size !== 1) return 'Include SKUs from the same vendor'
    return null
  }, [selectedIds, skus, role])

  const canCreateSamplePO = !samplePODisabledReason
  const { businessName } = useProfileHeader()

  // Scopes the Buyer Summary text button (PLMSidebar). For a buyer role, `skus` is already
  // scoped entirely to their own org by fetchCatalog's buyer branch (query filters on
  // buyer_member_id) — no filter needed. For merchant, it's scoped to whichever buyer is set in
  // the filter bar — picked BEFORE toggling into this view, since the filter bar itself hides
  // once in it. Scoped by buyer only (not season/category/etc.) so switching those filters
  // afterward can't silently shrink what's meant to be a per-buyer total.
  const buyerSummary = useMemo(() => {
    if (role === 'buyer') {
      if (!skus.length) return null
      const name = businessName || skus[0].upload_buyer_org_name || 'Your organisation'
      return { skus, name }
    }
    const { buyer } = filters
    if (buyer === 'all' || buyer === '__none__') return null
    const buyerSkus = skus.filter(s => s.buyer_org_id === buyer || s.upload_buyer_org_id === buyer)
    if (!buyerSkus.length) return null
    const name = buyerSkus[0].buyer_org_name || buyerSkus[0].upload_buyer_org_name || 'This buyer'
    return { skus: buyerSkus, name }
  }, [skus, filters, role, businessName])

  // Wrapped in useCallback so it's a stable prop reference into SKUGrid -> SKUCard — SKUCard
  // is now React.memo'd, and a freshly-recreated callback on every PLMPage render (from
  // filters/toastMsg/etc. changes elsewhere on the page) would defeat that memoization for
  // every mounted card.
  const openEdit = useCallback((sku) => {
    if (role !== 'merchant') return
    setEditSkus([sku])
    setIsFromUpload(false)
  }, [role])

  const openBulkEdit = () => {
    const skusToEdit = skus.filter(s => selectedIds.has(s.id))
    if (!skusToEdit.length) return
    setEditSkus(skusToEdit)
    setIsFromUpload(false)
  }

  const handleDeleteSelected = () => setDeleteConfirmOpen(true)

  // Production-linked and "existing tab" SKUs can never have a workspace/chat opened on them
  // (see SKUCard.handleClick) — silently including them here would create workspaces that
  // then can't actually be used. Drop them from the selection with an explanation instead of
  // letting them ride along into BulkWorkspaceModal.
  const handleCreateWorkspaces = () => {
    const selectedSkus = skus.filter(s => selectedIds.has(s.id))
    const blocked = selectedSkus.filter(s => s.production_sku_id || s.sku_source === 'existing')
    if (blocked.length) {
      deselectIds(blocked.map(s => s.id))
      toast(`Can't create workspace on production-linked SKUs or SKUs uploaded from an existing-source upload — removed ${blocked.length} SKU${blocked.length === 1 ? '' : 's'} from selection`)
    }
    if (blocked.length === selectedSkus.length) return
    setBulkWorkspaceOpen(true)
  }

  const handleHoldSelected = async () => {
    const wsIds = skus.filter(s => selectedIds.has(s.id) && s.workspace_id && !['on_hold', 'rejected'].includes(s.workspace_status)).map(s => s.workspace_id)
    if (!wsIds.length) return
    try { await bulkSetWorkspaceStatus(wsIds, 'on_hold') } catch (err) { toast(err.message) }
  }

  const handleResumeSelected = async () => {
    const wsIds = skus.filter(s => selectedIds.has(s.id) && ['on_hold', 'rejected'].includes(s.workspace_status) && s.workspace_id).map(s => s.workspace_id)
    if (!wsIds.length) return
    try { await bulkSetWorkspaceStatus(wsIds, 'active') } catch (err) { toast(err.message) }
  }

  const handleRejectSelected = async () => {
    const wsIds = skus.filter(s => selectedIds.has(s.id) && s.workspace_id && !['on_hold', 'rejected'].includes(s.workspace_status)).map(s => s.workspace_id)
    if (!wsIds.length) return
    try { await bulkSetWorkspaceStatus(wsIds, 'rejected') } catch (err) { toast(err.message) }
  }

  const canResume = useMemo(
    () => skus.some(s => selectedIds.has(s.id) && ['on_hold', 'rejected'].includes(s.workspace_status)),
    [skus, selectedIds]
  )

  const canHold = useMemo(
    () => skus.some(s => selectedIds.has(s.id) && s.workspace_id && !['on_hold', 'rejected'].includes(s.workspace_status)),
    [skus, selectedIds]
  )

  const canReject = useMemo(
    () => skus.some(s => selectedIds.has(s.id) && s.workspace_id && !['on_hold', 'rejected'].includes(s.workspace_status)),
    [skus, selectedIds]
  )

  const handleConfirmDelete = async (reason) => {
    try {
      await softDeleteSkus([...selectedIds], role, reason)
      setDeleteConfirmOpen(false)
    } catch (err) {
      toast(err.message)
    }
  }

  // State (not a plain ref) so SKUGrid's Virtuoso can be handed the actual DOM node once it
  // exists via customScrollParent — Virtuoso needs to use THIS real scroll container (not its
  // own internal one) so the existing "scroll to top on filter change" behavior below keeps
  // working against the same element.
  const [scrollParent, setScrollParent] = useState(null)
  useEffect(() => {
    scrollParent?.scrollTo({ top: 0 })
  }, [filters, scrollParent])

  // Same reasoning as openEdit above — stable reference so SKUCard's React.memo holds.
  const handleCardClick = useCallback((sku) => {
    if (role === 'merchant') openSkuPanel(sku)
  }, [role, openSkuPanel])

  const handleImageEditorSave = async (blob) => {
    const skuId = editingImageSku?.id
    if (!skuId) return
    const session = useAuthStore.getState().session
    const fd = new FormData()
    fd.append('image', blob, `sku-${skuId}-${Date.now()}.png`)
    fd.append('role', role)
    const res = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/plm/catalog/skus/${skuId}/image`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${session?.access_token}` }, body: fd }
    )
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
    usePlmStore.setState(s => ({
      skus: s.skus.map(sk => sk.id === skuId ? { ...sk, image_url: `${json.image_url}?t=${Date.now()}` } : sk)
    }))
    toast?.('Image saved!')
  }

  // Once a workspace is actually approved to proceed to sample (or beyond), the backend rejects
  // a direct product-image replace (see PATCH /catalog/skus/:id/image) — so for those, editing
  // from the SKU card falls back to saving the edit as a new Reference Media image on the
  // workspace instead. Stays editable through the whole 'active' brief/negotiation stage —
  // matches the buyer brief's own lock point, not the moment a workspace merely exists.
  const editingImageLocked = ['approved', 'sample', 'sample_shipped', 'production'].includes(editingImageSku?.workspace_status)

  const handleImageEditorSaveAsCopy = async (blob) => {
    const workspaceId = editingImageSku?.workspace_id
    if (!workspaceId) return
    await saveReferenceMediaEdit(workspaceId, blob, { mode: 'copy' })
    toast?.('Saved as a new image in Reference Media')
  }

  return (
    <div className="flex flex-col h-screen font-sans text-[#1A1A18] text-[13px]">
      <PLMTopBar />

      {masterKeyActive && (
        <div className="flex-shrink-0 bg-[#b91c1c] text-white text-[10px] md:text-[11px] font-bold uppercase tracking-[.06em] text-center py-1.5 px-2">
          Super Admin Mode Active — full override, actions are logged
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden bg-[#fbf9f5]">
        <PLMSidebar skus={skusForCounts} />

        <div className="flex flex-col flex-1 min-w-0 bg-[#fbf9f5] overflow-hidden">
          {/* Filter bar / search / upload only apply to browsing the SKU grid — Buyer Summary
              shows pipeline-wide counts regardless of any of these, so they'd be inert clutter
              (and "STATUS" in particular reads as if it scopes the summary, which it doesn't). */}
          {!buyerSummaryMode && (
            <div className="px-2.5 pt-1 flex-shrink-0">
              <PLMFilterBar
                seasonOptions={seasonOptions}
                buyerOptions={buyerOptions}
                supplierOptions={supplierOptions}
                statusOptions={statusOptions}
                memberOptions={memberOptions}
                showMemberFilter={showMemberFilter}
                buyerContactOptions={buyerContactOptions}
                supplierContactOptions={supplierContactOptions}
                role={role}
                onUpload={() => setUploadOpen(true)}
                onCreate={() => setBulkCreateOpen(true)}
                onBulkCreate={() => setBulkCreateOpen(true)}
                onCreateVendorSpec={() => setBuyerSpecOpen(true)}
              />
            </div>
          )}

          {/* Mobile-only exit — the filter bar (and its sidebar-open button) is unmounted while
              Buyer Summary is active, so this is the only way back on mobile; without it
              there's no path out short of a page reload. */}
          {buyerSummaryMode && (
            <div className="px-2.5 pt-1 flex-shrink-0 md:hidden">
              <button
                type="button"
                onClick={() => toggleBuyerSummaryMode()}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.06em] text-[#1A1A18]/70 hover:text-[#1A1A18] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
                Back to catalog
              </button>
            </div>
          )}

          <div ref={setScrollParent} className="flex-1 overflow-y-auto px-2.5 pb-20 select-none">
            {loading ? (
              <div className="text-center py-16 text-[10px] font-bold uppercase tracking-[.1em] text-black/85">
                <span className="inline-block w-4 h-4 border-[1.5px] border-black/12 border-t-black rounded-full animate-spin mr-2 align-middle" />
                Loading…
              </div>
            ) : error ? (
              <div className="text-center py-16 text-[10px] font-bold uppercase tracking-[.1em] text-red-600">
                Failed to load: {error}
              </div>
            ) : !skus.length ? (
              <div className="text-center py-16 text-[10px] font-bold uppercase tracking-[.1em] text-black/85">
                {role === 'merchant'
                  ? 'No catalog yet. Upload a vendor catalog to get started.'
                  : 'No catalog available yet.'}
              </div>
            ) : buyerSummaryMode ? (
              buyerSummary ? (
                <PLMBuyerSummary
                  skus={buyerSummary.skus}
                  buyerName={buyerSummary.name}
                  onOpenWorkspace={(sku, tab) => openSkuPanel(sku, tab)}
                />
              ) : (
                <div className="text-center py-16 text-[10px] font-bold uppercase tracking-[.1em] text-black/85">
                  {role === 'buyer' ? 'No SKUs yet.' : 'Pick a buyer from the filter bar first, then reopen Summary.'}
                </div>
              )
            ) : (
              <SKUGrid
                grouped={grouped}
                supplierOrder={supplierOrder}
                role={role}
                onEdit={openEdit}
                onCardClick={handleCardClick}
                onEditImage={setEditingImageSku}
                scrollParent={scrollParent}
              />
            )}
          </div>
        </div>
      </div>

      {(role === 'merchant' || role === 'buyer') && (
        <SelectionBar
          role={role}
          onEditSelected={openBulkEdit}
          onDeleteSelected={handleDeleteSelected}
          canCreateSamplePO={canCreateSamplePO}
          samplePODisabledReason={samplePODisabledReason}
          onCreateWorkspaces={handleCreateWorkspaces}
          canHold={canHold}
          onHold={handleHoldSelected}
          onResume={handleResumeSelected}
          canResume={canResume}
          canReject={canReject}
          onReject={handleRejectSelected}
          onCreateSamplePO={() => {
            const ids = skus.filter(s => selectedIds.has(s.id)).map(s => s.workspace_id)
            setSamplePOIds(ids)
          }}
        />
      )}

      {bulkCreateOpen && (
        <CreateBulkSkuModal
          newOnly={bulkCreateNewOnly}
          onClose={() => { setBulkCreateOpen(false); setBulkCreateNewOnly(false) }}
        />
      )}

      {buyerSpecOpen && (
        <BuyerSpecModal onClose={() => setBuyerSpecOpen(false)} />
      )}

      {bulkWorkspaceOpen && (
        <BulkWorkspaceModal
          skus={skus.filter(s => selectedIds.has(s.id))}
          onClose={() => setBulkWorkspaceOpen(false)}
          onDone={() => { setBulkWorkspaceOpen(false); clearSelection() }}
        />
      )}

      {uploadOpen && (
        <CatalogUploadModal
          role={role}
          onClose={() => setUploadOpen(false)}
          onDone={async (newSkus, mode) => {
            setUploadOpen(false)
            const { fetchBuyerSkuRefs, addSkus, refreshCatalog } = usePlmStore.getState()
            const refMap = await fetchBuyerSkuRefs(newSkus.map(s => s.id))
            const skusToEdit = newSkus.map(s => {
              const db = refMap[s.id] || {}
              return {
                ...s,
                slide_index:       db.slide_index     ?? s.slide_index ?? null,
                buyer_sku_ref:     db.buyer_sku_ref                   || null,
                production_sku_id: db.production_sku_id               ?? s.production_sku_id ?? null,
                temp_sku_ref:      db.temp_sku_ref                    ?? s.temp_sku_ref      ?? null,
                buyer_ref_status:  db.buyer_ref_status                ?? s.buyer_ref_status  ?? null,
                length:            db.length      !== undefined ? db.length      : s.length      ?? null,
                width:             db.width       !== undefined ? db.width       : s.width       ?? null,
                height:            db.height      !== undefined ? db.height      : s.height      ?? null,
                dimensions:        db.dimensions                       || s.dimensions  || null,
                measurement:       db.measurement                      || s.measurement || 'cm',
                description:       db.description                      || s.description || null,
                material:          db.material                         || s.material    || null,
                finish:            db.finish                           || s.finish      || null,
                weight:            db.weight      !== undefined ? db.weight      : s.weight      ?? null,
              }
            })
            // Sync store so card grid reflects all DB values after modal closes
            addSkus(skusToEdit)
            // addSkus only carries per-SKU fields — the buyer org (from the joined
            // npd2_catalog_uploads row) isn't in it, so freshly-uploaded SKUs would group
            // under "no buyer" until a full page reload. Pull the complete rows now.
            refreshCatalog()
            setEditSkus(skusToEdit)
            setIsFromUpload(true)
            setUploadMode(mode || 'new')
          }}
        />
      )}

      {editSkus && (
        <BulkEditModal
          skus={editSkus}
          role={role}
          isFromUpload={isFromUpload}
          mode={uploadMode}
          onClose={() => { setEditSkus(null); clearSelection() }}
        />
      )}

      {(activeSku || activeWorkspaceId) && (
        <WorkspaceModal />
      )}

      {deleteConfirmOpen && (
        <DeleteConfirmModal
          skus={skus.filter(s => selectedIds.has(s.id))}
          onConfirm={handleConfirmDelete}
          onClose={() => setDeleteConfirmOpen(false)}
        />
      )}

      {samplePOIds && (
        <SamplePOModal
          workspaceIds={samplePOIds}
          onClose={() => setSamplePOIds(null)}
          onCreated={() => { setSamplePOIds(null); clearSelection() }}
        />
      )}

      {editingImageSku && (
        <ImageEditorModal
          imageUrl={editingImageSku.image_url}
          onSave={editingImageLocked ? undefined : handleImageEditorSave}
          onSaveAsCopy={editingImageLocked && editingImageSku.workspace_id ? handleImageEditorSaveAsCopy : undefined}
          copyOnlyReason="Active workspace images can no longer be replaced directly — your edit will be saved as a new image in Reference Media instead."
          onClose={() => setEditingImageSku(null)}
          toast={toast}
        />
      )}

      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[2000] bg-[#1A1A18] text-[#F5F3EF] text-[11px] font-bold uppercase tracking-[.06em] px-5 py-2.5 rounded-full shadow-lg pointer-events-none">
          {toastMsg}
        </div>
      )}
    </div>
  )
}
