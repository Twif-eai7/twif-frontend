import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAuthStore } from "../../stores/authStore";
import { supabase } from "../../lib/supabase";
import { useJnmPlAccess } from "../../hooks/useJnmPlAccess";
import { usePersistedPlFilter } from "../../hooks/usePersistedPlFilter";
import { useMerchantPoBuyersAccess, buildPoSummaryParams } from "../../hooks/useMerchantPoBuyersAccess";
import ExportExcelButton from "../ui/ExportExcelButton";
import ExportPdfButton from "../ui/ExportPdfButton";
import PrintButton from "../ui/PrintButton";
import PlModeToggle from "./PlModeToggle";
import { PlTableScrollWrap } from "./PlScheduleMobile";
import { printElement } from "../../utils/printPage";
import { downloadSummaryXlsx } from "../../utils/xlsxExport";
import { downloadSummaryPdf } from "../../utils/pdfExport";
import {
  buildWeeks,
  buildMonths,
  fyCutoff,
  normStr,
  computePeriodSummary,
  roundComm,
  sumShippedSheetTotal,
} from "../../utils/plDataHelpers";

const API_BASE = import.meta.env.VITE_BACKEND_URL;

const fmtUsd = (n) =>
  n == null || n === "" || isNaN(n)
    ? "—"
    : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtPct = (n) =>
  n == null || n === "" || isNaN(n) ? "—" : `${Number(n).toFixed(1)}%`;

const MODE_LABELS = { jng: "P&L TWIF", jnm: "P&L JNM", overall: "Overall P&L" };

const PL_SUMMARY_TABLE_SCROLL = "pl-week-table-scroll overflow-auto max-h-[62vh] relative";
const plSummaryThClass = (alignLeft = false) =>
  `sticky top-0 z-[3] px-3 py-2.5 text-[10px] font-bold text-black bg-gray-50 shadow-[0_1px_0_#e5e7eb] uppercase tracking-wider whitespace-nowrap border-r border-b border-gray-200 last:border-r-0 ${alignLeft ? "text-left" : "text-right"}`;

function weekHeaders(plMode) {
  const base = ["Week", "Proj. POs", "Proj. PO Value", "Proj. Shipped", "Proj. Balance", "OTIF"];
  const ship = ["Shipped POs", "Ship. PO Value", "Ship. Shipped", "Ship. Balance"];
  if (plMode === "overall") {
    return [
      ...base,
      "Comm JNM TW (Proj.)", "Comm TWIF TW (Proj.)", "Overall Comm TW (Proj.)",
      ...ship,
      "Comm JNM TW", "Comm TWIF TW", "Overall Comm TW",
    ];
  }
  return [...base, "Comm TW (Proj.)", ...ship, "Comm TW"];
}

function monthHeaders(plMode) {
  const commLead = plMode === "overall" ? "Overall Comm TM" : "Comm TM";
  const base = ["Month", commLead, "Proj. POs", "Proj. PO Value", "Proj. Shipped", "Proj. Balance", "OTIF"];
  const ship = ["Shipped POs", "Ship. PO Value", "Ship. Shipped", "Ship. Balance"];
  if (plMode === "overall") {
    return [
      ...base,
      "Comm JNM TM (Proj.)", "Comm TWIF TM (Proj.)", "Overall Comm TM (Proj.)",
      ...ship,
      "Comm JNM TM", "Comm TWIF TM",
    ];
  }
  return [...base, "Comm TM (Proj.)", ...ship, "Comm TM"];
}

function sumField(rows, key) {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}

function SummaryMetric({ label, value, valueClass = "text-black" }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-black/45">{label}</div>
      <div className={`text-xs font-mono mt-0.5 ${valueClass}`}>{value}</div>
    </div>
  );
}

