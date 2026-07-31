import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuthStore } from "../../stores/authStore";
import { supabase } from "../../lib/supabase";
import { fetchLiveRates, FALLBACK_RATES, usdToInr, inrToUsd, formatChehomaCommissionNote } from "../../utils/formatters";
import { useJnmPlAccess, useCanSeeMonthlyExpenseHeader } from "../../hooks/useJnmPlAccess";
import { usePersistedPlFilter } from "../../hooks/usePersistedPlFilter";
import { useMerchantPoBuyersAccess, buildPoSummaryParams } from "../../hooks/useMerchantPoBuyersAccess";
import { downloadPlScheduleExcel, downloadPlMonthlyExpenseExcel, buildMisMonthlyEntries, formatPlExportDate } from "../../utils/plScheduleExport";
import { computeMonthPlSummary, computeOverallPoComm, computeSinglePoComm, sumOverallComm, sumSingleComm, poOrderVal, poShippedVal, poProjShippedVal, sumPeriodShippedValue, sumShippedValueForPeriodKey, sumShippedValueForWeekKey, plExpenseKey, plExpenseStorageKey, plExpenseMonthFromStorageKey, plExpenseModeFromStorageKey } from "../../utils/plDataHelpers";
import PrintButton from "../ui/PrintButton";
import PlModeToggle from "./PlModeToggle";
import CommissionCell from "./PlCommissionCell";
import { OpenPoMobileCard, ShippedPoMobileCard, PeriodStatsMobile, PlTableScrollWrap, MobilePoTotals } from "./PlScheduleMobile";
import { printPage, printElement } from "../../utils/printPage";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API_BASE = import.meta.env.VITE_BACKEND_URL;

// ─── helpers ──────────────────────────────────────────────────────────────────

const fmt = (n, cur) =>
  !n
    ? "—"
    : cur
    ? "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Number(n).toLocaleString("en-US");

const SHORT_M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtD = (d) => `${SHORT_M[d.getMonth()]} ${d.getDate()}`;

function getISOWeekInfo(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const thu = new Date(d);
  thu.setDate(d.getDate() + (4 - (d.getDay() || 7)));
  const yr  = thu.getFullYear();
  const jan1 = new Date(yr, 0, 1);
  const week = Math.ceil(((thu - jan1) / 86400000 + 1) / 7);
  return { week, year: yr, key: `${yr}-W${String(week).padStart(2, "0")}` };
}

function getWeekRange(year, weekNum) {
  const jan4 = new Date(year, 0, 4);
  const dow  = jan4.getDay() || 7;
  const mon  = new Date(jan4);
  mon.setDate(jan4.getDate() - (dow - 1) + (weekNum - 1) * 7);
  const sun  = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: mon, end: sun };
}

