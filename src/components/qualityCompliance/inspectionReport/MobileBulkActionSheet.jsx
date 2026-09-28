import { createPortal } from 'react-dom'
import { useDragToDismiss } from '../../../hooks/useDragToDismiss'

// Mobile replacement for InspectionReportEntry.jsx's no-SKU-selected
// toolbar, which today is a single `overflow-x-auto` row of up to 7 buttons
// (Rework, PPM/Pilot Run Callouts, Send Mail, Inspect Later, Accept, Export
// PDF) - workable on desktop, but a horizontally-scrolling row of actions is
// exactly the kind of thing a phone user can miss entirely (nothing on
// screen hints there's more to the right). This is a compact primary bar
// (Accept + one "Actions" trigger) plus a bottom sheet listing everything
// else as full-width rows - same handlers/disabled-gates the desktop
// buttons already use, passed in as props rather than reimplemented here.
//
// `actions` is an ordered list of secondary actions (everything except
// Accept, which gets its own always-visible primary button):
// [{ key, label, sublabel?, onClick, disabled, disabledReason?, tone? }]
// `tone` is 'default' | 'amber' | 'indigo' - matches the color families the
// desktop buttons already use for Rework/Callouts respectively.
const TONE_CLASSES = {
  default: 'text-gray-700',
  amber: 'text-amber-700',
  indigo: 'text-indigo-700',
}

export default function MobileBulkActionSheet({
  open, onClose, checkedCount, onClearSelection,
  onAccept, acceptDisabled, acceptLabel, acceptDisabledReason,
  actions, note, exportAction,
}) {
  // Called ahead of the `if (!open)` early return below - a hook can't be
  // called after one without breaking React's rules-of-hooks. Harmless to
  // run while closed (dragY just stays 0, unused).
  const { dragY, dragHandlers } = useDragToDismiss({ onDismiss: onClose })
  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        style={{ transform: `translateY(${dragY}px)`, transition: dragY === 0 ? 'transform 0.2s ease-out' : 'none' }}
        className="relative bg-white rounded-t-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]"
      >
        {/* Grip handle - drag-to-dismiss's visual affordance, same as
            MobileFilterSheet's own (this sheet is mobile-only already, no
            sm:hidden needed here). */}
        <div {...dragHandlers} className="flex items-center justify-center py-2 flex-shrink-0 cursor-grab touch-none">
          <span className="w-9 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="text-sm font-bold text-gray-900">{checkedCount} SKU{checkedCount !== 1 ? 's' : ''} selected</div>
            <button type="button" onClick={onClearSelection} className="text-[11px] font-semibold text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
              Clear selection
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {note && (
          <p className={`px-5 pt-2.5 text-xs flex-shrink-0 ${note.tone === 'error' ? 'text-red-600' : 'text-gray-500'}`}>{note.text}</p>
        )}

        <div className="overflow-y-auto min-h-0 flex-1 py-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={acceptDisabled}
            className="w-full flex items-center justify-between gap-2 px-5 py-3 text-left disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            <span className="text-sm font-semibold text-emerald-700">{acceptLabel}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600 flex-shrink-0">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          {/* Disabled reason shown inline, always visible rather than a
              hover-only title tooltip - touch has no hover state, so the
              desktop convention of "read the title attribute" doesn't
              reach mobile users at all. */}
          {acceptDisabled && acceptDisabledReason && (
            <p className="px-5 -mt-1 pb-2 text-[11px] text-gray-400">{acceptDisabledReason}</p>
          )}

          {actions.map(a => (
            <div key={a.key} className="border-t border-gray-50">
              <button
                type="button"
                onClick={a.onClick}
                disabled={a.disabled}
                className="w-full flex items-center justify-between gap-2 px-5 py-3 text-left disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <span className={`text-sm font-semibold ${TONE_CLASSES[a.tone || 'default']}`}>{a.label}</span>
                {a.sublabel && <span className="text-[11px] text-gray-400 flex-shrink-0">{a.sublabel}</span>}
              </button>
              {a.disabled && a.disabledReason && (
                <p className="px-5 -mt-1 pb-2 text-[11px] text-gray-400">{a.disabledReason}</p>
              )}
            </div>
          ))}

          {exportAction && (
            <div className="border-t border-gray-50">
              <button
                type="button"
                onClick={exportAction.onClick}
                className="w-full flex items-center justify-between gap-2 px-5 py-3 text-left cursor-pointer"
              >
                <span className="text-sm font-semibold text-gray-700">Export PDF</span>
                <span className="text-[11px] text-gray-400 flex-shrink-0">{exportAction.sublabel}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
