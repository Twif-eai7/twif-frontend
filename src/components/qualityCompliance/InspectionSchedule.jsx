import { useState, useMemo, useEffect, useRef, useId } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { useProfileStore } from '../../stores/profileStore'
import { useAuthStore } from '../../stores/authStore'
import { useUiStore } from '../../stores/uiStore'
import { canManageInspectionSchedule, ownScheduleRestrictionEmail } from '../../utils/inspectionScheduleAccess'
import { useInspectionSchedules, remainingSkusForEntry, getScheduleStatus, fetchScheduledOverviewStats } from '../../hooks/useInspectionSchedule'
import InspectionScheduleForm from './InspectionScheduleForm'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STAGE_ABBR = { ppm: 'PPM', pilot_run: 'PLT', inline: 'IL', midline: 'ML', final: 'FN' }
const STATUS_CHIP = {
  scheduled: 'bg-gray-100 text-gray-700 ring-1 ring-gray-300',
  processing: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
}
const STATUS_BADGE = {
  scheduled: 'bg-gray-100 text-gray-600',
  processing: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
}
// Solid dot colors for AgendaView's timeline rail - same 3 states as
// STATUS_CHIP/STATUS_BADGE above, just a flat fill instead of a tinted
// background, since the dot sits directly on the rail line rather than
// behind text.
const STATUS_DOT = {
  scheduled: 'bg-gray-400',
  processing: 'bg-amber-400',
  completed: 'bg-emerald-500',
}

// Each of the 7 grid columns is exactly 100/7 = 14.286% wide, so this reveals
// the ship only while it's over Sunday (col 0) and Saturday (col 6).
const WEEKEND_MASK =
  'linear-gradient(to right, #000 0 14.286%, transparent 14.286% 85.714%, #000 85.714% 100%)'

// Wave surface + the water body beneath it, as one filled shape. Period is
// 400px across a 2400px span, so the -400px shift in `waveShift` loops
// seamlessly. `down` flips the starting phase so the two layers don't move in
// lockstep.
function wavePath(baseY, amp, down) {
  const s = down ? 1 : -1
  let d = `M0,${baseY}`
  for (let i = 0; i < 6; i++) {
    d += ` c66,${s * amp} 134,${s * amp} 200,0 c66,${-s * amp} 134,${-s * amp} 200,0`
  }
  return `${d} L2400,120 L0,120 Z`
}

const WAVE_BACK  = wavePath(26, 13, false)
const WAVE_FRONT = wavePath(48, 9, true)

