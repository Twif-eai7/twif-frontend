import React, { useCallback } from 'react';
import { useInvoice } from '../../hooks/useInvoice';
import { Link } from 'react-router-dom';

// ── Small atoms ───────────────────────────────────────────────────────────────

function ChevronDown({ className = '' }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CompanyStrip() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="border-b border-gray-100">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-7 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
          <div className="text-left">
            <span className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 leading-none mb-0.5">
              From
            </span>
            <span className="block text-sm font-semibold text-gray-900">TWIF TECH LLP</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded">
            Pre-filled
          </span>
          <ChevronDown className={`text-gray-300 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="px-7 pb-4 grid grid-cols-2 gap-x-6 gap-y-2.5 animate-fade-in">
          {[
            ['Address', 'Plot No.36, Sector 37, Pace city-1, Gurgaon, Haryana-122001, INDIA'],
            ['GSTIN',   '06AAPFJ1459D1ZD'],
            ['PAN / CIN', 'AAPFJ1459D / AAO-8540'],
            ['Email',   'accounts@jnitinglobal.com'],
          ].map(([label, value]) => (
            <div key={label}>
              <span className="block text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">
                {label}
              </span>
              <span className="block text-xs text-gray-500 leading-snug">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BankStrip() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="border-b border-gray-100">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-7 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
          <div className="text-left">
            <span className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 leading-none mb-0.5">
              Bank Details
            </span>
            <span className="block text-sm font-semibold text-gray-900">
              Kotak Mahindra Bank · A/c 8613138240
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded">
            Pre-filled
          </span>
          <ChevronDown className={`text-gray-300 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="px-7 pb-4 grid grid-cols-2 gap-x-6 gap-y-2.5 animate-fade-in">
          {[
            ['Beneficiary', 'TWIF TECH LLP'],
            ['IFSC / SWIFT', 'KKBK0000261 / KKBKINBBCPC'],
            ['Bank Address', 'JMD Regent Square, Gurgaon'],
            ['Intermediary', 'Citi Bank NA · CITI US 33 · Nostro: 36317907'],
          ].map(([label, value]) => (
            <div key={label}>
              <span className="block text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">
                {label}
              </span>
              <span className="block text-xs text-gray-500 leading-snug">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Invoice component ─────────────────────────────────────────────────────────

export default function Invoice( ) {
  const {
    buyers, buyersLoading,
    selectedBuyerId, selectedBuyer,
    invoiceMode, invoiceNoData,
    invoiceDate, setInvoiceDate,
    lineItems, total,
    submitting, success, error,
    onBuyerChange, onModeChange,
    addLineItem, removeLineItem, updateLineItem,
    submitInvoice, resetForm,
  } = useInvoice();

  // invoiceNoData.middle is the controlled value for the sequence input
  const [middleValue, setMiddleValue] = React.useState('');

  // Keep middleValue in sync when the hook resets or pre-fills it (auto mode)
  React.useEffect(() => {
    setMiddleValue(invoiceNoData.middle ?? '');
  }, [invoiceNoData.middle]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    submitInvoice(middleValue);
  }, [submitInvoice, middleValue]);

  const formattedTotal = (total ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="w-full p-4 mx-auto">
      {/* Back button */}
      <Link to="/dashboard/financial?tab=invoice-list"
        className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700
          px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 hover:border-gray-300
          transition-all mb-4"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back to List
      </Link>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/[0.04] overflow-hidden">

        {/* Card header */}
        <div className="flex items-center gap-3.5 px-7 py-6 border-b border-gray-100">
          <div className="w-11 h-11 bg-gray-900 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 leading-tight">Create Service Invoice</h2>
            <p className="text-xs text-gray-400 mt-0.5">TWIF TECH LLP · Consultancy Invoice</p>
          </div>
        </div>

        <CompanyStrip />
        <BankStrip />

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-7 py-6 space-y-6">

          {/* Buyer */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Invoice To <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <select
                value={selectedBuyerId}
                onChange={e => onBuyerChange(e.target.value)}
                required
                className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2.5
                  pr-9 text-sm text-gray-900 focus:outline-none focus:border-gray-900
                  focus:ring-2 focus:ring-gray-900/5 transition-all"
              >
                <option value="">
                  {buyersLoading ? 'Loading buyers…' : 'Select buyer…'}
                </option>
                {buyers.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* Buyer info card */}
            {selectedBuyer && (
              <div className="mt-2.5 p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col gap-1.5
                animate-fade-in text-xs text-gray-500">
                <div className="flex items-start gap-2">
                  <svg className="flex-shrink-0 mt-0.5 text-gray-400" width="13" height="13"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span>{selectedBuyer.address || '—'}</span>
                </div>
                <div className="flex items-start gap-2">
                  <svg className="flex-shrink-0 mt-0.5 text-gray-400" width="13" height="13"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <span>{selectedBuyer.country || '—'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Invoice mode + number + date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Mode */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-gray-500">Invoice Mode</span>
              <div className="flex gap-5 pt-1">
                {['system', 'manual'].map(m => (
                  <label key={m} className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer">
                    <input
                      type="radio"
                      name="invoiceMode"
                      value={m}
                      checked={invoiceMode === m}
                      onChange={() => onModeChange(m)}
                      className="accent-gray-900 cursor-pointer"
                    />
                    {m === 'system' ? 'Auto-generate' : 'Manual Entry'}
                  </label>
                ))}
              </div>
            </div>

            {/* Invoice number */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-gray-500">
                Invoice No. <span className="text-red-400">*</span>
              </span>
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden
                focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900/5 transition-all">
                <span className="px-2.5 py-2.5 text-sm font-semibold text-gray-500 bg-gray-50
                  border-r border-gray-200 whitespace-nowrap select-none text-xs">
                  {invoiceNoData.prefix}
                </span>
                <input
                  type="text"
                  value={middleValue}
                  onChange={e => setMiddleValue(e.target.value)}
                  readOnly={invoiceNoData.readOnly}
                  placeholder={selectedBuyerId ? '001' : 'Select buyer first'}
                  maxLength={6}
                  className="flex-1 min-w-0 px-2.5 py-2.5 text-sm text-center font-semibold
                    bg-white focus:outline-none tabular-nums w-16"
                />
                {invoiceNoData.suffix && (
                  <span className="px-2.5 py-2.5 text-xs font-semibold text-gray-500 bg-gray-50
                    border-l border-gray-200 whitespace-nowrap select-none">
                    {invoiceNoData.suffix}
                  </span>
                )}
              </div>
              {invoiceNoData.hint && (
                <p className="text-[11px] text-gray-500 leading-snug mt-0.5"
                  dangerouslySetInnerHTML={{ __html: invoiceNoData.hint }} />
              )}
            </div>

            {/* Date */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="invoiceDate" className="text-xs font-semibold text-gray-500">
                Date <span className="text-red-400">*</span>
              </label>
              <input
                id="invoiceDate"
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                required
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900
                  focus:outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5
                  transition-all bg-white"
              />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-500">Service Items</span>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed
                  border-gray-300 rounded-md text-[11px] font-semibold text-gray-400">
                  Purpose Code
                  <span className="text-gray-600">P1006</span>
                </span>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-dashed
                    border-gray-300 rounded-md text-[11px] font-semibold text-gray-500
                    hover:border-gray-900 hover:text-gray-900 transition-all"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add Row
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Table header */}
              <div className="grid bg-gray-50 border-b border-gray-200"
                style={{ gridTemplateColumns: '36px 1fr 130px 32px' }}>
                {['#', 'Description', 'Amount (USD)', ''].map((h, i) => (
                  <div key={i}
                    className={`text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-2 py-2.5
                      ${i === 2 ? 'text-right' : i === 0 ? 'text-center' : ''}`}>
                    {h}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {lineItems.map((item, index) => (
                <div key={item.id}
                  className="grid border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50 transition-colors"
                  style={{ gridTemplateColumns: '36px 1fr 130px 32px' }}>
                  {/* Sr */}
                  <div className="flex items-center justify-center text-xs text-gray-400 font-semibold px-1">
                    {index + 1}
                  </div>
                  {/* Description */}
                  <div className="px-1 py-1.5">
                    <input
                      type="text"
                      value={item.description}
                      onChange={e => updateLineItem(item.id, 'description', e.target.value)}
                      placeholder="Service description"
                      required
                      className="w-full border border-transparent rounded px-2 py-1.5 text-xs
                        text-gray-900 placeholder-gray-300 bg-transparent hover:bg-gray-100
                        focus:outline-none focus:border-gray-900 focus:bg-white
                        focus:ring-1 focus:ring-gray-900/10 transition-all"
                    />
                  </div>
                  {/* Amount */}
                  <div className="px-1 py-1.5">
                    <input
                      type="number"
                      value={item.amount}
                      onChange={e => updateLineItem(item.id, 'amount', e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      required
                      className="w-full border border-transparent rounded px-2 py-1.5 text-xs text-right
                        font-medium tabular-nums text-gray-900 placeholder-gray-300 bg-transparent
                        hover:bg-gray-100 focus:outline-none focus:border-gray-900 focus:bg-white
                        focus:ring-1 focus:ring-gray-900/10 transition-all"
                    />
                  </div>
                  {/* Remove */}
                  <div className="flex items-center justify-center px-1">
                    <button
                      type="button"
                      onClick={() => removeLineItem(item.id)}
                      className="w-6 h-6 flex items-center justify-center rounded text-gray-300
                        hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="flex items-center justify-end gap-2 mt-3.5 px-4 py-3.5
              bg-gray-900 rounded-xl">
              <span className="text-[11px] font-bold tracking-widest text-[oklch(0.81_0_0)] uppercase">Total</span>
              <span className="text-sm font-medium text-[oklch(0.81_0_0)]">USD</span>
              <span className="text-2xl font-bold text-white tabular-nums min-w-20 text-right">
                {formattedTotal}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-5 border-t border-gray-100">
            <button
              type="button"
              onClick={resetForm}
              className="px-5 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold
                text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-all"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white
                rounded-lg text-sm font-semibold hover:bg-gray-700 transition-all
                disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Generate Invoice
                </>
              )}
            </button>
          </div>
        </form>

        {/* Success / Error messages */}
        {success && (
          <div className="mx-7 mb-5 flex items-center gap-2.5 px-4 py-3.5 bg-green-50
            border border-green-200 rounded-lg text-sm font-medium text-green-700 animate-fade-in">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            {success}
          </div>
        )}
        {error && (
          <div className="mx-7 mb-5 flex items-center gap-2.5 px-4 py-3.5 bg-red-50
            border border-red-200 rounded-lg text-sm font-medium text-red-600 animate-fade-in">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}