import { useState, useEffect, useMemo } from 'react'
import MultiSelectTags from '../../ui/MultiSelectTags'
import { useRaisedUnbookedInvoices } from '../../../hooks/useRaisedUnbookedInvoices'
import { useShipmentContainerActions } from '../../../hooks/useShipmentContainerActions'

const compactInputCls = 'w-full px-2.5 py-1.5 rounded-lg text-xs text-gray-900 bg-[#E6EFFF] focus:outline-none  transition-colors placeholder:text-gray-400'
const compactLabelCls = 'block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1'

function CompactField({ label, required, children }) {
  return (
    <div>
      <label className={compactLabelCls}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

// Renders in the same right-panel slot as ContainerDetail (not a modal).
// buyerOrgId/buyerName come from the navigation context (buyer selected in
// left panel). Booking an invoice no longer means authoring one inline —
// invoices are raised earlier (Invoices stage), so this form just picks
// from whichever raised-but-unbooked invoices already exist for the buyer.
export default function NewContainerForm({ onClose, onCreate, buyerOrgId, buyerName }) {
  const storageKey = `shipment_container_draft_${buyerOrgId}`

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const draft = useMemo(() => {
    try {
      const s = localStorage.getItem(storageKey)
      return s ? JSON.parse(s) : {}
    } catch { return {} }
  }, [])

  const [containerNumber, setContainerNumber] = useState(draft.containerNumber ?? '')
  const [flightVessel, setFlightVessel]       = useState(draft.flightVessel    ?? '')
  const [etd, setEtd]                         = useState(draft.etd             ?? '')
  const [eta, setEta]                         = useState(draft.eta             ?? '')
  const [forwarder, setForwarder]             = useState(draft.forwarder       ?? '')
  const [containerType, setContainerType]     = useState(draft.containerType   ?? '')
  const [portOfLoading, setPortOfLoading]     = useState(draft.portOfLoading   ?? '')
  const [bookingDate, setBookingDate]         = useState(draft.bookingDate     ?? '')
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([])

  const { invoices, loading: invoicesLoading } = useRaisedUnbookedInvoices(buyerOrgId)
  const { createContainer, bookInvoicesIntoContainer } = useShipmentContainerActions()

  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState(null)
  const [validationError, setValidationError] = useState(null)

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ containerNumber, flightVessel, etd, eta, forwarder, containerType, portOfLoading, bookingDate }))
    } catch { /* storage full or unavailable — silently ignore */ }
  }, [storageKey, containerNumber, flightVessel, etd, eta, forwarder, containerType, portOfLoading, bookingDate])

  useEffect(() => {
    if (!validationError) return
    const t = setTimeout(() => setValidationError(null), 5000)
    return () => clearTimeout(t)
  }, [validationError])

  const canSubmit = !submitting

  const invoiceOptions = invoices.map(inv => ({
    value: inv.id,
    label: `${inv.invoice_number} — ${inv.vendor_name || 'Unknown vendor'}`,
    hint: inv.po_numbers.join(', '),
  }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    if (!containerNumber.trim()) { setValidationError('Enter a container / AWB number to proceed'); return }
    setValidationError(null)
    setSubmitting(true)
    setError(null)
    try {
      const newId = await createContainer({
        container_number: containerNumber.trim(),
        flight_vessel: flightVessel.trim(),
        etd: etd || null,
        eta: eta || null,
        forwarder: forwarder.trim(),
        container_type: containerType || null,
        port_of_loading: portOfLoading.trim() || null,
        booking_date: bookingDate || null,
        buyer_org_id: buyerOrgId,
      })
      if (selectedInvoiceIds.length) {
        await bookInvoicesIntoContainer(newId, selectedInvoiceIds)
      }
      localStorage.removeItem(storageKey)
      onCreate(newId)
    } catch (err) {
      setError(err.message || 'Failed to create container')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden w-full" style={{ background: '#FAFCFF' }}>

      {/* Pinned header */}
      <div className="flex-shrink-0">
        <div className="h-1 bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900" />

        <div className="flex items-center gap-3 px-4 pt-3 pb-3 [@media(max-height:850px)]:pt-1.5 [@media(max-height:850px)]:pb-1.5 bg-white">
          <button type="button" onClick={!submitting ? onClose : undefined}
            className="md:hidden flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-gray-900">New Shipment Container</div>
            <div className="text-[11px] text-gray-500 truncate mt-0.5">{buyerName || '—'}</div>
          </div>

          <button type="button" onClick={!submitting ? onClose : undefined}
            className="hidden md:flex flex-shrink-0 w-7 h-7 items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Container fields */}
        <div className="bg-white border-b border-gray-200 overflow-hidden">
          <div className="flex items-end gap-2 pt-5 px-3 pb-3 [@media(max-height:850px)]:pt-1.5 [@media(max-height:850px)]:pb-2">
            <div className="flex-[2] min-w-0">
              <CompactField label="Container / AWB #" required>
                <input type="text" value={containerNumber} onChange={e => setContainerNumber(e.target.value)}
                  placeholder="CAAU7262737/40 HQ" required className={compactInputCls} />
              </CompactField>
            </div>
            <div className="flex-[2] min-w-0">
              <CompactField label="Flight / Vessel">
                <input type="text" value={flightVessel} onChange={e => setFlightVessel(e.target.value)}
                  placeholder="MSC SURABAYA VIII IP625A" className={compactInputCls} />
              </CompactField>
            </div>
            <div className="flex-[1.4] min-w-0">
              <CompactField label="ETD">
                <input type="date" value={etd} onChange={e => setEtd(e.target.value)} className={compactInputCls} />
              </CompactField>
            </div>
            <div className="flex-[1.4] min-w-0">
              <CompactField label="ETA">
                <input type="date" value={eta} onChange={e => setEta(e.target.value)} className={compactInputCls} />
              </CompactField>
            </div>
            <div className="flex-1 min-w-0">
              <CompactField label="Forwarder">
                <input type="text" value={forwarder} onChange={e => setForwarder(e.target.value)}
                  placeholder="CARGOMAR" className={compactInputCls} />
              </CompactField>
            </div>
            <div className="flex-1 min-w-0">
              <CompactField label="Container Type">
                <div className="relative">
                  <select value={containerType} onChange={e => setContainerType(e.target.value)}
                    className={`${compactInputCls} appearance-none pr-5`}>
                    <option value="">Select</option>
                    <option value="20 GP">20′ GP</option>
                    <option value="40 GP">40′ GP</option>
                    <option value="40 HQ">40′ HQ</option>
                    <option value="20 HQ">20′ HQ</option>
                    <option value="20 RF">20′ RF</option>
                    <option value="40 RF">40′ RF</option>
                    <option value="LCL">LCL</option>
                  </select>
                  <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-gray-400 pointer-events-none"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </CompactField>
            </div>
          </div>
          <div className="flex items-end gap-2 px-3 pb-3 [@media(max-height:850px)]:pb-2">
            <div className="flex-[1.4] min-w-0">
              <CompactField label="Port of Loading">
                <input type="text" value={portOfLoading} onChange={e => setPortOfLoading(e.target.value)}
                  placeholder="Nhava Sheva" className={compactInputCls} />
              </CompactField>
            </div>
            <div className="flex-[1.4] min-w-0">
              <CompactField label="Booking Date">
                <input type="date" value={bookingDate} onChange={e => setBookingDate(e.target.value)} className={compactInputCls} />
              </CompactField>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable body — raised, unbooked invoice picker */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pb-3">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-2.5 [@media(max-height:850px)]:py-1.5" style={{ background: 'white' }}>
          <div className="flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-600 flex-shrink-0">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
            </svg>
            <span className="text-[10px] font-extrabold text-blue-800 uppercase tracking-widest">Invoices to book (optional)</span>
          </div>
        </div>

        <div className="px-6 space-y-3">
          {!invoicesLoading && invoices.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-4">No raised, unbooked invoices for this buyer yet — you can create the container empty and attach invoices later.</p>
          ) : (
            <MultiSelectTags
              options={invoiceOptions}
              value={selectedInvoiceIds}
              onChange={setSelectedInvoiceIds}
              loading={invoicesLoading}
              placeholder="Search raised invoices…"
              triggerClassName="w-full px-2.5 py-1.5 rounded-lg text-sm bg-gray-50 border border-gray-200 min-h-[2.5rem]"
              dropdownClassName="border border-gray-200 rounded-lg mt-0.5 shadow-lg"
              maxResults={6}
            />
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}
        </div>
      </form>

      {/* Pinned footer */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3 [@media(max-height:850px)]:py-2 border-t border-gray-200 bg-white">
        {validationError ? (
          <p className="text-[11px] text-red-500 flex-1 min-w-0 truncate">{validationError}</p>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3 flex-shrink-0">
        <button type="button" onClick={onClose} disabled={submitting}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting}
          className="inline-flex items-center gap-1.5 px-4 py-2 cursor-pointer rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {submitting && (
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          )}
          {submitting ? 'Creating…' : 'Create Container'}
        </button>
        </div>
      </div>

    </div>
  )
}
