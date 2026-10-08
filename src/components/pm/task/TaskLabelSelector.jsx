import { useState, useRef, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { PmIcon } from '../shared/PmUi'

const PRESET_LABELS = [
  'urgent', 'bug', 'feature', 'design', 'review', 'blocked',
  'in-review', 'QC', 'sourcing', 'logistics', 'finance', 'tech',
]

const LABEL_COLORS = {
  urgent: 'bg-red-100 text-red-600',
  bug: 'bg-orange-100 text-orange-600',
  feature: 'bg-blue-100 text-blue-600',
  design: 'bg-purple-100 text-purple-600',
  review: 'bg-amber-100 text-amber-600',
  blocked: 'bg-red-100 text-red-700',
  'in-review': 'bg-indigo-100 text-indigo-600',
  QC: 'bg-emerald-100 text-emerald-600',
  sourcing: 'bg-teal-100 text-teal-600',
  logistics: 'bg-cyan-100 text-cyan-600',
  finance: 'bg-green-100 text-green-700',
  tech: 'bg-slate-100 text-slate-600',
}

export function LabelBadge({ label, onRemove }) {
  const cls = LABEL_COLORS[label] || 'bg-stone-100 text-stone-600'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium ${cls}`}>
      {label}
      {onRemove && (
        <button type="button" onClick={() => onRemove(label)} className="ml-0.5 hover:opacity-70">
          <PmIcon icon={X} size={9} />
        </button>
      )}
    </span>
  )
}

export default function TaskLabelSelector({ task }) {
  const updateTask = usePmStore(s => s.updateTask)
  const [open, setOpen]       = useState(false)
  const [custom, setCustom]   = useState('')
  const ref = useRef()

  useEffect(() => {
    if (!open) return
    const handler = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const labels = task.labels || []

  const toggle = async (label) => {
    const next = labels.includes(label)
      ? labels.filter(l => l !== label)
      : [...labels, label]
    await updateTask(task.id, { labels: next })
  }

  const addCustom = async () => {
    const l = custom.trim()
    if (!l || labels.includes(l)) { setCustom(''); return }
    await updateTask(task.id, { labels: [...labels, l] })
    setCustom('')
  }

  return (
    <div className="relative" ref={ref}>
      {/* Trigger — shows current labels + add button */}
      <div className="flex flex-wrap items-center gap-1">
        {labels.map(l => (
          <LabelBadge key={l} label={l} onRemove={lbl => toggle(lbl)} />
        ))}
        <button
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full border border-dashed border-stone-300 text-[10px] text-stone-400 hover:text-stone-600 hover:border-stone-400 transition-colors"
        >
          <PmIcon icon={Plus} size={10} /> Label
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-52 bg-white rounded-lg border border-stone-200 shadow-lg overflow-hidden">
          <div className="p-2 flex flex-wrap gap-1">
            {PRESET_LABELS.map(l => (
              <button
                key={l}
                onClick={() => toggle(l)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all ${
                  labels.includes(l)
                    ? (LABEL_COLORS[l] || 'bg-stone-200 text-stone-700') + ' ring-1 ring-offset-1 ring-current'
                    : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Custom label */}
          <div className="border-t border-stone-100 p-2 flex items-center gap-1.5">
            <input
              value={custom}
              onChange={e => setCustom(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCustom() }}
              placeholder="Custom label…"
              className="flex-1 text-[11px] px-2 py-1 rounded-lg bg-stone-50 border border-stone-200 outline-none focus:border-[#4d68f0] placeholder-stone-400"
            />
            <button
              onClick={addCustom}
              disabled={!custom.trim()}
              className="text-[10px] px-2 py-1 bg-[#4d68f0] text-white rounded-lg disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