function WaveLayer({ variant }) {
  const back = variant === 'back'
  return (
    <svg
      viewBox="0 0 2400 120"
      width="2400"
      height="120"
      className={`absolute bottom-0 left-0 ${back ? 'animate-wave-back' : 'animate-wave-front'}`}
    >
      <defs>
        <linearGradient id={`seaGrad-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={back ? '#bae6fd' : '#7dd3fc'} stopOpacity={back ? 0.55 : 0.75} />
          <stop offset="100%" stopColor={back ? '#38bdf8' : '#0ea5e9'} stopOpacity={back ? 0.35 : 0.55} />
        </linearGradient>
      </defs>
      <path d={back ? WAVE_BACK : WAVE_FRONT} fill={`url(#seaGrad-${variant})`} />
      {/* Specular crest — catches the light along the surface. */}
      <path
        d={back ? WAVE_BACK : WAVE_FRONT}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={back ? 0.35 : 0.55}
        strokeWidth="2"
      />
    </svg>
  )
}

function fmtISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDisplayDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(`${dateStr}T00:00:00`)
  return isNaN(d) ? dateStr : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
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

// The main panel shows 2 full calendar weeks (14 days) at once, anchored to
// the same Sunday-start convention as everything else here.
function buildTwoWeeks(cursor) {
  const start = startOfWeek(cursor)
  return Array.from({ length: 14 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}

// Day/4-day views page from `cursor` itself, not a Sunday-anchored start —
// matches Google Calendar's own behavior for these two views.
function buildDayRange(cursor, n) {
  const y = cursor.getFullYear(), m = cursor.getMonth(), d = cursor.getDate()
  return Array.from({ length: n }, (_, i) => new Date(y, m, d + i))
}

function fmtDayHeader(d) {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}

// scheduled_time comes back from Postgres as "HH:MM:SS" (or null — most
// entries have none, it's optional). null in, null out so callers can just
// skip rendering it.
function fmtTime(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

// Week-of-year counted the same way our own weeks are built — Sunday-start,
// week 1 being the Sunday-start week that contains Jan 1 — rather than ISO
// 8601's Monday-start convention, so it lines up with what's on screen.
function weekOfYear(date) {
  const start = startOfWeek(date)
  const yearStart = startOfWeek(new Date(date.getFullYear(), 0, 1))
  return Math.round((start - yearStart) / (7 * 86400000)) + 1
}

// Covers the full 2-week span shown, not just its first week — handles the
// span crossing a month (or year) boundary by naming both months.
function periodLabel(days) {
  const start = days[0]
  const end = days[days.length - 1]
  const w1 = weekOfYear(start)
  const w2 = weekOfYear(end)
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  const monthYear = sameMonth
    ? start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : `${start.toLocaleDateString('en-US', { month: 'short' })}–${end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
  return `Week ${w1}–${w2} · ${monthYear}`
}

// Header label for every view. `periodLabel` (week's own formatter, above)
// is kept untouched and is the only thing called for `view === 'week'`.
function viewLabel(view, cursor, days) {
  if (view === 'week') return periodLabel(days)
  // Abbreviated (short weekday/month) rather than the full spelled-out form
  // ("Friday, September 11, 2026") - that was wide enough on its own to push
  // the header row into wrapping on a phone even after the label's own
  // min-width was already trimmed down for Week view.
  if (view === 'day') return cursor.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  if (view === '4day') {
    const start = days[0]
    const end = days[days.length - 1]
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
    return sameMonth
      ? `${start.getDate()}–${end.getDate()} ${start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
      : `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  if (view === 'month') return cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return String(cursor.getFullYear()) // 'year'
}

const VIEW_LABELS = { day: 'Day', '4day': '4 days', week: 'Week', month: 'Month', year: 'Year' }
const PERIOD_TITLE = {
  day: "This Day's Inspections",
  '4day': "These 4 Days' Inspections",
  week: "This Week's Inspections",
  month: "This Month's Inspections",
  year: "This Year's Inspections",
}
const PERIOD_PAGE_SIZE = 20
const PERIOD_EMPTY = {
  day: 'No inspections scheduled this day.',
  '4day': 'No inspections scheduled these 4 days.',
  week: 'No inspections scheduled this week.',
  month: 'No inspections scheduled this month.',
  year: 'No inspections scheduled this year.',
}

function firstName(name) {
  if (!name) return '?'
  return name.split(' ')[0]
}

// Worst-first: a day with anything still processing flags amber even if
// others that day are further along; only an all-completed day reads as
// emerald, and only an all-untouched day reads as gray.
function dayDotColor(dayEntries) {
  if (!dayEntries || dayEntries.length === 0) return null
  if (dayEntries.some(e => getScheduleStatus(e) === 'processing')) return 'bg-amber-400'
  if (dayEntries.some(e => getScheduleStatus(e) === 'scheduled')) return 'bg-gray-400'
  return 'bg-emerald-500'
}

// Thin wrapper so every call site below reads `effectiveStatus(e)` - the
// three-state scheduled/processing/completed model itself lives in
// getScheduleStatus (useInspectionSchedule.js) so both calendars agree.
function effectiveStatus(entry) {
  return getScheduleStatus(entry)
}

// Weekend sun helpers — disabled along with the sea/sun render in WeekRow
// below (going to be replaced with a real device-location weather widget
// later), kept here as a block since these three only ever existed to
// support that.
// function minutesSinceMidnight(d) { return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 }
// function easeInOutSun(t) { return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2 }
// function sunStyle(now, { startHour, startMinute, endHour, endMinute, from, to }) {
//   const nowMin = minutesSinceMidnight(now)
//   const startMin = startHour * 60 + startMinute
//   const endMin = endHour * 60 + endMinute
//   if (nowMin < startMin || nowMin > endMin) return null
//   const progress = (nowMin - startMin) / (endMin - startMin)
//   const eased = easeInOutSun(progress)
//   const left = from.left + (to.left - from.left) * eased
//   const top = from.top + (to.top - from.top) * eased
//   let opacity = 1
//   if (progress < 0.08) opacity = progress / 0.08
//   else if (progress > 0.85) opacity = 1 - (progress - 0.85) / 0.15
//   const waterLine = 55
//   const underwater = Math.max(0, Math.min(1, (top - waterLine) / (100 - waterLine)))
//   return { left: `${left}%`, top: `${top}%`, opacity: Math.max(0, Math.min(1, opacity)), underwater }
// }

export default function InspectionSchedule() {
  const orgMembership = useProfileStore(s => s.orgMembership)
  const userEmail = useAuthStore(s => s.session?.user?.email)
  const canManage = canManageInspectionSchedule(userEmail, orgMembership)
  // Restricts the 5 named schedule managers to entries they personally
  // created; null (everyone else, plus Admins/Owners) sees everything.
  const scheduleRestrictEmail = ownScheduleRestrictionEmail(userEmail, orgMembership)

  // The visible week is mirrored into the URL (?date=) for browser
  // back/forward and reload, AND into uiStore (persisted) for the case the
  // URL can't cover: the sidebar's tab links are static hrefs
  // (?tab=inspection-schedule), so switching to another tab and back always
  // lands on a bare URL with no `date` param at all — the store is what
  // actually restores the visible week in that case.
  const [searchParams, setSearchParams] = useSearchParams()
  const inspectionScheduleDate = useUiStore(s => s.inspectionScheduleDate)
  const setInspectionScheduleDate = useUiStore(s => s.setInspectionScheduleDate)
  const [cursor, setCursor] = useState(() => {
    const d = searchParams.get('date') || inspectionScheduleDate
    const parsed = d ? new Date(`${d}T00:00:00`) : null
    return parsed && !isNaN(parsed) ? parsed : new Date()
  })

  // Clicking a calendar chip jumps down to that same entry's row in "This
  // week's inspections" and flashes it for 20s so it's easy to spot in a
  // long list, rather than making the reader hunt for it after the scroll.
  const [highlightedEntryId, setHighlightedEntryId] = useState(null)
  const highlightTimerRef = useRef(null)
  // Separate maps for the desktop table row vs. the mobile card - both trees
  // are mounted at once (CSS-hidden, not unmounted), so a single shared map
  // would just get overwritten by whichever renders last. jumpToEntryRow
  // picks whichever one is actually visible (offsetParent !== null - a
  // display:none ancestor has no offsetParent).
  const entryRowRefs = useRef({})
  const entryCardRefs = useRef({})
  const scrollToEntryNow = (entryId) => {
    const candidates = [entryRowRefs.current[entryId], entryCardRefs.current[entryId]].filter(Boolean)
    const target = candidates.find(el => el.offsetParent !== null) || candidates[0]
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedEntryId(entryId)
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = setTimeout(() => setHighlightedEntryId(null), 20000)
  }
  useEffect(() => () => { if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current) }, [])

  const year  = cursor.getFullYear()
  const month = cursor.getMonth()
  // Fills the sidebar out to roughly the same height as the now-taller
  // 2-week main panel — a second mini calendar previewing next month, not an
  // independently-navigable one (Date's own month overflow handles the
  // December -> January rollover for free). Resolved to plain year/month
  // numbers up front, not a Date object read from later, so nothing here
  // looks mutable to anything downstream.
  const nextMonthDate = new Date(year, month + 1, 1)
  const nextYear = nextMonthDate.getFullYear()
  const nextMonthNum = nextMonthDate.getMonth()

  // Which range/granularity the main panel shows. Not persisted — landing on
  // this tab always starts from Week, same as before this existed.
  const [view, setView] = useState('week')

  // Sidebar (the two mini month calendars) can be collapsed to give the
  // main panel the full width — not persisted, mirrors `view` in that
  // respect, always starts open.
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    const iso = fmtISO(cursor)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('date', iso)
      return next
    }, { replace: true })
    setInspectionScheduleDate(iso)
  }, [cursor, setSearchParams, setInspectionScheduleDate])

  // The visible day list for whichever view is active. 'year' resolves to
  // [] — it's rendered via YearGrid (12 tiled mini calendars), not a flat
  // day list, since a year is naturally month-grouped rather than one long
  // row/grid of days.
  const days = useMemo(() => {
    if (view === 'week')  return buildTwoWeeks(cursor)
    if (view === 'day')   return buildDayRange(cursor, 1)
    if (view === '4day')  return buildDayRange(cursor, 4)
    if (view === 'month') return buildGrid(year, month)
    return []
  }, [view, cursor, year, month])

  // Drives the weekend sun's real-time position (see sunStyle above) —
  // re-renders once a minute, plenty for something that crosses the screen
  // over hours, not seconds.
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  // Forecasted weather (Week/Month cells): device location, Open-Meteo (no
  // key needed). Runs once on mount; on denial, an unsupported browser, or
  // a fetch failure, forecastByDate just stays empty and nothing renders
  // anywhere, no error banner, no retry, cells look exactly as they
  // always have. Never re-requested on view/date navigation; the forecast
  // window (16 days) already covers this page's own paging range.
  const [forecastByDate, setForecastByDate] = useState({})
  useEffect(() => {
    if (!navigator.geolocation) return
    let cancelled = false
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
            `&daily=weathercode,temperature_2m_max,temperature_2m_min&hourly=relative_humidity_2m` +
            `&timezone=auto&forecast_days=16`
          const res = await fetch(url)
          if (!res.ok) return
          const data = await res.json()
          if (cancelled) return
          // Humidity isn't a `daily` aggregate on Open-Meteo, so average the
          // 24 hourly readings per date client-side instead, once here
          // rather than per cell.
          const humidityByDate = {}
          const hourTimes = data.hourly?.time ?? []
          const hourHumidity = data.hourly?.relative_humidity_2m ?? []
          hourTimes.forEach((t, i) => {
            const date = t.slice(0, 10)
            ;(humidityByDate[date] ||= []).push(hourHumidity[i])
          })
          const byDate = {}
          const days = data.daily?.time ?? []
          days.forEach((date, i) => {
            const hums = humidityByDate[date]
            byDate[date] = {
              code: data.daily.weathercode?.[i],
              tempMax: Math.round(data.daily.temperature_2m_max?.[i]),
              tempMin: Math.round(data.daily.temperature_2m_min?.[i]),
              humidity: hums?.length ? Math.round(hums.reduce((a, b) => a + b, 0) / hums.length) : null,
            }
          })
          setForecastByDate(byDate)
        } catch {
          // Silent: a decorative feature failing shouldn't surface an
          // error to the user.
        }
      },
      () => {}, // denied/unavailable: leave forecastByDate empty
      { maximumAge: 30 * 60 * 1000 }
    )
    return () => { cancelled = true }
  }, [])

  // Measures the main panel's actual rendered height so the sidebar can be
  // capped to it (never taller — see the sidebar's maxHeight below). The
  // weekly grid's own content is what should drive the page's layout; the
  // sidebar adapting to fit is the one-way relationship, not the reverse.
  const mainPanelRef = useRef(null)
  const [mainPanelHeight, setMainPanelHeight] = useState(null)
  useEffect(() => {
    const el = mainPanelRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      setMainPanelHeight(entries[0].contentRect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Fetch the full month (padded to whole weeks by buildGrid), not just the
  // visible week — the mini calendar needs the whole month for its dots, and
  // buildWeek(cursor) for any date inside [year, month] can never extend past
  // that padding, so one query safely covers the week view and the mini
  // calendar with no second fetch.
  const monthDays = useMemo(() => buildGrid(year, month), [year, month])
  // Year view needs the whole year fetched (12 mini calendars' worth of
  // dots), not just the one month `monthDays` covers. Every other view's
  // visible span is guaranteed to fit inside the padded month grid already
  // (same reasoning as before), but the min/max below is a belt-and-braces
  // guard rather than trusting that for every view.
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === 'year') {
      return { rangeStart: fmtISO(new Date(year, 0, 1)), rangeEnd: fmtISO(new Date(year, 11, 31)) }
    }
    const boundsStart = days.length ? days[0] : monthDays[0]
    const boundsEnd   = days.length ? days[days.length - 1] : monthDays[monthDays.length - 1]
    return {
      rangeStart: fmtISO(boundsStart < monthDays[0] ? boundsStart : monthDays[0]),
      rangeEnd:   fmtISO(boundsEnd > monthDays[monthDays.length - 1] ? boundsEnd : monthDays[monthDays.length - 1]),
    }
  }, [view, days, monthDays, year])

  const { entries, loading, error, refresh } = useInspectionSchedules(rangeStart, rangeEnd, scheduleRestrictEmail, orgMembership?.memberId)

  const byDate = useMemo(() => {
    const map = {}
    for (const e of entries) (map[e.scheduled_date] ||= []).push(e)
    return map
  }, [entries])

  const [formState, setFormState]       = useState(null) // { entry } | { defaultDate } | null
  const [detailEntry, setDetailEntry]   = useState(null)
  const [dayListDate, setDayListDate]   = useState(null)
  const [hoverInfo, setHoverInfo]       = useState(null) // { dateStr, entries, top, left } | null

  // PO search — sidebar convenience for jumping straight to a PO's scheduled
  // date rather than paging the calendar to find it. Searches all POs (not
  // just the currently-loaded month), so results can land outside the
  // visible range; selecting one just moves `cursor` there.
  const [searchTerm, setSearchTerm]       = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchOpen, setSearchOpen]       = useState(false)

  useEffect(() => {
    const term = searchTerm.trim()
    if (!term) { setSearchResults([]); setSearchLoading(false); return }
    setSearchLoading(true)
    const timer = setTimeout(async () => {
      // Filter directly on the joined PO number (requires !inner) rather than
      // searching purchase_orders first and capping that list — a single
      // common letter matches a huge share of PO numbers, and capping *that*
      // list before checking which ones have schedules could easily miss the
      // actual match. inspection_schedules itself is the much smaller table.
      const { data: sched, error } = await supabase
        .from('inspection_schedules')
        .select('id, scheduled_date, status, inspection_type, purchase_orders!inner(po_number)')
        .ilike('purchase_orders.po_number', `%${term}%`)
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: false })
        .limit(15)
      if (error) console.error('[InspectionSchedule] search error:', error.message)
      setSearchResults(sched || [])
      setSearchLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Triggered from the mini calendar's dotted days — a day can hold several
  // entries, so the preview lists all of them rather than showing just one.
  const showHover = (dateStr, dayEntries, targetEl) => {
    const rect = targetEl.getBoundingClientRect()
    const estHeight = 56 + dayEntries.length * 40
    const openUpward = rect.bottom + estHeight + 6 > window.innerHeight
    setHoverInfo({
      dateStr,
      entries: dayEntries,
      top: openUpward ? rect.top - estHeight - 6 : rect.bottom + 6,
      left: Math.min(rect.left, window.innerWidth - 260),
    })
  }
  const hideHover = () => setHoverInfo(null)

  // Step size depends on the active view — 'week' stays exactly ± 14 days,
  // identical to before this existed. Month/year page by calendar month/year
  // rather than a fixed day count.
  const STEP = { day: 1, '4day': 4, week: 14 }
  const goPrev = () => setCursor(c => {
    if (view === 'month') return new Date(c.getFullYear(), c.getMonth() - 1, 1)
    if (view === 'year')  return new Date(c.getFullYear() - 1, c.getMonth(), 1)
    return new Date(c.getFullYear(), c.getMonth(), c.getDate() - STEP[view])
  })
  const goNext = () => setCursor(c => {
    if (view === 'month') return new Date(c.getFullYear(), c.getMonth() + 1, 1)
    if (view === 'year')  return new Date(c.getFullYear() + 1, c.getMonth(), 1)
    return new Date(c.getFullYear(), c.getMonth(), c.getDate() + STEP[view])
  })
  // Today only moves the cursor - it never scrolls the page, so on Month
  // view (or a long Week agenda) landing on "today" could still be far
  // below the fold with nothing visibly changing. Bumping this token on
  // every Today click, then scrolling to today's own DOM anchor in an
  // effect keyed on it, guarantees the scroll only runs once the days/
  // byDate this cursor change produces have actually re-rendered (an
  // effect fires after commit, unlike scrolling right inside the click
  // handler, which would still see the OLD render).
  const [scrollToTodayToken, setScrollToTodayToken] = useState(0)
  const goToday = () => { setCursor(new Date()); setScrollToTodayToken(t => t + 1) }
  useEffect(() => {
    if (!scrollToTodayToken) return
    document.getElementById('today-agenda-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [scrollToTodayToken])

  // Mini calendar's own month paging — independent of the main panel's week.
  const miniPrevMonth = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))
  const miniNextMonth = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))

  const handleSaved = () => { setFormState(null); setDetailEntry(null); refresh() }

  const todayStr = fmtISO(new Date())

  // Year view has no flat `days` list (see above) — its own fetch range
  // already covers exactly the shown year, so `entries` itself is the
  // period's list rather than a flatMap over an empty array.
  const periodEntries = useMemo(
    () => view === 'year' ? [...entries].reverse() : [...days].reverse().flatMap(d => byDate[fmtISO(d)] || []),
    [view, days, byDate, entries]
  )

  // "This week's inspections" table paged at 20 rows instead of rendering
  // every entry in the period at once (a busy week/month/year can run into
  // the hundreds). Resets to page 1 whenever the viewed period itself
  // changes (new week/month/year navigated to); clamped defensively in case
  // a refresh shrinks the list out from under the current page.
  const [periodPage, setPeriodPage] = useState(0)
  useEffect(() => { setPeriodPage(0) }, [view, cursor])
  const periodPageCount = Math.max(1, Math.ceil(periodEntries.length / PERIOD_PAGE_SIZE))
  const safePeriodPage = Math.min(periodPage, periodPageCount - 1)
  const pagedPeriodEntries = useMemo(
    () => periodEntries.slice(safePeriodPage * PERIOD_PAGE_SIZE, safePeriodPage * PERIOD_PAGE_SIZE + PERIOD_PAGE_SIZE),
    [periodEntries, safePeriodPage]
  )
  // Jumping to an entry (calendar chip / "+N more" / search result) can
  // target a day outside the currently loaded rangeStart/rangeEnd window -
  // search in particular queries inspection_schedules directly with no date
  // bound at all, so most results aren't in `periodEntries` yet at click
  // time. handleChipClick's setCursor(d) moves the view there, which
  // triggers useInspectionSchedules to refetch for the new range - but
  // that's async, so the entry isn't findable until that refetch lands and
  // `periodEntries` actually changes. This effect re-evaluates on every
  // periodEntries/periodPage change (including the page-reset effect above,
  // which it happily overrides again if a jump is still pending - no extra
  // suppression flag needed) until it can resolve: not found yet -> keep
  // waiting; found but on a different page -> flip pages (re-triggers this
  // same effect); found on the current page -> scroll, highlight, done.
  const [jumpToken, setJumpToken] = useState(0)
  const pendingJumpEntryIdRef = useRef(null)
  const jumpToEntryRow = (entryId) => {
    pendingJumpEntryIdRef.current = entryId
    setJumpToken(t => t + 1)
  }
  useEffect(() => {
    const id = pendingJumpEntryIdRef.current
    if (!id) return
    const idx = periodEntries.findIndex(e => e.id === id)
    if (idx === -1) return
    const targetPage = Math.floor(idx / PERIOD_PAGE_SIZE)
    if (targetPage === periodPage) {
      pendingJumpEntryIdRef.current = null
      scrollToEntryNow(id)
    } else {
      setPeriodPage(targetPage)
    }
  }, [periodEntries, periodPage, jumpToken])
  const handleChipClick = (d, e) => { setCursor(d); jumpToEntryRow(e.id) }
  // Selecting a search result behaves exactly like clicking that same
  // entry's calendar chip would - jump to its page/row and highlight it -
  // instead of just moving the calendar's cursor and leaving the user to
  // scroll and find it themselves.
  const selectSearchResult = (r) => {
    handleChipClick(new Date(`${r.scheduled_date}T00:00:00`), r)
    setSearchTerm('')
    setSearchResults([])
    setSearchOpen(false)
  }

  // Header KPI tiles - deliberately labeled "Total POs"/"Total SKUs" (not
  // "...Scheduled") and deliberately NOT scoped to the visible week/month/
  // year: a genuine grand total, via the same canonical
  // fetchScheduledOverviewStats() PoInspectionComments.jsx calls too, so it
  // reads the same regardless of whatever period happens to be on screen.
  // QcReportsSummary.jsx's own "Scheduled POs" tile is a different, page-
  // filtered number by design (see its own comment) - the two used to sit
  // side by side under the same word ("Scheduled"), which read as a bug
  // when they didn't match; keeping this one an explicit, differently-
  // labeled "Total" avoids inviting that comparison at all.
  const [totalScheduledStats, setTotalScheduledStats] = useState({ poCount: 0, skuCount: 0 })
  useEffect(() => {
    let cancelled = false
    fetchScheduledOverviewStats(scheduleRestrictEmail, orgMembership?.memberId).then(({ totalPos, totalSkus }) => {
      if (!cancelled) setTotalScheduledStats({ poCount: totalPos, skuCount: totalSkus })
    })
    return () => { cancelled = true }
  }, [scheduleRestrictEmail, orgMembership?.memberId])

  return (
    <>
    <div className="p-4 sm:p-6">
    <div className={`lg:grid lg:items-start lg:gap-6 ${sidebarOpen ? 'lg:grid-cols-[336px_1fr]' : 'lg:grid-cols-1'}`}>
      {/* Sidebar — desktop only, collapsible via the toggle button in the
          header (left of Prev). Capped to the main panel's own measured
          height (mainPanelHeight, via ResizeObserver) rather than the other
          way around — the weekly grid's height should never be inflated to
          chase a taller sidebar (that's what produced the big dead-space
          gap before "This Week's Inspections"). If the two mini calendars
          don't fit in that height, the sidebar scrolls internally instead
          of growing past it. */}
      {sidebarOpen && (
        <div
          className="hidden lg:flex lg:flex-col gap-4 overflow-y-auto"
          style={mainPanelHeight ? { maxHeight: mainPanelHeight } : undefined}
        >
          <MiniMonthCalendar
            year={year}
            month={month}
            cursor={cursor}
            todayStr={todayStr}
            byDate={byDate}
            onSelectDate={setCursor}
            onPrevMonth={miniPrevMonth}
            onNextMonth={miniNextMonth}
            onHoverDay={showHover}
            onLeaveDay={hideHover}
          />
          {/* Next month, previewed below — shares the same prev/next
              handlers as the calendar above so paging either one moves the
              pair together, always a month apart, rather than needing its
              own independent month state. */}
          <MiniMonthCalendar
            year={nextYear}
            month={nextMonthNum}
            cursor={cursor}
            todayStr={todayStr}
            byDate={byDate}
            onSelectDate={setCursor}
            onPrevMonth={miniPrevMonth}
            onNextMonth={miniNextMonth}
            onHoverDay={showHover}
            onLeaveDay={hideHover}
          />
        </div>
      )}

      {/* Main panel — its own natural height is what everything else (the
          sidebar's cap, "This Week's Inspections" below) follows, not the
          reverse. */}
      <div ref={mainPanelRef} className="min-w-0">
      {/* Header - sticky so the mobile Total PO/SKU cards, the date nav/
          Today/view-selector, and the Schedule Inspection button all stay
          reachable together while scrolling through a long agenda (Month
          view especially), instead of just the nav row pinning while the
          cards above it scroll away on their own. bg-white so the list
          doesn't show through once it's pinned. */}
      <div className="sticky top-0 z-20 bg-white pt-1 pb-2 mb-3">
        {/* Mobile counterpart of the desktop Total PO/SKU pill further below
            (hidden md:flex there, out of room on a phone header row) - a pair
            of small stat cards, pinned above the nav row rather than below it
            so the grand total is the first thing seen, not something you
            scroll past the calendar controls to find. Deliberately labeled
            "Total" (not "...Scheduled") and deliberately NOT re-computed from
            periodEntries - same all-time totalScheduledStats the desktop pill
            uses, so switching Day/Week/Month/Year never changes this number. */}
        <div className="sm:hidden grid grid-cols-2 gap-2.5 mb-3">
          <div className="flex items-center gap-2.5 bg-white border border-gray-200 px-3.5 py-2.5 shadow-sm">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-base font-extrabold text-gray-900 leading-tight">{totalScheduledStats.poCount}</div>
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide truncate">Total PO{totalScheduledStats.poCount === 1 ? '' : 's'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 bg-white border border-gray-200 px-3.5 py-2.5 shadow-sm">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.5 7.3 12 12m0 0L3.5 7.3M12 12v9.5M12 12 3.7 7.16a1 1 0 0 1-.5-.87v-.02a1 1 0 0 1 .5-.87L11.5 1a1 1 0 0 1 1 0l7.8 4.4a1 1 0 0 1 .5.87v.02a1 1 0 0 1-.5.87Z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-base font-extrabold text-gray-900 leading-tight">{totalScheduledStats.skuCount}</div>
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide truncate">Total SKU{totalScheduledStats.skuCount === 1 ? '' : 's'}</div>
            </div>
          </div>
        </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* w-full + the date label's flex-1 below is what actually makes
            this fluid across any phone width, rather than a set of fixed
            sizes tuned to fit one specific device - the nav arrows/Today/
            view selector are all flex-shrink-0 (their natural compact
            size), and the date label just grows or shrinks to soak up
            whatever room is left between them, so the row always spans the
            full available width exactly, on a 320px phone or a 480px one,
            with nothing reserved that could run short or leave a gap.
            sm:w-auto/sm:flex-none below hands it back to the original
            fixed-width desktop behaviour once there's room to spare. */}
        <div className="w-full sm:w-auto flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? 'Collapse calendar panel' : 'Expand calendar panel'}
            className="hidden lg:flex w-8 h-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-50 hover:text-gray-900 hover:shadow transition-all cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="9" y1="4" x2="9" y2="20" />
            </svg>
          </button>
          <button type="button" onClick={goPrev} className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-50 hover:text-gray-900 hover:shadow transition-all cursor-pointer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          {/* flex-1 (not a fixed min-width) is what makes this genuinely
              width-independent - it grows or shrinks to fill exactly
              whatever's left of the row between the fixed-size nav/Today/
              view-selector buttons on any phone, instead of a hardcoded
              reservation tuned to one device that either wraps the row
              (too wide) or leaves dead space (too narrow) on every other
              size. truncate is the safety net for the rare case even that
              isn't enough room. Desktop drops back to its own fixed,
              generous reserved width (flex-none + min-w-56) so the label
              doesn't grow to fill unused space there. */}
          <div className="flex-1 min-w-0 sm:flex-none sm:min-w-56 text-sm sm:text-base font-extrabold text-gray-900 tracking-tight text-center whitespace-nowrap truncate">
            {viewLabel(view, cursor, days)}
          </div>
          <button type="button" onClick={goNext} className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-50 hover:text-gray-900 hover:shadow transition-all cursor-pointer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
          </button>
          <button type="button" onClick={goToday} className="flex-shrink-0 ml-1 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 hover:shadow transition-all cursor-pointer">
            Today
          </button>
          <ViewSelector view={view} onChange={setView} />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="hidden md:flex items-center gap-2.5 text-[11px] font-medium text-gray-500 bg-white border border-gray-200 rounded-full px-3 py-1.5 shadow-sm">
            <span><span className="font-bold text-gray-900">{totalScheduledStats.poCount}</span> PO{totalScheduledStats.poCount === 1 ? '' : 's'}</span>
            <span className="text-gray-300">·</span>
            <span><span className="font-bold text-gray-900">{totalScheduledStats.skuCount}</span> SKU{totalScheduledStats.skuCount === 1 ? '' : 's'}</span>
          </div>
          <div className="hidden md:flex items-center gap-3 text-[11px] font-medium text-gray-500 bg-white border border-gray-200 rounded-full px-3 py-1.5 shadow-sm">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-400 ring-2 ring-gray-100" />Scheduled</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-100" />Processing</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />Completed</span>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setFormState({ defaultDate: todayStr })}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white shadow-sm hover:bg-gray-700 hover:shadow-md transition-all cursor-pointer"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Schedule Inspection
            </button>
          )}
        </div>
      </div>
      </div>

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      {view === 'year' ? (
        <YearGrid
          year={year}
          cursor={cursor}
          todayStr={todayStr}
          byDate={byDate}
          onSelectDay={d => { setCursor(d); setView('day') }}
          onHoverDay={showHover}
          onLeaveDay={hideHover}
        />
      ) : (
        <>
          {/* Grid — desktop */}
          <div className="hidden sm:block border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
            {(view === 'week' || view === 'month') && (
              <div className="grid grid-cols-7 border-b border-gray-200 bg-gradient-to-b from-gray-50 to-white">
                {WEEKDAYS.map((w, i) => (
                  <div
                    key={w}
                    className={`px-2 py-2.5 text-[11px] font-bold text-center uppercase tracking-wider
                      ${i === 0 || i === 6 ? 'text-sky-600' : 'text-gray-500'}`}
                  >
                    {w}
                  </div>
                ))}
              </div>
            )}
            {view === 'week' && (
              <>
                <WeekRow
                  days={days.slice(0, 7)}
                  byDate={byDate}
                  todayStr={todayStr}
                  canManage={canManage}
                  now={now}
                  onDayClick={dateStr => setFormState({ defaultDate: dateStr })}
                  onChipClick={handleChipClick}
                  onMoreClick={setDayListDate}
                  forecastByDate={forecastByDate}
                />
                <WeekRow
                  days={days.slice(7, 14)}
                  byDate={byDate}
                  todayStr={todayStr}
                  canManage={canManage}
                  now={now}
                  onDayClick={dateStr => setFormState({ defaultDate: dateStr })}
                  onChipClick={handleChipClick}
                  onMoreClick={setDayListDate}
                  forecastByDate={forecastByDate}
                />
              </>
            )}
            {view === 'month' && (
              <DayCells
                days={days}
                cols={7}
                dimMonth={month}
                byDate={byDate}
                todayStr={todayStr}
                canManage={canManage}
                onDayClick={dateStr => setFormState({ defaultDate: dateStr })}
                onChipClick={handleChipClick}
                onMoreClick={setDayListDate}
                forecastByDate={forecastByDate}
              />
            )}
            {(view === 'day' || view === '4day') && (
              <DayCells
                days={days}
                cols={view === 'day' ? 1 : 4}
                showFullLabel
                byDate={byDate}
                todayStr={todayStr}
                canManage={canManage}
                onDayClick={dateStr => setFormState({ defaultDate: dateStr })}
                onChipClick={handleChipClick}
                onMoreClick={setDayListDate}
              />
            )}
          </div>

          {/* Agenda — mobile */}
          <div className="sm:hidden">
            <AgendaView
              days={days}
              byDate={byDate}
              todayStr={todayStr}
              canManage={canManage}
              onSelectEntry={(e) => { setDetailEntry(e) }}
              onCreateDay={(dateStr) => setFormState({ defaultDate: dateStr })}
            />
          </div>
        </>
      )}

      {loading && <p className="text-xs text-gray-400 mt-2">Loading…</p>}
      </div>
    </div>

    {/* This week's inspections — full-width, all 7 days flattened into one
        table. Desktop/tablet only - the calendar/agenda above it already
        covers the same entries on mobile, so this whole second listing
        (plus its own search box) is redundant there and just adds scroll
        depth for no benefit. */}
    <div className="hidden sm:block mt-6 border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
      <div className="p-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs font-bold text-gray-900 uppercase tracking-wide">{PERIOD_TITLE[view]}</div>
        <div className="relative max-w-sm w-full sm:w-72">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setSearchOpen(true) }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            placeholder="Search PO number…"
            className="w-full h-9 pl-8 pr-3 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white transition-colors"
          />
          {searchOpen && searchTerm.trim() && (
            <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {searchLoading ? (
                <p className="px-3 py-2.5 text-xs text-gray-400">Searching…</p>
              ) : searchResults.length === 0 ? (
                <p className="px-3 py-2.5 text-xs text-gray-400">No matches</p>
              ) : (
                searchResults.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => selectSearchResult(r)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-b-0 cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-gray-900 truncate">{r.purchase_orders?.po_number || 'PO'}</span>
                      <span className={`flex-shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${STATUS_BADGE[r.status]}`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{fmtDisplayDate(r.scheduled_date)} · {r.inspection_type}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      {periodEntries.length === 0 ? (
        <p className="text-xs text-gray-400 italic px-3.5 py-6 text-center">
          {PERIOD_EMPTY[view]}
        </p>
      ) : (
        <>
          {/* sm, not md - matches the calendar section's own desktop/mobile
              breakpoint above (AgendaView), so both mobile sections on this
              page switch to desktop at the same viewport width. */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50/80 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-3.5 py-2.5">PO</th>
                  <th className="text-left px-3.5 py-2.5">Customer</th>
                  <th className="text-left px-3.5 py-2.5">Vendor</th>
                  <th className="text-left px-3.5 py-2.5">Stage</th>
                  <th className="text-left px-3.5 py-2.5">SKUs to Inspect</th>
                  <th className="text-left px-3.5 py-2.5">Date</th>
                  <th className="text-left px-3.5 py-2.5">QA</th>
                  <th className="text-left px-3.5 py-2.5">Status</th>
                  {canManage && <th className="text-right px-3.5 py-2.5">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedPeriodEntries.map(e => (
                  <tr
                    key={e.id}
                    ref={el => { if (el) entryRowRefs.current[e.id] = el }}
                    className={`transition-colors duration-500 ${highlightedEntryId === e.id ? 'bg-amber-100' : 'odd:bg-gray-50/40 hover:bg-sky-50/50'}`}
                  >
                    <td className="px-3.5 py-2.5 font-bold text-gray-900 whitespace-nowrap">{e.purchase_orders?.po_number || 'PO'}</td>
                    <td className="px-3.5 py-2.5 text-gray-600 whitespace-nowrap">{e.purchase_orders?.buyer_supplier_links?.buyer?.display_name || '-'}</td>
                    <td className="px-3.5 py-2.5 text-gray-600 whitespace-nowrap">{e.purchase_orders?.buyer_supplier_links?.supplier?.display_name || '-'}</td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-indigo-50 text-indigo-600">
                          {e.inspection_type}
                        </span>
                        {/* created_by === 'System' means InspectionForm.jsx auto-booked
                            this as a re-inspection follow-up after a rejection/partial
                            accept - same signal PoInspectionComments.jsx's ScheduledByCell
                            already surfaces, just as a compact dot here since this table
                            has no separate "Scheduled By" column of its own. */}
                        {e.created_by === 'System' && (
                          <span title={e.notes || 'Automatically scheduled'} className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                        )}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-gray-600 whitespace-nowrap">{remainingSkusForEntry(e)}</td>
                    <td className="px-3.5 py-2.5 text-gray-600 whitespace-nowrap">{fmtDisplayDate(e.scheduled_date)}</td>
                    <td className="px-3.5 py-2.5 text-gray-600 whitespace-nowrap">{e.organization_members?.full_name || '-'}</td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_BADGE[effectiveStatus(e)]}`}>
                        {effectiveStatus(e)}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                        <button type="button" onClick={() => setFormState({ entry: e })} className="px-2 py-1 rounded text-[10px] font-semibold text-white bg-gray-900 hover:bg-gray-700 transition-colors cursor-pointer">Edit</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sm:hidden divide-y divide-gray-100">
            {periodEntries.map(e => (
              <PeriodEntryCard
                key={e.id}
                entry={e}
                canManage={canManage}
                highlighted={highlightedEntryId === e.id}
                cardRef={el => { if (el) entryCardRefs.current[e.id] = el }}
                onEdit={() => setFormState({ entry: e })}
              />
            ))}
          </div>
          {periodPageCount > 1 && (
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-t border-gray-100 text-xs text-gray-500">
              <span>
                {safePeriodPage * PERIOD_PAGE_SIZE + 1}-{Math.min((safePeriodPage + 1) * PERIOD_PAGE_SIZE, periodEntries.length)} of {periodEntries.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePeriodPage === 0}
                  onClick={() => setPeriodPage(p => Math.max(0, p - 1))}
                  className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white font-semibold shadow-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Prev
                </button>
                <span className="font-semibold text-gray-700">Page {safePeriodPage + 1} of {periodPageCount}</span>
                <button
                  type="button"
                  disabled={safePeriodPage >= periodPageCount - 1}
                  onClick={() => setPeriodPage(p => Math.min(periodPageCount - 1, p + 1))}
                  className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white font-semibold shadow-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>

    <div>
      {hoverInfo && createPortal(
        <div
          className="fixed z-[300] pointer-events-none w-64 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden"
          style={{ top: hoverInfo.top, left: hoverInfo.left }}
        >
          <div className={`h-[3px] ${dayDotColor(hoverInfo.entries) || 'bg-gray-300'}`} />
          <div className="px-3.5 py-2 border-b border-gray-100 bg-gray-50">
            <span className="text-xs font-bold text-gray-900">{fmtDisplayDate(hoverInfo.dateStr)}</span>
          </div>
          <div className="divide-y divide-gray-100 max-h-64 overflow-hidden">
            {hoverInfo.entries.map(e => (
              <div key={e.id} className="px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-gray-900 truncate">{e.purchase_orders?.po_number || 'PO'}</span>
                  <span className={`flex-shrink-0 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_BADGE[effectiveStatus(e)]}`}>
                    {effectiveStatus(e)}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-gray-500 capitalize truncate">
                  {e.inspection_type} · {e.organization_members?.full_name || 'Unassigned'}
                </div>
                {e.notes && <div className="mt-1 text-[10px] text-gray-400 italic truncate">"{e.notes}"</div>}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}

      {formState && (
        <InspectionScheduleForm
          key={formState.entry?.id || 'new'}
          entry={formState.entry}
          defaultDate={formState.defaultDate}
          onClose={() => setFormState(null)}
          onSaved={handleSaved}
        />
      )}

      {dayListDate && (
        <DayListModal
          date={dayListDate}
          entries={byDate[dayListDate] || []}
          onClose={() => setDayListDate(null)}
          onSelect={(e) => { handleChipClick(new Date(`${dayListDate}T00:00:00`), e); setDayListDate(null) }}
        />
      )}

      {detailEntry && (
        <DetailModal
          entry={detailEntry}
          canManage={canManage}
          onClose={() => setDetailEntry(null)}
          onEdit={() => { setFormState({ entry: detailEntry }); setDetailEntry(null) }}
        />
      )}
    </div>
    </div>

    <ScrollNav />
    </>
  )
}

// WMO weather codes (Open-Meteo's `weathercode`) bucketed into the handful
// of icon/animation groups this needs. See https://open-meteo.com/en/docs
// for the full code list; every code not explicitly listed here falls back
// to 'cloudy' via the default in weatherGroup() below.
const WEATHER_CODE_GROUP = {
  0: 'clear',
  1: 'clear', 2: 'partly-cloudy', 3: 'overcast',
  45: 'fog', 48: 'fog',
  51: 'rain', 53: 'rain', 55: 'rain', 56: 'rain', 57: 'rain',
  61: 'rain', 63: 'rain', 65: 'rain', 66: 'rain', 67: 'rain',
  71: 'snow', 73: 'snow', 75: 'snow', 77: 'snow',
  80: 'rain', 81: 'rain', 82: 'rain',
  85: 'snow', 86: 'snow',
  95: 'storm', 96: 'storm', 99: 'storm',
}
function weatherGroup(code) {
  return WEATHER_CODE_GROUP[code] ?? 'cloudy'
}

// Gradient-filled, "believable" weather icon (soft glowing sun, dimensional
// cloud rather than a flat currentColor silhouette) matching the reference
// widget's look. `animated` gates a *baseline* idle motion (slow glow
// breathing / slow cloud drift) that plays at rest, independent of hover —
// only ever passed true from the Week view (see WeatherReadout), never
// Month, so a 42-cell Month grid stays fully still until hovered, exactly
// as before. Hover motion (group-hover/weather:animate-[...]) is unchanged
// and always layered on top: Tailwind emits variant rules after their
// plain-utility counterpart, so on hover the (equal-specificity, later)
// hover animation cleanly takes over from whichever idle animation was
// already playing, and reverts to it on mouseleave. The wrapping span still
// scales the whole icon up on hover on top of that, so the hovered cell's
// badge pops rather than just wiggling in place.
function WeatherIcon({ group, size = 16, animated = false }) {
  const s = size
  const uid = useId().replace(/:/g, '')
  const sunGradId = `sun-${uid}`
  const cloudGradId = `cloud-${uid}`
  let icon

  // Shared cloud fill — a subtle top-light/bottom-shadow gradient in place
  // of a flat currentColor silhouette, for a fluffier, more dimensional look.
  const cloudDefs = (
    <linearGradient id={cloudGradId} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
      <stop offset="100%" stopColor="currentColor" stopOpacity="0.95" />
    </linearGradient>
  )
  // Shared sun core — warm amber-to-orange radial gradient, same visual
  // language as the (currently disabled) sunrise/sunset glow above.
  const sunDefs = (
    <radialGradient id={sunGradId} cx="40%" cy="35%" r="65%">
      <stop offset="0%" stopColor="#fde68a" />
      <stop offset="55%" stopColor="#f59e0b" />
      <stop offset="100%" stopColor="#ea580c" />
    </radialGradient>
  )
  // transform-box:fill-box makes origin-center pivot around the shape's own
  // center rather than the SVG viewport's, so the scale-pulse below stays
  // correct even for the off-center sun in the partly-cloudy icon.
  const sunPulseClass = `[transform-box:fill-box] origin-center ${animated ? 'animate-[weatherSunGlowPulse_3.6s_ease-in-out_infinite]' : ''} group-hover/weather:animate-[weatherSunPulse_0.8s_ease-in-out_infinite] motion-reduce:!animate-none`

  if (group === 'clear') {
    icon = (
      <svg width={s} height={s} viewBox="0 0 24 24">
        <defs>{sunDefs}</defs>
        <circle cx="12" cy="12" r="10.5" fill="#f59e0b" opacity="0.12" className={sunPulseClass} />
        <circle cx="12" cy="12" r="8" fill="#f59e0b" opacity="0.22" className={sunPulseClass} style={{ animationDelay: '0.15s' }} />
        <circle cx="12" cy="12" r="5.5" fill={`url(#${sunGradId})`} className={sunPulseClass} />
      </svg>
    )
  } else if (group === 'partly-cloudy') {
    icon = (
      <svg width={s} height={s} viewBox="0 0 24 24">
        <defs>{sunDefs}{cloudDefs}</defs>
        <circle cx="16" cy="8" r="6.5" fill="#f59e0b" opacity="0.16" className={sunPulseClass} />
        <circle cx="16" cy="8" r="4" fill={`url(#${sunGradId})`} className={sunPulseClass} style={{ animationDelay: '0.15s' }} />
        <path d="M4 18h11.5a4 4 0 0 0 .4-7.98A5 5 0 0 0 6.4 9.3 4 4 0 0 0 4 18z"
          fill={`url(#${cloudGradId})`}
          className={`${animated ? 'animate-[weatherCloudDriftSlow_6.5s_ease-in-out_infinite]' : ''} group-hover/weather:animate-[weatherCloudPass_1.5s_ease-in-out_infinite] motion-reduce:!animate-none`} />
      </svg>
    )
  } else if (group === 'cloudy') {
    icon = (
      <svg width={s} height={s} viewBox="0 0 24 24">
        <defs>{cloudDefs}</defs>
        <circle cx="8" cy="10" r="4" fill="currentColor" opacity="0.35" />
        <path d="M6 19h11a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7.1 9.5 4 4 0 0 0 6 19z"
          fill={`url(#${cloudGradId})`}
          className={`${animated ? 'animate-[weatherCloudDriftSlow_6.5s_ease-in-out_infinite]' : ''} group-hover/weather:animate-[weatherCloudPass_1.5s_ease-in-out_infinite] motion-reduce:!animate-none`} />
      </svg>
    )
  } else if (group === 'overcast') {
    icon = (
      <svg width={s} height={s} viewBox="0 0 24 24">
        <defs>{cloudDefs}</defs>
        <path d="M5 15h9a3.5 3.5 0 0 0 .3-6.98A4.5 4.5 0 0 0 5.9 8.5 3.5 3.5 0 0 0 5 15z"
          fill={`url(#${cloudGradId})`} opacity="0.55"
          className={`${animated ? 'animate-[weatherCloudDriftSlow_7.5s_ease-in-out_infinite]' : ''} group-hover/weather:animate-[weatherCloudDriftSlow_1.75s_ease-in-out_infinite] motion-reduce:!animate-none`} />
        <path d="M7 19h10a4 4 0 0 0 .4-7.98A5 5 0 0 0 8 10.5 4 4 0 0 0 7 19z"
          fill={`url(#${cloudGradId})`}
          className={`${animated ? 'animate-[weatherCloudDriftSlow_6s_ease-in-out_infinite]' : ''} group-hover/weather:animate-[weatherCloudDriftFast_1.3s_ease-in-out_infinite] motion-reduce:!animate-none`}
          style={{ animationDelay: '0.2s' }} />
      </svg>
    )
  } else if (group === 'fog') {
    icon = (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {[7, 12, 17].map((y, i) => (
          <line key={y} x1="3" y1={y} x2="21" y2={y}
            className={`${animated ? 'animate-[weatherFogDrift_3.5s_ease-in-out_infinite]' : ''} group-hover/weather:animate-[weatherFogDrift_1.1s_ease-in-out_infinite] motion-reduce:!animate-none`}
            style={{ animationDelay: `${i * 0.25}s` }} />
        ))}
      </svg>
    )
  } else if (group === 'rain') {
    icon = (
      <svg width={s} height={s} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <defs>{cloudDefs}</defs>
        <path d="M6 13h11a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7.1 7.5 4 4 0 0 0 6 13z" fill={`url(#${cloudGradId})`} />
        {[9, 13, 17].map((x, i) => (
          <line key={x} x1={x} y1="15" x2={x - 2} y2="20" strokeLinecap="round"
            className={`${animated ? 'animate-[weatherDropFall_1.8s_linear_infinite]' : ''} group-hover/weather:animate-[weatherDropFall_0.55s_linear_infinite] motion-reduce:!animate-none`}
            style={{ animationDelay: `${i * 0.2}s` }} />
        ))}
      </svg>
    )
  } else if (group === 'snow') {
    icon = (
      <svg width={s} height={s} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <defs>{cloudDefs}</defs>
        <path d="M6 13h11a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7.1 7.5 4 4 0 0 0 6 13z" fill={`url(#${cloudGradId})`} opacity="0.85" />
        {[8, 12, 16, 12].map((x, i) => (
          <circle key={i} cx={x} cy="16" r="1.1" fill="currentColor" stroke="none"
            className={`${animated ? 'animate-[weatherFlakeDrift_2.4s_ease-in-out_infinite]' : ''} group-hover/weather:animate-[weatherFlakeDrift_0.8s_ease-in-out_infinite] motion-reduce:!animate-none`}
            style={{ animationDelay: `${i * 0.3}s` }} />
        ))}
      </svg>
    )
  } else {
    // storm
    icon = (
      <svg width={s} height={s} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <defs>{cloudDefs}</defs>
        <path d="M6 12h11a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7.1 6.5 4 4 0 0 0 6 12z" fill={`url(#${cloudGradId})`} />
        <line x1="8" y1="14" x2="6" y2="19" strokeLinecap="round"
          className={`${animated ? 'animate-[weatherDropFall_1.8s_linear_infinite]' : ''} group-hover/weather:animate-[weatherDropFall_0.55s_linear_infinite] motion-reduce:!animate-none`} />
        <line x1="17" y1="14" x2="15" y2="19" strokeLinecap="round"
          className={`${animated ? 'animate-[weatherDropFall_1.8s_linear_infinite]' : ''} group-hover/weather:animate-[weatherDropFall_0.55s_linear_infinite] motion-reduce:!animate-none`}
          style={{ animationDelay: '0.3s' }} />
        <polygon points="13,13 10,18 12.5,18 11,22 15,16 12.5,16" stroke="none"
          className={`fill-amber-400 ${animated ? 'animate-[weatherLightningFlash_3.2s_ease-in-out_infinite]' : ''} group-hover/weather:animate-[weatherLightningFlash_1.25s_ease-in-out_infinite] motion-reduce:!animate-none`} />
      </svg>
    )
  }
  return (
    <span className="inline-flex origin-center transition-transform duration-200 ease-out group-hover/weather:scale-150 motion-reduce:!scale-100">
      {icon}
    </span>
  )
}

// Per-condition color for the icon itself (its strokes/fills use
// currentColor, so this is all it needs). The temp/humidity numbers in
// WeatherReadout below use their own fixed semantic colors instead, so
// the icon reads as a distinct color from the numbers beside it rather
// than everything sharing one flat color.
const WEATHER_COLOR_CLASS = {
  clear: 'text-amber-500',
  'partly-cloudy': 'text-amber-500',
  cloudy: 'text-sky-500',
  overcast: 'text-slate-500',
  fog: 'text-teal-500',
  rain: 'text-blue-600',
  snow: 'text-cyan-400',
  storm: 'text-slate-700',
}

// Beside the date number, every cell with forecast data (empty or not).
// `showText` (Week only, Month's cells are too small) adds temp/humidity,
// and also doubles as the idle-animation gate passed to WeatherIcon — Week's
// max-14-cell grid can afford ambient motion at rest, Month's up-to-42-cell
// grid can't. group/weather scopes the hover-to-life animation to just this
// element, independent of the day cell's own (unnamed) group used for its
// "Click to schedule" hover state.
function WeatherReadout({ forecast, showText }) {
  if (!forecast) return null
  const group = weatherGroup(forecast.code)
  const humidityText = forecast.humidity != null ? `${forecast.humidity}%` : '-'
  return (
    <div
      className={`group/weather flex items-center gap-1 flex-shrink-0 ${WEATHER_COLOR_CLASS[group]}`}
      title={`${forecast.tempMax}°C/${forecast.tempMin}°C (Celsius) · ${humidityText} humidity`}
    >
      <WeatherIcon group={group} size={showText ? 15 : 12} animated={showText} />
      {showText && (
        <span className="text-[9px] font-semibold whitespace-nowrap">
          <span className="text-orange-500">{forecast.tempMax}°C</span>
          <span className="text-gray-400">/</span>
          <span className="text-blue-500">{forecast.tempMin}°C</span>
          <span className="text-gray-400"> · </span>
          <span className="text-teal-500">{humidityText}</span>
        </span>
      )}
    </div>
  )
}

// One week's worth of the desktop grid — the weekend sea/sun are both sized
// and positioned relative to *this* row's own box (the water sits at a fixed
// bottom-0 h-24, the sun's left/top percentages resolve against one row's
// height), so the 2-week grid stacks two of these rather than feeding 14
// days into one taller shared grid, which would strand the sea/sun scaled to
// the wrong (2x taller) box and leave the top row's Sat/Sun cells dry.
// `now` is still passed in by both call sites below (unused here while the
// sun animation is disabled) so wiring it back up later is a one-line revert
// in this signature, not a call-site change too.
function WeekRow({ days, byDate, todayStr, canManage, onDayClick, onChipClick, onMoreClick, forecastByDate }) {
  return (
    <div className="grid grid-cols-7 relative">
      {/* Weekend sea — disabled for now, replacing with a real weather
          widget (device-location current conditions) later; keeping the
          markup here rather than deleting it so it's easy to bring back.
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none overflow-hidden z-0 opacity-70"
        style={{
          maskImage: WEEKEND_MASK,
          WebkitMaskImage: WEEKEND_MASK,
        }}
      >
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-sky-100/0 via-sky-100/30 to-sky-200/50" />
        <WaveLayer variant="back" />
        <WaveLayer variant="front" />
      </div>
      */}

      {days.map((d, i) => {
        const dateStr = fmtISO(d)
        const isWeekend = d.getDay() === 0 || d.getDay() === 6
        const dayEntries = byDate[dateStr] || []
        const visible = dayEntries.slice(0, 6)
        const extra = dayEntries.length - visible.length
        const empty = dayEntries.length === 0
        // Clickable regardless of whether the day already has entries —
        // scheduling another inspection on an already-scheduled day is a
        // normal thing to do, not just on empty ones.
        const clickable = canManage
        // Sun animation disabled alongside the sea above — see note there.
        // const sunrise = d.getDay() === 0
        //   ? sunStyle(now, { startHour: 9, startMinute: 30, endHour: 13, endMinute: 0, from: { left: 8, top: 82 }, to: { left: 82, top: 2 } })
        //   : null
        // const sunset = d.getDay() === 6
        //   ? sunStyle(now, { startHour: 13, startMinute: 0, endHour: 18, endMinute: 0, from: { left: 12, top: 4 }, to: { left: 84, top: 84 } })
        //   : null
        return (
          <div
            key={i}
            onClick={() => clickable && onDayClick(dateStr)}
            // Weekend cells stay unpositioned so their background paints
            // *below* the absolutely-positioned sea layer — the water and
            // ship are rendered there, not here.
            className={`group min-h-[285px] border-b border-r border-gray-100 p-1.5 last:border-r-0 transition-colors
              ${isWeekend ? 'bg-sky-50/30' : 'bg-white'}
              ${clickable ? 'cursor-pointer hover:bg-gray-50/80' : ''}`}
          >
            {/* Lifted above the ship layer (z-0) so chips are never covered.
                h-full so the sun's left/top percentages below resolve
                against the whole cell, not just this wrapper's own
                (possibly much shorter, content-sized) height. No
                overflow-hidden here (unlike when the sun arc was live,
                see the disabled block below): the weather icon's
                hover-grow needs room to visually spill past this box
                instead of being clipped at its own edges. */}
            <div className="relative z-10 h-full flex flex-col">
            {/* Sun animation disabled — see note above WeekRow's sea overlay.
            {(sunrise || sunset) && (() => {
              const sun = sunrise || sunset
              return (
                <div
                  aria-hidden="true"
                  style={{ left: sun.left, top: sun.top, opacity: sun.opacity }}
                  className="absolute w-8 h-8 transition-all duration-1000 ease-linear motion-reduce:transition-none pointer-events-none"
                >
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-200 via-amber-300 to-orange-400 shadow-[0_0_18px_6px_rgba(251,191,36,0.55)]" style={{ opacity: (1 - sun.underwater) * 0.6 }} />
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-400 via-orange-500 to-red-500 shadow-[0_0_18px_6px_rgba(249,115,22,0.6)]" style={{ opacity: sun.underwater }} />
                </div>
              )
            })()}
            */}
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className={`text-[11px] font-bold ${
                dateStr === todayStr
                  ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-900 text-white shadow-sm ring-2 ring-gray-900/10'
                  : 'text-gray-700'
              }`}>
                {d.getDate()}
              </span>
              <WeatherReadout forecast={forecastByDate?.[dateStr]} showText />
            </div>
            {clickable && empty ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-gray-300 group-hover:text-gray-400 transition-colors pointer-events-none">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                <span className="text-[11px] font-semibold">Click to schedule</span>
              </div>
            ) : (
              <div className="space-y-1">
                {visible.map(e => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); onChipClick(d, e) }}
                    className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate cursor-pointer transition-all hover:shadow-sm hover:brightness-95 ${STATUS_CHIP[effectiveStatus(e)]}`}
                  >
                    {e.purchase_orders?.po_number || 'PO'} · {STAGE_ABBR[e.inspection_type]} · {firstName(e.organization_members?.full_name)}
                  </button>
                ))}
                {extra > 0 && (
                  <button
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); onMoreClick(dateStr) }}
                    className="w-full text-left px-1.5 text-[10px] font-semibold text-gray-400 hover:text-gray-700 cursor-pointer"
                  >
                    +{extra} more
                  </button>
                )}
                {clickable && (
                  <button
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); onDayClick(dateStr) }}
                    className="w-full flex items-center gap-1 text-left px-1.5 py-0.5 rounded text-[10px] font-semibold text-gray-300 hover:text-gray-500 hover:bg-gray-50 cursor-pointer"
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Add inspection
                  </button>
                )}
              </div>
            )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Google-Calendar-style view dropdown — sits right after the Today button.
function ViewSelector({ view, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex-shrink-0 ml-1 flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 hover:shadow transition-all cursor-pointer"
      >
        {VIEW_LABELS[view]}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 w-28 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
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

// Shared cell renderer for Day / 4-day / Month views — no sea/sun (that's a
// deliberate Week-only flourish tied to a fixed 7-column layout that doesn't
// generalize to 1/4-wide grids anyway). `cols` picks the column count and,
// for 7, the denser month-grid sizing/chip cap; `dimMonth` (Month view only)
// grays out padding days that spill into the adjacent month; `showFullLabel`
// (Day/4-day only) shows the weekday+date in-cell since there's no shared
// weekday header row above those views.
function DayCells({ days, cols, byDate, todayStr, canManage, dimMonth, showFullLabel, onDayClick, onChipClick, onMoreClick, forecastByDate }) {
  const colClass = cols === 1 ? 'grid-cols-1' : cols === 4 ? 'grid-cols-4' : 'grid-cols-7'
  const cellH = cols === 7 ? 'min-h-[90px] sm:min-h-[110px]' : 'min-h-[220px] sm:min-h-[300px]'
  const chipCap = cols === 7 ? 2 : 6
  return (
    <div className={`grid ${colClass}`}>
      {days.map((d, i) => {
        const dateStr = fmtISO(d)
        const dayEntries = byDate[dateStr] || []
        const visible = dayEntries.slice(0, chipCap)
        const extra = dayEntries.length - visible.length
        const empty = dayEntries.length === 0
        // Day/4-day cells have room to stay clickable (add another
        // inspection) even once they already have entries; Month's cells
        // are too cramped for that, so they stay empty-only.
        const clickable = showFullLabel ? canManage : (canManage && empty)
        const outsideMonth = dimMonth != null && d.getMonth() !== dimMonth
        return (
          <div
            key={i}
            onClick={() => clickable && onDayClick(dateStr)}
            className={`group ${cellH} border-b border-r border-gray-100 p-1.5 last:border-r-0 transition-colors flex flex-col
              ${outsideMonth ? 'bg-gray-50/50' : 'bg-white'}
              ${clickable ? 'cursor-pointer hover:bg-gray-50/80' : ''}`}
          >
            <div className={`flex items-center gap-1 mb-1 ${dimMonth != null ? 'justify-between' : ''}`}>
              <span className={`text-[11px] font-bold ${
                dateStr === todayStr
                  ? showFullLabel
                    ? 'inline-flex items-center px-2 py-0.5 rounded-full bg-gray-900 text-white shadow-sm ring-2 ring-gray-900/10'
                    : 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-900 text-white shadow-sm ring-2 ring-gray-900/10'
                  : outsideMonth ? 'text-gray-300' : 'text-gray-700'
              }`}>
                {showFullLabel ? fmtDayHeader(d) : d.getDate()}
              </span>
              {/* Month view only, icon-only. Day/4-day and Year are out of
                  scope, and there's no room for temp/humidity text here. */}
              {dimMonth != null && <WeatherReadout forecast={forecastByDate?.[dateStr]} />}
            </div>
            {clickable && empty && showFullLabel ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-gray-300 group-hover:text-gray-400 transition-colors pointer-events-none">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                <span className="text-[11px] font-semibold">Click to schedule</span>
              </div>
            ) : (
            <div className="space-y-1">
              {visible.map(e => (
                <button
                  key={e.id}
                  type="button"
                  onClick={ev => { ev.stopPropagation(); onChipClick(d, e) }}
                  className={`w-full text-left px-1.5 rounded text-[10px] font-medium cursor-pointer transition-all hover:shadow-sm hover:brightness-95 ${showFullLabel ? 'py-1' : 'py-0.5 truncate'} ${STATUS_CHIP[effectiveStatus(e)]}`}
                >
                  {showFullLabel ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{e.purchase_orders?.po_number || 'PO'} · {STAGE_ABBR[e.inspection_type]}</span>
                        {fmtTime(e.scheduled_time) && <span className="flex-shrink-0 opacity-70">{fmtTime(e.scheduled_time)}</span>}
                      </div>
                      <div className="truncate opacity-80">{e.organization_members?.full_name || 'Unassigned'} · {remainingSkusForEntry(e)} SKU{remainingSkusForEntry(e) === 1 ? '' : 's'} to inspect</div>
                    </>
                  ) : (
                    <>{e.purchase_orders?.po_number || 'PO'} · {STAGE_ABBR[e.inspection_type]} · {firstName(e.organization_members?.full_name)}</>
                  )}
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
              {clickable && showFullLabel && (
                <button
                  type="button"
                  onClick={ev => { ev.stopPropagation(); onDayClick(dateStr) }}
                  className="w-full flex items-center gap-1 text-left px-1.5 py-0.5 rounded text-[10px] font-semibold text-gray-300 hover:text-gray-500 hover:bg-gray-50 cursor-pointer"
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Add inspection
                </button>
              )}
            </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Year view — tiles the existing MiniMonthCalendar 12 times rather than
// building a separate calendar renderer; each tile already has dots/hover
// preview/click-to-select for free.
function YearGrid({ year, cursor, todayStr, byDate, onSelectDay, onHoverDay, onLeaveDay }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 12 }, (_, m) => (
        <MiniMonthCalendar
          key={m}
          year={year}
          month={m}
          cursor={cursor}
          todayStr={todayStr}
          byDate={byDate}
          onSelectDate={onSelectDay}
          onHoverDay={onHoverDay}
          onLeaveDay={onLeaveDay}
          hideNav
        />
      ))}
    </div>
  )
}

function MiniMonthCalendar({ year, month, cursor, todayStr, byDate, onSelectDate, onPrevMonth, onNextMonth, onHoverDay, onLeaveDay, hideNav }) {
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
        {WEEKDAYS.map(w => (
          <div key={w} className="text-[11px] font-bold text-gray-400 text-center">{w[0]}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-2">
        {grid.map((d, i) => {
          const dateStr = fmtISO(d)
          const inMonth = d.getMonth() === month
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedStr
          const dayEntries = byDate[dateStr]
          const dot = dayDotColor(dayEntries)
          return (
            <div key={i} className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => onSelectDate(d)}
                onMouseEnter={(ev) => dayEntries?.length && onHoverDay(dateStr, dayEntries, ev.currentTarget)}
                onMouseLeave={() => dayEntries?.length && onLeaveDay()}
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

function AgendaView({ days, byDate, todayStr, canManage, onSelectEntry, onCreateDay }) {
  // Always the week's 7 days, including empty ones — short enough to fully
  // enumerate, unlike a month would be on a phone.
  const visibleDays = days

  return (
    <div className="space-y-3">
      {visibleDays.map(d => {
        const dateStr = fmtISO(d)
        const isToday = dateStr === todayStr
        const dayEntries = byDate[dateStr] || []
        return (
          <div
            key={dateStr}
            // scroll-mt clears the sticky header above (see the Today
            // button's own scrollIntoView) so this day-group lands fully
            // visible below it, not hidden underneath.
            {...(isToday ? { id: 'today-agenda-anchor' } : {})}
            className="bg-white scroll-mt-32 sm:scroll-mt-20"
          >
            <div className={`px-3 py-2 text-xs font-bold flex items-center gap-2 ${isToday ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-700'}`}>
              {fmtDayHeader(d)}
              {isToday && <span className="text-[9px] font-semibold uppercase tracking-wide opacity-70">Today</span>}
            </div>
            {dayEntries.length === 0 ? (
              <button
                type="button"
                disabled={!canManage}
                onClick={() => canManage && onCreateDay(dateStr)}
                className="w-full text-left px-3 py-3 text-xs text-gray-400 italic disabled:cursor-default"
              >
                No inspections scheduled{canManage ? ' - tap to schedule one' : ''}
              </button>
            ) : (
              // Timeline rail: each entry's dot sits on a line built from two
              // half-height segments (one above, one below) rather than a
              // single line absolutely positioned across the whole list -
              // consecutive rows' segments simply butt up against each other
              // to read as one continuous rail, with no row-height math to
              // get wrong. Only the first row skips its upper segment and
              // only the last skips its lower one, so the rail never
              // overshoots the first/last dot.
              dayEntries.map((e, i) => {
                const status = effectiveStatus(e)
                const supplier = e.purchase_orders?.buyer_supplier_links?.supplier
                const buyerName = e.purchase_orders?.buyer_supplier_links?.buyer?.display_name
                const vendorName = supplier?.display_name
                const region = [supplier?.state, supplier?.country].filter(Boolean).join(', ')
                const skuCount = remainingSkusForEntry(e)
                const time = fmtTime(e.scheduled_time)
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onSelectEntry(e)}
                    className="w-full text-left flex items-stretch hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="relative w-6 flex-shrink-0 flex justify-center">
                      {i > 0 && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-1/2 bg-gray-200" />}
                      {i < dayEntries.length - 1 && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-1/2 bg-gray-200" />}
                      <span className={`relative z-10 mt-3.5 w-3 h-3 rounded-full ring-2 ring-white flex-shrink-0 ${STATUS_DOT[status]}`} />
                    </div>
                    <div className="min-w-0 flex-1 py-2.5 pr-3 border-b border-gray-100 last:border-b-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-1.5">
                          <span className="text-sm font-bold text-gray-900 truncate">{e.purchase_orders?.po_number || 'PO'}</span>
                        </div>
                        <span className={`flex-shrink-0 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>
                          {status}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 truncate mt-0.5">
                        {STAGE_ABBR[e.inspection_type] || e.inspection_type} · {e.organization_members?.full_name || 'Unassigned'}
                        {time && <span className="text-gray-400"> · {time}</span>}
                      </div>
                      {(buyerName || vendorName) && (
                        <div className="text-[10px] text-gray-400 truncate mt-0.5">
                          {buyerName}{buyerName && vendorName ? ' · ' : ''}{vendorName}
                        </div>
                      )}
                      {region && (
                        <div className="text-[10px] text-gray-400 truncate mt-0.5">{region}</div>
                      )}
                      {/* Own line, always last - kept separate from Region
                          rather than sharing one line with it, so it lands
                          in the same spot on every card instead of shifting
                          around depending on how long the region text is. */}
                      {skuCount != null && (
                        <div className="text-[10px] text-gray-400 truncate mt-0.5">
                          {skuCount} SKU{skuCount !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        )
      })}
    </div>
  )
}

// Mobile card for "This week's inspections" - the phone-width substitute for
// the desktop table's 9 fixed columns (InspectionSchedule.jsx's own version
// of the table→card pattern, reused for every other list in this session's
// mobile pass). Collapsed by default; tap expands to reveal the columns that
// don't fit as a header line (SKUs to inspect, QA, Edit).
function PeriodEntryCard({ entry: e, canManage, highlighted, cardRef, onEdit }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      ref={cardRef}
      className={`transition-colors duration-500 ${highlighted ? 'bg-amber-100' : 'bg-white'}`}
    >
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full text-left px-3.5 py-3 cursor-pointer"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-gray-900 truncate">{e.purchase_orders?.po_number || 'PO'}</span>
          <span className={`flex-shrink-0 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_BADGE[effectiveStatus(e)]}`}>
            {effectiveStatus(e)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-indigo-50 text-indigo-600">
            {e.inspection_type}
          </span>
          <span className="text-[11px] text-gray-500">{fmtDisplayDate(e.scheduled_date)}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`ml-auto text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
        <div className="text-[11px] text-gray-400 truncate mt-1">
          {e.purchase_orders?.buyer_supplier_links?.buyer?.display_name || '-'} · {e.purchase_orders?.buyer_supplier_links?.supplier?.display_name || '-'}
        </div>
      </button>
      {expanded && (
        <div className="px-3.5 pb-3 flex items-center justify-between gap-3 text-[11px] text-gray-500 border-t border-gray-50 pt-2.5" onClick={e2 => e2.stopPropagation()}>
          <span>{remainingSkusForEntry(e)} SKU{remainingSkusForEntry(e) === 1 ? '' : 's'} to inspect</span>
          <span className="truncate">{e.organization_members?.full_name || 'Unassigned'}</span>
          {canManage && (
            <button type="button" onClick={onEdit}
              className="flex-shrink-0 px-2.5 py-1 rounded text-[10px] font-semibold text-white bg-gray-900 hover:bg-gray-700 transition-colors cursor-pointer">
              Edit
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, capitalize }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex-shrink-0">{label}</span>
      <span className={`text-xs text-gray-800 text-right ${capitalize ? 'capitalize' : ''}`}>{value}</span>
    </div>
  )
}

function DetailModal({ entry, canManage, onClose, onEdit }) {
  // Portaled to document.body, not rendered inline - `fixed inset-0` only
  // covers the true viewport when nothing between it and the page root has
  // a CSS transform; this component is mounted inside the page's own
  // nested layout divs, so without the portal it could get clipped/
  // repositioned relative to whichever ancestor happens to establish one,
  // instead of covering the whole screen.
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="text-sm font-bold text-gray-900">{entry.purchase_orders?.po_number || 'PO'}</div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-2.5">
          <Row label="Stage" value={entry.inspection_type} capitalize />
          <Row label="Date" value={entry.scheduled_date} />
          <Row label="QA" value={entry.organization_members?.full_name || '-'} />
          <Row label="Status" value={effectiveStatus(entry)} capitalize />
          {entry.notes && <Row label="Notes" value={entry.notes} />}
        </div>
        {canManage && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
            <button type="button" onClick={onEdit} className="px-3 py-2 rounded-lg text-xs font-semibold text-white bg-gray-900 hover:bg-gray-700 transition-colors cursor-pointer">
              Edit
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

function DayListModal({ date, entries, onClose, onSelect }) {
  // Portaled to document.body for the same reason DetailModal is - see its
  // own comment above.
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-sm max-h-[80vh] sm:max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="text-sm font-bold text-gray-900">{date}</div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-3 py-3 space-y-1.5">
          {entries.map(e => (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelect(e)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium cursor-pointer ${STATUS_CHIP[effectiveStatus(e)]}`}
            >
              {e.purchase_orders?.po_number || 'PO'} · {STAGE_ABBR[e.inspection_type]} · {e.organization_members?.full_name || 'QA'}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

// This app's dashboard shell (Dashboard.jsx) scrolls one specific element,
// the <section data-app-scroll-root> wrapping every page's content, not
// the window/document, so `window.scrollY` never moves and a window-based
// version of this would always look like there's nowhere to scroll.
// Queried directly by that marker rather than inferred by walking up
// computed styles: the walk-up approach is what kept silently locking onto
// the wrong ancestor (an intermediate wrapper that happens to also carry an
// auto/scroll overflow style, or the mismatch between "has the CSS
// property" vs. "is actually overflowing at this instant"), so this trades
// that guesswork for an unambiguous, direct lookup. Falls back to the old
// walk-up only if that marker isn't present for some reason (e.g. rendered
// outside this app's shell), and finally to document.scrollingElement.
function getScrollParent(el) {
  const marked = document.querySelector('[data-app-scroll-root]')
  if (marked) return marked
  let node = el?.parentElement
  while (node) {
    const style = window.getComputedStyle(node)
    if (/(auto|scroll)/.test(style.overflowY)) return node
    node = node.parentElement
  }
  return document.scrollingElement || document.documentElement
}

// Floating jump-to-top / jump-to-bottom pair, fixed to the viewport corner.
// This page can run long (calendar grid + the inspections table below it),
// so this saves scrolling by hand. Each button hides itself once there's
// nowhere further to go in that direction, rather than always showing both.
function ScrollNav() {
  const anchorRef = useRef(null)
  const scrollParentRef = useRef(null)
  const [atTop, setAtTop] = useState(true)
  const [atBottom, setAtBottom] = useState(false)

  useEffect(() => {
    const parent = getScrollParent(anchorRef.current)
    scrollParentRef.current = parent
    const onScroll = () => {
      const max = parent.scrollHeight - parent.clientHeight
      setAtTop(parent.scrollTop <= 4)
      setAtBottom(max <= 4 || parent.scrollTop >= max - 4)
    }
    onScroll()
    parent.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    // This page's content (calendar entries, the inspections table) loads
    // asynchronously after mount, well after the first onScroll() snapshot
    // above. With nothing else to trigger a recheck, that stale "nothing
    // to scroll yet" snapshot left both buttons stuck hidden even once the
    // page had clearly grown taller than the viewport. A MutationObserver
    // catches that content arriving, regardless of which descendant grows.
    const mutationObserver = new MutationObserver(onScroll)
    mutationObserver.observe(parent, { childList: true, subtree: true })
    return () => {
      parent.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      mutationObserver.disconnect()
    }
  }, [])

  const scrollTo = (top) => scrollParentRef.current?.scrollTo({ top, behavior: 'smooth' })

  return (
    <div ref={anchorRef} className="fixed bottom-6 right-6 z-40 flex flex-col gap-2">
      {!(atTop && atBottom) && !atTop && (
        <button
          type="button"
          onClick={() => scrollTo(0)}
          title="Scroll to top"
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-md text-gray-500 hover:text-gray-900 hover:shadow-lg transition-all cursor-pointer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6" /></svg>
        </button>
      )}
      {!(atTop && atBottom) && !atBottom && (
        <button
          type="button"
          onClick={() => scrollTo(scrollParentRef.current?.scrollHeight ?? 0)}
          title="Scroll to bottom"
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-md text-gray-500 hover:text-gray-900 hover:shadow-lg transition-all cursor-pointer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      )}
    </div>
  )
}
