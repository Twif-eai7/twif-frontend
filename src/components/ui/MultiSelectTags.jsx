import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

// Multi-value sibling of SearchableSelect — keyboard-navigable, type-to-filter
// dropdown that stays open after each pick so multiple options can be tagged
// in quick succession (e.g. tagging several PO numbers onto one invoice).
export default function MultiSelectTags({
  options = [],          // [{ value, label, hint? }]
  value = [],             // array of selected values
  onChange,               // (array) => void
  placeholder = 'Search…',
  disabled = false,
  loading = false,
  triggerClassName = '',
  dropdownClassName = '',
  maxResults,              // cap how many options are shown at once; rest accessible via search
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [hi, setHi] = useState(-1)
  const [openUpward, setOpenUpward] = useState(false)
  const [rect, setRect] = useState(null)
  const containerRef = useRef(null)
  const dropdownRef = useRef(null)
  const searchRef = useRef(null)
  const listRef = useRef(null)

  const selectedSet = new Set(value.map(String))
  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  useEffect(() => { setHi(-1) }, [search, open])

  useEffect(() => {
    if (!open || hi < 0 || !listRef.current) return
    listRef.current.querySelectorAll('[data-opt]')[hi]?.scrollIntoView({ block: 'nearest' })
  }, [hi, open])

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current?.contains(e.target)) return
      if (dropdownRef.current?.contains(e.target)) return
      setOpen(false); setSearch('')
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Rendered via a portal (see below) so it can float above ancestors that
  // clip with overflow-hidden/auto — position tracked in viewport
  // coordinates and kept in sync with scrolling/resizing ancestors.
  const updateRect = useCallback(() => {
    const r = containerRef.current?.getBoundingClientRect()
    if (!r) return
    setOpenUpward((window.innerHeight - r.bottom) < 220 && r.top > (window.innerHeight - r.bottom))
    setRect(r)
  }, [])

  useEffect(() => {
    if (!open) return
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [open, updateRect])

  const openDropdown = () => {
    if (disabled || loading) return
    updateRect()
    setOpen(true)
    setTimeout(() => searchRef.current?.focus(), 30)
  }

  const toggle = (val) => {
    const key = String(val)
    if (selectedSet.has(key)) {
      onChange(value.filter(v => String(v) !== key))
    } else {
      onChange([...value, val])
    }
    // dropdown stays open — multi-pick
  }

  const remove = (val) => onChange(value.filter(v => String(v) !== String(val)))

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown')   { e.preventDefault(); setHi(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); setHi(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter')      { e.preventDefault(); if (hi >= 0 && filtered[hi]) toggle(filtered[hi].value) }
    else if (e.key === 'Escape')     { setOpen(false) }
    else if (e.key === 'Backspace' && !search && value.length) { remove(value[value.length - 1]) }
  }

  const selectedOptions = value
    .map(v => options.find(o => String(o.value) === String(v)))
    .filter(Boolean)

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        onClick={openDropdown}
        className={`flex flex-wrap items-center gap-1.5 cursor-text ${triggerClassName}`}
      >
        {selectedOptions.map(o => (
          <span key={o.value} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-900 text-white text-[11px] font-medium">
            {o.label}
            {!disabled && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); remove(o.value) }}
                className="text-white/60 hover:text-white leading-none"
              >
                ×
              </button>
            )}
          </span>
        ))}
        <span className={`text-sm ${selectedOptions.length ? 'text-gray-300' : 'text-gray-400'} flex-1 min-w-[6rem]`}>
          {loading ? 'Loading…' : selectedOptions.length === 0 ? placeholder : ''}
        </span>
      </div>

      {open && rect && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            left: rect.left,
            width: rect.width,
            ...(openUpward ? { bottom: window.innerHeight - rect.top + 2 } : { top: rect.bottom + 2 }),
          }}
          className={`z-[200] bg-white shadow-lg ${dropdownClassName}`}
        >
          <div className="p-1.5 border-b border-black/[.08]">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/[.04]">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-black/30 flex-shrink-0">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Type to filter…"
                className="flex-1 bg-transparent outline-none text-[12px] placeholder:text-black/30"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-black/30 hover:text-black flex-shrink-0 text-[14px] leading-none">×</button>
              )}
            </div>
          </div>

          <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: maxResults ? `${maxResults * 32}px` : '12rem' }}>
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-black/40 italic">No results</p>
            ) : (
              filtered.map((o, i) => {
                const picked = selectedSet.has(String(o.value))
                return (
                  <div
                    key={o.value}
                    data-opt
                    onMouseEnter={() => setHi(i)}
                    onMouseDown={e => { e.preventDefault(); toggle(o.value) }}
                    className={`px-3 py-1.5 cursor-pointer flex items-center gap-2 text-[12px]
                      ${hi === i ? 'bg-black/[.08]' : picked ? 'bg-black/[.06] font-semibold' : 'hover:bg-black/[.04]'}`}
                  >
                    <span className={`w-3.5 text-[10px] flex-shrink-0 ${picked ? '' : 'invisible'}`}>✓</span>
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="text-[10px] text-black/30 flex-shrink-0">{o.hint}</span>}
                  </div>
                )
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
