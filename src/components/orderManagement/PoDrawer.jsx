import { createPortal } from 'react-dom'
import { useState, useEffect } from 'react'
import { useCanEdit, useOrgDepartment } from '../../stores/profileStore'
import { useSkuCache } from '../../hooks/useSkuCache'
import { publicUrl, fmt$, fmtOriginalAmount, fmtQty, PiBadge, ErpBadge, DocChip } from './poUtils'
import { supabase } from '../../lib/supabase'

// Status colour map for line item cards
const STATUS_STYLE = {
  open:      { strip: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-800' },
  shipped:   { strip: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800' },
  cancelled: { strip: 'bg-red-400',     badge: 'bg-red-100 text-red-700' },
  confirmed: { strip: 'bg-blue-400',    badge: 'bg-blue-100 text-blue-800' },
}
function statusStyle(s) {
  return STATUS_STYLE[s?.toLowerCase()] ?? { strip: 'bg-gray-300', badge: 'bg-gray-100 text-gray-600' }
}

// Progress bar: shipped / ordered
function ShipProgress({ ordered, shipped }) {
  if (!ordered) return null
  const pct = Math.min(100, Math.round(((shipped ?? 0) / ordered) * 100))
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-800 whitespace-nowrap flex-shrink-0">{pct}% shipped</span>
    </div>
  )
}

// Single line item card
function LineItemCard({ li }) {
  const { strip, badge } = statusStyle(li.status)
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
      {/* Left colour strip */}
      <div className={`w-1 flex-shrink-0 ${strip}`} />

      <div className="flex-1 px-3 py-2.5 space-y-2">
        {/* Title + badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold text-gray-900 truncate">{li.buyer_sku_ref || '—'}</span>
            {li.sku_variant && (
              <span className="text-[11px] text-gray-600 truncate">{li.sku_variant}</span>
            )}
          </div>
          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap flex-shrink-0 ${badge}`}>
            {li.status || '—'}
          </span>
        </div>

        {/* Progress */}
        <ShipProgress ordered={li.quantity_ordered} shipped={li.shipped_quantity} />

        {/* Metrics row */}
        <div className="grid grid-cols-3 divide-x divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
          {[
            { label: 'Ordered', qty: li.quantity_ordered, val: li.order_value_usd },
            { label: 'Shipped', qty: li.shipped_quantity, val: li.shipped_value_usd },
            { label: 'Balance', qty: li.balance_quantity, val: li.balance_value_usd },
          ].map(({ label, qty, val }) => (
            <div key={label} className="px-2.5 py-2 bg-gray-50">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</div>
              <div className="text-sm font-bold text-gray-900 leading-none">{fmtQty(qty)}</div>
              <div className="text-xs font-semibold text-gray-600 mt-0.5">{fmt$(val)}</div>
            </div>
          ))}
        </div>

        {/* Footer — unit price + dates */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 border-t border-gray-100">
          {li.unit_price != null && (
            <div>
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Unit Price</div>
              <div className="text-xs font-bold text-gray-900">${li.unit_price}</div>
            </div>
          )}
          {li.target_date && (
            <div>
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Target Ship</div>
              <div className="text-xs font-bold text-gray-900">{li.target_date}</div>
            </div>
          )}
          {li.shipped_date && li.shipped_quantity > 0 && (
            <div>
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Actual Ship</div>
              <div className="text-xs font-bold text-gray-900">{li.shipped_date}</div>
            </div>
          )}
          {li.cancelled_quantity > 0 && (
            <div>
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Cancelled</div>
              <div className="text-xs font-bold text-red-600">{fmtQty(li.cancelled_quantity)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Line Item Form (ERP add-items mode) ───────────────────────────────────────

let _rowId = 0
function newRow(defaultDate = '') {
  return { _id: ++_rowId, skuId: null, sku_ref: '', sku_variant: '', quantity: '', unit_price: '', target_date: defaultDate }
}

function LineItemRow({ row, skus, onChange, onRemove, canRemove }) {
  const [query, setQuery]   = useState(row.sku_ref)
  const [open, setOpen]     = useState(false)

  const filtered = query.trim()
    ? skus.filter(s => s.buyer_sku_ref?.toLowerCase().startsWith(query.toLowerCase())).slice(0, 20)
    : []

  const select = (sku) => {
    onChange({ ...row, skuId: sku.id, sku_ref: sku.buyer_sku_ref, sku_variant: sku.sku_variant ?? '', unit_price: sku.base_price ?? '' })
    setQuery(sku.buyer_sku_ref)
    setOpen(false)
  }

  const handleQuery = (val) => {
    setQuery(val)
    setOpen(true)
    // Clear matched sku if user edits after selecting
    onChange({ ...row, skuId: null, sku_ref: val, sku_variant: val ? row.sku_variant : '', unit_price: val ? row.unit_price : '' })
  }

  return (
    <div className="flex items-start gap-2">
      {/* SKU autocomplete */}
      <div className="relative w-24 min-w-0">
        <input
          type="text"
          value={query}
          onChange={e => handleQuery(e.target.value)}
          onFocus={() => query.trim() && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="SKU ref *"
          className="w-20 px-2.5 py-1.5 text-xs text-black border border-gray-500 rounded-lg focus:outline-none focus:border-gray-900 placeholder:text-gray-400"
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-[130] top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filtered.map(s => (
              <button key={s.id} type="button" onMouseDown={() => select(s)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-100 last:border-0">
                <div className="font-semibold text-gray-900">{s.buyer_sku_ref}</div>
                {(s.sku_variant || s.description) && (
                  <div className="text-gray-500 mt-0.5">{[s.sku_variant, s.description].filter(Boolean).join(' · ')}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Variant — read-only, filled from SKU selection */}
      <input type="text" value={row.sku_variant} readOnly placeholder="Variant"
        className="w-36 px-2.5 py-1.5 text-xs border border-gray-500 rounded-lg bg-white text-black placeholder:text-gray-400 cursor-default" />

      {/* Qty */}
      <input type="number" min="0" value={row.quantity}
        onChange={e => onChange({ ...row, quantity: e.target.value })}
        placeholder="Qty *"
        className="w-20 px-2.5 py-1.5 text-xs border border-gray-500 rounded-lg text-black bg-white focus:outline-none focus:border-gray-900 placeholder:text-gray-400" />

      {/* Unit $ */}
      <input type="number" min="0" step="0.01" value={row.unit_price}
        onChange={e => onChange({ ...row, unit_price: e.target.value })}
        placeholder="$ *"
        className="w-16 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 placeholder:text-gray-300" />

      {/* Target date */}
      <input type="date" value={row.target_date}
        onChange={e => onChange({ ...row, target_date: e.target.value })}
        className="w-32 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900" />

      {/* Remove */}
      <button type="button" onClick={onRemove} disabled={!canRemove}
        className="w-6 h-6 mt-0.5 flex items-center justify-center rounded-md text-gray-300 hover:text-red-400 disabled:opacity-0 transition-colors flex-shrink-0">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

function LineItemForm({ po, onCancel }) {
  const { getSkus }  = useSkuCache()
  const [skus, setSkus]   = useState([])
  const [rows, setRows]   = useState(() => [newRow(po?.ex_factory_date ?? '')])
  const [skuLoading, setSkuLoading] = useState(false)

  useEffect(() => {
    if (!po?.buyer_org_id) return
    setSkuLoading(true)
    getSkus(po.buyer_org_id).then(data => { setSkus(data); setSkuLoading(false) })
  }, [po?.buyer_org_id])

  const updateRow = (id, updated) => setRows(prev => prev.map(r => r._id === id ? updated : r))
  const removeRow = (id) => setRows(prev => prev.filter(r => r._id !== id))
  const addRow    = () => setRows(prev => [...prev, newRow(po?.ex_factory_date ?? '')])

  const canSave = rows.every(r => r.sku_ref.trim() && r.quantity && r.unit_price)

  const save = () => {
    console.log('[LineItemForm] save rows:', rows)
    onCancel()
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Column header */}
      <div className="flex items-center gap-2 px-5 pt-4 pb-1 flex-shrink-0">
        <div className="w-28 text-[9px] font-bold text-gray-800 uppercase tracking-widest">SKU Ref</div>
        <div className="w-28 text-[9px] font-bold text-gray-800 uppercase tracking-widest">Variant</div>
        <div className="w-24 text-[9px] font-bold text-gray-800 uppercase tracking-widest">Quantity</div>
        <div className="w-16 text-[9px] font-bold text-gray-800 uppercase tracking-widest">Unit $</div>
        <div className="w-32 text-[9px] font-bold text-gray-800 uppercase tracking-widest">Target Date</div>
        <div className="w-6" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-2 space-y-2">
        {skuLoading && (
          <p className="text-xs text-gray-400 py-2">Loading SKUs…</p>
        )}
        {!skuLoading && !po?.buyer_org_id && (
          <p className="text-xs text-amber-600 py-2">Buyer info missing — SKU suggestions unavailable.</p>
        )}

        {rows.map(row => (
          <LineItemRow
            key={row._id}
            row={row}
            skus={skus}
            onChange={updated => updateRow(row._id, updated)}
            onRemove={() => removeRow(row._id)}
            canRemove={rows.length > 1}
          />
        ))}

        <button type="button" onClick={addRow}
          className="flex items-center gap-1.5 mt-2 text-[11px] font-semibold text-gray-400 hover:text-gray-700 transition-colors">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add SKU
        </button>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-white flex-shrink-0">
        <button type="button" onClick={onCancel}
          className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={!canSave}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40 transition-colors">
          Save Line Items
        </button>
      </div>
    </div>
  )
}

// ── Main Drawer ───────────────────────────────────────────────────────────────

export default function PoDrawer({ po, onClose, showReceivedBy, showErpStatus }) {
  const canEdit = useCanEdit()
  const dept    = useOrgDepartment()
  const canAddLineItems = canEdit && dept === 'erp'

  const [editMode, setEditMode]     = useState(false)
  const [piComments, setPiComments] = useState([])
  const [qaComments, setQaComments] = useState([])

  // Reset and fetch both comment types when PO changes
  useEffect(() => {
    setEditMode(false)
    setPiComments([])
    setQaComments([])
    if (!po?.id) return

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
  }, [po?.id])

  if (!po) return null
  const isConfirmed   = po.pi_confirmed === true || !!po.pi_file_url
  const lineItems     = po.po_line_items ?? []
  const hasQaComments = qaComments.length > 0

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[110] bg-black/25" onClick={onClose} />

      {/* Panel — widens when QA inspection comments exist */}
      <div className={`fixed inset-y-0 right-0 z-[120] w-full bg-gray-100 shadow-2xl flex flex-col transition-all duration-200 ${hasQaComments ? 'sm:w-[920px]' : 'sm:w-[600px]'}`}>

        {/* ── Sticky header ───────────────────────────────────────────────── */}
        <div className="bg-white border-b border-gray-200 flex-shrink-0">

          {/* Title row */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div>
              <div className="text-base font-bold text-gray-900">PO {po.po_number || '—'}</div>
              <div className="text-xs text-gray-500 mt-0.5">{po.buyer_name || '—'} · {po.supplier_name || '—'}</div>
            </div>
            <button type="button" onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors ml-4 flex-shrink-0 cursor-pointer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 px-5 pb-3">
            <PiBadge confirmed={isConfirmed} />
            {showErpStatus && <ErpBadge synced={po.erp_synced === true} />}
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-4 gap-px bg-gray-100 border-t border-gray-100">
            {[
              { label: 'PO Date',     value: po.po_received_date },
              { label: 'Ex-Factory', value: po.exceptional_ex_factory_date ? (
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1">
                    <span className="text-amber-700 font-bold">{po.exceptional_ex_factory_date}</span>
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 leading-none">EXC</span>
                  </span>
                  <span className="text-[10px] text-gray-400">orig: {po.ex_factory_date || '—'}</span>
                </span>
              ) : po.ex_factory_date },
              { label: 'Total Qty',   value: fmtQty(po.quantity_ordered) },
              { label: 'Amount', value: (
                <span className="text-emerald-700 font-bold">
                  {fmt$(po.amount_usd ?? po.amount)}
                  {po.currency && po.currency !== 'USD' && (
                    <span className="text-gray-700 font-normal text-[10px] ml-1.5">
                      ({fmtOriginalAmount(po)})
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

          {/* Documents + optional extra meta */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 border-t border-gray-100">
            <DocChip url={publicUrl(po.po_file_url)} label="PO Doc" />
            <DocChip url={publicUrl(po.pi_file_url)} label="PI Doc" />
            <DocChip url={publicUrl(po.product_details_file_url)} label="Product Details" />
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
          </div>

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
        {editMode ? (
          <LineItemForm po={po} onCancel={() => setEditMode(false)} />
        ) : (
          <div className="flex-1 flex min-h-0 overflow-hidden">

            {/* Line items — always visible */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Line Items</span>
                {lineItems.length > 0 && (
                  <span className="text-[10px] font-semibold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
                    {lineItems.length}
                  </span>
                )}
              </div>

              {lineItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5">
                    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                    <rect x="9" y="3" width="6" height="4" rx="1" />
                  </svg>
                  <p className="text-xs text-gray-400">No line items found</p>
                  {canAddLineItems && (
                    <button type="button" onClick={() => setEditMode(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 transition-colors">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Add Line Items
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {lineItems.map(li => <LineItemCard key={li.id} li={li} />)}
                </div>
              )}
            </div>

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
    </>,
    document.body
  )
}
