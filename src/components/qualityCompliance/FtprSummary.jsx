import { useFtpr } from "../../hooks/useFtpr";
import "../../styles/sales-analytics.css";

// ── helpers ───────────────────────────────────────────────────────────────────

function barColor(ftpr) {
  if (ftpr == null) return "bg-gray-200";
  if (ftpr >= 90)   return "bg-[#111]";
  if (ftpr >= 70)   return "bg-amber-400";
  return "bg-red-500";
}

// Mobile-only tier styling (the desktop row above keeps its plain
// black/amber/red bar as-is) - one place to derive the avatar/badge/bar
// colors a supplier's FTPR maps to, so the mobile card reads at a glance
// instead of needing the number itself to carry all the meaning.
function tierInfo(ftpr) {
  if (ftpr == null) return { label: "No data", text: "text-gray-400", chip: "bg-gray-100 text-gray-500", bar: "bg-gray-300", avatar: "bg-gray-100 text-gray-400" };
  if (ftpr >= 90)   return { label: "Excellent", text: "text-emerald-600", chip: "bg-emerald-50 text-emerald-700 border border-emerald-200", bar: "bg-emerald-500", avatar: "bg-emerald-100 text-emerald-700" };
  if (ftpr >= 70)   return { label: "Watch", text: "text-amber-600", chip: "bg-amber-50 text-amber-700 border border-amber-200", bar: "bg-amber-400", avatar: "bg-amber-100 text-amber-700" };
  return { label: "At Risk", text: "text-red-600", chip: "bg-red-50 text-red-700 border border-red-200", bar: "bg-red-500", avatar: "bg-red-100 text-red-700" };
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || "").concat(parts[1]?.[0] || "").toUpperCase() || "?";
}


// ── Sub-components ────────────────────────────────────────────────────────────

function SelectField({ id, label, value, onChange, options, minWidth = "180px" }) {
  return (
    <div className="flex items-center gap-2 w-full sm:w-auto">
      <label htmlFor={id} className="text-xs text-gray-500 whitespace-nowrap">
        {label}
      </label>
      <div className="relative inline-flex items-center flex-1 sm:flex-none">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ minWidth }}
          className="appearance-none w-full sm:w-auto bg-white border border-gray-200 rounded-md
                     pl-3 pr-8 py-1.5 text-sm text-[#111] cursor-pointer
                     hover:border-black focus:border-black focus:outline-none
                     transition-colors"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {/* chevron */}
        <svg className="absolute right-2.5 pointer-events-none text-gray-500"
             width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  );
}

function StatTile({ label, value, meta, highlight }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 sm:px-4 sm:py-3.5 border transition-colors hover:border-black
                     ${highlight ? "border-black bg-white" : "border-gray-200 bg-white"}`}>
      <span className="block text-[11px] sm:text-xs text-gray-500 mb-0.5 sm:mb-1">{label}</span>
      <span className="block text-lg sm:text-2xl font-semibold text-black">{value}</span>
      {meta && <span className="text-[11px] sm:text-xs text-gray-500">{meta}</span>}
    </div>
  );
}

// Mobile-only KPI tile - same 4 numbers as StatTile above (desktop keeps
// that plain version untouched), but with a colored icon chip and a subtle
// tinted background per metric so the row reads as more than 4 identical
// gray boxes at a glance.
const STAT_ICONS = {
  suppliers:   { accent: "text-indigo-600", bg: "bg-indigo-50", path: "M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1" },
  inspections: { accent: "text-blue-600",   bg: "bg-blue-50",   path: "M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  accepted:    { accent: "text-emerald-600", bg: "bg-emerald-50", path: "M20 6 9 17l-5-5" },
  ftpr:        { accent: "text-purple-600", bg: "bg-purple-50", path: "M3 3v18h18M7 15l3-3 3 3 5-6" },
};

function MobileStatTile({ label, value, meta, icon }) {
  const cfg = STAT_ICONS[icon];
  return (
    <div className="rounded-xl px-3 py-3 border border-gray-100 bg-white shadow-sm">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${cfg.bg}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cfg.accent}>
          <path d={cfg.path} />
        </svg>
      </div>
      <span className="block text-lg font-bold text-black leading-tight">{value}</span>
      <span className="block text-[11px] text-gray-500 mt-0.5">{label}</span>
      {meta && <span className="block text-[10px] text-gray-400 mt-0.5">{meta}</span>}
    </div>
  );
}

function TableRow({ row }) {
  const ftpr     = row.ftpr != null ? parseFloat(row.ftpr) : null;
  const barWidth = ftpr != null ? Math.min(ftpr, 100) : 0;
  const display  = ftpr != null ? `${ftpr.toFixed(1)}%` : "—";
  const tier     = tierInfo(ftpr);

  return (
    <>
      {/* Desktop/tablet row - unchanged CSS-grid row, sm and up. */}
      <div className="hidden sm:grid grid-template-ftpr items-center py-3 border-b border-gray-100
                      last:border-b-0 text-sm">
        <span className="text-[#111] font-medium">{row.name || "—"}</span>
        <span className="text-gray-600">{row.total_inspections ?? "—"}</span>
        <span className="text-gray-600">{row.accepted ?? "—"}</span>
        <span>
          <div className="h-[5px] bg-gray-100 rounded overflow-hidden mb-1">
            <div
              className={`h-full rounded transition-all ${barColor(ftpr)}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <small className="text-xs text-gray-500">{display}</small>
        </span>
      </div>

      {/* Mobile card - avatar + tier badge + colored bar, instead of the
          old max-sm:grid-cols-2 cramped reflow (or a plain bordered box) -
          the FTPR tier (Excellent/Watch/At Risk) is now visible at a glance
          via tierInfo() above, not just buried in a small gray percentage. */}
      <div className="sm:hidden border border-gray-100 rounded-xl px-3 py-3 mb-2 last:mb-0 bg-white shadow-sm">
        <div className="flex items-center gap-2.5 mb-2.5">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${tier.avatar}`}>
            {initials(row.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-[#111] truncate">{row.name || "—"}</div>
          </div>
          <span className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${tier.chip}`}>
            {tier.label}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 text-xs text-gray-500 mb-2">
          <span>Total Inspections <span className="text-gray-700 font-semibold">{row.total_inspections ?? "—"}</span></span>
          <span>Accepted <span className="text-gray-700 font-semibold">{row.accepted ?? "—"}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-[6px] bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${tier.bar}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <span className={`text-xs font-bold flex-shrink-0 ${tier.text}`}>{display}</span>
        </div>
      </div>
    </>
  );
}

