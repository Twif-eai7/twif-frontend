import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useShippedPO, labelToSlug, extractMonthKey } from "../../hooks/useShippedPoSummary";
import { isShippedPoOnTime } from "../../utils/shippedPoTiming";
import { exportToXLSX, exportToPDF } from '../../utils/poExport';

// ─── constants ───────────────────────────────────────────────────────────────
const COLS = [
  { key: "customer",      label: "Customer",    sticky: true,  num: false, w: "min-w-[190px] w-[190px]" },
  { key: "vendor",        label: "Vendor",       sticky: false, num: false, w: "min-w-[160px]" },
  { key: "poNo",          label: "PO No.",       sticky: false, num: false, w: "min-w-[110px]" },
  { key: "item",          label: "Item",         sticky: false, num: false, w: "min-w-[240px]" },
  { key: "orderQty",      label: "Ord Qty",      sticky: false, num: true,  w: "min-w-[80px]" },
  { key: "orderPrice",    label: "Unit Price",   sticky: false, num: true,  w: "min-w-[90px]",  cur: true },
  { key: "orderValue",    label: "Order Value",  sticky: false, num: true,  w: "min-w-[120px]", cur: true },
  { key: "orderDate",     label: "Order Date",   sticky: false, num: false, w: "min-w-[100px]" },
  { key: "shippedQty",    label: "Shp Qty",      sticky: false, num: true,  w: "min-w-[80px]" },
  { key: "shippedValue",  label: "Shipped $",    sticky: false, num: true,  w: "min-w-[110px]", cur: true },
  { key: "shippedDate",   label: "Shp Date",     sticky: false, num: false, w: "min-w-[100px]" },
  { key: "balanceQty",    label: "Bal Qty",      sticky: false, num: true,  w: "min-w-[80px]" },
  { key: "balanceValue",  label: "Balance $",    sticky: false, num: true,  w: "min-w-[110px]", cur: true },
  { key: "target",        label: "Target",       sticky: false, num: false, w: "min-w-[100px]" },
  { key: "totalBusiness", label: "Total Biz $",  sticky: false, num: true,  w: "min-w-[120px]", cur: true },
  { key: "status",        label: "Status",       sticky: false, num: false, w: "min-w-[80px]" },
];

const fmt = (n, cur) =>
  !n
    ? "—"
    : cur
    ? "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Number(n).toLocaleString("en-US");

