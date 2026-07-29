import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

export default function SearchableSelect({
  options = [],          // [{ value, label }]
  value = '',
  onChange,
  placeholder = 'Select…',
  disabled = false,
  loading = false,
  triggerClassName = '',
  dropdownClassName = '',
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

  const selected = options.find(o => String(o.value) === String(value))

  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  // Reset highlight when search changes or dropdown opens
  useEffect(() => { setHi(-1) }, [search, open])

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || hi < 0 || !listRef.current) return
    listRef.current.querySelectorAll('[data-opt]')[hi]?.scrollIntoView({ block: 'nearest' })
  }, [hi, open])

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current?.contains(e.target)) return
      if (dropdownRef.current?.contains(e.target)) return
      setOpen(false)
      setSearch('')
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Rendered via a portal (see below) so it can float above ancestors that
  // clip with overflow-hidden/auto — position is tracked in viewport
  // coordinates and kept in sync with scrolling/resizing ancestors instead
  // of relying on normal document flow.
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
    setSearch('')
    setTimeout(() => searchRef.current?.focus(), 30)
  }

  const closeAndSelect = (val) => {
    onChange(val)
    setOpen(false)
    setSearch('')
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown')  { e.preventDefault(); setHi(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHi(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter')     { e.preventDefault(); if (hi >= 0 && filtered[hi]) closeAndSelect(filtered[hi].value) }
    else if (e.key === 'Escape')    { setOpen(false); setSearch('') }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => open ? (setOpen(false), setSearch('')) : openDropdown()}
        disabled={disabled || loading}
        className={`flex items-center gap-1 w-full text-left ${triggerClassName}`}
      >
        <span className={`flex-1 truncate min-w-0 ${!selected ? 'opacity-40' : ''}`}>
          {loading ? 'Loading…' : selected ? selected.label : placeholder}
        </span>
        <svg
          width="10" height="10" viewBox="0 0 10 6" fill="none"
          className={`flex-shrink-0 ml-0.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && rect && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            left: rect.left,
            width: rect.width,
            ...(openUpward ? { bottom: window.innerHeight - rect.top + 2 } : { top: rect.bottom + 2 }),
          }}
          className={`z-[10050] bg-white shadow-lg ${dropdownClassName}`}
        >
          {/* Search input */}
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
                placeholder="Search…"
                className="flex-1 bg-transparent outline-none text-[12px] placeholder:text-black/50"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-black/30 hover:text-black flex-shrink-0 text-[14px] leading-none">×</button>
              )}
            </div>
          </div>

          {/* Options */}
          <div ref={listRef} className="max-h-44 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-black/40 italic">No results</p>
            ) : (
              filtered.map((o, i) => (
                <div
                  key={o.value}
                  data-opt
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={e => { e.preventDefault(); closeAndSelect(o.value) }}
                  className={`px-3 py-1.5 cursor-pointer flex items-center gap-2 text-[12px]
                    ${hi === i ? 'bg-black/[.08]' : String(o.value) === String(value) ? 'bg-black/[.06] font-semibold' : 'hover:bg-black/[.04]'}`}
                >
                  <span className={`w-3.5 text-[10px] flex-shrink-0 ${String(o.value) === String(value) ? '' : 'invisible'}`}>✓</span>
                  {o.label}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