function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-3 pt-4 text-sm text-gray-500">
      <button
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
        className="border border-black text-black rounded-md px-4 py-2 sm:px-3 sm:py-1.5 text-sm
                   hover:bg-gray-50 disabled:opacity-35 disabled:cursor-default
                   transition-colors cursor-pointer"
      >
        ← Prev
      </button>
      <span>Page {page} of {totalPages}</span>
      <button
        disabled={page === totalPages}
        onClick={() => onPageChange(page + 1)}
        className="border border-black text-black rounded-md px-4 py-2 sm:px-3 sm:py-1.5 text-sm
                   hover:bg-gray-50 disabled:opacity-35 disabled:cursor-default
                   transition-colors cursor-pointer"
      >
        Next →
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FtprSummary() {
  const {
    selectedMonth, activeSupplier, currentPage, loading, error,
    paginated, stats, supplierOptions, periodLabel,
    totalPages,
    onMonthChange, onSupplierChange, onPageChange,
    MONTH_OPTIONS,
  } = useFtpr();

  return (
    <div className="p-4">

      {/* ── Header row ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="text-lg font-semibold text-black m-0">
          Supplier FTPR Report{" "}
          {periodLabel && (
            <span className="font-normal text-gray-500">{periodLabel}</span>
          )}
        </h2>

        {/* Filters - stacked full-width rows on mobile instead of an
            ad-hoc wrap, side by side from sm up. */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <SelectField
            id="month-filter"
            label="Month"
            value={selectedMonth}
            onChange={onMonthChange}
            options={MONTH_OPTIONS}
            minWidth="150px"
          />
          <SelectField
            id="supplier-filter"
            label="Supplier"
            value={activeSupplier}
            onChange={onSupplierChange}
            options={supplierOptions}
            minWidth="180px"
          />
        </div>
      </div>

      {/* ── Stat tiles ── */}
      {/* Desktop/tablet - unchanged plain tiles. */}
      <div className="hidden sm:grid grid-cols-4 gap-3 mb-7">
        <StatTile label="Total Suppliers"    value={loading ? "—" : stats.total}            />
        <StatTile label="Total Inspections"  value={loading ? "—" : stats.totalInspections} highlight />
        <StatTile label="Total Accepted"     value={loading ? "—" : stats.accepted}         highlight />
        <StatTile
          label="Avg FTPR"
          value={loading ? "—" : `${stats.avgFtpr}%`}
          meta="First Time Pass Rate"
        />
      </div>
      {/* Mobile - icon + tint per metric. */}
      <div className="sm:hidden grid grid-cols-2 gap-2.5 mb-6">
        <MobileStatTile label="Total Suppliers"   value={loading ? "—" : stats.total}            icon="suppliers" />
        <MobileStatTile label="Total Inspections" value={loading ? "—" : stats.totalInspections} icon="inspections" />
        <MobileStatTile label="Total Accepted"    value={loading ? "—" : stats.accepted}         icon="accepted" />
        <MobileStatTile
          label="Avg FTPR"
          value={loading ? "—" : `${stats.avgFtpr}%`}
          meta="First Time Pass Rate"
          icon="ftpr"
        />
      </div>

      {/* ── Table ── */}
      <div className="bg-white">

        {/* Table header - desktop/tablet only; a card list (mobile) doesn't
            need a column header row, same convention PoSkuSummary.jsx's own
            card view follows. */}
        <div className="hidden sm:grid grid-template-ftpr border-b border-gray-200 pb-2 mb-0.5
                        text-xs font-semibold text-black uppercase tracking-wide">
          <span>Supplier</span>
          <span>Total Inspections</span>
          <span>Accepted</span>
          <span>FTPR</span>
        </div>

        {/* Body */}
        {loading && (
          <p className="py-6 text-sm text-gray-400">Loading…</p>
        )}

        {!loading && error && (
          <p className="py-6 text-sm text-red-400">Failed to load data.</p>
        )}

        {!loading && !error && paginated.length === 0 && (
          <p className="py-6 text-sm text-gray-400">No suppliers found.</p>
        )}

        {!loading && !error && paginated.map((row) => (
          <TableRow key={row.name} row={row} />
        ))}

        {/* Pagination */}
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      </div>

    </div>
  );
}