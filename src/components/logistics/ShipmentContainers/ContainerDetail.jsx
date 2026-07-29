import { useState, useEffect } from 'react'
import { useShipmentContainerActions } from '../../../hooks/useShipmentContainerActions'
import InvoiceCard from './InvoiceCard'
import ConfirmModal from '../../ui/ConfirmModal'

const compactInput = 'w-full px-2 py-1 border border-gray-200 rounded-md text-xs text-gray-900 bg-white focus:outline-none focus:border-gray-900 transition-colors placeholder:text-gray-400'
const compactLabel = 'block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5'

export default function ContainerDetail({
  container, onClose, canManage,
  onShipmentRecorded, onContainerUpdated, onContainerDeleted,
  onAddInvoice,
}) {
  const { updateContainer, softDeleteContainer } = useShipmentContainerActions()

  // ── Inline edit state ──────────────────────────────────────────────────────
  const [isEditing, setIsEditing]       = useState(false)
  const [metaOpen, setMetaOpen]         = useState(false)
  const [saving, setSaving]             = useState(false)
  const [editError, setEditError]       = useState(null)
  const [containerNumber, setContainerNumber] = useState('')
  const [flightVessel, setFlightVessel]       = useState('')
  const [etd, setEtd]                         = useState('')
  const [eta, setEta]                         = useState('')
  const [forwarder, setForwarder]             = useState('')
  const [portOfLoading, setPortOfLoading]     = useState('')
  const [bookingDate, setBookingDate]         = useState('')

  // ── Soft-delete state ─────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting]               = useState(false)

  // Gate: can only delete container if no invoice has recorded shipment legs
  const invoices = container?.invoices ?? []
  const containerHasLegs = invoices.some(inv =>
    Object.values(inv.legsByLineItem ?? {}).some(q => q > 0)
  )

  // Once every invoice on this container has a BL and at least some legs
  // recorded, the shipment has sailed — container_number/flight_vessel/
  // forwarder/ETD become historical fact and lock. ETA stays editable
  // indefinitely since it's a forecast that keeps shifting (delays,
  // rescheduling) right up until actual arrival, which this system doesn't
  // separately track.
  const containerComplete = invoices.length > 0 && invoices.every(inv =>
    !!inv.bl_number && Object.values(inv.legsByLineItem ?? {}).some(q => q > 0)
  )

  // Sync local edit fields whenever the container prop changes
  useEffect(() => {
    if (container) {
      setContainerNumber(container.container_number || '')
      setFlightVessel(container.flight_vessel || '')
      setEtd(container.etd || '')
      setEta(container.eta || '')
      setForwarder(container.forwarder || '')
      setPortOfLoading(container.port_of_loading || '')
      setBookingDate(container.booking_date || '')
    }
  }, [container?.id])

  const startEdit = () => { setIsEditing(true); setEditError(null); setMetaOpen(true) }
  const cancelEdit = () => {
    setIsEditing(false)
    setContainerNumber(container.container_number || '')
    setFlightVessel(container.flight_vessel || '')
    setEtd(container.etd || '')
    setEta(container.eta || '')
    setForwarder(container.forwarder || '')
    setPortOfLoading(container.port_of_loading || '')
    setBookingDate(container.booking_date || '')
  }

  const saveEdit = async () => {
    setSaving(true)
    setEditError(null)
    try {
      await updateContainer(container.id, containerComplete
        ? { eta: eta || null }
        : {
            container_number: containerNumber.trim(),
            flight_vessel: flightVessel.trim(),
            etd: etd || null,
            eta: eta || null,
            forwarder: forwarder.trim(),
            port_of_loading: portOfLoading.trim() || null,
            booking_date: bookingDate || null,
          })
      setIsEditing(false)
      onContainerUpdated?.()
    } catch (err) {
      setEditError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await softDeleteContainer(container.id)
      setShowDeleteModal(false)
      onContainerDeleted?.()
    } catch (err) {
      console.error('[ContainerDetail] delete error:', err?.message)
    } finally {
      setDeleting(false)
    }
  }

  if (!container) {
    return (
      <div className="hidden md:flex flex-1 flex-col items-center justify-center gap-3 text-center bg-gray-50">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
        <p className="text-sm text-gray-400">Select a container to view its invoices and POs</p>
      </div>
    )
  }



  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-gray-50 w-full">
      {/* Pinned header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">

        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <button type="button" onClick={onClose}
              className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 mt-0.5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="min-w-0">
              <div className="text-sm font-bold text-gray-900 truncate">Container: {container.container_number || '—'}</div>
              <div className="text-xs text-gray-500 mt-0.5 truncate">Vessel: {container.flight_vessel || '—'}</div>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {!isEditing && (
              <button type="button" onClick={() => setMetaOpen(o => !o)}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                title={metaOpen ? 'Hide details' : 'Show details'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  className={`transition-transform ${metaOpen ? 'rotate-180' : ''}`}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            )}
            {canManage && !isEditing && (
              <button type="button" onClick={startEdit}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-600 hover:text-gray-700 transition-colors"
                title={containerComplete ? 'Edit ETA' : 'Edit container'}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
            {canManage && !isEditing && !containerHasLegs && (
              <button type="button" onClick={() => setShowDeleteModal(true)}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-red-50 text-gray-600 hover:text-red-500 transition-colors"
                title="Delete container">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                </svg>
              </button>
            )}
            <button type="button" onClick={onClose}
              className="hidden md:flex w-7 h-7 items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <ConfirmModal
          open={showDeleteModal}
          title="Delete container?"
          message={`This will remove container ${container.container_number || ''} and all its invoices.`}
          warning="Only containers with no recorded shipment legs can be deleted."
          onConfirm={handleDelete}
          onClose={() => setShowDeleteModal(false)}
          loading={deleting}
        />

        {/* Meta fields — read-only or inline edit. Collapsed by default: most
            activity happens in the invoice list below, this is reference
            info you open only when you need it. Editing always forces it open. */}
        {(metaOpen || isEditing) && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          {isEditing ? (
            <>
              {containerComplete && (
                <p className="text-[10px] text-gray-400 mb-1.5">Shipment fully recorded (BL + legs on every invoice) — only ETA stays editable for ongoing tracking.</p>
              )}
              <div className="grid grid-cols-5 gap-2">
                {containerComplete ? (
                  <>
                    <div className="col-span-2">
                      <label className={compactLabel}>Container / AWB #</label>
                      <div className="text-xs font-semibold text-gray-800 py-1 truncate">{container.container_number || '—'}</div>
                    </div>
                    <div className="col-span-3">
                      <label className={compactLabel}>Flight / Vessel</label>
                      <div className="text-xs font-semibold text-gray-800 py-1 truncate">{container.flight_vessel || '—'}</div>
                    </div>
                    <div>
                      <label className={compactLabel}>ETD</label>
                      <div className="text-xs font-semibold text-gray-800 py-1">{container.etd || '—'}</div>
                    </div>
                    <div>
                      <label className={compactLabel}>ETA</label>
                      <input type="date" value={eta} onChange={e => setEta(e.target.value)} className={compactInput} />
                    </div>
                    <div className="col-span-3">
                      <label className={compactLabel}>Forwarder</label>
                      <div className="text-xs font-semibold text-gray-800 py-1 truncate">{container.forwarder || '—'}</div>
                    </div>
                    <div className="col-span-2">
                      <label className={compactLabel}>Port of Loading</label>
                      <div className="text-xs font-semibold text-gray-800 py-1 truncate">{container.port_of_loading || '—'}</div>
                    </div>
                    <div className="col-span-3">
                      <label className={compactLabel}>Booking Date</label>
                      <div className="text-xs font-semibold text-gray-800 py-1">{container.booking_date || '—'}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="col-span-2">
                      <label className={compactLabel}>Container / AWB #</label>
                      <input type="text" value={containerNumber} onChange={e => setContainerNumber(e.target.value)}
                        className={compactInput} placeholder="Container/AWB#" />
                    </div>
                    <div className="col-span-3">
                      <label className={compactLabel}>Flight / Vessel</label>
                      <input type="text" value={flightVessel} onChange={e => setFlightVessel(e.target.value)}
                        className={compactInput} placeholder="Vessel details" />
                    </div>
                    <div>
                      <label className={compactLabel}>ETD</label>
                      <input type="date" value={etd} onChange={e => setEtd(e.target.value)} className={compactInput} />
                    </div>
                    <div>
                      <label className={compactLabel}>ETA</label>
                      <input type="date" value={eta} onChange={e => setEta(e.target.value)} className={compactInput} />
                    </div>
                    <div className="col-span-3">
                      <label className={compactLabel}>Forwarder</label>
                      <input type="text" value={forwarder} onChange={e => setForwarder(e.target.value)}
                        className={compactInput} placeholder="e.g. CARGOMAR" />
                    </div>
                    <div className="col-span-2">
                      <label className={compactLabel}>Port of Loading</label>
                      <input type="text" value={portOfLoading} onChange={e => setPortOfLoading(e.target.value)}
                        className={compactInput} placeholder="e.g. Nhava Sheva" />
                    </div>
                    <div className="col-span-3">
                      <label className={compactLabel}>Booking Date</label>
                      <input type="date" value={bookingDate} onChange={e => setBookingDate(e.target.value)} className={compactInput} />
                    </div>
                  </>
                )}
              </div>
              {editError && <p className="text-[11px] text-red-500 mt-1">{editError}</p>}
              <div className="flex items-center justify-end gap-2 mt-2">
                <button type="button" onClick={cancelEdit}
                  className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">Cancel</button>
                <button type="button" onClick={saveEdit} disabled={saving}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-900 text-[11px] font-semibold text-white hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: 'Buyer', value: container.buyer_name },
                { label: 'Type', value: container.container_type },
                { label: 'ETD', value: container.etd },
                { label: 'ETA', value: container.eta },
                { label: 'Forwarder', value: container.forwarder },
                { label: 'Port of Loading', value: container.port_of_loading },
                { label: 'Booking Date', value: container.booking_date },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className={compactLabel}>{label}</div>
                  <div className="text-xs font-semibold text-gray-800 mt-0.5">{value || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      {/* Invoice list */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6 space-y-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Invoices</span>
          {canManage && (
            <button type="button" onClick={onAddInvoice}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700 hover:text-gray-900 transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Attach Invoice
            </button>
          )}
        </div>

        {invoices.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center">No invoices added to this container yet</p>
        ) : (
          invoices.map(invoice => (
            <InvoiceCard
              key={invoice.id}
              invoice={invoice}
              canManage={canManage}
              buyerOrgId={container.buyer_org_id}
              onShipmentRecorded={onShipmentRecorded}
              onInvoiceUpdated={onContainerUpdated}
              onInvoiceDeleted={onContainerUpdated}
              onPoRemoved={onContainerUpdated}
            />
          ))
        )}
      </div>
    </div>
  )
}
