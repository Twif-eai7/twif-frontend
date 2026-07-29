import { forwardRef } from "react";
import CommissionCell from "./PlCommissionCell";

function MobileField({ label, value, valueClass = "text-black" }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-black/45 truncate">{label}</div>
      <div className={`text-xs font-mono mt-0.5 ${valueClass}`}>{value}</div>
    </div>
  );
}

function MobileSectionLabel({ color, children }) {
  const styles = {
    indigo: "bg-indigo-100 text-indigo-700",
    green: "bg-green-100 text-green-700",
    violet: "bg-violet-100 text-violet-700",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${styles[color]}`}>
      {children}
    </span>
  );
}

export const PlTableScrollWrap = forwardRef(function PlTableScrollWrap({ children, className = "" }, ref) {
  return (
    <div className="pl-table-scroll-wrap relative">
      <div className="pl-scroll-hint-right pointer-events-none absolute top-0 right-0 bottom-0 w-8 z-[4] lg:hidden rounded-r-lg" aria-hidden />
      <div ref={ref} className={className}>{children}</div>
    </div>
  );
});

export function OpenPoMobileCard({
  po,
  wk,
  idx,
  plMode,
  getCommPct,
  getJnmCommPct,
  getJngCommPct,
  commissionMap,
  onSave,
  readOnly,
  fmt,
  fmtCommUsd,
  computeSinglePoComm,
  computeOverallPoComm,
  formatPoShpDateLabel,
  calcPoStatus,
}) {
  const inWeek = (r) => {
    const d = new Date(r.shippedDate);
    return r.shippedDate && d >= wk.start && d <= wk.end;
  };
  const oQ = po.lines.reduce((s, r) => s + (r.orderQty || 0), 0);
  const sQ = po.lines.reduce((s, r) => s + (inWeek(r) ? (r.shippedQty || 0) : 0), 0);
  const oV = po.lines.reduce((s, r) => s + (r.orderValue || 0), 0);
  const sV = po.lines.reduce((s, r) => s + (inWeek(r) ? (r.shippedValue || 0) : 0), 0);
  const bQ = oQ - sQ;
  const bV = oV - sV;
  const target = po.lines[0]?.target || "";
  const shippedInThisWeek = po.lines.some((r) => {
    if (!r.shippedDate) return false;
    const d = new Date(r.shippedDate);
    return d >= wk.start && d <= wk.end;
  });
  const st = shippedInThisWeek
    ? calcPoStatus(po.lines)
    : { label: "Pending", cls: "bg-gray-100 text-black border-gray-300", dot: "#9ca3af" };
  const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50/80";
  const { amt: commAmt } = computeSinglePoComm(po, oV, getCommPct);
  const overall = plMode === "overall"
    ? computeOverallPoComm(po, oV, getJnmCommPct, getJngCommPct)
    : null;

  return (
    <div className={`lg:hidden px-3 py-3 border-b border-gray-100 ${rowBg}`}>
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-full bg-indigo-700 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
            {po.customer?.slice(0, 2).toUpperCase() || "?"}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-black truncate">{po.customer || "—"}</div>
            <div className="text-[11px] text-black/55 truncate">{po.vendor || "—"}</div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${st.cls}`}>
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: st.dot }} />
          {st.label}
        </span>
      </div>

      <div className="font-mono text-xs font-bold text-indigo-700 mb-2.5">{po.poNo || "—"}</div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2.5 mb-2.5">
        <MobileField label="SKUs" value={po.lines.length} />
        <MobileField label="Ord Qty" value={fmt(oQ)} />
        <MobileField label="Shp Qty" value={fmt(sQ)} valueClass={sQ ? "text-green-600 font-semibold" : "text-black"} />
        <MobileField label="Bal Qty" value={fmt(bQ)} valueClass={bQ ? "text-amber-600 font-semibold" : "text-black"} />
        <MobileField label="Order Val" value={fmt(oV, true)} valueClass="text-indigo-600 font-semibold" />
        <MobileField label="Shipped $" value={fmt(sV, true)} valueClass={sV ? "text-green-600 font-semibold" : "text-black"} />
        <MobileField label="Balance $" value={fmt(bV, true)} valueClass={bV ? "text-amber-600 font-semibold" : "text-black"} />
        <MobileField label="Shp Date" value={formatPoShpDateLabel(po.lines, inWeek)} valueClass="text-black font-sans text-[11px]" />
        <MobileField label="Target Date" value={target || "—"} valueClass="text-black font-sans text-[11px]" />
      </div>

      {plMode === "overall" ? (
        <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-2.5 space-y-2">
          <MobileSectionLabel color="violet">Commission</MobileSectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-black/45 mb-1">JNM %</div>
              <CommissionCell
                poNo={po.poNo}
                initialValue={commissionMap[po.poNo] ?? (overall?.jnmPct ?? "")}
                onSave={onSave}
                readOnly={readOnly}
              />
            </div>
            <MobileField label="Twif %" value={overall?.jngPct != null ? `${overall.jngPct}%` : "—"} />
            <MobileField label="JNM $" value={overall?.jnmAmt != null ? fmtCommUsd(overall.jnmAmt) : "—"} valueClass="text-indigo-600 font-semibold" />
            <MobileField label="Twif $" value={overall?.jngAmt != null ? fmtCommUsd(overall.jngAmt) : "—"} valueClass="text-violet-600 font-semibold" />
          </div>
          <MobileField
            label="Overall Comm"
            value={(overall?.jnmAmt != null || overall?.jngAmt != null) ? fmtCommUsd(overall.overall) : "—"}
            valueClass="text-indigo-800 font-bold"
          />
        </div>
      ) : (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-2.5 flex items-center justify-between gap-3">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-black/45 mb-1">Commission %</div>
            <CommissionCell
              poNo={po.poNo}
              initialValue={plMode === "jng"
                ? (getJngCommPct(po.poNo, po.vendor, po.customer) ?? "")
                : (commissionMap[po.poNo] ?? (getJnmCommPct(po.poNo, po.vendor, po.customer) ?? ""))}
              onSave={onSave}
              readOnly={readOnly || plMode === "jng"}
            />
          </div>
          <MobileField
            label="Commission $"
            value={commAmt != null ? fmtCommUsd(commAmt) : "—"}
            valueClass="text-indigo-600 font-semibold"
          />
        </div>
      )}
    </div>
  );
}

