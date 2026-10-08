import { useMemo, useState } from 'react'
import { Search, Users, Tag } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { PRIORITY_CONFIG } from '../shared/PriorityIcon'
import { DUE_PRESETS } from '../shared/pmConstants'
import SavedFiltersDropdown from './SavedFiltersDropdown'
import { PmIcon } from '../shared/PmUi'

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 px-2 rounded-md text-[11px] font-medium border transition-colors ${
        active ? 'bg-[#4d68f0] text-white border-[#4d68f0]' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
      }`}
    >
      {children}
    </button>
  )
}

export default function ProjectFilters({ projectId }) {
  const filters = usePmStore(s => s.filters)
  const setFilters = usePmStore(s => s.setFilters)
  const resetFilters = usePmStore(s => s.resetFilters)
  const members = usePmStore(s => s.projectMembers)
  const columns = usePmStore(s => s.columns)
  const [showPeople, setShowPeople] = useState(false)
  const [showLabels, setShowLabels] = useState(false)

  const labels = useMemo(() => {
    const set = new Set()
    for (const col of columns || []) {
      for (const t of col.tasks || []) {
        for (const l of t.labels || []) set.add(l)
      }
    }
    return [...set].sort()
  }, [columns])

  const toggleArr = (key, value) => {
    const cur = filters[key] || []
    setFilters({ [key]: cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value] })
  }

  const activeCount = (filters.assignees?.length || 0) + (filters.priorities?.length || 0) +
    (filters.labels?.length || 0) + (filters.duePreset ? 1 : 0) + (filters.search ? 1 : 0) + (filters.overdue ? 1 : 0)

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="flex flex-wrap gap-1">
        {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
          <Chip key={k} active={filters.priorities?.includes(k)} onClick={() => toggleArr('priorities', k)}>
            {v.label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {DUE_PRESETS.map(p => (
          <Chip
            key={p.key}
            active={filters.duePreset === p.key}
            onClick={() => setFilters({ duePreset: filters.duePreset === p.key ? null : p.key, overdue: false })}
          >
            {p.label}
          </Chip>
        ))}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowPeople(o => !o)}
          className={`inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium border ${filters.assignees?.length ? 'border-[#4d68f0] text-[#4d68f0] bg-blue-50' : 'border-stone-200 text-stone-600 bg-white'}`}
        >
          <PmIcon icon={Users} size={12} />
          Assignees{filters.assignees?.length ? ` (${filters.assignees.length})` : ''}
        </button>
        {showPeople && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowPeople(false)} />
            <div className="absolute left-0 top-8 z-30 w-56 bg-white border border-stone-200 rounded-lg shadow-lg p-1.5 max-h-56 overflow-y-auto">
              {(members || []).length === 0 && <p className="text-[11px] text-stone-400 px-2 py-2">No members</p>}
              {(members || []).map(m => {
                const id = m.member_id || m.id
                return (
                  <label key={id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-stone-50 text-[11px] text-stone-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.assignees?.includes(id)}
                      onChange={() => toggleArr('assignees', id)}
                      className="accent-[#4d68f0]"
                    />
                    {m.full_name || m.email || 'Member'}
                  </label>
                )
              })}
            </div>
          </>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowLabels(o => !o)}
          className={`inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium border ${filters.labels?.length ? 'border-[#4d68f0] text-[#4d68f0] bg-blue-50' : 'border-stone-200 text-stone-600 bg-white'}`}
        >
          <PmIcon icon={Tag} size={12} />
          Labels{filters.labels?.length ? ` (${filters.labels.length})` : ''}
        </button>
        {showLabels && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowLabels(false)} />
            <div className="absolute left-0 top-8 z-30 w-48 bg-white border border-stone-200 rounded-lg shadow-lg p-1.5 max-h-56 overflow-y-auto">
              {labels.length === 0 && <p className="text-[11px] text-stone-400 px-2 py-2">No labels on this board</p>}
              {labels.map(l => (
                <label key={l} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-stone-50 text-[11px] text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.labels?.includes(l)}
                    onChange={() => toggleArr('labels', l)}
                    className="accent-[#4d68f0]"
                  />
                  {l}
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 px-2 h-7 rounded-md">
        <PmIcon icon={Search} size={12} className="text-stone-400" />
        <input
          value={filters.search || ''}
          onChange={e => setFilters({ search: e.target.value })}
          placeholder="Filter tasks…"
          className="bg-transparent text-[11px] text-stone-700 outline-none placeholder-stone-400 w-28"
        />
      </div>

      {activeCount > 0 && (
        <button type="button" onClick={resetFilters} className="text-[11px] text-stone-400 hover:text-stone-600 px-1">
          Clear
        </button>
      )}

      <div className="ml-auto">
        <SavedFiltersDropdown projectId={projectId} />
      </div>
    </div>
  )
}
