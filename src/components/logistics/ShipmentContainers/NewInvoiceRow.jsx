import { useRef, useState } from 'react'
import { convertToUSD } from '../../../utils/formatters'

const CURRENCIES = ['USD', 'GBP', 'EUR', 'INR']

// Body field styling
const ci = 'w-full px-2 py-1.5 rounded-md text-[11px] text-black bg-[#E6EFFF] focus:outline-none transition-colors placeholder:text-gray-400'
const cl = 'block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-0.5'

// Header field styling — light on dark blue background
const hi = 'w-full px-2 py-1 rounded text-[11px] text-black bg-white/90 placeholder:text-gray-400 focus:outline-none transition-colors'

function CF({ label, required, children }) {
  return (
    <div>
      <label className={cl}>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
    </div>
  )
}

// `file` = a pending, not-yet-uploaded client File object (new attachment).
// `existingUrl` = an already-stored document (uploaded in an earlier save) —
// shown as a link regardless of readOnly, since there's nothing to "attach"
// about it, only to view.
function FilePick({ file, onFile, readOnly, existingUrl }) {
  const ref = useRef(null)
  const [drag, setDrag] = useState(false)

  if (file) {
    return (
      <div className="flex items-center gap-1 w-full px-2 py-1 bg-gray-100 border border-gray-200 rounded-md text-[10px] text-gray-700 min-w-0">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0 text-gray-500">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="truncate flex-1">{file.name}</span>
        {!readOnly && (
          <button type="button" onClick={() => onFile(null)}
            className="flex-shrink-0 text-gray-400 hover:text-red-400 leading-none">×</button>
        )}
      </div>
    )
  }

  if (existingUrl) {
    return (
      <a href={existingUrl} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 w-full px-2 py-1 bg-blue-50 border border-blue-200 rounded-md text-[10px] text-blue-700 hover:underline min-w-0">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="truncate flex-1">View file</span>
      </a>
    )
  }

  if (readOnly) {
    return <div className="w-full px-2 py-1.5 text-[10px] text-gray-400 italic">No file</div>
  }

  return (
    <>
      <input ref={ref} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
        className="hidden" onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]) }} />
      <div
        onClick={() => ref.current.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
        className={`flex items-center justify-center gap-1 w-full px-2 py-1.5 border border-dashed rounded-md cursor-pointer text-[10px] font-medium transition-colors
          ${drag ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-blue-300 text-blue-600 hover:border-blue-500 hover:bg-blue-50'}`}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        Upload file
      </div>
    </>
  )
}

