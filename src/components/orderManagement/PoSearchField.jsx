import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-400'

// Same buyer_supplier_links relation shape useFetchPOs.js already queries
// successfully — resolves buyer/vendor straight from the PO so callers don't
// need a second lookup.
async function searchPOs(query) {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`id, po_number, buyer_supplier_links!inner(
      buyer_org_id, supplier_org_id,
      buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(display_name),
      supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(display_name)
    )`)
    .ilike('po_number', `%${query}%`)
    .is('deleted_at', null)
    .is('delete_meta', null)
    .order('po_received_date', { ascending: false })
    .limit(20)
  if (error || !data) return []
  return data.map(po => ({
    id: po.id,
    poNumber: po.po_number,
    buyerOrgId: po.buyer_supplier_links?.buyer_org_id || null,
    buyerName: po.buyer_supplier_links?.buyer?.display_name || '',
    vendorId: po.buyer_supplier_links?.supplier_org_id || null,
    vendorName: po.buyer_supplier_links?.supplier?.display_name || '',
  }))
}

// PO search-to-select picker — buyer/vendor are derived from the chosen PO,
// replacing the old raw Buyer→Vendor cascade in SkuCreateModal.jsx /
// SkuImportUploadModal.jsx (SKUs are only ever created for an existing PO).
// `locked` renders a static read-only display instead, for the
// PoDrawer-prefill case where the PO is already known.
export default function PoSearchField({ value, onChange, locked }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    setLoading(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      searchPOs(query.trim()).then(r => { setResults(r); setLoading(false) })
    }, 250)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  if (locked) {
    return (
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">PO Number</label>
        <div className={`${inputCls} bg-gray-50 cursor-not-allowed text-gray-500`}>{value?.poNumber || '—'}</div>
      </div>
    )
  }

  const select = (po) => {
    onChange(po)
    setQuery(po.poNumber)
    setOpen(false)
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
        PO Number<span className="text-red-500 ml-0.5">*</span>
      </label>
      <div className="relative">
        <input
          type="text"
          value={value ? value.poNumber : query}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (value) onChange(null) }}
          onFocus={() => query.trim() && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search PO number…"
          className={inputCls}
        />
        {open && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {loading && <div className="px-3 py-2 text-xs text-gray-400">Searching…</div>}
            {!loading && results.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">No matching PO found</div>
            )}
            {!loading && results.map(po => (
              <button key={po.id} type="button" onMouseDown={() => select(po)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-100 last:border-0 cursor-pointer">
                <div className="font-semibold text-gray-900">{po.poNumber}</div>
                <div className="text-gray-500 mt-0.5">{po.buyerName || '—'} → {po.vendorName || '—'}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
