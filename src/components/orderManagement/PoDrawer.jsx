import { createPortal } from 'react-dom'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrgDepartment, useMemberId } from '../../stores/profileStore'
import { useSkuCache } from '../../hooks/useSkuCache'
import { skuToConfirmedFields } from '../../hooks/useSkuImport'
import { publicUrl, fmt$, fmtOriginalAmount, fmtQty, impliedRateFor, PiBadge, ErpBadge, DocChip } from './poUtils'
import { supabase } from '../../lib/supabase'
import { FALLBACK_RATES, titleCaseName } from '../../utils/formatters'
import PiPreviewPanel from './PiPreviewPanel'
import SkuReviewDrawer from './SkuReviewDrawer'
import SkuDetailDrawer from './SkuDetailDrawer'
import CancelQuantityModal from '../qualityCompliance/inspectionReport/CancelQuantityModal'
import CancelOrderModal from './CancelOrderModal'
import { usePendingLineItemCancellations } from '../../hooks/usePoLineItemCancellations'

// Status colour map for the line items table
const STATUS_STYLE = {
  open:      { dot: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-800' },
  shipped:   { dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800' },
  cancelled: { dot: 'bg-red-400',     badge: 'bg-red-100 text-red-700' },
  confirmed: { dot: 'bg-blue-400',    badge: 'bg-blue-100 text-blue-800' },
}
function statusStyle(s) {
  return STATUS_STYLE[s?.toLowerCase()] ?? { dot: 'bg-gray-300', badge: 'bg-gray-100 text-gray-600' }
}

// Progress bar: shipped / ordered — 0 (not just missing) still renders an
// empty bar, since a freshly-added item legitimately has ordered=0.
function ShipProgress({ ordered, shipped }) {
  const pct = ordered ? Math.min(100, Math.round(((shipped ?? 0) / ordered) * 100)) : 0
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-900 whitespace-nowrap flex-shrink-0">{pct}%</span>
    </div>
  )
}

function priceLabel(li) {
  return li.unit_price != null ? `$${Number(li.unit_price).toFixed(2)}` : '—'
}

// ── Line Items table (read-only view) ─────────────────────────────────────────

function LineItemTableRow({ li, canEdit, onEdit, onOpenSkuEdit, loadingSkuEdit, canCancelQty, pendingCancellation, onCancelQty, selectable, selected, onToggleSelect }) {
  const { dot, badge } = statusStyle(li.status)
  const isBlank = !li.buyer_sku_ref
  // Opens the SKU's own catalog record (weight/dimensions/barcode/material)
  // right from here — a blank/unlinked row has no sku_id yet, nothing to open.
  const canOpenSku = !!li.sku_id && !!onOpenSkuEdit
  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
      {canCancelQty && (
        <td className="pl-5 pr-1 py-3">
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(li)}
              title="Select for bulk cancellation"
              className="w-3.5 h-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
            />
          )}
        </td>
      )}
      <td className="px-5 py-3">
        <div
          className={`flex items-center gap-2 min-w-0 ${canOpenSku ? 'cursor-pointer group' : ''}`}
          onClick={canOpenSku ? () => onOpenSkuEdit(li) : undefined}
          title={canOpenSku ? 'Edit this SKU' : undefined}
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
          <div className="min-w-0">
            <div className={`text-xs truncate ${isBlank ? 'text-gray-400 italic' : `font-bold text-gray-900 ${canOpenSku ? 'group-hover:text-indigo-600 group-hover:underline' : ''}`}`}>
              {loadingSkuEdit ? 'Loading…' : (li.buyer_sku_ref || 'New item')}
            </div>
            {li.sku_variant && <div className="text-[10px] text-gray-400 truncate">{li.sku_variant}</div>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs font-semibold text-emerald-600 whitespace-nowrap">{priceLabel(li)}</td>
      <td className="px-4 py-3 text-xs font-semibold text-black whitespace-nowrap">{fmtQty(li.quantity_ordered ?? 0)}</td>
      <td className="px-4 py-3 text-xs font-semibold text-black whitespace-nowrap">{fmtQty(li.shipped_quantity ?? 0)}</td>
      <td className="px-4 py-3 text-xs font-semibold text-black whitespace-nowrap">{fmtQty(li.balance_quantity ?? 0)}</td>
      <td className="px-4 py-3">
        <ShipProgress ordered={li.quantity_ordered} shipped={li.shipped_quantity} />
      </td>
      <td className="px-4 py-3">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${badge}`}>
          {li.status || '—'}
        </span>
      </td>
      <td className="px-5 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {canCancelQty && !isBlank && (
            <button
              type="button"
              onClick={() => onCancelQty(li)}
              title={pendingCancellation ? 'A cancellation request is already pending for this SKU' : "Request cancelling part of this SKU's order quantity"}
              className="px-2 py-1 rounded-md text-[10px] font-bold text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              {pendingCancellation ? 'Cancel Qty · Pending' : 'Cancel Qty'}
              {li.cancelled_quantity > 0 && !pendingCancellation && ` (${li.cancelled_quantity})`}
            </button>
          )}
          {canEdit && (
            <button type="button" onClick={() => onEdit(li)}
              className="px-2.5 py-1 rounded-md bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700 transition-colors cursor-pointer">
              Edit
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// Mirrors LineItemForm's header/background structure exactly — gray-100
// header band, PI toggle, plain white content area — so the read-only view
// and the edit view feel like the same surface, not two different UIs.
function LineItemsTable({ items, canEdit, onAddItem, onEditItem, onOpenSkuEdit, loadingSkuEditId, totalOrderedUsd, poAmountUsd, canCancelQty, pendingCancellations, onCancelQty, onCancelSelected }) {
  // Local, self-contained — nothing outside this table needs the term, and
  // the parent remounts this component (key={po.id}) whenever the drawer
  // switches POs, so there's no stale-search-across-POs risk to reset here.
  const [search, setSearch] = useState('')
  const matchesSearch = (li) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (li.buyer_sku_ref || '').toLowerCase().includes(q) || (li.sku_variant || '').toLowerCase().includes(q)
  }
  const visibleItems = items.filter(matchesSearch)

  // Row-checkbox selection for the "Cancel Selected" bulk flow — same
  // eligibility bar CancelOrderModal itself re-checks defensively: a real
  // SKU, no cancellation already pending, and something left to cancel.
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const remainingFor = (li) => Math.max(0, Number(li.quantity_ordered || 0) - Number(li.cancelled_quantity || 0))
  const isSelectable = (li) => !!li.buyer_sku_ref && !pendingCancellations?.[li.id] && remainingFor(li) > 0
  const toggleSelect = (li) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(li.id) ? next.delete(li.id) : next.add(li.id)
    return next
  })
  const selectableVisible = visibleItems.filter(isSelectable)
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every(li => selectedIds.has(li.id))
  const toggleSelectAllVisible = () => setSelectedIds(prev => {
    if (allVisibleSelected) {
      const next = new Set(prev)
      selectableVisible.forEach(li => next.delete(li.id))
      return next
    }
    return new Set([...prev, ...selectableVisible.map(li => li.id)])
  })
  const selectedItems = items.filter(li => selectedIds.has(li.id))

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-5 pt-4 pb-2 flex-shrink-0 bg-gray-100">
        <span className="text-sm font-bold text-gray-900">SKU Items</span>
        {items.length > 0 && (
          <span className="text-[10px] font-semibold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
            {items.length}
          </span>
        )}
        {canEdit && (
          isFullyAllocated(totalOrderedUsd, poAmountUsd) ? (
            <span className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-emerald-500 text-emerald-700 text-[11px] font-semibold">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Line items match the PO amount — edit the PO's details to add more
            </span>
          ) : (
            <button type="button" onClick={onAddItem}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 transition-colors cursor-pointer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Item
            </button>
          )
        )}
      </div>

      {/* Skip when there are no items at all — "the full amount is unallocated"
          is redundant with the empty state already saying so. Also gated on
          canEdit — this is an erp/tech data-entry concern (does the PO's own
          amount match what's been keyed into line items), not something
          merchandising needs to see or can act on. */}
      {items.length > 0 && canEdit && <LineItemsTotalBanner totalUsd={totalOrderedUsd} poAmountUsd={poAmountUsd} />}

      {items.length > 5 && (
        <div className="relative px-5 py-2 flex-shrink-0 bg-white border-b border-gray-100">
          <svg className="absolute left-7 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search SKU…"
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-900 transition-colors"
          />
        </div>
      )}

      {/* Bulk-cancel action bar — appears once 1+ rows are checked, so
          several SKUs sharing the same cancellation reason/proof can be
          submitted together instead of re-entering it per SKU. */}
      {canCancelQty && selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-2 px-5 py-2 flex-shrink-0 bg-red-50 border-b border-red-100">
          <span className="text-xs font-semibold text-red-700">{selectedIds.size} SKU{selectedIds.size === 1 ? '' : 's'} selected</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelectedIds(new Set())}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
              Clear
            </button>
            <button type="button" onClick={() => { onCancelSelected(selectedItems); setSelectedIds(new Set()) }}
              className="px-3 py-1.5 rounded-md bg-red-600 text-white text-[11px] font-semibold hover:bg-red-700 transition-colors cursor-pointer">
              Cancel Selected
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex-1 overflow-y-auto px-5 py-4 bg-white">
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
            </svg>
            <p className="text-xs text-gray-400">No line items found</p>
          </div>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="flex-1 overflow-y-auto px-5 py-4 bg-white">
          <p className="text-xs text-gray-400 text-center py-12">No SKUs match "{search}"</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-white">
          {/* No card/border around the table — the heading row sits flush
              against the "Line Items" bar above and stays pinned while the
              rows beneath it scroll. */}
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                {canCancelQty && (
                  <th className="pl-5 pr-1 py-2">
                    {selectableVisible.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        title="Select all eligible SKUs"
                        className="w-3.5 h-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                      />
                    )}
                  </th>
                )}
                <th className="px-5 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wide">SKU</th>
                <th className="px-4 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wide">Price</th>
                <th className="px-4 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wide">Ord.</th>
                <th className="px-4 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wide">Shp.</th>
                <th className="px-4 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wide">Bal.</th>
                <th className="px-4 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wide">Progress</th>
                <th className="px-4 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wide">Status</th>
                <th className="px-5 py-2 w-32" />
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(li => (
                <LineItemTableRow key={li.id} li={li} canEdit={canEdit} onEdit={onEditItem}
                  onOpenSkuEdit={onOpenSkuEdit} loadingSkuEdit={loadingSkuEditId === li.id}
                  canCancelQty={canCancelQty} pendingCancellation={pendingCancellations?.[li.id]} onCancelQty={onCancelQty}
                  selectable={isSelectable(li)} selected={selectedIds.has(li.id)} onToggleSelect={toggleSelect} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Line Item Form (ERP edit-item mode) ────────────────────────────────────────

// A blank placeholder line item — "+ Add Item" drops one of these straight
// into the table (shown as "New item"); clicking its Edit button opens
// LineItemForm to fill it in. Nothing is persisted until that Save.
let _draftId = 0
function newDraftItem() {
  return {
    id: `draft-${++_draftId}`,
    isDraft: true,
    buyer_sku_ref: '',
    sku_variant: '',
    unit_price: null,
    quantity_ordered: 0,
    shipped_quantity: 0,
    balance_quantity: 0,
    status: 'open',
  }
}

// Underline-style inputs, no boxed border — column labels live once in the
// sticky subheader (LineItemForm) rather than repeated on every row.
// Emerald is reserved for money since that's a meaningful color; everything
// else stays neutral rather than a color per column.
// No width class here (same reason as lineItemInputCls used to have one) —
// the width is always supplied at the call site, either directly on the
// input (Qty/Price/Date, which are their own flex item) or via `w-full` when
// the input needs to fill a sized wrapper div (SKU ref).
const underlineInputCls = 'bg-transparent text-xs font-semibold text-gray-900 outline-none border-b-2 border-gray-400 pb-1 placeholder:text-gray-500 placeholder:font-normal transition-colors focus:border-gray-900'

// Must match the widths/order of the subheader columns in LineItemForm.
const COL_SKU      = 'w-28'
const COL_VARIANT  = 'w-28'
const COL_QTY      = 'w-16'
const COL_PRICE    = 'w-28'
const COL_VALUE    = 'w-28'

function fmtMoney(amount, currency) {
  if (amount == null || Number.isNaN(amount)) return '—'
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency || ''}`.trim()
  }
}

