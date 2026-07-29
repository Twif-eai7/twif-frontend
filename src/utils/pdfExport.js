import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatPlExportDate } from "./plScheduleExport";

function fmtCell(val) {
  if (val == null || val === "") return "—";
  if (typeof val === "number") {
    return val.toLocaleString("en-US", {
      minimumFractionDigits: Number.isInteger(val) ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }
  return String(val);
}

export function downloadSummaryPdf({ headers, dataRows, title, subtitle, filename }) {
  if (!headers?.length || !dataRows?.length) return;

  const doc = new jsPDF({
    orientation: headers.length > 8 ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text(title, 14, 16);

  let y = 22;
  if (subtitle) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(subtitle, 14, y);
    y += 6;
  }

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Downloaded on ${formatPlExportDate()}`, 14, y);
  const startY = y + 6;

  autoTable(doc, {
    startY,
    head: [headers],
    body: dataRows.map((row) => row.map(fmtCell)),
    theme: "grid",
    headStyles: { fillColor: [199, 210, 254], textColor: [30, 27, 75], fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: Object.fromEntries(
      headers.map((_, i) => [i, { halign: i === 0 ? "left" : "right" }]),
    ),
  });

  const out = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  doc.save(out);
}