function getMonthInfo(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return { year: d.getFullYear(), month: d.getMonth(), key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` };
}
function getMonthRange(year, month) {
  return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0) };
}
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function calcPoStatus(lines) {
  const bal = lines.reduce((s, r) => s + (r.balanceQty || 0), 0);
  const shp = lines.reduce((s, r) => s + (r.shippedQty || 0), 0);
  if (bal <= 0) return { label: "Shipped", cls: "bg-green-50 text-green-700 border-green-200", dot: "#16a34a" };
  if (shp > 0)  return { label: "Partial", cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "#d97706" };
  return           { label: "Pending",  cls: "bg-gray-100 text-black border-gray-300",    dot: "#9ca3af" };
}

// ─── Date range field ─────────────────────────────────────────────────────────
function DateRangeField({ label, value, onChange }) {
  const inputRef = useRef(null);
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-[10px] font-semibold text-black/60 uppercase tracking-wide">{label}</span>
      <div className="relative">
        <input
          ref={inputRef}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-full max-w-[9.5rem] sm:w-[132px] pl-2 pr-7 text-xs border border-gray-300 rounded-lg bg-gray-50 text-black hover:bg-white hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => inputRef.current?.showPicker?.()}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-black/45 hover:text-indigo-600 cursor-pointer"
          title="Pick date"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────
function Dropdown({ placeholder, options, value, onChange, multiSelect = false, selectedLabel = "items" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch(""); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = useMemo(
    () => options.filter((o) => o.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  );

  const pickSingle = (v) => { onChange(v); setOpen(false); setSearch(""); };
  const toggleMulti = (v) => {
    const cur = value || [];
    onChange(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  };

  const selectedCount = multiSelect ? (value?.length || 0) : 0;
  const displayLabel  = multiSelect
    ? (selectedCount === 0 ? null : selectedCount === 1 ? value[0] : `${selectedCount} ${selectedLabel} selected`)
    : value;

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={() => options.length && setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium min-w-[140px] justify-between transition-all
          ${!options.length
            ? "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"
            : open
            ? "border-blue-500 bg-white shadow-[0_0_0_3px_rgba(59,130,246,0.12)]"
            : "border-gray-300 bg-gray-50 hover:bg-white hover:border-gray-400 cursor-pointer"
          }`}
      >
        <span className={displayLabel ? "text-black" : "text-black"}>{displayLabel || placeholder}</span>
        <div className="flex items-center gap-1 shrink-0">
          {multiSelect && selectedCount > 0 && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              title="Clear selection"
              className="w-4 h-4 rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-500 flex items-center justify-center text-black transition-colors"
            >
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </span>
          )}
          <svg className={`w-3 h-3 text-black transition-transform ${open ? "rotate-180" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-[999] bg-white border border-gray-200 rounded-lg shadow-lg min-w-[200px] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
            <svg className="w-3 h-3 text-black shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter…" className="border-none outline-none bg-transparent text-xs w-full text-black" />
          </div>
          <div className="max-h-[220px] overflow-y-auto py-1">
            {multiSelect ? (
              <>
                <div onClick={() => onChange([])}
                  className={`px-3 py-2 text-xs cursor-pointer ${selectedCount === 0 ? "text-blue-600 font-semibold bg-blue-50" : "text-black hover:bg-gray-50"}`}>
                  {placeholder}
                </div>
                <div className="h-px bg-gray-100 my-0.5" />
                {filtered.map((opt) => {
                  const sel = value?.includes(opt);
                  return (
                    <div key={opt} onClick={() => toggleMulti(opt)}
                      className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer ${sel ? "bg-blue-50 text-blue-700 font-semibold" : "text-black hover:bg-gray-50"}`}>
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${sel ? "bg-blue-500 border-blue-500" : "border-gray-300"}`}>
                        {sel && (
                          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </div>
                      {opt}
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                <div onClick={() => pickSingle("")}
                  className={`px-3 py-2 text-xs cursor-pointer ${!value ? "text-blue-600 font-semibold bg-blue-50" : "text-black hover:bg-gray-50"}`}>
                  {placeholder}
                </div>
                <div className="h-px bg-gray-100 my-0.5" />
                {filtered.map((opt) => (
                  <div key={opt} onClick={() => pickSingle(opt)}
                    className={`px-3 py-2 text-xs cursor-pointer ${value === opt ? "bg-blue-50 text-blue-600 font-semibold" : "text-black hover:bg-gray-50"}`}>
                    {opt}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Column definitions ───────────────────────────────────────────────────────
const SHIPPED_COLS = [
  { label: "Customer",     align: "left",  w: "min-w-[160px]" },
  { label: "Vendor",       align: "left",  w: "min-w-[150px]" },
  { label: "PO No.",       align: "left",  w: "min-w-[110px]" },
  { label: "SKUs",         align: "right", w: "min-w-[55px]",  preserveCase: true },
  { label: "Ord Qty",      align: "right", w: "min-w-[80px]"  },
  { label: "Shp Qty",      align: "right", w: "min-w-[80px]"  },
  { label: "Bal Qty",      align: "right", w: "min-w-[80px]"  },
  { label: "Order Val",    align: "right", w: "min-w-[110px]" },
  { label: "Shipped $",    align: "right", w: "min-w-[110px]" },
  { label: "Shp Date",     align: "left",  w: "min-w-[100px]" },
  { label: "Balance $",    align: "right", w: "min-w-[110px]" },
  { label: "Commission %", align: "right", w: "min-w-[110px]" },
  { label: "Commission $", align: "right", w: "min-w-[110px]" },
  { label: "Status",       align: "left",  w: "min-w-[90px]"  },
];

const OPEN_COLS = [
  { label: "Customer",      align: "left",  w: "min-w-[160px]" },
  { label: "Vendor",        align: "left",  w: "min-w-[150px]" },
  { label: "PO No.",        align: "left",  w: "min-w-[110px]" },
  { label: "SKUs",         align: "right", w: "min-w-[55px]",  preserveCase: true },
  { label: "Ord Qty",       align: "right", w: "min-w-[80px]"  },
  { label: "Shp Qty",       align: "right", w: "min-w-[80px]"  },
  { label: "Bal Qty",       align: "right", w: "min-w-[80px]"  },
  { label: "Order Val",     align: "right", w: "min-w-[110px]" },
  { label: "Shipped $",     align: "right", w: "min-w-[110px]" },
  { label: "Shp Date",      align: "left",  w: "min-w-[100px]" },
  { label: "Balance $",     align: "right", w: "min-w-[110px]" },
  { label: "Commission %",  align: "right", w: "min-w-[110px]" },
  { label: "Commission $",  align: "right", w: "min-w-[110px]" },
  { label: "Target Shipped Date", align: "left",  w: "min-w-[150px]" },
  { label: "Status",        align: "left",  w: "min-w-[90px]"  },
];

const OVERALL_COMM_COLS = [
  { label: "Comm JNM %",   align: "right", w: "min-w-[100px]" },
  { label: "Comm TWIF %",  align: "right", w: "min-w-[100px]" },
  { label: "Comm JNM $",   align: "right", w: "min-w-[110px]" },
  { label: "Comm TWIF $",  align: "right", w: "min-w-[110px]" },
  { label: "Overall Comm", align: "right", w: "min-w-[120px]" },
];

const OVERALL_OPEN_COLS = [
  ...OPEN_COLS.slice(0, 11),
  ...OVERALL_COMM_COLS,
  ...OPEN_COLS.slice(13),
];

const OVERALL_SHIPPED_COLS = [
  ...SHIPPED_COLS.slice(0, 11),
  ...OVERALL_COMM_COLS,
  SHIPPED_COLS[13],
];

const PL_TABLE_SCROLL = "pl-week-table-scroll overflow-auto max-h-[62vh] relative";
const plTableThClass = (c) =>
  `sticky top-0 z-[3] px-3 py-2 text-[10px] font-bold text-black bg-gray-50 shadow-[0_1px_0_#e5e7eb] ${c.preserveCase ? "normal-case" : "uppercase"} tracking-wider whitespace-nowrap border-r border-b border-gray-200 last:border-r-0 text-${c.align} ${c.w}`;

const fmtCommUsd = (n) =>
  n != null && !isNaN(n)
    ? `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;

function formatPoShpDateLabel(lines, inPeriod = () => true) {
  const shpDates = [...new Set(lines.filter(inPeriod).map((r) => r.shippedDate).filter(Boolean))].sort();
  if (shpDates.length === 0) return "—";
  const fmt = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return shpDates.length === 1 ? fmt(shpDates[0]) : `${fmt(shpDates[0])}–${fmt(shpDates[shpDates.length - 1])}`;
}

// ─── Overall P&L commission cells (JNM from commission_rates, JNG from buyer_consultancy_fee) ─
function OverallCommissionCells({ po, baseValue, getJnmCommPct, getJngCommPct, commissionMap, onSave, readOnly }) {
  const { jnmPct, jngPct, jnmAmt, jngAmt, overall } = computeOverallPoComm(po, baseValue, getJnmCommPct, getJngCommPct);

  return (
    <>
      <td className="px-3 py-2 border-r border-gray-100 min-w-[100px]">
        <CommissionCell
          poNo={po.poNo}
          initialValue={commissionMap[po.poNo] ?? (jnmPct ?? "")}
          onSave={onSave}
          readOnly={readOnly}
        />
      </td>
      <td className="px-3 py-2 border-r border-gray-100 text-right text-xs font-mono min-w-[100px]">
        {jngPct != null
          ? <span className="font-semibold text-black">{jngPct}%</span>
          : <span className="text-black">—</span>}
      </td>
      <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs min-w-[110px]">
        {jnmAmt != null
          ? <span className="font-semibold text-indigo-600">{fmtCommUsd(jnmAmt)}</span>
          : <span className="text-black">—</span>}
      </td>
      <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs min-w-[110px]">
        {jngAmt != null
          ? <span className="font-semibold text-violet-600">{fmtCommUsd(jngAmt)}</span>
          : <span className="text-black">—</span>}
      </td>
      <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs font-semibold min-w-[120px]">
        {(jnmAmt != null || jngAmt != null)
          ? <span className="text-indigo-700">{fmtCommUsd(overall)}</span>
          : <span className="text-black">—</span>}
      </td>
    </>
  );
}

// ─── helper: group rows into a pos map ────────────────────────────────────────
function groupIntoPos(rows, dateField) {
  const map = {};
  rows.forEach((r) => {
    const info = r[dateField] ? getISOWeekInfo(r[dateField]) : null;
    if (!info) return;
    const wk = info.key;
    if (!map[wk]) map[wk] = { ...info, ...getWeekRange(info.year, info.week), shippedPos: {}, openPos: {} };
    const pk = `${(r.vendor || "").trim()}||${(r.poNo || "").trim()}`;
    return { info, wk, pk };
  });
  return map;
}

// ─── P&L Monthly Modal ────────────────────────────────────────────────────────
function PlMonthlyModal({ monthKey, fyYear, monthLabel, salesGlobal, incomeFromSales, flatFeeCommission = 0, showChehomaDetail = false, initialExpenses, onSave, onClose }) {
  const printRef = useRef(null);
  const [fields, setFields] = useState({
    salary_employees:     initialExpenses?.salary_employees     ?? "",
    travel_domestic:      initialExpenses?.travel_domestic      ?? "",
    travel_international: initialExpenses?.travel_international ?? "",
    rent:                 initialExpenses?.rent                 ?? "",
    electricity_others:   initialExpenses?.electricity_others   ?? "",
    miscellaneous_other: initialExpenses?.miscellaneous_other ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [saveErr, setSaveErr] = useState(null);
  const [showInr, setShowInr] = useState(false);
  const [rates, setRates] = useState(FALLBACK_RATES);

  useEffect(() => {
    fetchLiveRates().then(setRates);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const fv = (k) => {
    const raw = parseFloat(fields[k]) || 0;
    return showInr ? inrToUsd(raw, rates) : raw;
  };
  const totalExpenses   = fv("salary_employees") + fv("travel_domestic") + fv("travel_international") + fv("rent") + fv("electricity_others") + fv("miscellaneous_other");
  const incomePct       = salesGlobal      > 0 ? (incomeFromSales / salesGlobal * 100)      : 0;
  const totalPctToSales = incomeFromSales  > 0 ? (totalExpenses / incomeFromSales * 100)    : 0;
  const ebidta          = incomeFromSales - totalExpenses;
  const ebidtaPct       = incomeFromSales  > 0 ? (ebidta / incomeFromSales * 100)           : 0;

  const sym = showInr ? "₹" : "$";
  const fmtAmt = (n) => {
    if (n == null || n === "" || isNaN(n)) return "—";
    const v = showInr ? usdToInr(Number(n), rates) : Number(n);
    return `${sym}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fmtPdfAmt = (n) => {
    if (n == null || n === "" || isNaN(n)) return "—";
    const v = showInr ? usdToInr(Number(n), rates) : Number(n);
    const num = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return showInr ? `Rs. ${num}` : `$${num}`;
  };

  const handleSave = async () => {
    setSaving(true); setSaveErr(null);
    try {
      await onSave({
        month_key:            monthKey,
        fy_year:              fyYear,
        sales_global:         salesGlobal       || null,
        income_from_sales:    incomeFromSales   || null,
        income_pct_to_sales:  salesGlobal > 0   ? parseFloat(incomePct.toFixed(4))      : null,
        flat_fee_commission:  flatFeeCommission > 0 ? flatFeeCommission : null,
        salary_employees:     fv("salary_employees")     || null,
        travel_domestic:      fv("travel_domestic")      || null,
        travel_international: fv("travel_international") || null,
        rent:                 fv("rent")                 || null,
        electricity_others:   fv("electricity_others")   || null,
        miscellaneous_other:  fv("miscellaneous_other")  || null,
        total_expenses:       totalExpenses     || null,
        total_pct_to_sales:   incomeFromSales > 0 ? parseFloat(totalPctToSales.toFixed(4)) : null,
        ebidta:               ebidta            || null,
        ebidta_pct_to_sales:  incomeFromSales > 0 ? parseFloat(ebidtaPct.toFixed(4))      : null,
        updated_at:           new Date().toISOString(),
      });
      setSaved(true);
      setTimeout(() => onClose(), 800);
    } catch (e) {
      setSaveErr(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const inp = (field) => (
    <div className="inline-flex items-center gap-0.5 justify-end">
      <span className="text-xs font-mono text-black/50">{sym}</span>
      <input
        type="number" min="0" step="0.01"
        value={fields[field] ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          setFields((p) => ({ ...p, [field]: raw === "" ? "" : parseFloat(raw) || 0 }));
        }}
        placeholder="0.00"
        className="w-28 px-2 py-0.5 border border-gray-300 rounded text-xs font-mono text-right focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
    </div>
  );

  const hasExpenses = totalExpenses > 0;
  const chehomaNote = showChehomaDetail ? formatChehomaCommissionNote(flatFeeCommission, { showInr, rates }) : null;

  const handleExportPdf = () => {
    const doc = new jsPDF();
    const downloadedOn = formatPlExportDate();

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("P&L Monthly Expenses", 14, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(monthLabel, 14, 25);
    doc.text(`Downloaded on ${downloadedOn}`, 14, 31);
    doc.setTextColor(0);

    // Compute display-currency values directly (no double-conversion)
    const fvRaw = (k) => parseFloat(fields[k]) || 0;
    const salesD   = showInr ? usdToInr(salesGlobal || 0, rates)       : salesGlobal;
    const incomeD  = showInr ? usdToInr(incomeFromSales || 0, rates)   : incomeFromSales;
    const totalD   = fvRaw("salary_employees") + fvRaw("travel_domestic") + fvRaw("travel_international") + fvRaw("rent") + fvRaw("electricity_others") + fvRaw("miscellaneous_other");
    const totalPctD = incomeD > 0 ? (totalD / incomeD * 100) : 0;
    const ebidtaD   = incomeD - totalD;
    const ebidtaPctD = incomeD > 0 ? (ebidtaD / incomeD * 100) : 0;
    const hasExpD   = totalD > 0;
    const fmtD = (n) => {
      if (!n && n !== 0) return "—";
      const num = Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return showInr ? `Rs. ${num}` : `$${num}`;
    };
    const tableBody = [
      ["Global", "Sales Global",            fmtD(salesD)],
      ["Global", chehomaNote ? `Income from above Sales\n${chehomaNote}` : "Income from above Sales", fmtD(incomeD)],
      ["Global", "Income % to Sales",        salesD > 0 ? `${incomePct.toFixed(2)}%` : "—"],
      ["", "", ""],
      ["Global", "Salary to Employees",                fvRaw("salary_employees")     ? fmtD(fvRaw("salary_employees"))     : "—"],
      ["Global", "Travelling Expense (Domestic)",      fvRaw("travel_domestic")      ? fmtD(fvRaw("travel_domestic"))      : "—"],
      ["Global", "Travelling Expense (International)", fvRaw("travel_international") ? fmtD(fvRaw("travel_international")) : "—"],
      ["Global", "Rent",                               fvRaw("rent")                 ? fmtD(fvRaw("rent"))                 : "—"],
      ["Global", "Electricity",                        fvRaw("electricity_others")   ? fmtD(fvRaw("electricity_others"))   : "—"],
      ["Global", "Miscellaneous & Other",              fvRaw("miscellaneous_other")  ? fmtD(fvRaw("miscellaneous_other"))  : "—"],
      ["", "", ""],
      ["Global", "Total Expenses",   hasExpD ? fmtD(totalD) : "—"],
      ["Global", "Total % to sales", hasExpD && incomeD > 0 ? `${totalPctD.toFixed(2)}%` : "—"],
      ["", "", ""],
      ["", "EBIDTA",     hasExpD ? fmtD(ebidtaD) : "—"],
      ["", "% to sales", hasExpD && incomeD > 0 ? `${ebidtaPctD.toFixed(2)}%` : "—"],
    ];

    autoTable(doc, {
      startY: 36,
      head: [["Division", "Details", showInr ? "Amount (Rs.)" : "Amount ($)"]],
      body: tableBody,
      theme: "grid",
      headStyles: { fillColor: [191, 219, 254], textColor: [30, 58, 95], fontStyle: "bold", fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 102 },
        2: { cellWidth: 64, halign: "right" },
      },
      bodyStyles: { fontSize: 9, font: "helvetica" },
      didParseCell: (data) => {
        if (data.column.index === 2) data.cell.styles.halign = "right";
        if (data.section !== "body") return;
        const ri = data.row.index;
        if (ri <= 2)                    { data.cell.styles.fillColor = [239, 246, 255]; data.cell.styles.textColor = [29, 78, 216]; }
        else if (ri === 3 || ri === 10 || ri === 13) { data.cell.styles.fillColor = [249, 250, 251]; }
        else if (ri >= 4 && ri <= 9)    { data.cell.styles.fillColor = [255, 255, 255]; }
        else if (ri === 11 || ri === 12){ data.cell.styles.fillColor = [243, 244, 246]; data.cell.styles.fontStyle = "bold"; }
        else if (ri >= 14)              { data.cell.styles.fillColor = [238, 242, 255]; data.cell.styles.textColor = [55, 48, 163]; data.cell.styles.fontStyle = "bold"; }
      },
    });

    doc.save(`PL_Expenses_${monthLabel.replace(/\s+/g, "_")}.pdf`);
  };

  const handleExportExcel = () => {
    // Pre-convert all values to display currency so the export layer doesn't double-convert
    const fvRaw = (k) => parseFloat(fields[k]) || 0;
    const salesD  = showInr ? usdToInr(salesGlobal || 0, rates)     : salesGlobal;
    const incomeD = showInr ? usdToInr(incomeFromSales || 0, rates) : incomeFromSales;
    const ffD     = showInr && flatFeeCommission > 0 ? usdToInr(flatFeeCommission, rates) : (flatFeeCommission > 0 ? flatFeeCommission : null);
    const totalD  = fvRaw("salary_employees") + fvRaw("travel_domestic") + fvRaw("travel_international") + fvRaw("rent") + fvRaw("electricity_others") + fvRaw("miscellaneous_other");
    const totalPctD  = incomeD > 0 ? (totalD / incomeD * 100) : null;
    const ebidtaD    = incomeD - totalD;
    const ebidtaPctD = incomeD > 0 ? (ebidtaD / incomeD * 100) : null;
    const hasExpD    = totalD > 0;
    downloadPlMonthlyExpenseExcel({
      monthLabel,
      showInr,          // correct symbol and header (₹ or $)
      alreadyConverted: true,  // values pre-converted, skip conversion in export
      rates,
      pl: {
        sales_global: salesD || null,
        income_from_sales: incomeD || null,
        flat_fee_commission: ffD,
        income_pct_to_sales: salesD > 0 ? incomePct : null,
        salary_employees: fvRaw("salary_employees") || null,
        travel_domestic: fvRaw("travel_domestic") || null,
        travel_international: fvRaw("travel_international") || null,
        rent: fvRaw("rent") || null,
        electricity_others: fvRaw("electricity_others") || null,
        miscellaneous_other: fvRaw("miscellaneous_other") || null,
        total_expenses: totalD || null,
        total_pct_to_sales: totalPctD != null ? parseFloat(totalPctD.toFixed(4)) : null,
        ebidta: hasExpD ? ebidtaD : null,
        ebidta_pct_to_sales: hasExpD && incomeD > 0 ? parseFloat(ebidtaPctD.toFixed(4)) : null,
      },
      filename: `PL_Expenses_${monthLabel.replace(/\s+/g, "_")}.xlsx`,
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:w-[600px] flex flex-col overflow-hidden"
        style={{ maxHeight: "min(95svh, 680px)" }}
        onClick={(e) => e.stopPropagation()}>

        {/* Modal header */}
        <div className="flex items-start justify-between px-5 py-3 border-b border-gray-200 bg-blue-50 shrink-0 gap-3">
          <div>
            <div className="text-sm font-bold text-black">P&L Monthly Expenses</div>
            <div className="text-xs text-black/60 mt-0.5">{monthLabel}</div>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <span className="text-[9px] text-black/50 italic leading-tight text-right pt-1.5 max-w-[5.5rem]">
              *Real Time Currency Conversion
            </span>
            <button type="button" onClick={() => {
              const next = !showInr;
              setFields((f) => {
                const out = {};
                for (const k of Object.keys(f)) {
                  if (f[k] === "" || f[k] == null) { out[k] = f[k]; continue; }
                  const n = parseFloat(f[k]) || 0;
                  out[k] = next ? usdToInr(n, rates) : inrToUsd(n, rates);
                }
                return out;
              });
              setShowInr(next);
            }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer shrink-0
                ${showInr ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-black border-gray-300 hover:bg-gray-50"}`}>
              {showInr ? "INR → USD" : "USD → INR"}
            </button>
            <button onClick={onClose}
              className="w-7 h-7 rounded-full hover:bg-gray-200 flex items-center justify-center transition-colors cursor-pointer shrink-0">
              <svg className="w-4 h-4 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Table */}
        <div ref={printRef} className="overflow-y-auto flex-1">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-blue-100 border-b border-blue-200">
                <th className="px-4 py-2 text-[10px] font-bold text-black uppercase tracking-wider text-left w-20">Division</th>
                <th className="px-4 py-2 text-[10px] font-bold text-black uppercase tracking-wider text-left">Details</th>
                <th className="px-4 py-2 text-[10px] font-bold text-black uppercase tracking-wider text-right w-40">Amount ({showInr ? "₹" : "$"})</th>
              </tr>
            </thead>
            <tbody>
              {/* ── Income (pre-filled) ── */}
              <tr className="border-b border-blue-100 bg-blue-50">
                <td className="px-4 py-1.5 text-xs text-black/50 w-20">Global</td>
                <td className="px-4 py-1.5 text-black">Sales Global</td>
                <td className="px-4 py-1.5 text-right font-mono text-xs font-semibold text-blue-700">{fmtAmt(salesGlobal)}</td>
              </tr>
              <tr className="border-b border-blue-100 bg-blue-50">
                <td className="px-4 py-1.5 text-xs text-black/50 w-20">Global</td>
                <td className="px-4 py-1.5 text-black">
                  <div>Income from above Sales</div>
                  {chehomaNote && (
                    <div className="mt-0.5 text-[11px] text-violet-700 italic">{chehomaNote}</div>
                  )}
                </td>
                <td className="px-4 py-1.5 text-right font-mono text-xs font-semibold text-green-700">{fmtAmt(incomeFromSales)}</td>
              </tr>
              <tr className="border-b border-blue-200 bg-blue-50">
                <td className="px-4 py-1.5 text-xs text-black/50 w-20">Global</td>
                <td className="px-4 py-1.5 text-black">Income % to Sales</td>
                <td className="px-4 py-1.5 text-right font-mono text-xs font-semibold text-indigo-700">
                  {salesGlobal > 0 ? `${incomePct.toFixed(2)}%` : "—"}
                </td>
              </tr>

              {/* ── Expenses (user-entered) ── */}
              <tr className="border-b border-gray-100">
                <td className="px-4 py-1.5 text-xs text-black/50 w-20">Global</td>
                <td className="px-4 py-1.5 text-black">Salary to Employees</td>
                <td className="px-4 py-1.5 text-right">{inp("salary_employees")}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-1.5 text-xs text-black/50 w-20">Global</td>
                <td className="px-4 py-1.5 text-black">Travelling Expense (Domestic)</td>
                <td className="px-4 py-1.5 text-right">{inp("travel_domestic")}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-1.5 text-xs text-black/50 w-20">Global</td>
                <td className="px-4 py-1.5 text-black">Travelling Expense (International)</td>
                <td className="px-4 py-1.5 text-right">{inp("travel_international")}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-1.5 text-xs text-black/50 w-20">Global</td>
                <td className="px-4 py-1.5 text-black">Rent</td>
                <td className="px-4 py-1.5 text-right">{inp("rent")}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-1.5 text-xs text-black/50 w-20">Global</td>
                <td className="px-4 py-1.5 text-black">Electricity</td>
                <td className="px-4 py-1.5 text-right">{inp("electricity_others")}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-4 py-1.5 text-xs text-black/50 w-20">Global</td>
                <td className="px-4 py-1.5 text-black">Miscellaneous &amp; Other</td>
                <td className="px-4 py-1.5 text-right">{inp("miscellaneous_other")}</td>
              </tr>

              {/* ── Totals ── */}
              <tr className="border-b border-gray-200 bg-gray-100">
                <td className="px-4 py-1.5 text-xs text-black/50 w-20">Global</td>
                <td className="px-4 py-1.5 font-bold text-black">Total Expenses</td>
                <td className="px-4 py-1.5 text-right font-mono text-xs font-bold text-red-600">
                  {hasExpenses ? fmtAmt(totalExpenses) : <span className="text-black/30">—</span>}
                </td>
              </tr>
              <tr className="border-b border-gray-200 bg-gray-100">
                <td className="px-4 py-1.5 text-xs text-black/50 w-20">Global</td>
                <td className="px-4 py-1.5 font-bold text-black">Total % to sales</td>
                <td className="px-4 py-1.5 text-right font-mono text-xs font-bold text-red-600">
                  {hasExpenses && incomeFromSales > 0 ? `${totalPctToSales.toFixed(2)}%` : <span className="text-black/30">—</span>}
                </td>
              </tr>

              {/* ── EBIDTA ── */}
              <tr className="border-b border-indigo-100 bg-indigo-50">
                <td className="px-4 py-2 text-xs text-black/50 w-20" />
                <td className="px-4 py-2 font-bold text-indigo-800 text-[13px]">EBIDTA</td>
                <td className={`px-4 py-2 text-right font-mono text-xs font-bold ${hasExpenses ? (ebidta >= 0 ? "text-green-700" : "text-red-600") : "text-black/30"}`}>
                  {hasExpenses ? fmtAmt(ebidta) : "—"}
                </td>
              </tr>
              <tr className="bg-indigo-50">
                <td className="px-4 py-2 text-xs text-black/50 w-20" />
                <td className="px-4 py-2 font-bold text-indigo-800 text-[13px]">% to sales</td>
                <td className={`px-4 py-2 text-right font-mono text-xs font-bold ${hasExpenses ? (ebidtaPct >= 0 ? "text-green-700" : "text-red-600") : "text-black/30"}`}>
                  {hasExpenses && incomeFromSales > 0 ? `${ebidtaPct.toFixed(2)}%` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-5 py-3 border-t border-gray-200 bg-gray-50 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-300 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors cursor-pointer">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
              </svg>
              Export PDF
            </button>
            <button onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-green-500 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors cursor-pointer">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export Excel
            </button>
            <PrintButton onClick={() => printElement(printRef.current, {
              title: "P&L Monthly Expenses",
              subtitle: `${monthLabel} · Printed on ${formatPlExportDate()}`,
            })} />
            <span className="text-xs text-red-500">{saveErr || ""}</span>
          </div>
          <div className="flex items-center gap-2 sm:justify-end">
            <button onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 text-xs border border-gray-300 rounded-lg bg-white text-black hover:bg-gray-50 transition-colors cursor-pointer">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 sm:flex-none px-4 py-2 text-xs bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50">
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function WeeklyPoSchedule({ availableYears = ["26", "27"], defaultYear = "27" }) {
  const [year,           setYear]           = usePersistedPlFilter("weekly-po", "year", defaultYear);
  const [buyer,          setBuyer]          = usePersistedPlFilter("weekly-po", "buyer", "");
  const [vendor,         setVendor]         = usePersistedPlFilter("weekly-po", "vendor", "");
  const [weekFilter,     setWeekFilter]     = usePersistedPlFilter("weekly-po", "weekFilter", []);
  const [monthFilter,    setMonthFilter]    = usePersistedPlFilter("weekly-po", "monthFilter", []);
  const [dateFrom,       setDateFrom]       = usePersistedPlFilter("weekly-po", "dateFrom", "");
  const [dateTo,         setDateTo]         = usePersistedPlFilter("weekly-po", "dateTo", "");
  const [sortBy,         setSortBy]         = usePersistedPlFilter("weekly-po", "sortBy", "default");
  const [rows,           setRows]           = useState([]);
  const [openRows,       setOpenRows]       = useState([]);
  const [commissionMap,   setCommissionMap]   = useState({});
  const [rateMap,         setRateMap]         = useState({});
  const [buyerRateMap,    setBuyerRateMap]    = useState({});
  const hasJnmPlAccess = useJnmPlAccess();
  const canSeeMonthlyExpenses = useCanSeeMonthlyExpenseHeader();
  const [plMode,          setPlMode]          = usePersistedPlFilter("weekly-po", "plMode", "jng");
  const [loading,        setLoading]        = useState(true);
  const [openLoading,    setOpenLoading]    = useState(true);
  const [error,          setError]          = useState(null);
  const [openError,      setOpenError]      = useState(null);
  const [expandedWeeks,  setExpandedWeeks]  = useState(new Set());
  const [view,            setView]            = usePersistedPlFilter("weekly-po", "view", "week");
  const [expandedMonths, setExpandedMonths] = useState(new Set());
  const [plModalData,   setPlModalData]   = useState(null); // { monthKey, monthLabel, salesGlobal, incomeFromSales }
  const [plExpensesMap, setPlExpensesMap] = useState({});   // month::mode → saved row
  const didScrollInit = useRef(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const buyersAccess = useMerchantPoBuyersAccess();

  useEffect(() => {
    if (!hasJnmPlAccess && (plMode === "jnm" || plMode === "overall")) setPlMode("jng");
  }, [hasJnmPlAccess, plMode]);

  // ── fetch shipped PO rows ──────────────────────────────────────────────────
  useEffect(() => {
    if (!buyersAccess.ready) return;
    let cancelled = false;
    setLoading(true); setError(null); setRows([]);

    if (!buyersAccess.isUnrestricted && buyersAccess.buyersParam === "") {
      setLoading(false);
      return () => { cancelled = true; };
    }

    const load = async () => {
      const session = useAuthStore.getState().session;
      const p = buildPoSummaryParams(year, buyersAccess);
      const res = await fetch(`${API_BASE}/dashboard/shipped-po-summary?${p}`, {
        credentials: "include",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || "API error");
      if (!cancelled) setRows(j.data?.rows ?? []);
    };
    load().catch((e) => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, buyersAccess.ready, buyersAccess.isUnrestricted, buyersAccess.buyersParam]);

  // ── fetch open PO rows ────────────────────────────────────────────────────
  useEffect(() => {
    if (!buyersAccess.ready) return;
    let cancelled = false;
    setOpenLoading(true); setOpenError(null); setOpenRows([]);

    if (!buyersAccess.isUnrestricted && buyersAccess.buyersParam === "") {
      setOpenLoading(false);
      return () => { cancelled = true; };
    }

    const load = async () => {
      const session = useAuthStore.getState().session;
      const p = buildPoSummaryParams(year, buyersAccess);
      const res = await fetch(`${API_BASE}/dashboard/open-po-summary?${p}`, {
        credentials: "include",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || "API error");
      if (!cancelled) setOpenRows(j.data?.rows ?? []);
    };
    load().catch((e) => { if (!cancelled) setOpenError(e.message); }).finally(() => { if (!cancelled) setOpenLoading(false); });
    return () => { cancelled = true; };
  }, [year, buyersAccess.ready, buyersAccess.isUnrestricted, buyersAccess.buyersParam]);

  // ── commission % ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!rows.length && !openRows.length) return;
    const poNumbers = [...new Set([...rows, ...openRows].map((r) => r.poNo).filter(Boolean))];
    supabase
      .from("purchase_orders")
      .select("po_number, commission_percentage")
      .in("po_number", poNumbers)
      .is("deleted_at", null)
      .is("delete_meta", null)
      .then(({ data }) => {
        if (!data) return;
        const map = {};
        data.forEach((r) => { map[r.po_number] = r.commission_percentage; });
        setCommissionMap(map);
      });
  }, [rows, openRows]);

  const handleSaveCommission = useCallback(async (poNo, value) => {
    const pct = value === "" || value === null ? null : parseFloat(value);
    const { error: err } = await supabase
      .from("purchase_orders")
      .update({ commission_percentage: pct })
      .eq("po_number", poNo)
      .is("deleted_at", null)
      .is("delete_meta", null);
    if (err) throw new Error(err.message);
    setCommissionMap((prev) => ({ ...prev, [poNo]: pct }));
  }, []);

  // ── fetch commission rates ────────────────────────────────────────────────
  const normStr = (s) =>
    (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

  const canSeeChehomaBreakdown = useMemo(
    () => buyersAccess.isUnrestricted
      || buyersAccess.allowedBuyers.some((b) => normStr(b) === normStr("AS CHEHOMA")),
    [buyersAccess.isUnrestricted, buyersAccess.allowedBuyers],
  );

  useEffect(() => {
    supabase
      .from("commission_rates")
      .select("vendor_name, buyer_name, commission_pct")
      .then(({ data }) => {
        if (!data) return;
        const map = {};
        data.forEach((r) => {
          if (r.commission_pct == null) return;
          map[`${normStr(r.vendor_name)}||${normStr(r.buyer_name)}`] = r.commission_pct;
        });
        setRateMap(map);
      });
  }, []);

  useEffect(() => {
    supabase
      .from("buyer_consultancy_fee")
      .select("buyer_name, commission_pct, remarks")
      .then(({ data }) => {
        if (!data) return;
        const map = {};
        data.forEach((r) => {
          if (r.commission_pct == null) return;
          map[normStr(r.buyer_name)] = { pct: r.commission_pct, remarks: (r.remarks || "").toUpperCase() };
        });
        setBuyerRateMap(map);
      });
  }, []);

  // ── load monthly P&L expenses (saved P&L cards — needed for modal + MIS export) ─
  useEffect(() => {
    if (!hasJnmPlAccess) {
      setPlExpensesMap({});
      return;
    }
    supabase
      .from("monthly_pl_expenses")
      .select("month_key, sales_global, income_from_sales, income_pct_to_sales, salary_employees, travel_domestic, travel_international, rent, electricity_others, miscellaneous_other, total_expenses, total_pct_to_sales, ebidta, ebidta_pct_to_sales")
      .eq("fy_year", year)
      .then(({ data }) => {
        if (!data) return;
        const map = {};
        data.forEach((r) => {
          const mode = plExpenseModeFromStorageKey(r.month_key);
          const monthKey = plExpenseMonthFromStorageKey(r.month_key);
          map[plExpenseKey(monthKey, mode)] = { ...r, month_key: monthKey };
        });
        setPlExpensesMap(map);
      });
  }, [year, hasJnmPlAccess]);

  const EXPENSE_FIELD_KEYS = ["salary_employees", "travel_domestic", "travel_international", "rent", "electricity_others", "miscellaneous_other"];

  // current mode's own saved row, falling back to another mode's expense inputs (not income/EBIDTA) if this mode has never been saved
  const getInitialExpensesForModal = useCallback((monthKey, mode) => {
    const own = plExpensesMap[plExpenseKey(monthKey, mode)];
    if (own) return own;
    const fallbackMode = ["jng", "jnm", "overall"].find((m) => m !== mode && plExpensesMap[plExpenseKey(monthKey, m)]);
    if (!fallbackMode) return undefined;
    const fallback = plExpensesMap[plExpenseKey(monthKey, fallbackMode)];
    const expenseOnly = {};
    EXPENSE_FIELD_KEYS.forEach((k) => { expenseOnly[k] = fallback[k]; });
    return expenseOnly;
  }, [plExpensesMap]);

  const handlePlSave = useCallback(async (data) => {
    const { flat_fee_commission, ...dbRow } = data;
    const row = { ...dbRow, month_key: plExpenseStorageKey(data.month_key, plMode) };
    const { error } = await supabase
      .from("monthly_pl_expenses")
      .upsert(row, { onConflict: "month_key,fy_year" });
    if (error) throw new Error(error.message);

    const savedExpenseFields = {};
    EXPENSE_FIELD_KEYS.forEach((k) => { savedExpenseFields[k] = data[k]; });

    setPlExpensesMap((prev) => {
      const next = { ...prev };
      next[plExpenseKey(data.month_key, plMode)] = {
        sales_global:         data.sales_global,
        income_from_sales:    data.income_from_sales,
        income_pct_to_sales:  data.income_pct_to_sales,
        flat_fee_commission:  flat_fee_commission ?? null,
        salary_employees:     data.salary_employees,
        travel_domestic:      data.travel_domestic,
        travel_international: data.travel_international,
        rent:                 data.rent,
        electricity_others:   data.electricity_others,
        miscellaneous_other:  data.miscellaneous_other,
        total_expenses:       data.total_expenses,
        total_pct_to_sales:   data.total_pct_to_sales,
        ebidta:               data.ebidta,
        ebidta_pct_to_sales:  data.ebidta_pct_to_sales,
      };

      // keep the expense inputs (not income/EBIDTA, which are mode-specific) in sync across the other two P&L tabs
      const otherModes = ["jng", "jnm", "overall"].filter((m) => m !== plMode);
      otherModes.forEach((mode) => {
        const existing = next[plExpenseKey(data.month_key, mode)];
        if (!existing) return;
        const merged = { ...existing, ...savedExpenseFields };
        const income = merged.income_from_sales;
        const totalExpenses = EXPENSE_FIELD_KEYS.reduce((s, k) => s + (Number(merged[k]) || 0), 0);
        merged.total_expenses = totalExpenses || null;
        merged.total_pct_to_sales = income > 0 ? parseFloat((totalExpenses / income * 100).toFixed(4)) : null;
        merged.ebidta = income != null ? income - totalExpenses : null;
        merged.ebidta_pct_to_sales = income > 0 ? parseFloat(((income - totalExpenses) / income * 100).toFixed(4)) : null;
        next[plExpenseKey(data.month_key, mode)] = merged;

        supabase
          .from("monthly_pl_expenses")
          .upsert({ ...merged, month_key: plExpenseStorageKey(data.month_key, mode), fy_year: data.fy_year }, { onConflict: "month_key,fy_year" })
          .then(({ error: syncErr }) => { if (syncErr) console.error("P&L expense sync failed:", syncErr.message); });
      });

      return next;
    });
  }, [plMode]);

  // ── effective commission % — switches by P&L mode ─────────────────────────
  // JNG: buyer_consultancy_fee (+ PO manual override in JNG mode only)
  // JNM: commission_rates vendor+buyer (+ PO manual override)
  const getJngCommPct = useCallback((poNo, vendor, customer) => {
    const entry = buyerRateMap[normStr(customer)];
    if (!entry || entry.pct === 0 || entry.remarks === "MONTHLY") return null;
    return parseFloat(entry.pct);
  }, [buyerRateMap]);

  const getJnmCommPct = useCallback((poNo, vendor, customer) => {
    if (plMode === "jnm" || plMode === "overall") {
      const manual = commissionMap[poNo];
      if (manual != null && manual !== "") return parseFloat(manual);
    }
    const auto = rateMap[`${normStr(vendor)}||${normStr(customer)}`];
    return auto != null ? parseFloat(auto) : null;
  }, [commissionMap, rateMap, plMode]);

  const getCommPct = useCallback((poNo, vendor, customer) => {
    if (plMode === "jng") return getJngCommPct(poNo, vendor, customer);
    return getJnmCommPct(poNo, vendor, customer);
  }, [plMode, getJngCommPct, getJnmCommPct]);

  // ── filter lists (union of both datasets) ────────────────────────────────
  const buyerList  = useMemo(() => [...new Set([...rows, ...openRows].map((r) => r.customer).filter(Boolean))].sort(), [rows, openRows]);
  const vendorList = useMemo(() => [...new Set([...rows, ...openRows].map((r) => r.vendor).filter(Boolean))].sort(), [rows, openRows]);

  // ── filtered rows ─────────────────────────────────────────────────────────
  const filterFn = useCallback((r) => {
    if (buyer  && (r.customer || "").trim() !== buyer)  return false;
    if (vendor && (r.vendor   || "").trim() !== vendor) return false;
    return true;
  }, [buyer, vendor]);

  const inDateRange = useCallback((dateStr) => {
    if (!dateFrom && !dateTo) return true;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return false;
    if (dateFrom && d < new Date(`${dateFrom}T00:00:00`)) return false;
    if (dateTo && d > new Date(`${dateTo}T23:59:59.999`)) return false;
    return true;
  }, [dateFrom, dateTo]);

  const filtered     = useMemo(() => rows.filter(filterFn),     [rows, filterFn]);
  const filteredOpen = useMemo(() => openRows.filter(filterFn), [openRows, filterFn]);

  // ── current week ─────────────────────────────────────────────────────────
  const currentWeekKey = useMemo(() => getISOWeekInfo(new Date().toISOString())?.key, []);

  // ── merge both datasets into a single week map ───────────────────────────
  const weeks = useMemo(() => {
    const map = {};

    const ensureWeek = (info) => {
      if (!map[info.key]) {
        map[info.key] = { ...info, ...getWeekRange(info.year, info.week), shippedPos: {}, openPos: {} };
      }
    };

    // Shipped POs → keyed by shippedDate week
    filtered.forEach((r) => {
      if (!inDateRange(r.shippedDate)) return;
      const info = r.shippedDate ? getISOWeekInfo(r.shippedDate) : null;
      if (!info) return;
      ensureWeek(info);
      const pk = `${(r.vendor || "").trim()}||${(r.poNo || "").trim()}`;
      if (!map[info.key].shippedPos[pk]) {
        map[info.key].shippedPos[pk] = { customer: (r.customer||"").trim(), vendor: (r.vendor||"").trim(), poNo: (r.poNo||"").trim(), lines: [] };
      }
      map[info.key].shippedPos[pk].lines.push(r);
    });

    // Open + shipped rows by target date → openPos, line-level dedup.
    // filteredOpen rows go in first; filtered rows only fill gaps not already covered,
    // preventing partially-shipped lines (present in both APIs) from being double-counted.
    const addToOpenPos = (r, skipIfSeen) => {
      if (!inDateRange(r.target)) return;
      const info = r.target ? getISOWeekInfo(r.target) : null;
      if (!info) return;
      ensureWeek(info);
      const pk = `${(r.vendor || "").trim()}||${(r.poNo || "").trim()}`;
      if (!map[info.key].openPos[pk]) {
        map[info.key].openPos[pk] = { customer: (r.customer||"").trim(), vendor: (r.vendor||"").trim(), poNo: (r.poNo||"").trim(), target: r.target, lines: [], _seen: new Set() };
      }
      const entry = map[info.key].openPos[pk];
      const lineKey = `${(r.item||"").trim()}||${r.orderQty||0}||${r.orderPrice||0}`;
      if (skipIfSeen && entry._seen.has(lineKey)) return;
      entry._seen.add(lineKey);
      entry.lines.push(r);
    };
    filteredOpen.forEach((r) => addToOpenPos(r, false));
    filtered.forEach((r) => addToOpenPos(r, true));

    // Strip internal dedup sets before returning
    Object.values(map).forEach((wk) =>
      Object.values(wk.openPos).forEach((po) => delete po._seen)
    );

    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => ({ key, ...data }));
  }, [filtered, filteredOpen, inDateRange]);

  // ── apply Mar 30 cutoff first, then build dropdown + displayed from that ──
  const baseWeeks = useMemo(() => {
    const cutoff = new Date(2000 + parseInt(year, 10) - 1, 2, 30);
    return weeks.filter((w) => w.end >= cutoff);
  }, [weeks, year]);

  const weekOptions    = useMemo(() => baseWeeks.map((w) => `W${w.week} · ${fmtD(w.start)}–${fmtD(w.end)}, ${w.year}`), [baseWeeks]);
  const weekLabelToKey = useMemo(() => Object.fromEntries(
    baseWeeks.map((w) => [`W${w.week} · ${fmtD(w.start)}–${fmtD(w.end)}, ${w.year}`, w.key])
  ), [baseWeeks]);

  const displayedWeeks = useMemo(() => {
    if (!weekFilter.length) return baseWeeks;
    const keys = new Set(weekFilter.map((label) => weekLabelToKey[label]).filter(Boolean));
    return baseWeeks.filter((w) => keys.has(w.key));
  }, [baseWeeks, weekFilter, weekLabelToKey]);

  // ── months view ──────────────────────────────────────────────────────────
  const months = useMemo(() => {
    const map = {};
    const ensureMonth = (info) => {
      if (!map[info.key]) {
        map[info.key] = { ...info, ...getMonthRange(info.year, info.month), shippedPos: {}, openPos: {} };
      }
    };
    filtered.forEach((r) => {
      if (!inDateRange(r.shippedDate)) return;
      const info = r.shippedDate ? getMonthInfo(r.shippedDate) : null;
      if (!info) return;
      ensureMonth(info);
      const pk = `${(r.vendor || "").trim()}||${(r.poNo || "").trim()}`;
      if (!map[info.key].shippedPos[pk]) {
        map[info.key].shippedPos[pk] = { customer: (r.customer||"").trim(), vendor: (r.vendor||"").trim(), poNo: (r.poNo||"").trim(), lines: [] };
      }
      map[info.key].shippedPos[pk].lines.push(r);
    });
    const addToOpenPos = (r, skipIfSeen) => {
      if (!inDateRange(r.target)) return;
      const info = r.target ? getMonthInfo(r.target) : null;
      if (!info) return;
      ensureMonth(info);
      const pk = `${(r.vendor || "").trim()}||${(r.poNo || "").trim()}`;
      if (!map[info.key].openPos[pk]) {
        map[info.key].openPos[pk] = { customer: (r.customer||"").trim(), vendor: (r.vendor||"").trim(), poNo: (r.poNo||"").trim(), target: r.target, lines: [], _seen: new Set() };
      }
      const entry = map[info.key].openPos[pk];
      const lineKey = `${(r.item||"").trim()}||${r.orderQty||0}||${r.orderPrice||0}`;
      if (skipIfSeen && entry._seen.has(lineKey)) return;
      entry._seen.add(lineKey);
      entry.lines.push(r);
    };
    filteredOpen.forEach((r) => addToOpenPos(r, false));
    filtered.forEach((r) => addToOpenPos(r, true));

    Object.values(map).forEach((mo) =>
      Object.values(mo.openPos).forEach((po) => delete po._seen)
    );

    return Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).map(([key, data]) => ({ key, ...data }));
  }, [filtered, filteredOpen, inDateRange]);

  const baseMonths = useMemo(() => {
    const cutoff = new Date(2000 + parseInt(year, 10) - 1, 2, 30);
    return months.filter((m) => m.end >= cutoff);
  }, [months, year]);

  const currentMonthKey = useMemo(() => getMonthInfo(new Date().toISOString())?.key, []);

  const monthOptions    = useMemo(() => baseMonths.map((m) => `${MONTH_NAMES[m.month]} ${m.year}`), [baseMonths]);
  const monthLabelToKey = useMemo(() => Object.fromEntries(
    baseMonths.map((m) => [`${MONTH_NAMES[m.month]} ${m.year}`, m.key])
  ), [baseMonths]);

  const displayedMonths = useMemo(() => {
    if (!monthFilter.length) return baseMonths;
    const keys = new Set(monthFilter.map((label) => monthLabelToKey[label]).filter(Boolean));
    return baseMonths.filter((m) => keys.has(m.key));
  }, [baseMonths, monthFilter, monthLabelToKey]);

  // ── week filter auto-expands selected weeks ───────────────────────────────
  useEffect(() => {
    if (!weekFilter.length) return;
    const keys = weekFilter.map((label) => weekLabelToKey[label]).filter(Boolean);
    if (keys.length) setExpandedWeeks((prev) => { const n = new Set(prev); keys.forEach((k) => n.add(k)); return n; });
  }, [weekFilter, weekLabelToKey]);

  useEffect(() => {
    didScrollInit.current = false;
    setExpandedWeeks(new Set());
    setExpandedMonths(new Set());
  }, [year, buyer, vendor]);

  useEffect(() => { didScrollInit.current = false; }, [view]);

  const toggleMonth = useCallback((key) => {
    setExpandedMonths((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);

  // ── summary stats ─────────────────────────────────────────────────────────
  const shippedDisplayedRows = useMemo(
    () => (view === "week" ? displayedWeeks : displayedMonths).flatMap((w) => Object.values(w.shippedPos).flatMap((p) => p.lines)),
    [view, displayedWeeks, displayedMonths]
  );
  const openDisplayedRows = useMemo(
    () => (view === "week" ? displayedWeeks : displayedMonths).flatMap((w) => Object.values(w.openPos).flatMap((p) => p.lines)),
    [view, displayedWeeks, displayedMonths]
  );

  const shippedStats = useMemo(() => ({
    orderValue:   shippedDisplayedRows.reduce((s, r) => s + (r.orderValue   || 0), 0),
    shippedValue: shippedDisplayedRows.reduce((s, r) => s + (r.shippedValue || 0), 0),
    balanceValue: shippedDisplayedRows.reduce((s, r) => s + (r.balanceValue || 0), 0),
    poCount:      new Set(shippedDisplayedRows.map((r) => `${r.vendor}||${r.poNo}`)).size,
    lineCount:    shippedDisplayedRows.length,
  }), [shippedDisplayedRows]);

  const openStats = useMemo(() => ({
    orderValue:   openDisplayedRows.reduce((s, r) => s + (r.orderValue   || 0), 0),
    balanceValue: openDisplayedRows.reduce((s, r) => s + (r.balanceValue || 0), 0),
    poCount:      new Set(openDisplayedRows.map((r) => `${r.vendor}||${r.poNo}`)).size,
    lineCount:    openDisplayedRows.length,
  }), [openDisplayedRows]);

  // ── export ────────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const periods = view === "week" ? displayedWeeks : displayedMonths;
    const misOpts = { getCommPct, getJngCommPct, getJnmCommPct, buyerRateMap, plMode };
    downloadPlScheduleExcel({
      periods,
      view,
      plMode,
      getCommPct,
      getJngCommPct,
      getJnmCommPct,
      buyerRateMap,
      plExpensesMap,
      includeMisMonthly: true,
      misEntries: view === "month" ? buildMisMonthlyEntries(periods, misOpts) : null,
      filename: `${view === "week" ? "Weekly" : "Monthly"}_PO_Schedule_FY${year}.xlsx`,
    });
  }, [displayedWeeks, displayedMonths, view, year, getCommPct, getJngCommPct, getJnmCommPct, buyerRateMap, plMode, plExpensesMap]);

  // ── toggle ────────────────────────────────────────────────────────────────
  const toggleWeek = useCallback((key) => {
    setExpandedWeeks((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }, []);

  // ── unified view helpers ──────────────────────────────────────────────────
  const displayItems   = view === "week" ? displayedWeeks : displayedMonths;
  const currentItemKey = view === "week" ? currentWeekKey : currentMonthKey;
  const isCollapsedFn  = (key) => view === "week" ? !expandedWeeks.has(key) : !expandedMonths.has(key);
  const toggleItemFn   = (key) => view === "week" ? toggleWeek(key) : toggleMonth(key);
  const collapseAllFn  = () => view === "week"
    ? setExpandedWeeks(new Set())
    : setExpandedMonths(new Set());
  const expandAllFn    = () => view === "week"
    ? setExpandedWeeks(new Set(displayedWeeks.map((w) => w.key)))
    : setExpandedMonths(new Set(displayedMonths.map((m) => m.key)));

  const sortEntries = useCallback((entries, dateGetter) => {
    if (sortBy === "default") return entries;
    return [...entries].sort(([, a], [, b]) => {
      if (sortBy === "buyer_asc") return (a.customer || "").localeCompare(b.customer || "");
      if (sortBy === "buyer_desc") return (b.customer || "").localeCompare(a.customer || "");
      const tA = new Date(dateGetter(a)).getTime() || 0;
      const tB = new Date(dateGetter(b)).getTime() || 0;
      return sortBy === "date_asc" ? tA - tB : tB - tA;
    });
  }, [sortBy]);

  const isLoading = loading || openLoading;
  const anyError  = error || openError;

  const scrollToCurrentPeriod = useCallback(() => {
    const key = view === "week" ? currentWeekKey : currentMonthKey;
    if (!key) return;
    setTimeout(() => {
      document.getElementById(`po-schedule-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [view, currentWeekKey, currentMonthKey]);

  const handlePlModeChange = useCallback((val) => {
    setPlMode(val);
    setExpandedWeeks(new Set());
    setExpandedMonths(new Set());
    scrollToCurrentPeriod();
  }, [scrollToCurrentPeriod]);

  // Scroll to current week/month on first load (all periods stay collapsed)
  useEffect(() => {
    if (isLoading || anyError || !displayItems.length || didScrollInit.current) return;
    const key = view === "week" ? currentWeekKey : currentMonthKey;
    if (!key || !displayItems.some((d) => d.key === key)) return;
    didScrollInit.current = true;
    scrollToCurrentPeriod();
  }, [isLoading, anyError, displayItems, view, currentWeekKey, currentMonthKey, scrollToCurrentPeriod]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="font-sans text-black bg-gray-50 min-h-full pl-print-root">

      <div className="sticky top-0 z-20 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 md:px-6 py-3 md:py-4 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-indigo-50 rounded-md flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold text-black leading-tight">
              {view === "week" ? "Weekly" : "Monthly"} PO Schedule
            </div>
            <div className="text-xs text-black/70 mt-0.5 line-clamp-1">
              {view === "week"
                ? `FY 20${year} · Shipped by ship date · Projected by target date · Current: W${currentWeekKey?.split("-W")[1]}`
                : `FY 20${year} · Grouped by calendar month · Current: ${MONTH_NAMES[new Date().getMonth()]}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 no-print flex-wrap justify-end">
          <PlModeToggle value={plMode} onChange={handlePlModeChange} />
          <select value={year} onChange={(e) => setYear(e.target.value)}
            className="h-8 px-2.5 text-xs font-semibold border border-gray-200 rounded-lg bg-white cursor-pointer">
            {availableYears.map((y) => <option key={y} value={y}>FY 20{y}</option>)}
          </select>
          <button onClick={handleExport} disabled={!displayItems.length || ((plMode === "jnm" || plMode === "overall") && !hasJnmPlAccess)}
            className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-green-500 bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span className="hidden sm:inline">Export Excel</span>
            <span className="sm:hidden">Export</span>
          </button>
          <PrintButton
            onClick={printPage}
            disabled={!displayItems.length || ((plMode === "jnm" || plMode === "overall") && !hasJnmPlAccess)}
          />
        </div>
      </div>


      {/* Toolbar */}
      <div className="px-4 md:px-6 py-2.5 bg-white border-b border-gray-200 no-print space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden shrink-0">
            {["week", "month"].map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors cursor-pointer
                  ${view === v ? "bg-indigo-600 text-white" : "bg-white text-black hover:bg-gray-50"}`}>
                {v === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            className={`lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer
              ${mobileFiltersOpen ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-300 bg-gray-50 text-black hover:bg-white"}`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>
            </svg>
            Filters
          </button>
          <span className="ml-auto text-[11px] sm:text-xs text-black/70 text-right leading-tight">
            {shippedStats.lineCount} shipped · {openStats.lineCount} projected · {displayItems.length} {view}{displayItems.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className={`${mobileFiltersOpen ? "flex" : "hidden"} lg:flex flex-col lg:flex-row lg:items-center gap-2 lg:flex-wrap`}>
          {view === "week" && (
            <Dropdown placeholder="All Weeks" options={weekOptions} value={weekFilter} onChange={setWeekFilter} multiSelect selectedLabel="weeks" />
          )}
          {view === "month" && (
            <Dropdown placeholder="All Months" options={monthOptions} value={monthFilter} onChange={setMonthFilter} multiSelect selectedLabel="months" />
          )}
          <div className="hidden lg:block w-px h-5 bg-gray-200 mx-0.5 shrink-0" />
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <DateRangeField label="From" value={dateFrom} onChange={setDateFrom} />
            <DateRangeField label="To"   value={dateTo}   onChange={setDateTo} />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="px-2 py-1 text-[10px] font-medium text-black/50 hover:text-red-500 cursor-pointer"
                title="Clear date range"
              >
                Clear
              </button>
            )}
          </div>
          <div className="hidden lg:block w-px h-5 bg-gray-200 mx-0.5 shrink-0" />
          <Dropdown placeholder="All Buyers"  options={buyerList}  value={buyer}  onChange={setBuyer}  />
          <Dropdown placeholder="All Vendors" options={vendorList} value={vendor} onChange={setVendor} />
          <div className="hidden lg:block w-px h-5 bg-gray-200 mx-0.5 shrink-0" />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
            className="h-8 w-full sm:w-auto px-2.5 text-xs font-medium border border-gray-300 rounded-lg bg-white text-black cursor-pointer hover:border-gray-400 transition-colors">
            <option value="default">Sort: Default</option>
            <option value="buyer_asc">Buyer A → Z</option>
            <option value="buyer_desc">Buyer Z → A</option>
            <option value="date_asc">Date ↑ Earliest</option>
            <option value="date_desc">Date ↓ Latest</option>
          </select>
          <div className="hidden lg:block w-px h-5 bg-gray-200 mx-0.5 shrink-0" />
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto lg:flex lg:items-center">
            <button onClick={expandAllFn}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-md bg-gray-50 text-black hover:bg-white hover:border-gray-400 transition-all cursor-pointer">
              Expand All
            </button>
            <button onClick={collapseAllFn}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-md bg-gray-50 text-black hover:bg-white hover:border-gray-400 transition-all cursor-pointer">
              Collapse All
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* Content */}
      <div className="px-3 sm:px-4 md:px-6 py-4 space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
            <p className="text-sm text-black">Loading weekly schedule…</p>
          </div>
        ) : anyError ? (
          <div className="text-center py-16 text-red-500 text-sm">{anyError}</div>
        ) : displayItems.length === 0 ? (
          <div className="text-center py-16 text-black text-sm">No purchase orders found</div>
        ) : (
          displayItems.map((wk) => {
            const isCurrent     = wk.key === currentItemKey;
            const isCollapsed   = isCollapsedFn(wk.key);
            const shippedEntries = sortEntries(Object.entries(wk.shippedPos), (po) => po.lines.map(r => r.shippedDate).filter(Boolean).sort()[0] || "");
            const openEntries    = sortEntries(Object.entries(wk.openPos),    (po) => po.lines[0]?.target || "");

            const wkSOV = shippedEntries.reduce((s, [, p]) => s + poOrderVal(p), 0);
            const wkSSV = view === "month"
              ? sumShippedValueForPeriodKey(filtered, wk.key)
              : sumShippedValueForWeekKey(filtered, wk.key);
            const wkSBV = shippedEntries.reduce((s, [, p]) => s + p.lines.reduce((ss, r) => ss + (r.balanceValue || 0), 0), 0);
            const wkOOV = openEntries.reduce((s, [, p]) => s + poOrderVal(p), 0);
            const inWk  = (r) => { const d = new Date(r.shippedDate); return r.shippedDate && d >= wk.start && d <= wk.end; };
            const wkOSV = openEntries.reduce((s, [, p]) => s + poProjShippedVal(p, inWk), 0);
            const wkOSQ = openEntries.reduce((s,   [, p]) => s + p.lines.reduce((ss, r) => ss + (inWk(r) ? (r.shippedQty   || 0) : 0), 0), 0);
            const wkOOQ = openEntries.reduce((s,   [, p]) => s + p.lines.reduce((ss, r) => ss + (r.orderQty    || 0), 0), 0);
            const wkOBV = wkOOV - wkOSV;
            const wkOBQ = wkOOQ - wkOSQ;

            const openComm = plMode === "overall"
              ? sumOverallComm(openEntries, poOrderVal, getJnmCommPct, getJngCommPct)
              : { jnm: 0, jng: 0, overall: sumSingleComm(openEntries, poOrderVal, getCommPct) };

            const shipComm = plMode === "overall"
              ? sumOverallComm(
                  shippedEntries,
                  (p) => poProjShippedVal(p, inWk),
                  getJnmCommPct,
                  getJngCommPct,
                )
              : { jnm: 0, jng: 0, overall: sumSingleComm(
                  shippedEntries,
                  (p) => poProjShippedVal(p, inWk),
                  getCommPct,
                ) };

            const wkOComm = openComm.overall;
            const wkJnmOComm = openComm.jnm;
            const wkJngOComm = openComm.jng;
            const wkSComm = shipComm.overall;
            const wkJnmSComm = shipComm.jnm;
            const wkJngSComm = shipComm.jng;

            // Flat monthly fee (e.g. AS CHEHOMA) — JNG / Overall, month view only, once per unique buyer
            const flatFeeTotal = ((plMode === "jng" || plMode === "overall") && view === "month")
              ? (() => {
                  const seen = new Set();
                  return shippedEntries.reduce((s, [, p]) => {
                    const k = normStr(p.customer);
                    if (seen.has(k)) return s;
                    const e = buyerRateMap[k];
                    if (!e || e.remarks !== "MONTHLY") return s;
                    seen.add(k);
                    return s + (e.pct || 0);
                  }, 0);
                })()
              : 0;

            const wkOverallSComm = wkJnmSComm + wkJngSComm + flatFeeTotal;
            const wkOverallOComm = wkJnmOComm + wkJngOComm;
            const headerShippedComm = plMode === "overall" ? wkJnmSComm + wkJngSComm : wkSComm;
            const plIncomeFromSales = plMode === "overall" ? wkOverallSComm : wkSComm + flatFeeTotal;
            const headerProjectedComm = plMode === "overall" ? wkOverallOComm : wkOComm;
            const activeOpenCols = plMode === "overall" ? OVERALL_OPEN_COLS : OPEN_COLS;
            const activeShippedCols = plMode === "overall" ? OVERALL_SHIPPED_COLS : SHIPPED_COLS;
            const commReadOnly = (plMode === "jnm" || plMode === "overall") && !hasJnmPlAccess;

            return (
              <div key={wk.key} id={`po-schedule-${wk.key}`}
                className={`rounded-xl border overflow-hidden shadow-sm ${isCurrent ? "border-indigo-300 shadow-indigo-100" : "border-gray-200"}`}>

                {/* Week/Month header */}
                <div onClick={() => toggleItemFn(wk.key)}
                  className={`flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 cursor-pointer select-none transition-colors
                    ${isCurrent ? "bg-indigo-50 hover:bg-indigo-100" : "bg-gray-50 hover:bg-gray-100"}`}>

                  {/* Left: week identity — stays on one line */}
                  <div className="flex items-center gap-2 shrink-0">
                    <svg className={`w-4 h-4 shrink-0 transition-transform duration-150 ${isCurrent ? "text-indigo-500" : "text-black"} ${isCollapsed ? "" : "rotate-90"}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tabular-nums
                      ${isCurrent ? "bg-indigo-500 text-white" : "bg-gray-200 text-black"}`}>
                      {view === "week" ? `W${wk.week}` : MONTH_NAMES[wk.month]?.slice(0, 3)}
                    </span>
                    {isCurrent && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-green-100 text-green-700 border border-green-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Current
                      </span>
                    )}
                    <span className={`whitespace-nowrap text-[12px] font-semibold ${isCurrent ? "text-indigo-900" : "text-black"}`}>
                      {view === "week"
                        ? `${fmtD(wk.start)} – ${fmtD(wk.end)}, ${wk.year}`
                        : `${MONTH_NAMES[wk.month]} · ${fmtD(wk.start)} – ${fmtD(wk.end)}, ${wk.year}`}
                    </span>
                  </div>

                {/* Stats — desktop */}
                  <div className="hidden lg:flex flex-wrap items-center gap-2 text-xs">

                    {/* Projected */}
                    {openEntries.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700">
                          {openEntries.length} Pos Projected
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] text-black uppercase tracking-wider">Po Value</span>
                          <span className="font-mono font-semibold text-indigo-600">{fmt(wkOOV, true)}</span>
                        </span>
                        <span className="text-black">·</span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] text-black uppercase tracking-wider">Actual Shipped</span>
                          <span className="font-mono font-semibold text-green-600">{fmt(wkOSV, true)}</span>
                        </span>
                        <span className="text-black">·</span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] text-black uppercase tracking-wider">Balance</span>
                          <span className="font-mono font-semibold text-amber-600">{fmt(wkOBV, true)}</span>
                        </span>
                        <span className="text-black">·</span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] text-black uppercase tracking-wider">OTIF</span>
                          <span className={`font-mono font-bold text-xs ${wkOOV > 0 ? (wkOSV / wkOOV >= 0.9 ? "text-green-600" : wkOSV / wkOOV >= 0.7 ? "text-amber-500" : "text-red-500") : "text-black"}`}>
                            {wkOOV > 0 ? `${((wkOSV / wkOOV) * 100).toFixed(1)}%` : "—"}
                          </span>
                        </span>
                        {headerProjectedComm > 0 && (
                          <>
                            <span className="text-black">·</span>
                            <span className="flex items-center gap-1.5">
                              <span className="text-[10px] text-black uppercase tracking-wider">Commission {view === "week" ? "TW" : "TM"}</span>
                              <span className="font-mono font-semibold text-indigo-600">{fmt(headerProjectedComm, true)}</span>
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {shippedEntries.length > 0 && openEntries.length > 0 && (
                      <div className="w-px h-4 bg-gray-300 shrink-0" />
                    )}

                    {/* Shipped */}
                    {shippedEntries.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">
                          {shippedEntries.length} Overall Shipped {view === "week" ? "TW" : "TM"}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] text-black uppercase tracking-wider">PO Value</span>
                          <span className="font-mono font-semibold text-blue-600">{fmt(wkSOV, true)}</span>
                        </span>
                        <span className="text-black">·</span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] text-black uppercase tracking-wider">Actual Shipped</span>
                          <span className="font-mono font-semibold text-green-600">{fmt(wkSSV, true)}</span>
                        </span>
                        {wkSBV > 0 && (
                          <>
                            <span className="text-black">·</span>
                            <span className="flex items-center gap-1.5">
                              <span className="text-[10px] text-black uppercase tracking-wider">Balance</span>
                              <span className="font-mono font-semibold text-amber-600">{fmt(wkSBV, true)}</span>
                            </span>
                          </>
                        )}
                        {(headerShippedComm > 0 || flatFeeTotal > 0) && (
                          <>
                            <span className="text-black">·</span>
                            <span className="flex items-center gap-1.5">
                              <span className="text-[10px] text-black uppercase tracking-wider">Commission {view === "week" ? "TW" : "TM"}</span>
                              <span className="font-mono font-semibold text-indigo-600">
                                {flatFeeTotal > 0 && canSeeChehomaBreakdown
                                  ? `(${fmt(headerShippedComm, true)} + ${fmt(flatFeeTotal, true)})`
                                  : fmt(headerShippedComm, true)}
                              </span>
                            </span>
                          </>
                        )}
                        {(() => {
                          const saved = plExpensesMap[plExpenseKey(wk.key, plMode)];
                          if (!saved || view !== "month" || !canSeeMonthlyExpenses) return null;
                          const te = saved.total_expenses;
                          const tp = saved.total_pct_to_sales;
                          if (!te && !tp) return null;
                          return (
                            <>
                              <span className="text-black">·</span>
                              {te > 0 && (
                                <span className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-black uppercase tracking-wider">M. Expenses</span>
                                  <span className="font-mono font-semibold text-red-500">{fmt(te, true)}</span>
                                </span>
                              )}
                              {tp > 0 && (
                                <>
                                  <span className="text-black">·</span>
                                  <span className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-black uppercase tracking-wider">Exp %</span>
                                    <span className="font-mono font-semibold text-red-500">{Number(tp).toFixed(2)}%</span>
                                  </span>
                                </>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <PeriodStatsMobile
                    projected={openEntries.length > 0 ? {
                      count: openEntries.length,
                      poValue: fmt(wkOOV, true),
                      shipped: fmt(wkOSV, true),
                      balance: fmt(wkOBV, true),
                      otif: wkOOV > 0 ? (wkOSV / wkOOV) * 100 : null,
                      comm: headerProjectedComm > 0 ? fmt(headerProjectedComm, true) : null,
                    } : null}
                    shipped={shippedEntries.length > 0 ? {
                      count: shippedEntries.length,
                      poValue: fmt(wkSOV, true),
                      shipped: fmt(wkSSV, true),
                      balance: wkSBV > 0 ? fmt(wkSBV, true) : null,
                      comm: (headerShippedComm > 0 || flatFeeTotal > 0) ? fmt(headerShippedComm, true) : null,
                    } : null}
                    view={view}
                    plMode={plMode}
                    flatFeeTotal={flatFeeTotal > 0 ? fmt(flatFeeTotal, true) : null}
                    canSeeChehomaBreakdown={canSeeChehomaBreakdown}
                    canSeeMonthlyExpenses={canSeeMonthlyExpenses}
                    plExpensesMap={plExpensesMap}
                    monthKey={wk.key}
                    fmt={fmt}
                  />

                  {/* P&L button — month view, JNM-authorized only */}
                  {view === "month" && hasJnmPlAccess && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const pl = computeMonthPlSummary(wk, {
                          plMode, view, getCommPct, getJngCommPct, getJnmCommPct, buyerRateMap,
                          shippedRows: filtered,
                        });
                        setPlModalData({
                          monthKey:          wk.key,
                          monthLabel:        `${MONTH_NAMES[wk.month]} ${wk.year}`,
                          salesGlobal:       pl.sales_global,
                          incomeFromSales:   pl.income_from_sales,
                          flatFeeCommission: pl.flat_fee_commission ?? 0,
                        });
                      }}
                      className="w-full lg:w-auto lg:ml-auto shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 lg:py-1 text-[11px] font-bold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors cursor-pointer shadow-sm">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>
                      </svg>
                      P&L
                    </button>
                  )}
                </div>

                {!isCollapsed && (
                  <div className="bg-white divide-y divide-gray-100">

                    {/* ── Projected (Open) section ── */}
                    {openEntries.length > 0 && (
                      <div>
                        <div className={`flex items-center gap-2 px-4 py-1.5 bg-indigo-50 border-b border-indigo-100 shrink-0`}>
                          <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                          <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Projected this {view}</span>
                          <span className="text-[11px] text-indigo-400">{openEntries.length} open PO{openEntries.length !== 1 ? "s" : ""} · target date falls in this {view}</span>
                        </div>
                        <PlTableScrollWrap className={`hidden lg:block ${PL_TABLE_SCROLL}`}>
                          <table className="w-max min-w-full text-[13px] border-collapse">
                            <thead>
                              <tr>
                                {activeOpenCols.map((c) => (
                                  <th key={c.label} className={plTableThClass(c)}>
                                    {c.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {openEntries.map(([pk, po], idx) => {
                                const inWeek = (r) => { const d = new Date(r.shippedDate); return r.shippedDate && d >= wk.start && d <= wk.end; };
                                const oQ  = po.lines.reduce((s, r) => s + (r.orderQty     || 0), 0);
                                const sQ  = po.lines.reduce((s, r) => s + (inWeek(r) ? (r.shippedQty   || 0) : 0), 0);
                                const oV  = po.lines.reduce((s, r) => s + (r.orderValue   || 0), 0);
                                const sV  = po.lines.reduce((s, r) => s + (inWeek(r) ? (r.shippedValue || 0) : 0), 0);
                                const bQ  = oQ - sQ;
                                const bV  = oV - sV;
                                const target = po.lines[0]?.target || "";
                                const shippedInThisWeek = po.lines.some(r => {
                                  if (!r.shippedDate) return false;
                                  const d = new Date(r.shippedDate);
                                  return d >= wk.start && d <= wk.end;
                                });
                                const st = shippedInThisWeek
                                  ? calcPoStatus(po.lines)
                                  : { label: "Pending", cls: "bg-gray-100 text-black border-gray-300", dot: "#9ca3af" };
                                const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";

                                return (
                                  <tr key={pk} className={`${rowBg} border-b border-gray-100 hover:bg-indigo-50 transition-colors`}>
                                    <td className="px-3 py-2 border-r border-gray-100 whitespace-nowrap min-w-[160px]">
                                      <span className="inline-flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-indigo-700 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                          {po.customer?.slice(0, 2).toUpperCase() || "?"}
                                        </span>
                                        <span className="text-xs text-black font-medium">{po.customer || "—"}</span>
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 border-r border-gray-100 text-xs text-black whitespace-nowrap min-w-[150px]">{po.vendor || "—"}</td>
                                    <td className="px-3 py-2 border-r border-gray-100 whitespace-nowrap min-w-[110px]">
                                      <span className="font-mono font-bold text-indigo-700 text-xs">{po.poNo || "—"}</span>
                                    </td>
                                    <td className="px-3 py-2 border-r border-gray-100 text-right text-xs text-black min-w-[55px]">{po.lines.length}</td>
                                    <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs text-black min-w-[80px]">{fmt(oQ)}</td>
                                    <td className={`px-3 py-2 border-r border-gray-100 text-right font-mono text-xs min-w-[80px] ${sQ ? "text-green-600 font-semibold" : "text-black"}`}>{fmt(sQ)}</td>
                                    <td className={`px-3 py-2 border-r border-gray-100 text-right font-mono text-xs min-w-[80px] ${bQ ? "text-amber-600 font-semibold" : "text-black"}`}>{fmt(bQ)}</td>
                                    <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs font-semibold text-indigo-600 min-w-[110px]">{fmt(oV, true)}</td>
                                    <td className={`px-3 py-2 border-r border-gray-100 text-right font-mono text-xs font-semibold min-w-[110px] ${sV ? "text-green-600" : "text-black"}`}>{fmt(sV, true)}</td>
                                    <td className="px-3 py-2 border-r border-gray-100 text-xs text-black whitespace-nowrap min-w-[100px]">{formatPoShpDateLabel(po.lines, inWeek)}</td>
                                    <td className={`px-3 py-2 border-r border-gray-100 text-right font-mono text-xs font-semibold min-w-[110px] ${bV ? "text-amber-600" : "text-black"}`}>{fmt(bV, true)}</td>
                                    {plMode === "overall" ? (
                                      <OverallCommissionCells
                                        po={po}
                                        baseValue={oV}
                                        getJnmCommPct={getJnmCommPct}
                                        getJngCommPct={getJngCommPct}
                                        commissionMap={commissionMap}
                                        onSave={handleSaveCommission}
                                        readOnly={commReadOnly}
                                      />
                                    ) : (
                                      <>
                                        <td className="px-3 py-2 border-r border-gray-100 min-w-[110px]">
                                          <CommissionCell
                                            poNo={po.poNo}
                                            initialValue={plMode === "jng"
                                              ? (getJngCommPct(po.poNo, po.vendor, po.customer) ?? "")
                                              : (commissionMap[po.poNo] ?? (getJnmCommPct(po.poNo, po.vendor, po.customer) ?? ""))}
                                            onSave={handleSaveCommission}
                                            readOnly={commReadOnly || plMode === "jng"}
                                          />
                                        </td>
                                        <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs min-w-[110px]">
                                          {(() => {
                                            const { amt } = computeSinglePoComm(po, oV, getCommPct);
                                            if (amt == null) return <span className="text-black">—</span>;
                                            return <span className="font-semibold text-indigo-600">{fmtCommUsd(amt)}</span>;
                                          })()}
                                        </td>
                                      </>
                                    )}
                                    <td className="px-3 py-2 border-r border-gray-100 text-xs text-black whitespace-nowrap min-w-[150px]">{target}</td>
                                    <td className="px-3 py-2 whitespace-nowrap min-w-[90px]">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${st.cls}`}>
                                        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: st.dot }} />{st.label}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                              {/* Projected totals */}
                              <tr className="bg-indigo-900 border-t-2 border-indigo-700">
                                <td colSpan={3} className="px-3 py-2 text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Projected Total</td>
                                <td className="px-3 py-2 text-right font-mono text-xs font-bold text-indigo-300">{openEntries.reduce((s, [, p]) => s + p.lines.length, 0)}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs font-bold text-white">{fmt(wkOOQ)}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs font-bold text-green-300">{fmt(wkOSQ)}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs font-bold text-amber-300">{fmt(wkOBQ)}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs font-bold text-indigo-200">{fmt(wkOOV, true)}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs font-bold text-green-300">{fmt(wkOSV, true)}</td>
                                <td />
                                <td className="px-3 py-2 text-right font-mono text-xs font-bold text-amber-300">{fmt(wkOBV, true)}</td>
                                {plMode === "overall" ? (
                                  <>
                                    <td />
                                    <td />
                                    <td className="px-3 py-2 text-right font-mono text-xs font-bold text-violet-300">
                                      {wkJnmOComm > 0 ? fmt(wkJnmOComm, true) : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-xs font-bold text-violet-300">
                                      {wkJngOComm > 0 ? fmt(wkJngOComm, true) : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-xs font-bold text-violet-300">
                                      {wkOverallOComm > 0 ? fmt(wkOverallOComm, true) : "—"}
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td />
                                    <td className="px-3 py-2 text-right font-mono text-xs font-bold text-violet-300">
                                      {wkOComm > 0 ? fmt(wkOComm, true) : "—"}
                                    </td>
                                  </>
                                )}
                                <td colSpan={2} />
                              </tr>
                            </tbody>
                          </table>
                        </PlTableScrollWrap>
                        <div className="lg:hidden divide-y divide-gray-100">
                          {openEntries.map(([pk, po], idx) => (
                            <OpenPoMobileCard
                              key={pk}
                              po={po}
                              wk={wk}
                              idx={idx}
                              plMode={plMode}
                              getCommPct={getCommPct}
                              getJnmCommPct={getJnmCommPct}
                              getJngCommPct={getJngCommPct}
                              commissionMap={commissionMap}
                              onSave={handleSaveCommission}
                              readOnly={commReadOnly}
                              fmt={fmt}
                              fmtCommUsd={fmtCommUsd}
                              computeSinglePoComm={computeSinglePoComm}
                              computeOverallPoComm={computeOverallPoComm}
                              formatPoShpDateLabel={formatPoShpDateLabel}
                              calcPoStatus={calcPoStatus}
                            />
                          ))}
                        </div>
                        <MobilePoTotals
                          variant="projected"
                          plMode={plMode}
                          fmt={fmt}
                          totals={[
                            { label: "SKUs", value: openEntries.reduce((s, [, p]) => s + p.lines.length, 0) },
                            { label: "Ord Qty", value: fmt(wkOOQ) },
                            { label: "Shp Qty", value: fmt(wkOSQ), className: "text-green-300" },
                            { label: "Bal Qty", value: fmt(wkOBQ), className: "text-amber-300" },
                            { label: "Order Val", value: fmt(wkOOV, true), className: "text-indigo-200" },
                            { label: "Shipped $", value: fmt(wkOSV, true), className: "text-green-300" },
                            { label: "Balance $", value: fmt(wkOBV, true), className: "text-amber-300" },
                            ...(plMode === "overall"
                              ? [
                                  { label: "JNM Comm", value: wkJnmOComm > 0 ? fmt(wkJnmOComm, true) : "—", className: "text-violet-300" },
                                  { label: "TWIF Comm", value: wkJngOComm > 0 ? fmt(wkJngOComm, true) : "—", className: "text-violet-300" },
                                  { label: "Overall", value: wkOverallOComm > 0 ? fmt(wkOverallOComm, true) : "—", className: "text-violet-300" },
                                ]
                              : [{ label: "Commission", value: wkOComm > 0 ? fmt(wkOComm, true) : "—", className: "text-violet-300" }]),
                          ]}
                        />
                      </div>
                    )}

                    {/* ── Shipped section ── */}
                    {shippedEntries.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 px-4 py-1.5 bg-green-50 border-b border-green-100 shrink-0">
                          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                          <span className="text-[11px] font-bold text-green-700 uppercase tracking-wider">Shipped this {view}</span>
                          <span className="text-[11px] text-green-500">{shippedEntries.length} PO{shippedEntries.length !== 1 ? "s" : ""}</span>
                        </div>
                        <PlTableScrollWrap className={`hidden lg:block ${PL_TABLE_SCROLL}`}>
                          <table className="w-max min-w-full text-[13px] border-collapse">
                            <thead>
                              <tr>
                                {activeShippedCols.map((c) => (
                                  <th key={c.label} className={plTableThClass(c)}>
                                    {c.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {shippedEntries.map(([pk, po], idx) => {
                                const st  = calcPoStatus(po.lines);
                                const oQ  = po.lines.reduce((s, r) => s + (r.orderQty     || 0), 0);
                                const sQ  = po.lines.reduce((s, r) => s + (r.shippedQty   || 0), 0);
                                const bQ  = po.lines.reduce((s, r) => s + (r.balanceQty   || 0), 0);
                                const oV  = po.lines.reduce((s, r) => s + (r.orderValue   || 0), 0);
                                const sV  = po.lines.reduce((s, r) => s + (r.shippedValue || 0), 0);
                                const bV  = po.lines.reduce((s, r) => s + (r.balanceValue || 0), 0);
                                const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";
                                const { amt: commAmt } = computeSinglePoComm(po, sV, getCommPct);
                                const shpDateLabel = formatPoShpDateLabel(po.lines);

                                return (
                                  <tr key={pk} className={`${rowBg} border-b border-gray-100 hover:bg-green-50 transition-colors`}>
                                    <td className="px-3 py-2 border-r border-gray-100 whitespace-nowrap min-w-[160px]">
                                      <span className="inline-flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-slate-700 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                          {po.customer?.slice(0, 2).toUpperCase() || "?"}
                                        </span>
                                        <span className="text-xs text-black font-medium">{po.customer || "—"}</span>
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 border-r border-gray-100 text-xs text-black whitespace-nowrap min-w-[150px]">{po.vendor || "—"}</td>
                                    <td className="px-3 py-2 border-r border-gray-100 whitespace-nowrap min-w-[110px]">
                                      <span className="font-mono font-bold text-black text-xs">{po.poNo || "—"}</span>
                                    </td>
                                    <td className="px-3 py-2 border-r border-gray-100 text-right text-xs text-black min-w-[55px]">{po.lines.length}</td>
                                    <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs text-black min-w-[80px]">{fmt(oQ)}</td>
                                    <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs text-black min-w-[80px]">{fmt(sQ)}</td>
                                    <td className={`px-3 py-2 border-r border-gray-100 text-right font-mono text-xs min-w-[80px] ${bQ ? "text-green-600" : "text-black"}`}>{fmt(bQ)}</td>
                                    <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs font-semibold text-blue-600 min-w-[110px]">{fmt(oV, true)}</td>
                                    <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs font-semibold text-green-600 min-w-[110px]">{fmt(sV, true)}</td>
                                    <td className="px-3 py-2 border-r border-gray-100 text-xs text-black whitespace-nowrap min-w-[100px]">{shpDateLabel}</td>
                                    <td className={`px-3 py-2 border-r border-gray-100 text-right font-mono text-xs font-semibold min-w-[110px] ${bV ? "text-amber-600" : "text-black"}`}>{fmt(bV, true)}</td>
                                    {plMode === "overall" ? (
                                      <OverallCommissionCells
                                        po={po}
                                        baseValue={sV}
                                        getJnmCommPct={getJnmCommPct}
                                        getJngCommPct={getJngCommPct}
                                        commissionMap={commissionMap}
                                        onSave={handleSaveCommission}
                                        readOnly={commReadOnly}
                                      />
                                    ) : (
                                      <>
                                        <td className="px-3 py-2 border-r border-gray-100 min-w-[110px]">
                                          <CommissionCell
                                            poNo={po.poNo}
                                            initialValue={plMode === "jng"
                                              ? (getJngCommPct(po.poNo, po.vendor, po.customer) ?? "")
                                              : (commissionMap[po.poNo] ?? (getJnmCommPct(po.poNo, po.vendor, po.customer) ?? ""))}
                                            onSave={handleSaveCommission}
                                            readOnly={commReadOnly || plMode === "jng"}
                                          />
                                        </td>
                                        <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs min-w-[110px]">
                                          {commAmt != null
                                            ? <span className="font-semibold text-indigo-600">{fmtCommUsd(commAmt)}</span>
                                            : <span className="text-black">—</span>}
                                        </td>
                                      </>
                                    )}
                                    <td className="px-3 py-2 whitespace-nowrap min-w-[90px]">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${st.cls}`}>
                                        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: st.dot }} />{st.label}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                              {/* Shipped totals */}
                              <tr className="bg-gray-900 border-t-2 border-gray-700">
                                <td colSpan={3} className="px-3 py-2 text-[11px] font-bold text-black uppercase tracking-wider">Shipped Total</td>
                                <td className="px-3 py-2 text-right font-mono text-xs font-bold text-black">{shippedEntries.reduce((s, [, p]) => s + p.lines.length, 0)}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs font-bold text-white">{fmt(shippedEntries.reduce((s,[,p])=>s+p.lines.reduce((ss,r)=>ss+(r.orderQty||0),0),0))}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs font-bold text-white">{fmt(shippedEntries.reduce((s,[,p])=>s+p.lines.reduce((ss,r)=>ss+(r.shippedQty||0),0),0))}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs font-bold text-white">{fmt(shippedEntries.reduce((s,[,p])=>s+p.lines.reduce((ss,r)=>ss+(r.balanceQty||0),0),0))}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs font-bold text-blue-300">{fmt(wkSOV, true)}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs font-bold text-green-300">{fmt(wkSSV, true)}</td>
                                <td />
                                <td className="px-3 py-2 text-right font-mono text-xs font-bold text-amber-300">{fmt(wkSBV, true)}</td>
                                {plMode === "overall" ? (
                                  <>
                                    <td />
                                    <td />
                                    <td className="px-3 py-2 text-right font-mono text-xs font-bold text-violet-300">
                                      {wkJnmSComm > 0 ? fmt(wkJnmSComm, true) : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-xs font-bold text-violet-300">
                                      {wkJngSComm > 0 ? fmt(wkJngSComm, true) : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-xs font-bold text-violet-300">
                                      {shipComm.jnm + shipComm.jng > 0 ? fmt(shipComm.jnm + shipComm.jng, true) : "—"}
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td />
                                    <td className="px-3 py-2 text-right font-mono text-xs font-bold text-violet-300">
                                      {wkSComm > 0 ? fmt(wkSComm, true) : "—"}
                                    </td>
                                  </>
                                )}
                                <td />
                              </tr>
                            </tbody>
                          </table>
                        </PlTableScrollWrap>
                        <div className="lg:hidden divide-y divide-gray-100">
                          {shippedEntries.map(([pk, po], idx) => (
                            <ShippedPoMobileCard
                              key={pk}
                              po={po}
                              idx={idx}
                              plMode={plMode}
                              getCommPct={getCommPct}
                              getJnmCommPct={getJnmCommPct}
                              getJngCommPct={getJngCommPct}
                              commissionMap={commissionMap}
                              onSave={handleSaveCommission}
                              readOnly={commReadOnly}
                              fmt={fmt}
                              fmtCommUsd={fmtCommUsd}
                              computeSinglePoComm={computeSinglePoComm}
                              computeOverallPoComm={computeOverallPoComm}
                              formatPoShpDateLabel={formatPoShpDateLabel}
                              calcPoStatus={calcPoStatus}
                            />
                          ))}
                        </div>
                        <MobilePoTotals
                          variant="shipped"
                          plMode={plMode}
                          fmt={fmt}
                          totals={[
                            { label: "SKUs", value: shippedEntries.reduce((s, [, p]) => s + p.lines.length, 0) },
                            { label: "Ord Qty", value: fmt(shippedEntries.reduce((s, [, p]) => s + p.lines.reduce((ss, r) => ss + (r.orderQty || 0), 0), 0)) },
                            { label: "Shp Qty", value: fmt(shippedEntries.reduce((s, [, p]) => s + p.lines.reduce((ss, r) => ss + (r.shippedQty || 0), 0), 0)) },
                            { label: "Bal Qty", value: fmt(shippedEntries.reduce((s, [, p]) => s + p.lines.reduce((ss, r) => ss + (r.balanceQty || 0), 0), 0)) },
                            { label: "Order Val", value: fmt(wkSOV, true), className: "text-blue-300" },
                            { label: "Shipped $", value: fmt(wkSSV, true), className: "text-green-300" },
                            { label: "Balance $", value: fmt(wkSBV, true), className: "text-amber-300" },
                            ...(plMode === "overall"
                              ? [
                                  { label: "JNM Comm", value: wkJnmSComm > 0 ? fmt(wkJnmSComm, true) : "—", className: "text-violet-300" },
                                  { label: "TWIF Comm", value: wkJngSComm > 0 ? fmt(wkJngSComm, true) : "—", className: "text-violet-300" },
                                  { label: "Overall", value: shipComm.jnm + shipComm.jng > 0 ? fmt(shipComm.jnm + shipComm.jng, true) : "—", className: "text-violet-300" },
                                ]
                              : [{ label: "Commission", value: wkSComm > 0 ? fmt(wkSComm, true) : "—", className: "text-violet-300" }]),
                          ]}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* P&L Monthly Modal */}
      {plModalData && (
        <PlMonthlyModal
          monthKey={plModalData.monthKey}
          fyYear={year}
          monthLabel={plModalData.monthLabel}
          salesGlobal={plModalData.salesGlobal}
          incomeFromSales={plModalData.incomeFromSales}
          flatFeeCommission={plModalData.flatFeeCommission ?? 0}
          showChehomaDetail={canSeeChehomaBreakdown}
          initialExpenses={getInitialExpensesForModal(plModalData.monthKey, plMode)}
          onSave={handlePlSave}
          onClose={() => setPlModalData(null)}
        />
      )}
    </div>
  );
}