// Rate implied by this PO's own amount/amount_usd, not a live rate — so
// line-item totals foot to the PO total instead of drifting from it. A
// qty × unit price, converted to USD via the PO-implied rate. Returns null
// when any input is missing/invalid, so callers can tell "not computable"
// apart from a real zero.
function orderedValueUsd(qty, price, rate) {
  const q = parseFloat(qty)
  const p = parseFloat(price)
  if (Number.isNaN(q) || Number.isNaN(p) || rate == null) return null
  return q * p * rate
}

// True only when we actually know the total matches — a missing po.amount_usd
// means "can't tell", not "fully allocated", so it must stay false then.
function isFullyAllocated(totalUsd, poAmountUsd) {
  return poAmountUsd != null && Math.abs(poAmountUsd - totalUsd) < 0.01
}

// Shown wherever the running line-item total needs a nudge relative to the
// PO's own amount — under-allocated ("space for more"), or over (only
// reachable via legacy data, since new saves are blocked past the PO amount).
function LineItemsTotalBanner({ totalUsd, poAmountUsd }) {
  if (poAmountUsd == null) return null
  const diff = poAmountUsd - totalUsd
  if (Math.abs(diff) < 0.01) return null
  const over = diff < 0
  return (
    <div className={`mx-5 mt-3 px-3 py-2 rounded-lg text-[11px] flex-shrink-0 ${over ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
      {over
        ? `Line items total ${fmtMoney(totalUsd, 'USD')}, ${fmtMoney(-diff, 'USD')} over the PO's ${fmtMoney(poAmountUsd, 'USD')} — double check the PO amount is correct (it may not have been entered correctly during upload).`
        : `${fmtMoney(diff, 'USD')} of ${fmtMoney(poAmountUsd, 'USD')} still unallocated — there's space for more line items.`}
    </div>
  )
}

// The add/edit form only ever sees the one item it's working on — this gives
// it a quick line of context on what's already been added to the PO, since
// otherwise it has no visibility into the rest of the line items at all.
// Plain text (not another banner) — sits in the footer's empty space next to
// Done, same "quiet info left, action right" pattern as the old bulk footer.
function LineItemsSummaryLine({ count, qty, totalUsd }) {
  // Empty (not null) even with nothing to show — keeps this as the first
  // flex child so `justify-between` still pins Done to the right.
  if (!count) return <span />
  return (
    <span className="text-[11px] text-gray-500">
      <span className="font-semibold text-gray-700">{count}</span> item{count === 1 ? '' : 's'} added · <span className="font-semibold text-gray-700">{fmtQty(qty)}</span> units · <span className="font-semibold text-gray-700">{fmtMoney(totalUsd, 'USD')}</span> total
    </span>
  )
}

