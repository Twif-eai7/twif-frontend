import { useState, useEffect } from 'react'
import { useMaterialOptions } from '../../hooks/useMaterialOptions'

// Real FK picker (unlike the free-text fields elsewhere in SkuReviewDrawer) —
// `value` is a material_options.id or null; selecting a suggestion is the
// only way to set it. Typing without picking a suggestion clears the
// selection rather than persisting arbitrary text, since there's no text
// column backing this field for new entries (see sql/material_options.sql).
// Suggestions are grouped by category (~19 groups, ~100 entries) since a
// flat list that size is hard to scan.
export default function MaterialSelectField({ label, value, onChange, legacyText }) {
  const { getMaterialOptions } = useMaterialOptions()
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery]     = useState('')
  const [open, setOpen]       = useState(false)

  useEffect(() => {
    getMaterialOptions().then(opts => { setOptions(opts); setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const display = (opt) => (opt.code ? `${opt.code} — ${opt.label}` : opt.label)

  // Keep the input text in sync with the current selection once options load
  useEffect(() => {
    if (!value) { setQuery(''); return }
    const match = options.find(o => o.id === value)
    if (match) setQuery(display(match))
  }, [value, options])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? options.filter(o => o.label.toLowerCase().includes(q) || (o.code && o.code.toLowerCase().includes(q)))
    : options

  const grouped = []
  for (const opt of filtered) {
    const last = grouped[grouped.length - 1]
    if (last && last.category === opt.category) last.items.push(opt)
    else grouped.push({ category: opt.category, items: [opt] })
  }

  const select = (opt) => {
    onChange(opt.id)
    setQuery(display(opt))
    setOpen(false)
  }

  const handleChange = (val) => {
    setQuery(val)
    setOpen(true)
    if (value) onChange(null) // typing invalidates the previous selection — no stale id+text mismatch
  }

  const handleBlur = () => {
    setTimeout(() => {
      setOpen(false)
      if (!value) { setQuery(''); return }
      const match = options.find(o => o.id === value)
      if (match) setQuery(display(match))
    }, 150)
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          placeholder={loading ? 'Loading…' : 'Search materials…'}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-colors"
        />
        {open && grouped.length > 0 && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {grouped.map(g => (
              <div key={g.category}>
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-50 sticky top-0">
                  {g.category}
                </div>
                {g.items.map(opt => (
                  <button key={opt.id} type="button" onMouseDown={() => select(opt)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-100 last:border-0 cursor-pointer">
                    {opt.code && <span className="font-semibold text-gray-500 mr-1">{opt.code}</span>}
                    <span className="text-gray-900">{opt.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      {legacyText && !value && (
        <p className="mt-1 text-[11px] text-gray-400 truncate">Currently: {legacyText} (unlinked)</p>
      )}
    </div>
  )
}
