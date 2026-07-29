import React from 'react';
import { useInvoiceList, formatDate, formatAmount } from '../../hooks/useInvoiceList';
import { Link } from 'react-router-dom';

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl px-4 py-3.5 ring-1 ring-black/[0.06] shadow-sm flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{label}</span>
      <span className="text-xl font-bold text-gray-900 tabular-nums">{value}</span>
    </div>
  );
}

function ActionBtns({ invoiceId, getUrl }) {
  const [loading, setLoading] = React.useState(false);

  const handleAction = async (mode) => {
    setLoading(true);
    const url = await getUrl(invoiceId);
    setLoading(false);
    if (!url) return;

    if (mode === 'view') {
      window.open(url, '_blank');
    } else {
      // Force download by fetching the blob
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      a.click();
    }
  };

  if (!invoiceId) return <span className="w-20 block" />;

  return (
    <div className="flex items-center gap-1">
      {/* View */}
      <button
        onClick={() => handleAction('view')}
        disabled={loading}
        title="View PDF"
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg border
          border-gray-200 bg-white text-gray-400 hover:border-gray-900 hover:text-gray-900
          hover:bg-gray-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="w-3 h-3 border border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>

      {/* Download */}
      <button
        onClick={() => handleAction('download')}
        disabled={loading}
        title="Download PDF"
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg border
          border-gray-200 bg-white text-gray-400 hover:border-gray-900 hover:text-gray-900
          hover:bg-gray-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
    </div>
  );
}

// ── Filter select ─────────────────────────────────────────────────────────────
function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium
        text-gray-600 bg-white cursor-pointer shadow-sm focus:outline-none
        focus:border-gray-900 transition-colors"
    >
      <option value="">{placeholder}</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// ── Mode badge ────────────────────────────────────────────────────────────────
