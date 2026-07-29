import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { usePOActions } from '../../hooks/usePOActions'
import { useOrgDepartment, useProfileStore } from '../../stores/profileStore'
import { FALLBACK_RATES, convertToUSD, fetchLiveRates } from '../../utils/formatters'
import { resolveMerchantMemberLinkIds } from '../../lib/poQueries'

// Keyboard-navigable dropdown for PO upload — type to filter, arrows to move, Enter to select
function ComboSelect({ options = [], value = '', onChange, placeholder = 'Select…', disabled = false, loading = false, triggerClassName = '', dropdownClassName = '' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [hi, setHi] = useState(0)
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const selected = options.find(o => String(o.value) === String(value))
  const filtered = search ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())) : options

  useEffect(() => {
    const handler = (e) => { if (!containerRef.current?.contains(e.target)) { setOpen(false); setSearch('') } }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => { setHi(0) }, [search, open])

  useEffect(() => {
    if (!open || !listRef.current) return
    listRef.current.querySelectorAll('[data-opt]')[hi]?.scrollIntoView({ block: 'nearest' })
  }, [hi, open])

  const openDrop = () => {
    if (disabled || loading) return
    setOpen(true); setSearch(''); setHi(0)
    setTimeout(() => inputRef.current?.focus(), 20)
  }

  const pick = (val) => { onChange(val); setOpen(false); setSearch('') }

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const t = filtered[hi] ?? filtered[0]; if (t) pick(t.value) }
    else if (e.key === 'Escape') { setOpen(false); setSearch('') }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <button type="button" onClick={() => open ? (setOpen(false), setSearch('')) : openDrop()} disabled={disabled || loading}
        className={`flex items-center gap-1 w-full text-left ${triggerClassName}`}>
        <span className={`flex-1 truncate min-w-0 ${!selected ? 'opacity-40' : ''}`}>
          {loading ? 'Loading…' : selected ? selected.label : placeholder}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 6" fill="none" className={`flex-shrink-0 ml-0.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className={`absolute left-0 right-0 top-full z-50 bg-white shadow-lg ${dropdownClassName}`}>
          <div className="p-1.5 border-b border-black/[.08]">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/[.04]">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-black/30 flex-shrink-0">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input ref={inputRef} type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={onKey}
                placeholder="Type to filter…" className="flex-1 bg-transparent outline-none text-[12px] placeholder:text-black/30" />
              {search && <button type="button" onClick={() => setSearch('')} className="text-black/30 hover:text-black flex-shrink-0 text-[14px] leading-none">×</button>}
            </div>
          </div>
          <div ref={listRef} className="max-h-44 overflow-y-auto">
            {filtered.length === 0
              ? <p className="px-3 py-2 text-[11px] text-black/40 italic">No results</p>
              : filtered.map((o, i) => (
                <div key={o.value} data-opt onMouseDown={e => { e.preventDefault(); pick(o.value) }} onMouseEnter={() => setHi(i)}
                  className={`px-3 py-1.5 cursor-pointer flex items-center gap-2 text-[12px] ${i === hi ? 'bg-black/[.08]' : 'hover:bg-black/[.04]'} ${String(o.value) === String(value) ? 'font-semibold' : ''}`}>
                  <span className={`w-3.5 text-[10px] flex-shrink-0 ${String(o.value) === String(value) ? '' : 'invisible'}`}>✓</span>
                  {o.label}
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

// ── Shared input classes ──────────────────────────────────────────────────────
const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-colors placeholder:text-gray-400'
const labelCls = 'block text-xs font-semibold text-gray-700 mb-1.5'

function Field({ label, required, children }) {
  return (
    <div>
      <label className={labelCls}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

// ── File upload zone ──────────────────────────────────────────────────────────
function FileZone({ file, onFile, onClear, existingUrl, label = 'Upload Document' }) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx"
        className="hidden" onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]) }} />

      {/* Drop zone — hidden if file selected */}
      {!file && (
        <div
          onClick={() => inputRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-2 px-4 py-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors
            ${drag ? 'border-gray-900 bg-gray-50' : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-white'}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-gray-400">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span className="text-sm font-medium text-gray-600">{label}</span>
          <span className="text-xs text-gray-400">PDF, DOC, DOCX, XLS, XLSX · max 10 MB</span>
        </div>
      )}

      {/* Selected file preview */}
      {file && (
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500 flex-shrink-0">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="text-xs font-medium text-gray-800 flex-1 truncate">{file.name}</span>
          <span className="text-xs text-gray-400 flex-shrink-0">{formatFileSize(file.size)}</span>
          <button type="button" onClick={onClear}
            className="ml-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Existing file chip — edit mode only */}
      {!file && existingUrl && (
        <div className="flex items-center gap-2 mt-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          Existing document on file — upload a new one above to replace it
        </div>
      )}
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function PoUploadModal({ open, onClose, editPo = null, onSuccess }) {
  const { createPO, updatePO } = usePOActions()
  const department    = useOrgDepartment()
  const { orgMembership } = useProfileStore()

  const isEditMode = !!editPo

  // ── Dropdown data ─────────────────────────────────────────────────────────
  const [buyers, setBuyers]   = useState([])
  // links: [{ linkId, supplierName }]
  const [links, setLinks]     = useState([])
  const [loadingBuyers, setLoadingBuyers]       = useState(false)
  const [loadingSuppliers, setLoadingSuppliers] = useState(false)
  // null = unrestricted (admin/owner); array = scoped to member's access
  const allowedLinkIdsRef = useRef(null)

  // ── Form state ────────────────────────────────────────────────────────────
  const [buyerOrgId, setBuyerOrgId]         = useState('')
  const [selectedLinkId, setSelectedLinkId] = useState('')
  const [poDate, setPoDate]               = useState('')
  const [poNumber, setPoNumber]       = useState('')
  const [quantity, setQuantity]       = useState('')
  const [value, setValue]             = useState('')
  const [currency, setCurrency]       = useState('USD')
  const [poFile, setPoFile]           = useState(null)
  const [onBehalfOfId, setOnBehalfOfId] = useState('')
  const [teamMembers, setTeamMembers]   = useState([])

  // ── UI state ──────────────────────────────────────────────────────────────
  const [rates, setRates]             = useState(FALLBACK_RATES)
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState(null)
  const [success, setSuccess]         = useState(false)

  // ── Fetch team members who have access to a given buyer org ─────────────
  const fetchTeamMembersForBuyer = useCallback(async (buyerOrgId) => {
    if (!buyerOrgId || !orgMembership?.memberId) return

    // Step 1 — member IDs with access to this buyer org (exclude self)
    const { data: accessRows } = await supabase
      .from('member_organization_access')
      .select('member_id')
      .eq('organization_id', buyerOrgId)
      .neq('member_id', orgMembership.memberId)

    const memberIds = (accessRows || []).map(r => r.member_id)
    if (!memberIds.length) { setTeamMembers([]); return }

    // Step 2 — resolve names and filter to merchandising non-admin
    const { data: members } = await supabase
      .from('organization_members')
      .select('id, full_name, role, department')
      .in('id', memberIds)

    const filtered = (members || [])
      .filter(m => !['admin', 'owner'].includes(m.role) && m.department === 'merchandising')
      .map(m => ({ id: m.id, full_name: m.full_name }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
    setTeamMembers(filtered)
  }, [orgMembership?.memberId])

  // ── Load buyers + live rates when modal opens ────────────────────────────
  useEffect(() => {
    if (!open) return
    fetchLiveRates().then(setRates)

    const isAdmin  = orgMembership?.role === 'admin' || orgMembership?.role === 'owner'
    const memberId = orgMembership?.memberId

    const loadBuyers = async () => {
      setLoadingBuyers(true)
      try {
        // Scope to member's allowed links for non-admin merchant members
        let linkIds = null
        if (!isAdmin && memberId) {
          linkIds = await resolveMerchantMemberLinkIds(memberId)
          allowedLinkIdsRef.current = linkIds
        }

        if (linkIds !== null && linkIds.length === 0) {
          setBuyers([])
          return
        }

        let query = supabase
          .from('buyer_supplier_links')
          .select('buyer_org_id, buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(id, display_name)')
          .eq('relationship_status', 'active')

        if (linkIds?.length) query = query.in('id', linkIds)

        const { data } = await query
        const map = new Map()
        data?.forEach(l => {
          if (l.buyer && !map.has(l.buyer_org_id)) map.set(l.buyer_org_id, l.buyer.display_name)
        })
        setBuyers([...map.entries()].map(([id, display_name]) => ({ id, display_name }))
          .sort((a, b) => a.display_name.localeCompare(b.display_name)))
      } catch (err) {
        console.error('Failed to load buyers', err)
      } finally {
        setLoadingBuyers(false)
      }
    }

    loadBuyers()
  }, [open, orgMembership?.memberId, orgMembership?.role])

  // ── Pre-fill in edit mode once buyers load ────────────────────────────────
  useEffect(() => {
    if (!editPo || !buyers.length) return
    setPoDate(editPo.po_received_date ?? '')
    setPoNumber(editPo.po_number ?? '')
    setQuantity(editPo.quantity_ordered ?? '')
    setValue(editPo.amount ?? '')
    // Match buyer by name, then load suppliers pre-selecting by supplier name
    const matched = buyers.find(b => b.display_name === editPo.buyer_name)
    if (matched) {
      setBuyerOrgId(matched.id)
      fetchLinksForBuyer(matched.id, editPo.supplier_name ?? null)
    }
  }, [editPo, buyers])

  // ── Reset everything when modal closes ────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setBuyerOrgId(''); setSelectedLinkId(''); setPoDate(''); setPoNumber('')
      setQuantity(''); setValue(''); setCurrency('USD'); setPoFile(null)
      setOnBehalfOfId(''); setTeamMembers([])
      setLinks([]); setError(null); setSuccess(false)
      allowedLinkIdsRef.current = null
    }
  }, [open])

  // ── Fetch suppliers for a buyer ───────────────────────────────────────────
 const fetchLinksForBuyer = useCallback(async (buyerId, preselectSupplierName) => {
  if (!buyerId) {
    setLinks([])
    setSelectedLinkId('')
    return
  }

  setLoadingSuppliers(true)

  let suppliersQuery = supabase
    .from('buyer_supplier_links')
    .select(`
      id,
      buyer_org_id,
      supplier_org_id,
      buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(display_name),
      supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(display_name)
    `)
    .eq('buyer_org_id', buyerId)
    .eq('relationship_status', 'active')

  const scopedIds = allowedLinkIdsRef.current
  if (scopedIds !== null && scopedIds.length > 0) suppliersQuery = suppliersQuery.in('id', scopedIds)

  const { data } = await suppliersQuery

  const list = (data || []).map(l => ({
    linkId: l.id,
    buyerOrgId: l.buyer_org_id,
    supplierOrgId: l.supplier_org_id,
    buyerName: l.buyer?.display_name ?? '—',
    supplierName: l.supplier?.display_name ?? '—',
  }))

  setLinks(list)

  // preselect logic (edit mode)
  if (preselectSupplierName) {
    const match = list.find(l => l.supplierName === preselectSupplierName)
    if (match) setSelectedLinkId(match.linkId)
  } else if (list.length === 1) {
    setSelectedLinkId(list[0].linkId)
  } else {
    setSelectedLinkId('')
  }

  setLoadingSuppliers(false)
}, [])

  const handleBuyerChange = (id) => {
    setBuyerOrgId(id)
    fetchLinksForBuyer(id, null)
    setOnBehalfOfId('')
    setTeamMembers([])
    if (id) fetchTeamMembersForBuyer(id)
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e, test = false) => {
    e.preventDefault()
    if (submitting) return
    setError(null)
    const amountUsd = convertToUSD(parseFloat(value), currency, rates)
    const payload = {
      buyerSupplierLinkId: selectedLinkId,
      poReceivedDate: poDate,
      poNumber: poNumber.trim(),
      quantity: parseInt(quantity, 10),
      amountUsd,
      value,
      currency,
      file: poFile,
      test,
      onBehalfOfId: onBehalfOfId || null,
    }

    setSubmitting(true)
    try {
      if (isEditMode) {
        await updatePO(editPo.id, payload)
      } else {
        await createPO(payload)
      }
      setSuccess(true)
      onSuccess?.()
      setTimeout(() => { onClose(); setSuccess(false) }, 1800)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDiscard = () => { onClose() }

  if (!open) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[110] bg-black/40" />

      {/* Modal card */}
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col pointer-events-auto">

          {/* Header */}
          <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 flex-shrink-0
            bg-gradient-to-r from-gray-50 to-white rounded-t-2xl">
            <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center text-white flex-shrink-0">
              {isEditMode
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>
              }
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900">
                {isEditMode ? 'Update PO Record' : 'Upload PO Record'}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {isEditMode ? 'Edit the details of this purchase order' : 'Upload purchase order documentation'}
              </p>
            </div>
            <button type="button" onClick={!submitting ? onClose : undefined}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-black transition-colors flex-shrink-0 cursor-pointer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Edit mode banner */}
          {isEditMode && (
            <div className="flex items-center gap-2 px-6 py-2.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-800 flex-shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Editing existing PO — only fill in the fields you want to change. Leave the file upload empty to keep the existing document.
            </div>
          )}

          {/* Scrollable form body */}
          <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">

            {/* Buyer + Supplier */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Buyer Name" required>
                <ComboSelect
                  options={buyers.map(b => ({ value: b.id, label: b.display_name }))}
                  value={buyerOrgId}
                  onChange={handleBuyerChange}
                  placeholder="Select buyer"
                  disabled={loadingBuyers}
                  loading={loadingBuyers}
                  triggerClassName={`${inputCls} appearance-none`}
                  dropdownClassName="border border-gray-200 rounded-lg mt-0.5 shadow-lg"
                />
              </Field>

              <Field label="Supplier Name" required>
                <ComboSelect
                  options={links.map(l => ({ value: l.linkId, label: l.supplierName }))}
                  value={selectedLinkId}
                  onChange={setSelectedLinkId}
                  placeholder={!buyerOrgId ? 'Select buyer first' : 'Select supplier'}
                  disabled={!buyerOrgId || loadingSuppliers}
                  loading={loadingSuppliers}
                  triggerClassName={`${inputCls} appearance-none disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`}
                  dropdownClassName="border border-gray-200 rounded-lg mt-0.5 shadow-lg"
                />
              </Field>
            </div>

            {/* On Behalf Of — create mode only, shown when team members exist */}
            {!isEditMode && teamMembers.length > 0 && (
              <Field label="Uploading On Behalf Of">
                <div className="relative">
                  <select value={onBehalfOfId} onChange={e => setOnBehalfOfId(e.target.value)}
                    className={`${inputCls} appearance-none pr-8`}>
                    <option value="">Myself (default)</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.id}>{m.full_name}</option>
                    ))}
                  </select>
                  <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Leave as "Myself" if uploading for your own record</p>
              </Field>
            )}

            {/* Date + PO Number */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="PO Received Date" required>
                <input type="date" value={poDate} onChange={e => setPoDate(e.target.value)}
                  required className={inputCls} />
              </Field>
              <Field label="PO Number" required>
                <input type="text" value={poNumber} onChange={e => setPoNumber(e.target.value)}
                  placeholder="e.g. PO-2026-001" required className={inputCls} />
              </Field>
            </div>
            {/* Quantity + Value */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Quantity" required>
                <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)}
                  placeholder="0" min="1" required className={inputCls} />
              </Field>
              <Field label="Value" required>
                <div className="flex gap-2">
                  <input type="number" value={value} onChange={e => setValue(e.target.value)}
                    placeholder="0.00" min="0" step="0.01" required className={`${inputCls} flex-1`} />
                  <div className="relative flex-shrink-0">
                    <select value={currency} onChange={e => setCurrency(e.target.value)}
                      className={`${inputCls} w-24 appearance-none pr-7`}>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                      <option value="INR">INR</option>
                    </select>
                    <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                  </div>
                </div>
                {currency !== 'USD' && value && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    ≈ ${convertToUSD(parseFloat(value) || 0, currency, rates).toLocaleString()} USD
                  </p>
                )}
              </Field>
            </div>

            {/* File */}
            <Field label="PO Document" required={!isEditMode}>
              <FileZone
                file={poFile}
                onFile={setPoFile}
                onClear={() => setPoFile(null)}
                existingUrl={isEditMode ? editPo?.po_file_url : null}
                label="Click to upload or drag and drop"
              />
            </Field>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {isEditMode ? 'PO updated successfully!' : 'PO uploaded successfully!'}
              </div>
            )}
          </form>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-gray-100 flex-shrink-0">
            <button type="button" onClick={handleDiscard} disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              {isEditMode
                ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg> Discard</>
                : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg> Reset</>
              }
            </button>
            {department ==='tech' && (
              <button type="submit" form="" disabled={submitting || success}
              onClick={(e) => handleSubmit(e, true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {submitting? 'Saving…' : isEditMode ? 'Save Changes' : 'Submit Test PO'}
              </button>
            )}
            <button type="submit" form="" disabled={submitting || success}
              onClick={(e) => handleSubmit(e, false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {submitting
                ? <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
              }
              {submitting ? 'Saving…' : isEditMode ? 'Save Changes' : 'Submit PO'}
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body
  )
}
