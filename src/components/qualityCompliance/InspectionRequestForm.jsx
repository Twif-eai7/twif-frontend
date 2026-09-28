import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useOrgDepartment, useOrgId, useProfileStore } from '../../stores/profileStore'
import { useAuthStore } from '../../stores/authStore'
import SearchableSelect from '../ui/SearchableSelect'
import { uploadToIrfBucket } from '../../lib/irfStorage'
import { createInspectionRequest, addRequestAttachment } from '../../hooks/useInspectionRequests'
import { createSchedule } from '../../hooks/useInspectionSchedule'

const STAGES = [
  { value: 'inline',  label: 'Inline' },
  { value: 'midline', label: 'Midline' },
  { value: 'final',   label: 'Final' },
]

const POLICY_POINTS = [
  'Any inspection cancelled by the vendor after confirmation shall be treated as an Aborted Inspection and will attract an incidental charge of Rs. 10,000 per occurrence.',
  'Any request for inspection cancellation, postponement, or re-inspection must be communicated with a minimum notice period of 48 hours prior to the scheduled inspection date.',
  'Failure to provide the required 48-hour notice period shall result in the applicable Aborted Inspection charges being levied.',
  'Re-inspections arising due to production delays, quality issues, packing deficiencies, material non-readiness, or any other vendor-related reasons shall be chargeable separately as per the agreed inspection terms and conditions.',
]

const MAX_FILES = 10

