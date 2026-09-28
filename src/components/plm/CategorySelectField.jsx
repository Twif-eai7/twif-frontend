import { useEffect, useRef } from 'react'
import { useCategorySelect } from '../../hooks/useCategorySelect'
import CategorySelect from './CategorySelect'

// Self-contained wrapper — owns cascading state, calls onChange(id) on deepest selection change
export default function CategorySelectField({ onChange, initialCategoryId, hideLabel = false }) {
  const { categoryLevels, categorySelections, catLoading, handleCategorySelect, deepestCategory } = useCategorySelect(initialCategoryId)

  // Fires onChange off the hook's own state once it settles, instead of hand-recomputing the
  // leaf from `categorySelections` captured in this closure at click-time — that value is
  // whatever it was when the onChange *handler* was created, not necessarily what
  // handleCategorySelect's own state updates (after its awaited child-category fetch) end up
  // as, if the consuming component re-renders this whole tree in between (e.g. BulkEditModal's
  // "Category for all" applies the pick to every SKU's edits state in one go — a much bigger
  // update than a single per-SKU pick, making any such timing gap far more likely to matter).
  // The very first settle (loading finishing, whether hydrated from initialCategoryId or blank)
  // is deliberately NOT reported — that's hydration, not a user change, and the caller already
  // has that value; only real picks from here on fire onChange, matching the old behavior.
  const prevLeafId  = useRef(undefined)
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (catLoading) return
    const leafId = deepestCategory?.id || null
    if (!hydratedRef.current) {
      hydratedRef.current = true
      prevLeafId.current = leafId
      return
    }
    if (leafId === prevLeafId.current) return
    prevLeafId.current = leafId
    onChange(leafId, deepestCategory?.name || null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepestCategory?.id, catLoading])

  return (
    <div className="flex flex-col gap-0.5">
      {!hideLabel && (
        <div className="flex items-center min-w-0">
          <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55 flex-shrink-0">Category</span>
          {deepestCategory && (
            <span className="ml-1.5 normal-case font-normal text-black/40 text-[9px] truncate min-w-0">
              → {categorySelections.map(s => s.name).join(' › ')}
            </span>
          )}
        </div>
      )}
      <CategorySelect
        categoryLevels={categoryLevels}
        categorySelections={categorySelections}
        catLoading={catLoading}
        onSelect={handleCategorySelect}
      />
    </div>
  )
}
