const SELECT_CLS = 'px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none focus:border-black/60 flex-1 min-w-[120px]'

export default function CategorySelect({ categoryLevels, categorySelections, catLoading, onSelect }) {
  if (catLoading) return (
    <div className="text-[11px] text-black/40">Loading categories…</div>
  )

  return (
    // flex-wrap — cascading category/subcategory/sub-subcategory/... can run 4+ levels deep;
    // without wrapping, each level's min-w-[120px] select just kept extending the row
    // horizontally off the edge of the modal on narrow (mobile) screens, with nothing to
    // scroll it back into view. Wrapping drops the 4th+ level onto its own line instead.
    <div className="flex flex-wrap gap-1.5">
      {categoryLevels.map((options, levelIndex) => (
        <select
          key={levelIndex}
          className={SELECT_CLS}
          value={categorySelections[levelIndex]?.id || ''}
          onChange={e => {
            const opt = options.find(o => String(o.id) === e.target.value)
            onSelect(levelIndex, e.target.value, opt?.name || '')
          }}
        >
          <option value="">
            {levelIndex === 0 ? 'Select category…' : 'Select subcategory…'}
          </option>
          {options.map(o => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      ))}
    </div>
  )
}
