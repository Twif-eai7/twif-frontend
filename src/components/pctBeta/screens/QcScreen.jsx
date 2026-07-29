import { useEffect } from 'react'
import { usePctBetaStore } from '../state/usePctBetaStore'

const SECTIONS = [
  ['Inline QC', ['Size and weight check', 'Finish and workmanship', 'Component verification', 'Rework action owner']],
  ['Midline QC', ['Bulk vs PP comparison', 'Packaging method check', 'Artwork / label check', 'Corrective action closure']],
  ['Final QC', ['AQL pass / fail', 'Packing list vs physical qty', 'Invoice vs PO vs ERP', 'Shipment release gate']],
]

function Badge({ children, tone }) {
  const map = {
    green: 'bg-emerald-100 text-emerald-700',
    blue: 'bg-blue-100 text-blue-700',
    yellow: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    slate: 'bg-slate-100 text-slate-600',
  }
  return <span className={`inline-flex items-center px-[10px] py-[3px] rounded-full text-[11px] font-semibold whitespace-nowrap ${map[tone]}`}>{children}</span>
}

export default function QcScreen() {
  const selectedPO = usePctBetaStore((s) => s.selectedPO)
  const tabChecksByPO = usePctBetaStore((s) => s.tabChecksByPO)
  const ensureTabChecks = usePctBetaStore((s) => s.ensureTabChecks)
  const toggleTabCheck = usePctBetaStore((s) => s.toggleTabCheck)

  useEffect(() => {
    SECTIONS.forEach((_, i) => ensureTabChecks(`qc-${i}`, SECTIONS[i][1].length))
  }, [selectedPO?.po, ensureTabChecks])

  const p = selectedPO
  if (!p) return null
  const riskTone = p.risk === 'High' ? 'red' : p.risk === 'Medium' ? 'yellow' : 'green'

  return (
    <div className="px-7 py-6 max-w-full overflow-x-hidden flex-1 min-h-0 overflow-y-auto animate-[fadeUp_.35s_ease]">
      <div className="mb-6">
        <h2 className="text-[22px] font-bold">QC &amp; Compliance</h2>
        <p className="text-[12.5px] text-slate-500 mt-1">PO {p.po} · SKU {p.sku} · {p.vendor}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {SECTIONS.map(([title, points], secIdx) => {
          const tabKey = `qc-${secIdx}`
          const rows = tabChecksByPO[tabKey]?.[p.po] || points.map(() => ({ done: false, by: '', ts: '' }))
          return (
            <div key={title} className="bg-white border border-slate-200 rounded-[14px] p-5 shadow-sm">
              <h3 className="text-lg font-bold mb-4">{title}</h3>
              <div>
                {points.map((point, idx) => {
                  const row = rows[idx] || { done: false, by: '', ts: '' }
                  return (
                    <label key={idx} className="flex items-start gap-2 mb-2.5 text-[13px] text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={!!row.done} onChange={(e) => toggleTabCheck(tabKey, idx, e.target.checked)} />
                      <span>
                        <span>{point}</span>
                        {row.done && <div className="text-[11px] text-slate-500 mt-0.5">Checked by {row.by} · {row.ts}</div>}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="bg-white border border-slate-200 rounded-[14px] p-5 shadow-sm mt-6">
        <h3 className="text-lg font-bold mb-4">Live QC Status — Selected PO</h3>
        <div className="border border-slate-200 rounded-xl overflow-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-slate-50">
              <tr>
                {['PO', 'Vendor', 'Inline', 'Midline', 'Final', 'Status'].map((h) => (
                  <th key={h} className="text-left px-3.5 py-2.5 font-semibold text-slate-400 text-[11px] uppercase tracking-[.4px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3.5 py-3 border-t border-slate-100 font-semibold">{p.po}</td>
                <td className="px-3.5 py-3 border-t border-slate-100">{p.vendor}</td>
                <td className="px-3.5 py-3 border-t border-slate-100"><Badge tone={p.stage.includes('Inline') ? 'blue' : 'slate'}>{p.stage.includes('Inline') ? 'In stage' : 'Planned'}</Badge></td>
                <td className="px-3.5 py-3 border-t border-slate-100"><Badge tone={p.stage.includes('Midline') ? 'blue' : 'slate'}>{p.stage.includes('Midline') ? 'In stage' : 'Planned'}</Badge></td>
                <td className="px-3.5 py-3 border-t border-slate-100"><Badge tone={p.stage.includes('Final') ? 'blue' : 'slate'}>{p.stage.includes('Final') ? 'In stage' : 'Planned'}</Badge></td>
                <td className="px-3.5 py-3 border-t border-slate-100"><Badge tone={riskTone}>{p.risk}</Badge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