function PlSummaryMobileCard({ row, isMonth, plMode, jngShipVal }) {
  const otifColor = row.otif == null ? "text-black" : row.otif >= 90 ? "text-green-600" : row.otif >= 70 ? "text-amber-500" : "text-red-500";
  const commLabel = isMonth ? "TM" : "TW";
  return (
    <div className="lg:hidden rounded-xl border border-gray-200 bg-white p-3 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-black">{row.label}</div>
        {isMonth && (
          <div className="text-xs font-mono font-bold text-indigo-800">{fmtUsd(row.shipComm)}</div>
        )}
      </div>

      <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-2.5 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Projected</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <SummaryMetric label="POs" value={row.projCount || "—"} />
          <SummaryMetric label="PO Value" value={fmtUsd(row.projPoValue)} valueClass="text-indigo-700 font-semibold" />
          <SummaryMetric label="Shipped" value={fmtUsd(row.projShipped)} valueClass="text-green-700 font-semibold" />
          <SummaryMetric label="Balance" value={fmtUsd(row.projBalance)} valueClass="text-amber-600 font-semibold" />
          <SummaryMetric label="OTIF" value={fmtPct(row.otif)} valueClass={`font-semibold ${otifColor}`} />
          {plMode === "overall" ? (
            <>
              <SummaryMetric label={`JNM Comm ${commLabel}`} value={fmtUsd(row.jnmProjComm)} valueClass="text-indigo-600" />
              <SummaryMetric label={`TWIF Comm ${commLabel}`} value={fmtUsd(row.jngProjComm)} valueClass="text-violet-600" />
              <SummaryMetric label={`Overall ${commLabel}`} value={fmtUsd(row.overallProjComm)} valueClass="text-indigo-700 font-semibold" />
            </>
          ) : (
            <SummaryMetric label={`Comm ${commLabel}`} value={fmtUsd(row.projComm)} valueClass="text-indigo-700 font-semibold" />
          )}
        </div>
      </div>

      <div className="rounded-lg border border-green-100 bg-green-50/40 p-2.5 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-green-700">Shipped</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <SummaryMetric label="POs" value={row.shipCount || "—"} />
          <SummaryMetric label="PO Value" value={fmtUsd(row.shipPoValue)} valueClass="text-blue-700 font-semibold" />
          <SummaryMetric label="Shipped" value={fmtUsd(row.shipShipped)} valueClass="text-green-700 font-semibold" />
          <SummaryMetric label="Balance" value={fmtUsd(row.shipBalance)} valueClass="text-amber-600 font-semibold" />
          {plMode === "overall" ? (
            <>
              <SummaryMetric label={`JNM Comm ${commLabel}`} value={fmtUsd(row.jnmShipComm)} valueClass="text-indigo-600" />
              <SummaryMetric label={`TWIF Comm ${commLabel}`} value={fmtUsd(jngShipVal(row))} valueClass="text-violet-600" />
              {!isMonth && <SummaryMetric label={`Overall ${commLabel}`} value={fmtUsd(row.shipComm)} valueClass="text-indigo-800 font-bold" />}
            </>
          ) : (
            <SummaryMetric label={`Comm ${commLabel}`} value={fmtUsd(row.shipComm)} valueClass="text-indigo-800 font-bold" />
          )}
        </div>
      </div>
    </div>
  );
}

function TotalsBar({ totals, isMonth, plMode }) {
  const commLabel = isMonth ? "TM" : "TW";
  const title = `${MODE_LABELS[plMode]} Summary`;
  const metrics = plMode === "overall"
    ? [
        { label: "Proj. PO Value", value: fmtUsd(totals.projPoValue), valueClass: "text-indigo-700 pl-print-val-indigo" },
        { label: "Proj. Shipped", value: fmtUsd(totals.projShipped), valueClass: "text-green-700 pl-print-val-green" },
        { label: "Ship. Shipped", value: fmtUsd(totals.shipShipped), valueClass: "text-green-700 pl-print-val-green" },
        { label: `Comm JNM ${commLabel}`, value: fmtUsd(totals.jnmShipComm), valueClass: "text-indigo-600 pl-print-val-indigo" },
        { label: `Comm TWIF ${commLabel}`, value: fmtUsd(totals.jngShipComm), valueClass: "text-violet-600 pl-print-val-violet" },
        { label: `Overall Comm ${commLabel}`, value: fmtUsd(totals.shipComm), valueClass: "text-indigo-800 font-bold pl-print-val-indigo" },
      ]
    : [
        { label: "Proj. PO Value", value: fmtUsd(totals.projPoValue), valueClass: "text-indigo-700 pl-print-val-indigo" },
        { label: "Proj. Shipped", value: fmtUsd(totals.projShipped), valueClass: "text-green-700 pl-print-val-green" },
        { label: "Ship. Shipped", value: fmtUsd(totals.shipShipped), valueClass: "text-green-700 pl-print-val-green" },
        { label: `Comm ${commLabel}`, value: fmtUsd(totals.shipComm), valueClass: "text-indigo-800 font-bold pl-print-val-indigo" },
      ];
  return (
    <div className="pl-print-summary rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3">
      <div className="pl-print-summary-title text-[10px] font-bold text-indigo-800 uppercase tracking-wider mb-2">
        {title}
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

function JnmAccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-28 bg-gray-50 min-h-full">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 border border-gray-200">
        <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
        </svg>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-700">Access Restricted</p>
        <p className="text-xs text-gray-400 mt-1">You don&apos;t have permission to view this page</p>
      </div>
    </div>
  );
}

