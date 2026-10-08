import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { ProjectGlyph, PmIcon } from './PmUi'

export default function ProjectSearch() {
  const navigate = useNavigate()
  const searchAll = usePmStore(s => s.searchAll)
  const hits = usePmStore(s => s.searchHits)
  const loading = usePmStore(s => s.searchLoading)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!q.trim()) return
    const t = setTimeout(() => { searchAll(q.trim()); setOpen(true) }, 220)
    return () => clearTimeout(t)
  }, [q, searchAll])

  const goProject = (id) => { setOpen(false); setQ(''); navigate(`/dashboard/projects/${id}`) }
  const goTask = (task) => { setOpen(false); setQ(''); navigate(`/dashboard/projects/${task.project_id}?task=${task.id}`) }

  return (
    <div className="relative w-full max-w-xs">
      <div className="flex items-center gap-2 h-8 px-2.5 border border-stone-200 rounded-md bg-white">
        <PmIcon icon={Search} size={13} className="text-stone-400 flex-shrink-0" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => q.trim() && setOpen(true)}
          placeholder="Search projects & tasks…"
          className="w-full text-[12px] outline-none bg-transparent text-stone-800 placeholder-stone-400"
        />
      </div>
      {open && q.trim() && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-9 z-30 bg-white border border-stone-200 rounded-lg shadow-lg max-h-72 overflow-y-auto p-1.5">
            {loading && <p className="text-[11px] text-stone-400 px-2 py-2">Searching…</p>}
            {!loading && !(hits.projects?.length || hits.tasks?.length) && (
              <p className="text-[11px] text-stone-400 px-2 py-2">No matches.</p>
            )}
            {hits.projects?.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-stone-400 uppercase tracking-wide px-2 py-1">Projects</p>
                {hits.projects.map(p => (
                  <button key={p.id} type="button" onClick={() => goProject(p.id)}
                    className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-md text-[12px] hover:bg-stone-50">
                    <ProjectGlyph name={p.emoji} color={p.color} size={18} />
                    {p.title}
                  </button>
                ))}
              </div>
            )}
            {hits.tasks?.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-stone-400 uppercase tracking-wide px-2 py-1 mt-1">Tasks</p>
                {hits.tasks.map(t => (
                  <button key={t.id} type="button" onClick={() => goTask(t)}
                    className="w-full text-left px-2 py-1.5 rounded-md text-[12px] hover:bg-stone-50">
                    <span className="text-stone-800">{t.title}</span>
                    <span className="block text-[10px] text-stone-400">{t.pm_projects?.title || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
