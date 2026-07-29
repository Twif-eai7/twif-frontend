import { useState, useCallback, useMemo } from 'react'
import {
  DndContext, closestCenter,
  MouseSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
import { usePlmStore } from '../../stores/plmStore'
import SKUCard from './SKUCard'
import SortableCard from './SortableCard'

function gk(supplier, season) { return `${supplier}|||${season}` }

function sortSeasons(seasons) {
  return [...seasons].sort((a, b) => {
    if (a === 'No Season') return 1
    if (b === 'No Season') return -1
    const parse = s => ({ type: s.slice(0, 2), year: parseInt(s.slice(2)) || 0 })
    const A = parse(a), B = parse(b)
    if (A.year !== B.year) return B.year - A.year
    return A.type === 'SS' ? -1 : 1
  })
}

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

export default function SKUGrid({ grouped, supplierOrder, role, onEdit, onCardClick, onEditImage }) {
  const selectedIds   = usePlmStore(s => s.selectedIds)
  const selectBatch   = usePlmStore(s => s.selectBatch)
  const reorderSkus   = usePlmStore(s => s.reorderSkus)
  const [collapsedSuppliers, setCollapsedSuppliers] = useState(() => new Set())
  // localOrder mirrors the sorted IDs per group for optimistic drag feedback
  const [localOrder, setLocalOrder] = useState({})

  const duplicateProductionSkuIds = useMemo(() => {
    const counts = new Map()
    Object.values(grouped).forEach(seasons =>
      Object.values(seasons).forEach(skus =>
        skus.forEach(s => {
          if (s.production_sku_id)
            counts.set(s.production_sku_id, (counts.get(s.production_sku_id) || 0) + 1)
        })
      )
    )
    const dupes = new Set()
    counts.forEach((n, id) => { if (n > 1) dupes.add(id) })
    return dupes
  }, [grouped])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,  { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  const handleDragEnd = useCallback((event, key, sortedSkus) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const currentIds = localOrder[key] ?? sortedSkus.map(s => s.id)
    const oldIdx = currentIds.indexOf(active.id)
    const newIdx = currentIds.indexOf(over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const newIds = arrayMove(currentIds, oldIdx, newIdx)
    setLocalOrder(prev => ({ ...prev, [key]: newIds }))
    reorderSkus(newIds)
  }, [localOrder, reorderSkus])

  const toggleSupplier = (sup) =>
    setCollapsedSuppliers(prev => {
      const next = new Set(prev)
      next.has(sup) ? next.delete(sup) : next.add(sup)
      return next
    })

  if (!Object.keys(grouped).length) {
    return (
      <div className="text-center py-16 text-[10px] font-bold uppercase tracking-[.1em] text-black/85">
        No SKUs match filters.
      </div>
    )
  }

  const order = supplierOrder || Object.keys(grouped)
  const canDrag = role === 'merchant'

  return (
    <div>
      {order.map(supplier => {
        const seasons = grouped[supplier]
        const isOpen  = !collapsedSuppliers.has(supplier)

        return (
          <div key={supplier} className="mb-10">
            {isOpen && sortSeasons(Object.keys(seasons)).map(season => {
              const key        = gk(supplier, season)
              const rawSkus    = seasons[season]
              const sortedSkus = applyDbOrder(rawSkus)
              // If a local drag has happened this session, honour that order until the store re-fetches
              const batchIds   = localOrder[key] ?? sortedSkus.map(s => s.id)
              const idIndex    = Object.fromEntries(batchIds.map((id, i) => [id, i]))
              const batchSkus  = [...sortedSkus].sort((a, b) => (idIndex[a.id] ?? 9999) - (idIndex[b.id] ?? 9999))

              const allChecked  = batchIds.every(id => selectedIds.has(id))
              const someChecked = !allChecked && batchIds.some(id => selectedIds.has(id))
              const buyerNames  = [...new Set(rawSkus.map(s => s.upload_buyer_org_name || s.buyer_org_name).filter(Boolean))]
              const batchBuyer  = (role === 'merchant' || role === 'supplier') && buyerNames.length === 1 ? buyerNames[0] : null

              return (
                <div key={season} className="mb-6">
                  {role === 'supplier' ? (
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-[9px] font-bold uppercase tracking-[.06em] text-black/40">
                        {season}{batchBuyer ? ` · ${batchBuyer}` : ''}
                      </span>
                      <span className="text-[9px] font-semibold tabular-nums text-black/25">
                        {batchSkus.length}
                      </span>
                    </div>
                  ) : (role === 'merchant' || role === 'buyer') && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); selectBatch(batchIds) }}
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
                      <span className="text-[9px] font-bold uppercase tracking-[.06em] text-black/40 group-hover/batch:text-black/60 transition-colors">
                        {supplier} · {season}{batchBuyer ? ` · ${batchBuyer}` : ''}
                      </span>
                      <span className="text-[9px] font-semibold tabular-nums text-black/25">
                        {batchSkus.length}
                      </span>
                    </button>
                  )}

                  {canDrag ? (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={e => handleDragEnd(e, key, sortedSkus)}
                    >
                      <SortableContext items={batchIds} strategy={rectSortingStrategy}>
                        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
                          {batchSkus.map(sku => (
                            <SortableCard key={sku.id} sku={sku} role={role} onEdit={onEdit} onCardClick={onCardClick} onEditImage={onEditImage} isDuplicateLink={!!sku.production_sku_id && duplicateProductionSkuIds.has(sku.production_sku_id)} />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
                      {batchSkus.map(sku => (
                        <SKUCard key={sku.id} sku={sku} role={role} onEdit={onEdit} onCardClick={onCardClick} onEditImage={onEditImage} isDuplicateLink={!!sku.production_sku_id && duplicateProductionSkuIds.has(sku.production_sku_id)} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
