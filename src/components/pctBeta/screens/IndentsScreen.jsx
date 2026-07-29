import { useEffect } from 'react'
import { usePctBetaStore } from '../state/usePctBetaStore'
import { IconFactory, IconPkgCheck } from '../icons'

const RM_FLOW = [
  'BOM auto-pulled from approved tech pack',
  'RM qty plan vs order qty and wastage %',
  'Supplier lead time commitment captured',
  'Material grade / gsm / finish matched to approval',
  'Alternative source mapped for critical items',
  'Auto alert if RM receipt misses milestone',
]
const PKG_FLOW = [
  'Inner / master carton specs locked against buyer manual',
  'Barcode artwork and shipping marks approved',
  'Drop test / transit validation requirement checked',
  'Legal label text and country-specific compliance checked',
  'Packing mock-up uploaded before bulk packing',
  'Auto block if barcode / label mismatch remains open',
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

export default function IndentsScreen() {
  const selectedPO = usePctBetaStore((s) => s.selectedPO)
  const tabChecksByPO = usePctBetaStore((s) => s.tabChecksByPO)
  const ensureTabChecks = usePctBetaStore((s) => s.ensureTabChecks)
  const toggleTabCheck = usePctBetaStore((s) => s.toggleTabCheck)

  useEffect(() => {
    ensureTabChecks('indents-rm', RM_FLOW.length, RM_FLOW)
    ensureTabChecks('indents-pack', PKG_FLOW.length, PKG_FLOW)
  }, [selectedPO?.po, ensureTabChecks])

  const p = selectedPO
  if (!p) return null
  const riskTone = p.risk === 'High' ? 'red' : p.risk === 'Medium' ? 'yellow' : 'green'

  const renderList = (tabKey, items) => {
    const rows = tabChecksByPO[tabKey]?.[p.po] || items.map(() => ({ done: false, by: '', ts: '' }))
    return items.map((item, idx) => {
      const row = rows[idx] || { done: false, by: '', ts: '' }
      return (
        <label key={idx} className="flex items-start gap-2 mb-2.5 text-[13px] text-slate-700 cursor-pointer">
          <input type="checkbox" checked={!!row.done} onChange={(e) => toggleTabCheck(tabKey, idx, e.target.checked, items)} />
          <span>
            <span>{item}</span>
            {row.done && <div className="text-[11px] text-slate-500 mt-0.5">Checked by {row.by} · {row.ts}</div>}
          </span>
        </label>
      )
    })
  }

  return (
    <div className="px-7 py-6 max-w-full overflow-x-hidden flex-1 min-h-0 overflow-y-auto animate-[fadeUp_.35s_ease]">
      <div className="mb-6">
        <h2 className="text-[22px] font-bold">Raw Material &amp; Packaging Indents</h2>
        <p className="text-[12.5px] text-slate-500 mt-1">PO {p.po} · SKU {p.sku} · {p.vendor}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-[14px] p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-slate-100 rounded-xl p-3 flex items-center justify-center"><IconFactory className="w-[18px] h-[18px] text-slate-700" /></div>
            <h3 className="text-lg font-bold">RM Indent Flow</h3>
          </div>
          <div>{renderList('indents-rm', RM_FLOW)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-[14px] p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-slate-100 rounded-xl p-3 flex items-center justify-center"><IconPkgCheck className="w-[18px] h-[18px] text-slate-700" /></div>
            <h3 className="text-lg font-bold">Packaging Indent Flow</h3>
          </div>
          <div>{renderList('indents-pack', PKG_FLOW)}</div>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-[14px] p-5 shadow-sm mt-6">
        <h3 className="text-lg font-bold mb-4">Current RM &amp; Packaging Status — Selected PO</h3>
        <div className="border border-slate-200 rounded-xl overflow-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-slate-50">
              <tr>
                {['PO', 'Vendor', 'RM Status', 'Packaging Status', 'Drop Test', 'Risk'].map((h) => (
                  <th key={h} className="text-left px-3.5 py-2.5 font-semibold text-slate-400 text-[11px] uppercase tracking-[.4px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3.5 py-3 border-t border-slate-100 font-semibold">{p.po}</td>
                <td className="px-3.5 py-3 border-t border-slate-100">{p.vendor}</td>
                <td className="px-3.5 py-3 border-t border-slate-100"><Badge tone={p.risk === 'High' ? 'yellow' : 'blue'}>{p.risk === 'High' ? 'Pending review' : 'In progress'}</Badge></td>
                <td className="px-3.5 py-3 border-t border-slate-100"><Badge tone={p.stage.includes('Pack') ? 'green' : 'yellow'}>{p.stage.includes('Pack') ? 'Aligned' : 'Checklist in progress'}</Badge></td>
                <td className="px-3.5 py-3 border-t border-slate-100"><Badge tone={p.stage.includes('Final') ? 'blue' : 'slate'}>{p.stage.includes('Final') ? 'With final' : 'Planned'}</Badge></td>
                <td className="px-3.5 py-3 border-t border-slate-100"><Badge tone={riskTone}>{p.risk}</Badge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
