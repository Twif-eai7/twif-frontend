import * as XLSX from "xlsx-js-style";

const THIN_BORDER = {
  top:    { style: "thin", color: { rgb: "D1D5DB" } },
  bottom: { style: "thin", color: { rgb: "D1D5DB" } },
  left:   { style: "thin", color: { rgb: "D1D5DB" } },
  right:  { style: "thin", color: { rgb: "D1D5DB" } },
};

const HEADER_STYLE = {
  fill: { patternType: "solid", fgColor: { rgb: "C7D2FE" } },
  font: { bold: true, color: { rgb: "1E1B4B" }, sz: 10 },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: THIN_BORDER,
};

function dataCellStyle(colIdx, rowIdx) {
  const isEven = rowIdx % 2 === 0;
  return {
    fill: { patternType: "solid", fgColor: { rgb: isEven ? "FFFFFF" : "F9FAFB" } },
    font: { sz: 10, color: { rgb: "111827" } },
    alignment: {
      horizontal: colIdx === 0 ? "left" : "right",
      vertical: "center",
    },
    border: THIN_BORDER,
  };
}

function colWidths(headers, dataRows) {
  return headers.map((h, ci) => {
    const lengths = [String(h).length, ...dataRows.map((r) => {
      const v = r[ci];
      if (v == null) return 0;
      if (typeof v === "number") return v.toLocaleString("en-US", { maximumFractionDigits: 2 }).length;
      return String(v).length;
    })];
    return { wch: Math.min(Math.max(...lengths) + 3, 28) };
  });
}

/** Styled single-sheet summary export (light-blue header, borders, column widths). */
export function downloadSummaryXlsx(rows, sheetName, filename) {
  if (!rows.length) return;

  const [headers, ...dataRows] = rows;
  const ws = XLSX.utils.aoa_to_sheet(rows);

  const colCount = headers.length;
  const rowCount = rows.length;

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { v: "", t: "s" };

      if (r === 0) {
        ws[addr].s = HEADER_STYLE;
      } else {
        ws[addr].s = dataCellStyle(c, r);
        const val = ws[addr].v;
        if (c > 0 && typeof val === "number") {
          ws[addr].z = Number.isInteger(val) ? "#,##0" : "#,##0.00";
        }
      }
    }
  }

  ws["!cols"] = colWidths(headers, dataRows);
  ws["!rows"] = [{ hpt: 28 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const out = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, out);
}

/** @deprecated Use downloadSummaryXlsx for summary tables */
export function downloadXlsx(rows, sheetName, filename) {
  downloadSummaryXlsx(rows, sheetName, filename);
}
