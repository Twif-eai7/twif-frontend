import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { DOMESTIC_COURIERS, nextInvoiceNumber } from './courierLogUtils'
import CourierSearchSelect from './CourierSearchSelect'
import AddressPincodeFields from './AddressPincodeFields'
import { extractIndiaPincode } from './postalLookup'
import { searchOrgAddresses, saveOrgAddress } from '../../lib/orgAddresses'

const LOGS_BASE = `${import.meta.env.VITE_BACKEND_URL || ''}/logistics/courier-logs`

// ── Required fields (all except remarks) ─────────────────────────────────────

const REQUIRED_KEYS = [
  'invoice_number', 'dispatch_date', 'merchant_name', 'vendor_name',
  'vendor_address', 'cost_centre', 'tracking_number', 'product_description',
  'package_quantity', 'service',
]

const REQUIRED_LABELS = {
  invoice_number:       'Invoice Number',
  dispatch_date:        'Dispatch Date',
  merchant_name:        'Merchant Name',
  vendor_name:          'Vendor Name',
  vendor_address:       'Vendor Address',
  cost_centre:          'Cost Centre',
  tracking_number:       'Tracking Number',
  product_description:  'Product Description',
  package_quantity:   'Number of Packages',
  Amount:               'Amount (INR)',
  service:              'Service',
}

