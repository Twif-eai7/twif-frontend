import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { usePoShipmentPlans } from '../../hooks/usePoShipmentPlans'
import { useSkuMasterCbm } from '../../hooks/useSkuMasterCbm'
import { titleCaseName } from '../../utils/formatters'
import { fetchFinalInspectionStatuses } from '../../utils/finalInspectionStatus'
import { fetchCommittedPlanQuantities } from '../../utils/committedPlanQuantity'
import { fmtCurrency } from './poUtils'
import FinalInspectionBadge from './FinalInspectionBadge'

const qtyInputCls = 'w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-colors placeholder:text-gray-400 text-right'

// Edits an existing draft/pending plan's per-SKU quantities — the drawer's
// "Edit" used to just let the merchant type a new raw CBM number directly
// onto po_shipment_plans.cbm, which could silently drift from what the
// plan's own line items said was actually planned. This instead reopens the
// same per-SKU quantity picker PlanShipmentModal.jsx uses at creation time,
// prefilled from the plan's existing lines (not full balance — only what
// was actually selected before), and saves via update_shipment_plan_lines
// so cbm and the line items can never disagree.
//
// The full PO (every line item, not just the ones already in this plan) is
// fetched fresh by po_id — the drawer only ever loads the plan's own lines,
// never the PO's other SKUs — so a line item can be added to the plan here
// even if it wasn't part of the original selection.
export default function EditPlanModal({ open, plan, onClose, onSuccess }) {
  const { updatePlanLines } = usePoShipmentPlans()
  const [po, setPo] = useState(null)
  const [poLoading, setPoLoading] = useState(false)
  const [quantities, setQuantities] = useState({})
  const [selected, setSelected] = useState({})
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [inspectionByLineItem, setInspectionByLineItem] = useState({}) // po_line_item id -> latest Final inspection_reports row, informational only
  // po_line_item id -> quantity already sitting in ANOTHER draft/pending
  // plan (this plan's own quantity is excluded — editing it back up to
  // balance minus that figure is exactly the point of this modal).
  const [committedByLineItem, setCommittedByLineItem] = useState({})

  const { perUnitCbm, loading: cbmLoading } = useSkuMasterCbm(po ? [po] : [])

  useEffect(() => {
    if (!open || !plan) return
    setError(null)
    setSubmitting(false)
    setPoLoading(true)
    setPo(null)
    setInspectionByLineItem({})
    setCommittedByLineItem({})
    setSearch('')

    Promise.all([
      supabase
        .from('purchase_orders')
        .select(`
          id, po_number, currency,
          buyer_supplier_links (
            buyer_org_id,
            supplier:organizations!buyer_supplier_links_supplier_org_id_fkey ( display_name ),
            buyer:organizations!buyer_supplier_links_buyer_org_id_fkey ( display_name )
          ),
          po_line_items ( id, buyer_sku_ref, sku_variant, balance_quantity, unit_price )
        `)
        .eq('id', plan.po_id)
        .single(),
      // Fetched fresh by plan_id rather than trusting plan.lines (a prop
      // from the drawer's own list) — that list's own refetch after a
      // previous save may not have landed yet by the time this modal
      // reopens, which let an already-removed SKU reappear checked with its
      // stale quantity. Querying live here makes the modal correct
      // regardless of whether the parent list has caught up.
      supabase
        .from('po_shipment_plan_line_items')
        .select('po_line_item_id, quantity')
        .eq('plan_id', plan.id),
    ]).then(([poResult, linesResult]) => {
      const { data, error: fetchError } = poResult
      if (fetchError) { setError(fetchError.message); setPoLoading(false); return }
      if (linesResult.error) { setError(linesResult.error.message); setPoLoading(false); return }

      setPo({
        ...data,
        buyer_org_id: data.buyer_supplier_links?.buyer_org_id ?? null,
        buyer_name: titleCaseName(data.buyer_supplier_links?.buyer?.display_name) ?? null,
        supplier_name: titleCaseName(data.buyer_supplier_links?.supplier?.display_name) ?? null,
      })

      // Prefill from the plan's current lines only — unlike
      // PlanShipmentModal.jsx's create flow, a line item not already in
      // this plan starts unselected rather than defaulting to its full
      // balance, since it was deliberately left out (or added since).
      const existingByLineItemId = Object.fromEntries((linesResult.data || []).map(l => [l.po_line_item_id, l]))
      const nextQuantities = {}
      const nextSelected = {}
      ;(data.po_line_items || []).forEach(li => {
        const existing = existingByLineItemId[li.id]
        if (existing) {
          nextQuantities[li.id] = String(existing.quantity)
          nextSelected[li.id] = true
        }
      })
      setQuantities(nextQuantities)
      setSelected(nextSelected)
      setPoLoading(false)

      const lineItemIds = (data.po_line_items || []).map(li => li.id)
      fetchFinalInspectionStatuses(lineItemIds).then(setInspectionByLineItem)
      fetchCommittedPlanQuantities(lineItemIds, plan.id).then(setCommittedByLineItem)
    })
  }, [open, plan])

  if (!open || !plan) return null

  const plannableQty = (li) => Math.max(0, (Number(li.balance_quantity) || 0) - (committedByLineItem[li.id] || 0))

  const lineCbm = (li) => {
    if (!po || !selected[li.id]) return null
    const qty = Number(quantities[li.id])
    if (!qty || qty <= 0) return null
    const perUnit = perUnitCbm(po, li)
    return perUnit != null ? qty * perUnit : 0
  }

  const totalCbm = (po?.po_line_items || []).reduce((sum, li) => sum + (lineCbm(li) ?? 0), 0)
  // Total across every SKU regardless of the search box's current filter —
  // same "reflects the real save, not just what's visible" reasoning as
  // totalCbm above.
  const totalQty = (po?.po_line_items || []).reduce((sum, li) => sum + (selected[li.id] ? (Number(quantities[li.id]) || 0) : 0), 0)

  const lineValue = (li) => {
    if (!selected[li.id]) return null
    const qty = Number(quantities[li.id])
    if (!qty || qty <= 0 || li.unit_price == null) return null
    return qty * li.unit_price
  }
  const totalValue = (po?.po_line_items || []).reduce((sum, li) => sum + (lineValue(li) ?? 0), 0)

  const matchesSearch = (li) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (li.buyer_sku_ref || '').toLowerCase().includes(q) || (li.sku_variant || '').toLowerCase().includes(q)
  }

  const qtyExceedsPlannable = (li) => {
    if (!selected[li.id]) return false
    const qty = Number(quantities[li.id])
    return qty > 0 && qty > plannableQty(li)
  }
  const hasOverLimitLine = (po?.po_line_items || []).some(qtyExceedsPlannable)

  // Judged by selected quantity, not derived CBM — see the matching comment
  // in PlanShipmentModal.jsx: some buyers' SKUs are missing master L/W/H,
  // which makes CBM come out 0 even with real quantity selected. Gating on
  // qty still catches the real mistake (nothing selected at all).
  const hasSelectedQty = (po?.po_line_items || []).some(li => selected[li.id] && Number(quantities[li.id]) > 0)

  const canSubmit = !submitting && !poLoading && !!po && hasSelectedQty && !hasOverLimitLine

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const lines = (po.po_line_items || [])
        .filter(li => selected[li.id] && Number(quantities[li.id]) > 0)
        .map(li => {
          const qty = Number(quantities[li.id])
          const perUnit = perUnitCbm(po, li) ?? 0
          return { po_line_item_id: li.id, quantity: qty, cbm: qty * perUnit }
        })
      await updatePlanLines(plan.id, lines)
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to update plan')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[130] bg-black/40" onClick={!submitting ? onClose : undefined} />
      <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col pointer-events-auto">

          <div className="flex items-center gap-4 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900">Edit Shipment Plan</h2>
              <p className="text-xs text-gray-500 mt-0.5">Adjust quantities per SKU — CBM is derived from master data.</p>
            </div>
            <button type="button" onClick={!submitting ? onClose : undefined}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
            {poLoading && (
              <p className="text-xs text-gray-400 text-center py-8">Loading…</p>
            )}
            {!poLoading && po && (
              <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 border-b border-gray-200">
                  <div className="min-w-0">
                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">PO</div>
                    <div className="text-sm font-bold text-gray-900 truncate">{po.po_number}</div>
                    <div className="text-xs text-gray-500 truncate">{po.buyer_name || '—'} · {po.supplier_name || '—'}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-gray-900">{totalCbm.toFixed(3)} m³</div>
                    {totalValue > 0 && <div className="text-xs font-semibold text-emerald-700">{fmtCurrency(totalValue, po.currency)}</div>}
                    <div className="text-[10px] text-gray-400">{totalQty} units selected</div>
                  </div>
                </div>
                {(po.po_line_items || []).length > 5 && (
                  <div className="px-3 pt-2">
                    <div className="relative">
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
                  </div>
                )}
                {(po.po_line_items || []).length > 0 && (
                  <div className="flex items-center gap-3 px-3 pt-2 pb-1">
                    <span className="w-4 flex-shrink-0" />
                    <span className="min-w-0 flex-1 text-[9px] font-bold text-gray-400 uppercase tracking-widest">SKU</span>
                    <span className="w-20 flex-shrink-0 text-[9px] font-bold text-gray-400 uppercase tracking-widest text-right">Qty to Plan</span>
                    <span className="w-20 flex-shrink-0 text-[9px] font-bold text-gray-400 uppercase tracking-widest text-right">CBM</span>
                  </div>
                )}
                <div className="divide-y divide-gray-100">
                  {(po.po_line_items || []).filter(matchesSearch).length === 0 && (po.po_line_items || []).length > 0 && (
                    <p className="px-3 py-6 text-xs text-gray-400 text-center">No SKUs match your search</p>
                  )}
                  {(po.po_line_items || []).filter(matchesSearch).map(li => {
                    const perUnit = perUnitCbm(po, li)
                    const cbm = lineCbm(li)
                    const isSelected = !!selected[li.id]
                    const balance = Number(li.balance_quantity) || 0
                    const committed = committedByLineItem[li.id] || 0
                    const plannable = plannableQty(li)
                    const overLimit = qtyExceedsPlannable(li)
                    // A brand-new line (not already in this plan) with
                    // nothing left to plan gets no checkbox — there's
                    // nothing to add. A line already in the plan keeps its
                    // checkbox regardless (so it can still be unchecked/
                    // removed), even if something else has since eaten into
                    // its room.
                    const showCheckbox = isSelected || plannable > 0
                    return (
                      <div key={li.id} className={`flex items-center justify-between gap-3 px-3 py-2 transition-opacity ${isSelected ? '' : 'opacity-50'}`}>
                        {showCheckbox ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={e => {
                              const checked = e.target.checked
                              setSelected(prev => ({ ...prev, [li.id]: checked }))
                              // A SKU not currently in the plan (never selected,
                              // or removed in a previous edit) starts with no
                              // quantity — unlike PlanShipmentModal.jsx's create
                              // flow, which prefills every line with its
                              // balance up front. Default it here the first
                              // time it's checked instead, rather than leaving
                              // the merchant to type the balance manually.
                              if (checked && !quantities[li.id]) {
                                setQuantities(prev => ({ ...prev, [li.id]: String(plannableQty(li)) }))
                              }
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 flex-shrink-0 cursor-pointer"
                          />
                        ) : (
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
                        {showCheckbox ? (
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
                        <div className="w-20 text-right flex-shrink-0">
                          <div className="text-xs font-semibold text-gray-700">{cbm != null ? `${cbm.toFixed(3)} m³` : '—'}</div>
                          {lineValue(li) != null && (
                            <div className="text-[10px] text-emerald-700">{fmtCurrency(lineValue(li), po.currency)}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {(po.po_line_items || []).length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">No line items on this PO</p>
                  )}
                </div>
              </div>
            )}

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
              {submitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body
  )
}
