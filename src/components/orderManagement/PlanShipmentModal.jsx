import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { usePoShipmentPlans } from '../../hooks/usePoShipmentPlans'
import { useSkuMasterCbm } from '../../hooks/useSkuMasterCbm'
import { fetchFinalInspectionStatuses } from '../../utils/finalInspectionStatus'
import { fetchCommittedPlanQuantities } from '../../utils/committedPlanQuantity'
import FinalInspectionBadge from './FinalInspectionBadge'
import { fmtCurrency } from './poUtils'

// order_value_usd/quantity_ordered (the convention used elsewhere — see
// useInvoiceLegReconciliation.js, AdvancePaymentModal) is the ORIGINAL
// order's average per-unit rate, booked once at PI confirmation time —
// it goes stale the moment unit_price is revised afterward without
// order_value_usd being recalculated, and a shipment plan is routinely for
// a PARTIAL quantity anyway, so deriving a rate from a total is the wrong
// basis here regardless. Always go straight from the line's own current
// unit_price instead, shown in the PO's own currency rather than converted
// to USD — no rate/conversion needed at all, since unit_price is already
// in that currency.
function perUnitValue(li) {
  return li.unit_price != null ? li.unit_price : null
}

const qtyInputCls = 'w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-colors placeholder:text-gray-400 text-right'

