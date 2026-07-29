import { useState, useMemo, useRef, useEffect } from 'react'
import { usePlmStore } from '../stores/plmStore'
import { useOrgsInit } from '../stores/orgsStore'
import { useAuthStore } from '../stores/authStore'
import { usePLMCatalog }  from '../hooks/usePLMCatalog'
import { usePLMFiltered } from '../hooks/usePLMFiltered'

import PLMTopBar           from '../components/plm/PLMTopBar'
import PLMSidebar          from '../components/plm/PLMSidebar'
import PLMFilterBar        from '../components/plm/PLMFilterBar'
import SKUGrid             from '../components/plm/SKUGrid'
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
  const { role } = usePLMCatalog()

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
  const toastMsg        = usePlmStore(s => s.toastMsg)
  const toast           = usePlmStore(s => s.toast)
  const saveReferenceMediaEdit = usePlmStore(s => s.saveReferenceMediaEdit)

  const [uploadOpen,        setUploadOpen]        = useState(false)
  const [buyerSpecOpen,     setBuyerSpecOpen]     = useState(false)
  const [bulkCreateOpen,  setBulkCreateOpen]  = useState(false)
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

  const openEdit = (sku) => {
    if (role !== 'merchant') return
    setEditSkus([sku])
    setIsFromUpload(false)
  }

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

  const scrollRef = useRef(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [filters])

  const handleCardClick = (sku) => {
    if (role === 'merchant') openSkuPanel(sku)
  }

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

  // Once a workspace reaches active stage or beyond, the backend rejects a direct product-image
  // replace (see PATCH /catalog/skus/:id/image) — so for those, editing from the SKU card falls
  // back to saving the edit as a new Reference Media image on the workspace instead.
  const editingImageLocked = ['active', 'approved', 'sample', 'production'].includes(editingImageSku?.workspace_status)

  const handleImageEditorSaveAsCopy = async (blob) => {
    const workspaceId = editingImageSku?.workspace_id
    if (!workspaceId) return
    await saveReferenceMediaEdit(workspaceId, blob, { mode: 'copy' })
    toast?.('Saved as a new image in Reference Media')
  }

  return (
    <div className="flex flex-col h-screen font-sans text-[#1A1A18] text-[13px]">
      <PLMTopBar />

      <div className="flex flex-1 min-h-0 overflow-hidden bg-[#fbf9f5]">
        <PLMSidebar skus={skusForCounts} />

        <div className="flex flex-col flex-1 min-w-0 bg-[#fbf9f5] overflow-hidden">
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

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-2.5 pb-20">
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
            ) : (
              <SKUGrid
                grouped={grouped}
                supplierOrder={supplierOrder}
                role={role}
                onEdit={openEdit}
                onCardClick={handleCardClick}
                onEditImage={setEditingImageSku}
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
        <CreateBulkSkuModal onClose={() => setBulkCreateOpen(false)} />
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
            const { fetchBuyerSkuRefs, addSkus } = usePlmStore.getState()
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
