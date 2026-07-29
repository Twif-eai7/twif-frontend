import { useCategorySelect } from '../../hooks/useCategorySelect'
import CategorySelect from './CategorySelect'

// Self-contained wrapper — owns cascading state, calls onChange(id) on deepest selection change
export default function CategorySelectField({ onChange, initialCategoryId, hideLabel = false }) {
  const { categoryLevels, categorySelections, catLoading, handleCategorySelect, deepestCategory } = useCategorySelect(initialCategoryId)

  const handleSelect = async (levelIndex, id, name) => {
    await handleCategorySelect(levelIndex, id, name)
    const newSelections = [...categorySelections.slice(0, levelIndex)]
    if (id) newSelections[levelIndex] = { id, name }
    const leaf = newSelections.length ? newSelections[newSelections.length - 1] : null
    onChange(leaf?.id || null, leaf?.name || null)
  }

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
        onSelect={handleSelect}
      />
    </div>
  )
}
