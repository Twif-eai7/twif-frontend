import { useEffect } from 'react'
import { usePctBetaStore } from '../state/usePctBetaStore'
import { EXCEPTION_CARDS, ESCALATION_MATRIX_TIERS } from '../constants'
import { Icon } from '../icons'

export default function ExceptionScreen() {
  const selectedPO = usePctBetaStore((s) => s.selectedPO)
  const exceptionChecksByPO = usePctBetaStore((s) => s.exceptionChecksByPO)
  const toggleExceptionCheck = usePctBetaStore((s) => s.toggleExceptionCheck)
  const setActiveTab = usePctBetaStore((s) => s.setActiveTab)
  const loadExceptionsForSelected = usePctBetaStore((s) => s.loadExceptionsForSelected)

  const p = selectedPO
  const po = p?.po || ''

  useEffect(() => {
    loadExceptionsForSelected()
  }, [po, loadExceptionsForSelected])

  const poState = exceptionChecksByPO[po] || EXCEPTION_CARDS.map((c) => c.points.map(() => ({ done: false, by: '', ts: '' })))

  return (
    <div className="px-7 py-6 max-w-full overflow-x-hidden flex-1 min-h-0 overflow-y-auto animate-[fadeUp_.35s_ease]">
      <div className="mb-6">
        <h2 className="text-[22px] font-bold">Exception Engine</h2>
        <p className="text-[12.5px] text-slate-500 mt-1">Built to prevent claims by forcing checks at source, not after shipment.</p>
        <p className="text-xs text-slate-500 mt-1.5">These checks apply to the <strong>whole PO</strong> (not duplicated per SKU in this demo).</p>
      </div>
      <div className="flex justify-between items-center gap-2.5 flex-wrap mb-3.5">
        <div className="text-[12.5px] text-slate-500">Selected PO: <strong className="text-slate-700">{po || '—'}</strong></div>
        <button className="border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-lg px-4 py-2 text-[12.5px] font-semibold" onClick={() => setActiveTab('dashboard')}>Select PO from Control Tower</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {EXCEPTION_CARDS.map((c, cardIdx) => (
          <div key={c.title} className="bg-white border border-slate-200 rounded-[14px] p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-slate-100 rounded-xl p-3 flex items-center justify-center text-slate-700"><Icon name={c.icon} className="w-[18px] h-[18px]" /></div>
              <h3 className="text-lg font-bold">{c.title}</h3>
            </div>
            <div>
              {c.points.map((pt, pi) => {
                const item = poState[cardIdx]?.[pi] || { done: false, by: '', ts: '' }
                return (
                  <label key={pi} className="flex items-start gap-2 mb-2.5 text-[13px] text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={!!item.done} onChange={(e) => toggleExceptionCheck(cardIdx, pi, e.target.checked)} />
                    <span>
                      <span>{pt}</span>
                      {item.done && <div className="text-[11px] text-slate-500 mt-0.5">Checked by {item.by} · {item.ts}</div>}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white border border-slate-200 rounded-[14px] p-5 shadow-sm mt-6">
        <h3 className="text-lg font-bold mb-4">Escalation Matrix</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ESCALATION_MATRIX_TIERS.map((t) => (
            <div key={t.matrixTrigger} className="bg-slate-50 rounded-xl p-4">
              <h4 className="font-bold text-sm mb-1.5">{t.matrixTrigger}</h4>
              <p className="text-[12.5px] text-slate-600">{t.actionLabel}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
