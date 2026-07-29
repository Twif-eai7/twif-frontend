import { useMemo } from 'react'
import { usePlmStore, getCategoryDescendantIds } from '../../stores/plmStore'

export default function PLMMobileCategoryBar({ skus }) {
  const categories = usePlmStore(s => s.categories)
  const category   = usePlmStore(s => s.filters.category)
  const setFilter  = usePlmStore(s => s.setFilter)

  const countMap = useMemo(() => {
    const map = {}
    categories.forEach(c => {
      const ids = getCategoryDescendantIds(categories, c.id)
      map[c.id] = skus.filter(s => s.category_id && ids.has(s.category_id)).length
    })
    return map
  }, [categories, skus])

  const rootNodes = categories.filter(c => !c.parent_id && (countMap[c.id] || 0) > 0)
  if (!rootNodes.length) return null

  const findAncestors = (catId, acc = []) => {
    const cat = categories.find(c => c.id === catId)
    if (!cat) return acc
    acc.unshift(cat)
    return cat.parent_id ? findAncestors(cat.parent_id, acc) : acc
  }

  const ancestors = category !== 'all' ? findAncestors(category) : []
  const activeRoot = ancestors[0] ?? null
  const subNodes = activeRoot
    ? categories.filter(c => c.parent_id === activeRoot.id && (countMap[c.id] || 0) > 0)
    : []

  const pill = (id, label, active) => (
    <button
      key={id}
      type="button"
      onClick={() => setFilter('category', id)}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[.06em] border transition-colors whitespace-nowrap ${
        active
          ? 'bg-[#1A1A18] text-white border-[#1A1A18]'
          : 'bg-white border-black/20 text-[#1A1A18]/65 hover:border-black/40'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="md:hidden flex-shrink-0 flex flex-col gap-1.5 px-2.5 pb-2">
      {/* Root category row */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
        {pill('all', `All · ${skus.length}`, category === 'all')}
        {rootNodes.map(n => pill(n.id, `${n.name} · ${countMap[n.id]}`, activeRoot?.id === n.id))}
      </div>

      {/* Sub-category row — appears when a root with children is selected */}
      {subNodes.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 pl-1" style={{ scrollbarWidth: 'none' }}>
          {pill(activeRoot.id, `All ${activeRoot.name}`, category === activeRoot.id)}
          {subNodes.map(n => pill(n.id, `${n.name} · ${countMap[n.id]}`, category === n.id))}
        </div>
      )}
    </div>
  )
}
