import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import { supabase } from "../../lib/supabase";
import {
  normStr, roundComm, poOrderVal, poShippedVal, sumSingleComm, sumOverallComm,
  getMonthWeekInfo, getMonthWeekRange,
} from "../../utils/plDataHelpers";

const MODE_SUFFIX = { jng: "TWIF", jnm: "JNM", overall: "Overall" };

/** Commission amount for a set of POs, respecting the page's P&L mode (JNG/JNM/Overall) —
 * same mode-switching logic ExpensesSummary.jsx uses for the main Summary table. */
function commAmount(entries, baseFn, plMode, getJngCommPct, getJnmCommPct) {
  const pairs = entries.map((p) => [null, p]);
  if (plMode === "overall") {
    return sumOverallComm(pairs, baseFn, getJnmCommPct, getJngCommPct).overall;
  }
  const getCommPct = plMode === "jnm" ? getJnmCommPct : getJngCommPct;
  return sumSingleComm(pairs, baseFn, getCommPct);
}

const UNMAPPED_GROUP = "Unmapped Buyers";

const fmtPct = (n) =>
  n == null || n === "" || isNaN(n) ? "" : `${Number(n).toFixed(2)}%`;

const ymKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Day-of-month week count (1-7, 8-14, 15-21, 22-28, 29-end) — same bucketing as the MIS Summary tab. */
function weeksInMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return Math.ceil(lastDay / 7);
}

const ZERO_METRICS = { salesShipped: 0, incomeAboveSales: 0, backlogLate: 0, pendingIncomeBacklog: 0, incomePctSales: null, futureOpenOrders: 0, totalOrders: 0 };

