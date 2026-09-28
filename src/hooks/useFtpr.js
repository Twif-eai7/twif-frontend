import { effectiveDateRangeFilter } from '../utils/reportEffectiveDate';
import { useReducer, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { ACCEPTED_RESULTS, VERDICT_RESULTS } from "../components/qualityCompliance/inspectionReport/stageStatus";

const PAGE_SIZE = 20;

const MONTH_OPTIONS = (() => {
  const now = new Date();
  return Array.from({ length: 4 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1);
    return {
      value: `${d.getMonth() + 1}-${d.getFullYear()}`,
      label: d.toLocaleString("default", { month: "long", year: "numeric" }),
    };
  });
})();

// ── Reducer ───────────────────────────────────────────────────────────────────

const initialState = {
  selectedMonth:  MONTH_OPTIONS[0].value,
  allSuppliers:   [],
  activeSupplier: "all",
  currentPage:    1,
  loading:        true,
  error:          null,
}; 

function reducer(state, action) {
  switch (action.type) {
    case "FETCH_START":
      // single dispatch — resets loading + filters together, no cascading
      return { ...state, loading: true, error: null, activeSupplier: "all", currentPage: 1 };
    case "FETCH_SUCCESS":
      return { ...state, loading: false, allSuppliers: action.payload };
    case "FETCH_ERROR":
      return { ...state, loading: false, error: action.payload, allSuppliers: [] };
    case "SET_MONTH":
      return { ...state, selectedMonth: action.payload };
    case "SET_SUPPLIER":
      return { ...state, activeSupplier: action.payload, currentPage: 1 };
    case "SET_PAGE":
      return { ...state, currentPage: action.payload };
    default:
      return state;
  }
}

// ── Stats helper ──────────────────────────────────────────────────────────────

function computeStats(suppliers) {
  if (!suppliers.length)
    return { total: 0, totalInspections: 0, accepted: 0, avgFtpr: "0.0" };
  return {
    total:            suppliers.length,
    totalInspections: suppliers.reduce((s, r) => s + (r.total_inspections || 0), 0),
    accepted:         suppliers.reduce((s, r) => s + (r.accepted || 0), 0),
    avgFtpr: (
      suppliers.reduce((s, r) => s + (r.ftpr || 0), 0) / suppliers.length
    ).toFixed(1),
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFtpr() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { selectedMonth, allSuppliers, activeSupplier, currentPage, loading, error } = state;

  // First-Time Pass Rate, computed live from the Inspection System instead
  // of the old supplier_ftpr table (which was populated entirely outside
  // this codebase - no in-app upload/parser ever existed for it). Scored
  // on Final specifically - the stage that actually decides whether a
  // shipment passes QC - and on the round-1 population only: a SKU that
  // failed round 1 and passed on a later round still reads as a first-try
  // failure here, since that's the whole point of "first-time."
  const fetchFTPR = useCallback(async () => {
    dispatch({ type: "FETCH_START" }); // one update instead of four

    const [month, year] = selectedMonth.split("-").map(Number);
    const fmtISO = (d) => d.toISOString().slice(0, 10);
    const rangeStart = fmtISO(new Date(year, month - 1, 1));
    const rangeEnd   = fmtISO(new Date(year, month, 0)); // last day of that month

    // Same join shape QcReportsSummary.jsx already uses to resolve a
    // report's supplier org (inspection_reports -> po_line_items ->
    // purchase_orders -> buyer_supplier_links -> organizations), scoped to
    // exactly the round-1 population the FTPR definition needs: Final
    // stage, round 1, actually submitted (a draft round 1 isn't a
    // completed first-try attempt yet).
    const { data, error: sbError } = await supabase
      .from("inspection_reports")
      .select(`
        id, inspection_result,
        po_line_items!inner(
          id,
          purchase_orders!inner(
            id,
            buyer_supplier_links!inner(
              supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(id, display_name)
            )
          )
        )
      `)
      .eq("inspection_type", "final")
      .eq("round", 1)
      .eq("status", "submitted")
      // A round-1 Final submitted with a workflow state (Plan Aborted/On
      // Hold/Feedback in Progress) isn't a completed first-try attempt yet -
      // without this filter it'd count as a first-try failure the moment
      // it's submitted, dragging the supplier's score down before anyone
      // actually decided anything.
      .in("inspection_result", VERDICT_RESULTS)
      // Inspection Date when typed, otherwise the submission date (see reportEffectiveDate.js).
      .or(effectiveDateRangeFilter(rangeStart, rangeEnd));

    if (sbError) {
      dispatch({ type: "FETCH_ERROR", payload: sbError.message });
      return;
    }

    // Skipped rather than miscounted into an "undefined" bucket if a
    // report's org chain doesn't resolve (an orphaned/data-integrity gap).
    const bySupplier = new Map();
    for (const r of (data || [])) {
      const org = r.po_line_items?.purchase_orders?.buyer_supplier_links?.supplier;
      if (!org?.id) continue;
      if (!bySupplier.has(org.id)) bySupplier.set(org.id, { name: org.display_name, total: 0, accepted: 0 });
      const entry = bySupplier.get(org.id);
      entry.total++;
      if (ACCEPTED_RESULTS.includes(r.inspection_result)) entry.accepted++;
    }

    const result = [...bySupplier.values()].map((s) => ({
      name:              s.name,
      total_inspections: s.total,
      accepted:          s.accepted,
      rejected:          s.total - s.accepted,
      ftpr:              s.total ? (s.accepted / s.total) * 100 : 0,
    }));

    dispatch({ type: "FETCH_SUCCESS", payload: result });
  }, [selectedMonth]);

  useEffect(() => { fetchFTPR(); }, [fetchFTPR]);

  // ── Derived values (memoised) ─────────────────────────────────────────────

  const supplierOptions = useMemo(() => {
    const sorted = [...allSuppliers].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "")
    );
    return [
      { value: "all", label: "All Suppliers" },
      ...sorted.map((s) => ({ value: s.name, label: s.name })),
    ];
  }, [allSuppliers]);

  const filtered = useMemo(() =>
    activeSupplier === "all"
      ? allSuppliers
      : allSuppliers.filter((s) => s.name === activeSupplier),
    [allSuppliers, activeSupplier]
  );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const stats = useMemo(() => computeStats(filtered), [filtered]);

  const periodLabel = useMemo(() =>
    MONTH_OPTIONS.find((o) => o.value === selectedMonth)?.label ?? "",
    [selectedMonth]
  );

  return {
    selectedMonth, activeSupplier, currentPage, loading, error,
    paginated, stats, supplierOptions, periodLabel, totalPages,
    onMonthChange:    (val)  => dispatch({ type: "SET_MONTH",    payload: val  }),
    onSupplierChange: (val)  => dispatch({ type: "SET_SUPPLIER", payload: val  }),
    onPageChange:     (page) => dispatch({ type: "SET_PAGE",     payload: page }),
    MONTH_OPTIONS,
  };
}