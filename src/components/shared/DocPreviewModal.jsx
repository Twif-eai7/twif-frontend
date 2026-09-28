import { getExtension, SpreadsheetView } from './docViewer'

// Centered-modal doc viewer - same PDF/spreadsheet handling as PiPreviewPanel's
// fixed side panel, but for pages (like PoInspectionComments) that don't have
// a drawer to dock a side panel against. Keeps the click on PO Doc/PI Doc
// buttons in-page instead of navigating to a new tab.
export default function DocPreviewModal({ url, label, onClose }) {
  if (!url) return null
  const ext = getExtension(url)
  const isPdf = ext === 'pdf'
  const isSpreadsheet = ext === 'xlsx' || ext === 'xls'

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="text-sm font-bold text-gray-900">{label}</div>
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

        {isPdf && (
          <iframe src={`${url}#toolbar=0&navpanes=0&scrollbar=0`} title={label} className="flex-1 border-0" />
        )}
        {isSpreadsheet && <SpreadsheetView url={url} />}
        {!isPdf && !isSpreadsheet && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
            <p className="text-sm text-gray-500">Preview isn't available for this file type.</p>
            <a href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-gray-900 hover:underline">Download instead</a>
          </div>
        )}
      </div>
    </div>
  )
}
