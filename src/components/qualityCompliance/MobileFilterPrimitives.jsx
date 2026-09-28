import { createPortal } from 'react-dom'
import { useDragToDismiss } from '../../hooks/useDragToDismiss'

// Small shared pieces for mobile filter UI - split into their own file
// (rather than living in QcReportsSummary.jsx, which originally defined
// them) so RepositoryPanel.jsx can reuse the exact same trigger icon/field
// label/sheet shell without a circular import (QcReportsSummary.jsx already
// imports QcRepositoryPanel.jsx, which imports RepositoryPanel.jsx).

// Mobile filter-sheet trigger icon - shared by every "Filters" entry point
// on this page so they all read as the same affordance.
export function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="flex-shrink-0">
      <path d="M4 5h16M7 12h10M10 19h4" />
    </svg>
  )
}

export function FilterField({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</label>
      {children}
    </div>
  )
}

// Generic bottom-sheet shell for a mobile filters trigger - drag-to-dismiss
// grip handle, header + close, scrollable body, optional footer - shared by
// QcReportsSummary.jsx's own MobileTopFiltersSheet and RepositoryPanel.jsx's
// combined sheet, so both read as the exact same "Filters" affordance
// rather than two differently-shaped sheets.
export function FilterSheetShell({ title, onClose, children, footer }) {
  const { dragY, dragHandlers } = useDragToDismiss({ onDismiss: onClose })
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        style={{ transform: `translateY(${dragY}px)`, transition: dragY === 0 ? 'transform 0.2s ease-out' : 'none' }}
        className="relative bg-white rounded-t-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
      >
        <div {...dragHandlers} className="flex items-center justify-center py-2 flex-shrink-0 cursor-grab touch-none">
          <span className="w-9 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="text-sm font-bold text-gray-900">{title}</div>
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
        <div className="overflow-y-auto min-h-0 flex-1 px-5 py-4 space-y-4">
          {children}
        </div>
        {footer && <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
