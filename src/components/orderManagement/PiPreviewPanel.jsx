import { createPortal } from 'react-dom'
import { getExtension, SpreadsheetView } from '../shared/docViewer'

// Fixed panel to the left of PoDrawer so the PI stays visible while filling
// in line items. `offsetRightPx` matches the drawer's current width so the
// two never overlap. Desktop-only (hidden on narrow screens — no room for
// both panels at once; the existing DocChip download link still works there).
export default function PiPreviewPanel({ url, offsetRightPx, onClose, title = 'PI Document' }) {
  if (!url) return null
  const ext = getExtension(url)
  const isPdf         = ext === 'pdf'
  const isSpreadsheet = ext === 'xlsx' || ext === 'xls'

  return createPortal(
    <div
      // z-135 — above SkuReviewDrawer's own backdrop (z-130), which otherwise
      // dims and blocks clicks on this panel when creating/editing a SKU on
      // top of PO Drawer. Still below SkuReviewDrawer's own drawer content
      // (z-140), which is fine since they never overlap positionally anyway
      // (this panel is far-left, that drawer is right-anchored).
      className="fixed inset-y-0 left-0 z-[135] bg-white border-r border-gray-200 shadow-2xl hidden sm:flex flex-col"
      style={{ right: offsetRightPx }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <span className="text-sm font-bold text-gray-900">{title}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* toolbar=0 above strips the iframe's own download control for
              PDFs — this is the one place left to get the raw file, opening
              the browser's own full viewer (with its normal toolbar) in a
              new tab rather than this stripped-down iframe. */}
          <a href={url} target="_blank" rel="noreferrer" title="Download"
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </a>
          <button type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* toolbar/navpanes=0 strips Chrome's built-in PDF viewer chrome (thumbnail
          rail, zoom/print/download bar) — just the page content, since this is
          meant for glancing at while copy-pasting SKU/qty/price into the form,
          not for using as a full document viewer. */}
      {isPdf && <iframe src={`${url}#toolbar=0&navpanes=0&scrollbar=0`} title="PI Document" className="flex-1 border-0" />}
      {isSpreadsheet && <SpreadsheetView url={url} />}
      {!isPdf && !isSpreadsheet && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
          <p className="text-sm text-gray-500">Preview isn't available for this file type.</p>
          <a href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-gray-900 hover:underline">Download instead</a>
        </div>
      )}
    </div>,
    document.body
  )
}
