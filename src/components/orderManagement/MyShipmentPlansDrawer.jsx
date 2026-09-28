import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useMyShipmentPlans } from '../../hooks/useMyShipmentPlans'
import { useMyGroups } from '../../hooks/useMyGroups'
import { useBuyerOptions } from '../../hooks/useBuyerOptions'
import { usePoShipmentPlans } from '../../hooks/usePoShipmentPlans'
import { useShipmentContainerActions } from '../../hooks/useShipmentContainerActions'
import { useMyPlanningExport } from '../../hooks/useMyPlanningExport'
import { initials, fmtCurrency, fmtCurrencySubtotals } from './poUtils'
import { CreateGroupInline, EditGroupInline } from './GroupComposer'
import EditPlanModal from './EditPlanModal'
import ConfirmModal from '../ui/ConfirmModal'
import { isContainerNumberConfirmed } from '../../utils/formatters'

// Colors/spacing/type scale lifted directly from the approved reference
// design ("Planned Shipments Drawer.html") rather than improvised — numeric
// values (PO refs, CBM, quantities, container numbers) are set in a
// monospace font as their only distinguishing treatment, not a color accent.
// `font-mono` substitutes for the reference's IBM Plex Mono (not loaded in
// this app) — same visual role, no new webfont to bring in.
// Keys not_raised/raised/booking_pending/do_carting_awaited/booked mirror
// shipment_invoices.status exactly (see sql/shipment_invoice_manual_status.sql
// + sql/shipment_invoice_status_relabel.sql) — not_visible/visible are the
// only two with no DB counterpart, since logistics never even sees a group
// (confirmed_at is null) until after it'd otherwise be 'not_raised' anyway.
const STATUS = {
  not_visible:         { label: 'Not visible',          cls: 'text-[#8a5a00] bg-[#fdf1dd]' },
  visible:             { label: 'Visible to logistics', cls: 'text-[#3a4a63] bg-[#eef1f6]' },
  raised:              { label: 'Raised · locked',      cls: 'text-[#4a4a52] bg-[#f0f0f2]' },
  booking_pending:     { label: 'Booking pending',      cls: 'text-[#8a5a00] bg-[#fdf1dd]' },
  do_carting_awaited:  { label: 'Booking placed · DO carting awaited', cls: 'text-[#5b3aa0] bg-[#f2edfb]' },
  booked:              { label: 'Booked',               cls: 'text-[#1a6844] bg-[#e7f4ec]' },
}

function StatusBadge({ statusKey }) {
  const s = STATUS[statusKey]
  return (
    <span className={`inline-block whitespace-nowrap rounded-[8px] text-[11.5px] font-semibold px-[9px] py-[3px] ${s.cls}`}>
      {s.label}
    </span>
  )
}

