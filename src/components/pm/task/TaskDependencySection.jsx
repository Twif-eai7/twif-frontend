import { useEffect, useState } from 'react'
import { GitBranch, Lock, CircleCheck, Hourglass, Trash2 } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { FieldLabel, IconButton, PmIcon, inputClass } from '../shared/PmUi'

export default function TaskDependencySection({ task }) {
  const addDependency = usePmStore(s => s.addDependency)
  const removeDependency = usePmStore(s => s.removeDependency)
  const openTask = usePmStore(s => s.openTask)
  const searchProjectTasks = usePmStore(s => s.searchProjectTasks)
  const projectId = usePmStore(s => s.activeProjectId)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState([])
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('blocked_by')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!q.trim() || !projectId) { setHits([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const rows = await searchProjectTasks(projectId, q.trim())
        if (!cancelled) setHits((Array.isArray(rows) ? rows : []).filter(r => r.id !== task.id).slice(0, 8))
      } catch {
        if (!cancelled) setHits([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 220)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, projectId, task.id, searchProjectTasks])

  const blocking = task.blocking || []
  const blocked = task.blocked || []

  const add = async (other) => {
    setError('')
    try {
      await addDependency(task.id, mode === 'blocked_by'
        ? { blocking_task_id: other.id }
        : { blocked_task_id: other.id })
      setQ('')
      setHits([])
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-2">
      <FieldLabel icon={GitBranch}>Dependencies</FieldLabel>

      {task.is_blocked && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
          Locked until blocking tasks are done.
        </p>
      )}

      {blocking.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-stone-400">Blocked by</p>
          {blocking.map(d => (
            <div key={d.id} className="flex items-center gap-2 text-[12px] bg-stone-50 rounded-md px-2 py-1.5">
              <PmIcon icon={d.completed_at ? CircleCheck : Lock} size={12} className={d.completed_at ? 'text-emerald-500' : 'text-amber-500'} />
              <button type="button" onClick={() => openTask(d.task_id)} className="flex-1 text-left truncate hover:text-[#4d68f0]">
                {d.title}
              </button>
              <IconButton icon={Trash2} title="Remove" danger size={12} className="w-6 h-6" onClick={() => removeDependency(task.id, d.id)} />
            </div>
          ))}
        </div>
      )}

      {blocked.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-stone-400">Blocks</p>
          {blocked.map(d => (
            <div key={d.id} className="flex items-center gap-2 text-[12px] bg-stone-50 rounded-md px-2 py-1.5">
              <PmIcon icon={d.completed_at ? CircleCheck : Hourglass} size={12} className={d.completed_at ? 'text-emerald-500' : 'text-stone-400'} />
              <button type="button" onClick={() => openTask(d.task_id)} className="flex-1 text-left truncate hover:text-[#4d68f0]">
                {d.title}
              </button>
              <IconButton icon={Trash2} title="Remove" danger size={12} className="w-6 h-6" onClick={() => removeDependency(task.id, d.id)} />
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1">
        <button type="button" onClick={() => setMode('blocked_by')}
          className={`text-[10px] px-2 py-1 rounded-md border ${mode === 'blocked_by' ? 'bg-[#4d68f0] text-white border-[#4d68f0]' : 'border-stone-200 text-stone-500'}`}>
          Blocked by…
        </button>
        <button type="button" onClick={() => setMode('blocks')}
          className={`text-[10px] px-2 py-1 rounded-md border ${mode === 'blocks' ? 'bg-[#4d68f0] text-white border-[#4d68f0]' : 'border-stone-200 text-stone-500'}`}>
          Blocks…
        </button>
      </div>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search a task title…"
        className={inputClass}
      />
      {loading && <p className="text-[11px] text-stone-400">Searching…</p>}
      {error && <p className="text-[11px] text-red-500">{error}</p>}
      {hits.length > 0 && (
        <div className="border border-stone-100 rounded-lg overflow-hidden">
          {hits.map(h => (
            <button key={h.id} type="button" onClick={() => add(h)}
              className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-stone-50 text-stone-700">
              {h.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
