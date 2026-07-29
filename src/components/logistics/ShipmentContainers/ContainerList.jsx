function Spinner({ size = 'w-4 h-4' }) {
  return (
    <svg className={`${size} animate-spin text-gray-400`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

// v1 progress badge: simple BL-recorded count per container, based on
// bl_number (the recorded reference) rather than bl_file_path (the uploaded
// doc) — a BL can be logged before the scanned copy is attached. "Fully
// closed" semantics for invoices/POs are a deferred, follow-up concern.
function blBadge(container) {
  const invoices = container.invoices ?? []
  const total = invoices.length
  const withBl = invoices.filter(i => !!i.bl_number).length
  if (total === 0) return { text: 'No invoices', cls: 'bg-gray-100 text-gray-500' }
  if (withBl === total) return { text: `BL: ${withBl}/${total}`, cls: 'bg-emerald-100 text-emerald-800' }
  if (withBl === 0) return { text: `BL: ${withBl}/${total}`, cls: 'bg-red-100 text-red-700' }
  return { text: `BL: ${withBl}/${total}`, cls: 'bg-amber-100 text-amber-800' }
}

export default function ContainerList({
  containers, loading, search, onSearchChange,
  selectedMonth, onMonthChange, monthOptions, hasFilters, clearFilters,
  selectedContainerId, onSelect, detailOpen, canManage, onNewContainer,
  onExport, exporting,
}) {
  return (
    <div className={`
      flex flex-col bg-white
      border-gray-200
      ${detailOpen ? 'hidden md:flex md:w-72 md:border-r md:flex-shrink-0' : 'flex w-full md:w-72 md:border-r md:flex-shrink-0'}
    `}>
      <div className="px-3 pt-3 pb-3 border-b border-gray-200 flex-shrink-0 space-y-2">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search container/AWB or invoice #…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
          />
        </div>

        {/* ETD month filter */}
        <div className="relative">
          <select
            value={selectedMonth}
            onChange={e => onMonthChange(e.target.value)}
            className="w-full pl-2.5 pr-8 py-2 text-sm border border-gray-200 rounded-lg appearance-none bg-white focus:outline-none focus:border-gray-900 text-gray-700"
          >
            <option value="">All ETD months</option>
            {(monthOptions || []).map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        {hasFilters && (
          <button type="button" onClick={clearFilters}
            className="text-[11px] text-gray-500 hover:text-gray-800 transition-colors">
            Clear filters
          </button>
        )}
        <div className="flex gap-2">
          {canManage && (
            <button
              type="button"
              onClick={onNewContainer}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Container
            </button>
          )}
          <button
            type="button"
            onClick={onExport}
            disabled={exporting || !containers.length}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            title="Export visible containers to Excel"
          >
            {exporting ? (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            {canManage ? '' : 'Export'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        )}
        {!loading && containers.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-10">No containers found</p>
        )}
        {!loading && containers.map(c => {
          const badge = blBadge(c)
          const invoiceNumbers = (c.invoices || []).map(i => i.invoice_number).filter(Boolean)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c)}
              className={`w-full text-left px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100 transition-colors
                ${selectedContainerId === c.id ? 'bg-gray-100 border-l-2 border-l-gray-900' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-bold text-gray-900 truncate">Container: {c.container_number || '—'}</div>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${badge.cls}`}>
                  {badge.text}
                </span>
              </div>
              <div className="text-xs text-gray-800 mt-0.5 truncate">Vessel: {c.flight_vessel || '—'}</div>
              {invoiceNumbers.length > 0 && (
                <div className="text-[11px] text-black text-extrabold mt-0.5 truncate">Invoice: {invoiceNumbers.join(', ')}</div>
              )}
              <div className="flex items-center gap-3 mt-1.5">
                {c.etd && <span className="text-[11px] text-black text-extrabold">ETD: {c.etd}</span>}
                {c.eta && <span className="text-[11px] text-black text-extrabold">ETA: {c.eta}</span>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
