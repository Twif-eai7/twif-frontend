import { useEffect, useMemo, useRef, useState } from 'react'
import { usePctBetaStore } from '../state/usePctBetaStore'
import { STAGE_CARDS } from '../constants'
import { skuDetailForRow, formatChatTimestamp, workflowLineKey } from '../utils'
import { IconCheck, IconWarn, IconSearch, IconMedia, IconClipList, IconFile } from '../icons'

function RiskBadge({ risk }) {
  const tone = risk === 'High' ? 'bg-red-100 text-red-700' : risk === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
  return <span className={`inline-flex items-center px-[10px] py-[3px] rounded-full text-[11px] font-semibold whitespace-nowrap ${tone}`}>{risk}</span>
}

function Pill({ children }) {
  return <span className="bg-[#eef2ff] border border-slate-200 text-slate-700 rounded-full px-2.5 py-[5px] text-xs font-semibold">{children}</span>
}

function personInitials(name) {
  if (!name || typeof name !== 'string') return '?'
  const t = name.trim()
  const lower = t.toLowerCase()
  if (lower === 'merchant' || lower === 'buyer') return t.slice(0, 1).toUpperCase()
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  return t.slice(0, 2).toUpperCase()
}

/** Matches older chat entries before `systemKind: 'stage_complete'` existed */
function parseLegacyStageCompleteMessage(text) {
  if (typeof text !== 'string') return null
  const m = text.match(/^"([^"]+)"\s+stage completed(?:\s*—\s*by\s+(.+))?$/i)
  if (!m) return null
  return { stageTitle: m[1], actorName: (m[2] || '').trim() || null }
}

