import { useState, useMemo } from 'react'
import { getScheduleStatus } from '../../hooks/useInspectionSchedule'

// A lighter Calendar view for the "Scheduled POs" table on the PO Inspection
// page - visually/behaviorally modeled on InspectionSchedule.jsx's own
// Day/Week/Month/Year calendar, but deliberately NOT that component embedded
// wholesale: this one is view-only (no Schedule Inspection form, no
// day-click-to-create), has no page-level state of its own (no URL sync, no
// uiStore persistence - it's a sub-view of a page that already tracks its
// own selection), and needs no separate data fetch, since the Scheduled POs
// table already has everything loaded via `entriesByPo`.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STAGE_ABBR = { ppm: 'PPM', pilot_run: 'PLT', inline: 'IL', midline: 'ML', final: 'FN' }
const STATUS_CHIP = {
  scheduled: 'bg-gray-100 text-gray-700 ring-1 ring-gray-300',
  processing: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
}
const VIEW_LABELS = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' }

function fmtISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function buildGrid(year, month) {
  const first = new Date(year, month, 1)
  const startOffset = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = startOffset; i > 0; i--) cells.push(new Date(year, month, 1 - i))
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  let extra = 1
  while (cells.length % 7 !== 0) { cells.push(new Date(year, month, daysInMonth + extra)); extra++ }
  return cells
}
function startOfWeek(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
}
function buildWeek(cursor) {
  const start = startOfWeek(cursor)
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}
function weekOfYear(date) {
  const start = startOfWeek(date)
  const yearStart = startOfWeek(new Date(date.getFullYear(), 0, 1))
  return Math.round((start - yearStart) / (7 * 86400000)) + 1
}
function viewLabel(view, cursor, days) {
  if (view === 'day') return cursor.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  if (view === 'week') {
    const start = days[0]
    const end = days[days.length - 1]
    const w = weekOfYear(start)
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
    const monthYear = sameMonth
      ? start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : `${start.toLocaleDateString('en-US', { month: 'short' })}–${end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
    return `Week ${w} · ${monthYear}`
  }
  if (view === 'month') return cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return String(cursor.getFullYear())
}

// Thin wrapper so every call site below reads `effectiveStatus(e)` - the
// three-state scheduled/processing/completed model itself lives in
// getScheduleStatus (useInspectionSchedule.js), matching
// InspectionSchedule.jsx's own convention exactly, so the two calendars
// never disagree about what counts as "done".
function effectiveStatus(entry) {
  return getScheduleStatus(entry)
}
function dayDotColor(dayEntries) {
  if (!dayEntries || dayEntries.length === 0) return null
  if (dayEntries.some(e => effectiveStatus(e) === 'processing')) return 'bg-amber-400'
  if (dayEntries.some(e => effectiveStatus(e) === 'scheduled')) return 'bg-gray-400'
  return 'bg-emerald-500'
}
function firstName(name) {
  if (!name) return '?'
  return name.split(' ')[0]
}

function ViewSelector({ view, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 hover:shadow transition-all cursor-pointer"
      >
        {VIEW_LABELS[view]}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 w-24 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {Object.entries(VIEW_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => onChange(key)}
              className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 ${view === key ? 'font-bold text-gray-900' : 'text-gray-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DayCell({ d, todayStr, byDate, onChipClick, onMoreClick }) {
  const dateStr = fmtISO(d)
  const dayEntries = byDate[dateStr] || []
  const visible = dayEntries.slice(0, 3)
  const extra = dayEntries.length - visible.length
  return (
    <div className="min-h-[100px] border-b border-r border-gray-100 p-1.5 last:border-r-0 bg-white">
      <span className={`text-[11px] font-bold ${dateStr === todayStr ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-900 text-white' : 'text-gray-700'}`}>
        {d.getDate()}
      </span>
      <div className="space-y-1 mt-1">
        {visible.map(e => (
          <button
            key={e.id}
            type="button"
            onClick={ev => { ev.stopPropagation(); onChipClick(e) }}
            className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate cursor-pointer transition-all hover:shadow-sm hover:brightness-95 ${STATUS_CHIP[effectiveStatus(e)]}`}
          >
            {e.purchase_orders?.po_number || 'PO'} · {STAGE_ABBR[e.inspection_type]} · {firstName(e.organization_members?.full_name)}
          </button>
        ))}
        {extra > 0 && (
          <button
            type="button"
            onClick={ev => { ev.stopPropagation(); onMoreClick(dateStr) }}
            className="w-full text-left px-1.5 text-[10px] font-semibold text-gray-400 hover:text-gray-700 cursor-pointer"
          >
            +{extra} more
          </button>
        )}
      </div>
    </div>
  )
}

function WeekView({ days, todayStr, byDate, onChipClick, onMoreClick }) {
  return (
    <div>
      <div className="grid grid-cols-7 bg-gray-50 border-t border-l border-gray-100">
        {days.map(d => (
          <div key={fmtISO(d)} className="text-[10px] font-bold text-gray-400 uppercase text-center py-1.5 border-b border-r border-gray-100">
            {d.toLocaleDateString('en-US', { weekday: 'short' })}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-l border-gray-100">
        {days.map(d => <DayCell key={fmtISO(d)} d={d} todayStr={todayStr} byDate={byDate} onChipClick={onChipClick} onMoreClick={onMoreClick} />)}
      </div>
    </div>
  )
}

function DayView({ cursor, byDate, onChipClick }) {
  const dateStr = fmtISO(cursor)
  const dayEntries = byDate[dateStr] || []
  return (
    <div className="border border-gray-100 rounded-lg p-3">
      {dayEntries.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-6 text-center">No inspections scheduled this day.</p>
      ) : (
        <div className="space-y-1.5">
          {dayEntries.map(e => (
            <button
              key={e.id}
              type="button"
              onClick={() => onChipClick(e)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium cursor-pointer ${STATUS_CHIP[effectiveStatus(e)]}`}
            >
              {e.purchase_orders?.po_number || 'PO'} · {STAGE_ABBR[e.inspection_type]} · {e.organization_members?.full_name || 'Unassigned'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function MiniMonth({ year, month, cursor, todayStr, byDate, onSelectDate, hideNav, onPrevMonth, onNextMonth }) {
  const grid = useMemo(() => buildGrid(year, month), [year, month])
  const selectedStr = fmtISO(cursor)
  return (
    <div className="flex-1 border border-gray-200 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3.5">
        <span className="text-sm font-extrabold text-gray-900 tracking-tight">
          {new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        {!hideNav && (
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={onPrevMonth} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 transition-colors cursor-pointer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button type="button" onClick={onNextMonth} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 transition-colors cursor-pointer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-7 mb-2">
        {WEEKDAYS.map(w => <div key={w} className="text-[11px] font-bold text-gray-400 text-center">{w[0]}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-2">
        {grid.map((d, i) => {
          const dateStr = fmtISO(d)
          const inMonth = d.getMonth() === month
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedStr
          const dot = dayDotColor(byDate[dateStr])
          return (
            <div key={i} className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => onSelectDate(d)}
                className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-semibold transition-all cursor-pointer
                  ${isSelected ? 'bg-gray-900 text-white shadow-sm ring-2 ring-gray-900/10'
                    : isToday ? 'ring-2 ring-gray-900 text-gray-900 font-bold'
                    : inMonth ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 hover:bg-gray-100'}`}
              >
                {d.getDate()}
              </button>
              <span className={`w-1 h-1 rounded-full mt-0.5 ${dot || 'invisible'}`} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function YearView({ year, cursor, todayStr, byDate, onSelectDay }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 12 }, (_, m) => (
        <MiniMonth key={m} year={year} month={m} cursor={cursor} todayStr={todayStr} byDate={byDate} onSelectDate={onSelectDay} hideNav />
      ))}
    </div>
  )
}

function DayListModal({ date, entries, onClose }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="text-sm font-bold text-gray-900">{date}</div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto px-3 py-3 space-y-1.5">
          {entries.map(e => (
            <div key={e.id} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium ${STATUS_CHIP[effectiveStatus(e)]}`}>
              {e.purchase_orders?.po_number || 'PO'} · {STAGE_ABBR[e.inspection_type]} · {e.organization_members?.full_name || 'Unassigned'}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// `entriesByPo` is the same data the Row view's table is built from
// (fetchPoScheduleEntriesForPos, keyed by po_id) - no separate fetch here.
// `pos` supplies each PO's own po_number, which that query doesn't select.
export default function ScheduledPosCalendar({ entriesByPo, pos }) {
  const [view, setView] = useState('month')
  const [cursor, setCursor] = useState(new Date())
  const [dayListDate, setDayListDate] = useState(null)
  const todayStr = fmtISO(new Date())

  const poNumberById = useMemo(() => {
    const map = {}
    for (const po of pos ?? []) map[po.id] = po.po_number
    return map
  }, [pos])

  const byDate = useMemo(() => {
    const map = {}
    for (const [poId, entries] of Object.entries(entriesByPo ?? {})) {
      for (const e of entries) {
        if (e.status === 'cancelled') continue
        const withPoNumber = { ...e, purchase_orders: { ...e.purchase_orders, po_number: poNumberById[poId] } }
        ;(map[e.scheduled_date] ??= []).push(withPoNumber)
      }
    }
    return map
  }, [entriesByPo, poNumberById])

  const days = view === 'week' ? buildWeek(cursor) : view === 'day' ? [cursor] : null
  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  const goPrev = () => setCursor(c => {
    if (view === 'day') return new Date(c.getFullYear(), c.getMonth(), c.getDate() - 1)
    if (view === 'week') return new Date(c.getFullYear(), c.getMonth(), c.getDate() - 7)
    if (view === 'year') return new Date(c.getFullYear() - 1, c.getMonth(), 1)
    return new Date(c.getFullYear(), c.getMonth() - 1, 1)
  })
  const goNext = () => setCursor(c => {
    if (view === 'day') return new Date(c.getFullYear(), c.getMonth(), c.getDate() + 1)
    if (view === 'week') return new Date(c.getFullYear(), c.getMonth(), c.getDate() + 7)
    if (view === 'year') return new Date(c.getFullYear() + 1, c.getMonth(), 1)
    return new Date(c.getFullYear(), c.getMonth() + 1, 1)
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => setCursor(new Date())} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 hover:shadow transition-all cursor-pointer">
          Today
        </button>
        <button type="button" onClick={goPrev} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-50 hover:shadow transition-all cursor-pointer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="text-sm font-extrabold text-gray-900 tracking-tight min-w-56 text-center">
          {viewLabel(view, cursor, days)}
        </div>
        <button type="button" onClick={goNext} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-50 hover:shadow transition-all cursor-pointer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
        </button>
        <div className="ml-auto">
          <ViewSelector view={view} onChange={setView} />
        </div>
      </div>

      {view === 'week' && (
        <WeekView days={days} todayStr={todayStr} byDate={byDate} onChipClick={() => {}} onMoreClick={setDayListDate} />
      )}
      {view === 'day' && (
        <DayView cursor={cursor} byDate={byDate} onChipClick={() => {}} />
      )}
      {view === 'month' && (
        <MiniMonth year={year} month={month} cursor={cursor} todayStr={todayStr} byDate={byDate}
          onSelectDate={d => setCursor(d)} onPrevMonth={goPrev} onNextMonth={goNext} />
      )}
      {view === 'year' && (
        <YearView year={year} cursor={cursor} todayStr={todayStr} byDate={byDate} onSelectDay={d => { setCursor(d); setView('day') }} />
      )}

      {dayListDate && (
        <DayListModal date={dayListDate} entries={byDate[dayListDate] || []} onClose={() => setDayListDate(null)} />
      )}
    </div>
  )
}
