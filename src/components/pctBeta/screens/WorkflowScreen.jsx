import { useMemo, useRef } from 'react'
import { usePctBetaStore } from '../state/usePctBetaStore'
import {
  STAGE_CARDS,
  MANDATORY_TO_ALERT_DEPENDENCIES,
  STAGE_DUMMY_ATTACHMENTS,
} from '../constants'
import {
  getPOStageIndex,
  workflowLineKey,
  delayDaysNumber,
  skuDetailForRow,
} from '../utils'
import { IconCheck, IconWarn, IconLock, IconFile } from '../icons'

function RiskBadge({ risk }) {
  const tone = risk === 'High' ? 'bg-red-100 text-red-700' : risk === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
  return <span className={`inline-flex items-center px-[10px] py-[3px] rounded-full text-[11px] font-semibold whitespace-nowrap ${tone}`}>{risk}</span>
}

function StatusBadge({ status }) {
  const tone = status === 'completed'
    ? 'bg-emerald-100 text-emerald-700'
    : status === 'active'
      ? 'bg-blue-100 text-blue-700'
      : status === 'risk'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-600'
  return (
    <span className={`inline-flex items-center px-[10px] py-[3px] rounded-full text-[11px] font-semibold whitespace-nowrap ${tone}`}>
      {status === 'completed' && <IconLock className="w-3 h-3 mr-1.5" />}
      {status.toUpperCase()}
    </span>
  )
}

function SkuStageCard({ row }) {
  if (!row) return null
  const sd = skuDetailForRow(row)
  const sku = row.sku || '—'
  const vendor = row.vendor || ''
  const risk = row.risk || 'Low'
  const stage = row.stage || ''
  const imageUrl = sd.imageUrl || ''
  const riskCls = risk === 'High' ? 'bg-red-100 text-red-700' : risk === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
  const hasAttrs = sd.material || sd.dimensions || sd.finish || sd.weight || sd.title

  const Detail = ({ label, value }) => (
    <div className="grid [grid-template-columns:72px_1fr] gap-2.5 text-[10px] leading-[1.4]">
      <span className="text-[9px] font-medium uppercase tracking-[.06em] text-[#1a1a18]/60">{label}</span>
      <span className="text-[9px] font-bold uppercase tracking-[.03em] text-[#1a1a18] leading-[1.4] break-words">{value}</span>
    </div>
  )

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mt-3.5 max-w-[260px] cursor-default transition-shadow hover:shadow-[0_4px_16px_rgba(15,23,42,.08)]">
      <div className="bg-[#edeae4] relative overflow-hidden aspect-square w-full">
        {imageUrl
          ? <img src={imageUrl} alt={sd.title || sku} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
          : <div className="w-10 h-10 bg-[#1a1a18]/[.08] rounded-sm absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />}
      </div>
      <div className="px-3 pt-2.5 pb-3 flex flex-col gap-1.5 border-t border-[#1a1a18]">
        <div className="text-[13px] font-extrabold uppercase tracking-[.02em] text-[#1a1a18] font-mono">
          {sku}{sd.buyerRef ? ` · ${sd.buyerRef}` : ''}
        </div>
        <div className="flex gap-1 flex-wrap mb-0.5">
          {sd.category && <span className="text-[9px] font-bold py-0.5 px-1.5 uppercase tracking-[.06em] bg-black text-white">{sd.category}</span>}
          {vendor && <span className="text-[9px] font-bold py-0.5 px-1.5 uppercase tracking-[.06em] bg-black text-white">{vendor}</span>}
          <span className="text-[9px] font-bold py-0.5 px-1.5 uppercase tracking-[.06em] bg-blue-100 text-blue-700">{stage}</span>
          <span className={`text-[9px] font-bold py-0.5 px-1.5 uppercase tracking-[.06em] ${riskCls}`}>{risk}</span>
        </div>
        {hasAttrs ? (
          <div className="flex flex-col gap-[3px]">
            {sd.title && <Detail label="Description" value={sd.title} />}
            {sd.material && <Detail label="Material" value={sd.material} />}
            {sd.dimensions && <Detail label="Dimensions" value={sd.dimensions} />}
            {sd.finish && <Detail label="Finish" value={sd.finish} />}
            {sd.weight && <Detail label="Weight" value={sd.weight} />}
          </div>
        ) : (
          <div className="text-[10px] font-semibold uppercase tracking-[.05em] text-slate-400">Needs attributes</div>
        )}
        {sd.plmUrl && (
          <a href={sd.plmUrl} className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mt-1 inline-block">
            Open in PLM →
          </a>
        )}
      </div>
    </div>
  )
}

