import { useEffect, useMemo, useRef, useState } from 'react'
import { getCountries, getCountryCallingCode } from 'libphonenumber-js'
import { COUNTRY_TO_ISO2 } from '../../utils/fieldFormats'

// All ISO countries with an English name + dialing code, name-sorted.
const REGION_NAMES = (() => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }) } catch { return null }
})()

const DIAL_LIST = getCountries()
  .map(iso => {
    try {
      return { iso, name: REGION_NAMES?.of(iso) || iso, code: `+${getCountryCallingCode(iso)}` }
    } catch {
      return null
    }
  })
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name))

const CODES_BY_LENGTH = [...new Set(DIAL_LIST.map(d => d.code))].sort((a, b) => b.length - a.length)

function dialFromCountry(country) {
  const iso = COUNTRY_TO_ISO2[country]
  try { return iso ? `+${getCountryCallingCode(iso)}` : '+91' } catch { return '+91' }
}

function splitValue(full) {
  const s = (full || '').trim()
  const hit = CODES_BY_LENGTH.find(c => s.startsWith(c))
  return hit
    ? { dial: hit, number: s.slice(hit.length).trim() }
    : { dial: null, number: s.replace(/^\+/, '').trim() }
}

/**
 * Phone input: a searchable country dial-code picker + a national-number field.
 * Type a country name (e.g. "india") in the picker and its code (+91) is set.
 * `value` / `onChange` speak the combined string, e.g. "+91 9876543210"
 * (or "" when the number is empty), so callers treat it like a plain field.
 */
export function PhoneField({
  label, required, value, country, onChange, onBlur, error, wrapperClassName = '',
}) {
  const [dial, setDial] = useState(() => splitValue(value).dial || dialFromCountry(country))
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { number } = splitValue(value)

  const pickerRef = useRef(null)
  const searchRef = useRef(null)
  const lastValue = useRef(value)
  useEffect(() => { lastValue.current = value }, [value])

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    function onDocDown(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? DIAL_LIST.filter(d =>
        d.name.toLowerCase().includes(q) || d.code.includes(q) || d.iso.toLowerCase() === q)
      : DIAL_LIST
    return list.slice(0, 60)
  }, [query])

  function emit(nextDial, nextNumber) {
    const digits = (nextNumber || '').replace(/\D/g, '')
    const next = digits ? `${nextDial} ${digits}` : ''
    lastValue.current = next
    onChange(next)
  }

  function pick(d) {
    setDial(d.code)
    emit(d.code, number)
    setOpen(false)
    setQuery('')
  }

  const fieldBase =
    'px-3.5 py-2.5 border rounded-xl text-sm text-stone-900 bg-white outline-none ' +
    'transition-all duration-150 placeholder:text-stone-400 ' +
    'focus:border-stone-900 focus:ring-2 focus:ring-stone-900/8'
  const borderCls = error
    ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-500/10'
    : 'border-stone-300'

  return (
    <div className={`mb-4 ${wrapperClassName}`}>
      {label && (
        <label className="block text-sm font-medium text-stone-700 mb-1.5">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      <div className="flex gap-2">
        {/* Dial-code picker */}
        <div className="relative shrink-0" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            onBlur={() => !open && onBlur?.(lastValue.current)}
            className={`flex items-center gap-1 ${fieldBase} ${borderCls} cursor-pointer`}
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <span className="tabular-nums">{dial}</span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-stone-400">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {open && (
            <div className="absolute z-20 mt-1 w-64 bg-white border border-stone-200 rounded-xl shadow-lg">
              <div className="p-2 border-b border-stone-100">
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Type a country..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && matches[0]) { e.preventDefault(); pick(matches[0]) }
                    if (e.key === 'Escape') setOpen(false)
                  }}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:border-stone-400"
                />
              </div>
              <div className="max-h-56 overflow-y-auto py-1">
                {matches.length === 0 ? (
                  <div className="px-3 py-2.5 text-xs text-stone-400">No match</div>
                ) : (
                  matches.map(d => (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => pick(d)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-stone-50
                        ${d.code === dial ? 'text-stone-900 font-medium' : 'text-stone-600'}`}
                    >
                      <span className="truncate">{d.name}</span>
                      <span className="tabular-nums text-stone-400 shrink-0">{d.code}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* National number */}
        <input
          type="tel"
          inputMode="tel"
          placeholder="XXXXX XXXXX"
          value={number}
          onChange={e => emit(dial, e.target.value)}
          onBlur={() => onBlur?.(lastValue.current)}
          className={`w-full ${fieldBase} ${borderCls}`}
        />
      </div>

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  )
}
