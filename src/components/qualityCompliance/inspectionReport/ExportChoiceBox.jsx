// Shown wherever an export used to auto-generate a preview immediately -
// Preview is real server-side work (it still has to fetch every original
// photo before it can downscale one - see inspectionReportPdfApi.js's own
// note), so it's no longer the default/only path. Letting Download skip
// Preview entirely is also what actually fixes a weak device being stuck
// behind a slow/failed preview before it could ever reach Download.
export default function ExportChoiceBox({ onPreview, onDownload, disabled }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10 px-6 text-center">
      <p className="text-xs text-gray-500 max-w-xs">
        Preview takes more than usual time. Recommended to download and view.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPreview}
          disabled={disabled}
          className="px-4 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={disabled}
          className="px-4 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          Download
        </button>
      </div>
    </div>
  )
}
