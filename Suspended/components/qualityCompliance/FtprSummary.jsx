import { useFtpr } from "../../hooks/useFtpr";
import "../../styles/sales-analytics.css";

// ── helpers ───────────────────────────────────────────────────────────────────

function barColor(ftpr) {
  if (ftpr == null) return "bg-gray-200";
  if (ftpr >= 90)   return "bg-[#111]";
  if (ftpr >= 70)   return "bg-amber-400";
  return "bg-red-500";
}


// ── Sub-components ────────────────────────────────────────────────────────────

function SelectField({ id, label, value, onChange, options, minWidth = "180px" }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-xs text-gray-500 whitespace-nowrap">
        {label}
      </label>
      <div className="relative inline-flex items-center">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ minWidth }}
          className="appearance-none bg-white border border-gray-200 rounded-md
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
    <div className={`rounded-lg px-4 py-3.5 border transition-colors hover:border-black
                     ${highlight ? "border-black bg-white" : "border-gray-200 bg-white"}`}>
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      <span className="block text-2xl font-semibold text-black">{value}</span>
      {meta && <span className="text-xs text-gray-500">{meta}</span>}
    </div>
  );
}

function TableRow({ row }) {
  const ftpr     = row.ftpr != null ? parseFloat(row.ftpr) : null;
  const barWidth = ftpr != null ? Math.min(ftpr, 100) : 0;
  const display  = ftpr != null ? `${ftpr.toFixed(1)}%` : "—";

  return (
    <div className="grid grid-template-ftpr items-center py-3 border-b border-gray-100
                    last:border-b-0 text-sm
                    max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-1">

      {/* Supplier name — full width on mobile */}
      <span className="text-[#111] font-medium max-sm:col-span-2">
        {row.name || "—"}
      </span>

      <span className="text-gray-600">{row.total_inspections ?? "—"}</span>
      <span className="text-gray-600">{row.accepted ?? "—"}</span>

      {/* Progress bar + label */}
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
  );
}

function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-3 pt-4 text-sm text-gray-500">
      <button
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
        className="border border-black text-black rounded-md px-3 py-1.5 text-sm
                   hover:bg-gray-50 disabled:opacity-35 disabled:cursor-default
                   transition-colors cursor-pointer"
      >
        ← Prev
      </button>
      <span>Page {page} of {totalPages}</span>
      <button
        disabled={page === totalPages}
        onClick={() => onPageChange(page + 1)}
        className="border border-black text-black rounded-md px-3 py-1.5 text-sm
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

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
        <StatTile label="Total Suppliers"    value={loading ? "—" : stats.total}            />
        <StatTile label="Total Inspections"  value={loading ? "—" : stats.totalInspections} highlight />
        <StatTile label="Total Accepted"     value={loading ? "—" : stats.accepted}         highlight />
        <StatTile
          label="Avg FTPR"
          value={loading ? "—" : `${stats.avgFtpr}%`}
          meta="First Time Pass Rate"
        />
      </div>

      {/* ── Table ── */}
      <div className="bg-white">

        {/* Table header */}
        <div className="grid grid-template-ftpr border-b border-gray-200 pb-2 mb-0.5
                        text-xs font-semibold text-black uppercase tracking-wide
                        max-sm:grid-cols-2">
          <span className="max-sm:col-span-2">Supplier</span>
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