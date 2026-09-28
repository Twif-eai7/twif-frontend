import { useState, useMemo } from 'react'
import { useInvoiceLegReconciliation } from '../../hooks/useInvoiceLegReconciliation'
import { useBuyerOptions } from '../../hooks/useBuyerOptions'
import { fmtCurrency, fmtQty } from '../orderManagement/poUtils'

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Whether what's been recorded shipped (legs) matches what was planned
// (po_shipment_plan_line_items) for a SKU — 'none' (nothing planned or
// shipped yet, not interesting), 'matched' (fully accounted for), 'partial'
// (still catching up — normal mid-process, not an error), or 'over' (shipped
// more than was ever planned — a real reconciliation flag).
function qtyStatus(planned, shipped) {
  if (planned === 0 && shipped === 0) return 'none'
  if (shipped > planned) return 'over'
  if (shipped === planned) return 'matched'
  return 'partial'
}
const QTY_STATUS_STYLE = {
  none:    'text-gray-400',
  matched: 'text-emerald-700',
  partial: 'text-amber-700',
  over:    'text-red-700',
}

const STATUS_BADGE = {
  not_raised:          { text: 'Not Raised', cls: 'bg-amber-100 text-amber-800' },
  raised:              { text: 'Raised', cls: 'bg-blue-100 text-blue-800' },
  booking_pending:     { text: 'Booking Pending', cls: 'bg-orange-100 text-orange-800' },
  do_carting_awaited:  { text: 'DO Carting Awaited', cls: 'bg-purple-100 text-purple-800' },
  booked:              { text: 'Booked', cls: 'bg-emerald-100 text-emerald-800' },
}

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'over',     label: 'Over-shipped' },
  { key: 'partial',  label: 'Partial' },
  { key: 'matched',  label: 'Matched' },
]

// Mobile card field — mirrors the label/value pattern used in
// PoRecord.jsx/PendingWorkOverview.jsx's own mobile cards.
function Field({ label, value, className = 'text-gray-700' }) {
  return (
    <div>
      <div className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">{label}</div>
      <div className={`text-xs mt-0.5 font-mono ${className}`}>{value}</div>
    </div>
  )
}