// Fields for one item in the form, plus its own inline Save + Remove/Cancel
// at the row's end — the form can hold several of these at once ("+ Add
// another item"), each saving independently rather than one bulk action.
function LineItemEditFields({ row, skus, onChange, onSave, onDismiss, impliedRate, poCurrency, piFileUrl, productDetailsFileUrl, poFileUrl, buyerOrgId, vendorId, memberId, canCreateSkus, onSkuCreated }) {
  const { invalidate } = useSkuCache()
  const [query, setQuery]   = useState(row.sku_ref)
  const [open, setOpen]     = useState(false)
  // Opens SkuReviewDrawer stacked on top of PoDrawer, prefilled with
  // whatever's typed — for when the ref doesn't match any existing SKU.
  const [creatingSku, setCreatingSku] = useState(false)

  const filtered = query.trim()
    ? skus.filter(s => s.buyer_sku_ref?.toLowerCase().startsWith(query.toLowerCase())).slice(0, 20)
    : []

  const select = (sku) => {
    onChange({ ...row, skuId: sku.id, sku_ref: sku.buyer_sku_ref, sku_variant: sku.sku_variant ?? '', unit_price: sku.base_price ?? '', saved: false, saveError: null })
    setQuery(sku.buyer_sku_ref)
    setOpen(false)
  }

  // Same population shape as picking an existing SKU (`select`, above) —
  // the newly created SKU behaves identically once it exists.
  const handleSkuCreated = (rowId, skuId, fields) => {
    onChange({ ...row, skuId, sku_ref: fields.buyer_sku_ref, sku_variant: fields.colour || '', unit_price: fields.base_price ?? '', saved: false, saveError: null })
    setQuery(fields.buyer_sku_ref)
    invalidate(buyerOrgId)
    onSkuCreated?.()
    setCreatingSku(false)
    setOpen(false)
  }

  const handleQuery = (val) => {
    setQuery(val)
    setOpen(true)
    // Clear matched sku if user edits after selecting
    onChange({ ...row, skuId: null, sku_ref: val, sku_variant: val ? row.sku_variant : '', unit_price: val ? row.unit_price : '', saved: false, saveError: null })
  }

  const canSave = row.sku_ref.trim() && row.quantity && row.unit_price

  // Ordered value = qty × unit price, always in the PO's own currency (every
  // line item shares it — po_line_items has no currency column of its own,
  // and picking a different one per row was never actually persisted).
  // USD uses the rate implied by this PO's own amount/amount_usd (not a
  // live rate), so line items always foot to the PO total instead of
  // drifting from it.
  const qtyNum   = parseFloat(row.quantity)
  const priceNum = parseFloat(row.unit_price)
  const hasValue = !Number.isNaN(qtyNum) && !Number.isNaN(priceNum)
  const valueOriginal = hasValue ? qtyNum * priceNum : null
  const valueUsd = orderedValueUsd(row.quantity, row.unit_price, impliedRate)
  const currency = poCurrency || 'USD'

  return (
    <div className="py-3">
    <div className="flex items-center gap-4">
      {/* SKU autocomplete */}
      <div className={`relative ${COL_SKU} min-w-0 flex-shrink-0`}>
        <input
          type="text"
          value={query}
          onChange={e => handleQuery(e.target.value)}
          onFocus={() => query.trim() && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Required"
          className={`w-full ${underlineInputCls}`}
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-[130] top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filtered.map(s => (
              <button key={s.id} type="button" onMouseDown={() => select(s)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-100 last:border-0 cursor-pointer">
                <div className="font-semibold text-gray-900">{s.buyer_sku_ref}</div>
                {(s.sku_variant || s.description) && (
                  <div className="text-gray-500 mt-0.5">{[s.sku_variant, s.description].filter(Boolean).join(' · ')}</div>
                )}
              </button>
            ))}
          </div>
        )}
        {/* No existing SKU matches this ref — offer to create one inline
            instead of leaving the reviewer stuck. Only for whoever already
            has SKU-create rights (same bar as the old "Create SKUs" banner). */}
        {open && filtered.length === 0 && query.trim() && canCreateSkus && (
          <div className="absolute z-[130] top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            <button type="button" onMouseDown={() => { setCreatingSku(true); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 cursor-pointer">
              + Create new SKU "{query.trim()}"
            </button>
          </div>
        )}
      </div>

      {/* Variant — read-only, filled from SKU selection */}
      <div className={`${COL_VARIANT} flex-shrink-0`}>
        {row.sku_variant
          ? <span className="inline-block max-w-full truncate px-2 py-1 rounded-md bg-gray-100 text-gray-600 text-xs font-semibold">{row.sku_variant}</span>
          : <span className="block text-xs text-gray-400 pb-1 border-b-2 border-transparent">—</span>}
      </div>

      {/* Qty */}
      <input type="number" min="0" value={row.quantity}
        onChange={e => onChange({ ...row, quantity: e.target.value, saved: false, saveError: null })}
        placeholder="0"
        className={`${COL_QTY} flex-shrink-0 ${underlineInputCls}`} />

      {/* Unit Price — always in the PO's own currency (every line item
          shares it, no per-row override); the one spot color carries real
          meaning rather than just decorating a column */}
      <div className={`${COL_PRICE} flex-shrink-0 flex items-baseline gap-1.5`}>
        <input type="number" min="0" step="0.01" value={row.unit_price}
          onChange={e => onChange({ ...row, unit_price: e.target.value, saved: false, saveError: null })}
          placeholder="0.00"
          className={`w-full min-w-0 text-emerald-700 focus:border-emerald-500 ${underlineInputCls}`} />
        <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wide flex-shrink-0 pb-1">{currency}</span>
      </div>

      {/* Ordered value = qty × unit price — USD first (via the PO's own implied
          rate), original currency underneath when it isn't already USD */}
      <div className={`${COL_VALUE} flex-shrink-0`}>
        <div className="text-xs font-bold text-gray-900 whitespace-nowrap">
          {valueUsd != null ? fmtMoney(valueUsd, 'USD') : '—'}
        </div>
        {hasValue && currency !== 'USD' && (
          <div className="text-[10px] text-gray-400 whitespace-nowrap">{fmtMoney(valueOriginal, currency)}</div>
        )}
      </div>

      {/* Save — flips to a "Saved" pill until the row is edited again */}
      {row.saved ? (
        <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wide flex-shrink-0 whitespace-nowrap">
          Saved
        </span>
      ) : (
        <button type="button" onClick={onSave} disabled={!canSave}
          className="px-2.5 py-1 rounded-md bg-gray-900 text-white text-[10px] font-bold uppercase tracking-wide hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-gray-900 transition-colors flex-shrink-0 whitespace-nowrap cursor-pointer disabled:cursor-not-allowed">
          Save
        </button>
      )}

      {/* Remove (discards an unsaved draft) / Cancel (stops editing an existing item, no changes applied) */}
      <button type="button" onClick={onDismiss} title={row.isDraft ? 'Remove item' : 'Stop editing'}
        className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 cursor-pointer">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
    {row.saveError && (
      <p className="mt-1.5 text-[11px] text-red-600">{row.saveError}</p>
    )}
    {creatingSku && (
      <SkuReviewDrawer
        row={{ rowId: null, status: 'pending_review', confirmed: { buyer_sku_ref: query }, needsConfirm: {}, needsInput: {} }}
        buyerOrgId={buyerOrgId}
        vendorId={vendorId}
        memberId={memberId}
        piFileUrl={piFileUrl}
        productDetailsFileUrl={productDetailsFileUrl}
        poFileUrl={poFileUrl}
        nested
        onClose={() => setCreatingSku(false)}
        onSaved={handleSkuCreated}
      />
    )}
    </div>
  )
}

// Maps a line item (draft placeholder or a real po_line_items row) into the
// form's editable field shape. `itemId` carries whichever id (draft or real)
// LineItemForm's onSave uses to know which item in the table to update.
// Existing items start `saved` (they're already in the table); a fresh draft
// starts unsaved so its Save button is the enabled one to begin with.
function rowFromItem(li) {
  return {
    itemId: li.id,
    isDraft: !!li.isDraft,
    skuId: li.sku_id ?? null,
    sku_ref: li.buyer_sku_ref || '',
    sku_variant: li.sku_variant || '',
    quantity: li.quantity_ordered || '',
    unit_price: li.unit_price ?? '',
    saved: !li.isDraft,
    saveError: null,
  }
}

