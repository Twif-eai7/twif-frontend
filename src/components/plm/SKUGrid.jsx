import { useState, useCallback, useMemo } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { usePlmStore } from '../../stores/plmStore'
import SKUGroupSection from './SKUGroupSection'

function gk(supplier, season, buyerKey) { return `${supplier}|||${season}|||${buyerKey}` }

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

// Buyer sub-groups within a supplier+season are ordered alphabetically by name, with
// no-buyer SKUs trailing — matches sortSeasons' "unknowns last" convention.
function sortBuyerKeys(byBuyer) {
  return Object.keys(byBuyer).sort((a, b) => {
    const nameA = byBuyer[a].buyerName, nameB = byBuyer[b].buyerName
    if (!nameA && !nameB) return 0
    if (!nameA) return 1
    if (!nameB) return -1
    return nameA.localeCompare(nameB)
  })
}

// A persistent, always-visible header row per supplier — the sole entry point for collapsing
// a supplier's SKUs out of view. This used to be dead code (collapsedSuppliers/toggleSupplier
// existed but no button called it, so every supplier rendered fully expanded always); it's now
// required so a collapsed supplier can contribute one row instead of N group rows to the
// virtualized row list below.
function SupplierHeaderRow({ supplier, isOpen, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(supplier)}
      className="group flex items-center gap-1.5 w-full text-left pt-3 pb-2 cursor-pointer border-none bg-none"
    >
      <span className="flex items-center justify-center w-4 h-4 rounded border border-black/20 text-[#1A1A18] flex-shrink-0 group-hover:border-black/50 group-hover:bg-black/[.04] transition-colors">
        <svg
          width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}
        >
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </span>
      <span className="text-[11px] font-extrabold uppercase tracking-[.04em] text-[#1A1A18]">{supplier}</span>
      <span className="flex-1 flex items-center gap-2 ml-2">
        <span className="flex-1 h-px bg-black/25 group-hover:bg-black/45 transition-colors" />
        <span className="text-[9px] font-bold uppercase tracking-[.08em] text-[#1A1A18] group-hover:opacity-70 transition-opacity">{isOpen ? 'Collapse' : 'Expand'}</span>
        <span className="flex-1 h-px bg-black/25 group-hover:bg-black/45 transition-colors" />
      </span>
    </button>
  )
}

export default function SKUGrid({ grouped, supplierOrder, role, onEdit, onCardClick, onEditImage, scrollParent }) {
  const reorderSkus = usePlmStore(s => s.reorderSkus)
  const [collapsedSuppliers, setCollapsedSuppliers] = useState(() => new Set())
  // localOrder mirrors the sorted IDs per group for optimistic drag feedback
  const [localOrder, setLocalOrder] = useState({})

  const duplicateProductionSkuIds = useMemo(() => {
    const counts = new Map()
    Object.values(grouped).forEach(seasons =>
      Object.values(seasons).forEach(byBuyer =>
        Object.values(byBuyer).forEach(({ skus }) =>
          skus.forEach(s => {
            if (s.production_sku_id)
              counts.set(s.production_sku_id, (counts.get(s.production_sku_id) || 0) + 1)
          })
        )
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

  const handleReorder = useCallback((key, newIds) => {
    setLocalOrder(prev => ({ ...prev, [key]: newIds }))
    reorderSkus(newIds)
  }, [reorderSkus])

  const toggleSupplier = useCallback((sup) => {
    setCollapsedSuppliers(prev => {
      const next = new Set(prev)
      next.has(sup) ? next.delete(sup) : next.add(sup)
      return next
    })
  }, [])

  const order = supplierOrder || Object.keys(grouped)
  const canDrag = role === 'merchant'

  // Flattened, Virtuoso-friendly row list — one row per supplier header, one per
  // supplier+season group. This is what actually gets virtualized: Virtuoso only ever mounts
  // the rows near the viewport, so a collapsed/scrolled-away supplier's SKU cards (and their
  // DndContext, for merchants) aren't in the DOM at all until scrolled near.
  const rows = useMemo(() => {
    const list = []
    order.forEach(supplier => {
      const seasons = grouped[supplier]
      if (!seasons) return
      const isOpen = !collapsedSuppliers.has(supplier)
      list.push({ type: 'supplier', supplier, isOpen })
      if (!isOpen) return
      sortSeasons(Object.keys(seasons)).forEach(season => {
        const byBuyer = seasons[season]
        sortBuyerKeys(byBuyer).forEach(buyerKey => {
          const { buyerName, skus: rawSkus } = byBuyer[buyerKey]
          if (!rawSkus || !rawSkus.length) return // defensive — see note in SKUGroupSection
          list.push({ type: 'group', key: gk(supplier, season, buyerKey), supplier, season, buyerKey, buyerName, rawSkus })
        })
      })
    })
    return list
  }, [grouped, order, collapsedSuppliers])

  if (!Object.keys(grouped).length) {
    return (
      <div className="text-center py-16 text-[10px] font-bold uppercase tracking-[.1em] text-black/85">
        No SKUs match filters.
      </div>
    )
  }

  // Wait for the real scroll container (PLMPage's scrollParent div) to exist before mounting
  // Virtuoso — it becomes non-null essentially immediately after mount (the ref callback fires
  // during commit, before paint), so this causes no visible flash. Mounting Virtuoso without a
  // real customScrollParent would fall back to its own internal scroller, which needs an
  // explicit height style to size itself correctly and isn't the container we actually want
  // (PLMPage's existing "scroll to top on filter change" logic targets this specific element).
  if (!scrollParent) return null

  return (
    <Virtuoso
      customScrollParent={scrollParent}
      data={rows}
      computeItemKey={(index, row) => row.type === 'supplier' ? `hdr:${row.supplier}` : row.key}
      itemContent={(index, row) => row.type === 'supplier' ? (
        <SupplierHeaderRow supplier={row.supplier} isOpen={row.isOpen} onToggle={toggleSupplier} />
      ) : (
        <SKUGroupSection
          supplier={row.supplier}
          season={row.season}
          buyerKey={row.buyerKey}
          buyerName={row.buyerName}
          rawSkus={row.rawSkus}
          // Only the very first Virtuoso row is above the fold on initial paint — its
          // first couple of cards are the actual LCP candidates. Everything else stays
          // loading="lazy" as before.
          priority={index === 0}
          role={role}
          canDrag={canDrag}
          sensors={sensors}
          localOrder={localOrder}
          onReorder={handleReorder}
          onEdit={onEdit}
          onCardClick={onCardClick}
          onEditImage={onEditImage}
          duplicateProductionSkuIds={duplicateProductionSkuIds}
        />
      )}
    />
  )
}