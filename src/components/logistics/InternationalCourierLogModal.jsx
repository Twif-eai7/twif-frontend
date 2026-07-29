import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { INTERNATIONAL_COURIERS } from './courierLogUtils'
import CourierSearchSelect from './CourierSearchSelect'
import AddressPincodeFields from './AddressPincodeFields'
import { extractIndiaPincode, extractPostalCode } from './postalLookup'
import { searchOrgAddresses, saveOrgAddress } from '../../lib/orgAddresses'

const LOGS_BASE = `${import.meta.env.VITE_BACKEND_URL || ''}/logistics/international-courier-logs`

const REQUIRED_KEYS = [
  'invoice_number', 'date_of_invoice', 'merchant_name',
  'vendor_name', 'vendor_address',
  'buyer_name', 'buyer_address',
  'courier_company', 'tracking_number',
  'dispatch_date', 'courier_cost_by', 'charge_to',
  'package_quantity', 'product_description',
]

const REQUIRED_LABELS = {
  invoice_number:   'Invoice Number',
  date_of_invoice:  'Date of Invoice',
  merchant_name:    'Merchant Name',
  vendor_name:      'Vendor Name',
  vendor_address:   'Vendor Address',
  buyer_name:       'Buyer Name',
  buyer_address:    'Buyer Address',
  courier_company:  'Courier Company',
  tracking_number:  'Tracking Number',
  dispatch_date:    'Dispatch Date',
  courier_cost_by:  'Courier Cost By',
  charge_to:        'Charge To',
  package_quantity:    'Number of Packages',
  product_description: 'Product Description',
}


const EMPTY_FORM = {
  invoice_number:   '',
  date_of_invoice:  '',
  merchant_name:    '',
  vendor_name:      '',
  vendor_address:   '',
  zip_code_V:       '',
  buyer_name:       '',
  buyer_address:    '',
  zip_code_B:       '',
  courier_service:  '',
  courier_company:  '',
  tracking_number:  '',
  dispatch_date:    '',
  delivery_date:    '',
  courier_cost_by:  '',
  charge_to:        '',
  account_number:      '',
  package_quantity:    '',
  product_description: '',
  upload_invoice: null,
  remarks:        '',
}

const inputCls    = 'px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900 bg-white w-full'
const textareaCls = 'px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900 bg-white w-full resize-none'
const selectCls   = 'px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900 bg-white appearance-none w-full cursor-pointer'

function Field({ label, required, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function SelectField({ label, required, value, onChange, options, placeholder = '— Select —' }) {
  return (
    <Field label={label} required={required}>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)} className={selectCls}>
          <option value="">{placeholder}</option>
          {options.map(o => (
            <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
          ))}
        </select>
        <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 stroke-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </Field>
  )
}

// ── Merchant search (reused from domestic) ────────────────────────────────────

const MAX_RECENTS = 5

