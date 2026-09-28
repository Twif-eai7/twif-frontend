import { useEffect, useState, useRef, useCallback } from 'react';
import { useTechEnhancementRequests } from '../../../hooks/useTechEnhancementRequests';
import { getTerFileUrl } from '../../../lib/terStorage';
import { Input, Select, Button, Alert } from '../../../components/ui';

// ── Icons ─────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
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

const XIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const HomeIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const SpinnerIcon = ({ className = 'w-4 h-4' }) => (
  <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const PaperclipIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a5 5 0 01-7.07-7.07l9.19-9.19a3.5 3.5 0 014.95 4.95l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
  </svg>
);

const UpvoteIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 16 14" />
  </svg>
);

const ListIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="20" y2="12" /><line x1="8" y1="18" x2="20" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

// Same checkmark glyph as CheckIcon below, sized/colored for a stat tile's
// white-on-accent icon box instead of a small inline badge/button.
const CheckIcon2 = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// Spins forever, slowly - a plain animate-spin (Tailwind's default 1s
// linear) read as frantic on a static header badge, not lively, so this
// uses a slower custom duration instead (same [animation:...] arbitrary-
// value convention Modal/toast's own @keyframes blocks below already use
// for one-off animations that don't need a reusable Tailwind utility).
const SparkIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ animation: 'spin 3s linear infinite' }}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  </svg>
);

// ── Status / priority ─────────────────────────────────────────────────────────

const STATUS_LABELS = {
  submitted: 'Submitted',
  accepted:  'Accepted',
  done:      'Done',
  declined:  'Declined',
};

const STATUS_STYLES = {
  submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  accepted:  'bg-amber-50 text-amber-800 border-amber-200',
  done:      'bg-emerald-50 text-emerald-800 border-emerald-200',
  declined:  'bg-red-50 text-red-700 border-red-200',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold
      uppercase tracking-wide border ${STATUS_STYLES[status] || STATUS_STYLES.submitted}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

// Same palette family as STATUS_STYLES (blue/amber/emerald/red), applied to
// a different axis (urgency, not workflow stage) so the two badge types
// stay visually distinct at a glance instead of reading as duplicates.
const PRIORITY_STYLES = {
  high:   { dot: 'bg-red-500',    pill: 'bg-red-50 text-red-700 border-red-200' },
  medium: { dot: 'bg-amber-500',  pill: 'bg-amber-50 text-amber-700 border-amber-200' },
  low:    { dot: 'bg-slate-400',  pill: 'bg-slate-50 text-slate-600 border-slate-200' },
};

function PriorityBadge({ priority }) {
  const p = PRIORITY_STYLES[priority] || PRIORITY_STYLES.medium;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${p.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
      {priority || 'medium'}
    </span>
  );
}

// Same two-letter-initials convention this app's other avatar circles
// already use (e.g. Sidebar's own profile avatar) - a stable, colorful
// stand-in for a photo, keyed off the name itself so the same person always
// lands on the same color rather than a random one per render.
const AVATAR_COLORS = ['bg-indigo-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500', 'bg-teal-500'];
function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}
function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
function Avatar({ name }) {
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold text-white flex-shrink-0 ${avatarColor(name)}`}>
      {initials(name)}
    </span>
  );
}

function StatCard({ label, value, icon, accent }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-3.5">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accent}`}>
        {icon}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
        <span className="text-2xl font-bold tabular-nums text-slate-900">{value}</span>
      </div>
    </div>
  );
}

// ── Vote button ────────────────────────────────────────────────────────────────

