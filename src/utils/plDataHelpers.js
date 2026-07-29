const SHORT_M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const fmtD = (d) => `${SHORT_M[d.getMonth()]} ${d.getDate()}`;

/** Round commission amounts to 2 dp — matches display and keeps column sums consistent. */
export function roundComm(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function poOrderVal(p) {
  return p.lines.reduce((ss, r) => ss + (r.orderValue || 0), 0);
}

export function poShippedVal(p) {
  return p.lines.reduce((ss, r) => ss + (r.shippedValue || 0), 0);
}

export function poProjShippedVal(p, inPeriod) {
  return p.lines.reduce((ss, r) => ss + (inPeriod(r) ? (r.shippedValue || 0) : 0), 0);
}

/** Stable PO key for vendor + PO number grouping. */
export function poKey(p) {
  return `${(p.vendor || "").trim()}||${(p.poNo || "").trim()}`;
}

/**
 * Shipped $ for one period — exact sum of sheet column "Shipped Value in US $"
 * for rows whose Shipped Date falls in that month/week key.
 */
export function sumShippedValueForPeriodKey(rows, periodKey) {
  let total = 0;
  for (const r of rows) {
    if (!r.shippedDate) continue;
    const info = getMonthInfo(r.shippedDate);
    if (!info || info.key !== periodKey) continue;
    total += Number(r.shippedValue) || 0;
  }
  return total;
}

/** Week view — bucket by ISO week key from shippedDate. */
export function sumShippedValueForWeekKey(rows, periodKey) {
  let total = 0;
  for (const r of rows) {
    if (!r.shippedDate) continue;
    const info = getISOWeekInfo(r.shippedDate);
    if (!info || info.key !== periodKey) continue;
    total += Number(r.shippedValue) || 0;
  }
  return total;
}

/**
 * Grand total shipped $ — sum every row's shippedValue (matches sheet column total).
 * Optional periodKeys limits to selected month/week keys.
 */
export function sumShippedSheetTotal(rows, { periodKeys, isWeek = false } = {}) {
  let total = 0;
  for (const r of rows) {
    if (periodKeys) {
      if (!r.shippedDate) continue;
      const info = isWeek ? getISOWeekInfo(r.shippedDate) : getMonthInfo(r.shippedDate);
      if (!info || !periodKeys.has(info.key)) continue;
    }
    total += Number(r.shippedValue) || 0;
  }
  return total;
}

/** @deprecated Use sumShippedValueForPeriodKey — kept for WeeklyPoSchedule grouped PO view */
export function sumPeriodShippedValue(shippedEntries, period) {
  const inPeriod = (r) => {
    const d = new Date(r.shippedDate);
    return r.shippedDate && !isNaN(d.getTime()) && d >= period.start && d <= period.end;
  };
  let total = 0;
  for (const p of shippedEntries) {
    for (const r of p.lines) {
      if (!inPeriod(r)) continue;
      total += Number(r.shippedValue) || 0;
    }
  }
  return total;
}

/** Per-PO Overall P&L commission (projected → order val, shipped → shipped $). */
export function computeOverallPoComm(po, baseValue, getJnmCommPct, getJngCommPct) {
  const jnmPct = getJnmCommPct(po.poNo, po.vendor, po.customer);
  const jngPct = getJngCommPct(po.poNo, po.vendor, po.customer);
  const jnmAmt = jnmPct != null ? roundComm(baseValue * jnmPct / 100) : null;
  const jngAmt = jngPct != null ? roundComm(baseValue * jngPct / 100) : null;
  const overall = (jnmAmt != null || jngAmt != null)
    ? (jnmAmt ?? 0) + (jngAmt ?? 0)
    : null;
  return { jnmPct, jngPct, jnmAmt, jngAmt, overall };
}

/** Per-PO single-rate commission (Twif / JNM mode). */
export function computeSinglePoComm(po, baseValue, getCommPct) {
  const pct = getCommPct(po.poNo, po.vendor, po.customer);
  const amt = pct != null ? roundComm(baseValue * pct / 100) : null;
  return { pct, amt };
}

/** Sum commission columns from PO entries — totals match sum of per-row values. */
export function sumOverallComm(entries, baseValueFn, getJnmCommPct, getJngCommPct) {
  let jnmTotal = 0;
  let jngTotal = 0;
  let hasJnm = false;
  let hasJng = false;

  for (const [, p] of entries) {
    const base = baseValueFn(p);
    const { jnmAmt, jngAmt } = computeOverallPoComm(p, base, getJnmCommPct, getJngCommPct);
    if (jnmAmt != null) { jnmTotal += jnmAmt; hasJnm = true; }
    if (jngAmt != null) { jngTotal += jngAmt; hasJng = true; }
  }

  return {
    jnm: hasJnm ? roundComm(jnmTotal) : 0,
    jng: hasJng ? roundComm(jngTotal) : 0,
    overall: (hasJnm || hasJng) ? roundComm(jnmTotal + jngTotal) : 0,
  };
}

export function sumSingleComm(entries, baseValueFn, getCommPct) {
  let total = 0;
  let hasAny = false;
  for (const [, p] of entries) {
    const { amt } = computeSinglePoComm(p, baseValueFn(p), getCommPct);
    if (amt != null) { total += amt; hasAny = true; }
  }
  return hasAny ? roundComm(total) : 0;
}

export function getISOWeekInfo(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const thu = new Date(d);
  thu.setDate(d.getDate() + (4 - (d.getDay() || 7)));
  const yr = thu.getFullYear();
  const jan1 = new Date(yr, 0, 1);
  const week = Math.ceil(((thu - jan1) / 86400000 + 1) / 7);
  return { week, year: yr, key: `${yr}-W${String(week).padStart(2, "0")}` };
}

export function getWeekRange(year, weekNum) {
  const jan4 = new Date(year, 0, 4);
  const dow = jan4.getDay() || 7;
  const mon = new Date(jan4);
  mon.setDate(jan4.getDate() - (dow - 1) + (weekNum - 1) * 7);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { start: mon, end: sun };
}

export function getMonthInfo(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return { year: d.getFullYear(), month: d.getMonth(), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` };
}

export function getMonthRange(year, month) {
  const start = new Date(year, month, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export const normStr = (s) =>
  (s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

export function buildWeeks(filtered, filteredOpen) {
  const map = {};
  const ensureWeek = (info) => {
    if (!map[info.key]) {
      map[info.key] = { ...info, ...getWeekRange(info.year, info.week), shippedPos: {}, openPos: {} };
    }
  };

  filtered.forEach((r) => {
    const info = r.shippedDate ? getISOWeekInfo(r.shippedDate) : null;
    if (!info) return;
    ensureWeek(info);
    const pk = `${(r.vendor || "").trim()}||${(r.poNo || "").trim()}`;
    if (!map[info.key].shippedPos[pk]) {
      map[info.key].shippedPos[pk] = { customer: (r.customer || "").trim(), vendor: (r.vendor || "").trim(), poNo: (r.poNo || "").trim(), lines: [] };
    }
    map[info.key].shippedPos[pk].lines.push(r);
  });

  // Open + shipped rows by target date → openPos, line-level dedup.
  // filteredOpen rows go in first; filtered rows only fill gaps not already covered,
  // preventing partially-shipped lines (present in both APIs) from being double-counted.
  const addToOpenPos = (r, skipIfSeen) => {
    const info = r.target ? getISOWeekInfo(r.target) : null;
    if (!info) return;
    ensureWeek(info);
    const pk = `${(r.vendor || "").trim()}||${(r.poNo || "").trim()}`;
    if (!map[info.key].openPos[pk]) {
      map[info.key].openPos[pk] = { customer: (r.customer || "").trim(), vendor: (r.vendor || "").trim(), poNo: (r.poNo || "").trim(), target: r.target, lines: [], _seen: new Set() };
    }
    const entry = map[info.key].openPos[pk];
    const lineKey = `${(r.item || "").trim()}||${r.orderQty || 0}||${r.orderPrice || 0}`;
    if (skipIfSeen && entry._seen.has(lineKey)) return;
    entry._seen.add(lineKey);
    entry.lines.push(r);
  };
  filteredOpen.forEach((r) => addToOpenPos(r, false));
  filtered.forEach((r) => addToOpenPos(r, true));

  Object.values(map).forEach((wk) =>
    Object.values(wk.openPos).forEach((po) => delete po._seen)
  );

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => ({ key, ...data }));
}

export function buildMonths(filtered, filteredOpen) {
  const map = {};
  const ensureMonth = (info) => {
    if (!map[info.key]) {
      map[info.key] = { ...info, ...getMonthRange(info.year, info.month), shippedPos: {}, openPos: {} };
    }
  };

  filtered.forEach((r) => {
    const info = r.shippedDate ? getMonthInfo(r.shippedDate) : null;
    if (!info) return;
    ensureMonth(info);
    const pk = `${(r.vendor || "").trim()}||${(r.poNo || "").trim()}`;
    if (!map[info.key].shippedPos[pk]) {
      map[info.key].shippedPos[pk] = { customer: (r.customer || "").trim(), vendor: (r.vendor || "").trim(), poNo: (r.poNo || "").trim(), lines: [] };
    }
    map[info.key].shippedPos[pk].lines.push(r);
  });

  // Open + shipped rows by target date → openPos, line-level dedup.
  // filteredOpen rows go in first; filtered rows only fill gaps not already covered,
  // preventing partially-shipped lines (present in both APIs) from being double-counted.
  const addToOpenPos = (r, skipIfSeen) => {
    const info = r.target ? getMonthInfo(r.target) : null;
    if (!info) return;
    ensureMonth(info);
    const pk = `${(r.vendor || "").trim()}||${(r.poNo || "").trim()}`;
    if (!map[info.key].openPos[pk]) {
      map[info.key].openPos[pk] = { customer: (r.customer || "").trim(), vendor: (r.vendor || "").trim(), poNo: (r.poNo || "").trim(), target: r.target, lines: [], _seen: new Set() };
    }
    const entry = map[info.key].openPos[pk];
    const lineKey = `${(r.item || "").trim()}||${r.orderQty || 0}||${r.orderPrice || 0}`;
    if (skipIfSeen && entry._seen.has(lineKey)) return;
    entry._seen.add(lineKey);
    entry.lines.push(r);
  };
  filteredOpen.forEach((r) => addToOpenPos(r, false));
  filtered.forEach((r) => addToOpenPos(r, true));

  Object.values(map).forEach((mo) =>
    Object.values(mo.openPos).forEach((po) => delete po._seen)
  );

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => ({ key, ...data }));
}

/** Day-of-month week bucket (1-7, 8-14, 15-21, 22-28, 29-end) — distinct from ISO weeks, used by the Summary tab. */
export function getMonthWeekInfo(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const week = Math.min(5, Math.ceil(d.getDate() / 7));
  return { week, monthKey, key: `${monthKey}-W${week}` };
}

export function getMonthWeekRange(monthKey, weekNum) {
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const startDay = (weekNum - 1) * 7 + 1;
  const endDay = Math.min(startDay + 6, lastDay);
  const start = new Date(year, month - 1, startDay);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month - 1, endDay);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Group shipped/open PO rows into day-of-month week buckets for a single month (Summary tab). */
export function buildMonthWeeks(filtered, filteredOpen, monthKey) {
  const map = {};
  const ensureWeek = (info) => {
    if (!map[info.key]) {
      map[info.key] = { ...info, ...getMonthWeekRange(info.monthKey, info.week), shippedPos: {}, openPos: {} };
    }
  };

  filtered.forEach((r) => {
    const info = r.shippedDate ? getMonthWeekInfo(r.shippedDate) : null;
    if (!info || info.monthKey !== monthKey) return;
    ensureWeek(info);
    const pk = `${(r.vendor || "").trim()}||${(r.poNo || "").trim()}`;
    if (!map[info.key].shippedPos[pk]) {
      map[info.key].shippedPos[pk] = { customer: (r.customer || "").trim(), vendor: (r.vendor || "").trim(), poNo: (r.poNo || "").trim(), lines: [] };
    }
    map[info.key].shippedPos[pk].lines.push(r);
  });

  // Open + shipped rows by target date → openPos, line-level dedup.
  // filteredOpen rows go in first; filtered rows only fill gaps not already covered,
  // preventing partially-shipped lines (present in both APIs) from being double-counted.
  const addToOpenPos = (r, skipIfSeen) => {
    const info = r.target ? getMonthWeekInfo(r.target) : null;
    if (!info || info.monthKey !== monthKey) return;
    ensureWeek(info);
    const pk = `${(r.vendor || "").trim()}||${(r.poNo || "").trim()}`;
    if (!map[info.key].openPos[pk]) {
      map[info.key].openPos[pk] = { customer: (r.customer || "").trim(), vendor: (r.vendor || "").trim(), poNo: (r.poNo || "").trim(), target: r.target, lines: [], _seen: new Set() };
    }
    const entry = map[info.key].openPos[pk];
    const lineKey = `${(r.item || "").trim()}||${r.orderQty || 0}||${r.orderPrice || 0}`;
    if (skipIfSeen && entry._seen.has(lineKey)) return;
    entry._seen.add(lineKey);
    entry.lines.push(r);
  };
  filteredOpen.forEach((r) => addToOpenPos(r, false));
  filtered.forEach((r) => addToOpenPos(r, true));

  Object.values(map).forEach((wk) =>
    Object.values(wk.openPos).forEach((po) => delete po._seen)
  );

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => ({ key, ...data }));
}

export function fyCutoff(year) {
  return new Date(2000 + parseInt(year, 10) - 1, 2, 30);
}

/** DB month_key for a P&L mode (no extra column — suffix on month_key). */
export function plExpenseStorageKey(monthKey, plMode) {
  if (!plMode || plMode === "jng") return monthKey;
  return `${monthKey}#${plMode}`;
}

export function plExpenseMonthFromStorageKey(storageKey) {
  const i = storageKey.lastIndexOf("#");
  return i === -1 ? storageKey : storageKey.slice(0, i);
}

export function plExpenseModeFromStorageKey(storageKey) {
  const i = storageKey.lastIndexOf("#");
  if (i === -1) return "jng";
  const suffix = storageKey.slice(i + 1);
  return suffix === "jnm" || suffix === "overall" ? suffix : "jng";
}

/** In-memory map key (month + P&L mode). */
export function plExpenseKey(monthKey, plMode) {
  return `${monthKey}::${plMode}`;
}

export function computePeriodSummary(period, { getCommPct, getJngCommPct, getJnmCommPct, buyerRateMap, plMode = "jng", isMonth = false, shippedRows = null }) {
  const shippedEntries = Object.values(period.shippedPos);
  const openEntries = Object.values(period.openPos);
  const inPeriod = (r) => {
    const d = new Date(r.shippedDate);
    return r.shippedDate && d >= period.start && d <= period.end;
  };

  const poShippedInPeriodFn = (p) => poProjShippedVal(p, inPeriod);
  const poProjValFn = (p) => poProjShippedVal(p, inPeriod);
  const poOrderValFn = (p) => poOrderVal(p);

  const wkSOV = shippedEntries.reduce((s, p) => s + poOrderValFn(p), 0);
  const wkSSV = shippedRows
    ? (isMonth ? sumShippedValueForPeriodKey(shippedRows, period.key) : sumShippedValueForWeekKey(shippedRows, period.key))
    : sumPeriodShippedValue(shippedEntries, period);
  const wkSBV = shippedEntries.reduce((s, p) => s + p.lines.reduce((ss, r) => ss + (r.balanceValue || 0), 0), 0);
  const wkOOV = openEntries.reduce((s, p) => s + poOrderValFn(p), 0);
  const wkOSV = openEntries.reduce((s, p) => s + poProjValFn(p), 0);
  const wkOBV = wkOOV - wkOSV;

  let wkSComm;
  let wkOComm;
  let jnmShipComm = null;
  let jngShipComm = null;
  let jnmProjComm = null;
  let jngProjComm = null;

  if (plMode === "overall" && getJnmCommPct && getJngCommPct) {
    const shipComm = sumOverallComm(
      shippedEntries.map((p) => [null, p]),
      poShippedInPeriodFn,
      getJnmCommPct,
      getJngCommPct,
    );
    const projComm = sumOverallComm(
      openEntries.map((p) => [null, p]),
      poOrderValFn,
      getJnmCommPct,
      getJngCommPct,
    );
    jnmShipComm = shipComm.jnm;
    jngShipComm = shipComm.jng;
    jnmProjComm = projComm.jnm;
    jngProjComm = projComm.jng;
    wkSComm = shipComm.overall;
    wkOComm = projComm.overall;
  } else {
    wkSComm = sumSingleComm(
      shippedEntries.map((p) => [null, p]),
      poShippedInPeriodFn,
      getCommPct,
    );
    wkOComm = sumSingleComm(
      openEntries.map((p) => [null, p]),
      poOrderValFn,
      getCommPct,
    );
  }

  const flatFeeTotal = (isMonth && (plMode === "jng" || plMode === "overall"))
    ? (() => {
        const seen = new Set();
        return shippedEntries.reduce((s, p) => {
          const k = normStr(p.customer);
          if (seen.has(k)) return s;
          const e = buyerRateMap[k];
          if (!e || e.remarks !== "MONTHLY") return s;
          seen.add(k);
          return s + (e.pct || 0);
        }, 0);
      })()
    : 0;

  const otif = wkOOV > 0 ? (wkOSV / wkOOV) * 100 : null;

  let label;
  if (period.week != null) {
    label = `W${period.week} · ${fmtD(period.start)}–${fmtD(period.end)}, ${period.year}`;
  } else {
    label = `${MONTH_NAMES[period.month]} ${period.year}`;
  }

  return {
    key: period.key,
    label,
    projCount: openEntries.length,
    projPoValue: wkOOV,
    projShipped: wkOSV,
    projBalance: wkOBV,
    otif,
    projComm: wkOComm,
    shipCount: shippedEntries.length,
    shipPoValue: wkSOV,
    shipShipped: wkSSV,
    shipBalance: wkSBV,
    shipComm: wkSComm + flatFeeTotal,
    flatFee: flatFeeTotal,
    jnmShipComm,
    jngShipComm,
    jnmProjComm,
    jngProjComm,
    overallProjComm: wkOComm,
  };
}

/** P&L modal / MIS export — matches WeeklyPoSchedule month header income. */
export function computeMonthPlSummary(period, { plMode, view, getCommPct, getJngCommPct, getJnmCommPct, buyerRateMap, shippedRows = null }) {
  const shipped = Object.values(period.shippedPos);
  const sales = shippedRows
    ? sumShippedValueForPeriodKey(shippedRows, period.key)
    : sumPeriodShippedValue(shipped, period);

  const flatFee = (view === "month" && (plMode === "jng" || plMode === "overall"))
    ? (() => {
        const seen = new Set();
        return shipped.reduce((s, p) => {
          const k = normStr(p.customer);
          if (seen.has(k)) return s;
          const e = buyerRateMap[k];
          if (!e || e.remarks !== "MONTHLY") return s;
          seen.add(k);
          return s + (e.pct || 0);
        }, 0);
      })()
    : 0;

  const inPeriod = (r) => {
    const d = new Date(r.shippedDate);
    return r.shippedDate && d >= period.start && d <= period.end;
  };
  const poShippedInPeriodFn = (p) => poProjShippedVal(p, inPeriod);
  const shippedEntries = shipped.map((p) => [null, p]);
  let income;
  if (plMode === "overall") {
    income = sumOverallComm(shippedEntries, poShippedInPeriodFn, getJnmCommPct, getJngCommPct).overall + flatFee;
  } else {
    income = sumSingleComm(shippedEntries, poShippedInPeriodFn, getCommPct) + flatFee;
  }

  return {
    sales_global: sales,
    income_from_sales: income,
    income_pct_to_sales: sales > 0 ? (income / sales) * 100 : null,
    flat_fee_commission: flatFee > 0 ? flatFee : null,
  };
}
