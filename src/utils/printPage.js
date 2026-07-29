/** Open the browser print dialog for the current page (uses @media print styles). */
export function printPage() {
  window.print();
}

const PRINT_TABLE_STYLES = `
  body { font-family: system-ui, -apple-system, sans-serif; color: #111; padding: 12px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 4px; font-weight: 600; }
  p { font-size: 12px; color: #555; margin: 0 0 20px; }
  .pl-print-summary-wrap {
    padding: 0 !important;
    background: transparent !important;
    border: none !important;
    margin-bottom: 16px;
  }
  .pl-print-summary {
    border: 1px solid #c7d2fe;
    border-radius: 8px;
    background: #eef2ff;
    padding: 12px 16px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .pl-print-summary-title {
    font-size: 10px;
    font-weight: 700;
    color: #3730a3;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 10px;
  }
  .pl-print-summary-grid {
    display: flex !important;
    flex-wrap: wrap;
    gap: 8px 20px;
    line-height: 1.5;
  }
  .pl-print-summary-item {
    display: inline;
    white-space: nowrap;
  }
  .pl-print-summary-label {
    font-size: 11px;
    color: #6b7280;
  }
  .pl-print-summary-sep {
    font-size: 11px;
    color: #6b7280;
  }
  .pl-print-summary-value {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    font-weight: 600;
  }
  .pl-print-val-indigo { color: #4338ca; }
  .pl-print-val-green { color: #15803d; }
  .pl-print-val-violet { color: #7c3aed; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #e5e7eb; padding: 5px 6px; text-align: right; white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  th { background: #f9fafb; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; }
  .overflow-x-auto { border: 1px solid #e5e7eb; border-radius: 8px; overflow: visible !important; }
  @page { size: landscape; margin: 10mm; }
`;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPrintHtml(bodyHtml, { title, subtitle } = {}) {
  const heading = title
    ? `<h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title || "Print")}</title>`
    + `<style>${PRINT_TABLE_STYLES}</style></head>`
    + `<body>${heading}${bodyHtml}</body></html>`;
}

/** Print a single DOM subtree (e.g. modal table) via a hidden iframe — no new tabs. */
export function printElement(element, { title, subtitle } = {}) {
  const bodyHtml = element?.innerHTML?.trim();
  if (!bodyHtml) {
    printPage();
    return;
  }

  const html = buildPrintHtml(bodyHtml, { title, subtitle });
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Print");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  const printWin = iframe.contentWindow;
  const doc = printWin?.document;
  if (!doc) {
    iframe.remove();
    printPage();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    iframe.remove();
  };

  printWin.onafterprint = cleanup;

  setTimeout(() => {
    try {
      printWin.focus();
      printWin.print();
    } catch {
      cleanup();
      printPage();
      return;
    }
    // Fallback if onafterprint is not supported
    setTimeout(cleanup, 3000);
  }, 300);
}
