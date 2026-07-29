import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useProfileStore } from '../../stores/profileStore'
import { publicUrl } from './poUtils'

const STATUS_BADGE = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border-red-200',
}

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

        // Set exceptional_ex_factory_date — original ex_factory_date is preserved
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
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="text-sm font-bold text-gray-900">Review Exception</div>
            <div className="text-xs text-gray-500 mt-0.5">
              PO#{ex.purchase_orders?.po_number} · {ex.purchase_orders?.buyer_supplier_links?.buyer?.display_name}
            </div>
          </div>
          <button type="button" onClick={loading ? undefined : onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
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
              Review note <span className="normal-case font-normal text-gray-400">(required for rejection)</span>
            </label>
            <textarea rows={2} value={note} onChange={e => { setNote(e.target.value); setError('') }}
              placeholder="Add a note…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 resize-none focus:outline-none focus:border-gray-900" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
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

export default function OtifPendingExceptions({ canReview = false }) {
  const [rows, setRows]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [reviewing, setReviewing] = useState(null)

  const fetchExceptions = async () => {
    setLoading(true)
    setError('')
    let query = supabase
      .from('otif_exceptions')
      .select(`
        *,
        purchase_orders(
          po_number,
          ex_factory_date,
          buyer_supplier_links(
            buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(display_name),
            supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(display_name)
          )
        )
      `)
      .order('reported_at', { ascending: false })

    // Admins only need to action pending ones; reporters see everything for tracking
    if (canReview) query = query.eq('status', 'pending')

    const { data, error: err } = await query
    if (err) { setError(err.message); setLoading(false); return }
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchExceptions() }, [canReview])

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  return (
    <div className="py-4 px-4 space-y-4">

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
            <h2 className="text-base font-bold text-gray-900 leading-tight">
              {canReview ? 'Pending OTIF Exceptions' : 'OTIF Exception Tracker'}
            </h2>
            <p className="text-xs text-gray-500">
              {canReview
                ? 'Approve or reject reported exceptions to update ex-factory dates'
                : 'Track the status of submitted OTIF exceptions'}
            </p>
          </div>
        </div>
        <button type="button" onClick={fetchExceptions}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Refresh
        </button>
      </div>

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
          <button type="button" onClick={fetchExceptions}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50">Retry</button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <p className="text-sm text-gray-500">
            {canReview ? 'No pending exceptions' : 'No exceptions submitted yet'}
          </p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
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
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold capitalize ${STATUS_BADGE[ex.status] || ''}`}>
                        {ex.status}
                      </span>
                    </td>
                    {canReview && (
                      <td className="px-4 py-2.5 text-right">
                        <button type="button" onClick={() => setReviewing(ex)}
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
        </div>
      )}

      {canReview && (
        <ReviewModal
          exception={reviewing}
          onClose={() => setReviewing(null)}
          onDone={fetchExceptions}
        />
      )}
    </div>
  )
}