function VoteButton({ count, voted, onClick, disabled, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all
        disabled:opacity-50 disabled:cursor-not-allowed
        ${voted ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-800'}`}
    >
      <UpvoteIcon /> {count}
    </button>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] h-full flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl
        shadow-2xl overflow-hidden animate-[modalIn_0.22s_ease-out]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">New Tech Enhancement Request</h2>
            <p className="text-xs text-slate-400 mt-0.5">Describe what you need built or fixed</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center
              text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <XIcon />
          </button>
        </div>
        <div className="px-5 py-5 max-h-[80vh] overflow-y-auto">{children}</div>
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

// ── New request form ─────────────────────────────────────────────────────────

function NewRequestForm({ onSubmit, onSuccess }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' });
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
    if (!form.title || !form.description) {
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

  return (
    <form onSubmit={handleSubmit}>
      <Input
        label="Title"
        required
        value={form.title}
        onChange={set('title')}
        placeholder="Short summary of the request"
      />

      <div className="mb-4">
        <label className="block text-sm font-medium text-stone-700 mb-1.5">
          Description<span className="text-red-500 ml-0.5">*</span>
        </label>
        <textarea
          value={form.description}
          onChange={set('description')}
          placeholder="What needs to change, and why?"
          required
          rows={4}
          className="w-full px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm text-stone-900 bg-white
            outline-none transition-all duration-150 placeholder:text-stone-400 resize-none
            focus:border-stone-900 focus:ring-2 focus:ring-stone-900/8"
        />
      </div>

      <Select label="Priority" value={form.priority} onChange={set('priority')}>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </Select>

      {/* Attachment */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-stone-700 mb-1.5">
          Attachment <span className="font-normal text-stone-400">(optional)</span>
        </label>

        {!file ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex items-center gap-3 px-4 py-4 rounded-xl border-2 border-dashed
              cursor-pointer transition-all duration-150
              ${dragging ? 'border-slate-800 bg-slate-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'}`}
          >
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <UploadIcon />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-600">Click to upload or drag & drop</p>
              <p className="text-xs text-slate-400 mt-0.5">Screenshot, spec doc, etc. (max 10MB)</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0 text-emerald-600">
              <CheckIcon />
            </div>
            <span className="flex-1 text-sm text-slate-700 font-medium truncate">{file.name}</span>
            <button type="button" onClick={() => setFile(null)}
              className="text-slate-400 hover:text-slate-600 transition-colors">
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

      {formError && <Alert type="error">{formError}</Alert>}

      <Button type="submit" loading={submitting} fullWidth>
        {!submitting && <CheckIcon />} {submitting ? 'Submitting…' : 'Submit Request'}
      </Button>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TechEnhancementSection() {
  const [modalOpen, setModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [votingId, setVotingId] = useState(null);

  const hook = useTechEnhancementRequests();
  const {
    pagedRequests, loading, error, stats, currentPage, totalPages, goNext, goPrev,
    fetchRequests, submitRequest, voteCounts, myVotedRequestIds, toggleVote, tokenByRequestId,
  } = hook;

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const showToast = useCallback((text) => {
    setToastMsg(text);
    setTimeout(() => setToastMsg(null), 4000);
  }, []);

  const handleFormSuccess = useCallback(() => {
    setModalOpen(false);
    showToast('✓ Request submitted successfully!');
  }, [showToast]);

  const handleVote = async (id) => {
    setVotingId(id);
    try {
      await toggleVote(id);
    } finally {
      setVotingId(null);
    }
  };

  const openCount = loading ? '-' : Math.max(0, (stats.total || 0) - (stats.done || 0));

  return (
    <div className="space-y-4 mt-10">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4
        flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm shadow-indigo-200">
            <SparkIcon />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">Tech Requests</h2>
            <p className="text-xs text-slate-400 mt-0.5">Submit, browse, and vote on tech enhancement requests</p>
          </div>
        </div>
        <button type="button" onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white
            text-sm font-semibold hover:bg-slate-800 transition-colors shadow-sm">
          <PlusIcon /> New Request
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
        <StatCard label="Total" value={loading ? '-' : stats.total} icon={<ListIcon />} accent="bg-slate-800" />
        <StatCard label="Open" value={openCount} icon={<ClockIcon />} accent="bg-blue-500" />
        <StatCard label="Done" value={loading ? '-' : stats.done} icon={<CheckIcon2 />} accent="bg-emerald-500" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-400 text-sm">
            <SpinnerIcon className="w-5 h-5 text-slate-300" /> Loading…
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center py-16 gap-2 text-center">
            <p className="text-sm text-red-500 font-medium">{error}</p>
            <button onClick={() => fetchRequests()} className="text-xs text-slate-500 underline hover:text-slate-700">
              Try again
            </button>
          </div>
        )}

        {!loading && !error && pagedRequests.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
              <HomeIcon />
            </div>
            <p className="text-sm">No requests submitted yet.</p>
          </div>
        )}

        {!loading && !error && pagedRequests.length > 0 && (
          <div className="overflow-x-auto">
            <div className="flex items-center px-5 py-2.5 bg-slate-50 border-b border-slate-100 min-w-[1380px]">
              {[
                { label: 'Request No.',     flex: '0 0 130px' },
                { label: 'Title',           flex: '0 0 200px' },
                { label: 'Description',     flex: '1 1 0' },
                { label: 'Requested by',    flex: '0 0 150px' },
                { label: 'Department',      flex: '0 0 110px' },
                { label: 'Requested date',  flex: '0 0 110px' },
                { label: 'Priority',        flex: '0 0 110px' },
                { label: 'Status',          flex: '0 0 130px' },
                { label: 'Attachment',      flex: '0 0 90px' },
                { label: 'Votes',           flex: '0 0 90px' },
              ].map((col, i) => (
                <span key={i} style={{ flex: col.flex }}
                  className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2">
                  {col.label}
                </span>
              ))}
            </div>

            {pagedRequests.map((r, i) => (
              <div key={r.id}
                className={`flex items-center px-5 border-b border-slate-50 last:border-0
                  hover:bg-slate-100/70 transition-colors min-h-[64px] min-w-[1380px] ${i % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}`}>
                <span style={{ flex: '0 0 130px' }} className="text-xs font-bold tabular-nums text-slate-500 px-2 py-3">
                  {tokenByRequestId[r.id] || '-'}
                </span>
                <span style={{ flex: '0 0 200px' }} className="text-sm font-semibold text-slate-800 px-2 py-3 leading-snug">
                  {r.title}
                </span>
                <span style={{ flex: '1 1 0' }} className="text-xs text-slate-500 px-2 py-3 leading-snug min-w-0 line-clamp-2">
                  {r.description || '-'}
                </span>
                <span style={{ flex: '0 0 150px' }} className="flex items-center gap-2 text-xs text-slate-600 px-2 py-3 min-w-0">
                  <Avatar name={r.organization_members?.full_name} />
                  <span className="truncate">{r.organization_members?.full_name || '-'}</span>
                </span>
                <span style={{ flex: '0 0 110px' }} className="text-xs text-slate-500 px-2 py-3 capitalize">
                  {r.organization_members?.department || '-'}
                </span>
                <span style={{ flex: '0 0 110px' }} className="text-xs text-slate-500 px-2 py-3 tabular-nums">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                </span>
                <span style={{ flex: '0 0 110px' }} className="px-2 py-3">
                  <PriorityBadge priority={r.priority} />
                </span>
                <span style={{ flex: '0 0 130px' }} className="px-2 py-3">
                  <StatusBadge status={r.status} />
                </span>
                <span style={{ flex: '0 0 90px' }} className="px-2 py-3">
                  {r.attachment_url ? (
                    <a
                      href={getTerFileUrl(r.attachment_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold
                        text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 transition-colors"
                    >
                      <PaperclipIcon /> View
                    </a>
                  ) : (
                    <span className="text-xs text-slate-300">-</span>
                  )}
                </span>
                <span style={{ flex: '0 0 90px' }} className="px-2 py-3">
                  <VoteButton
                    count={voteCounts[r.id] || 0}
                    voted={myVotedRequestIds.has(r.id)}
                    onClick={() => handleVote(r.id)}
                    disabled={votingId === r.id || r.status !== 'submitted'}
                    title={r.status !== 'submitted' ? 'Voting closed: this request has already been approved' : undefined}
                  />
                </span>
              </div>
            ))}
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 px-5 py-3 border-t border-slate-100">
            <button onClick={goPrev} disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold
                text-slate-500 hover:border-slate-400 hover:text-slate-800 transition-all
                disabled:opacity-30 disabled:cursor-not-allowed">
              ← Prev
            </button>
            <span className="text-xs text-slate-400 tabular-nums">Page {currentPage} of {totalPages}</span>
            <button onClick={goNext} disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold
                text-slate-500 hover:border-slate-400 hover:text-slate-800 transition-all
                disabled:opacity-30 disabled:cursor-not-allowed">
              Next →
            </button>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <NewRequestForm onSubmit={submitRequest} onSuccess={handleFormSuccess} />
      </Modal>

      {toastMsg && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2
          px-4 py-3 rounded-xl shadow-lg text-sm font-semibold bg-emerald-600 text-white
          animate-[toastIn_0.2s_ease-out]">
          <CheckIcon /> {toastMsg}
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
