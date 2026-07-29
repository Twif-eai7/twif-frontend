import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useMemberId } from '../stores/profileStore'

export function useShipmentContainerActions() {
  const memberId = useMemberId()

  const createContainer = useCallback(async (fields) => {
    const { data, error } = await supabase
      .from('shipment_containers')
      .insert({ ...fields, created_by: memberId })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }, [memberId])

  const bookInvoicesIntoContainer = useCallback(async (containerId, invoiceIds) => {
    if (!invoiceIds?.length) return
    const { error } = await supabase
      .from('shipment_invoices')
      .update({ container_id: containerId, updated_on: new Date().toISOString(), updated_by: memberId })
      .in('id', invoiceIds)
    if (error) throw error
  }, [memberId])

  const createGroupFromPlans = useCallback(async (planIds, vendorOrgId) => {
    const { data, error } = await supabase.rpc('create_shipment_plan_group', {
      p_plan_ids: planIds,
      p_created_by: memberId,
      p_primary_vendor_org_id: vendorOrgId ?? null,
    })
    if (error) throw error
    return data
  }, [memberId])

  // Makes a group visible to logistics for the first time — a separate,
  // explicit action from creating/editing it, so the merchant can group POs
  // and keep adjusting them privately before deciding it's ready.
  const confirmGroup = useCallback(async (groupId) => {
    const { error } = await supabase
      .from('shipment_invoices')
      .update({ confirmed_at: new Date().toISOString(), updated_on: new Date().toISOString(), updated_by: memberId })
      .eq('id', groupId)
    if (error) throw error
  }, [memberId])

  // legs: [{ po_line_item_id, shipped_quantity }]. Atomic — BL#/cartons +
  // every leg insert happen in one transaction server-side (record_shipment_legs
  // RPC), replacing what used to be two separate client-side writes. The
  // idempotency key makes a retried/double-clicked submit a safe no-op.
  const recordShipmentLegs = useCallback(async (invoiceId, legs, blNumber, cartons) => {
    const { error } = await supabase.rpc('record_shipment_legs', {
      p_invoice_id: invoiceId,
      p_legs: legs,
      p_bl_number: blNumber,
      p_cartons: cartons,
      p_created_by: memberId,
      p_idempotency_key: crypto.randomUUID(),
    })
    if (error) throw error
  }, [memberId])

  // Soft-delete (never a hard DELETE — preserves the audit trail). Triggers
  // the DB rollup, which recomputes balances/status and auto-reopens the PO
  // if this correction drops it below fully-shipped. Reason is mandatory —
  // enforced server-side too, so this can't be bypassed from the client.
  const reverseShipmentLeg = useCallback(async (legId, reason) => {
    const { error } = await supabase.rpc('reverse_shipment_leg', {
      p_leg_id: legId,
      p_reversed_by: memberId,
      p_reason: reason,
    })
    if (error) throw error
  }, [memberId])

  // In-place quantity correction — the common "right leg, wrong number" case.
  // Reason mandatory (enforced server-side too). Unlike reverse, this never
  // leaves a window where the leg is missing/reversed with nothing recorded
  // in its place.
  const editShipmentLeg = useCallback(async (legId, newQuantity, reason) => {
    const { error } = await supabase.rpc('edit_shipment_leg', {
      p_leg_id: legId,
      p_new_quantity: newQuantity,
      p_reason: reason,
      p_edited_by: memberId,
    })
    if (error) throw error
  }, [memberId])

  // ── Update operations ─────────────────────────────────────────────────────

  const updateContainer = useCallback(async (containerId, fields) => {
    const { error } = await supabase
      .from('shipment_containers')
      .update({ ...fields, updated_on: new Date().toISOString(), updated_by: memberId })
      .eq('id', containerId)
    if (error) throw error
  }, [memberId])

  const updateInvoice = useCallback(async (invoiceId, fields) => {
    const { error } = await supabase
      .from('shipment_invoices')
      .update({ ...fields, updated_on: new Date().toISOString(), updated_by: memberId })
      .eq('id', invoiceId)
    if (error) throw error
  }, [memberId])

  const removePoFromInvoice = useCallback(async (shipmentInvoiceId, poId) => {
    const { error } = await supabase
      .from('shipment_invoice_pos')
      .delete()
      .eq('shipment_invoice_id', shipmentInvoiceId)
      .eq('po_id', poId)
    if (error) throw error
  }, [])

  // Group-level action: dissolves the whole group at once — every PO goes
  // back to the draft pool (re-groupable elsewhere) and the now-empty group
  // itself is soft-deleted. Distinct from removing one PO at a time (via
  // Edit → uncheck → Save, or the per-PO withdraw above) — this is "undo
  // the grouping entirely," available whether or not it's confirmed yet,
  // same as Edit already was.
  const ungroupPlans = useCallback(async (groupId, poIds) => {
    if (poIds.length) {
      const { error: rmErr } = await supabase.from('shipment_invoice_pos')
        .delete().eq('shipment_invoice_id', groupId)
      if (rmErr) throw rmErr

      // One at a time, since the "one active plan per PO" unique index can
      // reject an individual row (already re-planned elsewhere) without
      // that blocking the rest — same defensive fallback as the composition
      // diff in useInvoiceDetailsForm's submit().
      for (const poId of poIds) {
        const { error: revertErr } = await supabase.from('po_shipment_plans')
          .update({ status: 'draft', shipment_invoice_id: null, updated_on: new Date().toISOString(), updated_by: memberId })
          .eq('shipment_invoice_id', groupId).eq('po_id', poId).eq('status', 'grouped')
        if (revertErr) {
          if (revertErr.code !== '23505') throw revertErr
          const { error: cancelErr } = await supabase.from('po_shipment_plans')
            .update({ status: 'cancelled', shipment_invoice_id: null, updated_on: new Date().toISOString(), updated_by: memberId })
            .eq('shipment_invoice_id', groupId).eq('po_id', poId).eq('status', 'grouped')
          if (cancelErr) throw cancelErr
        }
      }
    }

    const { error: delErr } = await supabase.from('shipment_invoices')
      .update({ delete_meta: { deleted_at: new Date().toISOString(), deleted_by: memberId, reason: 'ungrouped' } })
      .eq('id', groupId)
    if (delErr) throw delErr
  }, [memberId])

  const softDeleteContainer = useCallback(async (containerId) => {
    const { error } = await supabase
      .from('shipment_containers')
      .update({ delete_meta: { deleted_at: new Date().toISOString(), deleted_by: memberId } })
      .eq('id', containerId)
    if (error) throw error
  }, [memberId])

  return {
    createContainer,
    bookInvoicesIntoContainer,
    createGroupFromPlans,
    confirmGroup,
    recordShipmentLegs,
    reverseShipmentLeg,
    editShipmentLeg,
    updateContainer,
    updateInvoice,
    removePoFromInvoice,
    ungroupPlans,
    softDeleteContainer,
  }
}