function SearchDropdownShell({ value, placeholder, onChange, doSearch, renderOption, getKey, localStorageKey, onRawSelect, searchOnOpen = false, disabled = false }) {
  const [results, setResults]                   = useState([])
  const [recentItems, setRecentItems]           = useState([])
  const [open, setOpen]                         = useState(false)
  const [searching, setSearching]               = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const timerRef    = useRef(null)
  const wrapRef     = useRef(null)
  const itemRefs    = useRef([])
  const doSearchRef = useRef(doSearch)
  useEffect(() => { doSearchRef.current = doSearch }, [doSearch])

  useEffect(() => {
    if (!localStorageKey) return
    try {
      const stored = JSON.parse(localStorage.getItem(localStorageKey) || '[]')
      setRecentItems(Array.isArray(stored) ? stored : [])
    } catch { setRecentItems([]) }
  }, [localStorageKey])

  useEffect(() => {
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false); setHighlightedIndex(-1)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    if (!open || !searchOnOpen) return
    let cancelled = false
    setSearching(true)
    doSearchRef.current(value?.trim() || '').then(r => {
      if (!cancelled) setResults(r || [])
    }).catch(() => {
      if (!cancelled) setResults([])
    }).finally(() => {
      if (!cancelled) setSearching(false)
    })
    return () => { cancelled = true }
  }, [open, searchOnOpen])

  const isTyping     = value?.trim().length >= 1
  const displayItems = (isTyping || searchOnOpen) ? results : recentItems
  const showRecent   = !isTyping && !searchOnOpen && recentItems.length > 0

  const saveRecent = useCallback((item) => {
    if (!localStorageKey) return
    try {
      const stored = JSON.parse(localStorage.getItem(localStorageKey) || '[]')
      const deduped = stored.filter(r => getKey(r) !== getKey(item))
      const updated = [item, ...deduped].slice(0, MAX_RECENTS)
      localStorage.setItem(localStorageKey, JSON.stringify(updated))
      setRecentItems(updated)
    } catch {}
  }, [localStorageKey, getKey])

  const pick = useCallback((item) => {
    const { label } = renderOption(item)
    onChange(label)
    saveRecent(item)
    onRawSelect?.(item)
    setResults([]); setOpen(false); setHighlightedIndex(-1)
  }, [renderOption, onChange, saveRecent, onRawSelect])

  const handleInput = (e) => {
    const val = e.target.value
    onChange(val); setOpen(true); setHighlightedIndex(-1)
    clearTimeout(timerRef.current)
    if (!val?.trim()) {
      if (searchOnOpen) {
        setSearching(true)
        doSearchRef.current('').then(r => setResults(r || [])).catch(() => setResults([])).finally(() => setSearching(false))
      } else {
        setResults([])
      }
      return
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      try { setResults(await doSearch(val.trim())) }
      catch { setResults([]) }
      finally { setSearching(false) }
    }, 250)
  }

  const handleKeyDown = (e) => {
    if (!open) { if (e.key === 'ArrowDown') { setOpen(true); setHighlightedIndex(0) } return }
    switch (e.key) {
      case 'Escape': e.preventDefault(); setOpen(false); setHighlightedIndex(-1); break
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(i => { const next = Math.min(i + 1, displayItems.length - 1); itemRefs.current[next]?.scrollIntoView({ block: 'nearest' }); return next })
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(i => { const next = Math.max(i - 1, -1); if (next >= 0) itemRefs.current[next]?.scrollIntoView({ block: 'nearest' }); return next })
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && displayItems[highlightedIndex]) pick(displayItems[highlightedIndex])
        break
    }
  }

  const showDropdown = open && (displayItems.length > 0 || searching || (isTyping && results.length === 0))

  return (
    <div ref={wrapRef} className="relative">
      <input value={value} onChange={handleInput} onFocus={() => !disabled && setOpen(true)} onKeyDown={handleKeyDown}
        placeholder={disabled ? 'Select merchant first' : placeholder} autoComplete="off"
        disabled={disabled} className={`${inputCls} ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`} />
      {searching && (
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <div className="w-3 h-3 border border-gray-300 border-t-gray-700 rounded-full animate-spin" />
        </div>
      )}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[200] max-h-[220px] overflow-y-auto">
          {showRecent && (
            <div className="px-3 py-1 flex items-center gap-1.5 bg-gray-50 border-b border-gray-100">
              <svg viewBox="0 0 24 24" className="w-3 h-3 stroke-gray-400" fill="none" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest">Recent</span>
            </div>
          )}
          {displayItems.map((item, i) => {
            const { label, sub } = renderOption(item)
            const isHl = i === highlightedIndex
            return (
              <button key={getKey(item)} ref={el => { itemRefs.current[i] = el }} type="button"
                onMouseDown={() => pick(item)} onMouseEnter={() => setHighlightedIndex(i)}
                className={`w-full text-left px-3 py-2 transition-colors ${i < displayItems.length - 1 ? 'border-b border-gray-100' : ''} ${isHl ? 'bg-blue-50' : ''}`}>
                <div className={`text-xs font-medium truncate ${isHl ? 'text-blue-700' : 'text-gray-900'}`}>{label}</div>
                {sub && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{sub}</div>}
              </button>
            )
          })}
          {isTyping && !searching && results.length === 0 && (
            <div className="px-3 py-2.5 text-[10px] text-gray-400">No results found</div>
          )}
        </div>
      )}
    </div>
  )
}

