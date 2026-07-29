import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useMyShipmentPlans } from '../../hooks/useMyShipmentPlans'
import { useMyGroups } from '../../hooks/useMyGroups'
import { useBuyerOptions } from '../../hooks/useBuyerOptions'
import { usePoShipmentPlans } from '../../hooks/usePoShipmentPlans'
import { useShipmentContainerActions } from '../../hooks/useShipmentContainerActions'
import { useMyPlanningExport } from '../../hooks/useMyPlanningExport'
import { initials } from './poUtils'
import { CreateGroupInline, EditGroupInline } from './GroupComposer'
import ConfirmModal from '../ui/ConfirmModal'

function PlanRow({ plan, selected, onToggleSelected, onSaved }) {
  const { updatePlanCbm, withdrawPlan } = usePoShipmentPlans()
  const [cbm, setCbm] = useState(String(plan.cbm))
  const [saving, setSaving] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)

  const dirty = cbm !== String(plan.cbm)

  const save = async () => {
    if (!dirty || !(Number(cbm) > 0)) return
    setSaving(true)
    try { await updatePlanCbm(plan.id, Number(cbm)); onSaved?.() }
    finally { setSaving(false) }
  }

  const withdraw = async () => {
    setWithdrawing(true)
    try { await withdrawPlan(plan.id); onSaved?.() }
    finally { setWithdrawing(false) }
  }

  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 transition-colors ${selected ? 'bg-indigo-100' : 'hover:bg-gray-50'}`}>
      <input type="checkbox" checked={selected} onChange={onToggleSelected}
        className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600 cursor-pointer flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-gray-900 truncate">
          {plan.po_number || '—'}
          {plan.vendor_name && <span className="text-[11px] font-normal text-gray-400 ml-1.5">{plan.vendor_name}</span>}
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5">Planned {new Date(plan.planned_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <input type="number" min="0" step="0.01" value={cbm} onChange={e => setCbm(e.target.value)}
          className="w-16 px-1.5 py-1 border border-gray-200 rounded-md text-xs text-gray-900 focus:outline-none focus:border-gray-900" />
        <span className="text-[10px] text-gray-400">m³</span>
        {dirty && (
          <button type="button" onClick={save} disabled={saving}
            className="px-2 py-1 rounded-md bg-gray-900 text-white text-[11px] font-semibold hover:bg-gray-700 disabled:opacity-50 cursor-pointer disabled:cursor-default transition-colors">
            {saving ? '…' : 'Save'}
          </button>
        )}
        <button type="button" onClick={withdraw} disabled={withdrawing}
          className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 cursor-pointer disabled:cursor-default transition-colors"
          title="Withdraw plan">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function GroupCard({ group: g, showBuyerList, isEditing, onEdit, onCancelEdit, onConfirm, confirming, plans, onSaved, onUngroupAll, ungroupingAll }) {
  const isConfirmed = !!g.confirmed_at
  const [showUngroupConfirm, setShowUngroupConfirm] = useState(false)

  if (isEditing) {
    return (
      <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
        <EditGroupInline group={g} plans={plans} onCancel={onCancelEdit} onSaved={onSaved} />
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-gray-900 truncate">
            {g.po_numbers.length ? `${g.po_numbers.length} PO${g.po_numbers.length > 1 ? 's' : ''}` : 'Empty group'}
          </span>
          {g.cbm != null && <span className="text-xs font-semibold text-gray-500 flex-shrink-0">{Number(g.cbm).toFixed(2)} m³</span>}
        </div>
        {!showBuyerList && <div className="text-[11px] text-gray-500 truncate mt-0.5">{g.buyer_name}</div>}
        <div className="flex items-center justify-between gap-2 mt-1.5">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Primary Vendor</span>
          <span className="text-[11px] font-semibold text-gray-700 truncate">{g.primary_vendor_name || '—'}</span>
        </div>
        {g.pos.length > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-gray-100 space-y-1">
            {g.pos.map(po => (
              <div key={po.id} className="flex items-center gap-2">
                <span className="text-xs text-gray-700 truncate flex-1 min-w-0">{po.po_number}</span>
                <span className="text-[11px] text-gray-400 truncate max-w-[30%] flex-shrink-0">{po.actual_vendor_name || '—'}</span>
                <span className="text-[10px] font-semibold text-gray-500 w-12 text-right flex-shrink-0">
                  {po.cbm != null ? `${Number(po.cbm).toFixed(2)} m³` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={`flex items-center justify-between gap-2 px-3 py-2 border-t ${isConfirmed ? 'bg-gray-50 border-gray-100' : 'bg-amber-50 border-amber-100'}`}>
        <span className={`text-[11px] ${isConfirmed ? 'text-gray-500' : 'text-amber-800'}`}>
          {isConfirmed ? 'Visible to logistics' : 'Not visible to logistics yet'}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowUngroupConfirm(true)}
            className="px-2.5 py-1 rounded-md border border-gray-200 bg-white text-gray-700 text-[11px] font-semibold hover:bg-gray-100 cursor-pointer transition-colors">
            Ungroup
          </button>
          <button type="button" onClick={onEdit}
            className="px-2.5 py-1 rounded-md border border-gray-200 bg-white text-gray-700 text-[11px] font-semibold hover:bg-gray-100 cursor-pointer transition-colors">
            Edit
          </button>
          {!isConfirmed && (
            <button type="button" onClick={onConfirm} disabled={confirming}
              className="px-2.5 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer disabled:cursor-default transition-colors">
              {confirming ? 'Confirming…' : 'Confirm'}
            </button>
          )}
        </div>
      </div>
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

  // This drawer stays mounted (just hidden) between opens, so the initial
  // fetch on mount goes stale as soon as a new plan is created elsewhere —
  // refetch every time it's opened.
  useEffect(() => { if (open) { refetch(); refetchGroups() } }, [open, refetch, refetchGroups])

  // One item count per buyer (plans + groups combined) — drives both the
  // buyer list's badges and which buyer gets auto-selected on open.
  const countsByBuyerId = useMemo(() => {
    const map = new Map()
    plans.forEach(p => { if (p.buyer_org_id) map.set(p.buyer_org_id, (map.get(p.buyer_org_id) || 0) + 1) })
    groups.forEach(g => { if (g.buyer_org_id) map.set(g.buyer_org_id, (map.get(g.buyer_org_id) || 0) + 1) })
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

  const filteredBuyers = useMemo(() => {
    const term = buyerSearch.trim().toLowerCase()
    if (!term) return buyers
    return buyers.filter(b => b.name.toLowerCase().includes(term))
  }, [buyers, buyerSearch])

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

  const unconfirmedGroups = buyerGroups.filter(g => !g.confirmed_at)
  const confirmedGroups = buyerGroups.filter(g => g.confirmed_at)

  // Export always reflects only the currently active tab — Pending exports
  // ungrouped plans + not-yet-confirmed groups, Confirmed exports only
  // confirmed groups' POs.
  const exportRows = useMemo(() => {
    if (activeTab === 'confirmed') {
      return confirmedGroups.flatMap(g => g.pos.map(po => ({
        supplier: po.actual_vendor_name, po_number: po.po_number, cbm: po.cbm,
      })))
    }
    return [
      ...buyerPlans.map(p => ({ supplier: p.vendor_name, po_number: p.po_number, cbm: p.cbm })),
      ...unconfirmedGroups.flatMap(g => g.pos.map(po => ({
        supplier: po.actual_vendor_name, po_number: po.po_number, cbm: po.cbm,
      }))),
    ]
  }, [activeTab, buyerPlans, unconfirmedGroups, confirmedGroups])

  // Quick-confirm (skip the vendor picker) only makes sense when every
  // selected PO shares the same supplier — otherwise the merchant has to
  // pick a primary vendor explicitly via Create Group.
  const selectedVendorIds = [...new Set(selectedPlans.map(p => p.supplier_org_id).filter(Boolean))]
  const sharedVendorId = selectedVendorIds.length === 1 ? selectedVendorIds[0] : null

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

  // When the selected PO(s) all share one vendor there's nothing for the
  // merchant to pick — skip the group/vendor form entirely and create +
  // confirm in one click, whether that's a single PO or a same-vendor batch.
  const quickConfirm = async (planIds, vendorOrgId) => {
    setQuickConfirmingId(planIds.length === 1 ? planIds[0] : 'multi')
    try {
      const groupId = await createGroupFromPlans(planIds, vendorOrgId)
      await confirmGroup(groupId)
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
      <div className="fixed inset-0 z-[110] bg-black/25 cursor-pointer" onClick={onClose} />
      <div className={`fixed inset-y-0 right-0 z-[120] w-full bg-gray-100 shadow-2xl flex flex-col ${showBuyerList ? 'sm:w-[760px]' : 'sm:w-[420px]'}`}>
        <div className="bg-white border-b border-gray-200 flex items-center justify-between px-5 py-4 flex-shrink-0">
          <div>
            <div className="text-base font-bold text-gray-900">My Planned Shipments</div>
            <div className="text-xs text-gray-500 mt-0.5">Group POs when ready, then confirm to send to logistics</div>
          </div>
          <button type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {showBuyerList && (
            <div className="hidden sm:flex flex-col w-56 flex-shrink-0 bg-white border-r border-gray-200">
              <div className="px-3 pt-3 pb-2 border-b border-gray-100 flex-shrink-0">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Buyers</div>
                <input
                  type="text"
                  value={buyerSearch}
                  onChange={e => setBuyerSearch(e.target.value)}
                  placeholder="Find a buyer…"
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredBuyers.map(b => {
                  const count = countsByBuyerId.get(b.id) || 0
                  const active = resolvedBuyerId === b.id
                  return (
                    <button key={b.id} type="button" onClick={() => selectBuyer(b.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 border-b border-gray-50 text-left cursor-pointer transition-colors
                        ${active ? 'bg-indigo-50 border-l-2 border-l-indigo-600' : 'hover:bg-gray-50 border-l-2 border-l-transparent'}`}>
                      <span className="w-6 h-6 rounded-full bg-slate-700 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                        {initials(b.name)}
                      </span>
                      <span className="min-w-0 flex-1 text-xs font-semibold text-gray-800 truncate">{b.name}</span>
                      {count > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 flex-shrink-0">{count}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex-1 min-w-0 overflow-y-auto px-4 py-4 space-y-5">
            {showBuyerList && (
              <select
                value={resolvedBuyerId || ''}
                onChange={e => selectBuyer(e.target.value)}
                className="sm:hidden w-full px-2.5 py-2 text-xs font-semibold text-gray-800 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-900"
              >
                {buyers.map(b => (
                  <option key={b.id} value={b.id}>{b.name} {countsByBuyerId.get(b.id) ? `(${countsByBuyerId.get(b.id)})` : ''}</option>
                ))}
              </select>
            )}
            {(loading || groupsLoading) && buyerPlans.length === 0 && buyerGroups.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-10">Loading…</p>
            )}
            {nothingToShow && (
              <p className="text-xs text-gray-400 text-center py-10">No planned shipments</p>
            )}

            {(buyerPlans.length > 0 || buyerGroups.length > 0) && (
              <div className="space-y-2">
                <div className="px-1">
                  <div className="text-[11px] font-extrabold text-black uppercase">Shipment Planning</div>
                  <div className="text-[10px] text-gray-800 mt-0.5">Group the POs that will be raised together on a single invoice</div>
                </div>

                <div className="flex items-center justify-between gap-2 border-b border-gray-200">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setActiveTab('pending')}
                      className={`px-3 py-1.5 text-xs font-semibold border-b-2 cursor-pointer transition-colors ${activeTab === 'pending' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                      Pending{(buyerPlans.length + unconfirmedGroups.length) > 0 ? ` (${buyerPlans.length + unconfirmedGroups.length})` : ''}
                    </button>
                    <button type="button" onClick={() => setActiveTab('confirmed')}
                      className={`px-3 py-1.5 text-xs font-semibold border-b-2 cursor-pointer transition-colors ${activeTab === 'confirmed' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                      Confirmed{confirmedGroups.length > 0 ? ` (${confirmedGroups.length})` : ''}
                    </button>
                  </div>
                  <button type="button"
                    onClick={() => exportToExcel(exportRows, { buyerName: activeBuyerName, tabLabel: activeTab === 'confirmed' ? 'Confirmed' : 'Pending' })}
                    disabled={exportRows.length === 0 || exporting}
                    className="mb-1 px-2.5 py-1 rounded-md border border-gray-200 bg-white text-gray-600 text-[11px] font-semibold hover:bg-gray-50 disabled:opacity-40 cursor-pointer disabled:cursor-default transition-colors flex-shrink-0">
                    {exporting ? 'Exporting…' : 'Export'}
                  </button>
                </div>

                {activeTab === 'pending' && (
                  <div className="space-y-2">
                    {buyerPlans.length > 0 && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                        <label className="flex items-center gap-2.5 px-3 py-2 border-b border-gray-100 bg-gray-50 cursor-pointer">
                          <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                            className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600 cursor-pointer flex-shrink-0" />
                          <span className="text-[11px] font-semibold text-gray-500">Select all</span>
                        </label>
                        <div className="divide-y divide-gray-100">
                          {buyerPlans.map(p => (
                            <PlanRow key={p.id} plan={p} selected={selectedIds.includes(p.id)} onToggleSelected={() => toggleSelected(p.id)}
                              onSaved={() => { refetch(); onChanged?.() }} />
                          ))}
                        </div>
                        {selectedPlans.length === 1 && !creatingGroup && (
                          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-indigo-100 border-t border-indigo-200">
                            <span className="text-[11px] text-indigo-800">1 selected · vendor is {selectedPlans[0].vendor_name || 'its own'}</span>
                            <button type="button" onClick={() => quickConfirm([selectedPlans[0].id], selectedPlans[0].supplier_org_id)} disabled={quickConfirmingId === selectedPlans[0].id}
                              className="px-2.5 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer disabled:cursor-default transition-colors">
                              {quickConfirmingId === selectedPlans[0].id ? 'Confirming…' : 'Confirm'}
                            </button>
                          </div>
                        )}
                        {selectedPlans.length > 1 && !creatingGroup && (
                          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-indigo-100 border-t border-indigo-200">
                            <span className="text-[11px] text-indigo-800">
                              {selectedPlans.length} selected{sharedVendorId ? ` · vendor is ${selectedPlans[0].vendor_name || 'its own'}` : ' · mixed vendors'}
                            </span>
                            <div className="flex items-center gap-2">
                              <button type="button"
                                onClick={() => quickConfirm(selectedPlans.map(p => p.id), sharedVendorId)}
                                disabled={quickConfirmingId === 'multi'}
                                className="px-2.5 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer disabled:cursor-default transition-colors">
                                {quickConfirmingId === 'multi' ? 'Confirming…' : 'Confirm'}
                              </button>
                              <button type="button"
                                onClick={() => setCreatingGroup(true)}
                                className="px-2.5 py-1 rounded-md border border-indigo-200 bg-white text-indigo-700 text-[11px] font-semibold hover:bg-indigo-100 cursor-pointer transition-colors">
                                Create Group
                              </button>
                            </div>
                          </div>
                        )}
                        {creatingGroup && (
                          <CreateGroupInline
                            buyerName={activeBuyerName}
                            selectedPlans={selectedPlans}
                            onCancel={() => setCreatingGroup(false)}
                            onSaved={handleComposerSaved}
                          />
                        )}
                      </div>
                    )}

                    {unconfirmedGroups.map(g => (
                      <GroupCard
                        key={g.id}
                        group={g}
                        showBuyerList={showBuyerList}
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

                    {buyerPlans.length === 0 && unconfirmedGroups.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-8">Nothing pending</p>
                    )}
                  </div>
                )}

                {activeTab === 'confirmed' && (
                  <div className="space-y-2">
                    {confirmedGroups.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-8">No confirmed groups yet</p>
                    ) : (
                      confirmedGroups.map(g => (
                        <GroupCard
                          key={g.id}
                          group={g}
                          showBuyerList={showBuyerList}
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
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