// Selected POs (from PoRecord.jsx's bulk-select) — merchant enters a
// quantity per SKU instead of typing a CBM guess; CBM is derived from each
// SKU's master data (master_pack_cbm / master_pack_qty per unit, see
// useSkuMasterCbm.js). Submitting records each PO as a "planned to ship"
// po_shipment_plans row, with its per-SKU quantities in
// po_shipment_plan_line_items — the first step of the reversed shipment flow.
export default function PlanShipmentModal({ open, pos, onClose, onSuccess }) {
  const { createPlans } = usePoShipmentPlans()
  const { perUnitCbm, loading: cbmLoading } = useSkuMasterCbm(pos)
  const [quantities, setQuantities] = useState({}) // po_line_item id -> qty string
  const [selected, setSelected] = useState({}) // po_line_item id -> bool, unchecked = excluded from this plan
  const [search, setSearch] = useState('')
  // Which of the selected POs is showing its SKU list — with several POs
  // selected at once, everything used to render in one long vertical list,
  // so reaching the second PO meant scrolling past the first one's entire
  // SKU list. Tabs let you jump straight to it instead.
  const [activePoId, setActivePoId] = useState(null)
  const scrollRef = useRef(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [inspectionByLineItem, setInspectionByLineItem] = useState({}) // po_line_item id -> latest Final inspection_reports row, informational only
  // po_line_item id -> quantity already sitting in another draft/pending
  // plan — a PO can now have several simultaneously-active plans (shipped
  // in batches), so this has to be subtracted from balance_quantity or two
  // plans could each independently claim the same units. Same
  // draft/pending-only rule create_shipment_plan_with_lines itself enforces
  // server-side (the real gate; this is just its client-side reflection).
  const [committedByLineItem, setCommittedByLineItem] = useState({})

  // Prefill every SKU with its remaining PLANNABLE balance (balance minus
  // whatever's already committed to another active plan) and select it by
  // default — the merchant is planning the full remaining balance in the
  // common case, so they only need to touch the few lines that differ
  // (deselect, or edit the quantity) rather than typing every line from
  // scratch. Only depends on `open` (not `pos`, which is a fresh array
  // reference on every parent render) so mid-edit state survives an
  // unrelated re-render of the page behind the modal.
  useEffect(() => {
    if (!open) return
    setSearch('')
    setActivePoId(pos[0]?.id ?? null)
    setError(null)
    setSubmitting(false)
    setInspectionByLineItem({})
    setCommittedByLineItem({})

    const lineItemIds = pos.flatMap(po => (po.po_line_items || []).map(li => li.id))
    fetchFinalInspectionStatuses(lineItemIds).then(setInspectionByLineItem)
    fetchCommittedPlanQuantities(lineItemIds).then(committed => {
      setCommittedByLineItem(committed)
      const nextQuantities = {}
      const nextSelected = {}
      pos.forEach(po => {
        ;(po.po_line_items || []).forEach(li => {
          const plannable = Math.max(0, (Number(li.balance_quantity) || 0) - (committed[li.id] || 0))
          if (plannable > 0) {
            nextQuantities[li.id] = String(plannable)
            nextSelected[li.id] = true
          }
        })
      })
      setQuantities(nextQuantities)
      setSelected(nextSelected)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const activePo = pos.find(po => po.id === activePoId) || pos[0]

  const selectPo = (poId) => {
    setActivePoId(poId)
    setSearch('')
    scrollRef.current?.scrollTo(0, 0)
  }

  const plannableQty = (li) => Math.max(0, (Number(li.balance_quantity) || 0) - (committedByLineItem[li.id] || 0))

  const poFullyCommitted = (po) => {
    const lines = po.po_line_items || []
    return lines.length > 0 && lines.every(li => plannableQty(li) <= 0)
  }

  const matchesSearch = (li) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (li.buyer_sku_ref || '').toLowerCase().includes(q) || (li.sku_variant || '').toLowerCase().includes(q)
  }

  const activeLineItems = activePo?.po_line_items || []

  // Select-all/deselect-all — scoped to the active PO's tab and whatever the
  // search box currently shows within it, same "act on what's visible"
  // convention as PoDrawer's bulk-select checkbox. Excludes lines with
  // nothing left to plan (no checkbox to toggle — see the row rendering
  // below), so it never tries to select something that isn't selectable.
  // Selecting fills in a sensible default quantity (the line's own balance)
  // for any line that was deselected before it ever got one typed.
  const allVisibleLineItems = activeLineItems.filter(li => matchesSearch(li) && plannableQty(li) > 0)
  const allVisibleSelected = allVisibleLineItems.length > 0 && allVisibleLineItems.every(li => selected[li.id])
  const toggleSelectAllVisible = () => {
    const nextChecked = !allVisibleSelected
    setSelected(prev => {
      const next = { ...prev }
      allVisibleLineItems.forEach(li => { next[li.id] = nextChecked })
      return next
    })
    if (nextChecked) {
      setQuantities(prev => {
        const next = { ...prev }
        allVisibleLineItems.forEach(li => {
          if (!next[li.id]) next[li.id] = String(plannableQty(li))
        })
        return next
      })
    }
  }

  const lineCbm = (po, li) => {
    if (!selected[li.id]) return null
    const qty = Number(quantities[li.id])
    if (!qty || qty <= 0) return null
    const perUnit = perUnitCbm(po, li)
    return perUnit != null ? qty * perUnit : 0
  }

  const poTotalCbm = (po) => (po.po_line_items || []).reduce((sum, li) => sum + (lineCbm(po, li) ?? 0), 0)

  const lineValue = (li) => {
    if (!selected[li.id]) return null
    const qty = Number(quantities[li.id])
    if (!qty || qty <= 0) return null
    const perUnit = perUnitValue(li)
    return perUnit != null ? qty * perUnit : null
  }

  const poTotalValue = (po) => (po.po_line_items || []).reduce((sum, li) => sum + (lineValue(li) ?? 0), 0)

  const qtyExceedsPlannable = (li) => {
    if (!selected[li.id]) return false
    const qty = Number(quantities[li.id])
    return qty > 0 && qty > plannableQty(li)
  }
  const poHasOverLimit = (po) => (po.po_line_items || []).some(qtyExceedsPlannable)
  const hasOverLimitLine = pos.some(poHasOverLimit)

  // "Has something to plan" is judged by actual selected quantity, not
  // derived CBM — some buyers' SKUs are missing master L/W/H, which makes
  // perUnitCbm (and so poTotalCbm) come out null/0 even though the merchant
  // genuinely wants to plan real units. Gating on CBM would block planning
  // entirely for those SKUs until master data catches up; gating on qty
  // still catches the real mistake (an empty/all-deselected PO) without
  // that collateral block.
  const poHasSelectedQty = (po) => (po.po_line_items || []).some(li => selected[li.id] && Number(quantities[li.id]) > 0)

  // A fully-committed PO (nothing left to plan on any of its SKUs) can never
  // contribute anything, so it shouldn't be able to block submission of the
  // OTHER selected POs that do have something to plan — only POs that still
  // have room are held to the "must actually plan something" bar.
  const plannablePos = pos.filter(po => !poFullyCommitted(po))
  const canSubmit = plannablePos.length > 0 && plannablePos.every(poHasSelectedQty) && !hasOverLimitLine && !submitting
  const posToSubmit = pos.filter(poHasSelectedQty)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const items = posToSubmit.map(po => ({
        po_id: po.id,
        lines: (po.po_line_items || [])
          .filter(li => selected[li.id] && Number(quantities[li.id]) > 0)
          .map(li => {
            const qty = Number(quantities[li.id])
            const perUnit = perUnitCbm(po, li) ?? 0
            return { po_line_item_id: li.id, quantity: qty, cbm: qty * perUnit }
          }),
      }))
      await createPlans(items)
      onSuccess?.()
      onClose()
    } catch (err) {
      // A PO can now hold several simultaneously-active plans, so the old
      // "already planned" duplicate-key case no longer applies here — a
      // failure at this point is create_shipment_plan_with_lines' own
      // plannable-quantity gate (someone else planned/shipped the same
      // units in the moment between this modal opening and Submit).
      setError(err.message || 'Failed to plan shipment')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <>
      {/* Backdrop is inert — this form takes real effort (per-SKU quantities
          across possibly several POs), so an accidental outside click
          should never discard it. Cancel/X are the only ways out. */}
      <div className="fixed inset-0 z-[110] bg-black/40" />
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col pointer-events-auto">

          <div className="flex items-center gap-4 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900">Plan for Shipment</h2>
              <p className="text-xs text-gray-500 mt-0.5">Deselect or edit any line. CBM is derived from master data. Group and confirm from My Planned Shipments once ready.</p>
            </div>
            <button type="button" onClick={!submitting ? onClose : undefined}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* PO tabs — only when planning more than one PO at once, so
              switching between them is a click instead of a long scroll
              past every SKU on the previous one. */}
          {pos.length > 1 && (
            <div className="flex items-center gap-1.5 px-4 sm:px-6 py-2 border-b border-gray-100 overflow-x-auto flex-shrink-0">
              {pos.map(po => {
                const isActive = po.id === activePo?.id
                const fullyCommitted = poFullyCommitted(po)
                const overLimit = poHasOverLimit(po)
                return (
                  <button key={po.id} type="button" onClick={() => selectPo(po.id)}
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors ${
                      isActive
                        ? 'bg-gray-900 text-white border-gray-900'
                        : fullyCommitted
                          ? 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}>
                    {po.po_number}
                    {overLimit && <span className={isActive ? 'text-red-300' : 'text-red-500'} title="A line on this PO exceeds what's left to plan">●</span>}
                    {fullyCommitted && <span className="text-[10px] font-normal">· nothing to plan</span>}
                  </button>
                )
              })}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-4 space-y-3" ref={scrollRef}>
            {/* Toolbar + PO summary stick together as one unit while the SKU
                rows below scroll underneath — always know which PO/total
                you're looking at without scrolling back up. The scroll
                container's own top padding moved in here (pt-4 instead of
                the form's py-4): if the padding stayed on the form, it would
                leave a gap above this block's stuck position where a
                scrolled-up SKU row could still peek through before the
                sticky offset actually engaged at true y=0. */}
            <div className="sticky top-0 z-10 bg-white pt-4 pb-2 space-y-2">
              {activeLineItems.length > 1 && (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 flex-shrink-0 text-xs font-medium text-gray-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer"
                    />
                    {allVisibleSelected ? 'Deselect all' : 'Select all'}
                  </label>
                  {activeLineItems.length > 5 && (
                    <div className="relative flex-1">
                      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search SKU…"
                        className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-900 transition-colors"
                      />
                    </div>
                  )}
                </div>
              )}
              {activePo && (
                <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl shadow-sm">
                  <div className="min-w-0">
                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">PO</div>
                    <div className="text-sm font-bold text-gray-900 truncate">{activePo.po_number}</div>
                    <div className="text-xs text-gray-500 truncate">{activePo.buyer_name || '—'} · {activePo.supplier_name || '—'}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-gray-900">{poTotalCbm(activePo).toFixed(3)} m³</div>
                    <div className="text-xs font-semibold text-emerald-700">{fmtCurrency(poTotalValue(activePo), activePo.currency)}</div>
                    <div className="text-[10px] text-gray-400">derived total</div>
                  </div>
                </div>
              )}
            </div>
            {activePo && (() => {
              const po = activePo
              const visibleLineItems = activeLineItems.filter(matchesSearch)
              return (
                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  {visibleLineItems.length > 0 && (
                    <div className="flex items-center gap-3 px-3 pt-2 pb-1">
                      <span className="w-4 flex-shrink-0" />
                      <span className="min-w-0 flex-1 text-[9px] font-bold text-gray-400 uppercase tracking-widest">SKU</span>
                      <span className="w-20 flex-shrink-0 text-[9px] font-bold text-gray-400 uppercase tracking-widest text-right">Qty to Plan</span>
                      <span className="w-20 flex-shrink-0 text-[9px] font-bold text-gray-400 uppercase tracking-widest text-right">CBM</span>
                      <span className="w-24 flex-shrink-0 text-[9px] font-bold text-gray-400 uppercase tracking-widest text-right">Value</span>
                    </div>
                  )}
                  <div className="divide-y divide-gray-100">
                    {visibleLineItems.map(li => {
                      const perUnit = perUnitCbm(po, li)
                      const cbm = lineCbm(po, li)
                      const value = lineValue(li)
                      const isSelected = !!selected[li.id]
                      const balance = Number(li.balance_quantity) || 0
                      const committed = committedByLineItem[li.id] || 0
                      const plannable = plannableQty(li)
                      const overLimit = qtyExceedsPlannable(li)
                      const isPlannable = plannable > 0
                      return (
                        <div key={li.id} className={`flex items-center justify-between gap-3 px-3 py-2 transition-opacity ${isSelected ? '' : 'opacity-50'}`}>
                          {isPlannable ? (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={e => setSelected(prev => ({ ...prev, [li.id]: e.target.checked }))}
                              className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 flex-shrink-0 cursor-pointer"
                            />
                          ) : (
                            // Nothing left to plan on this SKU — no checkbox to
                            // give (there's nothing to select), just a spacer
                            // to keep the row's columns aligned.
                            <span className="w-4 flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <div className="text-xs font-semibold text-gray-900 truncate">
                                {li.buyer_sku_ref || '—'}
                                {li.sku_variant && <span className="ml-1.5 text-[10px] font-medium text-gray-500">{li.sku_variant}</span>}
                              </div>
                              <FinalInspectionBadge report={inspectionByLineItem[li.id]} />
                            </div>
                            <div className="text-[10px] text-gray-400">
                              {cbmLoading ? 'Loading master data…' : perUnit != null ? `${perUnit.toFixed(4)} m³/unit` : 'No master CBM data'}
                              {' · '}Balance: {balance}
                              {committed > 0 && (
                                <span className="text-amber-600"> · {committed} already planned · {plannable} left</span>
                              )}
                            </div>
                            {overLimit && (
                              <p className="text-[10px] text-red-500">Cannot exceed {plannable} (balance minus what's already planned)</p>
                            )}
                          </div>
                          {isPlannable ? (
                            <input
                              type="number" min="0" step="1" max={plannable}
                              value={quantities[li.id] ?? ''}
                              onChange={e => setQuantities(prev => ({ ...prev, [li.id]: e.target.value }))}
                              disabled={!isSelected}
                              placeholder="Qty"
                              className={`${qtyInputCls} disabled:bg-gray-50 disabled:cursor-not-allowed ${overLimit ? 'border-red-400 focus:border-red-500 bg-red-50' : ''}`}
                            />
                          ) : (
                            <div className={`${qtyInputCls} bg-gray-50 text-gray-300 flex items-center justify-center`}>—</div>
                          )}
                          <div className="w-20 text-right text-xs font-semibold text-gray-700 flex-shrink-0">
                            {cbm != null ? `${cbm.toFixed(3)} m³` : '—'}
                          </div>
                          <div className="w-24 text-right text-xs font-semibold text-emerald-700 flex-shrink-0">
                            {value != null ? fmtCurrency(value, po.currency) : '—'}
                          </div>
                        </div>
                      )
                    })}
                    {activeLineItems.length === 0 && (
                      <p className="px-3 py-2 text-xs text-gray-400">No line items on this PO</p>
                    )}
                    {activeLineItems.length > 0 && visibleLineItems.length === 0 && (
                      <p className="px-3 py-6 text-xs text-gray-400 text-center">No SKUs match your search</p>
                    )}
                  </div>
                </div>
              )
            })()}

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {error}
              </div>
            )}
          </form>

          <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-3 border-t border-gray-100 flex-shrink-0">
            <button type="button" onClick={onClose} disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {submitting ? 'Planning…' : `Plan ${posToSubmit.length} PO${posToSubmit.length !== 1 ? 's' : ''}`}
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body
  )
}
