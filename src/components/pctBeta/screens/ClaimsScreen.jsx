import { useEffect } from 'react'
import { usePctBetaStore } from '../state/usePctBetaStore'

const CLAIMS = [
  ['Size mismatch', 'Compare PP sample approved dimensions vs inline / midline / final measurements; flag beyond tolerance and block final QC closure.'],
  ['Weight mismatch', 'Capture approved unit weight and carton weight; any deviation beyond threshold triggers merchant + QA alert.'],
  ['Wrong invoice value', 'System compares PO value, cost sheet, invoice value and ERP entry; mismatches block documentation.'],
  ['Tech spec variation', 'Bulk components, finish, hardware and assembly spec compared against approved BOM and PP lock.'],
  ['Packaging deviation', 'Barcode, legal text, carton spec, pack ratio and ship marks compared before stuffing approval.'],
  ['Missed till final inspection', 'Any unresolved deviation automatically appears in final QC checklist and shipment release screen.'],
]

function Badge({ children, tone }) {
  const map = {
    green: 'bg-emerald-100 text-emerald-700',
    yellow: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
  }
  return <span className={`inline-flex items-center px-[10px] py-[3px] rounded-full text-[11px] font-semibold whitespace-nowrap ${map[tone]}`}>{children}</span>
}

export default function ClaimsScreen() {
  const selectedPO = usePctBetaStore((s) => s.selectedPO)
  const tabChecksByPO = usePctBetaStore((s) => s.tabChecksByPO)
  const ensureTabChecks = usePctBetaStore((s) => s.ensureTabChecks)
  const toggleTabCheck = usePctBetaStore((s) => s.toggleTabCheck)

  useEffect(() => { CLAIMS.forEach((_, idx) => ensureTabChecks(`claims-${idx}`, 1)) }, [selectedPO?.po, ensureTabChecks])

  const p = selectedPO
  if (!p) return null
  const riskTone = p.risk === 'High' ? 'red' : p.risk === 'Medium' ? 'yellow' : 'green'

  return (
    <div className="px-7 py-6 max-w-full overflow-x-hidden flex-1 min-h-0 overflow-y-auto animate-[fadeUp_.35s_ease]">
      <div className="mb-6">
        <h2 className="text-[22px] font-bold">Claims Prevention Logic</h2>
        <p className="text-[12.5px] text-slate-500 mt-1">PO {p.po} · SKU {p.sku} · {p.vendor}</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-[14px] p-5 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {CLAIMS.map(([a, b], idx) => {
            const key = `claims-${idx}`
            const row = tabChecksByPO[key]?.[p.po]?.[0] || { done: false, by: '', ts: '' }
            return (
              <div key={a} className="bg-slate-50 rounded-xl p-4">
                <h4 className="font-bold text-sm mb-2">{a}</h4>
                <p className="text-[12.5px] text-slate-600 leading-snug">{b}</p>
                <div className="mt-2.5">
                  <label className="flex items-start gap-2 text-[13px] text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={!!row.done} onChange={(e) => toggleTabCheck(key, 0, e.target.checked)} />
                    <span>
                      <span>{a} control completed</span>
                      {row.done && <div className="text-[11px] text-slate-500 mt-0.5">Checked by {row.by} · {row.ts}</div>}
                    </span>
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-[14px] p-5 shadow-sm mt-6">
        <h3 className="text-lg font-bold mb-4">Active Claim Risks — Selected PO</h3>
        <div className="border border-slate-200 rounded-xl overflow-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-slate-50">
              <tr>
                {['PO', 'Vendor', 'Claim Type', 'Severity', 'Action Required'].map((h) => (
                  <th key={h} className="text-left px-3.5 py-2.5 font-semibold text-slate-400 text-[11px] uppercase tracking-[.4px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3.5 py-3 border-t border-slate-100 font-semibold">{p.po}</td>
                <td className="px-3.5 py-3 border-t border-slate-100">{p.vendor}</td>
                <td className="px-3.5 py-3 border-t border-slate-100">{p.claim}</td>
                <td className="px-3.5 py-3 border-t border-slate-100"><Badge tone={riskTone}>{p.risk}</Badge></td>
                <td className="px-3.5 py-3 border-t border-slate-100">Track and close controls before shipment</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
