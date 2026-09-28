import { useEffect, useRef, useState } from 'react'
import { Spinner } from '../ui/Spinner'
import { formatDateTime } from '../../utils/formatters'

/**
 * Shows the exact NDA PDF that will be sent, generated live from current data
 * (no persistence). Confirming here is the Verify step - it's a distinct,
 * logged action, not implied by simply opening the preview.
 *
 * onReject   - optional; opens the reject flow for this org
 * onAddNote  - optional; (text) => Promise<{success,error}>, saves an internal note
 * notes      - array of { id, note, author_name, created_at }
 * noteBusy   - bool, a note save is in flight
 */
export function NdaPreviewModal({ orgName, fetchPreview, onConfirm, onCancel, confirming, onReject, onAddNote, notes = [], noteBusy }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [notesOpen, setNotesOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const urlRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetchPreview().then(result => {
      if (cancelled) return
      if (result.success) {
        urlRef.current = result.url
        setUrl(result.url)
      } else {
        setError(result.error)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveNote() {
    const text = noteText.trim()
    if (!text || !onAddNote) return
    const r = await onAddNote(text)
    if (r?.success) setNoteText('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-8">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xl w-full max-w-3xl h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <div>
            <h3 className="text-base font-medium text-stone-900">Review NDA - {orgName}</h3>
            <p className="text-xs text-stone-500 mt-0.5">This is the exact document that will be sent once approved.</p>
          </div>
          <button onClick={onCancel} className="text-stone-400 hover:text-stone-700 transition-colors" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="m3 3 10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 bg-stone-100">
          {loading ? (
            <div className="h-full flex items-center justify-center"><Spinner light={false} size="w-6 h-6" /></div>
          ) : error ? (
            <div className="h-full flex items-center justify-center text-sm text-red-600 px-6 text-center">{error}</div>
          ) : (
            <iframe src={url} title="NDA preview" className="w-full h-full border-0" />
          )}
        </div>

        {notesOpen && (
          <div className="border-t border-stone-100 px-6 py-4 max-h-64 overflow-y-auto">
            <div className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Internal notes</div>
            {notes.length === 0 ? (
              <p className="text-xs text-stone-400 mb-3">No notes yet.</p>
            ) : (
              <div className="flex flex-col gap-2 mb-3">
                {notes.map(n => (
                  <div key={n.id} className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">
                    <div className="text-[11px] text-stone-400">
                      {n.author_name || 'Admin'} · {formatDateTime(n.created_at)}
                    </div>
                    <p className="text-xs text-stone-700 whitespace-pre-wrap mt-0.5">{n.note}</p>
                  </div>
                ))}
              </div>
            )}
            <textarea
              rows={3}
              placeholder="Add an internal note (only admins see this)"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 resize-none focus:outline-none focus:ring-2 focus:ring-stone-300"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={saveNote}
                disabled={!noteText.trim() || noteBusy}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-stone-900 rounded-lg hover:bg-stone-800 transition-colors disabled:opacity-50"
              >
                {noteBusy && <Spinner size="w-3 h-3" light />}
                Save note
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-stone-100">
          <div className="flex items-center gap-2">
            {onReject && (
              <button
                onClick={onReject}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Reject
              </button>
            )}
            {onAddNote && (
              <button
                onClick={() => setNotesOpen(o => !o)}
                className="px-4 py-2 text-sm font-medium text-stone-600 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors"
              >
                Comment{notes.length ? ` (${notes.length})` : ''}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-stone-600 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors">
              Close
            </button>
            <button
              onClick={onConfirm}
              disabled={loading || !!error || confirming}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-stone-900 rounded-lg hover:bg-stone-800 transition-colors disabled:opacity-50"
            >
              {confirming && <Spinner size="w-3 h-3" light />}
              Looks correct - mark as verified
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
