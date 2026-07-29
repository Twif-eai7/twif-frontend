import { useReducer, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";

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

  const fetchFTPR = useCallback(async () => {
    dispatch({ type: "FETCH_START" }); // one update instead of four

    const [month, year] = selectedMonth.split("-");

    const { data, error: sbError } = await supabase
      .from("supplier_ftpr")
      .select(`
        total_inspections,
        accepted,
        rejected,
        ftpr,
        organizations ( display_name )
      `)
      .eq("month", parseInt(month))
      .eq("year",  parseInt(year));

    if (sbError) {
      dispatch({ type: "FETCH_ERROR", payload: sbError.message });
      return;
    }

    const result = (data || []).map((s) => ({
      name:              s.organizations?.display_name,
      total_inspections: s.total_inspections,
      accepted:          s.accepted,
      rejected:          s.rejected,
      ftpr:              s.ftpr,
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