export function ShippedPoMobileCard({
  po,
  idx,
  plMode,
  getCommPct,
  getJnmCommPct,
  getJngCommPct,
  commissionMap,
  onSave,
  readOnly,
  fmt,
  fmtCommUsd,
  computeSinglePoComm,
  computeOverallPoComm,
  formatPoShpDateLabel,
  calcPoStatus,
}) {
  const st = calcPoStatus(po.lines);
  const oQ = po.lines.reduce((s, r) => s + (r.orderQty || 0), 0);
  const sQ = po.lines.reduce((s, r) => s + (r.shippedQty || 0), 0);
  const bQ = po.lines.reduce((s, r) => s + (r.balanceQty || 0), 0);
  const oV = po.lines.reduce((s, r) => s + (r.orderValue || 0), 0);
  const sV = po.lines.reduce((s, r) => s + (r.shippedValue || 0), 0);
  const bV = po.lines.reduce((s, r) => s + (r.balanceValue || 0), 0);
  const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50/80";
  const { amt: commAmt } = computeSinglePoComm(po, sV, getCommPct);
  const overall = plMode === "overall"
    ? computeOverallPoComm(po, sV, getJnmCommPct, getJngCommPct)
    : null;

  return (
    <div className={`lg:hidden px-3 py-3 border-b border-gray-100 ${rowBg}`}>
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-full bg-slate-700 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
            {po.customer?.slice(0, 2).toUpperCase() || "?"}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-black truncate">{po.customer || "—"}</div>
            <div className="text-[11px] text-black/55 truncate">{po.vendor || "—"}</div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${st.cls}`}>
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: st.dot }} />
          {st.label}
        </span>
      </div>

      <div className="font-mono text-xs font-bold text-black mb-2.5">{po.poNo || "—"}</div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2.5 mb-2.5">
        <MobileField label="SKUs" value={po.lines.length} />
        <MobileField label="Ord Qty" value={fmt(oQ)} />
        <MobileField label="Shp Qty" value={fmt(sQ)} />
        <MobileField label="Bal Qty" value={fmt(bQ)} valueClass={bQ ? "text-green-600" : "text-black"} />
        <MobileField label="Order Val" value={fmt(oV, true)} valueClass="text-blue-600 font-semibold" />
        <MobileField label="Shipped $" value={fmt(sV, true)} valueClass="text-green-600 font-semibold" />
        <MobileField label="Balance $" value={fmt(bV, true)} valueClass={bV ? "text-amber-600 font-semibold" : "text-black"} />
        <MobileField label="Shp Date" value={formatPoShpDateLabel(po.lines)} valueClass="text-black font-sans text-[11px]" />
      </div>

      {plMode === "overall" ? (
        <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-2.5 space-y-2">
          <MobileSectionLabel color="violet">Commission</MobileSectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-black/45 mb-1">JNM %</div>
              <CommissionCell
                poNo={po.poNo}
                initialValue={commissionMap[po.poNo] ?? (overall?.jnmPct ?? "")}
                onSave={onSave}
                readOnly={readOnly}
              />
            </div>
            <MobileField label="Twif %" value={overall?.jngPct != null ? `${overall.jngPct}%` : "—"} />
            <MobileField label="JNM $" value={overall?.jnmAmt != null ? fmtCommUsd(overall.jnmAmt) : "—"} valueClass="text-indigo-600 font-semibold" />
            <MobileField label="Twif $" value={overall?.jngAmt != null ? fmtCommUsd(overall.jngAmt) : "—"} valueClass="text-violet-600 font-semibold" />
          </div>
          <MobileField
            label="Overall Comm"
            value={(overall?.jnmAmt != null || overall?.jngAmt != null) ? fmtCommUsd(overall.overall) : "—"}
            valueClass="text-indigo-800 font-bold"
          />
        </div>
      ) : (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-2.5 flex items-center justify-between gap-3">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-black/45 mb-1">Commission %</div>
            <CommissionCell
              poNo={po.poNo}
              initialValue={plMode === "jng"
                ? (getJngCommPct(po.poNo, po.vendor, po.customer) ?? "")
                : (commissionMap[po.poNo] ?? (getJnmCommPct(po.poNo, po.vendor, po.customer) ?? ""))}
              onSave={onSave}
              readOnly={readOnly || plMode === "jng"}
            />
          </div>
          <MobileField
            label="Commission $"
            value={commAmt != null ? fmtCommUsd(commAmt) : "—"}
            valueClass="text-indigo-600 font-semibold"
          />
        </div>
      )}
    </div>
  );
}

export function MobilePoTotals({ variant, plMode, fmt, totals }) {
  const isProjected = variant === "projected";
  const bg = isProjected ? "bg-indigo-900 text-white" : "bg-gray-900 text-white";
  return (
    <div className={`lg:hidden px-3 py-2.5 ${bg}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-80 mb-2">
        {isProjected ? "Projected Total" : "Shipped Total"}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 text-xs font-mono">
        {totals.map(({ label, value, className = "" }) => (
          <div key={label}>
            <div className="text-[9px] uppercase tracking-wider opacity-60">{label}</div>
            <div className={`font-bold ${className}`}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PeriodStatsMobile({ projected, shipped, view, plMode, flatFeeTotal, canSeeChehomaBreakdown, canSeeMonthlyExpenses, plExpensesMap, monthKey, fmt }) {
  const commLabel = view === "week" ? "TW" : "TM";
  return (
    <div className="lg:hidden w-full space-y-2 mt-2">
      {projected && (
        <div className="rounded-lg border border-indigo-100 bg-white/70 p-2.5">
          <div className="flex items-center justify-between mb-2">
            <MobileSectionLabel color="indigo">{projected.count} Projected</MobileSectionLabel>
            {projected.otif != null && (
              <span className={`text-[11px] font-mono font-bold ${projected.otif >= 90 ? "text-green-600" : projected.otif >= 70 ? "text-amber-500" : "text-red-500"}`}>
                OTIF {projected.otif.toFixed(1)}%
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <MobileField label="PO Value" value={projected.poValue} valueClass="text-indigo-600 font-semibold" />
            <MobileField label="Actual Shipped" value={projected.shipped} valueClass="text-green-600 font-semibold" />
            <MobileField label="Balance" value={projected.balance} valueClass="text-amber-600 font-semibold" />
            {projected.comm && (
              <MobileField label={`Comm ${commLabel}`} value={projected.comm} valueClass="text-indigo-600 font-semibold" />
            )}
          </div>
        </div>
      )}
      {shipped && (
        <div className="rounded-lg border border-green-100 bg-white/70 p-2.5">
          <div className="mb-2">
            <MobileSectionLabel color="green">{shipped.count} Shipped {commLabel}</MobileSectionLabel>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <MobileField label="PO Value" value={shipped.poValue} valueClass="text-blue-600 font-semibold" />
            <MobileField label="Actual Shipped" value={shipped.shipped} valueClass="text-green-600 font-semibold" />
            {shipped.balance && <MobileField label="Balance" value={shipped.balance} valueClass="text-amber-600 font-semibold" />}
            {(shipped.comm || flatFeeTotal) && (
              <MobileField
                label={`Comm ${commLabel}`}
                value={flatFeeTotal && canSeeChehomaBreakdown && shipped.comm
                  ? `(${shipped.comm} + ${flatFeeTotal})`
                  : (shipped.comm || flatFeeTotal)}
                valueClass="text-indigo-600 font-semibold"
              />
            )}
            {(() => {
              const saved = plExpensesMap?.[monthKey];
              if (!saved || view !== "month" || plMode !== "jng" || !canSeeMonthlyExpenses) return null;
              const te = saved.total_expenses;
              const tp = saved.total_pct_to_sales;
              if (!te && !tp) return null;
              return (
                <>
                  {te > 0 && <MobileField label="M. Expenses" value={fmt(te, true)} valueClass="text-red-500 font-semibold" />}
                  {tp > 0 && <MobileField label="Exp %" value={`${Number(tp).toFixed(2)}%`} valueClass="text-red-500 font-semibold" />}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
