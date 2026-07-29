import { useMemo } from 'react'
import { usePctBetaStore } from '../state/usePctBetaStore'
import { REAL_DATA } from '../constants'
import {
  representativeRowsByPO,
  delayDaysNumber,
  getVendorColor,
  getVendorInitials,
  getBuyerColor,
  getBuyerInitials,
  guessBuyer,
} from '../utils'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'atrisk', label: 'At Risk' },
  { key: 'ontrack', label: 'On Track' },
]

const ACTIVITY_ITEMS = [
  { po: 'P0009414', text: 'escalated to COO — 13d delay', time: '2 min ago', type: 'critical' },
  { po: 'P0009542', text: 'dispatch complete — Before time', time: '18 min ago', type: 'warning' },
  { po: 'P0009665N1', text: 'Final QC stage activated', time: '1 hr ago', type: 'warning' },
  { po: 'P0009733', text: 'Pack. Indent checks completed', time: '3 hr ago', type: 'info' },
]

function RiskBadge({ risk }) {
  const tone = risk === 'High' ? 'bg-red-100 text-red-700' : risk === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
  return <span className={`inline-flex items-center px-[10px] py-[3px] rounded-full text-[11px] font-semibold whitespace-nowrap ${tone}`}>{risk}</span>
}

export default function DashboardScreen() {
  const poRows = usePctBetaStore((s) => s.poRows)
  const kpis = usePctBetaStore((s) => s.kpis)
  const loading = usePctBetaStore((s) => s.loading)
  const activeFilter = usePctBetaStore((s) => s.activeFilter)
  const setActiveFilter = usePctBetaStore((s) => s.setActiveFilter)
  const selectPO = usePctBetaStore((s) => s.selectPO)
  const setActiveTab = usePctBetaStore((s) => s.setActiveTab)

  const kpi = kpis || REAL_DATA

  const uniqueByPO = useMemo(() => representativeRowsByPO(poRows), [poRows])
  const filteredRows = useMemo(() => {
    if (activeFilter === 'all') return uniqueByPO
    if (activeFilter === 'critical') return uniqueByPO.filter((r) => r.risk === 'High')
    if (activeFilter === 'atrisk') return uniqueByPO.filter((r) => r.risk === 'Medium')
    return uniqueByPO.filter((r) => r.risk === 'Low')
  }, [uniqueByPO, activeFilter])

  const vendorList = useMemo(() => {
    const counts = {}
    uniqueByPO.forEach((r) => { counts[r.vendor] = (counts[r.vendor] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [uniqueByPO])

  const handleRowClick = (r) => {
    selectPO(r.po)
    setActiveTab('workflow')
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-7 py-6 max-w-full overflow-x-hidden animate-[fadeUp_.35s_ease]">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5 flex-shrink-0">
        <KpiCard label="Open POs" value={kpi.totalPOs} sub={`${(kpi.totalLineItems || 0).toLocaleString()} line items · ${kpi.totalVendors || 0} vendors`} trend="↔ Stable" trendCls="text-slate-500" />
        <KpiCard label="OTIF Rate" value={`${kpi.otif}%`} valueCls="text-emerald-600" sub="Target 85% · Ahead" trend="↑ Live" trendCls="text-emerald-600" />
        <KpiCard label="At Risk / Delayed" value={kpi.delayed} valueCls="text-red-600" sub="Need intervention" trend="Live" trendCls="text-red-600" />
        <KpiCard label="Line Items" value={kpi.totalLineItems || 0} sub={`${kpi.onTime || 0} on track`} trend="Database" trendCls="text-emerald-600" />
      </div>

      {loading && <div className="text-sm text-slate-500 mb-3">Loading Control Tower…</div>}

      <div className="grid gap-5 grid-cols-1 xl:[grid-template-columns:11fr_4fr] flex-1 min-h-0 overflow-hidden">
        <div className="bg-white border border-slate-200 rounded-[14px] p-5 shadow-sm flex flex-col min-h-0 overflow-hidden">
          <div className="flex justify-between items-center mb-3.5 flex-wrap gap-2 flex-shrink-0">
            <div className="text-sm font-bold uppercase tracking-[.4px] text-slate-800">PO Health Snapshot</div>
            <div className="flex gap-1.5 flex-wrap">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setActiveFilter(f.key)}
                  className={`px-4 py-[7px] rounded-full text-xs font-semibold border transition-colors ${activeFilter === f.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto border border-slate-200 rounded-xl">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-slate-50 sticky top-0 z-[2] shadow-[0_1px_0_#e2e8f0]">
                <tr>
                  {['PO / Buyer', 'Vendor', 'Stage', 'Ex-Factory', 'Styles', 'Claim Trigger', 'Risk', 'Delay'].map((h) => (
                    <th key={h} className="text-left px-3.5 py-2.5 font-semibold text-slate-400 text-[11px] uppercase tracking-[.4px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const buyer = guessBuyer(r)
                  const bi = getBuyerInitials(buyer)
                  const bc = getBuyerColor(buyer)
                  const vi = getVendorInitials(r.vendor)
                  const vc = getVendorColor(r.vendor)
                  const dd = delayDaysNumber(r)
                  const delayLabel = dd !== null && dd > 0 ? `+${Math.round(dd)}d` : 'On track'
                  const delayCls = dd !== null && dd > 0 ? 'text-red-600' : 'text-emerald-600'
                  return (
                    <tr key={`${r.po}-${r.sku}`} className="cursor-pointer transition-colors hover:[&_td]:bg-slate-50" onClick={() => handleRowClick(r)}>
                      <td className="px-3.5 py-3 border-t border-slate-100">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-sm text-slate-900">{r.po}</span>
                          <span className="flex items-center gap-1 text-[11px] text-slate-500">
                            <span className="inline-flex items-center justify-center w-[14px] h-[14px] rounded-[4px] text-[7px] font-bold text-white" style={{ background: bc }}>{bi}</span>
                            {buyer}
                          </span>
                        </div>
                      </td>
                      <td className="px-3.5 py-3 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-md text-[9px] font-bold text-white flex items-center justify-center flex-shrink-0" style={{ background: vc }}>{vi}</div>
                          {r.vendor}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 border-t border-slate-100">{r.stage}</td>
                      <td className="px-3.5 py-3 border-t border-slate-100">{r.exf}</td>
                      <td className="px-3.5 py-3 border-t border-slate-100">{r.styles || '—'}</td>
                      <td className="px-3.5 py-3 border-t border-slate-100">{r.claim || '—'}</td>
                      <td className="px-3.5 py-3 border-t border-slate-100"><RiskBadge risk={r.risk} /></td>
                      <td className="px-3.5 py-3 border-t border-slate-100"><span className={`font-semibold ${delayCls}`}>{delayLabel}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-5 max-h-full overflow-auto">
          <div className="bg-white border border-slate-200 rounded-[14px] p-5 shadow-sm">
            <div className="text-sm font-bold uppercase tracking-[.4px] text-slate-800 mb-3.5">Vendor Breakdown</div>
            {vendorList.map(([vendor, count]) => {
              const vi = getVendorInitials(vendor)
              const vc = getVendorColor(vendor)
              return (
                <div key={vendor} className="flex items-center gap-2.5 py-2 border-b border-slate-100 last:border-b-0">
                  <div className="w-7 h-7 rounded-md text-[9px] font-bold text-white flex items-center justify-center flex-shrink-0" style={{ background: vc }}>{vi}</div>
                  <span className="flex-1 text-[13px] font-medium text-slate-700">{vendor}</span>
                  <span className="text-sm font-bold" style={{ color: vc }}>{count}</span>
                </div>
              )
            })}
          </div>

          <div className="bg-white border border-slate-200 rounded-[14px] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-sm font-bold uppercase tracking-[.4px] text-slate-800">Activity</span>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" /> Live
              </span>
            </div>
            {ACTIVITY_ITEMS.map((a, i) => (
              <div key={i} className="flex gap-2.5 py-2.5 border-b border-slate-100 last:border-b-0">
                <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${a.type === 'critical' ? 'bg-red-600' : a.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] text-slate-700 leading-snug"><strong className="font-bold text-slate-900">{a.po}</strong> {a.text}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono tracking-[-0.2px]">{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, valueCls = 'text-slate-900', sub, trend, trendCls }) {
  return (
    <div className="bg-white border border-slate-200 rounded-[14px] p-5 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-[.5px] text-slate-500">{label}</div>
      <div className={`text-[32px] font-bold mt-1 leading-[1.1] ${valueCls}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1.5">{sub}</div>
      <div className={`text-[11.5px] mt-1.5 font-semibold ${trendCls}`}>{trend}</div>
    </div>
  )
}