function BuyerSearchDropdown({ value, placeholder, onChange, onAddressResolved, onOrgSelected }) {
  const doSearch = useCallback(async (q) => searchOrgAddresses('buyer', q), [])

  const handleRawSelect = useCallback((org) => {
    const addr = [org.address, org.city, org.state, org.country].filter(Boolean).join(', ')
    const zip = org.zip || extractPostalCode(addr, 'international')
    if (addr || zip) onAddressResolved(addr, zip)
    onOrgSelected?.(org)
  }, [onAddressResolved, onOrgSelected])

  return (
    <SearchDropdownShell
      value={value} placeholder={placeholder} onChange={onChange} doSearch={doSearch}
      localStorageKey="intl_courier_log_recent_buyers" getKey={o => o._variantKey || o.id}
      onRawSelect={handleRawSelect}
      searchOnOpen
      renderOption={o => ({
        label: o.label ? `${o.display_name || o.name} — ${o.label}` : (o.display_name || o.name),
        sub:   [o.address, o.city, o.state, o.country].filter(Boolean).join(', ') || null,
      })}
    />
  )
}

function VendorSearchDropdown({ value, placeholder, onChange, onAddressResolved, onOrgSelected }) {
  const doSearch = useCallback(async (q) => searchOrgAddresses('supplier', q), [])

  const handleRawSelect = useCallback((org) => {
    const addr = [org.address, org.city, org.state, org.country].filter(Boolean).join(', ')
    const zip = org.zip || extractIndiaPincode(addr)
    if (addr || zip) onAddressResolved(addr, zip)
    onOrgSelected?.(org)
  }, [onAddressResolved, onOrgSelected])

  return (
    <SearchDropdownShell
      value={value} placeholder={placeholder} onChange={onChange} doSearch={doSearch}
      localStorageKey="intl_courier_log_recent_vendors" getKey={o => o._variantKey || o.id}
      onRawSelect={handleRawSelect}
      searchOnOpen
      renderOption={o => ({
        label: o.label ? `${o.display_name || o.name} — ${o.label}` : (o.display_name || o.name),
        sub:   [o.address, o.city, o.state, o.country].filter(Boolean).join(', ') || null,
      })}
    />
  )
}

