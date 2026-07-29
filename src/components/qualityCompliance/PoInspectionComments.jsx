import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useProfileStore, useAssignedRegions } from '../../stores/profileStore'

const STATUS_STYLE = {
  open:      { strip: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-800' },
  shipped:   { strip: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800' },
  cancelled: { strip: 'bg-red-400',     badge: 'bg-red-100 text-red-700' },
  confirmed: { strip: 'bg-blue-400',    badge: 'bg-blue-100 text-blue-800' },
}
function statusStyle(s) {
  return STATUS_STYLE[s?.toLowerCase()] ?? { strip: 'bg-gray-300', badge: 'bg-gray-100 text-gray-600' }
}
function fmtQty(n) { return n != null ? Number(n).toLocaleString() : '—' }

const SHORT_M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function getWeekLabel(dateStr) {
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  const thu = new Date(d)
  thu.setDate(d.getDate() + (4 - (d.getDay() || 7)))
  const yr = thu.getFullYear()
  const jan1 = new Date(yr, 0, 1)
  const week = Math.ceil(((thu - jan1) / 86400000 + 1) / 7)
  const mon = new Date(d)
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  const fmt = (dt) => `${SHORT_M[dt.getMonth()]} ${dt.getDate()}`
  return { key: `${yr}-W${String(week).padStart(2, '0')}`, label: `W${week} · ${fmt(mon)}–${fmt(sun)}, ${yr}` }
}

function getMonthLabel(dateStr) {
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${SHORT_M[d.getMonth()]} ${d.getFullYear()}` }
}

// Earliest target_date among open line items — used for week/month grouping
function poGroupDate(po) {
  const dates = po.po_line_items
    ?.filter(li => li.status?.toLowerCase() === 'open' && li.target_date)
    .map(li => li.target_date)
    .sort()
  return dates?.[0] ?? null
}

function Spinner({ size = 'w-4 h-4' }) {
  return (
    <svg className={`${size} animate-spin text-gray-400`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

function LineItemCard({ li }) {
  const { strip, badge } = statusStyle(li.status)
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
      <div className={`w-1 flex-shrink-0 ${strip}`} />
      <div className="flex-1 px-3 py-2.5 space-y-2">
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
        <div className="grid grid-cols-3 divide-x divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
          {[
            { label: 'Ordered', qty: li.quantity_ordered },
            { label: 'Shipped', qty: li.shipped_quantity },
            { label: 'Balance', qty: li.balance_quantity },
          ].map(({ label, qty }) => (
            <div key={label} className="px-2.5 py-2 bg-gray-50">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</div>
              <div className="text-sm font-bold text-gray-900 leading-none">{fmtQty(qty)}</div>
            </div>
          ))}
        </div>
        {li.target_date && (
          <div className="text-[10px] text-gray-500 pt-0.5">
            Target ship: <span className="font-semibold text-gray-700">{li.target_date}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function PoCard({ po, selected, onSelect, exFactory }) {
  const openCount = po.po_line_items?.filter(li => li.status?.toLowerCase() === 'open').length ?? 0
  return (
    <button
      type="button"
      onClick={() => onSelect(po)}
      className={`w-full text-left px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100 transition-colors
        ${selected ? 'bg-gray-100 border-l-2 border-l-gray-900' : ''}`}
    >
      <div className="text-sm font-bold text-gray-900">{po.po_number || '—'}</div>
      <div className="text-xs text-gray-500 mt-0.5 truncate">
        {[po.buyer_name, po.supplier_name].filter(Boolean).join(' · ') || '—'}
      </div>
      <div className="flex items-center gap-3 mt-1.5">
        {exFactory(po) && (
          <span className="text-[11px] text-gray-400">EXF: {exFactory(po)}</span>
        )}
        <span className="text-[11px] text-gray-400">
          {openCount} open SKU{openCount !== 1 ? 's' : ''}
        </span>
      </div>
    </button>
  )
}

export default function PoInspectionComments() {
  const { orgMembership } = useProfileStore()
  const assignedRegions = useAssignedRegions()
  const userName   = orgMembership?.fullName || 'QA Team'
  const dept       = orgMembership?.department
  const canComment = dept === 'qa' || dept === 'tech'
  const isQa       = dept === 'qa'

  const [activeTab, setActiveTab] = useState('all')   // 'all' | 'nearby'
  const [viewMode, setViewMode]   = useState('list')  // 'list' | 'week' | 'month'

  // Refs so fetchPos (stable [] deps) always sees latest values without recreating
  const deptRef = useRef(dept)
  deptRef.current = dept

  const [pos, setPos]               = useState([])
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')
  const [selectedBuyer, setSelectedBuyer]       = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [selectedPo, setSelectedPo] = useState(null)

  const [comments, setComments]               = useState([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentText, setCommentText]         = useState('')
  const [posting, setPosting]                 = useState(false)
  const [postError, setPostError]             = useState(null)

  const fetchPos = useCallback(async (poNumber = '') => {
    const isTech = deptRef.current === 'tech'
    setLoading(true)

    let q = supabase
      .from('purchase_orders')
      .select(`
        id, po_number, po_received_date, ex_factory_date, exceptional_ex_factory_date,
        quantity_ordered,
        buyer_supplier_links!inner (
          buyer:organizations!buyer_supplier_links_buyer_org_id_fkey (display_name),
          supplier:organizations!buyer_supplier_links_supplier_org_id_fkey (display_name, city)
        ),
        po_line_items (
          id, buyer_sku_ref, sku_variant,
          quantity_ordered, shipped_quantity, balance_quantity,
          status, target_date
        )
      `)
      .is('deleted_at', null)
      .is('delete_meta', null)
      .neq('status', 'closed')
      .gte('po_received_date', '2026-01-01')
      .order('po_received_date', { ascending: false })
      .limit(200)

    if (!isTech) q = q.not('is_test', 'is', true)
    if (poNumber.trim()) q = q.ilike('po_number', `%${poNumber.trim()}%`)

    const { data, error } = await q
    setLoading(false)

    if (error) { console.error('[PoInspectionComments] fetch error:', error.message); return }

    setPos((data || []).map(po => ({
      ...po,
      buyer_name:    po.buyer_supplier_links?.buyer?.display_name    ?? null,
      supplier_name: po.buyer_supplier_links?.supplier?.display_name ?? null,
      supplier_city: po.buyer_supplier_links?.supplier?.city         ?? null,
    })))
  }, []) // stable — reads dept via deptRef

  useEffect(() => { fetchPos() }, [fetchPos])

  const fetchComments = useCallback(async (poId) => {
    setCommentsLoading(true)
    const { data } = await supabase
      .from('po_comments')
      .select('id, comment, created_by, created_at')
      .eq('po_id', poId)
      .eq('comment_type', 'QA_INSPECTION')
      .order('created_at', { ascending: true })
    setCommentsLoading(false)
    setComments(data || [])
  }, [])

  const selectPo = (po) => {
    setSelectedPo(po)
    setCommentText('')
    setPostError(null)
    fetchComments(po.id)
  }

  const submitComment = async () => {
    if (!commentText.trim() || !selectedPo) return
    setPosting(true)
    setPostError(null)
    const { error } = await supabase.from('po_comments').insert({
      po_id:        selectedPo.id,
      comment_type: 'QA_INSPECTION',
      comment:      commentText.trim(),
      created_by:   userName,
    })
    setPosting(false)
    if (error) { setPostError(error.message); return }
    setCommentText('')
    fetchComments(selectedPo.id)
  }

  const exFactory = (po) => po.exceptional_ex_factory_date ?? po.ex_factory_date

  const buyers    = [...new Set(pos.map(p => p.buyer_name).filter(Boolean))].sort()
  const suppliers = [...new Set(pos.map(p => p.supplier_name).filter(Boolean))].sort()

  const displayedPos = useMemo(() => pos.filter(p => {
    if (selectedBuyer    && p.buyer_name    !== selectedBuyer)    return false
    if (selectedSupplier && p.supplier_name !== selectedSupplier) return false
    if (activeTab === 'nearby' && assignedRegions?.length > 0 && !assignedRegions.includes(p.supplier_city)) return false
    if (!p.po_line_items?.some(li => li.status?.toLowerCase() === 'open')) return false
    return true
  }), [pos, selectedBuyer, selectedSupplier, activeTab, assignedRegions])

  const groupedPos = useMemo(() => {
    if (viewMode === 'list') return null
    const groups = new Map()
    displayedPos.forEach(po => {
      const date = poGroupDate(po)
      const info = date ? (viewMode === 'week' ? getWeekLabel(date) : getMonthLabel(date)) : null
      const key   = info?.key   ?? '__none__'
      const label = info?.label ?? 'No target date'
      if (!groups.has(key)) groups.set(key, { key, label, items: [] })
      groups.get(key).items.push(po)
    })
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g)
  }, [displayedPos, viewMode])

  // ── PO list panel (shared between mobile/desktop) ─────────────────────────
  const poList = (
    <div className={`
      flex flex-col bg-white
      border-gray-200
      ${selectedPo ? 'hidden md:flex md:w-72 md:border-r md:flex-shrink-0' : 'flex w-full md:w-72 md:border-r md:flex-shrink-0'}
    `}>
      {/* All / Nearby Me tab switcher — QA members only */}
      {isQa && (
        <div className="flex border-b border-gray-200 flex-shrink-0">
          {['all', 'nearby'].map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors
                ${activeTab === t
                  ? 'text-gray-900 border-b-2 border-gray-900'
                  : 'text-gray-400 hover:text-gray-700'}`}
            >
              {t === 'all' ? 'All POs' : 'My POs'}
            </button>
          ))}
        </div>
      )}

      {/* City chips shown when Nearby Me is active */}
      {isQa && activeTab === 'nearby' && (
        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          {!assignedRegions || assignedRegions.length === 0 ? (
            <p className="text-[11px] text-amber-600">
              {assignedRegions === null ? 'No specific cities assigned — contact your admin' : 'No regions assigned yet'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {assignedRegions.map(c => (
                <span key={c} className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-[10px] font-medium">{c}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 flex-shrink-0">
        {['list', 'week', 'month'].map(v => (
          <button
            key={v}
            type="button"
            onClick={() => setViewMode(v)}
            className={`px-3 py-1 text-xs font-medium rounded-full capitalize transition-colors
              ${viewMode === v ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="px-3 py-2.5 border-b border-gray-200 flex-shrink-0 space-y-2">
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); fetchPos(e.target.value) }}
            placeholder="Search PO number…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
          />
        </div>

        {/* Buyer + Supplier in one row */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'All Buyers',    value: selectedBuyer,    options: buyers,    onChange: setSelectedBuyer },
            { label: 'All Suppliers', value: selectedSupplier, options: suppliers, onChange: setSelectedSupplier },
          ].map(({ label, value, options, onChange }) => (
            <div key={label} className="relative">
              <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="w-full pl-2 pr-6 py-1.5 text-xs border border-gray-200 rounded-lg appearance-none bg-white focus:outline-none focus:border-gray-900 text-gray-700 truncate"
              >
                <option value="">{label}</option>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          ))}
        </div>

        {(search || selectedBuyer || selectedSupplier) && (
          <button
            type="button"
            onClick={() => { setSearch(''); setSelectedBuyer(''); setSelectedSupplier(''); fetchPos('') }}
            className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        )}
        {!loading && displayedPos.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-10">
            {pos.length === 0 ? 'No open POs found' : 'No POs match the filters'}
          </p>
        )}
        {!loading && !groupedPos && displayedPos.map(po => (
          <PoCard key={po.id} po={po} selected={selectedPo?.id === po.id} onSelect={selectPo} exFactory={exFactory} />
        ))}
        {!loading && groupedPos && groupedPos.map(group => (
          <div key={group.key}>
            <div className="sticky top-0 px-4 py-1.5 bg-gray-100 border-b border-gray-200 z-10 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-gray-600">{group.label}</span>
              <span className="text-[10px] text-gray-400">{group.items.length} PO{group.items.length !== 1 ? 's' : ''}</span>
            </div>
            {group.items.map(po => (
              <PoCard key={po.id} po={po} selected={selectedPo?.id === po.id} onSelect={selectPo} exFactory={exFactory} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )

  // ── Detail panel ──────────────────────────────────────────────────────────
  const detail = selectedPo ? (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-gray-50 w-full">

      {/* Header — back button on mobile, close X on desktop */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            {/* Back button — mobile only */}
            <button
              type="button"
              onClick={() => setSelectedPo(null)}
              className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 mt-0.5"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="min-w-0">
              <div className="text-sm font-bold text-gray-900">PO {selectedPo.po_number || '—'}</div>
              <div className="text-xs text-gray-500 mt-0.5 truncate">
                {[selectedPo.buyer_name, selectedPo.supplier_name].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
          </div>
          {/* Close — desktop only */}
          <button
            type="button"
            onClick={() => setSelectedPo(null)}
            className="hidden md:flex w-7 h-7 items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-100">
          {[
            { label: 'PO Date',    value: selectedPo.po_received_date },
            { label: 'Ex-Factory', value: exFactory(selectedPo) },
            { label: 'Total Qty',  value: fmtQty(selectedPo.quantity_ordered) },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{label}</div>
              <div className="text-xs font-semibold text-gray-800 mt-0.5">{value || '—'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Body:
            Mobile  — flex-col: line items scroll freely, comments pinned at bottom
            Desktop — flex-row: line items left (flex-1), comments right (w-80) */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">

        {/* Line items — always shown, scrollable in its own container */}
        <div className="flex-1 overflow-y-auto px-4 pt-5 pb-3 border-b md:border-b-0 md:border-r border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Line Items</span>
            {selectedPo.po_line_items?.length > 0 && (
              <span className="text-[10px] font-semibold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
                {selectedPo.po_line_items.length}
              </span>
            )}
          </div>
          {!selectedPo.po_line_items?.length ? (
            <p className="text-xs text-gray-400">No line items on this PO</p>
          ) : (
            <div className="space-y-2">
              {selectedPo.po_line_items.map(li => <LineItemCard key={li.id} li={li} />)}
            </div>
          )}
        </div>

        {/* Comments — pinned at bottom on mobile (flex-shrink-0), right column on desktop
            Comment list scrolls inside; form is always visible at the bottom */}
        <div className="flex-shrink-0 md:w-80 flex flex-col border-t md:border-t-0 border-gray-200 bg-white">

          {/* Comment list — compact scrollable area on mobile, flex-1 on desktop */}
          <div className="overflow-y-auto px-4 pt-4 pb-2 max-h-40 md:max-h-none md:flex-1">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
              Inspection Comments
            </div>

            {commentsLoading && (
              <div className="flex items-center gap-2 py-2">
                <Spinner size="w-3.5 h-3.5" />
                <span className="text-xs text-gray-400">Loading…</span>
              </div>
            )}

            {!commentsLoading && comments.length === 0 && (
              <p className="text-xs text-gray-400">No inspection comments yet.</p>
            )}

            {!commentsLoading && comments.length > 0 && (
              <div className="space-y-2.5">
                {comments.map(c => (
                  <div key={c.id} className="flex items-start gap-2.5 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl">
                    <div className="w-7 h-7 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {c.created_by?.charAt(0)?.toUpperCase() ?? 'Q'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-800">{c.created_by}</span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          {' · '}
                          {new Date(c.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap leading-relaxed">{c.comment}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form — always visible */}
          <div className="flex-shrink-0 px-4 pt-2 pb-4 border-t border-gray-100">
            {canComment ? (
              <div className="space-y-2">
                <textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment()
                  }}
                  placeholder="Add inspection comment…"
                  rows={3}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 resize-none"
                />
                {postError && <p className="text-xs text-red-500">{postError}</p>}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-400 truncate">
                    As <span className="font-semibold text-gray-600">{userName}</span>
                  </span>
                  <button
                    type="button"
                    onClick={submitComment}
                    disabled={!commentText.trim() || posting}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40 transition-colors flex-shrink-0"
                  >
                    {posting && <Spinner size="w-3 h-3" />}
                    {posting ? 'Posting…' : 'Post'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">
                View only — only QA and Tech members can post.
              </p>
            )}
          </div>

        </div>

      </div>
    </div>
  ) : (
    // Empty state — desktop only (mobile shows list when nothing selected)
    <div className="hidden md:flex flex-1 flex-col items-center justify-center gap-3 text-center bg-gray-50">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" />
      </svg>
      <p className="text-sm text-gray-400">Select a PO to view line items and add inspection comments</p>
    </div>
  )

  return (
    <div className="flex flex-col md:flex-row overflow-hidden" style={{ height: 'calc(100svh - 72px)' }}>
      {poList}
      {detail}
    </div>
  )
}
