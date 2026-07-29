import { useState, useRef, useCallback } from "react";
 
// ─── Icons ────────────────────────────────────────────────────────────────────
 
const IconFile = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);
 
const IconZoomOut = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);
 
const IconZoomIn = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);
 
const IconRefresh = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
  </svg>
);
 
const IconDownload = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
 
const IconExternalLink = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);
 
// ─── Toolbar Button ────────────────────────────────────────────────────────────
 
function ToolbarButton({ onClick, title, children, active }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`
        flex items-center justify-center w-8 h-8 rounded-md transition-all duration-150
        ${active
          ? "bg-emerald-50 text-emerald-600 shadow-inner"
          : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700"}
        border border-slate-200 shadow-sm cursor-pointer
      `}
    >
      {children}
    </button>
  );
}
 
// ─── Zoom Badge ───────────────────────────────────────────────────────────────
 
function ZoomBadge({ zoom }) {
  return (
    <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 min-w-[3rem] text-center select-none">
      {Math.round(zoom * 100)}%
    </span>
  );
}
 
// ─── Main Component ────────────────────────────────────────────────────────────
 
/**
 * GoogleSheetEmbed
 *
 * Props:
 *   sheetId   – Google Sheets document ID (required)
 *   gid       – Sheet tab ID (default: 0)
 *   title     – Display title in toolbar (default: "Google Sheet")
 *   height    – Container height (default: "calc(100vh - 180px)")
 *   viewMode  – "preview" | "edit"  (default: "preview")
 */
export default function GoogleSheetEmbed({
  sheetId = "",
  gid = 0,
  title = "Google Sheet",
  height = "calc(100vh - 180px)",
  viewMode = "preview",
}) {
  const iframeRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
 
  const baseUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/${viewMode}?usp=sharing&rm=minimal&gid=${gid}&single=true&widget=true&chrome=false`;
 
  const handleRefresh = useCallback(() => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  }, []);
 
  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.1, 2)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.1, 0.5)), []);
  const handleResetZoom = useCallback(() => setZoom(1), []);
 
  const handleDownload = () => {
    window.open(
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx&gid=${gid}`,
      "_blank"
    );
  };
 
  const handleOpenInSheets = () => {
    window.open(
      `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${gid}`,
      "_blank",
      "noopener"
    );
  };
 
  if (!sheetId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-400 gap-3">
        <IconFile />
        <p className="text-sm font-medium">No Google Sheet ID provided</p>
      </div>
    );
  }
 
  return (
    <div className="flex flex-col rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-white">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 shrink-0">
        {/* Left: title */}
        <div className="flex items-center gap-2.5">
          <span className="text-emerald-600">
            <IconFile />
          </span>
          <span className="text-sm font-semibold text-slate-700 tracking-tight">{title}</span>
        </div>
 
        {/* Right: actions */}
        <div className="flex items-center gap-1.5">
          <ToolbarButton onClick={handleZoomOut} title="Zoom Out">
            <IconZoomOut />
          </ToolbarButton>
 
          <button
            onClick={handleResetZoom}
            title="Reset zoom"
            className="cursor-pointer"
          >
            <ZoomBadge zoom={zoom} />
          </button>
 
          <ToolbarButton onClick={handleZoomIn} title="Zoom In">
            <IconZoomIn />
          </ToolbarButton>
 
          <div className="w-px h-5 bg-slate-200 mx-0.5" />
 
          <ToolbarButton onClick={handleRefresh} title="Refresh">
            <IconRefresh />
          </ToolbarButton>
 
          <ToolbarButton onClick={handleDownload} title="Download as XLSX">
            <IconDownload />
          </ToolbarButton>
 
          <ToolbarButton onClick={handleOpenInSheets} title="Open in Google Sheets">
            <IconExternalLink />
          </ToolbarButton>
        </div>
      </div>
 
      {/* ── Sheet Container ── */}
      <div className="p-4 relative overflow-hidden bg-white" style={{ height }}>
        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white gap-3">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
              <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
            </div>
            <p className="text-sm text-slate-400 font-medium">Loading spreadsheet…</p>
          </div>
        )}
 
        {/* Iframe */}
        <iframe
          key={refreshKey}
          ref={iframeRef}
          src={baseUrl}
          onLoad={() => setLoading(false)}
          style={{
            width: `${100 / zoom}%`,
            height: `${100 / zoom}%`,
            border: "none",
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            opacity: loading ? 0 : 1,
            transition: "opacity 0.25s ease, transform 0.2s ease",
          }}
          title={title}
          allowFullScreen
        />
      </div>
    </div>
  );
}