const EMPTY_FORM = {
  invoice_number:       '',
  dispatch_date:        '',
  delivery_date:        '',
  merchant_name:        '',
  vendor_name:          '',
  vendor_address:       '',
  zip_code:             '',
  cost_centre:          '',
  tracking_number:      '',
  service:              '',
  product_description:  '',
  package_quantity:     '',
  Amount:               '',
  upload_invoice:       null,
  remarks:              '',
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputCls    = 'px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900 bg-white w-full'
const textareaCls = 'px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900 bg-white w-full resize-none'
const selectCls   = 'px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900 bg-white appearance-none w-full cursor-pointer'

// ── Field wrapper ─────────────────────────────────────────────────────────────

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

// ── Shared search dropdown shell ──────────────────────────────────────────────
//
// Features:
//  • Keyboard navigation: ArrowUp/Down to move, Enter to select, Escape to close
//  • Recent items: stored in localStorage, shown when input is focused but empty
//  • 250 ms debounce on search
//  • onRawSelect(item): side-effect hook called when any item is picked

const MAX_RECENTS = 5

function SearchDropdownShell({
  value,
  placeholder,
  onChange,
  doSearch,
  renderOption,
  getKey,
  localStorageKey,
  onRawSelect,
}) {
  const [results,          setResults]          = useState([])
  const [recentItems,      setRecentItems]      = useState([])
  const [open,             setOpen]             = useState(false)
  const [searching,        setSearching]        = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const timerRef   = useRef(null)
  const wrapRef    = useRef(null)
  const itemRefs   = useRef([])

  // Load recents from localStorage on mount
  useEffect(() => {
    if (!localStorageKey) return
    try {
      const stored = JSON.parse(localStorage.getItem(localStorageKey) || '[]')
      setRecentItems(Array.isArray(stored) ? stored : [])
    } catch { setRecentItems([]) }
  }, [localStorageKey])

  // Close on outside click
  useEffect(() => {
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
        setHighlightedIndex(-1)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const isTyping     = value?.trim().length >= 1
  const displayItems = isTyping ? results : recentItems
  const showRecent   = !isTyping && recentItems.length > 0

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
    setResults([])
    setOpen(false)
    setHighlightedIndex(-1)
  }, [renderOption, onChange, saveRecent, onRawSelect])

  const handleInput = (e) => {
    const val = e.target.value
    onChange(val)
    setOpen(true)
    setHighlightedIndex(-1)
    clearTimeout(timerRef.current)

    if (!val?.trim()) { setResults([]); return }

    timerRef.current = setTimeout(async () => {
      setSearching(true)
      try { setResults(await doSearch(val.trim())) }
      catch { setResults([]) }
      finally { setSearching(false) }
    }, 250)
  }

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown') { setOpen(true); setHighlightedIndex(0) }
      return
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        setHighlightedIndex(-1)
        break
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(i => {
          const next = Math.min(i + 1, displayItems.length - 1)
          itemRefs.current[next]?.scrollIntoView({ block: 'nearest' })
          return next
        })
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(i => {
          const next = Math.max(i - 1, -1)
          if (next >= 0) itemRefs.current[next]?.scrollIntoView({ block: 'nearest' })
          return next
        })
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && displayItems[highlightedIndex]) {
          pick(displayItems[highlightedIndex])
        }
        break
    }
  }

  const showDropdown = open && (displayItems.length > 0 || (isTyping && (searching || results.length === 0)))

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={value}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className={inputCls}
      />

      {/* Search spinner */}
      {searching && (
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <div className="w-3 h-3 border border-gray-300 border-t-gray-700 rounded-full animate-spin" />
        </div>
      )}

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[200] max-h-[220px] overflow-y-auto">

          {/* Recent section header */}
          {showRecent && (
            <div className="px-3 py-1 flex items-center gap-1.5 bg-gray-50 border-b border-gray-100">
              <svg viewBox="0 0 24 24" className="w-3 h-3 stroke-gray-400" fill="none" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest">Recent</span>
            </div>
          )}

          {/* Items */}
          {displayItems.map((item, i) => {
            const { label, sub } = renderOption(item)
            const isHl = i === highlightedIndex
            return (
              <button
                key={getKey(item)}
                ref={el => { itemRefs.current[i] = el }}
                type="button"
                onMouseDown={() => pick(item)}
                onMouseEnter={() => setHighlightedIndex(i)}
                className={`w-full text-left px-3 py-2 transition-colors ${i < displayItems.length - 1 ? 'border-b border-gray-100' : ''} ${isHl ? 'bg-blue-50' : ''}`}
              >
                <div className={`text-xs font-medium truncate ${isHl ? 'text-blue-700' : 'text-gray-900'}`}>{label}</div>
                {sub && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{sub}</div>}
              </button>
            )
          })}

          {/* No results message */}
          {isTyping && !searching && results.length === 0 && (
            <div className="px-3 py-2.5 text-[10px] text-gray-400">No results found</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Merchant search ────────────────────────────────────────────────────────────
// Queries organization_members filtered to merchant org IDs.
// Shows member full_name + their merchant org name as subtitle.

function MerchantSearchDropdown({ value, placeholder, onChange }) {
  const [merchantOrgIds, setMerchantOrgIds] = useState(null)

  useEffect(() => {
    supabase.from('organizations').select('id').eq('type', 'merchant')
      .then(({ data }) => setMerchantOrgIds((data || []).map(o => o.id)))
  }, [])

  const doSearch = useCallback(async (q) => {
    if (!merchantOrgIds?.length) return []
    const { data } = await supabase
      .from('organization_members')
      .select('id, full_name, organizations(name, display_name)')
      .in('organization_id', merchantOrgIds)
      .ilike('full_name', `%${q}%`)
      .order('full_name', { ascending: true })
      .limit(10)
    return data || []
  }, [merchantOrgIds])

  return (
    <SearchDropdownShell
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      doSearch={doSearch}
      localStorageKey="courier_log_recent_merchants"
      getKey={m => m.id}
      renderOption={m => ({
        label: m.full_name,
        sub:   m.organizations?.display_name || m.organizations?.name || null,
      })}
    />
  )
}

// ── Vendor search ──────────────────────────────────────────────────────────────
// Queries organizations where type = 'supplier'.
// Shows org name + address/city. Selecting auto-fills vendor_address.

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
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      doSearch={doSearch}
      localStorageKey="courier_log_recent_vendors"
      getKey={o => o._variantKey || o.id}
      onRawSelect={handleRawSelect}
      renderOption={o => ({
        label: o.label ? `${o.display_name || o.name} — ${o.label}` : (o.display_name || o.name),
        sub:   [o.address, o.city, o.state, o.country].filter(Boolean).join(', ') || null,
      })}
    />
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function CourierLogModal({ row, onSave, onClose, uploadInvoice }) {
  const [form, setForm] = useState(() => row ? {
    invoice_number:       row.invoice_number       || '',
    dispatch_date:        row.dispatch_date         || '',
    delivery_date:        row.delivery_date         || '',
    merchant_name:        row.merchant_name         || '',
    vendor_name:          row.vendor_name           || '',
    vendor_address:       row.vendor_address        || '',
    zip_code:             row.zip_code              || '',
    cost_centre:          row.cost_centre           || '',
    tracking_number:      row.tracking_number       || '',
    service:              row.service               || '',
    product_description:  row.product_description   || '',
    'package_quantity': row['package_quantity'] != null ? String(row['package_quantity']) : '',
    Amount:               row['Amount']             != null ? String(row['Amount']) : '',
    upload_invoice:       row.upload_invoice        || null,
    remarks:              row.remarks               || '',
  } : { ...EMPTY_FORM })

  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState(null)
  const [pendingFile,    setPendingFile]    = useState(null)
  const [dragOver,       setDragOver]       = useState(false)
  const [invoiceViewUrl, setInvoiceViewUrl] = useState(null)
  const [vendorOrgId,    setVendorOrgId]    = useState(null)
  const [vendorAddressId, setVendorAddressId] = useState(null) // set when a saved address was picked from the dropdown; cleared on manual edit
  const [addrSaveStatus, setAddrSaveStatus] = useState('idle') // idle | saving | saved | error

  const patch = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSaveVendorAddress = async () => {
    if (!vendorOrgId || !form.vendor_address.trim()) return
    setAddrSaveStatus('saving')
    try {
      await saveOrgAddress(vendorOrgId, {
        address_line1: form.vendor_address.trim(),
        zip_code: form.zip_code.trim() || null,
      })
      setAddrSaveStatus('saved')
    } catch {
      setAddrSaveStatus('error')
    }
  }

  useEffect(() => {
    if (row?.id && row?.upload_invoice) {
      fetch(`${LOGS_BASE}/${row.id}/invoice`)
        .then(r => r.json())
        .then(d => { if (d.url) setInvoiceViewUrl(d.url) })
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (row) return
    fetch(LOGS_BASE)
      .then(r => r.json())
      .then(d => patch('invoice_number', nextInvoiceNumber(d.logs || [], 'domestic')))
      .catch(() => {})
  }, [row])

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

    const pkgs   = Number(form['package_quantity'])
    const amount = Number(form['Amount'])

    if (isNaN(pkgs) || pkgs <= 0) {
      setError('Number of packages must be a positive number.')
      return
    }
    if (form['Amount'] !== '' && (isNaN(amount) || amount < 0)) {
      setError('Amount must be 0 or greater.')
      return
    }

    setSaving(true)
    try {
      const savedLog = await onSave({
        invoice_number:       form.invoice_number.trim(),
        dispatch_date:        form.dispatch_date,
        delivery_date:        form.delivery_date || null,
        merchant_name:        form.merchant_name.trim(),
        vendor_name:          form.vendor_name.trim(),
        vendor_address:       form.vendor_address.trim(),
        zip_code:             form.zip_code.trim() || extractIndiaPincode(form.vendor_address) || null,
        cost_centre:          form.cost_centre,
        tracking_number:      form.tracking_number.trim(),
        service:              form.service.trim(),
        product_description:  form.product_description.trim(),
        'package_quantity':   pkgs,
        Amount:               form['Amount'] !== '' ? amount : null,
        remarks:              form.remarks.trim() || null,
      })
      if (pendingFile && savedLog?.id) {
        await uploadInvoice(savedLog.id, pendingFile)
      }
      if (vendorOrgId && form.vendor_address.trim()) {
        saveOrgAddress(vendorOrgId, {
          address_line1: form.vendor_address.trim(),
          zip_code: form.zip_code.trim() || null,
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
              {row ? 'Edit Courier Log' : 'Add Courier Log'}
            </h2>
            <p className="text-[10px] text-gray-400 mt-0.5">Domestic · Outward</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Row 1: Invoice Number + Dispatch Date + Delivery Date */}
          <div className="grid grid-cols-3 gap-4">
            <Field label="Invoice Number" required>
              <input value={form.invoice_number} onChange={e => patch('invoice_number', e.target.value)}
                placeholder="D09062600" className={inputCls} readOnly={!row} />
            </Field>
            <Field label="Dispatch Date" required>
              <input type="date" value={form.dispatch_date} onChange={e => patch('dispatch_date', e.target.value)}
                className={inputCls} />
            </Field>
            <Field label="Delivery Date">
              <input type="date" value={form.delivery_date} onChange={e => patch('delivery_date', e.target.value)}
                className={inputCls} />
            </Field>
          </div>

          {/* Row 2: Merchant Name + Vendor Name */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Merchant Name" required>
              <MerchantSearchDropdown
                value={form.merchant_name}
                placeholder="Search member name…"
                onChange={val => patch('merchant_name', val)}
              />
            </Field>
            <Field label="Vendor Name" required>
              <VendorSearchDropdown
                value={form.vendor_name}
                placeholder="Search vendor…"
                onChange={val => { patch('vendor_name', val); setVendorOrgId(null); setVendorAddressId(null); setAddrSaveStatus('idle') }}
                onAddressResolved={(addr, zip) => {
                  if (addr) patch('vendor_address', addr)
                  if (zip) patch('zip_code', zip)
                }}
                onOrgSelected={org => { setVendorOrgId(org.id); setVendorAddressId(org.addressId || null); setAddrSaveStatus('idle') }}
              />
            </Field>
          </div>

          <AddressPincodeFields
            addressLabel="Vendor Address"
            pincodeLabel="Pincode"
            address={form.vendor_address}
            pincode={form.zip_code}
            onAddressChange={val => { patch('vendor_address', val); setVendorAddressId(null); setAddrSaveStatus('idle') }}
            onPincodeChange={val => { patch('zip_code', val); setVendorAddressId(null); setAddrSaveStatus('idle') }}
            mode="india"
            addressRequired
            addressPlaceholder="Auto-filled when vendor is selected — edit freely if address differs"
            pincodePlaceholder="e.g. 122001"
          />

          {vendorOrgId && !vendorAddressId && (
            <div className="flex items-center gap-2 -mt-2">
              <button type="button" onClick={handleSaveVendorAddress}
                disabled={!form.vendor_address.trim() || addrSaveStatus === 'saving'}
                className="px-2.5 py-1 text-[10px] font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-50 transition-colors">
                {addrSaveStatus === 'saving' ? 'Saving…' : 'Save Address to Vendor'}
              </button>
              {addrSaveStatus === 'saved' && <span className="text-[10px] text-green-600 font-medium">Saved</span>}
              {addrSaveStatus === 'error' && <span className="text-[10px] text-red-500 font-medium">Failed to save</span>}
            </div>
          )}

          {/* Row 3: Cost Centre + Tracking Number + Service */}
          <div className="grid grid-cols-3 gap-4">
            <Field label="Cost Centre" required>
              <div className="relative">
                <select value={form.cost_centre} onChange={e => patch('cost_centre', e.target.value)}
                  className={selectCls}>
                  <option value="">— Select —</option>
                  <option value="jng">JNG</option>
                  <option value="vendor">Vendor</option>
                </select>
                <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 stroke-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </Field>
            <Field label="Tracking Number" required>
              <input value={form.tracking_number} onChange={e => patch('tracking_number', e.target.value)}
                placeholder="e.g. 1Z999AA10123456784" className={inputCls} />
            </Field>
            <CourierSearchSelect label="Service" required value={form.service}
              onChange={val => patch('service', val)} options={DOMESTIC_COURIERS} placeholder="Search service…" />
          </div>

          {/* Product Description */}
          <Field label="Product Description" required>
            <textarea value={form.product_description} onChange={e => patch('product_description', e.target.value)}
              placeholder="Describe the product(s) being shipped…" rows={2}
              className={textareaCls} />
          </Field>

          {/* Row 4: Packages + Amount */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Number of Packages" required>
              <input type="number" min="1" step="1"
                value={form['package_quantity']}
                onChange={e => patch('package_quantity', e.target.value)}
                placeholder="e.g. 3" className={inputCls} />
            </Field>
            <Field label="Amount (INR)">
              <input type="number" min="0" step="0.01"
                value={form['Amount']}
                onChange={e => patch('Amount', e.target.value)}
                placeholder="e.g. 1500.00" className={inputCls} />
            </Field>
          </div>

          {/* Remarks (optional) */}
          <Field label="Remarks">
            <textarea value={form.remarks} onChange={e => patch('remarks', e.target.value)}
              placeholder="Optional additional details…" rows={2}
              className={textareaCls} />
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
