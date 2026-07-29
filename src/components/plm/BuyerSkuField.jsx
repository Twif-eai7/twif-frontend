import { useState, useEffect, useRef } from 'react'

export default function BuyerSkuField({ value, productionSkus, onChange, error }) {
  const [query, setQuery] = useState(value || '')
  const [open,  setOpen]  = useState(false)
  const userEditing = useRef(false)

  useEffect(() => {
    if (value && !userEditing.current) setQuery(value)
  }, [value])

  const filtered = query.trim()
    ? productionSkus
        .filter(s => s.buyer_sku_ref?.toLowerCase().startsWith(query.toLowerCase()))
        .slice(0, 15)
    : []

  const select = (sku) => {
    userEditing.current = false
    setQuery(sku.buyer_sku_ref)
    setOpen(false)
    onChange({ buyerSkuRef: sku.buyer_sku_ref, productionSkuId: sku.id })
  }

  const handleType = (val) => {
    userEditing.current = true
    setQuery(val)
    setOpen(true)
    onChange({ buyerSkuRef: val, productionSkuId: null })
  }

  return (
    <div className="flex flex-col gap-0.5 relative">
      <span className={`text-[9px] font-bold uppercase tracking-[.07em] ${error ? 'text-red-500' : 'text-black/55'}`}>
        Buyer SKU Ref
        <span className="ml-1 text-black/30 normal-case font-normal tracking-normal">— links to production SKU</span>
      </span>
      <input
        className={`px-2 py-1.5 border-b text-[12px] bg-[#e9e9e93d] outline-none uppercase focus:border-black/60 ${error ? 'border-red-500' : 'border-black/20'}`}
        value={query}
        onChange={e => handleType(e.target.value)}
        onFocus={() => query.trim() && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search by buyer ref…"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-[300] top-full left-0 right-0 mt-0.5 bg-white border border-black/15 shadow-lg max-h-44 overflow-y-auto">
          {filtered.map(s => (
            <button
              key={s.id}
              type="button"
              onMouseDown={() => select(s)}
              className="w-full text-left px-3 py-2 text-[11px] hover:bg-black/[.04] border-b border-black/[.06] last:border-0"
            >
              <div className="font-bold uppercase text-[#1A1A18]">{s.buyer_sku_ref}</div>
              {(s.sku_variant || s.description) && (
                <div className="text-black/40 mt-0.5 truncate">
                  {[s.sku_variant, s.description].filter(Boolean).join(' · ')}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
