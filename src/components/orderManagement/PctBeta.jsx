import { useMemo, useState } from 'react'

const PO_ROWS = [
  { po: 'PO-DEMO-001', sku: 'SKU-DEMO-01', vendor: 'Demo Vendor', exf: '30 Jun 2026', stage: 'PO Receipt & Lock', risk: 'Low', claim: 'Demo PO workflow', owner: 'Merchant', styles: 1, delayDays: 0 },
  { po: 'P0009667N1', sku: 'NK-1842', vendor: 'Ramchander Exports', exf: '12 Jun 2026', stage: 'Bulk Production', risk: 'High', claim: 'Output lag', owner: 'Merchant', styles: 3, delayDays: 11 },
  { po: 'P0009691', sku: 'NK-0981', vendor: 'Art Asia', exf: '20 Jun 2026', stage: 'Packaging Indent', risk: 'Medium', claim: 'Barcode mismatch', owner: 'Merchant', styles: 2, delayDays: 5 },
  { po: 'P0009703N1', sku: 'NK-2210', vendor: 'PM Overseas', exf: '28 Jun 2026', stage: 'Final QC & Documentation', risk: 'Low', claim: 'Invoice check', owner: 'Merchant', styles: 4, delayDays: 0 },
]

const STAGES = [
  { id: 'po', title: 'PO Receipt & Lock', checks: ['Buyer PO uploaded', 'Tech pack attached', 'Price lock created'] },
  { id: 'tech', title: 'Tech Pack Validation', checks: ['Size tolerance', 'Weight tolerance', 'Material / finish'] },
  { id: 'rm', title: 'Raw Material Indent', checks: ['BOM freeze', 'RM quantity', 'Lead time'] },
  { id: 'pack', title: 'Packaging Indent', checks: ['Barcode approved', 'Shipping marks', 'Drop test protocol'] },
  { id: 'bulk', title: 'Bulk Production', checks: ['Line allocation', 'Daily output', 'WIP variance'] },
  { id: 'final', title: 'Final QC & Documentation', checks: ['Final inspection', 'Invoice check', 'Packing list'] },
  { id: 'ship', title: 'Stuffing, Dispatch & Ex-India', checks: ['Container booking', 'Stuffing confirmation', 'BL readiness'] },
]

const INTERNAL_TABS = [
  { key: 'dashboard', label: 'Control Tower' },
  { key: 'workflow', label: 'Stage Workflow' },
  { key: 'po360', label: 'PO 360' },
  { key: 'qc', label: 'QC & Compliance' },
]

function riskTone(risk) {
  if (risk === 'High') return 'bg-red-100 text-red-700'
  if (risk === 'Medium') return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}

function initialProgress(row) {
  const idx = STAGES.findIndex((s) => row.stage.toLowerCase().includes(s.title.split(' ')[0].toLowerCase()))
  return STAGES.reduce((acc, s, i) => {
    acc[s.id] = i < Math.max(idx, 0) ? 'completed' : i === Math.max(idx, 0) ? 'active' : 'pending'
    return acc
  }, {})
}

