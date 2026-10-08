import { Lock, Repeat, CalendarClock, SquareCheck, Factory, Package } from 'lucide-react'
import { PRIORITY_CONFIG, PriorityIcon } from '../shared/PriorityIcon'
import { MemberAvatarGroup } from '../shared/MemberAvatar'
import { PCT_STAGE_LABELS } from '../shared/pmConstants'
import { PmIcon } from '../shared/PmUi'

function formatDue(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.ceil((d - now) / 86400000)
  const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  if (diffDays < 0)   return { label, overdue: true }
  if (diffDays === 0) return { label: 'Today', overdue: false, today: true }
  return { label, overdue: false }
}

export default function TaskCard({ task, onClick }) {
  const cfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.normal
  const due = formatDue(task.due_date)
  const checklistTotal = task.checklist_total || 0
  const checklistDone  = task.checklist_done  || 0

  return (
    <div
      onClick={() => onClick?.(task)}
      className="group bg-white rounded-lg border border-stone-200 hover:border-stone-300 transition-colors cursor-pointer overflow-hidden"
    >
      <div className="flex">
        <div className="w-[3px] flex-shrink-0" style={{ backgroundColor: cfg.color }} />
        <div className="flex-1 p-2.5 space-y-2">
          <p className="text-[12px] font-medium text-stone-800 leading-snug line-clamp-2">
            {task.is_blocked && (
              <PmIcon icon={Lock} size={11} className="inline mr-1 text-amber-500 align-[-1px]" />
            )}
            {task.recurrence_rule && (
              <PmIcon icon={Repeat} size={11} className="inline mr-1 text-stone-400 align-[-1px]" />
            )}
            {task.title}
          </p>

          {task.labels?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.labels.slice(0, 3).map(l => (
                <span key={l} className="px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded text-[10px] font-medium">
                  {l}
                </span>
              ))}
            </div>
          )}

          {task.linked_pct_stage && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-violet-50 text-violet-600 rounded text-[10px] font-medium">
              <PmIcon icon={Factory} size={10} />
              {PCT_STAGE_LABELS[task.linked_pct_stage] || task.linked_pct_stage}
            </span>
          )}
          {task.linked_po_id && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium">
              <PmIcon icon={Package} size={10} />
              PO
            </span>
          )}

          <div className="flex items-center justify-between pt-0.5">
            <div className="flex items-center gap-2">
              <span title={cfg.label}>
                <PriorityIcon priority={task.priority} size={12} />
              </span>
              {due && (
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${due.overdue ? 'text-red-500' : due.today ? 'text-amber-600' : 'text-stone-400'}`}>
                  <PmIcon icon={CalendarClock} size={10} />
                  {due.label}
                </span>
              )}
              {checklistTotal > 0 && (
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${checklistDone === checklistTotal ? 'text-emerald-600' : 'text-stone-400'}`}>
                  <PmIcon icon={SquareCheck} size={10} />
                  {checklistDone}/{checklistTotal}
                </span>
              )}
            </div>
            {(task.assignees?.length > 0) && (
              <MemberAvatarGroup members={task.assignees} max={3} size="xs" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