function StageCompletionActivityCard({ stageTitle, nextStageTitle, actorName, actorRole, ts }) {
  const role = actorRole === 'buyer' ? 'buyer' : 'merchant'
  const ringCls = role === 'merchant' ? 'ring-orange-200' : 'ring-violet-200'
  const nameCls = role === 'merchant' ? 'text-orange-700' : 'text-violet-700'
  return (
    <div className="my-2 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-white shadow-sm overflow-hidden">
      <div className="flex gap-3 p-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-[0_2px_8px_rgba(5,150,105,.35)]" aria-hidden>
          <IconCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">Stage completed</div>
          <div className="mt-1 text-[13px] font-bold leading-snug text-slate-900">{stageTitle}</div>
          {nextStageTitle ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-600">
              <span className="font-semibold text-slate-500">Next</span>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-800">{nextStageTitle}</span>
            </div>
          ) : null}
          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-emerald-100 pt-2.5">
            {actorName ? (
              <>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-700 ring-2 ${ringCls}`} title={actorName}>
                  {personInitials(actorName)}
                </span>
                <span className={`text-[11px] font-semibold ${nameCls}`}>{actorName}</span>
                <span className="text-slate-300">·</span>
              </>
            ) : null}
            <time className="text-[11px] font-medium text-slate-500">{formatChatTimestamp(ts)}</time>
          </div>
        </div>
      </div>
    </div>
  )
}

function StageGateRow({ item, done }) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5 border border-slate-200 rounded-lg mb-1.5">
      <div className="flex items-center gap-2.5 text-[13px]">
        <span className="inline-flex w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: done ? '#10b981' : '#f59e0b' }}>
          {done ? <IconCheck className="w-4 h-4" /> : <IconWarn className="w-4 h-4" />}
        </span>
        <span>{item}</span>
      </div>
      <span className={`inline-flex items-center px-[10px] py-[3px] rounded-full text-[11px] font-semibold ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{done ? 'Done' : 'Pending'}</span>
    </div>
  )
}

function ChatThread({ rows }) {
  if (!rows.length) {
    return <div className="my-2 text-[10px] text-slate-900 text-center px-2 py-1.5 border-t border-b border-slate-200 font-bold tracking-[.2px]">No chat yet</div>
  }
  return (
    <>
      {rows.map((m, i) => {
        if (m.role === 'system') {
          if (m.systemKind === 'stage_complete' && m.stageTitle) {
            return (
              <StageCompletionActivityCard
                key={i}
                stageTitle={m.stageTitle}
                nextStageTitle={m.nextStageTitle}
                actorName={m.actorName}
                actorRole={m.actorRole}
                ts={m.ts}
              />
            )
          }
          const legacyStage = !m.systemKind && parseLegacyStageCompleteMessage(m.text || '')
          if (legacyStage) {
            return (
              <StageCompletionActivityCard
                key={i}
                stageTitle={legacyStage.stageTitle}
                nextStageTitle={null}
                actorName={legacyStage.actorName || m.actorName}
                actorRole={m.actorRole}
                ts={m.ts}
              />
            )
          }
          const actorRole = m.actorRole === 'buyer' ? 'buyer' : 'merchant'
          const colorCls = actorRole === 'merchant' ? 'text-orange-600' : 'text-violet-600'
          const body = m.text ?? ''
          const dupActor = m.actorName && typeof body === 'string' && body.includes(m.actorName)
          return (
            <div key={i} className="my-1.5 rounded-lg border border-slate-200/80 bg-slate-50/90 px-2.5 py-2 text-left">
              {body ? <div className="text-[11px] font-medium leading-snug text-slate-800">{body}</div> : null}
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px] text-slate-500">
                {!dupActor && m.actorName ? (
                  <>
                    <span className="font-semibold text-slate-600">By</span>
                    <span className={`font-bold ${colorCls}`}>{m.actorName}</span>
                    <span aria-hidden>·</span>
                  </>
                ) : null}
                <time>{formatChatTimestamp(m.ts)}</time>
              </div>
            </div>
          )
        }
        const isMerchant = m.role === 'merchant'
        const borderCls = isMerchant ? 'border-l-orange-500' : 'border-l-violet-600'
        const pillCls = isMerchant ? 'bg-orange-500' : 'bg-violet-600'
        const timeCls = isMerchant ? 'text-orange-500' : 'text-violet-600'
        return (
          <div key={i} className={`bg-white border border-slate-200 border-l-[3px] ${borderCls} rounded-[10px] px-2.5 py-2 mb-1.5 shadow-sm`}>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className={`text-[9px] font-semibold uppercase tracking-[.04em] ${pillCls} text-white rounded-full px-2 py-0.5`}>{isMerchant ? 'MERCHANT' : 'BUYER'}</span>
              <span className={`text-[10px] font-medium ${timeCls}`}>{formatChatTimestamp(m.ts)}</span>
            </div>
            <div className="text-[11.5px] text-slate-900 leading-snug font-normal break-words">{m.text}</div>
            {m.attachment && (
              <div className="mt-2.5">
                {m.attachment.type === 'image'
                  ? <img src={m.attachment.url} alt={m.attachment.name} className="max-w-[160px] rounded-[10px] border border-slate-200" />
                  : <span className="inline-flex items-center gap-1.5 border border-slate-200 rounded-[10px] px-2 py-1 text-[11px] text-slate-700 bg-slate-50">
                      <IconFile className="w-4 h-4" /> {m.attachment.name}
                    </span>}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

export default function Po360Screen() {
  const selectedPO = usePctBetaStore((s) => s.selectedPO)
  const poRows = usePctBetaStore((s) => s.poRows)
  const workflowStateByPoSku = usePctBetaStore((s) => s.workflowStateByPoSku)
  const loadActivityForSelected = usePctBetaStore((s) => s.loadActivityForSelected)
  const aiChatMessages = usePctBetaStore((s) => s.aiChatMessages)
  const selectPO = usePctBetaStore((s) => s.selectPO)
  const selectPOSku = usePctBetaStore((s) => s.selectPOSku)
  const sendActivityMessage = usePctBetaStore((s) => s.sendActivityMessage)
  const sendChecklistMessage = usePctBetaStore((s) => s.sendChecklistMessage)
  const togglePO360MediaDrawer = usePctBetaStore((s) => s.togglePO360MediaDrawer)
  const po360MediaDrawerOpen = usePctBetaStore((s) => s.po360MediaDrawerOpen)
  const pendingAttachment = usePctBetaStore((s) => s.pendingAttachment)
  const attachMenuOpen = usePctBetaStore((s) => s.attachMenuOpen)
  const setAttachMenuOpen = usePctBetaStore((s) => s.setAttachMenuOpen)
  const setPendingAttachment = usePctBetaStore((s) => s.setPendingAttachment)

  const [search, setSearch] = useState(selectedPO?.po || '')
  const [chatInput, setChatInput] = useState('')
  const [checklistInput, setChecklistInput] = useState('')
  const chatScrollRef = useRef(null)

  useEffect(() => { setSearch(selectedPO?.po || '') }, [selectedPO?.po])
  useEffect(() => { loadActivityForSelected() }, [selectedPO?.pctLineId, loadActivityForSelected])

  const p = selectedPO
  const ws = workflowStateByPoSku[workflowLineKey(p)]
  const sd = useMemo(() => skuDetailForRow(p), [p])
  const poSkuRows = useMemo(() => poRows.filter((r) => r.po === p?.po), [poRows, p?.po])
  const filteredChat = useMemo(() => aiChatMessages.filter((m) => m.po === p?.po && m.sku === p?.sku), [aiChatMessages, p?.po, p?.sku])

  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [filteredChat.length, p?.po, p?.sku])

  const stageChecks = ws?.stageChecks || {}
  const isMandatoryDone = (id, idx) => !!(stageChecks[id]?.[idx]?.done)
  const isStageAllDone = (id) => {
    const def = STAGE_CARDS.find((s) => s.id === id)
    const row = stageChecks[id]
    if (!def || !row || row.length !== def.checks.length) return false
    return row.every((c) => c && c.done)
  }
  const checklist = [
    ['Tech pack uploaded', isMandatoryDone('po', 1)],
    ['Weight tolerance confirmed', isMandatoryDone('tech', 1)],
    ['Size tolerance signed off', isMandatoryDone('tech', 0)],
    ['Approved artwork attached', isMandatoryDone('tech', 3)],
    ['Price lock confirmed', isMandatoryDone('po', 2)],
    ['Drop test approved', isMandatoryDone('pack', 2)],
    ['Packing PPT submitted', isStageAllDone('pp')],
    ['Testing closed', isStageAllDone('final')],
  ]

  const refSkuSafe = String(p?.sku || 'SKU').replace(/[^\w.-]/g, '').slice(0, 28) || 'SKU'
  const refThumbPrimary = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect fill="#e8eef5" width="100%" height="100%"/><ellipse cx="160" cy="140" rx="72" ry="44" fill="#94a3b8" opacity=".4"/><rect x="120" y="168" width="80" height="28" rx="6" fill="#64748b" opacity=".45"/><text x="160" y="268" fill="#475569" font-family="system-ui,sans-serif" font-size="11" text-anchor="middle">Primary reference ${refSkuSafe}</text></svg>`)}`
  const refFileLabel = `1777263513249_${refSkuSafe.replace(/\./g, '').slice(0, 12)}_FIRE`

  const onSendChat = () => { sendActivityMessage(chatInput); setChatInput('') }
  const onSendChecklist = () => { sendChecklistMessage(checklistInput); setChecklistInput('') }
  const onAttachImage = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setPendingAttachment({ type: 'image', name: f.name, url: URL.createObjectURL(f) })
    setAttachMenuOpen(false)
    e.target.value = ''
  }
  const onAttachFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setPendingAttachment({ type: 'file', name: f.name, url: URL.createObjectURL(f) })
    setAttachMenuOpen(false)
    e.target.value = ''
  }

  if (!p) return null

  return (
    <div className="px-7 py-6 max-w-full overflow-x-hidden flex-1 min-h-0 flex flex-col overflow-hidden animate-[fadeUp_.35s_ease]">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3 flex-shrink-0">
        <div>
          <h2 className="text-[22px] font-bold text-slate-900">PO 360 View</h2>
          <p className="text-[12.5px] text-slate-500 mt-1">Same PO — switch <strong>SKU</strong> to see line-specific detail (stage, checklist, chat).</p>
        </div>
        <div className="relative">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && selectPO(search)}
            onBlur={() => search && selectPO(search)}
            placeholder="Search PO..."
            className="w-80 pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-[13px] outline-none bg-white focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,.12)]"
          />
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 xl:[grid-template-columns:minmax(0,2fr)_minmax(340px,1fr)] flex-1 min-h-0 overflow-hidden">
        <div className="bg-white border border-slate-200 rounded-[14px] p-5 shadow-sm min-h-0 overflow-x-hidden overflow-y-auto">
          <div className="flex justify-between items-center mb-5">
            <div>
              <div className="text-[17px] font-bold">{p.po}</div>
              <div className="text-[11px] text-slate-500 mt-1.5 uppercase tracking-[.4px]">SKUs under this PO</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {poSkuRows.map((row) => (
                  <button key={`${row.po}-${row.sku}`} type="button" title={row.stage}
                    onClick={() => selectPOSku(row.po, row.sku)}
                    className={`border rounded-full px-2.5 py-[5px] text-xs font-semibold ${row.sku === p.sku ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                    {row.sku}
                  </button>
                ))}
              </div>
              <div className="text-[12.5px] text-slate-500 mt-1.5">{p.vendor} · {p.stage}</div>
            </div>
            <RiskBadge risk={p.risk} />
          </div>

          <div className="grid w-full gap-2.5 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {[['Vendor', p.vendor], ['Ex-Factory', p.exf], ['Owner', p.owner], ['Current Stage', p.stage], ['Styles', p.styles], ['Claim Trigger', p.claim]].map(([a, b]) => (
              <div key={a} className="bg-white border-2 border-slate-300 rounded-lg px-2 py-[7px] transition-all hover:border-slate-400 hover:bg-slate-50 hover:shadow-md hover:-translate-y-px">
                <div className="text-[9px] font-medium uppercase tracking-[.28px] leading-[1.15] text-slate-500">{a}</div>
                <div className="text-[11px] font-normal mt-[3px] leading-snug text-slate-800 break-words">{String(b ?? '—')}</div>
              </div>
            ))}
          </div>

          <details className="mt-3.5 border border-slate-200 rounded-xl bg-white">
            <summary className="list-none cursor-pointer px-3 py-2.5 select-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <span className="text-[13px] font-bold text-slate-900 block">SKU detail · {p.sku}</span>
                  <span className="block text-[11.5px] text-slate-500 mt-1 leading-snug">{sd.title}</span>
                </div>
                <span aria-hidden className="w-2.5 h-2.5 border-r-2 border-b-2 border-slate-400 rotate-45 transition-transform mt-1 flex-shrink-0" />
              </div>
            </summary>
            <div className="px-3 pb-3 border-t border-slate-100">
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
                {[
                  ['Category', sd.category], ['Material', sd.material], ['Finish', sd.finish],
                  ['Dimensions', sd.dimensions], ['Weight', sd.weight], ['Colour', sd.colour],
                  ['Order qty (pcs)', sd.orderQty != null ? String(sd.orderQty) : '—'], ['Buyer ref', sd.buyerRef || '—'],
                ].map(([a, b]) => (
                  <div key={a} className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 min-w-0">
                    <div className="text-[10px] uppercase tracking-[.45px] text-slate-500 mb-1">{a}</div>
                    <div className="text-[13px] font-semibold text-slate-800 leading-snug break-words">{b}</div>
                  </div>
                ))}
                <div className="col-span-full bg-white border border-dashed border-slate-200 rounded-xl px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[.45px] text-slate-500 mb-1">Notes</div>
                  <div className="text-[13px] font-medium text-slate-600 leading-snug mt-1.5">{sd.notes}</div>
                </div>
              </div>
            </div>
          </details>

          <div className="mt-6">
            <h4 className="text-sm font-bold mb-3">Stage-gate Checklist</h4>
            {checklist.map(([item, done]) => (<StageGateRow key={item} item={item} done={done} />))}
          </div>
        </div>

        <div className="flex flex-col min-w-0 min-h-0 self-stretch">
          <div className="border border-slate-200 rounded-[14px] bg-white text-slate-900 overflow-hidden flex flex-col min-w-0 flex-1 min-h-0">
            <div className="px-3 py-2.5 border-b border-slate-200 bg-white flex-shrink-0">
              <div className="text-center text-[13px] font-bold text-slate-900 mb-1">Activity</div>
              <div className="flex items-start justify-between gap-2.5 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-[clamp(15px,3.5vw,20px)] font-semibold leading-tight break-words text-slate-900">{p.po}</div>
                  <div className="mt-0.5 text-[11px] text-slate-600 leading-snug">{p.vendor} · Lead time: 90 days</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button type="button" onClick={togglePO360MediaDrawer} aria-expanded={po360MediaDrawerOpen}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-indigo-500 hover:bg-slate-50 hover:border-indigo-200 shadow-sm">
                    <IconMedia className="w-4 h-4" /> Media
                  </button>
                  <button type="button" className="w-7 h-7 rounded-full border border-slate-200 text-slate-500 bg-white">×</button>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Pill>EWD <strong>{p.exf}</strong></Pill>
                <Pill>Risk {p.risk}</Pill>
                <Pill>PO {p.po}</Pill>
              </div>
            </div>

            <div className="flex gap-2 border-b border-slate-200 px-2 bg-white flex-shrink-0">
              <button className="px-2 py-2 text-xs text-indigo-300 border-b-2 border-indigo-500 font-semibold">Activity</button>
            </div>

            <div ref={chatScrollRef} className="bg-slate-50 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              <div className="flex min-h-full flex-col justify-end gap-0 p-1.5 px-2">
                <ChatThread rows={filteredChat} />
              </div>
            </div>

            <div className="border-t border-slate-200 bg-slate-50 px-2.5 py-2 flex-shrink-0">
              <h4 className="text-[10px] tracking-[.08em] text-slate-600 mb-1">ACTION CHECKLIST</h4>
              <div className="text-xs text-slate-500 mb-2">No action items yet. Add one below.</div>
              <div className="flex gap-2">
                <input value={checklistInput} onChange={(e) => setChecklistInput(e.target.value)} placeholder="Add action item..."
                  className="flex-1 border border-slate-200 bg-white text-slate-900 rounded-[10px] py-[7px] px-2 text-xs" />
                <button onClick={onSendChecklist} className="bg-indigo-600 text-white rounded-[10px] py-[7px] px-2 font-semibold text-[10px]">Add</button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 px-2.5 py-2 border-t border-slate-200 bg-white flex-shrink-0">
              {pendingAttachment && (<div className="text-xs text-slate-600 bg-slate-50 border border-dashed border-slate-300 rounded-lg px-2 py-1.5">Attached: {pendingAttachment.name}</div>)}
              <div className="flex gap-1.5 items-center relative">
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSendChat()} placeholder="Message team... @mention colleagues"
                  className="flex-1 border border-slate-200 bg-white text-slate-900 rounded-[10px] py-[7px] px-2 text-xs min-w-0" />
                <button className="w-[34px] h-[34px] rounded-[10px] border border-slate-200 bg-white text-slate-700 flex items-center justify-center flex-shrink-0" onClick={() => setAttachMenuOpen(!attachMenuOpen)}>
                  <IconClipList className="w-4 h-4" />
                </button>
                {attachMenuOpen && (
                  <div className="absolute right-[58px] bottom-[50px] bg-white border border-slate-200 rounded-[10px] shadow-md p-1.5 flex flex-col gap-1 min-w-[130px] z-10">
                    <label className="cursor-pointer text-left rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white hover:bg-slate-100">
                      Attach image
                      <input type="file" accept="image/*" className="hidden" onChange={onAttachImage} />
                    </label>
                    <label className="cursor-pointer text-left rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white hover:bg-slate-100">
                      Attach file
                      <input type="file" className="hidden" onChange={onAttachFile} />
                    </label>
                  </div>
                )}
                <button onClick={onSendChat} className="rounded-full px-2.5 py-[7px] text-[11px] font-semibold text-white bg-indigo-500 flex-shrink-0">Send</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {po360MediaDrawerOpen && <div className="fixed inset-0 bg-slate-900/35 z-[45] animate-[toastOverlayIn_.2s_ease]" onClick={togglePO360MediaDrawer} />}
      <aside className={`fixed top-0 right-0 h-screen w-[min(380px,94vw)] bg-white z-[46] shadow-[-12px_0_40px_rgba(15,23,42,.14)] transition-transform duration-[280ms] flex flex-col border-l border-slate-200 ${po360MediaDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-[18px] py-4 border-b border-slate-200 bg-[#fafafa]">
          <span className="text-[11px] font-extrabold tracking-[.14em] text-slate-600">REFERENCE MEDIA</span>
          <button type="button" onClick={togglePO360MediaDrawer} className="border-0 bg-slate-100 hover:bg-slate-200 w-8 h-8 rounded-[10px] cursor-pointer text-slate-600 text-lg leading-none">×</button>
        </div>
        <div className="p-3.5 overflow-auto flex-1 grid grid-cols-2 gap-3 content-start">
          <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50 relative aspect-square">
            <span className="absolute top-2 left-2 w-[22px] h-[22px] rounded-full bg-violet-600 text-white flex items-center justify-center text-[11px] font-extrabold">✓</span>
            <img src={refThumbPrimary} alt={`Primary reference for ${p.sku}`} className="w-full h-full object-cover" />
          </div>
          <div className="rounded-lg overflow-hidden border border-dashed border-slate-200 bg-slate-200 relative aspect-square flex items-center justify-center">
            <div className="p-3.5 text-center text-[11px] font-semibold text-slate-600 break-all leading-snug">{refFileLabel}</div>
          </div>
        </div>
      </aside>
    </div>
  )
}
