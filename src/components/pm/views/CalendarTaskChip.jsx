import { PRIORITY_CONFIG } from '../shared/PriorityIcon'

export default function CalendarTaskChip({ task, onClick }) {
  const cfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.normal
  const overdue = task.due_date && new Date(task.due_date) < new Date()
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(task) }}
      title={task.title}
      className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate border ${
        overdue ? 'bg-red-50 text-red-700 border-red-100' : 'bg-white text-stone-700 border-stone-100 hover:border-stone-200'
      }`}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ backgroundColor: cfg.color }} />
      {task.title}
    </button>
  )
}
