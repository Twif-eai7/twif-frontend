import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useProfileStore } from '../../stores/profileStore'
import { publicUrl } from './poUtils'

const STATUS_BADGE = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border-red-200',
}

const PO_SELECT = `
  *,
  purchase_orders(
    po_number,
    ex_factory_date,
    buyer_supplier_links(
      buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(display_name),
      supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(display_name)
    )
  )
`

function ReviewModal({ exception: ex, onClose, onDone }) {
  const [note, setNote]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  if (!ex) return null

  const { orgMembership } = useProfileStore.getState()
  const reviewerName = orgMembership?.fullName || orgMembership?.memberId || 'Unknown'

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

        const { error: e2 } = await supabase
          .from('purchase_orders')
          .update({ exceptional_ex_factory_date: ex.proposed_ex_factory_date })
          .eq('id', ex.po_id)
        if (e2) throw e2
      } else {
        if (!note.trim()) { setError('Please provide a reason for rejection.'); setLoading(false); return }
        const { error: e1 } = await supabase
          .from('otif_exceptions')
          .update({ status: 'rejected', reviewed_by: reviewerName, reviewed_at: now, review_note: note.trim() })
          .eq('id', ex.id)
        if (e1) throw e1
      }

      onDone()
      onClose()
    } catch (err) {
      setError(err.message || 'Action failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={loading ? undefined : onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="text-sm font-bold text-gray-900">Review Exception</div>
            <div className="text-xs text-gray-500 mt-0.5">
              PO#{ex.purchase_orders?.po_number} · {ex.purchase_orders?.buyer_supplier_links?.buyer?.display_name}
            </div>
          </div>
          <button type="button" onClick={loading ? undefined : onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto">
          <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex-1 text-center">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Current</div>
              <div className="text-xs font-semibold text-gray-700">{ex.purchase_orders?.ex_factory_date || '—'}</div>
            </div>
            <svg className="w-4 h-4 text-amber-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <div className="flex-1 text-center">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Proposed</div>
              <div className="text-xs font-semibold text-amber-700">{ex.proposed_ex_factory_date}</div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {ex.reason && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" className="flex-shrink-0">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span className="text-xs text-amber-800 font-medium">{ex.reason}</span>
              </div>
            )}
            <div>
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Comment</div>
              <p className="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">{ex.comment}</p>
            </div>
          </div>

          {ex.proof_url && (
            <div>
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Proof</div>
              <a href={publicUrl(ex.proof_url)} target="_blank" rel="noopener noreferrer">
                <img src={publicUrl(ex.proof_url)} alt="Proof" className="w-full max-h-36 object-contain rounded-lg border border-gray-200 bg-gray-50" />
              </a>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-xs text-red-600">{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Review note <span className="normal-case font-normal">(required for rejection)</span>
            </label>
            <textarea rows={2} value={note} onChange={e => { setNote(e.target.value); setError('') }}
              placeholder="Add a note…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 resize-none focus:outline-none focus:border-gray-900" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-2.5 border-t border-gray-100 flex-shrink-0">
          <button type="button" onClick={loading ? undefined : onClose} disabled={loading}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors cursor-pointer disabled:opacity-40">
            Cancel
          </button>
          <button type="button" disabled={loading} onClick={() => handle('reject')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors cursor-pointer">
            Reject
          </button>
          <button type="button" disabled={loading} onClick={() => handle('approve')}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer">
            {loading ? 'Saving…' : 'Approve & Update Date'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ExceptionsTable({ rows, canReview, onReview, fmtDate }) {
  if (rows.length === 0) return (
    <div className="flex flex-col items-center justify-center py-14 gap-2">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <p className="text-sm text-gray-400">Nothing here</p>
    </div>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide">PO Number</th>
            <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide">Buyer</th>
            <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide">Supplier</th>
            <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">Current Ex-Factory</th>
            <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">Proposed Date</th>
            <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide">Reason</th>
            <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide">Reported By</th>
            <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide">Reported At</th>
            <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide">Proof</th>
            <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide">Status</th>
            {canReview && <th className="px-4 py-2 w-10" />}
          </tr>
        </thead>
        <tbody>
          {rows.map(ex => (
            <tr key={ex.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td className="px-4 py-2.5 text-xs font-semibold text-gray-900">{ex.purchase_orders?.po_number || '—'}</td>
              <td className="px-4 py-2.5 text-xs text-gray-700">{ex.purchase_orders?.buyer_supplier_links?.buyer?.display_name || '—'}</td>
              <td className="px-4 py-2.5 text-xs text-gray-600">{ex.purchase_orders?.buyer_supplier_links?.supplier?.display_name || '—'}</td>
              <td className="px-4 py-2.5 text-xs text-gray-600">{ex.purchase_orders?.ex_factory_date || '—'}</td>
              <td className="px-4 py-2.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-700">
                  {ex.proposed_ex_factory_date}
                </span>
              </td>
              <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[160px]">
                <span className="inline-block truncate max-w-full" title={ex.reason}>{ex.reason || '—'}</span>
              </td>
              <td className="px-4 py-2.5 text-xs text-gray-600">{ex.reported_by}</td>
              <td className="px-4 py-2.5 text-xs text-gray-500">{fmtDate(ex.reported_at)}</td>
              <td className="px-4 py-2.5">
                {ex.proof_url ? (
                  <a href={publicUrl(ex.proof_url)} target="_blank" rel="noopener noreferrer">
                    <img src={publicUrl(ex.proof_url)} alt="Proof"
                      className="w-10 h-10 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity cursor-pointer" />
                  </a>
                ) : <span className="text-xs text-gray-400">—</span>}
              </td>
              <td className="px-4 py-2.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold capitalize ${STATUS_BADGE[ex.status] || ''}`}>
                  {ex.status}
                </span>
              </td>
              {canReview && (
                <td className="px-4 py-2.5 text-right">
                  <button type="button" onClick={() => onReview(ex)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-900 text-[11px] font-semibold text-white hover:bg-gray-700 transition-colors cursor-pointer">
                    Review
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function OtifExceptions({ canReview = false }) {
  const [activeTab, setActiveTab]   = useState('pending')
  const [pending, setPending]       = useState([])
  const [history, setHistory]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [reviewing, setReviewing]   = useState(null)

  const { orgMembership } = useProfileStore()
  const reporterName = orgMembership?.fullName

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

    setPending(pendingRes.data || [])
    setHistory(historyRes.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [canReview, reporterName])

  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'

  const tabs = [
    { key: 'pending', label: 'Pending', count: pending.length },
    { key: 'history', label: 'History', count: history.length },
  ]

  return (
    <div className="py-4 px-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap mt-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center text-white flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 leading-tight">OTIF Exceptions</h2>
            <p className="text-xs text-gray-500">Track and manage OTIF exception requests</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={fetchData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Refresh
          </button>
          <Link to="/dashboard/orders?tab=po-table"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 transition-colors">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Report Exception
          </Link>
        </div>
      </div>

      {/* Internal tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer -mb-px
              ${activeTab === t.key
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
              ${activeTab === t.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <svg className="w-5 h-5 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-sm text-gray-500">{error}</p>
          <button type="button" onClick={fetchData}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50">Retry</button>
        </div>
      )}

      {!loading && !error && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {activeTab === 'pending' && (
            <ExceptionsTable
              rows={pending}
              canReview={canReview}
              onReview={setReviewing}
              fmtDate={fmtDate}
            />
          )}
          {activeTab === 'history' && (
            <ExceptionsTable
              rows={history}
              canReview={false}
              onReview={() => {}}
              fmtDate={fmtDate}
            />
          )}
        </div>
      )}

      {canReview && (
        <ReviewModal
          exception={reviewing}
          onClose={() => setReviewing(null)}
          onDone={fetchData}
        />
      )}
    </div>
  )
}
