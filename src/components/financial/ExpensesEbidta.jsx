import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useJnmPlAccess } from "../../hooks/useJnmPlAccess";
import { usePersistedPlFilter } from "../../hooks/usePersistedPlFilter";
import ExportExcelButton from "../ui/ExportExcelButton";
import ExportPdfButton from "../ui/ExportPdfButton";
import PrintButton from "../ui/PrintButton";
import PlModeToggle from "./PlModeToggle";
import { printElement } from "../../utils/printPage";
import { downloadSummaryXlsx } from "../../utils/xlsxExport";
import { downloadSummaryPdf } from "../../utils/pdfExport";
import { roundComm, plExpenseModeFromStorageKey, plExpenseMonthFromStorageKey } from "../../utils/plDataHelpers";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const EXPENSE_HEADERS = [
  "Month", "Sales Global", "Income", "Income %",
  "Salary", "Travel (Dom.)", "Travel (Intl.)", "Rent",
  "Electricity", "Misc. & Other", "Total Expenses", "Exp %",
  "EBIDTA", "EBIDTA %",
];

const fmtUsd = (n) =>
  n == null || n === "" || isNaN(n)
    ? "—"
    : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtPct = (n) =>
  n == null || n === "" || isNaN(n) ? "—" : `${Number(n).toFixed(2)}%`;

const MODE_LABELS = { jng: "P&L JNG", jnm: "P&L JNM", overall: "Overall P&L" };

function sumRows(rows, key) {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}