function MerchantSearchDropdown({ value, placeholder, onChange, onMemberSelected }) {
  const [merchantOrgIds, setMerchantOrgIds] = useState(null)
  useEffect(() => {
    supabase.from('organizations').select('id').eq('type', 'merchant')
      .then(({ data }) => setMerchantOrgIds((data || []).map(o => o.id)))
  }, [])

  const doSearch = useCallback(async (q) => {
    if (!merchantOrgIds?.length) return []
    let query = supabase.from('organization_members')
      .select('id, full_name, organizations(name, display_name)').in('organization_id', merchantOrgIds).eq('department', 'merchandising')
    if (q) query = query.ilike('full_name', `%${q}%`)
    const { data } = await query.order('full_name', { ascending: true })
    return data || []
  }, [merchantOrgIds])

  const handleRawSelect = useCallback((m) => {
    onMemberSelected?.(m.id)
  }, [onMemberSelected])

  return (
    <SearchDropdownShell value={value} placeholder={placeholder} onChange={onChange} doSearch={doSearch}
      localStorageKey="intl_courier_log_recent_merchants" getKey={m => m.id}
      onRawSelect={handleRawSelect}
      renderOption={m => ({ label: m.full_name, sub: m.organizations?.display_name || m.organizations?.name || null })} />
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function InternationalCourierLogModal({ row, onSave, onClose, uploadInvoice }) {
  const [form, setForm] = useState(() => row ? {
    invoice_number:   row.invoice_number   || '',
    date_of_invoice:  row.date_of_invoice  || '',
    merchant_name:    row.merchant_name    || '',
    vendor_name:      row.vendor_name      || '',
    vendor_address:   row.vendor_address   || '',
    zip_code_V:       row.zip_code_V       || '',
    buyer_name:       row.buyer_name       || '',
    buyer_address:    row.buyer_address    || '',
    zip_code_B:       row.zip_code_B       || '',
    courier_service:  row.courier_service  || '',
    courier_company:  row.courier_company  || '',
    tracking_number:  row.tracking_number  || '',
    dispatch_date:    row.dispatch_date    || '',
    delivery_date:    row.delivery_date    || '',
    courier_cost_by:  row.courier_cost_by  || '',
    charge_to:        row.charge_to        || '',
    account_number:      row.account_number      || '',
    product_description: row.product_description || '',
    package_quantity: row.package_quantity != null ? String(row.package_quantity) : '',
    upload_invoice: row.upload_invoice || null,
    remarks:        row.remarks        || '',
  } : { ...EMPTY_FORM })

  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState(null)
  const [pendingFile,    setPendingFile]    = useState(null)
  const [dragOver,       setDragOver]       = useState(false)
  const [invoiceViewUrl, setInvoiceViewUrl] = useState(null)
  const [buyerOrgId,       setBuyerOrgId]       = useState(null)
  const [vendorOrgId,      setVendorOrgId]      = useState(null)
  const [buyerAddressId,   setBuyerAddressId]   = useState(null) // set when a saved address was picked from the dropdown; cleared on manual edit
  const [vendorAddressId,  setVendorAddressId]  = useState(null)
  const [merchantMemberId, setMerchantMemberId] = useState(null)
  const [buyerAddrSaveStatus,  setBuyerAddrSaveStatus]  = useState('idle') // idle | saving | saved | error
  const [vendorAddrSaveStatus, setVendorAddrSaveStatus] = useState('idle')

  const formRef = useRef(form)
  useEffect(() => { formRef.current = form }, [form])

  useEffect(() => {
    if (row?.id && row?.upload_invoice) {
      fetch(`${LOGS_BASE}/${row.id}/invoice`)
        .then(r => r.json())
        .then(d => { if (d.url) setInvoiceViewUrl(d.url) })
        .catch(() => {})
    }
  }, [])

  const patch = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSaveBuyerAddress = async () => {
    if (!buyerOrgId || !form.buyer_address.trim()) return
    setBuyerAddrSaveStatus('saving')
    try {
      await saveOrgAddress(buyerOrgId, {
        address_line1: form.buyer_address.trim(),
        zip_code: form.zip_code_B.trim() || null,
      })
      setBuyerAddrSaveStatus('saved')
    } catch {
      setBuyerAddrSaveStatus('error')
    }
  }

  const handleSaveVendorAddress = async () => {
    if (!vendorOrgId || !form.vendor_address.trim()) return
    setVendorAddrSaveStatus('saving')
    try {
      await saveOrgAddress(vendorOrgId, {
        address_line1: form.vendor_address.trim(),
        zip_code: form.zip_code_V.trim() || null,
      })
      setVendorAddrSaveStatus('saved')
    } catch {
      setVendorAddrSaveStatus('error')
    }
  }

  const autoFillFromMerchant = useCallback(async (memberId) => {
    setMerchantMemberId(memberId)
    const { data: access } = await supabase.from('member_organization_access')
      .select('buyer_supplier_link_id, organization_id').eq('member_id', memberId)
    if (!access?.length) return
    const directLinkIds = access.filter(r => r.buyer_supplier_link_id).map(r => r.buyer_supplier_link_id)
    const fallbackOrgIds = access.filter(r => !r.buyer_supplier_link_id).map(r => r.organization_id).filter(Boolean)
    const buyerOrgIds = new Set(fallbackOrgIds)
    let supplierOrgIds = new Set()
    if (directLinkIds.length) {
      const { data: links } = await supabase.from('buyer_supplier_links')
        .select('id, buyer_org_id, supplier_org_id').in('id', directLinkIds)
      ;(links || []).forEach(l => {
        if (l.buyer_org_id) buyerOrgIds.add(l.buyer_org_id)
        if (l.supplier_org_id) supplierOrgIds.add(l.supplier_org_id)
      })
    }
    if (!directLinkIds.length && fallbackOrgIds.length) {
      const { data: links } = await supabase.from('buyer_supplier_links').select('supplier_org_id')
        .in('buyer_org_id', fallbackOrgIds).eq('relationship_status', 'active')
      ;(links || []).forEach(l => l.supplier_org_id && supplierOrgIds.add(l.supplier_org_id))
    }
    // Guess buyer
    if (!formRef.current.buyer_name && buyerOrgIds.size === 1) {
      const buyerId = [...buyerOrgIds][0]
      const { data: b } = await supabase.from('organizations').select('id, display_name, name').eq('id', buyerId).maybeSingle()
      const { data: ba } = await supabase.from('organization_addresses')
        .select('id, address_line1, address_line2, city, state, country, zip_code')
        .eq('organization_id', buyerId).order('is_default', { ascending: false }).order('created_on', { ascending: true }).limit(1).maybeSingle()
      if (b) {
        const line1 = [ba?.address_line1, ba?.address_line2].filter(Boolean).join(', ')
        const addr = [line1, ba?.city, ba?.state, ba?.country].filter(Boolean).join(', ')
        setForm(f => ({
          ...f,
          buyer_name: b.display_name || b.name,
          buyer_address: addr || f.buyer_address,
          zip_code_B: ba?.zip_code || extractPostalCode(addr, 'international') || f.zip_code_B,
        }))
        setBuyerOrgId(b.id)
        setBuyerAddressId(ba?.id || null)
      }
    }
    // Guess vendor
    if (!formRef.current.vendor_name && supplierOrgIds.size === 1) {
      const vendorId = [...supplierOrgIds][0]
      const { data: v } = await supabase.from('organizations').select('id, display_name, name').eq('id', vendorId).maybeSingle()
      const { data: va } = await supabase.from('organization_addresses')
        .select('id, address_line1, address_line2, city, state, country, zip_code')
        .eq('organization_id', vendorId).order('is_default', { ascending: false }).order('created_on', { ascending: true }).limit(1).maybeSingle()
      if (v) {
        const line1 = [va?.address_line1, va?.address_line2].filter(Boolean).join(', ')
        const addr = [line1, va?.city, va?.state, va?.country].filter(Boolean).join(', ')
        setForm(f => ({
          ...f,
          vendor_name: v.display_name || v.name,
          vendor_address: addr || f.vendor_address,
          zip_code_V: va?.zip_code || extractIndiaPincode(addr) || f.zip_code_V,
        }))
        setVendorOrgId(v.id)
        setVendorAddressId(va?.id || null)
      }
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    const missing = REQUIRED_KEYS.filter(k => {
      const v = form[k]
      return v === '' || v === null || v === undefined
    })
    if (missing.length === 1) {
      setError(`Please fill in the required field: ${REQUIRED_LABELS[missing[0]]}`)
      return
    }
    if (missing.length > 1) {
      setError(`Please fill in the required fields: ${missing.map(k => REQUIRED_LABELS[k]).join(', ')}`)
      return
    }

    const pkgs = Number(form.package_quantity)

    if (isNaN(pkgs) || pkgs <= 0) { setError('Number of packages must be a positive number.'); return }

    setSaving(true)
    try {
      const savedLog = await onSave({
        invoice_number:   form.invoice_number.trim(),
        date_of_invoice:  form.date_of_invoice,
        merchant_name:    form.merchant_name.trim(),
        vendor_name:      form.vendor_name.trim(),
        vendor_address:   form.vendor_address.trim(),
        zip_code_V:       form.zip_code_V.trim() || extractIndiaPincode(form.vendor_address) || null,
        buyer_name:       form.buyer_name.trim(),
        buyer_address:    form.buyer_address.trim(),
        zip_code_B:       form.zip_code_B.trim() || extractPostalCode(form.buyer_address, 'international') || null,
        courier_service:  form.courier_service || null,
        courier_company:  form.courier_company,
        tracking_number:  form.tracking_number.trim(),
        dispatch_date:    form.dispatch_date,
        delivery_date:    form.delivery_date || null,
        courier_cost_by:  form.courier_cost_by,
        charge_to:        form.charge_to,
        account_number:      form.account_number.trim() || null,
        product_description: form.product_description.trim(),
        package_quantity:    pkgs,
        remarks:             form.remarks.trim() || null,
      })
      if (pendingFile && savedLog?.id) {
        await uploadInvoice(savedLog.id, pendingFile)
      }
      if (buyerOrgId && form.buyer_address.trim()) {
        saveOrgAddress(buyerOrgId, {
          address_line1: form.buyer_address.trim(),
          zip_code: form.zip_code_B.trim() || null,
        }).catch(() => {})
      }
      if (vendorOrgId && form.vendor_address.trim()) {
        saveOrgAddress(vendorOrgId, {
          address_line1: form.vendor_address.trim(),
          zip_code: form.zip_code_V.trim() || null,
        }).catch(() => {})
      }
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-sm font-bold text-gray-900">
              {row ? 'Edit International Courier Log' : 'Add International Courier Log'}
            </h2>
            <p className="text-[10px] text-gray-400 mt-0.5">International · Export</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Row 1: Invoice Number + Invoice Date + Dispatch Date */}
          <div className="grid grid-cols-3 gap-4">
            <Field label="Invoice Number" required>
              <input value={form.invoice_number} onChange={e => patch('invoice_number', e.target.value)}
                placeholder="ALM/JNM/000" className={inputCls} />
            </Field>
            <Field label="Date of Invoice" required>
              <input type="date" value={form.date_of_invoice} onChange={e => patch('date_of_invoice', e.target.value)}
                className={inputCls} />
            </Field>
            <Field label="Dispatch Date" required>
              <input type="date" value={form.dispatch_date} onChange={e => patch('dispatch_date', e.target.value)}
                className={inputCls} />
            </Field>
          </div>

          {/* Delivery Date */}
          <div className="grid grid-cols-3 gap-4">
            <Field label="Delivery Date">
              <input type="date" value={form.delivery_date} onChange={e => patch('delivery_date', e.target.value)}
                className={inputCls} />
            </Field>
          </div>

          {/* Row 2: Merchant + Buyer */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Merchant Name" required>
              <MerchantSearchDropdown value={form.merchant_name} placeholder="Search member name…"
                onChange={val => { setMerchantMemberId(null); setBuyerOrgId(null); setVendorOrgId(null); setForm(f => ({ ...f, merchant_name: val, buyer_name: '', buyer_address: '', zip_code_B: '', vendor_name: '', vendor_address: '', zip_code_V: '' })) }}
                onMemberSelected={autoFillFromMerchant} />
            </Field>
            <Field label="Buyer Name" required>
              <BuyerSearchDropdown
                value={form.buyer_name}
                placeholder="Search buyer…"
                onChange={val => { patch('buyer_name', val); setBuyerOrgId(null); setBuyerAddressId(null); setBuyerAddrSaveStatus('idle') }}
                onAddressResolved={(addr, zip) => {
                  if (addr) patch('buyer_address', addr)
                  if (zip) patch('zip_code_B', zip)
                }}
                onOrgSelected={org => { setBuyerOrgId(org.id); setBuyerAddressId(org.addressId || null); setBuyerAddrSaveStatus('idle') }}
              />
            </Field>
          </div>

          <AddressPincodeFields
            addressLabel="Buyer Address"
            pincodeLabel="Buyer Zip"
            address={form.buyer_address}
            pincode={form.zip_code_B}
            onAddressChange={val => { patch('buyer_address', val); setBuyerAddressId(null); setBuyerAddrSaveStatus('idle') }}
            onPincodeChange={val => { patch('zip_code_B', val); setBuyerAddressId(null); setBuyerAddrSaveStatus('idle') }}
            mode="international"
            addressRequired
            addressPlaceholder="Auto-filled when buyer is selected — edit freely if address differs"
            pincodePlaceholder="e.g. TQ9 6JB"
          />

          {buyerOrgId && !buyerAddressId && (
            <div className="flex items-center gap-2 -mt-2">
              <button type="button" onClick={handleSaveBuyerAddress}
                disabled={!form.buyer_address.trim() || buyerAddrSaveStatus === 'saving'}
                className="px-2.5 py-1 text-[10px] font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-50 transition-colors">
                {buyerAddrSaveStatus === 'saving' ? 'Saving…' : 'Save Address to Buyer'}
              </button>
              {buyerAddrSaveStatus === 'saved' && <span className="text-[10px] text-green-600 font-medium">Saved</span>}
              {buyerAddrSaveStatus === 'error' && <span className="text-[10px] text-red-500 font-medium">Failed to save</span>}
            </div>
          )}

          {/* Row 3: Vendor Name */}
          <Field label="Vendor Name" required>
            <VendorSearchDropdown
              value={form.vendor_name}
              placeholder="Search vendor…"
              onChange={val => { patch('vendor_name', val); setVendorOrgId(null); setVendorAddressId(null); setVendorAddrSaveStatus('idle') }}
              onAddressResolved={(addr, zip) => {
                if (addr) patch('vendor_address', addr)
                if (zip) patch('zip_code_V', zip)
              }}
              onOrgSelected={org => { setVendorOrgId(org.id); setVendorAddressId(org.addressId || null); setVendorAddrSaveStatus('idle') }}
            />
          </Field>

          <AddressPincodeFields
            addressLabel="Vendor Address"
            pincodeLabel="Vendor Pincode"
            address={form.vendor_address}
            pincode={form.zip_code_V}
            onAddressChange={val => { patch('vendor_address', val); setVendorAddressId(null); setVendorAddrSaveStatus('idle') }}
            onPincodeChange={val => { patch('zip_code_V', val); setVendorAddressId(null); setVendorAddrSaveStatus('idle') }}
            mode="india"
            addressRequired
            addressPlaceholder="Auto-filled when vendor is selected — edit freely if address differs"
            pincodePlaceholder="e.g. 122001"
          />

          {vendorOrgId && !vendorAddressId && (
            <div className="flex items-center gap-2 -mt-2">
              <button type="button" onClick={handleSaveVendorAddress}
                disabled={!form.vendor_address.trim() || vendorAddrSaveStatus === 'saving'}
                className="px-2.5 py-1 text-[10px] font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-50 transition-colors">
                {vendorAddrSaveStatus === 'saving' ? 'Saving…' : 'Save Address to Vendor'}
              </button>
              {vendorAddrSaveStatus === 'saved' && <span className="text-[10px] text-green-600 font-medium">Saved</span>}
              {vendorAddrSaveStatus === 'error' && <span className="text-[10px] text-red-500 font-medium">Failed to save</span>}
            </div>
          )}

          {/* Product Description */}
          <Field label="Product Description" required>
            <textarea value={form.product_description} onChange={e => patch('product_description', e.target.value)}
              placeholder="Describe the product(s) being shipped…" rows={2}
              className={textareaCls} />
          </Field>

          {/* Row 4: Courier Company + Courier Service + Tracking Number */}
          <div className="grid grid-cols-3 gap-4">
            <CourierSearchSelect label="Courier Company" required value={form.courier_company}
              onChange={val => { patch('courier_company', val); patch('courier_service', '') }}
              options={INTERNATIONAL_COURIERS} placeholder="Search courier…" />
            <SelectField label="Courier Service" value={form.courier_service}
              onChange={val => patch('courier_service', val)}
              options={form.courier_company === 'FedEx International'
                ? ['Express', 'Economy', 'International']
                : ['Express', 'Economy']} />
            <Field label="Tracking Number" required>
              <input value={form.tracking_number} onChange={e => patch('tracking_number', e.target.value)}
                placeholder="e.g. 1234567890" className={inputCls} />
            </Field>
          </div>

          {/* Row 5: Courier Cost By + Currency + Charge To + Account Number */}
          <div className="grid grid-cols-2 gap-4">
            <SelectField label="Courier Cost By" required value={form.courier_cost_by}
              onChange={val => patch('courier_cost_by', val)}
              options={['Buyer', 'JNG', 'Supplier']} />
            <SelectField label="Charge To" required value={form.charge_to}
              onChange={val => patch('charge_to', val)}
              options={['Buyer', 'Jnitin Account', 'Buyer Account']} />
            <Field label="Account Number">
              <input value={form.account_number} onChange={e => patch('account_number', e.target.value)}
                placeholder="e.g. 123456789" className={inputCls} />
            </Field>
          </div>

          {/* Row 6: Packages */}
          <div className="grid grid-cols-3 gap-4">
            <Field label="Number of Packages" required>
              <input type="number" min="1" step="1" value={form.package_quantity}
                onChange={e => patch('package_quantity', e.target.value)}
                placeholder="e.g. 3" className={inputCls} />
            </Field>
          </div>

          {/* Remarks */}
          <Field label="Remarks">
            <textarea value={form.remarks} onChange={e => patch('remarks', e.target.value)}
              placeholder="Optional additional details…" rows={2} className={textareaCls} />
          </Field>

          {/* Invoice File */}
          <Field label="Invoice File">
            {pendingFile ? (
              <div className="flex items-center gap-3">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="text-xs text-gray-700 font-medium truncate max-w-[220px]">{pendingFile.name}</span>
                <button type="button" onClick={() => setPendingFile(null)}
                  className="text-[10px] text-gray-400 hover:text-red-500 transition-colors underline shrink-0">
                  Remove
                </button>
              </div>
            ) : form.upload_invoice ? (
              <div className="flex items-center gap-3">
                {invoiceViewUrl ? (
                  <a href={invoiceViewUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-medium">
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    View uploaded invoice
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">Invoice attached</span>
                )}
                <label className="text-[10px] text-gray-400 hover:text-blue-500 transition-colors underline cursor-pointer">
                  Replace
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={e => { if (e.target.files[0]) setPendingFile(e.target.files[0]) }} />
                </label>
              </div>
            ) : (
              <label
                className={`flex flex-col items-center justify-center gap-2 w-full py-7 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setPendingFile(f) }}
              >
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                  onChange={e => { if (e.target.files[0]) setPendingFile(e.target.files[0]) }} />
                <svg viewBox="0 0 24 24" className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                </svg>
                <div className="text-center">
                  <p className="text-xs font-semibold text-gray-700">Click to upload or drag and drop</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">PDF, JPG, PNG · max 10 MB</p>
                </div>
              </label>
            )}
          </Field>

          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>
          )}

          <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 font-medium transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 font-semibold disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : row ? 'Save Changes' : 'Add Log'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
