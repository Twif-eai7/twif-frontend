import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { Spinner } from '../ui/Spinner'

const ROW_HEIGHT = 36     // px per option row — used to cap the panel to ~10 rows
const SEARCH_BAR_HEIGHT = 41
const VIEWPORT_MARGIN = 12 // never render flush against the window edge

// ─── Searchable select ────────────────────────────────────────
// A plain <select> with hundreds of orgs/members opens a native listbox that can run
// off the bottom of the screen with no way to search. This swaps in a small popover
// capped to ~10 visible rows (scrolls beyond that) with a type-to-filter input — and,
// since this is used inside centered modals where the trigger can sit low on screen,
// it measures available space on open and flips upward / shrinks to fit rather than
// spilling past the viewport edge.
export function SearchableSelect({ options, value, onChange, placeholder = 'Select…', disabled = false }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [panelStyle, setPanelStyle] = useState(null)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN
    const spaceAbove = rect.top - VIEWPORT_MARGIN
    const idealHeight = SEARCH_BAR_HEIGHT + ROW_HEIGHT * 10
    const openUpward = spaceBelow < Math.min(idealHeight, 160) && spaceAbove > spaceBelow

    const available = openUpward ? spaceAbove : spaceBelow
    const panelHeight = Math.max(SEARCH_BAR_HEIGHT + ROW_HEIGHT * 2, Math.min(idealHeight, available))

    setPanelStyle(openUpward
      ? { position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4, maxHeight: panelHeight }
      : { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, maxHeight: panelHeight })
  }, [open])

  const selected = options.find(o => o.value === value)
  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-left bg-white disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-stone-300 flex items-center justify-between gap-2"
      >
        <span className={selected ? 'text-stone-900' : 'text-stone-400'}>{selected ? selected.label : placeholder}</span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 text-stone-400"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && !disabled && panelStyle && (
        <div
          style={panelStyle}
          className="z-20 flex flex-col bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden"
        >
          <input
            autoFocus
            type="text"
            placeholder="Search…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm border-b border-stone-100 focus:outline-none flex-shrink-0"
          />
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-stone-400">No matches</div>
            ) : filtered.map(o => (
              <button
                type="button"
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); setQuery('') }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-stone-50 transition-colors ${o.value === value ? 'bg-stone-100 font-medium' : ''}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Multi-select searchable select ────────────────────────────
// Same popover as SearchableSelect, but for granting one capability to several people
// in one action (e.g. Permissions tab) — selected people show as removable chips above
// the trigger, and picking an option doesn't close the panel so you can keep adding.
export function MultiSearchableSelect({ options, values, onChange, placeholder = 'Select…', disabled = false }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [panelStyle, setPanelStyle] = useState(null)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN
    const spaceAbove = rect.top - VIEWPORT_MARGIN
    const idealHeight = SEARCH_BAR_HEIGHT + ROW_HEIGHT * 10
    const openUpward = spaceBelow < Math.min(idealHeight, 160) && spaceAbove > spaceBelow

    const available = openUpward ? spaceAbove : spaceBelow
    const panelHeight = Math.max(SEARCH_BAR_HEIGHT + ROW_HEIGHT * 2, Math.min(idealHeight, available))

    setPanelStyle(openUpward
      ? { position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4, maxHeight: panelHeight }
      : { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, maxHeight: panelHeight })
  }, [open])

  const selectedSet = new Set(values)
  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  function toggle(val) {
    onChange(selectedSet.has(val) ? values.filter(v => v !== val) : [...values, val])
  }

  return (
    <div ref={rootRef} className="relative">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {values.map(v => {
            const opt = options.find(o => o.value === v)
            return (
              <span key={v} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 bg-stone-100 border border-stone-200 rounded-full text-xs text-stone-700">
                {opt?.label || v}
                <button type="button" onClick={() => toggle(v)} className="text-stone-400 hover:text-red-600 leading-none">×</button>
              </span>
            )
          })}
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-left bg-white disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-stone-300 flex items-center justify-between gap-2"
      >
        <span className="text-stone-400">{values.length ? `Add another…` : placeholder}</span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 text-stone-400"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && !disabled && panelStyle && (
        <div
          style={panelStyle}
          className="z-20 flex flex-col bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden"
        >
          <input
            autoFocus
            type="text"
            placeholder="Search…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm border-b border-stone-100 focus:outline-none flex-shrink-0"
          />
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-stone-400">No matches</div>
            ) : filtered.map(o => (
              <button
                type="button"
                key={o.value}
                onClick={() => { toggle(o.value); setQuery('') }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-stone-50 transition-colors flex items-center gap-2 ${selectedSet.has(o.value) ? 'bg-stone-100 font-medium' : ''}`}
              >
                <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${selectedSet.has(o.value) ? 'bg-stone-900 border-stone-900' : 'border-stone-300'}`}>
                  {selectedSet.has(o.value) && <svg width="9" height="9" viewBox="0 0 16 16" fill="none"><path d="m3 8 3.5 3.5L13 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page header ──────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <h1 className="text-xl font-medium text-stone-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-stone-500 mt-1">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────
const BADGE = {
  active:    'bg-green-50 text-green-700 border-green-200',
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
  member:    'bg-sky-50 text-sky-700 border-sky-200',
  owner:     'bg-purple-50 text-purple-700 border-purple-200',
  admin:     'bg-stone-100 text-stone-700 border-stone-300',
  buyer:     'bg-teal-50 text-teal-700 border-teal-200',
  supplier:  'bg-orange-50 text-orange-700 border-orange-200',
  claim:     'bg-violet-50 text-violet-700 border-violet-200',
}

export function Badge({ label }) {
  const style = BADGE[label?.toLowerCase()] || 'bg-stone-100 text-stone-600 border-stone-200'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border capitalize ${style}`}>
      {label}
    </span>
  )
}

// ─── Stat card ────────────────────────────────────────────────
export function StatCard({ label, value, sub, onClick }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      className={`bg-white border border-stone-200 rounded-xl p-5 ${onClick ? 'cursor-pointer hover:border-stone-300 hover:shadow-sm transition' : ''}`}
    >
      <div className="text-xs font-medium text-stone-400 uppercase tracking-widest mb-2">{label}</div>
      <div className="text-3xl font-medium text-stone-900 tracking-tight">{value ?? '—'}</div>
      {sub && <div className="text-xs text-stone-400 mt-1">{sub}</div>}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────
export function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mb-4 text-stone-400">
        {icon}
      </div>
      <div className="text-sm font-medium text-stone-700 mb-1">{title}</div>
      {subtitle && <div className="text-xs text-stone-400 max-w-xs">{subtitle}</div>}
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────
export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-stone-100 rounded-lg animate-pulse" />
      ))}
    </div>
  )
}

// ─── Action buttons ───────────────────────────────────────────
export function ApproveButton({ onClick, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
    >
      {loading ? <Spinner size="w-3 h-3" light={false} /> : (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="m2 6 2.5 2.5 5.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      Approve
    </button>
  )
}

export function RejectButton({ onClick, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
    >
      {loading ? <Spinner size="w-3 h-3" light={false} /> : (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="m3 3 6 6m0-6L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
      Reject
    </button>
  )
}

// ─── Reject reason modal ──────────────────────────────────────
export function RejectModal({ title, onConfirm, onCancel, loading, requireReason = false, defaultReason = '' }) {
  const [reason, setReason] = useState(defaultReason)
  const blocked = loading || (requireReason && !reason.trim())
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xl w-full max-w-md p-6">
        <h3 className="text-base font-medium text-stone-900 mb-1">{title}</h3>
        <p className="text-sm text-stone-500 mb-4">
          {requireReason
            ? 'Add a reason - it is sent to the applicant and included with the agreement copy.'
            : 'This reason is sent to the applicant and included with the agreement copy.'}
        </p>
        <textarea
          className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 resize-none focus:outline-none focus:ring-2 focus:ring-stone-300 mb-4"
          rows={3}
          placeholder={requireReason ? 'Reason (required)' : 'Reason'}
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-stone-600 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={blocked}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {loading && <Spinner size="w-3 h-3" light />}
            Confirm rejection
          </button>
        </div>
      </div>
    </div>
  )
}