function ExpensesSummaryBar({ totals, plMode }) {
  const ebidtaClass = (totals.ebidta ?? 0) >= 0 ? "text-green-700 pl-print-val-green" : "text-red-600";
  const metrics = [
    { label: "Sales Global", value: fmtUsd(totals.salesGlobal), valueClass: "text-indigo-700 pl-print-val-indigo" },
    { label: "Income", value: fmtUsd(totals.income), valueClass: "text-green-700 pl-print-val-green" },
    { label: "Total Expenses", value: fmtUsd(totals.totalExpenses), valueClass: "text-red-600" },
    { label: "EBIDTA", value: fmtUsd(totals.ebidta), valueClass: `${ebidtaClass} font-bold` },
  ];
  return (
    <div className="pl-print-summary rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3">
      <div className="pl-print-summary-title text-[10px] font-bold text-indigo-800 uppercase tracking-wider mb-2">
        {MODE_LABELS[plMode]} Summary
      </div>
      <div className="pl-print-summary-grid flex flex-wrap gap-x-5 gap-y-2 text-xs">
        {metrics.map((m) => (
          <span key={m.label} className="pl-print-summary-item whitespace-nowrap">
            <span className="pl-print-summary-label text-black/50">{m.label}</span>
            <span className="pl-print-summary-sep"> : </span>
            <span className={`pl-print-summary-value font-mono font-semibold ${m.valueClass}`}>{m.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function fyMonthRows(fyShort) {
  const startYear = 2000 + parseInt(fyShort, 10) - 1;
  return Array.from({ length: 12 }, (_, i) => {
    const month = (3 + i) % 12;
    const calYear = i < 9 ? startYear : startYear + 1;
    const key = `${calYear}-${String(month + 1).padStart(2, "0")}`;
    return { key, label: `${MONTH_NAMES[month]} ${calYear}` };
  });
}

export default function ExpensesEbidta({ availableYears = ["26", "27"], defaultYear = "27" }) {
  const hasJnmPlAccess = useJnmPlAccess();
  const printRef = useRef(null);
  const summaryRef = useRef(null);
  const [year, setYear] = usePersistedPlFilter("expenses-ebidta", "year", defaultYear);
  const [plMode, setPlMode] = usePersistedPlFilter("expenses-ebidta", "plMode", "jng");
  const [dataMap, setDataMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const months = useMemo(() => fyMonthRows(year), [year]);

  useEffect(() => {
    if (!hasJnmPlAccess && (plMode === "jnm" || plMode === "overall")) setPlMode("jng");
  }, [hasJnmPlAccess, plMode]);

  const modeSubtitle = plMode === "overall"
    ? "Overall P&L — monthly expenses & EBIDTA"
    : plMode === "jnm"
    ? "P&L JNM — monthly expenses & EBIDTA"
    : "P&L JNG — monthly expenses & EBIDTA";

  useEffect(() => {
    if (!hasJnmPlAccess) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDataMap({});
    supabase
      .from("monthly_pl_expenses")
      .select("month_key, sales_global, income_from_sales, income_pct_to_sales, salary_employees, travel_domestic, travel_international, rent, electricity_others, miscellaneous_other, total_expenses, total_pct_to_sales, ebidta, ebidta_pct_to_sales")
      .eq("fy_year", year)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setDataMap({});
          return;
        }
        const map = {};
        (data || []).forEach((r) => {
          if (plExpenseModeFromStorageKey(r.month_key) !== plMode) return;
          const monthKey = plExpenseMonthFromStorageKey(r.month_key);
          map[monthKey] = { ...r, month_key: monthKey };
        });
        setDataMap(map);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, plMode, hasJnmPlAccess]);

  const hasAnyData = months.some((m) => dataMap[m.key]);

  const emptyMessage = !hasAnyData ? "Monthly expenses are not filled yet." : null;

  const filledRows = useMemo(
    () => months.map((m) => dataMap[m.key]).filter(Boolean),
    [months, dataMap],
  );

  const totals = useMemo(() => {
    const salesGlobal = roundComm(sumRows(filledRows, "sales_global"));
    const income = roundComm(sumRows(filledRows, "income_from_sales"));
    const totalExpenses = roundComm(sumRows(filledRows, "total_expenses"));
    return {
      salesGlobal,
      income,
      totalExpenses,
      ebidta: roundComm(income - totalExpenses),
    };
  }, [filledRows]);

  const handlePrint = useCallback(() => {
    const el = document.createElement("div");
    if (summaryRef.current) el.appendChild(summaryRef.current.cloneNode(true));
    if (printRef.current) el.appendChild(printRef.current.cloneNode(true));
    printElement(el, { title: "Expences & EBIDTA", subtitle: `${modeSubtitle} · FY 20${year}` });
  }, [modeSubtitle, year]);

  const handleExport = useCallback(() => {
    if (!hasAnyData) return;
    const modeSlug = plMode === "overall" ? "Overall" : plMode === "jnm" ? "JNM" : "JNG";
    const dataRows = months
      .filter((m) => dataMap[m.key])
      .map((m) => {
        const r = dataMap[m.key];
        return [
          m.label,
          r.sales_global ?? null,
          r.income_from_sales ?? null,
          r.income_pct_to_sales ?? null,
          r.salary_employees ?? null,
          r.travel_domestic ?? null,
          r.travel_international ?? null,
          r.rent ?? null,
          r.electricity_others ?? null,
          r.miscellaneous_other ?? null,
          r.total_expenses ?? null,
          r.total_pct_to_sales ?? null,
          r.ebidta ?? null,
          r.ebidta_pct_to_sales ?? null,
        ];
      });
    downloadSummaryXlsx(
      [EXPENSE_HEADERS, ...dataRows],
      "Expenses EBIDTA",
      `Expenses_EBIDTA_${modeSlug}_FY${year}.xlsx`
    );
  }, [months, dataMap, year, plMode, hasAnyData]);

  const handleExportPdf = useCallback(() => {
    if (!hasAnyData) return;
    const modeSlug = plMode === "overall" ? "Overall" : plMode === "jnm" ? "JNM" : "JNG";
    const dataRows = months
      .filter((m) => dataMap[m.key])
      .map((m) => {
        const r = dataMap[m.key];
        return [
          m.label,
          r.sales_global ?? null,
          r.income_from_sales ?? null,
          r.income_pct_to_sales ?? null,
          r.salary_employees ?? null,
          r.travel_domestic ?? null,
          r.travel_international ?? null,
          r.rent ?? null,
          r.electricity_others ?? null,
          r.miscellaneous_other ?? null,
          r.total_expenses ?? null,
          r.total_pct_to_sales ?? null,
          r.ebidta ?? null,
          r.ebidta_pct_to_sales ?? null,
        ];
      });
    downloadSummaryPdf({
      headers: EXPENSE_HEADERS,
      dataRows,
      title: "Expences & EBIDTA",
      subtitle: `${modeSubtitle} · FY 20${year}`,
      filename: `Expenses_EBIDTA_${modeSlug}_FY${year}.pdf`,
    });
  }, [months, dataMap, year, plMode, hasAnyData, modeSubtitle]);

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
          <p className="text-xs text-gray-400 mt-1">You don&apos;t have permission to view Expences &amp; EBIDTA</p>
        </div>
      </div>
    );
  }

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
              <div className="text-base font-semibold text-black leading-tight">Expences &amp; EBIDTA</div>
              <div className="text-xs text-black mt-0.5">{modeSubtitle}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 no-print flex-wrap justify-end">
            <PlModeToggle value={plMode} onChange={setPlMode} />
            <select value={year} onChange={(e) => setYear(e.target.value)}
              className="h-8 px-2.5 text-xs font-semibold border border-gray-200 rounded-lg bg-white cursor-pointer">
              {availableYears.map((y) => <option key={y} value={y}>FY 20{y}</option>)}
            </select>
            <ExportExcelButton onClick={handleExport} disabled={loading || !!error || !hasAnyData} />
            <ExportPdfButton onClick={handleExportPdf} disabled={loading || !!error || !hasAnyData} />
            <PrintButton
              onClick={handlePrint}
              disabled={loading || !!error || !hasAnyData}
            />
          </div>
        </div>
        {!loading && !error && hasAnyData && (
          <div ref={summaryRef} className="pl-print-summary-wrap px-6 py-3 bg-gray-50 border-b border-gray-200">
            <ExpensesSummaryBar totals={totals} plMode={plMode} />
          </div>
        )}
      </div>

      <div className="px-6 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
            <p className="text-sm text-black">Loading expenses…</p>
          </div>
        ) : error ? (
          <div className="text-center py-16 text-red-500 text-sm">{error}</div>
        ) : emptyMessage ? (
          <div className="text-center py-16 text-black text-sm max-w-md mx-auto">
            {emptyMessage}
          </div>
        ) : (
          <div ref={printRef} className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-[13px] border-collapse min-w-[1200px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {EXPENSE_HEADERS.map((h) => (
                    <th key={h} className="px-3 py-2.5 text-[10px] font-bold text-black uppercase tracking-wider whitespace-nowrap border-r border-gray-200 last:border-r-0 text-right first:text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map((m, idx) => {
                  const r = dataMap[m.key];
                  if (!r) return null;
                  const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";
                  return (
                    <tr key={m.key} className={`${rowBg} border-b border-gray-100`}>
                      <td className="px-3 py-2 border-r border-gray-100 font-medium text-black whitespace-nowrap">{m.label}</td>
                      <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs text-blue-700">{fmtUsd(r.sales_global)}</td>
                      <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs text-green-700">{fmtUsd(r.income_from_sales)}</td>
                      <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs">{fmtPct(r.income_pct_to_sales)}</td>
                      <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs">{fmtUsd(r.salary_employees)}</td>
                      <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs">{fmtUsd(r.travel_domestic)}</td>
                      <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs">{fmtUsd(r.travel_international)}</td>
                      <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs">{fmtUsd(r.rent)}</td>
                      <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs">{fmtUsd(r.electricity_others)}</td>
                      <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs">{fmtUsd(r.miscellaneous_other)}</td>
                      <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs font-semibold text-red-600">{fmtUsd(r.total_expenses)}</td>
                      <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs">{fmtPct(r.total_pct_to_sales)}</td>
                      <td className={`px-3 py-2 border-r border-gray-100 text-right font-mono text-xs font-bold ${(r.ebidta ?? 0) >= 0 ? "text-green-700" : "text-red-600"}`}>{fmtUsd(r.ebidta)}</td>
                      <td className={`px-3 py-2 text-right font-mono text-xs font-bold ${(r.ebidta ?? 0) >= 0 ? "text-green-700" : "text-red-600"}`}>{fmtPct(r.ebidta_pct_to_sales)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