function Field({ label, required, children, hint }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

const inputCls = 'w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900'

// Shared by two audiences: Merchant QA/Tech (any PO, picking the vendor to
// fill in on their behalf - the original design) and, now, a Supplier
// submitting their own request directly (Sidebar.jsx's "IRF" tab, replacing
// what used to be a link out to an external Google Form). `isSupplier`
// switches three things: who's allowed to submit at all (no department
// gate - any Supplier member reaching this tab can request an inspection
// for their own PO), which POs the picker offers (only ones where this
// org is the linked supplier, not every PO in the system), and pre-filling
// the vendor identity fields from the submitter's own org/login instead of
// leaving them blank for a QA to type in.
export default function InspectionRequestForm() {
  const dept = useOrgDepartment()
  const orgId = useOrgId()
  const orgType = useProfileStore(s => s.orgMembership?.orgType)
  const orgDisplayName = useProfileStore(s => s.orgMembership?.orgDisplayName || '')
  const isSupplier = orgType === 'supplier'
  const canManage = isSupplier || dept === 'qa' || dept === 'tech'
  const userName = useProfileStore(s => s.orgMembership?.fullName || '')
  const userEmail = useAuthStore(s => s.session?.user?.email || '')

  const [poId, setPoId]           = useState('')
  const [poOptions, setPoOptions] = useState([])
  const [poLoading, setPoLoading] = useState(false)
  const [poIndex, setPoIndex]     = useState({})

  // Supplier-only SKU picker (same "open SKUs, checkbox list, Select All"
  // pattern InspectionScheduleForm.jsx's own "SKUs to Schedule" already
  // uses, simplified - no scheduling-specific badges/remaining-qty math,
  // since a request isn't a confirmed schedule entry yet). Leaving every
  // box unchecked means "the whole PO", same convention as that form.
  const [poLineItems, setPoLineItems] = useState([])
  const [poLineItemsLoading, setPoLineItemsLoading] = useState(false)
  const [selectedSkuIds, setSelectedSkuIds] = useState(() => new Set())
  const [skuSearch, setSkuSearch] = useState('')

  const [vendorName, setVendorName]         = useState('')
  const [buyerName, setBuyerName]           = useState('')
  const [contactName, setContactName]       = useState('')
  const [mobileNo, setMobileNo]             = useState('')
  const [vendorEmail, setVendorEmail]       = useState('')
  const [factoryAddress, setFactoryAddress] = useState('')

  const [stage, setStage]           = useState('inline')
  const [shipDate, setShipDate]     = useState('')
  const [skuCount, setSkuCount]     = useState('')
  const [skuNo, setSkuNo]           = useState('')
  const [greenSeal, setGreenSeal]   = useState('')
  const [orderQty, setOrderQty]     = useState('')
  const [requestDate, setRequestDate] = useState('')

  // Supplier's own identity, pre-filled once profile data resolves - still
  // editable after, since the person filling this in (a factory's own
  // merchandiser) isn't always the same as whoever's logged in. Runs once
  // per mount (empty-string check), not on every keystroke elsewhere in the
  // form - a Merchant QA/Tech submitter's fields are left untouched here
  // (isSupplier false, effect no-ops).
  useEffect(() => {
    if (!isSupplier) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVendorName(v => v || orgDisplayName)
    setContactName(v => v || userName)
    setVendorEmail(v => v || userEmail)
  }, [isSupplier, orgDisplayName, userName, userEmail])

  const [files, setFiles]     = useState([])
  const [acked, setAcked]     = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)
  const [successNo, setSuccessNo] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    // A supplier's own orgId isn't resolved until the profile finishes
    // loading - waiting for it here (rather than querying unscoped once and
    // re-filtering client-side) means a supplier never briefly sees every
    // PO in the system, even for one render.
    if (isSupplier && !orgId) return
    let cancelled = false
    setPoLoading(true)
    let query = supabase
      .from('purchase_orders')
      .select(`
        id, po_number,
        buyer_supplier_links!inner (
          supplier_org_id,
          buyer:organizations!buyer_supplier_links_buyer_org_id_fkey (display_name),
          supplier:organizations!buyer_supplier_links_supplier_org_id_fkey (display_name, address, city, state, zip, country)
        )
      `)
      .is('deleted_at', null)
      .is('delete_meta', null)
      .order('po_received_date', { ascending: false })
      .limit(200)
    // Supplier picks only from their own POs, strictly status='open' (not
    // received/partial/closed too - a supplier requesting an inspection has
    // no reason to pick a PO that's already been received or fully closed
    // out). A Merchant QA/Tech member (the original audience) still sees
    // every non-closed PO regardless of received/partial/open, since
    // they're filling this in on a vendor's behalf and need to find any of
    // them, not just the strictly-open ones.
    query = isSupplier ? query.eq('status', 'open').eq('buyer_supplier_links.supplier_org_id', orgId) : query.neq('status', 'closed')
    query.then(({ data }) => {
        if (cancelled) return
        setPoOptions((data || []).map(po => ({ value: po.id, label: po.po_number })))
        setPoIndex(Object.fromEntries((data || []).map(po => [po.id, po])))
        setPoLoading(false)
      })
    return () => { cancelled = true }
  }, [isSupplier, orgId])

  // Selecting a PO pre-fills the vendor/buyer identity fields from the linked
  // orgs — the whole point of doing this in-app rather than on a blank form.
  const handlePoChange = (id) => {
    setPoId(id)
    setSelectedSkuIds(new Set())
    setSkuQuantities({})
    setSkuSearch('')
    const po = poIndex[id]
    if (!po) return
    const supplier = po.buyer_supplier_links?.supplier
    const buyer = po.buyer_supplier_links?.buyer
    setVendorName(supplier?.display_name || '')
    setBuyerName(buyer?.display_name || '')
    setFactoryAddress([supplier?.address, supplier?.city, supplier?.state, supplier?.zip, supplier?.country].filter(Boolean).join(', '))
  }

  // Open SKUs on the selected PO, supplier flow only - Merchant QA/Tech
  // keeps the original free-text Total SKU Count/SKU No./Total Order Qty
  // fields instead (unchanged below), so this never fetches for them.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isSupplier || !poId) { setPoLineItems([]); return }
    let cancelled = false
    setPoLineItemsLoading(true)
    supabase.from('purchase_orders')
      .select('po_line_items(id, buyer_sku_ref, sku_variant, status, quantity_ordered)')
      .eq('id', poId).single()
      .then(({ data }) => {
        if (cancelled) return
        setPoLineItems((data?.po_line_items || []).filter(li => li.status?.toLowerCase() === 'open'))
        setPoLineItemsLoading(false)
      })
    return () => { cancelled = true }
  }, [isSupplier, poId])

  const filteredSkuList = skuSearch.trim()
    ? poLineItems.filter(li => (li.buyer_sku_ref || '').toLowerCase().includes(skuSearch.trim().toLowerCase()))
    : poLineItems
  // Quantity to request per checked SKU - defaults to the SKU's full order
  // quantity the moment it's ticked (same "starts at the full amount,
  // editable down" behavior InspectionScheduleForm.jsx's own per-SKU
  // quantity input has), not left blank.
  const [skuQuantities, setSkuQuantities] = useState({})
  const toggleSku = (li) => setSelectedSkuIds(prev => {
    const next = new Set(prev)
    if (next.has(li.id)) {
      next.delete(li.id)
    } else {
      next.add(li.id)
      setSkuQuantities(q => (li.id in q ? q : { ...q, [li.id]: li.quantity_ordered }))
    }
    return next
  })
  const clampSkuQuantity = (raw, max) => {
    const n = Number(raw)
    if (raw === '' || Number.isNaN(n)) return ''
    return Math.max(0, Math.min(max ?? n, n))
  }
  const allSkusSelected = poLineItems.length > 0 && selectedSkuIds.size === poLineItems.length
  const toggleAllSkus = () => {
    if (allSkusSelected) { setSelectedSkuIds(new Set()); return }
    setSelectedSkuIds(new Set(poLineItems.map(li => li.id)))
    setSkuQuantities(q => {
      const next = { ...q }
      for (const li of poLineItems) if (!(li.id in next)) next[li.id] = li.quantity_ordered
      return next
    })
  }

  const addFiles = (list) => {
    const incoming = Array.from(list || [])
    if (!incoming.length) return
    setFiles(prev => [...prev, ...incoming].slice(0, MAX_FILES))
    if (fileRef.current) fileRef.current.value = ''
  }
  const removeFile = (i) => setFiles(prev => prev.filter((_, idx) => idx !== i))

  // Ship Date, Total SKU Count, SKU No., Total Order Qty and Green Seal
  // Sample Available are hidden for a supplier's own self-service form -
  // ship_date is still a NOT NULL column (see 20260806_create_inspection_requests.sql)
  // though, so it falls back to the one date a supplier IS asked for
  // (requestDate) rather than leaving it uncollected. Merchant QA/Tech's
  // form is unchanged - both fields stay visible and independent there.
  const effectiveShipDate = isSupplier ? requestDate : shipDate

  const canSubmit = canManage && acked && poId && vendorName.trim() && buyerName.trim()
    && contactName.trim() && mobileNo.trim() && vendorEmail.trim() && factoryAddress.trim()
    && stage && effectiveShipDate && requestDate && !saving

  // Selected SKUs (supplier flow) - a non-empty selection scopes the
  // request/schedule entry to just those, same "leave unchecked = whole PO"
  // convention InspectionScheduleForm.jsx's own picker uses. Also stands in
  // for the free-text Total SKU Count/SKU No./Total Order Qty fields
  // Merchant's form still asks for manually - derived here instead so the
  // request row stays just as complete without asking a supplier to retype
  // numbers the SKU picker already knows.
  const selectedSkus = isSupplier
    ? poLineItems
        .filter(li => selectedSkuIds.has(li.id))
        // The edited quantity (skuQuantities), not the SKU's raw order
        // quantity - a partial request (e.g. only 50 of 200 ready to
        // inspect) must carry through to the request summary AND the
        // schedule entry's own line_items, not just the picker's display.
        .map(li => ({ ...li, quantity_ordered: Number(skuQuantities[li.id] ?? li.quantity_ordered) || 0 }))
    : []

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError(null)

    const { data: request, error: reqErr } = await createInspectionRequest({
      po_id: poId,
      po_number: poIndex[poId]?.po_number || null,
      vendor_name: vendorName.trim(),
      buyer_name: buyerName.trim(),
      vendor_contact_name: contactName.trim(),
      vendor_mobile_no: mobileNo.trim(),
      vendor_email: vendorEmail.trim(),
      factory_address: factoryAddress.trim(),
      inspection_type: stage,
      ship_date: effectiveShipDate,
      total_sku_count: isSupplier
        ? (selectedSkus.length || poLineItems.length || null)
        : (skuCount === '' ? null : Number(skuCount)),
      sku_no: isSupplier
        ? (selectedSkus.length ? selectedSkus.map(li => li.buyer_sku_ref).filter(Boolean).join(', ') : null)
        : (skuNo.trim() || null),
      green_seal_available: greenSeal === '' ? null : greenSeal === 'yes',
      total_order_qty: isSupplier
        ? (selectedSkus.length
            ? selectedSkus.reduce((sum, li) => sum + (Number(li.quantity_ordered) || 0), 0)
            : (poLineItems.length ? poLineItems.reduce((sum, li) => sum + (Number(li.quantity_ordered) || 0), 0) : null))
        : (orderQty === '' ? null : Number(orderQty)),
      inspection_request_date: requestDate,
      policy_acknowledged: true,
      submitted_by: userName || null,
      submitted_by_email: userEmail || null,
    })
    if (reqErr) { setError(reqErr.message); setSaving(false); return }

    // Per-file so one bad upload doesn't discard the rest of the batch.
    const failures = []
    for (const file of files) {
      try {
        const path = await uploadToIrfBucket(file, `${request.id}/po`)
        const { error: attErr } = await addRequestAttachment({
          request_id: request.id, storage_path: path, file_name: file.name,
        })
        if (attErr) throw attErr
      } catch (err) {
        failures.push(`${file.name}: ${err?.message || 'upload failed'}`)
      }
    }

    const { error: schErr } = await createSchedule({
      po_id: poId,
      inspection_type: stage,
      scheduled_date: requestDate,
      assigned_qa_id: null,
      status: 'requested',
      request_id: request.id,
      // null = every open SKU on the PO (same convention InspectionScheduleForm.jsx's
      // own createSchedule calls already use) - only set when the supplier
      // actually ticked specific SKUs, not just because some were open to pick from.
      line_items: selectedSkus.length ? selectedSkus.map(li => ({ id: li.id, quantity: li.quantity_ordered })) : null,
      created_by: userName || null, created_by_email: userEmail || null,
    })
    setSaving(false)
    if (schErr) { setError(`Request saved as ${request.request_no}, but adding it to the calendar failed: ${schErr.message}`); return }
    if (failures.length) setError(`Request saved, but some attachments failed: ${failures.join('; ')}`)
    setSuccessNo(request.request_no)
  }

  const resetForm = () => {
    setSuccessNo(null); setError(null)
    setPoId(''); setBuyerName(''); setMobileNo('')
    setFactoryAddress(''); setStage('inline'); setShipDate('')
    setSkuCount(''); setSkuNo(''); setGreenSeal(''); setOrderQty(''); setRequestDate('')
    setFiles([]); setAcked(false)
    setSelectedSkuIds(new Set()); setSkuQuantities({}); setSkuSearch('')
    // Vendor Name/Contact Name/Vendor E-Mail are locked+pre-filled from the
    // supplier's own login for that flow (see the isSupplier prefill effect
    // above) - clearing them here would leave a read-only field permanently
    // blank, since nothing re-fills it after this first mount-time effect.
    // Merchant's form still clears them, since they're a free-text field
    // meant to be re-typed per request there.
    if (!isSupplier) { setVendorName(''); setContactName(''); setVendorEmail('') }
  }

  if (successNo) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-white border border-emerald-200 rounded-xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900">Inspection request submitted</h2>
          <p className="text-sm text-gray-500 mt-1">Reference <span className="font-semibold text-gray-800">{successNo}</span></p>
          <p className="text-xs text-gray-500 mt-3">It now appears on the Inspection Schedule calendar as <span className="font-semibold">Requested</span>. Assign a QA there to confirm it.</p>
          {error && <p className="text-xs text-amber-600 mt-3">{error}</p>}
          <button
            type="button"
            onClick={resetForm}
            className="mt-5 px-4 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 transition-colors cursor-pointer"
          >
            Submit another request
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 w-full">
      <h1 className="text-lg font-bold text-gray-900">Inspection Request Form</h1>
      <p className="text-xs text-gray-500 mt-0.5 mb-4">
        Submitting adds a <span className="font-semibold">Requested</span> entry to the Inspection Schedule calendar.
      </p>

      {!canManage && (
        <p className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          View only. Only QA and Tech members can submit inspection requests.
        </p>
      )}

      {/* Policy acknowledgement */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-bold text-gray-900">Inspection Cancellation &amp; Re-Inspection Policy</h2>
        <ol className="mt-2.5 space-y-2 list-decimal list-inside">
          {POLICY_POINTS.map((p, i) => (
            <li key={i} className="text-xs text-gray-600 leading-relaxed">{p}</li>
          ))}
        </ol>
        <p className="text-xs text-gray-600 leading-relaxed mt-2.5">
          All charges associated with aborted inspections and re-inspections shall be borne by the vendor and shall be payable as per the applicable service agreement.
        </p>
        <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
          <input
            type="checkbox"
            checked={acked}
            onChange={e => setAcked(e.target.checked)}
            disabled={!canManage}
            className="mt-0.5 w-4 h-4 accent-gray-900 cursor-pointer"
          />
          <span className="text-xs font-semibold text-gray-800">Vendor Acknowledgement &amp; Acceptance<span className="text-red-500 ml-0.5">*</span></span>
        </label>
      </div>

      <fieldset disabled={!canManage} className="space-y-4">
        {/* PO & parties */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <Field label="PO No." required hint="Selecting a PO fills in the vendor, buyer and factory address below.">
            <SearchableSelect
              options={poOptions}
              value={poId}
              onChange={handlePoChange}
              loading={poLoading}
              placeholder="Search PO number…"
              triggerClassName="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-400"
              dropdownClassName="rounded-lg border border-gray-200"
            />
          </Field>

          {/* Supplier-only SKU picker, same look/behavior as InspectionScheduleForm.jsx's
              own "SKUs to Schedule" - shown once a PO is picked, quantity ordered next to
              each SKU, checkbox list, Select All, search. Leaving everything unchecked
              (the default) requests the whole PO, same convention as that form. */}
          {isSupplier && poId && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  SKUs to Request
                  {!poLineItemsLoading && poLineItems.length > 0 && (
                    <span className="ml-1.5 normal-case font-medium text-gray-400">
                      ({selectedSkuIds.size > 0 ? `${selectedSkuIds.size} of ${poLineItems.length} selected` : `${poLineItems.length} open`})
                    </span>
                  )}
                </label>
                {poLineItems.length > 0 && (
                  <button type="button" onClick={toggleAllSkus} className="text-[11px] font-semibold text-gray-600 hover:text-gray-900 cursor-pointer">
                    {allSkusSelected ? 'Clear' : 'Select All'}
                  </button>
                )}
              </div>
              {poLineItemsLoading ? (
                <p className="text-[11px] text-gray-400">Loading SKUs…</p>
              ) : poLineItems.length === 0 ? (
                <p className="text-[11px] text-gray-400">No open SKUs on this PO.</p>
              ) : (
                <>
                  <input
                    type="text"
                    value={skuSearch}
                    onChange={e => setSkuSearch(e.target.value)}
                    placeholder="Search SKUs…"
                    className="w-full h-7 px-2 mb-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gray-900"
                  />
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[40vh] overflow-y-auto">
                    {filteredSkuList.length === 0 && (
                      <p className="text-[11px] text-gray-400 px-3 py-2">No SKUs match "{skuSearch}".</p>
                    )}
                    {filteredSkuList.map(li => {
                      const checked = selectedSkuIds.has(li.id)
                      return (
                        <div key={li.id} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50">
                          <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSku(li)}
                              className="w-3.5 h-3.5 flex-shrink-0"
                            />
                            <span className="font-semibold truncate text-gray-800">
                              {li.buyer_sku_ref || '-'}
                              {li.sku_variant && <span className="text-gray-400 font-normal"> · {li.sku_variant}</span>}
                            </span>
                          </label>
                          {/* Editable once ticked - starts at the SKU's full order
                              quantity, same as InspectionScheduleForm.jsx's own per-SKU
                              quantity input; unticked rows just show the order quantity
                              as plain reference text, nothing to edit yet. */}
                          {checked ? (
                            <input
                              type="number"
                              min={0}
                              max={li.quantity_ordered || undefined}
                              value={skuQuantities[li.id] ?? ''}
                              onChange={e => setSkuQuantities(q => ({ ...q, [li.id]: clampSkuQuantity(e.target.value, li.quantity_ordered) }))}
                              onWheel={e => e.currentTarget.blur()}
                              title="Quantity to inspect"
                              className="w-16 flex-shrink-0 text-xs px-1.5 py-1 text-right border border-gray-200 rounded-md focus:outline-none focus:border-gray-900"
                            />
                          ) : (
                            <span className="flex-shrink-0 text-gray-400 tabular-nums">Qty {li.quantity_ordered ?? '-'}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {selectedSkuIds.size === 0 && (
                    <p className="text-[10px] text-gray-400 mt-1">Leave all unchecked to request the whole PO.</p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Vendor Name" required hint={isSupplier ? 'Your own organisation - locked.' : undefined}>
              <input
                className={`${inputCls} ${isSupplier ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
                value={vendorName}
                onChange={e => setVendorName(e.target.value)}
                readOnly={isSupplier}
              />
            </Field>
            <Field label="Buyer Name" required>
              <input className={inputCls} value={buyerName} onChange={e => setBuyerName(e.target.value)} />
            </Field>
            <Field label="Vendor Contact Name" required>
              <input className={inputCls} value={contactName} onChange={e => setContactName(e.target.value)} />
            </Field>
            <Field label="Vendor Mobile No" required>
              <input className={inputCls} value={mobileNo} onChange={e => setMobileNo(e.target.value)} />
            </Field>
            <Field label="Vendor E-Mail Id" required>
              <input type="email" className={inputCls} value={vendorEmail} onChange={e => setVendorEmail(e.target.value)} />
            </Field>
          </div>

          <Field label="Factory Address" required>
            <textarea
              rows={2}
              value={factoryAddress}
              onChange={e => setFactoryAddress(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 resize-none"
            />
          </Field>

          <Field label="Attach PO" hint={`Up to ${MAX_FILES} files: PDF, document, image or spreadsheet.`}>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*"
              onChange={e => addFiles(e.target.files)}
              disabled={files.length >= MAX_FILES}
              className="block w-full text-xs text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-900 file:text-white hover:file:bg-gray-700 file:cursor-pointer disabled:opacity-50"
            />
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-xs text-gray-700 truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-gray-400 hover:text-red-500 flex-shrink-0 cursor-pointer"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        </div>

        {/* Inspection detail */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <Field label="Type Of Inspection" required>
            <div className="grid grid-cols-3 gap-1.5 max-w-sm">
              {STAGES.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStage(s.value)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer
                    ${stage === s.value ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Ship Date, Total SKU Count, SKU No., Total Order Qty and
                Green Seal Sample Available are Merchant-QA-only fields - a
                supplier's own self-service form skips them entirely (see
                effectiveShipDate above for how ship_date still gets a real
                value under the hood). */}
            {!isSupplier && (
              <Field label="Ship Date" required>
                <input type="date" className={inputCls} value={shipDate} onChange={e => setShipDate(e.target.value)} />
              </Field>
            )}
            <Field label="Inspection Request Date" required hint="The date this inspection is requested for - this is where it lands on the calendar.">
              <input type="date" className={inputCls} value={requestDate} onChange={e => setRequestDate(e.target.value)} />
            </Field>
            {!isSupplier && (
              <>
                <Field label="Total SKU Count">
                  <input type="number" min="0" className={inputCls} value={skuCount} onChange={e => setSkuCount(e.target.value)} />
                </Field>
                <Field label="SKU No.">
                  <input className={inputCls} value={skuNo} onChange={e => setSkuNo(e.target.value)} />
                </Field>
                <Field label="Total Order Qty">
                  <input type="number" min="0" className={inputCls} value={orderQty} onChange={e => setOrderQty(e.target.value)} />
                </Field>
                <Field label="Green Seal Sample Available">
                  <div className="grid grid-cols-2 gap-1.5 max-w-[12rem]">
                    {[{ v: 'yes', l: 'Yes' }, { v: 'no', l: 'No' }].map(o => (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => setGreenSeal(g => g === o.v ? '' : o.v)}
                        className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer
                          ${greenSeal === o.v ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                </Field>
              </>
            )}
          </div>
        </div>
      </fieldset>

      {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

      <div className="flex items-center justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="px-5 py-2.5 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40 transition-colors cursor-pointer"
        >
          {saving ? 'Submitting…' : 'Submit Request'}
        </button>
      </div>
    </div>
  )
}
