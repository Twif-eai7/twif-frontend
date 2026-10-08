import { useState } from 'react'
import { Bookmark, Trash2 } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { PmIcon, IconButton } from '../shared/PmUi'

export default function SavedFiltersDropdown({ projectId }) {
  const savedFilters = usePmStore(s => s.savedFilters)
  const saveFilter = usePmStore(s => s.saveFilter)
  const deleteSavedFilter = usePmStore(s => s.deleteSavedFilter)
  const applySavedFilter = usePmStore(s => s.applySavedFilter)
  const filters = usePmStore(s => s.filters)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !projectId) return
    setSaving(true)
    try {
      await saveFilter(projectId, name.trim(), filters)
      setName('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium border border-stone-200 bg-white text-stone-600 hover:border-stone-300"
      >
        <PmIcon icon={Bookmark} size={12} />
        Saved{savedFilters.length ? ` (${savedFilters.length})` : ''}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-30 w-64 bg-white border border-stone-200 rounded-lg shadow-lg p-2 space-y-2">
            <div className="flex gap-1.5">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                placeholder="Name this filter…"
                className="flex-1 text-[11px] border border-stone-200 rounded-md px-2 py-1.5 outline-none focus:border-[#4d68f0]"
              />
              <button
                type="button"
                disabled={saving || !name.trim()}
                onClick={handleSave}
                className="text-[11px] px-2 py-1.5 bg-[#4d68f0] text-white rounded-md disabled:opacity-40"
              >
                Save
              </button>
            </div>
            {savedFilters.length === 0 ? (
              <p className="text-[11px] text-stone-400 px-1 py-2">No saved filters yet.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {savedFilters.map(row => (
                  <div key={row.id} className="flex items-center gap-1 group">
                    <button
                      type="button"
                      onClick={() => { applySavedFilter(row); setOpen(false) }}
                      className="flex-1 text-left text-[11px] px-2 py-1.5 rounded-md hover:bg-stone-50 text-stone-700 truncate"
                    >
                      {row.name}
                    </button>
                    <IconButton
                      icon={Trash2}
                      title="Delete"
                      danger
                      className="opacity-0 group-hover:opacity-100 w-6 h-6"
                      size={12}
                      onClick={() => deleteSavedFilter(projectId, row.id)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