export default function PctBeta() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [selectedPO, setSelectedPO] = useState(PO_ROWS[0])
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState([
    { role: 'buyer', text: 'Please share latest status for SKU-DEMO-01.', ts: '08 Apr 2026, 09:40', po: 'PO-DEMO-001', sku: 'SKU-DEMO-01' },
    { role: 'merchant', text: 'Working on PO Receipt & Lock checks.', ts: '08 Apr 2026, 10:10', po: 'PO-DEMO-001', sku: 'SKU-DEMO-01' },
  ])
  const [stageProgressByKey, setStageProgressByKey] = useState(() =>
    PO_ROWS.reduce((acc, row) => {
      acc[`${row.po}::${row.sku}`] = initialProgress(row)
      return acc
    }, {}),
  )
  const [stageChecksByKey, setStageChecksByKey] = useState(() =>
    PO_ROWS.reduce((acc, row) => {
      const key = `${row.po}::${row.sku}`
      const p = initialProgress(row)
      acc[key] = STAGES.reduce((inner, s) => {
        const done = p[s.id] === 'completed'
        inner[s.id] = s.checks.map(() => done)
        return inner
      }, {})
      return acc
    }, {}),
  )

  const selectedKey = `${selectedPO.po}::${selectedPO.sku}`
  const stageProgress = stageProgressByKey[selectedKey]
  const stageChecks = stageChecksByKey[selectedKey]
  const poRows = useMemo(() => PO_ROWS.filter((r) => r.po === selectedPO.po), [selectedPO.po])

  const kpis = useMemo(
    () => ({
      openPos: PO_ROWS.length,
      otif: 87,
      delayed: PO_ROWS.filter((r) => r.risk !== 'Low').length,
      orderValue: '$194k',
    }),
    [],
  )

  const toggleStageCheck = (stageId, checkIdx, checked) => {
    setStageChecksByKey((prev) => ({
      ...prev,
      [selectedKey]: {
        ...prev[selectedKey],
        [stageId]: prev[selectedKey][stageId].map((v, i) => (i === checkIdx ? checked : v)),
      },
    }))
  }

  const canAdvance = (stageId) => (stageChecks[stageId] || []).every(Boolean)

  const advanceStage = (stageIdx) => {
    if (stageIdx >= STAGES.length - 1) return
    const current = STAGES[stageIdx]
    const next = STAGES[stageIdx + 1]
    if (!canAdvance(current.id)) return
    setStageProgressByKey((prev) => ({
      ...prev,
      [selectedKey]: { ...prev[selectedKey], [current.id]: 'completed', [next.id]: 'active' },
    }))
    setChatMessages((prev) => [
      ...prev,
      {
        role: 'merchant',
        text: `${current.title} completed. ${next.title} is now active.`,
        ts: new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        po: selectedPO.po,
        sku: selectedPO.sku,
      },
    ])
  }

  const sendMessage = () => {
    const val = chatInput.trim()
    if (!val) return
    setChatMessages((prev) => [...prev, { role: 'merchant', text: val, ts: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), po: selectedPO.po, sku: selectedPO.sku }])
    setChatInput('')
  }

  const filteredMessages = chatMessages.filter((m) => m.po === selectedPO.po && m.sku === selectedPO.sku)

  return (
    <div className="p-4 md:p-6 space-y-4 bg-slate-50 min-h-[calc(100vh-120px)]">
      <div className="rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 text-white flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold">Production Control Tower</div>
          <div className="text-xs text-slate-300">Nkuku — Home Category · Live</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {INTERNAL_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`text-xs px-3 py-1.5 rounded-lg border ${activeTab === t.key ? 'bg-white text-slate-900 border-white' : 'border-slate-600 text-slate-200 hover:bg-slate-800'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500 uppercase">Open POs</p><p className="text-2xl font-bold">{kpis.openPos}</p></div>
            <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500 uppercase">OTIF</p><p className="text-2xl font-bold text-emerald-600">{kpis.otif}%</p></div>
            <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500 uppercase">At Risk / Delayed</p><p className="text-2xl font-bold text-red-600">{kpis.delayed}</p></div>
            <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500 uppercase">Order Value</p><p className="text-2xl font-bold text-blue-600">{kpis.orderValue}</p></div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b text-sm font-semibold">PO Health Snapshot</div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">PO / SKU</th>
                    <th className="text-left px-3 py-2">Vendor</th>
                    <th className="text-left px-3 py-2">Stage</th>
                    <th className="text-left px-3 py-2">Ex-Factory</th>
                    <th className="text-left px-3 py-2">Risk</th>
                    <th className="text-left px-3 py-2">Delay</th>
                  </tr>
                </thead>
                <tbody>
                  {PO_ROWS.map((r) => (
                    <tr key={`${r.po}-${r.sku}`} className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => { setSelectedPO(r); setActiveTab('workflow') }}>
                      <td className="px-3 py-2 font-medium">{r.po} <span className="text-slate-500">· {r.sku}</span></td>
                      <td className="px-3 py-2">{r.vendor}</td>
                      <td className="px-3 py-2">{r.stage}</td>
                      <td className="px-3 py-2">{r.exf}</td>
                      <td className="px-3 py-2"><span className={`text-xs px-2 py-1 rounded-full ${riskTone(r.risk)}`}>{r.risk}</span></td>
                      <td className="px-3 py-2">{r.delayDays > 0 ? `+${r.delayDays}d` : 'On track'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'workflow' && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <h2 className="text-lg font-bold">Stage Workflow — {selectedPO.po} · {selectedPO.sku}</h2>
            <p className="text-sm text-slate-600">Each SKU line has independent workflow state, same as tracker rows.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {poRows.map((row) => (
                <button
                  key={row.sku}
                  type="button"
                  onClick={() => setSelectedPO(row)}
                  className={`text-xs px-3 py-1 rounded-full border ${selectedPO.sku === row.sku ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}
                >
                  {row.sku}
                </button>
              ))}
            </div>
          </div>
          {STAGES.map((stage, idx) => {
            const status = stageProgress[stage.id]
            const isCompleted = status === 'completed'
            const isActive = status === 'active'
            const allDone = canAdvance(stage.id)
            return (
              <div key={stage.id} className="rounded-xl border bg-white p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-semibold">{idx + 1}. {stage.title}</div>
                    <div className="text-xs text-slate-500">Status: <span className="font-semibold">{status}</span></div>
                  </div>
                  <button
                    type="button"
                    disabled={!isActive || !allDone || idx === STAGES.length - 1}
                    onClick={() => advanceStage(idx)}
                    className="text-xs px-3 py-1.5 rounded-lg border bg-slate-900 text-white disabled:bg-slate-200 disabled:text-slate-500 disabled:border-slate-200"
                  >
                    {isCompleted ? 'Completed' : idx === STAGES.length - 1 ? 'Final stage' : 'Proceed to next stage'}
                  </button>
                </div>
                <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {stage.checks.map((check, checkIdx) => (
                    <label key={check} className="text-sm border rounded-lg px-3 py-2 flex gap-2 items-start">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={stageChecks[stage.id][checkIdx]}
                        disabled={!isActive && !isCompleted}
                        onChange={(e) => toggleStageCheck(stage.id, checkIdx, e.target.checked)}
                      />
                      <span>{check}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'po360' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 rounded-xl border bg-white p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-lg font-bold">{selectedPO.po}</h3>
                <p className="text-sm text-slate-600">{selectedPO.vendor} · {selectedPO.stage}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${riskTone(selectedPO.risk)}`}>{selectedPO.risk}</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border p-3"><p className="text-xs text-slate-500 uppercase">SKU</p><p className="font-semibold">{selectedPO.sku}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-slate-500 uppercase">Ex-factory</p><p className="font-semibold">{selectedPO.exf}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-slate-500 uppercase">Claim trigger</p><p className="font-semibold">{selectedPO.claim}</p></div>
            </div>
          </div>
          <div className="rounded-xl border bg-white flex flex-col min-h-[520px]">
            <div className="px-3 py-2 border-b">
              <p className="font-semibold text-sm">Activity</p>
              <p className="text-xs text-slate-500">{selectedPO.po} · {selectedPO.sku}</p>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-2 bg-slate-50">
              {filteredMessages.map((m, i) => (
                <div key={`${m.ts}-${i}`} className={`rounded-lg border p-2 text-sm ${m.role === 'merchant' ? 'bg-white border-slate-200' : 'bg-violet-50 border-violet-200'}`}>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{m.role}</div>
                  <div>{m.text}</div>
                  <div className="text-[10px] text-slate-400 mt-1">{m.ts}</div>
                </div>
              ))}
            </div>
            <div className="p-2 border-t flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Message team..."
                className="flex-1 text-sm px-3 py-2 border rounded-lg"
              />
              <button type="button" onClick={sendMessage} className="text-sm px-3 py-2 rounded-lg bg-indigo-600 text-white">Send</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'qc' && (
        <div className="rounded-xl border bg-white p-4">
          <h3 className="text-lg font-bold">QC & Compliance</h3>
          <p className="text-sm text-slate-600 mt-1">Integrated with stage checks from workflow. Use Stage Workflow tab to execute and close QC gates.</p>
        </div>
      )}
    </div>
  )
}
