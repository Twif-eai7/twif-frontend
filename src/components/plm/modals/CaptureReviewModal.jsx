// Shown after a camera session ends (see CameraCaptureModal) — a grid of everything just
// captured, so a bulk shoot can be triaged in one pass: drop the bad ones, edit only the ones
// that need it, then attach the rest in one go, instead of being forced to decide per-shot.
// Styled to match this app's own modal convention (e.g. the Proceed-to-Sample confirm dialog
// in WorkspaceModal.jsx) — opaque white card, black borders, small uppercase labels — instead
// of a generic dark full-bleed overlay.
export default function CaptureReviewModal({ items, onEdit, onRemove, onRetakeMore, onDiscardAll, onAttach }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
      <div className="bg-white w-full max-w-[720px] max-h-[85vh] rounded-md shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black flex-shrink-0">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[.1em] text-black mb-0.5">Review Photos</div>
            <div className="text-[15px] font-extrabold text-[#1A1A18] tracking-tight">
              {items.length} photo{items.length === 1 ? '' : 's'} captured
            </div>
          </div>
          <button
            type="button"
            onClick={onDiscardAll}
            className="text-[10px] font-bold uppercase tracking-[.06em] text-[#7A1A1A] hover:opacity-70 cursor-pointer border-none bg-none"
          >
            Discard all
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="text-black/40 text-[11px] text-center py-16">No photos taken.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map(item => (
                <div key={item.id} className="border border-black rounded-sm overflow-hidden flex flex-col">
                  <div className="relative aspect-square bg-[#f5f3ef]">
                    <img src={item.blobUrl} alt="" className="w-full h-full object-cover" />
                    {item.edited && (
                      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-sm bg-[#1A1A18] text-white text-[8px] font-bold uppercase tracking-[.05em]">
                        Edited
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemove(item.id)}
                      title="Remove"
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white border border-black flex items-center justify-center text-black cursor-pointer hover:opacity-70"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEdit(item.id)}
                    className="py-1.5 border-t border-black bg-white hover:bg-black/[.04] text-[#1A1A18] text-[10px] font-bold uppercase tracking-[.06em] cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-black flex-shrink-0">
          <button
            type="button"
            onClick={onRetakeMore}
            className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-[.06em] border border-black rounded-sm text-[#1A1A18] cursor-pointer hover:bg-black/[.04] whitespace-nowrap"
          >
            + Take more
          </button>
          <button
            type="button"
            onClick={onAttach}
            disabled={!items.length}
            className="flex-1 px-4 py-2 text-[10px] font-extrabold uppercase tracking-[.06em] bg-[#1A1A18] text-white rounded-sm cursor-pointer hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Attach {items.length > 0 ? `${items.length} photo${items.length === 1 ? '' : 's'}` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