/** Minimal single/multi-select dropdown, modeled on WeeklyPoSchedule.jsx's local Dropdown. */
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
  const displayLabel = multiSelect
    ? (selectedCount === 0 ? null : selectedCount === 1 ? value[0] : `${selectedCount} ${selectedLabel} selected`)
    : value;

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
            : "border-gray-300 bg-gray-50 hover:bg-white hover:border-gray-400 cursor-pointer"}`}
      >
        <span className="text-black">{displayLabel || placeholder}</span>
        <div className="flex items-center gap-1 shrink-0">
          {multiSelect && selectedCount > 0 && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              title="Clear selection"
              className="w-4 h-4 rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-500 flex items-center justify-center text-black transition-colors"
            >
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
          )}
          <svg className={`w-3 h-3 text-black transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter…" className="border-none outline-none bg-transparent text-xs w-full text-black" />
          </div>
          <div className="max-h-[220px] overflow-y-auto py-1">
            {multiSelect ? (
              <>
                <div onClick={() => onChange([])} className={`px-3 py-2 text-xs cursor-pointer ${selectedCount === 0 ? "text-blue-600 font-semibold bg-blue-50" : "text-black hover:bg-gray-50"}`}>{placeholder}</div>
                <div className="h-px bg-gray-100 my-0.5" />
                {filtered.map((opt) => {
                  const sel = value?.includes(opt);
                  return (
                    <div key={opt} onClick={() => toggleMulti(opt)} className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer ${sel ? "bg-blue-50 text-blue-700 font-semibold" : "text-black hover:bg-gray-50"}`}>
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${sel ? "bg-blue-500 border-blue-500" : "border-gray-300"}`}>
                        {sel && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                      </div>
                      {opt}
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                <div onClick={() => pickSingle("")} className={`px-3 py-2 text-xs cursor-pointer ${!value ? "text-blue-600 font-semibold bg-blue-50" : "text-black hover:bg-gray-50"}`}>{placeholder}</div>
                <div className="h-px bg-gray-100 my-0.5" />
                {filtered.map((opt) => (
                  <div key={opt} onClick={() => pickSingle(opt)} className={`px-3 py-2 text-xs cursor-pointer ${value === opt ? "bg-blue-50 text-blue-600 font-semibold" : "text-black hover:bg-gray-50"}`}>{opt}</div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Group shipped/open PO rows into per-buyer PO buckets, FY-wide (no month/week split).
 * Uses the same line-level dedup as plDataHelpers' buildWeeks/buildMonths/buildMonthWeeks —
 * a partially-shipped line appears in both APIs, so shipped rows are only added if not
 * already covered by an open row for that PO, to avoid double-counting order value. */
function buildBuyerPos(rows, openRows) {
  const map = {};
  const displayNames = {};
  const ensure = (buyerKey, rawCustomer) => {
    if (!map[buyerKey]) map[buyerKey] = { shippedPos: {}, openPos: {} };
    if (!displayNames[buyerKey] && rawCustomer) displayNames[buyerKey] = rawCustomer.trim();
  };

  rows.forEach((r) => {
    const buyerKey = normStr(r.customer);
    if (!buyerKey) return;
    ensure(buyerKey, r.customer);
    const pk = `${(r.vendor || "").trim()}||${(r.poNo || "").trim()}`;
    if (!map[buyerKey].shippedPos[pk]) {
      map[buyerKey].shippedPos[pk] = { customer: (r.customer || "").trim(), vendor: (r.vendor || "").trim(), poNo: (r.poNo || "").trim(), lines: [] };
    }
    map[buyerKey].shippedPos[pk].lines.push(r);
  });

  const addToOpenPos = (r, skipIfSeen) => {
    const buyerKey = normStr(r.customer);
    if (!buyerKey) return;
    ensure(buyerKey, r.customer);
    const pk = `${(r.vendor || "").trim()}||${(r.poNo || "").trim()}`;
    if (!map[buyerKey].openPos[pk]) {
      map[buyerKey].openPos[pk] = { customer: (r.customer || "").trim(), vendor: (r.vendor || "").trim(), poNo: (r.poNo || "").trim(), target: r.target, lines: [], _seen: new Set() };
    }
    const entry = map[buyerKey].openPos[pk];
    const lineKey = `${(r.item || "").trim()}||${r.orderQty || 0}||${r.orderPrice || 0}`;
    if (skipIfSeen && entry._seen.has(lineKey)) return;
    entry._seen.add(lineKey);
    entry.lines.push(r);
  };
  openRows.forEach((r) => addToOpenPos(r, false));
  rows.forEach((r) => addToOpenPos(r, true));

  Object.values(map).forEach((b) =>
    Object.values(b.openPos).forEach((po) => delete po._seen)
  );

  return { buckets: map, displayNames };
}

/**
 * Backlog(Late) / Future Open Orders split open POs (not shipped POs) by target month
 * vs. today's month: target in the current month or earlier = Late, later = Future.
 */
function computeBuyerMetrics(bucket, plMode, getJngCommPct, getJnmCommPct, currentYm) {
  const shippedEntries = Object.values(bucket?.shippedPos || {});
  const openEntries = Object.values(bucket?.openPos || {});

  const lateEntries = [];
  const futureEntries = [];
  openEntries.forEach((p) => {
    const poYm = p.target ? ymKey(new Date(p.target)) : null;
    if (poYm && poYm <= currentYm) lateEntries.push(p);
    else futureEntries.push(p);
  });

  const salesShipped = roundComm(shippedEntries.reduce((s, p) => s + poShippedVal(p), 0));
  const backlogLate = roundComm(lateEntries.reduce((s, p) => s + poOrderVal(p), 0));
  const futureOpenOrders = roundComm(futureEntries.reduce((s, p) => s + poOrderVal(p), 0));
  const totalOrders = roundComm(salesShipped + backlogLate + futureOpenOrders);

  const incomeAboveSales = commAmount(shippedEntries, (p) => poShippedVal(p), plMode, getJngCommPct, getJnmCommPct);
  const pendingIncomeBacklog = commAmount(lateEntries, (p) => poOrderVal(p), plMode, getJngCommPct, getJnmCommPct);

  const incomePctSales = salesShipped > 0 ? (incomeAboveSales / salesShipped) * 100 : null;

  return { salesShipped, incomeAboveSales, backlogLate, pendingIncomeBacklog, incomePctSales, futureOpenOrders, totalOrders };
}

function sumMetrics(list) {
  const sum = (fn) => roundComm(list.reduce((s, m) => s + (fn(m) || 0), 0));
  const salesShipped = sum((m) => m.salesShipped);
  const incomeAboveSales = sum((m) => m.incomeAboveSales);
  const backlogLate = sum((m) => m.backlogLate);
  const pendingIncomeBacklog = sum((m) => m.pendingIncomeBacklog);
  const futureOpenOrders = sum((m) => m.futureOpenOrders);
  const totalOrders = sum((m) => m.totalOrders);
  const incomePctSales = salesShipped > 0 ? (incomeAboveSales / salesShipped) * 100 : null;
  return { salesShipped, incomeAboveSales, backlogLate, pendingIncomeBacklog, incomePctSales, futureOpenOrders, totalOrders };
}

/**
 * Group shipped/open PO rows into per-buyer, per-month, per-day-of-month-week buckets
 * (Week-1 = days 1-7 … Week-5 = 29-end, resetting every month — same bucketing as the
 * MIS Summary tab's `buildMonthWeeks`, just also split by buyer). Same line-level dedup
 * pattern as buildBuyerPos (open rows first, shipped rows skip-if-seen).
 */
function buildBuyerMonthWeeks(rows, openRows) {
  const map = {}; // buyerKey -> monthKey -> weekNumber -> { shippedPos, openPos }

  const ensure = (buyerKey, monthKey, week) => {
    if (!map[buyerKey]) map[buyerKey] = {};
    if (!map[buyerKey][monthKey]) map[buyerKey][monthKey] = {};
    if (!map[buyerKey][monthKey][week]) map[buyerKey][monthKey][week] = { shippedPos: {}, openPos: {} };
  };

  rows.forEach((r) => {
    if (!r.shippedDate) return;
    const info = getMonthWeekInfo(r.shippedDate);
    if (!info) return;
    const buyerKey = normStr(r.customer);
    if (!buyerKey) return;
    ensure(buyerKey, info.monthKey, info.week);
    const bucket = map[buyerKey][info.monthKey][info.week];
    const pk = `${(r.vendor || "").trim()}||${(r.poNo || "").trim()}`;
    if (!bucket.shippedPos[pk]) bucket.shippedPos[pk] = { customer: (r.customer || "").trim(), vendor: (r.vendor || "").trim(), poNo: (r.poNo || "").trim(), lines: [] };
    bucket.shippedPos[pk].lines.push(r);
  });

  const addToOpenPos = (r, skipIfSeen) => {
    if (!r.target) return;
    const info = getMonthWeekInfo(r.target);
    if (!info) return;
    const buyerKey = normStr(r.customer);
    if (!buyerKey) return;
    ensure(buyerKey, info.monthKey, info.week);
    const bucket = map[buyerKey][info.monthKey][info.week];
    const pk = `${(r.vendor || "").trim()}||${(r.poNo || "").trim()}`;
    if (!bucket.openPos[pk]) bucket.openPos[pk] = { customer: (r.customer || "").trim(), vendor: (r.vendor || "").trim(), poNo: (r.poNo || "").trim(), lines: [], _seen: new Set() };
    const entry = bucket.openPos[pk];
    const lineKey = `${(r.item || "").trim()}||${r.orderQty || 0}||${r.orderPrice || 0}`;
    if (skipIfSeen && entry._seen.has(lineKey)) return;
    entry._seen.add(lineKey);
    entry.lines.push(r);
  };
  openRows.forEach((r) => addToOpenPos(r, false));
  rows.forEach((r) => addToOpenPos(r, true));

  Object.values(map).forEach((byMonth) =>
    Object.values(byMonth).forEach((byWeek) =>
      Object.values(byWeek).forEach((wk) => Object.values(wk.openPos).forEach((po) => delete po._seen))
    )
  );

  return map;
}

/**
 * Per-week metrics for one buyer's bucket. Backlog(Late)/Future Open Orders/Pending
 * Income are resolved per-column here: a week whose range has already ended (on/before
 * today) puts its open-PO order value under Late; a week still ahead puts it under
 * Future — so each week column is internally consistent, and summing Late across all
 * "ended" weeks (or Future across all "upcoming" weeks) reproduces the Yearly totals.
 */
function computeWeekMetrics(bucket, plMode, getJngCommPct, getJnmCommPct, weekEnd, today) {
  const shippedEntries = Object.values(bucket?.shippedPos || {});
  const openEntries = Object.values(bucket?.openPos || {});
  const isLateWeek = weekEnd <= today;

  const salesShipped = roundComm(shippedEntries.reduce((s, p) => s + poShippedVal(p), 0));
  const openOrderValue = roundComm(openEntries.reduce((s, p) => s + poOrderVal(p), 0));
  const backlogLate = isLateWeek ? openOrderValue : 0;
  const futureOpenOrders = isLateWeek ? 0 : openOrderValue;
  const totalOrders = roundComm(salesShipped + backlogLate + futureOpenOrders);

  const incomeAboveSales = commAmount(shippedEntries, (p) => poShippedVal(p), plMode, getJngCommPct, getJnmCommPct);
  const pendingIncomeBacklog = isLateWeek
    ? commAmount(openEntries, (p) => poOrderVal(p), plMode, getJngCommPct, getJnmCommPct)
    : 0;
  const incomePctSales = salesShipped > 0 ? (incomeAboveSales / salesShipped) * 100 : null;

  return { salesShipped, incomeAboveSales, backlogLate, pendingIncomeBacklog, incomePctSales, futureOpenOrders, totalOrders };
}

const ROWS_BASE = [
  { key: "salesShipped", label: "Sales Global(Shipped)", fmt: "currency" },
  { key: "incomeAboveSales", label: "Income from above Sales ({MODE})", fmt: "currency" },
  { key: "backlogLate", label: "Backlog(Late)", fmt: "currency" },
  { key: "pendingIncomeBacklog", label: "Pending Income from Backlog ({MODE})", fmt: "currency" },
  { key: "incomePctSales", label: "Income % to Sales", fmt: "pct" },
  { key: "futureOpenOrders", label: "Future Open Orders", fmt: "currency" },
  { key: "totalOrders", label: "Total Orders", fmt: "currency" },
];

export default function MisDivision({ year, months, rows, openRows, buyerRateMap, commissionMap, rateMap, plMode, showInr, inrRate }) {
  const [mapping, setMapping] = useState([]);
  const [mappingError, setMappingError] = useState(null);
  const [viewMode, setViewMode] = useState("yearly");
  const [selectedBuyers, setSelectedBuyers] = useState([]);

  const metricRows = useMemo(() => {
    const suffix = MODE_SUFFIX[plMode] || "TWIF";
    return ROWS_BASE.map((r) => ({ ...r, label: r.label.replace("{MODE}", suffix) }));
  }, [plMode]);
  const [selectedDivHead, setSelectedDivHead] = useState("");

  // Single source of truth: finance_buyer_merchant drives both the Handler-style
  // column grouping (via merchant_name) and the Div. Head filter options/narrowing.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("finance_buyer_merchant")
      .select("*")
      .order("sort_order")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setMappingError(error.message); return; }
        setMapping(data || []);
      });
    return () => { cancelled = true; };
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

  const fmtCurrency = useCallback((n) => {
    if (n == null || n === "" || isNaN(n)) return "";
    const rate = parseFloat(inrRate) || 0;
    const v = showInr ? Number(n) * rate : Number(n);
    const sym = showInr ? "₹" : "$";
    return `${sym}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [showInr, inrRate]);

  const { buckets, displayNames } = useMemo(() => buildBuyerPos(rows, openRows), [rows, openRows]);

  const groups = useMemo(() => {
    const byHandler = {};
    const handlerOrder = [];
    const mappedKeys = new Set();

    mapping.forEach((row) => {
      const key = normStr(row.buyer_name);
      mappedKeys.add(key);
      if (!byHandler[row.merchant_name]) {
        byHandler[row.merchant_name] = [];
        handlerOrder.push(row.merchant_name);
      }
      byHandler[row.merchant_name].push({ key, label: row.buyer_name });
    });

    const unmapped = Object.keys(buckets)
      .filter((key) => !mappedKeys.has(key))
      .sort((a, b) => (displayNames[a] || a).localeCompare(displayNames[b] || b))
      .map((key) => ({ key, label: displayNames[key] || key }));

    const result = handlerOrder.map((handler) => ({ handler, buyers: byHandler[handler] }));
    if (unmapped.length) result.push({ handler: UNMAPPED_GROUP, buyers: unmapped });
    return result;
  }, [mapping, buckets, displayNames]);

  const buyerOptions = useMemo(() => {
    const names = new Set();
    groups.forEach((g) => g.buyers.forEach((b) => names.add(b.label)));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [groups]);

  const divHeadOptions = useMemo(() => {
    const seen = new Set();
    const list = [];
    mapping.forEach((row) => {
      if (!seen.has(row.merchant_name)) { seen.add(row.merchant_name); list.push(row.merchant_name); }
    });
    return list;
  }, [mapping]);

  const divHeadBuyerKeysMap = useMemo(() => {
    const map = {};
    mapping.forEach((row) => {
      if (!map[row.merchant_name]) map[row.merchant_name] = new Set();
      map[row.merchant_name].add(normStr(row.buyer_name));
    });
    return map;
  }, [mapping]);

  const visibleGroups = useMemo(() => {
    const selectedKeySet = selectedBuyers.length ? new Set(selectedBuyers.map(normStr)) : null;
    const activeDivHeadKeys = selectedDivHead ? (divHeadBuyerKeysMap[selectedDivHead] || new Set()) : null;
    return groups
      .map((g) => ({
        handler: g.handler,
        buyers: g.buyers.filter((b) => {
          if (activeDivHeadKeys && !activeDivHeadKeys.has(b.key)) return false;
          if (selectedKeySet && !selectedKeySet.has(b.key)) return false;
          return true;
        }),
      }))
      .filter((g) => g.buyers.length > 0);
  }, [groups, selectedDivHead, divHeadBuyerKeysMap, selectedBuyers]);

  const currentYm = useMemo(() => ymKey(new Date()), []);

  const buyerMetrics = useMemo(() => {
    const map = {};
    groups.forEach((g) => g.buyers.forEach((b) => {
      map[b.key] = computeBuyerMetrics(buckets[b.key], plMode, getJngCommPct, getJnmCommPct, currentYm);
    }));
    return map;
  }, [groups, buckets, plMode, getJngCommPct, getJnmCommPct, currentYm]);

  const visibleBuyerKeys = useMemo(() => {
    const set = new Set();
    visibleGroups.forEach((g) => g.buyers.forEach((b) => set.add(b.key)));
    return set;
  }, [visibleGroups]);

  const totalMetrics = useMemo(() => sumMetrics(
    Object.entries(buyerMetrics).filter(([k]) => visibleBuyerKeys.has(k)).map(([, v]) => v)
  ), [buyerMetrics, visibleBuyerKeys]);

  // Weekly view data — only built when needed. monthsData mirrors ExpensesSummary.jsx's
  // 12-FY-months layout, each with its own day-of-month week count.
  const monthsData = useMemo(
    () => months.map((m) => ({ key: m.key, label: m.label, weekCount: weeksInMonth(m.key) })),
    [months]
  );

  const buyerMonthWeeks = useMemo(
    () => (viewMode === "weekly" ? buildBuyerMonthWeeks(rows, openRows) : {}),
    [viewMode, rows, openRows]
  );
  const today = useMemo(() => new Date(), []);

  const buyerMonthWeekMetrics = useMemo(() => {
    if (viewMode !== "weekly") return {};
    const map = {};
    visibleGroups.forEach((g) => g.buyers.forEach((b) => {
      map[b.key] = {};
      monthsData.forEach((m) => {
        map[b.key][m.key] = {};
        for (let w = 1; w <= m.weekCount; w++) {
          const bucket = ((buyerMonthWeeks[b.key] || {})[m.key] || {})[w];
          const weekEnd = getMonthWeekRange(m.key, w).end;
          map[b.key][m.key][w] = computeWeekMetrics(bucket, plMode, getJngCommPct, getJnmCommPct, weekEnd, today);
        }
      });
    }));
    return map;
  }, [viewMode, visibleGroups, monthsData, buyerMonthWeeks, plMode, getJngCommPct, getJnmCommPct, today]);

  const buyerMonthTotal = useMemo(() => {
    if (viewMode !== "weekly") return {};
    const map = {};
    Object.entries(buyerMonthWeekMetrics).forEach(([buyerKey, byMonth]) => {
      map[buyerKey] = {};
      Object.entries(byMonth).forEach(([monthKey, byWeek]) => {
        map[buyerKey][monthKey] = sumMetrics(Object.values(byWeek));
      });
    });
    return map;
  }, [viewMode, buyerMonthWeekMetrics]);

  const flatVisibleBuyers = useMemo(() => {
    const list = [];
    visibleGroups.forEach((g) => g.buyers.forEach((b) => list.push(b)));
    return list;
  }, [visibleGroups]);

  // Weekly view has no Handler grouping: with no Buyer filter applied, all visible
  // buyers collapse into a single "All" column (summed); picking buyers in the filter
  // shows one column per selected buyer instead.
  const weeklyColumns = useMemo(
    () => (selectedBuyers.length > 0
      ? flatVisibleBuyers.map((b) => ({ key: b.key, label: b.label }))
      : [{ key: "__ALL__", label: "All" }]),
    [selectedBuyers, flatVisibleBuyers]
  );

  const allBuyersMonthWeekMetrics = useMemo(() => {
    if (viewMode !== "weekly" || selectedBuyers.length > 0) return {};
    const map = {};
    monthsData.forEach((m) => {
      map[m.key] = {};
      for (let w = 1; w <= m.weekCount; w++) {
        const cellList = flatVisibleBuyers.map((b) => buyerMonthWeekMetrics[b.key]?.[m.key]?.[w] || ZERO_METRICS);
        map[m.key][w] = sumMetrics(cellList);
      }
    });
    return map;
  }, [viewMode, selectedBuyers, monthsData, flatVisibleBuyers, buyerMonthWeekMetrics]);

  const allBuyersMonthTotal = useMemo(() => {
    if (viewMode !== "weekly" || selectedBuyers.length > 0) return {};
    const map = {};
    monthsData.forEach((m) => {
      const cellList = flatVisibleBuyers.map((b) => buyerMonthTotal[b.key]?.[m.key] || ZERO_METRICS);
      map[m.key] = sumMetrics(cellList);
    });
    return map;
  }, [viewMode, selectedBuyers, monthsData, flatVisibleBuyers, buyerMonthTotal]);

  const getWeeklyCellMetrics = useCallback((columnKey, monthKey, week) => {
    if (columnKey === "__ALL__") return allBuyersMonthWeekMetrics[monthKey]?.[week] || ZERO_METRICS;
    return buyerMonthWeekMetrics[columnKey]?.[monthKey]?.[week] || ZERO_METRICS;
  }, [allBuyersMonthWeekMetrics, buyerMonthWeekMetrics]);

  const getWeeklyMonthTotal = useCallback((columnKey, monthKey) => {
    if (columnKey === "__ALL__") return allBuyersMonthTotal[monthKey] || ZERO_METRICS;
    return buyerMonthTotal[columnKey]?.[monthKey] || ZERO_METRICS;
  }, [allBuyersMonthTotal, buyerMonthTotal]);

  const hasAnyData = Object.keys(buckets).length > 0;
  const hasVisibleData = visibleGroups.length > 0;

  const th = "sticky top-0 z-[3] px-2.5 py-2 text-[10px] font-bold text-black bg-gray-50 whitespace-nowrap border-r border-b border-gray-400 last:border-r-0 text-center";
  const td = "px-2.5 py-1.5 border-r border-gray-300 text-right font-mono text-xs whitespace-nowrap";
  const DIVISION_W = 96;
  const divCell = `${td} text-left sticky left-0 z-[2] min-w-[96px] max-w-[96px] bg-white`;
  const detCell = `${td} text-left sticky z-[2] min-w-[220px] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.15)] bg-white`;
  const totalCell = `${td} sticky z-[2] min-w-[120px] font-semibold bg-indigo-50 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.15)]`;
  const detStyle = { left: DIVISION_W };
  const totalStyle = { left: DIVISION_W + 220 };

  const renderRowCells = (fmt, valueFn) => (
    <>
      <td className={totalCell} style={totalStyle}>{fmt === "pct" ? fmtPct(valueFn(totalMetrics)) : fmtCurrency(valueFn(totalMetrics))}</td>
      {visibleGroups.map((g) => (
        <Fragment key={g.handler}>
          {g.buyers.map((b) => (
            <td key={b.key} className={td}>
              {fmt === "pct" ? fmtPct(valueFn(buyerMetrics[b.key])) : fmtCurrency(valueFn(buyerMetrics[b.key]))}
            </td>
          ))}
        </Fragment>
      ))}
    </>
  );

  const THEAD_ROW_H = 29;
  const thBase = "sticky z-[3] px-2.5 py-2 text-[10px] font-bold text-black bg-gray-50 whitespace-nowrap border-r border-b border-gray-400 last:border-r-0 text-center";
  const th2Style = { top: THEAD_ROW_H };
  const th3Style = { top: THEAD_ROW_H * 2 };

  const renderWeeklyRowCells = (fmt, valueFn) => (
    <>
      <td className={totalCell} style={totalStyle}>{fmt === "pct" ? fmtPct(valueFn(totalMetrics)) : fmtCurrency(valueFn(totalMetrics))}</td>
      {monthsData.map((mo) => (
        <Fragment key={mo.key}>
          {weeklyColumns.map((col) => (
            <Fragment key={col.key}>
              {Array.from({ length: mo.weekCount }, (_, i) => i + 1).map((w) => {
                const m = getWeeklyCellMetrics(col.key, mo.key, w);
                return <td key={w} className={td}>{fmt === "pct" ? fmtPct(valueFn(m)) : fmtCurrency(valueFn(m))}</td>;
              })}
              <td className={`${td} font-semibold`}>
                {(() => {
                  const m = getWeeklyMonthTotal(col.key, mo.key);
                  return fmt === "pct" ? fmtPct(valueFn(m)) : fmtCurrency(valueFn(m));
                })()}
              </td>
            </Fragment>
          ))}
        </Fragment>
      ))}
    </>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-black">Shipped FY {year} - YTD</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown
            placeholder="All Buyers"
            options={buyerOptions}
            value={selectedBuyers}
            onChange={setSelectedBuyers}
            multiSelect
            selectedLabel="buyers"
          />
          <Dropdown
            placeholder="All Div Heads"
            options={divHeadOptions}
            value={selectedDivHead}
            onChange={setSelectedDivHead}
          />
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden shrink-0">
            {[["yearly", "Yearly"], ["weekly", "Weekly"]].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${viewMode === mode ? "bg-indigo-600 text-white" : "bg-white text-black hover:bg-gray-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {mappingError && (
        <div className="mb-3 px-4 py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">
          Couldn&apos;t load buyer→div-head mapping: {mappingError}
        </div>
      )}
      {!hasAnyData ? (
        <div className="text-center py-16 text-black/40 text-sm">No shipped or open PO data for FY {year}.</div>
      ) : !hasVisibleData ? (
        <div className="text-center py-16 text-black/40 text-sm">No buyers match the selected filters.</div>
      ) : viewMode === "yearly" ? (
        <div className="overflow-x-auto rounded-xl border border-gray-300 bg-white shadow-sm">
          <table className="w-max text-[13px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${th} text-left sticky left-0 z-[5] min-w-[96px] max-w-[96px]`} rowSpan={2}>Division</th>
                <th className={`${th} text-left sticky z-[5] min-w-[220px] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.15)]`} style={detStyle} rowSpan={2}>Details</th>
                <th className={`${th} sticky z-[5] min-w-[120px] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.15)]`} style={totalStyle} rowSpan={2}>Total</th>
                {visibleGroups.map((g) => (
                  <th key={g.handler} className={th} colSpan={g.buyers.length}>{g.handler}</th>
                ))}
              </tr>
              <tr>
                {visibleGroups.map((g) => (
                  <Fragment key={g.handler}>
                    {g.buyers.map((b) => <th key={b.key} className={th}>{b.label}</th>)}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricRows.map((row) => (
                <tr key={row.key} className="border-b border-gray-300">
                  <td className={divCell}>Global</td>
                  <td className={detCell} style={detStyle}>{row.label}</td>
                  {renderRowCells(row.fmt, (m) => m[row.key])}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-300 bg-white shadow-sm">
          <table className="w-max text-[13px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${th} text-left sticky left-0 z-[5] min-w-[96px] max-w-[96px]`} rowSpan={3}>Division</th>
                <th className={`${th} text-left sticky z-[5] min-w-[220px] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.15)]`} style={detStyle} rowSpan={3}>Details</th>
                <th className={`${th} sticky z-[5] min-w-[120px] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.15)]`} style={totalStyle} rowSpan={3}>Total</th>
                {monthsData.map((mo) => (
                  <th key={mo.key} className={th} colSpan={weeklyColumns.length * (mo.weekCount + 1)}>{mo.label}</th>
                ))}
              </tr>
              <tr>
                {monthsData.map((mo) => (
                  <Fragment key={mo.key}>
                    {weeklyColumns.map((col) => (
                      <th key={`${mo.key}-${col.key}`} className={thBase} style={th2Style} colSpan={mo.weekCount + 1}>{col.label}</th>
                    ))}
                  </Fragment>
                ))}
              </tr>
              <tr>
                {monthsData.map((mo) => (
                  <Fragment key={mo.key}>
                    {weeklyColumns.map((col) => (
                      <Fragment key={col.key}>
                        {Array.from({ length: mo.weekCount }, (_, i) => i + 1).map((w) => (
                          <th key={w} className={thBase} style={th3Style}>{`Week-${w}`}</th>
                        ))}
                        <th className={thBase} style={th3Style}>Total</th>
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricRows.map((row) => (
                <tr key={row.key} className="border-b border-gray-300">
                  <td className={divCell}>Global</td>
                  <td className={detCell} style={detStyle}>{row.label}</td>
                  {renderWeeklyRowCells(row.fmt, (m) => m[row.key])}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