// ─── Dropdown ────────────────────────────────────────────────────────────────
function Dropdown({ icon, placeholder, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [hi, setHi] = useState(0);
  const ref = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch(""); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(
    () => options.filter((o) => o.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  );

  // Reset highlight to placeholder row when search changes or dropdown opens
  useEffect(() => { setHi(0); }, [search, open]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.querySelectorAll("[data-opt]")[hi]?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  const pick = (val) => { onChange(val); setOpen(false); setSearch(""); };

  const onKey = (e) => {
    const total = 1 + filtered.length;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi(i => Math.min(i + 1, total - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (hi === 0) pick(""); else pick(filtered[hi - 1]); }
    else if (e.key === "Escape") { setOpen(false); setSearch(""); }
  };

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={() => options.length && setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium min-w-[148px] justify-between transition-all
          ${!options.length
            ? "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"
            : open
            ? "border-blue-500 bg-white shadow-[0_0_0_3px_rgba(59,130,246,0.12)]"
            : "border-gray-300 bg-gray-50 hover:bg-white hover:border-gray-400 cursor-pointer"
          }`}
      >
        <span className="flex items-center gap-2">
          {icon}
          <span className={value ? "text-gray-800" : "text-gray-400"}>{value || placeholder}</span>
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 shrink-0 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-[calc(100%+5px)] left-0 z-[999] bg-white border border-gray-200 rounded-lg shadow-lg min-w-[200px] max-w-[280px] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
            <svg className="w-3 h-3 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onKey}
              placeholder="Type to filter…"
              className="border-none outline-none bg-transparent text-xs text-gray-700 w-full"
            />
          </div>
          <div ref={listRef} className="max-h-[220px] overflow-y-auto py-1">
            <div
              data-opt
              onMouseEnter={() => setHi(0)}
              onClick={() => pick("")}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors
                ${hi === 0 ? "bg-blue-50 text-blue-600 font-semibold" : !value ? "text-blue-600 font-medium hover:bg-gray-50" : "text-gray-400 hover:bg-gray-50"}`}
            >
              {placeholder}
            </div>
            <div className="h-px bg-gray-100 my-0.5" />
            {filtered.map((opt, i) => (
              <div
                key={opt}
                data-opt
                onMouseEnter={() => setHi(i + 1)}
                onClick={() => pick(opt)}
                className={`px-3 py-2 text-sm cursor-pointer transition-colors
                  ${hi === i + 1 ? "bg-blue-50 text-blue-600 font-semibold" : value === opt ? "bg-blue-50 text-blue-600 font-semibold" : "text-gray-700 hover:bg-gray-50"}`}
              >
                {opt}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Badge ───────────────────────────────────────────────────────────────────
function Badge({ label = "Shipped" }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
      {label}
    </span>
  );
}

// ─── Chip ────────────────────────────────────────────────────────────────────
function Chip({ label, value, dot }) {
  return (
    <div className="flex items-center gap-2 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-full whitespace-nowrap">
      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
      <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{label}</span>
      <span className="text-[13px] font-bold text-gray-900 font-mono">{value}</span>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function ShippedPoSummary({
  availableYears      = ["26", "27"],
  defaultYear         = "27",
  defaultBuyer        = "",
  defaultMonth        = "",
  defaultMerchant     = "",
  defaultVendor       = "",
  defaultTimingFilter = "",
  merchantList        = [],
  isAdmin             = false,
  onBackToDashboard,
}) {
  const [year, setYear]               = useState(defaultYear);
  const [buyer, setBuyer]             = useState(defaultBuyer);
  const [vendor, setVendor]           = useState(defaultVendor);
  const [merchant, setMerchant] = useState(defaultMerchant);
  // monthFilter is stored as a label ("April 2026") but converted to slug for the API
  const [monthFilter, setMonthFilter] = useState(defaultMonth);
  const [search, setSearch]           = useState("");
  const [sortCol, setSortCol]         = useState(null);
  const [sortDir, setSortDir]         = useState("asc");
  const [collapsed, setCollapsed]     = useState(new Set());
  const [allExpanded, setAllExpanded] = useState(true);
  const [timingFilter, setTimingFilter] = useState(defaultTimingFilter || 'All');
  const [page, setPage]               = useState(1);
  const [exporting, setExporting]     = useState(false);
  const prevYear  = useRef(defaultYear);
  const prevBuyer = useRef(defaultBuyer);
  const PAGE_SIZE = 3;

  // Convert label → slug for server (e.g. "April 2026" → "2026-04")
  const monthSlugForApi = monthFilter ? labelToSlug(monthFilter) : '';

  // ── All server-side filter dimensions go into the hook ──
  const timingActive = timingFilter !== 'All'
  const {
    rows, buyerList, vendorList, monthLabels,
    totalPages, totalCustomers, overall,
    loading, error, refetch, invalidateAll, fetchAllForExport,
  } = useShippedPO({ year, buyer, month: monthSlugForApi, merchant, page: timingActive ? 1 : page, pageSize: timingActive ? 99999 : PAGE_SIZE, isAdmin });

  // Client-side filter predicate — shared by the on-screen table (filteredRows,
  // below) and the export handler, so a downloaded file can never diverge from
  // what's currently shown on screen.
  const matchesClientFilters = (r) => {
    if (vendor && (r.vendor || "").trim() !== vendor) return false;
    if (timingFilter !== 'All') {
      const onTime = isShippedPoOnTime(r.shippedDate, r.target)
      if (onTime == null) return false
      if (timingFilter === 'Late'    && onTime) return false
      if (timingFilter === 'On Time' && !onTime) return false
    }
    if (search) {
      const s = search.toLowerCase();
      return (
        (r.customer || "").toLowerCase().includes(s) ||
        (r.vendor   || "").toLowerCase().includes(s) ||
        String(r.poNo || "").toLowerCase().includes(s) ||
        (r.item     || "").toLowerCase().includes(s)
      );
    }
    return true;
  };

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = async (type) => {
    setExporting(true);
    try {
      const rawRows = await fetchAllForExport();
      const allRows = rawRows.filter(matchesClientFilters);
      const label = `Shipped_PO_FY${year}`;
      if (type === 'xlsx') exportToXLSX(allRows, `Shipped PO FY${year}`, label);
      else await exportToPDF(allRows, `Shipped Purchase Orders — FY 20${year}`, label);
    } finally {
      setExporting(false);
    }
  };

  // ── Reset client filters when year changes (skip on mount) ─────────────────
  useEffect(() => {
    if (prevYear.current === year) return;
    prevYear.current = year;
    setVendor("");
    setMonthFilter("");
    setSearch("");
    setTimingFilter("All");
    setCollapsed(new Set());
    setAllExpanded(true);
  }, [year]);

  // ── Reset vendor/month/page when buyer changes (skip on mount) ──────────────
  useEffect(() => {
    if (prevBuyer.current === buyer) return;
    prevBuyer.current = buyer;
    setVendor("");
    setMonthFilter("");
    setTimingFilter("All");
    setCollapsed(new Set());
    setAllExpanded(true);
    setPage(1);
  }, [buyer]);

  // ── Reset page when any server filter changes ───────────────────────────────
  useEffect(() => { setPage(1); }, [monthSlugForApi]);

  // ── Reset page when local (client-only) filters change ─────────────────────
  useEffect(() => { setPage(1); }, [vendor, search, timingFilter]);

  // ── When timing filter activates/deactivates, invalidate cache so the new
  //    pageSize (99999 vs PAGE_SIZE) is actually fetched from the server ────────
  const prevTimingActive = useRef(false)
  useEffect(() => {
    if (prevTimingActive.current === timingActive) return
    prevTimingActive.current = timingActive
    refetch()
  }, [timingActive])

  // ── Client-side filtering (vendor + search + timing — everything else is server) ─
  const filteredRows = useMemo(() => rows.filter(matchesClientFilters), [rows, buyer, vendor, search, timingFilter]);

  const gt = useMemo(() => {
    // Use server overall only when no client-side filters are active
    if (!vendor && timingFilter === 'All' && !search) return overall ?? {}
    // Any client-side filter active — recompute totals from filtered rows
    return {
      orderValue:     filteredRows.reduce((s, r) => s + (r.orderValue     || 0), 0),
      shippedValue:   filteredRows.reduce((s, r) => s + (r.shippedValue   || 0), 0),
      cancelledValue: filteredRows.reduce((s, r) => s + (r.cancelledValue || 0), 0),
      balanceValue:   filteredRows.reduce((s, r) => s + (r.balanceValue   || 0), 0),
      totalPoCount:   new Set(filteredRows.map(r => `${r.vendor}__${r.poNo}`)).size,
      totalLineCount: filteredRows.length,
    }
  }, [vendor, timingFilter, search, overall, filteredRows])

  // ── Page-level totals (fallback when server overall isn't available) ─────────
  const totals = useMemo(() => ({
    order:      filteredRows.reduce((s, r) => s + (r.orderValue   || 0), 0),
    shipped:    filteredRows.reduce((s, r) => s + (r.shippedValue || 0), 0),
    balance:    filteredRows.reduce((s, r) => s + (r.balanceValue || 0), 0),
    shippedPOs: new Set(filteredRows.map((r) => `${r.vendor}__${r.poNo}`)).size,
    customers:  new Set(filteredRows.map((r) => (r.customer || "").trim())).size,
  }), [filteredRows]);

  // ── Grouped: customer → vendor → po → rows[] ───────────────────────────────
  const grouped = useMemo(() => {
    const g = {};
    filteredRows.forEach((r) => {
      const cus = (r.customer || "").trim();
      const ven = (r.vendor   || "").trim() || "—";
      const po  = (r.poNo     || "").trim() || "—";
      if (!g[cus])          g[cus] = {};
      if (!g[cus][ven])     g[cus][ven] = {};
      if (!g[cus][ven][po]) g[cus][ven][po] = [];
      g[cus][ven][po].push(r);
    });
    return g;
  }, [filteredRows]);

  const cusKeys      = useMemo(() => Object.keys(grouped).sort(), [grouped]);
  const pagedCusKeys = cusKeys;   // server paginates by customer already

  // ── Sort ────────────────────────────────────────────────────────────────────
  const sortedRows = useCallback((arr) => {
    if (!sortCol) return arr;
    return [...arr].sort((a, b) => {
      let av = a[sortCol] ?? "", bv = b[sortCol] ?? "";
      if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [sortCol, sortDir]);

  const toggleSort = (key) => {
    setSortDir((d) => sortCol === key && d === "asc" ? "desc" : "asc");
    setSortCol(key);
  };

  // ── Collapse ────────────────────────────────────────────────────────────────
  const togglePO = useCallback((gk) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(gk) ? next.delete(gk) : next.add(gk);
      return next;
    });
  }, []);

  const toggleAll = () => {
    if (allExpanded) {
      const all = new Set(
        filteredRows.map((r) =>
          `${(r.customer || "").trim()}__${(r.vendor || "").trim() || "—"}__${(r.poNo || "").trim() || "—"}`
        )
      );
      setCollapsed(all);
      setAllExpanded(false);
    } else {
      setCollapsed(new Set());
      setAllExpanded(true);
    }
  };

  // ── Table rows ──────────────────────────────────────────────────────────────
  const { tableRows, grandTotals } = useMemo(() => {
    const rows = [];
    let grandOV = 0, grandSV = 0, grandBV = 0;
    let grandOQ = 0, grandSQ = 0, grandBQ = 0, grandBiz = 0;

    pagedCusKeys.forEach((cus) => {
      const vendorMap  = grouped[cus];
      const vKeys      = Object.keys(vendorMap).sort();
      let cusOV = 0, cusSV = 0, cusBV = 0, cusPOCount = 0;

      vKeys.forEach((ven) => {
        const poMap = vendorMap[ven];
        const pKeys = Object.keys(poMap).sort();
        let venOV = 0, venSV = 0, venBV = 0;

        pKeys.forEach((po) => {
          const pr     = poMap[po];
          const gk     = `${cus}__${ven}__${po}`;
          const col    = collapsed.has(gk);
          const s      = pr[0];
          const sorted = sortedRows(pr);

          const pOV  = pr.reduce((a, r) => a + (r.orderValue    || 0), 0);
          const pSV  = pr.reduce((a, r) => a + (r.shippedValue  || 0), 0);
          const pBV  = pr.reduce((a, r) => a + (r.balanceValue  || 0), 0);
          const pOQ  = pr.reduce((a, r) => a + (r.orderQty      || 0), 0);
          const pSQ  = pr.reduce((a, r) => a + (r.shippedQty    || 0), 0);
          const pBQ  = pr.reduce((a, r) => a + (r.balanceQty    || 0), 0);
          const pBiz = pr.reduce((a, r) => a + (r.totalBusiness || 0), 0);

          venOV += pOV; venSV += pSV; venBV += pBV;
          cusOV += pOV; cusSV += pSV; cusBV += pBV;
          grandOV += pOV; grandSV += pSV; grandBV += pBV;
          grandOQ += pOQ; grandSQ += pSQ; grandBQ += pBQ;
          grandBiz += pBiz;
          cusPOCount++;

          // PO group row
          rows.push(
            <tr key={`g-${gk}`} onClick={() => togglePO(gk)}
              className="bg-blue-50 cursor-pointer border-t-2 border-blue-200 hover:bg-blue-100 transition-colors">
              {COLS.map((c) => {
                const base = "px-3.5 py-2 border-b border-r border-blue-200 whitespace-nowrap";
                if (c.sticky) return (
                  <td key={c.key} className={`sticky left-0 z-[2] bg-blue-50 hover:bg-blue-100 font-semibold text-[13px] ${base} ${c.w}`}>
                    <svg className={`inline w-4 h-4 mr-1.5 text-blue-500 align-middle transition-transform duration-150 ${col ? "" : "rotate-90"}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <span className="text-blue-600">{cus}</span>
                  </td>
                );
                if (c.key === "vendor")        return <td key={c.key} className={`${base} font-semibold text-[13px] ${c.w}`}>{ven}</td>;
                if (c.key === "poNo")          return <td key={c.key} className={`${base} ${c.w}`}><span className="font-mono font-bold text-blue-700 text-xs">{po}</span></td>;
                if (c.key === "item")          return <td key={c.key} className={`${base} text-gray-400 text-xs ${c.w}`}>{pr.length} line{pr.length > 1 ? "s" : ""} · {s.orderDate || ""}</td>;
                if (c.key === "orderQty")      return <td key={c.key} className={`${base} text-right font-mono text-xs ${c.w}`}>{fmt(pOQ)}</td>;
                if (c.key === "orderValue")    return <td key={c.key} className={`${base} text-right font-mono text-xs font-semibold text-blue-600 ${c.w}`}>{fmt(pOV, true)}</td>;
                if (c.key === "shippedQty")    return <td key={c.key} className={`${base} text-right font-mono text-xs ${c.w}`}>{fmt(pSQ)}</td>;
                if (c.key === "shippedValue")  return <td key={c.key} className={`${base} text-right font-mono text-xs font-semibold text-green-600 ${c.w}`}>{fmt(pSV, true)}</td>;
                if (c.key === "balanceQty")    return <td key={c.key} className={`${base} text-right font-mono text-xs ${c.w}`}>{fmt(pBQ)}</td>;
                if (c.key === "balanceValue")  return <td key={c.key} className={`${base} text-right font-mono text-xs font-semibold text-amber-600 ${c.w}`}>{fmt(pBV, true)}</td>;
                if (c.key === "target")        return <td key={c.key} className={`${base} text-[13px] ${c.w}`}>{s.target || ""}</td>;
                if (c.key === "totalBusiness") return <td key={c.key} className={`${base} text-right font-mono text-xs ${c.w}`}>{fmt(pBiz, true)}</td>;
                if (c.key === "status")        return <td key={c.key} className={`${base} ${c.w}`}><Badge /></td>;
                return <td key={c.key} className={`${base} ${c.w}`} />;
              })}
            </tr>
          );

          // Detail rows
          if (!col) {
            sorted.forEach((r, idx) => {
              const rowBg = idx % 2 ? "bg-gray-50" : "bg-white";
              rows.push(
                <tr key={`d-${gk}-${idx}`} className={`${rowBg} hover:bg-blue-50 transition-colors`}>
                  {COLS.map((c) => {
                    const base = "px-3.5 py-2 border-b border-r border-gray-200 whitespace-nowrap";
                    if (c.sticky) return (
                      <td key={c.key} className={`sticky left-0 z-[2] ${rowBg} pl-8 text-gray-400 text-xs ${base} ${c.w}`}>
                        {r.customer || ""}
                      </td>
                    );
                    if (c.key === "status") return (
                      <td key={c.key} className={`${base} ${c.w}`}>
                        {r.status ? <Badge label={r.status.trim()} /> : null}
                      </td>
                    );
                    if (c.num) {
                      const v = r[c.key] || 0;
                      const color = v === 0 ? "text-gray-300"
                        : c.key.includes("balance") ? "text-green-600"
                        : c.key.includes("cancel")  ? "text-red-500"
                        : "text-gray-700";
                      return (
                        <td key={c.key} className={`${base} text-right font-mono text-xs ${color} ${c.w}`}>
                          {c.cur ? fmt(v, true) : fmt(v)}
                        </td>
                      );
                    }
                    return <td key={c.key} className={`${base} text-[13px] text-gray-700 ${c.w}`}>{r[c.key] || ""}</td>;
                  })}
                </tr>
              );
            });
          }
        }); // po

        // Vendor subtotal
        rows.push(
          <tr key={`vsub-${cus}-${ven}`} className="bg-gray-100 border-t border-b-2 border-gray-300">
            {COLS.map((c) => {
              const base = "px-3.5 py-2 border-b border-r border-gray-300 whitespace-nowrap";
              if (c.sticky)                 return <td key={c.key} className={`sticky left-0 z-[2] bg-gray-100 text-gray-500 font-semibold text-xs ${base} ${c.w}`}>{cus}</td>;
              if (c.key === "vendor")       return <td key={c.key} className={`${base} font-bold text-xs ${c.w}`}>{ven} <span className="text-gray-400 font-normal">{pKeys.length} PO{pKeys.length > 1 ? "s" : ""}</span></td>;
              if (c.key === "orderValue")   return <td key={c.key} className={`${base} text-right font-mono text-xs font-semibold text-blue-600 ${c.w}`}>{fmt(venOV, true)}</td>;
              if (c.key === "shippedValue") return <td key={c.key} className={`${base} text-right font-mono text-xs font-semibold text-green-600 ${c.w}`}>{fmt(venSV, true)}</td>;
              if (c.key === "balanceValue") return <td key={c.key} className={`${base} text-right font-mono text-xs font-semibold text-amber-600 ${c.w}`}>{fmt(venBV, true)}</td>;
              return <td key={c.key} className={`${base} ${c.w}`} />;
            })}
          </tr>
        );
      }); // vendor

      // Customer total
      rows.push(
        <tr key={`ctot-${cus}`} className="bg-gray-900 border-t-2 border-blue-600">
          {COLS.map((c) => {
            const base = "px-3.5 py-2 border-b border-r border-gray-700 whitespace-nowrap font-mono text-xs font-bold";
            if (c.sticky)                 return <td key={c.key} className={`sticky left-0 z-[2] bg-gray-900 text-white ${base} ${c.w}`}>{cus}</td>;
            if (c.key === "vendor")       return <td key={c.key} className={`px-3.5 py-2 border-b border-r border-gray-700 whitespace-nowrap text-blue-300 text-[11px] ${c.w}`}>{vKeys.length} vendor{vKeys.length > 1 ? "s" : ""} · {cusPOCount} PO{cusPOCount > 1 ? "s" : ""}</td>;
            if (c.key === "orderValue")   return <td key={c.key} className={`${base} text-right text-blue-300 ${c.w}`}>{fmt(cusOV, true)}</td>;
            if (c.key === "shippedValue") return <td key={c.key} className={`${base} text-right text-green-300 ${c.w}`}>{fmt(cusSV, true)}</td>;
            if (c.key === "balanceValue") return <td key={c.key} className={`${base} text-right text-amber-300 ${c.w}`}>{fmt(cusBV, true)}</td>;
            return <td key={c.key} className={`px-3.5 py-2 border-b border-r border-gray-700 ${c.w}`} />;
          })}
        </tr>
      );
    }); // customer

    // Grand total
    if (cusKeys.length > 0) {
      rows.push(
        <tr key="grand" className="bg-black border-t-2 border-blue-500 sticky bottom-0 z-[3]">
          {COLS.map((c) => {
            const base = "px-3.5 py-2 border-r border-gray-800 whitespace-nowrap font-mono text-xs font-bold";
            if (c.sticky)                 return <td key={c.key} className={`sticky left-0 z-[4] bg-black text-white ${base} ${c.w}`}>
                                                  PAGE TOTAL
                                                  <span className="ml-1.5 text-[9px] font-normal text-gray-400 normal-case tracking-normal">pg {page} of {totalPages}</span>
                                                </td>;
            if (c.key === "orderQty")     return <td key={c.key} className={`${base} text-right text-white ${c.w}`}>{fmt(grandOQ)}</td>;
            if (c.key === "orderValue")   return <td key={c.key} className={`${base} text-right text-blue-300 ${c.w}`}>{fmt(grandOV, true)}</td>;
            if (c.key === "shippedQty")   return <td key={c.key} className={`${base} text-right text-white ${c.w}`}>{fmt(grandSQ)}</td>;
            if (c.key === "shippedValue") return <td key={c.key} className={`${base} text-right text-green-300 ${c.w}`}>{fmt(grandSV, true)}</td>;
            if (c.key === "balanceQty")   return <td key={c.key} className={`${base} text-right text-white ${c.w}`}>{fmt(grandBQ)}</td>;
            if (c.key === "balanceValue") return <td key={c.key} className={`${base} text-right text-amber-300 ${c.w}`}>{fmt(grandBV, true)}</td>;
            if (c.key === "totalBusiness")return <td key={c.key} className={`${base} text-right text-white ${c.w}`}>{fmt(grandBiz, true)}</td>;
            return <td key={c.key} className={`px-3.5 py-2 border-r border-gray-800 ${c.w}`} />;
          })}
        </tr>
      );
    }

    return { tableRows: rows, grandTotals: { grandOV, grandSV, grandBV, grandOQ, grandSQ, grandBQ, grandBiz } };
  }, [pagedCusKeys, grouped, collapsed, sortedRows, togglePO]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="font-sans text-gray-800 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 rounded-md flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <div>
            <div className="text-base font-semibold text-gray-900 leading-tight">Shipped Purchase Orders</div>
            <div className="text-xs text-gray-400 mt-0.5">
              FY 20{year} · Live data
              {monthFilter && <span className="ml-2 text-blue-500">· {monthFilter}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={year}
            onChange={e => setYear(e.target.value)}
            className="h-8 px-2.5 text-xs font-semibold border border-gray-200 rounded-lg bg-white cursor-pointer"
          >
            {availableYears.map(y => (
              <option key={y} value={y}>FY 20{y}</option>
            ))}
          </select>
          <button onClick={() => handleExport('xlsx')} disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-green-500 bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors cursor-pointer disabled:opacity-50">
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
          <button onClick={() => handleExport('pdf')} disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-400 bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-50">
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
          {onBackToDashboard && (
            <button onClick={onBackToDashboard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors cursor-pointer">
              ← Dashboard
            </button>
          )}
        </div>
      </div>

      {/* Chips */}
      <div className="flex gap-2 px-6 py-3 bg-white border-b border-gray-200 flex-wrap">
        <Chip label="Order Value"  value={fmt(gt.orderValue     ?? totals.order,   true)} dot="#3B82F6" />
        <Chip label="Shipped"      value={fmt(gt.shippedValue   ?? totals.shipped, true)} dot="#16a34a" />
        <Chip label="Cancelled"    value={fmt(gt.cancelledValue ?? 0,              true)} dot="#ef4444" />
        <Chip label="Balance"      value={fmt(gt.balanceValue   ?? totals.balance, true)} dot="#d97706" />
        <Chip label="Shipped POs"  value={(gt.totalPoCount   ?? totals.shippedPOs).toLocaleString()} dot="#9ca3af" />
        <Chip label="Total Lines"  value={(gt.totalLineCount ?? filteredRows.length).toLocaleString()} dot="#9ca3af" />
        <Chip label="Customers"    value={(vendor || timingFilter !== 'All' || search ? totals.customers : (totalCustomers || totals.customers)).toLocaleString()} dot="#9ca3af" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-6 py-2.5 bg-white border-b border-gray-200 flex-wrap">
        {isAdmin && merchantList.length > 0 && (
          <Dropdown
            icon={<svg className="w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
            placeholder="All Merchants"
            options={merchantList.map(m => m.email)}
            value={merchant}
            onChange={v => {
              setMerchant(v)
              setBuyer(""); setVendor(""); setMonthFilter("")
              setCollapsed(new Set()); setAllExpanded(true); setPage(1)
            }}
          />
        )}
        {/* Buyer — server-side */}
        <Dropdown
          icon={<svg className="w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>}
          placeholder="All Buyers"
          options={buyerList}
          value={buyer}
          onChange={setBuyer}
        />
        {/* Vendor — client-side (server doesn't filter by vendor yet) */}
        <Dropdown
          icon={<svg className="w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>}
          placeholder="All Vendors"
          options={vendorList}
          value={vendor}
          onChange={setVendor}
        />
        {/* Month — server-side */}
        <Dropdown
          icon={<svg className="w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
          placeholder="All Months"
          options={monthLabels}
          value={monthFilter}
          onChange={v => { setMonthFilter(v); setPage(1); }}
        />

        {/* Timing filter — client-side (shipped date vs target date) */}
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
          {['All', 'On Time', 'Late'].map((opt) => (
            <button
              key={opt}
              onClick={() => setTimingFilter(opt)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer
                ${timingFilter === opt
                  ? opt === 'Late'
                    ? 'bg-red-500 text-white border-red-500'
                    : opt === 'On Time'
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'}
                ${opt !== 'All' ? 'border-l border-gray-300' : ''}
              `}
            >
              {opt}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-md bg-gray-50 flex-1 min-w-[180px] max-w-[280px] focus-within:border-blue-500 focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.12)] transition-all">
          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PO, item, vendor, customer…"
            className="border-none outline-none bg-transparent text-sm text-gray-700 w-full placeholder-gray-400"
          />
        </div>

        <div className="w-px h-5 bg-gray-200 shrink-0 mx-0.5" />

        <button onClick={toggleAll}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-md bg-gray-50 text-sm text-gray-700 hover:bg-white hover:border-gray-400 transition-all cursor-pointer">
          {allExpanded ? "Collapse All" : "Expand All"}
        </button>

        <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">
          {(gt.totalLineCount ?? 0).toLocaleString()} rows · {(vendor || timingFilter !== 'All' || search ? totals.customers : (totalCustomers ?? 0)).toLocaleString()} customers
        </span>
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-[62vh] bg-white relative px-2">
        {loading ? (
          <table className="border-collapse w-max min-w-full text-[13px] animate-pulse">
            <thead>
              <tr>
                {COLS.map(c => (
                  <th key={c.key} className={`sticky top-0 z-[3] px-3.5 py-2.5 border-b border-r border-gray-300 bg-gray-50 ${c.sticky ? 'left-0 z-[4]' : ''} ${c.w}`}>
                    <div className="h-3 bg-gray-200 rounded w-3/4 mx-auto" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2].map(g => (
                <>
                  {/* PO header skeleton */}
                  <tr key={`sg-${g}`} className="bg-blue-50 border-t-2 border-blue-100">
                    {COLS.map(c => (
                      <td key={c.key} className={`px-3.5 py-2.5 border-b border-r border-blue-100 ${c.sticky ? 'sticky left-0 z-[2] bg-blue-50' : ''} ${c.w}`}>
                        <div className={`h-3 rounded bg-blue-100 ${c.sticky ? 'w-28' : c.num ? 'w-16 ml-auto' : 'w-20'}`} />
                      </td>
                    ))}
                  </tr>
                  {/* Detail row skeletons */}
                  {[0, 1].map(r => (
                    <tr key={`sd-${g}-${r}`} className="bg-white border-b border-gray-100">
                      {COLS.map(c => (
                        <td key={c.key} className={`px-3.5 py-2 border-b border-r border-gray-100 ${c.sticky ? 'sticky left-0 z-[2] bg-white' : ''} ${c.w}`}>
                          <div className={`h-2.5 rounded bg-gray-100 ${c.sticky ? 'w-24' : c.num ? 'w-12 ml-auto' : 'w-16'}`} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-red-500 text-sm">{error}</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">No purchase orders found</div>
        ) : filteredRows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">No results match the current filters</div>
        ) : (
          <table className="border-collapse w-max min-w-full text-[13px]">
            <thead>
              <tr>
                {COLS.map((c) => {
                  const isSorted = sortCol === c.key;
                  return (
                    <th key={c.key} onClick={() => toggleSort(c.key)}
                      className={`
                        sticky top-0 z-[3] px-3.5 py-2.5 border-b border-r border-gray-300
                        whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider
                        cursor-pointer select-none transition-colors
                        ${c.num ? "text-right" : "text-left"}
                        ${c.sticky ? "left-0 z-[4]" : ""}
                        ${isSorted ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700"}
                        ${c.w}
                      `}>
                      {c.label}{isSorted ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>{tableRows}</tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {(page > 1 || cusKeys.length > 0) && (
        <div className="flex items-center justify-between px-6 py-2.5 bg-white border-t border-gray-200">
          <span className="text-xs font-bold text-gray-800">Page {page}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-black text-white disabled:opacity-30 hover:bg-gray-700 cursor-pointer disabled:cursor-default font-medium">
              ← Prev
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-black text-white disabled:opacity-30 hover:bg-gray-700 cursor-pointer disabled:cursor-default font-medium">
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}