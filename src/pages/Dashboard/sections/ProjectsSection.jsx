import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ListTodo, Search, TriangleAlert, CalendarClock, FolderKanban } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import ProjectCard from '../../../components/pm/project/ProjectCard'
import NewProjectModal from '../../../components/pm/project/NewProjectModal'
import { Spinner } from '../../../components/ui'
import ProjectSearch from '../../../components/pm/shared/ProjectSearch'
import { PmButton, SegControl, PmEmpty, PmIcon } from '../../../components/pm/shared/PmUi'

export default function ProjectsSection() {
  const navigate        = useNavigate()
  const projects        = usePmStore(s => s.projects)
  const projectsLoading = usePmStore(s => s.projectsLoading)
  const fetchProjects   = usePmStore(s => s.fetchProjects)
  const myTasks         = usePmStore(s => s.myTasks)
  const fetchMyTasks    = usePmStore(s => s.fetchMyTasks)

  const [showNew, setShowNew] = useState(false)
  const [filter, setFilter]   = useState('active')
  const [search, setSearch]   = useState('')

  useEffect(() => {
    fetchProjects()
    fetchMyTasks()
  }, [fetchProjects, fetchMyTasks])

  const filtered = projects.filter(p => {
    if (filter !== 'all' && p.status !== filter) return false
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const statusTabs = [
    { key: 'active',    label: 'Active',    count: projects.filter(p => p.status === 'active').length },
    { key: 'completed', label: 'Completed', count: projects.filter(p => p.status === 'completed').length },
    { key: 'archived',  label: 'Archived',  count: projects.filter(p => p.status === 'archived').length },
    { key: 'all',       label: 'All',       count: projects.length },
  ]

  const now = new Date()
  const upcomingTasks = myTasks.filter(t => {
    if (!t.due_date) return false
    const d = new Date(t.due_date)
    const diff = (d - now) / 86400000
    return diff >= -1 && diff <= 7
  }).sort((a, b) => new Date(a.due_date) - new Date(b.due_date))

  const overdueTasks = myTasks.filter(t => {
    if (!t.due_date) return false
    return new Date(t.due_date) < now
  })

  return (
    <div className="flex flex-col h-full bg-[#fafafa]">
      <div className="flex items-center justify-between px-4 sm:px-6 pt-5 pb-4 border-b border-stone-200/80 flex-shrink-0 gap-3 flex-wrap bg-white">
        <div>
          <h1 className="text-[15px] font-semibold text-stone-900 tracking-tight">Projects</h1>
          <p className="text-[12px] text-stone-400 mt-0.5">Work across your organisation</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <ProjectSearch />
          <PmButton icon={ListTodo} onClick={() => navigate('/dashboard/projects/my-tasks')}>
            My Tasks
          </PmButton>
          <PmButton variant="primary" icon={Plus} onClick={() => setShowNew(true)}>
            New Project
          </PmButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
        {overdueTasks.length > 0 && (
          <button
            type="button"
            onClick={() => navigate('/dashboard/projects/my-tasks')}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 bg-red-50/80 border border-red-100 rounded-lg text-left"
          >
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-red-100 text-red-600 flex-shrink-0">
              <PmIcon icon={TriangleAlert} size={14} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-red-700">
                {overdueTasks.length} overdue task{overdueTasks.length > 1 ? 's' : ''}
              </p>
              <p className="text-[11px] text-red-500/80 mt-0.5 truncate">
                {overdueTasks.slice(0, 2).map(t => t.title).join(' · ')}{overdueTasks.length > 2 ? ` +${overdueTasks.length - 2} more` : ''}
              </p>
            </div>
          </button>
        )}

        {upcomingTasks.length > 0 && (
          <div className="bg-white border border-stone-200 rounded-lg px-4 py-3 space-y-2.5">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-stone-500">
              <PmIcon icon={CalendarClock} size={12} />
              Upcoming this week
            </p>
            <div className="space-y-1">
              {upcomingTasks.slice(0, 5).map(t => {
                const d = new Date(t.due_date)
                const diffDays = Math.ceil((d - now) / 86400000)
                const label = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                const overdue = diffDays < 0
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => t.project_id && navigate(`/dashboard/projects/${t.project_id}?task=${t.id}`)}
                    className="w-full flex items-center gap-2 text-left py-1 hover:bg-stone-50 rounded-md px-1 -mx-1"
                  >
                    <span className={`text-[11px] font-medium w-16 flex-shrink-0 ${overdue ? 'text-red-500' : diffDays === 0 ? 'text-amber-600' : 'text-stone-400'}`}>
                      {label}
                    </span>
                    <span className="text-[12px] text-stone-700 truncate flex-1">{t.title}</span>
                    <span className="text-[11px] text-stone-400 flex-shrink-0">{t.project_title || t.pm_projects?.title || ''}</span>
                  </button>
                )
              })}
              {upcomingTasks.length > 5 && (
                <p className="text-[11px] text-stone-400">+{upcomingTasks.length - 5} more</p>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <SegControl
            value={filter}
            onChange={setFilter}
            options={statusTabs.map(t => ({
              key: t.key,
              label: t.count > 0 ? `${t.label} ${t.count}` : t.label,
            }))}
          />
          <div className="flex items-center gap-2 bg-white border border-stone-200 px-2.5 h-8 rounded-md flex-1 max-w-xs">
            <PmIcon icon={Search} size={13} className="text-stone-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter by name…"
              className="flex-1 bg-transparent text-[12px] text-stone-700 outline-none placeholder-stone-400"
            />
          </div>
        </div>

        {projectsLoading ? (
          <div className="flex justify-center py-12">
            <Spinner light={false} size="w-6 h-6" />
          </div>
        ) : filtered.length === 0 ? (
          <PmEmpty
            icon={FolderKanban}
            title={search ? 'No matching projects' : `No ${filter === 'all' ? '' : filter + ' '}projects`}
            subtitle={search ? 'Try a different name.' : 'Create a project to start a board, list, and calendar.'}
            action={!search && filter === 'active' ? (
              <PmButton variant="primary" icon={Plus} onClick={() => setShowNew(true)} className="mt-2">
                Create project
              </PmButton>
            ) : null}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map(p => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <NewProjectModal
          onClose={() => setShowNew(false)}
          onCreated={() => fetchProjects()}
        />
      )}
    </div>
  )
}
