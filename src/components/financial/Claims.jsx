import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';

// ── Data ──────────────────────────────────────────────────────────────────────

const RAW = [
  { customer: 'ABIGAIL AHERN',       ly: 0,         cy: 910      },
  { customer: 'AREO INC',            ly: 4983.90,   cy: 309      },
  { customer: 'AS CHEHOMA',          ly: 33211,     cy: 1823     },
  { customer: 'Balance & Bloom',     ly: 0,         cy: 1370     },
  { customer: 'DINNERWARE & CO B.V', ly: 0,         cy: 1370     },
  { customer: 'HOUSE DOCTOR',        ly: 11502.27,  cy: 16947.76 },
  { customer: 'JONATHAN ADLER',      ly: 0,         cy: 4913.70  },
  { customer: 'JYC',                 ly: 15000,     cy: 0        },
  { customer: 'KIM SEYBERT',         ly: 4983.90,   cy: 309      },
  { customer: 'NKUKU',               ly: 17057.00,  cy: 32115.00 },
];

const TOTAL_LY = 86738.08;
const TOTAL_CY = 60067.46;
const MAX_VAL  = 33211;

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = v =>
  v === 0
    ? '—'
    : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = v => Math.round((v / MAX_VAL) * 100);

// ── Sub-components ────────────────────────────────────────────────────────────

function StatTile({ label, value, meta, variant = 'default' }) {
  const base =
    'rounded-xl px-4 py-4 flex flex-col gap-1 border transition-colors hover:border-gray-900';
  const variants = {
    default:   'bg-white border-gray-200',
    highlight: 'bg-white border-gray-900',
    muted:     'bg-gray-50 border-gray-200',
  };

  return (
    <div className={`${base} ${variants[variant]}`}>
      <span className="text-xs text-gray-500 font-medium">{label}</span>
      <span className="text-2xl font-semibold text-gray-900 tabular-nums leading-tight">{value}</span>
      {meta && <span className="text-xs text-gray-400 mt-0.5">{meta}</span>}
    </div>
  );
}

function TrendBadge({ ly, cy, override }) {
  if (override) {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-green-100 text-green-700 whitespace-nowrap">
        {override}
      </span>
    );
  }
  const isUp = cy > ly;
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded whitespace-nowrap
        ${isUp ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}
    >
      {isUp ? '▲' : '▼'}
    </span>
  );
}