function ChevronToggle({ count, expanded, onToggle }) {
  if (!count) return null
  return (
    <button type="button" onClick={onToggle}
      className={`flex items-center gap-1 text-[11.5px] font-medium cursor-pointer transition-colors ${expanded ? 'text-[#2d2d33]' : 'text-[#5f5f68] hover:text-[#2d2d33]'}`}>
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
        className={`transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}>
        <polyline points="9 18 15 12 9 6" />
      </svg>
      {count} SKU{count !== 1 ? 's' : ''}
    </button>
  )
}

// Same data (po_shipment_plan_line_items) PlanShipmentModal.jsx collects.
function SkuLines({ lines }) {
  return (
    <div className="flex flex-col gap-1 mt-1.5 pt-1.5 border-t border-[#ececef]">
      {lines.map(l => (
        <div key={l.id} className="flex items-baseline gap-2">
          <span className="flex-1 min-w-0 text-[11.5px] font-semibold truncate text-[#3a3a41]">
            {l.buyer_sku_ref || '—'}
            {l.sku_variant && <span className="ml-1.5 font-medium">{l.sku_variant}</span>}
          </span>
          <span className="font-mono text-[11px] font-semibold text-[#3a3a41] flex-shrink-0">{l.quantity} pcs</span>
          <span className="font-mono text-[11px] font-bold text-[#17171a] w-[54px] text-right flex-shrink-0">{Number(l.cbm).toFixed(3)}</span>
          <span className="font-mono text-[11px] font-semibold text-[#45454d] w-[64px] text-right flex-shrink-0">{l.value != null ? fmtCurrency(l.value, l.currency) : '—'}</span>
        </div>
      ))}
    </div>
  )
}

function PencilIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function XIcon({ size = 14, strokeWidth = 2.2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

// An individual, not-yet-grouped plan — soft filled card (no border),
// selectable via the leading checkbox for the "N selected -> Confirm /
// Create group" bar below the list.
function PlanListRow({ plan, selected, onToggleSelected, onEdit, onSaved }) {
  const { withdrawPlan } = usePoShipmentPlans()
  const [withdrawing, setWithdrawing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const skuCount = plan.lines?.length || 0

  const withdraw = async () => {
    setWithdrawing(true)
    try { await withdrawPlan(plan.id); onSaved?.() }
    finally { setWithdrawing(false) }
  }

  return (
    <div className={`rounded-[10px] px-2.5 py-2 ${selected ? 'bg-[#f0f0f2] shadow-[inset_0_0_0_1px_#17171a]' : 'bg-[#f7f7f8]'}`}>
      <div className="flex items-start gap-2">
        <input type="checkbox" checked={selected} onChange={onToggleSelected}
          className="w-3.5 h-3.5 mt-0.5 cursor-pointer flex-shrink-0 accent-[#17171a]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-baseline gap-1.5">
              <span className="text-[9px] font-bold text-[#8a8a92] uppercase tracking-widest flex-shrink-0">PO</span>
              <span className="font-mono text-[13px] font-semibold tracking-[-0.01em] text-[#17171a] truncate">{plan.po_number || '—'}</span>
              <span className="text-[9px] font-bold text-[#8a8a92] uppercase tracking-widest flex-shrink-0 ml-1">Vendor</span>
              <span className="text-[12px] text-[#3a3a41] truncate">{plan.vendor_name}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="font-mono text-[13px] font-semibold text-[#17171a]">{Number(plan.cbm).toFixed(3)} m³</span>
              <button type="button" onClick={() => onEdit(plan)} title="Edit plan"
                className="w-6 h-6 flex items-center justify-center rounded-[7px] cursor-pointer transition-colors text-[#5f5f68] hover:bg-white hover:text-[#17171a]">
                <PencilIcon size={13} />
              </button>
              <button type="button" onClick={withdraw} disabled={withdrawing} title="Withdraw plan"
                className="w-6 h-6 flex items-center justify-center rounded-[7px] cursor-pointer transition-colors text-[#5f5f68] hover:bg-[#fdeceb] hover:text-[#b42318] disabled:opacity-50 disabled:cursor-default">
                <XIcon size={13} />
              </button>
            </div>
          </div>
          <div className="text-[11px] text-[#45454d] mt-0.5">Planned {new Date(plan.planned_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          <div className="mt-1.5"><ChevronToggle count={skuCount} expanded={expanded} onToggle={() => setExpanded(e => !e)} /></div>
          {expanded && skuCount > 0 && <SkuLines lines={plan.lines} />}
        </div>
      </div>
    </div>
  )
}

// One PO inside an already-grouped row — sits inside the group's own soft
// gray box, no checkbox/actions of its own.
function PoSubRow({ po }) {
  const [expanded, setExpanded] = useState(false)
  const skuCount = po.lines?.length || 0
  const totalQty = (po.lines || []).reduce((sum, l) => sum + (Number(l.quantity) || 0), 0)

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="flex-1 min-w-0 truncate">
          <span className="font-mono text-[12px] font-medium text-[#17171a]">{po.po_number}</span>
          {po.actual_vendor_name && <span className="ml-1.5 text-[11.5px] text-[#3a3a41]">{po.actual_vendor_name}</span>}
        </span>
        <span className="font-mono text-[11.5px] font-medium text-[#17171a] flex-shrink-0 text-right whitespace-nowrap">
          {totalQty > 0 && <span className="text-[#45454d]">{totalQty} pcs · </span>}
          {po.cbm != null ? `${Number(po.cbm).toFixed(2)} m³` : '—'}
          {po.value != null && <span className="text-[#45454d]"> · {fmtCurrency(po.value, po.currency)}</span>}
        </span>
      </div>
      {skuCount > 0 && (
        <div className="mt-1"><ChevronToggle count={skuCount} expanded={expanded} onToggle={() => setExpanded(e => !e)} /></div>
      )}
      {expanded && skuCount > 0 && <SkuLines lines={po.lines} />}
    </div>
  )
}

// A group's own summary (title / status / CBM / primary vendor / container),
// then its POs inside a soft gray box — bordered white card, unlike the
// filled-no-border treatment individual plans get above.
function GroupListRow({ group: g, isEditing, onEdit, onCancelEdit, onConfirm, confirming, plans, onSaved, onUngroupAll, ungroupingAll }) {
  const isConfirmed = !!g.confirmed_at
  // Locked purely off the manually-set status column, not
  // invoice_raised_at/container_id — logistics can raise the invoice or
  // attach a container without remembering to also move the separate status
  // dropdown forward, which used to leave the lock silently out of step
  // with what the group's own badge showed (invoice actually raised, but
  // still displaying "Visible to logistics" with no clue why Edit/Ungroup
  // had vanished). Any status past 'not_raised' means logistics has moved
  // forward on it, so composition/vendor/CBM edits stop there.
  const isRaised = g.status !== 'not_raised'
  const isBooked = g.status === 'booked'
  const isReallyBooked = isBooked && isContainerNumberConfirmed(g.container_number)
  const [showUngroupConfirm, setShowUngroupConfirm] = useState(false)

  // Now trivially consistent with the lock above, since both key off the
  // same manually-set status column — 'not_raised' displays as 'visible'
  // since logistics hasn't touched the status yet at that point.
  const statusKey = !isConfirmed ? 'not_visible' : g.status === 'not_raised' ? 'visible' : g.status
  // Raising/booking only ever happens after confirming, so "not confirmed"
  // always implies "not raised, not booked" — this single check covers both
  // "still being assembled" (needs Confirm) and "confirmed but still open"
  // (needs Ungroup/Edit); once raised or booked there's nothing left to do.
  const showFooter = !isRaised && !isBooked
  const totalQty = g.pos.reduce((sum, po) => sum + (po.lines || []).reduce((s, l) => s + (Number(l.quantity) || 0), 0), 0)

  if (isEditing) {
    return (
      <div className="rounded-[12px] overflow-hidden bg-white border border-[#ececef]">
        <EditGroupInline group={g} plans={plans} onCancel={onCancelEdit} onSaved={onSaved} />
      </div>
    )
  }

  return (
    <div className="rounded-[12px] overflow-hidden bg-white border border-[#ececef]">
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-semibold tracking-[-0.01em] text-[#17171a] whitespace-nowrap">
              {g.po_numbers.length ? `${g.po_numbers.length} PO${g.po_numbers.length > 1 ? 's' : ''}` : 'Empty group'}
            </span>
            <StatusBadge statusKey={statusKey} />
          </div>
          {g.cbm != null && (
            <div className="flex-shrink-0 text-right font-mono text-[13px] font-semibold text-[#17171a] whitespace-nowrap">
              {totalQty > 0 && <span className="text-[#45454d] font-medium">{totalQty} pcs · </span>}
              {Number(g.cbm).toFixed(2)} m³
              {Object.keys(g.valueByCurrency || {}).length > 0 && (
                <span className="text-[#45454d] font-medium"> · {fmtCurrencySubtotals(g.valueByCurrency)}</span>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-[84px_1fr] gap-x-2.5 gap-y-1 items-baseline mt-2">
          <span className="text-[12px] text-[#45454d]">Primary vendor</span>
          <span className="text-[12px] font-medium text-[#17171a] truncate">{g.primary_vendor_name || '—'}</span>
          {isReallyBooked && (
            <>
              <span className="text-[12px] text-[#45454d]">Container</span>
              <span className="font-mono text-[12px] font-medium text-[#17171a]">{g.container_number}</span>
            </>
          )}
        </div>
        {g.pos.length > 0 && (
          <div className="flex flex-col gap-1 mt-2 px-2.5 py-2 rounded-[9px] bg-[#f7f7f8]">
            {g.pos.map(po => <PoSubRow key={po.id} po={po} />)}
          </div>
        )}
      </div>
      {showFooter && (
        <div className="flex items-center justify-end gap-1.5 px-3 py-2 border-t border-[#f0f0f2]">
          <button type="button" onClick={() => setShowUngroupConfirm(true)}
            className="px-2.5 py-1 rounded-[8px] border border-[#e7e7ea] bg-white text-[#3f3f47] text-[11.5px] font-semibold cursor-pointer transition-colors hover:border-[#b9b9c0]">
            Ungroup
          </button>
          <button type="button" onClick={onEdit}
            className="px-2.5 py-1 rounded-[8px] border border-[#e7e7ea] bg-white text-[#3f3f47] text-[11.5px] font-semibold cursor-pointer transition-colors hover:border-[#b9b9c0]">
            Edit
          </button>
          {!isConfirmed && (
            <button type="button" onClick={onConfirm} disabled={confirming}
              className="px-3 py-1 rounded-[8px] bg-[#17171a] text-white text-[11.5px] font-semibold cursor-pointer transition-colors hover:bg-[#34343b] disabled:opacity-50 disabled:cursor-default">
              {confirming ? 'Confirming…' : 'Confirm'}
            </button>
          )}
        </div>
      )}
      <ConfirmModal
        open={showUngroupConfirm}
        title="Ungroup this whole group?"
        message={`Every PO in this group goes back to the draft pool and can be re-grouped later. The group itself${isConfirmed ? ' (already visible to logistics)' : ''} is removed.`}
        tone="neutral"
        confirmLabel="Ungroup"
        loadingLabel="Ungrouping…"
        onConfirm={async () => { await onUngroupAll(); setShowUngroupConfirm(false) }}
        onClose={() => setShowUngroupConfirm(false)}
        loading={ungroupingAll}
      />
    </div>
  )
}

function EmptySection({ text }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="w-[34px] h-[34px] rounded-full border-[1.5px] border-dashed border-[#c8c8ce]" />
      <p className="text-[12.5px] text-[#52525b]">{text}</p>
    </div>
  )
}

const TABS = [
  { key: 'pending',   label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'booked',    label: 'Booked' },
]

export default function MyShipmentPlansDrawer({ open, onClose, onChanged }) {
  const { plans, loading, refetch } = useMyShipmentPlans()
  const { groups, loading: groupsLoading, refetch: refetchGroups } = useMyGroups()
  const { buyers } = useBuyerOptions()
  const { createGroupFromPlans, confirmGroup, ungroupPlans } = useShipmentContainerActions()
  const { exportToExcel, exporting } = useMyPlanningExport()
  const [selectedIds, setSelectedIds] = useState([])
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState(null)
  const [confirmingId, setConfirmingId] = useState(null)
  const [quickConfirmingId, setQuickConfirmingId] = useState(null)
  const [buyerSearch, setBuyerSearch] = useState('')
  const [activeBuyerId, setActiveBuyerId] = useState(null)
  const [activeTab, setActiveTab] = useState('pending')
  const [editingPlan, setEditingPlan] = useState(null)

  // This drawer stays mounted (just hidden) between opens, so the initial
  // fetch on mount goes stale as soon as a new plan is created elsewhere —
  // refetch every time it's opened.
  useEffect(() => { if (open) { refetch(); refetchGroups() } }, [open, refetch, refetchGroups])

  // One item count per buyer (plans + not-yet-booked groups) — drives both
  // the buyer list's badges and which buyer gets auto-selected on open.
  // Booked groups are excluded here (unlike buyerGroups/bookedGroups below)
  // — they're done and settled, not something that still needs attention,
  // so they shouldn't inflate this badge or win the buyer auto-select.
  const countsByBuyerId = useMemo(() => {
    const map = new Map()
    plans.forEach(p => { if (p.buyer_org_id) map.set(p.buyer_org_id, (map.get(p.buyer_org_id) || 0) + 1) })
    groups.forEach(g => { if (g.buyer_org_id && g.status !== 'booked') map.set(g.buyer_org_id, (map.get(g.buyer_org_id) || 0) + 1) })
    return map
  }, [plans, groups])

  // A single-buyer merchant never needs the buyer list at all — it's purely
  // there to bring discipline once there's more than one to juggle.
  const showBuyerList = buyers.length > 1

  // Derived, not stored: defaults to whichever buyer has something going on
  // (falling back to the first alphabetically), until the merchant picks a
  // different one explicitly.
  const resolvedBuyerId = activeBuyerId
    ?? (buyers.find(b => countsByBuyerId.get(b.id) > 0) ?? buyers[0])?.id
    ?? null

  // Buyers with something planned surface first (so the active buyer is
  // never buried at the bottom of a long, purely-alphabetical list) — each
  // group keeps its own alphabetical order since Array#sort is stable and
  // `buyers` already comes pre-sorted from useBuyerOptions.
  const sortedBuyers = useMemo(
    () => [...buyers].sort((a, b) => (countsByBuyerId.get(b.id) > 0 ? 1 : 0) - (countsByBuyerId.get(a.id) > 0 ? 1 : 0)),
    [buyers, countsByBuyerId]
  )

  const filteredBuyers = useMemo(() => {
    const term = buyerSearch.trim().toLowerCase()
    if (!term) return sortedBuyers
    return sortedBuyers.filter(b => b.name.toLowerCase().includes(term))
  }, [sortedBuyers, buyerSearch])

  const buyerPlans = useMemo(
    () => showBuyerList ? plans.filter(p => p.buyer_org_id === resolvedBuyerId) : plans,
    [plans, resolvedBuyerId, showBuyerList]
  )
  const buyerGroups = useMemo(
    () => showBuyerList ? groups.filter(g => g.buyer_org_id === resolvedBuyerId) : groups,
    [groups, resolvedBuyerId, showBuyerList]
  )
  const selectedPlans = buyerPlans.filter(p => selectedIds.includes(p.id))
  const activeBuyerName = buyers.find(b => b.id === resolvedBuyerId)?.name

  // Booked groups get their own tab rather than disappearing once booked —
  // a merchant losing track of where their own PO ended up was worse than a
  // permanently read-only card. Membership keys off the manually-set
  // `status` column (what logistics actually declared), not container_id —
  // a group with a container already attached but still 'booking_pending'/
  // 'do_carting_awaited' stays in Confirmed until logistics marks it booked.
  // Confirmed excludes booked so a group only ever lives in one tab at a time.
  const bookedGroups = buyerGroups.filter(g => g.status === 'booked')
  const unconfirmedGroups = buyerGroups.filter(g => !g.confirmed_at && g.status !== 'booked')
  const confirmedGroups = buyerGroups.filter(g => g.confirmed_at && g.status !== 'booked')

  const tabCounts = {
    pending: buyerPlans.length + unconfirmedGroups.length,
    confirmed: confirmedGroups.length,
    booked: bookedGroups.length,
  }

  // Export always reflects only the currently active tab — Pending exports
  // ungrouped plans + not-yet-confirmed groups, Confirmed/Booked export only
  // that tab's groups' POs.
  const exportRows = useMemo(() => {
    if (activeTab === 'confirmed') {
      return confirmedGroups.flatMap(g => g.pos.map(po => ({
        supplier: po.actual_vendor_name, po_number: po.po_number, cbm: po.cbm,
      })))
    }
    if (activeTab === 'booked') {
      return bookedGroups.flatMap(g => g.pos.map(po => ({
        supplier: po.actual_vendor_name, po_number: po.po_number, cbm: po.cbm,
      })))
    }
    return [
      ...buyerPlans.map(p => ({ supplier: p.vendor_name, po_number: p.po_number, cbm: p.cbm })),
      ...unconfirmedGroups.flatMap(g => g.pos.map(po => ({
        supplier: po.actual_vendor_name, po_number: po.po_number, cbm: po.cbm,
      }))),
    ]
  }, [activeTab, buyerPlans, unconfirmedGroups, confirmedGroups, bookedGroups])

  // Vendor(s) among the current selection — one shared name, or a count —
  // feeds both the selection bar's label and quick-confirm's vendor choice.
  const selectedVendorIds = [...new Set(selectedPlans.map(p => p.supplier_org_id).filter(Boolean))]
  const sharedVendorId = selectedVendorIds.length === 1 ? selectedVendorIds[0] : null
  const selectedVendorNames = [...new Set(selectedPlans.map(p => p.vendor_name).filter(Boolean))]

  const allPlanIds = buyerPlans.map(p => p.id)
  const allSelected = allPlanIds.length > 0 && allPlanIds.every(id => selectedIds.includes(id))

  const toggleSelected = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const toggleSelectAll = () => {
    setSelectedIds(prev => allSelected ? prev.filter(id => !allPlanIds.includes(id)) : [...new Set([...prev, ...allPlanIds])])
  }

  const selectBuyer = (id) => { setActiveBuyerId(id); setSelectedIds([]); setCreatingGroup(false); setEditingGroupId(null); setActiveTab('pending') }

  const handleComposerSaved = () => {
    setSelectedIds([])
    setCreatingGroup(false)
    setEditingGroupId(null)
    refetch()
    refetchGroups()
    onChanged?.()
  }

  const confirm = async (groupId) => {
    setConfirmingId(groupId)
    try { await confirmGroup(groupId); await refetchGroups() }
    finally { setConfirmingId(null) }
  }

  const [ungroupingId, setUngroupingId] = useState(null)
  const ungroupAll = async (groupId, poIds) => {
    setUngroupingId(groupId)
    try {
      await ungroupPlans(groupId, poIds)
      await Promise.all([refetch(), refetchGroups()])
      onChanged?.()
    } finally {
      setUngroupingId(null)
    }
  }

  // Confirming selected PO(s) skips the group/vendor form entirely — but
  // still sends each PO to logistics as its own individual PO, never bundled
  // together, even when several are selected at once; only the explicit
  // "Create group" button is allowed to merge multiple POs into one shared
  // invoice. So this creates (and confirms) a separate one-PO group per
  // plan, one at a time, using that plan's own vendor as its group's primary
  // vendor — not some vendor shared across the wider selection, which
  // wouldn't even exist for a mixed-vendor batch. Works the same for a
  // single selected plan (the loop just runs once).
  const quickConfirm = async (plansToConfirm) => {
    const planIds = plansToConfirm.map(p => p.id)
    setQuickConfirmingId(planIds.length === 1 ? planIds[0] : 'multi')
    try {
      for (const plan of plansToConfirm) {
        const groupId = await createGroupFromPlans([plan.id], plan.supplier_org_id ?? null)
        await confirmGroup(groupId)
      }
      setSelectedIds(prev => prev.filter(id => !planIds.includes(id)))
      await refetch()
      await refetchGroups()
      onChanged?.()
    } finally {
      setQuickConfirmingId(null)
    }
  }

  if (!open) return null

  const nothingToShow = !loading && buyerPlans.length === 0 && !groupsLoading && buyerGroups.length === 0

  return createPortal(
    <>
      <div className="fixed inset-0 z-[110] bg-black/45 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className={`fixed inset-y-0 right-0 z-[120] w-full bg-white shadow-2xl flex flex-col ${showBuyerList ? 'sm:w-[660px]' : 'sm:w-[380px]'}`}>

        <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-3 flex-shrink-0">
          <div>
            <div className="text-[18px] font-bold tracking-[-0.02em] text-[#17171a]">My Planned Shipments</div>
            <div className="text-[12px] text-[#52525b] mt-[3px]">Group POs when ready, then confirm to send to logistics</div>
          </div>
          <button type="button" onClick={onClose}
            className="w-[30px] h-[30px] flex items-center justify-center rounded-[9px] bg-transparent text-[#55555e] cursor-pointer transition-colors hover:bg-[#f2f2f4] hover:text-[#17171a] flex-shrink-0">
            <XIcon size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 border-t border-[#f0f0f2]">
          {showBuyerList && (
            <aside className="w-[184px] flex-shrink-0 hidden sm:flex flex-col bg-[#fbfbfc] border-r border-[#f0f0f2]">
              <div className="px-2.5 pt-2.5 pb-2 flex-shrink-0">
                <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#45454d] mb-1.5">Buyers</div>
                <input
                  type="text"
                  value={buyerSearch}
                  onChange={e => setBuyerSearch(e.target.value)}
                  placeholder="Find a buyer…"
                  className="w-full box-border px-2 py-1.5 text-[12px] text-[#17171a] border border-[#e7e7ea] rounded-[9px] bg-white outline-none focus:border-[#17171a]"
                />
              </div>
              <div className="flex-1 overflow-y-auto px-1.5 pb-2.5">
                {filteredBuyers.map(b => {
                  const count = countsByBuyerId.get(b.id) || 0
                  const active = resolvedBuyerId === b.id
                  return (
                    <button key={b.id} type="button" onClick={() => selectBuyer(b.id)}
                      className={`w-full flex items-center gap-2 py-1.5 px-2 mb-0.5 rounded-[9px] text-left cursor-pointer
                        ${active ? 'bg-white shadow-[0_1px_2px_rgba(20,20,24,0.08),0_0_0_1px_#e7e7ea]' : 'bg-transparent'}`}>
                      <span className={`w-5 h-5 rounded-[6px] text-white text-[9px] font-semibold flex items-center justify-center flex-shrink-0 ${active ? 'bg-[#17171a]' : 'bg-[#6b6b74]'}`}>
                        {initials(b.name)}
                      </span>
                      <span className={`min-w-0 flex-1 text-[12px] truncate ${active ? 'font-semibold text-[#17171a]' : 'font-medium text-[#3a3a41]'}`}>{b.name}</span>
                      <span className={`font-mono text-[10.5px] font-medium rounded-[6px] px-1.5 py-px min-w-[16px] text-center flex-shrink-0 ${count ? 'text-[#17171a] bg-[#f0f0f2]' : 'text-[#45454d] bg-transparent'}`}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </aside>
          )}

          <div className="flex-1 min-w-0 overflow-y-auto pt-3 px-4 pb-5">
            {showBuyerList && (
              <select
                value={resolvedBuyerId || ''}
                onChange={e => selectBuyer(e.target.value)}
                className="sm:hidden w-full mb-4 px-2.5 py-2 text-xs font-semibold text-gray-800 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-900"
              >
                {sortedBuyers.map(b => (
                  <option key={b.id} value={b.id}>{b.name} {countsByBuyerId.get(b.id) ? `(${countsByBuyerId.get(b.id)})` : ''}</option>
                ))}
              </select>
            )}
            {(loading || groupsLoading) && buyerPlans.length === 0 && buyerGroups.length === 0 && (
              <p className="text-[12.5px] text-[#52525b] text-center py-10">Loading…</p>
            )}
            {nothingToShow && (
              <p className="text-[12.5px] text-[#52525b] text-center py-10">No planned shipments</p>
            )}

            {(buyerPlans.length > 0 || buyerGroups.length > 0) && (
              <div className="flex flex-col gap-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {TABS.map(t => (
                      <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] font-semibold cursor-pointer transition-colors
                          ${activeTab === t.key ? 'border-[#17171a] bg-[#17171a] text-white' : 'border-[#e7e7ea] bg-white text-[#3a3a41]'}`}>
                        {t.label}
                        <span className={`font-mono text-[11px] font-medium ${activeTab === t.key ? 'text-[#d4d4d9]' : 'text-[#45454d]'}`}>{tabCounts[t.key]}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button"
                    onClick={() => exportToExcel(exportRows, { buyerName: activeBuyerName, tabLabel: activeTab === 'confirmed' ? 'Confirmed' : activeTab === 'booked' ? 'Booked' : 'Pending' })}
                    disabled={exportRows.length === 0 || exporting}
                    className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-[9px] border border-[#e7e7ea] bg-white text-[#55555e] text-[12px] font-medium cursor-pointer transition-colors hover:bg-[#f2f2f4] hover:text-[#17171a] disabled:opacity-40 disabled:cursor-default disabled:hover:bg-white disabled:hover:text-[#55555e] flex-shrink-0">
                    <DownloadIcon />
                    {exporting ? 'Exporting…' : 'Export'}
                  </button>
                </div>

                {activeTab === 'pending' && (
                  buyerPlans.length === 0 && unconfirmedGroups.length === 0 ? (
                    <EmptySection text="Nothing pending for this buyer" />
                  ) : (
                    <div>
                      {buyerPlans.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between gap-2.5 mb-1.5">
                            <div className="flex items-center gap-2">
                              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                                className="w-3.5 h-3.5 cursor-pointer accent-[#17171a]" />
                              <span className="text-[13px] font-semibold tracking-[-0.01em] text-[#17171a]">Ungrouped POs</span>
                            </div>
                            <span className="font-mono text-[11px] font-medium text-[#52525b]">
                              {buyerPlans.length} plan{buyerPlans.length !== 1 ? 's' : ''}
                            </span>
                          </div>

                          <div className="flex flex-col gap-1">
                            {buyerPlans.map(p => (
                              <PlanListRow key={p.id} plan={p} selected={selectedIds.includes(p.id)} onToggleSelected={() => toggleSelected(p.id)}
                                onEdit={setEditingPlan} onSaved={() => { refetch(); onChanged?.() }} />
                            ))}
                          </div>

                          {selectedPlans.length > 0 && !creatingGroup && (
                            <div className="flex items-center justify-between gap-3 mt-2 py-2 pr-2.5 pl-3.5 rounded-[10px] bg-[#f4f4f6] border border-[#ececef]">
                              <span className="text-[12.5px] font-medium text-[#2d2d33]">
                                {selectedPlans.length} selected · {sharedVendorId ? selectedVendorNames[0] : `${selectedVendorIds.length} vendors`}
                              </span>
                              <div className="flex items-center gap-[7px]">
                                {selectedPlans.length > 1 && (
                                  <button type="button" onClick={() => setCreatingGroup(true)}
                                    className="px-[11px] py-[6px] rounded-[9px] border border-[#e2e2e6] bg-white text-[#3f3f47] text-[12px] font-semibold cursor-pointer transition-colors hover:border-[#17171a] hover:text-[#17171a]">
                                    Create group
                                  </button>
                                )}
                                <button type="button" onClick={() => quickConfirm(selectedPlans)} disabled={quickConfirmingId != null}
                                  className="px-[13px] py-[6px] rounded-[9px] bg-[#17171a] text-white text-[12px] font-semibold cursor-pointer transition-colors hover:bg-[#34343b] disabled:opacity-50 disabled:cursor-default">
                                  {quickConfirmingId != null ? 'Confirming…' : 'Confirm'}
                                </button>
                              </div>
                            </div>
                          )}
                          {creatingGroup && (
                            <div className="mt-2 rounded-[12px] overflow-hidden border border-[#ececef]">
                              <CreateGroupInline
                                buyerName={activeBuyerName}
                                selectedPlans={selectedPlans}
                                onCancel={() => setCreatingGroup(false)}
                                onSaved={handleComposerSaved}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {unconfirmedGroups.length > 0 && (
                        <div className="mt-3.5">
                          <div className="text-[13px] font-semibold tracking-[-0.01em] text-[#17171a] mb-1.5">Groups</div>
                          <div className="flex flex-col gap-1.5">
                            {unconfirmedGroups.map(g => (
                              <GroupListRow
                                key={g.id}
                                group={g}
                                isEditing={editingGroupId === g.id}
                                onEdit={() => setEditingGroupId(g.id)}
                                onCancelEdit={() => setEditingGroupId(null)}
                                onConfirm={() => confirm(g.id)}
                                confirming={confirmingId === g.id}
                                plans={plans}
                                onSaved={handleComposerSaved}
                                onUngroupAll={() => ungroupAll(g.id, g.pos.map(po => po.id))}
                                ungroupingAll={ungroupingId === g.id}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                )}

                {activeTab === 'confirmed' && (
                  confirmedGroups.length === 0 ? (
                    <EmptySection text="No confirmed groups yet" />
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {confirmedGroups.map(g => (
                        <GroupListRow
                          key={g.id}
                          group={g}
                          isEditing={editingGroupId === g.id}
                          onEdit={() => setEditingGroupId(g.id)}
                          onCancelEdit={() => setEditingGroupId(null)}
                          onConfirm={() => confirm(g.id)}
                          confirming={confirmingId === g.id}
                          plans={plans}
                          onSaved={handleComposerSaved}
                          onUngroupAll={() => ungroupAll(g.id, g.pos.map(po => po.id))}
                          ungroupingAll={ungroupingId === g.id}
                        />
                      ))}
                    </div>
                  )
                )}

                {activeTab === 'booked' && (
                  bookedGroups.length === 0 ? (
                    <EmptySection text="Nothing booked yet" />
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {bookedGroups.map(g => (
                        <GroupListRow
                          key={g.id}
                          group={g}
                          isEditing={false}
                          onEdit={() => {}}
                          onCancelEdit={() => {}}
                          onConfirm={() => {}}
                          confirming={false}
                          plans={plans}
                          onSaved={handleComposerSaved}
                          onUngroupAll={() => {}}
                          ungroupingAll={false}
                        />
                      ))}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <EditPlanModal
        open={!!editingPlan}
        plan={editingPlan}
        onClose={() => setEditingPlan(null)}
        onSuccess={() => { refetch(); onChanged?.() }}
      />
    </>,
    document.body
  )
}
