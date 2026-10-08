import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { usePmStore, filterColumns, flattenTasks } from '../../../stores/pmStore'
import CalendarTaskChip from './CalendarTaskChip'
import { IconButton } from '../shared/PmUi'

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildCells(month) {
  const first = startOfMonth(month)
  const startPad = first.getDay()
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export default function ProjectCalendarView({ onTaskClick }) {
  const rawColumns = usePmStore(s => s.columns)
  const filters = usePmStore(s => s.filters)
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))

  const tasks = useMemo(
    () => flattenTasks(filterColumns(rawColumns, filters)).filter(t => t.due_date),
    [rawColumns, filters]
  )

  const byDay = useMemo(() => {
    const map = {}
    for (const t of tasks) {
      const key = dayKey(new Date(t.due_date))
      if (!map[key]) map[key] = []
      map[key].push(t)
    }
    return map
  }, [tasks])

  const cells = useMemo(() => buildCells(cursor), [cursor])
  const todayKey = dayKey(new Date())
  const label = cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col h-full min-h-[480px]">
      <div className="flex items-center justify-between mb-3">
        <IconButton icon={ChevronLeft} title="Previous month" onClick={() => setCursor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} />
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-stone-800">{label}</h2>
          <button
            type="button"
            onClick={() => setCursor(startOfMonth(new Date()))}
            className="text-[11px] text-[#4d68f0] hover:underline"
          >
            Today
          </button>
        </div>
        <IconButton icon={ChevronRight} title="Next month" onClick={() => setCursor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} />
      </div>

      <div className="grid grid-cols-7 gap-px bg-stone-200 border border-stone-200 rounded-lg overflow-hidden flex-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="bg-stone-50 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-stone-400">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="bg-white min-h-[92px]" />
          const key = dayKey(day)
          const dayTasks = byDay[key] || []
          const isToday = key === todayKey
          return (
            <div key={key} className={`bg-white min-h-[92px] p-1.5 ${isToday ? 'ring-1 ring-inset ring-[#4d68f0]/40' : ''}`}>
              <div className={`text-[10px] font-medium mb-1 ${isToday ? 'text-[#4d68f0]' : 'text-stone-400'}`}>
                {day.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map(t => (
                  <CalendarTaskChip key={t.id} task={t} onClick={onTaskClick} />
                ))}
                {dayTasks.length > 3 && (
                  <p className="text-[10px] text-stone-400 px-1">+{dayTasks.length - 3} more</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
