import { useState, useMemo, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { usePendingWorkOverview } from '../../../hooks/usePendingWorkOverview'
import { useBuyerOptions } from '../../../hooks/useBuyerOptions'
import { fmtCbm, fmtCurrency, fmtCurrencySubtotals } from '../../orderManagement/poUtils'
import FinalInspectionBadge from '../../orderManagement/FinalInspectionBadge'
import SearchableSelect from '../../ui/SearchableSelect'

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

// Status is a plain manually-set column now (sql/shipment_invoice_manual_status.sql)
// — logistics picks one of these from the dropdown below rather than the app
// trying to infer it from container_id/invoice_raised_at, which never
// captured real-world booking timing reliably.
// `short` is what the compact table pill shows; `text` (the full label) is
// what the dropdown offers — do_carting_awaited's full label is too long to
// sit in a pill without reintroducing the horizontal-scroll issue the table
// layout was just fixed for.
const TYPE_BADGE = {
  group:               { text: 'Not Raised', cls: 'bg-amber-100 text-amber-800' },
  raised:              { text: 'Raised · Unbooked', cls: 'bg-blue-100 text-blue-800' },
  booking_pending:     { text: 'Booking Pending', cls: 'bg-orange-100 text-orange-800' },
  do_carting_awaited:  { text: 'Booking Placed, DO Carting Awaited', short: 'DO Carting Awaited', cls: 'bg-purple-100 text-purple-800' },
  booked:              { text: 'Booked', cls: 'bg-emerald-100 text-emerald-800' },
}

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Shared between the desktop expanded table row and the mobile expanded card
// so the SKU breakdown markup only lives in one place.
function PoBreakdownList({ pos }) {
  return (
    <div className="space-y-2">
      {pos.filter(po => po.lines?.length > 0).map(po => (
        <div key={po.id} className="bg-[#f7f7f8] rounded-[10px] px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-[9px] font-bold text-[#8a8a92] uppercase tracking-widest flex-shrink-0">PO</span>
              <span className="text-xs font-semibold font-mono text-[#17171a] flex-shrink-0">{po.po_number}</span>
              {po.vendor_name && <span className="text-[11px] font-normal text-[#6b6b73] truncate">{po.vendor_name}</span>}
            </div>
            <span className="flex items-center gap-3 flex-shrink-0 font-mono">
              <span className="text-xs font-bold text-[#17171a]">
                {po.cbm != null ? `${fmtCbm(po.cbm)} m³` : '—'}
              </span>
              <span className="text-xs font-bold text-emerald-700">{fmtCurrency(po.value, po.currency)}</span>
            </span>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-[#e5e5e8]">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="text-[9px] font-bold text-[#8a8a92] uppercase tracking-widest">SKU</span>
              <span className="flex items-center gap-3 flex-shrink-0">
                <span className="text-[9px] font-bold text-[#8a8a92] uppercase tracking-widest">Qty</span>
                <span className="w-16 text-right text-[9px] font-bold text-[#8a8a92] uppercase tracking-widest">CBM</span>
                <span className="w-16 text-right text-[9px] font-bold text-[#8a8a92] uppercase tracking-widest">Value</span>
              </span>
            </div>
            <div className="space-y-1">
              {po.lines.map(l => (
                <div key={l.id} className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="min-w-0 flex-1 flex items-center gap-1.5 truncate">
                    <span className="truncate font-semibold text-[#3a3a41]">
                      {l.buyer_sku_ref || '—'}
                      {l.sku_variant && <span className="ml-1.5 font-normal text-[#8a8a92]">{l.sku_variant}</span>}
                    </span>
                    <FinalInspectionBadge report={l.finalInspection} />
                  </span>
                  <span className="flex items-center gap-3 flex-shrink-0 font-mono">
                    <span className="text-[#52525b]">{l.quantity} pcs</span>
                    <span className="w-16 text-right font-bold text-[#17171a]">{Number(l.cbm).toFixed(3)} m³</span>
                    <span className="w-16 text-right font-bold text-emerald-700">{fmtCurrency(l.value, l.currency)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Keys mirror TYPE_BADGE exactly so `filter !== 'all' && r.type !== filter`
// (below) just works — labels here are the filter-bar wording, independent
// of TYPE_BADGE's pill text/short split.
const FILTERS = [
  { key: 'all',                label: 'All' },
  { key: 'group',               label: 'Not Raised' },
  { key: 'raised',              label: 'Raised' },
  { key: 'booking_pending',     label: 'Booking Pending' },
  { key: 'do_carting_awaited',  label: 'DO Carting Awaited' },
  { key: 'booked',              label: 'Booked' },
]

// Cross-buyer landing view: every shipment invoice across every buyer this
// logistics member can see, spanning all three lifecycle states (not raised
// / raised-unbooked / booked) — no need to open each buyer individually just
// to find out something needs raising or booking. This is the default
// landing screen; clicking a row jumps straight into that buyer's relevant
// stage. A plain "Buyer" column (not a collapsible per-buyer header row)
// keeps this one flat, oldest-first list — the left sidebar's buyer filter
// is the actual way to narrow down to one buyer, so the table itself
// doesn't need its own separate grouping/collapsing on top of that.
export default function PendingWorkOverview({ onJumpToBuyer, onBack }) {
  const { invoices, loading, updateStatus, refetch } = usePendingWorkOverview()
  const { buyers } = useBuyerOptions()
  const [search, setSearch] = useState('')
  const [buyerSearch, setBuyerSearch] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [activeBuyerId, setActiveBuyerId] = useState(null)
  const [filter, setFilter] = useState('all')
  const [expandedRows, setExpandedRows] = useState(() => new Set())
  // Positioned as a fixed-coordinate portal (not an absolutely-positioned
  // child) because the table card wraps everything in overflow-hidden for
  // its rounded corners — an in-flow dropdown got clipped for any row near
  // the bottom edge.
  const [statusMenu, setStatusMenu] = useState(null) // { key, type, top, left }
  const [statusUpdating, setStatusUpdating] = useState(null)

  const toggleExpandedRow = (key) => setExpandedRows(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  // Shared between the desktop table cell and the mobile card so the status
  // dropdown's positioning logic (and the click-to-open state) only lives once.
  const renderStatusButton = (row) => {
    const typeBadge = TYPE_BADGE[row.type]
    const menuOpen = statusMenu?.key === row.key
    return (
      <button
        type="button"
        onClick={e => {
          e.stopPropagation()
          if (menuOpen) { setStatusMenu(null); return }
          const rect = e.currentTarget.getBoundingClientRect()
          // Flip upward for a row near the bottom of the viewport — same
          // threshold/logic as SearchableSelect.jsx — otherwise the menu (5
          // options, one of them two lines) opens downward regardless of
          // room and its lower options render past the window edge,
          // unreachable.
          const openUpward = (window.innerHeight - rect.bottom) < 220 && rect.top > (window.innerHeight - rect.bottom)
          setStatusMenu({
            key: row.key, type: row.type,
            left: Math.max(8, rect.right - 224),
            ...(openUpward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
          })
        }}
        disabled={statusUpdating === row.key}
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-wait ${typeBadge.cls}`}
      >
        {typeBadge.short || typeBadge.text}
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="flex-shrink-0">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    )
  }

  const handleStatusChange = async (invoiceId, statusKey) => {
    setStatusMenu(null)
    setStatusUpdating(invoiceId)
    try {
      await updateStatus(invoiceId, statusKey)
      await refetch()
    } catch (err) {
      console.error('[PendingWorkOverview] status update failed:', err.message)
    } finally {
      setStatusUpdating(null)
    }
  }

  const rows = useMemo(() => invoices.map(inv => ({
    key: inv.id, type: inv.status, isBooked: inv.isBooked,
    buyerId: inv.buyer_org_id, buyerName: inv.buyer_name || '—',
    poNumbers: inv.po_numbers, vendorNames: inv.vendor_names, pos: inv.pos,
    cbm: inv.cbm, valueByCurrency: inv.valueByCurrency, date: inv.date,
    containerId: inv.container_id, containerNumber: inv.container_number,
  })).sort((a, b) => new Date(a.date) - new Date(b.date)), [invoices])

  // Which specific container/invoice this row's click should open — jumping
  // to the right tab isn't enough on its own, the user shouldn't have to
  // search the PO again once they're there.
  const jumpTargetId = (row) => row.isBooked ? row.containerId : row.key

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

  // Buyers with something pending float to the top (alphabetical among
  // themselves) so the ones actually worth clicking aren't buried below a
  // long alphabetical run of all-zero buyers — count then name, in one sort.
  const filteredBuyers = useMemo(() => {
    const term = buyerSearch.trim().toLowerCase()
    const matches = term ? buyers.filter(b => b.name.toLowerCase().includes(term)) : buyers
    return [...matches].sort((a, b) => {
      const countA = countsByBuyerId.get(a.id) || 0
      const countB = countsByBuyerId.get(b.id) || 0
      if (countA > 0 !== countB > 0) return countA > 0 ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [buyers, buyerSearch, countsByBuyerId])

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
        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          {/* Horizontally scrollable single row on mobile — without flex-shrink-0/whitespace-nowrap
              these pills shrink and wrap their own text into two lines instead of the row scrolling. */}
          <div className="flex items-center gap-1.5 overflow-x-auto flex-nowrap sm:flex-wrap -mx-4 px-4 sm:mx-0 sm:px-0 w-full sm:w-auto">
            {FILTERS.map(f => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                className={`flex-shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors
                  ${filter === f.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="w-full sm:w-48">
            <SearchableSelect
              options={vendorOptions}
              value={vendorFilter}
              onChange={setVendorFilter}
              placeholder="All vendors"
              triggerClassName="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:border-gray-900 transition-colors"
              dropdownClassName="border border-gray-200 rounded-lg mt-1 shadow-lg"
            />
          </div>
          <div className="relative w-full sm:w-48">
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
          {onBack && (
            // Distinct indigo treatment (vs. the plain white filter/utility
            // buttons around it) — this one navigates away to a different
            // page entirely, not an in-page action.
            <button type="button" onClick={onBack}
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold text-indigo-700 cursor-pointer transition-colors whitespace-nowrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Order Management
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start">
        {/* Buyer sidebar — every buyer (even with zero pending items), a
            quick way to filter the table without typing. Collapses to a
            plain <select> below sm: a fixed-width sidebar next to a
            flex-1 table left almost no room for the table on a phone. */}
        <div className="hidden sm:block w-56 flex-shrink-0 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
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

        <select
          value={activeBuyerId || ''}
          onChange={e => toggleBuyerFilter(e.target.value || null)}
          className="sm:hidden w-full px-2.5 py-2 text-xs font-semibold text-gray-800 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-900"
        >
          <option value="">All Buyers</option>
          {buyers.map(b => (
            <option key={b.id} value={b.id}>{b.name} {countsByBuyerId.get(b.id) ? `(${countsByBuyerId.get(b.id)})` : ''}</option>
          ))}
        </select>

        {/* Table card — same shell as PoRecord.jsx's table */}
        <div className="flex-1 min-w-0 w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
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
            <>
            <div className="hidden sm:block overflow-x-auto">
            <table className="w-full table-fixed">
              {/* Percentages sum to exactly 100 — table-fixed treats each col's
                  width as a share of the table's own width, not of remaining
                  space, so leaving them short (as before) let the browser
                  strand unallocated width instead of handing it to any one
                  column, which showed up as dead space in the row. */}
              <colgroup>
                <col className="w-[4%]" />
                <col className="w-[13%]" />
                <col className="w-[13%]" />
                <col className="w-[23%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col className="w-[10%]" />
                <col className="w-[20%]" />
              </colgroup>
              {/* Background on thead, not tr — a <tr>'s background can fall
                  short of the table's true rendered width in a horizontally
                  scrolling table-fixed layout, leaving a pale gap past the
                  last column once scrolled all the way right. thead always
                  spans the full table width. */}
              <thead className="bg-slate-800">
                <tr>
                  <th className="px-1 py-1.5" />
                  <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide">Buyer</th>
                  <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide">Vendor</th>
                  <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide">PO Number(s)</th>
                  <th className="px-2 py-1.5 text-right text-[10px] font-bold text-slate-300 uppercase tracking-wide">CBM</th>
                  <th className="px-2 py-1.5 text-right text-[10px] font-bold text-slate-300 uppercase tracking-wide">Value</th>
                  <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide">Created</th>
                  <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-300 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => {
                        const isExpanded = expandedRows.has(row.key)
                        const hasBreakdown = row.pos?.some(po => po.lines?.length > 0)
                        return (
                          <Fragment key={row.key}>
                            <tr
                              onClick={() => onJumpToBuyer?.(row.buyerId, row.buyerName, row.isBooked ? 'containers' : 'invoices', jumpTargetId(row))}
                              className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors"
                            >
                              <td className="px-1 py-1.5 text-center">
                                {hasBreakdown && (
                                  <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); toggleExpandedRow(row.key) }}
                                    className="w-5 h-5 inline-flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
                                    title="Show SKUs"
                                  >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                                      className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                                      <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                  </button>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-xs font-semibold text-black truncate">{row.buyerName}</td>
                              <td className="px-2 py-1.5 text-xs text-black truncate">{row.vendorNames.join(', ') || '—'}</td>
                              <td className="px-2 py-1.5 text-xs text-black truncate">{row.poNumbers.join(', ') || '—'}</td>
                              <td className="px-2 py-1.5 text-xs text-black whitespace-nowrap text-right">
                                {row.cbm != null ? `${fmtCbm(row.cbm)} m³` : '—'}
                              </td>
                              <td className="px-2 py-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap text-right">
                                {fmtCurrencySubtotals(row.valueByCurrency)}
                              </td>
                              <td className="px-2 py-1.5 text-xs text-black whitespace-nowrap truncate">{fmtDate(row.date)}</td>
                              <td className="px-2 py-1.5 relative">
                                {renderStatusButton(row)}
                              </td>
                            </tr>
                            {isExpanded && hasBreakdown && (
                              <tr className="border-b border-gray-100">
                                <td colSpan={8} className="px-4 py-3 bg-white">
                                  <div className="pl-6">
                                    <PoBreakdownList pos={row.pos} />
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
              </tbody>
            </table>
            </div>

            {/* Cards — below sm, one card per row instead of the 8-column table
                that has no room to breathe on a phone width */}
            <div className="sm:hidden flex flex-col gap-2.5 p-3">
              {filtered.map(row => {
                const isExpanded = expandedRows.has(row.key)
                const hasBreakdown = row.pos?.some(po => po.lines?.length > 0)
                return (
                  <div key={row.key}
                    onClick={() => onJumpToBuyer?.(row.buyerId, row.buyerName, row.isBooked ? 'containers' : 'invoices', jumpTargetId(row))}
                    className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm flex flex-col gap-2.5 cursor-pointer transition-colors hover:bg-gray-50">

                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-gray-900 truncate">{row.buyerName}</div>
                        <div className="text-xs text-gray-500 truncate mt-0.5">{row.vendorNames.join(', ') || '—'}</div>
                      </div>
                      {hasBreakdown && (
                        <button type="button" onClick={e => { e.stopPropagation(); toggleExpandedRow(row.key) }}
                          className="flex-shrink-0 w-6 h-6 inline-flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
                          title="Show SKUs">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                            className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>
                      )}
                    </div>

                    <div className="text-xs text-gray-700 truncate">
                      <span className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide mr-1">PO</span>
                      {row.poNumbers.join(', ') || '—'}
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      <div>
                        <div className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">CBM</div>
                        <div className="text-xs text-gray-700 mt-0.5">{row.cbm != null ? `${fmtCbm(row.cbm)} m³` : '—'}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Value</div>
                        <div className="text-xs font-semibold text-emerald-700 mt-0.5">{fmtCurrencySubtotals(row.valueByCurrency)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Created</div>
                        <div className="text-xs text-gray-700 mt-0.5">{fmtDate(row.date)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide mb-1">Status</div>
                        {renderStatusButton(row)}
                      </div>
                    </div>

                    {isExpanded && hasBreakdown && (
                      <div className="pt-2 mt-0.5 border-t border-gray-100" onClick={e => e.stopPropagation()}>
                        <PoBreakdownList pos={row.pos} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            </>
          )}
        </div>
      </div>

      {statusMenu && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setStatusMenu(null)} />
          <div
            className="fixed z-50 w-56 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden py-1"
            style={{
              left: statusMenu.left,
              ...(statusMenu.top != null ? { top: statusMenu.top } : { bottom: statusMenu.bottom }),
            }}
          >
            {Object.entries(TYPE_BADGE).map(([key, opt]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleStatusChange(statusMenu.key, key)}
                className={`w-full flex items-start gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-50 cursor-pointer transition-colors ${key === statusMenu.type ? 'font-semibold text-gray-900' : 'text-gray-600'}`}
              >
                <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${opt.cls.split(' ').find(c => c.startsWith('bg-'))}`} />
                <span className="leading-snug">{opt.text}</span>
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
