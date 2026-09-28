import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { computeOpenVsInspectedTrend } from '../../utils/qcOpenVsInspectedTrend'

const GRANULARITIES = [
  { id: 'year', label: 'Year' },
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
]

const C = {
  open: '#93b4d8',
  openLine: '#4a7fcb',
  inspected: '#6ecfb2',
  inspectedLine: '#1a9e75',
  grid: '#f1f5f9',
  tick: '#94a3b8',
}

function TrendTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  const openKey = metric === 'pos' ? 'openPos' : 'openSkus'
  const inspectedKey = metric === 'pos' ? 'inspectedPos' : 'inspectedSkus'
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-lg text-xs">
      <p className="text-slate-400 text-[11px] font-semibold mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: C.openLine }} />
          <span className="text-slate-500">Open</span>
          <span className="ml-auto font-semibold text-slate-700">{row[openKey]}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: C.inspectedLine }} />
          <span className="text-slate-500">Inspected</span>
          <span className="ml-auto font-semibold text-slate-700">{row[inspectedKey]}</span>
        </div>
      </div>
    </div>
  )
}

// openPoRows/inspectedRows: already buyer/vendor/inspector/merchant-scoped
// rows from QcReportsSummary.jsx's wide 24-month trend fetch (openPoTrendRows/
// inspectedTrendRows, filtered the same way filteredRows/scopedRows are).
export default function QcOpenVsInspectedChart({ openPoRows, inspectedRows }) {
  const [granularity, setGranularity] = useState('week')
  const [metric, setMetric] = useState('pos')

  const data = useMemo(
    () => computeOpenVsInspectedTrend(openPoRows, inspectedRows, granularity)
      // A bucket with zero activity on every series is dead space on the
      // chart (most visible on the daily Week view, where weekends often
      // have nothing) - drop it rather than plotting a flat gap.
      .filter(b => b.openPos || b.inspectedPos || b.openSkus || b.inspectedSkus),
    [openPoRows, inspectedRows, granularity]
  )

  const posKey = metric === 'pos' ? 'openPos' : 'openSkus'
  const inspectedKey = metric === 'pos' ? 'inspectedPos' : 'inspectedSkus'
  const unit = metric === 'pos' ? 'POs' : 'SKUs'

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 pt-4 pb-4 sm:px-6 h-full flex flex-col">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 flex-shrink-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Open vs Inspected · {unit}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
            {['pos', 'skus'].map(m => (
              <button key={m} type="button" onClick={() => setMetric(m)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors
                  ${metric === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {m === 'pos' ? 'POs' : 'SKUs'}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
            {GRANULARITIES.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => setGranularity(id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors
                  ${granularity === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.openLine }} /> Open
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.inspectedLine }} /> Inspected
            </span>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} barGap={2} barCategoryGap="28%">
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: C.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: C.tick, fontSize: 11 }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
            <Tooltip content={<TrendTooltip metric={metric} />} cursor={{ fill: '#f8fafc' }} />
            <Bar dataKey={posKey} fill={C.open} stroke={C.openLine} strokeWidth={1} radius={[3, 3, 0, 0]} />
            <Bar dataKey={inspectedKey} fill={C.inspected} stroke={C.inspectedLine} strokeWidth={1} radius={[3, 3, 0, 0]} />
            <Line dataKey={posKey} type="monotone" stroke={C.openLine} strokeWidth={1.5}
              dot={{ r: 2.5, fill: C.openLine, strokeWidth: 0 }} activeDot={{ r: 4 }} />
            <Line dataKey={inspectedKey} type="monotone" stroke={C.inspectedLine} strokeWidth={1.5}
              dot={{ r: 2.5, fill: C.inspectedLine, strokeWidth: 0 }} activeDot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
