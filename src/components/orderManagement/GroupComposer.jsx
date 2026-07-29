import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import SearchableSelect from '../ui/SearchableSelect'
import { useShipmentContainerActions } from '../../hooks/useShipmentContainerActions'
import { useInvoiceDetailsForm } from '../../hooks/useInvoiceDetailsForm'

const gl = 'block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5'
const gi = 'w-full px-2 py-1.5 rounded-md text-xs text-black bg-gray-100 border border-gray-200 focus:outline-none focus:border-gray-900 transition-colors'

const cancelCls = 'px-2.5 py-1 rounded-md border border-gray-200 bg-white text-gray-700 text-[11px] font-semibold hover:bg-gray-50 disabled:opacity-50 cursor-pointer disabled:cursor-default transition-colors'
const saveCls = 'px-2.5 py-1 rounded-md bg-gray-900 text-white text-[11px] font-semibold hover:bg-gray-700 disabled:opacity-50 cursor-pointer disabled:cursor-default transition-colors'

// Both of these render inline inside MyShipmentPlansDrawer.jsx — a modal
// stacked on top of the drawer read as two overlapping overlays, so
// creating/editing a group now expands in place instead.

// Batches already-selected plans (selection is owned by the drawer's own
// checkboxes, not duplicated here) into a new bare group — private until
// separately confirmed — with the merchant's chosen primary vendor
// persisted at creation time; vendor is known to whoever plans the
// shipment, not to logistics, so it belongs here rather than at raise time.
export function CreateGroupInline({ buyerName, selectedPlans, onCancel, onSaved }) {
  const { createGroupFromPlans } = useShipmentContainerActions()
  const [vendorId, setVendorId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const totalCbm = selectedPlans.reduce((sum, p) => sum + (Number(p.cbm) || 0), 0)

  const vendorOptions = useMemo(() => {
    const seen = new Map()
    selectedPlans.forEach(p => {
      if (p.supplier_org_id && !seen.has(p.supplier_org_id)) seen.set(p.supplier_org_id, p.vendor_name || p.supplier_org_id)
    })
    return [...seen.entries()].map(([value, label]) => ({ value, label }))
  }, [selectedPlans])

  // A single shared vendor needs no choice at all — auto-selected. With more
  // than one, there's no correct default, so a pick becomes mandatory
  // instead of the old always-optional field (which let a group with mixed
  // vendors save with none chosen at all).
  const needsVendorChoice = vendorOptions.length > 1
  const effectiveVendorId = vendorOptions.length === 1
    ? vendorOptions[0].value
    : (vendorOptions.some(v => v.value === vendorId) ? vendorId : '')

  const handleSubmit = async () => {
    if (submitting || selectedPlans.length === 0) return
    if (needsVendorChoice && !effectiveVendorId) {
      setError('These POs have different vendors — pick the primary one.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createGroupFromPlans(selectedPlans.map(p => p.id), effectiveVendorId || null)
      onSaved?.()
    } catch (err) {
      setError(err.message || 'Failed to create group')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="px-3 py-3 bg-indigo-100 border-t border-indigo-200 space-y-2">
      <div className="text-[11px] font-semibold text-indigo-800">
        {selectedPlans.length} selected · {totalCbm.toFixed(2)} m³ total{buyerName ? ` · ${buyerName}` : ''}
      </div>
      {needsVendorChoice ? (
        <div>
          <label className={gl}>Primary Vendor <span className="text-red-500">*</span></label>
          <SearchableSelect
            options={vendorOptions}
            value={effectiveVendorId}
            onChange={v => setVendorId(v)}
            placeholder="Select vendor"
            triggerClassName={`${gi} appearance-none`}
            dropdownClassName="border border-gray-200 rounded-lg mt-0.5 shadow-lg"
          />
        </div>
      ) : vendorOptions.length === 1 ? (
        <div>
          <label className={gl}>Vendor</label>
          <div className="text-xs text-gray-800 px-2 py-1.5">{vendorOptions[0].label}</div>
        </div>
      ) : null}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} disabled={submitting} className={cancelCls}>Cancel</button>
        <button type="button" onClick={handleSubmit} disabled={submitting || selectedPlans.length === 0} className={saveCls}>
          {submitting ? 'Creating…' : 'Create Group'}
        </button>
      </div>
    </div>
  )
}

// Edits an existing bare (not-yet-raised) group's CBM/PO composition/vendor
// — the merchant's own group, from creation until logistics raises the
// invoice on it. Reuses useInvoiceDetailsForm exactly as the old
// PlannedPosPane.jsx's GroupEditor did; the only addition is the vendor
// field, which that component never exposed since vendor selection used to
// happen at raise time (logistics), not grouping time (merchant).
export function EditGroupInline({ group, plans, onCancel, onSaved }) {
  const {
    submitting, error, invoice, setInvoice, handleSave,
  } = useInvoiceDetailsForm({ active: true, buyerOrgId: group.buyer_org_id, invoiceGroup: group, onSaved })
  const [poSearch, setPoSearch] = useState('')
  // Separate from the hook's own `error` (which only ever reflects a failed
  // save) — this catches "forgot to pick a vendor"/"no POs left" on click,
  // so hitting Save explains what's missing instead of doing nothing.
  const [validationError, setValidationError] = useState(null)

  // Per-PO planned CBM — needed to auto-total the group's CBM as POs are
  // added/removed. This group's own already-grouped plans don't come
  // through useMyShipmentPlans (that only surfaces draft/pending), so fetch
  // them directly by shipment_invoice_id.
  const [groupPlanCbm, setGroupPlanCbm] = useState({})
  useEffect(() => {
    let cancelled = false
    supabase.from('po_shipment_plans').select('po_id, cbm').eq('shipment_invoice_id', group.id)
      .then(({ data }) => {
        if (cancelled) return
        setGroupPlanCbm(Object.fromEntries((data || []).map(p => [p.po_id, p.cbm])))
      })
    return () => { cancelled = true }
  }, [group.id])

  const buyerPlans = useMemo(() => plans.filter(p => p.buyer_org_id === group.buyer_org_id), [plans, group.buyer_org_id])

  const cbmByPoId = useMemo(() => {
    const map = { ...groupPlanCbm }
    buyerPlans.forEach(p => { map[p.po_id] = p.cbm })
    return map
  }, [groupPlanCbm, buyerPlans])

  const poOptions = useMemo(() => {
    const seen = new Map()
    ;(group.pos ?? []).forEach(po => seen.set(po.id, { po_number: po.po_number, vendor: po.actual_vendor_name, vendor_id: po.actual_vendor_id }))
    buyerPlans.forEach(p => { if (!seen.has(p.po_id)) seen.set(p.po_id, { po_number: p.po_number, vendor: p.vendor_name, vendor_id: p.supplier_org_id }) })
    return [...seen.entries()].map(([value, info]) => ({ value, po_number: info.po_number || value, vendor: info.vendor, vendor_id: info.vendor_id }))
  }, [group.pos, buyerPlans])

  const filteredPoOptions = useMemo(() => {
    const term = poSearch.trim().toLowerCase()
    if (!term) return poOptions
    return poOptions.filter(o => o.po_number.toLowerCase().includes(term) || o.vendor?.toLowerCase().includes(term))
  }, [poOptions, poSearch])

  // Recomputed from whichever POs are currently checked, not the group's
  // original composition — so adding/removing a PO immediately narrows or
  // widens the vendor choices instead of leaving stale options on screen.
  const vendorOptions = useMemo(() => {
    const seen = new Map()
    invoice.po_ids.forEach(id => {
      const opt = poOptions.find(o => o.value === id)
      if (opt?.vendor_id && !seen.has(opt.vendor_id)) seen.set(opt.vendor_id, opt.vendor || opt.vendor_id)
    })
    return [...seen.entries()].map(([value, label]) => ({ value, label }))
  }, [poOptions, invoice.po_ids])

  // A single shared vendor needs no choice — auto-fill it. With more than
  // one, keep whatever's picked only if it still belongs to the selection,
  // otherwise clear it so a stale/invalid vendor can't silently save.
  const needsVendorChoice = vendorOptions.length > 1
  const expectedVendorId = vendorOptions.length === 1
    ? vendorOptions[0].value
    : (vendorOptions.some(v => v.value === invoice.primary_vendor_org_id) ? invoice.primary_vendor_org_id : '')

  // CBM is never independently editable — it's always the sum of the
  // selected POs' own planned figures, full stop, so it can't drift from
  // what the group actually contains.
  const totalCbm = invoice.po_ids.reduce((sum, id) => sum + (Number(cbmByPoId[id]) || 0), 0)
  const expectedCbm = String(totalCbm)

  // Both corrections adjusted during render (not an effect or the toggle
  // handler) so they're already right even on first load, before any
  // checkbox is touched. Combined into one setInvoice call — two separate
  // conditional calls in the same render would each spread this render's
  // stale `invoice`, so the second call would silently undo the first.
  if (invoice.primary_vendor_org_id !== expectedVendorId || invoice.cbm !== expectedCbm) {
    setInvoice({ ...invoice, primary_vendor_org_id: expectedVendorId, cbm: expectedCbm })
  }

  const togglePo = (id) => {
    const po_ids = invoice.po_ids.includes(id) ? invoice.po_ids.filter(x => x !== id) : [...invoice.po_ids, id]
    setInvoice({ ...invoice, po_ids })
  }

  const handleSaveClick = () => {
    if (submitting) return
    if (invoice.po_ids.length === 0) { setValidationError('Select at least one PO.'); return }
    if (needsVendorChoice && !invoice.primary_vendor_org_id) {
      setValidationError('These POs have different vendors — pick the primary one.')
      return
    }
    setValidationError(null)
    handleSave()
  }

  const displayError = validationError || error

  return (
    <div className="px-3 py-3 bg-white space-y-3">
      {needsVendorChoice ? (
        <div>
          <label className={gl}>Primary Vendor <span className="text-red-500">*</span></label>
          <SearchableSelect
            options={vendorOptions}
            value={invoice.primary_vendor_org_id}
            onChange={v => setInvoice({ ...invoice, primary_vendor_org_id: v })}
            placeholder="Select vendor"
            triggerClassName={`${gi} appearance-none`}
            dropdownClassName="border border-gray-200 rounded-lg mt-0.5 shadow-lg"
          />
        </div>
      ) : vendorOptions.length === 1 ? (
        <div>
          <label className={gl}>Vendor</label>
          <div className="text-xs text-gray-800 px-2 py-1.5">{vendorOptions[0].label}</div>
        </div>
      ) : (
        <div>
          <label className={gl}>Vendor</label>
          <div className="text-xs text-gray-500 px-2 py-1.5">Select POs first</div>
        </div>
      )}
      <div>
        <label className={gl}>CBM</label>
        <div className="text-xs text-gray-800 px-2 py-1.5 rounded-md bg-gray-100 border border-gray-200">{totalCbm.toFixed(2)} m³</div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={gl}>Planned POs</label>
          <span className="text-[10px] text-gray-400">{invoice.po_ids.length} selected</span>
        </div>
        <input
          type="text"
          value={poSearch}
          onChange={e => setPoSearch(e.target.value)}
          placeholder="Search PO # or vendor…"
          className={`${gi} mb-1.5`}
        />
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto bg-white">
          {filteredPoOptions.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">No planned POs match</p>
          )}
          {filteredPoOptions.map(opt => {
            const checked = invoice.po_ids.includes(opt.value)
            return (
              <label key={opt.value}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors
                  ${checked ? 'bg-indigo-200 border-l-2 border-l-indigo-600' : 'border-l-2 border-l-transparent hover:bg-gray-50'}`}>
                <input type="checkbox" checked={checked} onChange={() => togglePo(opt.value)}
                  className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600 cursor-pointer flex-shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-gray-900">{opt.po_number}</span>
                  {opt.vendor && <span className="text-xs text-gray-400 ml-1.5">{opt.vendor}</span>}
                </span>
                {cbmByPoId[opt.value] != null && (
                  <span className="text-[10px] font-semibold text-gray-500 flex-shrink-0">{cbmByPoId[opt.value]} m³</span>
                )}
              </label>
            )
          })}
        </div>
      </div>
      {displayError && <p className="text-[11px] text-red-600">{displayError}</p>}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={submitting} className={cancelCls}>Cancel</button>
        <button type="button" onClick={handleSaveClick} disabled={submitting} className={saveCls}>
          {submitting ? 'Saving…' : 'Save Group'}
        </button>
      </div>
    </div>
  )
}
