import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useMemberId } from '../stores/profileStore'
import { FALLBACK_RATES, fetchLiveRates, convertToUSD } from '../utils/formatters'
import { uploadToShipmentBucket, SHIPMENT_BUCKET } from '../lib/shipmentStorage'
import { publicUrl } from '../components/orderManagement/poUtils'

function emptyInvoice() {
  return {
    _id: 0,
    primary_vendor_org_id: '', invoice_number: '', invoice_date: '', invoice_value: '',
    currency: 'USD', cbm: '', additional_charges: '', discount: '',
    payment_status: '', payment_term: '', tracking_details: '', po_ids: [],
  }
}

// Shared raise/edit logic for a shipment_invoices "group" row — used by both
// InvoiceDetailsModal.jsx (popup, Containers stage) and InvoiceGroupsPane.jsx
// (inline detail pane, Invoices stage) so the two presentations of the same
// form never drift apart.
//
// `active` gates data fetching (live FX rates) and the invoice-state sync
// effect — pass the modal's `open` or, for an inline pane, whether a group
// is currently selected.
export function useInvoiceDetailsForm({ active, invoiceGroup, onSaved }) {
  const memberId  = useMemberId()
  // "Raised" is a deliberate action (invoice_raised_at), never a side effect
  // of typing something into invoice_number — see sql/invoice_raised_at.sql.
  const isRaising = !invoiceGroup?.invoice_raised_at
  const [invoice, setInvoice] = useState(emptyInvoice())
  const [invoiceFile, setInvoiceFile] = useState(null)
  const [packingListFile, setPackingListFile] = useState(null)
  const [rates, setRates] = useState(FALLBACK_RATES)
  // null | 'save' | 'raise' — tracks which button is in flight so only that
  // button's label changes; `submitting` is the boolean both buttons use to
  // disable themselves while either action is running.
  const [submittingAction, setSubmittingAction] = useState(null)
  const submitting = submittingAction !== null
  const [error, setError] = useState(null)

  useEffect(() => { if (active) fetchLiveRates().then(setRates) }, [active])

  useEffect(() => {
    if (!active) { setInvoice(emptyInvoice()); setInvoiceFile(null); setPackingListFile(null); setError(null); setSubmittingAction(null) }
    if (active && invoiceGroup) {
      setInvoice({
        _id: 0,
        primary_vendor_org_id: invoiceGroup.primary_vendor_org_id || '',
        invoice_number: invoiceGroup.invoice_number || '',
        invoice_date: invoiceGroup.invoice_date || '',
        invoice_value: invoiceGroup.invoice_value != null ? String(invoiceGroup.invoice_value) : '',
        currency: invoiceGroup.invoice_currency || 'USD',
        cbm: invoiceGroup.cbm != null ? String(invoiceGroup.cbm) : '',
        additional_charges: invoiceGroup.additional_charges != null ? String(invoiceGroup.additional_charges) : '',
        discount: invoiceGroup.discount != null ? String(invoiceGroup.discount) : '',
        payment_status: invoiceGroup.payment_status || '',
        payment_term: invoiceGroup.payment_term || '',
        tracking_details: invoiceGroup.tracking_details || '',
        po_ids: (invoiceGroup.pos ?? []).map(po => po.id),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, invoiceGroup?.id])

  // "Save" (always allowed) vs "Raise Invoice" (gated) are two buttons over
  // the same save operation — logistics can jot down partial/placeholder
  // tracking info (e.g. invoice_number "To be announced") via Save so a
  // group shows up in exports as an ongoing tracker, without having every
  // field finalized yet. isComplete is only the bar for the Raise button —
  // includes both documents: a newly-picked file counts, or one already
  // uploaded in an earlier save (invoiceGroup.*_file_path).
  const isComplete = !!invoice.invoice_number.trim() && !!invoice.invoice_date && !!invoice.invoice_value
    && !!(invoiceFile || invoiceGroup?.invoice_file_path)
    && !!(packingListFile || invoiceGroup?.packing_list_file_path)

  const submit = async (raise) => {
    if (submitting || !invoiceGroup) return
    if (raise && !isComplete) return
    setSubmittingAction(raise ? 'raise' : 'save')
    setError(null)
    try {
      const [invoice_file_path, packing_list_file_path] = await Promise.all([
        uploadToShipmentBucket(invoiceFile, 'invoice-docs'),
        uploadToShipmentBucket(packingListFile, 'packing-lists'),
      ])
      const payload = {
        primary_vendor_org_id: invoice.primary_vendor_org_id || null,
        invoice_number: invoice.invoice_number.trim() || null,
        invoice_date: invoice.invoice_date || null,
        invoice_value: invoice.invoice_value || null,
        cbm: invoice.cbm || null,
        additional_charges: invoice.additional_charges || null,
        discount: invoice.discount || null,
        payment_status: invoice.payment_status.trim(),
        payment_term: invoice.payment_term.trim(),
        tracking_details: invoice.tracking_details.trim(),
        invoice_currency: invoice.currency || 'USD',
        invoice_value_usd: invoice.invoice_value
          ? convertToUSD(parseFloat(invoice.invoice_value), invoice.currency || 'USD', rates)
          : null,
        // Only the Raise Invoice action ever sets this — Save never touches
        // it, however complete the fields happen to be, so "raised" stays a
        // deliberate action rather than an incidental side effect.
        ...(raise && isRaising ? { invoice_raised_at: new Date().toISOString() } : {}),
        ...(invoice_file_path ? { invoice_file_path } : {}),
        ...(packing_list_file_path ? { packing_list_file_path } : {}),
      }

      const { error: updErr } = await supabase
        .from('shipment_invoices')
        .update({ ...payload, updated_on: new Date().toISOString(), updated_by: memberId })
        .eq('id', invoiceGroup.id)
      if (updErr) throw updErr

      // Diff PO associations: add new ones, remove deselected ones
      const originalIds = new Set((invoiceGroup.pos ?? []).map(p => p.id))
      const newIds      = new Set(invoice.po_ids)
      const toAdd    = invoice.po_ids.filter(id => !originalIds.has(id))
      const toRemove = [...originalIds].filter(id => !newIds.has(id))
      if (toAdd.length) {
        const { error: addErr } = await supabase.from('shipment_invoice_pos')
          .insert(toAdd.map(po_id => ({ shipment_invoice_id: invoiceGroup.id, po_id })))
        if (addErr) throw addErr

        // Take these POs out of the draft pool so they can't be picked up
        // into a second group — mirrors what create_shipment_plan_group does
        // for POs grouped at creation time.
        const { error: groupErr } = await supabase.from('po_shipment_plans')
          .update({ status: 'grouped', shipment_invoice_id: invoiceGroup.id, updated_on: new Date().toISOString(), updated_by: memberId })
          .in('po_id', toAdd).in('status', ['draft', 'pending'])
        if (groupErr) throw groupErr
      }
      if (toRemove.length) {
        const { error: rmErr } = await supabase.from('shipment_invoice_pos')
          .delete().eq('shipment_invoice_id', invoiceGroup.id).in('po_id', toRemove)
        if (rmErr) throw rmErr

        // Return each removed PO's plan to draft so it can be re-grouped —
        // one at a time, since the "one active plan per PO" unique index
        // can reject an individual row (e.g. the PO was already re-planned
        // elsewhere) without that blocking the others. Only fall back to
        // 'cancelled' for that specific conflict — any other error (e.g. a
        // permissions issue) should surface, not be swallowed.
        for (const poId of toRemove) {
          const { error: revertErr } = await supabase.from('po_shipment_plans')
            .update({ status: 'draft', shipment_invoice_id: null, updated_on: new Date().toISOString(), updated_by: memberId })
            .eq('shipment_invoice_id', invoiceGroup.id).eq('po_id', poId).eq('status', 'grouped')
          if (revertErr) {
            if (revertErr.code !== '23505') throw revertErr
            const { error: cancelErr } = await supabase.from('po_shipment_plans')
              .update({ status: 'cancelled', updated_on: new Date().toISOString(), updated_by: memberId })
              .eq('shipment_invoice_id', invoiceGroup.id).eq('po_id', poId).eq('status', 'grouped')
            if (cancelErr) throw cancelErr
          }
        }
      }

      onSaved?.()
    } catch (err) {
      setError(err.message || 'Failed to save invoice')
    } finally {
      setSubmittingAction(null)
    }
  }

  const handleSave  = () => submit(false)
  const handleRaise = () => submit(true)

  const existingInvoiceFileUrl = invoiceGroup?.invoice_file_path
    ? publicUrl(`${SHIPMENT_BUCKET}::${invoiceGroup.invoice_file_path}`)
    : null
  const existingPackingListFileUrl = invoiceGroup?.packing_list_file_path
    ? publicUrl(`${SHIPMENT_BUCKET}::${invoiceGroup.packing_list_file_path}`)
    : null

  return {
    isRaising, isComplete, submitting, submittingAction, error,
    invoice, setInvoice,
    invoiceFile, setInvoiceFile,
    packingListFile, setPackingListFile,
    existingInvoiceFileUrl, existingPackingListFileUrl,
    rates,
    handleSave, handleRaise,
  }
}