// CBM and PO composition are the merchant's own group — fixed by the time
// logistics ever sees it (confirmed_at gates visibility). Shown as plain
// text/chips, deliberately NOT styled like the ci-boxed fields below, so
// it reads at a glance as fact rather than something editable. Vendor
// lives in the card's own heading instead of repeating it here.
function PlanningDetails({ group }) {
  if (!group) return null
  return (
    <div className="flex items-start gap-4 pb-2 border-b border-gray-100">
      <div className="flex-shrink-0">
        <div className={cl}>CBM</div>
        <div className="text-sm font-bold text-gray-900">{group.cbm ?? '—'}</div>
      </div>
      {group.pos?.length > 0 && (
        <div className="flex-1 min-w-0">
          <div className={cl}>PO Numbers</div>
          <div className="flex flex-wrap gap-1.5">
            {group.pos.map(po => (
              <span key={po.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-medium bg-gray-100 text-blue-900">
                {po.po_number}
                {po.actual_vendor_name && <span className="text-black">· {po.actual_vendor_name}</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Shared body fields (financial + operational + docs)
// Used by both the accordion collapsible body and the flat modal layout
function BodyFields({ invoice, set, file, onFile, invoiceFileUrl, packingListFile, onPackingListFile, packingListFileUrl, rates, group, readOnly }) {
  const base  = parseFloat(invoice.invoice_value || 0)
  const add   = parseFloat(invoice.additional_charges || 0)
  const disc  = parseFloat(invoice.discount || 0)
  const total = base + add - disc
  const usd   = invoice.currency && invoice.currency !== 'USD' && total > 0 && rates
                ? convertToUSD(total, invoice.currency, rates) : null
  const disabledCls = readOnly ? 'opacity-60 cursor-not-allowed' : ''

  return (
    <div className="space-y-2">
      <PlanningDetails group={group} />
      {/* Financial row */}
      <div className="grid gap-2" style={{ gridTemplateColumns: '2fr 3rem 1fr 1fr 2fr' }}>
        <CF label="Value">
          <input type="number" min="0" step="0.01" value={invoice.invoice_value} disabled={readOnly}
            onChange={e => set({ invoice_value: e.target.value })} placeholder="0.00" className={`${ci} ${disabledCls}`} />
        </CF>
        <CF label="CCY">
          <div className="relative">
            <select value={invoice.currency || 'USD'} onChange={e => set({ currency: e.target.value })} disabled={readOnly}
              className={`${ci} ${disabledCls} appearance-none pr-4 text-center`}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <svg className="absolute right-0.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-gray-400 pointer-events-none"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </CF>
        <CF label="Add. Charges">
          <input type="number" min="0" step="0.01" value={invoice.additional_charges} disabled={readOnly}
            onChange={e => set({ additional_charges: e.target.value })} placeholder="0.00" className={`${ci} ${disabledCls}`} />
        </CF>
        <CF label="Discount">
          <input type="number" min="0" step="0.01" value={invoice.discount} disabled={readOnly}
            onChange={e => set({ discount: e.target.value })} placeholder="0.00" className={`${ci} ${disabledCls}`} />
        </CF>
        <CF label="Total Value">
          <div className={`${ci} flex items-baseline gap-1.5 cursor-default`}>
            <span className="font-bold text-gray-900">
              {total > 0 ? total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
            </span>
            {usd && <span className="text-[9px] font-normal text-gray-400 whitespace-nowrap">≈ ${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD</span>}
          </div>
        </CF>
      </div>
      {/* Docs */}
      <div className="grid grid-cols-2 gap-2 items-end">
        <CF label="Invoice Doc"><FilePick file={file} onFile={onFile} readOnly={readOnly} existingUrl={invoiceFileUrl} /></CF>
        <CF label="Packing List"><FilePick file={packingListFile} onFile={onPackingListFile} readOnly={readOnly} existingUrl={packingListFileUrl} /></CF>
      </div>
    </div>
  )
}

export default function NewInvoiceRow({ invoice, onChange, onRemove, canRemove, file, onFile, invoiceFileUrl, packingListFile, onPackingListFile, packingListFileUrl, rates, group, readOnly, isComplete, isOpen, onToggle, flat }) {
  const set = (patch) => onChange({ ...invoice, ...patch })

  // ── Flat mode (used by InvoiceDetailsModal) — no accordion, all fields shown inline ─
  if (flat) {
    return (
      <div className="space-y-2">
        {/* Vendor as a plain heading (not a field) — Invoice # | Date shown flat below */}
        <div className="text-sm font-bold text-gray-900 truncate">{group?.primary_vendor_name || 'Vendor —'}</div>
        <div className="grid grid-cols-2 gap-2">
          <CF label="Invoice #">
            <input type="text" value={invoice.invoice_number} disabled={readOnly} onChange={e => set({ invoice_number: e.target.value })}
              placeholder="PE/26-27/... or To be announced" className={`${ci} ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`} />
          </CF>
          <CF label="Date">
            <input type="date" value={invoice.invoice_date} disabled={readOnly} onChange={e => set({ invoice_date: e.target.value })}
              className={`${ci} ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`} />
          </CF>
        </div>
        <BodyFields invoice={invoice} set={set} file={file} onFile={onFile} invoiceFileUrl={invoiceFileUrl}
          packingListFile={packingListFile} onPackingListFile={onPackingListFile} packingListFileUrl={packingListFileUrl}
          rates={rates} group={group} readOnly={readOnly} />
      </div>
    )
  }

  return (
    <div className="shadow-md border border-blue-600 rounded-xl">

      {/* ── Accordion header — always visible, 3 key fields inline ─────────── */}
      <div className={`bg-blue-600 px-3 py-2 ${isOpen ? 'rounded-t-xl' : 'rounded-xl'}`}>
        {/* Top row: vendor name as heading (not a field) + toggle/remove */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-sm font-bold text-white truncate">{group?.primary_vendor_name || 'Vendor —'}</span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isComplete ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-300">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="flex-shrink-0">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-yellow-300">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Incomplete
              </span>
            )}
            <button type="button" onClick={onToggle}
              className="text-white hover:text-white transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <button type="button" onClick={onRemove} disabled={!canRemove}
              className="text-white hover:text-red-400 disabled:opacity-0 transition-colors">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Invoice # | Date — visible even when collapsed */}
        <div className="grid grid-cols-2 gap-2">
          <input type="text" value={invoice.invoice_number} disabled={readOnly}
            onChange={e => set({ invoice_number: e.target.value })}
            placeholder="Invoice #" className={`${hi} ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`} />
          <input type="date" value={invoice.invoice_date} disabled={readOnly}
            onChange={e => set({ invoice_date: e.target.value })}
            className={`${hi} [color-scheme:light] ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`} />
        </div>
      </div>

      {/* ── Collapsible body ─────────────────────────────────────────────────── */}
      {isOpen && (
        <div className="bg-white px-3 py-2.5 rounded-b-xl overflow-hidden">
          <BodyFields invoice={invoice} set={set} file={file} onFile={onFile} invoiceFileUrl={invoiceFileUrl}
            packingListFile={packingListFile} onPackingListFile={onPackingListFile} packingListFileUrl={packingListFileUrl}
            rates={rates} group={group} readOnly={readOnly} />
        </div>
      )}
    </div>
  )
}