function getAlertDependencies(stageId, alertIdx) {
  const explicit = MANDATORY_TO_ALERT_DEPENDENCIES[stageId] && MANDATORY_TO_ALERT_DEPENDENCIES[stageId][alertIdx]
  if (explicit && explicit.length) return explicit
  const stage = STAGE_CARDS.find((s) => s.id === stageId)
  if (!stage || !stage.alerts[alertIdx]) return []
  const alertText = (stage.alerts[alertIdx] || '').toLowerCase()
  const checks = stage.checks || []
  const byKeyword = []
  checks.forEach((checkLabel, idx) => {
    const check = (checkLabel || '').toLowerCase()
    if (
      (alertText.includes('tech pack') && check.includes('tech pack')) ||
      (alertText.includes('spec') && (check.includes('spec') || check.includes('size') || check.includes('material') || check.includes('finish'))) ||
      (alertText.includes('weight') && (check.includes('weight') || check.includes('material'))) ||
      (alertText.includes('artwork') && (check.includes('artwork') || check.includes('color'))) ||
      (alertText.includes('currency') && (check.includes('price') || check.includes('value'))) ||
      (alertText.includes('price') && (check.includes('price') || check.includes('value') || check.includes('cost'))) ||
      (alertText.includes('cost') && (check.includes('price') || check.includes('cost'))) ||
      (alertText.includes('rm') && (check.includes('rm') || check.includes('bom') || check.includes('lead time') || check.includes('source'))) ||
      (alertText.includes('delay') && (check.includes('date') || check.includes('lead time') || check.includes('inline') || check.includes('final'))) ||
      (alertText.includes('barcode') && (check.includes('barcode') || check.includes('label'))) ||
      (alertText.includes('label') && check.includes('label')) ||
      (alertText.includes('carton') && check.includes('carton')) ||
      (alertText.includes('approval') && check.includes('approval')) ||
      (alertText.includes('inspection') && (check.includes('inspection') || check.includes('final'))) ||
      (alertText.includes('qty') && (check.includes('qty') || check.includes('quantity'))) ||
      (alertText.includes('shipment') && (check.includes('invoice') || check.includes('packing') || check.includes('etd'))) ||
      (alertText.includes('vessel') && check.includes('etd')) ||
      (alertText.includes('bl') && check.includes('bl'))
    ) byKeyword.push(idx)
  })
  return [...new Set(byKeyword)]
}

function finalInspectionOutcomeAlertIdx() {
  const fin = STAGE_CARDS.find((s) => s.id === 'final')
  if (!fin || !fin.alerts) return -1
  return fin.alerts.findIndex((a) => /inspection outcome/i.test(String(a)))
}

function getStageAttachments(stageId, ws, alertChecks) {
  const status = ws?.stageProgress?.[stageId]?.status || 'pending'
  const includeDummy = status === 'completed'
  const inlineUser = (stageId === 'inline' || stageId === 'midline') && ws?.inlineInspectionUploads ? [...ws.inlineInspectionUploads] : []
  const base = [...inlineUser]
  if (includeDummy && STAGE_DUMMY_ATTACHMENTS[stageId]) base.push(...STAGE_DUMMY_ATTACHMENTS[stageId])
  const alertRows = alertChecks?.[stageId] || []
  alertRows.forEach((rows) => {
    rows.forEach((c) => { if (c.fileName && c.fileUrl) base.push({ name: c.fileName, url: c.fileUrl }) })
  })
  return base
}

