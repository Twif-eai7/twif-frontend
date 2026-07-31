import * as XLSX from "xlsx-js-style";
import { fmtD, MONTH_NAMES, normStr, computeMonthPlSummary, computeOverallPoComm, computeSinglePoComm } from "./plDataHelpers";
import { FALLBACK_RATES, usdToInr, formatChehomaCommissionNote } from "./formatters";

function usdToDisplay(usd, showInr, rates) {
  const n = Number(usd);
  if (isNaN(n)) return null;
  if (!showInr) return n;
  return usdToInr(n, rates);
}

export function calcPoStatus(lines) {
  const bal = lines.reduce((s, r) => s + (r.balanceQty || 0), 0);
  const shp = lines.reduce((s, r) => s + (r.shippedQty || 0), 0);
  if (bal <= 0) return { label: "Shipped" };
  if (shp > 0) return { label: "Partial" };
  return { label: "Pending" };
}

const EXCEL_STYLES = {
  projLabel:  { fill: { patternType: "solid", fgColor: { rgb: "312E81" } }, font: { bold: true, color: { rgb: "FFFFFF" }, sz: 14 } },
  projHeader: { fill: { patternType: "solid", fgColor: { rgb: "C7D2FE" } }, font: { bold: true, color: { rgb: "1E1B4B" }, sz: 10 } },
  projTotal:  { fill: { patternType: "solid", fgColor: { rgb: "4338CA" } }, font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 } },
  shipLabel:  { fill: { patternType: "solid", fgColor: { rgb: "14532D" } }, font: { bold: true, color: { rgb: "FFFFFF" }, sz: 14 } },
  shipHeader: { fill: { patternType: "solid", fgColor: { rgb: "BBF7D0" } }, font: { bold: true, color: { rgb: "14532D" }, sz: 10 } },
  shipTotal:  { fill: { patternType: "solid", fgColor: { rgb: "15803D" } }, font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 } },
};

