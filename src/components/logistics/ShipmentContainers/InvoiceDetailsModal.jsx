import { createPortal } from 'react-dom'
import NewInvoiceRow from './NewInvoiceRow'
import { useInvoiceDetailsForm } from '../../../hooks/useInvoiceDetailsForm'

// Raises (fills in invoice_number/date/value/docs on a bare group) or edits
// an already-raised invoice — same form either way, header text is the only
// difference. Groups/invoices always already exist by the time this modal
// opens (created via create_shipment_plan_group), so there is no "add new
// invoice" mode anymore — every save is a plain shipment_invoices update.
// Form state/submit logic lives in useInvoiceDetailsForm, shared with the
// inline detail pane in InvoiceGroupsPane.jsx.
export default function InvoiceDetailsModal({ open, buyerOrgId, invoiceGroup, onClose, onUpdated }) {
  const {
    isRaising, isComplete, submitting, submittingAction, error,
    invoice, setInvoice, invoiceFile, setInvoiceFile, packingListFile, setPackingListFile,
    existingInvoiceFileUrl, existingPackingListFileUrl,
    rates, handleSave, handleRaise,
  } = useInvoiceDetailsForm({
    active: open,
    buyerOrgId,
    invoiceGroup,
    onSaved: () => { onUpdated?.(); onClose() },
  })

  if (!open) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[110] bg-black/40" />
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col pointer-events-auto">
          <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900">{isRaising ? 'Raise Invoice' : 'Edit Invoice'}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {isRaising ? 'Fill in invoice details for this group' : invoiceGroup?.invoice_number || 'Invoice details'}
              </p>
            </div>
            <button type="button" onClick={!submitting ? onClose : undefined}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-black transition-colors flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <form onSubmit={e => { e.preventDefault(); handleSave() }} className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <NewInvoiceRow
              invoice={invoice}
              onChange={setInvoice}
              onRemove={() => {}}
              canRemove={false}
              group={invoiceGroup}
              file={invoiceFile}
              onFile={setInvoiceFile}
              invoiceFileUrl={existingInvoiceFileUrl}
              packingListFile={packingListFile}
              onPackingListFile={setPackingListFile}
              packingListFileUrl={existingPackingListFileUrl}
              rates={rates}
              isComplete={isComplete}
              flat
            />
            {error && (
              <div className="flex items-center gap-2 mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {error}
              </div>
            )}
          </form>

          <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-gray-100 flex-shrink-0">
            <button type="button" onClick={onClose} disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              Cancel
            </button>
            {isRaising && (
              <button type="button" onClick={handleSave} disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                {submittingAction === 'save' ? 'Saving…' : 'Save'}
              </button>
            )}
            {/* Once raised, Save Changes is gated by isComplete too — see
                the matching comment in InvoiceGroupsPane.jsx. */}
            <button type="submit" onClick={isRaising ? handleRaise : handleSave} disabled={submitting || !isComplete}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {isRaising
                ? (submittingAction === 'raise' ? 'Raising…' : 'Raise Invoice')
                : (submittingAction === 'save' ? 'Saving…' : 'Save Changes')}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
