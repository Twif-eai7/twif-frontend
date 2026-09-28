import { supabase } from './supabase'

// Phase 3 - client for the server-side inspection-report PDF generator
// (shopify-backend/routes/inspectionSchedule.js POST /generate-pdf, backed
// by service/inspectionReportPdf.js). Replaces the old in-browser generator
// (src/utils/exportInspectionReportPdf.js, retired) for every Preview/
// Download/Send Mail/Export All call site - see the approved "move PDF
// generation server-side" plan for why: a weak device could crash building
// a large batch itself; the server has no such ceiling and was proven at
// real scale (PO 131759, 12 SKUs, 442 photos, 60s, zero crash) before this
// was wired in.
//
// mode: 'preview' (default) - one merged PDF, downscaled photos, fast
// response, no batch number allocated, never a zip. 'final' - full
// original quality, batch number allocated, split into a zip of part-PDFs
// only if the photo count actually warrants it. Preview is still real work
// (the server has to fetch every original photo before it can downscale
// one) - it is NOT instant for a large batch, just reliable; see the
// two-button Preview/Download choice UI built around this for why callers
// warn the user about that before triggering 'preview'.
//
// The backend never streams the file bytes back itself - Cloud Run hard-caps
// a buffered (non-chunked) response at 32MiB, which a real batch blows past
// (production hit this live as a browser "Failed to fetch" on an 8-report/
// 300-photo PO). It instead uploads the built file to Storage and returns
// {url, path, size, filename, isZip} JSON - the actual bytes only get
// fetched from that url when a caller needs them in-browser (see
// fetchInspectionReportPdf below); fetchInspectionReportPdfLocation skips
// that entirely for a caller that only needs the location.
//
// Sends the caller's own Supabase session token - the backend route now
// requires it (requireAuth) and checks the caller's org actually owns
// poId/reportIds before generating anything. This used to be reachable
// with no auth at all; that was a latent gap while every caller was
// internal Merchant Portal staff, but SupplierQcReports.jsx is the first
// EXTERNAL (vendor-org) UI to call this, so an unauthenticated request
// could otherwise pull another supplier's full report (including
// defects/photos this app deliberately never shows them) just by editing
// poId/reportIds client-side. Same session.access_token pattern already
// used by every other authenticated backend call in this app (e.g.
// useOrgLookup.js).
async function requestGeneratedPdfLocation(poId, reportIds, mode, createdBy) {
  const { data: { session } } = await supabase.auth.getSession()
  // A browser "Failed to fetch" (network TypeError) here means the request to the report server
  // itself got no answer (server crash/timeout, connection, CORS on an error page) - said plainly so
  // it can be told apart from the file download failing below.
  let res
  try {
    res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/inspection-schedule/generate-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ poId, reportIds, mode, createdBy }),
    })
  } catch (err) {
    throw new Error(`Could not reach the report server (${err?.message || 'network error'}). It may be busy building a large report; check your connection and try again.`)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Failed to generate PDF (${res.status})`)
  }
  return res.json()
}

// For a caller that needs the actual file bytes in the browser (Download,
// the Preview modal) - fetches the real bytes from Storage second, off
// Cloud Run entirely, so its 32MiB response cap never applies regardless of
// batch size.
export async function fetchInspectionReportPdf(poId, reportIds, { mode = 'preview', createdBy = null } = {}) {
  const { url, filename, isZip } = await requestGeneratedPdfLocation(poId, reportIds, mode, createdBy)
  // The server already built the file; a failure from here on is the download to THIS device.
  // One automatic retry: a slow or dropped mobile/site connection often fails a large download
  // once and succeeds the second time (the file is already built and waiting in Storage).
  let blob
  let lastErr
  for (let attempt = 0; attempt < 2 && !blob; attempt++) {
    try {
      const fileRes = await fetch(url)
      if (!fileRes.ok) throw new Error(`Failed to download generated file (${fileRes.status})`)
      blob = await fileRes.blob()
    } catch (err) {
      lastErr = err
    }
  }
  if (!blob) {
    if (/Failed to download generated file/.test(lastErr?.message || '')) throw lastErr
    throw new Error(`The report was built but could not be downloaded to this device (${lastErr?.message || 'network error'}). Your connection may be too slow for a report this size; try again or select fewer reports.`)
  }
  return { blob, filename, isZip }
}

// For a caller that only needs WHERE the file ended up (Send Mail's
// attachment build) - a public url, its bucket-relative path (for the
// backend's own Storage-side attachment lookup) and its byte size (to
// decide the "too large to attach outright" case), without ever pulling the
// file through the browser at all. A real batch's file easily runs into the
// hundreds of MB (see fetchInspectionReportPdf's own note) - downloading
// that just to immediately re-upload it elsewhere for an attachment
// reference the server had already produced was real, reproduced dead
// weight, not a hypothetical: it's what was actually timing out/failing on
// a real network even after the server-side generation itself worked.
export async function fetchInspectionReportPdfLocation(poId, reportIds, { mode = 'final', createdBy = null } = {}) {
  const { url, path, size, filename, isZip } = await requestGeneratedPdfLocation(poId, reportIds, mode, createdBy)
  return { url, path, size, filename, isZip }
}

// Triggers a real browser download of an already-fetched blob - same
// anchor-click pattern the old client-side generator and PhotoGalleryModal's
// own bulk zip download already used.
export function downloadBlob(blob, filename) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}
