// Shared retry-capable error state for any list/table whose data fetch can
// genuinely fail (network error, RLS/permission error, etc.) - most lists in
// this app today just console.error and leave the list silently empty on a
// failed fetch, which reads identically to "nothing to show" even though
// those are very different situations for a user to be in. Used across the
// PO Inspection flow's mobile redesign (Scheduled POs list, SKU overview,
// per-stage tables) wherever a fetch failure needs a visible, actionable
// state instead of a blank list.
export default function FetchErrorCard({ message = 'Something went wrong loading this.', onRetry, retrying = false }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-10 px-4 text-center">
      <div className="w-9 h-9 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <p className="text-xs text-gray-500 max-w-[220px]">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={retrying ? 'animate-spin' : ''}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  )
}
