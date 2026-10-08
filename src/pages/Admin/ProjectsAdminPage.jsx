import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminCheck } from '../../hooks/useAdminCheck'
import { AdminShell } from '../../components/admin/AdminShell'
import { PageHeader, Badge, EmptyState, TableSkeleton } from '../../components/admin/AdminUi'
import { FolderKanban } from 'lucide-react'
import { usePmStore } from '../../stores/pmStore'
import { ProjectGlyph } from '../../components/pm/shared/PmUi'

export default function ProjectsAdminPage() {
  const { checking } = useAdminCheck()
  const navigate = useNavigate()
  const fetchAdminProjects = usePmStore(s => s.fetchAdminProjects)
  const archiveAdminProjects = usePmStore(s => s.archiveAdminProjects)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [party, setParty] = useState('')
  const [selected, setSelected] = useState(() => new Set())

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchAdminProjects({ q, status })
      setRows(data || [])
      setSelected(new Set())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (!checking) load() }, [checking, status])

  const filtered = useMemo(() => {
    const p = party.trim().toLowerCase()
    if (!p) return rows
    return rows.filter(r =>
      [r.buyer_name, r.supplier_name, r.merchant_name].filter(Boolean).join(' ').toLowerCase().includes(p)
    )
  }, [rows, party])

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const archiveSelected = async () => {
    if (!selected.size) return
    if (!window.confirm(`Archive ${selected.size} project${selected.size > 1 ? 's' : ''}?`)) return
    await archiveAdminProjects([...selected])
    await load()
  }

  if (checking) return null

  return (
    <AdminShell>
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl">
        <PageHeader
          title="Projects"
          subtitle="Every PM project across organisations"
          action={
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <button type="button" onClick={archiveSelected}
                  className="px-3 py-2 text-xs font-semibold rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50">
                  Archive {selected.size}
                </button>
              )}
              <button type="button" onClick={load}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-stone-900 text-white">
                Refresh
              </button>
            </div>
          }
        />

        <div className="flex flex-wrap gap-2 mb-4">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') load() }}
            placeholder="Filter by title…"
            className="border border-stone-200 rounded-lg px-3 py-2 text-sm w-full sm:w-56"
          />
          <input
            value={party}
            onChange={e => setParty(e.target.value)}
            placeholder="Buyer / vendor…"
            className="border border-stone-200 rounded-lg px-3 py-2 text-sm w-full sm:w-48"
          />
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="border border-stone-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
          <button type="button" onClick={load} className="px-3 py-2 text-sm border border-stone-200 rounded-lg">Search</button>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {loading ? (
          <TableSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<FolderKanban size={18} strokeWidth={1.75} />} title="No projects" subtitle="Nothing matches this filter." />
        ) : (
          <div className="overflow-x-auto border border-stone-200 rounded-xl bg-white">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-stone-400 border-b border-stone-100">
                  <th className="px-3 py-2 w-8" />
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Buyer</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Open / All</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="border-t border-stone-50">
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="accent-stone-800" />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 font-medium text-stone-800">
                        <ProjectGlyph name={p.emoji} color={p.color} size={22} />
                        <span>{p.title}</span>
                      </div>
                      <div className="text-[11px] text-stone-400">{p.type}</div>
                    </td>
                    <td className="px-3 py-2.5 text-stone-600">{p.buyer_name || '—'}</td>
                    <td className="px-3 py-2.5 text-stone-600">{p.supplier_name || '—'}</td>
                    <td className="px-3 py-2.5"><Badge label={p.status} /></td>
                    <td className="px-3 py-2.5 text-stone-600">{p.open_task_count ?? 0} / {p.task_count ?? 0}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button type="button" onClick={() => navigate(`/dashboard/projects/${p.id}`)}
                        className="text-xs text-[#4d68f0] hover:underline">
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  )
}