// Reconciliation table: one row per SKU line (not per PO or per invoice) —
// buyer/vendor/PO/invoice#/date/status all legitimately repeat across a PO's
// SKUs rather than being rolled up or joined into a composite cell; that
// duplication is fine, a rolled-up cell just hides which SKU actually has
// the mismatch.
export default function InvoiceLegReconciliation() {
  const { invoices, loading } = useInvoiceLegReconciliation()
  const { buyers } = useBuyerOptions()
  const [search, setSearch] = useState('')
  const [activeBuyerId, setActiveBuyerId] = useState(null)
  const [vendorFilter, setVendorFilter] = useState('')
  const [filter, setFilter] = useState('all')
  const [etdFrom, setEtdFrom] = useState('')
  const [etdTo, setEtdTo] = useState('')
  const [shippedFrom, setShippedFrom] = useState('')
  const [shippedTo, setShippedTo] = useState('')

  const rows = useMemo(() => invoices.flatMap(inv => inv.pos.flatMap(po => po.lines.map(l => ({
    key: l.id,
    buyer_org_id: inv.buyer_org_id,
    buyer_name: inv.buyer_name,
    invoice_number: inv.invoice_number,
    date: inv.date,
    etd: inv.etd,
    status: inv.status,
    po_number: po.po_number,
    vendor_name: po.vendor_name,
    buyer_sku_ref: l.buyer_sku_ref,
    sku_variant: l.sku_variant,
    orderQty: l.orderQty,
    plannedQty: l.plannedQty,
    balanceQty: l.balanceQty,
    shippedQty: l.shippedQty,
    shippedDate: l.shippedDate,
    currency: l.currency,
    plannedValue: l.plannedValue,
    shippedValue: l.shippedValue,
    rowStatus: qtyStatus(l.plannedQty, l.shippedQty),
  })))), [invoices])

  const countsByBuyerId = useMemo(() => {
    const map = new Map()
    rows.forEach(r => { if (r.buyer_org_id) map.set(r.buyer_org_id, (map.get(r.buyer_org_id) || 0) + 1) })
    return map
  }, [rows])

  // Cascading — scoped to the active buyer (if any) so the dropdown only
  // ever offers vendors that actually appear under that buyer, same pattern
  // PendingWorkOverview.jsx uses.
  const vendorOptions = useMemo(() => {
    const relevant = activeBuyerId ? rows.filter(r => r.buyer_org_id === activeBuyerId) : rows
    return [...new Set(relevant.map(r => r.vendor_name).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  }, [rows, activeBuyerId])

  // Buyer selection re-scopes which vendors are valid, so a previously-picked
  // vendor that doesn't exist under the new buyer shouldn't silently keep
  // filtering to nothing.
  const handleBuyerChange = (id) => {
    setActiveBuyerId(id || null)
    setVendorFilter('')
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'all' && r.rowStatus !== filter) return false
      if (activeBuyerId && r.buyer_org_id !== activeBuyerId) return false
      if (vendorFilter && r.vendor_name !== vendorFilter) return false
      // ETD only exists once an invoice is booked into a container — a row
      // still not_raised/raised/booking_pending has none, so it drops out
      // of either bound the moment one is set (there's nothing to compare).
      if (etdFrom && (!r.etd || r.etd.slice(0, 10) < etdFrom)) return false
      if (etdTo && (!r.etd || r.etd.slice(0, 10) > etdTo)) return false
      // Shipped date is the latest leg's own date (a line can ship across
      // several partial legs) — a line with nothing shipped yet has none.
      if (shippedFrom && (!r.shippedDate || r.shippedDate.slice(0, 10) < shippedFrom)) return false
      if (shippedTo && (!r.shippedDate || r.shippedDate.slice(0, 10) > shippedTo)) return false
      if (!term) return true
      return r.po_number?.toLowerCase().includes(term)
        || r.invoice_number?.toLowerCase().includes(term)
        || r.buyer_sku_ref?.toLowerCase().includes(term)
    })
  }, [rows, filter, search, activeBuyerId, vendorFilter, etdFrom, etdTo, shippedFrom, shippedTo])

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 w-full py-4 px-4 space-y-4 text-sm">

      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-900 rounded-lg flex items-center justify-center text-white flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 leading-tight">Shipment Invoices</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {loading ? 'Loading…' : `${rows.length} SKU${rows.length === 1 ? '' : 's'} across all buyers`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto sm:gap-1.5">
          {/* Horizontally scrollable single row on mobile — without flex-shrink-0/whitespace-nowrap
              these pills shrink and wrap "Over-shipped" into two lines instead of the row scrolling. */}
          <div className="flex items-center gap-1.5 overflow-x-auto flex-nowrap -mx-4 px-4 sm:mx-0 sm:px-0 w-full sm:w-auto">
            {FILTERS.map(f => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                className={`flex-shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors
                  ${filter === f.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={activeBuyerId || ''}
            onChange={e => handleBuyerChange(e.target.value)}
            className="w-full sm:w-auto min-w-0 px-2.5 py-1.5 text-xs font-semibold text-gray-800 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-900 cursor-pointer"
          >
            <option value="">All Buyers</option>
            {buyers.map(b => (
              <option key={b.id} value={b.id}>{b.name}{countsByBuyerId.get(b.id) ? ` (${countsByBuyerId.get(b.id)})` : ''}</option>
            ))}
          </select>
          <select
            value={vendorFilter}
            onChange={e => setVendorFilter(e.target.value)}
            className="w-full sm:w-auto min-w-0 px-2.5 py-1.5 text-xs font-semibold text-gray-800 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-900 cursor-pointer"
          >
            <option value="">All Vendors</option>
            {vendorOptions.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <div className="relative w-full sm:w-48">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search PO #, invoice #, or SKU…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
            />
          </div>
        </div>
      </div>

      {/* Date-range filters — ETD only exists once an invoice is booked
          into a container (shipment_containers.etd); Shipped is the
          latest leg's own date per line. Separate row from the top bar's
          buyer/vendor/search controls, which were already tight. */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-gray-500 whitespace-nowrap">ETD</span>
          <input type="date" value={etdFrom} onChange={e => setEtdFrom(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-900" />
          <span className="text-[11px] text-gray-400">to</span>
          <input type="date" value={etdTo} onChange={e => setEtdTo(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-900" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-gray-500 whitespace-nowrap">Shipped</span>
          <input type="date" value={shippedFrom} onChange={e => setShippedFrom(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-900" />
          <span className="text-[11px] text-gray-400">to</span>
          <input type="date" value={shippedTo} onChange={e => setShippedTo(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-900" />
        </div>
        {(etdFrom || etdTo || shippedFrom || shippedTo) && (
          <button type="button" onClick={() => { setEtdFrom(''); setEtdTo(''); setShippedFrom(''); setShippedTo('') }}
            className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer">
            Clear dates
          </button>
        )}
      </div>

      <div className="w-full">
        {/* Table card */}
        <div className="w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {loading && (
            <div className="flex items-center justify-center py-16"><Spinner /></div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <p className="text-sm text-gray-500">{rows.length === 0 ? 'Nothing to reconcile yet' : 'No items match your search'}</p>
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <>
            <div className="hidden sm:block overflow-x-auto">
            <table className="w-full table-fixed border-collapse">
              {/* Status gets more room than its neighbors (9% vs the usual
                  7-9%) — its badge text ("DO Carting Awaited", "Booking
                  Pending") is far wider than the others' ("Booked"), and
                  being the LAST column, an overflowing badge on a
                  long-status row spills past the table's own right edge
                  instead of just crowding a neighbor — visible as an
                  inconsistent edge while scrolling that a short-status row
                  like "Booked" doesn't show. The extra width is shaved off
                  Buyer/Vendor/SKU only — their own header labels are short
                  ("BUYER", "VENDOR", "SKU") so a tighter column can't
                  overflow ITS OWN header, and their body content already
                  has `truncate` so a tighter fit there just ellipsizes.
                  Invoice #/Invoice Date keep their original width — both
                  have longer header labels ("INVOICE #", "INVOICE DATE")
                  that were already a tight fit; shrinking Invoice Date
                  earlier caused this exact overflow-into-Status bug on the
                  header row itself, not just the body. */}
              <colgroup>
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[7%]" />
                <col className="w-[9%]" />
              </colgroup>
              {/* Background on thead, not tr — a <tr>'s background can fall
                  short of the table's true rendered width in a horizontally
                  scrolling table-fixed layout (rounding/scroll-container
                  edge cases), leaving a pale gap past the last column once
                  scrolled all the way right. thead is a row-group box that
                  always spans the full table width. */}
              <thead className="bg-slate-800">
                <tr>
                  <th className="px-1 py-1 text-left text-[8px] sm:px-2 sm:py-1.5 sm:text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap bg-slate-800">Buyer</th>
                  <th className="px-1 py-1 text-left text-[8px] sm:px-2 sm:py-1.5 sm:text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap bg-slate-800">Vendor</th>
                  <th className="px-1 py-1 text-left text-[8px] sm:px-2 sm:py-1.5 sm:text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap bg-slate-800">PO Number</th>
                  <th className="px-1 py-1 text-left text-[8px] sm:px-2 sm:py-1.5 sm:text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap bg-slate-800">SKU</th>
                  <th className="px-1 py-1 text-right text-[8px] sm:px-2 sm:py-1.5 sm:text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap bg-slate-800">Order Qty</th>
                  <th className="px-1 py-1 text-right text-[8px] sm:px-2 sm:py-1.5 sm:text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap bg-slate-800">Planned Qty</th>
                  <th className="px-1 py-1 text-right text-[8px] sm:px-2 sm:py-1.5 sm:text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap bg-slate-800">Balance Qty</th>
                  <th className="px-1 py-1 text-right text-[8px] sm:px-2 sm:py-1.5 sm:text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap bg-slate-800">Shipped Qty</th>
                  <th className="px-1 py-1 text-right text-[8px] sm:px-2 sm:py-1.5 sm:text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap bg-slate-800">Planned Value</th>
                  <th className="px-1 py-1 text-right text-[8px] sm:px-2 sm:py-1.5 sm:text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap bg-slate-800">Shipped Value</th>
                  <th className="px-1 py-1 text-left text-[8px] sm:px-2 sm:py-1.5 sm:text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap bg-slate-800">Invoice #</th>
                  <th className="px-1 py-1 text-left text-[8px] sm:px-2 sm:py-1.5 sm:text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap bg-slate-800">Invoice Date</th>
                  <th className="px-1 py-1 text-left text-[8px] sm:px-2 sm:py-1.5 sm:text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap bg-slate-800">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => {
                  const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.not_raised
                  return (
                    <tr key={row.key} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
                      <td className="px-1 py-1 text-[10px] sm:px-2 sm:py-1.5 sm:text-xs font-semibold text-black truncate">{row.buyer_name || '—'}</td>
                      <td className="px-1 py-1 text-[10px] sm:px-2 sm:py-1.5 sm:text-xs text-black truncate">{row.vendor_name || '—'}</td>
                      <td className="px-1 py-1 text-[10px] sm:px-2 sm:py-1.5 sm:text-xs font-mono text-black truncate">{row.po_number || '—'}</td>
                      <td className="px-1 py-1 text-[10px] sm:px-2 sm:py-1.5 sm:text-xs text-black truncate">
                        <span className="font-semibold">{row.buyer_sku_ref || '—'}</span>
                        {row.sku_variant && <span className="ml-1 text-gray-500">{row.sku_variant}</span>}
                      </td>
                      <td className="px-1 py-1 text-[10px] sm:px-2 sm:py-1.5 sm:text-xs font-mono text-black whitespace-nowrap text-right">
                        {fmtQty(row.orderQty)}
                      </td>
                      <td className={`px-1 py-1 text-[10px] sm:px-2 sm:py-1.5 sm:text-xs font-mono whitespace-nowrap text-right ${QTY_STATUS_STYLE[row.rowStatus]}`}>
                        {fmtQty(row.plannedQty)}
                      </td>
                      <td className="px-1 py-1 text-[10px] sm:px-2 sm:py-1.5 sm:text-xs font-mono text-black whitespace-nowrap text-right">
                        {fmtQty(row.balanceQty)}
                      </td>
                      <td className={`px-1 py-1 text-[10px] sm:px-2 sm:py-1.5 sm:text-xs font-mono font-semibold whitespace-nowrap text-right ${QTY_STATUS_STYLE[row.rowStatus]}`}>
                        {fmtQty(row.shippedQty)}
                      </td>
                      <td className="px-1 py-1 text-[10px] sm:px-2 sm:py-1.5 sm:text-xs text-black whitespace-nowrap text-right">{fmtCurrency(row.plannedValue, row.currency)}</td>
                      <td className="px-1 py-1 text-[10px] sm:px-2 sm:py-1.5 sm:text-xs font-semibold text-emerald-700 whitespace-nowrap text-right">{fmtCurrency(row.shippedValue, row.currency)}</td>
                      <td className="px-1 py-1 text-[10px] sm:px-2 sm:py-1.5 sm:text-xs font-semibold text-black truncate">{row.invoice_number || '—'}</td>
                      <td className="px-1 py-1 text-[10px] sm:px-2 sm:py-1.5 sm:text-xs text-black whitespace-nowrap truncate">{fmtDate(row.date)}</td>
                      <td className="px-1 py-1 sm:px-2 sm:py-1.5 overflow-hidden">
                        <span className={`inline-block max-w-full truncate align-bottom px-1 py-0.5 rounded-full text-[8px] sm:px-1.5 sm:text-[10px] font-semibold ${badge.cls}`}>
                          {badge.text}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>

            {/* Cards — below sm, one card per SKU line instead of the
                13-column table that has no room to breathe on a phone width */}
            <div className="sm:hidden flex flex-col gap-2.5 p-3">
              {filtered.map(row => {
                const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.not_raised
                return (
                  <div key={row.key}
                    className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm flex flex-col gap-2.5">

                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-gray-900 truncate">{row.buyer_name || '—'}</div>
                        <div className="text-xs text-gray-500 truncate mt-0.5">{row.vendor_name || '—'}</div>
                      </div>
                      <span className={`flex-shrink-0 inline-block px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </div>

                    <div className="text-xs text-black truncate">
                      <span className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide mr-1">PO</span>
                      <span className="font-mono">{row.po_number || '—'}</span>
                      <span className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide ml-2 mr-1">SKU</span>
                      <span className="font-semibold">{row.buyer_sku_ref || '—'}</span>
                      {row.sku_variant && <span className="ml-1 text-gray-500">{row.sku_variant}</span>}
                    </div>

                    <div className="grid grid-cols-3 gap-x-2 gap-y-2 pt-2 border-t border-gray-100">
                      <Field label="Order Qty" value={fmtQty(row.orderQty)} />
                      <Field label="Planned Qty" value={fmtQty(row.plannedQty)} className={QTY_STATUS_STYLE[row.rowStatus]} />
                      <Field label="Balance Qty" value={fmtQty(row.balanceQty)} />
                      <Field label="Shipped Qty" value={fmtQty(row.shippedQty)} className={`font-semibold ${QTY_STATUS_STYLE[row.rowStatus]}`} />
                      <Field label="Planned" value={fmtCurrency(row.plannedValue, row.currency)} />
                      <Field label="Shipped" value={fmtCurrency(row.shippedValue, row.currency)} className="font-semibold text-emerald-700" />
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 text-xs">
                      <span className="text-gray-700 truncate">
                        <span className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide mr-1">Invoice</span>
                        {row.invoice_number || '—'}
                      </span>
                      <span className="text-gray-500 flex-shrink-0">{fmtDate(row.date)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