function ModeBadge({ mode }) {
  return mode === 'system'
    ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-600 tracking-wide">Auto</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-yellow-50 text-yellow-700 tracking-wide">Manual</span>;
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-gray-400
      bg-white rounded-2xl ring-1 ring-black/[0.06]">
      <span className="w-5 h-5 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin flex-shrink-0" />
      {label}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InvoiceList() {
  const {
    isLoading, error,
    filteredInvoices, pageInvoices, buyerMap,
    buyerOptions, yearOptions,
    searchQuery, setSearchQuery,
    buyerFilter, setBuyerFilter,
    yearFilter,  setYearFilter,
    modeFilter,  setModeFilter,
    currentPage, totalPages, setCurrentPage,
    stats,getInvoiceViewUrl,
  } = useInvoiceList();

  const modeOptions = [
    { value: 'system', label: 'Auto' },
    { value: 'manual', label: 'Manual' },
  ];

  const formattedTotal = `$${Number(stats.totalValue).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const fyDisplay = stats.currentFY
    ? `${stats.fyCount} (${stats.currentFY})`
    : '—';

  return (
    <div className="flex flex-col gap-4 p-4">

      {/* Top bar */}
      <div className="flex items-center justify-between bg-white rounded-2xl px-6 py-5">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 bg-gray-900 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div>
            <h2 className="text-[17px] font-bold text-gray-900 leading-tight">Consultancy Invoices</h2>
            <p className="text-xs text-gray-400 mt-0.5">JNITIN GLOBAL LLP · All issued invoices</p>
          </div>
        </div>

        
        <Link to="/dashboard/financial?tab=invoice-form"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-gray-900 text-white
            rounded-lg text-sm font-semibold hover:bg-gray-700 transition-all shadow-sm hover:shadow-md">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Invoice
        </Link>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2.5 items-center">
        {/* Search */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg
          px-3 py-2 flex-1 min-w-48 shadow-sm focus-within:border-gray-900
          focus-within:ring-2 focus-within:ring-gray-900/5 transition-all">
          <svg className="text-gray-400 flex-shrink-0" width="13" height="13"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search invoice no, buyer…"
            className="border-none outline-none text-sm text-gray-900 placeholder-gray-400
              bg-transparent w-full font-medium"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <FilterSelect
            value={buyerFilter}
            onChange={setBuyerFilter}
            options={buyerOptions}
            placeholder="All Buyers"
          />
          <FilterSelect
            value={yearFilter}
            onChange={setYearFilter}
            options={yearOptions}
            placeholder="All Years"
          />
          <FilterSelect
            value={modeFilter}
            onChange={setModeFilter}
            options={modeOptions}
            placeholder="All Modes"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatCard label="Total Invoices" value={isLoading ? '—' : stats.total} />
        <StatCard label="Total Value"    value={isLoading ? '—' : formattedTotal} />
        <StatCard label="This FY"        value={isLoading ? '—' : fyDisplay} />
        <StatCard label="Buyers"         value={isLoading ? '—' : stats.uniqueBuyers} />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 bg-red-50 border border-red-200
          rounded-lg text-sm font-medium text-red-600">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && <Spinner label="Loading invoices…" />}

      {/* Empty state */}
      {!isLoading && !error && filteredInvoices.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-gray-400 bg-white
          rounded-2xl ring-1 ring-black/[0.06]">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
            stroke="#d1d5db" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <p className="text-sm">
            {searchQuery || buyerFilter || yearFilter || modeFilter
              ? 'No invoices match your filters.'
              : 'No invoices yet. Create your first one!'}
          </p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && filteredInvoices.length > 0 && (
        <div className="bg-white rounded-2xl ring-1 ring-black/[0.06] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            {/* Header */}
            <div className="flex bg-gray-50 border-b border-gray-100 px-5 min-w-[680px]">
              {[
                { label: 'Invoice No.', flex: '1.4' },
                { label: 'Buyer',       flex: '1.4' },
                { label: 'Date',        flex: '0.9' },
                { label: 'Amount',      flex: '0.9', right: true },
                { label: 'FY',          flex: '0.6' },
                { label: 'Mode',        flex: '0.5' },
                { label: '',            flex: '0.7' },
              ].map(({ label, flex, right }) => (
                <div
                  key={label}
                  style={{ flex }}
                  className={`text-[10px] font-semibold uppercase tracking-wider
                    text-gray-400 px-2 py-2.5 ${right ? 'text-right' : ''}`}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Rows */}
            <div className="min-w-[680px]">
              {pageInvoices.map(inv => {
                const buyerName = buyerMap[inv.buyer_org_id] || '—';
                return (
                  <div
                    key={inv.id || inv.invoice_number}
                    className="flex items-center px-5 border-b border-gray-50 last:border-b-0
                      hover:bg-gray-50/60 transition-colors min-h-[52px]"
                  >
                    {/* Invoice No */}
                    <div style={{ flex: '1.4' }}
                      className="px-2 py-3 font-mono text-xs font-semibold text-gray-900 truncate">
                      {inv.invoice_number || '—'}
                    </div>
                    {/* Buyer */}
                    <div style={{ flex: '1.4' }}
                      className="px-2 py-3 text-sm text-gray-600 truncate">
                      {buyerName}
                    </div>
                    {/* Date */}
                    <div style={{ flex: '0.9' }}
                      className="px-2 py-3 text-sm text-gray-400">
                      {formatDate(inv.invoice_date)}
                    </div>
                    {/* Amount */}
                    <div style={{ flex: '0.9' }}
                      className="px-2 py-3 text-sm font-semibold text-gray-900 text-right tabular-nums">
                      {formatAmount(inv.amount, inv.currency)}
                    </div>
                    {/* FY */}
                    <div style={{ flex: '0.6' }}
                      className="px-2 py-3 text-xs text-gray-400">
                      {inv.financial_year || '—'}
                    </div>
                    {/* Mode */}
                    <div style={{ flex: '0.5' }} className="px-2 py-3">
                      <ModeBadge mode={inv.invoice_mode} />
                    </div>
                    {/* Download */}
                    <div style={{ flex: '0.4' }}
                      className="px-2 py-3 flex justify-end">
                      <div style={{ flex: '0.7' }} className="px-2 py-3 flex justify-end">
                      <ActionBtns invoiceId={inv.id} getUrl={getInvoiceViewUrl} />
                    </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 px-5 py-3.5 border-t border-gray-100">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-gray-200
                  rounded-lg text-xs font-semibold text-gray-500 bg-white hover:border-gray-900
                  hover:text-gray-900 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Prev
              </button>

              <span className="text-xs text-gray-400 font-medium">
                Page {currentPage} of {totalPages} · {filteredInvoices.length} invoices
              </span>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-gray-200
                  rounded-lg text-xs font-semibold text-gray-500 bg-white hover:border-gray-900
                  hover:text-gray-900 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}