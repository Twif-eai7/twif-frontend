import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";
import { useJnmPlAccess } from "../../hooks/useJnmPlAccess";
import { usePersistedPlFilter } from "../../hooks/usePersistedPlFilter";
import { useMerchantPoBuyersAccess, buildPoSummaryParams } from "../../hooks/useMerchantPoBuyersAccess";
import ExportExcelButton from "../ui/ExportExcelButton";
import ExportPdfButton from "../ui/ExportPdfButton";
import PrintButton from "../ui/PrintButton";
import PlModeToggle from "./PlModeToggle";
import MisViewToggle from "./MisViewToggle";
import MisBuyerWise from "./MisBuyerWise";
import MisDivision from "./MisDivision";
import { printElement } from "../../utils/printPage";
import { downloadSummaryPdf } from "../../utils/pdfExport";
import {
  MONTH_NAMES,
  normStr,
  roundComm,
  computePeriodSummary,
  getMonthWeekRange,
  buildMonthWeeks,
} from "../../utils/plDataHelpers";

const API_BASE = import.meta.env.VITE_BACKEND_URL;

const EXPENSE_FIELDS = [
  { key: "salary", column: "salary_employees", label: "Salary to Employees" },
  { key: "travelDom", column: "travel_domestic", label: "Travelling Expense (Domestic)" },
  { key: "travelIntl", column: "travel_international", label: "Travelling Expense (International)" },
  { key: "rent", column: "rent", label: "Rent" },
  { key: "electricity", column: "electricity_others", label: "Electricity & Others" },
];

const fmtPct = (n) =>
  n == null || n === "" || isNaN(n) ? "" : `${Number(n).toFixed(2)}%`;

const MODE_LABELS = { jng: "P&L Twif", jnm: "P&L JNM", overall: "Overall P&L" };

function fyMonthRows(fyShort) {
  const startYear = 2000 + parseInt(fyShort, 10) - 1;
  return Array.from({ length: 12 }, (_, i) => {
    const month = (3 + i) % 12;
    const calYear = i < 9 ? startYear : startYear + 1;
    const key = `${calYear}-${String(month + 1).padStart(2, "0")}`;
    return { key, label: `${MONTH_NAMES[month]} ${calYear}` };
  });
}

function weeksInMonth(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return Math.ceil(lastDay / 7);
}

function emptyExpenseRow() {
  const row = {};
  EXPENSE_FIELDS.forEach((f) => {
    row[`${f.key}_planned`] = "";
    row[`${f.key}_actual`] = "";
  });
  return row;
}

