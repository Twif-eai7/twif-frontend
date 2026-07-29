import { useState, useCallback } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';

// ── Data ──────────────────────────────────────────────────────────────────────

const MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];

const RAW = {
  value: {
    fy25: [225909,304328,638301,365386,495762,671245,427801,212892,708613,686015,363587,325761],
    fy26: [249230,267413,744452,711800,533734,964417,408333,217055,410545,555296,479307,361470],
    fmt: (v) => v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` : `$${(v/1000).toFixed(0)}K`,
    label: 'Invoice Value',
  },
  cbm: {
    fy25: [597.8,792.7,991.7,822.4,999.2,1762.6,1010.0,611.2,1754.9,1633.6,763.3,1017.0],
    fy26: [678.4,632.8,1557.6,1309.4,1178.8,2726.4,1159.7,417.9,1079.2,1211.9,1261.8,772.4],
    fmt: (v) => `${v.toLocaleString('en', { maximumFractionDigits: 0 })} m³`,
    label: 'CBM (FCL)',
  },
  inv: {
    fy25: [13,20,38,25,25,40,23,11,41,43,23,18],
    fy26: [15,16,31,39,31,53,23,14,27,32,29,26],
    fmt: (v) => `${v} inv`,
    label: 'Invoices',
  },
  lcl: {
    fy25: [3,6,18,14,11,14,9,3,17,19,12,4],
    fy26: [5,6,8,19,13,12,5,7,11,13,10,13],
    fmt: (v) => `${v} LCL`,
    label: 'LCL Count',
  },
};

const KPI = [
  { label: 'FY26 Total Value',    value: '$5.90M',  change: '▲ 8.8% vs FY25',  up: true  },
  { label: 'FY26 Invoices',       value: '336',     change: '▲ 5.0% vs FY25',  up: true  },
  { label: 'FY26 FCL CBM',        value: '13,986',  change: '▲ 9.6% vs FY25',  up: true  },
  { label: "FY26 40' Containers", value: '208',     change: '▼ 14.4% vs FY25', up: false },
];

const pct = (a, b) => b === 0 ? 0 : Math.round((a - b) / b * 100);

function buildChartData(metric) {
  const d = RAW[metric];
  return MONTHS.map((m, i) => ({
    month: m,
    fy25: d.fy25[i],
    fy26: d.fy26[i],
    delta: pct(d.fy26[i], d.fy25[i]),
  }));
}

const C = {
  fy25:     '#93b4d8',
  fy25Line: '#4a7fcb',
  fy26:     '#6ecfb2',
  fy26Line: '#1a9e75',
  up:       '#059669',
  down:     '#dc2626',
  grid:     '#f1f5f9',
  tick:     '#94a3b8',
};

// ── Tooltips ──────────────────────────────────────────────────────────────────

function MainTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;
  const d = RAW[metric];
  const i = MONTHS.indexOf(label);
  if (i < 0) return null;
  const v25 = d.fy25[i], v26 = d.fy26[i];
  const dp = pct(v26, v25);
  const up = dp >= 0;
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-lg text-xs">
      <p className="text-slate-400 text-[11px] font-semibold mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: C.fy25Line }} />
          <span className="text-slate-500">FY25</span>
          <span className="ml-auto font-semibold text-slate-700">{d.fmt(v25)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: C.fy26Line }} />
          <span className="text-slate-500">FY26</span>
          <span className="ml-auto font-semibold text-slate-700">{d.fmt(v26)}</span>
        </div>
        <div className={`text-xs font-bold mt-2 ${up ? 'text-emerald-600' : 'text-red-500'}`}>
          {up ? '▲' : '▼'} {Math.abs(dp)}% YoY
        </div>
      </div>
    </div>
  );
}

function DeltaTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const dp = payload[0]?.value ?? 0;
  const up = dp >= 0;
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-lg text-xs">
      <p className="text-slate-400 text-[11px] font-semibold mb-1">{label}</p>
      <span className={`text-sm font-bold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
        {up ? '▲' : '▼'} {Math.abs(dp)}%
      </span>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, change, up }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-4 space-y-2">
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md
        ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
        {change}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LogisticsChart() {
  const [metric, setMetric] = useState('value');
  const data = buildChartData(metric);

  const yTickFmt = useCallback((v) => {
    if (metric === 'value') return v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${(v/1000).toFixed(0)}K`;
    return String(v);
  }, [metric]);

  const TABS = Object.entries(RAW).map(([id, { label }]) => ({ id, label }));

  return (
    <div className="min-h-screen bg-slate-50  py-8 ">
      <div className="w-full mx-auto space-y-6">

        {/* Header */}
        <div className='px-4'>
          <h1 className="text-xl font-bold text-slate-900">Nkuku · YoY Logistics Summary</h1>
          <p className="text-sm text-slate-400 mt-0.5">FY25 vs FY26 — Apr to Mar</p>
        </div>

        {/* KPIs */}
        <div className="px-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {KPI.map(k => <KpiCard key={k.label} {...k} />)}
        </div>

        {/* Tabs + legend */}
        <div className="px-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex flex-wrap gap-2">
            {TABS.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => setMetric(id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border
                  ${metric === id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                  }`}>
                {label}
              </button>
            ))}
          </div>
          <div className=" px-4 flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: C.fy25Line }} /> FY25
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: C.fy26Line }} /> FY26
            </span>
          </div>
        </div>
        
         <div className='px-4'>
        {/* Main chart */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 pt-5 pb-4 sm:px-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            {RAW[metric].label} · Monthly
          </p>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} barGap={2} barCategoryGap="28%">
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: C.tick, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yTickFmt} tick={{ fill: C.tick, fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
                <Tooltip content={<MainTooltip metric={metric} />} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="fy25" fill={C.fy25} stroke={C.fy25Line} strokeWidth={1} radius={[3,3,0,0]} />
                <Bar dataKey="fy26" fill={C.fy26} stroke={C.fy26Line} strokeWidth={1} radius={[3,3,0,0]} />
                <Line dataKey="fy25" type="monotone" stroke={C.fy25Line} strokeWidth={1.5}
                  dot={{ r: 2.5, fill: C.fy25Line, strokeWidth: 0 }} activeDot={{ r: 4 }} />
                <Line dataKey="fy26" type="monotone" stroke={C.fy26Line} strokeWidth={1.5}
                  dot={{ r: 2.5, fill: C.fy26Line, strokeWidth: 0 }} activeDot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Delta chart */}
        <div className=" bg-white rounded-xl border border-slate-100 shadow-sm px-4 pt-5 pb-4 sm:px-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Monthly Change · FY26 vs FY25 (%)
          </p>
          <div style={{ height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} barCategoryGap="32%">
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: C.tick, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `${v}%`} tick={{ fill: C.tick, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1.5} />
                <Tooltip content={<DeltaTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="delta" radius={[3,3,0,0]}>
                  {data.map((entry, i) => (
                    <Cell key={i}
                      fill={entry.delta >= 0 ? '#bbf7d0' : '#fecaca'}
                      stroke={entry.delta >= 0 ? '#16a34a' : '#dc2626'}
                      strokeWidth={1}
                    />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        </div>

      </div>
    </div>
  );
}