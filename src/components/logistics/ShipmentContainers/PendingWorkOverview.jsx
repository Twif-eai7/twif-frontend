import { useState, useMemo, Fragment } from 'react'
import { usePendingWorkOverview } from '../../../hooks/usePendingWorkOverview'
import { useBuyerOptions } from '../../../hooks/useBuyerOptions'
import { initials } from '../../orderManagement/poUtils'
import SearchableSelect from '../../ui/SearchableSelect'

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

const TYPE_BADGE = {
  group:  { text: 'Not Raised', cls: 'bg-amber-100 text-amber-800' },
  raised: { text: 'Raised · Unbooked', cls: 'bg-blue-100 text-blue-800' },
  booked: { text: 'Booked', cls: 'bg-emerald-100 text-emerald-800' },
}

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const FILTERS = [
  { key: 'all',    label: 'All' },
  { key: 'group',  label: 'Not Raised' },
  { key: 'raised', label: 'Raised' },
  { key: 'booked', label: 'Booked' },
]

// Cross-buyer landing view: every shipment invoice across every buyer this
// logistics member can see, spanning all three lifecycle states (not raised
// / raised-unbooked / booked) — no need to open each buyer individually just
// to find out something needs raising or booking. This is the default
// landing screen; clicking a row jumps straight into that buyer's relevant
// stage. The left sidebar lists every buyer (including ones with nothing
// pending) as a dedicated buyer filter — separate from the PO-number search
// box and the vendor dropdown, which filter along their own axes. It's not a
// navigation pane of its own (that's what "Open workspace" per group is for).
export default function PendingWorkOverview({ onJumpToBuyer }) {
  const { invoices, loading } = usePendingWorkOverview()
  const { buyers } = useBuyerOptions()
  const [search, setSearch] = useState('')
  const [buyerSearch, setBuyerSearch] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [activeBuyerId, setActiveBuyerId] = useState(null)
  const [filter, setFilter] = useState('all')
  const [collapsed, setCollapsed] = useState(() => new Set())

  const toggleCollapsed = (key) => setCollapsed(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const rows = useMemo(() => invoices.map(inv => ({
    key: inv.id, type: inv.status,
    buyerId: inv.buyer_org_id, buyerName: inv.buyer_name || '—',
    poNumbers: inv.po_numbers, vendorNames: inv.vendor_names,
    cbm: inv.cbm, date: inv.date,
  })).sort((a, b) => new Date(a.date) - new Date(b.date)), [invoices])

  // Scoped to the active buyer (if any) so the dropdown only ever offers
  // vendors that actually appear under that buyer, instead of every vendor
  // across all buyers.
  const vendorOptions = useMemo(() => {
    const relevant = activeBuyerId ? rows.filter(r => r.buyerId === activeBuyerId) : rows
    const names = new Set()
    relevant.forEach(r => r.vendorNames.forEach(n => names.add(n)))
    return [
      { value: '', label: 'All vendors' },
      ...[...names].sort((a, b) => a.localeCompare(b)).map(name => ({ value: name, label: name })),
    ]
  }, [rows, activeBuyerId])

  const countsByBuyerId = useMemo(() => {
    const map = new Map()
    rows.forEach(r => { if (r.buyerId) map.set(r.buyerId, (map.get(r.buyerId) || 0) + 1) })
    return map
  }, [rows])

  const filteredBuyers = useMemo(() => {
    const term = buyerSearch.trim().toLowerCase()
    if (!term) return buyers
    return buyers.filter(b => b.name.toLowerCase().includes(term))
  }, [buyers, buyerSearch])

  // Clicking a buyer in the sidebar filters the table to just that buyer —
  // click again to clear. Separate from the PO search box; resets the
  // vendor filter since it's re-scoped to the new buyer's own vendors and a
  // previously-picked vendor may no longer be one of them.
  const toggleBuyerFilter = (id) => {
    setActiveBuyerId(prev => prev === id ? null : id)
    setVendorFilter('')
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'all' && r.type !== filter) return false
      if (activeBuyerId && r.buyerId !== activeBuyerId) return false
      if (vendorFilter && !r.vendorNames.includes(vendorFilter)) return false
      if (!term) return true
      return r.poNumbers.some(n => n.toLowerCase().includes(term))
    })
  }, [rows, filter, search, vendorFilter, activeBuyerId])

  // Grouped by buyer, each group's own rows oldest-first, and groups
  // themselves ordered by their oldest item — so the buyer needing the most
  // urgent attention surfaces at the top.
  const buyerGroups = useMemo(() => {
    const map = new Map()
    filtered.forEach(row => {
      const key = row.buyerId || row.buyerName
      if (!map.has(key)) map.set(key, { key, buyerId: row.buyerId, buyerName: row.buyerName, rows: [] })
      map.get(key).rows.push(row)
    })
    const groups = [...map.values()]
    groups.forEach(g => g.rows.sort((a, b) => new Date(a.date) - new Date(b.date)))
    groups.sort((a, b) => new Date(a.rows[0].date) - new Date(b.rows[0].date))
    return groups
  }, [filtered])

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 w-full py-4 px-4 space-y-4 text-sm">

      {/* Top bar — mirrors PoRecord.jsx's dashboard header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-900 rounded-lg flex items-center justify-center text-white flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 leading-tight">Recent Plannings</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {loading ? 'Loading…' : `${rows.length} item${rows.length === 1 ? '' : 's'} across all buyers`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            {FILTERS.map(f => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors
                  ${filter === f.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="w-48">
            <SearchableSelect
              options={vendorOptions}
              value={vendorFilter}
              onChange={setVendorFilter}
              placeholder="All vendors"
              triggerClassName="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:border-gray-900 transition-colors"
              dropdownClassName="border border-gray-200 rounded-lg mt-1 shadow-lg"
            />
          </div>
          <div className="relative w-48">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search PO #…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* Buyer sidebar — every buyer (even with zero pending items), a
            quick way to filter the table without typing. */}
        <div className="w-56 flex-shrink-0 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-3 pt-3 pb-2 border-b border-gray-100">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">All Buyers</div>
            <input
              type="text"
              value={buyerSearch}
              onChange={e => setBuyerSearch(e.target.value)}
              placeholder="Find a buyer…"
              className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
            />
          </div>
          <div className="max-h-[32rem] overflow-y-auto">
            {filteredBuyers.map(b => {
              const count = countsByBuyerId.get(b.id) || 0
              const active = activeBuyerId === b.id
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggleBuyerFilter(b.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-50 last:border-b-0 text-left transition-colors
                    ${active ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <span className="text-xs font-medium text-gray-800 truncate">{b.name}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${count > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Table card — same shell as PoRecord.jsx's table */}
        <div className="flex-1 min-w-0 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {/* Explicit, always-visible way back to all buyers — re-clicking the
              same sidebar row also clears it, but that's easy to miss. */}
          {activeBuyerId && (
            <div className="flex items-center justify-between gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100">
              <span className="text-xs text-blue-800">
                Showing only <span className="font-semibold">{buyers.find(b => b.id === activeBuyerId)?.name}</span>
              </span>
              <button type="button" onClick={() => toggleBuyerFilter(activeBuyerId)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 transition-colors">
                Show all buyers
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}
          {loading && (
            <div className="flex items-center justify-center py-16"><Spinner /></div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <p className="text-sm text-gray-500">{rows.length === 0 ? 'Nothing needs attention right now' : 'No items match your search'}</p>
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[26%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-800">
                  <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide">Vendor</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide">PO Number(s)</th>
                  <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-300 uppercase tracking-wide">CBM</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide">Created On</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide">Type</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {buyerGroups.map(group => {
                  const isCollapsed = collapsed.has(group.key)
                  return (
                    <Fragment key={group.key}>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <td colSpan={6} className="p-0">
                          <div className="w-full flex items-center justify-between gap-2 px-4 py-2">
                            <button
                              type="button"
                              onClick={() => toggleCollapsed(group.key)}
                              className="flex items-center gap-2 min-w-0 flex-1 text-left"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                className={`text-gray-400 flex-shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                              <span className="w-6 h-6 rounded-full bg-slate-700 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                                {initials(group.buyerName)}
                              </span>
                              <span className="text-xs font-bold text-gray-900 truncate">{group.buyerName}</span>
                              <span className="text-[10px] font-semibold text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                {group.rows.length} row{group.rows.length === 1 ? '' : 's'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onJumpToBuyer?.(group.buyerId, group.buyerName, 'invoices')}
                              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex-shrink-0 whitespace-nowrap transition-colors"
                            >
                              Open workspace →
                            </button>
                          </div>
                        </td>
                      </tr>
                      {!isCollapsed && group.rows.map(row => {
                        const typeBadge = TYPE_BADGE[row.type]
                        return (
                          <tr
                            key={row.key}
                            onClick={() => onJumpToBuyer?.(row.buyerId, row.buyerName, row.type === 'booked' ? 'containers' : 'invoices')}
                            className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors"
                          >
                            <td className="px-3 py-2 text-xs text-black truncate">{row.vendorNames.join(', ') || '—'}</td>
                            <td className="px-3 py-2 text-xs text-black truncate">{row.poNumbers.join(', ') || '—'}</td>
                            <td className="px-3 py-2 text-xs text-black whitespace-nowrap text-right">
                              {row.cbm != null ? `${row.cbm} m³` : '—'}
                            </td>
                            <td className="px-3 py-2 text-xs text-black whitespace-nowrap">{fmtDate(row.date)}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${typeBadge.cls}`}>
                                {typeBadge.text}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-300 inline-block">
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                            </td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
