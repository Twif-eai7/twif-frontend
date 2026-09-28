import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useMemberId } from '../stores/profileStore'
import { useBuyerOptions } from './useBuyerOptions'
import { FALLBACK_RATES, fetchLiveRates, convertToUSD } from '../utils/formatters'
import { uploadToShipmentBucket, SHIPMENT_BUCKET } from '../lib/shipmentStorage'
import { publicUrl } from '../components/orderManagement/poUtils'

function emptyInvoice() {
  return {
    _id: 0,
    primary_vendor_org_id: '', invoice_number: '', invoice_date: '', invoice_value: '',
    currency: 'USD', cbm: '', additional_charges: '',
    payment_status: '', payment_term: '', tracking_details: '', po_ids: [],
  }
}

// One-off buyer preference: House Doctor invoices these in EUR, everyone
// else in USD — still just a prefill default, never enforced, so it can be
// changed per invoice in the CCY dropdown same as always.
function defaultCurrencyForBuyer(buyerName) {
  return buyerName?.trim().toLowerCase() === 'house doctor' ? 'EUR' : 'USD'
}

// Shared raise/edit logic for a shipment_invoices "group" row — used by both
// InvoiceDetailsModal.jsx (popup, Containers stage) and InvoiceGroupsPane.jsx
// (inline detail pane, Invoices stage) so the two presentations of the same
// form never drift apart.
//
// `active` gates data fetching (live FX rates) and the invoice-state sync
// effect — pass the modal's `open` or, for an inline pane, whether a group
// is currently selected.
export function useInvoiceDetailsForm({ active, invoiceGroup, buyerOrgId, onSaved }) {
  const memberId  = useMemberId()
  const { buyers } = useBuyerOptions()
  const buyerName = buyers.find(b => b.id === buyerOrgId)?.name
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
        // Prefilled from the group's own SKU balance values (same figure
        // PendingWorkOverview.jsx's Value column shows) whenever no invoice
        // value has actually been saved yet — a saved value always wins,
        // since the real invoice can legitimately differ (currency,
        // negotiated final amount, additional charges).
        invoice_value: invoiceGroup.invoice_value != null
          ? String(invoiceGroup.invoice_value)
          : invoiceGroup.calculated_value ? String(invoiceGroup.calculated_value.toFixed(2)) : '',
        // A saved currency always wins. Otherwise prefer the group's own
        // POs' real currency (calculated_value_currency — only set when
        // every PO on the group shares one currency) over the buyer-name
        // guess, since actual booked data beats a heuristic; the buyer
        // default only ever kicks in for a bare group with no POs yet, or
        // POs that already disagree on currency.
        currency: invoiceGroup.invoice_currency || invoiceGroup.calculated_value_currency || defaultCurrencyForBuyer(buyerName),
        cbm: invoiceGroup.cbm != null ? String(invoiceGroup.cbm) : '',
        additional_charges: invoiceGroup.additional_charges != null ? String(invoiceGroup.additional_charges) : '',
        payment_status: invoiceGroup.payment_status || '',
        payment_term: invoiceGroup.payment_term || '',
        tracking_details: invoiceGroup.tracking_details || '',
        po_ids: (invoiceGroup.pos ?? []).map(po => po.id),
      })
    }
    // buyerName is intentionally included despite the general rule of only
    // re-syncing on invoiceGroup identity change — useBuyerOptions' own
    // fetch can still be in flight the instant this modal opens, and this
    // only matters for the one-time currency default anyway (a real saved
    // value already wins over it regardless of when this fires).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, invoiceGroup?.id, buyerName])

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

        // A PO can now have more than one simultaneously-active plan (batched
        // shipments), so a blanket po_id match would fold ALL of a PO's
        // active plans into this one invoice — colliding with
        // shipment_invoice_pos' own (shipment_invoice_id, po_id) uniqueness
        // and silently dropping every plan but one from po_id-keyed
        // aggregation downstream. Resolve exactly one plan per PO instead
        // (oldest first, deterministic) — mirrors what
        // create_shipment_plan_group does for POs grouped at creation time.
        const { data: activePlans, error: plansErr } = await supabase
          .from('po_shipment_plans')
          .select('id, po_id, planned_on')
          .in('po_id', toAdd).in('status', ['draft', 'pending'])
          .order('planned_on', { ascending: true })
        if (plansErr) throw plansErr

        const planIdByPoId = {}
        ;(activePlans || []).forEach(p => {
          if (!(p.po_id in planIdByPoId)) planIdByPoId[p.po_id] = p.id
        })
        const planIdsToGroup = Object.values(planIdByPoId)

        if (planIdsToGroup.length) {
          const { error: groupErr } = await supabase.from('po_shipment_plans')
            .update({ status: 'grouped', shipment_invoice_id: invoiceGroup.id, updated_on: new Date().toISOString(), updated_by: memberId })
            .in('id', planIdsToGroup)
          if (groupErr) throw groupErr
        }
      }
      if (toRemove.length) {
        const { error: rmErr } = await supabase.from('shipment_invoice_pos')
          .delete().eq('shipment_invoice_id', invoiceGroup.id).in('po_id', toRemove)
        if (rmErr) throw rmErr

        // Return each removed PO's plan to draft so it can be re-grouped. A
        // PO can now hold more than one active plan at once, so this can no
        // longer collide with another draft/pending plan for the same PO —
        // one batched update is enough. planned_by is left untouched — the
        // original planner should still find their own plan reverted back to
        // draft; useMyShipmentPlans.js grants admin/owner/tech full
        // cross-planner visibility instead of reassigning ownership away.
        const { error: revertErr } = await supabase.from('po_shipment_plans')
          .update({ status: 'draft', shipment_invoice_id: null, updated_on: new Date().toISOString(), updated_by: memberId })
          .eq('shipment_invoice_id', invoiceGroup.id).in('po_id', toRemove).eq('status', 'grouped')
        if (revertErr) throw revertErr
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
