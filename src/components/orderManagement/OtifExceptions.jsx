import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useProfileStore } from '../../stores/profileStore'
import { publicUrl } from './poUtils'
import NewTaskFromSourceModal from '../pm/project/NewTaskFromSourceModal'

// Redesigned to match a "control panel" mock (stat cards, segmented type
// filter, delta badges, inline audit-trail expansion, two-column review
// modal) — the mock used Google-hosted IBM Plex Sans/Mono, which nothing
// else in this app loads; kept the layout/color language but on the app's
// existing font stack (font-mono for the monospace-styled bits) rather than
// pull in a new webfont for one page.

const STATUS_STYLE = {
  pending:  { label: 'Pending',  bg: '#FFF7ED', border: '#FBDCBA', fg: '#9A3412' },
  approved: { label: 'Approved', bg: '#ECFDF5', border: '#BBE9D4', fg: '#0F6B4F' },
  rejected: { label: 'Rejected', bg: '#FEF2F2', border: '#FBD5D5', fg: '#B42318' },
}

const TYPE_FILTERS = [
  { key: 'all',  label: 'All types' },
  { key: 'date', label: 'Date change' },
  { key: 'qty',  label: 'Cancellation' },
]

const PO_SELECT = `
  *,
  purchase_orders(
    po_number,
    ex_factory_date,
    buyer_supplier_links(
      buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(display_name),
      supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(display_name)
    )
  ),
  po_line_items(buyer_sku_ref, quantity_ordered, cancelled_quantity)
`

// Proof can now be a PDF (delay notices, cancellation memos) as well as a
// photo — an <img> tag can't render a PDF, so every display spot needs to
// branch on this instead of assuming an image.
function isPdfProof(url) {
  return !!url && url.toLowerCase().split('?')[0].endsWith('.pdf')
}

