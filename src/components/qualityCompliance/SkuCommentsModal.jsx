import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'

function Spinner({ size = 'w-4 h-4' }) {
  return (
    <svg className={`${size} animate-spin text-gray-400`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

// `lineItem` is optional - omitted (or null) means the PO-wide thread
// (line_item_id IS NULL), which is what a comment button shown with no SKU
// selected opens. Same table, same modal, just a different scope.
export default function SkuCommentsModal({ po, lineItem, userName, canComment, onClose }) {
  const [comments, setComments]   = useState([])
  const [loading, setLoading]     = useState(false)
  const [commentText, setCommentText] = useState('')
  const [posting, setPosting]     = useState(false)
  const [postError, setPostError] = useState(null)

  const fetchComments = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('po_comments')
      .select('id, comment, created_by, created_at')
      .eq('po_id', po.id)
      .eq('comment_type', 'QA_INSPECTION')
      .order('created_at', { ascending: true })
    q = lineItem ? q.eq('line_item_id', lineItem.id) : q.is('line_item_id', null)
    const { data } = await q
    setLoading(false)
    setComments(data || [])
  }, [po.id, lineItem])

  useEffect(() => { fetchComments() }, [fetchComments])

  const submitComment = async () => {
    if (!commentText.trim()) return
    setPosting(true)
    setPostError(null)
    const { error } = await supabase.from('po_comments').insert({
      po_id:        po.id,
      line_item_id: lineItem?.id ?? null,
      comment_type: 'QA_INSPECTION',
      comment:      commentText.trim(),
      created_by:   userName,
    })
    setPosting(false)
    if (error) { setPostError(error.message); return }
    setCommentText('')
    fetchComments()
  }

  // Portaled to document.body - opened from inside the Inspection wizard's
  // own slide-in panel, which animates via a CSS transform. That creates a
  // new containing block for any `position: fixed` descendant, so without
  // a portal this modal gets clipped to the wizard panel's own box instead
  // of the real viewport, squeezing its footer out of view (same bug fixed
  // in CalloutModal.jsx).
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-900 truncate">
              {lineItem ? `Comments · SKU ${lineItem.buyer_sku_ref || '—'}` : 'Comments · Whole PO'}
            </div>
            <div className="text-xs text-gray-500 mt-0.5 truncate">PO {po.po_number}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Comment list */}
        <div className="overflow-y-auto px-5 py-4 flex-1">
          {loading && (
            <div className="flex items-center gap-2 py-2">
              <Spinner size="w-3.5 h-3.5" />
              <span className="text-xs text-gray-400">Loading…</span>
            </div>
          )}

          {!loading && comments.length === 0 && (
            <p className="text-xs text-gray-400">No comments yet for {lineItem ? 'this SKU' : 'this PO'}.</p>
          )}

          {!loading && comments.length > 0 && (
            <div className="space-y-2.5">
              {comments.map(c => (
                <div key={c.id} className="flex items-start gap-2.5 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl">
                  <div className="w-7 h-7 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {c.created_by?.charAt(0)?.toUpperCase() ?? 'Q'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-800">{c.created_by}</span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        {' · '}
                        {new Date(c.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap leading-relaxed">{c.comment}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Form */}
        <div className="flex-shrink-0 px-5 pt-2 pb-4 border-t border-gray-100">
          {canComment ? (
            <div className="space-y-2">
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment()
                }}
                placeholder={lineItem ? 'Add a comment for this SKU…' : 'Add a comment for this PO…'}
                rows={3}
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 resize-none"
              />
              {postError && <p className="text-xs text-red-500">{postError}</p>}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-400 truncate">
                  As <span className="font-semibold text-gray-600">{userName}</span>
                </span>
                <button
                  type="button"
                  onClick={submitComment}
                  disabled={!commentText.trim() || posting}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  {posting && <Spinner size="w-3 h-3" />}
                  {posting ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">
              View only — only QA and Tech members can post.
            </p>
          )}
        </div>

      </div>
    </div>,
    document.body
  )
}
