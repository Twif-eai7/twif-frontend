// The actual PDF generation this file used to hold (exportInspectionReportPdf,
// exportSplitInspectionReportPdfs, splitReportsIntoParts, the whole jsPDF
// layout) moved server-side in Phase 3 of "move PDF generation server-side,
// network-bound not device-bound" - see shopify-backend/service/
// inspectionReportPdf.js and src/lib/inspectionReportPdfApi.js.
// A weak/old device building a large batch's PDF itself was a real crash
// risk (confirmed live: 8 SKUs/300 photos exceeded the browser's max string
// length); the server has no such ceiling and was proven at real scale
// (PO 131759, 12 SKUs, 442 photos, 60s, zero crash) before every Preview/
// Download/Send Mail/Export All call site switched over to it.
//
// mergePdfBlobs is the one piece still used client-side (QcReportsSummary.jsx's
// "Export All") - it only concatenates already-finished PDF pages, no image
// processing or photo fetching, so it was never the crash risk the rest of
// this file was.

// Combines several already-generated single-PO PDF blobs into one file -
// each blob keeps its own letterhead/footer/page numbering exactly as
// generated, this just concatenates their pages in order. pdf-lib (not
// jsPDF) does this since jsPDF has no "import pages from another finished
// PDF" operation of its own.
export async function mergePdfBlobs(blobs) {
  const { PDFDocument } = await import('pdf-lib')
  const merged = await PDFDocument.create()
  for (const blob of blobs) {
    const bytes = await blob.arrayBuffer()
    const src = await PDFDocument.load(bytes)
    const pages = await merged.copyPages(src, src.getPageIndices())
    pages.forEach(p => merged.addPage(p))
  }
  const mergedBytes = await merged.save()
  return new Blob([mergedBytes], { type: 'application/pdf' })
}
