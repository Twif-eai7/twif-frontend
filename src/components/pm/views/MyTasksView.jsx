import { useMemo } from 'react'
import { CircleCheck } from 'lucide-react'
import { PRIORITY_CONFIG, PriorityBadge } from '../shared/PriorityIcon'
import { PCT_STAGE_LABELS } from '../shared/pmConstants'
import { ProjectGlyph, PmEmpty } from '../shared/PmUi'

function groupTasks(tasks) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endToday = new Date(start.getTime() + 86400000)
  const endWeek = new Date(start.getTime() + 7 * 86400000)
  const groups = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    none: [],
  }
  for (const t of tasks || []) {
    if (!t.due_date) { groups.none.push(t); continue }
    const due = new Date(t.due_date)
    if (due < start) groups.overdue.push(t)
    else if (due < endToday) groups.today.push(t)
    else if (due < endWeek) groups.week.push(t)
    else groups.later.push(t)
  }
  return groups
}

const GROUP_META = [
  { key: 'overdue', label: 'Overdue', tone: 'text-red-600' },
  { key: 'today',   label: 'Today', tone: 'text-amber-600' },
  { key: 'week',    label: 'This week', tone: 'text-stone-700' },
  { key: 'later',   label: 'Later', tone: 'text-stone-500' },
  { key: 'none',    label: 'No due date', tone: 'text-stone-400' },
]

function TaskRow({ task, onClick }) {
  const cfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.normal
  const project = task.pm_projects || {}
  const due = task.due_date ? new Date(task.due_date) : null
  return (
    <button
      type="button"
      onClick={() => onClick?.(task)}
      className="w-full flex items-center gap-3 px-3 py-2.5 bg-white rounded-lg border border-stone-200 hover:border-stone-300 text-left"
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-stone-800 truncate">{task.title}</p>
        <p className="flex items-center gap-1.5 text-[11px] text-stone-400 truncate mt-0.5">
          <ProjectGlyph name={project.emoji} color={project.color} size={14} />
          {project.title || 'Project'}
          {task.linked_pct_stage ? ` · ${PCT_STAGE_LABELS[task.linked_pct_stage] || task.linked_pct_stage}` : ''}
        </p>
      </div>
      <PriorityBadge priority={task.priority || 'normal'} />
      <span className="text-[11px] text-stone-400 w-16 text-right flex-shrink-0">
        {due ? due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
      </span>
    </button>
  )
}

export default function MyTasksView({ tasks, onTaskClick, emptyLabel = 'No assigned tasks.' }) {
  const grouped = useMemo(() => groupTasks(tasks), [tasks])
  const total = (tasks || []).length

  if (!total) {
    return <PmEmpty icon={CircleCheck} title={emptyLabel} subtitle="Tasks assigned to you will show up here." />
  }

  return (
    <div className="space-y-5">
      {GROUP_META.map(g => {
        const rows = grouped[g.key]
        if (!rows.length) return null
        return (
          <section key={g.key} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className={`text-[11px] font-medium ${g.tone}`}>{g.label}</h3>
              <span className="text-[10px] font-medium text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-md">{rows.length}</span>
            </div>
            {rows.map(t => <TaskRow key={t.id} task={t} onClick={onTaskClick} />)}
          </section>
        )
      })}
    </div>
  )
}
