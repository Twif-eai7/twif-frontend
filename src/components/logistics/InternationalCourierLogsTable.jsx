import { useEffect, useState, useRef, Fragment } from 'react'
import { createPortal } from 'react-dom'
import {
  useIntlCourierLogStore,
  useIntlCourierLogRows,
  useIntlCourierLogLoading,
  useIntlCourierLogError,
  useIntlCourierLogFilters,
  useIntlCourierLogPage,
  useIntlCourierLogTotal,
  useIntlCourierLogTotalPages,
  INTL_COURIER_LOG_PAGE_SIZE,
  INTL_EMPTY_FILTERS,
} from '../../stores/internationalCourierLogStore'
import { useFetchIntlCourierLogs, useIntlCourierLogActions } from '../../hooks/useInternationalCourierLogs'
import InternationalCourierLogModal from './InternationalCourierLogModal'
import CourierBrandText from './CourierBrandText'
import { extractIndiaPincode, extractPostalCode } from './postalLookup'

function resolveVendorPin(row) {
  return row.zip_code_V || extractIndiaPincode(row.vendor_address) || ''
}

function resolveBuyerZip(row) {
  return row.zip_code_B || extractPostalCode(row.buyer_address, 'international') || ''
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

const TRACKING_URLS = {
  'DHL':                 (n) => `https://www.dhl.com/en/express/tracking.html?AWB=${n}`,
  'UPS':                 (n) => `https://www.ups.com/track?tracknum=${n}`,
  'FedEx International': (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}`,
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }) {
  return (
    <div className={`relative bg-white border border-gray-200 rounded-xl p-4 shadow-sm overflow-hidden before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 ${accent}`}>
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-2xl font-bold text-gray-900 leading-tight">{value}</div>
    </div>
  )
}

function FilterInput({ label, value, onChange, placeholder }) {
  return (
    <div className="flex flex-col gap-1 min-w-[130px] flex-1">
      <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900" />
    </div>
  )
}

function FilterDate({ label, value, onChange }) {
  return (
    <div className="flex flex-col gap-1 min-w-[120px] flex-1">
      <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <input type="date" value={value} onChange={e => onChange(e.target.value)}
        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900" />
    </div>
  )
}

function FilterSearchDropdown({ label, value, onChange, options, placeholder }) {
  const [query,            setQuery]            = useState(value || '')
  const [open,             setOpen]             = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const wrapRef  = useRef(null)
  const itemRefs = useRef([])

  // Keep query in sync when filter is cleared externally
  useEffect(() => { setQuery(value || '') }, [value])

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false); setHighlightedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options

  const pick = (item) => {
    setQuery(item)
    onChange(item)
    setOpen(false)
    setHighlightedIndex(-1)
  }

  const clear = () => { setQuery(''); onChange(''); setOpen(false) }

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown') { setOpen(true); setHighlightedIndex(0) }
      return
    }
    switch (e.key) {
      case 'Escape': e.preventDefault(); setOpen(false); setHighlightedIndex(-1); break
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
          const next = Math.max(i - 1, -1)
          if (next >= 0) itemRefs.current[next]?.scrollIntoView({ block: 'nearest' })
          return next
        })
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && filtered[highlightedIndex]) pick(filtered[highlightedIndex])
        break
    }
  }

  return (
    <div ref={wrapRef} className="flex flex-col gap-1 min-w-[130px] flex-1">
      <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <input
          type="text" value={query} placeholder={placeholder} autoComplete="off"
          onChange={e => { setQuery(e.target.value); setOpen(true); setHighlightedIndex(-1) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900 w-full pr-6"
        />
        {query && (
          <button type="button" onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
        {open && filtered.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[200] max-h-[200px] overflow-y-auto">
            {filtered.map((item, i) => (
              <button key={item} ref={el => { itemRefs.current[i] = el }} type="button"
                onMouseDown={() => pick(item)}
                onMouseEnter={() => setHighlightedIndex(i)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${i < filtered.length - 1 ? 'border-b border-gray-100' : ''} ${i === highlightedIndex ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-800 hover:bg-gray-50'}`}>
                {item}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SkeletonRows() {
  const widths = [80, 72, 72, 72, 90, 110, 80, 50, 60]
  return Array.from({ length: 6 }, (_, i) => (
    <Fragment key={i}>
      <tr>
        {widths.map((w, j) => (
          <td key={j} className="px-3 py-2.5">
            <div className="h-3 rounded bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse" style={{ width: w }} />
          </td>
        ))}
      </tr>
      <tr className="border-b border-gray-100">
        <td colSpan={10} className="px-3 pb-2.5 pt-0">
          <div className="flex gap-6">
            {[200, 120, 80, 80].map((w, j) => (
              <div key={j} className="h-3 rounded bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse" style={{ width: w }} />
            ))}
          </div>
        </td>
      </tr>
    </Fragment>
  ))
}

function KebabMenu({ row, onEdit, onDelete, open, onOpen, onClose }) {
  const btnRef = useRef(null)
  const [style, setStyle] = useState({})

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const openUpward = window.innerHeight - rect.bottom < 100
      setStyle({
        position: 'fixed',
        right: window.innerWidth - rect.right,
        ...(openUpward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
        zIndex: 9999, minWidth: 140,
      })
    }
    onOpen()
  }

  return (
    <>
      <button ref={btnRef} onClick={handleOpen}
        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
          <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={onClose} />
          <div style={style} className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-[9999]">
            <button onClick={() => { onEdit(row); onClose() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 stroke-gray-500" fill="none" strokeWidth="2">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
            <button onClick={() => { onDelete(row.id); onClose() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 stroke-red-500" fill="none" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
              </svg>
              Delete
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  )
}

function InvoiceCell({ row, onUpload, onView, onDelete }) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try { await onUpload(row.id, file) } catch { /* parent shows error */ } finally { setBusy(false); e.target.value = '' }
  }

  const handleView = async () => {
    setBusy(true)
    try { const url = await onView(row.id); if (url) window.open(url, '_blank', 'noopener,noreferrer') } catch { /* ignore */ } finally { setBusy(false) }
  }

  if (busy) return <span className="text-[10px] text-gray-400">…</span>

  if (row.upload_invoice) return (
    <button onClick={handleView} title="View invoice"
      className="p-1.5 rounded-md border border-gray-300 bg-white text-gray-500 hover:border-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors">
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    </button>
  )

  return (
    <>
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFile} />
      <button onClick={() => fileRef.current?.click()} title="Upload invoice"
        className="text-gray-300 hover:text-gray-600 transition-colors">
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
        </svg>
      </button>
    </>
  )
}

function ConfirmDeleteModal({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-80">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Delete Courier Log</h3>
        <p className="text-xs text-gray-500 mb-5">This action cannot be undone. Are you sure?</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

const COLS = 10

export default function InternationalCourierLogsTable() {
  const rows       = useIntlCourierLogRows()
  const loading    = useIntlCourierLogLoading()
  const error      = useIntlCourierLogError()
  const filters    = useIntlCourierLogFilters()
  const page       = useIntlCourierLogPage()
  const total      = useIntlCourierLogTotal()
  const totalPages = useIntlCourierLogTotalPages()

  const setFilters   = useIntlCourierLogStore(s => s.setFilters)
  const clearFilters = useIntlCourierLogStore(s => s.clearFilters)
  const setPage      = useIntlCourierLogStore(s => s.setPage)

  const fetchLogs                                                                          = useFetchIntlCourierLogs()
  const { createLog, updateLog, deleteLog, uploadInvoice, getInvoiceUrl, deleteInvoice } = useIntlCourierLogActions()

  const [localFilters, setLocalFilters] = useState(filters)
  const [openKebab,    setOpenKebab]    = useState(null)
  const [modalRow,     setModalRow]     = useState(null)
  const [deleteId,     setDeleteId]     = useState(null)
  const [actionError,  setActionError]  = useState(null)
  const [filterOptions, setFilterOptions] = useState({ merchants: [], vendors: [], buyers: [], couriers: [] })

  useEffect(() => { fetchLogs() }, [])

  useEffect(() => {
    const BASE = `${import.meta.env.VITE_BACKEND_URL || ''}/logistics/international-courier-logs`
    fetch(`${BASE}/filter-options`)
      .then(r => r.json())
      .then(d => setFilterOptions({
        merchants: d.merchants || [],
        vendors:   d.vendors   || [],
        buyers:    d.buyers    || [],
        couriers:  d.couriers  || [],
      }))
      .catch(() => {})
  }, [])

  // ── Stats ─────────────────────────────────────────────────────────────────
  const now = new Date()
  const thisMonthCount = rows.filter(r => {
    if (!r.dispatch_date) return false
    const d = new Date(r.dispatch_date)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length
  const totalPackages = rows.reduce((s, r) => s + (Number(r.package_quantity) || 0), 0)

  // ── Pagination ────────────────────────────────────────────────────────────
  const from      = (page - 1) * INTL_COURIER_LOG_PAGE_SIZE
  const pagedRows = rows.slice(from, from + INTL_COURIER_LOG_PAGE_SIZE)

  // ── Filters ───────────────────────────────────────────────────────────────
  const patchLocal = (key, val) => setLocalFilters(f => ({ ...f, [key]: val }))

  const applyFilters = () => { setFilters(localFilters); fetchLogs(localFilters) }
  const handleClear  = () => {
    const empty = { ...INTL_EMPTY_FILTERS }
    setLocalFilters(empty); clearFilters(); fetchLogs(empty)
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const handleSave = async (payload) => {
    setActionError(null)
    if (modalRow && modalRow.id) return await updateLog(modalRow.id, payload)
    else return await createLog(payload)
  }

  const handleDeleteConfirm = async () => {
    try { await deleteLog(deleteId) }
    catch (err) { setActionError(err.message) }
    finally { setDeleteId(null) }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">International Courier Logs</h1>
          <p className="text-xs text-gray-500 mt-0.5">International · Export · {total} record{total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setModalRow(false)}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-700 transition-colors">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Log
        </button>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Total Logs"     value={total}                                accent="before:bg-gray-800" />
        <StatCard label="This Month"     value={thisMonthCount}                       accent="before:bg-blue-500" />
        <StatCard label="Total Packages" value={totalPackages.toLocaleString('en-IN')} accent="before:bg-purple-500" />
      </div>

      {/* ── Filters ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <FilterDate label="From" value={localFilters.dateFrom} onChange={v => patchLocal('dateFrom', v)} />
          <FilterDate label="To"   value={localFilters.dateTo}   onChange={v => patchLocal('dateTo', v)} />
          <FilterSearchDropdown label="Merchant"        value={localFilters.merchant_name}   onChange={v => patchLocal('merchant_name', v)}   options={filterOptions.merchants} placeholder="Search merchant…" />
          <FilterSearchDropdown label="Vendor"          value={localFilters.vendor_name}     onChange={v => patchLocal('vendor_name', v)}     options={filterOptions.vendors}   placeholder="Search vendor…" />
          <FilterSearchDropdown label="Buyer"           value={localFilters.buyer_name}      onChange={v => patchLocal('buyer_name', v)}      options={filterOptions.buyers}    placeholder="Search buyer…" />
          <FilterSearchDropdown label="Courier Company" value={localFilters.courier_company} onChange={v => patchLocal('courier_company', v)} options={filterOptions.couriers}  placeholder="Search courier…" />
          <FilterInput          label="Search"          value={localFilters.search}          onChange={v => patchLocal('search', v)}          placeholder="Invoice, tracking…" />
          <div className="col-span-2 md:col-span-1 flex gap-2 items-end pb-0.5">
            <button onClick={applyFilters}
              className="px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-700 transition-colors">
              Apply
            </button>
            <button onClick={handleClear}
              className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg hover:bg-gray-50 text-gray-700 transition-colors">
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* ── Errors ── */}
      {(error || actionError) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {error || actionError}
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 border-b-2 border-slate-200">
                {[
                  'Invoice No.', 'Invoice Date', 'Dispatch Date', 'Delivery Date',
                  'Merchant', 'Tracking No.', 'Service', 'Pkgs', 'Invoice', '',
                ].map((h, i) => (
                  <th key={i}
                    className={`px-3 py-3 text-[11px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap ${i === COLS - 1 ? 'w-8' : ''} ${i === 7 ? 'text-right' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows />
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={COLS} className="px-3 py-14 text-center text-xs text-gray-400">
                    No international courier logs found
                  </td>
                </tr>
              ) : pagedRows.map(row => (
                <Fragment key={row.id}>
                  {/* ── Main row ── */}
                  <tr className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-3 pt-3 pb-1 whitespace-nowrap">
                      <span className="font-mono text-xs font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                        {row.invoice_number}
                      </span>
                    </td>
                    <td className="px-3 pt-3 pb-1 text-xs font-medium text-gray-700 whitespace-nowrap">
                      {fmtDate(row.date_of_invoice)}
                    </td>
                    <td className="px-3 pt-3 pb-1 text-xs font-medium text-gray-700 whitespace-nowrap">
                      {fmtDate(row.dispatch_date)}
                    </td>
                    <td className="px-3 pt-3 pb-1 whitespace-nowrap">
                      {row.delivery_date
                        ? <span className="text-xs text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">{fmtDate(row.delivery_date)}</span>
                        : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-3 pt-3 pb-1 whitespace-nowrap">
                      <span className="text-xs font-semibold text-gray-900">{row.merchant_name || '—'}</span>
                    </td>
                    <td className="px-3 pt-3 pb-1 font-mono text-xs whitespace-nowrap">
                      {row.tracking_number && TRACKING_URLS[row.courier_company] ? (
                        <a
                          href={TRACKING_URLS[row.courier_company](row.tracking_number)}
                          target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                          title={`Track on ${row.courier_company}`}
                        >
                          {row.tracking_number} ↗
                        </a>
                      ) : (
                        <span className="text-gray-800 font-medium">{row.tracking_number || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 pt-3 pb-1 whitespace-nowrap">
                      {row.courier_service
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-100 text-[11px] font-semibold text-blue-800 border border-blue-200">
                            {row.courier_service}
                          </span>
                        : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-3 pt-3 pb-1 text-right tabular-nums text-xs font-semibold text-gray-800">
                      {row.package_quantity ?? '—'}
                    </td>
                    <td className="px-3 pt-3 pb-1 whitespace-nowrap">
                      <InvoiceCell
                        row={row}
                        onUpload={async (id, file) => { try { await uploadInvoice(id, file) } catch (e) { setActionError(e.message) } }}
                        onView={getInvoiceUrl}
                        onDelete={async (id) => { try { await deleteInvoice(id) } catch (e) { setActionError(e.message) } }}
                      />
                    </td>
                    <td className="px-3 pt-3 pb-1">
                      <KebabMenu
                        row={row}
                        open={openKebab === row.id}
                        onOpen={() => setOpenKebab(row.id)}
                        onClose={() => setOpenKebab(null)}
                        onEdit={r => setModalRow(r)}
                        onDelete={id => setDeleteId(id)}
                      />
                    </td>
                  </tr>
                  {/* ── Sub-row ── */}
                  <tr className="border-b border-gray-200">
                    <td colSpan={COLS} className="px-3 pb-3 pt-1">
                      <div className="flex divide-x divide-gray-200 bg-gray-50 border border-gray-300 rounded-lg overflow-hidden">
                        <div className="px-4 py-2.5 flex-1 min-w-[160px]">
                          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Vendor</div>
                          <div className="text-xs text-gray-900 font-semibold">{row.vendor_name || '—'}</div>
                          {resolveVendorPin(row) && (
                            <div className="text-[11px] font-bold text-gray-900 mt-0.5">{resolveVendorPin(row)}</div>
                          )}
                          {row.vendor_address && (
                            <div className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">{row.vendor_address}</div>
                          )}
                        </div>
                        <div className="px-4 py-2.5 flex-1 min-w-[160px]">
                          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Buyer</div>
                          <div className="text-xs text-gray-900 font-semibold">{row.buyer_name || '—'}</div>
                          {resolveBuyerZip(row) && (
                            <div className="text-[11px] font-bold text-gray-900 mt-0.5">{resolveBuyerZip(row)}</div>
                          )}
                          {row.buyer_address && (
                            <div className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">{row.buyer_address}</div>
                          )}
                        </div>
                        <div className="px-4 py-2.5 flex-1 min-w-[140px]">
                          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Product</div>
                          <div className="text-xs text-gray-900 font-medium">{row.product_description || '—'}</div>
                        </div>
                        <div className="px-4 py-2.5 min-w-[80px]">
                          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Company</div>
                          {row.courier_company ? (
                            <CourierBrandText name={row.courier_company} size="sm" />
                          ) : (
                            <div className="text-xs text-gray-400">—</div>
                          )}
                        </div>
                        <div className="px-4 py-2.5 min-w-[80px]">
                          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Cost By</div>
                          <div className="text-xs text-gray-900 font-medium">{row.courier_cost_by || '—'}</div>
                        </div>
                        <div className="px-4 py-2.5 min-w-[100px]">
                          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Charge To</div>
                          <div className="text-xs text-gray-900 font-medium">{row.charge_to || '—'}</div>
                        </div>
                        <div className="px-4 py-2.5 min-w-[110px]">
                          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Account No.</div>
                          <div className="text-xs text-gray-900 font-mono font-semibold">{row.account_number || '—'}</div>
                        </div>
                        {row.remarks && (
                          <div className="px-4 py-2.5 flex-1 min-w-[100px]">
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Remarks</div>
                            <div className="text-xs text-gray-900 font-medium">{row.remarks}</div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Page {page} of {totalPages} · {total} records
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">
                Prev
              </button>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ── */}
      {modalRow !== null && (
        <InternationalCourierLogModal
          row={modalRow || null}
          onSave={handleSave}
          onClose={() => setModalRow(null)}
          uploadInvoice={uploadInvoice}
        />
      )}

      {/* ── Delete Confirmation ── */}
      {deleteId && (
        <ConfirmDeleteModal
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteId(null)}
        />
      )}

    </div>
  )
}