export function formatPlExportDate(date = new Date()) {
  const d = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const t = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${d}, ${t}`;
}

const MIS_STYLES = {
  header: { fill: { patternType: "solid", fgColor: { rgb: "BFDBFE" } }, font: { bold: true, color: { rgb: "1E3A5F" }, sz: 10 } },
  income: { fill: { patternType: "solid", fgColor: { rgb: "EFF6FF" } }, font: { color: { rgb: "1D4ED8" }, sz: 10 } },
  monthLabel: { fill: { patternType: "solid", fgColor: { rgb: "DBEAFE" } }, font: { bold: true, color: { rgb: "1E3A5F" }, sz: 11 } },
  metaDate: { font: { italic: true, color: { rgb: "6B7280" }, sz: 10 } },
  input:  { fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } }, font: { sz: 10 } },
  total:  { fill: { patternType: "solid", fgColor: { rgb: "F3F4F6" } }, font: { bold: true, sz: 10 } },
  ebitda: { fill: { patternType: "solid", fgColor: { rgb: "EEF2FF" } }, font: { bold: true, color: { rgb: "3730A3" }, sz: 10 } },
};

function applyRowStyle(ws, rowIdx, style, colCount) {
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
    if (!ws[addr]) ws[addr] = { v: "", t: "s" };
    ws[addr].s = style;
  }
}

function applyMisStyle(ws, ri, style) {
  for (let c = 0; c < 3; c++) {
    const addr = XLSX.utils.encode_cell({ r: ri, c });
    if (!ws[addr]) ws[addr] = { v: "", t: "s" };
    ws[addr].s = style;
  }
}

const fmtMisPct = (v) => (v != null ? `${parseFloat(v).toFixed(2)}%` : "—");
const fmtMisCur = (v) => (v != null ? `$${parseFloat(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—");

function formatPoShpDateLabel(lines, inPeriod = () => true) {
  const shpDates = [...new Set(lines.filter(inPeriod).map((r) => r.shippedDate).filter(Boolean))].sort();
  if (shpDates.length === 0) return "—";
  const fmt = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return shpDates.length === 1 ? fmt(shpDates[0]) : `${fmt(shpDates[0])}–${fmt(shpDates[shpDates.length - 1])}`;
}

function buildPeriodSheet(wk, view, plMode, { getCommPct, getJngCommPct, getJnmCommPct, buyerRateMap }) {
  const isOverall = plMode === "overall";
  const commLabel = view === "week" ? "Commission TW ($)" : "Commission TM ($)";
  const PROJ_HDR = isOverall
    ? ["Customer", "Vendor", "PO No.", "SKUs", "Ord Qty", "Shp Qty", "Bal Qty", "Order Val ($)", "Shipped ($)", "Shp Date", "Balance ($)", "Comm JNM %", "Comm TWIF %", "Comm JNM $", "Comm TWIF $", "Overall Comm", "Target Shipped Date", "Status"]
    : ["Customer", "Vendor", "PO No.", "SKUs", "Ord Qty", "Shp Qty", "Bal Qty", "Order Val ($)", "Shipped ($)", "Shp Date", "Balance ($)", "Commission %", commLabel, "Target Shipped Date", "Status"];
  const SHIP_HDR = isOverall
    ? ["Customer", "Vendor", "PO No.", "SKUs", "Ord Qty", "Shp Qty", "Bal Qty", "Order Val ($)", "Shipped ($)", "Shp Date", "Balance ($)", "Comm JNM %", "Comm TWIF %", "Comm JNM $", "Comm TWIF $", "Overall Comm", "Status"]
    : ["Customer", "Vendor", "PO No.", "SKUs", "Ord Qty", "Shp Qty", "Bal Qty", "Order Val ($)", "Shipped ($)", "Shp Date", "Balance ($)", "Commission %", commLabel, "Status"];
  const NUM_COLS = PROJ_HDR.length;

  const openPosArr = Object.values(wk.openPos);
  const shippedPosArr = Object.values(wk.shippedPos);
  const rows = [];
  const styledRows = {};

  const push = (row, styleKey) => {
    if (styleKey) styledRows[rows.length] = styleKey;
    rows.push(row);
  };

  const inWkH = (r) => { const d = new Date(r.shippedDate); return r.shippedDate && d >= wk.start && d <= wk.end; };
  const hkOOV = openPosArr.reduce((s, p) => s + p.lines.reduce((ss, r) => ss + (r.orderValue || 0), 0), 0);
  const hkOSV = openPosArr.reduce((s, p) => s + p.lines.reduce((ss, r) => ss + (inWkH(r) ? (r.shippedValue || 0) : 0), 0), 0);
  const otif = hkOOV > 0 ? `${((hkOSV / hkOOV) * 100).toFixed(1)}%` : "—";

  const periodLabel = view === "week" ? `W${wk.week}` : MONTH_NAMES[wk.month];

  if (openPosArr.length > 0) {
    push([`${periodLabel} Projected   ${fmtD(wk.start)}–${fmtD(wk.end)}, ${wk.year}`, `OTIF ${otif}`], "projLabel");
    push(PROJ_HDR, "projHeader");

    let tLines = 0, tOQ = 0, tSQ = 0, tOV = 0, tSV = 0, tProjComm = 0, tJnmComm = 0, tJngComm = 0;
    openPosArr.forEach((po) => {
      const oV = po.lines.reduce((s, r) => s + (r.orderValue || 0), 0);
      const oQ = po.lines.reduce((s, r) => s + (r.orderQty || 0), 0);
      const inW = (r) => { const d = new Date(r.shippedDate); return r.shippedDate && d >= wk.start && d <= wk.end; };
      const sQ = po.lines.reduce((s, r) => s + (inW(r) ? (r.shippedQty || 0) : 0), 0);
      const sV = po.lines.reduce((s, r) => s + (inW(r) ? (r.shippedValue || 0) : 0), 0);
      const shippedHere = po.lines.some((r) => { if (!r.shippedDate) return false; const d = new Date(r.shippedDate); return d >= wk.start && d <= wk.end; });
      const status = shippedHere ? calcPoStatus(po.lines).label : "Pending";
      tLines += po.lines.length; tOQ += oQ; tSQ += sQ; tOV += oV; tSV += sV;
      if (isOverall) {
        const { jnmPct, jngPct, jnmAmt, jngAmt } = computeOverallPoComm(po, oV, getJnmCommPct, getJngCommPct);
        if (jnmAmt != null) tJnmComm += jnmAmt;
        if (jngAmt != null) tJngComm += jngAmt;
        const overall = (jnmAmt != null || jngAmt != null) ? (jnmAmt ?? 0) + (jngAmt ?? 0) : null;
        if (overall != null) tProjComm += overall;
        push([po.customer, po.vendor, po.poNo, po.lines.length, oQ, sQ || null, oQ - sQ, oV, sV || null, formatPoShpDateLabel(po.lines, inW), oV - sV, jnmPct, jngPct, jnmAmt, jngAmt, overall, po.lines[0]?.target || "", status]);
      } else {
        const { pct: commPct, amt: commAmt } = computeSinglePoComm(po, oV, getCommPct);
        if (commAmt != null) tProjComm += commAmt;
        push([po.customer, po.vendor, po.poNo, po.lines.length, oQ, sQ || null, oQ - sQ, oV, sV || null, formatPoShpDateLabel(po.lines, inW), oV - sV, commPct, commAmt, po.lines[0]?.target || "", status]);
      }
    });
    push(isOverall
      ? ["TOTAL", "", "", tLines, tOQ, tSQ, tOQ - tSQ, tOV, tSV, "", tOV - tSV, null, null, tJnmComm || null, tJngComm || null, (tJnmComm + tJngComm) || null, "", ""]
      : ["TOTAL", "", "", tLines, tOQ, tSQ, tOQ - tSQ, tOV, tSV, "", tOV - tSV, null, tProjComm || null, "", ""],
      "projTotal");
  }

  if (shippedPosArr.length > 0) {
    if (rows.length) push([]);
    push([`${periodLabel} Overall Shipped   ${fmtD(wk.start)}–${fmtD(wk.end)}, ${wk.year}`], "shipLabel");
    push(SHIP_HDR, "shipHeader");

    let tLines = 0, tOQ = 0, tSQ = 0, tBQ = 0, tOV = 0, tSV = 0, tBV = 0, tShipComm = 0, tJnmComm = 0, tJngComm = 0;
    shippedPosArr.forEach((po) => {
      const oV = po.lines.reduce((s, r) => s + (r.orderValue || 0), 0);
      const sV = po.lines.reduce((s, r) => s + (r.shippedValue || 0), 0);
      const bV = po.lines.reduce((s, r) => s + (r.balanceValue || 0), 0);
      const oQ = po.lines.reduce((s, r) => s + (r.orderQty || 0), 0);
      const sQ = po.lines.reduce((s, r) => s + (r.shippedQty || 0), 0);
      const bQ = po.lines.reduce((s, r) => s + (r.balanceQty || 0), 0);
      tLines += po.lines.length; tOQ += oQ; tSQ += sQ; tBQ += bQ; tOV += oV; tSV += sV; tBV += bV;
      if (isOverall) {
        const { jnmPct, jngPct, jnmAmt, jngAmt } = computeOverallPoComm(po, sV, getJnmCommPct, getJngCommPct);
        if (jnmAmt != null) tJnmComm += jnmAmt;
        if (jngAmt != null) tJngComm += jngAmt;
        const overall = (jnmAmt != null || jngAmt != null) ? (jnmAmt ?? 0) + (jngAmt ?? 0) : null;
        if (overall != null) tShipComm += overall;
        push([po.customer, po.vendor, po.poNo, po.lines.length, oQ, sQ, bQ, oV, sV, formatPoShpDateLabel(po.lines), bV, jnmPct, jngPct, jnmAmt, jngAmt, overall, calcPoStatus(po.lines).label]);
      } else {
        const { pct: commPct, amt: commAmt } = computeSinglePoComm(po, sV, getCommPct);
        if (commAmt != null) tShipComm += commAmt;
        push([po.customer, po.vendor, po.poNo, po.lines.length, oQ, sQ, bQ, oV, sV, formatPoShpDateLabel(po.lines), bV, commPct, commAmt, calcPoStatus(po.lines).label]);
      }
    });

    const exportFlatFee = ((plMode === "jng" || plMode === "overall") && view === "month")
      ? (() => {
          const seen = new Set();
          return shippedPosArr.reduce((s, p) => {
            const k = normStr(p.customer);
            if (seen.has(k)) return s;
            const e = buyerRateMap[k];
            if (!e || e.remarks !== "MONTHLY") return s;
            seen.add(k);
            return s + (e.pct || 0);
          }, 0);
        })()
      : 0;

    push(isOverall
      ? ["TOTAL", "", "", tLines, tOQ, tSQ, tBQ, tOV, tSV, "", tBV, null, null, tJnmComm || null, (tJngComm + exportFlatFee) || null, (tJnmComm + tJngComm + exportFlatFee) || null, ""]
      : ["TOTAL", "", "", tLines, tOQ, tSQ, tBQ, tOV, tSV, "", tBV, null, (tShipComm + exportFlatFee) || null, ""],
      "shipTotal");
  }

  if (!rows.length) return null;

  const ws = XLSX.utils.aoa_to_sheet(rows);
  Object.entries(styledRows).forEach(([ri, key]) => applyRowStyle(ws, Number(ri), EXCEL_STYLES[key], NUM_COLS));
  ws["!cols"] = [
    { wch: 22 }, { wch: 18 }, { wch: 13 }, { wch: 7 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 10 },
  ];

  return { ws, periodLabel, year: wk.year };
}

function sumNums(values) {
  const nums = values.filter((v) => v != null && v !== "" && !isNaN(v)).map(Number);
  if (!nums.length) return null;
  return nums.reduce((s, v) => s + v, 0);
}

function formatMisPeriodLabel(periods) {
  if (!periods.length) return "Summary";
  if (periods.length === 1) {
    const m = periods[0];
    return `${MONTH_NAMES[m.month]} ${m.year}`;
  }
  const sorted = [...periods].sort((a, b) => a.key.localeCompare(b.key));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const range = first.key === last.key
    ? `${MONTH_NAMES[first.month]} ${first.year}`
    : `${MONTH_NAMES[first.month]} ${first.year} – ${MONTH_NAMES[last.month]} ${last.year}`;
  return `${range} (${periods.length} months)`;
}

export function buildMisMonthlyEntries(periods, opts) {
  if (!periods.length) return [];
  const sorted = [...periods].sort((a, b) => a.key.localeCompare(b.key));
  const monthly = sorted.map((m) => ({
    periodMeta: { label: `${MONTH_NAMES[m.month]} ${m.year}` },
    pl: computeMonthPlSummary(m, { ...opts, view: "month" }),
  }));

  if (sorted.length <= 1) return monthly;

  const sales = sumNums(monthly.map((e) => e.pl.sales_global)) ?? 0;
  const income = sumNums(monthly.map((e) => e.pl.income_from_sales)) ?? 0;
  const flatFee = sumNums(monthly.map((e) => e.pl.flat_fee_commission));

  return [
    {
      periodMeta: { label: formatMisPeriodLabel(sorted) },
      pl: {
        sales_global: sales,
        income_from_sales: income,
        income_pct_to_sales: sales > 0 ? (income / sales) * 100 : null,
        flat_fee_commission: flatFee || null,
      },
    },
    ...monthly,
  ];
}

function chehomaCommissionNoteText(amountUsd, formatters) {
  return formatChehomaCommissionNote(amountUsd, {
    showInr: formatters?.showInr,
    rates: formatters?.rates,
    alreadyConverted: formatters?.alreadyConverted,
  });
}

/** @param {{ month: number, year: number, label?: string }} periodMeta */
function pushMisBlock(misRows, misStyles, periodMeta, pl, formatters = null, { incomeOnly = false } = {}) {
  const fmtCur = formatters?.fmtCur ?? fmtMisCur;
  const fmtPct = formatters?.fmtPct ?? fmtMisPct;
  const amountLabel = formatters?.amountLabel ?? "Amount ($)";
  const fmtAmt = (v) => (v == null || v === "" || isNaN(v) ? "—" : fmtCur(v));
  if (misRows.length > 0) misRows.push(["", "", ""]);

  const monthTitleRow = misRows.length;
  const title = periodMeta.label || `${MONTH_NAMES[periodMeta.month]} ${periodMeta.year}`;
  misRows.push(["", title, ""]);
  misStyles.push({ row: monthTitleRow, style: MIS_STYLES.monthLabel });

  const base = misRows.length;
  const chehomaNote = chehomaCommissionNoteText(pl.flat_fee_commission, formatters);
  const incomeDetails = chehomaNote
    ? `Income from above Sales\n${chehomaNote}`
    : "Income from above Sales";
  const block = [
    ["Division", "Details", amountLabel],
    ["Global", "Sales Global", fmtAmt(pl.sales_global)],
    ["Global", incomeDetails, fmtAmt(pl.income_from_sales)],
    ["Global", "Income % to Sales", fmtPct(pl.income_pct_to_sales)],
  ];

  if (!incomeOnly) {
    block.push(
      ["", "", ""],
      ["Global", "Salary to Employees", fmtAmt(pl.salary_employees)],
      ["Global", "Travelling Expense (Domestic)", fmtAmt(pl.travel_domestic)],
      ["Global", "Travelling Expense (International)", fmtAmt(pl.travel_international)],
      ["Global", "Rent", fmtAmt(pl.rent)],
      ["Global", "Electricity", fmtAmt(pl.electricity_others)],
      ["Global", "Miscellaneous & Other", fmtAmt(pl.miscellaneous_other)],
      ["", "", ""],
      ["Global", "Total Expenses", fmtAmt(pl.total_expenses)],
      ["Global", "Total % to sales", fmtPct(pl.total_pct_to_sales)],
      ["", "", ""],
      ["", "EBIDTA", fmtAmt(pl.ebidta)],
      ["", "% to sales", fmtPct(pl.ebidta_pct_to_sales)],
    );
  }

  misRows.push(...block);

  const styleRows = [[0, MIS_STYLES.header], [1, MIS_STYLES.income], [2, MIS_STYLES.income], [3, MIS_STYLES.income]];
  if (!incomeOnly) {
    const expStart = 5;
    styleRows.push(
      ...[0, 1, 2, 3, 4, 5].map((i) => [expStart + i, MIS_STYLES.input]),
      [expStart + 7, MIS_STYLES.total],
      [expStart + 8, MIS_STYLES.total],
      [expStart + 10, MIS_STYLES.ebitda],
      [expStart + 11, MIS_STYLES.ebitda],
    );
  }
  styleRows.forEach(([offset, style]) => misStyles.push({ row: base + offset, style }));
}

export function appendMisMonthlySheet(wb, entries, formatters = null, options = {}) {
  const misRows = [];
  const misStyles = [];

  if (options.downloadedOn) {
    misRows.push(["P&L Monthly Expenses", "", ""]);
    misStyles.push({ row: 0, style: MIS_STYLES.monthLabel });
    misRows.push(["", `Downloaded on ${options.downloadedOn}`, ""]);
    misStyles.push({ row: 1, style: MIS_STYLES.metaDate });
    misRows.push(["", "", ""]);
  }

  entries.forEach(({ periodMeta, pl }) => {
    if (!pl) return;
    pushMisBlock(misRows, misStyles, periodMeta, pl, formatters, options);
  });

  if (!misRows.length) return;

  const misWs = XLSX.utils.aoa_to_sheet(misRows);
  misWs["!cols"] = [{ wch: 12 }, { wch: 52 }, { wch: 20 }];
  misStyles.forEach(({ row, style }) => applyMisStyle(misWs, row, style));
  XLSX.utils.book_append_sheet(wb, misWs, "MIS MONTHLY");
}

/**
 * Build styled P&L schedule workbook (one sheet per week/month).
 */
export function buildPlScheduleWorkbook({
  periods,
  view,
  plMode = "jng",
  getCommPct,
  getJngCommPct,
  getJnmCommPct,
  buyerRateMap = {},
  plExpensesMap = {},
  includeMisMonthly = false,
  misEntries = null,
}) {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set();

  periods.forEach((wk) => {
    const sheet = buildPeriodSheet(wk, view, plMode, { getCommPct, getJngCommPct, getJnmCommPct, buyerRateMap });
    if (!sheet) return;
    let sheetName = sheet.periodLabel;
    if (usedNames.has(sheetName)) sheetName = `${sheet.periodLabel}-${sheet.year}`;
    usedNames.add(sheetName);
    XLSX.utils.book_append_sheet(wb, sheet.ws, sheetName.slice(0, 31));
  });

  if (includeMisMonthly && view === "month" && (plMode === "jng" || plMode === "overall")) {
    const entries = misEntries ?? buildMisMonthlyEntries(periods, {
      getCommPct, getJngCommPct, getJnmCommPct, buyerRateMap, plMode,
    });
    appendMisMonthlySheet(wb, entries, null, { incomeOnly: true });
  }

  return wb;
}

export function downloadPlScheduleExcel(options) {
  const wb = buildPlScheduleWorkbook(options);
  if (!wb.SheetNames.length) return false;
  const out = options.filename.endsWith(".xlsx") ? options.filename : `${options.filename}.xlsx`;
  XLSX.writeFile(wb, out);
  return true;
}

/** MIS MONTHLY only workbook (Expences & EBIDTA tab). */
export function downloadMisMonthlyExcel({ entries, filename, showInr = false, rates = FALLBACK_RATES, alreadyConverted = false, downloadedOn = null }) {
  const sym = showInr ? "₹" : "$";
  const formatters = {
    amountLabel: `Amount (${sym})`,
    showInr,
    rates,
    alreadyConverted,
    fmtCur: (v) => {
      if (v == null || v === "" || isNaN(v)) return "—";
      const num = alreadyConverted ? Number(v) : usdToDisplay(v, showInr, rates);
      return `${sym}${Number(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },
    fmtPct: fmtMisPct,
  };
  const wb = XLSX.utils.book_new();
  appendMisMonthlySheet(wb, entries, formatters, { downloadedOn });
  if (!wb.SheetNames.length) return false;
  const out = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, out);
  return true;
}

/** Single-month P&L expense modal export (MIS layout). */
export function downloadPlMonthlyExpenseExcel({ monthLabel, pl, showInr = false, rates = FALLBACK_RATES, filename, alreadyConverted = false }) {
  return downloadMisMonthlyExcel({
    entries: [{ periodMeta: { label: monthLabel }, pl }],
    filename: filename || `PL_Expenses_${monthLabel.replace(/\s+/g, "_")}.xlsx`,
    showInr,
    rates,
    alreadyConverted,
    downloadedOn: formatPlExportDate(),
  });
}

export function parseMonthKey(key) {
  const [y, m] = (key || "").split("-").map(Number);
  if (!y || !m) return null;
  return { year: y, month: m - 1, label: `${MONTH_NAMES[m - 1]} ${y}` };
}