function TriggerDropdown({ stageId, alertText, alertIdx, unlocked, checks, depsMet, isOpen, onToggle, onCheckChange, onFileAttach }) {
  const isResolvedAll = depsMet && checks.length && checks.every((c) => c.done)
  const isResolvedAny = depsMet && checks.length && checks.some((c) => c.done)
  const finalOutcome = stageId === 'final' && alertIdx === finalInspectionOutcomeAlertIdx()
  const isDone = finalOutcome ? isResolvedAny : isResolvedAll
  const lastDone = isDone ? checks.filter((c) => c.done).slice(-1)[0] : null
  return (
    <li className="mb-2 border border-slate-200 rounded-lg bg-white overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <details open={isOpen} onToggle={(e) => onToggle(e.currentTarget.open)}>
        <summary className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer text-[13px] text-slate-700 font-medium ${isOpen ? 'border-b border-slate-200 bg-slate-50' : ''}`}>
          <span className="inline-flex w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: isDone ? '#10b981' : '#f59e0b' }}>
            {isDone ? <IconCheck className="w-4 h-4" /> : <IconWarn className="w-4 h-4" />}
          </span>
          <span>
            <span>{alertText}</span>
            {isDone && lastDone && (
              <div className="text-[11px] text-slate-500 mt-0.5">
                Checked by {lastDone.by || ''}{lastDone.ts ? ` · ${lastDone.ts}` : ''}
              </div>
            )}
          </span>
        </summary>
        <div className="px-3 py-2.5">
          {!depsMet && <div className="text-[11px] text-amber-700 mb-2">Complete linked mandatory checks first</div>}
          {checks.map((c, ci) => (
            <div key={ci}>
              <label className="flex items-center gap-2 mb-2 text-[12.5px] text-slate-700">
                <input
                  type="checkbox"
                  checked={!!c.done}
                  disabled={!unlocked}
                  onChange={(e) => onCheckChange(ci, e.target.checked)}
                />
                <span>
                  <span>{c.label}</span>
                  {c.done && (<div className="text-[11px] text-slate-500 mt-0.5">Checked by {c.by} · {c.ts}</div>)}
                </span>
              </label>
              {unlocked && (
                <div className="ml-6 mb-2.5 mt-0.5">
                  <input type="file" className="text-xs text-slate-600" onChange={(e) => e.target.files?.[0] && onFileAttach(ci, e.target.files[0])} />
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {c.fileName ? `Uploaded: ${c.fileName}` : 'Upload supporting file (optional)'}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </details>
    </li>
  )
}

export default function WorkflowScreen() {
  const selectedPO = usePctBetaStore((s) => s.selectedPO)
  const poRows = usePctBetaStore((s) => s.poRows)
  const allPoLines = usePctBetaStore((s) => s.allPoLines)
  const workflowStateByPoSku = usePctBetaStore((s) => s.workflowStateByPoSku)
  const setActiveTab = usePctBetaStore((s) => s.setActiveTab)
  const selectPOSku = usePctBetaStore((s) => s.selectPOSku)
  const toggleStageCheck = usePctBetaStore((s) => s.toggleStageCheck)
  const toggleTriggerCheck = usePctBetaStore((s) => s.toggleTriggerCheck)
  const attachTriggerFile = usePctBetaStore((s) => s.attachTriggerFile)
  const handleInlineInspectionUpload = usePctBetaStore((s) => s.handleInlineInspectionUpload)
  const advanceStage = usePctBetaStore((s) => s.advanceStage)
  const isTriggerOpen = usePctBetaStore((s) => s.isTriggerOpen)
  const setTriggerOpenState = usePctBetaStore((s) => s.setTriggerOpenState)

  const inlineFileInput = useRef(null)

  const p = selectedPO
  const poSkuRows = useMemo(() => {
    if (!p?.po) return []
    const source = allPoLines.length ? allPoLines : poRows
    return source.filter((r) => r.po === p.po)
  }, [p, poRows, allPoLines])
  const skuStageVariants = useMemo(() => (poSkuRows.length ? new Set(poSkuRows.map((r) => String(r.stage || ''))).size : 0), [poSkuRows])
  const skuStagesDiverse = poSkuRows.length > 1 && skuStageVariants > 1
  const trackerIdx = p && p.po ? getPOStageIndex(p) : 0
  const ws = workflowStateByPoSku[workflowLineKey(p)]
  const stageProgress = ws?.stageProgress || {}
  const stageChecks = ws?.stageChecks || {}
  const stageAlertChecks = ws?.stageAlertChecks || {}

  const dn = p?.delayDays != null && !Number.isNaN(Number(p.delayDays)) ? Number(p.delayDays) : null
  const showDelayNote = !!p && p.po && ((dn !== null && dn > 0) || p.risk === 'High' || p.risk === 'Medium')
  const dd = delayDaysNumber(p)
  const ddLabel = dd != null ? `${Math.round(dd)}d vs EWD` : '—'
  const gateTitle = STAGE_CARDS[trackerIdx]?.title || '—'

  const isStageUnlocked = (index) => {
    if (index === 0) return true
    const prev = stageProgress[STAGE_CARDS[index - 1].id]
    return prev && prev.status === 'completed'
  }

  return (
    <div className="px-7 py-6 max-w-full overflow-x-hidden flex-1 min-h-0 overflow-y-auto animate-[fadeUp_.35s_ease]">
      <div className="mb-6 flex justify-between items-start gap-3 flex-wrap">
        <div>
          <h2 className="text-[22px] font-bold text-slate-900">Stage Workflow — {p && p.po ? `${p.po} · ${p.sku}` : 'Select a PO'}</h2>
          <p className="text-[12.5px] text-slate-500 mt-1"><strong>Use SKU</strong> for execution: each style line has its own stage gates (matches Excel — one row per SKU). <strong>PO</strong> is only the container — same buyer/vendor/terms across lines.</p>
          {showDelayNote && (
            <p className="text-xs text-slate-600 mt-2 max-w-[720px] leading-snug">Excel milestones can show through carting while <strong>delay vs EWD</strong> still applies — at-risk SKUs do not auto-complete every stage; close dispatch checks while recovery is tracked.</p>
          )}
          {p && p.po && (
            <div className="mt-3 px-3.5 py-3 bg-slate-50 rounded-xl border border-slate-200 max-w-[860px]">
              <div className="text-[11px] font-bold uppercase tracking-[.04em] text-slate-500 mb-1.5">Selected SKU row (Excel tracker)</div>
              <div className="text-[13px] text-slate-800 leading-snug"><strong>Stage:</strong> {p.stage} · <strong>Delay:</strong> {ddLabel} · <strong>Risk:</strong> <RiskBadge risk={p.risk} /></div>
              <div className="text-xs text-slate-600 mt-2">Workflow ladder: gate {trackerIdx + 1} of {STAGE_CARDS.length} — <strong>{gateTitle}</strong></div>
              {skuStagesDiverse && (
                <div className="text-xs text-slate-600 mt-2.5 leading-snug">Different SKUs on this PO show different Excel stages ({skuStageVariants} values in the sheet). Each chip loads that SKU row only — workflow checkpoints are stored separately per PO + SKU.</div>
              )}
              {!skuStagesDiverse && poSkuRows.length > 1 && (
                <div className="text-xs text-slate-600 mt-2.5 leading-snug">All {poSkuRows.length} SKU rows share the same Excel stage in this export, so the ladder looks identical until milestone dates diverge per line in the tracker.</div>
              )}
            </div>
          )}
          {poSkuRows.length > 0 && (
            <div className="mt-2.5">
              <span className="text-[11px] text-slate-500 uppercase tracking-[.35px] block mb-1.5">SKU on this PO (each chip = separate workflow state)</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {poSkuRows.map((row) => (
                  <button
                    key={`${row.po}-${row.sku}`}
                    type="button"
                    title={row.stage}
                    onClick={() => selectPOSku(row.po, row.sku)}
                    className={`border rounded-full px-2.5 py-[5px] text-xs font-semibold ${row.sku === p.sku ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {row.sku}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button type="button" className="inline-flex items-center gap-2 bg-slate-900 hover:bg-[#020617] text-white border border-slate-900 rounded-lg px-4 py-2.5 text-[13px] font-bold shadow-sm" onClick={() => setActiveTab('po360')}>
          Open PO 360 <span aria-hidden>→</span>
        </button>
      </div>

      {STAGE_CARDS.map((s, i) => {
        const current = stageProgress[s.id] || { status: s.status, timestamp: 'Not moved yet' }
        const unlocked = isStageUnlocked(i)
        const isCompleted = current.status === 'completed'
        const isLast = i === STAGE_CARDS.length - 1
        const stageIsLocked = !unlocked || isCompleted
        const visualStatus = unlocked ? current.status : 'locked'
        const checks = stageChecks[s.id] || s.checks.map(() => ({ done: false, by: '', ts: '' }))
        const alertChecks = stageAlertChecks[s.id] || []

        const allMandatoryDone = checks.length > 0 && checks.every((c) => c.done)
        const allAlertsDone = alertChecks.every((rows, alertIdx) => {
          if (!rows.length) return true
          const requiredIdx = getAlertDependencies(s.id, alertIdx)
          const depsMet = requiredIdx.length === 0 || requiredIdx.every((idx) => checks[idx] && checks[idx].done)
          if (!depsMet) return true
          const mode = s.id === 'final' && alertIdx === finalInspectionOutcomeAlertIdx() ? 'any' : 'all'
          return mode === 'any' ? rows.some((c) => c.done) : rows.every((c) => c.done)
        })
        const stageCanProceed = allMandatoryDone && allAlertsDone

        let hardStopTotal = 0, hardStopDone = 0
        alertChecks.forEach((rows, alertIdx) => {
          if (!rows.length) return
          const requiredIdx = getAlertDependencies(s.id, alertIdx)
          const depsMet = requiredIdx.length === 0 || requiredIdx.every((idx) => checks[idx] && checks[idx].done)
          if (!depsMet) return
          const mode = s.id === 'final' && alertIdx === finalInspectionOutcomeAlertIdx() ? 'any' : 'all'
          hardStopTotal += mode === 'any' ? 1 : rows.length
          hardStopDone += mode === 'any' ? (rows.some((c) => c.done) ? 1 : 0) : rows.filter((c) => c.done).length
        })
        const mandatoryDone = checks.filter((c) => c.done).length
        const stageFiles = getStageAttachments(s.id, ws, stageAlertChecks)
        const showSku = s.id === 'po'

        return (
          <div key={s.id} className="bg-white border border-slate-200 rounded-[14px] p-5 shadow-sm mb-3.5 animate-[fadeUp_.3s_ease]" style={{ animationDelay: `${i * 30}ms` }}>
            <div className="grid gap-4 [grid-template-columns:1fr] lg:[grid-template-columns:4fr_4fr_4fr]">
              <div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-700 flex-shrink-0">{i + 1}</div>
                  <div>
                    <div className="text-base font-bold">{s.title}</div>
                    <div className="text-[12.5px] text-slate-500 mt-0.5">
                      Owner: {s.owner} · SLA Days: <input type="text" className="w-24 h-6 border border-slate-300 rounded-md bg-white text-slate-700 px-2 text-xs align-middle placeholder:text-slate-400" placeholder="SLA input" aria-label="SLA days input" />
                    </div>
                  </div>
                </div>
                <div className="mt-3"><StatusBadge status={visualStatus} /></div>
                {showSku && <SkuStageCard row={p} />}
              </div>

              <div>
                <div className="text-[12.5px] font-bold text-slate-900 mb-2.5">Mandatory checks</div>
                <ul className="list-none text-[13px] text-slate-600 space-y-2">
                  {s.checks.map((c, ci) => {
                    const check = checks[ci] || { done: false, by: '', ts: '' }
                    return (
                      <li key={ci} className="flex gap-2 items-start" onClick={(e) => e.stopPropagation()}>
                        <label className="flex items-start gap-2 cursor-pointer w-full">
                          <input type="checkbox" checked={!!check.done} disabled={stageIsLocked} onChange={(e) => toggleStageCheck(s.id, ci, e.target.checked)} />
                          <span>
                            <span>{c}</span>
                            {check.done && <div className="text-[11px] text-slate-500 mt-0.5">Checked by {check.by} · {check.ts}</div>}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>

              <div>
                <div className="text-[12.5px] font-bold text-slate-900 mb-2.5">Auto triggers / hard stops</div>
                <ul className="list-none m-0 p-0">
                  {s.alerts.map((alertText, alertIdx) => {
                    const rows = alertChecks[alertIdx] || []
                    const requiredIdx = getAlertDependencies(s.id, alertIdx)
                    const depsMet = requiredIdx.length === 0 || requiredIdx.every((idx) => checks[idx] && checks[idx].done)
                    return (
                      <TriggerDropdown
                        key={alertIdx}
                        stageId={s.id}
                        alertText={alertText}
                        alertIdx={alertIdx}
                        unlocked={!stageIsLocked}
                        checks={rows}
                        depsMet={depsMet}
                        isOpen={isTriggerOpen(s.id, alertIdx)}
                        onToggle={(open) => setTriggerOpenState(s.id, alertIdx, open)}
                        onCheckChange={(ci, checked) => toggleTriggerCheck(s.id, alertIdx, ci, checked)}
                        onFileAttach={(ci, file) => attachTriggerFile(s.id, alertIdx, ci, file)}
                      />
                    )
                  })}
                </ul>
              </div>
            </div>

            {(s.id === 'inline' || s.id === 'midline') && (
              <div className="flex justify-center px-3 pt-[18px] pb-1.5 mt-1 border-t border-slate-100">
                <input
                  ref={inlineFileInput}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,application/pdf"
                  className="absolute w-0 h-0 opacity-0 pointer-events-none"
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handleInlineInspectionUpload(e.target.files[0])
                      e.target.value = ''
                    }
                  }}
                />
                <button
                  type="button"
                  className="appearance-none border border-slate-200 bg-white rounded-2xl px-9 py-3.5 text-sm font-bold text-slate-800 shadow-[0_4px_14px_rgba(15,23,42,.08)] hover:bg-slate-50 hover:shadow-[0_6px_18px_rgba(15,23,42,.1)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                  onClick={(e) => { e.stopPropagation(); inlineFileInput.current?.click() }}
                >
                  Upload Inspection Report
                </button>
              </div>
            )}

            <div className="mt-3.5 pt-3.5 border-t border-slate-200 flex items-center justify-between gap-2.5 flex-wrap">
              <div className="w-full text-xs text-slate-600">
                <div className="font-bold text-slate-700 mb-1.5">Attachments</div>
                <div className="flex flex-wrap gap-2">
                  {stageFiles.length > 0
                    ? stageFiles.map((f, fi) => (
                      <a key={fi} href={f.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 border border-slate-200 rounded-full px-2.5 py-1 bg-white text-slate-700 hover:bg-slate-50 max-w-[220px] min-w-0 no-underline">
                        <IconFile className="w-3.5 h-3.5 flex-shrink-0 block" />
                        <span className="overflow-hidden text-ellipsis whitespace-nowrap block">{f.name}</span>
                      </a>
                    ))
                    : <span className="text-xs text-slate-500">No attachments yet</span>}
                </div>
              </div>
              <div className="text-xs text-slate-500">
                Last update: {current.timestamp}{!isCompleted && unlocked && !stageCanProceed ? ' · Complete mandatory + hard stops to proceed' : ''}<br />
                Mandatory {mandatoryDone}/{checks.length} · Hard Stops {hardStopDone}/{hardStopTotal}
              </div>
              <button
                className={`border border-slate-200 bg-white rounded-lg px-3 py-2 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-55 disabled:cursor-not-allowed ${isCompleted ? '!bg-emerald-100 !border-emerald-100 !text-emerald-700 !opacity-100' : ''}`}
                disabled={!unlocked || isCompleted || !stageCanProceed}
                onClick={(e) => { e.stopPropagation(); advanceStage(s.id) }}
              >
                {!unlocked ? 'Locked by Previous Stage' : isCompleted ? 'Completed' : !stageCanProceed ? 'Complete Checks First' : isLast ? 'Complete final stage' : 'Proceed to Next Stage'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
