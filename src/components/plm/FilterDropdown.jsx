import { useState, useRef, useEffect, useMemo, useCallback } from 'react'

// options: string[] OR { value: string, label: string }[]
export default function FilterDropdown({ options, value, onSelect, placeholder }) {
  const [open,     setOpen]     = useState(false)
  const [search,   setSearch]   = useState('')
  const [hi,       setHi]       = useState(0)
  const [flipLeft, setFlipLeft] = useState(false)
  const ref     = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch('') }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isObj = options.length > 0 && typeof options[0] === 'object'
  const getVal = opt => isObj ? opt.value : opt
  const getLbl = useCallback(opt => isObj ? opt.label : opt, [isObj])

  const filtered = useMemo(
    () => options.filter(o => getLbl(o).toLowerCase().includes(search.toLowerCase())),
    [options, search, getLbl]
  )

  useEffect(() => {
    if (!open || !listRef.current) return
    listRef.current.querySelectorAll('[data-opt]')[hi]?.scrollIntoView({ block: 'nearest' })
  }, [hi, open])

  const pick = (val) => { onSelect(val); setOpen(false); setSearch('') }

  const handleToggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setFlipLeft(window.innerWidth - rect.left < 300)
    }
    setHi(0)
    setOpen(v => !v)
  }

  const onKey = (e) => {
    const total = 1 + filtered.length
    if (e.key === 'ArrowDown')  { e.preventDefault(); setHi(i => Math.min(i + 1, total - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHi(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter')     { e.preventDefault(); if (hi === 0) pick('all'); else pick(getVal(filtered[hi - 1])) }
    else if (e.key === 'Escape')    { setOpen(false); setSearch('') }
  }

  const selectedLabel = value !== 'all'
    ? (isObj ? (options.find(o => o.value === value)?.label ?? value) : value)
    : null

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={handleToggle}
        className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 md:px-2.5 md:py-1.5 text-[9px] md:text-[9px] font-semibold uppercase tracking-[.06em] cursor-pointer hover:opacity-60 transition-opacity whitespace-nowrap border
          ${selectedLabel ? 'border-[#1A1A18]/60 bg-[#1A1A18]/[.04]' : 'border-black/20 bg-white'}`}
      >
        {selectedLabel && <span className="w-1.5 h-1.5 rounded-full bg-[#1A1A18] flex-shrink-0" />}
        <span className="text-[#1A1A18]">{placeholder}</span>
        <svg
          className={`w-2.5 h-2.5 md:w-3.5 md:h-3.5 text-black/40 transition-transform duration-150 flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className={`absolute top-[calc(100%+6px)] ${flipLeft ? 'right-0' : 'left-0'} z-[200] bg-[#F5F3EF] border border-black/[.18] min-w-[130px] md:min-w-[160px] max-w-[190px] md:max-w-[300px] shadow-lg`}>
          {/* Search input */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-black/10 bg-[#EDEAE4]">
            <svg className="w-2.5 h-2.5 md:w-3 md:h-3 text-black/35 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              autoFocus
              value={search}
              onChange={e => { setSearch(e.target.value); setHi(0) }}
              onKeyDown={onKey}
              placeholder="Search…"
              className="border-none outline-none bg-transparent text-[9px] md:text-[9px] uppercase tracking-[.04em] text-[#1A1A18] w-full placeholder:text-black/30 placeholder:normal-case placeholder:tracking-normal"
            />
          </div>

          {/* Options list */}
          <div ref={listRef} className="max-h-[200px] md:max-h-[260px] overflow-y-auto">
            <div
              data-opt
              onMouseEnter={() => setHi(0)}
              onClick={() => pick('all')}
              className={`px-2.5 py-1.5 text-[9px] md:text-[9px] font-semibold uppercase tracking-[.06em] cursor-pointer transition-colors whitespace-nowrap
                ${hi === 0 ? 'bg-black/10 text-[#1A1A18]' : !selectedLabel ? 'text-[#1A1A18] bg-black/5' : 'text-black/40 hover:bg-[#EDEAE4]'}`}
            >
              {placeholder}
            </div>
            <div className="h-px bg-black/10" />
            {filtered.map((opt, i) => {
              const v = getVal(opt)
              const l = getLbl(opt)
              return (
                <div
                  key={v}
                  data-opt
                  onMouseEnter={() => setHi(i + 1)}
                  onClick={() => pick(v)}
                  className={`px-2.5 py-1.5 text-[9px] md:text-[9px] font-semibold uppercase tracking-[.06em] cursor-pointer transition-colors whitespace-nowrap
                    ${hi === i + 1 ? 'bg-black/10 text-[#1A1A18]' : value === v ? 'bg-black/5 text-[#1A1A18]' : 'text-[#1A1A18] hover:bg-[#EDEAE4]'}`}
                >
                  {l}
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div className="px-2.5 py-1.5 text-[9px] md:text-[9px] text-black/30 uppercase tracking-[.06em]">No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
