import { useState, useEffect, useRef } from 'react'
import CourierBrandText from './CourierBrandText'

const inputCls = 'px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900 bg-white w-full'

function Field({ label, required, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

export default function CourierSearchSelect({ label, required, value, onChange, options, placeholder = 'Search…' }) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const ref = useRef(null)
  const inputRef = useRef(null)
  const itemRefs = useRef([])

  const showBrand = value && options.includes(value) && !editing

  useEffect(() => { setQuery(value || '') }, [value])

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
        setEditing(false)
        setHighlightedIndex(-1)
        setQuery(value || '')
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [value])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? options.filter(name => name.toLowerCase().startsWith(q))
    : options

  const pick = (name) => {
    onChange(name)
    setQuery(name)
    setOpen(false)
    setEditing(false)
    setHighlightedIndex(-1)
    inputRef.current?.blur()
  }

  const startEditing = () => {
    setEditing(true)
    setOpen(true)
    setQuery(value || '')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const handleKeyDown = (e) => {
    if (showBrand) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key.length === 1) startEditing()
      return
    }
    if (!open) {
      if (e.key === 'ArrowDown') { setOpen(true); setHighlightedIndex(0) }
      return
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        setEditing(false)
        setHighlightedIndex(-1)
        setQuery(value || '')
        inputRef.current?.blur()
        break
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(i => {
          const next = Math.min(i + 1, filtered.length - 1)
          itemRefs.current[next]?.scrollIntoView({ block: 'nearest' })
          return next
        })
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(i => {
          const next = Math.max(i - 1, 0)
          itemRefs.current[next]?.scrollIntoView({ block: 'nearest' })
          return next
        })
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
          pick(filtered[highlightedIndex])
        }
        break
    }
  }

  return (
    <Field label={label} required={required}>
      <div ref={ref} className="relative">
        {showBrand ? (
          <button type="button" onClick={startEditing} onKeyDown={handleKeyDown}
            className={`${inputCls} flex items-center min-h-[30px] text-left cursor-text`}>
            <CourierBrandText name={value} size="sm" />
          </button>
        ) : (
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); setHighlightedIndex(-1) }}
            onFocus={() => { setEditing(true); setOpen(true) }}
            onBlur={() => {
              setEditing(false)
              setOpen(false)
              setHighlightedIndex(-1)
              setQuery(value || '')
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            className={inputCls}
          />
        )}
        {open && filtered.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[200] max-h-[220px] overflow-y-auto">
            {filtered.map((name, i) => (
              <button key={name} type="button"
                ref={el => { itemRefs.current[i] = el }}
                onMouseDown={() => pick(name)}
                onMouseEnter={() => setHighlightedIndex(i)}
                className={`w-full flex items-center px-3 py-2.5 border-b border-gray-100 last:border-0 ${i === highlightedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                <CourierBrandText name={name} size="sm" />
              </button>
            ))}
          </div>
        )}
        {open && q && filtered.length === 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[200] px-3 py-2 text-[10px] text-gray-400">
            No results found
          </div>
        )}
      </div>
    </Field>
  )
}
