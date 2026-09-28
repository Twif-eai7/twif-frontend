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

/** Styled single-sheet summary export (light-blue header, borders, column widths).
 * extraSheets (optional): [{ name, rows }] — plain unstyled sheets appended after
 * the main one, e.g. a caveat/notes sheet. Existing callers passing nothing keep
 * their current single-sheet output unchanged. */
export function downloadSummaryXlsx(rows, sheetName, filename, extraSheets = []) {
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

  extraSheets.forEach(({ name, rows: sheetRows }) => {
    if (!sheetRows?.length) return
    const extraWs = XLSX.utils.aoa_to_sheet(sheetRows)
    extraWs["!cols"] = [{ wch: 110 }]
    XLSX.utils.book_append_sheet(wb, extraWs, name.slice(0, 31))
  })

  const out = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, out);
}

/** @deprecated Use downloadSummaryXlsx for summary tables */
export function downloadXlsx(rows, sheetName, filename) {
  downloadSummaryXlsx(rows, sheetName, filename);
}

const GROUP_HEADER_STYLE = {
  fill: { patternType: "solid", fgColor: { rgb: "E5E7EB" } },
  font: { bold: true, sz: 10, color: { rgb: "111827" } },
  alignment: { horizontal: "left", vertical: "center" },
  border: THIN_BORDER,
};

function pivotDataCellStyle(colIdx, rowIdx) {
  const isEven = rowIdx % 2 === 0;
  return {
    fill: { patternType: "solid", fgColor: { rgb: isEven ? "FFFFFF" : "F9FAFB" } },
    font: { sz: 10, color: { rgb: "111827" } },
    alignment: {
      horizontal: colIdx === 0 ? "left" : "right",
      vertical: "center",
      indent: colIdx === 0 ? 1 : 0,
    },
    border: THIN_BORDER,
  };
}

const SUBTOTAL_STYLE = {
  fill: { patternType: "solid", fgColor: { rgb: "DBEAFE" } },
  font: { bold: true, sz: 10, color: { rgb: "1E3A8A" } },
  border: THIN_BORDER,
};
function subtotalCellStyle(colIdx) {
  return {
    ...SUBTOTAL_STYLE,
    alignment: { horizontal: colIdx === 0 ? "left" : "right", vertical: "center" },
  };
}
// No fill/border at all — a plain spacer row between one buyer's block and
// the next, not another (empty-looking) bordered grid row.
const BLANK_ROW_STYLE = {};

/** Pivot-style export: row 0 is the header (a label column + one column per
 * period); rows[i] (i >= 1) is one of, per rowKinds[i - 1]:
 * - "group": bold, un-indented buyer-name row, values left blank
 * - "data": indented vendor row, one number per period column
 * - "subtotal": bold buyer-level sum row (one number per period column)
 * - "blank": empty spacer row between one buyer's block and the next
 * Used by the Weekly/Monthly MIS export's buyer > vendor pivot layout — a
 * genuinely different shape (dynamic period columns, multi-level row
 * grouping) from downloadSummaryXlsx's uniform flat rows, so it's its own
 * function rather than another branch on that one. */
export function downloadPivotXlsx(rows, rowKinds, sheetName, filename, extraSheets = []) {
  if (!rows.length) return;

  const [headers, ...dataRows] = rows;
  const ws = XLSX.utils.aoa_to_sheet(rows);

  const colCount = headers.length;
  const rowCount = rows.length;

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { v: "", t: "s" };

      const kind = r === 0 ? "header" : rowKinds[r - 1];
      if (kind === "header") {
        ws[addr].s = HEADER_STYLE;
      } else if (kind === "group") {
        ws[addr].s = GROUP_HEADER_STYLE;
      } else if (kind === "blank") {
        ws[addr].s = BLANK_ROW_STYLE;
      } else if (kind === "subtotal") {
        ws[addr].s = subtotalCellStyle(c);
        const val = ws[addr].v;
        if (c > 0 && typeof val === "number") {
          ws[addr].z = Number.isInteger(val) ? "#,##0" : "#,##0.00";
        }
      } else {
        ws[addr].s = pivotDataCellStyle(c, r);
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

  extraSheets.forEach(({ name, rows: sheetRows }) => {
    if (!sheetRows?.length) return
    const extraWs = XLSX.utils.aoa_to_sheet(sheetRows)
    extraWs["!cols"] = [{ wch: 110 }]
    XLSX.utils.book_append_sheet(wb, extraWs, name.slice(0, 31))
  })

  const out = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, out);
}
