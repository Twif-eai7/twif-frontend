import { useMemo, useRef } from 'react'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
import { usePlmStore } from '../../stores/plmStore'
import SKUCard from './SKUCard'
import { isSkuSelectable } from './skuSelection'
import SortableCard from './SortableCard'

function applyDbOrder(skus) {
  return [...skus].sort((a, b) => {
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
}

// One supplier+season group — extracted out of SKUGrid.jsx so it can be mounted/unmounted
// independently by Virtuoso as the group scrolls in/out of view. All the drag-and-drop
// (@dnd-kit) logic here is unchanged from before the extraction: each group owns its own
// DndContext/SortableContext with every one of its own SKUs mounted, which is what dnd-kit
// requires — virtualization only ever windows whole groups like this one, never individual
// cards inside an active drag context.
export default function SKUGroupSection({
  supplier, season, buyerKey, buyerName, rawSkus, role, canDrag, sensors,
  localOrder, onReorder, onEdit, onCardClick, onEditImage, duplicateProductionSkuIds,
  priority = false,
}) {
  // Subscribed here (not in the parent list) so a selection change only re-renders the
  // group headers currently mounted in the viewport, not every group in the catalog.
  const selectedIds = usePlmStore(s => s.selectedIds)
  const selectBatch  = usePlmStore(s => s.selectBatch)

  // Groups are now split by buyer upstream (usePLMFiltered), so every SKU here already
  // shares the same buyer — buyerName is passed straight through rather than re-derived.
  const key        = `${supplier}|||${season}|||${buyerKey}`
  // Carries SKU order across re-renders of this same group so a background data refresh
  // (e.g. the admin-overlay catalog landing more SKUs into this group after the early-paint
  // set already rendered) doesn't reposition already-visible cards — a real CLS driver,
  // confirmed via Lighthouse's "layout shift culprits" pointing at a single repositioned
  // card. Already-seen SKUs keep their slot; genuinely new ones append at the end.
  const stableSkuOrderRef = useRef([])
  const sortedSkus = useMemo(() => {
    const fresh = applyDbOrder(rawSkus)
    const byId  = new Map(rawSkus.map(s => [s.id, s]))
    const carried = stableSkuOrderRef.current.filter(id => byId.has(id)).map(id => byId.get(id))
    const seen    = new Set(carried.map(s => s.id))
    const result  = [...carried, ...fresh.filter(s => !seen.has(s.id))]
    stableSkuOrderRef.current = result.map(s => s.id)
    return result
  }, [rawSkus])
  // If a local drag has happened this session, honour that order until the store re-fetches
  const batchIds  = localOrder[key] ?? sortedSkus.map(s => s.id)
  const idIndex   = Object.fromEntries(batchIds.map((id, i) => [id, i]))
  const batchSkus = [...sortedSkus].sort((a, b) => (idIndex[a.id] ?? 9999) - (idIndex[b.id] ?? 9999))

  // Only SKUs that are individually selectable (per isSkuSelectable) count toward "select all
  // in this batch" — previously this blindly selected every id in the group regardless of
  // role/read-only status, so e.g. an admin viewing another merchant's read-only SKUs (or a
  // buyer's SKUs with no workspace yet) could select them via this header even though the
  // per-card checkbox correctly hides for those same SKUs.
  const selectableIds = batchSkus.filter(sku => isSkuSelectable(sku, role)).map(sku => sku.id)
  const allChecked  = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id))
  const someChecked = !allChecked && selectableIds.some(id => selectedIds.has(id))
  const batchBuyer  = (role === 'merchant' || role === 'supplier') ? buyerName : null

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const currentIds = localOrder[key] ?? sortedSkus.map(s => s.id)
    const oldIdx = currentIds.indexOf(active.id)
    const newIdx = currentIds.indexOf(over.id)
    if (oldIdx === -1 || newIdx === -1) return
    onReorder(key, arrayMove(currentIds, oldIdx, newIdx))
  }

  return (
    <div className="mb-6">
      {role === 'supplier' ? (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[9px] font-bold uppercase tracking-[.06em] text-black/60">
            {season}{batchBuyer ? ` · ${batchBuyer}` : ''}
          </span>
          <span className="text-[9px] font-semibold tabular-nums text-black/45">
            {batchSkus.length}
          </span>
        </div>
      ) : (role === 'merchant' || role === 'buyer') && selectableIds.length === 0 ? (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[9px] font-bold uppercase tracking-[.06em] text-black/60">
            {supplier} · {season}{batchBuyer ? ` · ${batchBuyer}` : ''}
          </span>
          <span className="text-[9px] font-semibold tabular-nums text-black/45">
            {batchSkus.length}
          </span>
        </div>
      ) : (role === 'merchant' || role === 'buyer') && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); selectBatch(selectableIds) }}
          className="flex items-center gap-1.5 mb-2 cursor-pointer border-none bg-none group/batch"
        >
          <span className={`w-3 h-3 border flex-shrink-0 flex items-center justify-center transition-colors
            ${allChecked  ? 'bg-[#1A1A18] border-[#1A1A18]'
            : someChecked ? 'bg-black/20 border-black/20'
            :               'border-black/25 group-hover/batch:border-black/50'}`}
          >
            {allChecked && (
              <svg width="7" height="7" viewBox="0 0 10 10" fill="none">
                <polyline points="1.5 5 4 7.5 8.5 2.5" stroke="#F5F3EF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {someChecked && <span className="w-1.5 h-px bg-white" />}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-[.06em] text-black/60 group-hover/batch:text-black/75 transition-colors">
            {supplier} · {season}{batchBuyer ? ` · ${batchBuyer}` : ''}
          </span>
          <span className="text-[9px] font-semibold tabular-nums text-black/45">
            {batchSkus.length}
          </span>
        </button>
      )}

      {canDrag ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={batchIds} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3 sm:gap-4">
              {batchSkus.map((sku, idx) => (
                <SortableCard key={sku.id} sku={sku} role={role} onEdit={onEdit} onCardClick={onCardClick} onEditImage={onEditImage} isDuplicateLink={!!sku.production_sku_id && duplicateProductionSkuIds.has(sku.production_sku_id)} priority={priority && idx < 4} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3 sm:gap-4">
          {batchSkus.map((sku, idx) => (
            <SKUCard key={sku.id} sku={sku} role={role} onEdit={onEdit} onCardClick={onCardClick} onEditImage={onEditImage} isDuplicateLink={!!sku.production_sku_id && duplicateProductionSkuIds.has(sku.production_sku_id)} priority={priority && idx < 4} />
          ))}
        </div>
      )}
    </div>
  )
}