function PeriodFilterDropdown({ placeholder, options, value, onChange, selectedLabel }) {
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
    [options, search],
  );

  const selectedCount = value?.length || 0;
  const displayLabel = selectedCount === 0 ? null : selectedCount === 1 ? value[0] : `${selectedCount} ${selectedLabel} selected`;

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => options.length && setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium min-w-[140px] justify-between transition-all
          ${!options.length
            ? "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"
            : open
            ? "border-blue-500 bg-white shadow-[0_0_0_3px_rgba(59,130,246,0.12)]"
            : "border-gray-300 bg-gray-50 hover:bg-white hover:border-gray-400 cursor-pointer"
          }`}
      >
        <span>{displayLabel || placeholder}</span>
        <div className="flex items-center gap-1 shrink-0">
          {selectedCount > 0 && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              title="Clear selection"
              className="w-4 h-4 rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-500 flex items-center justify-center text-black transition-colors cursor-pointer"
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
        <div className="absolute top-[calc(100%+4px)] left-0 z-[999] bg-white border border-gray-200 rounded-lg shadow-lg min-w-[240px] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
            <svg className="w-3 h-3 text-black shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter…" className="border-none outline-none bg-transparent text-xs w-full text-black" />
          </div>
          <div className="max-h-[220px] overflow-y-auto py-1">
            <div onClick={() => onChange([])}
              className={`px-3 py-2 text-xs cursor-pointer ${selectedCount === 0 ? "text-blue-600 font-semibold bg-blue-50" : "text-black hover:bg-gray-50"}`}>
              {placeholder}
            </div>
            <div className="h-px bg-gray-100 my-0.5" />
            {filtered.map((opt) => {
              const sel = value?.includes(opt);
              return (
                <div key={opt} onClick={() => onChange(sel ? value.filter((x) => x !== opt) : [...(value || []), opt])}
                  className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer ${sel ? "bg-blue-50 text-blue-700 font-semibold" : "text-black hover:bg-gray-50"}`}>
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${sel ? "bg-blue-500 border-blue-500" : "border-gray-300"}`}>
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
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryShell({ title, subtitle, year, availableYears, onYearChange, loading, error, empty, onExport, onExportPdf, exportDisabled, onPrint, filterBar, summaryBar, summaryRef, headerActions, children }) {
  return (
    <div className="font-sans text-black bg-gray-50 min-h-full pl-print-root">
      <div className="sticky top-0 z-20 bg-gray-50 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 md:px-6 py-3 md:py-4 bg-white border-b border-gray-200">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-indigo-50 rounded-md flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold text-black leading-tight">{title}</div>
              <div className="text-xs text-black/70 mt-0.5 line-clamp-2">{subtitle}</div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 no-print w-full sm:w-auto">
            {headerActions}
            <div className="flex items-center gap-2 sm:justify-end">
              <select value={year} onChange={(e) => onYearChange(e.target.value)}
                className="h-9 sm:h-8 flex-1 sm:flex-none px-2.5 text-xs font-semibold border border-gray-200 rounded-lg bg-white cursor-pointer">
                {availableYears.map((y) => <option key={y} value={y}>FY 20{y}</option>)}
              </select>
              <ExportExcelButton onClick={onExport} disabled={exportDisabled} />
              <ExportPdfButton onClick={onExportPdf} disabled={exportDisabled} />
              <PrintButton onClick={onPrint} disabled={exportDisabled} />
            </div>
          </div>
        </div>
        {filterBar && (
          <div className="flex items-center gap-2 px-4 md:px-6 py-2.5 bg-white border-b border-gray-200 flex-wrap no-print">
            {filterBar}
          </div>
        )}
        {summaryBar && (
          <div ref={summaryRef} className="pl-print-summary-wrap px-4 md:px-6 py-3 bg-gray-50 border-b border-gray-200">
            {summaryBar}
          </div>
        )}
      </div>

      <div className="px-3 sm:px-4 md:px-6 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
            <p className="text-sm text-black">Loading summary…</p>
          </div>
        ) : error ? (
          <div className="text-center py-16 text-red-500 text-sm">{error}</div>
        ) : empty ? (
          <div className="text-center py-16 text-black text-sm">{empty}</div>
        ) : children}
      </div>
    </div>
  );
}

export function PlWeeklySummary({ availableYears = ["26", "27"], defaultYear = "27" }) {
  return <PlDataSummary mode="week" availableYears={availableYears} defaultYear={defaultYear} />;
}

export function PlMonthlySummary({ availableYears = ["26", "27"], defaultYear = "27" }) {
  return <PlDataSummary mode="month" availableYears={availableYears} defaultYear={defaultYear} />;
}

function PlDataSummary({ mode, availableYears, defaultYear }) {
  const hasJnmPlAccess = useJnmPlAccess();
  const isMonth = mode === "month";
  const printRef = useRef(null);
  const summaryRef = useRef(null);
  const screen = isMonth ? "pl-monthly" : "pl-weekly";
  const [year, setYear] = usePersistedPlFilter(screen, "year", defaultYear);
  const [plMode, setPlMode] = usePersistedPlFilter(screen, "plMode", "jng");
  const [rows, setRows] = useState([]);
  const [openRows, setOpenRows] = useState([]);
  const [commissionMap, setCommissionMap] = useState({});
  const [rateMap, setRateMap] = useState({});
  const [buyerRateMap, setBuyerRateMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [periodFilter, setPeriodFilter] = usePersistedPlFilter(screen, "periodFilter", []);
  const buyersAccess = useMerchantPoBuyersAccess();

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

  const summaryRows = useMemo(() => {
    const cutoff = fyCutoff(year);
    const periods = isMonth ? buildMonths(rows, openRows) : buildWeeks(rows, openRows);
    return periods
      .filter((p) => p.end >= cutoff)
      .map((p) => computePeriodSummary(p, {
        getCommPct: plMode !== "overall" ? getCommPct : undefined,
        getJngCommPct,
        getJnmCommPct,
        buyerRateMap,
        plMode,
        isMonth,
        shippedRows: rows,
      }))
      .filter((r) => r.projCount > 0 || r.shipCount > 0);
  }, [rows, openRows, year, isMonth, plMode, getCommPct, getJngCommPct, getJnmCommPct, buyerRateMap]);

  const periodOptions = useMemo(() => summaryRows.map((r) => r.label), [summaryRows]);

  const displayedRows = useMemo(() => {
    if (!periodFilter.length) return summaryRows;
    const keys = new Set(periodFilter);
    return summaryRows.filter((r) => keys.has(r.label));
  }, [summaryRows, periodFilter]);

  const totals = useMemo(() => {
    const periodKeys = periodFilter.length
      ? new Set(summaryRows.filter((r) => periodFilter.includes(r.label)).map((r) => r.key))
      : null;
    const base = {
      projPoValue: sumField(displayedRows, "projPoValue"),
      projShipped: sumField(displayedRows, "projShipped"),
      shipShipped: sumShippedSheetTotal(rows, { periodKeys, isWeek: !isMonth }),
      shipComm: roundComm(sumField(displayedRows, "shipComm")),
    };
    if (plMode !== "overall") return base;
    const jngShipComm = displayedRows.reduce(
      (s, r) => s + (Number(r.jngShipComm) || 0) + (isMonth ? (Number(r.flatFee) || 0) : 0),
      0,
    );
    return {
      ...base,
      jnmShipComm: roundComm(sumField(displayedRows, "jnmShipComm")),
      jngShipComm: roundComm(jngShipComm),
    };
  }, [displayedRows, isMonth, plMode, rows, periodFilter, summaryRows]);

  const headers = isMonth ? monthHeaders(plMode) : weekHeaders(plMode);

  const title = isMonth ? "Monthly" : "Weekly";
  const subtitle = isMonth
    ? `Summary of monthly P&L Data (${MODE_LABELS[plMode]})`
    : `Summary of weekly P&L Data (${MODE_LABELS[plMode]})`;

  const jngShipVal = (r) => (Number(r.jngShipComm) || 0) + (isMonth ? (Number(r.flatFee) || 0) : 0);

  const rowToExport = (r) => {
    const base = [
      r.projCount || null,
      r.projPoValue ?? null,
      r.projShipped ?? null,
      r.projBalance ?? null,
      r.otif != null ? Number(r.otif.toFixed(1)) : null,
    ];
    const commProj = plMode === "overall"
      ? [r.jnmProjComm ?? null, r.jngProjComm ?? null, r.overallProjComm ?? null]
      : [r.projComm ?? null];
    const shipBase = [
      r.shipCount || null,
      r.shipPoValue ?? null,
      r.shipShipped ?? null,
      r.shipBalance ?? null,
    ];
    const commShip = plMode === "overall"
      ? [r.jnmShipComm ?? null, jngShipVal(r) || null]
      : [r.shipComm ?? null];
    const detail = [...base, ...commProj, ...shipBase, ...commShip];
    if (isMonth) {
      const lead = plMode === "overall" ? [r.shipComm ?? null] : [r.shipComm ?? null];
      return [r.label, ...lead, ...detail];
    }
    if (plMode === "overall") return [r.label, ...detail, r.shipComm ?? null];
    return [r.label, ...detail];
  };

  const handleExport = useCallback(() => {
    const dataRows = displayedRows.map(rowToExport);
    const modeSlug = plMode === "overall" ? "Overall" : plMode === "jnm" ? "JNM" : "TWIF";
    downloadSummaryXlsx(
      [headers, ...dataRows],
      isMonth ? "Monthly Summary" : "Weekly Summary",
      `${isMonth ? "Monthly" : "Weekly"}_PL_${modeSlug}_Summary_FY${year}.xlsx`
    );
  }, [displayedRows, headers, isMonth, year, plMode]);

  const handleExportPdf = useCallback(() => {
    const dataRows = displayedRows.map(rowToExport);
    const modeSlug = plMode === "overall" ? "Overall" : plMode === "jnm" ? "JNM" : "TWIF";
    downloadSummaryPdf({
      headers,
      dataRows,
      title: `${title} P&L Summary`,
      subtitle: `${subtitle} · FY 20${year}`,
      filename: `${isMonth ? "Monthly" : "Weekly"}_PL_${modeSlug}_Summary_FY${year}.pdf`,
    });
  }, [displayedRows, headers, isMonth, year, plMode, title, subtitle]);

  const handlePrint = useCallback(() => {
    const el = document.createElement("div");
    if (summaryRef.current) el.appendChild(summaryRef.current.cloneNode(true));
    if (printRef.current) el.appendChild(printRef.current.cloneNode(true));
    printElement(el, { title, subtitle: `${subtitle} · FY 20${year}` });
  }, [title, subtitle, year]);

  if (!hasJnmPlAccess) return <JnmAccessDenied />;

  const emptyMessage = !summaryRows.length
    ? `No ${isMonth ? "monthly" : "weekly"} P&L data for FY 20${year}.`
    : !displayedRows.length
    ? `No rows match the selected ${isMonth ? "months" : "weeks"}.`
    : null;

  return (
    <SummaryShell
      title={title}
      subtitle={subtitle}
      year={year}
      availableYears={availableYears}
      onYearChange={setYear}
      loading={loading}
      error={error}
      empty={emptyMessage}
      onExport={handleExport}
      onExportPdf={handleExportPdf}
      exportDisabled={loading || !!error || !displayedRows.length}
      onPrint={handlePrint}
      summaryRef={summaryRef}
      headerActions={<PlModeToggle value={plMode} onChange={setPlMode} />}
      filterBar={summaryRows.length > 0 ? (
        <PeriodFilterDropdown
          placeholder={isMonth ? "All Months" : "All Weeks"}
          options={periodOptions}
          value={periodFilter}
          onChange={setPeriodFilter}
          selectedLabel={isMonth ? "months" : "weeks"}
        />
      ) : null}
      summaryBar={!loading && !error && !emptyMessage && summaryRows.length ? (
        <TotalsBar totals={totals} isMonth={isMonth} plMode={plMode} />
      ) : null}
    >
      <div className="lg:hidden space-y-3">
        {displayedRows.map((r) => (
          <PlSummaryMobileCard key={r.key} row={r} isMonth={isMonth} plMode={plMode} jngShipVal={jngShipVal} />
        ))}
      </div>
      <PlTableScrollWrap ref={printRef} className={`hidden lg:block ${PL_SUMMARY_TABLE_SCROLL} rounded-xl border border-gray-200 bg-white shadow-sm`}>
        <table className="w-max min-w-full text-[13px] border-collapse">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={h} className={plSummaryThClass(i === 0)}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((r, idx) => {
              const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";
              const otifColor = r.otif == null ? "" : r.otif >= 90 ? "text-green-600" : r.otif >= 70 ? "text-amber-500" : "text-red-500";
              const projCore = [
                <td key="projCount" className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs">{r.projCount || "—"}</td>,
                <td key="projPoValue" className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs text-indigo-700">{fmtUsd(r.projPoValue)}</td>,
                <td key="projShipped" className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs text-green-700">{fmtUsd(r.projShipped)}</td>,
                <td key="projBalance" className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs text-amber-600">{fmtUsd(r.projBalance)}</td>,
                <td key="otif" className={`px-3 py-2 border-r border-gray-100 text-right font-mono text-xs font-semibold ${otifColor}`}>{fmtPct(r.otif)}</td>,
              ];
              const projCommCells = plMode === "overall"
                ? [
                    <td key="jnmProjComm" className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs text-indigo-600">{fmtUsd(r.jnmProjComm)}</td>,
                    <td key="jngProjComm" className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs text-violet-600">{fmtUsd(r.jngProjComm)}</td>,
                    <td key="overallProjComm" className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs font-semibold text-indigo-700">{fmtUsd(r.overallProjComm)}</td>,
                  ]
                : [
                    <td key="projComm" className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs font-semibold text-indigo-700">{fmtUsd(r.projComm)}</td>,
                  ];
              const shipCore = [
                <td key="shipCount" className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs">{r.shipCount || "—"}</td>,
                <td key="shipPoValue" className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs text-blue-700">{fmtUsd(r.shipPoValue)}</td>,
                <td key="shipShipped" className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs text-green-700">{fmtUsd(r.shipShipped)}</td>,
                <td key="shipBalance" className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs text-amber-600">{fmtUsd(r.shipBalance)}</td>,
              ];
              const shipCommCells = plMode === "overall"
                ? [
                    <td key="jnmShipComm" className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs text-indigo-600">{fmtUsd(r.jnmShipComm)}</td>,
                    <td key="jngShipComm" className={`px-3 py-2 text-right font-mono text-xs text-violet-600 ${isMonth ? "border-r border-gray-100" : ""}`}>{fmtUsd(jngShipVal(r))}</td>,
                  ]
                : [
                    <td key="shipComm" className="px-3 py-2 text-right font-mono text-xs font-semibold text-indigo-800">{fmtUsd(r.shipComm)}</td>,
                  ];
              const leadCommCell = (
                <td key="leadComm" className="px-3 py-2 border-r border-gray-100 text-right font-mono text-xs font-semibold text-indigo-800">{fmtUsd(r.shipComm)}</td>
              );
              const overallWeekComm = (
                <td key="shipComm" className="px-3 py-2 text-right font-mono text-xs font-semibold text-indigo-800">{fmtUsd(r.shipComm)}</td>
              );
              const cells = isMonth
                ? [
                    <td key="label" className="px-3 py-2 border-r border-gray-100 font-medium text-black whitespace-nowrap">{r.label}</td>,
                    leadCommCell,
                    ...projCore,
                    ...projCommCells,
                    ...shipCore,
                    ...shipCommCells,
                  ]
                : [
                    <td key="label" className="px-3 py-2 border-r border-gray-100 font-medium text-black whitespace-nowrap">{r.label}</td>,
                    ...projCore,
                    ...projCommCells,
                    ...shipCore,
                    ...shipCommCells,
                    ...(plMode === "overall" ? [overallWeekComm] : []),
                  ];
              return (
                <tr key={r.key} className={`${rowBg} border-b border-gray-100`}>
                  {cells}
                </tr>
              );
            })}
          </tbody>
        </table>
      </PlTableScrollWrap>
    </SummaryShell>
  );
}