function ProofThumb({ url, className }) {
  const href = publicUrl(url)
  if (isPdfProof(url)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title="View PDF proof"
        className={`${className} flex items-center justify-center rounded-lg border border-gray-200 bg-red-50 text-red-600 hover:opacity-80 transition-opacity`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        </svg>
      </a>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      <img src={href} alt="Proof" className={`${className} object-cover cursor-pointer hover:opacity-80 transition-opacity`} />
    </a>
  )
}

function ProofPreview({ url }) {
  const href = publicUrl(url)
  if (isPdfProof(url)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-red-50 text-red-700 hover:opacity-80 transition-opacity">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="text-xs font-semibold">View PDF proof</span>
      </a>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      <img src={href} alt="Proof" className="w-full max-h-36 object-contain rounded-lg border border-gray-200 bg-gray-50" />
    </a>
  )
}

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt) ? '—' : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDateTime(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt)) return '—'
  const time = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${fmtDate(d)} · ${time}`
}
function daysAgo(d) {
  if (!d) return null
  const ms = Date.now() - new Date(d).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}
function ageColor(days) {
  if (days >= 7) return '#B42318'
  if (days >= 3) return '#B0350F'
  return '#8E8E98'
}
function slipDays(current, proposed) {
  if (!current || !proposed) return null
  const d = Math.round((new Date(proposed) - new Date(current)) / 86400000)
  return Number.isFinite(d) ? d : null
}

// One row's worth of derived display strings/values — shared by the desktop
// table and mobile cards, and by the review modal, so the qty-vs-date
// branching only ever lives here.
function deriveRow(ex) {
  const isQty = ex.exception_type === 'quantity_cancellation'
  const po = ex.purchase_orders
  const li = ex.po_line_items
  const st = STATUS_STYLE[ex.status] || STATUS_STYLE.pending
  const days = slipDays(po?.ex_factory_date, ex.proposed_ex_factory_date)
  const qtyOrdered = Number(li?.quantity_ordered) || 0
  const requested = Number(ex.requested_quantity) || 0
  const age = daysAgo(ex.reported_at)

  return {
    ex, isQty, status: ex.status, statusLabel: st.label, badgeBg: st.bg, badgeBorder: st.border, badgeFg: st.fg,
    poNumber: po?.po_number || '—',
    parties: `${po?.buyer_supplier_links?.buyer?.display_name || '—'} · ${po?.buyer_supplier_links?.supplier?.display_name || '—'}`,
    typeLabel: isQty ? 'Qty cancellation' : 'Ex-factory date',
    deltaFrom: isQty ? `${qtyOrdered.toLocaleString()} pcs` : fmtDate(po?.ex_factory_date),
    deltaTo: isQty ? `${(qtyOrdered - requested).toLocaleString()} pcs` : fmtDate(ex.proposed_ex_factory_date),
    // SKU shown separately next to the type label (isQty rows) — no need to
    // repeat it here too.
    reasonLine: isQty
      ? (ex.reason || '—')
      : `${ex.reason || '—'}${days != null ? ` · +${days} days` : ''}`,
    reportedBy: ex.reported_by || '—',
    reportedAt: fmtDate(ex.reported_at),
    showAge: ex.status === 'pending' && age != null,
    ageLabel: `${age}d open`,
    ageFg: ageColor(age ?? 0),
    ageDays: age,
    hasProof: !!ex.proof_url,
    sku: li?.buyer_sku_ref || null,
    qtyOrdered, requested, slip: days,
    reviewedBy: ex.reviewed_by || '—',
    reviewedAt: fmtDateTime(ex.reviewed_at),
    reviewNote: ex.review_note || '—',
    comment: ex.comment || '—',
  }
}

function ReviewModal({ exception: ex, reviewerName, onClose, onDone }) {
  const [note, setNote]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  if (!ex) return null
  const row = deriveRow(ex)
  const { isQty } = row

  const handle = async (action) => {
    setLoading(true)
    setError('')
    try {
      const now = new Date().toISOString()

      if (action === 'approve') {
        const { error: e1 } = await supabase
          .from('otif_exceptions')
          .update({ status: 'approved', reviewed_by: reviewerName, reviewed_at: now, review_note: note.trim() || null })
          .eq('id', ex.id)
        if (e1) throw e1

        if (isQty) {
          const { error: e2 } = await supabase.rpc('apply_line_item_cancellation', {
            p_line_item_id: ex.line_item_id, p_amount: ex.requested_quantity,
          })
          if (e2) throw e2
        } else {
          const { error: e2 } = await supabase
            .from('purchase_orders')
            .update({ exceptional_ex_factory_date: ex.proposed_ex_factory_date })
            .eq('id', ex.po_id)
          if (e2) throw e2
        }
      } else {
        if (!note.trim()) { setError('A note is required to reject a request.'); setLoading(false); return }
        const { error: e1 } = await supabase
          .from('otif_exceptions')
          .update({ status: 'rejected', reviewed_by: reviewerName, reviewed_at: now, review_note: note.trim() })
          .eq('id', ex.id)
        if (e1) throw e1
      }

      const what = isQty ? `${row.requested.toLocaleString()} units on ${row.sku || 'this SKU'}` : `new date ${row.deltaTo}`
      const msg = action === 'approve'
        ? `${row.poNumber} approved — ${what} applied.`
        : `${row.poNumber} rejected — reporter notified.`
      onDone(msg)
      onClose()
    } catch (err) {
      setError(err.message || 'Action failed')
    } finally {
      setLoading(false)
    }
  }

  const kicker = isQty ? 'Quantity cancellation' : 'Ex-factory date change'
  const title = isQty ? `Cancel ${row.requested.toLocaleString()} units` : (row.slip != null ? `Move date by ${row.slip} days` : 'Move ex-factory date')
  const impact = isQty
    ? `Cancels ${row.requested.toLocaleString()} of ${row.qtyOrdered.toLocaleString()} pcs${row.qtyOrdered ? ` — ${Math.round(row.requested / row.qtyOrdered * 100)}% of the line.` : '.'}`
    : `Slips the ex-factory date${row.slip != null ? ` by ${row.slip} days` : ''}. OTIF will be measured against the exceptional date.`
  const consequence = isQty
    ? 'Approving reduces the ordered quantity on the line item and excludes those units from OTIF.'
    : 'Approving writes an exceptional ex-factory date on the PO; the original date is kept for audit.'

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={loading ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">

        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#6E6EDB] mb-1">{kicker}</div>
            <div className="text-[17px] font-bold text-gray-900 tracking-tight">{title}</div>
            <div className="flex items-baseline gap-1.5 flex-wrap mt-0.5">
              <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">PO</span>
              <span className="font-mono text-xs font-semibold text-gray-800">{row.poNumber}</span>
              <span className="text-xs text-gray-600">·</span>
              <span className="text-xs text-gray-700">{row.parties}</span>
              {row.isQty && row.sku && (
                <>
                  <span className="text-xs text-gray-600">·</span>
                  <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">SKU</span>
                  <span className="font-mono text-xs font-semibold text-gray-800">{row.sku}</span>
                </>
              )}
            </div>
          </div>
          <button type="button" onClick={loading ? undefined : onClose}
            className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-600 hover:text-gray-800 transition-colors cursor-pointer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 overflow-y-auto">
          {/* Left column — the ask itself */}
          <div className="p-5 flex flex-col gap-4 sm:border-r border-gray-100">
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-stretch">
                <div className="flex-1 px-4 py-3 bg-gray-50">
                  <div className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-gray-700 mb-1">{isQty ? 'Ordered' : 'Current date'}</div>
                  <div className="font-mono text-base font-semibold text-gray-800">{isQty ? `${row.qtyOrdered.toLocaleString()} pcs` : row.deltaFrom}</div>
                </div>
                <div className="flex-1 px-4 py-3 bg-orange-50 border-l border-orange-100">
                  <div className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-[#B0350F] mb-1">{isQty ? 'After cancellation' : 'Proposed date'}</div>
                  <div className="font-mono text-base font-semibold text-orange-800">{isQty ? `${(row.qtyOrdered - row.requested).toLocaleString()} pcs` : row.deltaTo}</div>
                </div>
              </div>
              <div className="px-4 py-2.5 border-t border-gray-200 text-xs text-gray-700">{impact}</div>
            </div>

            <div>
              <div className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-gray-700 mb-1">Reason</div>
              <div className="text-sm font-semibold text-gray-900">{ex.reason || '—'}</div>
            </div>

            <div>
              <div className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-gray-700 mb-1">Comment</div>
              <p className="text-[13px] text-gray-800 leading-relaxed">{row.comment}</p>
            </div>

            <div className="pt-3 border-t border-gray-100">
              <div className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-gray-700 mb-1">Reported</div>
              <div className="text-xs text-gray-800">{row.reportedBy}</div>
              <div className="font-mono text-[11px] text-gray-700 mt-0.5">
                {row.reportedAt}{row.ageDays != null ? ` · open ${row.ageDays} days` : ''}
              </div>
            </div>
          </div>

          {/* Right column — evidence + decision */}
          <div className="p-5 flex flex-col gap-4">
            <div>
              <div className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-gray-700 mb-1.5">Proof</div>
              {row.hasProof ? (
                <ProofPreview url={ex.proof_url} />
              ) : (
                <div className="px-3 py-2.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-600">No attachment provided.</div>
              )}
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-gray-700">Review note</span>
                <span className="text-[11px] text-gray-700">required to reject</span>
              </div>
              <textarea rows={3} value={note} onChange={e => { setNote(e.target.value); setError('') }}
                placeholder="Add a note…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 resize-none focus:outline-none focus:border-gray-900" />
              {error && (
                <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <span className="text-xs text-red-600">{error}</span>
                </div>
              )}
            </div>

            <div className="mt-auto px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100 text-[11.5px] text-gray-700 leading-relaxed">
              {consequence}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 flex-shrink-0 flex-wrap">
          <span className="font-mono text-[11px] text-gray-700">Reviewing as {reviewerName}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={loading ? undefined : onClose} disabled={loading}
              className="px-3 py-2 text-xs font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer disabled:opacity-40">
              Cancel
            </button>
            <button type="button" disabled={loading} onClick={() => handle('reject')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-200 bg-white text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors cursor-pointer">
              Reject
            </button>
            <button type="button" disabled={loading} onClick={() => handle('approve')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer">
              {loading ? 'Saving…' : (isQty ? 'Approve cancellation' : 'Approve new date')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DeltaBadge({ from, to }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-xs whitespace-nowrap"
      style={{ background: '#FFFCF7', border: '1px solid #F2E3CE' }}>
      <span className="text-gray-700 line-through decoration-gray-500">{from}</span>
      <span className="text-gray-600">→</span>
      <span className="font-semibold text-orange-800">{to}</span>
    </span>
  )
}

function StatusBadge({ row }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: row.badgeBg, border: `1px solid ${row.badgeBorder}`, color: row.badgeFg }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: row.badgeFg }} />
      {row.statusLabel}
    </span>
  )
}

function AuditTrail({ row }) {
  return (
    <div className="border border-gray-200 rounded-xl bg-white px-4 py-3 flex flex-wrap gap-6">
      <div className="flex flex-col gap-0.5 min-w-[120px]">
        <span className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-gray-700">Decision</span>
        <span className="text-[12.5px] font-semibold" style={{ color: row.badgeFg }}>{row.statusLabel}</span>
      </div>
      <div className="flex flex-col gap-0.5 min-w-[120px]">
        <span className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-gray-700">Reviewed by</span>
        <span className="text-[12.5px] text-gray-800">{row.reviewedBy}</span>
        <span className="font-mono text-[11px] text-gray-700">{row.reviewedAt}</span>
      </div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-[180px]">
        <span className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-gray-700">Review note</span>
        <span className="text-[12.5px] text-gray-800 leading-relaxed">{row.reviewNote}</span>
      </div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-[180px]">
        <span className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-gray-700">Reporter comment</span>
        <span className="text-[12.5px] text-gray-800 leading-relaxed">{row.comment}</span>
      </div>
    </div>
  )
}

export default function OtifExceptions({ canReview = false }) {
  const [activeTab, setActiveTab]     = useState('pending')
  const [typeFilter, setTypeFilter]   = useState('all')
  const [query, setQuery]             = useState('')
  const [pendingRows, setPendingRows] = useState([])
  const [historyRows, setHistoryRows] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [reviewing, setReviewing]     = useState(null)
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const [toast, setToast]             = useState('')
  const [taskDraft, setTaskDraft]     = useState(null)
  const toastTimer = useRef(null)

  const { orgMembership } = useProfileStore()
  const reporterName = orgMembership?.fullName
  const reviewerName = orgMembership?.fullName || orgMembership?.memberId || 'Unknown'

  const showToast = (msg) => {
    clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), 3200)
  }

  const fetchData = async () => {
    setLoading(true)
    setError('')

    let pendingQ = supabase.from('otif_exceptions').select(PO_SELECT).eq('status', 'pending').order('reported_at', { ascending: false })
    let historyQ = supabase.from('otif_exceptions').select(PO_SELECT).in('status', ['approved', 'rejected']).order('reported_at', { ascending: false })

    // Non-admins only see their own exceptions
    if (!canReview && reporterName) {
      pendingQ = pendingQ.eq('reported_by', reporterName)
      historyQ = historyQ.eq('reported_by', reporterName)
    }

    const [pendingRes, historyRes] = await Promise.all([pendingQ, historyQ])

    if (pendingRes.error || historyRes.error) {
      setError((pendingRes.error || historyRes.error).message)
      setLoading(false)
      return
    }

    setPendingRows(pendingRes.data || [])
    setHistoryRows(historyRes.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [canReview, reporterName])

  const toggleExpanded = (id) => setExpandedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const typeOf = (ex) => ex.exception_type === 'quantity_cancellation' ? 'qty' : 'date'
  const base = activeTab === 'pending' ? pendingRows : historyRows
  const q = query.trim().toLowerCase()
  const visible = base.filter(ex => {
    if (typeFilter !== 'all' && typeOf(ex) !== typeFilter) return false
    if (!q) return true
    const li = ex.po_line_items
    const po = ex.purchase_orders
    return [po?.po_number, po?.buyer_supplier_links?.buyer?.display_name, po?.buyer_supplier_links?.supplier?.display_name,
      ex.reason, li?.buyer_sku_ref, ex.reported_by].filter(Boolean).join(' ').toLowerCase().includes(q)
  })
  const display = visible.map(deriveRow)

  const tabs = [
    { key: 'pending', label: 'Pending', count: pendingRows.length },
    { key: 'history', label: 'History', count: historyRows.length },
  ]

  const statPending = pendingRows.length
  const statOldest = pendingRows.length ? `${Math.max(...pendingRows.map(ex => daysAgo(ex.reported_at) ?? 0))}d` : '—'
  const statUnits = pendingRows.filter(ex => typeOf(ex) === 'qty').reduce((s, ex) => s + (Number(ex.requested_quantity) || 0), 0)
  const statDecided = historyRows.filter(ex => ex.reviewed_at && daysAgo(ex.reviewed_at) <= 30).length

  const isFiltering = !!q || typeFilter !== 'all'
  const emptyKicker = isFiltering ? 'No matches' : activeTab === 'pending' ? 'Queue clear' : 'No history'
  const emptyBody = isFiltering
    ? 'Nothing matches this search and filter. Clear them to see the full queue.'
    : activeTab === 'pending' ? 'Every exception request has been reviewed.' : 'Approved and rejected requests will appear here.'

  const openTaskFromRow = (row) => {
    setTaskDraft({
      title: `OTIF: ${row.poNumber} — ${row.typeLabel}`,
      description: [row.reasonLine, row.sku ? `SKU: ${row.sku}` : null, row.parties].filter(Boolean).join('\n'),
      labels: ['OTIF', row.isQty ? 'cancellation' : 'date-change'],
      linked_po_id: row.ex.po_id || null,
      po_number: row.poNumber !== '—' ? row.poNumber : null,
    })
  }

  const renderActionCell = (row) => {
    const createBtn = (
      <button type="button" onClick={() => openTaskFromRow(row)}
        className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer">
        Create Task
      </button>
    )
    if (row.status === 'pending') {
      return (
        <div className="flex items-center justify-end gap-1.5 flex-wrap">
          {canReview && (
            <button type="button" onClick={() => setReviewing(row.ex)}
              className="px-3.5 py-1.5 rounded-lg bg-[#2F3CBE] text-white text-xs font-semibold hover:bg-[#262BA8] transition-colors cursor-pointer">
              Review
            </button>
          )}
          {createBtn}
        </div>
      )
    }
    return (
      <div className="flex items-center justify-end gap-1.5 flex-wrap">
        <button type="button" onClick={() => toggleExpanded(row.ex.id)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-800 hover:bg-gray-50 transition-colors cursor-pointer">
          {expandedIds.has(row.ex.id) ? 'Hide trail' : 'Audit trail'}
        </button>
        {createBtn}
      </div>
    )
  }

  return (
    <div className="py-4 px-4 space-y-4">

      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap mt-4">
        <div className="flex flex-col gap-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight leading-tight">Exception Requests</h1>
          <p className="text-[13.5px] text-gray-700">Review requests to move ex-factory dates or cancel ordered quantity.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { fetchData(); showToast('Queue refreshed.') }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-800 hover:bg-gray-50 transition-colors cursor-pointer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Refresh
          </button>
          <Link to="/dashboard/orders?tab=po-table"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#2F3CBE] text-xs font-semibold text-white hover:bg-[#262BA8] transition-colors">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Report exception
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="flex gap-2.5 flex-wrap">
        <div className="flex-1 min-w-[160px] bg-white border border-gray-200 rounded-xl px-4 py-3">
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700">Awaiting review</div>
          <div className="font-mono text-2xl font-semibold text-gray-900 tracking-tight">{statPending}</div>
        </div>
        <div className="flex-1 min-w-[160px] bg-white border border-gray-200 rounded-xl px-4 py-3">
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700">Oldest pending</div>
          <div className="font-mono text-2xl font-semibold tracking-tight" style={{ color: '#B0350F' }}>{statOldest}</div>
        </div>
        <div className="flex-1 min-w-[160px] bg-white border border-gray-200 rounded-xl px-4 py-3">
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700">Units at risk</div>
          <div className="font-mono text-2xl font-semibold text-gray-900 tracking-tight">{statUnits.toLocaleString()}</div>
        </div>
        <div className="flex-1 min-w-[160px] bg-white border border-gray-200 rounded-xl px-4 py-3">
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700">Decided · 30 days</div>
          <div className="font-mono text-2xl font-semibold text-gray-900 tracking-tight">{statDecided}</div>
        </div>
      </div>

      {/* Main card */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

        <div className="flex items-center justify-between gap-4 px-4 border-b border-gray-100 flex-wrap">
          <div className="flex gap-1 -mb-px">
            {tabs.map(t => (
              <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
                className="inline-flex items-center gap-2 px-3.5 py-3.5 border-b-2 text-[13px] font-semibold transition-colors cursor-pointer"
                style={{ borderColor: activeTab === t.key ? '#2F3CBE' : 'transparent', color: activeTab === t.key ? '#18181B' : '#71717A' }}>
                {t.label}
                <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: activeTab === t.key ? '#2F3CBE' : '#F2F2F5', color: activeTab === t.key ? '#FFFFFF' : '#71717A' }}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 py-2.5 flex-wrap">
            <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 rounded-lg">
              {TYPE_FILTERS.map(f => (
                <button key={f.key} type="button" onClick={() => setTypeFilter(f.key)}
                  className="px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                  style={{
                    background: typeFilter === f.key ? '#FFFFFF' : 'transparent',
                    boxShadow: typeFilter === f.key ? '0 1px 2px rgba(24,24,27,.12)' : 'none',
                    color: typeFilter === f.key ? '#18181B' : '#71717A',
                  }}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 px-2.5 h-[34px] border border-gray-200 rounded-lg bg-white min-w-[210px] focus-within:border-gray-900 transition-colors">
              <span className="font-mono text-xs text-gray-500">/</span>
              <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="PO, supplier, SKU, reason…"
                className="flex-1 min-w-0 border-0 outline-none bg-transparent text-xs text-gray-900 placeholder:text-gray-400" />
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <svg className="w-5 h-5 animate-spin text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <p className="text-sm text-gray-700">{error}</p>
            <button type="button" onClick={fetchData}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50">Retry</button>
          </div>
        )}

        {!loading && !error && display.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1.5 py-16 text-center">
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-gray-500">{emptyKicker}</span>
            <p className="text-sm text-gray-700 max-w-xs">{emptyBody}</p>
          </div>
        )}

        {!loading && !error && display.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full min-w-[880px] border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700 border-b border-gray-100 whitespace-nowrap">Order</th>
                    <th className="text-left px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700 border-b border-gray-100 whitespace-nowrap">Request</th>
                    <th className="text-left px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700 border-b border-gray-100 whitespace-nowrap">Reason</th>
                    <th className="text-left px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700 border-b border-gray-100 whitespace-nowrap">Reported</th>
                    <th className="text-left px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700 border-b border-gray-100 whitespace-nowrap">Proof</th>
                    <th className="text-left px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700 border-b border-gray-100 whitespace-nowrap">Status</th>
                    <th className="text-right px-4 py-2.5 border-b border-gray-100">&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {display.map(row => (
                    <Fragment key={row.ex.id}>
                      <tr className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3.5 align-top">
                          <div className="flex items-baseline gap-1 whitespace-nowrap">
                            <span className="text-[8.5px] font-bold text-gray-600 uppercase tracking-widest">PO</span>
                            <span className="font-mono text-[13px] font-semibold text-gray-900">{row.poNumber}</span>
                          </div>
                          <div className="text-[11.5px] text-gray-700 mt-0.5 whitespace-nowrap">{row.parties}</div>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-gray-800">{row.typeLabel}</span>
                            {row.sku && (
                              <span className="inline-flex items-baseline gap-1">
                                <span className="text-[8.5px] font-bold text-gray-600 uppercase tracking-widest">SKU</span>
                                <span className="font-mono text-[10.5px] font-semibold text-indigo-700">{row.sku}</span>
                              </span>
                            )}
                          </div>
                          <DeltaBadge from={row.deltaFrom} to={row.deltaTo} />
                        </td>
                        <td className="px-4 py-3.5 align-top max-w-[230px]">
                          <div className="text-[12.5px] text-gray-800 leading-snug">{row.reasonLine}</div>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <div className="text-[12.5px] text-gray-800 whitespace-nowrap">{row.reportedBy}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[11px] text-gray-700 whitespace-nowrap">{row.reportedAt}</span>
                            {row.showAge && (
                              <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold whitespace-nowrap" style={{ color: row.ageFg }}>
                                <span className="w-1 h-1 rounded-full inline-block" style={{ background: row.ageFg }} />{row.ageLabel}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          {row.hasProof ? (
                            <ProofThumb url={row.ex.proof_url} className="w-9 h-9 rounded-lg border border-gray-200" />
                          ) : <span className="text-xs text-gray-500">—</span>}
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <StatusBadge row={row} />
                        </td>
                        <td className="px-4 py-3.5 align-top text-right whitespace-nowrap">
                          {renderActionCell(row)}
                        </td>
                      </tr>
                      {row.status !== 'pending' && expandedIds.has(row.ex.id) && (
                        <tr>
                          <td colSpan={7} className="px-4 pb-4 bg-gray-50/60">
                            <AuditTrail row={row} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden flex flex-col gap-2.5 p-3">
              {display.map(row => (
                <div key={row.ex.id} className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-1">
                        <span className="text-[8.5px] font-bold text-gray-600 uppercase tracking-widest">PO</span>
                        <span className="font-mono text-sm font-bold text-gray-900 truncate">{row.poNumber}</span>
                      </div>
                      <div className="text-xs text-gray-700 truncate mt-0.5">{row.parties}</div>
                    </div>
                    <StatusBadge row={row} />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-gray-800">{row.typeLabel}</span>
                    {row.sku && (
                      <span className="inline-flex items-baseline gap-1">
                        <span className="text-[8.5px] font-bold text-gray-600 uppercase tracking-widest">SKU</span>
                        <span className="font-mono text-[10.5px] font-semibold text-indigo-700">{row.sku}</span>
                      </span>
                    )}
                    <DeltaBadge from={row.deltaFrom} to={row.deltaTo} />
                  </div>
                  <div className="text-xs text-gray-800">{row.reasonLine}</div>
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                    <div className="min-w-0">
                      <div className="text-xs text-gray-800 truncate">{row.reportedBy}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[11px] text-gray-700">{row.reportedAt}</span>
                        {row.showAge && <span className="font-mono text-[10.5px] font-semibold" style={{ color: row.ageFg }}>{row.ageLabel}</span>}
                      </div>
                    </div>
                    {row.hasProof && (
                      <div className="flex-shrink-0">
                        <ProofThumb url={row.ex.proof_url} className="w-9 h-9 rounded-lg border border-gray-200" />
                      </div>
                    )}
                  </div>
                  <div className="[&_button]:w-full">{renderActionCell(row)}</div>
                  {row.status !== 'pending' && expandedIds.has(row.ex.id) && <AuditTrail row={row} />}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {canReview && (
        <ReviewModal
          exception={reviewing}
          reviewerName={reviewerName}
          onClose={() => setReviewing(null)}
          onDone={(msg) => { fetchData(); if (msg) showToast(msg) }}
        />
      )}

      {toast && (
        <div className="fixed left-1/2 bottom-7 z-[400] -translate-x-1/2 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-[12.5px] font-medium shadow-2xl">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          {toast}
        </div>
      )}

      {taskDraft && (
        <NewTaskFromSourceModal
          source="otif"
          defaults={taskDraft}
          onClose={() => setTaskDraft(null)}
        />
      )}
    </div>
  )
}