function WeeklyExpenseModal({ monthKey, weekNumber, weekLabel, fyYear, plMode, initial, showInr, inrRate, onSave, onClose }) {
  const rate = parseFloat(inrRate) || 1;
  const sym = showInr ? "₹" : "$";
  const toDisplay = (v) => {
    if (v === "" || v == null) return "";
    const n = Number(v);
    return isNaN(n) ? "" : (showInr ? roundComm(n * rate) : n);
  };
  const toBase = (v) => {
    if (v === "" || v == null) return null;
    const n = Number(v);
    if (isNaN(n)) return null;
    return showInr ? roundComm(n / rate) : n;
  };

  const [fields, setFields] = useState(() => {
    const merged = { ...emptyExpenseRow(), ...initial };
    const display = {};
    Object.keys(merged).forEach((k) => { display[k] = toDisplay(merged[k]); });
    return display;
  });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const setField = (field, raw) => {
    setFields((p) => ({ ...p, [field]: raw === "" ? "" : parseFloat(raw) || 0 }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveErr(null);
    try {
      const row = {
        month_key: monthKey,
        week_number: weekNumber,
        fy_year: fyYear,
        pl_mode: plMode,
        updated_at: new Date().toISOString(),
      };
      EXPENSE_FIELDS.forEach((f) => {
        row[`${f.column}_planned`] = toBase(fields[`${f.key}_planned`]);
        row[`${f.column}_actual`] = toBase(fields[`${f.key}_actual`]);
      });
      await onSave(row);
      setSaved(true);
      setTimeout(() => onClose(), 700);
    } catch (e) {
      setSaveErr(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const inp = (field) => (
    <div className="inline-flex items-center gap-1 justify-end">
      <span className="text-xs font-mono text-black/50">{sym}</span>
      <input
        type="number" min="0" step="0.01"
        value={fields[field] ?? ""}
        onChange={(e) => setField(field, e.target.value)}
        placeholder="0.00"
        className="w-24 px-2 py-1 border border-gray-300 rounded text-xs font-mono text-right focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-black">Edit Expenses — {weekLabel}</div>
            <div className="text-xs text-black/50 mt-0.5">{MODE_LABELS[plMode]}</div>
          </div>
          <button onClick={onClose} className="text-black/40 hover:text-black text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-black/50">
            <span />
            <span className="text-center w-28">Planned</span>
            <span className="text-center w-28">Actual</span>
          </div>
          {EXPENSE_FIELDS.map((f) => (
            <div key={f.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
              <span className="text-xs text-black">{f.label}</span>
              {inp(`${f.key}_planned`)}
              {inp(`${f.key}_actual`)}
            </div>
          ))}
        </div>
        {saveErr && <div className="px-5 text-xs text-red-500 pb-2">{saveErr}</div>}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-semibold rounded-md border border-gray-300 text-black hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md text-white ${saved ? "bg-green-600" : "bg-indigo-600 hover:bg-indigo-700"} disabled:opacity-60`}
          >
            {saved ? "Saved" : saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ExpensesSummary({ availableYears = ["26", "27"], defaultYear = "27" }) {
  const hasJnmPlAccess = useJnmPlAccess();
  const printRef = useRef(null);
  const [year, setYear] = usePersistedPlFilter("expenses-summary", "year", defaultYear);
  const [plMode, setPlMode] = usePersistedPlFilter("expenses-summary", "plMode", "jng");
  const [misView, setMisView] = usePersistedPlFilter("expenses-summary", "misView", "summary");
  const months = useMemo(() => fyMonthRows(year), [year]);
  const [rows, setRows] = useState([]);
  const [openRows, setOpenRows] = useState([]);
  const [commissionMap, setCommissionMap] = useState({});
  const [rateMap, setRateMap] = useState({});
  const [buyerRateMap, setBuyerRateMap] = useState({});
  const [expenseRowsByMonth, setExpenseRowsByMonth] = useState({});
  const [expenseError, setExpenseError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingWeek, setEditingWeek] = useState(null);
  const [showInr, setShowInr] = usePersistedPlFilter("expenses-summary", "showInr", false);
  const [inrRate, setInrRate] = usePersistedPlFilter("expenses-summary", "inrRate", 83);
  const buyersAccess = useMerchantPoBuyersAccess();

  const fmtCurrency = useCallback((n) => {
    if (n == null || n === "" || isNaN(n)) return "";
    const rate = parseFloat(inrRate) || 0;
    const v = showInr ? Number(n) * rate : Number(n);
    const sym = showInr ? "₹" : "$";
    return `${sym}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [showInr, inrRate]);

  useEffect(() => {
    if (!hasJnmPlAccess && (plMode === "jnm" || plMode === "overall")) setPlMode("jng");
  }, [hasJnmPlAccess, plMode]);

  useEffect(() => {
    if (!hasJnmPlAccess || !buyersAccess.ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    if (!buyersAccess.isUnrestricted && buyersAccess.buyersParam === "") {
      setRows([]);
      setOpenRows([]);
      setLoading(false);
      return () => { cancelled = true; };
    }

    const load = async () => {
      const session = useAuthStore.getState().session;
      const p = buildPoSummaryParams(year, buyersAccess);
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [shipRes, openRes] = await Promise.all([
        fetch(`${API_BASE}/dashboard/shipped-po-summary?${p}`, { credentials: "include", headers }),
        fetch(`${API_BASE}/dashboard/open-po-summary?${p}`, { credentials: "include", headers }),
      ]);
      const [shipJson, openJson] = await Promise.all([shipRes.json(), openRes.json()]);
      if (!shipJson.success) throw new Error(shipJson.error || "Failed to load shipped POs");
      if (!openJson.success) throw new Error(openJson.error || "Failed to load open POs");
      if (!cancelled) {
        setRows(shipJson.data?.rows ?? []);
        setOpenRows(openJson.data?.rows ?? []);
      }
    };

    load().catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, hasJnmPlAccess, buyersAccess.ready, buyersAccess.isUnrestricted, buyersAccess.buyersParam]);

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

  useEffect(() => {
    if (!hasJnmPlAccess) return;
    let cancelled = false;
    setExpenseError(null);
    supabase
      .from("pl_weekly_expenses")
      .select("*")
      .in("month_key", months.map((m) => m.key))
      .eq("pl_mode", plMode)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setExpenseError(err.message);
          setExpenseRowsByMonth({});
          return;
        }
        const map = {};
        (data || []).forEach((r) => {
          if (!map[r.month_key]) map[r.month_key] = {};
          map[r.month_key][r.week_number] = r;
        });
        setExpenseRowsByMonth(map);
      });
    return () => { cancelled = true; };
  }, [months, plMode, hasJnmPlAccess]);

  const getJngCommPct = useCallback((_poNo, _vendor, customer) => {
    const entry = buyerRateMap[normStr(customer)];
    if (!entry || entry.pct === 0 || entry.remarks === "MONTHLY") return null;
    return parseFloat(entry.pct);
  }, [buyerRateMap]);

  const getJnmCommPct = useCallback((poNo, vendor, customer) => {
    const manual = commissionMap[poNo];
    if (manual != null && manual !== "") return parseFloat(manual);
    const auto = rateMap[`${normStr(vendor)}||${normStr(customer)}`];
    return auto != null ? parseFloat(auto) : null;
  }, [commissionMap, rateMap]);

  const getCommPct = useCallback((poNo, vendor, customer) => {
    if (plMode === "jng") return getJngCommPct(poNo, vendor, customer);
    return getJnmCommPct(poNo, vendor, customer);
  }, [plMode, getJngCommPct, getJnmCommPct]);

  const today = useMemo(() => new Date(), []);

  const buildWeeksForMonth = useCallback((monthKey, expenseRows) => {
    const weekCount = weeksInMonth(monthKey);
    const periods = buildMonthWeeks(rows, openRows, monthKey);
    const periodMap = {};
    periods.forEach((p) => { periodMap[p.key] = p; });

    return Array.from({ length: weekCount }, (_, i) => {
      const weekNumber = i + 1;
      const key = `${monthKey}-W${weekNumber}`;
      const range = getMonthWeekRange(monthKey, weekNumber);
      const period = periodMap[key] || { key, week: weekNumber, monthKey, ...range, shippedPos: {}, openPos: {} };
      const summary = computePeriodSummary(period, {
        getCommPct: plMode !== "overall" ? getCommPct : undefined,
        getJngCommPct,
        getJnmCommPct,
        buyerRateMap,
        plMode,
        isMonth: false,
      });

      const plannedSales = summary.projPoValue || 0;
      const actualSales = summary.shipShipped || 0;
      const plannedIncome = roundComm(plMode === "overall" ? (summary.overallProjComm || 0) : (summary.projComm || 0));
      const actualIncome = roundComm(summary.shipComm || 0);

      const expenseRow = expenseRows[weekNumber] || {};
      let plannedExpenses = 0;
      let actualExpenses = 0;
      const expenseFieldValues = {};
      EXPENSE_FIELDS.forEach((f) => {
        const planned = Number(expenseRow[`${f.column}_planned`]) || 0;
        const actual = Number(expenseRow[`${f.column}_actual`]) || 0;
        plannedExpenses += planned;
        actualExpenses += actual;
        expenseFieldValues[f.key] = { planned, actual };
      });
      plannedExpenses = roundComm(plannedExpenses);
      actualExpenses = roundComm(actualExpenses);

      const plannedEbidta = roundComm(plannedIncome - plannedExpenses);
      const actualEbidta = roundComm(actualIncome - actualExpenses);

      return {
        weekNumber,
        label: `Week-${weekNumber}`,
        range,
        planned: {
          salesGlobal: plannedSales,
          income: plannedIncome,
          incomePctSales: plannedSales > 0 ? (plannedIncome / plannedSales) * 100 : null,
          expenses: expenseFieldValues,
          totalExpenses: plannedExpenses,
          totalPctIncome: plannedIncome > 0 ? (plannedExpenses / plannedIncome) * 100 : null,
          ebidta: plannedEbidta,
          ebidtaPctIncome: plannedIncome > 0 ? (plannedEbidta / plannedIncome) * 100 : null,
        },
        actual: {
          salesGlobal: actualSales,
          income: actualIncome,
          incomePctSales: actualSales > 0 ? (actualIncome / actualSales) * 100 : null,
          expenses: expenseFieldValues,
          totalExpenses: actualExpenses,
          ebidta: actualEbidta,
        },
      };
    });
  }, [rows, openRows, plMode, getCommPct, getJngCommPct, getJnmCommPct, buyerRateMap]);

  const computeMtdTotal = useCallback((weeks) => {
    const sum = (fn) => roundComm(weeks.reduce((s, w) => s + (fn(w) || 0), 0));
    const sumMtd = (fn) => roundComm(weeks.filter((w) => w.range.start <= today).reduce((s, w) => s + (fn(w) || 0), 0));
    const totals = {
      salesGlobal: { mtd: sumMtd((w) => w.planned.salesGlobal), total: sum((w) => w.planned.salesGlobal) },
      income: { mtd: sumMtd((w) => w.planned.income), total: sum((w) => w.planned.income) },
      totalExpenses: { mtd: sumMtd((w) => w.planned.totalExpenses), total: sum((w) => w.planned.totalExpenses) },
      ebidta: { mtd: sumMtd((w) => w.planned.ebidta), total: sum((w) => w.planned.ebidta) },
    };
    EXPENSE_FIELDS.forEach((f) => {
      totals[f.key] = {
        mtd: sumMtd((w) => w.planned.expenses[f.key]?.planned),
        total: sum((w) => w.planned.expenses[f.key]?.planned),
      };
    });
    return totals;
  }, [today]);

  const computeActualTotal = useCallback((weeks) => {
    const sum = (fn) => roundComm(weeks.reduce((s, w) => s + (fn(w) || 0), 0));
    const totals = {
      salesGlobal: sum((w) => w.actual.salesGlobal),
      income: sum((w) => w.actual.income),
      totalExpenses: sum((w) => w.actual.totalExpenses),
      ebidta: sum((w) => w.actual.ebidta),
    };
    EXPENSE_FIELDS.forEach((f) => {
      totals[f.key] = sum((w) => w.actual.expenses[f.key]?.actual);
    });
    totals.incomePctSales = totals.salesGlobal > 0 ? (totals.income / totals.salesGlobal) * 100 : null;
    return totals;
  }, []);

  const monthsData = useMemo(() => {
    return months.map((m) => {
      const weeks = buildWeeksForMonth(m.key, expenseRowsByMonth[m.key] || {});
      const plannedMtdTotal = computeMtdTotal(weeks);
      const actualTotal = computeActualTotal(weeks);
      const hasAnyData = weeks.some((w) => w.planned.salesGlobal || w.actual.salesGlobal || w.planned.totalExpenses || w.actual.totalExpenses);
      return { key: m.key, label: m.label, weeks, plannedMtdTotal, actualTotal, hasAnyData };
    });
  }, [months, expenseRowsByMonth, buildWeeksForMonth, computeMtdTotal, computeActualTotal]);

  const hasAnyData = monthsData.some((m) => m.hasAnyData);

  const fyLabel = `FY 20${year}`;
  const modeSubtitle = `${MODE_LABELS[plMode]} — weekly Planned vs Actual`;

  const handleSaveExpense = useCallback(async (row) => {
    const { error: err } = await supabase
      .from("pl_weekly_expenses")
      .upsert(row, { onConflict: "month_key,week_number,pl_mode" });
    if (err) throw err;
    setExpenseRowsByMonth((prev) => ({
      ...prev,
      [row.month_key]: { ...(prev[row.month_key] || {}), [row.week_number]: row },
    }));
  }, []);

  const moneyCell = useCallback((n) => {
    if (n == null || n === "" || isNaN(n)) return null;
    if (!showInr) return Number(n);
    const rate = parseFloat(inrRate) || 0;
    return `₹${(Number(n) * rate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [showInr, inrRate]);

  const buildExportRows = useCallback(() => {
    const headerRow1 = ["Division", "Details"];
    const headerRow2 = ["", ""];
    monthsData.forEach(({ weeks }) => {
      headerRow1.push(...Array(weeks.length + 2).fill("Planned"), ...Array(weeks.length + 1).fill("Actual"));
      headerRow2.push(...weeks.map((w) => w.label), "MTD", "Total", ...weeks.map((w) => w.label), "Total");
    });

    const monthCells = (division, label, planFn) => {
      const row = [division, label];
      monthsData.forEach(({ weeks, plannedMtdTotal, actualTotal }) => {
        row.push(...planFn(weeks, plannedMtdTotal, actualTotal));
      });
      return row;
    };

    const dataRows = [
      monthCells("Global", "Sales Global", (weeks, plannedMtdTotal, actualTotal) => [
        ...weeks.map((w) => moneyCell(w.planned.salesGlobal)), moneyCell(plannedMtdTotal.salesGlobal.mtd), moneyCell(plannedMtdTotal.salesGlobal.total),
        ...weeks.map((w) => moneyCell(w.actual.salesGlobal)), moneyCell(actualTotal.salesGlobal),
      ]),
      monthCells("Global", "Income from above Sales", (weeks, plannedMtdTotal, actualTotal) => [
        ...weeks.map((w) => moneyCell(w.planned.income)), moneyCell(plannedMtdTotal.income.mtd), moneyCell(plannedMtdTotal.income.total),
        ...weeks.map((w) => moneyCell(w.actual.income)), moneyCell(actualTotal.income),
      ]),
      monthCells("Global", "Income % to Sales", (weeks, plannedMtdTotal, actualTotal) => [
        ...weeks.map((w) => w.planned.incomePctSales != null ? Number(w.planned.incomePctSales.toFixed(2)) : null), null, null,
        ...weeks.map((w) => w.actual.incomePctSales != null ? Number(w.actual.incomePctSales.toFixed(2)) : null),
        actualTotal.incomePctSales != null ? Number(actualTotal.incomePctSales.toFixed(2)) : null,
      ]),
      ...EXPENSE_FIELDS.map((f) => monthCells("Global", f.label, (weeks, plannedMtdTotal, actualTotal) => [
        ...weeks.map((w) => moneyCell(w.planned.expenses[f.key]?.planned)),
        moneyCell(plannedMtdTotal[f.key].mtd), moneyCell(plannedMtdTotal[f.key].total),
        ...weeks.map((w) => moneyCell(w.actual.expenses[f.key]?.actual)),
        moneyCell(actualTotal[f.key]),
      ])),
      monthCells("Global", "Total Expenses", (weeks, plannedMtdTotal, actualTotal) => [
        ...weeks.map((w) => moneyCell(w.planned.totalExpenses)), moneyCell(plannedMtdTotal.totalExpenses.mtd), moneyCell(plannedMtdTotal.totalExpenses.total),
        ...weeks.map((w) => moneyCell(w.actual.totalExpenses)), moneyCell(actualTotal.totalExpenses),
      ]),
      monthCells("", "EBIDTA", (weeks, plannedMtdTotal, actualTotal) => [
        ...weeks.map((w) => moneyCell(w.planned.ebidta)), moneyCell(plannedMtdTotal.ebidta.mtd), moneyCell(plannedMtdTotal.ebidta.total),
        ...weeks.map((w) => moneyCell(w.actual.ebidta)), moneyCell(actualTotal.ebidta),
      ]),
    ];
    return [headerRow1, headerRow2, ...dataRows];
  }, [monthsData, moneyCell]);

  const handleExport = useCallback(() => {
    if (!hasAnyData) return;

    const HEADER_STYLE = {
      fill: { patternType: "solid", fgColor: { rgb: "C7D2FE" } },
      font: { bold: true, color: { rgb: "1E1B4B" }, sz: 10 },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    };
    const TITLE_STYLE = { font: { bold: true, sz: 11 } };
    const LABEL_STYLE = { font: { sz: 10 }, alignment: { horizontal: "left" } };
    const LABEL_BLANK_STYLE = { font: { sz: 10, color: { rgb: "9CA3AF" } }, alignment: { horizontal: "left" } };
    const TOTAL_STYLE = { fill: { patternType: "solid", fgColor: { rgb: "F3F4F6" } }, font: { bold: true, sz: 10 } };
    const EBIDTA_STYLE = { fill: { patternType: "solid", fgColor: { rgb: "EEF2FF" } }, font: { bold: true, color: { rgb: "3730A3" }, sz: 10 } };
    const VAL_STYLE = { font: { sz: 10 }, alignment: { horizontal: "right" } };

    const monthColCounts = monthsData.map(({ weeks }) => ({ plannedCols: weeks.length + 2, actualCols: weeks.length + 1 }));
    const totalDataCols = monthColCounts.reduce((s, m) => s + m.plannedCols + m.actualCols, 0);
    const totalCols = 2 + totalDataCols;

    const rows = [];
    const styles = [];
    const setCell = (r, c, v, style) => {
      if (!rows[r]) rows[r] = [];
      rows[r][c] = v;
      if (style) styles.push({ r, c, style });
    };

    setCell(0, 0, showInr ? `1 $ = ${parseFloat(inrRate) || 0} Rs` : "US Dollar", TITLE_STYLE);

    let mc = 2;
    monthsData.forEach(({ label, weeks }, mi) => {
      const { plannedCols, actualCols } = monthColCounts[mi];
      for (let c = mc; c < mc + plannedCols + actualCols; c++) setCell(1, c, label, HEADER_STYLE);
      for (let c = mc; c < mc + plannedCols; c++) setCell(2, c, "Planned", HEADER_STYLE);
      for (let c = mc + plannedCols; c < mc + plannedCols + actualCols; c++) setCell(2, c, "Actual", HEADER_STYLE);
      weeks.forEach((w) => setCell(3, mc++, w.label, HEADER_STYLE));
      setCell(3, mc++, "MTD", HEADER_STYLE);
      setCell(3, mc++, "Total", HEADER_STYLE);
      weeks.forEach((w) => setCell(3, mc++, w.label, HEADER_STYLE));
      setCell(3, mc++, "Total", HEADER_STYLE);
    });

    setCell(3, 0, "Division", HEADER_STYLE);
    setCell(3, 1, "Details", HEADER_STYLE);

    let r = 4;
    const fmtPctCell = (v) => (v != null ? `${Number(v).toFixed(2)}%` : null);
    const moneyRow = (division, label, plannedWeekFn, mtdFn, totalFn, actualWeekFn, actualTotFn, style) => {
      setCell(r, 0, division, style || LABEL_STYLE);
      setCell(r, 1, label, style || LABEL_STYLE);
      let c = 2;
      monthsData.forEach(({ weeks, plannedMtdTotal, actualTotal }) => {
        weeks.forEach((w) => setCell(r, c++, moneyCell(plannedWeekFn(w)), style || VAL_STYLE));
        setCell(r, c++, moneyCell(mtdFn(plannedMtdTotal)), style || VAL_STYLE);
        setCell(r, c++, moneyCell(totalFn(plannedMtdTotal)), style || VAL_STYLE);
        weeks.forEach((w) => setCell(r, c++, moneyCell(actualWeekFn(w)), style || VAL_STYLE));
        setCell(r, c++, moneyCell(actualTotFn(actualTotal)), style || VAL_STYLE);
      });
      r++;
    };
    const pctRow = (division, label, plannedWeekFn, mtdFn, totalFn, actualWeekFn, actualTotFn, style) => {
      setCell(r, 0, division, style || LABEL_STYLE);
      setCell(r, 1, label, style || LABEL_STYLE);
      let c = 2;
      monthsData.forEach(({ weeks, plannedMtdTotal, actualTotal }) => {
        weeks.forEach((w) => setCell(r, c++, fmtPctCell(plannedWeekFn(w)), style || VAL_STYLE));
        setCell(r, c++, fmtPctCell(mtdFn(plannedMtdTotal)), style || VAL_STYLE);
        setCell(r, c++, fmtPctCell(totalFn(plannedMtdTotal)), style || VAL_STYLE);
        weeks.forEach((w) => setCell(r, c++, fmtPctCell(actualWeekFn(w)), style || VAL_STYLE));
        setCell(r, c++, fmtPctCell(actualTotFn(actualTotal)), style || VAL_STYLE);
      });
      r++;
    };
    const blankRow = (division, label) => {
      setCell(r, 0, division, LABEL_BLANK_STYLE);
      setCell(r, 1, label, LABEL_BLANK_STYLE);
      let c = 2;
      for (let i = 0; i < totalDataCols; i++) setCell(r, c++, null, VAL_STYLE);
      r++;
    };

    moneyRow("Global", "Sales Global", (w) => w.planned.salesGlobal, (t) => t.salesGlobal.mtd, (t) => t.salesGlobal.total, (w) => w.actual.salesGlobal, (t) => t.salesGlobal);
    blankRow("Global", "Backlog Projected");
    blankRow("Global", "Total Sales Global");
    moneyRow("Global", "Income from above Sales", (w) => w.planned.income, (t) => t.income.mtd, (t) => t.income.total, (w) => w.actual.income, (t) => t.income);
    blankRow("Global", "Income from Backlog Projected");
    blankRow("Global", "Total Income");
    pctRow(
      "Global", "Income % to Sales",
      (w) => w.planned.incomePctSales,
      (t) => t.salesGlobal.mtd > 0 ? (t.income.mtd / t.salesGlobal.mtd) * 100 : null,
      (t) => t.salesGlobal.total > 0 ? (t.income.total / t.salesGlobal.total) * 100 : null,
      (w) => w.actual.incomePctSales, (t) => t.incomePctSales,
    );
    blankRow("Global", "On Time Shipment % Cumulative");
    EXPENSE_FIELDS.forEach((f) => {
      moneyRow("Global", f.label, (w) => w.planned.expenses[f.key]?.planned, (t) => t[f.key].mtd, (t) => t[f.key].total, (w) => w.actual.expenses[f.key]?.actual, (t) => t[f.key]);
    });
    moneyRow("Global", "Total Expenses", (w) => w.planned.totalExpenses, (t) => t.totalExpenses.mtd, (t) => t.totalExpenses.total, (w) => w.actual.totalExpenses, (t) => t.totalExpenses, TOTAL_STYLE);
    pctRow(
      "Global", "Total % to sales",
      (w) => w.planned.totalPctIncome,
      (t) => t.income.mtd > 0 ? (t.totalExpenses.mtd / t.income.mtd) * 100 : null,
      (t) => t.income.total > 0 ? (t.totalExpenses.total / t.income.total) * 100 : null,
      () => null, (t) => t.income > 0 ? (t.totalExpenses / t.income) * 100 : null, TOTAL_STYLE,
    );
    moneyRow("", "EBIDTA", (w) => w.planned.ebidta, (t) => t.ebidta.mtd, (t) => t.ebidta.total, (w) => w.actual.ebidta, (t) => t.ebidta, EBIDTA_STYLE);
    pctRow(
      "", "% to sales",
      (w) => w.planned.ebidtaPctIncome,
      (t) => t.income.mtd > 0 ? (t.ebidta.mtd / t.income.mtd) * 100 : null,
      (t) => t.income.total > 0 ? (t.ebidta.total / t.income.total) * 100 : null,
      () => null, (t) => t.income > 0 ? (t.ebidta / t.income) * 100 : null, EBIDTA_STYLE,
    );

    const ws = XLSX.utils.aoa_to_sheet(rows);
    styles.forEach(({ r: ri, c: ci, style }) => {
      const addr = XLSX.utils.encode_cell({ r: ri, c: ci });
      if (!ws[addr]) ws[addr] = { v: "", t: "s" };
      ws[addr].s = style;
    });
    ws["!cols"] = [{ wch: 12 }, { wch: 26 }, ...Array(totalDataCols).fill({ wch: 14 })];
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Summary");
    const modeSlug = plMode === "overall" ? "Overall" : plMode === "jnm" ? "JNM" : "Twif";
    const currSlug = showInr ? "INR" : "USD";
    XLSX.writeFile(wb, `Expenses_Summary_${modeSlug}_${currSlug}_FY${year}.xlsx`);
  }, [hasAnyData, monthsData, moneyCell, plMode, year, showInr, inrRate]);

  const handleExportPdf = useCallback(() => {
    if (!hasAnyData) return;
    const modeSlug = plMode === "overall" ? "Overall" : plMode === "jnm" ? "JNM" : "Twif";
    const [, headerRow2, ...dataRows] = buildExportRows();
    const currSlug = showInr ? "INR" : "USD";
    downloadSummaryPdf({
      headers: headerRow2,
      dataRows,
      title: "Expenses Summary",
      subtitle: `${modeSubtitle} · ${fyLabel}`,
      filename: `Expenses_Summary_${modeSlug}_${currSlug}_FY${year}.pdf`,
    });
  }, [buildExportRows, hasAnyData, plMode, year, modeSubtitle, fyLabel, showInr]);

  const handlePrint = useCallback(() => {
    if (printRef.current) printElement(printRef.current, { title: "Expenses Summary", subtitle: `${modeSubtitle} · ${fyLabel}` });
  }, [modeSubtitle, fyLabel]);

  if (!hasJnmPlAccess) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-28 bg-gray-50 min-h-full">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 border border-gray-200">
          <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-700">Access Restricted</p>
          <p className="text-xs text-gray-400 mt-1">You don&apos;t have permission to view Summary</p>
        </div>
      </div>
    );
  }

  const thBase = "z-[3] px-2.5 py-2 text-[10px] font-bold text-black whitespace-nowrap border-r border-b border-gray-400 last:border-r-0 text-center";
  const THEAD_ROW_H = 29;
  const th1 = `${thBase} sticky top-0`;
  const th2 = `${thBase} sticky`;
  const th3 = `${thBase} sticky`;
  const th2Style = { top: THEAD_ROW_H };
  const th3Style = { top: THEAD_ROW_H * 2 };
  const MONTH_HEADER_BG = ["bg-blue-100", "bg-sky-50"];
  const monthBg = (idx) => MONTH_HEADER_BG[idx % MONTH_HEADER_BG.length];
  const td = "px-2.5 py-1.5 border-r border-gray-300 text-right font-mono text-xs whitespace-nowrap";
  const DIVISION_W = 96;
  const divCell = (bg, extra = "") => `${td} text-left sticky left-0 z-[2] min-w-[96px] max-w-[96px] ${bg} ${extra}`.trim();
  const detCell = (bg, extra = "") => `${td} text-left sticky z-[2] min-w-[220px] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.15)] ${bg} ${extra}`.trim();
  const detStyle = { left: DIVISION_W };

  return (
    <div className="font-sans text-black bg-gray-50 min-h-full pl-print-root">
      <div className="sticky top-0 z-20 bg-white shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-50 rounded-md flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" />
              </svg>
            </div>
            <div>
              <div className="text-base font-semibold text-black leading-tight">Summary</div>
              <div className="text-xs text-black mt-0.5">{modeSubtitle}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 no-print flex-wrap justify-end">
            <MisViewToggle value={misView} onChange={setMisView} />
            <PlModeToggle value={plMode} onChange={setPlMode} />
            <div className="inline-flex items-center rounded-lg border border-gray-300 overflow-hidden shrink-0">
              <button
                type="button"
                onClick={() => setShowInr(false)}
                className={`px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${!showInr ? "bg-indigo-600 text-white" : "bg-white text-black hover:bg-gray-50"}`}
              >
                $
              </button>
              <button
                type="button"
                onClick={() => setShowInr(true)}
                className={`px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${showInr ? "bg-indigo-600 text-white" : "bg-white text-black hover:bg-gray-50"}`}
              >
                ₹
              </button>
            </div>
            {showInr && (
              <div className="inline-flex items-center gap-1 h-8 px-2 border border-gray-200 rounded-lg bg-white">
                <span className="text-[10px] font-semibold text-black/50">$1 =</span>
                <input
                  type="number" min="0" step="0.01"
                  value={inrRate}
                  onChange={(e) => setInrRate(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
                  className="w-14 text-xs font-mono text-right border-none outline-none"
                />
                <span className="text-[10px] font-semibold text-black/50">₹</span>
              </div>
            )}
            <select value={year} onChange={(e) => setYear(e.target.value)}
              className="h-8 px-2.5 text-xs font-semibold border border-gray-200 rounded-lg bg-white cursor-pointer">
              {availableYears.map((y) => <option key={y} value={y}>FY 20{y}</option>)}
            </select>
            <ExportExcelButton onClick={handleExport} disabled={misView !== "summary" || loading || !!error || !hasAnyData} />
            <ExportPdfButton onClick={handleExportPdf} disabled={misView !== "summary" || loading || !!error || !hasAnyData} />
            <PrintButton onClick={handlePrint} disabled={misView !== "summary" || loading || !!error || !hasAnyData} />
          </div>
        </div>
      </div>

      <div className="px-6 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
            <p className="text-sm text-black">Loading summary…</p>
          </div>
        ) : error ? (
          <div className="text-center py-16 text-red-500 text-sm">{error}</div>
        ) : misView === "buyer" ? (
          <MisBuyerWise year={year} months={months} rows={rows} openRows={openRows} buyerRateMap={buyerRateMap} commissionMap={commissionMap} rateMap={rateMap} plMode={plMode} showInr={showInr} inrRate={inrRate} />
        ) : misView === "division" ? (
          <MisDivision year={year} months={months} rows={rows} openRows={openRows} buyerRateMap={buyerRateMap} commissionMap={commissionMap} rateMap={rateMap} plMode={plMode} showInr={showInr} inrRate={inrRate} />
        ) : (
          <div>
            {expenseError && (
              <div className="mb-3 px-4 py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">
                Couldn&apos;t load saved expense entries: {expenseError}
              </div>
            )}
          <div ref={printRef} className="overflow-x-auto rounded-xl border border-gray-300 bg-white shadow-sm">
            <table className="w-max text-[13px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={`${th1} bg-gray-50 text-left sticky left-0 z-[5] min-w-[96px] max-w-[96px]`} rowSpan={3}>Division</th>
                  <th className={`${th1} bg-gray-50 text-left sticky z-[5] min-w-[220px] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.15)]`} style={detStyle} rowSpan={3}>Details</th>
                  {monthsData.map((m, idx) => (
                    <th key={`m-${m.key}`} className={`${th1} ${monthBg(idx)}`} colSpan={m.weeks.length + 2 + m.weeks.length + 1}>{m.label}</th>
                  ))}
                </tr>
                <tr>
                  {monthsData.map((m, idx) => (
                    <Fragment key={`pa-${m.key}`}>
                      <th className={`${th2} ${monthBg(idx)}`} style={th2Style} colSpan={m.weeks.length + 2}>Planned</th>
                      <th className={`${th2} ${monthBg(idx)}`} style={th2Style} colSpan={m.weeks.length + 1}>Actual</th>
                    </Fragment>
                  ))}
                </tr>
                <tr>
                  {monthsData.map((m, idx) => (
                    <Fragment key={`w-${m.key}`}>
                      {m.weeks.map((w) => <th key={`p-${w.weekNumber}`} className={`${th3} ${monthBg(idx)}`} style={th3Style}>{w.label}</th>)}
                      <th className={`${th3} ${monthBg(idx)}`} style={th3Style}>MTD</th>
                      <th className={`${th3} ${monthBg(idx)}`} style={th3Style}>Total</th>
                      {m.weeks.map((w) => <th key={`a-${w.weekNumber}`} className={`${th3} ${monthBg(idx)}`} style={th3Style}>{w.label}</th>)}
                      <th className={`${th3} ${monthBg(idx)}`} style={th3Style}>Total</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-indigo-50/40 border-b border-gray-300">
                  <td className={divCell("bg-indigo-50", "font-medium")}>Global</td>
                  <td className={detCell("bg-indigo-50", "font-medium")} style={detStyle}>Sales Global</td>
                  {monthsData.map((m) => (
                    <Fragment key={m.key}>
                      {m.weeks.map((w) => <td key={w.weekNumber} className={`${td} text-blue-700`}>{fmtCurrency(w.planned.salesGlobal)}</td>)}
                      <td className={`${td} font-semibold`}>{fmtCurrency(m.plannedMtdTotal.salesGlobal.mtd)}</td>
                      <td className={`${td} font-semibold`}>{fmtCurrency(m.plannedMtdTotal.salesGlobal.total)}</td>
                      {m.weeks.map((w) => <td key={`a${w.weekNumber}`} className={`${td} text-blue-700`}>{fmtCurrency(w.actual.salesGlobal)}</td>)}
                      <td className={`${td} font-semibold`}>{fmtCurrency(m.actualTotal.salesGlobal)}</td>
                    </Fragment>
                  ))}
                </tr>
                <tr className="bg-white border-b border-gray-300 text-black/30">
                  <td className={divCell("bg-white")}>Global</td>
                  <td className={detCell("bg-white")} style={detStyle}>Backlog Projected</td>
                  {monthsData.map((m) => (
                    <Fragment key={m.key}>
                      {m.weeks.map((w) => <td key={w.weekNumber} className={td}></td>)}
                      <td className={td}></td><td className={td}></td>
                      {m.weeks.map((w) => <td key={`a${w.weekNumber}`} className={td}></td>)}
                      <td className={td}></td>
                    </Fragment>
                  ))}
                </tr>
                <tr className="bg-gray-50 border-b border-gray-300 text-black/30 font-semibold">
                  <td className={divCell("bg-gray-50")}>Global</td>
                  <td className={detCell("bg-gray-50")} style={detStyle}>Total Sales Global</td>
                  {monthsData.map((m) => (
                    <Fragment key={m.key}>
                      {m.weeks.map((w) => <td key={w.weekNumber} className={td}></td>)}
                      <td className={td}></td><td className={td}></td>
                      {m.weeks.map((w) => <td key={`a${w.weekNumber}`} className={td}></td>)}
                      <td className={td}></td>
                    </Fragment>
                  ))}
                </tr>
                <tr className="bg-green-50/40 border-b border-gray-300">
                  <td className={divCell("bg-green-50", "font-medium")}>Global</td>
                  <td className={detCell("bg-green-50", "font-medium")} style={detStyle}>Income from above Sales</td>
                  {monthsData.map((m) => (
                    <Fragment key={m.key}>
                      {m.weeks.map((w) => <td key={w.weekNumber} className={`${td} text-green-700`}>{fmtCurrency(w.planned.income)}</td>)}
                      <td className={`${td} font-semibold`}>{fmtCurrency(m.plannedMtdTotal.income.mtd)}</td>
                      <td className={`${td} font-semibold`}>{fmtCurrency(m.plannedMtdTotal.income.total)}</td>
                      {m.weeks.map((w) => <td key={`a${w.weekNumber}`} className={`${td} text-green-700`}>{fmtCurrency(w.actual.income)}</td>)}
                      <td className={`${td} font-semibold`}>{fmtCurrency(m.actualTotal.income)}</td>
                    </Fragment>
                  ))}
                </tr>
                <tr className="bg-white border-b border-gray-300 text-black/30">
                  <td className={divCell("bg-white")}>Global</td>
                  <td className={detCell("bg-white")} style={detStyle}>Income from Backlog Projected</td>
                  {monthsData.map((m) => (
                    <Fragment key={m.key}>
                      {m.weeks.map((w) => <td key={w.weekNumber} className={td}></td>)}
                      <td className={td}></td><td className={td}></td>
                      {m.weeks.map((w) => <td key={`a${w.weekNumber}`} className={td}></td>)}
                      <td className={td}></td>
                    </Fragment>
                  ))}
                </tr>
                <tr className="bg-gray-50 border-b border-gray-300 text-black/30 font-semibold">
                  <td className={divCell("bg-gray-50")}>Global</td>
                  <td className={detCell("bg-gray-50")} style={detStyle}>Total Income</td>
                  {monthsData.map((m) => (
                    <Fragment key={m.key}>
                      {m.weeks.map((w) => <td key={w.weekNumber} className={td}></td>)}
                      <td className={td}></td><td className={td}></td>
                      {m.weeks.map((w) => <td key={`a${w.weekNumber}`} className={td}></td>)}
                      <td className={td}></td>
                    </Fragment>
                  ))}
                </tr>
                <tr className="bg-white border-b border-gray-300">
                  <td className={divCell("bg-white")}>Global</td>
                  <td className={detCell("bg-white")} style={detStyle}>Income % to Sales</td>
                  {monthsData.map((m) => (
                    <Fragment key={m.key}>
                      {m.weeks.map((w) => <td key={w.weekNumber} className={td}>{fmtPct(w.planned.incomePctSales)}</td>)}
                      <td className={td}>{fmtPct(m.plannedMtdTotal.salesGlobal.mtd > 0 ? (m.plannedMtdTotal.income.mtd / m.plannedMtdTotal.salesGlobal.mtd) * 100 : null)}</td>
                      <td className={td}>{fmtPct(m.plannedMtdTotal.salesGlobal.total > 0 ? (m.plannedMtdTotal.income.total / m.plannedMtdTotal.salesGlobal.total) * 100 : null)}</td>
                      {m.weeks.map((w) => <td key={`a${w.weekNumber}`} className={td}>{fmtPct(w.actual.incomePctSales)}</td>)}
                      <td className={td}>{fmtPct(m.actualTotal.incomePctSales)}</td>
                    </Fragment>
                  ))}
                </tr>
                <tr className="bg-gray-50 border-b border-gray-300 text-black/30 font-semibold">
                  <td className={divCell("bg-gray-50")}>Global</td>
                  <td className={detCell("bg-gray-50")} style={detStyle}>On Time Shipment % Cumulative</td>
                  {monthsData.map((m) => (
                    <Fragment key={m.key}>
                      {m.weeks.map((w) => <td key={w.weekNumber} className={td}></td>)}
                      <td className={td}></td><td className={td}></td>
                      {m.weeks.map((w) => <td key={`a${w.weekNumber}`} className={td}></td>)}
                      <td className={td}></td>
                    </Fragment>
                  ))}
                </tr>

                {EXPENSE_FIELDS.map((f) => (
                  <tr key={f.key} className="bg-white border-b border-gray-300">
                    <td className={divCell("bg-white")}>Global</td>
                    <td className={detCell("bg-white")} style={detStyle}>{f.label}</td>
                    {monthsData.map((m) => (
                      <Fragment key={m.key}>
                        {m.weeks.map((w) => (
                          <td key={w.weekNumber} className={`${td} cursor-pointer hover:bg-indigo-50`} onClick={() => setEditingWeek({ monthKey: m.key, weekNumber: w.weekNumber })}>
                            {fmtCurrency(w.planned.expenses[f.key]?.planned)}
                          </td>
                        ))}
                        <td className={`${td} font-semibold`}>{fmtCurrency(m.plannedMtdTotal[f.key].mtd)}</td>
                        <td className={`${td} font-semibold`}>{fmtCurrency(m.plannedMtdTotal[f.key].total)}</td>
                        {m.weeks.map((w) => (
                          <td key={`a${w.weekNumber}`} className={`${td} cursor-pointer hover:bg-indigo-50`} onClick={() => setEditingWeek({ monthKey: m.key, weekNumber: w.weekNumber })}>
                            {fmtCurrency(w.actual.expenses[f.key]?.actual)}
                          </td>
                        ))}
                        <td className={`${td} font-semibold`}>{fmtCurrency(m.actualTotal[f.key])}</td>
                      </Fragment>
                    ))}
                  </tr>
                ))}

                <tr className="bg-gray-50 border-b border-gray-300 font-semibold">
                  <td className={divCell("bg-gray-50")}>Global</td>
                  <td className={detCell("bg-gray-50")} style={detStyle}>Total Expenses</td>
                  {monthsData.map((m) => (
                    <Fragment key={m.key}>
                      {m.weeks.map((w) => <td key={w.weekNumber} className={`${td} text-red-600`}>{fmtCurrency(w.planned.totalExpenses)}</td>)}
                      <td className={`${td} text-red-600`}>{fmtCurrency(m.plannedMtdTotal.totalExpenses.mtd)}</td>
                      <td className={`${td} text-red-600`}>{fmtCurrency(m.plannedMtdTotal.totalExpenses.total)}</td>
                      {m.weeks.map((w) => <td key={`a${w.weekNumber}`} className={`${td} text-red-600`}>{fmtCurrency(w.actual.totalExpenses)}</td>)}
                      <td className={`${td} text-red-600`}>{fmtCurrency(m.actualTotal.totalExpenses)}</td>
                    </Fragment>
                  ))}
                </tr>
                <tr className="bg-white border-b border-gray-300 font-semibold">
                  <td className={divCell("bg-white")}>Global</td>
                  <td className={detCell("bg-white")} style={detStyle}>Total % to sales</td>
                  {monthsData.map((m) => (
                    <Fragment key={m.key}>
                      {m.weeks.map((w) => <td key={w.weekNumber} className={td}>{fmtPct(w.planned.totalPctIncome)}</td>)}
                      <td className={td}>{fmtPct(m.plannedMtdTotal.income.mtd > 0 ? (m.plannedMtdTotal.totalExpenses.mtd / m.plannedMtdTotal.income.mtd) * 100 : null)}</td>
                      <td className={td}>{fmtPct(m.plannedMtdTotal.income.total > 0 ? (m.plannedMtdTotal.totalExpenses.total / m.plannedMtdTotal.income.total) * 100 : null)}</td>
                      {m.weeks.map((w) => <td key={`a${w.weekNumber}`} className={td}></td>)}
                      <td className={td}>{fmtPct(m.actualTotal.income > 0 ? (m.actualTotal.totalExpenses / m.actualTotal.income) * 100 : null)}</td>
                    </Fragment>
                  ))}
                </tr>
                <tr className="bg-indigo-50 border-b border-gray-300 font-bold">
                  <td className={divCell("bg-indigo-50")}></td>
                  <td className={detCell("bg-indigo-50")} style={detStyle}>EBIDTA</td>
                  {monthsData.map((m) => (
                    <Fragment key={m.key}>
                      {m.weeks.map((w) => <td key={w.weekNumber} className={`${td} ${w.planned.ebidta >= 0 ? "text-green-700" : "text-red-600"}`}>{fmtCurrency(w.planned.ebidta)}</td>)}
                      <td className={`${td} ${m.plannedMtdTotal.ebidta.mtd >= 0 ? "text-green-700" : "text-red-600"}`}>{fmtCurrency(m.plannedMtdTotal.ebidta.mtd)}</td>
                      <td className={`${td} ${m.plannedMtdTotal.ebidta.total >= 0 ? "text-green-700" : "text-red-600"}`}>{fmtCurrency(m.plannedMtdTotal.ebidta.total)}</td>
                      {m.weeks.map((w) => <td key={`a${w.weekNumber}`} className={`${td} ${w.actual.ebidta >= 0 ? "text-green-700" : "text-red-600"}`}>{fmtCurrency(w.actual.ebidta)}</td>)}
                      <td className={`${td} ${m.actualTotal.ebidta >= 0 ? "text-green-700" : "text-red-600"}`}>{fmtCurrency(m.actualTotal.ebidta)}</td>
                    </Fragment>
                  ))}
                </tr>
                <tr className="bg-indigo-50 font-bold">
                  <td className={divCell("bg-indigo-50")}></td>
                  <td className={detCell("bg-indigo-50")} style={detStyle}>% to sales</td>
                  {monthsData.map((m) => (
                    <Fragment key={m.key}>
                      {m.weeks.map((w) => <td key={w.weekNumber} className={td}>{fmtPct(w.planned.ebidtaPctIncome)}</td>)}
                      <td className={td}>{fmtPct(m.plannedMtdTotal.income.mtd > 0 ? (m.plannedMtdTotal.ebidta.mtd / m.plannedMtdTotal.income.mtd) * 100 : null)}</td>
                      <td className={td}>{fmtPct(m.plannedMtdTotal.income.total > 0 ? (m.plannedMtdTotal.ebidta.total / m.plannedMtdTotal.income.total) * 100 : null)}</td>
                      {m.weeks.map((w) => <td key={`a${w.weekNumber}`} className={td}></td>)}
                      <td className={td}>{fmtPct(m.actualTotal.income > 0 ? (m.actualTotal.ebidta / m.actualTotal.income) * 100 : null)}</td>
                    </Fragment>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          </div>
        )}
      </div>

      {editingWeek != null && (
        <WeeklyExpenseModal
          monthKey={editingWeek.monthKey}
          weekNumber={editingWeek.weekNumber}
          weekLabel={`Week-${editingWeek.weekNumber} · ${months.find((m) => m.key === editingWeek.monthKey)?.label || editingWeek.monthKey}`}
          fyYear={year}
          plMode={plMode}
          showInr={showInr}
          inrRate={inrRate}
          initial={(() => {
            const src = (expenseRowsByMonth[editingWeek.monthKey] || {})[editingWeek.weekNumber] || {};
            const init = {};
            EXPENSE_FIELDS.forEach((f) => {
              init[`${f.key}_planned`] = src[`${f.column}_planned`] ?? "";
              init[`${f.key}_actual`] = src[`${f.column}_actual`] ?? "";
            });
            return init;
          })()}
          onSave={handleSaveExpense}
          onClose={() => setEditingWeek(null)}
        />
      )}
    </div>
  );
}