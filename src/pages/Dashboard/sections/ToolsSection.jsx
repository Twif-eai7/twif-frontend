import { useEffect, useState, useRef, useCallback } from 'react';
import { useTravelExpense } from '../../../hooks/useTravelExpense';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const BUCKET = 'TRAVEL EXPENSES';

function getPdfUrl(path) {
  if (!path) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(BUCKET)}/${path}`;
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatINR(num) {
  return `₹${Number(num).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const HomeIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const UploadIcon = () => (
  <svg className="w-5 h-5 stroke-slate-400" viewBox="0 0 24 24" fill="none" strokeWidth="1.75">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const SpinnerIcon = ({ className = 'w-4 h-4' }) => (
  <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const XIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    pending:  'bg-amber-50 text-amber-800 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold
      uppercase tracking-wide border ${map[status] || map.pending}`}>
      {status || 'pending'}
    </span>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, valueClass = 'text-slate-900' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-4 flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] h-full flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-xs"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl
        shadow-2xl overflow-hidden animate-[modalIn_0.22s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">New Travel Expense</h2>
            <p className="text-xs text-slate-400 mt-0.5">Submit a reimbursement request</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center
              text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <XIcon />
          </button>
        </div>
        <div className="px-5 py-5 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

// ── Travel bill form ──────────────────────────────────────────────────────────

function TravelBillForm({ onSubmit, onSuccess }) {
  const [form, setForm] = useState({ travelDate: '', amount: '', comments: '' });
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const fileInputRef = useRef();

  const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleFile = (f) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setFormError('File too large (max 10MB)'); return; }
    setFile(f);
    setFormError('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.travelDate || !form.amount || !form.comments) {
      setFormError('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ ...form, file });
      onSuccess();
    } catch (err) {
      setFormError(err.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setForm({ travelDate: '', amount: '', comments: '' });
    setFile(null);
    setFormError('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Date + Amount */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Travel Date
          </label>
          <input
            type="date"
            value={form.travelDate}
            onChange={set('travelDate')}
            onClick={(e) => e.target.showPicker?.()}
            required
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800
              focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent
              hover:border-slate-300 transition-all"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Amount (₹)
          </label>
          <input
            type="number"
            value={form.amount}
            onChange={set('amount')}
            placeholder="0.00"
            min="0"
            step="0.01"
            required
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800
              focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent
              hover:border-slate-300 transition-all"
          />
        </div>
      </div>

      {/* Comments */}
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
          Comments
        </label>
        <textarea
          value={form.comments}
          onChange={set('comments')}
          placeholder="Purpose of trip, expense details…"
          required
          rows={3}
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800
            focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent
            hover:border-slate-300 transition-all resize-none leading-relaxed
            placeholder:text-slate-300"
        />
      </div>

      {/* Upload */}
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
          Upload Bill <span className="font-normal normal-case text-slate-300 tracking-normal">(optional)</span>
        </label>

        {!file ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex items-center gap-3 px-4 py-4 rounded-xl border-2 border-dashed
              cursor-pointer transition-all duration-150
              ${dragging
                ? 'border-slate-800 bg-slate-50'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
              }`}
          >
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <UploadIcon />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-600">Click to upload or drag & drop</p>
              <p className="text-xs text-slate-400 mt-0.5">PDF, DOC, DOCX, XLS, XLSX, JPG — max 10MB</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0 text-emerald-600">
              <CheckIcon />
            </div>
            <span className="flex-1 text-sm text-slate-700 font-medium truncate">{file.name}</span>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <XIcon />
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>

      {/* Error */}
      {formError && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs font-medium">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {formError}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold
            text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-all"
        >
          Reset
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg
            bg-slate-900 text-white text-sm font-semibold
            hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
        >
          {submitting
            ? <><SpinnerIcon className="w-4 h-4 text-white" /> Submitting…</>
            : <><CheckIcon /> Submit Bill</>
          }
        </button>
      </div>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ToolsSection() {
  const [modalOpen, setModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState(null); // { text, type }

  const hook = useTravelExpense();
  const { pagedBills, loading, error, stats, currentPage, totalPages, goNext, goPrev, fetchBills, submitBill } = hook;

  useEffect(() => { fetchBills(); }, [fetchBills]);

  const showToast = useCallback((text, type = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  }, []);

  const handleFormSuccess = useCallback(() => {
    setModalOpen(false);
    showToast('✓ Travel bill submitted successfully!');
  }, [showToast]);

  return (
    <div className="space-y-4 mt-10">

      {/* ── Topbar ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4
        flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center flex-shrink-0">
            <HomeIcon />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">Travel Bills</h2>
            <p className="text-xs text-slate-400 mt-0.5">Your submitted reimbursement requests</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white
            text-sm font-semibold hover:bg-slate-800 transition-colors shadow-sm"
        >
          <PlusIcon /> New Request
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Submitted" value={loading ? '—' : stats.total} />
        <StatCard label="Pending" value={loading ? '—' : stats.pending} valueClass="text-amber-500" />
        <StatCard label="Approved" value={loading ? '—' : stats.approved} valueClass="text-emerald-500" />
        <StatCard label="Total Amount" value={loading ? '—' : formatINR(stats.totalAmount)} />
      </div>

      {/* ── Table card ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-400 text-sm">
            <SpinnerIcon className="w-5 h-5 text-slate-300" /> Loading…
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex flex-col items-center py-16 gap-2 text-center">
            <p className="text-sm text-red-500 font-medium">{error}</p>
            <button onClick={() => fetchBills()}
              className="text-xs text-slate-500 underline hover:text-slate-700">
              Try again
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && pagedBills.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
              <HomeIcon />
            </div>
            <p className="text-sm">No travel bills submitted yet.</p>
          </div>
        )}

        {/* Table */}
        {!loading && !error && pagedBills.length > 0 && (
          <div className="overflow-x-auto">
            {/* Header */}
            <div className="flex items-center px-5 py-2.5 bg-slate-50 border-b border-slate-100 min-w-[520px]">
              {[
                { label: 'Date',     flex: '0 0 100px' },
                { label: 'Comments', flex: '1 1 0',    },
                { label: 'Amount',   flex: '0 0 110px', align: 'right' },
                { label: 'Status',   flex: '0 0 90px'  },
                { label: '',         flex: '0 0 40px'  },
              ].map((col, i) => (
                <span key={i} style={{ flex: col.flex, textAlign: col.align || 'left' }}
                  className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2">
                  {col.label}
                </span>
              ))}
            </div>

            {/* Rows */}
            {pagedBills.map((bill, i) => {
              const pdfUrl = getPdfUrl(bill.travel_bill_url);
              return (
                <div key={bill.id || i}
                  className="flex items-center px-5 border-b border-slate-50 last:border-0
                    hover:bg-slate-50/60 transition-colors min-h-[52px] min-w-[520px]">
                  <span style={{ flex: '0 0 100px' }}
                    className="text-xs text-slate-500 px-2 py-3 tabular-nums">
                    {formatDate(bill.travel_bill_date)}
                  </span>
                  <span style={{ flex: '1 1 0' }}
                    className="text-sm text-slate-700 px-2 py-3 leading-snug">
                    {bill.travel_bill_comment || '—'}
                  </span>
                  <span style={{ flex: '0 0 110px', textAlign: 'right' }}
                    className="text-sm font-semibold text-slate-800 px-2 py-3 tabular-nums">
                    {formatINR(bill.amount)}
                  </span>
                  <span style={{ flex: '0 0 90px' }} className="px-2 py-3">
                    <StatusBadge status={bill.status} />
                  </span>
                  <span style={{ flex: '0 0 40px' }} className="px-2 py-3 flex justify-end">
                    {pdfUrl ? (
                      <a href={pdfUrl} target="_blank" rel="noreferrer"
                        className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center
                          text-slate-400 hover:text-slate-800 hover:border-slate-400 transition-all">
                        <ExternalLinkIcon />
                      </a>
                    ) : (
                      <span className="w-7 h-7 inline-block" />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 px-5 py-3 border-t border-slate-100">
            <button onClick={goPrev} disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold
                text-slate-500 hover:border-slate-400 hover:text-slate-800 transition-all
                disabled:opacity-30 disabled:cursor-not-allowed">
              ← Prev
            </button>
            <span className="text-xs text-slate-400 tabular-nums">
              Page {currentPage} of {totalPages}
            </span>
            <button onClick={goNext} disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold
                text-slate-500 hover:border-slate-400 hover:text-slate-800 transition-all
                disabled:opacity-30 disabled:cursor-not-allowed">
              Next →
            </button>
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Travel Bill">
        <TravelBillForm
          onSubmit={submitBill}
          onSuccess={handleFormSuccess}
        />
      </Modal>

      {/* ── Toast ── */}
      {toastMsg && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2
          px-4 py-3 rounded-xl shadow-lg text-sm font-semibold animate-[toastIn_0.2s_ease-out]
          ${toastMsg.type === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-red-600 text-white'
          }`}>
          {toastMsg.type === 'success' ? <CheckIcon /> : null}
          {toastMsg.text}
        </div>
      )}

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translate(-50%, 8px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}