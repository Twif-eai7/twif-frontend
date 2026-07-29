import { useState } from 'react'
import { Spinner } from '../ui/Spinner'

// ─── Page header ──────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <h1 className="text-xl font-medium text-stone-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-stone-500 mt-1">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────
const BADGE = {
  active:    'bg-green-50 text-green-700 border-green-200',
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
  member:    'bg-sky-50 text-sky-700 border-sky-200',
  owner:     'bg-purple-50 text-purple-700 border-purple-200',
  admin:     'bg-stone-100 text-stone-700 border-stone-300',
  buyer:     'bg-teal-50 text-teal-700 border-teal-200',
  supplier:  'bg-orange-50 text-orange-700 border-orange-200',
  claim:     'bg-violet-50 text-violet-700 border-violet-200',
}

export function Badge({ label }) {
  const style = BADGE[label?.toLowerCase()] || 'bg-stone-100 text-stone-600 border-stone-200'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border capitalize ${style}`}>
      {label}
    </span>
  )
}

// ─── Stat card ────────────────────────────────────────────────
export function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <div className="text-xs font-medium text-stone-400 uppercase tracking-widest mb-2">{label}</div>
      <div className="text-3xl font-medium text-stone-900 tracking-tight">{value ?? '—'}</div>
      {sub && <div className="text-xs text-stone-400 mt-1">{sub}</div>}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────
export function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mb-4 text-stone-400">
        {icon}
      </div>
      <div className="text-sm font-medium text-stone-700 mb-1">{title}</div>
      {subtitle && <div className="text-xs text-stone-400 max-w-xs">{subtitle}</div>}
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────
export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-stone-100 rounded-lg animate-pulse" />
      ))}
    </div>
  )
}

// ─── Action buttons ───────────────────────────────────────────
export function ApproveButton({ onClick, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
    >
      {loading ? <Spinner size="w-3 h-3" light={false} /> : (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="m2 6 2.5 2.5 5.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      Approve
    </button>
  )
}

export function RejectButton({ onClick, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
    >
      {loading ? <Spinner size="w-3 h-3" light={false} /> : (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="m3 3 6 6m0-6L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
      Reject
    </button>
  )
}

// ─── Reject reason modal ──────────────────────────────────────
export function RejectModal({ title, onConfirm, onCancel, loading }) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xl w-full max-w-md p-6">
        <h3 className="text-base font-medium text-stone-900 mb-1">{title}</h3>
        <p className="text-sm text-stone-500 mb-4">
          Optionally provide a reason — it will be included in the rejection email.
        </p>
        <textarea
          className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 resize-none focus:outline-none focus:ring-2 focus:ring-stone-300 mb-4"
          rows={3}
          placeholder="Reason (optional)"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-stone-600 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {loading && <Spinner size="w-3 h-3" light />}
            Confirm rejection
          </button>
        </div>
      </div>
    </div>
  )
}