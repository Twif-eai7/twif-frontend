import { useNavigate } from 'react-router-dom'
import { CalendarClock, ListTodo, Users } from 'lucide-react'
import { ProjectGlyph, PmIcon } from '../shared/PmUi'

const STATUS_STYLES = {
  active:    'text-emerald-600 bg-emerald-50',
  completed: 'text-blue-600 bg-blue-50',
  archived:  'text-stone-400 bg-stone-100',
}

function formatDate(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ProjectCard({ project }) {
  const navigate = useNavigate()
  const isOverdue = project.due_date && new Date(project.due_date) < new Date() && project.status === 'active'
  const donePct = project.task_count > 0
    ? Math.round(((project.task_count - project.open_task_count) / project.task_count) * 100)
    : 0

  return (
    <button
      type="button"
      onClick={() => navigate(`/dashboard/projects/${project.id}`)}
      className="group text-left w-full bg-white rounded-lg border border-stone-200 hover:border-stone-300 transition-colors overflow-hidden"
    >
      <div className="h-0.5 w-full" style={{ backgroundColor: project.color || '#4d68f0' }} />
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <ProjectGlyph name={project.emoji} color={project.color} size={32} />
            <div className="min-w-0 pt-0.5">
              <h3 className="text-[13px] font-medium text-stone-900 truncate group-hover:text-[#4d68f0] transition-colors">
                {project.title}
              </h3>
              {project.description && (
                <p className="text-[12px] text-stone-400 mt-0.5 line-clamp-1">{project.description}</p>
              )}
            </div>
          </div>
          <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md capitalize ${STATUS_STYLES[project.status] || STATUS_STYLES.active}`}>
            {project.status}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-stone-400">
          <span className="inline-flex items-center gap-1">
            <PmIcon icon={ListTodo} size={12} />
            <span className="text-stone-700 font-medium">{project.open_task_count ?? 0}</span> open
          </span>
          <span className="inline-flex items-center gap-1">
            <PmIcon icon={Users} size={12} />
            <span className="text-stone-700 font-medium">{project.member_count ?? 0}</span>
          </span>
        </div>

        {project.task_count > 0 && (
          <div className="h-0.5 w-full bg-stone-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${donePct}%`, backgroundColor: project.color || '#4d68f0' }}
            />
          </div>
        )}

        {project.due_date && (
          <p className={`inline-flex items-center gap-1 text-[11px] ${isOverdue ? 'text-red-500' : 'text-stone-400'}`}>
            <PmIcon icon={CalendarClock} size={12} />
            {isOverdue ? 'Overdue · ' : ''}{formatDate(project.due_date)}
          </p>
        )}
      </div>
    </button>
  )
}