// Holds one or more items being added/edited in one sitting — each row saves
// itself independently ("+ Add another item" appends a fresh blank one right
// after the last), and "Done" just closes the form once everything's saved.
function LineItemForm({ po, item, onCancel, onSave, onRemoveDraft, onAddDraft, totalOrderedUsd, savedItemCount, totalOrderedQty, memberId, canCreateSkus, skuVersion }) {
  const { getSkus }  = useSkuCache()
  const [skus, setSkus]   = useState([])
  const [rows, setRows]   = useState(() => [rowFromItem(item)])
  const [skuLoading, setSkuLoading] = useState(false)
  // Bumped by a row's own inline "+ Create new SKU" (handleSkuCreated) — that
  // flow already invalidates the shared cache, but this form fetched its
  // `skus` list once on mount, so without this the newly-created SKU stays
  // invisible to every OTHER row for the rest of this form's session.
  const [localSkuVersion, setLocalSkuVersion] = useState(0)
  const impliedRate = impliedRateFor(po)
  const piUrl = po?.pi_file_url ? publicUrl(po.pi_file_url) : null
  const productDetailsUrl = po?.product_details_file_url ? publicUrl(po.product_details_file_url) : null
  const poDocUrl = po?.po_file_url ? publicUrl(po.po_file_url) : null

  useEffect(() => {
    if (!po?.buyer_org_id) return
    setSkuLoading(true)
    getSkus(po.buyer_org_id).then(data => { setSkus(data); setSkuLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po?.buyer_org_id, skuVersion, localSkuVersion])

  const updateRow = (idx, updated) => setRows(prev => prev.map((r, i) => i === idx ? updated : r))
  // Must register the new draft with the parent's localLineItems (same as
  // handleAddItem does for the form's first item) — handleSaveItem relies
  // on finding it there to know this is an insert, not an update.
  const addRow = () => {
    const draft = newDraftItem()
    onAddDraft(draft)
    setRows(prev => [...prev, rowFromItem(draft)])
  }

  // onSave resolves { error } on rejection (e.g. would exceed the PO amount,
  // or the save RPC itself failing), or { id } on success — `id` is the row's
  // real DB id (unchanged on an update, newly assigned on a first insert) so
  // a second save on the same row goes through the update path, not another insert.
  const handleSaveRow = async (idx) => {
    const row = rows[idx]
    const { error, id } = await onSave(row)
    if (error) { updateRow(idx, { ...row, saveError: error }); return }
    updateRow(idx, { ...row, itemId: id ?? row.itemId, isDraft: false, saved: true, saveError: null })
  }

  // Removing a draft also drops its placeholder from the table; removing an
  // existing item just stops editing it here (nothing was changed since
  // edits only apply on Save). Removing the last row closes the form.
  const handleRemoveRow = (idx) => {
    const row = rows[idx]
    if (row.isDraft) onRemoveDraft(row.itemId)
    const next = rows.filter((_, i) => i !== idx)
    if (next.length === 0) { onCancel(); return }
    setRows(next)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header — field labels now live inline on each row */}
      <div className="flex items-center gap-2 px-5 pt-4 pb-2 flex-shrink-0 bg-gray-100">
        <span className="text-sm font-bold text-gray-900">SKU Items</span>
      </div>

      {/* Skip when this is the first item ever being added — "the full amount
          is unallocated" is obvious with nothing saved yet */}
      {savedItemCount > 0 && <LineItemsTotalBanner totalUsd={totalOrderedUsd} poAmountUsd={po?.amount_usd} />}

      {/* Column subheader — full width, flush against the header above; not
          part of the scroll area below, so it's always visible without needing sticky */}
      <div className="flex items-center gap-4 px-5 py-2 flex-shrink-0 bg-gray-50 border-b border-gray-100">
        <div className={`${COL_SKU} flex-shrink-0 text-[9px] font-bold text-gray-600 uppercase tracking-wide`}>SKU Ref</div>
        <div className={`${COL_VARIANT} flex-shrink-0 text-[9px] font-bold text-gray-600 uppercase tracking-wide`}>Variant</div>
        <div className={`${COL_QTY} flex-shrink-0 text-[9px] font-bold text-gray-600 uppercase tracking-wide`}>Qty</div>
        <div className={`${COL_PRICE} flex-shrink-0 text-[9px] font-bold text-gray-600 uppercase tracking-wide`}>Unit Price</div>
        <div className={`${COL_VALUE} flex-shrink-0 text-[9px] font-bold text-gray-600 uppercase tracking-wide`}>Order Value</div>
        <div className="w-12 flex-shrink-0" />
        <div className="w-6 flex-shrink-0" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-2 bg-white divide-y divide-gray-100">
        {skuLoading && (
          <p className="text-xs text-gray-400 py-2">Loading SKUs…</p>
        )}
        {!skuLoading && !po?.buyer_org_id && (
          <p className="text-xs text-amber-600 py-2">Buyer info missing — SKU suggestions unavailable.</p>
        )}

        {rows.map((row, idx) => (
          <LineItemEditFields
            key={row.itemId}
            row={row}
            skus={skus}
            onChange={updated => updateRow(idx, updated)}
            onSave={() => handleSaveRow(idx)}
            onDismiss={() => handleRemoveRow(idx)}
            impliedRate={impliedRate}
            poCurrency={po?.currency}
            piFileUrl={piUrl}
            productDetailsFileUrl={productDetailsUrl}
            poFileUrl={poDocUrl}
            buyerOrgId={po?.buyer_org_id}
            vendorId={po?.supplier_org_id}
            memberId={memberId}
            canCreateSkus={canCreateSkus}
            onSkuCreated={() => setLocalSkuVersion(v => v + 1)}
          />
        ))}

        {/* Only relevant when this session started from "+ Add Item" — a plain
            edit of an existing item has nothing to do with adding more, and
            the save-time validation already blocks going over the PO amount
            without needing a proactive prompt here. */}
        {item.isDraft && (
          isFullyAllocated(totalOrderedUsd, po?.amount_usd) ? (
            <span className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-emerald-500 text-emerald-700 text-[11px] font-semibold">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Line items match the PO amount — edit the PO's details to add more
            </span>
          ) : (
            <button type="button" onClick={addRow}
              className="flex items-center gap-1.5 mt-2 text-[11px] font-semibold text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add another item
            </button>
          )
        )}
      </div>

      {/* Footer — each row saves itself, so this just closes the form */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-white flex-shrink-0">
        <LineItemsSummaryLine count={savedItemCount} qty={totalOrderedQty} totalUsd={totalOrderedUsd} />
        <button type="button" onClick={onCancel}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 transition-colors cursor-pointer">
          Done
        </button>
      </div>
    </div>
  )
}

// ── Main Drawer ───────────────────────────────────────────────────────────────

export default function PoDrawer({ po, onClose, showReceivedBy, showErpStatus }) {
  const dept     = useOrgDepartment()
  const memberId = useMemberId()
  const navigate = useNavigate()
  const { invalidate: invalidateSkuCache } = useSkuCache()
  // Matches confirm_sku_import_row's own authorization check (sql/sku_import.sql)
  // — no canEdit/role check, department-only, same as every SKU-write RPC.
  const canCreateSkus = dept === 'erp' || dept === 'tech' || dept === 'it' || !dept
  // Deliberately the same bar as canCreateSkus — whoever can create a SKU for
  // this PO can also add/edit it as a line item; splitting the two gates left
  // canCreateSkus-only users (e.g. dept='it') stranded with no way to link a
  // SKU to a line item at all.
  const canAddLineItems = canCreateSkus
  // Merchandising + tech's own request-a-correction action — separate bar
  // from canCreateSkus/canAddLineItems above (erp/tech/it), since cancelling
  // quantity is a merchandising/tech call, not a SKU-data-entry one.
  const isMerch = dept === 'merchandising'
  const isTech  = dept === 'tech' || dept === 'it'
  const canCancelQty = isMerch || isTech

  const [editMode, setEditMode]           = useState(false)
  const [editingItem, setEditingItem]     = useState(null) // the li (draft or real) currently open in LineItemForm
  const [localLineItems, setLocalLineItems] = useState([]) // po.po_line_items + any local drafts/edits — nothing persists yet
  const [piComments, setPiComments] = useState([])
  const [qaComments, setQaComments] = useState([])
  const [advancePayments, setAdvancePayments] = useState([])
  // Cancel-quantity request modal (shared with the Quality module — see
  // CancelQuantityModal.jsx) — keyed by line item id -> pending otif_exceptions
  // row, so every row's button can show its own "already pending" state.
  const [cancelQtyLineItem, setCancelQtyLineItem] = useState(null)
  // Bulk version — several checked rows sharing one reason/proof (see
  // CancelOrderModal.jsx's `selectedLineItems` prop), triggered from
  // LineItemsTable's own "Cancel Selected" bar.
  const [bulkCancelLineItems, setBulkCancelLineItems] = useState(null)
  const [pendingCancellations, setPendingCancellations] = useState({})
  const { fetchPendingCancellations } = usePendingLineItemCancellations()
  const [creatingStandaloneSku, setCreatingStandaloneSku] = useState(false)
  // Bumped whenever a SKU is created/edited from outside LineItemForm's own
  // tree (standalone "+ Create SKU", or edit-existing-from-line-item) — an
  // already-mounted LineItemForm fetched its `skus` list once on mount, so
  // invalidating the shared cache alone doesn't refresh it; this forces that
  // effect to re-run and pick up the newly-invalidated (so freshly-fetched) list.
  const [skuVersion, setSkuVersion] = useState(0)
  // Set when a line item's own SKU ref is clicked — lets a reviewer view (and
  // from there, edit) that SKU's full catalog record (weight/dimensions/
  // barcode/material, not just this PO's quantity/price) right from the line
  // items table, instead of having to go to Item Master and search for it.
  // Opens read-only first (SkuDetailDrawer), same as Item Master's own click
  // behavior — a plain row click is a lower-friction gesture than an
  // explicit Edit button, so jumping straight into an editable form would
  // risk accidental changes. `viewingSku` holds the raw fetched skus row;
  // `editingSkuRow` (built from it, no refetch) only gets set once its own
  // Edit button is clicked.
  const [viewingSku, setViewingSku] = useState(null)
  const [editingSkuRow, setEditingSkuRow] = useState(null)
  const [loadingSkuEditId, setLoadingSkuEditId] = useState(null)
  // Which reference doc (if any) the header's PO Doc/PI Doc/Product Details
  // chips are currently previewing — 'po' | 'pi' | 'productDetails' | null.
  // One shared toggle for all three instead of each having its own, so
  // there's a single in-page preview panel rather than the line items
  // table/form each having their own separate "View PI" button duplicating
  // what the header chip already does.
  const [previewDoc, setPreviewDoc] = useState(null)
  // Most recent sku_import_batches row for this PO, if any — set either by
  // the manual "Create SKUs" upload flow, or automatically by the
  // product-details-uploaded webhook the moment a product sheet is attached
  // (see shopify-backend/routes/databaseWebhooks.js). Drives whether the
  // callout below says "Review SKUs" (batch already exists) or falls back
  // to "Create SKUs" (nothing parsed yet).
  const [existingBatch, setExistingBatch] = useState(null)

  // Local-only overrides for the PO's own header fields (date/qty/amount/currency)
  // — same "stub shadows a read-only prop" shape as localLineItems above.
  // Nothing here writes back to the parent list/table or a backend.
  const [poOverride, setPoOverride]           = useState({})
  const [editingPoDetails, setEditingPoDetails] = useState(false)
  const [poDetailsDraft, setPoDetailsDraft]   = useState(null)

  // Reset and fetch both comment types when PO changes
  useEffect(() => {
    setEditMode(false)
    setEditingItem(null)
    setLocalLineItems(po?.po_line_items ?? [])
    setPiComments([])
    setQaComments([])
    setAdvancePayments([])
    setPoOverride({})
    setEditingPoDetails(false)
    setPoDetailsDraft(null)
    setExistingBatch(null)
    setCancelQtyLineItem(null)
    setPendingCancellations({})
    if (!po?.id) return

    const lineItemIds = (po.po_line_items ?? []).map(li => li.id)
    fetchPendingCancellations(lineItemIds).then(map => setPendingCancellations(Object.fromEntries(map)))

    supabase
      .from('po_comments')
      .select('id, comment, created_by, created_at')
      .eq('po_id', po.id)
      .eq('comment_type', 'PI_DELAY')
      .order('created_at', { ascending: true })
      .then(({ data }) => { if (data?.length) setPiComments(data) })

    supabase
      .from('po_comments')
      .select('id, comment, created_by, created_at')
      .eq('po_id', po.id)
      .eq('comment_type', 'QA_INSPECTION')
      .order('created_at', { ascending: true })
      .then(({ data }) => { if (data?.length) setQaComments(data) })

    supabase
      .from('po_advance_payments')
      .select('id, amount, currency, amount_usd, payment_date, reference_number, notes, created_on, submitted_by:organization_members ( full_name )')
      .eq('po_id', po.id)
      .order('payment_date', { ascending: true })
      .then(({ data }) => { if (data?.length) setAdvancePayments(data) })

    // Most recent — a PO shouldn't normally accumulate more than one, but
    // nothing dedupes that today, so this is a best-effort "the one to show".
    supabase
      .from('sku_import_batches')
      .select('id, status')
      .eq('po_id', po.id)
      .order('created_on', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setExistingBatch(data || null))
  }, [po?.id])

  if (!po) return null
  // Shadows the read-only `po` prop with any local header-field edits — same
  // "local stub over a prop" shape as localLineItems above. Nothing here
  // writes back to the parent list/table or a backend.
  const effectivePo   = { ...po, ...poOverride }
  const isConfirmed   = po.pi_confirmed === true || !!po.pi_file_url
  const hasQaComments = qaComments.length > 0
  const piUrl         = po.pi_file_url ? publicUrl(po.pi_file_url) : null
  const poDocUrl      = po.po_file_url ? publicUrl(po.po_file_url) : null
  const productDetailsUrl = po.product_details_file_url ? publicUrl(po.product_details_file_url) : null
  // Same width whether viewing or editing line items now — QA comments still
  // earn extra room since that's a whole extra column, not just wider fields.
  const drawerWidthPx = hasQaComments ? 920 : 710

  const impliedRate = impliedRateFor(effectivePo)
  const savedLineItems = localLineItems.filter(li => !li.isDraft)
  // Sum of already-saved (non-draft) line items' ordered value, in USD via
  // the PO-implied rate — the reference both the banner and the save-time
  // validation below compare against.
  const totalOrderedUsd = savedLineItems
    .reduce((sum, li) => sum + (orderedValueUsd(li.quantity_ordered, li.unit_price, impliedRate) ?? 0), 0)
  const totalOrderedQty = savedLineItems.reduce((sum, li) => sum + (li.quantity_ordered || 0), 0)
  // Once line items already sum to the PO's own amount, there's no room to
  // add another one regardless of whether more SKUs exist to create — the
  // save-time validation below blocks it either way — so prompting "create
  // SKUs for this PO" at that point is stale, not just redundant.
  const lineItemsFull = isFullyAllocated(totalOrderedUsd, effectivePo.amount_usd)
  // Product Details legitimately accepts PDF/DOC too (reference documents,
  // not just vendor sheets) — those just can't ever be auto-parsed for SKUs
  // (see parseWorkbook's file-signature check in shopify-backend's
  // skuItems.js). No point prompting "create SKUs from this file" for one
  // that will only ever fail — only relevant when there's no batch yet;
  // once one exists, reviewing it doesn't depend on the file type at all.
  const productSheetIsExcel = /\.(xlsx|xls)(\?|$)/i.test(po.product_details_file_url || '')

  const openEditItem    = (li) => { setEditingItem(li); setEditMode(true) }
  const handleCloseEdit = () => { setEditMode(false); setEditingItem(null) }

  // Jumps straight into editing the new item instead of dropping it into the
  // table as an inert "New item" row that needs a second Edit click — adding
  // an item and filling it in is one motion, not two.
  const handleAddItem = () => {
    const draft = newDraftItem()
    setLocalLineItems(prev => [...prev, draft])
    openEditItem(draft)
  }

  // Persists via save_po_line_item (sql/po_line_items_direct_save.sql) —
  // inserts a new row for a draft item, updates in place for an existing one.
  // Doesn't close the form — saving one item and then adding/editing another
  // in the same session is the point of the "+ Add another item" button below.
  // po_line_items has no `currency` column (confirmed against the live
  // schema) — the currency picker in the row editor stays a same-session-only
  // convenience for computing order_value_usd, same limitation this form
  // already had before line items were ever persisted at all.
  const savePoLineItem = async (row, isNew) => {
    const { data, error } = await supabase.rpc('save_po_line_item', {
      p_id: isNew ? null : row.itemId,
      p_po_id: po.id,
      p_sku_id: row.skuId || null,
      p_buyer_sku_ref: row.sku_ref,
      p_sku_variant: row.sku_variant || null,
      p_quantity_ordered: row.quantity === '' ? 0 : parseInt(row.quantity, 10),
      p_unit_price: row.unit_price === '' ? null : parseFloat(row.unit_price),
      p_order_value_usd: orderedValueUsd(row.quantity, row.unit_price, impliedRate),
      p_saved_by: memberId,
    })
    if (error) throw new Error(error.message)
    return data // real po_line_items id
  }

  // Validates first: line items can't sum to more than the PO's own amount.
  // Resolves { error } on rejection (nothing is applied/persisted), or { id }
  // on success — `id` is unchanged for an update, newly assigned for an
  // insert, so LineItemForm knows to update (not re-insert) on the next save.
  const handleSaveItem = async (row) => {
    const newValueUsd = orderedValueUsd(row.quantity, row.unit_price, impliedRate)
    const existing = localLineItems.find(li => li.id === row.itemId)
    if (effectivePo.amount_usd != null && newValueUsd != null) {
      const oldValueUsd = existing && !existing.isDraft
        ? (orderedValueUsd(existing.quantity_ordered, existing.unit_price, impliedRate) ?? 0)
        : 0
      const prospectiveTotal = totalOrderedUsd - oldValueUsd + newValueUsd
      if (prospectiveTotal > effectivePo.amount_usd + 0.01) {
        return { error: `This would bring line items to ${fmtMoney(prospectiveTotal, 'USD')}, over the PO's ${fmtMoney(effectivePo.amount_usd, 'USD')}.` }
      }
    }

    try {
      const id = await savePoLineItem(row, existing?.isDraft)
      setLocalLineItems(prev => prev.map(li => li.id !== row.itemId ? li : {
        ...li,
        id,
        sku_id: row.skuId || null,
        isDraft: false,
        buyer_sku_ref: row.sku_ref,
        sku_variant: row.sku_variant,
        unit_price: row.unit_price === '' ? null : parseFloat(row.unit_price),
        quantity_ordered: row.quantity === '' ? 0 : parseInt(row.quantity, 10),
        status: li.status || 'open',
      }))
      return { id }
    } catch (err) {
      return { error: err.message || 'Could not save this line item. Please try again.' }
    }
  }

  const handleRemoveDraft = (id) => {
    setLocalLineItems(prev => prev.filter(li => li.id !== id))
  }

  // "+ Add another item" inside an already-open LineItemForm — same
  // registration handleAddItem does for the session's first item, just
  // without also opening the form (it's already open). Skipping this
  // registration was the bug: handleSaveItem looks the row up in
  // localLineItems to decide insert-vs-update, and a draft it can't find
  // there falls through to "update", sending the fake client-side draft id
  // (e.g. "draft-2") to the DB as if it were a real uuid.
  const handleAddDraft = (draft) => {
    setLocalLineItems(prev => [...prev, draft])
  }

  // Fetches the full skus row fresh (po_line_items only carries a handful of
  // denormalized fields, not the full catalog record) and opens it read-only
  // first — a blank/unlinked row (no sku_id yet) has nothing to open.
  const handleOpenSkuView = async (li) => {
    if (!li.sku_id) return
    setLoadingSkuEditId(li.id)
    // Same relational joins StyleLibraryTab.jsx's own fetch uses — a bare
    // select('*') only returns the raw *_id columns, leaving
    // SkuDetailDrawer's Buyer/Category/Material/Created By fields blank
    // regardless of what's actually saved (no fallback for most of them).
    const { data: sku, error } = await supabase
      .from('skus')
      .select(`
        *,
        buyer:organizations!skus_buyer_org_id_fkey(display_name),
        category:categories(name),
        primary_material:material_options!primary_base_material_id(label),
        secondary_material:material_options!secondary_base_material_id(label),
        created_by:organization_members!created_by_member_id(full_name)
      `)
      .eq('id', li.sku_id)
      .single()
    setLoadingSkuEditId(null)
    if (error || !sku) return
    setViewingSku(sku)
  }

  // SkuDetailDrawer's own Edit button — builds the SkuReviewDrawer row from
  // the already-fetched sku (no refetch needed) and hands off to the same
  // directSkuId-driven edit mode Item Master's Edit flow uses.
  const handleEditFromSkuDetail = () => {
    setEditingSkuRow({
      rowId: null,
      status: 'confirmed',
      confirmed: skuToConfirmedFields(viewingSku),
      needsConfirm: {},
      needsInput: {},
      _sku: viewingSku,
    })
    setViewingSku(null)
  }

  // Swaps the meta grid's read-only tiles for inputs — draft starts from
  // whatever's currently in effect (the real po fields, or a prior local
  // override), so re-opening the editor doesn't lose an earlier local edit.
  const openEditPoDetails = () => {
    setPoDetailsDraft({
      po_received_date: effectivePo.po_received_date || '',
      quantity_ordered: effectivePo.quantity_ordered ?? '',
      amount: effectivePo.amount ?? '',
      currency: effectivePo.currency || 'USD',
    })
    setEditingPoDetails(true)
  }
  const handleCancelPoDetails = () => {
    setEditingPoDetails(false)
    setPoDetailsDraft(null)
  }

  // Uses the PO's own already-established rate (amount_usd / amount, pinned
  // to the original `po` prop so it never drifts across repeated edits)
  // rather than a fresh live-rate fetch — so nudging the amount doesn't also
  // nudge the USD conversion off whatever rate the PO was originally entered
  // at. Falls back to FALLBACK_RATES only when the PO had no rate to begin
  // with (e.g. amount_usd was never set).
  const handleSavePoDetails = () => {
    const draft = poDetailsDraft
    const amount = parseFloat(draft.amount)
    const rate = impliedRateFor(po) ?? FALLBACK_RATES[draft.currency] ?? 1
    const amountUsd = Number.isNaN(amount) ? null : Math.round(amount * rate * 100) / 100
    setPoOverride(prev => ({
      ...prev,
      po_received_date: draft.po_received_date || null,
      quantity_ordered: draft.quantity_ordered === '' ? null : parseInt(draft.quantity_ordered, 10),
      amount: Number.isNaN(amount) ? null : amount,
      currency: draft.currency,
      amount_usd: amountUsd,
    }))
    setEditingPoDetails(false)
    setPoDetailsDraft(null)
  }

  // Jump into the SKU Import tab with buyer/vendor preselected and the
  // already-uploaded product details file auto-fetched, so creating the new
  // SKUs this PO needs doesn't mean re-downloading and re-uploading the same
  // file (see SkuImportUploadModal's `prefill` handling).
  const handleCreateSkus = () => {
    const params = new URLSearchParams({
      tab: 'sku-import',
      prefillBuyer: po.buyer_org_id || '',
      prefillVendor: po.supplier_org_id || '',
      prefillBuyerName: po.buyer_name || '',
      prefillVendorName: po.supplier_name || '',
      prefillFile: publicUrl(po.product_details_file_url),
      prefillPo: po.po_number || '',
      prefillPoId: po.id || '',
    })
    onClose()
    navigate(`/dashboard/npd?${params.toString()}`)
  }

  // A batch already exists for this PO (created either by the manual upload
  // flow, or automatically by the product-details-uploaded webhook) — jump
  // straight into reviewing it, no upload step involved.
  const handleReviewSkus = () => {
    onClose()
    navigate(`/dashboard/npd?tab=sku-import&prefillBatch=${existingBatch.id}`)
  }

  return createPortal(
    <>
      {/* Backdrop — ignored while the line-item form is open, so an accidental
          click outside doesn't discard whatever's mid-entry */}
      <div className="fixed inset-0 z-[110] bg-black/55" onClick={editMode ? undefined : onClose} />

      {/* Panel — 820px normally, wider still when QA inspection comments exist (an extra column, not just wider fields) */}
      <div className={`fixed inset-y-0 right-0 z-[120] w-full bg-gray-100 shadow-2xl flex flex-col transition-all duration-200 ${hasQaComments ? 'sm:w-[920px]' : 'sm:w-[710px]'}`}>

        {/* ── Sticky header ───────────────────────────────────────────────── */}
        <div className="bg-white border-b border-gray-200 flex-shrink-0">

          {/* Title row */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div>
              <div className="text-base font-bold text-gray-900">PO {po.po_number || '—'}</div>
              <div className="text-xs text-gray-500 mt-0.5">{po.buyer_name || '—'} · {po.supplier_name || '—'}</div>
            </div>
            <div className="flex items-center gap-1 ml-4 flex-shrink-0">
              {canAddLineItems && !editingPoDetails && (
                <button type="button" onClick={openEditPoDetails} title="Edit PO details"
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
              )}
              <button type="button" onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 px-5 pb-3">
            <PiBadge confirmed={isConfirmed} />
            {showErpStatus && <ErpBadge synced={po.erp_synced === true} />}
          </div>

          {/* Meta grid — PO Date/Total Qty/Amount are locally editable (see
              poOverride); Ex-Factory stays read-only, it's a PI-stage field. */}
          <div>
            {editingPoDetails ? (
              <div className="grid grid-cols-4 gap-px bg-gray-100 border-t border-gray-100">
                <div className="bg-white px-3 py-2.5">
                  <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">PO Date</div>
                  <input type="date" value={poDetailsDraft.po_received_date}
                    onChange={e => setPoDetailsDraft(d => ({ ...d, po_received_date: e.target.value }))}
                    className="w-full mt-0.5 bg-transparent text-xs font-semibold text-gray-800 outline-none border-b-2 border-gray-300 pb-0.5 focus:border-gray-900 cursor-pointer" />
                </div>
                <div className="bg-white px-3 py-2.5">
                  <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Ex-Factory</div>
                  <div className="text-xs font-semibold text-gray-800 mt-0.5">
                    {po.exceptional_ex_factory_date || po.ex_factory_date || '—'}
                  </div>
                </div>
                <div className="bg-white px-3 py-2.5">
                  <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Total Qty</div>
                  <input type="number" min="0" value={poDetailsDraft.quantity_ordered}
                    onChange={e => setPoDetailsDraft(d => ({ ...d, quantity_ordered: e.target.value }))}
                    className="w-full mt-0.5 bg-transparent text-xs font-semibold text-gray-800 outline-none border-b-2 border-gray-300 pb-0.5 focus:border-gray-900" />
                </div>
                <div className="bg-white px-3 py-2.5">
                  <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Amount</div>
                  <div className="flex items-baseline gap-1.5">
                    <input type="number" min="0" step="0.01" value={poDetailsDraft.amount}
                      onChange={e => setPoDetailsDraft(d => ({ ...d, amount: e.target.value }))}
                      className="w-full min-w-0 mt-0.5 bg-transparent text-xs font-semibold text-emerald-700 outline-none border-b-2 border-gray-300 pb-0.5 focus:border-emerald-500" />
                    <select value={poDetailsDraft.currency}
                      onChange={e => setPoDetailsDraft(d => ({ ...d, currency: e.target.value }))}
                      className="text-[9px] font-bold text-emerald-600 uppercase tracking-wide bg-transparent border-none outline-none cursor-pointer flex-shrink-0">
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                      <option value="INR">INR</option>
                    </select>
                  </div>
                </div>

                <div className="col-span-4 bg-white px-3 py-2 flex items-center justify-end gap-2 border-t border-gray-100">
                  <button type="button" onClick={handleCancelPoDetails}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer">
                    Cancel
                  </button>
                  <button type="button" onClick={handleSavePoDetails}
                    className="px-3 py-1.5 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 transition-colors cursor-pointer">
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-px bg-gray-100 border-t border-gray-100">
                {[
                  { label: 'PO Date',     value: effectivePo.po_received_date },
                  { label: 'Ex-Factory', value: po.exceptional_ex_factory_date ? (
                    <span className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1">
                        <span className="text-amber-700 font-bold">{po.exceptional_ex_factory_date}</span>
                        <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 leading-none">EXC</span>
                      </span>
                      <span className="text-[10px] text-gray-400">orig: {po.ex_factory_date || '—'}</span>
                    </span>
                  ) : po.ex_factory_date },
                  { label: 'Total Qty',   value: fmtQty(effectivePo.quantity_ordered) },
                  { label: 'Amount', value: (
                    <span className="text-emerald-700 font-bold">
                      {fmt$(effectivePo.amount_usd ?? effectivePo.amount)}
                      {effectivePo.currency && effectivePo.currency !== 'USD' && (
                        <span className="text-gray-700 font-normal text-[10px] ml-1.5">
                          ({fmtOriginalAmount(effectivePo)})
                        </span>
                      )}
                    </span>
                  )},
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white px-3 py-2.5">
                    <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">{label}</div>
                    <div className="text-xs font-semibold text-gray-800 mt-0.5">{value || '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Documents + optional extra meta */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 border-t border-gray-100">
            <DocChip url={poDocUrl} label="PO Doc" onPreview={() => setPreviewDoc(d => d === 'po' ? null : 'po')} />
            <DocChip url={piUrl} label="PI Doc" onPreview={() => setPreviewDoc(d => d === 'pi' ? null : 'pi')} />
            <DocChip url={productDetailsUrl} label="Product Details" onPreview={() => setPreviewDoc(d => d === 'productDetails' ? null : 'productDetails')} />
            {showReceivedBy && po.received_by && (
              <span className="text-[11px] text-gray-400">
                Received by <span className="text-gray-700 font-medium">{po.received_by}</span>
              </span>
            )}
            {po.pi_received_date && (
              <span className="text-[11px] text-gray-400">
                PI on <span className="text-gray-700 font-medium">{po.pi_received_date}</span>
              </span>
            )}
            {/* Standalone SKU creation, independent of "+ Add Item" — that
                button (and the richer "+ Create new SKU" inside its row
                editor) is gated by canAddLineItems, a narrower bar than
                canCreateSkus (which has no canEdit/role check at all, same
                as confirm_sku_import_row's own auth). Someone who can create
                SKUs but not edit line items still needs a way in — this is
                that way, same gate the old navigate-away link used. Opens
                SkuReviewDrawer directly via createSkuDirect; doesn't touch
                po_line_items at all (same as the old flow, which never did
                either — line item persistence didn't exist before this). */}
            {!po.product_details_file_url && canCreateSkus && !lineItemsFull && (
              <button type="button" onClick={() => setCreatingStandaloneSku(true)}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors cursor-pointer">
                + Create SKU
              </button>
            )}
          </div>

          {/* New-SKU callout — shown whenever a product details file was
              attached with the PI, unless line items already match the PO
              amount (same reasoning as the fallback link above). Batch-aware:
              if the product-details-uploaded webhook (or a manual upload)
              already produced a batch for this PO, this goes straight to
              reviewing it instead of the upload flow — and disappears
              entirely once that batch is fully reviewed (`completed`). */}
          {po.product_details_file_url && canCreateSkus && !lineItemsFull && existingBatch?.status !== 'completed' && (existingBatch || productSheetIsExcel) && (
            <div className="mx-5 mb-3 flex items-center justify-between gap-3 px-3 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-500 flex-shrink-0">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
                </svg>
                <span className="text-[11px] text-indigo-800">
                  {existingBatch
                    ? 'SKUs found in your product sheet — review them before saving.'
                    : 'This PO includes new SKUs — create them before saving.'}
                </span>
              </div>
              {existingBatch ? (
                <button type="button" onClick={handleReviewSkus}
                  className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700 transition-colors cursor-pointer">
                  Review SKUs →
                </button>
              ) : (
                <button type="button" onClick={handleCreateSkus}
                  className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700 transition-colors cursor-pointer">
                  Create SKUs →
                </button>
              )}
            </div>
          )}

          {/* PI delay comments */}
          {piComments.length > 0 && (
            <div className="mx-5 mb-3 flex flex-col gap-1.5">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest px-0.5">PI Delay Reasons</div>
              {piComments.map(c => (
                <div key={c.id} className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 mt-0.5 flex-shrink-0">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[11px] text-amber-700">{c.comment}</span>
                    <span className="text-[10px] text-gray-400">
                      {c.created_by} · {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Advance payments received — see sql/po_advance_payments.sql,
              submitted from PoRecord.jsx's kebab menu. */}
          {advancePayments.length > 0 && (
            <div className="mx-5 mb-3 flex flex-col gap-1.5">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest px-0.5">Advance Payments</div>
              {advancePayments.map(p => (
                <div key={p.id} className="flex items-start gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-600 mt-0.5 flex-shrink-0">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.5 9a2.5 2.5 0 0 1 2.5-2c1.5 0 2.5 1 2.5 2s-1 1.5-2.5 2-2.5 1-2.5 2 1 2 2.5 2a2.5 2.5 0 0 0 2.5-2" />
                    <line x1="12" y1="6" x2="12" y2="7.2" /><line x1="12" y1="16.8" x2="12" y2="18" />
                  </svg>
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-emerald-800">
                        {fmtOriginalAmount({ amount: p.amount, currency: p.currency })}
                        {p.currency !== 'USD' && <span className="ml-1 font-normal text-emerald-600">({fmt$(p.amount_usd)})</span>}
                      </span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">
                        {new Date(p.payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    {p.reference_number && <span className="text-[10px] text-gray-500">Ref: {p.reference_number}</span>}
                    {p.notes && <span className="text-[11px] text-gray-600">{p.notes}</span>}
                    <span className="text-[10px] text-gray-400">Submitted by {titleCaseName(p.submitted_by?.full_name) || 'Unknown'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Notes banner */}
          {po.notes && (
            <div className="flex items-start gap-2 mx-5 mb-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 mt-0.5 flex-shrink-0">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="text-[11px] text-gray-600">{po.notes}</span>
            </div>
          )}
        </div>

        {/* ── Line items / Edit mode ───────────────────────────────────────── */}
        {editMode && editingItem ? (
          <LineItemForm
            po={effectivePo}
            item={editingItem}
            onCancel={handleCloseEdit}
            onSave={handleSaveItem}
            onRemoveDraft={handleRemoveDraft}
            onAddDraft={handleAddDraft}
            totalOrderedUsd={totalOrderedUsd}
            savedItemCount={savedLineItems.length}
            totalOrderedQty={totalOrderedQty}
            memberId={memberId}
            canCreateSkus={canCreateSkus}
            skuVersion={skuVersion}
          />
        ) : (
          <div className="flex-1 flex min-h-0 overflow-hidden">

            {/* Line items — always visible */}
            <LineItemsTable
              key={po.id}
              items={localLineItems}
              canEdit={canAddLineItems && isConfirmed}
              onAddItem={handleAddItem}
              onEditItem={openEditItem}
              onOpenSkuEdit={handleOpenSkuView}
              loadingSkuEditId={loadingSkuEditId}
              totalOrderedUsd={totalOrderedUsd}
              poAmountUsd={effectivePo.amount_usd}
              canCancelQty={canCancelQty}
              pendingCancellations={pendingCancellations}
              onCancelQty={setCancelQtyLineItem}
              onCancelSelected={setBulkCancelLineItems}
            />

            {/* QA Inspection comments — only when they exist */}
            {hasQaComments && (
              <div className="w-72 flex-shrink-0 border-l border-gray-200 overflow-y-auto px-4 py-4 bg-white">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">QA Inspection</span>
                  <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {qaComments.length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {qaComments.map(c => (
                    <div key={c.id} className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-gray-900 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {c.created_by?.charAt(0)?.toUpperCase() ?? 'Q'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-[11px] font-semibold text-gray-800 leading-none">{c.created_by}</span>
                          <span className="text-[10px] text-gray-400 leading-none">
                            {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-600 mt-1 whitespace-pre-wrap leading-relaxed">{c.comment}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

      </div>

      {previewDoc === 'po' && (
        <PiPreviewPanel url={poDocUrl} offsetRightPx={drawerWidthPx} title="PO Document" onClose={() => setPreviewDoc(null)} />
      )}
      {previewDoc === 'pi' && (
        <PiPreviewPanel url={piUrl} offsetRightPx={drawerWidthPx} title="PI Document" onClose={() => setPreviewDoc(null)} />
      )}
      {previewDoc === 'productDetails' && (
        <PiPreviewPanel url={productDetailsUrl} offsetRightPx={drawerWidthPx} title="Product Sheet" onClose={() => setPreviewDoc(null)} />
      )}

      {creatingStandaloneSku && (
        <SkuReviewDrawer
          row={{ rowId: null, status: 'pending_review', confirmed: {}, needsConfirm: {}, needsInput: {} }}
          buyerOrgId={po.buyer_org_id}
          vendorId={po.supplier_org_id}
          memberId={memberId}
          piFileUrl={piUrl}
          productDetailsFileUrl={productDetailsUrl}
          poFileUrl={poDocUrl}
          nested
          onClose={() => setCreatingStandaloneSku(false)}
          onSaved={() => { invalidateSkuCache(po.buyer_org_id); setSkuVersion(v => v + 1); setCreatingStandaloneSku(false) }}
        />
      )}

      {viewingSku && (
        <SkuDetailDrawer
          sku={viewingSku}
          piFileUrl={piUrl}
          productDetailsFileUrl={po.product_details_file_url ? publicUrl(po.product_details_file_url) : null}
          poFileUrl={po.po_file_url ? publicUrl(po.po_file_url) : null}
          nested
          onClose={() => setViewingSku(null)}
          onEdit={handleEditFromSkuDetail}
        />
      )}

      {editingSkuRow && (
        <SkuReviewDrawer
          row={editingSkuRow}
          directSkuId={editingSkuRow._sku.id}
          buyerOrgId={po.buyer_org_id}
          vendorId={po.supplier_org_id}
          memberId={memberId}
          piFileUrl={piUrl}
          productDetailsFileUrl={po.product_details_file_url ? publicUrl(po.product_details_file_url) : null}
          poFileUrl={po.po_file_url ? publicUrl(po.po_file_url) : null}
          nested
          onClose={() => setEditingSkuRow(null)}
          onSaved={() => { invalidateSkuCache(po.buyer_org_id); setSkuVersion(v => v + 1); setEditingSkuRow(null) }}
        />
      )}

      {cancelQtyLineItem && (
        <CancelQuantityModal
          lineItem={cancelQtyLineItem}
          pending={pendingCancellations[cancelQtyLineItem.id]}
          onClose={() => setCancelQtyLineItem(null)}
          onSubmitted={() => {
            fetchPendingCancellations([cancelQtyLineItem.id]).then(map =>
              setPendingCancellations(prev => ({ ...prev, [cancelQtyLineItem.id]: map.get(cancelQtyLineItem.id) || null }))
            )
          }}
        />
      )}

      {bulkCancelLineItems && (
        <CancelOrderModal
          po={effectivePo}
          pendingCancellations={pendingCancellations}
          selectedLineItems={bulkCancelLineItems}
          onClose={() => setBulkCancelLineItems(null)}
          onSubmitted={() => {
            fetchPendingCancellations(bulkCancelLineItems.map(li => li.id)).then(map =>
              setPendingCancellations(prev => ({ ...prev, ...Object.fromEntries(map) }))
            )
          }}
        />
      )}
    </>,
    document.body
  )
}