function MiniBar({ value, type }) {
  const width = pct(value);
  return (
    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500
          ${type === 'ly' ? 'bg-red-400' : 'bg-blue-500'}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

// ── Sort control ──────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'customer-asc', label: 'Name A→Z' },
  { value: 'cy-desc',      label: 'FY26 High→Low' },
  { value: 'ly-desc',      label: 'LY25 High→Low' },
  { value: 'cy-asc',       label: 'FY26 Low→High' },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function QualityClaimsSummary() {
  const [sortKey, setSortKey] = useState('customer-asc');
  const sorted = useMemo(() => {
    const data = [...RAW];
    switch (sortKey) {
      case 'cy-desc':      return data.sort((a, b) => b.cy - a.cy);
      case 'ly-desc':      return data.sort((a, b) => b.ly - a.ly);
      case 'cy-asc':       return data.sort((a, b) => a.cy - b.cy);
      case 'customer-asc': 
      default:             return data.sort((a, b) => a.customer.localeCompare(b.customer));
    }
  }, [sortKey]);

  return (
    <div className="p-4">

      {/* Title */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Quality Claims Summary — LY25 / FY26
      </h2>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-7">
        <StatTile
          label="Active Customers with Claims"
          value="10"
        />
        <StatTile
          label="Total Claims LY25"
          value={fmt(TOTAL_LY)}
          meta="Last Year"
          variant="highlight"
        />
        <StatTile
          label="Total Claims FY26"
          value={fmt(TOTAL_CY)}
          meta="▼ 30.8% vs LY"
          variant="muted"
        />
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">

        {/* Table toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 gap-3 flex-wrap">
          <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
            {/* Legend */}
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-1.5 rounded-full bg-red-400" />
              LY25
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-1.5 rounded-full bg-blue-500" />
              FY26
            </span>
          </div>

          {/* Sort */}
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value)}
            className="text-xs font-medium border border-gray-200 rounded-lg px-2.5 py-1.5
              text-gray-600 bg-white focus:outline-none focus:border-gray-900 cursor-pointer
              transition-colors"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Header */}
        <div className="hidden sm:grid px-4 py-2.5 border-b border-gray-100 bg-gray-50"
          style={{ gridTemplateColumns: '2fr 1fr 1fr 2fr' }}>
          {['Customer', 'LY25 ($)', 'FY26 ($)', 'Trend'].map(h => (
            <span key={h} className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {h}
            </span>
          ))}
        </div>

        {/* Rows */}
        <div>
          {sorted.map(row => (
            <div
              key={row.customer}
              className="hidden sm:grid px-4 py-3 border-b border-gray-50 last:border-b-0
                hover:bg-gray-50/60 transition-colors items-center"
              style={{ gridTemplateColumns: '2fr 1fr 1fr 2fr' }}
            >
              {/* Customer */}
              <span className="text-sm text-gray-800 font-medium truncate pr-2">
                {row.customer}
              </span>

              {/* LY */}
              <span className="text-sm text-gray-400 tabular-nums">{fmt(row.ly)}</span>

              {/* CY */}
              <span className="text-sm font-medium text-gray-900 tabular-nums">{fmt(row.cy)}</span>

              {/* Bars + badge */}
              <div className="flex items-center gap-3 pr-2">
                <div className="flex-1 flex flex-col gap-1">
                  <MiniBar value={row.ly} type="ly" />
                  <MiniBar value={row.cy} type="cy" />
                </div>
                <TrendBadge ly={row.ly} cy={row.cy} />
              </div>
            </div>
          ))}

          {/* Mobile rows */}
          {sorted.map(row => (
            <div
              key={`m-${row.customer}`}
              className="sm:hidden px-4 py-3 border-b border-gray-50 last:border-b-0"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-800">{row.customer}</span>
                <TrendBadge ly={row.ly} cy={row.cy} />
              </div>
              <div className="flex gap-6 text-xs text-gray-500 mb-2">
                <span>LY25: <span className="text-gray-400 tabular-nums">{fmt(row.ly)}</span></span>
                <span>FY26: <span className="font-semibold text-gray-800 tabular-nums">{fmt(row.cy)}</span></span>
              </div>
              <div className="flex flex-col gap-1">
                <MiniBar value={row.ly} type="ly" />
                <MiniBar value={row.cy} type="cy" />
              </div>
            </div>
          ))}
        </div>

        {/* Total row */}
        <div
          className="hidden sm:grid px-4 py-3.5 border-t-2 border-gray-900 bg-gray-50 items-center"
          style={{ gridTemplateColumns: '2fr 1fr 1fr 2fr' }}
        >
          <span className="text-sm font-bold text-gray-900">Total</span>
          <span className="text-sm font-bold text-gray-900 tabular-nums">{fmt(TOTAL_LY)}</span>
          <span className="text-sm font-bold text-gray-900 tabular-nums">{fmt(TOTAL_CY)}</span>
          <div>
            <TrendBadge override="▼ 30.8%" />
          </div>
        </div>

        {/* Mobile total */}
        <div className="sm:hidden px-4 py-3.5 border-t-2 border-gray-900 bg-gray-50 flex items-center justify-between">
          <div>
            <span className="text-sm font-bold text-gray-900 block">Total</span>
            <span className="text-xs text-gray-500 tabular-nums">
              LY: {fmt(TOTAL_LY)} · FY26: {fmt(TOTAL_CY)}
            </span>
          </div>
          <TrendBadge override="▼ 30.8%" />
        </div>
      </div>
    </div>
  );
}