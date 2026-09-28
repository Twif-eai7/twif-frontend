import { useState } from 'react'
import { createPortal } from 'react-dom'
import { FilterChecklistBody } from './PoInspectionComments'
import { useDragToDismiss } from '../../hooks/useDragToDismiss'

// Mobile equivalent of PoInspectionComments.jsx's ExcelFilterHeader - that
// component is fundamentally desktop-only (a popover anchored to a <th>'s own
// getBoundingClientRect(), and there's no <th> once the table becomes a card
// list on mobile). Rather than one popover per column (no trigger to anchor
// to on mobile), this stacks every filterable column as a collapsible
// section inside one bottom sheet - same filter *logic* as the desktop
// popover (FilterChecklistBody, shared, not reimplemented), just a different
// shell. `sections` is [{ key, label, options, selected, onChange,
// formatLabel? }] - one entry per filterable column, in display order.
export default function MobileFilterSheet({ sections, resultCount, onClear, onClose }) {
  const [openSection, setOpenSection] = useState(sections[0]?.key ?? null)
  const activeCount = sections.filter(s => s.selected !== null).length
  // Drag the sheet down (from the grip handle just below) to dismiss it -
  // the native bottom-sheet gesture, on top of the backdrop-tap/X already
  // here. See useDragToDismiss's own comment for why this is touch-only.
  const { dragY, dragHandlers } = useDragToDismiss({ onDismiss: onClose })

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        style={{ transform: `translateY(${dragY}px)`, transition: dragY === 0 ? 'transform 0.2s ease-out' : 'none' }}
        className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh] sm:max-h-[80vh]"
      >
        {/* Grip handle - visual affordance for the drag-to-dismiss gesture,
            mobile only (sm:hidden - desktop's centered dialog doesn't drag). */}
        <div {...dragHandlers} className="sm:hidden flex items-center justify-center py-2 flex-shrink-0 cursor-grab touch-none">
          <span className="w-9 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="text-sm font-bold text-gray-900">
            Filters {activeCount > 0 && <span className="text-gray-400 font-medium">· {activeCount} active</span>}
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

        <div className="overflow-y-auto min-h-0 flex-1 divide-y divide-gray-100">
          {sections.map(section => {
            const isOpen = openSection === section.key
            const isFiltered = section.selected !== null
            return (
              <div key={section.key}>
                <button
                  type="button"
                  onClick={() => setOpenSection(prev => prev === section.key ? null : section.key)}
                  className="w-full flex items-center justify-between gap-2 px-5 py-3 text-left cursor-pointer"
                >
                  <span className={`text-xs font-bold uppercase tracking-wide ${isFiltered ? 'text-indigo-600' : 'text-gray-700'}`}>
                    {section.label}
                    {isFiltered && <span className="ml-1.5 font-medium normal-case text-[11px] text-indigo-400">({section.selected.size})</span>}
                  </span>
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                    className={`text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {isOpen && (
                  // Every filter section still renders even with just one
                  // (un-uncheckable) option - hiding a section whose current
                  // data happens to only have one distinct value would make
                  // the sheet's shape unpredictable between sessions.
                  section.options.length === 0 ? (
                    <p className="px-5 pb-3 text-[11px] text-gray-400 italic">No values to filter on yet.</p>
                  ) : (
                    <div className="px-3 pb-2">
                      <FilterChecklistBody
                        options={section.options}
                        selected={section.selected}
                        onChange={section.onChange}
                        formatLabel={section.formatLabel}
                      />
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClear}
            disabled={activeCount === 0}
            className="text-xs font-semibold text-gray-500 hover:text-gray-900 disabled:opacity-40 disabled:hover:text-gray-500 transition-colors cursor-pointer"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 transition-colors cursor-pointer"
          >
            Show {resultCount} PO{resultCount === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
