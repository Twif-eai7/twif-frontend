import { useState } from 'react'

function tomorrowLocalISO() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Same fixed-position modal shape as CancelQuantityModal.jsx - picks the date
// the checked SKUs get split off to; the actual split (creating the new
// schedule entry and shrinking/cancelling the old one) happens in the
// caller's inspectLater(newDate).
export default function InspectLaterModal({ count, applying, error, onConfirm, onClose }) {
  const min = tomorrowLocalISO()
  const [date, setDate] = useState(min)

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={!applying ? onClose : undefined} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="text-sm font-bold text-gray-900">Inspect Later - {count} SKU{count !== 1 ? 's' : ''}</span>
          <button type="button" onClick={onClose} disabled={applying}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            Moves the {count} selected SKU{count !== 1 ? 's' : ''} off today's inspection - they'll stop appearing here until the date below.
          </p>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">New inspection date</label>
            <input
              type="date" min={min} value={date}
              onChange={e => setDate(e.target.value)}
              className="mt-1 w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
            />
          </div>

          {error && <p className="text-[11px] text-red-600">{error}</p>}

          <button
            type="button" onClick={() => onConfirm(date)}
            disabled={applying || !date}
            className="w-full px-4 py-2.5 rounded-lg text-xs font-bold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {applying ? 'Moving...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
