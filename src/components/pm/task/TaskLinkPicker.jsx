import { useEffect, useState } from 'react'
import { Link } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { PCT_STAGE_OPTIONS } from '../shared/pmConstants'
import { FieldLabel, SegControl, inputClass } from '../shared/PmUi'

const TABS = [
  { key: 'po', label: 'PO' },
  { key: 'workspace', label: 'SKU' },
  { key: 'inspection', label: 'QC' },
  { key: 'pct', label: 'PCT' },
]

function SearchBox({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputClass}
    />
  )
}

export default function TaskLinkPicker({ task }) {
  const updateTask = usePmStore(s => s.updateTask)
  const searchPos = usePmStore(s => s.searchPos)
  const searchWorkspaces = usePmStore(s => s.searchWorkspaces)
  const searchInspections = usePmStore(s => s.searchInspections)
  const [tab, setTab] = useState('po')
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (tab === 'pct') return
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const rows = tab === 'po'
          ? await searchPos(q)
          : tab === 'workspace'
            ? await searchWorkspaces(q)
            : await searchInspections(q)
        if (!cancelled) setResults(rows || [])
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [tab, q, searchPos, searchWorkspaces, searchInspections])

  const setLink = (patch) => updateTask(task.id, patch)

  return (
    <div className="space-y-2">
      <FieldLabel icon={Link}>Linked records</FieldLabel>
      <SegControl
        value={tab}
        onChange={(key) => { setTab(key); setQ(''); setResults([]) }}
        options={TABS}
      />

      {tab !== 'pct' && (
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder={tab === 'po' ? 'Search PO number…' : tab === 'workspace' ? 'Search buyer ref…' : 'Search PO, SKU, or report…'}
        />
      )}

      {tab === 'pct' ? (
        <div className="flex flex-wrap gap-1">
          {PCT_STAGE_OPTIONS.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setLink({ linked_pct_stage: task.linked_pct_stage === s.id ? null : s.id })}
              className={`px-2 py-1 rounded-md text-[10px] border ${
                task.linked_pct_stage === s.id ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-white text-stone-600 border-stone-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : loading ? (
        <p className="text-[11px] text-stone-400 py-2">Searching…</p>
      ) : (
        <div className="max-h-36 overflow-y-auto space-y-0.5">
          {results.map(row => {
            const selected = tab === 'po'
              ? task.linked_po_id === row.id
              : tab === 'workspace'
                ? task.linked_workspace_id === row.id
                : task.linked_inspection_id === row.id
            const label = tab === 'po'
              ? `${row.po_number}${row.buyer ? ` · ${row.buyer}` : ''}`
              : tab === 'workspace'
                ? `${row.buyer_ref || 'Workspace'}${row.sku_code ? ` · ${row.sku_code}` : ''}`
                : `${row.inspection_type || 'Inspection'}${row.po_number ? ` · ${row.po_number}` : ''}${row.sku ? ` · ${row.sku}` : ''}`
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  if (tab === 'po') setLink({ linked_po_id: selected ? null : row.id })
                  if (tab === 'workspace') setLink({ linked_workspace_id: selected ? null : row.id })
                  if (tab === 'inspection') setLink({
                    linked_inspection_id: selected ? null : row.id,
                    linked_po_id: row.po_id || task.linked_po_id,
                  })
                }}
                className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] ${selected ? 'bg-blue-50 text-[#4d68f0]' : 'hover:bg-stone-50 text-stone-700'}`}
              >
                {label}
              </button>
            )
          })}
          {!results.length && <p className="text-[11px] text-stone-400 px-1 py-2">No matches.</p>}
        </div>
      )}
    </div>
  )
}
